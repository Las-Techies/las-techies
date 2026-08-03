import type { Variants } from "framer-motion";

/**
 * Shared entrance-motion vocabulary, matching the "smooth-out" ease the About
 * page and the app's CSS transition tokens already use
 * (cubic-bezier(0.22, 1, 0.36, 1)). Import these instead of re-declaring
 * variants per page so every screen animates in with the same feel.
 *
 * Usage (stagger a list/grid on mount):
 *   <motion.div variants={staggerParent} initial="hidden" animate="show">
 *     {items.map((it) => (
 *       <motion.div key={it.id} variants={staggerChild}>…</motion.div>
 *     ))}
 *   </motion.div>
 */
export const smoothOut = [0.22, 1, 0.36, 1] as const;

// A single element easing up + fading in.
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 16, scale: 0.985 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.5, ease: smoothOut },
  },
};

// Parent container that releases its children one after another.
export const staggerParent: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.04 } },
};

// Child of a staggerParent — a slightly springier rise for card grids/lists.
export const staggerChild: Variants = {
  hidden: { opacity: 0, y: 18, scale: 0.97 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.45, ease: smoothOut },
  },
};
