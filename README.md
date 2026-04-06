# Vehicle Deal Monitor v2.0

Automated Craigslist vehicle deal finder using Puppeteer. Monitors listings in the Dallas/Richardson TX area for reliable used cars at good prices, then sends Telegram alerts.

## What Changed from v1 (RSS)

| Issue | v1 (RSS) | v2 (Puppeteer) |
|-------|----------|----------------|
| **403 errors** | Craigslist blocks RSS bots | Headless Chrome bypasses basic bot detection |
| **Year filter** | Post-fetch only (wasted bandwidth) | Server-side `min/max_auto_year` params + post-fetch validation |
| **Price extraction** | Dangerous fallback matched zips/years | Only matches `$`-prefixed values |
| **Mileage extraction** | Matched "2017 miles away" | Requires explicit mileage keywords |
| **Dealer filtering** | Basic regex | `purveyor=owner` param + regex + flipper detection |
| **Photo scraping** | Fragile `_600` selector | Multiple selector fallbacks, deduplication |
| **Retry logic** | None | Browser auto-reconnect, graceful error handling |
| **DB cleanup** | Unbounded `seen` table | Auto-purge entries older than 30 days |

## Setup

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your Telegram bot token and chat ID

# Run
npm start
```

## Telegram Bot Setup

1. Message [@BotFather](https://t.me/BotFather) on Telegram
2. `/newbot` → follow prompts → copy the token
3. Message your bot, then visit `https://api.telegram.org/bot<TOKEN>/getUpdates` to find your chat ID
4. Add both to `.env`

## Endpoints

- `GET /health` — JSON status (deal counts, uptime)
- `POST /scan` — trigger a manual scan

## Optional: Residential Proxy

If Craigslist starts blocking the headless browser, add a residential proxy:

```env
PROXY_URL=http://user:pass@proxy-host:port
```

## Schedule

- **Full scan**: every 10 minutes
- **Price-drop check**: every 30 minutes (re-checks active deals)
- **Daily heartbeat**: 8:00 AM CT via Telegram

## Files

```
index.js      — entry point, scheduling, HTTP server
scanner.js    — main scan orchestrator
browser.js    — Puppeteer browser management & scraping
config.js     — search parameters, URL builders
extract.js    — year/price/mileage text extraction (bug-fixed)
analyze.js    — quality scoring, red flags, flipper detection
kbb.js        — offline KBB trade-in value estimates
telegram.js   — Telegram bot notifications
db.js         — SQLite persistence (seen IDs, deals, price tracking)
```
# CarScout
