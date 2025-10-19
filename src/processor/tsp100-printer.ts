import { createCanvas, ImageData } from 'canvas';
import * as net from 'net';

/**
 * TSP100 Printer Communication Module
 * Handles raster printing to Star Micronics TSP100 printers via TCP/IP
 */
export class TSP100Printer {
  /**
   * Convert text to raster bitmap and send to printer
   * Uses StarTSPImage-compatible format (ESC * r commands)
   */
  async printText(ipAddress: string, port: number, text: string): Promise<boolean> {
    try {
      console.log(`Printing to TSP100 at ${ipAddress}:${port}...`);
      console.log('Using StarTSPImage raster format (ESC * r)');

      // Convert text to raster format with Star commands
      const printData = this.convertTextToRaster(text);

      console.log(`Sending ${printData.length} bytes to printer`);

      // Debug: Show hex dump of first 100 bytes
      const previewBytes = printData.slice(0, 100);
      console.log('Data preview (hex):', previewBytes.toString('hex').match(/.{1,2}/g)?.join(' '));
      console.log('Data preview (ascii):', this.toAsciiDebug(previewBytes));

      // Send to printer via TCP/IP
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

    // Debug: Check first few pixels to see what Canvas actually rendered
    console.log('Canvas debug - First 10 pixels (RGBA):');
    for (let i = 0; i < 40; i += 4) {
      const r = imageData.data[i];
      const g = imageData.data[i + 1];
      const b = imageData.data[i + 2];
      const a = imageData.data[i + 3];
      if (i < 40) {
        console.log(`  Pixel ${i/4}: R=${r} G=${g} B=${b} A=${a}`);
      }
    }

    // Convert to monochrome bitmap
    const bitmap = this.convertToMonochrome(imageData, width, height);

    // Format as StarTSPImage raster commands
    return this.formatAsStarRaster(bitmap, width, height);
  }

  /**
   * Convert RGBA image data to monochrome bitmap
   */
  private convertToMonochrome(imageData: ImageData, width: number, height: number): Buffer {
    const bytesPerLine = Math.ceil(width / 8);
    const bitmap = Buffer.alloc(bytesPerLine * height);
    let blackPixelCount = 0;

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
          blackPixelCount++;
        }
      }
    }

    console.log(`Bitmap conversion: ${blackPixelCount} black pixels out of ${width * height} total`);

    // If bitmap is completely blank, add a test pattern so something prints
    if (blackPixelCount === 0) {
      console.warn('⚠ WARNING: Bitmap is completely blank! Adding test rectangle...');
      // Draw a black rectangle (10 lines tall, starting at line 5, full width for 30 bytes)
      for (let y = 5; y < 15; y++) {
        for (let x = 1; x < 31; x++) {
          const byteIndex = y * bytesPerLine + x;
          bitmap[byteIndex] = 0xFF; // All 8 pixels black
        }
      }
      console.log('Added test rectangle to bitmap');
    }

    return bitmap;
  }

  /**
   * Format bitmap data using StarTSPImage format (ESC * r commands)
   * This is the exact format that works with TSP100 printers
   */
  private formatAsStarRaster(bitmap: Buffer, width: number, height: number): Buffer {
    const bytesPerLine = Math.ceil(width / 8);

    // Calculate page length (total bitmap size)
    const pageLength = height * bytesPerLine;
    const pageLengthLow = pageLength & 0xFF;
    const pageLengthHigh = (pageLength >> 8) & 0xFF;

    // Build command sequence exactly like StarTSPImage
    return Buffer.concat([
      // NO ESC @ initialization - start directly with raster commands
      Buffer.from([0x1B, 0x2A, 0x72, 0x41]),        // ESC * r A - Start raster data transfer
      Buffer.from([0x1B, 0x2A, 0x72, 0x50]),        // ESC * r P - Set page length
      Buffer.from([0x30, 0x00]),                     // "0" NUL - Parameters
      Buffer.from([pageLengthLow, pageLengthHigh, 0x00]), // Page length (3 bytes)
      bitmap,                                        // Raster bitmap data
      Buffer.from([0x1B, 0x2A, 0x72, 0x42])         // ESC * r B - End raster
    ]);
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
