/**
 * Comprehensive Star TSP100 Printer Test
 * Tests 6 different command sequences to find what works
 */
import * as net from 'net';

const PRINTER_IP = process.env.ALLOWED_PRINTER_IP || '192.168.4.62';
const PRINTER_PORT = parseInt(process.env.ALLOWED_PRINTER_PORT || '9100');

let testNumber = 0;

function runTest(name: string, description: string, dataBuffer: Buffer, callback?: () => void) {
  testNumber++;
  console.log('\n' + '='.repeat(70));
  console.log(`TEST ${testNumber}: ${name}`);
  console.log(description);
  console.log('='.repeat(70));

  const client = new net.Socket();
  client.setTimeout(3000);

  client.connect(PRINTER_PORT, PRINTER_IP, () => {
    console.log('✓ Connected to printer');
    console.log(`\nSending ${dataBuffer.length} bytes...`);
    console.log('Hex:', dataBuffer.toString('hex').match(/.{1,2}/g)?.join(' '));

    client.write(dataBuffer, () => {
      console.log('✓ Data written to printer socket');
    });
  });

  client.on('data', (response) => {
    console.log(`\n✓ Printer response: ${response.length} bytes`);
    console.log('Hex:', response.toString('hex').match(/.{1,2}/g)?.join(' '));
    client.destroy();
  });

  client.on('error', (err) => {
    console.error('✗ Error:', err.message);
    if (callback) setTimeout(callback, 500);
  });

  client.on('timeout', () => {
    console.log('⚠ Timeout (printer may not send response)');
    client.destroy();
  });

  client.on('close', () => {
    console.log('✓ Connection closed');
    console.log('\n>>> CHECK PRINTER NOW - Did this test print? <<<\n');
    if (callback) {
      setTimeout(callback, 2000); // Wait 2 seconds before next test
    }
  });
}

// TEST 1: Pure ESC/POS Mode (Standard Compatibility)
function test1_PureESCPOS() {
  const data = Buffer.concat([
    Buffer.from([0x1B, 0x40]),                    // ESC @ - Initialize
    Buffer.from('TEST 1: PURE ESC/POS\n'),
    Buffer.from('Standard compatibility mode\n'),
    Buffer.from([0x0A, 0x0A, 0x0A]),             // Line feeds
    Buffer.from([0x1D, 0x56, 0x00])              // GS V 0 - Full cut
  ]);

  runTest(
    'Pure ESC/POS Mode',
    'Using only standard ESC/POS commands (most compatible)',
    data,
    test2_ESCPOSPartialCut
  );
}

// TEST 2: ESC/POS with Partial Cut
function test2_ESCPOSPartialCut() {
  const data = Buffer.concat([
    Buffer.from([0x1B, 0x40]),                    // ESC @ - Initialize
    Buffer.from('TEST 2: ESC/POS PARTIAL CUT\n'),
    Buffer.from('Different cut command\n'),
    Buffer.from([0x0A, 0x0A, 0x0A]),             // Line feeds
    Buffer.from([0x1D, 0x56, 0x01])              // GS V 1 - Partial cut
  ]);

  runTest(
    'ESC/POS with Partial Cut',
    'Using GS V 1 for partial cut instead of full cut',
    data,
    test3_MinimalNoInit
  );
}

// TEST 3: Minimal - No Initialization
function test3_MinimalNoInit() {
  const data = Buffer.concat([
    Buffer.from('TEST 3: MINIMAL NO INIT\n'),
    Buffer.from('Just text and linefeeds\n'),
    Buffer.from([0x0A, 0x0A, 0x0A, 0x0A, 0x0A])  // Extra line feeds to eject
  ]);

  runTest(
    'Minimal Commands',
    'No initialization, just raw text + linefeeds',
    data,
    test4_ESCPOSWithFeed
  );
}

// TEST 4: ESC/POS with Feed Before Cut
function test4_ESCPOSWithFeed() {
  const data = Buffer.concat([
    Buffer.from([0x1B, 0x40]),                    // ESC @ - Initialize
    Buffer.from([0x1B, 0x61, 0x01]),             // ESC a 1 - Center align
    Buffer.from([0x1B, 0x45, 0x01]),             // ESC E 1 - Emphasis ON
    Buffer.from('TEST 4: WITH FEED\n'),
    Buffer.from([0x1B, 0x45, 0x00]),             // ESC E 0 - Emphasis OFF
    Buffer.from([0x1B, 0x61, 0x00]),             // ESC a 0 - Left align
    Buffer.from('Feed then cut\n'),
    Buffer.from([0x1B, 0x64, 0x05]),             // ESC d 5 - Feed 5 lines
    Buffer.from([0x1D, 0x56, 0x00])              // GS V 0 - Cut
  ]);

  runTest(
    'ESC/POS with Feed Before Cut',
    'Feed paper first, then cut',
    data,
    test5_StarLineMode
  );
}

// TEST 5: Star Line Mode
function test5_StarLineMode() {
  const data = Buffer.concat([
    Buffer.from([0x1B, 0x40]),                    // ESC @ - Initialize
    Buffer.from([0x1B, 0x1D, 0x61, 0x00]),       // Select Star Line Mode
    Buffer.from([0x1B, 0x69, 0x61, 0x00]),       // Disable auto status back
    Buffer.from('TEST 5: STAR LINE MODE\n'),
    Buffer.from('Native Star commands\n'),
    Buffer.from([0x0A, 0x0A, 0x0A]),
    Buffer.from([0x1B, 0x64, 0x02])              // ESC d 2 - Feed and cut
  ]);

  runTest(
    'Star Line Mode',
    'Using Star-specific Line Mode commands',
    data,
    test6_StarGraphicMode
  );
}

// TEST 6: Star Graphic Mode
function test6_StarGraphicMode() {
  const data = Buffer.concat([
    Buffer.from([0x1B, 0x40]),                    // ESC @ - Initialize
    Buffer.from([0x1B, 0x1D, 0x61, 0x01]),       // Select Star Graphic Mode
    Buffer.from('TEST 6: STAR GRAPHIC MODE\n'),
    Buffer.from('Star Graphic commands\n'),
    Buffer.from([0x0A, 0x0A, 0x0A]),
    Buffer.from([0x1B, 0x64, 0x02])              // ESC d 2 - Feed and cut
  ]);

  runTest(
    'Star Graphic Mode',
    'Using Star Graphic Mode instead of Line Mode',
    data,
    test7_StarGraphicRaster
  );
}

// TEST 7: Star Graphic Mode with Raster (ESC * r A)
function test7_StarGraphicRaster() {
  // Create a simple text raster (will be improved once we see Python output)
  const text = 'TEST 7: RASTER';
  const textBytes = Buffer.from(text);

  // Simple 1-bit raster: each byte represents 8 horizontal pixels
  // For simplicity, create a small raster bitmap
  const width = 72; // 72 dots = 9 bytes per line
  const bytesPerLine = Math.ceil(width / 8);
  const height = 10; // 10 pixel lines

  // Create simple bitmap (black text on white)
  const bitmap = Buffer.alloc(bytesPerLine * height, 0x00);

  const data = Buffer.concat([
    Buffer.from([0x1B, 0x40]),                    // ESC @ - Initialize
    // Star Graphic Mode raster command: ESC * r A
    Buffer.from([0x1B, 0x2A, 0x72, 0x41]),       // ESC * r A - Raster data transfer
    Buffer.from([bytesPerLine & 0xFF]),           // Width in bytes (low byte)
    Buffer.from([0x00]),                          // Width in bytes (high byte)
    bitmap,                                       // Raster bitmap data
    Buffer.from([0x1B, 0x0C, 0x00]),             // ESC FF NUL - Execute print
    Buffer.from([0x1B, 0x64, 0x02])              // ESC d 2 - Feed and cut
  ]);

  runTest(
    'Star Graphic Mode with Raster',
    'Using ESC * r A raster command (Star-specific)',
    data,
    test8_StarGraphicModeFull
  );
}

// TEST 8: Full Star Graphic Mode Sequence
function test8_StarGraphicModeFull() {
  // Based on Star Graphic Mode manual
  const data = Buffer.concat([
    Buffer.from([0x1B, 0x40]),                    // ESC @ - Initialize
    Buffer.from([0x1B, 0x2A, 0x72, 0x42]),       // ESC * r B - Page mode
    Buffer.from([0x1B, 0x2A, 0x72, 0x50]),       // ESC * r P - Set page length
    Buffer.from([0x00, 0x01]),                    // Page length (low, high)
    Buffer.from([0x00]),                          // NUL
    Buffer.from('TEST 8: STAR GRAPHIC\n'),
    Buffer.from([0x1B, 0x2A, 0x72, 0x51]),       // ESC * r Q - Page mode control
    Buffer.from([0x30, 0x00]),                    // Parameters
    Buffer.from([0x1B, 0x0C, 0x00]),             // ESC FF NUL - Execute
    Buffer.from([0x1B, 0x64, 0x02])              // Feed and cut
  ]);

  runTest(
    'Full Star Graphic Mode Sequence',
    'Complete Star Graphic Mode with page control',
    data,
    test9_StarTSPImageFormat
  );
}

// TEST 9: Exact StarTSPImage Format (from Python debug)
function test9_StarTSPImageFormat() {
  // Create simple raster bitmap (576 pixels wide = 72 bytes per line)
  const width = 576;
  const bytesPerLine = Math.ceil(width / 8); // 72 bytes
  const height = 100; // 100 pixel lines

  // Create bitmap data (all zeros = white, we'll set some pixels)
  const bitmap = Buffer.alloc(bytesPerLine * height, 0x00);

  // Draw some simple black pixels to spell "TEST" (very basic)
  // Just set a few bytes to make it visible
  for (let y = 10; y < 20; y++) {
    for (let x = 1; x < 10; x++) {
      const byteIndex = y * bytesPerLine + x;
      bitmap[byteIndex] = 0xFF; // All black pixels in this byte
    }
  }

  // Calculate page length (from Python: 0x4862 = 18530)
  // This appears to be: height * bytesPerLine
  const pageLength = height * bytesPerLine;
  const pageLengthLow = pageLength & 0xFF;
  const pageLengthHigh = (pageLength >> 8) & 0xFF;

  const data = Buffer.concat([
    // NO ESC @ initialization! Start directly with raster commands
    Buffer.from([0x1B, 0x2A, 0x72, 0x41]),       // ESC * r A - Start raster
    Buffer.from([0x1B, 0x2A, 0x72, 0x50]),       // ESC * r P - Page length
    Buffer.from([0x30, 0x00]),                    // "0" NUL
    Buffer.from([pageLengthLow, pageLengthHigh, 0x00]), // Page length (3 bytes)
    bitmap,                                       // Raster bitmap data
    Buffer.from([0x1B, 0x2A, 0x72, 0x42])        // ESC * r B - End raster
  ]);

  runTest(
    'StarTSPImage Format (Exact Python Match)',
    'Using exact command sequence from working Python code',
    data,
    testsComplete
  );
}

function testsComplete() {
  console.log('\n' + '='.repeat(70));
  console.log('ALL TESTS COMPLETE!');
  console.log('='.repeat(70));
  console.log('\n📝 NEXT STEPS:');
  console.log('1. Check your printer - did ANY of the tests print?');
  console.log('2. Note which test number(s) printed successfully');
  console.log('3. We\'ll use the working command sequence in the main app\n');
  console.log('If nothing printed, the printer may be in a different mode');
  console.log('or require specific Star PRNT SDK commands.\n');
  process.exit(0);
}

// Start tests
console.log('\n' + '='.repeat(70));
console.log('Star TSP100 Comprehensive Printer Test Suite');
console.log('='.repeat(70));
console.log(`Printer: ${PRINTER_IP}:${PRINTER_PORT}`);
console.log('Running 9 different command sequences...');
console.log('Tests 1-6: Various ESC/POS and Star Line/Graphic modes');
console.log('Tests 7-8: Star Graphic Mode raster commands (ESC * r)');
console.log('Test 9: EXACT StarTSPImage format from working Python code');
console.log('Watch the printer for output after each test!');
console.log('='.repeat(70));

setTimeout(() => test1_PureESCPOS(), 1000);
