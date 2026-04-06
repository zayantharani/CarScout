// ─── config.js ── Centralized search config ────────────────────────────────

const SEARCHES = [
  // ── Toyota sedans / hatchbacks ──
  { make: "toyota", model: "camry", label: "Toyota Camry" },
  { make: "toyota", model: "corolla", label: "Toyota Corolla" },
  { make: "toyota", model: "avalon", label: "Toyota Avalon" },
  { make: "toyota", model: "prius", label: "Toyota Prius" },
  { make: "toyota", model: "yaris", label: "Toyota Yaris" },
  // ── Toyota SUVs / crossovers ──
  { make: "toyota", model: "rav4",        label: "Toyota RAV4"        },
  { make: "toyota", model: "venza",       label: "Toyota Venza"       },
  { make: "toyota", model: "sequoia",     label: "Toyota Sequoia"     },
  { make: "toyota", model: "land cruiser",label: "Toyota Land Cruiser" },

  // ── Honda sedans / hatchbacks ──
  { make: "honda", model: "accord", label: "Honda Accord" },
  { make: "honda", model: "civic", label: "Honda Civic" },
  { make: "honda", model: "fit", label: "Honda Fit" },
  { make: "honda", model: "insight", label: "Honda Insight" },
  // ── Honda SUVs / crossovers ──
  { make: "honda", model: "cr-v",         label: "Honda CR-V"         },
  { make: "honda", model: "pilot",        label: "Honda Pilot"        },
  { make: "honda", model: "hr-v",         label: "Honda HR-V"         },
  // ── Honda trucks / vans ──
  { make: "honda", model: "odyssey",      label: "Honda Odyssey"      },
  { make: "honda", model: "ridgeline",    label: "Honda Ridgeline"    },

  // ── Mazda ──
  { make: "mazda", model: "mazda6",       label: "Mazda 6"            },
  { make: "mazda", model: "mazda3",       label: "Mazda 3"            },
  // ── Lexus ──
  { make: "lexus", model: "es",           label: "Lexus ES"           },
  { make: "lexus", model: "is",           label: "Lexus IS"           },
  { make: "lexus", model: "gs",           label: "Lexus GS"           },
  { make: "lexus", model: "ls",           label: "Lexus LS"           },
  { make: "lexus", model: "rx",           label: "Lexus RX"           },
  { make: "lexus", model: "gx",           label: "Lexus GX"           },
  // ── Acura ──
  { make: "acura", model: "tlx",          label: "Acura TLX"          },
  { make: "acura", model: "ilx",          label: "Acura ILX"          },
  { make: "acura", model: "tsx",          label: "Acura TSX"          },
  { make: "acura", model: "rdx",          label: "Acura RDX"          },
  // ── Buick ──
  { make: "buick", model: "lacrosse",     label: "Buick LaCrosse"     },
  { make: "buick", model: "regal",        label: "Buick Regal"        },
  // ── Subaru ──
  { make: "subaru", model: "outback",     label: "Subaru Outback"     },
  // ── Ford / Mercury ──
  { make: "ford",    model: "crown victoria", label: "Ford Crown Victoria" },
  { make: "mercury", model: "grand marquis",  label: "Mercury Grand Marquis" },
];

const FILTERS = {
  minYear: 2008,
  maxYear: 2019,
  minPrice: 2000, // floor to skip junk/scams
  maxPrice: 12500,
  maxMiles: 150000,
  zip: "75010", // Richardson, TX
  radius: 150, // miles
};

// ─── Craigslist search URL builder ──────────────────────────────────────────
function buildSearchUrl(search, page = 0) {
  const params = new URLSearchParams({
    query: `${search.make} ${search.model}`,
    purveyor: "owner", // ← private sellers only
    min_price: FILTERS.minPrice,
    max_price: FILTERS.maxPrice,
    min_auto_year: FILTERS.minYear, // ← server-side year filter (was missing)
    max_auto_year: FILTERS.maxYear,
    auto_title_status: "1", // clean title
    search_distance: FILTERS.radius,
    postal: FILTERS.zip,
    sort: "date",
  });
  const offset = page * 120;
  if (offset > 0) params.set("s", offset);
  return `https://dallas.craigslist.org/search/cto?${params.toString()}`;
}

// ─── Craigslist listing URL builder ─────────────────────────────────────────
function buildListingUrl(path) {
  if (path.startsWith("http")) return path;
  return `https://dallas.craigslist.org${path}`;
}

module.exports = { SEARCHES, FILTERS, buildSearchUrl, buildListingUrl };
