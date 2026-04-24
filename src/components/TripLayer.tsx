import { Polyline, Marker } from "react-leaflet";
import L from "leaflet";
import { useAppStore } from "../store/useAppStore";
import type { TripStep } from "../types";

function flipCoords(coords: [number, number][]): [number, number][] {
  return coords.map(([lng, lat]) => [lat, lng]);
}

function stopIcon(label: string, color: string) {
  // Approximate pill width from label length; keeps the leaflet icon
  // container close to the actual rendered size (no phantom hitbox oval).
  const approxW = 18 + label.length * 7;
  return L.divIcon({
    className: "stop-pin",
    html: `<div style="
      background:white;color:${color};
      border:2px solid ${color};
      border-radius:9999px;
      padding:2px 7px;
      font-size:11px;font-weight:700;
      box-shadow:0 1px 3px rgba(0,0,0,0.25);
      white-space:nowrap;
      display:inline-block;
      line-height:1.2;
    ">${label}</div>`,
    iconSize: [approxW, 20],
    iconAnchor: [approxW / 2, 10],
  });
}

function stepLine(step: TripStep, i: number) {
  if (step.type === "walk") {
    const coords = step.coordinates ?? [step.from, step.to];
    const positions: [number, number][] = coords.map(([lng, lat]) => [lat, lng]);
    return (
      <Polyline
        key={`w-${i}`}
        positions={positions}
        pathOptions={{
          color: "#6b7280",
          weight: 3,
          opacity: 0.9,
          dashArray: "6 8",
        }}
      />
    );
  }
  const coords = step.coordinates ?? [step.from, step.to];
  return (
    <Polyline
      key={`j-${i}`}
      positions={flipCoords(coords)}
      pathOptions={{
        color: step.routeColor ?? "#059669",
        weight: 6,
        opacity: 1,
      }}
    />
  );
}

// Hide stop labels when the connected walk leg is tiny — they just clutter
// the map right next to the A/B markers.
const TINY_WALK_M = 50;

export function TripLayer() {
  const tripPlan = useAppStore((s) => s.tripPlan);
  if (!tripPlan) return null;

  const steps = tripPlan.steps;
  const jeepneySteps = steps.filter((s) => s.type === "jeepney");

  // Walk right before first jeepney = the boarding walk
  const firstJeepneyIdx = steps.findIndex((s) => s.type === "jeepney");
  const boardingWalk =
    firstJeepneyIdx > 0 ? steps[firstJeepneyIdx - 1] : null;
  // Walk right after last jeepney = the alighting walk
  const lastJeepneyIdx = steps.length - 1 - [...steps].reverse().findIndex((s) => s.type === "jeepney");
  const alightingWalk =
    lastJeepneyIdx >= 0 && lastJeepneyIdx < steps.length - 1
      ? steps[lastJeepneyIdx + 1]
      : null;

  const hideBoarding =
    boardingWalk != null && boardingWalk.distanceMeters < TINY_WALK_M;
  const hideAlighting =
    alightingWalk != null && alightingWalk.distanceMeters < TINY_WALK_M;

  return (
    <>
      {steps.map(stepLine)}
      {jeepneySteps.map((s, i) => {
        if (i === 0 && hideBoarding) return null;
        return (
          <Marker
            key={`board-${i}`}
            position={[s.from[1], s.from[0]]}
            icon={stopIcon(s.routeCode ?? "?", s.routeColor ?? "#059669")}
            interactive={false}
          />
        );
      })}
      {jeepneySteps.length > 0 && !hideAlighting && (
        <Marker
          position={[
            jeepneySteps[jeepneySteps.length - 1].to[1],
            jeepneySteps[jeepneySteps.length - 1].to[0],
          ]}
          icon={stopIcon(
            "Alight",
            jeepneySteps[jeepneySteps.length - 1].routeColor ?? "#059669"
          )}
          interactive={false}
        />
      )}
    </>
  );
}
