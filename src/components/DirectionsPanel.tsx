import { useEffect, useState } from "react";
import {
  Footprints,
  Bus,
  Clock,
  Wallet,
  ArrowLeftRight,
  ChevronDown,
  ChevronUp,
  CornerDownLeft,
  CornerDownRight,
  ArrowUp,
  MapPin,
  PlayCircle,
} from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import type { TripStep, WalkInstruction } from "../types";

function formatMeters(m: number): string {
  if (m < 1000) return `${Math.round(m)}m`;
  return `${(m / 1000).toFixed(1)}km`;
}

const COMPASS_WORD: Record<WalkInstruction["bearing"], string> = {
  N: "north",
  NE: "northeast",
  E: "east",
  SE: "southeast",
  S: "south",
  SW: "southwest",
  W: "west",
  NW: "northwest",
};

function instructionText(ins: WalkInstruction, isFirst: boolean): string {
  const where = ins.street ?? "the path";
  const dist = formatMeters(ins.meters);
  if (ins.turn === "arrive") {
    return ins.street
      ? `Continue on ${ins.street} for ${dist} to arrive`
      : `Continue ${dist} to arrive`;
  }
  if (ins.turn === "start" || isFirst) {
    return `Head ${COMPASS_WORD[ins.bearing]} on ${where} for ${dist}`;
  }
  if (ins.turn === "left") return `Turn left onto ${where}, ${dist}`;
  if (ins.turn === "right") return `Turn right onto ${where}, ${dist}`;
  return `Continue on ${where} for ${dist}`;
}

function instructionIcon(turn: WalkInstruction["turn"]) {
  if (turn === "left") return <CornerDownLeft size={13} />;
  if (turn === "right") return <CornerDownRight size={13} />;
  if (turn === "arrive") return <MapPin size={13} />;
  if (turn === "start") return <PlayCircle size={13} />;
  return <ArrowUp size={13} />;
}

function StepRow({
  step,
  isLast,
}: {
  step: TripStep;
  isLast: boolean;
}) {
  const isWalk = step.type === "walk";
  const hasInstructions =
    isWalk && step.instructions && step.instructions.length >= 2;
  const [expanded, setExpanded] = useState(false);
  return (
    <li className="relative flex gap-3 pb-3 last:pb-0">
      {!isLast && (
        <span
          aria-hidden
          className="absolute left-[15px] top-8 bottom-0 w-[2px] bg-gray-200"
        />
      )}
      <div
        className="relative z-10 shrink-0 w-8 h-8 rounded-full flex items-center justify-center shadow-sm"
        style={{
          background: isWalk ? "#f3f4f6" : step.routeColor ?? "#059669",
          color: isWalk ? "#4b5563" : "white",
        }}
      >
        {isWalk ? <Footprints size={15} /> : <Bus size={15} />}
      </div>
      <div className="flex-1 pt-0.5 min-w-0">
        {isWalk ? (
          <>
            <button
              type="button"
              onClick={
                hasInstructions ? () => setExpanded((v) => !v) : undefined
              }
              className={`text-left w-full ${
                hasInstructions
                  ? "cursor-pointer hover:text-emerald-700 transition-colors"
                  : "cursor-default"
              }`}
              aria-expanded={hasInstructions ? expanded : undefined}
              disabled={!hasInstructions}
            >
              <div className="text-sm font-semibold text-gray-900 flex items-center gap-1.5 tabular-nums">
                Walk {formatMeters(step.distanceMeters)}
                {hasInstructions &&
                  (expanded ? (
                    <ChevronUp size={13} className="text-gray-400" />
                  ) : (
                    <ChevronDown size={13} className="text-gray-400" />
                  ))}
              </div>
              {step.durationMinutes && (
                <div className="text-xs text-gray-500 mt-0.5 tabular-nums">
                  ~{step.durationMinutes} min
                  {hasInstructions && !expanded && (
                    <span className="text-gray-400">
                      {" "}
                      · {step.instructions!.length} steps
                    </span>
                  )}
                </div>
              )}
            </button>
            {hasInstructions && expanded && (
              <ol className="mt-2 ml-1 space-y-1.5 border-l-2 border-gray-100 pl-3">
                {step.instructions!.map((ins, k) => (
                  <li
                    key={k}
                    className="flex items-start gap-1.5 text-xs text-gray-700"
                  >
                    <span className="shrink-0 mt-0.5 text-gray-400">
                      {instructionIcon(ins.turn)}
                    </span>
                    <span className="leading-snug">
                      {instructionText(ins, k === 0)}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </>
        ) : (
          <>
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-xs text-gray-500">Take</span>
              <span
                className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-bold text-white shadow-sm"
                style={{ background: step.routeColor ?? "#059669" }}
              >
                {step.routeCode}
              </span>
              <span className="text-sm text-gray-900 font-semibold">
                {step.routeName}
              </span>
            </div>
            <div className="text-xs text-gray-500 mt-1 flex items-center gap-2 tabular-nums">
              <span>Ride {formatMeters(step.distanceMeters)}</span>
              <span className="text-gray-300">·</span>
              <span>₱{step.fare ?? 0}</span>
              {step.durationMinutes && (
                <>
                  <span className="text-gray-300">·</span>
                  <span>~{step.durationMinutes} min</span>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </li>
  );
}

function estimateJeepneyMinutes(steps: TripStep[]): number {
  let meters = 0;
  for (const s of steps) if (s.type === "jeepney") meters += s.distanceMeters;
  return Math.round(meters / 333);
}

export function DirectionsPanel() {
  const tripPlan = useAppStore((s) => s.tripPlan);
  const candidates = useAppStore((s) => s.tripCandidates);
  const choiceIdx = useAppStore((s) => s.tripChoiceIdx);
  const setChoice = useAppStore((s) => s.setTripChoice);
  // On mobile, let the user collapse the directions sheet to just the
  // summary row so they can see more of the map.
  const [collapsed, setCollapsed] = useState(false);
  // Same approach as MobileBottomSheet: cap max-height by the
  // VISIBLE viewport (visualViewport.height), which iOS Safari
  // shrinks to exclude the URL bar. The card sits at `bottom: 8` and
  // grows upward up to `vvHeight - 16`, so all content stays in the
  // truly-visible area regardless of URL-bar state.
  const [vvHeight, setVvHeight] = useState(
    typeof window !== "undefined" ? window.innerHeight : 0
  );
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia("(max-width: 767px)").matches
      : false
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 767px)");
    const handler = () => setIsMobile(mq.matches);
    handler();
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const vv = window.visualViewport;
    if (!vv) return;
    let raf = 0;
    const update = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() =>
        setVvHeight(Math.round(vv.height))
      );
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
  if (!tripPlan) return null;

  const totalMin =
    tripPlan.totalWalkMinutes + estimateJeepneyMinutes(tripPlan.steps);

  return (
    <div
      className={`
        fixed z-[1000] bg-white/70 backdrop-blur-xl backdrop-saturate-150 shadow-xl ring-1 ring-black/5
        left-2 right-2 rounded-2xl
        md:left-auto md:right-4 md:top-auto md:bottom-4
        md:w-[clamp(340px,24vw,560px)] md:max-h-[calc(100vh-2rem)]
        flex flex-col overflow-hidden
        ${collapsed ? "max-h-[88px]" : ""}
      `}
      style={{
        // Mobile-only: mirror MobileBottomSheet's verified-working
        // formula. Floor 20px keeps card off the Safari toolbar on
        // phones without a home indicator; expand to safe-area when
        // there is one. max-height bounded by visible viewport so
        // content never sits behind the toolbar.
        ...(isMobile
          ? {
              bottom: "max(8px, env(safe-area-inset-bottom, 0px))",
              maxHeight: collapsed
                ? "88px"
                : `${Math.max(180, vvHeight - 16)}px`,
            }
          : {}),
      }}
    >
      {/* Mobile drag-handle pill */}
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        aria-label={collapsed ? "Expand directions" : "Collapse directions"}
        className="md:hidden w-full pt-2 pb-1 flex items-center justify-center"
      >
        <span className="w-10 h-1 rounded-full bg-gray-300" />
      </button>
      <div className="px-4 pt-1 md:pt-3.5 pb-3 border-b border-gray-100 flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <h2 className="text-[16px] font-extrabold tracking-[-0.02em] text-gray-900 mb-2">
            Directions
          </h2>
          <div className="flex items-center gap-3 text-sm tabular-nums">
            <div className="flex items-center gap-1 text-gray-900 font-semibold">
              <Clock size={14} className="text-gray-500" />~{totalMin} min
            </div>
            <div className="flex items-center gap-1 text-gray-700">
              <Wallet size={14} className="text-gray-500" />₱
              {tripPlan.totalFare}
            </div>
            <div className="flex items-center gap-1 text-gray-700">
              <ArrowLeftRight size={14} className="text-gray-500" />
              {tripPlan.transfers}×
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => useAppStore.getState().clearTrip()}
          title="Plan a new trip"
          className="shrink-0 text-[12px] font-bold tracking-[-0.005em] text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 px-3 py-1.5 rounded-lg shadow-sm transition-colors"
        >
          + New trip
        </button>
      </div>

      {candidates.length > 1 && (
        <div
          className={`px-3 pt-2.5 pb-2.5 border-b border-gray-100 overflow-x-auto ${
            collapsed ? "hidden md:block" : ""
          }`}
        >
          <div className="flex gap-1.5 min-w-max">
            {candidates.map((c, i) => {
              const selected = i === choiceIdx;
              const codes = c.plan.steps
                .filter((s) => s.type === "jeepney")
                .map((s) => s.routeCode)
                .join(" → ");
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => setChoice(i)}
                  className={`px-3 py-1.5 rounded-lg text-xs whitespace-nowrap border transition-all tabular-nums ${
                    selected
                      ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
                      : "bg-white text-gray-700 border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                  }`}
                  title={codes}
                >
                  <div className="font-semibold leading-tight">
                    {c.minutes} min
                  </div>
                  <div
                    className={`text-[10px] leading-tight mt-0.5 ${
                      selected ? "text-emerald-100" : "text-gray-500"
                    }`}
                  >
                    ₱{c.plan.totalFare} · {c.plan.transfers}×
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <ol
        className={`flex-1 overflow-y-auto px-4 pt-3 pb-4 ${
          collapsed ? "hidden md:block" : ""
        }`}
      >
        {tripPlan.steps.map((s, i) => (
          <StepRow key={i} step={s} isLast={i === tripPlan.steps.length - 1} />
        ))}
      </ol>
    </div>
  );
}
