import { useMemo } from "react";
import { Bus, Eye, EyeOff } from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import { CATEGORIES } from "./categories";

/** Mobile-only: a horizontal-scroll chip row positioned below the
 *  collapsed PointPicker. Modeled after iOS Maps / Google Maps category
 *  rows — generous tap targets, pill shape, full labels, momentum
 *  scrolling. Hides on desktop where the existing CategoryFilter takes
 *  over.
 *
 *  Hides whenever the picker is expanded (the picker is the focus
 *  surface) or when a trip is active (the directions panel takes the
 *  bottom and the user is in trip-following mode). */
export function MobileCategoryFilter() {
  const places = useAppStore((s) => s.places);
  const visibleCategories = useAppStore((s) => s.visibleCategories);
  const toggleCategory = useAppStore((s) => s.toggleCategory);
  const setVisibleCategories = useAppStore((s) => s.setVisibleCategories);
  const showRoutes = useAppStore((s) => s.showRoutes);
  const toggleRoutes = useAppStore((s) => s.toggleRoutes);
  const mobilePickerExpanded = useAppStore((s) => s.mobilePickerExpanded);
  const tripPlan = useAppStore((s) => s.tripPlan);

  const present = useMemo(() => {
    const existing = new Set(places.map((p) => p.category));
    return CATEGORIES.filter((c) => existing.has(c.id));
  }, [places]);

  if (present.length === 0) return null;
  if (mobilePickerExpanded) return null;
  if (tripPlan) return null;

  const visible = visibleCategories ?? new Set(present.map((c) => c.id));
  const allOn = present.every((c) => visible.has(c.id));

  return (
    <div
      className="md:hidden absolute z-[999] left-0 right-0 pointer-events-none"
      style={{
        // Sits just under the collapsed picker (top-3 + ~52px header
        // height + 8px gap = ~76px from top). Safe-area-aware so it
        // clears the notch.
        top: "calc(76px + env(safe-area-inset-top, 0px))",
      }}
    >
      <div
        className="pointer-events-auto flex items-center gap-2 overflow-x-auto px-3 py-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        style={{ scrollPaddingInline: 12 }}
      >
        {/* Routes pill — toggles the whole jeepney layer. */}
        <button
          type="button"
          onClick={toggleRoutes}
          aria-pressed={showRoutes}
          className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-3.5 h-9 text-[13px] font-semibold shadow-sm ring-1 transition-colors ${
            showRoutes
              ? "bg-red-600 text-white ring-red-600"
              : "bg-white text-gray-700 ring-black/10 hover:bg-gray-50"
          }`}
        >
          <Bus size={15} />
          <span>Routes</span>
        </button>
        {/* All-places toggle. */}
        <button
          type="button"
          onClick={() => {
            if (allOn) setVisibleCategories(new Set());
            else setVisibleCategories(new Set(present.map((c) => c.id)));
          }}
          className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-3.5 h-9 text-[13px] font-semibold shadow-sm ring-1 transition-colors ${
            allOn
              ? "bg-white text-gray-700 ring-black/10 hover:bg-gray-50"
              : "bg-emerald-600 text-white ring-emerald-600"
          }`}
        >
          {allOn ? <EyeOff size={14} /> : <Eye size={14} />}
          <span>{allOn ? "Hide" : "Show"}</span>
        </button>
        <div className="shrink-0 w-px h-6 bg-black/10 self-center" aria-hidden />
        {present.map((c) => {
          const on = visible.has(c.id);
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => toggleCategory(c.id)}
              aria-pressed={on}
              className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-3.5 h-9 text-[13px] font-medium shadow-sm ring-1 transition-colors ${
                on
                  ? "bg-white text-gray-800 ring-black/10"
                  : "bg-white/70 text-gray-400 ring-black/5"
              }`}
            >
              <span
                className={on ? "" : "grayscale opacity-60"}
                style={{ fontSize: 16, lineHeight: 1 }}
              >
                {c.emoji}
              </span>
              <span className="whitespace-nowrap">{c.label}</span>
            </button>
          );
        })}
        {/* Right padding so the last chip can scroll past the edge. */}
        <span className="shrink-0 w-1" aria-hidden />
      </div>
    </div>
  );
}
