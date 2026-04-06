// ─── marketplaces/craigslist.js ── Craigslist adapter ─────────────────────────

const { FILTERS } = require('../config');

const NAME = 'craigslist';
const LABEL = 'Craigslist';

// ─── URL builders ──────────────────────────────────────────────────────────
function buildSearchUrl(search, page = 0) {
  const params = new URLSearchParams({
    query:              `${search.make} ${search.model}`,
    purveyor:           'owner',
    min_price:          FILTERS.minPrice,
    max_price:          FILTERS.maxPrice,
    min_auto_year:      FILTERS.minYear,
    max_auto_year:      FILTERS.maxYear,
    auto_title_status:  '1',
    search_distance:    FILTERS.radius,
    postal:             FILTERS.zip,
    sort:               'date',
  });
  const offset = page * 120;
  if (offset > 0) params.set('s', offset);
  return `https://dallas.craigslist.org/search/cto?${params.toString()}`;
}

function buildListingUrl(path) {
  if (path.startsWith('http')) return path;
  return `https://dallas.craigslist.org${path}`;
}

// ─── Extract listing ID from URL ───────────────────────────────────────────
function extractId(href) {
  const m = href.match(/\/(\d+)\.html/);
  return m ? `cl_${m[1]}` : `cl_${href}`;
}

// ─── Scrape search results ─────────────────────────────────────────────────
async function scrapeSearchResults(page, url) {
  await page.setRequestInterception(true);
  page.on('request', req => {
    const type = req.resourceType();
    if (['image', 'font', 'stylesheet'].includes(type)) {
      req.abort();
    } else {
      req.continue();
    }
  });

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });

  const listings = await page.evaluate(() => {
    const results = [];
    document.querySelectorAll('.cl-search-result, .result-row, li.cl-static-search-result').forEach(el => {
      const link    = el.querySelector('a[href*="/cto/"]') || el.querySelector('a');
      const href    = link?.getAttribute('href') || '';
      const title   = (el.querySelector('.titlestring, .result-title, .title')?.textContent || '').trim();
      const priceEl = el.querySelector('.priceinfo, .result-price, .price');
      const price   = priceEl?.textContent?.trim() || '';
      const metaEl  = el.querySelector('.meta, .result-meta, .details');
      const meta    = metaEl?.textContent?.trim() || '';

      if (href && title) {
        results.push({ href, title, price, meta });
      }
    });
    return results;
  });

  return listings;
}

// ─── Scrape listing detail ─────────────────────────────────────────────────
async function scrapeListingDetail(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });

  const detail = await page.evaluate(() => {
    const title = (document.querySelector('#titletextonly, .postingtitletext')?.textContent || '').trim();
    const priceEl = document.querySelector('.price');
    const price   = priceEl?.textContent?.trim() || '';

    const body = (document.querySelector('#postingbody')?.textContent || '').trim()
      .replace(/QR Code Link to This Post/i, '').trim();

    const attrs = {};
    document.querySelectorAll('.attrgroup span, .mapAndAttrs .attrgroup span').forEach(span => {
      const text = span.textContent.trim();
      const parts = text.split(':');
      if (parts.length === 2) {
        attrs[parts[0].trim().toLowerCase()] = parts[1].trim();
      } else {
        attrs[text.toLowerCase()] = true;
      }
    });

    const photos = [];
    document.querySelectorAll('#thumbs a, .swipe .slide img, .gallery img').forEach(el => {
      const src = el.getAttribute('href') || el.getAttribute('src') || '';
      if (src && src.includes('images.craigslist.org')) {
        photos.push(src.replace(/_\d+x\d+/, '_600x450'));
      }
    });

    const timeEl = document.querySelector('time.date');
    const postedDate = timeEl?.getAttribute('datetime') || '';

    return { title, price, body, attrs, photos: [...new Set(photos)].slice(0, 5), postedDate };
  });

  return detail;
}

// ─── Check listing price (for price-drop monitoring) ───────────────────────
async function checkListingPrice(page, url) {
  const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 });

  if (response.status() === 404 || page.url().includes('/search/')) {
    return { active: false, price: null };
  }

  const priceText = await page.evaluate(() => {
    return document.querySelector('.price')?.textContent?.trim() || '';
  });

  const price = parseInt((priceText || '').replace(/[^0-9]/g, ''));
  return { active: true, price: price || null };
}

module.exports = {
  NAME,
  LABEL,
  buildSearchUrl,
  buildListingUrl,
  extractId,
  scrapeSearchResults,
  scrapeListingDetail,
  checkListingPrice,
};
