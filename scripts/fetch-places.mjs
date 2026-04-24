// Pulls points of interest (malls, schools, hospitals, churches, terminals,
// government buildings, public places) from OSM via Overpass for the Legazpi
// bbox, writes them to public/places.json.
//
// Re-run to refresh:
//   node scripts/fetch-places.mjs

import { writeFileSync, statSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = resolve(__dirname, "..", "public", "places.json");

const BBOX = [13.08, 123.50, 13.22, 123.80]; // south,west,north,east

const QUERY = `
[out:json][timeout:90];
(
  node["amenity"~"^(school|college|university|hospital|clinic|place_of_worship|townhall|courthouse|police|fire_station|library|marketplace|bus_station|ferry_terminal)$"](${BBOX[0]},${BBOX[1]},${BBOX[2]},${BBOX[3]});
  way["amenity"~"^(school|college|university|hospital|clinic|place_of_worship|townhall|courthouse|police|fire_station|library|marketplace|bus_station|ferry_terminal)$"](${BBOX[0]},${BBOX[1]},${BBOX[2]},${BBOX[3]});
  node["shop"="mall"](${BBOX[0]},${BBOX[1]},${BBOX[2]},${BBOX[3]});
  way["shop"="mall"](${BBOX[0]},${BBOX[1]},${BBOX[2]},${BBOX[3]});
  node["tourism"~"^(attraction|museum|hotel|viewpoint)$"](${BBOX[0]},${BBOX[1]},${BBOX[2]},${BBOX[3]});
  way["tourism"~"^(attraction|museum|hotel|viewpoint)$"](${BBOX[0]},${BBOX[1]},${BBOX[2]},${BBOX[3]});
  node["leisure"~"^(park|stadium|sports_centre)$"](${BBOX[0]},${BBOX[1]},${BBOX[2]},${BBOX[3]});
  way["leisure"~"^(park|stadium|sports_centre)$"](${BBOX[0]},${BBOX[1]},${BBOX[2]},${BBOX[3]});
  node["place"~"^(suburb|neighbourhood|quarter|village)$"](${BBOX[0]},${BBOX[1]},${BBOX[2]},${BBOX[3]});
);
out center tags;
`.trim();

const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.openstreetmap.fr/api/interpreter",
];

async function fetchOverpass() {
  let lastErr;
  for (const ep of ENDPOINTS) {
    try {
      console.log(`Querying ${ep} …`);
      const res = await fetch(ep, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent":
            "legazpi-jeepney-map/0.1 (https://github.com/izmemarc; contact: izmemarc@gmail.com)",
          Accept: "application/json",
        },
        body: new URLSearchParams({ data: QUERY }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      console.warn(`  failed: ${e.message}`);
      lastErr = e;
    }
  }
  throw lastErr ?? new Error("All Overpass endpoints failed");
}

function categoryFrom(tags) {
  if (tags.amenity) {
    if (
      tags.amenity === "school" ||
      tags.amenity === "college" ||
      tags.amenity === "university"
    )
      return "school";
    if (tags.amenity === "hospital" || tags.amenity === "clinic")
      return "hospital";
    if (tags.amenity === "place_of_worship") return "church";
    if (tags.amenity === "townhall") return "government";
    if (tags.amenity === "courthouse") return "government";
    if (tags.amenity === "police") return "government";
    if (tags.amenity === "fire_station") return "government";
    if (tags.amenity === "library") return "public";
    if (tags.amenity === "marketplace") return "market";
    if (tags.amenity === "bus_station" || tags.amenity === "ferry_terminal")
      return "terminal";
  }
  if (tags.shop === "mall") return "mall";
  if (tags.tourism) {
    if (tags.tourism === "attraction") return "landmark";
    if (tags.tourism === "museum") return "landmark";
    if (tags.tourism === "hotel") return "hotel";
    if (tags.tourism === "viewpoint") return "landmark";
  }
  if (tags.leisure) {
    if (tags.leisure === "park") return "park";
    if (tags.leisure === "stadium" || tags.leisure === "sports_centre")
      return "sports";
  }
  if (tags.place) return "barangay";
  return "place";
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

const raw = await fetchOverpass();
const places = [];
const seenIds = new Set();

for (const el of raw.elements) {
  const tags = el.tags || {};
  const name = tags.name || tags["name:en"] || tags["official_name"];
  if (!name) continue;

  const lng = el.type === "node" ? el.lon : el.center?.lon;
  const lat = el.type === "node" ? el.lat : el.center?.lat;
  if (lng == null || lat == null) continue;

  let id = slugify(name, el.id);
  let dedupeN = 1;
  while (seenIds.has(id)) {
    id = `${slugify(name, el.id)}-${dedupeN++}`;
  }
  seenIds.add(id);

  const aliases = [];
  if (tags.alt_name) aliases.push(...tags.alt_name.split(/;\s*/));
  if (tags.short_name) aliases.push(tags.short_name);
  if (tags.old_name) aliases.push(tags.old_name);

  places.push({
    id,
    name,
    aliases,
    category: categoryFrom(tags),
    coordinates: [lng, lat],
  });
}

// Sort: malls + government + schools first (most useful for jeepney users),
// then alphabetical within each bucket.
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
  public: 11,
  barangay: 12,
  place: 13,
};
places.sort((a, b) => {
  const oa = ORDER[a.category] ?? 99;
  const ob = ORDER[b.category] ?? 99;
  if (oa !== ob) return oa - ob;
  return a.name.localeCompare(b.name);
});

writeFileSync(outPath, JSON.stringify(places, null, 2));
const kb = Math.round(statSync(outPath).size / 1024);
console.log(`wrote ${outPath} — ${places.length} places, ${kb} KB`);

// Summary by category
const byCat = {};
for (const p of places) byCat[p.category] = (byCat[p.category] || 0) + 1;
console.log("\nBy category:");
for (const [c, n] of Object.entries(byCat).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${n.toString().padStart(4)}  ${c}`);
}
