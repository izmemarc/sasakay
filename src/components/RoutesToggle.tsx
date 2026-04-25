import { List } from "lucide-react";
import { useAppStore } from "../store/useAppStore";

interface Props {
  onOpenManager: () => void;
}

export function RoutesToggle({ onOpenManager }: Props) {
  const tripPlan = useAppStore((s) => s.tripPlan);
  // On mobile, the directions panel takes over the bottom edge when a
  // trip is active — hide the Manage button rather than fight it.
  // Desktop has plenty of side room and keeps it pinned.
  return (
    <div
      className={`absolute bottom-3 right-3 md:bottom-14 md:left-4 md:right-auto z-[1000] flex flex-col gap-2 ${
        tripPlan ? "hidden md:flex" : ""
      }`}
    >
      <button
        type="button"
        onClick={onOpenManager}
        title="Show or hide routes on the map"
        className="flex items-center gap-1.5 rounded-xl bg-white/95 backdrop-blur shadow-md ring-1 ring-black/5 px-3 py-2 text-sm font-medium text-gray-800 hover:bg-white hover:shadow-lg transition-all"
      >
        <List className="w-4 h-4" aria-hidden />
        <span>Routes</span>
      </button>
    </div>
  );
}
