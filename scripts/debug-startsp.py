#!/usr/bin/env python3
"""
Debug script to capture exact bytes that StarTSPImage sends
This helps us replicate the working Python commands in Node.js
"""

import socket
from PIL import Image, ImageDraw, ImageFont

try:
    import StarTSPImage
except ImportError:
    print("ERROR: StarTSPImage not installed!")
    print("Install with: pip install startspimage")
    exit(1)

# Printer network details
PRINTER_IP = "192.168.4.62"
PRINTER_PORT = 9100

print("=" * 70)
print("StarTSPImage Debug Script")
print("=" * 70)
print(f"Printer: {PRINTER_IP}:{PRINTER_PORT}\n")

# Create a simple test image (same as working example)
print("Creating test image...")
img = Image.new("RGB", (576, 100), "white")
draw = ImageDraw.Draw(img)

# Draw text
font = ImageFont.load_default()
draw.text((10, 10), "Hello from StarTSPImage", font=font, fill="black")
draw.text((10, 30), "This is a test print", font=font, fill="black")
draw.text((10, 50), "Using Star Graphic Mode", font=font, fill="black")

print("✓ Image created (576x100 pixels)\n")

# Convert to raster format
print("Converting to Star raster format...")
raster_data = StarTSPImage.imageToRaster(img, cut=True)
print(f"✓ Raster data generated: {len(raster_data)} bytes\n")

# Show hex dump of the data
print("=" * 70)
print("HEX DUMP OF RASTER DATA:")
print("=" * 70)

# Print in chunks of 16 bytes
for i in range(0, min(len(raster_data), 256), 16):
    # Hex part
    hex_part = ' '.join(f'{b:02x}' for b in raster_data[i:i+16])

    # ASCII part
    ascii_part = ''.join(
        chr(b) if 32 <= b <= 126 else '.'
        for b in raster_data[i:i+16]
    )

    print(f"{i:04x}:  {hex_part:<48}  {ascii_part}")

if len(raster_data) > 256:
    print(f"\n... ({len(raster_data) - 256} more bytes)")
    print(f"\nLast 64 bytes:")
    start = len(raster_data) - 64
    for i in range(start, len(raster_data), 16):
        hex_part = ' '.join(f'{b:02x}' for b in raster_data[i:i+16])
        ascii_part = ''.join(
            chr(b) if 32 <= b <= 126 else '.'
            for b in raster_data[i:i+16]
        )
        print(f"{i:04x}:  {hex_part:<48}  {ascii_part}")

print("\n" + "=" * 70)
print("COMMAND ANALYSIS:")
print("=" * 70)

# Analyze the first few bytes to identify commands
if len(raster_data) >= 10:
    print("\nFirst 10 bytes analysis:")
    for i in range(min(10, len(raster_data))):
        byte = raster_data[i]
        if byte == 0x1B:
            print(f"  Byte {i}: 0x{byte:02x} = ESC")
        elif byte == 0x1D:
            print(f"  Byte {i}: 0x{byte:02x} = GS")
        elif byte == 0x0C:
            print(f"  Byte {i}: 0x{byte:02x} = FF (Form Feed)")
        elif byte == 0x0A:
            print(f"  Byte {i}: 0x{byte:02x} = LF (Line Feed)")
        elif byte == 0x00:
            print(f"  Byte {i}: 0x{byte:02x} = NUL")
        elif byte == 0x2A:
            print(f"  Byte {i}: 0x{byte:02x} = * (Star command marker)")
        elif byte == 0x72:
            print(f"  Byte {i}: 0x{byte:02x} = 'r' (raster command)")
        elif 32 <= byte <= 126:
            print(f"  Byte {i}: 0x{byte:02x} = '{chr(byte)}'")
        else:
            print(f"  Byte {i}: 0x{byte:02x}")

# Look for command patterns
print("\nSearching for command patterns...")
data_str = bytes(raster_data)

# ESC * r commands
if b'\x1b*r' in data_str:
    index = data_str.find(b'\x1b*r')
    print(f"  Found ESC * r at byte {index}")

# ESC FF
if b'\x1b\x0c' in data_str:
    index = data_str.find(b'\x1b\x0c')
    print(f"  Found ESC FF at byte {index}")

print("\n" + "=" * 70)
print("READY TO SEND TO PRINTER")
print("=" * 70)

# Ask before sending
response = input("\nSend this to printer? (y/n): ")

if response.lower() == 'y':
    print("\nConnecting to printer...")
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.connect((PRINTER_IP, PRINTER_PORT))
            print("✓ Connected")

            sock.sendall(raster_data)
            print(f"✓ Sent {len(raster_data)} bytes")

            print("\n>>> Check printer for output! <<<\n")
    except Exception as e:
        print(f"✗ Error: {e}")
else:
    print("\nSkipped sending to printer.")

print("\n" + "=" * 70)
print("NEXT STEPS:")
print("=" * 70)
print("1. Note the command pattern from the hex dump above")
print("2. Look for ESC * r commands in the first ~100 bytes")
print("3. Use this exact format in Node.js test-printer.ts")
print("=" * 70)
