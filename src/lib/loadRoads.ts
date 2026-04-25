export interface RoadWay {
  id: number;
  name: string | null;
  highway: string | null;
  /** "yes" = one-way forward, "-1" = one-way reverse, null = two-way. */
  oneway: string | null;
  /** OSM `junction` tag, notably "roundabout". Roundabouts are
   *  physically one-way but routing-wise we want the editor to allow
   *  any direction through them (jeeps just follow the rotation). */
  junction: string | null;
  coordinates: [number, number][];
}

interface RoadFeature {
  type: "Feature";
  id: number;
  properties: {
    id: number;
    highway: string | null;
    name: string | null;
    oneway: string | null;
    junction: string | null;
    ref: string | null;
  };
  geometry: { type: "LineString"; coordinates: [number, number][] };
}

interface RoadFeatureCollection {
  type: "FeatureCollection";
  features: RoadFeature[];
}

export async function loadRoads(): Promise<RoadWay[]> {
  const res = await fetch("/roads.geojson");
  if (!res.ok) throw new Error(`roads.geojson: ${res.status}`);
  const fc = (await res.json()) as RoadFeatureCollection;
  return fc.features.map((f) => ({
    id: f.properties.id,
    name: f.properties.name,
    highway: f.properties.highway,
    oneway: f.properties.oneway,
    junction: f.properties.junction ?? null,
    coordinates: f.geometry.coordinates,
  }));
}
