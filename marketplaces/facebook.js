// ─── marketplaces/facebook.js ── Facebook Marketplace adapter ────────────────
//
// IMPORTANT: Facebook Marketplace requires a logged-in session.
// You must provide cookies via one of:
//   1. FB_COOKIES env var — JSON array of cookie objects
//   2. fb_cookies.json file in project root
//
// Export cookies from your browser using a "Cookie Editor" extension,
// then save the facebook.com cookies as a JSON file.

const fs   = require('fs');
const path = require('path');
const { FILTERS } = require('../config');

const NAME = 'facebook';
const LABEL = 'FB Marketplace';

// Facebook Marketplace location slug (Dallas, TX)
const FB_LOCATION = process.env.FB_MARKETPLACE_LOCATION || 'dallas';

// ─── Cookie management ─────────────────────────────────────────────────────
let _cookies = null;

function loadCookies() {
  if (_cookies) return _cookies;

  // Try env var first
  if (process.env.FB_COOKIES) {
    try {
      _cookies = JSON.parse(process.env.FB_COOKIES);
      return _cookies;
    } catch {
      console.error('[facebook] Failed to parse FB_COOKIES env var');
    }
  }

  // Try file
  const cookiePath = path.join(__dirname, '..', 'fb_cookies.json');
  if (fs.existsSync(cookiePath)) {
    try {
      _cookies = JSON.parse(fs.readFileSync(cookiePath, 'utf-8'));
      return _cookies;
    } catch {
      console.error('[facebook] Failed to parse fb_cookies.json');
    }
  }

  return null;
}

function isConfigured() {
  return !!loadCookies();
}

// ─── Set cookies on a page ─────────────────────────────────────────────────
async function setCookies(page) {
  const cookies = loadCookies();
  if (!cookies) return false;

  // Normalize cookies for Puppeteer (browser extension format → Puppeteer format)
  const puppeteerCookies = cookies.map(c => ({
    name:     c.name,
    value:    c.value,
    domain:   c.domain || '.facebook.com',
    path:     c.path || '/',
    httpOnly: c.httpOnly ?? false,
    secure:   c.secure ?? true,
    sameSite: c.sameSite || 'None',
  }));

  await page.setCookie(...puppeteerCookies);
  return true;
}

// ─── URL builders ──────────────────────────────────────────────────────────
function buildSearchUrl(search) {
  const params = new URLSearchParams({
    minPrice:    FILTERS.minPrice,
    maxPrice:    FILTERS.maxPrice,
    minYear:     FILTERS.minYear,
    maxYear:     FILTERS.maxYear,
    maxMileage:  FILTERS.maxMiles,
    daysSinceListed: 7,
    sortBy:      'creation_time_descend',
    exact:       false,
  });

  // Facebook uses a query string in the URL path for vehicle searches
  const query = `${search.make} ${search.model}`;
  params.set('query', query);

  return `https://www.facebook.com/marketplace/${FB_LOCATION}/vehicles?${params.toString()}`;
}

function buildListingUrl(href) {
  if (href.startsWith('http')) return href;
  return `https://www.facebook.com${href}`;
}

// ─── Extract listing ID from URL ───────────────────────────────────────────
function extractId(href) {
  // FB Marketplace URLs: /marketplace/item/1234567890/
  const m = href.match(/\/item\/(\d+)/);
  return m ? `fb_${m[1]}` : `fb_${href.replace(/[^a-zA-Z0-9]/g, '_')}`;
}

// ─── Scrape search results ─────────────────────────────────────────────────
async function scrapeSearchResults(page, url) {
  const hasCookies = await setCookies(page);
  if (!hasCookies) {
    console.error('[facebook] No cookies available — skipping Facebook Marketplace');
    return [];
  }

  await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

  // Wait for marketplace content to render (React SPA)
  try {
    await page.waitForSelector('a[href*="/marketplace/item/"]', { timeout: 10000 });
  } catch {
    console.warn('[facebook] No listing cards found — page may not have loaded or session expired');
    return [];
  }

  // Scroll down to load more results
  await page.evaluate(() => window.scrollBy(0, 2000));
  await new Promise(r => setTimeout(r, 2000));

  const listings = await page.evaluate(() => {
    const results = [];
    const seen = new Set();

    // FB Marketplace renders listing cards as anchor tags linking to /marketplace/item/
    document.querySelectorAll('a[href*="/marketplace/item/"]').forEach(el => {
      const href = el.getAttribute('href') || '';

      // Deduplicate (FB often renders items multiple times)
      const idMatch = href.match(/\/item\/(\d+)/);
      if (idMatch && seen.has(idMatch[1])) return;
      if (idMatch) seen.add(idMatch[1]);

      // The card usually contains spans with title, price, location, mileage
      const spans = el.querySelectorAll('span');
      let title = '';
      let price = '';
      let meta  = '';

      spans.forEach(span => {
        const text = span.textContent.trim();
        if (!text) return;
        if (text.startsWith('$') && !price) {
          price = text;
        } else if (!title && text.length > 5) {
          title = text;
        } else {
          meta += ' ' + text;
        }
      });

      if (href && (title || price)) {
        results.push({ href, title, price, meta: meta.trim() });
      }
    });

    return results;
  });

  return listings;
}

// ─── Scrape listing detail ─────────────────────────────────────────────────
async function scrapeListingDetail(page, url) {
  const hasCookies = await setCookies(page);
  if (!hasCookies) return null;

  await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

  // Wait for listing content
  try {
    await page.waitForSelector('[data-testid], h1, span', { timeout: 10000 });
  } catch {
    return null;
  }

  // Give React a moment to hydrate
  await new Promise(r => setTimeout(r, 2000));

  const detail = await page.evaluate(() => {
    // Facebook's DOM structure is heavily obfuscated with generated class names.
    // We rely on semantic patterns rather than specific classes.

    // Title: usually the first prominent heading or large text
    const h1 = document.querySelector('h1');
    const title = h1?.textContent?.trim() || '';

    // Price: look for $ in prominent positions
    let price = '';
    document.querySelectorAll('span').forEach(span => {
      const text = span.textContent.trim();
      if (text.match(/^\$[\d,]+$/) && !price) {
        price = text;
      }
    });

    // Description body: FB puts it in a span inside a container after the attributes
    let body = '';
    const allSpans = document.querySelectorAll('span');
    for (const span of allSpans) {
      const text = span.textContent.trim();
      // Heuristic: description is usually the longest text block
      if (text.length > 100 && text.length > body.length) {
        body = text;
      }
    }

    // Attributes: FB shows vehicle details as label-value pairs
    const attrs = {};
    const attrPatterns = [
      { re: /^\s*(\d{4})\s*$/, key: 'model year' },
      { re: /^([\d,]+)\s*miles?$/i, key: 'odometer' },
      { re: /^(automatic|manual|cvt)$/i, key: 'transmission' },
      { re: /^(clean|rebuilt|salvage)\s*title$/i, key: 'title_status' },
    ];

    allSpans.forEach(span => {
      const text = span.textContent.trim();
      for (const pat of attrPatterns) {
        const m = text.match(pat.re);
        if (m) {
          attrs[pat.key] = m[1].replace(/,/g, '');
        }
      }
      // Also check for "key: value" patterns
      const kvMatch = text.match(/^(Condition|Mileage|Year|Transmission|Fuel type)[:\s]+(.+)$/i);
      if (kvMatch) {
        attrs[kvMatch[1].toLowerCase()] = kvMatch[2].trim();
      }
    });

    // Photos
    const photos = [];
    document.querySelectorAll('img[src*="scontent"], img[src*="fbcdn"]').forEach(img => {
      const src = img.getAttribute('src') || '';
      // Filter to larger images (listing photos, not icons)
      if (src && img.naturalWidth > 200) {
        photos.push(src);
      }
    });

    // Fallback: check for any large images via style dimensions
    if (photos.length === 0) {
      document.querySelectorAll('img').forEach(img => {
        const src = img.getAttribute('src') || '';
        if (src && (src.includes('scontent') || src.includes('fbcdn'))) {
          photos.push(src);
        }
      });
    }

    return {
      title,
      price,
      body,
      attrs,
      photos: [...new Set(photos)].slice(0, 5),
      postedDate: '',
    };
  });

  return detail;
}

// ─── Check listing price ───────────────────────────────────────────────────
async function checkListingPrice(page, url) {
  const hasCookies = await setCookies(page);
  if (!hasCookies) return { active: false, price: null };

  try {
    const response = await page.goto(url, { waitUntil: 'networkidle2', timeout: 15000 });

    // Check if redirected away (listing removed)
    if (response.status() >= 400 || page.url().includes('/marketplace/?')) {
      return { active: false, price: null };
    }

    await new Promise(r => setTimeout(r, 2000));

    const priceText = await page.evaluate(() => {
      const spans = document.querySelectorAll('span');
      for (const span of spans) {
        const text = span.textContent.trim();
        if (text.match(/^\$[\d,]+$/)) return text;
      }
      return '';
    });

    const price = parseInt((priceText || '').replace(/[^0-9]/g, ''));
    return { active: true, price: price || null };
  } catch {
    return { active: false, price: null };
  }
}

module.exports = {
  NAME,
  LABEL,
  isConfigured,
  buildSearchUrl,
  buildListingUrl,
  extractId,
  scrapeSearchResults,
  scrapeListingDetail,
  checkListingPrice,
};
