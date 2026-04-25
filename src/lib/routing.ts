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

const MAX_WALK_TO_STOP = 800;
const MAX_TRANSFER_WALK = 400;
const WALK_SPEED = 80; // m/min
const JEEPNEY_SPEED = 250; // m/min ~ 15 km/h city jeepney
// Walk time feels worse than ride time — riders will accept noticeably
// longer rides to avoid walking. OTP-style "walk reluctance" of 2.0 is
// industry standard. We apply it to scoring (route selection) but not
// to the displayed durationMinutes, which should remain wall-clock.
const WALK_RELUCTANCE = 2.0;
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

/** All per-segment snap candidates: project `pt` onto every segment of
 *  the polyline, return the local minima that are within `maxDist` m.
 *  For self-overlapping paths (lollipops) this yields one candidate per
 *  pass instead of collapsing to a single nearest. */
function allSnapCandidates(
  route: JeepneyRoute,
  pt: LngLat,
  maxDist: number
): NearestHit[] {
  const coords = route.coordinates;
  if (coords.length < 2) return [];
  const cache = getRouteCache(route);
  const perSeg: { dist: number; pos: number; coord: LngLat }[] = [];
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1];
    const b = coords[i];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len2 = dx * dx + dy * dy;
    let t = len2 === 0 ? 0 : ((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dy) / len2;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
    const projx = a[0] + dx * t;
    const projy = a[1] + dy * t;
    const d = metersBetween([projx, projy], pt);
    const segStart = cache.vertexPositions[i - 1];
    const segEnd = cache.vertexPositions[i];
    perSeg.push({
      dist: d,
      pos: segStart + (segEnd - segStart) * t,
      coord: [projx, projy],
    });
  }
  // Find every local minimum in the per-segment distance profile that
  // is within maxDist. A "pass" is a local minimum: the polyline came
  // close to `pt`, then moved away. For out-and-back routes (jeep goes
  // up to a turnaround and comes back), this correctly emits one
  // candidate per pass even though the polyline never strays beyond
  // maxDist between them.
  //
  // Implementation: walk the profile, track whether the distance is
  // currently rising or falling. Each transition from "falling/equal"
  // to "rising" marks a local min — emit it if under maxDist. Then
  // dedupe candidates within MIN_PASS_GAP along-line so tiny noise
  // wiggles don't double-count the same physical pass.
  const MIN_PASS_GAP = 80; // meters along-line; keeps real out-and-back
                           // turnarounds (~hundreds of m) but eats noise
  const picks: NearestHit[] = [];
  for (let i = 0; i < perSeg.length; i++) {
    const cur = perSeg[i].dist;
    const prev = i > 0 ? perSeg[i - 1].dist : Infinity;
    const next = i < perSeg.length - 1 ? perSeg[i + 1].dist : Infinity;
    const isLocalMin = cur <= prev && cur <= next;
    if (isLocalMin && cur <= maxDist) {
      picks.push({
        point: perSeg[i].coord,
        distMeters: cur,
        position: perSeg[i].pos,
      });
    }
  }
  // Dedupe near-coincident picks. Two minima close together along-line
  // *normally* mean noise (re-merge), but on lollipops the outbound and
  // return leg can pass the same query point a few segments apart with
  // the polyline travelling in opposite directions. Detect that via the
  // local segment bearing — picks within MIN_PASS_GAP along-line are
  // only merged if they're heading in roughly the same direction.
  picks.sort((a, b) => a.position - b.position);
  const deduped: NearestHit[] = [];
  const bearingAt = (pos: number): number => {
    // Bearing of the segment containing `pos`. Linear scan is fine —
    // routes have ≤ a few hundred vertices.
    let cursor = 0;
    for (let i = 1; i < coords.length; i++) {
      const segLen = cache.vertexPositions[i] - cache.vertexPositions[i - 1];
      if (cursor + segLen >= pos) {
        const a = coords[i - 1];
        const b = coords[i];
        return Math.atan2(b[0] - a[0], b[1] - a[1]) * (180 / Math.PI);
      }
      cursor += segLen;
    }
    return 0;
  };
  const angleDiff = (a: number, b: number) => {
    let d = Math.abs(a - b) % 360;
    if (d > 180) d = 360 - d;
    return d;
  };
  for (const p of picks) {
    const last = deduped[deduped.length - 1];
    if (!last || p.position - last.position > MIN_PASS_GAP) {
      deduped.push(p);
      continue;
    }
    // Same along-line region — check if directions agree.
    const sameDir = angleDiff(bearingAt(last.position), bearingAt(p.position)) < 60;
    if (sameDir) {
      // Genuine duplicate; keep closer of the two.
      if (p.distMeters < last.distMeters) deduped[deduped.length - 1] = p;
    } else {
      // Different directions — distinct passes (outbound vs return).
      deduped.push(p);
    }
  }
  return deduped;
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

/** Return up to one refined NearestHit per "pass" of the polyline past
 *  `pt` — one per local minimum within MAX_WALK_TO_STOP. Each hit's
 *  distMeters is the real road-graph walking distance from `pt` to the
 *  snap, so downstream scoring uses walk-accurate numbers.
 *
 *  For corridor routes this usually returns 1 hit. For lollipop routes
 *  near a point the jeep visits twice, this returns 2. */
function candidateHitsOnRoute(
  route: JeepneyRoute,
  pt: LngLat,
  walkGraph: RoadGraph | null,
  oracle: WalkDistanceOracle | null
): NearestHit[] {
  if (route.coordinates.length < 2) return [];
  const rawPicks = allSnapCandidates(route, pt, MAX_WALK_TO_STOP);
  if (rawPicks.length === 0) return [];
  if (!walkGraph || !oracle) return rawPicks;

  const { length: lineLen } = getRouteCache(route);

  return rawPicks
    .map((baseline) => {
      const baselineWalk = oracle.distanceTo(baseline.point);
      if (baselineWalk < SKIP_SAMPLING_BELOW_M) {
        return {
          point: baseline.point,
          distMeters: baselineWalk,
          position: baseline.position,
        };
      }
      // Small local search around this pass only, so we don't cross
      // into another pass's territory.
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
    })
    .filter((h) => h.distMeters <= MAX_WALK_TO_STOP);
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
  if (route.bidirectional) {
    // Corridor: reverse travel is legal. Always slice the short arc.
    const lo = Math.min(fromHit.position, toHit.position);
    const hi = Math.max(fromHit.position, toHit.position);
    return sliceByPosition(route.coordinates, lo, hi);
  }
  // One-way route (loop or lollipop): travel is strictly in the
  // direction of increasing along-line position. If to < from, we must
  // wrap around the end of the path. Enumeration in `planOnRoute`
  // already picks the candidate pair that produces the best ride — we
  // just honor the chosen direction here.
  if (toHit.position >= fromHit.position) {
    return sliceByPosition(route.coordinates, fromHit.position, toHit.position);
  }
  const legA = sliceByPosition(route.coordinates, fromHit.position, totalLen);
  const legB = sliceByPosition(route.coordinates, 0, toHit.position);
  return {
    coordinates: legA.coordinates.concat(legB.coordinates.slice(1)),
    meters: legA.meters + legB.meters,
  };
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

  // First pass: per-vertex distances. We keep the raw profile so we can
  // group consecutive within-threshold runs (corridor where the routes
  // run parallel) and emit a single transfer point per distinct corridor.
  type Raw = { idx: number; dist: number; onB: LngLat };
  const profile: Raw[] = [];
  for (let i = 0; i < routeA.coordinates.length; i++) {
    const vertex = routeA.coordinates[i];
    const snapped = nearestPointOnLine(cacheB.line, point(vertex), {
      units: "meters",
    });
    const dist = snapped.properties.dist ?? Infinity;
    profile.push({
      idx: i,
      dist,
      onB: snapped.geometry.coordinates as LngLat,
    });
  }

  // Group consecutive vertices that are within threshold into "corridors";
  // for each corridor pick the single closest vertex as the transfer point.
  // This collapses kilometers of parallel running into one candidate while
  // still catching distinct crossings.
  const hits: IntersectionHit[] = [];
  let i = 0;
  while (i < profile.length) {
    if (profile[i].dist > threshold) {
      i++;
      continue;
    }
    let bestK = i;
    let j = i;
    while (j < profile.length && profile[j].dist <= threshold) {
      if (profile[j].dist < profile[bestK].dist) bestK = j;
      j++;
    }
    const r = profile[bestK];
    const vertex = routeA.coordinates[r.idx];
    hits.push({
      onA: vertex,
      onB: r.onB,
      walkMeters: r.dist,
      posA: cacheA.vertexPositions[r.idx],
      posB: positionOfPointOnPolyline(
        routeB.coordinates,
        cacheB.vertexPositions,
        r.onB
      ),
    });
    i = j;
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
): TripStep | null {
  if (!walkGraph) {
    // Without a graph we can only honor very short walks — anything
    // longer is almost certainly going to draw an implausible
    // straight line over rivers / runways / etc.
    const meters = metersBetween(from, to);
    if (meters > 150) return null;
    return {
      type: "walk",
      from,
      to,
      distanceMeters: meters,
      durationMinutes: Math.max(1, Math.round(meters / WALK_SPEED)),
    };
  }
  const result = walkPathCoordinates(walkGraph, from, to);
  if (!result) return null;
  const { coordinates, meters, instructions } = result;
  return {
    type: "walk",
    from,
    to,
    distanceMeters: meters,
    durationMinutes: Math.max(1, Math.round(meters / WALK_SPEED)),
    coordinates,
    instructions,
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

/** Score used to rank candidate plans against each other. Same units as
 *  totalMinutes but applies WALK_RELUCTANCE so a plan that walks more
 *  is penalized — even when its wall-clock total is comparable. */
function rankingScore(plan: TripPlan): number {
  let walkMin = 0;
  let rideMin = 0;
  for (const s of plan.steps) {
    if (s.type === "walk") walkMin += s.durationMinutes ?? 0;
    else if (s.type === "jeepney") rideMin += s.durationMinutes ?? 0;
  }
  return walkMin * WALK_RELUCTANCE + rideMin + plan.transfers * TRANSFER_PENALTY_MIN;
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
  maxCandidates = 20
): TripCandidate[] {
  const usable = routes.filter((r) => r.coordinates.length >= 2);
  if (usable.length === 0) return [];
  const walkGraph = getWalkGraph(roads);

  // Build one oracle per endpoint and reuse it across every route. Each
  // oracle internally runs Dijkstra once from its source — hoisting
  // collapses N-routes × 2 Dijkstra runs into just 2.
  const oracleA = walkGraph ? makeWalkOracle(pointA, walkGraph) : null;
  const oracleB = walkGraph ? makeWalkOracle(pointB, walkGraph) : null;

  const boarding = usable
    .map((r) => ({
      route: r,
      hits: candidateHitsOnRoute(r, pointA, walkGraph, oracleA),
    }))
    .filter((x) => x.hits.length > 0);
  const alighting = usable
    .map((r) => ({
      route: r,
      hits: candidateHitsOnRoute(r, pointB, walkGraph, oracleB),
    }))
    .filter((x) => x.hits.length > 0);

  if (boarding.length === 0 || alighting.length === 0) return [];

  const plans: TripPlan[] = [];

  // Direct trips — per route, pick the (board, alight) pair that
  // minimizes total travel time: walk_minutes + ride_minutes. Walking
  // is slower per meter (80 vs 250 m/min) so this naturally prefers
  // shorter walks, but it lets the rider walk a bit further when doing
  // so dodges a long loop ride (e.g. catching a return-leg pass instead
  // of riding the whole outbound loop).
  // For non-bidirectional routes we require forward-only travel to
  // disambiguate which "pass" of a self-overlapping route the jeep is
  // actually on.
  for (const b of boarding) {
    const a = alighting.find((x) => x.route.id === b.route.id);
    if (!a) continue;
    const route = b.route;
    let bestPair: { bh: NearestHit; ah: NearestHit } | null = null;
    let bestScore = Infinity;
    for (const bh of b.hits) {
      for (const ah of a.hits) {
        if (metersBetween(bh.point, ah.point) < 10) continue;
        if (!route.bidirectional && ah.position < bh.position) {
          const p = route.path;
          const isClosed = p.length > 2 && p[0] === p[p.length - 1];
          if (!isClosed) continue;
        }
        const walkSum = bh.distMeters + ah.distMeters;
        const { length: totalLen } = getRouteCache(route);
        let ridelen: number;
        if (ah.position >= bh.position) {
          ridelen = ah.position - bh.position;
        } else {
          ridelen = totalLen - bh.position + ah.position;
        }
        const score =
          (walkSum / WALK_SPEED) * WALK_RELUCTANCE + ridelen / JEEPNEY_SPEED;
        if (score < bestScore) {
          bestPair = { bh, ah };
          bestScore = score;
        }
      }
    }
    if (bestPair) {
      const boardWalk = buildWalk(pointA, bestPair.bh.point, walkGraph);
      const alightWalk = buildWalk(bestPair.ah.point, pointB, walkGraph);
      // Skip plans where either walk leg is infeasible — drawing a
      // straight line over impassable terrain misleads the rider.
      if (boardWalk && alightWalk) {
        plans.push(
          assembleTrip([
            boardWalk,
            buildJeepney(route, bestPair.bh, bestPair.ah),
            alightWalk,
          ])
        );
      }
    }
  }

  // Routes that already cover both A and B on their own — a transfer
  // whose boarding OR alighting leg uses such a route is pointless.
  const directRouteIds = new Set<string>();
  for (const b of boarding) {
    if (alighting.some((a) => a.route.id === b.route.id)) {
      directRouteIds.add(b.route.id);
    }
  }

  // One-transfer trips — iterate every (boardHit, alightHit) pair so
  // self-overlapping routes contribute every pass to transfer search,
  // matching the direct-trip path. Downstream signature dedupe keeps
  // only the best plan per (routeA→routeB) code pair.
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
      if (intersections.length === 0) continue;
      for (const bHit of b.hits) {
        for (const aHit of a.hits) {
          for (const x of intersections) {
            if (metersBetween(bHit.point, x.onA) < 10) continue;
            if (metersBetween(x.onB, aHit.point) < 10) continue;
            // Forward-only guard on non-bidirectional routes, matching
            // the direct-trip rule.
            if (!b.route.bidirectional && x.posA < bHit.position) {
              const p = b.route.path;
              const isClosed = p.length > 2 && p[0] === p[p.length - 1];
              if (!isClosed) continue;
            }
            if (!a.route.bidirectional && aHit.position < x.posB) {
              const p = a.route.path;
              const isClosed = p.length > 2 && p[0] === p[p.length - 1];
              if (!isClosed) continue;
            }
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
            const boardWalk = buildWalk(pointA, bHit.point, walkGraph);
            const alightWalk = buildWalk(aHit.point, pointB, walkGraph);
            if (!boardWalk || !alightWalk) continue;
            const steps: TripStep[] = [boardWalk];
            steps.push(buildJeepney(b.route, bHit, hitOnA));
            if (x.walkMeters >= MIN_TRANSFER_WALK_RENDERED) {
              const transferWalk = buildWalk(x.onA, x.onB, walkGraph);
              if (!transferWalk) continue;
              steps.push(transferWalk);
            }
            steps.push(buildJeepney(a.route, hitOnB, aHit));
            steps.push(alightWalk);
            plans.push(assembleTrip(steps));
          }
        }
      }
    }
  }

  // Dedupe by jeepney-code signature. Within a signature, keep the plan
  // with the lowest ranking score (walk-reluctance-weighted). The
  // displayed `minutes` stays wall-clock so the UI is honest.
  const bySig = new Map<string, TripCandidate & { score: number }>();
  for (const plan of plans) {
    const sig = plan.steps
      .filter((s) => s.type === "jeepney")
      .map((s) => s.routeCode)
      .join("→");
    const minutes = totalMinutes(plan);
    const score = rankingScore(plan);
    const prev = bySig.get(sig);
    if (!prev || score < prev.score) {
      bySig.set(sig, { plan, minutes, score });
    }
  }
  const ranked = Array.from(bySig.values()).sort((p, q) => p.score - q.score);
  if (ranked.length === 0) return [];
  // Drop candidates whose score is >3× the best — almost always
  // loop-wrap artifacts.
  const bestScore = ranked[0].score;
  return ranked
    .filter((c) => c.score <= bestScore * 3)
    .slice(0, maxCandidates)
    .map(({ plan, minutes }) => ({ plan, minutes }));
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
