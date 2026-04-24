import { useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Trash2, X } from "lucide-react";
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

  return (
    <div className="absolute top-0 right-0 h-full w-[340px] z-[1000] bg-white border-l border-gray-200 shadow-xl flex flex-col">
      <div className="p-3 border-b border-gray-200 flex items-center justify-between">
        <h2 className="text-sm font-bold">Routes</h2>
        <button
          type="button"
          onClick={onClose}
          className="p-1 text-gray-500 hover:text-gray-900"
          title="Close"
        >
          <X size={16} />
        </button>
      </div>

      <div className="p-3 border-b border-gray-200">
        <div className="text-xs font-semibold text-gray-600 mb-1.5">
          New route
        </div>
        <div className="flex gap-1.5">
          <input
            value={newId}
            onChange={(e) => setNewId(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onCreate()}
            placeholder="id (e.g. ld-02)"
            className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-xs"
          />
          <button
            type="button"
            onClick={onCreate}
            disabled={!newId.trim()}
            className="px-2 py-1.5 bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-40 flex items-center gap-1 text-xs"
          >
            <Plus size={12} /> Create
          </button>
        </div>
      </div>

      <div className="px-3 py-1.5 border-b border-gray-100 flex items-center justify-between text-[11px] font-semibold text-gray-600">
        <span>{files?.length ?? 0} routes</span>
        {files && files.length > 0 && (
          <button
            type="button"
            onClick={toggleAll}
            className="text-emerald-700 hover:text-emerald-900"
          >
            {allVisible ? "Hide all" : "Show all"}
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {files === null && (
          <div className="text-center py-8 text-gray-500 text-xs">
            Loading…
          </div>
        )}
        {files && files.length === 0 && (
          <div className="text-center py-8 text-gray-500 text-xs">
            No routes yet.
          </div>
        )}
        {files && files.length > 0 && (
          <ul className="divide-y divide-gray-100">
            {files.map(({ data }) => {
              const isVisible = visibleRouteIds.has(data.id);
              const route = routeById.get(data.id);
              const resolved = route ? route.coordinates.length : 0;
              const nodeCount = Array.isArray(data.path)
                ? data.path.length
                : 0;
              return (
                <li
                  key={data.id}
                  className="p-2.5 flex items-center gap-2 hover:bg-gray-50 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={isVisible}
                    onChange={() => toggleVisible(data.id)}
                    className="shrink-0 cursor-pointer"
                    aria-label={`Toggle ${data.name}`}
                  />
                  <div
                    className="w-3.5 h-3.5 rounded shrink-0 border border-gray-200"
                    style={{ background: data.color }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-xs truncate">
                        {data.name || data.id}
                      </span>
                      <span className="text-[9px] font-mono uppercase bg-gray-100 text-gray-600 px-1 py-px rounded">
                        {data.code}
                      </span>
                    </div>
                    <div className="text-[10px] text-gray-500 flex items-center gap-2">
                      <span>{data.topology ?? "corridor"}</span>
                      <span>{nodeCount} nodes</span>
                      <span>₱{data.fare}</span>
                      {resolved === 0 && nodeCount >= 2 && (
                        <span className="text-amber-600">unresolved</span>
                      )}
                    </div>
                  </div>
                  <a
                    href={`/?edit=${data.id}`}
                    className="p-1.5 text-gray-500 hover:text-emerald-600"
                    title="Edit"
                  >
                    <Pencil size={12} />
                  </a>
                  <button
                    type="button"
                    onClick={() => onDelete(data.id)}
                    className="p-1.5 text-gray-400 hover:text-red-600"
                    title="Delete"
                  >
                    <Trash2 size={12} />
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
