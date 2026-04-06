// ─── db.js ── SQLite persistence layer ──────────────────────────────────────

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'deals.db');
let db;

function init() {
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS seen (
      id          TEXT PRIMARY KEY,
      first_seen  TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS deals (
      id          TEXT PRIMARY KEY,
      title       TEXT,
      year        INTEGER,
      make        TEXT,
      model       TEXT,
      price       INTEGER,
      miles       INTEGER,
      url         TEXT,
      source      TEXT DEFAULT 'craigslist',
      kbb_fair    INTEGER,
      kbb_good    INTEGER,
      verdict     TEXT,
      signals     TEXT,   -- JSON array
      flags       TEXT,   -- JSON array
      score       INTEGER,
      photos      TEXT,   -- JSON array
      found_at    TEXT DEFAULT (datetime('now')),
      last_price  INTEGER,
      active      INTEGER DEFAULT 1
    );

    CREATE INDEX IF NOT EXISTS idx_deals_active ON deals(active);
    CREATE INDEX IF NOT EXISTS idx_seen_first ON seen(first_seen);
  `);

  // Migrate: add source column if missing (for existing databases)
  const cols = db.prepare("PRAGMA table_info(deals)").all().map(c => c.name);
  if (!cols.includes('source')) {
    db.exec("ALTER TABLE deals ADD COLUMN source TEXT DEFAULT 'craigslist'");
  }

  // Purge seen IDs older than 30 days to prevent unbounded growth
  db.exec(`
    DELETE FROM seen WHERE first_seen < datetime('now', '-30 days');
  `);

  return db;
}

function hasSeen(id) {
  const row = db.prepare('SELECT 1 FROM seen WHERE id = ?').get(id);
  return !!row;
}

function markSeen(id) {
  db.prepare('INSERT OR IGNORE INTO seen (id) VALUES (?)').run(id);
}

function saveDeal(deal) {
  db.prepare(`
    INSERT OR REPLACE INTO deals
      (id, title, year, make, model, price, miles, url, source,
       kbb_fair, kbb_good, verdict, signals, flags, score, photos, last_price)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    deal.id,
    deal.title,
    deal.year,
    deal.make   || '',
    deal.model  || '',
    deal.price,
    deal.miles   || null,
    deal.url,
    deal.source  || 'craigslist',
    deal.kbbData?.fair || null,
    deal.kbbData?.good || null,
    deal.verdict,
    JSON.stringify(deal.signals || []),
    JSON.stringify(deal.flags   || []),
    deal.score   || 0,
    JSON.stringify(deal.photos  || []),
    deal.price
  );
}

function getWatchedListings() {
  return db.prepare(`
    SELECT id, title, url, source, last_price, price AS original_price
    FROM deals
    WHERE active = 1 AND found_at > datetime('now', '-14 days')
  `).all();
}

function updateListingPrice(id, newPrice) {
  db.prepare('UPDATE deals SET last_price = ? WHERE id = ?').run(newPrice, id);
}

function markInactive(id) {
  db.prepare('UPDATE deals SET active = 0 WHERE id = ?').run(id);
}

function getStats() {
  const total  = db.prepare('SELECT COUNT(*) AS c FROM deals').get().c;
  const active = db.prepare('SELECT COUNT(*) AS c FROM deals WHERE active = 1').get().c;
  const seen   = db.prepare('SELECT COUNT(*) AS c FROM seen').get().c;
  return { total, active, seen };
}

module.exports = {
  init,
  hasSeen,
  markSeen,
  saveDeal,
  getWatchedListings,
  updateListingPrice,
  markInactive,
  getStats,
};
