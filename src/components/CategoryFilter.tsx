import { useMemo } from "react";
import { Eye, EyeOff, Bus } from "lucide-react";
import { useAppStore } from "../store/useAppStore";

// Shared order + label + emoji + color for categories. Kept here so
// toolbar and map markers can stay visually aligned.
const CATEGORIES: {
  id: string;
  label: string;
  emoji: string;
  color: string;
}[] = [
  { id: "mall", label: "Malls", emoji: "🛍", color: "#7c3aed" },
  { id: "terminal", label: "Terminals", emoji: "🚌", color: "#f59e0b" },
  { id: "government", label: "Gov't", emoji: "🏛", color: "#2563eb" },
  { id: "hospital", label: "Hospitals", emoji: "🏥", color: "#dc2626" },
  { id: "school", label: "Schools", emoji: "🎓", color: "#0891b2" },
  { id: "church", label: "Churches", emoji: "⛪", color: "#6b7280" },
  { id: "landmark", label: "Landmarks", emoji: "📍", color: "#059669" },
  { id: "market", label: "Markets", emoji: "🥬", color: "#ea580c" },
  { id: "park", label: "Parks", emoji: "🌳", color: "#16a34a" },
  { id: "sports", label: "Sports", emoji: "⚽", color: "#0ea5e9" },
  { id: "hotel", label: "Hotels", emoji: "🏨", color: "#be185d" },
  { id: "food", label: "Food", emoji: "🍽", color: "#e11d48" },
  { id: "cafe", label: "Cafes", emoji: "☕", color: "#a16207" },
  { id: "bank", label: "Banks", emoji: "🏦", color: "#1e40af" },
  { id: "gas", label: "Gas", emoji: "⛽", color: "#374151" },
  { id: "store", label: "Stores", emoji: "🏪", color: "#0d9488" },
];

// Chip size scales to fill the desktop gap between the PointPicker and
// the Routes toggle. Grows on wider screens so the bar doesn't leave
// dead space; shrinks to 28px on narrow phones.
const CHIP_SIZE = "clamp(28px, 3.2vw, 60px)";

export function CategoryFilter() {
  const places = useAppStore((s) => s.places);
  const visibleCategories = useAppStore((s) => s.visibleCategories);
  const toggleCategory = useAppStore((s) => s.toggleCategory);
  const setVisibleCategories = useAppStore((s) => s.setVisibleCategories);
  const showRoutes = useAppStore((s) => s.showRoutes);
  const toggleRoutes = useAppStore((s) => s.toggleRoutes);

  const present = useMemo(() => {
    const existing = new Set(places.map((p) => p.category));
    return CATEGORIES.filter((c) => existing.has(c.id));
  }, [places]);

  if (present.length === 0) return null;
  const visible = visibleCategories ?? new Set(present.map((c) => c.id));
  const allOn = present.every((c) => visible.has(c.id));

  return (
    <div
      className="
        absolute z-[1000] pointer-events-none
        top-[calc(4rem+env(safe-area-inset-top,0px))] md:top-4
        left-1/2 -translate-x-1/2 w-[calc(100vw-1.5rem)]
        md:left-[calc(1rem+clamp(340px,24vw,560px)+0.75rem)]
        md:translate-x-0 md:w-auto
      "
    >
      <div className="pointer-events-auto rounded-2xl bg-white/95 backdrop-blur shadow-xl ring-1 ring-black/5 overflow-hidden">
        <div className="flex items-stretch gap-1 md:gap-1.5 px-1.5 md:px-2 py-1.5 md:py-2">
          <button
            type="button"
            onClick={toggleRoutes}
            aria-pressed={showRoutes}
            title={showRoutes ? "Hide jeepney routes" : "Show jeepney routes"}
            className={`shrink-0 flex flex-col items-center justify-center gap-0.5 rounded-xl font-semibold transition-colors ${
              showRoutes
                ? "bg-red-600 text-white hover:bg-red-700"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
            style={{
              width: CHIP_SIZE,
              height: CHIP_SIZE,
              fontSize: "clamp(9px, 0.7vw, 11px)",
            }}
          >
            <Bus size={16} />
            <span className="leading-none hidden sm:inline">Routes</span>
          </button>
          <button
            type="button"
            onClick={() => {
              if (allOn) setVisibleCategories(new Set());
              else setVisibleCategories(new Set(present.map((c) => c.id)));
            }}
            title={allOn ? "Hide all places" : "Show all places"}
            className={`shrink-0 flex flex-col items-center justify-center gap-0.5 rounded-xl font-semibold transition-colors ${
              allOn
                ? "bg-gray-100 text-gray-700 hover:bg-gray-200"
                : "bg-emerald-600 text-white hover:bg-emerald-700"
            }`}
            style={{
              width: CHIP_SIZE,
              height: CHIP_SIZE,
              fontSize: "clamp(9px, 0.7vw, 11px)",
            }}
          >
            {allOn ? <EyeOff size={14} /> : <Eye size={14} />}
            <span className="leading-none hidden sm:inline">
              {allOn ? "Hide" : "Show"}
            </span>
          </button>
          <div
            className="shrink-0 w-px self-stretch bg-gray-200"
            aria-hidden
          />
          <div className="flex flex-nowrap items-center gap-[3px] md:gap-1 min-w-0 flex-1 justify-start">
            {present.map((c) => {
              const on = visible.has(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggleCategory(c.id)}
                  title={`${on ? "Hide" : "Show"} ${c.label}`}
                  className={`shrink-0 relative flex flex-col items-center justify-center gap-0.5 rounded-lg md:rounded-xl transition-all border ${
                    on
                      ? "bg-white text-gray-800 border-gray-200 shadow-sm hover:border-gray-300"
                      : "bg-transparent text-gray-400 border-transparent opacity-60 hover:opacity-100 hover:bg-gray-100"
                  }`}
                  style={{
                    width: CHIP_SIZE,
                    height: CHIP_SIZE,
                  }}
                >
                  <span
                    className={on ? "" : "grayscale"}
                    style={{
                      fontSize: "clamp(14px, 1.6vw, 22px)",
                      lineHeight: 1,
                    }}
                  >
                    {c.emoji}
                  </span>
                  {/* Label only appears when the viewport gives the chip
                      enough room; hidden on narrow phones so 16 icons fit. */}
                  <span
                    className="font-medium leading-none whitespace-nowrap hidden sm:inline"
                    style={{ fontSize: "clamp(9px, 0.65vw, 10px)" }}
                  >
                    {c.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
