const CACHE_NAME = "carto-voyager-tiles";
const DONE_FLAG = "tiles-preloaded-v1";
const SUBDOMAINS = ["a", "b", "c", "d"];
const MAX_PARALLEL = 6;

interface Bounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

function lngToTileX(lng: number, z: number): number {
  return Math.floor(((lng + 180) / 360) * Math.pow(2, z));
}

function latToTileY(lat: number, z: number): number {
  const rad = (lat * Math.PI) / 180;
  return Math.floor(
    ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) *
      Math.pow(2, z)
  );
}

function tilesForBounds(b: Bounds, zoom: number): Array<[number, number]> {
  const xMin = lngToTileX(b.west, zoom);
  const xMax = lngToTileX(b.east, zoom);
  const yMin = latToTileY(b.north, zoom);
  const yMax = latToTileY(b.south, zoom);
  const out: Array<[number, number]> = [];
  for (let x = xMin; x <= xMax; x++) {
    for (let y = yMin; y <= yMax; y++) out.push([x, y]);
  }
  return out;
}

function tileUrl(z: number, x: number, y: number): string {
  const sub = SUBDOMAINS[(x + y) % SUBDOMAINS.length];
  // Devicepixel suffix "@2x" matches what Leaflet's retina requests look like; we
  // skip it here since Leaflet fetches {r}="" on non-retina. On retina screens
  // the cache miss is acceptable — Workbox picks those up at runtime.
  return `https://${sub}.basemaps.cartocdn.com/rastertiles/voyager/${z}/${x}/${y}.png`;
}

async function runPool<T>(
  items: T[],
  worker: (item: T) => Promise<void>,
  concurrency: number
): Promise<void> {
  let i = 0;
  const runners = Array.from({ length: concurrency }, async () => {
    while (i < items.length) {
      const idx = i++;
      try {
        await worker(items[idx]);
      } catch {
        // ignore individual tile failures — offline or CDN hiccup
      }
    }
  });
  await Promise.all(runners);
}

interface PreloadOptions {
  bounds: Bounds;
  zooms: number[];
  onProgress?: (done: number, total: number) => void;
}

export async function preloadTiles(opts: PreloadOptions): Promise<void> {
  if (typeof caches === "undefined") return;
  if (localStorage.getItem(DONE_FLAG) === "1") return;

  const conn = (
    navigator as Navigator & { connection?: { saveData?: boolean } }
  ).connection;
  if (conn?.saveData) return;

  const cache = await caches.open(CACHE_NAME);

  const urls: string[] = [];
  for (const z of opts.zooms) {
    for (const [x, y] of tilesForBounds(opts.bounds, z)) {
      urls.push(tileUrl(z, x, y));
    }
  }

  let done = 0;
  await runPool(
    urls,
    async (url) => {
      const existing = await cache.match(url);
      if (!existing) {
        const res = await fetch(url, { mode: "cors" });
        if (res.ok) await cache.put(url, res.clone());
      }
      done += 1;
      opts.onProgress?.(done, urls.length);
    },
    MAX_PARALLEL
  );

  localStorage.setItem(DONE_FLAG, "1");
}
