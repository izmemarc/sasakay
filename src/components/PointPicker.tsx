import { useMemo, useState } from "react";
import {
  Crosshair,
  Map as MapIcon,
  X,
  Search,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Loader2,
} from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import type { Place } from "../types";
import { planTrips } from "../lib/routing";

type Target = "A" | "B";

const CATEGORY_ORDER: Record<string, number> = {
  mall: 0,
  terminal: 1,
  government: 2,
  hospital: 3,
  school: 4,
  church: 5,
  landmark: 6,
  market: 7,
  park: 8,
  hotel: 9,
  sports: 10,
  food: 11,
  cafe: 12,
  bank: 13,
  gas: 14,
  store: 15,
};

const CATEGORY_EMOJI: Record<string, string> = {
  mall: "🛍",
  terminal: "🚌",
  government: "🏛",
  hospital: "🏥",
  school: "🎓",
  church: "⛪",
  landmark: "📍",
  market: "🥬",
  park: "🌳",
  sports: "⚽",
  hotel: "🏨",
  food: "🍽",
  cafe: "☕",
  bank: "🏦",
  gas: "⛽",
  store: "🏪",
};

function searchPlaces(places: Place[], q: string): Place[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return [];
  const scored: { p: Place; score: number }[] = [];
  for (const p of places) {
    const name = p.name.toLowerCase();
    const branch = p.branch?.toLowerCase() ?? "";
    const address = p.address?.toLowerCase() ?? "";
    let score = -1;
    if (name.startsWith(needle)) score = 0;
    else if (name.includes(needle)) score = 1;
    else if (branch.includes(needle)) score = 2;
    else if (p.aliases.some((a) => a.toLowerCase().includes(needle))) score = 3;
    else if (address.includes(needle)) score = 4;
    else if (p.category.toLowerCase().includes(needle)) score = 5;
    if (score >= 0) scored.push({ p, score });
  }
  scored.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
    return a.p.name.localeCompare(b.p.name);
  });
  return scored.slice(0, 12).map((s) => s.p);
}

function groupByCategory(places: Place[]): [string, Place[]][] {
  const byCat = new Map<string, Place[]>();
  for (const p of places) {
    const list = byCat.get(p.category);
    if (list) list.push(p);
    else byCat.set(p.category, [p]);
  }
  return Array.from(byCat.entries()).sort((a, b) => {
    const oa = CATEGORY_ORDER[a[0]] ?? 99;
    const ob = CATEGORY_ORDER[b[0]] ?? 99;
    return oa - ob;
  });
}

function PlaceRow({
  place,
  showCategory,
  onSelect,
}: {
  place: Place;
  showCategory?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onSelect}
      className="group w-full text-left px-3 py-2 flex items-start gap-2.5 hover:bg-emerald-50/70 transition-colors"
    >
      <span className="shrink-0 w-7 h-7 rounded-full bg-gray-100 group-hover:bg-white flex items-center justify-center text-sm leading-none">
        {CATEGORY_EMOJI[place.category] ?? "📍"}
      </span>
      <div className="flex-1 min-w-0">
        <div className="truncate text-sm text-gray-900">
          <span className="font-medium">{place.name}</span>
          {place.branch && (
            <span className="text-gray-500"> — {place.branch}</span>
          )}
        </div>
        {place.address && (
          <div className="text-[11px] text-gray-400 truncate mt-0.5">
            {place.address}
          </div>
        )}
      </div>
      {showCategory && (
        <span className="text-[10px] text-gray-400 capitalize shrink-0 mt-1">
          {place.category}
        </span>
      )}
    </button>
  );
}

function PointRow({
  target,
  label,
  dotColor,
}: {
  target: Target;
  label: string;
  dotColor: string;
}) {
  const places = useAppStore((s) => s.places);
  const point = useAppStore((s) => (target === "A" ? s.pointA : s.pointB));
  const setPoint = useAppStore((s) =>
    target === "A" ? s.setPointA : s.setPointB
  );
  const pickingFor = useAppStore((s) => s.pickingFor);
  const setPickingFor = useAppStore((s) => s.setPickingFor);

  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  const matches = useMemo(() => searchPlaces(places, text), [places, text]);
  const grouped = useMemo(() => groupByCategory(places), [places]);
  const isPicking = pickingFor === target;
  const showDropdown = focused && (matches.length > 0 || text.trim() === "");

  const useMyLocation = () => {
    setGeoError(null);
    if (!("geolocation" in navigator)) {
      setGeoError("Geolocation not available");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPoint([pos.coords.longitude, pos.coords.latitude]);
        setText("My location");
      },
      (err) => setGeoError(err.message || "Location denied")
    );
  };

  const selectPlace = (p: Place) => {
    setPoint(p.coordinates);
    setText(p.branch ? `${p.name} — ${p.branch}` : p.name);
    setFocused(false);
  };

  const clearThis = () => {
    setPoint(null);
    setText("");
  };

  return (
    <div>
      <label className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
        <span
          className="inline-block w-2 h-2 rounded-full"
          style={{ background: dotColor }}
        />
        {label}
      </label>
      <div
        className={`flex items-center rounded-lg border bg-white transition-shadow ${
          focused
            ? "border-emerald-500 ring-2 ring-emerald-500/20"
            : "border-gray-200 hover:border-gray-300"
        }`}
      >
        <Search
          size={15}
          className="ml-2.5 text-gray-400 shrink-0"
          aria-hidden
        />
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => window.setTimeout(() => setFocused(false), 150)}
          placeholder="Search a place…"
          className="flex-1 min-w-0 px-2 py-2 text-sm bg-transparent placeholder:text-gray-400 focus:outline-none"
        />
        {(text || point) && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={clearThis}
            title="Clear"
            className="p-1 mr-1 text-gray-400 hover:text-gray-700 rounded-full hover:bg-gray-100"
          >
            <X size={14} />
          </button>
        )}
        <div className="flex border-l border-gray-200">
          <button
            type="button"
            onClick={useMyLocation}
            title="Use my location"
            className="p-2 text-gray-500 hover:text-emerald-700 hover:bg-emerald-50 transition-colors"
          >
            <Crosshair size={15} />
          </button>
          <button
            type="button"
            onClick={() => setPickingFor(isPicking ? null : target)}
            title="Pick on map"
            className={`p-2 rounded-r-lg transition-colors ${
              isPicking
                ? "bg-emerald-600 text-white"
                : "text-gray-500 hover:text-emerald-700 hover:bg-emerald-50"
            }`}
          >
            <MapIcon size={15} />
          </button>
        </div>
      </div>
      {showDropdown && (
        <div className="mt-1.5 border border-gray-200 rounded-lg bg-white max-h-72 overflow-y-auto shadow-lg">
          {text.trim() === "" ? (
            grouped.map(([cat, list]) => (
              <div key={cat}>
                <div className="sticky top-0 z-10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-500 bg-gray-50/95 backdrop-blur border-b border-gray-100 flex items-center gap-1.5">
                  <span>{CATEGORY_EMOJI[cat] ?? "📍"}</span>
                  <span>{cat}</span>
                  <span className="ml-auto text-gray-400 font-normal">
                    {list.length}
                  </span>
                </div>
                {list.map((p) => (
                  <PlaceRow
                    key={p.id}
                    place={p}
                    onSelect={() => selectPlace(p)}
                  />
                ))}
              </div>
            ))
          ) : (
            <div className="py-1">
              {matches.map((p) => (
                <PlaceRow
                  key={p.id}
                  place={p}
                  showCategory
                  onSelect={() => selectPlace(p)}
                />
              ))}
            </div>
          )}
        </div>
      )}
      {geoError && <p className="mt-1.5 text-xs text-red-600">{geoError}</p>}
      {isPicking && !showDropdown && (
        <p className="mt-1.5 text-[11px] text-emerald-700 flex items-center gap-1">
          <span className="inline-block w-1 h-1 rounded-full bg-emerald-600 animate-pulse" />
          Tap on the map to set this point
        </p>
      )}
      {point && !text && !isPicking && (
        <p className="mt-1.5 text-[11px] text-gray-400">
          {point[1].toFixed(4)}, {point[0].toFixed(4)}
        </p>
      )}
    </div>
  );
}

interface PointPickerProps {
  onOpenAbout?: () => void;
}

export function PointPicker({ onOpenAbout }: PointPickerProps = {}) {
  const pointA = useAppStore((s) => s.pointA);
  const pointB = useAppStore((s) => s.pointB);
  const routes = useAppStore((s) => s.routes);
  const roads = useAppStore((s) => s.roads);
  const tripPlan = useAppStore((s) => s.tripPlan);
  const setTripCandidates = useAppStore((s) => s.setTripCandidates);
  const clearTrip = useAppStore((s) => s.clearTrip);
  const loadError = useAppStore((s) => s.loadError);

  const [noRouteMsg, setNoRouteMsg] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  // On mobile, the whole card can collapse to a single-line summary so
  // it doesn't eat the map. Defaults to collapsed when a trip is already
  // planned (the DirectionsPanel is doing the work); expanded otherwise.
  const [mobileExpanded, setMobileExpanded] = useState(true);

  const canFind = pointA && pointB && routes.length > 0 && !searching;
  const hasAnything = pointA || pointB || tripPlan;

  const onFind = () => {
    if (!pointA || !pointB || searching) return;
    setNoRouteMsg(null);
    setSearching(true);
    // Defer the heavy synchronous work so React paints the spinner
    // first. requestAnimationFrame guarantees a paint cycle has run
    // before we block the main thread with planTrips.
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
          if (window.matchMedia("(max-width: 767px)").matches) {
            setMobileExpanded(false);
          }
        } finally {
          setSearching(false);
        }
      });
    });
  };

  return (
    <div className="absolute top-3 left-3 right-3 md:top-4 md:left-4 md:right-auto z-[1000] md:w-[clamp(340px,24vw,560px)] md:max-w-[calc(100vw-2rem)] rounded-2xl bg-white/95 backdrop-blur shadow-xl ring-1 ring-black/5 overflow-hidden">
      <div className="px-4 pt-3 pb-2 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onOpenAbout}
          className="min-w-0 flex-1 text-left rounded-md -mx-1 px-1 py-0.5 hover:bg-gray-50 transition-colors"
          title="About Sasakay"
        >
          <h1 className="text-[15px] font-bold text-gray-900 leading-tight flex items-center gap-1.5">
            Sasakay
            <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-1 py-0.5 rounded">
              by bytebento.ph
            </span>
          </h1>
          <p className="text-[11px] text-gray-500 mt-0.5 truncate">
            {!mobileExpanded && tripPlan
              ? "Trip ready — tap to edit"
              : "Legazpi jeepney trip planner"}
          </p>
        </button>
        <div className="flex items-center gap-1 shrink-0">
          {hasAnything && (
            <button
              type="button"
              onClick={() => {
                clearTrip();
                setNoRouteMsg(null);
                setMobileExpanded(true);
              }}
              title="Clear all"
              className="p-1.5 text-gray-400 hover:text-gray-800 hover:bg-gray-100 rounded-full transition-colors"
            >
              <X size={16} />
            </button>
          )}
          <button
            type="button"
            onClick={() => setMobileExpanded((v) => !v)}
            title={mobileExpanded ? "Collapse" : "Expand"}
            className="md:hidden p-1.5 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-full transition-colors"
          >
            {mobileExpanded ? (
              <ChevronUp size={16} />
            ) : (
              <ChevronDown size={16} />
            )}
          </button>
        </div>
      </div>

      <div
        className={`px-4 pb-4 space-y-3 ${
          mobileExpanded ? "" : "hidden md:block"
        }`}
      >
        <PointRow target="A" label="From" dotColor="#059669" />
        <PointRow target="B" label="To" dotColor="#dc2626" />

        <button
          type="button"
          disabled={!canFind}
          onClick={onFind}
          aria-busy={searching}
          className="group w-full mt-1 py-2.5 text-sm font-semibold rounded-lg bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 hover:shadow disabled:bg-gray-200 disabled:text-gray-400 disabled:shadow-none disabled:cursor-not-allowed transition-all flex items-center justify-center gap-1.5"
        >
          {searching ? (
            <>
              <Loader2 size={15} className="animate-spin" />
              Finding routes…
            </>
          ) : (
            <>
              Find route
              <ArrowRight
                size={15}
                className="transition-transform group-enabled:group-hover:translate-x-0.5"
              />
            </>
          )}
        </button>

        {loadError && (
          <div className="text-xs text-red-700 bg-red-50 border border-red-100 rounded-md px-2.5 py-1.5">
            Data error: {loadError}
          </div>
        )}
        {noRouteMsg && (
          <div className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-md px-2.5 py-1.5">
            {noRouteMsg}
          </div>
        )}
      </div>
    </div>
  );
}
