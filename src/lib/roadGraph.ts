import type { RoadWay } from "./loadRoads";
import type { WalkInstruction } from "../types";

type LngLat = [number, number];

type Bearing = WalkInstruction["bearing"];

function bearingDeg(a: LngLat, b: LngLat): number {
  // Compass bearing in degrees, 0=N going clockwise. Approximate but
  // adequate at the small distances walking instructions cover.
  const toRad = (d: number) => (d * Math.PI) / 180;
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const dLng = toRad(b[0] - a[0]);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  const deg = (Math.atan2(y, x) * 180) / Math.PI;
  return (deg + 360) % 360;
}

function bearingToCompass(deg: number): Bearing {
  // 8-wedge compass. Wedge 0 ("N") covers [-22.5, 22.5).
  const idx = Math.round(deg / 45) % 8;
  return (["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const)[idx];
}

function classifyTurn(
  prevBearing: number,
  nextBearing: number
): "left" | "right" | "straight" {
  let diff = nextBearing - prevBearing;
  while (diff > 180) diff -= 360;
  while (diff < -180) diff += 360;
  if (diff > 30) return "right";
  if (diff < -30) return "left";
  return "straight";
}

export interface GraphNode {
  id: number;
  coord: LngLat;
}

export interface GraphEdge {
  id: number;
  wayId: number;
  wayName: string | null;
  /** Node id of the edge's "native-forward" start — the vertex that
   *  comes first in the underlying OSM way's coordinate list. */
  a: number;
  b: number;
  coordinates: LngLat[];
  length: number;
  /** "yes" = only traversable a → b, "-1" = only b → a, null = both. */
  oneway: "yes" | "-1" | null;
}

export interface RoadGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** nodeId → list of {edgeId, otherNode, forward} where forward=true
   *  means traversal follows edge.a → edge.b (legal), false = reverse. */
  adjacency: Map<number, AdjacencyEntry[]>;
  nodeIndex: Map<string, GraphNode>;
  /** id → node lookup. With coord-derived ids, ids are sparse so the
   *  `nodes[]` array can no longer be indexed by id directly. */
  nodesById: Map<number, GraphNode>;
}

export interface AdjacencyEntry {
  edgeId: number;
  otherNode: number;
  /** true = this traversal is edge.a → edge.b */
  forward: boolean;
}

function coordKey(c: LngLat): string {
  return `${c[0].toFixed(7)},${c[1].toFixed(7)}`;
}

/** Coord-derived stable node id. Same lng/lat always maps to the same
 *  integer id regardless of which roads are loaded or in what order.
 *  This means saved route node-id paths stay valid when the road
 *  filter changes (e.g. when adding a new street like Vinzons). */
function coordId(c: LngLat): number {
  const lng = Math.round((c[0] + 180) * 1e5); // ≤25 bits
  const lat = Math.round((c[1] + 90) * 1e5); // ≤25 bits
  return lng * 2 ** 25 + lat;
}

function haversineM(a: LngLat, b: LngLat): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function polylineLength(coords: LngLat[]): number {
  let t = 0;
  for (let i = 1; i < coords.length; i++) t += haversineM(coords[i - 1], coords[i]);
  return t;
}

function normalizeOneway(raw: string | null): "yes" | "-1" | null {
  if (raw === "yes" || raw === "true" || raw === "1") return "yes";
  if (raw === "-1" || raw === "reverse") return "-1";
  return null;
}

export function buildRoadGraph(roads: RoadWay[]): RoadGraph {
  // Sort by OSM way id so the graph build is deterministic across
  // input orderings. (This is what the working state used when ddl
  // was last verified — keep it for migration consistency.)
  roads = roads.slice().sort((a, b) => a.id - b.id);
  const vertexCount = new Map<string, number>();
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

  const nodeIndex = new Map<string, GraphNode>();
  const nodes: GraphNode[] = [];
  function ensureNode(c: LngLat): GraphNode {
    const k = coordKey(c);
    const existing = nodeIndex.get(k);
    if (existing) return existing;
    const node: GraphNode = { id: coordId(c), coord: c };
    nodeIndex.set(k, node);
    nodes.push(node);
    return node;
  }

  function isNodeVertex(c: LngLat, isEndpoint: boolean): boolean {
    if (isEndpoint) return true;
    return (vertexCount.get(coordKey(c)) ?? 0) >= 2;
  }

  const edges: GraphEdge[] = [];
  const adjacency = new Map<number, AdjacencyEntry[]>();

  function addAdj(nodeId: number, entry: AdjacencyEntry) {
    const list = adjacency.get(nodeId) ?? [];
    list.push(entry);
    adjacency.set(nodeId, list);
  }

  for (const w of roads) {
    const coords = w.coordinates;
    // Roundabouts are tagged one-way in OSM (they physically are), but
    // for jeepney route drawing the editor should let you enter and
    // leave from any direction. Treat roundabout segments as two-way.
    const oneway =
      w.junction === "roundabout" ? null : normalizeOneway(w.oneway);
    let segStart = 0;
    for (let i = 1; i < coords.length; i++) {
      const isEnd = i === coords.length - 1;
      if (!isNodeVertex(coords[i], isEnd)) continue;
      const aNode = ensureNode(coords[segStart]);
      const bNode = ensureNode(coords[i]);
      if (aNode.id !== bNode.id) {
        const edgeCoords = coords.slice(segStart, i + 1);
        const edge: GraphEdge = {
          id: edges.length,
          wayId: w.id,
          wayName: w.name,
          a: aNode.id,
          b: bNode.id,
          coordinates: edgeCoords,
          length: polylineLength(edgeCoords),
          oneway,
        };
        edges.push(edge);
        // a → b legal unless oneway is "-1"
        if (oneway !== "-1") {
          addAdj(aNode.id, {
            edgeId: edge.id,
            otherNode: bNode.id,
            forward: true,
          });
        }
        // b → a legal unless oneway is "yes"
        if (oneway !== "yes") {
          addAdj(bNode.id, {
            edgeId: edge.id,
            otherNode: aNode.id,
            forward: false,
          });
        }
      }
      segStart = i;
    }
  }

  const nodesById = new Map<number, GraphNode>();
  for (const n of nodes) nodesById.set(n.id, n);
  return { nodes, edges, adjacency, nodeIndex, nodesById };
}

export interface PathStep {
  edgeId: number;
  /** true = traversed a → b in the edge's native orientation */
  forward: boolean;
}

// Binary min-heap keyed on (priority, value). Stale entries (where the
// stored priority no longer matches `dist[node]`) are filtered at pop
// time — this is the standard "decrease-key by reinsertion" trick that
// keeps the heap simple while preserving Dijkstra's correctness.
class MinHeap {
  private heap: { p: number; v: number }[] = [];
  push(p: number, v: number) {
    const h = this.heap;
    h.push({ p, v });
    let i = h.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (h[parent].p <= h[i].p) break;
      const tmp = h[parent];
      h[parent] = h[i];
      h[i] = tmp;
      i = parent;
    }
  }
  pop(): { p: number; v: number } | undefined {
    const h = this.heap;
    if (h.length === 0) return undefined;
    const top = h[0];
    const last = h.pop()!;
    if (h.length > 0) {
      h[0] = last;
      let i = 0;
      const n = h.length;
      while (true) {
        const l = i * 2 + 1;
        const r = l + 1;
        let smallest = i;
        if (l < n && h[l].p < h[smallest].p) smallest = l;
        if (r < n && h[r].p < h[smallest].p) smallest = r;
        if (smallest === i) break;
        const tmp = h[smallest];
        h[smallest] = h[i];
        h[i] = tmp;
        i = smallest;
      }
    }
    return top;
  }
  get size() {
    return this.heap.length;
  }
}

/** Shortest road-distance path between two nodes, respecting oneway. */
export function shortestPath(
  graph: RoadGraph,
  fromNodeId: number,
  toNodeId: number
): PathStep[] | null {
  if (fromNodeId === toNodeId) return [];
  const dist = new Map<number, number>();
  const prev = new Map<
    number,
    { nodeId: number; edgeId: number; forward: boolean }
  >();
  dist.set(fromNodeId, 0);
  const visited = new Set<number>();
  const heap = new MinHeap();
  heap.push(0, fromNodeId);

  while (heap.size > 0) {
    const top = heap.pop()!;
    const current = top.v;
    if (visited.has(current)) continue;
    visited.add(current);
    const currentDist = top.p;
    if (current === toNodeId) break;
    const adj = graph.adjacency.get(current) ?? [];
    for (const ent of adj) {
      if (visited.has(ent.otherNode)) continue;
      const edge = graph.edges[ent.edgeId];
      const alt = currentDist + edge.length;
      if (alt < (dist.get(ent.otherNode) ?? Infinity)) {
        dist.set(ent.otherNode, alt);
        prev.set(ent.otherNode, {
          nodeId: current,
          edgeId: ent.edgeId,
          forward: ent.forward,
        });
        heap.push(alt, ent.otherNode);
      }
    }
  }

  if (!prev.has(toNodeId)) return null;
  const steps: PathStep[] = [];
  let cursor = toNodeId;
  while (cursor !== fromNodeId) {
    const p = prev.get(cursor);
    if (!p) return null;
    steps.push({ edgeId: p.edgeId, forward: p.forward });
    cursor = p.nodeId;
  }
  steps.reverse();
  return steps;
}

/** Single-source Dijkstra: returns shortest road distance (meters)
 *  from `fromNodeId` to every reachable node. Use when you want to
 *  query many targets from the same source — one run amortizes. */
export function shortestDistancesFrom(
  graph: RoadGraph,
  fromNodeId: number
): Map<number, number> {
  const dist = new Map<number, number>();
  dist.set(fromNodeId, 0);
  const visited = new Set<number>();
  const heap = new MinHeap();
  heap.push(0, fromNodeId);
  while (heap.size > 0) {
    const top = heap.pop()!;
    const current = top.v;
    if (visited.has(current)) continue;
    visited.add(current);
    const currentDist = top.p;
    const adj = graph.adjacency.get(current) ?? [];
    for (const ent of adj) {
      if (visited.has(ent.otherNode)) continue;
      const edge = graph.edges[ent.edgeId];
      const alt = currentDist + edge.length;
      if (alt < (dist.get(ent.otherNode) ?? Infinity)) {
        dist.set(ent.otherNode, alt);
        heap.push(alt, ent.otherNode);
      }
    }
  }
  return dist;
}

/** Grid-cell size in degrees (~1.1km at equator — tight enough that
 *  most queries scan 1–9 cells, coarse enough that memory stays small). */
const GRID_CELL = 0.01;

interface NodeGrid {
  cells: Map<string, GraphNode[]>;
}

const nodeGrids = new WeakMap<RoadGraph, NodeGrid>();

function getNodeGrid(graph: RoadGraph): NodeGrid {
  const existing = nodeGrids.get(graph);
  if (existing) return existing;
  const cells = new Map<string, GraphNode[]>();
  for (const n of graph.nodes) {
    const cx = Math.floor(n.coord[0] / GRID_CELL);
    const cy = Math.floor(n.coord[1] / GRID_CELL);
    const key = `${cx},${cy}`;
    const list = cells.get(key);
    if (list) list.push(n);
    else cells.set(key, [n]);
  }
  const grid = { cells };
  nodeGrids.set(graph, grid);
  return grid;
}

interface EdgeGrid {
  // edge ids that touch each cell — an edge's polyline can cross many
  // cells, so we register it in every cell its segments traverse.
  cells: Map<string, number[]>;
}

const edgeGrids = new WeakMap<RoadGraph, EdgeGrid>();

function getEdgeGrid(graph: RoadGraph): EdgeGrid {
  const existing = edgeGrids.get(graph);
  if (existing) return existing;
  const cells = new Map<string, number[]>();
  function add(key: string, edgeId: number) {
    const list = cells.get(key);
    if (list) {
      if (list[list.length - 1] !== edgeId) list.push(edgeId);
    } else cells.set(key, [edgeId]);
  }
  for (const edge of graph.edges) {
    for (let i = 0; i < edge.coordinates.length; i++) {
      const c = edge.coordinates[i];
      const cx = Math.floor(c[0] / GRID_CELL);
      const cy = Math.floor(c[1] / GRID_CELL);
      add(`${cx},${cy}`, edge.id);
    }
  }
  const grid = { cells };
  edgeGrids.set(graph, grid);
  return grid;
}

/** Project `pt` onto a single segment a→b, returning the foot of
 *  perpendicular, the parameter t∈[0,1], and the perpendicular distance
 *  in meters. Lng/lat space is fine at the small scale we operate at. */
function projectOnSegment(
  pt: LngLat,
  a: LngLat,
  b: LngLat
): { coord: LngLat; t: number; distMeters: number } {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dy) / len2;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  const coord: LngLat = [a[0] + dx * t, a[1] + dy * t];
  return { coord, t, distMeters: haversineM(coord, pt) };
}

export interface EdgeProjection {
  edgeId: number;
  /** Foot of perpendicular on the edge polyline. */
  coord: LngLat;
  /** Along-edge distance in meters from edge.a (the "native-forward" end). */
  positionMeters: number;
  /** Perpendicular distance from `pt` to `coord`. */
  distMeters: number;
}

/** Closest road point to `pt`. Snaps to a point ON the road polyline,
 *  not to the nearest junction. This is the right primitive when you
 *  want to start a walk from where the user actually is rather than
 *  forcing them to a junction that may be in the wrong direction. */
export function nearestPointOnGraph(
  graph: RoadGraph,
  pt: LngLat,
  maxMeters = 200
): EdgeProjection | null {
  const grid = getEdgeGrid(graph);
  const cx = Math.floor(pt[0] / GRID_CELL);
  const cy = Math.floor(pt[1] / GRID_CELL);
  const rings = Math.max(1, Math.ceil(maxMeters / 1000));
  // Collect candidate edges from the cell + neighbors. An edge can
  // appear in multiple cells; dedupe by id.
  const seen = new Set<number>();
  let best: EdgeProjection | null = null;
  let bestDist = maxMeters;
  for (let dx = -rings; dx <= rings; dx++) {
    for (let dy = -rings; dy <= rings; dy++) {
      const list = grid.cells.get(`${cx + dx},${cy + dy}`);
      if (!list) continue;
      for (const edgeId of list) {
        if (seen.has(edgeId)) continue;
        seen.add(edgeId);
        const edge = graph.edges[edgeId];
        // Walk segments of this edge, tracking cumulative meters so we
        // can report a position-along-edge in the result.
        let cursor = 0;
        for (let i = 1; i < edge.coordinates.length; i++) {
          const a = edge.coordinates[i - 1];
          const b = edge.coordinates[i];
          const segLen = haversineM(a, b);
          const proj = projectOnSegment(pt, a, b);
          if (proj.distMeters < bestDist) {
            bestDist = proj.distMeters;
            best = {
              edgeId,
              coord: proj.coord,
              positionMeters: cursor + proj.t * segLen,
              distMeters: proj.distMeters,
            };
          }
          cursor += segLen;
        }
      }
    }
  }
  return best;
}

/** Nearest graph node to a point. Uses a spatial grid so cost is
 *  roughly O(nodes-per-cell) rather than O(|nodes|). */
export function nearestNode(
  graph: RoadGraph,
  pt: LngLat,
  maxMeters = 200
): GraphNode | null {
  const grid = getNodeGrid(graph);
  const cx = Math.floor(pt[0] / GRID_CELL);
  const cy = Math.floor(pt[1] / GRID_CELL);
  // Scan the cell plus neighbors until we've covered at least `maxMeters`.
  // At latitude ~13° one degree-lng ≈ 108km, one degree-lat ≈ 111km.
  // GRID_CELL=0.01 → ~1100m. A radius of `maxMeters` needs ceil(max/1100)
  // rings of neighbor cells.
  const rings = Math.max(1, Math.ceil(maxMeters / 1000));
  let best: GraphNode | null = null;
  let bestDist = maxMeters;
  for (let dx = -rings; dx <= rings; dx++) {
    for (let dy = -rings; dy <= rings; dy++) {
      const list = grid.cells.get(`${cx + dx},${cy + dy}`);
      if (!list) continue;
      for (const n of list) {
        const d = haversineM(n.coord, pt);
        if (d < bestDist) {
          bestDist = d;
          best = n;
        }
      }
    }
  }
  return best;
}

/** Like nearestNode, but prefers nodes that don't force the walker to
 *  backtrack away from `toward`. Score = (node→from) + (node→toward).
 *  Only considers nodes within `maxMeters` of `fromPt`. */
export function nearestNodeTowards(
  graph: RoadGraph,
  fromPt: LngLat,
  toward: LngLat,
  maxMeters = 200
): GraphNode | null {
  let best: GraphNode | null = null;
  let bestScore = Infinity;
  for (const n of graph.nodes) {
    const d = haversineM(n.coord, fromPt);
    if (d > maxMeters) continue;
    const score = d + haversineM(n.coord, toward);
    if (score < bestScore) {
      bestScore = score;
      best = n;
    }
  }
  return best;
}

/** Expand a node-path into the full coordinate polyline. Each consecutive
 *  pair of nodes is resolved to the SHORTEST legal road edge between them
 *  (Dijkstra). Works even if the user's clicks are far apart — the result
 *  always follows real streets. */
export function nodesToPath(
  graph: RoadGraph,
  nodeIds: number[]
): PathStep[] | null {
  if (nodeIds.length < 2) return [];
  const out: PathStep[] = [];
  for (let i = 1; i < nodeIds.length; i++) {
    const seg = shortestPath(graph, nodeIds[i - 1], nodeIds[i]);
    if (!seg) return null;
    out.push(...seg);
  }
  return out;
}

/** Render a list of path steps into a flat coordinate polyline. */
export function pathToCoordinates(
  graph: RoadGraph,
  steps: PathStep[]
): LngLat[] {
  const out: LngLat[] = [];
  for (let i = 0; i < steps.length; i++) {
    const edge = graph.edges[steps[i].edgeId];
    const coords = steps[i].forward
      ? edge.coordinates
      : edge.coordinates.slice().reverse();
    if (i === 0) out.push(...coords);
    else out.push(...coords.slice(1));
  }
  return out;
}

/** Build a graph from the full road network, treating every edge as
 *  bidirectional — pedestrians walk either way on all streets. */
export function buildWalkGraph(roads: RoadWay[]): RoadGraph {
  // Forcibly clear oneway so buildRoadGraph wires both directions.
  const flattened: RoadWay[] = roads.map((r) => ({ ...r, oneway: null }));
  return buildRoadGraph(flattened);
}

/** Group consecutive PathSteps by street name into walking
 *  instructions, classifying transitions as left/right/straight by the
 *  bearing change at each junction. */
function buildInstructions(
  graph: RoadGraph,
  steps: PathStep[]
): WalkInstruction[] {
  if (steps.length === 0) return [];
  // Resolve each step to a (name, length, startCoord, endCoord) tuple.
  type Seg = {
    name: string | null;
    meters: number;
    start: LngLat;
    end: LngLat;
  };
  const segs: Seg[] = steps.map((s) => {
    const edge = graph.edges[s.edgeId];
    const coords = s.forward
      ? edge.coordinates
      : edge.coordinates.slice().reverse();
    return {
      name: edge.wayName,
      meters: edge.length,
      start: coords[0],
      end: coords[coords.length - 1],
    };
  });

  // Group consecutive segs that share a street name. Unnamed segments
  // join whatever named group they sit between (or stand alone).
  const out: WalkInstruction[] = [];
  let i = 0;
  while (i < segs.length) {
    const groupName = segs[i].name;
    let j = i;
    let meters = 0;
    while (j < segs.length && segs[j].name === groupName) {
      meters += segs[j].meters;
      j++;
    }
    const first = segs[i];
    const last = segs[j - 1];
    const groupBearing = bearingDeg(first.start, last.end);
    let turn: WalkInstruction["turn"];
    if (out.length === 0) {
      turn = "start";
    } else {
      const prev = segs[i - 1];
      const prevBearing = bearingDeg(prev.start, prev.end);
      turn = classifyTurn(prevBearing, groupBearing);
    }
    out.push({
      turn,
      street: groupName,
      meters,
      bearing: bearingToCompass(groupBearing),
    });
    i = j;
  }
  // Mark the last instruction as "arrive" so the UI can word it as
  // "Arrive at destination" rather than another street segment.
  if (out.length > 0) {
    const tail = out[out.length - 1];
    out[out.length - 1] = { ...tail, turn: "arrive" };
  }
  return out;
}

/** Slice an edge's polyline from `fromMeters` to `toMeters` along the
 *  edge (measured from edge.coordinates[0]). Returns the coords in
 *  natural traversal order — if toMeters > fromMeters, output goes
 *  forward; otherwise reversed. */
function sliceEdge(
  edge: GraphEdge,
  fromMeters: number,
  toMeters: number
): { coordinates: LngLat[]; meters: number } {
  const reverse = toMeters < fromMeters;
  const lo = reverse ? toMeters : fromMeters;
  const hi = reverse ? fromMeters : toMeters;
  const out: LngLat[] = [];
  let cursor = 0;
  let pushed = false;
  for (let i = 1; i < edge.coordinates.length; i++) {
    const a = edge.coordinates[i - 1];
    const b = edge.coordinates[i];
    const segLen = haversineM(a, b);
    const segStart = cursor;
    const segEnd = cursor + segLen;
    if (!pushed && segEnd >= lo) {
      const t = segLen === 0 ? 0 : (lo - segStart) / segLen;
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      pushed = true;
      if (segEnd >= hi) {
        const tEnd = segLen === 0 ? 0 : (hi - segStart) / segLen;
        out.push([a[0] + (b[0] - a[0]) * tEnd, a[1] + (b[1] - a[1]) * tEnd]);
        break;
      }
      out.push(b);
      cursor = segEnd;
      continue;
    }
    if (pushed) {
      if (segEnd >= hi) {
        const t = segLen === 0 ? 0 : (hi - segStart) / segLen;
        out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
        break;
      }
      out.push(b);
    }
    cursor = segEnd;
  }
  if (reverse) out.reverse();
  return { coordinates: out, meters: hi - lo };
}

/** Return a road-following polyline from `fromPt` to `toPt`. Snaps each
 *  endpoint to the closest point on the closest road edge (not just to
 *  the nearest junction node), so walks start in the right direction
 *  even when the user is mid-block. */
export function walkPathCoordinates(
  graph: RoadGraph,
  fromPt: LngLat,
  toPt: LngLat
): {
  coordinates: LngLat[];
  meters: number;
  instructions?: WalkInstruction[];
} {
  const directDist = haversineM(fromPt, toPt);
  if (directDist < 40) {
    return { coordinates: [fromPt, toPt], meters: directDist };
  }
  const projFrom = nearestPointOnGraph(graph, fromPt, 500);
  const projTo = nearestPointOnGraph(graph, toPt, 500);
  if (!projFrom || !projTo) {
    return { coordinates: [fromPt, toPt], meters: directDist };
  }
  const STUB_M = 15;
  const stubFrom = projFrom.distMeters;
  const stubTo = projTo.distMeters;

  // Same edge: just slice between the two projections — no junction
  // visit needed. Also avoids spurious turn instructions.
  if (projFrom.edgeId === projTo.edgeId) {
    const edge = graph.edges[projFrom.edgeId];
    const slice = sliceEdge(
      edge,
      projFrom.positionMeters,
      projTo.positionMeters
    );
    const meters = stubFrom + slice.meters + stubTo;
    const coords: LngLat[] = [];
    if (stubFrom > STUB_M) coords.push(fromPt);
    coords.push(...slice.coordinates);
    if (stubTo > STUB_M) coords.push(toPt);
    return { coordinates: coords, meters };
  }

  const fromEdge = graph.edges[projFrom.edgeId];
  const toEdge = graph.edges[projTo.edgeId];
  // Both endpoints of the fromEdge are valid entries; both endpoints of
  // toEdge are valid exits. Run a Dijkstra from each fromEdge endpoint
  // and pick the (entry, exit) pair with the smallest total walk. The
  // geographic-proximity heuristic was wrong on networks with rivers /
  // dead ends — the closer endpoint can be unreachable.
  const fromEntries: { nodeId: number; alongMeters: number }[] = [
    { nodeId: fromEdge.a, alongMeters: projFrom.positionMeters },
    { nodeId: fromEdge.b, alongMeters: fromEdge.length - projFrom.positionMeters },
  ];
  const toEntries: { nodeId: number; alongMeters: number }[] = [
    { nodeId: toEdge.a, alongMeters: projTo.positionMeters },
    { nodeId: toEdge.b, alongMeters: toEdge.length - projTo.positionMeters },
  ];
  const distsBySrc = new Map<number, Map<number, number>>();
  for (const fe of fromEntries) {
    if (!distsBySrc.has(fe.nodeId)) {
      distsBySrc.set(fe.nodeId, shortestDistancesFrom(graph, fe.nodeId));
    }
  }
  let bestTotal = Infinity;
  let bestSrcId = -1;
  let bestDstId = -1;
  for (const fe of fromEntries) {
    const dists = distsBySrc.get(fe.nodeId)!;
    for (const te of toEntries) {
      const mid = fe.nodeId === te.nodeId ? 0 : dists.get(te.nodeId);
      if (mid === undefined) continue;
      const total = fe.alongMeters + mid + te.alongMeters;
      if (total < bestTotal) {
        bestTotal = total;
        bestSrcId = fe.nodeId;
        bestDstId = te.nodeId;
      }
    }
  }
  if (bestSrcId === -1) {
    return { coordinates: [fromPt, toPt], meters: directDist };
  }

  let midSteps: PathStep[] = [];
  let midCoords: LngLat[] = [];
  if (bestSrcId !== bestDstId) {
    const sp = shortestPath(graph, bestSrcId, bestDstId);
    if (!sp) {
      return { coordinates: [fromPt, toPt], meters: directDist };
    }
    midSteps = sp;
    midCoords = pathToCoordinates(graph, sp);
  }

  const fromSlice = sliceEdge(
    fromEdge,
    projFrom.positionMeters,
    bestSrcId === fromEdge.a ? 0 : fromEdge.length
  );
  const toSlice = sliceEdge(
    toEdge,
    bestDstId === toEdge.a ? 0 : toEdge.length,
    projTo.positionMeters
  );
  const meters = stubFrom + bestTotal + stubTo;

  // Bail if road walk is absurdly long compared to direct line.
  if (meters > directDist * 4.0) {
    // eslint-disable-next-line no-console
    console.warn(
      "[walk] road walk",
      meters.toFixed(0),
      "m >> direct",
      directDist.toFixed(0),
      "m — falling back"
    );
    return { coordinates: [fromPt, toPt], meters: directDist };
  }

  const coords: LngLat[] = [];
  if (stubFrom > STUB_M) coords.push(fromPt);
  coords.push(...fromSlice.coordinates);
  if (midCoords.length > 0) {
    // midCoords starts at bestSrcId's coord, which equals fromSlice's
    // last point — skip the duplicate.
    coords.push(...midCoords.slice(1));
  }
  if (toSlice.coordinates.length > 0) {
    // toSlice starts at bestDstId's coord, which equals midCoords' last
    // point (or fromSlice's last point if no mid). Skip duplicate.
    coords.push(...toSlice.coordinates.slice(1));
  }
  if (stubTo > STUB_M) coords.push(toPt);

  // Build instructions from the midSteps. We don't emit per-edge
  // instructions for the from/to slices since they're partial edges and
  // would just duplicate the street name of the first/last instruction.
  const instructions = buildInstructions(graph, midSteps);

  return { coordinates: coords, meters, instructions };
}

