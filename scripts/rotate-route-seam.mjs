// Rotate a closed-loop route's path so the seam (start/end) is at a
// chosen path index. Used when planning from one end of the route
// produces a wrap-around ride because the saved path's seam is in the
// "wrong" place.
//
// Usage:
//   node scripts/rotate-route-seam.mjs <routeId> <newSeamIndex>
// Example:
//   node scripts/rotate-route-seam.mjs drb 94
//
// The script preserves the closed-loop property: if path[0] === path[last]
// before rotation, the rotated path will have the new seam node at both
// start and end.

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const [, , routeId, seamIndexStr] = process.argv;
if (!routeId || !seamIndexStr) {
  console.error("Usage: node rotate-route-seam.mjs <routeId> <newSeamIndex>");
  process.exit(1);
}
const seamIndex = parseInt(seamIndexStr, 10);

const filePath = resolve(ROOT, `public/routes/${routeId}.json`);
const data = JSON.parse(readFileSync(filePath, "utf8"));

if (!Array.isArray(data.path)) {
  console.error(`Route ${routeId} has no top-level path array.`);
  process.exit(1);
}

const oldPath = data.path;
const isClosed =
  oldPath.length >= 2 && oldPath[0] === oldPath[oldPath.length - 1];

if (seamIndex < 0 || seamIndex >= oldPath.length) {
  console.error(
    `seam index ${seamIndex} out of range [0, ${oldPath.length - 1}]`
  );
  process.exit(1);
}

let newPath;
if (isClosed) {
  // Drop the duplicated last node, rotate, then re-append the new seam
  // so the closed-loop property is preserved.
  const stripped = oldPath.slice(0, -1);
  const cycle = [
    ...stripped.slice(seamIndex),
    ...stripped.slice(0, seamIndex),
  ];
  newPath = [...cycle, cycle[0]];
} else {
  // Open path — rotation isn't really meaningful, but preserve
  // behavior for symmetry.
  newPath = [...oldPath.slice(seamIndex), ...oldPath.slice(0, seamIndex)];
}

data.path = newPath;
writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n");

console.log(`Rotated ${routeId} seam to index ${seamIndex}.`);
console.log(`  before: path[0]=${oldPath[0]} path[${oldPath.length - 1}]=${oldPath[oldPath.length - 1]}`);
console.log(`  after:  path[0]=${newPath[0]} path[${newPath.length - 1}]=${newPath[newPath.length - 1]}`);
console.log(`  length: ${newPath.length} (was ${oldPath.length})`);
