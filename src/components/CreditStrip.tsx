import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Info } from "lucide-react";
import { useAppStore } from "../store/useAppStore";

interface Props {
  onOpen: () => void;
}

/** Rendered via portal into <body> so no ancestor (Leaflet transforms,
 *  stacking contexts, etc.) can hide or reposition it. Uses inline
 *  styles for guaranteed specificity over any leaflet/tailwind rule. */
export function CreditStrip({ onOpen }: Props) {
  const [mounted, setMounted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const tripPlan = useAppStore((s) => s.tripPlan);
  useEffect(() => {
    setMounted(true);
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  if (!mounted) return null;
  // The mobile bottom sheet owns the bottom edge and includes its own
  // bytebento credit link, so the floating pill is desktop-only.
  if (isMobile) return null;
  void tripPlan; // eslint-disable-line @typescript-eslint/no-unused-expressions
  return createPortal(
    <button
      type="button"
      onClick={onOpen}
      title="About komyut.online"
      style={{
        position: "fixed",
        bottom: "max(12px, env(safe-area-inset-bottom, 0px))",
        left: "max(12px, env(safe-area-inset-left, 0px))",
        zIndex: 2147483647,
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "8px 14px",
        borderRadius: 9999,
        background: "rgba(255,255,255,0.97)",
        color: "#111827",
        fontSize: 12,
        fontWeight: 500,
        boxShadow: "0 8px 24px rgba(0,0,0,0.18), 0 2px 6px rgba(0,0,0,0.08)",
        border: "1px solid rgba(0,0,0,0.08)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        cursor: "pointer",
      }}
    >
      <Info size={14} color="#059669" />
      <span>
        by{" "}
        <span style={{ fontWeight: 800, color: "#047857" }}>bytebento.ph</span>
      </span>
    </button>,
    document.body
  );
}
