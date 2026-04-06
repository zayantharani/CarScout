// ─── scanner.js ── Main scan orchestrator ───────────────────────────────────

const { SEARCHES, FILTERS } = require('./config');
const db       = require('./db');
const browser  = require('./browser');
const telegram = require('./telegram');
const kbb      = require('./kbb');
const { extractYear, extractPrice, extractMiles, extractTrim } = require('./extract');
const { analyzeText } = require('./analyze');

// ─── Marketplace adapters ──────────────────────────────────────────────────
const craigslist = require('./marketplaces/craigslist');
const facebook   = require('./marketplaces/facebook');

function getActiveMarketplaces() {
  const active = [craigslist]; // Always enabled
  if (facebook.isConfigured()) {
    active.push(facebook);
  } else {
    console.log('[scanner] Facebook Marketplace not configured — skipping (see fb_cookies.json)');
  }
  return active;
}

// ─── Check if listing title matches the expected make/model ────────────────
function titleMatchesSearch(title, search) {
  const t = title.toLowerCase();
  const make  = search.make.toLowerCase();
  const model = search.model.toLowerCase();

  // Make must appear in title
  if (!t.includes(make)) {
    // Allow "mazda6" without separate "mazda" since model contains make
    if (!model.includes(make)) return false;
  }

  // For hyphenated models (cr-v, hr-v), also accept without the hyphen (crv, hrv)
  // or with a space (cr v, hr v)
  if (model.includes('-')) {
    const noHyphen = model.replace(/-/g, '');
    const withSpace = model.replace(/-/g, ' ');
    if (!t.includes(model) && !t.includes(noHyphen) && !t.includes(withSpace)) return false;
  } else if (model.length <= 3) {
    // For short model names (e.g. "es", "is", "tlx", "fit") that could match
    // common words, require word-boundary matching
    const modelRe = new RegExp(`\\b${model}\\b`, 'i');
    if (!modelRe.test(t)) return false;
  } else {
    if (!t.includes(model)) return false;
  }

  return true;
}

// ─── Process a single listing from search results ──────────────────────────
async function processListing(searchResult, search, marketplace) {
  const href = searchResult.href;
  const url  = marketplace.buildListingUrl(href);
  const id   = marketplace.extractId(href);

  // ── Already seen? ──
  if (db.hasSeen(id)) return null;
  db.markSeen(id);

  // ── Quick pre-filter: check search card title matches expected make/model ──
  if (!titleMatchesSearch(searchResult.title, search)) return null;

  // ── Quick pre-filter from search card text ──
  const cardText  = `${searchResult.title} ${searchResult.price} ${searchResult.meta}`;
  const cardPrice = extractPrice(searchResult.price) || extractPrice(cardText);

  if (cardPrice && cardPrice > FILTERS.maxPrice) return null;
  if (cardPrice && cardPrice < FILTERS.minPrice) return null;

  // ── Fetch full listing detail ──
  await browser.sleep(2000);
  const page = await browser.newPage();
  let detail;
  try {
    detail = await marketplace.scrapeListingDetail(page, url);
  } catch (err) {
    console.error(`    Detail scrape failed (${url}): ${err.message}`);
    return null;
  } finally {
    await page.close();
  }
  if (!detail) return null;

  const fullText = `${detail.title} ${detail.body} ${detail.price}`;

  // ── Verify detail page title also matches expected make/model ──
  if (detail.title && !titleMatchesSearch(detail.title, search)) return null;

  // ── Extract structured data ──
  const year  = parseInt(detail.attrs?.['model year']) || extractYear(fullText);
  const price = extractPrice(detail.price) || extractPrice(fullText);
  const miles = parseInt(detail.attrs?.['odometer']?.replace(/[^0-9]/g, ''))
                || extractMiles(fullText);
  const trim  = extractTrim(fullText);

  // ── Hard filters ──
  if (!year  || year  < FILTERS.minYear || year  > FILTERS.maxYear) return null;
  if (!price || price > FILTERS.maxPrice || price < FILTERS.minPrice) return null;
  if (!miles || miles > FILTERS.maxMiles)                              return null;

  // ── Quality analysis ──
  const analysis = analyzeText(fullText);
  if (analysis.hasHardFlag)    return null;
  if (analysis.hasFlipperFlag) return null;

  // ── KBB valuation ──
  const kbbData = kbb.estimate(search.make, search.model, year);
  if (kbbData && price > kbbData.good + 1000) return null;

  // ── Score threshold ──
  if (analysis.score < 0) return null;

  // ── Determine verdict ──
  let verdict = 'pass';
  if (kbbData) {
    if (price <= kbbData.fair)              verdict = 'strong';
    else if (price <= kbbData.good + 1000)  verdict = 'good';
  } else {
    verdict = analysis.score >= 4 ? 'good' : 'pass';
  }

  if (verdict === 'pass') return null;

  // ── Build deal object ──
  const title = trim
    ? `${year} ${search.label} ${trim}`
    : `${year} ${search.label}`;

  return {
    id,
    title,
    year,
    make:    search.make,
    model:   search.model,
    price,
    miles,
    url,
    source:  marketplace.NAME,
    sourceLabel: marketplace.LABEL,
    kbbData,
    verdict,
    signals: analysis.signals,
    flags:   analysis.flags,
    score:   analysis.score,
    photos:  detail.photos || [],
  };
}

// ─── Main scan loop ─────────────────────────────────────────────────────────
async function runScan() {
  console.log(`\n[${new Date().toISOString()}] Scan started`);
  let totalNew = 0;
  const marketplaces = getActiveMarketplaces();

  for (const marketplace of marketplaces) {
    console.log(`  ── ${marketplace.LABEL} ──`);

    for (const search of SEARCHES) {
      const searchUrl = marketplace.buildSearchUrl(search);
      console.log(`  Searching: ${search.label}`);

      let page;
      try {
        page = await browser.newPage();
        const results = await marketplace.scrapeSearchResults(page, searchUrl);
        await page.close();
        page = null;
        console.log(`    Found ${results.length} search results`);

        for (const result of results) {
          try {
            const deal = await processListing(result, search, marketplace);
            if (!deal) continue;

            totalNew++;
            console.log(`    ✓ DEAL: ${deal.title} $${deal.price} [${deal.verdict}] (${marketplace.LABEL})`);
            await telegram.sendDealAlert(deal);
            db.saveDeal(deal);
          } catch (err) {
            console.error(`    Item error: ${err.message}`);
          }
        }

        await browser.sleep(3000);

      } catch (err) {
        console.error(`  Search error (${search.label} on ${marketplace.LABEL}): ${err.message}`);
      } finally {
        if (page) await page.close().catch(() => {});
      }
    }
  }

  console.log(`[${new Date().toISOString()}] Scan done — ${totalNew} new deal(s)\n`);
  return totalNew;
}

// ─── Price drop checker ─────────────────────────────────────────────────────
async function checkPriceDrops() {
  console.log(`[${new Date().toISOString()}] Checking price drops...`);
  const watched = db.getWatchedListings();
  let drops = 0;

  // Map source prefix to marketplace adapter
  const adapterMap = {
    cl: craigslist,
    fb: facebook,
  };

  for (const listing of watched) {
    const prefix = (listing.source || listing.id.split('_')[0]);
    const marketplace = adapterMap[prefix];
    if (!marketplace) continue;

    // Skip FB listings if not configured
    if (prefix === 'fb' && !facebook.isConfigured()) continue;

    let page;
    try {
      page = await browser.newPage();
      const { active, price } = await marketplace.checkListingPrice(page, listing.url);
      await page.close();
      page = null;

      if (!active) {
        db.markInactive(listing.id);
        continue;
      }

      if (price && price < listing.last_price) {
        const drop = listing.last_price - price;
        console.log(`  📉 Price drop: ${listing.title} $${listing.last_price} → $${price} (-$${drop})`);
        await telegram.sendPriceDropAlert(listing, price, drop);
        db.updateListingPrice(listing.id, price);
        drops++;
      }

      await browser.sleep(2000);
    } catch {
      // listing may be expired — silently skip
    } finally {
      if (page) await page.close().catch(() => {});
    }
  }

  console.log(`  ${drops} price drop(s) found`);
}

module.exports = { runScan, checkPriceDrops };
