import { create } from "zustand";
import type { JeepneyRoute, Place, TripPlan } from "../types";
import type { TripCandidate } from "../lib/routing";
import { loadRoutes } from "../lib/loadRoutes";
import { loadRoads, type RoadWay } from "../lib/loadRoads";

type LatLng = [number, number];

interface AppState {
  routes: JeepneyRoute[];
  places: Place[];
  roads: RoadWay[];
  pointA: LatLng | null;
  pointB: LatLng | null;
  tripPlan: TripPlan | null;
  /** All alternative plans for the current A/B search, ranked fastest. */
  tripCandidates: TripCandidate[];
  /** Which candidate is currently selected (index into tripCandidates). */
  tripChoiceIdx: number;
  pickingFor: "A" | "B" | null;
  /** UI hint: is the mobile point-picker card currently expanded? Other
   *  floating overlays use this to step out of the way so they don't
   *  overlap the picker's inputs on small screens. */
  mobilePickerExpanded: boolean;
  showRoutes: boolean;
  /** Per-route visibility override. If a route id is present here it is
   *  drawn; if the set is empty and initialized, the store auto-fills
   *  with all known route ids on first data load. */
  visibleRouteIds: Set<string>;
  /** Set of place categories currently visible on the map. `null` means
   *  "not yet initialized" — the store fills it with all known categories
   *  on first data load. */
  visibleCategories: Set<string> | null;
  /** Map-pan request: a controller mounted inside the MapContainer
   *  consumes this and calls flyTo, then clears the field. Decouples
   *  pan triggers (geolocation button, app start, etc.) from the
   *  Leaflet instance which lives deeper in the tree. */
  panRequest: { coords: LatLng; zoom?: number } | null;
  dataLoaded: boolean;
  loadError: string | null;

  setPointA: (p: LatLng | null) => void;
  setPointB: (p: LatLng | null) => void;
  setTripPlan: (t: TripPlan | null) => void;
  setTripCandidates: (c: TripCandidate[]) => void;
  setTripChoice: (idx: number) => void;
  setPickingFor: (p: "A" | "B" | null) => void;
  setMobilePickerExpanded: (v: boolean) => void;
  toggleRoutes: () => void;
  setVisibleRouteIds: (ids: Set<string>) => void;
  toggleCategory: (category: string) => void;
  setVisibleCategories: (ids: Set<string>) => void;
  requestPan: (coords: LatLng, zoom?: number) => void;
  clearPanRequest: () => void;
  clearTrip: () => void;
  loadData: () => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
  routes: [],
  places: [],
  roads: [],
  pointA: null,
  pointB: null,
  tripPlan: null,
  tripCandidates: [],
  tripChoiceIdx: 0,
  pickingFor: null,
  mobilePickerExpanded: true,
  showRoutes: false,
  visibleRouteIds: new Set<string>(),
  visibleCategories: null,
  panRequest: null,
  dataLoaded: false,
  loadError: null,

  setPointA: (p) =>
    set({ pointA: p, tripPlan: null, tripCandidates: [], tripChoiceIdx: 0 }),
  setPointB: (p) =>
    set({ pointB: p, tripPlan: null, tripCandidates: [], tripChoiceIdx: 0 }),
  setTripPlan: (t) => set({ tripPlan: t }),
  setTripCandidates: (c) =>
    set({
      tripCandidates: c,
      tripChoiceIdx: 0,
      tripPlan: c[0]?.plan ?? null,
    }),
  setTripChoice: (idx) => {
    const cand = get().tripCandidates[idx];
    if (cand) set({ tripChoiceIdx: idx, tripPlan: cand.plan });
  },
  setPickingFor: (p) => set({ pickingFor: p }),
  setMobilePickerExpanded: (v) => set({ mobilePickerExpanded: v }),
  toggleRoutes: () => set((s) => ({ showRoutes: !s.showRoutes })),
  setVisibleRouteIds: (ids) => set({ visibleRouteIds: ids }),
  toggleCategory: (category) =>
    set((s) => {
      const current = s.visibleCategories ?? new Set<string>();
      const next = new Set(current);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return { visibleCategories: next };
    }),
  setVisibleCategories: (ids) => set({ visibleCategories: ids }),
  requestPan: (coords, zoom) => set({ panRequest: { coords, zoom } }),
  clearPanRequest: () => set({ panRequest: null }),

  clearTrip: () =>
    set({
      pointA: null,
      pointB: null,
      tripPlan: null,
      tripCandidates: [],
      tripChoiceIdx: 0,
      pickingFor: null,
    }),

  loadData: async () => {
    if (get().dataLoaded) return;
    try {
      const [roads, placesRes] = await Promise.all([
        loadRoads(),
        fetch("/places.json").then((r) => {
          if (!r.ok) throw new Error(`places.json: ${r.status}`);
          return r.json() as Promise<Place[]>;
        }),
      ]);
      const routes = await loadRoutes(roads);
      const current = get().visibleRouteIds;
      const currentCats = get().visibleCategories;
      const allCats = new Set(placesRes.map((p) => p.category));
      const allRouteIds = new Set(routes.map((r) => r.id));
      // Default to "everything visible" so the user sees the full
      // jeepney network the moment the app opens. The RoutesManager
      // (when present) can still narrow the visible set; we only fill
      // from defaults when there's nothing already selected.
      const visibleRouteIds = current.size === 0 ? allRouteIds : current;
      set({
        routes,
        places: placesRes,
        roads,
        visibleRouteIds,
        visibleCategories: currentCats ?? allCats,
        dataLoaded: true,
        loadError: null,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("loadData failed:", msg);
      set({ loadError: msg, dataLoaded: true });
    }
  },
}));
