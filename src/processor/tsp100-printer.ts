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
   * Format text using simple text mode (more reliable for testing)
   */
  private formatAsTextMode(text: string): Buffer {
    const commands: Buffer[] = [];

    // Initialize printer
    commands.push(Buffer.from([0x1B, 0x40])); // ESC @

    // Set to use Star Line Mode (more reliable for Star printers)
    commands.push(Buffer.from([0x1B, 0x1D, 0x61, 0x01])); // Select Star Line Mode

    // Print the text
    commands.push(Buffer.from(text, 'utf8'));

    // Line feeds
    commands.push(Buffer.from([0x0A, 0x0A, 0x0A, 0x0A])); // LF x4

    // Cut paper (Star command)
    commands.push(Buffer.from([0x1B, 0x64, 0x03])); // ESC d 3

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
   * Format bitmap data as ESC/POS raster commands for TSP100
   */
  private formatAsESCPOS(bitmap: Buffer, width: number, height: number): Buffer {
    const commands: Buffer[] = [];

    // ESC @ - Initialize printer
    commands.push(Buffer.from([0x1B, 0x40]));

    // Raster bit image command - use GS v 0 (standard ESC/POS)
    const bytesPerLine = Math.ceil(width / 8);

    // Send entire bitmap as single raster image (more reliable for TSP100)
    const cmd = Buffer.alloc(8 + bitmap.length);

    cmd[0] = 0x1D; // GS
    cmd[1] = 0x76; // v
    cmd[2] = 0x30; // 0 (ASCII '0')
    cmd[3] = 0x00; // m = 0 (normal mode)

    // Width in bytes (xL, xH) - little endian
    cmd[4] = bytesPerLine & 0xFF;
    cmd[5] = (bytesPerLine >> 8) & 0xFF;

    // Height in dots (yL, yH) - little endian
    cmd[6] = height & 0xFF;
    cmd[7] = (height >> 8) & 0xFF;

    // Copy entire bitmap data
    bitmap.copy(cmd, 8);

    commands.push(cmd);

    // Feed paper and cut (Star TSP100 specific)
    commands.push(Buffer.from([0x1B, 0x64, 0x03])); // ESC d 3 - Feed and cut paper

    return Buffer.concat(commands);
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
        client.write(data);
      });

      client.on('data', (response) => {
        console.log('Printer response received');
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
