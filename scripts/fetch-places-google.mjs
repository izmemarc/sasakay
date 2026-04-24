// Pulls POIs from Google Places API (New) for the Legazpi bbox, writes
// them to public/places.json (same schema as fetch-places.mjs).
//
// Test mode (one category, first page only):
//   node scripts/fetch-places-google.mjs --test
//
// Full run:
//   node scripts/fetch-places-google.mjs
//
// Requires a .env file at the repo root with:
//   GOOGLE_PLACES_API_KEY=AIzaSy...

import { writeFileSync, statSync, readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const outPath = resolve(repoRoot, "public", "places.json");
const envPath = resolve(repoRoot, ".env");

function loadEnv() {
  if (!existsSync(envPath)) return {};
  const raw = readFileSync(envPath, "utf8");
  const out = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
    if (!m) continue;
    let val = m[2];
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[m[1]] = val;
  }
  return out;
}

const env = loadEnv();
const API_KEY = env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_PLACES_API_KEY;
if (!API_KEY) {
  console.error("Missing GOOGLE_PLACES_API_KEY in .env or environment.");
  process.exit(1);
}

const TEST_MODE = process.argv.includes("--test");

// Legazpi center + radius that covers the bbox we use elsewhere
// (13.08..13.22, 123.50..123.80). Nearby Search maxes out at 50km radius;
// we use ~15km to stay tight and avoid excess results outside the city.
const CENTER = { latitude: 13.15, longitude: 123.74 };
const RADIUS_M = 15000;

// Google Places (New) uses "includedPrimaryTypes". Map each of our
// categories to a set of Google types. See:
// https://developers.google.com/maps/documentation/places/web-service/place-types
const CATEGORY_QUERIES = [
  {
    category: "mall",
    types: ["shopping_mall", "supermarket", "department_store"],
  },
  { category: "terminal", types: ["bus_station", "transit_station"] },
  {
    category: "government",
    types: ["city_hall", "courthouse", "police", "fire_station", "embassy"],
  },
  { category: "hospital", types: ["hospital"] },
  {
    category: "school",
    types: ["school", "university", "primary_school", "secondary_school"],
  },
  { category: "church", types: ["church", "mosque", "hindu_temple"] },
  { category: "landmark", types: ["tourist_attraction", "museum"] },
  { category: "market", types: ["market"] },
  { category: "park", types: ["park"] },
  { category: "sports", types: ["stadium"] },
  { category: "hotel", types: ["lodging", "hotel"] },
  {
    category: "food",
    types: ["restaurant", "fast_food_restaurant", "meal_takeaway"],
  },
  { category: "cafe", types: ["cafe", "coffee_shop", "bakery"] },
  { category: "bank", types: ["bank", "atm"] },
  { category: "gas", types: ["gas_station"] },
  {
    category: "store",
    types: ["convenience_store", "grocery_store", "pharmacy"],
  },
];

const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.location",
  "places.primaryType",
  "places.primaryTypeDisplayName",
  "places.types",
  "places.shortFormattedAddress",
  "places.formattedAddress",
  "places.addressComponents",
  "places.businessStatus",
].join(",");

async function searchNearby(types) {
  const body = {
    includedTypes: types,
    maxResultCount: 20,
    locationRestriction: {
      circle: { center: CENTER, radius: RADIUS_M },
    },
  };
  const res = await fetch(
    "https://places.googleapis.com/v1/places:searchNearby",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": API_KEY,
        "X-Goog-FieldMask": FIELD_MASK,
      },
      body: JSON.stringify(body),
    }
  );
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 400)}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON response: ${text.slice(0, 400)}`);
  }
}

function slugify(s, id) {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 50) || `p-${id}`
  );
}

/** Pick the best short branch label from Google's addressComponents.
 *  Priority: sublocality (barangay) → neighborhood → route (street) →
 *  administrative_area_level_3. Falls back to the first line of the
 *  short address. */
function deriveBranch(place) {
  const comps = place.addressComponents || [];
  function find(...types) {
    for (const c of comps) {
      for (const t of types) if ((c.types || []).includes(t)) return c;
    }
    return null;
  }
  const sub = find("sublocality_level_1", "sublocality");
  if (sub) return sub.shortText || sub.longText;
  const hood = find("neighborhood");
  if (hood) return hood.shortText || hood.longText;
  const route = find("route");
  if (route) return route.shortText || route.longText;
  const admin3 = find("administrative_area_level_3");
  if (admin3) return admin3.shortText || admin3.longText;
  if (place.shortFormattedAddress) {
    return place.shortFormattedAddress.split(",")[0].trim();
  }
  return null;
}

async function main() {
  const queries = TEST_MODE ? CATEGORY_QUERIES.slice(0, 1) : CATEGORY_QUERIES;
  console.log(
    `Mode: ${TEST_MODE ? "TEST (1 category)" : "FULL"} — ${queries.length} categor${queries.length === 1 ? "y" : "ies"}`
  );

  const byPlaceId = new Map();
  for (const q of queries) {
    console.log(`Querying [${q.category}] types=${q.types.join(",")} …`);
    try {
      const data = await searchNearby(q.types);
      const places = data.places || [];
      console.log(`  → ${places.length} results`);
      for (const p of places) {
        if (!p.id || byPlaceId.has(p.id)) continue;
        byPlaceId.set(p.id, { ...p, _category: q.category });
      }
    } catch (e) {
      console.warn(`  ✗ ${e.message}`);
    }
  }

  const seenSlugs = new Set();
  const out = [];
  // First pass: count how many share each name within a category so we
  // only emit `branch` when it's actually useful to disambiguate.
  const nameCount = new Map();
  for (const p of byPlaceId.values()) {
    const key = `${p._category}|${p.displayName?.text ?? ""}`;
    nameCount.set(key, (nameCount.get(key) ?? 0) + 1);
  }

  for (const p of byPlaceId.values()) {
    const name = p.displayName?.text;
    const lat = p.location?.latitude;
    const lng = p.location?.longitude;
    if (!name || lat == null || lng == null) continue;

    const key = `${p._category}|${name}`;
    const hasDuplicateName = (nameCount.get(key) ?? 0) > 1;

    let id = slugify(name, p.id);
    let n = 1;
    const base = id;
    while (seenSlugs.has(id)) id = `${base}-${n++}`;
    seenSlugs.add(id);

    const address = p.shortFormattedAddress || p.formattedAddress || null;
    const branch = hasDuplicateName ? deriveBranch(p) : null;

    const aliases = [];
    if (address) aliases.push(address);
    if (branch) aliases.push(branch);

    const entry = {
      id,
      name,
      aliases,
      category: p._category,
      coordinates: [lng, lat],
    };
    if (branch) entry.branch = branch;
    if (address) entry.address = address;
    out.push(entry);
  }

  const ORDER = {
    mall: 0,
    terminal: 1,
    government: 2,
    hospital: 3,
    school: 4,
    church: 5,
    landmark: 6,
    market: 7,
    park: 8,
    sports: 9,
    hotel: 10,
    food: 11,
    cafe: 12,
    bank: 13,
    gas: 14,
    store: 15,
  };
  out.sort((a, b) => {
    const oa = ORDER[a.category] ?? 99;
    const ob = ORDER[b.category] ?? 99;
    if (oa !== ob) return oa - ob;
    return a.name.localeCompare(b.name);
  });

  if (TEST_MODE) {
    console.log(`\nTest results: ${out.length} places`);
    for (const p of out.slice(0, 10)) {
      console.log(
        `  ${p.category.padEnd(10)} ${p.name}  (${p.coordinates[1].toFixed(4)}, ${p.coordinates[0].toFixed(4)})`
      );
    }
    console.log(
      "\nNot writing places.json in test mode. Re-run without --test to write."
    );
    return;
  }

  writeFileSync(outPath, JSON.stringify(out, null, 2));
  const kb = Math.round(statSync(outPath).size / 1024);
  console.log(`\nwrote ${outPath} — ${out.length} places, ${kb} KB`);

  const byCat = {};
  for (const p of out) byCat[p.category] = (byCat[p.category] || 0) + 1;
  console.log("\nBy category:");
  for (const [c, n] of Object.entries(byCat).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${n.toString().padStart(4)}  ${c}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
