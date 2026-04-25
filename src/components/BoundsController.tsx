import { useEffect } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";

interface Props {
  bounds: L.LatLngBoundsExpression;
}

// Leaflet's maxBounds clamps the map CENTER, not the viewport. That means at
// high zoom the usable pan area shrinks visually (you see a smaller invisible
// box the center can travel within). We want the VIEWPORT edges clamped to
// the original bounds, so users can scroll until the real edge of Legazpi
// reaches the screen edge. Pad maxBounds by half-viewport on each side.
export function BoundsController({ bounds }: Props) {
  const map = useMap();

  useEffect(() => {
    const b = bounds as [[number, number], [number, number]];
    const base = L.latLngBounds(
      L.latLng(b[0][0], b[0][1]),
      L.latLng(b[1][0], b[1][1])
    );

    // Asymmetric padding: extra slack horizontally so wide desktop
    // viewports can scroll a bit east/west of the city, tighter
    // vertically so users don't pan into empty ocean above or below
    // Legazpi.
    const latSpan = base.getNorth() - base.getSouth();
    const lngSpan = base.getEast() - base.getWest();
    const PAD_LNG = 0.6;
    const PAD_LAT = 0.07;
    const padded = L.latLngBounds(
      L.latLng(
        base.getSouth() - latSpan * PAD_LAT,
        base.getWest() - lngSpan * PAD_LNG
      ),
      L.latLng(
        base.getNorth() + latSpan * PAD_LAT,
        base.getEast() + lngSpan * PAD_LNG
      )
    );
    map.setMaxBounds(padded);
  }, [map, bounds]);

  return null;
}
