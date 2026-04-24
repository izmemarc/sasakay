import type { JeepneyRoute, RouteLeg, RouteTopology } from "../types";
import type { RoadWay } from "./loadRoads";
import {
  buildRoadGraph,
  nodesToPath,
  pathToCoordinates,
  type RoadGraph,
} from "./roadGraph";

interface RouteIndex {
  files: string[];
}

/** On-disk shape. Supports both the legacy single-path form and the
 *  newer two-leg ("lollipop") form. At load time we normalize both to
 *  the internal multi-leg JeepneyRoute model. */
export interface RouteFileLeg {
  path: number[];
}

export interface RouteFile {
  id: string;
  code: string;
  name: string;
  color: string;
  fare: number;
  /** Legacy only, optional on new files. */
  topology?: RouteTopology;
  /** Legacy single-leg path. */
  path?: number[];
  /** New multi-leg representation. If present, overrides `path`. */
  legs?: {
    outbound: RouteFileLeg;
    return?: RouteFileLeg;
  };
}

function resolveLeg(
  id: "outbound" | "return",
  rawPath: number[],
  graph: RoadGraph,
  routeId: string
): RouteLeg | null {
  if (!rawPath || rawPath.length < 2) return null;
  const steps = nodesToPath(graph, rawPath);
  if (!steps) {
    console.warn(
      `Route ${routeId} ${id}: could not resolve path — nodes may be disconnected.`
    );
    return null;
  }
  const coordinates = pathToCoordinates(graph, steps);
  return { id, path: rawPath, coordinates };
}

function fileToRoute(
  file: RouteFile,
  graph: RoadGraph
): JeepneyRoute | null {
  if (!file.id || !file.code || !file.color) {
    console.warn("Route file missing required fields (id/code/color):", file);
    return null;
  }

  // Build legs from whichever form the file uses.
  const legs: RouteLeg[] = [];
  let bidirectional = false;

  if (file.legs?.outbound?.path) {
    // New format.
    const out = resolveLeg("outbound", file.legs.outbound.path, graph, file.id);
    if (out) legs.push(out);
    if (file.legs.return?.path) {
      const ret = resolveLeg("return", file.legs.return.path, graph, file.id);
      if (ret) legs.push(ret);
    }
    // 2-leg route = separate outbound/return one-way pair → directional.
    // 1-leg = treat as bidirectional corridor unless it's a closed loop.
    if (legs.length === 1) {
      const p = legs[0].path;
      const isClosedLoop = p.length > 2 && p[0] === p[p.length - 1];
      bidirectional = !isClosedLoop;
    }
  } else if (file.path) {
    // Legacy format — single path + topology.
    const leg = resolveLeg("outbound", file.path, graph, file.id);
    if (leg) legs.push(leg);
    // Legacy "corridor" = bidirectional; "loop" = one-way closed.
    bidirectional = (file.topology ?? "corridor") === "corridor";
  }

  if (legs.length === 0) {
    console.warn(`Route ${file.id}: no valid legs.`);
    return null;
  }

  // Legacy aggregates — concat all legs.
  const aggregatePath = legs.flatMap((l) => l.path);
  const aggregateCoords = legs.flatMap((l) => l.coordinates);

  // topology is still surfaced for any code that reads it, but the
  // planner should prefer legs + bidirectional.
  const topology: RouteTopology =
    legs.length === 1 &&
    !bidirectional &&
    legs[0].path[0] === legs[0].path[legs[0].path.length - 1]
      ? "loop"
      : "corridor";

  return {
    id: file.id,
    code: file.code,
    name: file.name,
    color: file.color,
    fare: typeof file.fare === "number" ? file.fare : 0,
    topology,
    legs,
    bidirectional,
    path: aggregatePath,
    coordinates: aggregateCoords,
    segments: legs.map((l) => l.coordinates).filter((c) => c.length >= 2),
  };
}

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

export async function loadRoutes(roads: RoadWay[]): Promise<JeepneyRoute[]> {
  // IMPORTANT: must use the same road filter as the editor so node ids
  // stay stable between saving (editor) and loading (app).
  const mainRoads = roads.filter((r) => MAIN_HIGHWAY.has(r.highway ?? ""));
  const graph = buildRoadGraph(mainRoads);

  const indexRes = await fetch("/routes/index.json");
  if (!indexRes.ok) {
    throw new Error(`routes/index.json: ${indexRes.status}`);
  }
  const index = (await indexRes.json()) as RouteIndex;

  const results = await Promise.all(
    index.files.map(async (file) => {
      try {
        const res = await fetch(`/routes/${file}`);
        if (!res.ok) {
          console.warn(`Skipping ${file}: HTTP ${res.status}`);
          return null;
        }
        const data = (await res.json()) as RouteFile;
        return fileToRoute(data, graph);
      } catch (e) {
        console.warn(`Skipping ${file}:`, e);
        return null;
      }
    })
  );

  return results.filter((r): r is JeepneyRoute => r !== null);
}
