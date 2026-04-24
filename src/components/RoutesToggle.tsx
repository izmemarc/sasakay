import { List } from "lucide-react";

interface Props {
  onOpenManager: () => void;
}

export function RoutesToggle({ onOpenManager }: Props) {
  return (
    <div className="absolute bottom-14 left-3 md:bottom-14 md:left-4 z-[1000] flex flex-col gap-2">
      <button
        type="button"
        onClick={onOpenManager}
        title="Manage routes"
        className="flex items-center gap-1.5 rounded-xl bg-white/95 backdrop-blur shadow-md ring-1 ring-black/5 px-3 py-2 text-sm font-medium text-gray-800 hover:bg-white hover:shadow-lg transition-all"
      >
        <List className="w-4 h-4" aria-hidden />
        <span>Manage</span>
      </button>
    </div>
  );
}
