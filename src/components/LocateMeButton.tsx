import { useState } from "react";
import { Crosshair, Loader2 } from "lucide-react";
import { useAppStore } from "../store/useAppStore";

/** Floating "Locate me" button. Standard map-app pattern: explicit
 *  one-tap re-center on the user's GPS position. Sits above the
 *  filter rail on mobile and at top-right on desktop. */
export function LocateMeButton() {
  const requestPan = useAppStore((s) => s.requestPan);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onClick = () => {
    if (!("geolocation" in navigator)) {
      setError("Geolocation not supported on this device.");
      return;
    }
    setError(null);
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        requestPan([pos.coords.longitude, pos.coords.latitude], 16);
        setLoading(false);
      },
      (err) => {
        setLoading(false);
        if (err.code === err.PERMISSION_DENIED) {
          setError(
            "Location blocked. Enable Safari Websites in Settings → Privacy & Security → Location Services."
          );
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          setError("Couldn't determine your location.");
        } else {
          setError(err.message || "Couldn't get your location.");
        }
        // Auto-clear so the toast doesn't linger.
        window.setTimeout(() => setError(null), 4500);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  };

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        disabled={loading}
        title="Locate me"
        aria-label="Locate me"
        className="absolute z-[1000] right-3 md:right-4 bg-white text-gray-700 hover:text-emerald-700 active:bg-emerald-50 disabled:text-gray-300 shadow-[0_4px_14px_rgba(0,0,0,0.12)] ring-1 ring-black/5 rounded-full w-11 h-11 flex items-center justify-center transition-colors"
        style={{
          // Sit above the mobile filter rail (which is at top-right
          // ~12px from top with 44px buttons stacked). On desktop,
          // top-right corner.
          top: "calc(112px + env(safe-area-inset-top, 0px))",
        }}
      >
        {loading ? (
          <Loader2 size={18} className="animate-spin" />
        ) : (
          <Crosshair size={18} />
        )}
      </button>
      {error && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1100] bg-red-600 text-white text-[12px] px-3 py-2 rounded-lg shadow max-w-[88vw]">
          {error}
        </div>
      )}
    </>
  );
}
