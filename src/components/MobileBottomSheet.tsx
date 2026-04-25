import { useEffect, useState } from "react";
import { ArrowRight, Loader2, X, Info } from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import { planTrips } from "../lib/routing";
import { PointRow } from "./PointPicker";

interface Props {
  onOpenAbout: () => void;
}

/**
 * Mobile-only floating card. Single mode — content never changes.
 * The card rides the on-screen keyboard via `transform: translateY`
 * computed from `visualViewport`. No state machine, no fade between
 * modes, no cached heights — those previous attempts all introduced
 * race conditions on iOS Safari that produced glitches and snaps.
 *
 * Behavior:
 *   - When keyboard is closed: card sits 8px above the screen bottom.
 *   - When keyboard is open: card rides 8px above the keyboard,
 *     tracking iOS's slide animation frame-by-frame (no CSS transition
 *     on transform — the OS animation IS the smoothness).
 *   - max-height clamps to visible viewport so the card never extends
 *     behind the keyboard.
 */
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

  // Visual viewport — `vvBottom` is the bottom edge of the visible
  // area in layout-viewport coords; shrinks when iOS keyboard opens.
  // `vvHeight` is the visible viewport height — used to cap the card.
  const [vvHeight, setVvHeight] = useState(
    typeof window !== "undefined" ? window.innerHeight : 0
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    const vv = window.visualViewport;
    if (!vv) return;
    let raf = 0;
    const update = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        setVvHeight(Math.round(vv.height));
      });
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      cancelAnimationFrame(raf);
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  const canFind = pointA && pointB && routes.length > 0 && !searching;
  const hasAnything = pointA || pointB || tripPlan;

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

  // Anchor with `top: 0` + `transform: translateY(N)`. On iOS Safari
  // iOS Safari 26 shrinks `window.innerHeight` itself when the
  // on-screen keyboard opens — the layout viewport ends where the
  // keyboard starts. So a plain `bottom: 8px` is enough to place the
  // card above the keyboard; no visualViewport math required. We
  // still clamp `maxHeight` to the visible viewport so the card
  // never extends behind the keyboard area on browsers (or older iOS
  // versions) that don't shrink the layout viewport.
  const maxH = Math.max(180, vvHeight - 16);

  return (
    <div
      className="md:hidden fixed left-2 right-2 z-[1100] flex flex-col bg-white shadow-[0_8px_30px_rgba(0,0,0,0.18),_0_-2px_8px_rgba(0,0,0,0.04)] rounded-2xl ring-1 ring-black/5"
      style={{
        // iOS Safari 26 shrinks the LAYOUT viewport when the keyboard
        // opens (window.innerHeight drops from 699 → 377), so a
        // simple `bottom: 8px` puts the card 8px above the keyboard
        // automatically — no math, no visualViewport tracking needed.
        // We keep the transition brief so swap-on-second-focus still
        // looks smooth instead of jumping.
        bottom: 8,
        top: "auto",
        transform: "none",
        maxHeight: `${maxH}px`,
        transition:
          "bottom 200ms cubic-bezier(.32,.72,0,1), max-height 220ms cubic-bezier(.32,.72,0,1)",
      }}
    >
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

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 pt-1 pb-5">
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
