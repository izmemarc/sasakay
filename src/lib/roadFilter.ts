// Shared road-filter rules used by BOTH the editor and the runtime
// route loader. Node ids are derived from coordinates and the graph is
// built from whatever roads pass this filter — so the editor (which
// produces saved paths) and the loader (which resolves them) MUST see
// the exact same road set, or saved routes break silently.
//
// Add a new street here and it is immediately visible to both sides.

import type { RoadWay } from "./loadRoads";

export const MAIN_HIGHWAY: ReadonlySet<string> = new Set([
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

// Streets below the MAIN_HIGHWAY classes that real jeeps still use.
// Included by name so we don't drag the whole residential network in.
export const EXTRA_ROADS_BY_NAME: ReadonlySet<string> = new Set([
  "Vinzons Street",
]);

export function isJeepneyDrivable(r: RoadWay): boolean {
  return (
    MAIN_HIGHWAY.has(r.highway ?? "") ||
    EXTRA_ROADS_BY_NAME.has(r.name ?? "")
  );
}
