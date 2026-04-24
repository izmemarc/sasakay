// Snap a hand-drawn GeoJSON LineString (e.g. from geojson.io) to the OSM road
// network in public/roads.geojson, producing a list of ordered OSM way IDs
// and writing public/routes/<id>.json.
//
// Usage:
//   node scripts/snap-route.mjs <drawing.geojson> --id ld-01 --code LD-01 \
//     --name "Diretso Daraga–Legazpi" --color "#dc2626" --fare 13
//
// Algorithm:
//   - Densify the drawn LineString: insert extra points along each edge so
//     sampling is fine-grained (~20 m apart).
//   - For each sample point, find the closest OSM road segment within 60 m
//     (haversine). Record that way ID.
//   - Walk the sample points in order; collect unique way IDs preserving
//     order. If a way reappears after an interruption, treat it as a new
//     visit (a route can re-enter the same road).
//   - Write public/routes/<id>.json.

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

const args = process.argv.slice(2);
const drawingPath = resolve(repoRoot, args[0]);
function arg(flag, fallback) {
  const i = args.indexOf(flag);
  if (i < 0) return fallback;
  return args[i + 1];
}
const id = arg("--id");
const code = arg("--code", id?.toUpperCase());
const name = arg("--name", id);
const color = arg("--color", "#dc2626");
const fare = Number(arg("--fare", 13));
if (!id) {
  console.error("Usage: node snap-route.mjs <drawing.geojson> --id <id> [--code ...] [--name ...] [--color ...] [--fare ...]");
  process.exit(1);
}

const MAX_SNAP_M = 100;

const drawing = JSON.parse(readFileSync(drawingPath, "utf8"));
const feature =
  drawing.type === "FeatureCollection" ? drawing.features[0] : drawing;
const drawnCoords = feature.geometry.coordinates;

const roads = JSON.parse(
  readFileSync(resolve(repoRoot, "public", "roads.geojson"), "utf8")
);

function haversineM([lng1, lat1], [lng2, lat2]) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Distance from point p to segment ab, all in lng/lat. Returns meters via
// haversine applied to the foot of perpendicular in lng/lat space. Good
// enough for small extents (Legazpi-sized bbox).
function distPointToSegmentM(p, a, b) {
  const ax = a[0];
  const ay = a[1];
  const bx = b[0];
  const by = b[1];
  const px = p[0];
  const py = p[1];
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const fx = ax + t * dx;
  const fy = ay + t * dy;
  return haversineM(p, [fx, fy]);
}

// Build a spatial grid over road segments for fast lookup. Each grid cell
// holds the segment records (wayId + segment endpoints) that pass through it.
// Grid resolution: ~0.002 degrees ≈ 220 m.
const GRID = 0.002;
const grid = new Map();
function key(x, y) {
  return `${x},${y}`;
}
function cellOf(lng, lat) {
  return [Math.floor(lng / GRID), Math.floor(lat / GRID)];
}
for (const f of roads.features) {
  const wayId = f.properties.id;
  const c = f.geometry.coordinates;
  for (let i = 0; i < c.length - 1; i++) {
    const a = c[i];
    const b = c[i + 1];
    const [ax, ay] = cellOf(a[0], a[1]);
    const [bx, by] = cellOf(b[0], b[1]);
    const minX = Math.min(ax, bx);
    const maxX = Math.max(ax, bx);
    const minY = Math.min(ay, by);
    const maxY = Math.max(ay, by);
    for (let x = minX - 1; x <= maxX + 1; x++) {
      for (let y = minY - 1; y <= maxY + 1; y++) {
        const k = key(x, y);
        let arr = grid.get(k);
        if (!arr) {
          arr = [];
          grid.set(k, arr);
        }
        arr.push({ wayId, a, b });
      }
    }
  }
}

function snap(point) {
  const [cx, cy] = cellOf(point[0], point[1]);
  let best = null;
  for (let x = cx - 1; x <= cx + 1; x++) {
    for (let y = cy - 1; y <= cy + 1; y++) {
      const arr = grid.get(key(x, y));
      if (!arr) continue;
      for (const seg of arr) {
        const d = distPointToSegmentM(point, seg.a, seg.b);
        if (!best || d < best.d) best = { d, wayId: seg.wayId };
      }
    }
  }
  return best && best.d <= MAX_SNAP_M ? best.wayId : null;
}

// For each drawn point, find the nearest road. Keep the way ID only if it
// changed from the previous one (so we don't repeat ourselves on a single
// long stretch). That's it — no densify, no chain-fix, no fancy logic.
const wayIds = [];
let unmatched = 0;
console.log(`Checking ${drawnCoords.length} drawn points:`);
for (let i = 0; i < drawnCoords.length; i++) {
  const p = drawnCoords[i];
  const result = snap(p);
  if (result === null) {
    unmatched++;
    console.log(`  ${i + 1}. [${p[1].toFixed(4)},${p[0].toFixed(4)}]  no road within ${MAX_SNAP_M} m`);
    continue;
  }
  const w = wayMap.get(result);
  const name = w?.properties.name || `<${w?.properties.highway}>`;
  console.log(`  ${i + 1}. [${p[1].toFixed(4)},${p[0].toFixed(4)}]  → way ${result}  (${name})`);
  if (wayIds[wayIds.length - 1] !== result) wayIds.push(result);
}
console.log(
  `\nMatched ${drawnCoords.length - unmatched}/${drawnCoords.length} points → ${wayIds.length} way IDs (${new Set(wayIds).size} unique)`
);

const routeFile = { id, code, name, color, fare, ways: wayIds };
const outPath = resolve(repoRoot, "public", "routes", `${id}.json`);
writeFileSync(outPath, JSON.stringify(routeFile, null, 2));
console.log(`wrote ${outPath}`);

// Auto-update routes/index.json
const routesDir = resolve(repoRoot, "public", "routes");
const files = readdirSync(routesDir)
  .filter((f) => f.endsWith(".json") && f !== "index.json")
  .sort();
const indexPath = resolve(routesDir, "index.json");
writeFileSync(indexPath, JSON.stringify({ files }, null, 2));
console.log(`updated ${indexPath} (${files.length} files)`);
