import { useState } from "react";
import { ArrowRight, Loader2, X, Info } from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import { planTrips } from "../lib/routing";
import { PointRow } from "./PointPicker";

interface Props {
  onOpenAbout: () => void;
}

/** Mobile-only bottom sheet (iOS Maps-style floating card). The card
 *  hugs its content via max-height; it scrolls inside if content is
 *  taller than the cap. No drag — the card is a static surface. */
export function MobileBottomSheet({ onOpenAbout }: Props) {
  const pointA = useAppStore((s) => s.pointA);
  const pointB = useAppStore((s) => s.pointB);
  const routes = useAppStore((s) => s.routes);
  const roads = useAppStore((s) => s.roads);
  const tripPlan = useAppStore((s) => s.tripPlan);
  const setTripCandidates = useAppStore((s) => s.setTripCandidates);
  const clearTrip = useAppStore((s) => s.clearTrip);
  const loadError = useAppStore((s) => s.loadError);

  const [searching, setSearching] = useState(false);
  const [noRouteMsg, setNoRouteMsg] = useState<string | null>(null);

  const canFind = pointA && pointB && routes.length > 0 && !searching;
  const hasAnything = pointA || pointB || tripPlan;

  // When a trip is set the DirectionsPanel takes the bottom; hide the
  // sheet entirely so they don't fight over the same edge.
  if (tripPlan) return null;

  const onFind = () => {
    if (!pointA || !pointB || searching) return;
    setNoRouteMsg(null);
    setSearching(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        try {
          const candidates = planTrips(pointA, pointB, routes, roads, 20);
          if (candidates.length === 0) {
            setNoRouteMsg(
              "No jeepney route found. Try moving the points closer to a road or pick a different destination."
            );
            setTripCandidates([]);
            return;
          }
          setTripCandidates(candidates);
        } finally {
          setSearching(false);
        }
      });
    });
  };

  return (
    <div
      className="md:hidden fixed z-[1100] flex flex-col bg-white shadow-[0_8px_30px_rgba(0,0,0,0.18),_0_-2px_8px_rgba(0,0,0,0.04)] rounded-2xl ring-1 ring-black/5"
      style={{
        left: "max(8px, env(safe-area-inset-left, 0px))",
        right: "max(8px, env(safe-area-inset-right, 0px))",
        bottom: "max(8px, env(safe-area-inset-bottom, 0px))",
        // Cap so the card never covers the whole screen — content
        // scrolls inside if needed.
        maxHeight: "70vh",
      }}
    >
      {/* Header */}
      <div className="shrink-0">
        <div className="px-5 pt-4 pb-3 flex items-start justify-between gap-3">
          <button
            type="button"
            onClick={onOpenAbout}
            className="min-w-0 flex-1 text-left"
          >
            <h1 className="text-[20px] font-bold text-gray-900 leading-tight tracking-tight">
              Sasakay
            </h1>
            <p className="text-[13px] text-gray-500 mt-0.5 truncate">
              Legazpi jeepney trip planner
            </p>
          </button>
          <div className="flex items-center gap-1 shrink-0 -mr-1.5">
            {hasAnything && (
              <button
                type="button"
                onClick={() => {
                  clearTrip();
                  setNoRouteMsg(null);
                }}
                title="Clear all"
                aria-label="Clear all"
                className="w-9 h-9 flex items-center justify-center text-gray-500 hover:bg-gray-100 active:bg-gray-200 rounded-full"
              >
                <X size={18} />
              </button>
            )}
            <button
              type="button"
              onClick={onOpenAbout}
              title="About"
              aria-label="About"
              className="w-9 h-9 flex items-center justify-center text-gray-500 hover:bg-gray-100 active:bg-gray-200 rounded-full"
            >
              <Info size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="min-h-0 overflow-y-auto overscroll-contain px-5 pt-1 pb-5">
        <div className="space-y-4">
          <PointRow target="A" label="From" dotColor="#059669" />
          <PointRow target="B" label="To" dotColor="#dc2626" />

          <button
            type="button"
            disabled={!canFind}
            onClick={onFind}
            aria-busy={searching}
            className="w-full h-12 text-[15px] font-semibold rounded-xl bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 active:bg-emerald-800 disabled:bg-gray-200 disabled:text-gray-400 disabled:shadow-none disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {searching ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Finding routes…
              </>
            ) : (
              <>
                Find route
                <ArrowRight size={16} />
              </>
            )}
          </button>

          {loadError && (
            <div className="text-[13px] text-red-700 bg-red-50 ring-1 ring-red-100 rounded-xl px-3 py-2.5">
              Data error: {loadError}
            </div>
          )}
          {noRouteMsg && (
            <div className="text-[13px] text-amber-800 bg-amber-50 ring-1 ring-amber-100 rounded-xl px-3 py-2.5">
              {noRouteMsg}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
