import { useLayoutEffect, useRef, useState } from "react";
import { ArrowUpDown } from "lucide-react";
import { useAppStore } from "../store/useAppStore";

/** Small icon button between the From and To rows. Tapping swaps
 *  point A ↔ point B (coords + display text), useful when the user
 *  put From/To on the wrong rows or wants to plan the reverse trip
 *  (e.g. work → home, then home → work).
 *
 *  Position is computed by measuring the actual input boxes (via
 *  data-point-target on the inputs) so the button always lands at
 *  the midpoint between the From and To input boxes, aligned with
 *  the trailing icon column — no guessing. */
export function SwapButton() {
  const swapPoints = useAppStore((s) => s.swapPoints);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  // Server-side debug logger.
  const logDbg = (data: Record<string, string | number | boolean>) => {
    const params = new URLSearchParams();
    Object.entries(data).forEach(([k, v]) => params.set(k, String(v)));
    fetch(`/__swap?${params.toString()}`).catch(() => {});
  };

  // useLayoutEffect runs synchronously after DOM mutations but
  // before paint — measurement and reposition happen in the same
  // frame, so the user never sees the fallback position.
  useLayoutEffect(() => {
    const button = buttonRef.current;
    if (!button) {
      logDbg({ event: "no-button" });
      return;
    }
    // Walk up to the smallest ancestor that contains BOTH inputs.
    // offsetParent can resolve to a higher ancestor (the whole card)
    // on iOS Safari; we want the tightest wrapper around the rows so
    // the swap button is centered between them, not between the
    // header and Find button.
    let container: HTMLElement | null = button.parentElement;
    while (container) {
      const a = container.querySelector('input[data-point-target="A"]');
      const b = container.querySelector('input[data-point-target="B"]');
      if (a && b) break;
      container = container.parentElement;
    }
    if (!container) {
      logDbg({ event: "no-container" });
      return;
    }
    logDbg({ event: "mount", hasContainer: true });
    const measure = () => {
      const inputA = container.querySelector<HTMLInputElement>(
        'input[data-point-target="A"]'
      );
      const inputB = container.querySelector<HTMLInputElement>(
        'input[data-point-target="B"]'
      );
      if (!inputA || !inputB) {
        logDbg({
          event: "no-inputs",
          A: !!inputA,
          B: !!inputB,
          inputs: container.querySelectorAll("input").length,
        });
        return;
      }
      const cRect = container.getBoundingClientRect();
      // `inputA.parentElement` = the rounded input flex row (the
      // visible "box" with the search icon and trailing buttons).
      const rowA = inputA.parentElement!.getBoundingClientRect();
      const rowB = inputB.parentElement!.getBoundingClientRect();
      // To find the start of the second row's "label area" (the
      // FROM/TO uppercase tag), walk up from rowB to find its
      // PointRow root (the wrapper containing the label + input
      // box). Its top is where the label starts — and that's the
      // visually empty space we want to center the arrow in.
      const pointRowB = inputB.closest("[data-point-row]");
      const pointRowBRect = pointRowB
        ? pointRowB.getBoundingClientRect()
        : rowB; // fallback to input row if marker missing
      // Visually empty gap: from From-input-bottom to To-row-top
      // (where the "TO" label begins). Center the arrow there.
      const gapTop = rowA.bottom;
      const gapBottom = pointRowBRect.top;
      const top = (gapTop + gapBottom) / 2 - cRect.top;
      // Map icon's center sits ~15px inside the input row's right
      // edge (p-2 padding + half-icon). Place the swap button's
      // CENTER at that same x, accounting for half its width (14px).
      const right = cRect.right - rowA.right + 15 - 14;
      logDbg({
        event: "measured",
        cRectTop: Math.round(cRect.top),
        cRectRight: Math.round(cRect.right),
        rowARight: Math.round(rowA.right),
        rowATop: Math.round(rowA.top),
        rowBTop: Math.round(rowB.top),
        top: Math.round(top),
        right: Math.round(right),
      });
      setPos({ top: Math.round(top), right: Math.round(right) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(container);
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
