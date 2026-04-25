import { useEffect, useMemo, useState } from "react";
import { Eye, EyeOff, Pencil, Plus, Trash2, X } from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import type { RouteFile } from "../lib/loadRoutes";

interface RouteSummary {
  file: string;
  data: RouteFile;
}

async function fetchAllRouteFiles(): Promise<RouteSummary[]> {
  const idxRes = await fetch("/routes/index.json");
  if (!idxRes.ok) return [];
  const idx = (await idxRes.json()) as { files: string[] };
  const loaded = await Promise.all(
    idx.files.map(async (file) => {
      try {
        const r = await fetch(`/routes/${file}`);
        if (!r.ok) return null;
        const data = (await r.json()) as RouteFile;
        return { file, data };
      } catch {
        return null;
      }
    })
  );
  return loaded.filter((x): x is RouteSummary => x !== null);
}

interface Props {
  open: boolean;
  onClose: () => void;
}

/** Slide-out panel overlayed on the main map. Lets the user toggle
 *  individual routes visible/hidden, launch the editor, delete, or
 *  create a new route — all while watching the live map underneath. */
export function RoutesManager({ open, onClose }: Props) {
  const routes = useAppStore((s) => s.routes);
  const visibleRouteIds = useAppStore((s) => s.visibleRouteIds);
  const setVisibleRouteIds = useAppStore((s) => s.setVisibleRouteIds);
  const [files, setFiles] = useState<RouteSummary[] | null>(null);
  const [newId, setNewId] = useState("");

  useEffect(() => {
    if (open) void fetchAllRouteFiles().then(setFiles);
  }, [open]);

  const routeById = useMemo(
    () => new Map(routes.map((r) => [r.id, r])),
    [routes]
  );

  const onDelete = async (id: string) => {
    if (!confirm(`Delete route "${id}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/__delete-route?id=${encodeURIComponent(id)}`, {
        method: "POST",
      });
      if (!res.ok) throw new Error(await res.text());
      setFiles((prev) => prev?.filter((r) => r.data.id !== id) ?? null);
      const next = new Set(visibleRouteIds);
      next.delete(id);
      setVisibleRouteIds(next);
    } catch (e) {
      alert(`Delete failed: ${e instanceof Error ? e.message : e}`);
    }
  };

  const onCreate = () => {
    const id = newId.trim().toLowerCase();
    if (!id) return;
    if (!/^[a-z0-9_-]+$/.test(id)) {
      alert("ID must be alphanumeric with - or _");
      return;
    }
    window.location.href = `/?edit=${id}`;
  };

  const toggleVisible = (id: string) => {
    const n = new Set(visibleRouteIds);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    setVisibleRouteIds(n);
  };

  const allVisible =
    files && files.length > 0 && files.every((f) => visibleRouteIds.has(f.data.id));
  const toggleAll = () => {
    if (!files) return;
    if (allVisible) setVisibleRouteIds(new Set());
    else setVisibleRouteIds(new Set(files.map((f) => f.data.id)));
  };

  if (!open) return null;

  const visibleCount = files
    ? files.filter((f) => visibleRouteIds.has(f.data.id)).length
    : 0;

  return (
    <div
      className="
        absolute z-[1000] bg-white shadow-xl flex flex-col
        inset-x-0 bottom-0 h-[80vh] rounded-t-2xl
        md:inset-y-0 md:left-auto md:right-0 md:h-full md:w-[450px] md:rounded-none md:border-l md:border-gray-200
      "
    >
      {/* Mobile drag-handle */}
      <button
        type="button"
        onClick={onClose}
        aria-label="Close routes"
        className="md:hidden w-full pt-2 pb-1 flex items-center justify-center"
      >
        <span className="w-10 h-1 rounded-full bg-gray-300" />
      </button>

      <div className="px-4 pt-2 md:pt-4 pb-3 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-gray-900 leading-tight">
            Routes
          </h2>
          <p className="text-[11px] text-gray-500 mt-0.5">
            {files
              ? `${visibleCount} of ${files.length} visible`
              : "Loading…"}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-full transition-colors"
          title="Close"
        >
          <X size={18} />
        </button>
      </div>

      {files && files.length > 0 && (
        <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2">
          <button
            type="button"
            onClick={toggleAll}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold transition-colors ${
              allVisible
                ? "bg-gray-100 text-gray-700 hover:bg-gray-200"
                : "bg-emerald-600 text-white hover:bg-emerald-700"
            }`}
          >
            {allVisible ? <EyeOff size={13} /> : <Eye size={13} />}
            {allVisible ? "Hide all" : "Show all"}
          </button>
          <div className="flex-1" />
          <div className="flex items-center gap-1.5">
            <input
              value={newId}
              onChange={(e) => setNewId(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onCreate()}
              placeholder="new-id"
              className="w-24 px-2 py-1.5 border border-gray-200 rounded-md text-xs focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20"
            />
            <button
              type="button"
              onClick={onCreate}
              disabled={!newId.trim()}
              title="Create new route"
              className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-semibold transition-colors"
            >
              <Plus size={13} />
              Add
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {files === null && (
          <div className="text-center py-12 text-gray-400 text-sm">
            Loading routes…
          </div>
        )}
        {files && files.length === 0 && (
          <div className="text-center py-12 px-6 text-gray-500 text-sm space-y-3">
            <div>No routes yet.</div>
            <div className="flex items-center gap-1.5 max-w-xs mx-auto">
              <input
                value={newId}
                onChange={(e) => setNewId(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && onCreate()}
                placeholder="id (e.g. ld-01)"
                className="flex-1 px-2 py-1.5 border border-gray-200 rounded-md text-xs"
              />
              <button
                type="button"
                onClick={onCreate}
                disabled={!newId.trim()}
                className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 disabled:opacity-40 text-xs font-semibold"
              >
                <Plus size={13} /> Add
              </button>
            </div>
          </div>
        )}
        {files && files.length > 0 && (
          <ul className="py-1">
            {files.map(({ data }) => {
              const isVisible = visibleRouteIds.has(data.id);
              const route = routeById.get(data.id);
              const resolved = route ? route.coordinates.length : 0;
              const nodeCount = Array.isArray(data.path)
                ? data.path.length
                : 0;
              return (
                <li key={data.id}>
                  <button
                    type="button"
                    onClick={() => toggleVisible(data.id)}
                    className={`w-full px-3 py-2.5 flex items-center gap-2.5 text-left transition-colors ${
                      isVisible
                        ? "bg-emerald-50/60 hover:bg-emerald-50"
                        : "hover:bg-gray-50"
                    }`}
                  >
                    <span
                      className={`shrink-0 w-4 h-4 rounded-md border-2 flex items-center justify-center transition-colors ${
                        isVisible
                          ? "border-emerald-600 bg-emerald-600"
                          : "border-gray-300 bg-white"
                      }`}
                    >
                      {isVisible && (
                        <svg
                          width="10"
                          height="10"
                          viewBox="0 0 12 12"
                          fill="none"
                          stroke="white"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points="2 6 5 9 10 3" />
                        </svg>
                      )}
                    </span>
                    <span
                      className="w-1 h-8 rounded-full shrink-0"
                      style={{ background: data.color }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-sm text-gray-900 truncate">
                          {data.name || data.id}
                        </span>
                        <span
                          className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded text-white shrink-0"
                          style={{ background: data.color }}
                        >
                          {data.code}
                        </span>
                      </div>
                      <div className="text-[10px] text-gray-500 flex items-center gap-1.5 mt-0.5">
                        <span>₱{data.fare}</span>
                        <span className="text-gray-300">·</span>
                        <span>{nodeCount} nodes</span>
                        {resolved === 0 && nodeCount >= 2 && (
                          <>
                            <span className="text-gray-300">·</span>
                            <span className="text-amber-600 font-medium">
                              unresolved
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <a
                      href={`/?edit=${data.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="shrink-0 p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-100 rounded-md transition-colors"
                      title="Edit"
                    >
                      <Pencil size={13} />
                    </a>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(data.id);
                      }}
                      className="shrink-0 p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                      title="Delete"
                    >
                      <Trash2 size={13} />
                    </button>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
