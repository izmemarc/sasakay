import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CircleMarker, Marker, Polyline, useMapEvents } from "react-leaflet";
import L from "leaflet";
import {
  ArrowLeft,
  Download,
  Undo2,
  Redo2,
  X,
  Repeat,
  Link2,
} from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import { BaseMap } from "./BaseMap";
import type { RouteFile } from "../lib/loadRoutes";
import {
  buildRoadGraph,
  nearestNode,
  nodesToPath,
  pathToCoordinates,
  shortestPath,
  type GraphNode,
  type RoadGraph,
} from "../lib/roadGraph";
import { isJeepneyDrivable } from "../lib/roadFilter";

type LngLat = [number, number];

const COLOR_PRESETS = [
  "#dc2626",
  "#16a34a",
  "#f97316",
  "#ec4899",
  "#ea580c",
  "#2563eb",
  "#65a30d",
  "#7c3aed",
];

function toLatLng(c: LngLat[]): [number, number][] {
  return c.map(([lng, lat]) => [lat, lng]);
}

interface Meta {
  id: string;
  code: string;
  name: string;
  color: string;
  fare: number;
  topology: "corridor" | "loop";
}

function emptyMeta(id: string): Meta {
  return {
    id,
    code: id.toUpperCase(),
    name: "",
    color: COLOR_PRESETS[0],
    fare: 13,
    topology: "corridor",
  };
}

interface Props {
  initialId: string;
}

/** Click anywhere on the map → snap to nearest main-road node. */
function MapClicks({
  graph,
  onPick,
}: {
  graph: RoadGraph;
  onPick: (nodeId: number) => void;
}) {
  useMapEvents({
    click(e) {
      const pt: LngLat = [e.latlng.lng, e.latlng.lat];
      const n = nearestNode(graph, pt, 120);
      if (n) onPick(n.id);
    },
  });
  return null;
}

export function RouteEditor({ initialId }: Props) {
  const loadData = useAppStore((s) => s.loadData);
  const roads = useAppStore((s) => s.roads);
  const dataLoaded = useAppStore((s) => s.dataLoaded);

  const [meta, setMeta] = useState<Meta>(() => emptyMeta(initialId));
  const [path, setPath] = useState<number[]>([]);
  const [history, setHistory] = useState<number[][]>([]);
  const [future, setFuture] = useState<number[][]>([]);
  const [loadedExisting, setLoadedExisting] = useState(false);
  const [saveState, setSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [warning, setWarning] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<number | null>(null);
  const initialLoadDone = useRef(false);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const mainRoads = useMemo(
    () => roads.filter(isJeepneyDrivable),
    [roads]
  );

  const graph = useMemo<RoadGraph | null>(
    () => (mainRoads.length ? buildRoadGraph(mainRoads) : null),
    [mainRoads]
  );

  // Load existing route.
  useEffect(() => {
    let cancelled = false;
    async function tryLoad() {
      try {
        const res = await fetch(`/routes/${initialId}.json`);
        if (!res.ok) {
          initialLoadDone.current = true;
          return;
        }
        const data = (await res.json()) as RouteFile;
        if (cancelled) return;
        setMeta({
          id: data.id,
          code: data.code,
          name: data.name,
          color: data.color,
          fare: data.fare,
          topology: data.topology ?? "corridor",
        });
        setPath(data.path ?? []);
        setLoadedExisting(true);
      } catch {
        /* blank editor */
      } finally {
        initialLoadDone.current = true;
      }
    }
    void tryLoad();
    return () => {
      cancelled = true;
    };
  }, [initialId]);

  // NO auto-save. Saving is manual via the Save button, so the editor
  // can never clobber on-disk changes by itself. `dirty` tracks whether
  // there are unsaved changes so the Save button can show a badge.
  const [dirty, setDirty] = useState(false);

  const saveNow = useCallback(async () => {
    if (!meta.id) return;
    setSaveState("saving");
    try {
      const body: RouteFile = { ...meta, path };
      const res = await fetch("/__write-route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      setSaveState("saved");
      setDirty(false);
      window.setTimeout(() => setSaveState("idle"), 1500);
    } catch (e) {
      console.error("save failed", e);
      setSaveState("error");
    }
  }, [meta, path]);

  const pushHistory = useCallback((prev: number[]) => {
    setDirty(true);
    setHistory((h) => [...h.slice(-49), prev]);
    setFuture([]);
  }, []);

  /** Use for user-initiated meta changes so the Save button shows dirty. */
  const updateMeta = useCallback((next: Meta) => {
    setDirty(true);
    setMeta(next);
  }, []);

  const addNode = useCallback(
    (nodeId: number) => {
      if (!graph) return;
      setWarning(null);
      setPath((prev) => {
        if (prev.length > 0 && prev[prev.length - 1] === nodeId) return prev;
        if (prev.length === 0) {
          pushHistory(prev);
          return [nodeId];
        }
        // Auto-path from previous node to clicked node.
        const prevNode = prev[prev.length - 1];
        const steps = shortestPath(graph, prevNode, nodeId);
        if (!steps || steps.length === 0) {
          setWarning("No legal road path to that point.");
          return prev;
        }
        pushHistory(prev);
        // Expand steps → node sequence (only new nodes after prevNode).
        const newNodes: number[] = [];
        let cursor = prevNode;
        for (const s of steps) {
          const edge = graph.edges[s.edgeId];
          const next = s.forward ? edge.b : edge.a;
          if (next !== cursor) newNodes.push(next);
          cursor = next;
        }
        return [...prev, ...newNodes];
      });
    },
    [graph, pushHistory]
  );

  const removeLast = useCallback(() => {
    if (path.length === 0) return;
    pushHistory(path);
    setPath((prev) => prev.slice(0, -1));
  }, [path, pushHistory]);

  const undo = useCallback(() => {
    if (history.length === 0) return;
    setDirty(true);
    const prev = history[history.length - 1];
    setHistory((h) => h.slice(0, -1));
    setFuture((f) => [...f, path]);
    setPath(prev);
  }, [history, path]);

  const redo = useCallback(() => {
    if (future.length === 0) return;
    setDirty(true);
    const next = future[future.length - 1];
    setFuture((f) => f.slice(0, -1));
    setHistory((h) => [...h, path]);
    setPath(next);
  }, [future, path]);

  const reversePath = useCallback(() => {
    pushHistory(path);
    setPath((prev) => prev.slice().reverse());
  }, [path, pushHistory]);

  const closeLoop = useCallback(() => {
    if (path.length < 2) return;
    if (!graph) return;
    const last = path[path.length - 1];
    const first = path[0];
    if (last === first) return;
    const steps = shortestPath(graph, last, first);
    if (!steps) {
      setWarning("Can't close loop: no legal path from end to start.");
      return;
    }
    pushHistory(path);
    const newNodes: number[] = [];
    let cursor = last;
    for (const s of steps) {
      const edge = graph.edges[s.edgeId];
      const next = s.forward ? edge.b : edge.a;
      if (next !== cursor) newNodes.push(next);
      cursor = next;
    }
    setPath([...path, ...newNodes]);
  }, [path, graph, pushHistory]);

  const clearAll = useCallback(() => {
    if (path.length === 0) return;
    pushHistory(path);
    setPath([]);
  }, [path, pushHistory]);

  // Warn on close/navigate if there are unsaved changes. Browsers still
  // require `returnValue` to be set even though it's marked deprecated
  // in the types — preventDefault alone does not trigger the dialog.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Ctrl/Cmd+S → save, even when focused on an input.
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void saveNow();
        return;
      }
      const target = e.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA"].includes(target.tagName)) return;
      if (e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((e.key === "z" && e.shiftKey) || e.key === "y") {
        e.preventDefault();
        redo();
      } else if (e.key === "r") {
        e.preventDefault();
        reversePath();
      } else if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        removeLast();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, reversePath, removeLast, saveNow]);

  // Reconstructed polyline from current path.
  const pathSteps = useMemo(() => {
    if (!graph || path.length < 2) return null;
    return nodesToPath(graph, path);
  }, [graph, path]);

  const pathCoords = useMemo(() => {
    if (!graph || !pathSteps) return [];
    return pathToCoordinates(graph, pathSteps);
  }, [graph, pathSteps]);

  // Map each node id in the path to the ordered list of positions it
  // occupies. E.g. a node visited 1st and 10th: [1, 10].
  const pathIndexByNode = useMemo(() => {
    const m = new Map<number, number[]>();
    path.forEach((nodeId, idx) => {
      const arr = m.get(nodeId) ?? [];
      arr.push(idx + 1);
      m.set(nodeId, arr);
    });
    return m;
  }, [path]);

  const seqLabelIcon = useCallback(
    (label: string, color: string) =>
      L.divIcon({
        className: "route-seq",
        html: `<div style="
          display:inline-block;
          background:#ffffff;
          color:${color};
          font:800 12px/1 system-ui,-apple-system,sans-serif;
          padding:3px 7px;
          border-radius:9999px;
          border:2px solid ${color};
          box-shadow:0 2px 4px rgba(0,0,0,0.25);
          white-space:nowrap;
          pointer-events:none;
          text-shadow:0 0 2px #fff;
        ">${label}</div>`,
        // Anchor at the node center and let translate offset it up-right
        // so the pill never sits on top of the node dot itself.
        iconSize: [0, 0],
        iconAnchor: [-8, 18],
      }),
    []
  );

  const pathLength = useMemo(() => {
    if (!graph || !pathSteps) return 0;
    return pathSteps.reduce(
      (sum, s) => sum + (graph.edges[s.edgeId]?.length ?? 0),
      0
    );
  }, [graph, pathSteps]);

  // Group streets touched, in order.
  const streetRuns = useMemo(() => {
    if (!graph || !pathSteps) return [];
    const runs: { name: string; length: number }[] = [];
    for (const step of pathSteps) {
      const edge = graph.edges[step.edgeId];
      const name = edge.wayName ?? "unnamed";
      const last = runs[runs.length - 1];
      if (last && last.name === name) {
        last.length += edge.length;
      } else {
        runs.push({ name, length: edge.length });
      }
    }
    return runs;
  }, [graph, pathSteps]);

  // Preview of auto-path from current head to hovered node.
  const hoverPreviewCoords = useMemo(() => {
    if (!graph || hoveredNodeId === null) return null;
    if (path.length === 0) return null;
    const head = path[path.length - 1];
    if (head === hoveredNodeId) return null;
    const steps = shortestPath(graph, head, hoveredNodeId);
    if (!steps || steps.length === 0) return null;
    return pathToCoordinates(graph, steps);
  }, [graph, hoveredNodeId, path]);

  const onExport = () => {
    const body: RouteFile = { ...meta, path };
    const blob = new Blob([JSON.stringify(body, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${meta.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const headNodeId = path.length > 0 ? path[path.length - 1] : null;
  const originNodeId = path.length > 0 ? path[0] : null;

  return (
    <div className="relative h-screen w-screen grid grid-cols-[1fr_340px]">
      <div className="relative">
        <BaseMap>
          {dataLoaded && graph && (
            <>
              {/* Faint main road network. */}
              {mainRoads.map((r) => (
                <Polyline
                  key={`road-${r.id}`}
                  positions={toLatLng(r.coordinates)}
                  pathOptions={{
                    color: "#94a3b8",
                    weight: 1.2,
                    opacity: 0.35,
                  }}
                  interactive={false}
                />
              ))}
              {/* One-way arrows on one-way edges so you can see why the
                  router won't go a particular way. Drawn from the
                  graph's edges (not raw OSM ways) so they reflect the
                  same one-way semantics the editor uses. */}
              {graph.edges
                .filter((e) => e.oneway === "yes" || e.oneway === "-1")
                .map((e) => {
                  const cs = e.coordinates;
                  if (cs.length < 2) return null;
                  // Place the arrow at the midpoint of the edge's
                  // longest segment so it's visible even on short edges.
                  let bestI = 1;
                  let bestLen = -1;
                  for (let i = 1; i < cs.length; i++) {
                    const dx = cs[i][0] - cs[i - 1][0];
                    const dy = cs[i][1] - cs[i - 1][1];
                    const len = dx * dx + dy * dy;
                    if (len > bestLen) {
                      bestLen = len;
                      bestI = i;
                    }
                  }
                  const a = cs[bestI - 1];
                  const b = cs[bestI];
                  const mid: LngLat = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
                  // Direction the jeep can legally travel along this
                  // segment. "yes" = forward = a→b. "-1" = b→a, so
                  // flip the rotation reference.
                  const fromPt = e.oneway === "-1" ? b : a;
                  const toPt = e.oneway === "-1" ? a : b;
                  const dlng = toPt[0] - fromPt[0];
                  const dlat = toPt[1] - fromPt[1];
                  // SVG: 0deg = pointing up. We need the arrow to point
                  // along (dlng, dlat) in lng/lat space. atan2(dlng,dlat)
                  // gives compass bearing (north-up).
                  const angle = (Math.atan2(dlng, dlat) * 180) / Math.PI;
                  return (
                    <Marker
                      key={`arrow-${e.id}`}
                      position={[mid[1], mid[0]]}
                      icon={L.divIcon({
                        className: "",
                        iconSize: [14, 14],
                        iconAnchor: [7, 7],
                        html: `<div style="
                          width:14px;height:14px;
                          display:flex;align-items:center;justify-content:center;
                          transform:rotate(${angle}deg);
                          pointer-events:none;
                        "><svg width="12" height="12" viewBox="0 0 12 12">
                          <path d="M6 1 L10 9 L6 7 L2 9 Z" fill="#0ea5e9" stroke="#0369a1" stroke-width="0.6" stroke-linejoin="round"/>
                        </svg></div>`,
                      })}
                      interactive={false}
                    />
                  );
                })}
              <MapClicks graph={graph} onPick={addNode} />
              {/* Path preview on hover (ghost line). */}
              {hoverPreviewCoords && (
                <Polyline
                  positions={toLatLng(hoverPreviewCoords)}
                  pathOptions={{
                    color: meta.color,
                    weight: 3,
                    opacity: 0.35,
                    dashArray: "4 4",
                  }}
                  interactive={false}
                />
              )}
              {/* The committed path. */}
              {pathCoords.length >= 2 && (
                <Polyline
                  positions={toLatLng(pathCoords)}
                  pathOptions={{
                    color: meta.color,
                    weight: 4,
                    opacity: 0.95,
                  }}
                  interactive={false}
                />
              )}
              {/* Intersection nodes. */}
              {graph.nodes.map((n) => {
                const isHead = headNodeId === n.id;
                const isOrigin = originNodeId === n.id;
                const isHover = hoveredNodeId === n.id;
                const isInPath = path.includes(n.id);
                return (
                  <CircleMarker
                    key={`node-${n.id}`}
                    center={[n.coord[1], n.coord[0]]}
                    radius={
                      isHead || isOrigin ? 6 : isHover ? 5 : isInPath ? 3.5 : 2.5
                    }
                    pathOptions={{
                      color: isHead
                        ? meta.color
                        : isOrigin
                        ? "#16a34a"
                        : isInPath
                        ? meta.color
                        : "#475569",
                      fillColor: isHead
                        ? meta.color
                        : isOrigin
                        ? "#16a34a"
                        : "#ffffff",
                      fillOpacity: 1,
                      weight: isHead || isOrigin ? 2 : 1.2,
                    }}
                    eventHandlers={{
                      click: () => addNode(n.id),
                      mouseover: () => setHoveredNodeId(n.id),
                      mouseout: () =>
                        setHoveredNodeId((h) => (h === n.id ? null : h)),
                    }}
                  />
                );
              })}
              {/* Sequence-number labels on every path node so you can
                  see traversal order (and spot duplicates/detours). */}
              {Array.from(pathIndexByNode.entries()).map(([nodeId, indices]) => {
                const n = graph.nodesById.get(nodeId);
                if (!n) return null;
                const label =
                  indices.length <= 3
                    ? indices.join(",")
                    : `${indices[0]}…${indices[indices.length - 1]} (×${indices.length})`;
                return (
                  <Marker
                    key={`seq-${nodeId}`}
                    position={[n.coord[1], n.coord[0]]}
                    icon={seqLabelIcon(label, meta.color)}
                    interactive={false}
                  />
                );
              })}
            </>
          )}
        </BaseMap>
        {!dataLoaded && (
          <div className="absolute inset-0 flex items-center justify-center text-gray-500 pointer-events-none">
            Loading roads…
          </div>
        )}

        <div className="absolute top-4 left-4 z-[1000] bg-white/95 backdrop-blur rounded-lg shadow border border-gray-200 px-3 py-2 text-[11px] text-gray-700 max-w-xs space-y-0.5">
          <div className="font-semibold">Route builder</div>
          <div className="text-gray-500">
            Click any node (or anywhere on a road) — path auto-fills along
            real streets.
          </div>
          <div className="text-gray-400 text-[10px]">
            Z undo · Shift+Z redo · R reverse · Del remove last
          </div>
        </div>

        {warning && (
          <div
            onClick={() => setWarning(null)}
            className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] bg-red-50 border border-red-200 text-red-700 px-3 py-1.5 rounded text-xs shadow cursor-pointer"
          >
            {warning} — click to dismiss
          </div>
        )}
      </div>

      <aside className="bg-white border-l border-gray-200 flex flex-col">
        <div className="p-3 border-b border-gray-200 flex items-center justify-between gap-2">
          <a
            href="/?manage=1"
            className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 shrink-0"
            title="Back to routes"
          >
            <ArrowLeft size={14} /> Back
          </a>
          <h1 className="text-sm font-bold truncate">
            {loadedExisting ? "Edit route" : "New route"}
            {dirty && (
              <span className="ml-1 text-amber-600" title="Unsaved changes">
                •
              </span>
            )}
          </h1>
          <button
            type="button"
            onClick={saveNow}
            disabled={!dirty || saveState === "saving"}
            className={`shrink-0 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              !dirty
                ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                : saveState === "saving"
                ? "bg-emerald-200 text-emerald-800 cursor-wait"
                : saveState === "error"
                ? "bg-red-600 text-white hover:bg-red-700"
                : "bg-emerald-600 text-white hover:bg-emerald-700"
            }`}
          >
            {saveState === "saving"
              ? "Saving…"
              : saveState === "saved"
              ? "Saved ✓"
              : saveState === "error"
              ? "Retry"
              : dirty
              ? "Save"
              : "Saved"}
          </button>
        </div>

        <div className="p-3 space-y-2 border-b border-gray-200 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="block text-xs font-medium text-gray-600 mb-0.5">
                id
              </span>
              <input
                value={meta.id}
                onChange={(e) => updateMeta({ ...meta, id: e.target.value })}
                className="w-full px-2 py-1 border border-gray-300 rounded"
              />
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-gray-600 mb-0.5">
                code
              </span>
              <input
                value={meta.code}
                onChange={(e) => updateMeta({ ...meta, code: e.target.value })}
                className="w-full px-2 py-1 border border-gray-300 rounded"
              />
            </label>
          </div>
          <label className="block">
            <span className="block text-xs font-medium text-gray-600 mb-0.5">
              name
            </span>
            <input
              value={meta.name}
              onChange={(e) => updateMeta({ ...meta, name: e.target.value })}
              className="w-full px-2 py-1 border border-gray-300 rounded"
            />
          </label>
          <div className="grid grid-cols-2 gap-2 items-end">
            <div>
              <span className="block text-xs font-medium text-gray-600 mb-0.5">
                color
              </span>
              <div className="flex flex-wrap gap-1">
                {COLOR_PRESETS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => updateMeta({ ...meta, color: c })}
                    className={`w-5 h-5 rounded border ${
                      meta.color === c
                        ? "ring-2 ring-offset-1 ring-gray-900 border-gray-900"
                        : "border-gray-300"
                    }`}
                    style={{ background: c }}
                  />
                ))}
              </div>
            </div>
            <label className="block">
              <span className="block text-xs font-medium text-gray-600 mb-0.5">
                fare (₱)
              </span>
              <input
                type="number"
                value={meta.fare}
                onChange={(e) =>
                  updateMeta({ ...meta, fare: Number(e.target.value) || 0 })
                }
                className="w-full px-2 py-1 border border-gray-300 rounded"
              />
            </label>
          </div>
          <div>
            <span className="block text-xs font-medium text-gray-600 mb-0.5">
              topology
            </span>
            <div className="flex gap-1">
              {(["corridor", "loop"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => updateMeta({ ...meta, topology: t })}
                  className={`flex-1 px-2 py-1 text-xs rounded border ${
                    meta.topology === t
                      ? "bg-emerald-600 text-white border-emerald-600"
                      : "border-gray-300 text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
            <div className="text-[10px] text-gray-500 mt-1">
              {meta.topology === "corridor"
                ? "Rides both ways (out-and-back)."
                : "One-way loop — chevrons show direction."}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 px-2 py-1.5 border-b border-gray-200 bg-gray-50">
          <button
            type="button"
            onClick={undo}
            disabled={history.length === 0}
            className="p-1.5 text-gray-600 hover:text-gray-900 hover:bg-white rounded disabled:opacity-30"
            title="Undo (Z)"
          >
            <Undo2 size={14} />
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={future.length === 0}
            className="p-1.5 text-gray-600 hover:text-gray-900 hover:bg-white rounded disabled:opacity-30"
            title="Redo (Shift+Z)"
          >
            <Redo2 size={14} />
          </button>
          <button
            type="button"
            onClick={reversePath}
            disabled={path.length < 2}
            className="p-1.5 text-gray-600 hover:text-gray-900 hover:bg-white rounded disabled:opacity-30"
            title="Reverse (R)"
          >
            <Repeat size={14} />
          </button>
          <button
            type="button"
            onClick={closeLoop}
            disabled={path.length < 2}
            className="p-1.5 text-gray-600 hover:text-gray-900 hover:bg-white rounded disabled:opacity-30"
            title="Close loop"
          >
            <Link2 size={14} />
          </button>
          <div className="flex-1" />
          <button
            type="button"
            onClick={clearAll}
            disabled={path.length === 0}
            className="p-1.5 text-gray-600 hover:text-red-600 hover:bg-white rounded disabled:opacity-30"
            title="Clear all"
          >
            <X size={14} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="px-3 py-2 sticky top-0 bg-white border-b border-gray-100 text-xs font-semibold text-gray-600">
            {path.length} nodes · {Math.round(pathLength)} m
          </div>
          {path.length === 0 && (
            <div className="px-3 py-6 text-[11px] text-gray-400 text-center">
              Click any intersection or road on the map to start.
            </div>
          )}
          {streetRuns.length > 0 && (
            <ul className="text-xs divide-y divide-gray-100">
              {streetRuns.map((r, i) => (
                <li
                  key={i}
                  className="px-3 py-1.5 flex items-center gap-2"
                >
                  <span className="text-gray-400 w-5 shrink-0">
                    {i + 1}.
                  </span>
                  <span className="flex-1 truncate">
                    {r.name !== "unnamed" ? (
                      r.name
                    ) : (
                      <em className="text-gray-400">unnamed</em>
                    )}
                  </span>
                  <span className="text-gray-400 font-mono text-[10px]">
                    {Math.round(r.length)}m
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="p-3 border-t border-gray-200">
          <button
            type="button"
            onClick={onExport}
            disabled={path.length < 2}
            className="w-full px-2 py-2 text-xs bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-40 flex items-center justify-center gap-1"
          >
            <Download size={12} /> Export JSON
          </button>
        </div>
      </aside>
    </div>
  );
}

// nearestNode is imported above; referenced transitively through MapClicks.
void (nearestNode as unknown);
void (undefined as unknown as GraphNode);
