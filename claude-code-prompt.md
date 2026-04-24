# Claude Code Starting Prompt — Legazpi Jeepney Map PWA

## Project Overview

Build an **offline-first Progressive Web App** that helps users navigate Legazpi City, Philippines by jeepney. Users pick a starting point (point A) and destination (point B) anywhere on the map or via search. The app returns a complete trip plan: which jeepney(s) to take, where to board, where to alight, where to walk, and where to transfer if needed.

The app must work **fully offline** after first install, since users will often be on jeepneys with no signal.

## Tech Stack

- **Vite + React + TypeScript** — build tool and framework
- **react-leaflet + Leaflet** — map rendering
- **@turf/turf** — geographic calculations (nearest point, distance, line splitting)
- **Zustand** — state management
- **Tailwind CSS** — styling
- **vite-plugin-pwa** (with Workbox) — PWA + offline caching
- **lucide-react** — icons

## Initial Setup Task

1. Initialize a new Vite + React + TypeScript project named `legazpi-jeepney-map`.
2. Install dependencies:
   ```
   npm install leaflet react-leaflet @turf/turf zustand lucide-react
   npm install -D tailwindcss postcss autoprefixer vite-plugin-pwa @types/leaflet
   ```
3. Initialize Tailwind (`npx tailwindcss init -p`) and configure `tailwind.config.js` to scan `./index.html` and `./src/**/*.{js,ts,jsx,tsx}`.
4. Add Tailwind directives to `src/index.css`.
5. Configure `vite.config.ts` with `vite-plugin-pwa`:
   - `registerType: 'autoUpdate'`
   - Precache all app assets including GeoJSON files in `public/routes/` and `public/places.json`
   - Runtime cache for map tiles with `CacheFirst` strategy, 30-day expiration, max 2000 entries
   - Include a proper `manifest` with `name: "Legazpi Jeepney Map"`, `short_name: "JeepMap"`, `theme_color: "#059669"`, `background_color: "#ffffff"`, `display: "standalone"`, `start_url: "/"`
6. Create the folder structure:
   ```
   public/
   ├── routes/          (empty — GeoJSON jeepney routes go here later)
   ├── tiles/           (empty — pre-cached map tiles go here later)
   └── places.json      (create with empty array [] for now)
   src/
   ├── components/
   ├── lib/
   ├── store/
   ├── types/
   ├── App.tsx
   ├── main.tsx
   └── index.css
   ```

## Core Data Types

Create `src/types/index.ts` with:

```typescript
export interface JeepneyRoute {
  id: string;              // unique route ID
  name: string;            // human-readable route name
  code: string;            // short code shown to users (e.g. "LD-01")
  color: string;           // hex color for map display
  fare: number;            // base fare in PHP
  coordinates: [number, number][]; // [lng, lat] ordered along the route
}

export interface Place {
  id: string;
  name: string;
  aliases: string[];       // alternate names for search
  category: string;        // "mall", "school", "barangay", "terminal", etc.
  coordinates: [number, number]; // [lng, lat]
}

export interface TripStep {
  type: 'walk' | 'jeepney';
  from: [number, number];
  to: [number, number];
  distanceMeters: number;
  // jeepney-specific
  routeCode?: string;
  routeName?: string;
  routeColor?: string;
  fare?: number;
  // walk-specific
  durationMinutes?: number;
}

export interface TripPlan {
  steps: TripStep[];
  totalDistance: number;
  totalFare: number;
  totalWalkMinutes: number;
  transfers: number;
}
```

## Phase 1 — Base Map (do this first)

Build `App.tsx` to render a full-screen Leaflet map:

- Centered on Legazpi City: `[13.1391, 123.7438]`, zoom `14`
- Use OpenStreetMap tiles for now: `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png`
- Attribution: `© OpenStreetMap contributors`
- No default markers or controls beyond zoom

The map should take up the entire viewport with no default padding.

## Phase 2 — Load and Display Routes

Create `src/lib/loadRoutes.ts`:
- Fetches all `.geojson` files listed in `public/routes/index.json` (a manifest file listing route filenames)
- Parses each into a `JeepneyRoute` object
- Returns `JeepneyRoute[]`

Create `src/store/useAppStore.ts` (Zustand store):
```typescript
interface AppState {
  routes: JeepneyRoute[];
  places: Place[];
  pointA: [number, number] | null;
  pointB: [number, number] | null;
  tripPlan: TripPlan | null;
  setPointA: (p: [number, number] | null) => void;
  setPointB: (p: [number, number] | null) => void;
  setTripPlan: (t: TripPlan | null) => void;
  loadData: () => Promise<void>;
}
```

Render each route as a `<Polyline>` on the map using its `color` property. When no trip is planned, show all routes at 40% opacity. When a trip is planned, highlight only the routes used in the trip at 100% opacity and fade others to 15%.

## Phase 3 — Point Picker

Add a floating control panel (top-left, Tailwind `absolute top-4 left-4 z-[1000] bg-white rounded-lg shadow-lg p-4`).

The panel has two inputs:
- **From (Point A)** — text input + "📍 use my location" button + "🗺️ pick on map" button
- **To (Point B)** — same

When "pick on map" is active for a field, the next map click sets that point. Show points A and B as distinct markers (green for A, red for B).

Typing in the text input searches `places.json` (simple substring match on `name` and `aliases`). Show a dropdown of matches. Clicking a match sets the corresponding point.

Add a "Find route" button — disabled until both points are set.

## Phase 4 — The Routing Algorithm

This is the core. Create `src/lib/routing.ts` exporting `planTrip(pointA, pointB, routes): TripPlan | null`.

**Algorithm:**

```
Given: pointA, pointB, and array of routes (each a polyline of coordinates)

Constants:
  MAX_WALK_TO_STOP = 500 meters     // reasonable walk to/from a jeepney
  MAX_TRANSFER_WALK = 300 meters    // walk between transfer points
  WALK_SPEED = 80 meters/minute     // average walking pace

Step 1 — Find candidate boarding stops:
  For each route:
    Find the nearest point on that route's polyline to pointA (use turf.nearestPointOnLine).
    If distance ≤ MAX_WALK_TO_STOP, this route is a candidate for boarding.
  Call this set BOARDING.

Step 2 — Find candidate alighting stops:
  Same as above but for pointB.
  Call this set ALIGHTING.

Step 3 — Try direct trips (no transfer):
  For each route in BOARDING ∩ ALIGHTING:
    Build a trip:
      walk: pointA → boardingPoint
      jeepney: boardingPoint → alightingPoint along this route
      walk: alightingPoint → pointB
    Score = totalWalk + (jeepneyDistance × 0.3)  // jeepney time weighted less than walking
  Keep the best-scoring direct trip.

Step 4 — Try one-transfer trips:
  For each routeA in BOARDING, routeB in ALIGHTING where routeA ≠ routeB:
    Find all near-intersections: points where routeA and routeB come within MAX_TRANSFER_WALK of each other.
    Use turf.nearestPointOnLine iteratively along routeA, checking distance to routeB.
    For each intersection candidate, build a trip:
      walk: pointA → boarding on routeA
      jeepney: routeA from boarding to transfer-point-on-A
      walk: transfer-point-on-A → transfer-point-on-B (if > 20m)
      jeepney: routeB from transfer-point-on-B to alighting
      walk: alighting → pointB
    Score as above, plus a transfer penalty of 200 (meters-equivalent) per transfer.
  Keep the best-scoring transfer trip.

Step 5 — Compare direct vs transfer, return the better one.

Step 6 — If no solution found, return null (app will tell user "no jeepney route found, try walking or a different destination").
```

Use Turf functions: `turf.point`, `turf.lineString`, `turf.nearestPointOnLine`, `turf.distance`, `turf.lineSlice`.

Return a full `TripPlan` with ordered `TripStep[]`.

## Phase 5 — Trip Display

When a trip plan is set in the store:

1. **On the map**: Draw walk segments as dashed gray lines, jeepney segments in that route's color (thick, 6px). Show markers at boarding/alighting/transfer points.

2. **Directions panel** (slide up from the bottom on mobile, right sidebar on desktop): Step-by-step list:
   - 🚶 "Walk 120m to boarding stop" (with minute estimate)
   - 🚌 "Take **LD-01 (Legazpi–Daraga via Rizal)** — ride for 2.3 km, ₱13"
   - 🚶 "Walk 80m to transfer point"
   - 🚌 "Take **EL-02 (Embarcadero Loop)** — ride for 1.1 km, ₱12"
   - 🚶 "Walk 150m to destination"
   - **Total: ~18 min · ₱25 · 1 transfer**

3. A "Clear" button resets points A, B, and the trip.

## Phase 6 — Offline & PWA

Ensure `vite-plugin-pwa` is configured so that:
- All JS/CSS/HTML is precached
- All files in `public/routes/` and `public/places.json` are precached
- Map tiles use `CacheFirst` runtime caching
- The app shows an "Installed ✓" indicator when running as a PWA
- Add an install prompt button in the UI when the browser supports installation

Include proper PWA icons (192×192 and 512×512) — use a simple jeepney emoji on a green background as a placeholder; I'll replace them later.

## Phase 7 — Placeholder Data for Development

Until I provide real GeoJSON route files, create `public/routes/index.json` listing two sample routes, and create two small sample GeoJSON files in `public/routes/` with fake but plausible Legazpi jeepney routes so I can see the app working end-to-end. Also add 5-10 sample places to `public/places.json` (SM Legazpi, Embarcadero, LCC Mall, Albay Cathedral, Legazpi Port, Daraga Church, Bicol University, Aquinas University, Legazpi City Hall, Pacific Mall Legazpi).

## Build Order

Build and verify each phase before moving to the next:

1. Project init + Tailwind + PWA config → `npm run dev` shows blank page with no errors
2. Phase 1 (base map visible)
3. Phase 7 (sample data loads)
4. Phase 2 (routes visible on map)
5. Phase 3 (can pick points A and B)
6. Phase 4 (routing algorithm — test with console.log first)
7. Phase 5 (trip visualization)
8. Phase 6 (verify offline works — Chrome devtools → Network → Offline)

## Code Style

- Functional React components, hooks only, no class components
- TypeScript strict mode on
- No `any` types — define proper interfaces
- Keep components under 200 lines — split when they grow
- Keep `routing.ts` pure (no React, no store access) so it's unit-testable
- Use Tailwind for all styling; no inline styles except for dynamic values like route colors

## What NOT to build yet

- User accounts, saved trips, history — not needed for v1
- Turn-by-turn walking directions — just show the straight-line walk segment with distance
- Real-time jeepney tracking — out of scope
- Multi-transfer routing (2+ transfers) — one transfer is enough for a city the size of Legazpi
- Admin panel for adding routes — I'll add routes by dropping GeoJSON files in `public/routes/` manually

---

Start with project init. Confirm `npm run dev` works and shows the Legazpi-centered map before moving on.
