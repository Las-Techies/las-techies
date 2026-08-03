import { animate, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import { smoothOut } from "../lib/motion";

/**
 * Animates a whole number counting up from 0 to `value` when it mounts (and
 * re-counts whenever `value` changes, e.g. after a team switch) — the little
 * "stat rolls up" touch that makes a dashboard feel alive. Renders an optional
 * `suffix` (e.g. "%") right after the number. Honors prefers-reduced-motion by
 * showing the final value immediately.
 */
export default function CountUp({
  value,
  suffix = "",
  duration = 1,
  className,
}: {
  value: number;
  suffix?: string;
  duration?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    if (reduce) {
      setDisplay(value);
      return;
    }
    const controls = animate(0, value, {
      duration,
      ease: smoothOut,
      onUpdate: (latest) => setDisplay(Math.round(latest)),
    });
    return () => controls.stop();
  }, [value, duration, reduce]);

  return (
    <span className={className}>
      {display}
      {suffix}
    </span>
  );
}
