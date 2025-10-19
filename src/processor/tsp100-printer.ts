import { createCanvas, ImageData } from 'canvas';
import * as net from 'net';

/**
 * TSP100 Printer Communication Module
 * Handles raster printing to Star Micronics TSP100 printers via TCP/IP
 */
export class TSP100Printer {
  /**
   * Convert text to raster bitmap and send to printer
   */
  async printText(ipAddress: string, port: number, text: string): Promise<boolean> {
    try {
      console.log(`Printing to TSP100 at ${ipAddress}:${port}...`);

      // Try text mode first (more reliable for TSP100)
      const USE_TEXT_MODE = true;

      let printData: Buffer;
      if (USE_TEXT_MODE) {
        printData = this.formatAsTextMode(text);
        console.log('Using text mode printing');
      } else {
        // 1. Convert text to raster format
        printData = this.convertTextToRaster(text);
        console.log('Using raster mode printing');
      }

      console.log(`Sending ${printData.length} bytes to printer`);

      // Debug: Show hex dump of first 100 bytes
      const previewBytes = printData.slice(0, 100);
      console.log('Data preview (hex):', previewBytes.toString('hex').match(/.{1,2}/g)?.join(' '));
      console.log('Data preview (ascii):', this.toAsciiDebug(previewBytes));

      // 2. Send to printer via TCP/IP
      const success = await this.sendToPrinter(ipAddress, port, printData);

      if (success) {
        console.log('✓ Print job sent successfully');
      } else {
        console.error('✗ Failed to send print job');
      }

      return success;
    } catch (error) {
      console.error('Print error:', error);
      return false;
    }
  }

  /**
   * Format text using Star Line Mode (native to Star TSP100)
   */
  private formatAsTextMode(text: string): Buffer {
    const commands: Buffer[] = [];

    // Star Line Mode commands
    // Initialize printer (Star specific)
    commands.push(Buffer.from([0x1B, 0x40])); // ESC @ - Initialize

    // Enable Star Line Mode
    commands.push(Buffer.from([0x1B, 0x1D, 0x61, 0x00])); // Select Star Line Mode

    // Set international character set (USA)
    commands.push(Buffer.from([0x1B, 0x52, 0x00])); // ESC R 0

    // Select character code table (PC437)
    commands.push(Buffer.from([0x1B, 0x1D, 0x74, 0x00])); // Select code page

    // Emphasized mode ON (makes text more visible)
    commands.push(Buffer.from([0x1B, 0x45])); // ESC E

    // Print the text
    commands.push(Buffer.from(text, 'utf8'));

    // Line feeds (Star Line Mode uses LF)
    commands.push(Buffer.from([0x0A, 0x0A, 0x0A])); // LF x3

    // Emphasized mode OFF
    commands.push(Buffer.from([0x1B, 0x46])); // ESC F

    // Cut paper (Star Line Mode command)
    commands.push(Buffer.from([0x1B, 0x64, 0x02])); // ESC d 2 - Feed and cut

    return Buffer.concat(commands);
  }

  /**
   * Convert text to raster bitmap format
   * TSP100 uses 576 dots width (72mm at 203dpi)
   */
  private convertTextToRaster(text: string): Buffer {
    // Canvas dimensions for TSP100 (576 dots width for 72mm paper at 203dpi)
    const width = 576;
    const lineHeight = 24;
    const fontSize = 18;
    const padding = 10;

    // Split text into lines
    const lines = text.split('\n');
    const height = (lines.length * lineHeight) + (2 * padding);

    // Create canvas
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // White background
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, width, height);

    // Black text
    ctx.fillStyle = 'black';
    ctx.font = `${fontSize}px monospace`;

    // Draw each line
    lines.forEach((line, index) => {
      const y = padding + (index * lineHeight) + fontSize;
      ctx.fillText(line, padding, y);
    });

    // Get image data
    const imageData = ctx.getImageData(0, 0, width, height);

    // Convert to monochrome bitmap
    const bitmap = this.convertToMonochrome(imageData, width, height);

    // Format as ESC/POS raster commands
    return this.formatAsESCPOS(bitmap, width, height);
  }

  /**
   * Convert RGBA image data to monochrome bitmap
   */
  private convertToMonochrome(imageData: ImageData, width: number, height: number): Buffer {
    const bytesPerLine = Math.ceil(width / 8);
    const bitmap = Buffer.alloc(bytesPerLine * height);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const r = imageData.data[i];
        const g = imageData.data[i + 1];
        const b = imageData.data[i + 2];

        // Convert to grayscale and threshold
        const gray = (r + g + b) / 3;
        const isBlack = gray < 128;

        if (isBlack) {
          const byteIndex = y * bytesPerLine + Math.floor(x / 8);
          const bitIndex = 7 - (x % 8);
          bitmap[byteIndex] |= (1 << bitIndex);
        }
      }
    }

    return bitmap;
  }

  /**
   * Format bitmap data as Star Raster Mode commands for TSP100
   */
  private formatAsESCPOS(bitmap: Buffer, width: number, height: number): Buffer {
    const commands: Buffer[] = [];

    // Initialize printer
    commands.push(Buffer.from([0x1B, 0x40])); // ESC @

    // Select Star Raster Mode
    commands.push(Buffer.from([0x1B, 0x1D, 0x61, 0x01])); // ESC GS a 1

    const bytesPerLine = Math.ceil(width / 8);

    // Star Raster Graphics command: ESC GS ( A
    // Send entire image at once
    const dataSize = bitmap.length + 10;
    const cmd = Buffer.alloc(dataSize + 4);

    let pos = 0;
    cmd[pos++] = 0x1B; // ESC
    cmd[pos++] = 0x1D; // GS
    cmd[pos++] = 0x28; // (
    cmd[pos++] = 0x41; // A

    // Data length (4 bytes, little endian)
    const len = dataSize;
    cmd[pos++] = len & 0xFF;
    cmd[pos++] = (len >> 8) & 0xFF;
    cmd[pos++] = (len >> 16) & 0xFF;
    cmd[pos++] = (len >> 24) & 0xFF;

    // Function number (0x30 = print raster)
    cmd[pos++] = 0x30;
    cmd[pos++] = 0x00;

    // Image width in bytes
    cmd[pos++] = bytesPerLine & 0xFF;
    cmd[pos++] = (bytesPerLine >> 8) & 0xFF;

    // Image height in dots
    cmd[pos++] = height & 0xFF;
    cmd[pos++] = (height >> 8) & 0xFF;

    // Copy bitmap data
    bitmap.copy(cmd, pos);

    commands.push(cmd);

    // Feed and cut
    commands.push(Buffer.from([0x1B, 0x64, 0x02])); // ESC d 2

    return Buffer.concat(commands);
  }

  /**
   * Helper to show ASCII representation for debugging
   */
  private toAsciiDebug(buffer: Buffer): string {
    let result = '';
    for (let i = 0; i < buffer.length; i++) {
      const byte = buffer[i];
      if (byte >= 32 && byte <= 126) {
        result += String.fromCharCode(byte);
      } else {
        result += '.';
      }
    }
    return result;
  }

  /**
   * Send raster data to printer via TCP/IP
   */
  private async sendToPrinter(ipAddress: string, port: number, data: Buffer): Promise<boolean> {
    return new Promise((resolve) => {
      const client = new net.Socket();
      let success = false;

      // Set timeout
      client.setTimeout(5000);

      client.connect(port, ipAddress, () => {
        console.log(`Connected to printer at ${ipAddress}:${port}`);
        client.write(data, (err) => {
          if (err) {
            console.error('Write error:', err);
          } else {
            console.log('Data written to socket');
          }
        });
      });

      client.on('data', (response) => {
        console.log('Printer response received:', response.length, 'bytes');
        console.log('Response (hex):', response.toString('hex').match(/.{1,2}/g)?.join(' '));
        console.log('Response (ascii):', this.toAsciiDebug(response));
        success = true;
        client.destroy();
      });

      client.on('timeout', () => {
        console.error('Connection timeout');
        client.destroy();
        resolve(false);
      });

      client.on('error', (err) => {
        console.error('Connection error:', err.message);
        resolve(false);
      });

      client.on('close', () => {
        // If we successfully wrote data, consider it a success
        // TSP100 may not send response data
        if (!success && data.length > 0) {
          success = true;
        }
        resolve(success);
      });

      // Consider success after write if no errors
      client.on('drain', () => {
        console.log('Data sent to printer');
        setTimeout(() => {
          client.destroy();
        }, 500);
      });
    });
  }
}
