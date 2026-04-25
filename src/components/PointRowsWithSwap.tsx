import { PointRow } from "./PointPicker";
import { SwapButton } from "./SwapButton";

/** Wraps the two PointRows (From + To) and overlays a SwapButton.
 *  SwapButton measures position from its own offsetParent — no need
 *  to thread refs through. */
export function PointRowsWithSwap({
  spacingClass,
  showSwap = true,
}: {
  spacingClass: string;
  showSwap?: boolean;
}) {
  return (
    <div className={`relative ${spacingClass}`}>
      <PointRow target="A" label="From" dotColor="#059669" />
      <PointRow target="B" label="To" dotColor="#dc2626" />
      {showSwap && <SwapButton />}
    </div>
  );
}
