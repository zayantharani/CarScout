// ─── index.js ── Entry point ─────────────────────────────────────────────────

require("dotenv").config();

const cron = require("node-cron");
const http = require("http");
const db = require("./db");
const browser = require("./browser");
const telegram = require("./telegram");
const { runScan, checkPriceDrops } = require("./scanner");

// ─── Init ───────────────────────────────────────────────────────────────────
db.init();

const PORT = process.env.PORT || 3000;

const facebook = require("./marketplaces/facebook");

console.log(`
🚗 Vehicle Deal Monitor v2.1 starting...
   Scan schedule: every 10 minutes
   Price-drop check: every 30 minutes
   Models: Toyota (7) + Honda (7) + Mazda (2) + Lexus (6) + Acura (4) + Buick (2) + Subaru + Ford/Mercury
   Area: Carrollton TX, 150mi radius
   Sources: Craigslist ✓ | FB Marketplace ${facebook.isConfigured() ? "✓" : "✗ (add fb_cookies.json)"}
   Telegram: ${telegram.isConfigured() ? "configured ✓" : "NOT configured (console only)"}
`);

// ─── Scheduled jobs ─────────────────────────────────────────────────────────

let scanRunning = false;

// Scan every 10 minutes (slightly slower than original 5min to reduce
// chance of rate-limiting with headless browser approach)
cron.schedule("*/10 * * * *", async () => {
  if (scanRunning) {
    console.log("[cron] Scan already in progress — skipping");
    return;
  }
  scanRunning = true;
  try {
    await runScan();
  } catch (err) {
    console.error("[cron] Scan crashed:", err.message);
  } finally {
    scanRunning = false;
  }
});

// Price-drop check every 30 minutes
cron.schedule("*/30 * * * *", async () => {
  if (scanRunning) return;
  scanRunning = true;
  try {
    await checkPriceDrops();
  } catch (err) {
    console.error("[cron] Price-drop check crashed:", err.message);
  } finally {
    scanRunning = false;
  }
});

// Daily status heartbeat at 8:00 AM CT
cron.schedule("0 13 * * *", async () => {
  const stats = db.getStats();
  await telegram.sendStatus(
    `Daily heartbeat — ${stats.active} active deals, ` +
      `${stats.total} total tracked, ${stats.seen} listings scanned`,
  );
});

// ─── HTTP health endpoint ───────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    const stats = db.getStats();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({ status: "ok", ...stats, uptime: process.uptime() }),
    );
  } else if (req.url === "/scan" && req.method === "POST") {
    // Manual trigger
    if (scanRunning) {
      res.writeHead(409, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Scan already running" }));
    } else {
      res.writeHead(202, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "Scan triggered" }));
      runScan().catch((err) =>
        console.error("Manual scan error:", err.message),
      );
    }
  } else {
    res.writeHead(404);
    res.end("Not found");
  }
});

server.listen(PORT, () => {
  console.log(`HTTP server on port ${PORT}`);
  console.log(`  GET  /health  — status & stats`);
  console.log(`  POST /scan    — trigger manual scan\n`);
});

// ─── Run initial scan on startup ────────────────────────────────────────────
(async () => {
  scanRunning = true;
  try {
    await browser.launch();
    console.log("[startup] Browser launched ✓");
    await runScan();
  } catch (err) {
    console.error("[startup] Initial scan failed:", err.message);
  } finally {
    scanRunning = false;
  }
})();

// ─── Graceful shutdown ──────────────────────────────────────────────────────
async function shutdown(signal) {
  console.log(`\n[${signal}] Shutting down...`);
  server.close();
  await browser.close();
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
