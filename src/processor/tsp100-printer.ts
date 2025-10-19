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

      // 1. Convert text to raster format
      const rasterData = this.convertTextToRaster(text);

      // 2. Send to printer via TCP/IP
      const success = await this.sendToPrinter(ipAddress, port, rasterData);

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

    // Raster bit image command for each line
    const bytesPerLine = Math.ceil(width / 8);

    for (let y = 0; y < height; y++) {
      // GS v 0 - Print raster bit image
      // Format: GS v 0 m xL xH yL yH d1...dk
      const cmd = Buffer.alloc(8 + bytesPerLine);

      cmd[0] = 0x1D; // GS
      cmd[1] = 0x76; // v
      cmd[2] = 0x30; // 0
      cmd[3] = 0x00; // Normal (m = 0)

      // Width in bytes (xL, xH)
      cmd[4] = bytesPerLine & 0xFF;
      cmd[5] = (bytesPerLine >> 8) & 0xFF;

      // Height (1 line = yL, yH)
      cmd[6] = 0x01;
      cmd[7] = 0x00;

      // Copy bitmap data for this line
      const lineStart = y * bytesPerLine;
      bitmap.copy(cmd, 8, lineStart, lineStart + bytesPerLine);

      commands.push(cmd);
    }

    // Line feed and cut paper
    commands.push(Buffer.from([0x0A, 0x0A, 0x0A])); // LF x3
    commands.push(Buffer.from([0x1B, 0x64, 0x02])); // Cut paper

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
