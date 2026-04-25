// Shared category metadata used by the desktop CategoryFilter, the
// mobile MobileCategoryFilter, and place markers on the map. Order is
// the canonical display order; update once and both surfaces follow.

export interface CategoryDef {
  id: string;
  label: string;
  emoji: string;
  color: string;
}

export const CATEGORIES: CategoryDef[] = [
  { id: "mall", label: "Malls", emoji: "🛍", color: "#7c3aed" },
  { id: "terminal", label: "Terminals", emoji: "🚌", color: "#f59e0b" },
  { id: "government", label: "Gov't", emoji: "🏛", color: "#2563eb" },
  { id: "hospital", label: "Hospitals", emoji: "🏥", color: "#dc2626" },
  { id: "school", label: "Schools", emoji: "🎓", color: "#0891b2" },
  { id: "church", label: "Churches", emoji: "⛪", color: "#6b7280" },
  { id: "landmark", label: "Landmarks", emoji: "📍", color: "#059669" },
  { id: "market", label: "Markets", emoji: "🥬", color: "#ea580c" },
  { id: "park", label: "Parks", emoji: "🌳", color: "#16a34a" },
  { id: "sports", label: "Sports", emoji: "⚽", color: "#0ea5e9" },
  { id: "hotel", label: "Hotels", emoji: "🏨", color: "#be185d" },
  { id: "food", label: "Food", emoji: "🍽", color: "#e11d48" },
  { id: "cafe", label: "Cafes", emoji: "☕", color: "#a16207" },
  { id: "bank", label: "Banks", emoji: "🏦", color: "#1e40af" },
  { id: "gas", label: "Gas", emoji: "⛽", color: "#374151" },
  { id: "store", label: "Stores", emoji: "🏪", color: "#0d9488" },
];
