import { useEffect, useState } from "react";
import { useAppStore } from "./store/useAppStore";
import { preloadTiles } from "./lib/preloadTiles";
import { cityConfig } from "./config";
import { BaseMap } from "./components/BaseMap";
import { PointMarkers } from "./components/PointMarkers";
import { UserLocationMarker } from "./components/UserLocationMarker";
import { PlacesLayer } from "./components/PlacesLayer";
import { RoutesLayer } from "./components/RoutesLayer";
import { PointPicker } from "./components/PointPicker";
import { TripLayer } from "./components/TripLayer";
import { DirectionsPanel } from "./components/DirectionsPanel";
import { RouteEditor } from "./components/RouteEditor";
import { RoutesToggle } from "./components/RoutesToggle";
import { RoutesManager } from "./components/RoutesManager";
import { CategoryFilter } from "./components/CategoryFilter";
import { MobileBottomSheet } from "./components/MobileBottomSheet";
import { MobileFilterRail } from "./components/MobileFilterRail";
import { LocateMeButton } from "./components/LocateMeButton";
import { AboutSheet } from "./components/AboutSheet";
import { CreditStrip } from "./components/CreditStrip";
import { WelcomeSplash } from "./components/WelcomeSplash";

export default function App() {
  const params = new URLSearchParams(window.location.search);
  const editId = params.get("edit");
  if (editId) return <RouteEditor initialId={editId} />;
  return <TripPlanner />;
}

function TripPlanner() {
  const loadData = useAppStore((s) => s.loadData);
  const requestPan = useAppStore((s) => s.requestPan);
  const setUserLocation = useAppStore((s) => s.setUserLocation);
  const [preloadPct, setPreloadPct] = useState<number | null>(null);
  // Auto-open the routes manager when returning from the editor
  // (`/?manage=1`) so Back lands on a known surface, not the blank
  // trip planner.
  const [managerOpen, setManagerOpen] = useState(() =>
    new URLSearchParams(window.location.search).has("manage")
  );
  const [aboutOpen, setAboutOpen] = useState(false);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Silent best-effort geolocation on mount — MOBILE ONLY. Desktop
  // users mostly aren't physically near Legazpi (the city this app
  // is for); auto-recentering can teleport them away from the map
  // they were exploring. The Locate-Me FAB stays available for
  // explicit re-center. Mobile users opening the app while nearby
  // benefit from the auto-center, so we keep it there.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.matchMedia("(max-width: 767px)").matches) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    let cancelled = false;
    // Use Permissions API where available so we don't trigger a
    // prompt on browsers that haven't already granted.
    const tryLocate = () => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (cancelled) return;
          const coords: [number, number] = [
            pos.coords.longitude,
            pos.coords.latitude,
          ];
          setUserLocation(coords);
          requestPan(coords, 16);
        },
        () => {
          /* silent */
        },
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 5 * 60_000 }
      );
    };
    if ("permissions" in navigator) {
      navigator.permissions
        .query({ name: "geolocation" as PermissionName })
        .then((p) => {
          if (p.state === "granted") tryLocate();
        })
        .catch(() => {
          /* permissions API not available; skip silent locate */
        });
    }
    return () => {
      cancelled = true;
    };
  }, [requestPan, setUserLocation]);

  // Strip ?manage=1 from the URL once consumed so the user's address
  // bar doesn't carry it around forever.
  useEffect(() => {
    if (managerOpen && window.location.search.includes("manage")) {
      const url = new URL(window.location.href);
      url.searchParams.delete("manage");
      window.history.replaceState({}, "", url.toString());
    }
  }, [managerOpen]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      void preloadTiles({
        bounds: cityConfig.preloadBounds,
        zooms: cityConfig.preloadZooms,
        onProgress: (done, total) => {
          const pct = Math.round((done / total) * 100);
          setPreloadPct(pct < 100 ? pct : null);
        },
      });
    }, 1500);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <div className="relative h-screen w-screen">
      <BaseMap>
        <RoutesLayer />
        <PlacesLayer />
        <TripLayer />
        <PointMarkers />
        <UserLocationMarker />
      </BaseMap>
      <PointPicker onOpenAbout={() => setAboutOpen(true)} />
      <CategoryFilter />
      <MobileBottomSheet onOpenAbout={() => setAboutOpen(true)} />
      <MobileFilterRail />
      <LocateMeButton />
      {/* RoutesToggle (the "Routes" / Manage button) is hidden in
          production. The RoutesManager itself stays mounted so the
          editor's Back link (?manage=1) still opens it. */}
      {import.meta.env.DEV && (
        <RoutesToggle onOpenManager={() => setManagerOpen(true)} />
      )}
      <RoutesManager open={managerOpen} onClose={() => setManagerOpen(false)} />
      <DirectionsPanel />
      <CreditStrip onOpen={() => setAboutOpen(true)} />
      <AboutSheet open={aboutOpen} onClose={() => setAboutOpen(false)} />
      <WelcomeSplash />
      {preloadPct !== null && (
        <div className="absolute bottom-3 right-3 md:bottom-4 md:right-4 z-[1000] bg-white/90 backdrop-blur rounded-full shadow px-3 py-1 text-xs text-gray-700">
          Caching map… {preloadPct}%
        </div>
      )}
    </div>
  );
}
