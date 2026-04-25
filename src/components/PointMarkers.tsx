import { Marker, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { useAppStore } from "../store/useAppStore";

function pinIcon(color: string, label: string) {
  return L.divIcon({
    className: "point-pin",
    html: `<div style="
      background:${color};
      color:white;
      width:28px;height:28px;border-radius:50% 50% 50% 0;
      transform:rotate(-45deg);
      display:flex;align-items:center;justify-content:center;
      box-shadow:0 2px 6px rgba(0,0,0,0.35);
      border:2px solid white;
      font-weight:700;font-size:14px;
    "><span style="transform:rotate(45deg);">${label}</span></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
  });
}

const iconA = pinIcon("#059669", "A");
const iconB = pinIcon("#dc2626", "B");

export function PointMarkers() {
  const pointA = useAppStore((s) => s.pointA);
  const pointB = useAppStore((s) => s.pointB);
  const pickingFor = useAppStore((s) => s.pickingFor);
  const setPointA = useAppStore((s) => s.setPointA);
  const setPointB = useAppStore((s) => s.setPointB);
  const setPickingFor = useAppStore((s) => s.setPickingFor);

  useMapEvents({
    click(e) {
      if (!pickingFor) return;
      const coords: [number, number] = [e.latlng.lng, e.latlng.lat];
      if (pickingFor === "A") setPointA(coords, "Pinned location");
      else setPointB(coords, "Pinned location");
      setPickingFor(null);
    },
  });

  return (
    <>
      {pointA && (
        <Marker
          position={[pointA[1], pointA[0]]}
          icon={iconA}
          interactive={false}
        />
      )}
      {pointB && (
        <Marker
          position={[pointB[1], pointB[0]]}
          icon={iconB}
          interactive={false}
        />
      )}
    </>
  );
}
