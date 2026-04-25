// Pulls the road network for Legazpi/Daraga/Camalig/Guinobatan from the
// Overpass API and writes it to public/roads.geojson.
//
// Re-run this any time you need fresher data:
//   node scripts/fetch-roads.mjs
//
// Bbox (south, west, north, east) deliberately wider than the app's view
// bounds so Camalig/Guinobatan routes are covered.

import { writeFileSync, mkdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = resolve(__dirname, "..", "public", "roads.geojson");
mkdirSync(dirname(outPath), { recursive: true });

const BBOX = [13.08, 123.50, 13.22, 123.80]; // south,west,north,east

const QUERY = `
[out:json][timeout:90];
(
  way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link)$"]
    (${BBOX[0]},${BBOX[1]},${BBOX[2]},${BBOX[3]});
);
out geom;
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

function toGeoJSON(overpass) {
  const features = [];
  for (const el of overpass.elements) {
    if (el.type !== "way" || !el.geometry) continue;
    features.push({
      type: "Feature",
      id: el.id,
      properties: {
        id: el.id,
        highway: el.tags?.highway ?? null,
        name: el.tags?.name ?? null,
        oneway: el.tags?.oneway ?? null,
        // junction=roundabout is needed so the editor can let you draw
        // any direction through a roundabout instead of forcing a long
        // way around (OSM tags roundabouts as one-way).
        junction: el.tags?.junction ?? null,
        ref: el.tags?.ref ?? null,
      },
      geometry: {
        type: "LineString",
        coordinates: el.geometry.map((p) => [p.lon, p.lat]),
      },
    });
  }
  return { type: "FeatureCollection", features };
}

const raw = await fetchOverpass();
const fc = toGeoJSON(raw);
writeFileSync(outPath, JSON.stringify(fc));
const kb = Math.round(statSync(outPath).size / 1024);
console.log(`wrote ${outPath} — ${fc.features.length} ways, ${kb} KB`);
