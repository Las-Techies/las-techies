import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

/**
 * Cross-fades between mutually-exclusive view states (e.g. a "Loading…"
 * placeholder and the loaded content) so a page body eases in when data
 * arrives instead of snapping. `swapKey` identifies the current state —
 * change it (loading -> content) to trigger the fade; keep it stable while
 * only the data inside a state updates so it doesn't re-animate on every
 * refetch. Honors prefers-reduced-motion by collapsing to a near-instant swap.
 *
 * Layout-neutral: the wrapper is a plain block, so children keep their own
 * margins. `mode="wait"` fades the old state fully out before the new one
 * fades in, which reads as a smooth shift rather than a blended overlap.
 */
export default function FadeSwap({
  swapKey,
  children,
  className,
}: {
  swapKey: string;
  children: ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const transition = reduce
    ? { duration: 0.1 }
    : { duration: 0.22, ease: [0.22, 1, 0.36, 1] as const };

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={swapKey}
        className={className}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={transition}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
