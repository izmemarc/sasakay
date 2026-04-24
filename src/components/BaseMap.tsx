import type { ReactNode } from "react";
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

export function BaseMap({ children }: { children?: ReactNode }) {
  return (
    <MapContainer
      center={cityConfig.center}
      zoom={cityConfig.defaultZoom}
      minZoom={cityConfig.minZoom}
      maxZoom={cityConfig.maxZoom}
      maxBoundsViscosity={1}
      scrollWheelZoom
      zoomSnap={0.1}
      zoomDelta={0.5}
      wheelPxPerZoomLevel={60}
      wheelDebounceTime={20}
      zoomControl
      className="h-full w-full"
    >
      <TileLayer
        url={cityConfig.tileUrl}
        attribution={cityConfig.tileAttribution}
        subdomains={cityConfig.tileSubdomains}
        maxZoom={cityConfig.maxZoom}
        maxNativeZoom={cityConfig.maxNativeZoom}
      />
      <BoundsController bounds={cityConfig.bounds} />
      {children}
    </MapContainer>
  );
}
