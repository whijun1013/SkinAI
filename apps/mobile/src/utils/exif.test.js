/**
 * Node-compatible test runner for exif.js.
 * Reads the ES module file, converts 'export' to plain JS, and evaluates in a sandbox.
 */
const fs = require('fs');
const path = require('path');

function runTests() {
  console.log('=== Running EXIF JS Parser Tests ===');

  const filePath = path.join(__dirname, 'exif.js');
  let code = fs.readFileSync(filePath, 'utf8');

  // Transpile exports to global variables for evaluating
  code = code.replace(/export function/g, 'function').replace(/export /g, '');

  let sandbox;
  try {
    sandbox = new Function(code + '\nreturn { parseExifDate, parseGPS };')();
  } catch (err) {
    console.error('Failed to load/eval exif.js:', err);
    process.exit(1);
  }

  const { parseExifDate, parseGPS } = sandbox;

  // Test Suite
  let passed = 0;
  let failed = 0;

  function assertEqual(actual, expected, message) {
    if (actual === expected) {
      passed++;
    } else {
      failed++;
      console.error(`[FAIL] ${message}\n  Expected: ${expected}\n  Actual: ${actual}`);
    }
  }

  function assertNear(actual, expected, tolerance, message) {
    if (actual === null || expected === null) {
      if (actual === expected) {
        passed++;
      } else {
        failed++;
        console.error(`[FAIL] ${message}\n  Expected: ${expected}\n  Actual: ${actual}`);
      }
      return;
    }
    if (Math.abs(actual - expected) <= tolerance) {
      passed++;
    } else {
      failed++;
      console.error(`[FAIL] ${message}\n  Expected: ${expected}\n  Actual: ${actual}`);
    }
  }

  // 1. parseExifDate Tests
  assertEqual(parseExifDate('2026:06-01 12:00:00'), null, 'Invalid separator should return null');
  assertEqual(
    parseExifDate('2026:06:01 12:00:00'),
    '2026-06-01T12:00:00+09:00',
    'Valid EXIF date should parse correctly'
  );
  assertEqual(parseExifDate(null), null, 'Null input should return null');
  assertEqual(parseExifDate(123), null, 'Non-string input should return null');

  // 2. parseGPS Float/String Tests
  assertNear(parseGPS(37.514322), 37.514322, 1e-6, 'Float coordinate should remain unchanged');
  assertNear(parseGPS('127.062831'), 127.062831, 1e-6, 'Numeric string should parse correctly');
  assertEqual(parseGPS('abc'), null, 'Invalid coordinate string should return null');

  // 3. parseGPS Array Tests
  assertNear(parseGPS([37, 30, 0]), 37.5, 1e-6, 'DMS number array should convert correctly');
  assertNear(parseGPS(['37', '30', '0']), 37.5, 1e-6, 'DMS string array should convert correctly');
  assertNear(
    parseGPS(['37/1', '30/1', '0/1']),
    37.5,
    1e-6,
    'DMS fraction string array should convert correctly'
  );

  // 4. parseGPS Fraction String Tests
  assertNear(parseGPS('15/2'), 7.5, 1e-6, "Fractional string '15/2' should resolve to 7.5");
  assertNear(parseGPS('-15/2'), -7.5, 1e-6, 'Negative fractional string should resolve correctly');

  // 5. parseGPS Reference Sign Adjustments
  assertNear(parseGPS(37.5, 'S'), -37.5, 1e-6, 'South reference should turn coordinate negative');
  assertNear(parseGPS(127.5, 'w'), -127.5, 1e-6, 'West reference should turn coordinate negative');
  assertNear(parseGPS(37.5, 'N'), 37.5, 1e-6, 'North reference should keep coordinate positive');
  assertNear(
    parseGPS([37, 30, 0], 'W'),
    -37.5,
    1e-6,
    'DMS with West reference should convert to negative'
  );

  console.log(`\nTests Run: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
  if (failed > 0) {
    process.exit(1);
  } else {
    console.log('All JS EXIF tests passed successfully!\n');
  }
}

runTests();
