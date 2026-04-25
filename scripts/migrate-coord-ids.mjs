// One-time migration: rewrite each route file's `path` (and any
// per-leg paths) from positional node ids to coord-derived stable ids.
//
// Process:
//   1. Build the OLD positional graph (matching the current
//      buildRoadGraph behavior — MAIN_HIGHWAY filter, sorted by way id,
//      node ids = nodes.length at insertion time).
//   2. For each route file, look up each old node id's coord in the
//      old graph, then compute the NEW coord-based id (coordId).
//   3. Write the migrated file in place.
//
// After running this, switch buildRoadGraph in src to use coordId for
// node assignment. From then on, adding/removing roads from the filter
// will not invalidate any saved routes.

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const ROADS = resolve(ROOT, "public/roads.geojson");
const ROUTES_DIR = resolve(ROOT, "public/routes");

const MAIN_HIGHWAY = new Set([
  "trunk",
  "trunk_link",
  "primary",
  "primary_link",
  "secondary",
  "secondary_link",
  "tertiary",
  "tertiary_link",
  "unclassified",
]);

function coordKey(c) {
  return `${c[0].toFixed(7)},${c[1].toFixed(7)}`;
}

function coordId(c) {
  const lng = Math.round((c[0] + 180) * 1e5);
  const lat = Math.round((c[1] + 90) * 1e5);
  return lng * 2 ** 25 + lat;
}

function loadRoads() {
  const fc = JSON.parse(readFileSync(ROADS, "utf8"));
  return fc.features.map((f) => ({
    id: f.properties.id,
    name: f.properties.name,
    highway: f.properties.highway,
    oneway: f.properties.oneway,
    coordinates: f.geometry.coordinates,
  }));
}

// Replicates src/lib/roadGraph.ts buildRoadGraph node assignment.
function buildOldGraph(roads) {
  roads = roads.slice().sort((a, b) => a.id - b.id);
  const vertexCount = new Map();
  for (const w of roads) {
    const first = coordKey(w.coordinates[0]);
    const last = coordKey(w.coordinates[w.coordinates.length - 1]);
    vertexCount.set(first, (vertexCount.get(first) ?? 0) + 1);
    vertexCount.set(last, (vertexCount.get(last) ?? 0) + 1);
    for (let i = 1; i < w.coordinates.length - 1; i++) {
      const k = coordKey(w.coordinates[i]);
      vertexCount.set(k, (vertexCount.get(k) ?? 0) + 1);
    }
  }
  const nodeIndex = new Map();
  const nodes = [];
  function ensureNode(c) {
    const k = coordKey(c);
    const e = nodeIndex.get(k);
    if (e) return e;
    const node = { id: nodes.length, coord: c };
    nodeIndex.set(k, node);
    nodes.push(node);
    return node;
  }
  function isNodeVertex(c, isEndpoint) {
    if (isEndpoint) return true;
    return (vertexCount.get(coordKey(c)) ?? 0) >= 2;
  }
  for (const w of roads) {
    const coords = w.coordinates;
    let segStart = 0;
    for (let i = 1; i < coords.length; i++) {
      const isEnd = i === coords.length - 1;
      if (!isNodeVertex(coords[i], isEnd)) continue;
      const a = ensureNode(coords[segStart]);
      const b = ensureNode(coords[i]);
      if (a.id !== b.id) {
        // edges not needed for migration — only node id ↔ coord
      }
      segStart = i;
    }
  }
  return { nodes };
}

function migrateNodeIds(oldNodes, ids) {
  const out = [];
  for (const id of ids) {
    const node = oldNodes[id];
    if (!node) {
      throw new Error(`old node id ${id} not found in old graph`);
    }
    out.push(coordId(node.coord));
  }
  return out;
}

function main() {
  const roads = loadRoads();
  const main = roads.filter((r) => MAIN_HIGHWAY.has(r.highway ?? ""));
  const oldGraph = buildOldGraph(main);
  console.log(`Old graph: ${oldGraph.nodes.length} nodes`);

  const files = readdirSync(ROUTES_DIR).filter(
    (f) => f.endsWith(".json") && f !== "index.json"
  );
  for (const f of files) {
    const path = resolve(ROUTES_DIR, f);
    const data = JSON.parse(readFileSync(path, "utf8"));
    let changed = false;

    if (Array.isArray(data.path)) {
      const before = data.path.slice();
      data.path = migrateNodeIds(oldGraph.nodes, data.path);
      changed = changed || JSON.stringify(before) !== JSON.stringify(data.path);
    }
    if (data.legs) {
      for (const k of ["outbound", "return"]) {
        if (data.legs[k]?.path) {
          const before = data.legs[k].path.slice();
          data.legs[k].path = migrateNodeIds(oldGraph.nodes, data.legs[k].path);
          changed =
            changed ||
            JSON.stringify(before) !== JSON.stringify(data.legs[k].path);
        }
      }
    }

    if (changed) {
      writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
      console.log(`migrated ${f}`);
    } else {
      console.log(`unchanged ${f}`);
    }
  }
}

main();
