import { useMemo } from "react";
import { Polyline } from "react-leaflet";
import { useAppStore } from "../store/useAppStore";

// Quiet overlay that proves roads.geojson loaded; later this is also what the
// admin route-picker will render and make clickable.
export function RoadsLayer({ show = true }: { show?: boolean }) {
  const roads = useAppStore((s) => s.roads);

  const positions = useMemo(
    () =>
      roads.map((r) =>
        r.coordinates.map(([lng, lat]) => [lat, lng] as [number, number])
      ),
    [roads]
  );

  if (!show || positions.length === 0) return null;

  return (
    <>
      {positions.map((pts, i) => (
        <Polyline
          key={i}
          positions={pts}
          pathOptions={{ color: "#94a3b8", weight: 1, opacity: 0.35 }}
          interactive={false}
        />
      ))}
    </>
  );
}
