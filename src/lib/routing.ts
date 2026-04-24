import { point, lineString } from "@turf/turf";
import nearestPointOnLine from "@turf/nearest-point-on-line";
import type { Feature, LineString } from "geojson";
import type { JeepneyRoute, TripPlan, TripStep } from "../types";
import {
  buildWalkGraph,
  nearestNode,
  shortestDistancesFrom,
  walkPathCoordinates,
  type RoadGraph,
} from "./roadGraph";
import type { RoadWay } from "./loadRoads";

type LngLat = [number, number];

const MAX_WALK_TO_STOP = 500;
const MAX_TRANSFER_WALK = 300;
const WALK_SPEED = 80; // m/min
const JEEPNEY_SPEED = 250; // m/min ~ 15 km/h city jeepney
const TRANSFER_PENALTY_MIN = 5; // wait + boarding overhead per transfer
const MIN_TRANSFER_WALK_RENDERED = 20;
const SAMPLE_WINDOW = 500;
const SAMPLE_STEP = 60;
const SKIP_SAMPLING_BELOW_M = 100;

/** Haversine in meters — inlined to avoid allocating Feature<Point>
 *  objects for turf.distance on every call (this runs in tight loops). */
function metersBetween(a: LngLat, b: LngLat): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const dLat = lat2 - lat1;
  const dLng = toRad(b[0] - a[0]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

interface NearestHit {
  point: LngLat;
  /** Straight-line distance from the query point to the snapped point. */
  distMeters: number;
  /** Along-line distance (meters) from the start of the polyline. */
  position: number;
}

// Per-route caches keyed by route.id — route coordinates are stable
// across a session, so we can memoize these.
interface RouteCache {
  coordsRef: LngLat[];
  line: Feature<LineString>;
  length: number;
  /** Precomputed along-line position for each vertex in route.coordinates.
   *  Derived via the same haversine we use everywhere else so downstream
   *  slicing math stays internally consistent. */
  vertexPositions: number[];
}
const routeCaches = new Map<string, RouteCache>();

function getRouteCache(route: JeepneyRoute): RouteCache {
  const existing = routeCaches.get(route.id);
  // Invalidate the cache if the route's coordinates array was replaced
  // (e.g. the editor resaved the route). Identity compare is enough —
  // loadRoutes always produces a fresh array.
  if (existing && existing.coordsRef === route.coordinates) return existing;
  const line = lineString(route.coordinates);
  const vertexPositions: number[] = [0];
  let cursor = 0;
  for (let i = 1; i < route.coordinates.length; i++) {
    cursor += metersBetween(route.coordinates[i - 1], route.coordinates[i]);
    vertexPositions.push(cursor);
  }
  const cache: RouteCache = {
    coordsRef: route.coordinates,
    line,
    length: cursor,
    vertexPositions,
  };
  routeCaches.set(route.id, cache);
  return cache;
}

/** Along-line position (meters, using our haversine) of a point that
 *  lies on or very near `coords`. We locate the segment the point is
 *  on by finding the segment where distance(pt, segment) is minimized,
 *  then add the offset within that segment to the segment's start
 *  vertexPosition. Keeps all position math consistent with sliceByPosition. */
function positionOfPointOnPolyline(
  coords: LngLat[],
  vertexPositions: number[],
  pt: LngLat
): number {
  let bestSeg = 0;
  let bestDist = Infinity;
  let bestT = 0;
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1];
    const b = coords[i];
    // Project pt onto segment a→b in lng/lat space (adequate at small scale).
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len2 = dx * dx + dy * dy;
    let t = len2 === 0 ? 0 : ((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dy) / len2;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
    const projx = a[0] + dx * t;
    const projy = a[1] + dy * t;
    const d = metersBetween([projx, projy], pt);
    if (d < bestDist) {
      bestDist = d;
      bestSeg = i - 1;
      bestT = t;
    }
  }
  const segStart = vertexPositions[bestSeg];
  const segEnd = vertexPositions[bestSeg + 1];
  return segStart + (segEnd - segStart) * bestT;
}

function nearestOnRoute(route: JeepneyRoute, pt: LngLat): NearestHit {
  if (route.coordinates.length < 2) {
    return { point: pt, distMeters: Infinity, position: 0 };
  }
  const cache = getRouteCache(route);
  const snapped = nearestPointOnLine(cache.line, point(pt), {
    units: "meters",
  });
  const snapCoord = snapped.geometry.coordinates as LngLat;
  const position = positionOfPointOnPolyline(
    route.coordinates,
    cache.vertexPositions,
    snapCoord
  );
  return {
    point: [snapCoord[0], snapCoord[1]],
    distMeters: snapped.properties.dist ?? 0,
    position,
  };
}

/** One Dijkstra run covers all candidate alight points — we do the run
 *  from the source walk-graph node, then map each candidate coord to
 *  its nearest walk-graph node and read off the distance. */
interface WalkDistanceOracle {
  /** Road-follow walk meters from the source point to `target`, with
   *  stub walks to/from the snapped graph nodes included. */
  distanceTo(target: LngLat): number;
}

function makeWalkOracle(
  source: LngLat,
  walkGraph: RoadGraph | null
): WalkDistanceOracle {
  if (!walkGraph) {
    return { distanceTo: (t) => metersBetween(source, t) };
  }
  const srcNode = nearestNode(walkGraph, source, 500);
  if (!srcNode) {
    return { distanceTo: (t) => metersBetween(source, t) };
  }
  const dists = shortestDistancesFrom(walkGraph, srcNode.id);
  const srcStub = metersBetween(source, srcNode.coord);
  return {
    distanceTo(target: LngLat): number {
      const direct = metersBetween(source, target);
      if (direct < 40) return direct;
      const tgtNode = nearestNode(walkGraph, target, 500);
      if (!tgtNode) return direct;
      if (tgtNode.id === srcNode.id) {
        return srcStub + metersBetween(srcNode.coord, target);
      }
      const d = dists.get(tgtNode.id);
      if (d === undefined) return direct;
      const tgtStub = metersBetween(tgtNode.coord, target);
      const total = srcStub + d + tgtStub;
      // Mirror walkPathCoordinates's absurd-detour fallback so scoring
      // stays consistent with what we actually render.
      if (total > direct * 4.0) return direct;
      return total;
    },
  };
}

/** Pick the point on `route` that minimizes actual walking distance
 *  to/from `pt`. Uses a single Dijkstra run (via WalkDistanceOracle)
 *  to score all candidate points cheaply. */
function bestBoardingOrAlightingOnRoute(
  route: JeepneyRoute,
  pt: LngLat,
  walkGraph: RoadGraph | null
): NearestHit | null {
  if (route.coordinates.length < 2) return null;
  const baseline = nearestOnRoute(route, pt);
  if (baseline.distMeters > MAX_WALK_TO_STOP) return null;
  if (!walkGraph) return baseline;

  const oracle = makeWalkOracle(pt, walkGraph);
  const baselineWalk = oracle.distanceTo(baseline.point);

  // Skip sampling when the baseline walk is already short — the user
  // is essentially on the route, no point spending cycles.
  if (baselineWalk < SKIP_SAMPLING_BELOW_M) {
    return {
      point: baseline.point,
      distMeters: baselineWalk,
      position: baseline.position,
    };
  }

  const { length: lineLen } = getRouteCache(route);
  // Shift the window to compensate when clamped against the ends — we
  // still get 2×SAMPLE_WINDOW of coverage whenever the line is long enough.
  let loStart = baseline.position - SAMPLE_WINDOW;
  let hiStart = baseline.position + SAMPLE_WINDOW;
  if (loStart < 0) {
    hiStart = Math.min(lineLen, hiStart - loStart);
    loStart = 0;
  }
  if (hiStart > lineLen) {
    loStart = Math.max(0, loStart - (hiStart - lineLen));
    hiStart = lineLen;
  }

  let bestHit: NearestHit = {
    point: baseline.point,
    distMeters: baselineWalk,
    position: baseline.position,
  };
  let bestWalk = baselineWalk;

  for (let p = loStart; p <= hiStart; p += SAMPLE_STEP) {
    if (Math.abs(p - baseline.position) < 1) continue;
    const coords = samplePointOnLine(route.coordinates, p);
    if (!coords) continue;
    if (metersBetween(pt, coords) > bestWalk) continue;
    const walk = oracle.distanceTo(coords);
    if (walk < bestWalk) {
      bestHit = { point: coords, distMeters: walk, position: p };
      bestWalk = walk;
    }
  }
  return bestHit;
}

/** Coordinate at a given along-line position (meters). Returns null
 *  only if the polyline is degenerate. */
function samplePointOnLine(coords: LngLat[], targetM: number): LngLat | null {
  if (coords.length === 0) return null;
  let cursor = 0;
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1];
    const b = coords[i];
    const edge = metersBetween(a, b);
    if (cursor + edge >= targetM) {
      const t = edge === 0 ? 0 : (targetM - cursor) / edge;
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    }
    cursor += edge;
  }
  return coords[coords.length - 1];
}

/** Slice a polyline between two along-line positions (in meters).
 *  Walks the coordinate array by cumulative distance — guaranteed to
 *  follow the polyline faithfully from startM to endM, with no
 *  duplicate vertices on segment boundaries. */
function sliceByPosition(
  coords: LngLat[],
  startM: number,
  endM: number
): { coordinates: LngLat[]; meters: number } {
  if (coords.length === 0) return { coordinates: [], meters: 0 };
  // Clamp to the polyline's actual range so out-of-band inputs don't
  // silently return empty or wrong-shaped polylines.
  let totalLen = 0;
  for (let i = 1; i < coords.length; i++) {
    totalLen += metersBetween(coords[i - 1], coords[i]);
  }
  if (startM < 0) startM = 0;
  else if (startM > totalLen) startM = totalLen;
  if (endM < 0) endM = 0;
  else if (endM > totalLen) endM = totalLen;
  if (endM < startM) endM = startM;
  if (startM === endM) {
    const p = samplePointOnLine(coords, startM) ?? coords[0];
    return { coordinates: [p], meters: 0 };
  }
  const out: LngLat[] = [];
  let cursor = 0;
  let started = false;
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1];
    const b = coords[i];
    const edge = metersBetween(a, b);
    const segStart = cursor;
    const segEnd = cursor + edge;
    if (!started && segEnd >= startM) {
      const t = edge === 0 ? 0 : (startM - segStart) / edge;
      const startPt: LngLat = [
        a[0] + (b[0] - a[0]) * t,
        a[1] + (b[1] - a[1]) * t,
      ];
      out.push(startPt);
      started = true;
      // If endM is also inside this same segment, emit the end and stop —
      // don't also push `b` below.
      if (segEnd >= endM) {
        const tEnd = edge === 0 ? 0 : (endM - segStart) / edge;
        out.push([a[0] + (b[0] - a[0]) * tEnd, a[1] + (b[1] - a[1]) * tEnd]);
        break;
      }
      // Otherwise the segment's end vertex `b` is the next polyline point.
      // Skip pushing `b` if it equals startPt (startM landed exactly on b).
      if (metersBetween(startPt, b) > 1e-9) out.push(b);
      cursor = segEnd;
      continue;
    }
    if (started) {
      if (segEnd >= endM) {
        const t = edge === 0 ? 0 : (endM - segStart) / edge;
        out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
        break;
      }
      out.push(b);
    }
    cursor = segEnd;
  }
  let meters = 0;
  for (let i = 1; i < out.length; i++) {
    meters += metersBetween(out[i - 1], out[i]);
  }
  return { coordinates: out, meters };
}

function sliceRoute(
  route: JeepneyRoute,
  fromHit: NearestHit,
  toHit: NearestHit
): { coordinates: LngLat[]; meters: number } {
  const { length: totalLen } = getRouteCache(route);
  if (route.topology === "corridor") {
    const lo = Math.min(fromHit.position, toHit.position);
    const hi = Math.max(fromHit.position, toHit.position);
    return sliceByPosition(route.coordinates, lo, hi);
  }
  // Loop: path's start/end seam is arbitrary (it's just where the JSON
  // author started listing nodes). Forward traversal from A to B can go
  // two ways around the loop (short arc vs. wrap arc), and both are
  // legal "forward" motion — the jeep never reverses. Pick the shorter.
  const forward = sliceByPosition(
    route.coordinates,
    Math.min(fromHit.position, toHit.position),
    Math.max(fromHit.position, toHit.position)
  );
  const wrapLegA = sliceByPosition(
    route.coordinates,
    Math.max(fromHit.position, toHit.position),
    totalLen
  );
  const wrapLegB = sliceByPosition(
    route.coordinates,
    0,
    Math.min(fromHit.position, toHit.position)
  );
  const wrap = {
    coordinates: wrapLegA.coordinates.concat(wrapLegB.coordinates.slice(1)),
    meters: wrapLegA.meters + wrapLegB.meters,
  };
  return forward.meters <= wrap.meters ? forward : wrap;
}

interface IntersectionHit {
  onA: LngLat;
  onB: LngLat;
  walkMeters: number;
  /** Along-line position of onA on routeA (meters). */
  posA: number;
  /** Along-line position of onB on routeB (meters). */
  posB: number;
}

// Memoize per (routeA, routeB, threshold) — bust on coords-array
// replacement via the cached coordsRefs.
interface IntersectionCacheEntry {
  refA: LngLat[];
  refB: LngLat[];
  hits: IntersectionHit[];
}
const intersectionCache = new Map<string, IntersectionCacheEntry>();

function findNearIntersections(
  routeA: JeepneyRoute,
  routeB: JeepneyRoute,
  threshold: number
): IntersectionHit[] {
  const key = `${routeA.id}|${routeB.id}|${threshold}`;
  const cached = intersectionCache.get(key);
  if (
    cached &&
    cached.refA === routeA.coordinates &&
    cached.refB === routeB.coordinates
  ) {
    return cached.hits;
  }
  if (routeB.coordinates.length < 2) {
    intersectionCache.set(key, {
      refA: routeA.coordinates,
      refB: routeB.coordinates,
      hits: [],
    });
    return [];
  }
  const cacheA = getRouteCache(routeA);
  const cacheB = getRouteCache(routeB);
  const hits: IntersectionHit[] = [];
  const accepted = new Set<string>();
  const bucketKey = (c: LngLat) =>
    `${Math.round(c[0] / 0.0005)},${Math.round(c[1] / 0.0005)}`;
  for (let i = 0; i < routeA.coordinates.length; i++) {
    const vertex = routeA.coordinates[i];
    const snapped = nearestPointOnLine(cacheB.line, point(vertex), {
      units: "meters",
    });
    const dist = snapped.properties.dist ?? Infinity;
    if (dist > threshold) continue;
    const bk = bucketKey(vertex);
    if (accepted.has(bk)) continue;
    accepted.add(bk);
    const onB = snapped.geometry.coordinates as LngLat;
    hits.push({
      onA: vertex,
      onB,
      walkMeters: dist,
      posA: cacheA.vertexPositions[i],
      posB: positionOfPointOnPolyline(
        routeB.coordinates,
        cacheB.vertexPositions,
        onB
      ),
    });
  }
  intersectionCache.set(key, {
    refA: routeA.coordinates,
    refB: routeB.coordinates,
    hits,
  });
  return hits;
}

function buildWalk(
  from: LngLat,
  to: LngLat,
  walkGraph: RoadGraph | null
): TripStep {
  if (!walkGraph) {
    const meters = metersBetween(from, to);
    return {
      type: "walk",
      from,
      to,
      distanceMeters: meters,
      durationMinutes: Math.max(1, Math.round(meters / WALK_SPEED)),
    };
  }
  const { coordinates, meters } = walkPathCoordinates(walkGraph, from, to);
  return {
    type: "walk",
    from,
    to,
    distanceMeters: meters,
    durationMinutes: Math.max(1, Math.round(meters / WALK_SPEED)),
    coordinates,
  };
}

function buildJeepney(
  route: JeepneyRoute,
  fromHit: NearestHit,
  toHit: NearestHit
): TripStep {
  const { coordinates, meters } = sliceRoute(route, fromHit, toHit);
  return {
    type: "jeepney",
    from: fromHit.point,
    to: toHit.point,
    distanceMeters: meters,
    routeCode: route.code,
    routeName: route.name,
    routeColor: route.color,
    fare: route.fare,
    coordinates,
    durationMinutes: Math.max(1, Math.round(meters / JEEPNEY_SPEED)),
  };
}

function assembleTrip(steps: TripStep[]): TripPlan {
  let totalDistance = 0;
  let totalFare = 0;
  let totalWalkMeters = 0;
  let jeepneyCount = 0;
  for (const s of steps) {
    totalDistance += s.distanceMeters;
    if (s.type === "walk") totalWalkMeters += s.distanceMeters;
    if (s.type === "jeepney") {
      totalFare += s.fare ?? 0;
      jeepneyCount += 1;
    }
  }
  return {
    steps,
    totalDistance,
    totalFare,
    totalWalkMinutes: Math.max(1, Math.round(totalWalkMeters / WALK_SPEED)),
    transfers: Math.max(0, jeepneyCount - 1),
  };
}

function totalMinutes(plan: TripPlan): number {
  let t = 0;
  for (const s of plan.steps) t += s.durationMinutes ?? 0;
  return t + plan.transfers * TRANSFER_PENALTY_MIN;
}

let cachedWalkGraph: RoadGraph | null = null;
let cachedRoadsRef: RoadWay[] | null = null;
function getWalkGraph(roads: RoadWay[] | undefined): RoadGraph | null {
  if (!roads || roads.length === 0) return null;
  if (roads !== cachedRoadsRef) {
    cachedWalkGraph = buildWalkGraph(roads);
    cachedRoadsRef = roads;
    // Route/intersection caches are keyed by route.id so they survive,
    // but if the graph changes we want a fresh build. Nothing to clear.
    // eslint-disable-next-line no-console
    console.log(
      "[routing] walk graph built:",
      cachedWalkGraph.nodes.length,
      "nodes,",
      cachedWalkGraph.edges.length,
      "edges"
    );
  }
  return cachedWalkGraph;
}

export interface TripCandidate {
  plan: TripPlan;
  /** Total minutes including transfer penalty — lower is better. */
  minutes: number;
}

export function planTrips(
  pointA: LngLat,
  pointB: LngLat,
  routes: JeepneyRoute[],
  roads?: RoadWay[],
  maxCandidates = 5
): TripCandidate[] {
  const usable = routes.filter((r) => r.coordinates.length >= 2);
  if (usable.length === 0) return [];
  const walkGraph = getWalkGraph(roads);

  const boarding = usable
    .map((r) => ({
      route: r,
      hit: bestBoardingOrAlightingOnRoute(r, pointA, walkGraph),
    }))
    .filter((x): x is { route: JeepneyRoute; hit: NearestHit } => x.hit !== null);
  const alighting = usable
    .map((r) => ({
      route: r,
      hit: bestBoardingOrAlightingOnRoute(r, pointB, walkGraph),
    }))
    .filter((x): x is { route: JeepneyRoute; hit: NearestHit } => x.hit !== null);

  if (boarding.length === 0 || alighting.length === 0) return [];

  const plans: TripPlan[] = [];

  // Direct trips
  for (const b of boarding) {
    const a = alighting.find((x) => x.route.id === b.route.id);
    if (!a) continue;
    if (metersBetween(b.hit.point, a.hit.point) < 10) continue;
    plans.push(
      assembleTrip([
        buildWalk(pointA, b.hit.point, walkGraph),
        buildJeepney(b.route, b.hit, a.hit),
        buildWalk(a.hit.point, pointB, walkGraph),
      ])
    );
  }

  // Routes that already cover both A and B on their own — a transfer
  // whose boarding OR alighting leg uses such a route is pointless.
  const directRouteIds = new Set<string>();
  for (const b of boarding) {
    if (alighting.some((a) => a.route.id === b.route.id)) {
      directRouteIds.add(b.route.id);
    }
  }

  // One-transfer trips
  for (const b of boarding) {
    if (directRouteIds.has(b.route.id)) continue;
    for (const a of alighting) {
      if (b.route.id === a.route.id) continue;
      if (directRouteIds.has(a.route.id)) continue;
      const intersections = findNearIntersections(
        b.route,
        a.route,
        MAX_TRANSFER_WALK
      );
      for (const x of intersections) {
        if (metersBetween(b.hit.point, x.onA) < 10) continue;
        if (metersBetween(x.onB, a.hit.point) < 10) continue;
        const hitOnA: NearestHit = {
          point: x.onA,
          distMeters: 0,
          position: x.posA,
        };
        const hitOnB: NearestHit = {
          point: x.onB,
          distMeters: 0,
          position: x.posB,
        };
        const steps: TripStep[] = [buildWalk(pointA, b.hit.point, walkGraph)];
        steps.push(buildJeepney(b.route, b.hit, hitOnA));
        if (x.walkMeters >= MIN_TRANSFER_WALK_RENDERED) {
          steps.push(buildWalk(x.onA, x.onB, walkGraph));
        }
        steps.push(buildJeepney(a.route, hitOnB, a.hit));
        steps.push(buildWalk(a.hit.point, pointB, walkGraph));
        plans.push(assembleTrip(steps));
      }
    }
  }

  // Dedupe by jeepney-code signature, keep fastest per signature.
  const bySig = new Map<string, TripCandidate>();
  for (const plan of plans) {
    const sig = plan.steps
      .filter((s) => s.type === "jeepney")
      .map((s) => s.routeCode)
      .join("→");
    const minutes = totalMinutes(plan);
    const prev = bySig.get(sig);
    if (!prev || minutes < prev.minutes) {
      bySig.set(sig, { plan, minutes });
    }
  }
  const ranked = Array.from(bySig.values()).sort(
    (p, q) => p.minutes - q.minutes
  );
  if (ranked.length === 0) return [];
  // Drop candidates >2× the best — almost always loop-wrap artifacts.
  const bestMin = ranked[0].minutes;
  return ranked
    .filter((c) => c.minutes <= bestMin * 2)
    .slice(0, maxCandidates);
}

export function planTrip(
  pointA: LngLat,
  pointB: LngLat,
  routes: JeepneyRoute[],
  roads?: RoadWay[]
): TripPlan | null {
  const cands = planTrips(pointA, pointB, routes, roads, 1);
  return cands[0]?.plan ?? null;
}
