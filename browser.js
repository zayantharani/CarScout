// ─── browser.js ── Puppeteer browser management ─────────────────────────────

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

let browser = null;

// ─── Browser lifecycle ──────────────────────────────────────────────────────
async function launch() {
  if (browser) return browser;

  const args = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--window-size=1920,1080',
    '--disable-blink-features=AutomationControlled',
  ];

  if (process.env.PROXY_URL) {
    args.push(`--proxy-server=${process.env.PROXY_URL}`);
  }

  browser = await puppeteer.launch({
    headless: 'new',
    args,
    defaultViewport: { width: 1920, height: 1080 },
  });

  browser.on('disconnected', () => {
    browser = null;
    console.warn('[browser] Disconnected — will relaunch on next use');
  });

  return browser;
}

async function close() {
  if (browser) {
    await browser.close();
    browser = null;
  }
}

// ─── Human-like delays ──────────────────────────────────────────────────────
function sleep(ms) {
  const jitter = Math.floor(Math.random() * ms * 0.4);
  return new Promise(r => setTimeout(r, ms + jitter));
}

// ─── Create a new page with stealth ─────────────────────────────────────────
async function newPage() {
  const b = await launch();
  const page = await b.newPage();
  return page;
}

module.exports = { launch, close, sleep, newPage };
