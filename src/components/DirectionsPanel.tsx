import { useState } from "react";
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
              <div className="text-sm font-medium text-gray-900 flex items-center gap-1.5">
                Walk {formatMeters(step.distanceMeters)}
                {hasInstructions &&
                  (expanded ? (
                    <ChevronUp size={13} className="text-gray-400" />
                  ) : (
                    <ChevronDown size={13} className="text-gray-400" />
                  ))}
              </div>
              {step.durationMinutes && (
                <div className="text-xs text-gray-500 mt-0.5">
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
              <span className="text-sm text-gray-900 font-medium">
                {step.routeName}
              </span>
            </div>
            <div className="text-xs text-gray-500 mt-1 flex items-center gap-2">
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
  if (!tripPlan) return null;

  const totalMin =
    tripPlan.totalWalkMinutes + estimateJeepneyMinutes(tripPlan.steps);

  return (
    <div
      className={`
        absolute z-[1000] bg-white/95 backdrop-blur shadow-xl ring-1 ring-black/5
        left-0 right-0 bottom-0 rounded-t-2xl
        md:left-auto md:right-4 md:bottom-4 md:top-auto
        md:w-[clamp(360px,26vw,580px)] md:max-h-[calc(100vh-2rem)] md:rounded-2xl
        flex flex-col overflow-hidden
        ${collapsed ? "max-h-[88px]" : "max-h-[65vh]"}
      `}
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
      <div className="px-4 pt-1 md:pt-3.5 pb-3 border-b border-gray-100">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-[15px] font-bold text-gray-900">Directions</h2>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-gray-400">
              {candidates.length > 1 ? `${candidates.length} options` : ""}
            </span>
            <button
              type="button"
              onClick={() => setCollapsed((v) => !v)}
              className="md:hidden p-1 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-full"
              title={collapsed ? "Expand" : "Collapse"}
            >
              {collapsed ? (
                <ChevronUp size={16} />
              ) : (
                <ChevronDown size={16} />
              )}
            </button>
          </div>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <div className="flex items-center gap-1 text-gray-900 font-semibold">
            <Clock size={14} className="text-gray-500" />~{totalMin} min
          </div>
          <div className="flex items-center gap-1 text-gray-700">
            <Wallet size={14} className="text-gray-500" />₱{tripPlan.totalFare}
          </div>
          <div className="flex items-center gap-1 text-gray-700">
            <ArrowLeftRight size={14} className="text-gray-500" />
            {tripPlan.transfers}×
          </div>
        </div>
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
                  className={`px-3 py-1.5 rounded-lg text-xs whitespace-nowrap border transition-all ${
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

      <div
        className={`px-4 py-2.5 border-t border-gray-100 bg-gray-50/70 text-[11px] text-gray-500 flex items-center justify-between ${
          collapsed ? "hidden md:flex" : ""
        }`}
      >
        <span>{formatMeters(tripPlan.totalDistance)} total</span>
        <span>{tripPlan.totalWalkMinutes} min walking</span>
      </div>
    </div>
  );
}
