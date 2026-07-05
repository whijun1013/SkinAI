/**
 * EXIF DateTimeOriginal or DateTime string parser.
 * Converts "YYYY:MM:DD HH:MM:SS" to ISO "YYYY-MM-DDTHH:MM:SS+09:00".
 * Returns null if parsing fails or input is invalid.
 *
 * Supported Format:
 * - "YYYY:MM:DD HH:MM:SS" (Standard EXIF datetime format)
 *
 * @param {string} dateTimeStr
 * @returns {string|null}
 */
export function parseExifDate(dateTimeStr) {
  if (!dateTimeStr || typeof dateTimeStr !== 'string') return null;

  const match = dateTimeStr.trim().match(/^(\d{4}):(\d{2}):(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/);
  if (match) {
    return `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}+09:00`;
  }
  return null;
}

/** ISO(+09:00) 또는 YYYY-MM-DD → YYYY-MM-DD */
export function getExifDateStr(isoOrDateStr) {
  if (!isoOrDateStr || typeof isoOrDateStr !== 'string') return null;
  const match = isoOrDateStr.trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

/** "2026-03-05" → "3월 5일" */
export function formatKoDateLabel(dateStr) {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-').map(Number);
  if (!year || !month || !day) return dateStr;
  return `${month}월 ${day}일`;
}

/** 기록 날짜 + EXIF 시각 → logged_at ISO (KST) */
export function buildLoggedAtIso(recordDateStr, capturedAtIso) {
  if (!recordDateStr) return capturedAtIso || null;
  if (capturedAtIso && capturedAtIso.includes('T')) {
    const timePart = capturedAtIso.split('T')[1].split('+')[0].split('Z')[0];
    return `${recordDateStr}T${timePart}+09:00`;
  }
  return `${recordDateStr}T12:00:00+09:00`;
}

/**
 * Parses fractional EXIF coordinates (e.g., "15/2", "37/1") or float values.
 * Returns decimal float number, or 0 if parsing fails.
 *
 * @param {any} val
 * @returns {number}
 */
function parseFractionOrFloat(val) {
  if (typeof val === 'number') {
    return isNaN(val) ? 0 : val;
  }
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (trimmed.includes('/')) {
      const parts = trimmed.split('/');
      if (parts.length === 2) {
        const num = parseFloat(parts[0]);
        const den = parseFloat(parts[1]);
        if (!isNaN(num) && !isNaN(den) && den !== 0) {
          return num / den;
        }
      }
    }
    const parsed = parseFloat(trimmed);
    return isNaN(parsed) ? 0 : parsed;
  }
  const parsed = parseFloat(val);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * EXIF GPS coordinate converter.
 * Converts decimal degrees represented as numbers, numeric strings, fractional strings,
 * or DMS array format ([degrees, minutes, seconds]) to decimal degrees.
 * Adjusts sign based on ref direction (S/W -> negative).
 * Returns null if conversion fails or inputs are invalid.
 *
 * Supported Formats:
 * - Decimal Float: 37.514322
 * - Decimal String: "37.514322"
 * - Fraction String: "15/2" (returns 7.5)
 * - DMS Number Array: [37, 30, 0] (returns 37.5)
 * - DMS String Array: ["37/1", "30/1", "0/1"] or ["37", "30", "0"] (returns 37.5)
 *
 * @param {number|number[]|string|string[]} coordinate
 * @param {string} [ref] - direction character ("N", "S", "E", "W")
 * @returns {number|null}
 */
export function parseGPS(coordinate, ref) {
  if (coordinate === undefined || coordinate === null) return null;

  let val = null;

  if (Array.isArray(coordinate)) {
    if (coordinate.length >= 3) {
      const d = parseFractionOrFloat(coordinate[0]);
      const m = parseFractionOrFloat(coordinate[1]);
      const s = parseFractionOrFloat(coordinate[2]);
      val = d + m / 60 + s / 3600;
    }
  } else {
    if (typeof coordinate === 'string') {
      const trimmed = coordinate.trim();
      if (trimmed.includes('/')) {
        val = parseFractionOrFloat(trimmed);
      } else {
        const parsed = parseFloat(trimmed);
        if (!isNaN(parsed)) {
          val = parsed;
        }
      }
    } else if (typeof coordinate === 'number') {
      val = coordinate;
    } else {
      const parsed = parseFloat(coordinate);
      if (!isNaN(parsed)) {
        val = parsed;
      }
    }
  }

  if (val === null || isNaN(val)) return null;

  // Apply sign based on direction reference
  if (ref && typeof ref === 'string') {
    const cleanRef = ref.trim().toUpperCase();
    if (cleanRef === 'S' || cleanRef === 'W') {
      val = -Math.abs(val);
    }
  }

  return val;
}
