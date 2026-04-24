import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Info } from "lucide-react";

interface Props {
  onOpen: () => void;
}

/** Rendered via portal into <body> so no ancestor (Leaflet transforms,
 *  stacking contexts, etc.) can hide or reposition it. Uses inline
 *  styles for guaranteed specificity over any leaflet/tailwind rule. */
export function CreditStrip({ onOpen }: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(
    <button
      type="button"
      onClick={onOpen}
      title="About Sasakay"
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
