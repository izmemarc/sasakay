import { useEffect, useState, type ReactNode } from "react";
import { MapContainer, TileLayer } from "react-leaflet";
import L from "leaflet";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import { cityConfig } from "../config";
import { BoundsController } from "./BoundsController";

L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

// Allow phones to pinch out wider than the desktop floor — the smaller
// viewport benefits from more context. Desktop keeps the tighter floor
// since the canvas is already large.
const MOBILE_MIN_ZOOM_OFFSET = 3;

export function BaseMap({ children }: { children?: ReactNode }) {
  // Synchronously initialize so the very first render already has the
  // right minZoom — otherwise the map mounts at desktop floor on
  // mobile and Leaflet locks viewers out of pinching wider.
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" &&
    window.matchMedia("(max-width: 767px)").matches
  );
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const minZoom = isMobile
    ? Math.max(1, cityConfig.minZoom - MOBILE_MIN_ZOOM_OFFSET)
    : cityConfig.minZoom;

  return (
    <MapContainer
      center={cityConfig.center}
      zoom={cityConfig.defaultZoom}
      minZoom={minZoom}
      maxZoom={cityConfig.maxZoom}
      maxBoundsViscosity={1}
      scrollWheelZoom
      zoomSnap={0.1}
      zoomDelta={0.5}
      wheelPxPerZoomLevel={60}
      wheelDebounceTime={20}
      // Hide the default +/- buttons on every viewport — pinch / scroll
      // wheel handle zooming and the buttons are visual clutter.
      zoomControl={false}
      className="h-full w-full"
    >
      <TileLayer
        url={cityConfig.tileUrl}
        attribution={cityConfig.tileAttribution}
        subdomains={cityConfig.tileSubdomains}
        maxZoom={cityConfig.maxZoom}
        maxNativeZoom={cityConfig.maxNativeZoom}
      />
      {/* Bounds clamp on desktop only. On mobile the viewport at the
          loosest pinch-out is bigger than any reasonable padded box,
          so any clamp during the gesture feels like a snap. */}
      {!isMobile && <BoundsController bounds={cityConfig.bounds} />}
      {children}
    </MapContainer>
  );
}
