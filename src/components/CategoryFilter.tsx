import { useMemo } from "react";
import { Eye, EyeOff, Bus } from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import { CATEGORIES } from "./categories";

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
        hidden md:block
        md:top-4
        md:left-[calc(1rem+clamp(340px,24vw,560px)+0.75rem)]
      "
    >
      <div className="pointer-events-auto rounded-2xl bg-white/95 backdrop-blur shadow-xl ring-1 ring-black/5 overflow-hidden">
        <div className="flex items-stretch gap-1 md:gap-1.5 px-1.5 md:px-2 py-1.5 md:py-2 overflow-x-auto md:overflow-visible scrollbar-thin">
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
          <div className="flex flex-nowrap items-center gap-[3px] md:gap-1 md:min-w-0 md:flex-1 justify-start">
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
