import { useMemo } from "react";
import { Bus, MapPin } from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import { CATEGORIES } from "./categories";

/** Mobile-only floating filter buttons on the right edge. Two FABs:
 *
 *    1. Routes — hide/show all jeepney polylines on the map.
 *    2. Icons — hide/show every place marker (across every category).
 *
 *  Per-category granularity lives on desktop only; on mobile the rail
 *  is intentionally minimal so it doesn't fight the bottom sheet for
 *  attention. */
export function MobileFilterRail() {
  const places = useAppStore((s) => s.places);
  const visibleCategories = useAppStore((s) => s.visibleCategories);
  const setVisibleCategories = useAppStore((s) => s.setVisibleCategories);
  const showRoutes = useAppStore((s) => s.showRoutes);
  const toggleRoutes = useAppStore((s) => s.toggleRoutes);

  const presentIds = useMemo(() => {
    const existing = new Set(places.map((p) => p.category));
    return CATEGORIES.filter((c) => existing.has(c.id)).map((c) => c.id);
  }, [places]);

  if (presentIds.length === 0) return null;
  // Treat "any category visible" as the icons-on state, since users
  // don't expect a half-on toggle on mobile.
  const visible = visibleCategories ?? new Set(presentIds);
  const iconsOn = presentIds.some((id) => visible.has(id));

  return (
    <div
      className="md:hidden fixed z-[1050] flex flex-col gap-2"
      style={{
        right: 12,
        top: "calc(12px + env(safe-area-inset-top, 0px))",
      }}
    >
      <Fab
        icon={<Bus size={18} />}
        active={showRoutes}
        activeBg="#dc2626"
        labelOn="Hide routes"
        labelOff="Show routes"
        onClick={toggleRoutes}
      />
      <Fab
        icon={<MapPin size={18} />}
        active={iconsOn}
        activeBg="#059669"
        labelOn="Hide icons"
        labelOff="Show icons"
        onClick={() => {
          if (iconsOn) setVisibleCategories(new Set());
          else setVisibleCategories(new Set(presentIds));
        }}
      />
    </div>
  );
}

function Fab({
  icon,
  active,
  activeBg,
  labelOn,
  labelOff,
  onClick,
}: {
  icon: React.ReactNode;
  active: boolean;
  activeBg?: string;
  labelOn: string;
  labelOff: string;
  onClick: () => void;
}) {
  const title = active ? labelOn : labelOff;
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-pressed={active}
      className="shrink-0 w-11 h-11 flex items-center justify-center rounded-full ring-1 ring-black/5 shadow-[0_2px_8px_rgba(0,0,0,0.12),_0_1px_2px_rgba(0,0,0,0.08)] transition-colors"
      style={{
        background: active ? activeBg ?? "#1f2937" : "rgba(255,255,255,0.7)",
        color: active ? "#fff" : "#374151",
        backdropFilter: "blur(18px) saturate(150%)",
        WebkitBackdropFilter: "blur(18px) saturate(150%)",
      }}
    >
      {icon}
    </button>
  );
}
