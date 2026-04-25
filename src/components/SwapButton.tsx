import { useLayoutEffect, useRef, useState } from "react";
import { ArrowUpDown } from "lucide-react";
import { useAppStore } from "../store/useAppStore";

/** Small icon button between the From and To rows. Tapping swaps
 *  point A ↔ point B (coords + display text), useful when the user
 *  put From/To on the wrong rows or wants to plan the reverse trip
 *  (e.g. work → home, then home → work).
 *
 *  Position is measured from the actual rendered DOM (the From/To
 *  input rows), so the arrow lands precisely in the visible gap
 *  between the two input boxes, aligned horizontally with the map
 *  icon column. Re-measures on resize. */
export function SwapButton() {
  const swapPoints = useAppStore((s) => s.swapPoints);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  useLayoutEffect(() => {
    const button = buttonRef.current;
    if (!button) return;
    // Walk up to the smallest ancestor that contains BOTH inputs.
    // offsetParent can resolve to a higher ancestor on iOS Safari;
    // we want the tightest wrapper around the rows so the swap is
    // centered between them, not between the card header and the
    // Find button.
    let container: HTMLElement | null = button.parentElement;
    while (container) {
      const a = container.querySelector('input[data-point-target="A"]');
      const b = container.querySelector('input[data-point-target="B"]');
      if (a && b) break;
      container = container.parentElement;
    }
    if (!container) return;
    const c = container;
    const measure = () => {
      const inputA = c.querySelector<HTMLInputElement>(
        'input[data-point-target="A"]'
      );
      const inputB = c.querySelector<HTMLInputElement>(
        'input[data-point-target="B"]'
      );
      if (!inputA || !inputB) return;
      const cRect = c.getBoundingClientRect();
      // `inputA.parentElement` = the rounded input flex row (the
      // visible "box" with the search icon and trailing buttons).
      const rowA = inputA.parentElement!.getBoundingClientRect();
      const rowB = inputB.parentElement!.getBoundingClientRect();
      // To find where the second row's "label area" begins (FROM/TO
      // uppercase tag), use the PointRow root (data-point-row marker).
      // Its top is the start of the label — and the visually empty
      // gap is from From-input-bottom to that label-top.
      const pointRowB = inputB.closest("[data-point-row]");
      const pointRowBRect = pointRowB
        ? pointRowB.getBoundingClientRect()
        : rowB;
      const gapTop = rowA.bottom;
      const gapBottom = pointRowBRect.top;
      const top = (gapTop + gapBottom) / 2 - cRect.top;
      // Map icon's center sits ~15px inside the input row's right
      // edge (p-2 padding + half-icon). Place the swap button's
      // center at that same x, accounting for half its width (14px).
      const right = cRect.right - rowA.right + 15 - 14;
      setPos({ top: Math.round(top), right: Math.round(right) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(c);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={swapPoints}
      title="Swap From and To"
      aria-label="Swap From and To"
      className="absolute z-10 w-7 h-7 flex items-center justify-center text-gray-500 hover:text-emerald-700 active:text-emerald-800 transition-colors"
      style={{
        top: pos ? `${pos.top}px` : "50%",
        right: pos ? `${pos.right}px` : "14px",
        transform: "translateY(-50%)",
      }}
    >
      <ArrowUpDown size={16} />
    </button>
  );
}
