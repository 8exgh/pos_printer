# Debugging TSP100 Printer Issues

## Problem Summary

The Star TSP100/143 printer requires **Star Graphic Mode** commands, not generic ESC/POS or Star Line Mode. Our Node.js code was using the wrong protocol.

## Why Python Works

The Python `StarTSPImage` library knows the exact Star Graphic Mode protocol (`ESC * r` commands) required by TSP100 printers.

## Debug Tools

### 1. Python Debug Script - See Exact Working Commands

**Purpose:** Captures the exact byte sequence that StarTSPImage sends to the printer.

**Prerequisites:**
```bash
pip install pillow startspimage
```

**Run:**
```bash
python3 scripts/debug-startsp.py
```

**What it does:**
- Creates a test image with text
- Converts it using `StarTSPImage.imageToRaster()`
- Shows hex dump of ALL bytes being sent
- Identifies command patterns (`ESC * r`, `ESC FF`, etc.)
- Optionally sends to printer to verify it works

**Output:**
- Hex dump showing exact command structure
- Command analysis (identifies ESC, *, r, etc.)
- Pattern detection for Star Graphic Mode commands

**Next Step:** Use the hex dump to replicate exact commands in Node.js

### 2. Node.js Test Suite - 8 Different Approaches

**Purpose:** Systematically test different command protocols to find what works.

**Run:**
```bash
npm run test-printer
```

**What it tests:**

| Test | Protocol | Commands Used |
|------|----------|---------------|
| 1 | Pure ESC/POS | GS V (cut), standard init |
| 2 | ESC/POS Partial Cut | GS V 1 variant |
| 3 | Minimal | No init, just text + feeds |
| 4 | ESC/POS with Feed | Feed before cut |
| 5 | Star Line Mode | ESC GS a 0 |
| 6 | Star Graphic Mode | ESC GS a 1 |
| 7 | Star Raster (ESC * r A) | Star Graphic raster command |
| 8 | Full Star Graphic | Complete page mode sequence |

**Expected Result:** At least one test should print. Note which test number works!

## Workflow

### Step 1: Run Python Debug Script
```bash
python3 scripts/debug-startsp.py
```

**Look for:**
- Command sequence in hex dump (first ~100 bytes)
- `ESC * r` commands (will show as `1b 2a 72`)
- `ESC FF NUL` (will show as `1b 0c 00`)
- Note the exact structure

### Step 2: Run Node.js Test Suite
```bash
npm run test-printer
```

**Watch printer:** Which test(s) actually print?

### Step 3: Compare Results

**If Python works but Node.js tests don't:**
- Copy exact hex sequence from Python debug script
- Create new test in `test-printer.ts` with those exact bytes
- Test again

**If one of tests 7-8 works:**
- That's Star Graphic Mode! Update `tsp100-printer.ts` to use it
- Focus on replicating that command structure

**If tests 1-6 work:**
- Use that simpler protocol (ESC/POS or Star Line Mode)
- Update `tsp100-printer.ts` accordingly

## Star Graphic Mode Commands Reference

Based on research, Star TSP100 uses these commands:

| Command | Bytes | Purpose |
|---------|-------|---------|
| Initialize | `1B 40` | ESC @ - Reset printer |
| Raster Data | `1B 2A 72 41` | ESC * r A - Transfer raster |
| Page Length | `1B 2A 72 50` | ESC * r P - Set page size |
| Execute Print | `1B 0C 00` | ESC FF NUL - Print buffer |
| Feed & Cut | `1B 64 02` | ESC d 2 - Paper cut |

## Next Steps After Finding Working Commands

1. **Document the working test number**
2. **Update `src/processor/tsp100-printer.ts`:**
   - Replace current command generation
   - Use exact working command structure
   - Ensure raster format matches

3. **Test with main application:**
   - Restart background processor
   - Send print job via API
   - Verify actual printing

## Troubleshooting

**Nothing prints at all:**
- Check printer IP/port in `.env`
- Verify printer is on and has paper
- Try Python script to confirm printer works
- Check printer mode (may need DIP switch changes)

**Printer responds but doesn't print:**
- Wrong command protocol (need Star Graphic Mode)
- Raster format incorrect
- Missing execute/print command

**Python works, Node.js doesn't:**
- Compare hex dumps byte-by-byte
- May be endianness issue in raster width/height
- May need exact same initialization sequence

## Resources

- [Star Graphic Mode Manual](https://starmicronics.com/support/Mannualfolder/star_graphic_cm_en.pdf)
- [StarTSPImage Python Library](https://github.com/geftactics/python-StarTSPImage)
- Current implementation: `src/processor/tsp100-printer.ts`
