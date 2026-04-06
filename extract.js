// ─── extract.js ── Text parsing utilities (bug-fixed) ──────────────────────

const { FILTERS } = require('./config');

/**
 * Extract model year from text.
 * Only matches 4-digit years in the configured range.
 * Avoids matching mileage, prices, or zip codes by requiring
 * the year to NOT be preceded/followed by digits or '$'.
 */
function extractYear(text) {
  const re = new RegExp(
    `(?<![\\d$])(${FILTERS.minYear}|` +
    Array.from(
      { length: FILTERS.maxYear - FILTERS.minYear },
      (_, i) => FILTERS.minYear + i + 1
    ).join('|') +
    `)(?!\\d)`,
    'g'
  );
  const matches = [...text.matchAll(re)];
  // Prefer the first match (usually in the title)
  return matches.length > 0 ? parseInt(matches[0][1]) : null;
}

/**
 * Extract price from text.
 * ONLY matches dollar-sign-prefixed values to avoid false positives.
 * The old code had a dangerous fallback matching bare 4-5 digit numbers
 * which would hit years (2015), zips (75080), phone fragments, etc.
 */
function extractPrice(text) {
  // Match $11000 or $8,500 — try bare digits first, then comma-grouped
  const m = text.match(/\$\s?(\d{4,6}|\d{1,3}(?:,\d{3})+)/);
  if (!m) return null;
  const val = parseInt(m[1].replace(/,/g, ''));
  // Sanity: price should be between minPrice and a reasonable max
  if (val < FILTERS.minPrice || val > 100000) return null;
  return val;
}

/**
 * Extract mileage from text.
 * Tightened to avoid matching "2017 miles away" or address numbers.
 * Requires explicit mileage context words.
 */
function extractMiles(text) {
  // Pattern 1: "120k miles", "95k mi"
  const kMatch = text.match(/\b([\d]{2,3})\s*k\s*(?:miles?|mi)\b/i);
  if (kMatch) return parseInt(kMatch[1]) * 1000;

  // Pattern 2: "120,000 miles", "95000 mi", "130000 miles"
  const fullMatch = text.match(/\b([\d]{2,3}[,.]?\d{3})\s*(?:miles?|mi)\b/i);
  if (fullMatch) {
    const val = parseInt(fullMatch[1].replace(/[,.]/g, ''));
    // Sanity: should be between 1,000 and 500,000
    if (val >= 1000 && val <= 500000) return val;
  }

  // Pattern 3: "mileage: 120000" or "odometer: 95,000"
  const labelMatch = text.match(/(?:mileage|odometer|odo)[:\s]+([\d]{2,3}[,.]?\d{3})/i);
  if (labelMatch) {
    const val = parseInt(labelMatch[1].replace(/[,.]/g, ''));
    if (val >= 1000 && val <= 500000) return val;
  }

  return null;
}

/**
 * Try to detect the trim level from text.
 */
function extractTrim(text) {
  const trims = [
    /\b(SE|LE|XLE|XSE|TRD|SR5|Limited|Trail|Off-Road|Premium|Nightshade|Platinum)\b/i, // Toyota
    /\b(LX|EX|EX-L|Sport|Touring|Si|Type R|Elite|Special Edition)\b/i,                 // Honda
    /\b(Sport|Touring|Grand Touring|i Sport)\b/i,                                       // Mazda
    /\b(ES\s*350|ES\s*300h|IS\s*350|IS\s*300|IS\s*200t|GS\s*350|GS\s*450h|LS\s*460|LS\s*500|RX\s*350|RX\s*450h|GX\s*460|F\s*Sport|Luxury|Ultra Luxury)\b/i, // Lexus
    /\b(Base|Technology|Advance|A-Spec|Premium|Special Edition)\b/i,                    // Acura
    /\b(Base|Preferred|Essence|Premium|Avenir|Sportback|TourX)\b/i,                     // Buick
    /\b(Premium|Limited|2\.5i|3\.6R|Touring)\b/i,                                       // Subaru
    /\b(P71|Police Interceptor|LX|Sport)\b/i,                                           // Ford Crown Vic
  ];
  for (const re of trims) {
    const m = text.match(re);
    if (m) return m[1].toUpperCase();
  }
  return null;
}

module.exports = { extractYear, extractPrice, extractMiles, extractTrim };
