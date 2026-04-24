import { useState } from "react";
import {
  Footprints,
  Bus,
  Clock,
  Wallet,
  ArrowLeftRight,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import type { TripStep } from "../types";

function formatMeters(m: number): string {
  if (m < 1000) return `${Math.round(m)}m`;
  return `${(m / 1000).toFixed(1)}km`;
}

function StepRow({
  step,
  isLast,
}: {
  step: TripStep;
  isLast: boolean;
}) {
  const isWalk = step.type === "walk";
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
      <div className="flex-1 pt-0.5">
        {isWalk ? (
          <>
            <div className="text-sm font-medium text-gray-900">
              Walk {formatMeters(step.distanceMeters)}
            </div>
            {step.durationMinutes && (
              <div className="text-xs text-gray-500 mt-0.5">
                ~{step.durationMinutes} min
              </div>
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
