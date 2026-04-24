import type { LatLngBoundsExpression } from "leaflet";

export interface CityConfig {
  name: string;
  shortName: string;
  themeColor: string;
  center: [number, number];
  bounds: LatLngBoundsExpression;
  preloadBounds: { south: number; west: number; north: number; east: number };
  minZoom: number;
  maxZoom: number;
  maxNativeZoom: number;
  defaultZoom: number;
  tileUrl: string;
  tileSubdomains: string;
  tileAttribution: string;
  preloadZooms: number[];
}

export const cityConfig: CityConfig = {
  name: "Legazpi",
  shortName: "Legazpi",
  themeColor: "#059669",
  center: [13.15, 123.735],
  bounds: [
    [13.12, 123.71],
    [13.18, 123.76],
  ],
  preloadBounds: { south: 13.12, west: 123.71, north: 13.18, east: 123.76 },
  minZoom: 15,
  maxZoom: 20,
  maxNativeZoom: 19,
  defaultZoom: 15,
  tileUrl:
    "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
  tileSubdomains: "abcd",
  tileAttribution:
    '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>',
  preloadZooms: [15, 16, 17],
};
