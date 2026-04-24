import { useMemo, useState, useEffect } from "react";
import { Marker, Popup, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { useAppStore } from "../store/useAppStore";
import type { Place } from "../types";

// Category → color + emoji. Kept terse so markers stay tiny.
const CATEGORY_STYLE: Record<string, { color: string; icon: string }> = {
  mall: { color: "#7c3aed", icon: "🛍" },
  terminal: { color: "#f59e0b", icon: "🚌" },
  government: { color: "#2563eb", icon: "🏛" },
  hospital: { color: "#dc2626", icon: "🏥" },
  school: { color: "#0891b2", icon: "🎓" },
  church: { color: "#6b7280", icon: "⛪" },
  landmark: { color: "#059669", icon: "📍" },
  market: { color: "#ea580c", icon: "🥬" },
  park: { color: "#16a34a", icon: "🌳" },
  sports: { color: "#0ea5e9", icon: "⚽" },
  hotel: { color: "#be185d", icon: "🏨" },
  food: { color: "#e11d48", icon: "🍽" },
  cafe: { color: "#a16207", icon: "☕" },
  bank: { color: "#1e40af", icon: "🏦" },
  gas: { color: "#374151", icon: "⛽" },
  store: { color: "#0d9488", icon: "🏪" },
};
const DEFAULT_STYLE = { color: "#6b7280", icon: "•" };

const iconCache = new Map<string, L.DivIcon>();
function dotIcon(category: string): L.DivIcon {
  const cached = iconCache.get(category);
  if (cached) return cached;
  const s = CATEGORY_STYLE[category] ?? DEFAULT_STYLE;
  const icon = L.divIcon({
    className: "place-dot",
    html: `<div style="
      background:${s.color};
      width:18px;height:18px;border-radius:50%;
      border:2px solid white;
      box-shadow:0 1px 3px rgba(0,0,0,0.4);
      display:flex;align-items:center;justify-content:center;
      font-size:10px;line-height:1;
    ">${s.icon}</div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
  iconCache.set(category, icon);
  return icon;
}

// Min zoom level at which places become visible. Below this the map gets
// too busy with 196 markers.
const MIN_ZOOM = 14;

export function PlacesLayer() {
  const places = useAppStore((s) => s.places);
  const visibleCategories = useAppStore((s) => s.visibleCategories);
  const setPointA = useAppStore((s) => s.setPointA);
  const setPointB = useAppStore((s) => s.setPointB);
  const pickingFor = useAppStore((s) => s.pickingFor);
  const setPickingFor = useAppStore((s) => s.setPickingFor);

  const map = useMap();
  const [zoom, setZoom] = useState(map.getZoom());

  useMapEvents({
    zoomend() {
      setZoom(map.getZoom());
    },
  });

  useEffect(() => setZoom(map.getZoom()), [map]);

  // If the user is in picking mode, suppress place markers so map-clicks
  // actually pick a point instead of opening a popup.
  const visible = useMemo(() => {
    if (pickingFor) return [];
    if (zoom < MIN_ZOOM) return [];
    if (!visibleCategories) return places;
    return places.filter((p) => visibleCategories.has(p.category));
  }, [places, zoom, pickingFor, visibleCategories]);

  return (
    <>
      {visible.map((p) => (
        <PlaceMarker
          key={p.id}
          place={p}
          onPickA={() => {
            setPointA(p.coordinates);
            setPickingFor(null);
          }}
          onPickB={() => {
            setPointB(p.coordinates);
            setPickingFor(null);
          }}
        />
      ))}
    </>
  );
}

function PlaceMarker({
  place,
  onPickA,
  onPickB,
}: {
  place: Place;
  onPickA: () => void;
  onPickB: () => void;
}) {
  return (
    <Marker
      position={[place.coordinates[1], place.coordinates[0]]}
      icon={dotIcon(place.category)}
    >
      <Popup>
        <div className="min-w-[180px] max-w-[240px]">
          <div className="font-semibold text-sm text-gray-800">
            {place.name}
            {place.branch && (
              <span className="font-normal text-gray-600"> — {place.branch}</span>
            )}
          </div>
          <div className="text-[11px] text-gray-500 capitalize mb-1">
            {place.category}
          </div>
          {place.address && (
            <div className="text-[11px] text-gray-600 mb-2 leading-snug">
              {place.address}
            </div>
          )}
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={onPickA}
              className="flex-1 px-2 py-1 text-xs rounded bg-emerald-600 text-white hover:bg-emerald-700"
            >
              Set as From
            </button>
            <button
              type="button"
              onClick={onPickB}
              className="flex-1 px-2 py-1 text-xs rounded bg-red-600 text-white hover:bg-red-700"
            >
              Set as To
            </button>
          </div>
        </div>
      </Popup>
    </Marker>
  );
}
