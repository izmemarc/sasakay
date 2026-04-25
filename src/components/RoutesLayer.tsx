import { memo, useEffect, useState } from "react";
import { Polyline, Marker, useMap } from "react-leaflet";
import L from "leaflet";
import { useAppStore } from "../store/useAppStore";
import type { JeepneyRoute } from "../types";

// Below this zoom level on mobile, the arrow markers turn into noisy
// pixel clutter — hide them. Desktop keeps arrows at any zoom.
const ARROW_HIDE_BELOW_ZOOM = 14;

function toLatLng(coords: [number, number][]): [number, number][] {
  return coords.map(([lng, lat]) => [lat, lng]);
}

function usedRouteCodes(steps: { routeCode?: string }[]): Set<string> {
  const s = new Set<string>();
  for (const step of steps) if (step.routeCode) s.add(step.routeCode);
  return s;
}

function haversineM(
  [lng1, lat1]: [number, number],
  [lng2, lat2]: [number, number]
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function arrowPoints(
  coords: [number, number][],
  everyMeters: number
): Array<{ lat: number; lng: number; bearingDeg: number }> {
  const out: Array<{ lat: number; lng: number; bearingDeg: number }> = [];
  let accum = 0;
  let nextMark = everyMeters;
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1];
    const b = coords[i];
    const segLen = haversineM(a, b);
    if (segLen === 0) continue;
    while (accum + segLen >= nextMark) {
      const t = (nextMark - accum) / segLen;
      const lng = a[0] + (b[0] - a[0]) * t;
      const lat = a[1] + (b[1] - a[1]) * t;
      const dLng = b[0] - a[0];
      const dLat = b[1] - a[1];
      const bearingDeg = (Math.atan2(dLng, dLat) * 180) / Math.PI;
      out.push({ lat, lng, bearingDeg });
      nextMark += everyMeters;
    }
    accum += segLen;
  }
  return out;
}

function arrowIcon(color: string, bearingDeg: number) {
  return L.divIcon({
    className: "",
    html: `<div style="transform:rotate(${bearingDeg}deg);transform-origin:50% 50%;width:12px;height:12px;display:flex;align-items:center;justify-content:center;">
      <svg width="12" height="12" viewBox="0 0 14 14" xmlns="http://www.w3.org/2000/svg">
        <path d="M7 2 L11 10 L7 8 L3 10 Z" fill="${color}" stroke="white" stroke-width="0.7"/>
      </svg>
    </div>`,
    iconSize: [12, 12],
    iconAnchor: [6, 6],
  });
}

interface RouteOverlayProps {
  route: JeepneyRoute;
  opacity: number;
  showArrows: boolean;
}

// Per-route subcomponent so React skips work when only an unrelated
// route's props change. Polylines and arrow markers are recreated only
// when this route's own props change — Leaflet's underlying layers stay
// mounted across unrelated renders.
const RouteOverlay = memo(function RouteOverlay({
  route,
  opacity,
  showArrows,
}: RouteOverlayProps) {
  const elements: React.ReactNode[] = [];
  route.segments.forEach((seg, si) => {
    elements.push(
      <Polyline
        key={`${route.id}-${si}`}
        positions={toLatLng(seg)}
        pathOptions={{ color: route.color, opacity, weight: 3 }}
      />
    );
    if (showArrows && route.topology === "loop") {
      arrowPoints(seg, 400).forEach((a, j) =>
        elements.push(
          <Marker
            key={`${route.id}-${si}-arrow-${j}`}
            position={[a.lat, a.lng]}
            icon={arrowIcon(route.color, a.bearingDeg)}
            interactive={false}
          />
        )
      );
    }
  });
  return <>{elements}</>;
});

export function RoutesLayer() {
  const routes = useAppStore((s) => s.routes);
  const tripPlan = useAppStore((s) => s.tripPlan);
  const showRoutes = useAppStore((s) => s.showRoutes);
  const visibleRouteIds = useAppStore((s) => s.visibleRouteIds);
  const map = useMap();
  const [zoom, setZoom] = useState(() => map.getZoom());
  useEffect(() => {
    const update = () => setZoom(map.getZoom());
    map.on("zoomend", update);
    return () => {
      map.off("zoomend", update);
    };
  }, [map]);

  if (!showRoutes) return null;

  const active = tripPlan ? usedRouteCodes(tripPlan.steps) : null;
  const zoomedOut = zoom < ARROW_HIDE_BELOW_ZOOM;

  return (
    <>
      {routes.map((r: JeepneyRoute) => {
        if (!visibleRouteIds.has(r.id)) return null;
        const isActive = active ? active.has(r.code) : null;
        // When a trip is active, the active route's sliced A→B path is
        // drawn by TripLayer; skip its full polyline here to avoid
        // visual clutter.
        if (isActive) return null;
        const opacity = active === null ? 0.7 : 0.15;
        // Hide arrows on the active-trip view (cleaner) AND when zoomed
        // out far enough that they'd be unreadable noise.
        const showArrows = active === null && !zoomedOut;
        return (
          <RouteOverlay
            key={r.id}
            route={r}
            opacity={opacity}
            showArrows={showArrows}
          />
        );
      })}
    </>
  );
}
