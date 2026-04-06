// ─── analyze.js ── Quality scoring & red flag detection ─────────────────────

// ─── Positive signals (things a private daily-driver seller would mention) ───
const POSITIVE_SIGNALS = [
  { re: /maintenance record|service record|service history|full history|carfax/i,
    label: 'Has service records', weight: 3 },
  { re: /single owner|one owner|1 owner|original owner/i,
    label: 'Single owner', weight: 3 },
  { re: /new tires?|recent tires?/i,
    label: 'New tires', weight: 2 },
  { re: /new brakes?|recent brakes?|brake pads?/i,
    label: 'New brakes', weight: 2 },
  { re: /oil change|recently serviced|just serviced|up to date/i,
    label: 'Recent service', weight: 1 },
  { re: /non.?smok|no smok/i,
    label: 'Non-smoker', weight: 1 },
  { re: /garage kept|garaged/i,
    label: 'Garage kept', weight: 2 },
  { re: /timing belt replaced|timing chain replaced|water pump replaced/i,
    label: 'Major maintenance done', weight: 3 },
  { re: /no accident|clean (?:car\s?)?fax|accident.?free/i,
    label: 'No accidents', weight: 2 },
  { re: /new battery/i,
    label: 'New battery', weight: 1 },
  { re: /transmission (?:serviced|flushed|fluid)/i,
    label: 'Trans serviced', weight: 2 },
];

// ─── Red flags ──────────────────────────────────────────────────────────────
const RED_FLAGS = [
  // Hard flags → auto-reject
  { re: /rebuilt\s*title|salvage\s*title|flood\s*title|lemon\s*title|bonded\s*title/i,
    label: 'Title concern', hard: true },
  { re: /(?:runs?\s*rough|needs?\s*work|project\s*car|not\s*running|doesn'?t\s*(?:run|start)|won'?t\s*(?:run|start))/i,
    label: 'Mechanical issue', hard: true },
  { re: /(?:total(?:ed|ly)|frame\s*damage|structural\s*damage|airbags?\s*deployed)/i,
    label: 'Major damage', hard: true },

  // Soft flags → reduce score
  { re: /dealer|auto\s*sales|motors?\s*llc|lot\s*price|we\s*finance|buy\s*here\s*pay/i,
    label: 'Possible dealer', hard: false },
  { re: /quick\s*sale|must\s*sell|moving\s*(?:sale|away)|divorce|emergency/i,
    label: 'Urgency language', hard: false },
  { re: /as.?is|no\s*warranty/i,
    label: 'Sold as-is', hard: false },
  { re: /check\s*engine|CEL\s*on|light\s*on/i,
    label: 'Warning light', hard: false },
  { re: /needs?\s*(?:tires?|brakes?|work|repair|fixing)/i,
    label: 'Needs repairs', hard: false },
];

// ─── Curbstoner / flipper detection ─────────────────────────────────────────
const FLIPPER_SIGNALS = [
  { re: /multiple\s*(?:cars?|vehicles?)\s*(?:available|for\s*sale)/i,
    label: 'Multiple cars listed' },
  { re: /stock\s*(?:photo|image|pic)/i,
    label: 'Stock photos' },
  { re: /call\s*or\s*text\s*only|no\s*(?:low\s*ball|lowball)/i,
    label: 'Generic seller language' },
];

/**
 * Analyze listing text for quality signals, red flags, and flipper indicators.
 */
function analyzeText(text) {
  const signals = POSITIVE_SIGNALS
    .filter(s => s.re.test(text))
    .map(s => ({ label: s.label, weight: s.weight }));

  const flags = RED_FLAGS
    .filter(s => s.re.test(text))
    .map(s => ({ label: s.label, hard: s.hard }));

  const flipperFlags = FLIPPER_SIGNALS
    .filter(s => s.re.test(text))
    .map(s => s.label);

  const hasHardFlag   = flags.some(f => f.hard);
  const hasFlipperFlag = flipperFlags.length > 0;

  // ── Score calculation ──
  // Positive signals contribute their weight
  const posScore = signals.reduce((sum, s) => sum + s.weight, 0);
  // Soft flags subtract 3 each
  const negScore = flags.filter(f => !f.hard).length * 3;
  // Description length bonus (detailed listings are better)
  const lengthBonus = text.length > 400 ? 3 : text.length > 200 ? 2 : text.length > 100 ? 1 : 0;

  const score = posScore - negScore + lengthBonus;

  return {
    signals:      signals.map(s => s.label),
    flags:        flags.map(f => f.label),
    flipperFlags,
    hasHardFlag,
    hasFlipperFlag,
    score,
  };
}

module.exports = { analyzeText };
