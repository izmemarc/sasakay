import type { RoadWay } from "./loadRoads";

type LngLat = [number, number];

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
    const node: GraphNode = { id: nodes.length, coord: c };
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
    const oneway = normalizeOneway(w.oneway);
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

  return { nodes, edges, adjacency, nodeIndex };
}

export interface PathStep {
  edgeId: number;
  /** true = traversed a → b in the edge's native orientation */
  forward: boolean;
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
  const frontier = new Set<number>([fromNodeId]);

  while (frontier.size > 0) {
    let current = -1;
    let currentDist = Infinity;
    for (const n of frontier) {
      const d = dist.get(n) ?? Infinity;
      if (d < currentDist) {
        currentDist = d;
        current = n;
      }
    }
    if (current === -1) break;
    frontier.delete(current);
    visited.add(current);
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
        frontier.add(ent.otherNode);
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
  const frontier = new Set<number>([fromNodeId]);
  while (frontier.size > 0) {
    let current = -1;
    let currentDist = Infinity;
    for (const n of frontier) {
      const d = dist.get(n) ?? Infinity;
      if (d < currentDist) {
        currentDist = d;
        current = n;
      }
    }
    if (current === -1) break;
    frontier.delete(current);
    visited.add(current);
    const adj = graph.adjacency.get(current) ?? [];
    for (const ent of adj) {
      if (visited.has(ent.otherNode)) continue;
      const edge = graph.edges[ent.edgeId];
      const alt = currentDist + edge.length;
      if (alt < (dist.get(ent.otherNode) ?? Infinity)) {
        dist.set(ent.otherNode, alt);
        frontier.add(ent.otherNode);
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

/** Return a road-following polyline from `fromPt` to `toPt`. For short
 *  walks or when snapping would cause an absurd detour, falls back to
 *  a direct line so we don't make the user "walk past" their target. */
export function walkPathCoordinates(
  graph: RoadGraph,
  fromPt: LngLat,
  toPt: LngLat
): { coordinates: LngLat[]; meters: number } {
  const directDist = haversineM(fromPt, toPt);
  if (directDist < 40) {
    return { coordinates: [fromPt, toPt], meters: directDist };
  }
  const a = nearestNode(graph, fromPt, 500);
  const b = nearestNode(graph, toPt, 500);
  if (a && b && a.id === b.id) {
    // Both points snapped to the same graph node — the walk is really
    // just from/to that point. Draw the stubs on either side.
    return {
      coordinates: [fromPt, a.coord, toPt],
      meters: haversineM(fromPt, a.coord) + haversineM(a.coord, toPt),
    };
  }
  if (!a || !b) {
    return { coordinates: [fromPt, toPt], meters: directDist };
  }
  const steps = shortestPath(graph, a.id, b.id);
  if (!steps || steps.length === 0) {
    // eslint-disable-next-line no-console
    console.warn(
      "[walk] no path from node",
      a.id,
      "to",
      b.id,
      "— falling back to straight line (",
      directDist.toFixed(0),
      "m)"
    );
    return { coordinates: [fromPt, toPt], meters: directDist };
  }
  const midCoords = pathToCoordinates(graph, steps);
  let meters = haversineM(fromPt, a.coord);
  for (let i = 1; i < midCoords.length; i++) {
    meters += haversineM(midCoords[i - 1], midCoords[i]);
  }
  meters += haversineM(b.coord, toPt);
  // Only fall back when the road walk is absurdly long (bad snap).
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
  const STUB_M = 15;
  const coords: LngLat[] = [];
  if (haversineM(fromPt, a.coord) > STUB_M) coords.push(fromPt);
  coords.push(...midCoords);
  if (haversineM(toPt, b.coord) > STUB_M) coords.push(toPt);
  return { coordinates: coords, meters };
}

