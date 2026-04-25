import { useEffect } from "react";
import { useMap } from "react-leaflet";
import { useAppStore } from "../store/useAppStore";

/** Mounted inside the MapContainer. Consumes `panRequest` from the
 *  store and animates the Leaflet map to the requested coords, then
 *  clears the request so subsequent calls re-trigger. */
export function MapPanController() {
  const map = useMap();
  const panRequest = useAppStore((s) => s.panRequest);
  const clearPanRequest = useAppStore((s) => s.clearPanRequest);

  useEffect(() => {
    if (!panRequest) return;
    const [lng, lat] = panRequest.coords;
    map.flyTo([lat, lng], panRequest.zoom ?? map.getZoom(), {
      duration: 0.8,
    });
    clearPanRequest();
  }, [panRequest, map, clearPanRequest]);

  return null;
}
