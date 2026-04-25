import { Marker } from "react-leaflet";
import L from "leaflet";
import { useAppStore } from "../store/useAppStore";

const userIcon = L.divIcon({
  className: "user-location-pin",
  html: `<div style="position:relative;width:18px;height:18px;">
    <div style="position:absolute;inset:0;border-radius:50%;background:#3b82f6;opacity:0.25;animation:user-pulse 2s ease-out infinite;"></div>
    <div style="position:absolute;inset:3px;border-radius:50%;background:#3b82f6;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.35);"></div>
  </div>
  <style>@keyframes user-pulse{0%{transform:scale(1);opacity:0.45}100%{transform:scale(2.4);opacity:0}}</style>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

/** Distance in meters between two [lng, lat] points (haversine). */
function distM(a: [number, number], b: [number, number]): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[1])) *
      Math.cos(toRad(b[1])) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

/** Blue "you are here" dot. Hidden when the user has selected their
 *  location as point A or B — the colored A/B pin already conveys
 *  the position there, and stacking the blue dot on top of it is
 *  visually noisy. */
export function UserLocationMarker() {
  const userLocation = useAppStore((s) => s.userLocation);
  const pointA = useAppStore((s) => s.pointA);
  const pointB = useAppStore((s) => s.pointB);
  const tripPlan = useAppStore((s) => s.tripPlan);
  // Hide the user dot during an active trip — the focus is on the
  // route + A/B pins; the blue dot adds visual noise that competes
  // with the trip's start point.
  if (tripPlan) return null;
  if (!userLocation) return null;
  const NEAR_M = 15;
  if (pointA && distM(userLocation, pointA) < NEAR_M) return null;
  if (pointB && distM(userLocation, pointB) < NEAR_M) return null;
  return (
    <Marker
      position={[userLocation[1], userLocation[0]]}
      icon={userIcon}
      interactive={false}
      keyboard={false}
    />
  );
}
