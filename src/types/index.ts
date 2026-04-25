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

/** One human-readable instruction inside a walking leg, e.g.
 *  "Walk south on Rizal Avenue for 200m" → { turn: "start", street:
 *  "Rizal Avenue", meters: 200, bearing: "south" }. Generated from the
 *  same node-path the walk polyline is rendered from, grouped by street. */
export interface WalkInstruction {
  /** "start" only for the first segment; "left"/"right"/"straight" at
   *  street transitions; "arrive" for the final stub leg. */
  turn: "start" | "left" | "right" | "straight" | "arrive";
  /** Street name for this instruction's segment, or null if unnamed. */
  street: string | null;
  meters: number;
  /** Compass bearing of the first segment in this instruction, used to
   *  word "Walk south on…" in the UI. */
  bearing: "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW";
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
  /** Turn-by-turn instructions, only populated on walk steps when the
   *  road graph is available. Undefined for the straight-line fallback. */
  instructions?: WalkInstruction[];
}

export interface TripPlan {
  steps: TripStep[];
  totalDistance: number;
  totalFare: number;
  totalWalkMinutes: number;
  transfers: number;
}
