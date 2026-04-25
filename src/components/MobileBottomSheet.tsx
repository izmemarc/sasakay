import { useEffect, useState } from "react";
import { ArrowRight, Loader2, X, Info } from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import { planTrips } from "../lib/routing";
import { PointRow } from "./PointPicker";
import { SwapButton } from "./SwapButton";

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
  // Which PointRow input is focused, if any. We hide the inactive
  // row + Find button while typing so the dropdown for the active
  // row has more vertical room above the keyboard.
  const [focusedTarget, setFocusedTarget] = useState<"A" | "B" | null>(null);

  // Visual viewport — `vvHeight` is the visible viewport height; on
  // iOS Safari it shrinks when the on-screen keyboard opens.
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
      raf = requestAnimationFrame(() => setVvHeight(Math.round(vv.height)));
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
          // Auto-fit map to the trip extent.
          const plan = candidates[0]?.plan;
          if (plan && pointA && pointB) {
            let minLng = Infinity,
              minLat = Infinity,
              maxLng = -Infinity,
              maxLat = -Infinity;
            const visit = ([lng, lat]: [number, number]) => {
              if (lng < minLng) minLng = lng;
              if (lat < minLat) minLat = lat;
              if (lng > maxLng) maxLng = lng;
              if (lat > maxLat) maxLat = lat;
            };
            visit(pointA);
            visit(pointB);
            for (const step of plan.steps) {
              if (step.coordinates) step.coordinates.forEach(visit);
              else {
                visit(step.from);
                visit(step.to);
              }
            }
            if (Number.isFinite(minLng)) {
              useAppStore.getState().requestFit([
                [minLng, minLat],
                [maxLng, maxLat],
              ]);
            }
          }
        } finally {
          setSearching(false);
        }
      });
    });
  };

  const maxH = Math.max(180, vvHeight - 16);

  return (
    <div
      className="md:hidden fixed left-2 right-2 z-[1100] flex flex-col bg-white/70 backdrop-blur-xl backdrop-saturate-150 shadow-[0_8px_30px_rgba(0,0,0,0.18),_0_-2px_8px_rgba(0,0,0,0.04)] rounded-2xl ring-1 ring-black/5"
      onFocusCapture={(e) => {
        if (e.target instanceof HTMLInputElement) {
          const t = e.target.dataset.pointTarget as "A" | "B" | undefined;
          if (t === "A" || t === "B") setFocusedTarget(t);
        }
      }}
      onBlurCapture={(e) => {
        if (!(e.target instanceof HTMLInputElement)) return;
        if (!e.target.dataset.pointTarget) return;
        // Defer briefly so a tap-switch From↔To doesn't flicker
        // through the "no focus" state.
        window.setTimeout(() => {
          const a = document.activeElement;
          if (a instanceof HTMLInputElement && a.dataset.pointTarget) return;
          setFocusedTarget(null);
        }, 50);
      }}
      style={{
        bottom: "max(8px, env(safe-area-inset-bottom, 0px))",
        top: "auto",
        transform: "none",
        maxHeight: `${maxH}px`,
        transition:
          "bottom 200ms cubic-bezier(.32,.72,0,1), max-height 220ms cubic-bezier(.32,.72,0,1)",
      }}
    >
      <div className="shrink-0 relative">
        {/* Centered title with absolutely-positioned action buttons so
            the wordmark sits dead-center regardless of the side icons. */}
        <div className="px-5 pt-4 pb-3 flex items-center justify-center">
          <button
            type="button"
            onClick={onOpenAbout}
            className="text-center"
          >
            <h1 className="text-[30px] font-extrabold text-gray-900 leading-none tracking-[-0.025em]">
              komyut<span className="text-emerald-600">.online</span>
            </h1>
          </button>
        </div>
        <div className="absolute right-3 top-3 flex items-center gap-1">
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

      <div className="flex-1 min-h-0 overflow-visible px-5 pt-1 pb-5">
        <div className="space-y-4">
          <div className="relative space-y-4">
          {/* From row — collapses when To is focused. On return,
              expand FIRST (no delay) so the user sees the input
              they're heading to come back into view immediately. */}
          <div
            className="grid grid-cols-[minmax(0,1fr)] transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] will-change-[grid-template-rows]"
            style={{
              gridTemplateRows: focusedTarget === "B" ? "0fr" : "1fr",
              opacity: focusedTarget === "B" ? 0 : 1,
              transitionDelay: focusedTarget ? "0ms" : "0ms",
            }}
            aria-hidden={focusedTarget === "B"}
          >
            <div
              className={
                focusedTarget === "B"
                  ? "overflow-hidden min-h-0"
                  : "overflow-visible min-h-0"
              }
            >
              <PointRow target="A" label="From" dotColor="#059669" />
            </div>
          </div>
          {/* To row — same pattern. */}
          <div
            className="grid grid-cols-[minmax(0,1fr)] transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] will-change-[grid-template-rows]"
            style={{
              gridTemplateRows: focusedTarget === "A" ? "0fr" : "1fr",
              opacity: focusedTarget === "A" ? 0 : 1,
              transitionDelay: focusedTarget ? "0ms" : "0ms",
            }}
            aria-hidden={focusedTarget === "A"}
          >
            <div
              className={
                focusedTarget === "A"
                  ? "overflow-hidden min-h-0"
                  : "overflow-visible min-h-0"
              }
            >
              <PointRow target="B" label="To" dotColor="#dc2626" />
            </div>
          </div>
          {!focusedTarget && <SwapButton />}
          </div>

          {/* Find button + errors — STAGGERED: when collapsing
              (focusedTarget set), this animates first; when
              expanding back (focusedTarget cleared), this waits
              140ms so the rows finish appearing before the button
              area opens — feels more like a deliberate sequence
              than three things resolving simultaneously. */}
          <div
            className="grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] will-change-[grid-template-rows]"
            style={{
              gridTemplateRows: focusedTarget ? "0fr" : "1fr",
              opacity: focusedTarget ? 0 : 1,
              transitionDelay: focusedTarget ? "0ms" : "140ms",
            }}
            aria-hidden={!!focusedTarget}
          >
            <div className="overflow-hidden space-y-4">
              <button
                type="button"
                disabled={!canFind}
                onClick={onFind}
                aria-busy={searching}
                tabIndex={focusedTarget ? -1 : 0}
                className="w-full h-12 text-[15px] font-bold tracking-[-0.005em] rounded-xl bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 active:bg-emerald-800 disabled:bg-gray-200 disabled:text-gray-400 disabled:shadow-none disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
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
      </div>
    </div>
  );
}
