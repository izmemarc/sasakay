export type RouteTopology = "corridor" | "loop";

/** A single directional traversal the jeep actually drives. Every real
 *  route is one or two of these. */
export interface RouteLeg {
  id: "outbound" | "return";
  /** Ordered graph node ids the jeep visits on this leg. */
  path: number[];
  /** Flattened polyline for this leg. */
  coordinates: [number, number][];
}

export interface JeepneyRoute {
  id: string;
  code: string;
  name: string;
  color: string;
  fare: number;
  /** Legacy classifier, kept so old files still load.
   *  - "corridor" = single bidirectional leg (legs.length=1, both directions legal)
   *  - "loop"     = single one-way leg that closes back on itself */
  topology: RouteTopology;
  /** The legs the jeep drives.
   *  - 1 leg  = corridor (bidirectional) OR loop (one-way, closed)
   *  - 2 legs = "lollipop" / split routes (outbound one way, return another way) */
  legs: RouteLeg[];
  /** True if the single leg is bidirectional (corridors). */
  bidirectional: boolean;
  /** Legacy aggregate: all leg coordinates concatenated. Kept so code
   *  that just renders "the whole route" keeps working. */
  coordinates: [number, number][];
  /** Legacy aggregate path — same idea. */
  path: number[];
  /** One polyline per leg (RouteLeg.coordinates). */
  segments: [number, number][][];
}

export interface Place {
  id: string;
  name: string;
  aliases: string[];
  category: string;
  coordinates: [number, number];
  /** Short disambiguator when multiple places share a name (e.g. branch
   *  name, barangay, nearest cross street). Optional. */
  branch?: string;
  /** Full street address for the "more info" display in popups. */
  address?: string;
}

export interface TripStep {
  type: "walk" | "jeepney";
  from: [number, number];
  to: [number, number];
  distanceMeters: number;
  routeCode?: string;
  routeName?: string;
  routeColor?: string;
  fare?: number;
  coordinates?: [number, number][];
  durationMinutes?: number;
}

export interface TripPlan {
  steps: TripStep[];
  totalDistance: number;
  totalFare: number;
  totalWalkMinutes: number;
  transfers: number;
}
