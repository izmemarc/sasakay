import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import { useAppStore } from "../store/useAppStore";

/** Mounted inside the MapContainer. Consumes `panRequest` from the
 *  store and animates the Leaflet map to the requested target, then
 *  clears the request so subsequent calls re-trigger.
 *
 *  Two request kinds:
 *   - kind: "pan" → smooth panTo/flyTo a single coord at a zoom
 *   - kind: "fit" → fitBounds with padding (used after Find Route to
 *     show the whole trip)
 *
 *  Debounced + dedupe: rapid identical requests are collapsed into a
 *  single animation. Without this the map appears to jitter as
 *  successive flyTos restart from intermediate positions.
 */
export function MapPanController() {
  const map = useMap();
  const panRequest = useAppStore((s) => s.panRequest);
  const clearPanRequest = useAppStore((s) => s.clearPanRequest);
  const lastKey = useRef<{ key: string; t: number } | null>(null);

  useEffect(() => {
    if (!panRequest) return;
    const now = Date.now();
    const key =
      panRequest.kind === "pan"
        ? `pan:${panRequest.coords[0].toFixed(5)},${panRequest.coords[1].toFixed(5)}:${panRequest.zoom ?? "_"}`
        : `fit:${panRequest.bounds[0].join(",")}:${panRequest.bounds[1].join(",")}`;
    const last = lastKey.current;
    if (last && last.key === key && now - last.t < 1200) {
      clearPanRequest();
      return;
    }
    lastKey.current = { key, t: now };
    map.stop();
    if (panRequest.kind === "pan") {
      const [lng, lat] = panRequest.coords;
      const targetZoom = panRequest.zoom ?? map.getZoom();
      // On mobile, the bottom card covers ~45% of the viewport. To
      // keep the target visually centered in the *uncovered* map
      // area, shift the destination latitude UP by half the card's
      // share of the viewport in projected pixels.
      let targetLatLng = L.latLng(lat, lng);
      const isMobile = window.matchMedia("(max-width: 767px)").matches;
      if (isMobile) {
        const viewportH = map.getSize().y;
        const offsetPx = Math.round(viewportH * 0.225); // half of 45%
        // Convert the target to a pixel point at the target zoom,
        // shift it down (so the actual map shifts up), then back to
        // latlng.
        const pt = map.project(targetLatLng, targetZoom);
        pt.y += offsetPx;
        targetLatLng = map.unproject(pt, targetZoom);
      }
      if (Math.abs(targetZoom - map.getZoom()) < 0.5) {
        map.panTo(targetLatLng, { animate: true, duration: 0.6 });
      } else {
        map.flyTo(targetLatLng, targetZoom, { duration: 0.8 });
      }
    } else {
      // kind === "fit"
      const pad = panRequest.padding ?? 60;
      const bounds = L.latLngBounds(
        L.latLng(panRequest.bounds[0][1], panRequest.bounds[0][0]),
        L.latLng(panRequest.bounds[1][1], panRequest.bounds[1][0])
      );
      // Asymmetric padding: on mobile the bottom card / directions
      // panel covers ~40% of the viewport — pad the BOTTOM more so
      // the trip extent sits centered in the still-visible map area
      // above the card.
      const isMobile = window.matchMedia("(max-width: 767px)").matches;
      const bottomPad = isMobile
        ? Math.round(window.innerHeight * 0.45)
        : pad;
      map.flyToBounds(bounds, {
        paddingTopLeft: [pad, pad],
        paddingBottomRight: [pad, bottomPad],
        duration: 0.9,
      });
    }
    clearPanRequest();
  }, [panRequest, map, clearPanRequest]);

  return null;
}
