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
  /** Display labels for the From/To inputs. Stored alongside the
   *  coords so swap, reset, deep-link share, and any future
   *  "recents" feature can preserve the human-readable text rather
   *  than just lat/lng. */
  pointAText: string;
  pointBText: string;
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
  panRequest:
    | { kind: "pan"; coords: LatLng; zoom?: number }
    | { kind: "fit"; bounds: [LatLng, LatLng]; padding?: number }
    | null;
  /** Last known user GPS location. Drives the blue "you are here" dot
   *  rendered on the map. Cleared by `clearTrip` so resetting the
   *  trip planner also clears the dot. */
  userLocation: LatLng | null;
  dataLoaded: boolean;
  loadError: string | null;

  /** Set the From point. Pass `text` to display a label in the input
   *  (e.g. "SM Legazpi" or "Current location"); omit to leave the
   *  current text untouched. */
  setPointA: (p: LatLng | null, text?: string) => void;
  setPointB: (p: LatLng | null, text?: string) => void;
  setPointAText: (text: string) => void;
  setPointBText: (text: string) => void;
  /** Swap From↔To (coords AND display text). Clears the trip since
   *  the planner needs to re-run on the swapped pair. */
  swapPoints: () => void;
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
  requestFit: (bounds: [LatLng, LatLng], padding?: number) => void;
  clearPanRequest: () => void;
  setUserLocation: (coords: LatLng | null) => void;
  clearTrip: () => void;
  loadData: () => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
  routes: [],
  places: [],
  roads: [],
  pointA: null,
  pointB: null,
  pointAText: "",
  pointBText: "",
  tripPlan: null,
  tripCandidates: [],
  tripChoiceIdx: 0,
  pickingFor: null,
  mobilePickerExpanded: true,
  showRoutes: false,
  visibleRouteIds: new Set<string>(),
  visibleCategories: null,
  panRequest: null,
  userLocation: null,
  dataLoaded: false,
  loadError: null,

  setPointA: (p, text) =>
    set((s) => ({
      pointA: p,
      pointAText: text !== undefined ? text : s.pointAText,
      tripPlan: null,
      tripCandidates: [],
      tripChoiceIdx: 0,
    })),
  setPointB: (p, text) =>
    set((s) => ({
      pointB: p,
      pointBText: text !== undefined ? text : s.pointBText,
      tripPlan: null,
      tripCandidates: [],
      tripChoiceIdx: 0,
    })),
  setPointAText: (text) => set({ pointAText: text }),
  setPointBText: (text) => set({ pointBText: text }),
  swapPoints: () =>
    set((s) => ({
      pointA: s.pointB,
      pointB: s.pointA,
      pointAText: s.pointBText,
      pointBText: s.pointAText,
      tripPlan: null,
      tripCandidates: [],
      tripChoiceIdx: 0,
    })),
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
  requestPan: (coords, zoom) =>
    set({ panRequest: { kind: "pan", coords, zoom } }),
  requestFit: (bounds, padding) =>
    set({ panRequest: { kind: "fit", bounds, padding } }),
  clearPanRequest: () => set({ panRequest: null }),
  setUserLocation: (coords) => set({ userLocation: coords }),

  clearTrip: () =>
    set({
      pointA: null,
      pointB: null,
      pointAText: "",
      pointBText: "",
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
