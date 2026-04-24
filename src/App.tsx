import { useEffect, useState } from "react";
import { useAppStore } from "./store/useAppStore";
import { preloadTiles } from "./lib/preloadTiles";
import { cityConfig } from "./config";
import { BaseMap } from "./components/BaseMap";
import { PointMarkers } from "./components/PointMarkers";
import { PlacesLayer } from "./components/PlacesLayer";
import { RoutesLayer } from "./components/RoutesLayer";
import { PointPicker } from "./components/PointPicker";
import { TripLayer } from "./components/TripLayer";
import { DirectionsPanel } from "./components/DirectionsPanel";
import { RouteEditor } from "./components/RouteEditor";
import { RoutesToggle } from "./components/RoutesToggle";
import { RoutesManager } from "./components/RoutesManager";
import { CategoryFilter } from "./components/CategoryFilter";
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
  const [preloadPct, setPreloadPct] = useState<number | null>(null);
  const [managerOpen, setManagerOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);

  useEffect(() => {
    void loadData();
  }, [loadData]);

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
      </BaseMap>
      <PointPicker onOpenAbout={() => setAboutOpen(true)} />
      <CategoryFilter />
      <RoutesToggle onOpenManager={() => setManagerOpen(true)} />
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
