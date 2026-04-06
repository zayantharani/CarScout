// ─── test-extract.js ── Verify extraction fixes ────────────────────────────

const { extractYear, extractPrice, extractMiles } = require('./extract');

let pass = 0, fail = 0;

function assert(label, actual, expected) {
  if (actual === expected) {
    pass++;
  } else {
    fail++;
    console.log(`  FAIL: ${label} — got ${actual}, expected ${expected}`);
  }
}

console.log('Testing extractYear...');
assert('year in title',          extractYear('2015 Toyota Camry SE'),          2015);
assert('year in sentence',       extractYear('I bought this 2013 Honda'),      2013);
assert('should not match zip',   extractYear('Located in 75080'),              null);
assert('should not match price', extractYear('asking $12000'),                 null);
assert('boundary: 2012',         extractYear('clean 2012 Civic'),              2012);
assert('boundary: 2017',         extractYear('2017 Accord EX-L'),             2017);
assert('out of range: 2011',     extractYear('2011 Corolla'),                  null);
assert('out of range: 2018',     extractYear('2018 Camry'),                    null);

console.log('\nTesting extractPrice...');
assert('$8,500',                 extractPrice('asking $8,500'),                8500);
assert('$11000 no comma',       extractPrice('$11000 firm'),                  11000);
assert('$5000',                  extractPrice('price $5000'),                  5000);
assert('no dollar sign',         extractPrice('asking 8500'),                  null);  // FIX: was matching bare numbers
assert('zip should not match',   extractPrice('located 75080'),                null);  // FIX: was matching zips
assert('year should not match',  extractPrice('this is a 2015 model'),         null);  // FIX: was matching years
assert('too low',                extractPrice('$500 down payment'),            null);

console.log('\nTesting extractMiles...');
assert('120k miles',             extractMiles('120k miles'),                   120000);
assert('95K mi',                 extractMiles('only 95K mi'),                  95000);
assert('120,000 miles',          extractMiles('120,000 miles on it'),          120000);
assert('85000 miles',            extractMiles('odometer 85000 miles'),         85000);
assert('mileage: 130000',        extractMiles('mileage: 130000'),             130000);
assert('"miles away" no match',  extractMiles('only 15 miles away'),           null);  // FIX
assert('address no match',       extractMiles('2017 Main Street'),             null);  // FIX
assert('"50 miles" no match',    extractMiles('within 50 miles'),              null);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
