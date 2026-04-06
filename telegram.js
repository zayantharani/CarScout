// ─── telegram.js ── Telegram Bot notifications ─────────────────────────────

const https = require('https');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID   = process.env.TELEGRAM_CHAT_ID;

function isConfigured() {
  return !!(BOT_TOKEN && CHAT_ID && BOT_TOKEN !== 'your_bot_token_here');
}

/**
 * Send a message via Telegram Bot API.
 * Uses raw https to avoid extra dependencies.
 */
function sendMessage(text, opts = {}) {
  if (!isConfigured()) {
    console.log('[telegram] Not configured — message printed to console only');
    console.log(text);
    return Promise.resolve();
  }

  return _postTelegram('sendMessage', {
    chat_id:    CHAT_ID,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: opts.disablePreview ?? false,
  });
}

/**
 * Send a photo with caption via Telegram Bot API.
 * Telegram caption limit is 1024 chars — if the caption is longer,
 * we send the photo alone + a separate text message for the full details.
 */
async function sendPhoto(photoUrl, caption) {
  if (!isConfigured()) return;

  const MAX_CAPTION = 1024;

  // If caption fits, send photo+caption together
  if (caption.length <= MAX_CAPTION) {
    const ok = await _postTelegram('sendPhoto', {
      chat_id:    CHAT_ID,
      photo:      photoUrl,
      caption,
      parse_mode: 'HTML',
    });
    if (ok) return;
  }

  // Caption too long OR photo send failed — send photo without caption,
  // then send the full text as a separate message
  await _postTelegram('sendPhoto', {
    chat_id: CHAT_ID,
    photo:   photoUrl,
  });
  await sendMessage(caption);
}

/**
 * Low-level Telegram API POST. Returns true on success, false on failure.
 */
function _postTelegram(method, body) {
  return new Promise((resolve) => {
    const payload = JSON.stringify(body);

    const req = https.request({
      hostname: 'api.telegram.org',
      path:     `/bot${BOT_TOKEN}/${method}`,
      method:   'POST',
      headers:  {
        'Content-Type':   'application/json',
        'Content-Length':  Buffer.byteLength(payload),
      },
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(true);
        } else {
          console.error(`[telegram] ${method} error ${res.statusCode}: ${data}`);
          resolve(false);
        }
      });
    });

    req.on('error', err => {
      console.error(`[telegram] ${method} network error: ${err.message}`);
      resolve(false);
    });

    req.write(payload);
    req.end();
  });
}

// ─── Deal alert formatter ───────────────────────────────────────────────────
async function sendDealAlert(deal) {
  const milesStr = deal.miles ? `${(deal.miles / 1000).toFixed(0)}k miles` : 'miles unknown';

  let kbbSection = '';
  if (deal.kbbData) {
    const vsFair = deal.price - deal.kbbData.fair;
    const vsGood = deal.price - deal.kbbData.good;
    kbbSection = `
<b>KBB Trade-in:</b>
  • Fair: $${deal.kbbData.fair.toLocaleString()}
  • Good: $${deal.kbbData.good.toLocaleString()}
<b>Deal Analysis:</b>
  • vs Fair: ${vsFair >= 0 ? '+' : ''}$${vsFair.toLocaleString()}
  • vs Good: ${vsGood >= 0 ? '+' : ''}$${vsGood.toLocaleString()}`;
  }

  const verdictEmoji = deal.verdict === 'strong' ? '🔥🔥' : '🔥';
  const verdictLabel = deal.verdict === 'strong' ? 'STRONG DEAL' : 'GOOD DEAL';

  const signalsStr = deal.signals.length > 0
    ? deal.signals.map(s => `  ✅ ${s}`).join('\n')
    : '  (none detected)';

  const flagsStr = deal.flags.length > 0
    ? deal.flags.map(f => `  ⚠️ ${f}`).join('\n')
    : '  ✅ Clean listing';

  const sourceTag = deal.sourceLabel ? ` [${deal.sourceLabel}]` : '';

  const text = `${verdictEmoji} <b>${verdictLabel} DETECTED</b>${sourceTag}

<b>Vehicle:</b> ${deal.title}
<b>Price:</b> $${deal.price.toLocaleString()}
<b>Mileage:</b> ${milesStr}
<b>Year:</b> ${deal.year}
${kbbSection}
<b>Verdict:</b> ${verdictLabel} (score: ${deal.score})

<b>Condition Signals:</b>
${signalsStr}

<b>Risk Check:</b>
${flagsStr}

🔗 <a href="${deal.url}">View Listing</a>`;

  // Send first photo with caption if available, otherwise text only
  if (deal.photos && deal.photos.length > 0) {
    await sendPhoto(deal.photos[0], text);
  } else {
    await sendMessage(text);
  }
}

// ─── Price drop alert ───────────────────────────────────────────────────────
async function sendPriceDropAlert(listing, newPrice, drop) {
  const text = `📉 <b>PRICE DROP</b>

<b>${listing.title}</b>
Was: $${listing.last_price || listing.lastPrice}
Now: <b>$${newPrice}</b>  (-$${drop})

🔗 <a href="${listing.url}">View Listing</a>`;

  await sendMessage(text);
}

// ─── Status / heartbeat ─────────────────────────────────────────────────────
async function sendStatus(text) {
  await sendMessage(`ℹ️ ${text}`, { disablePreview: true });
}

module.exports = { isConfigured, sendDealAlert, sendPriceDropAlert, sendStatus };