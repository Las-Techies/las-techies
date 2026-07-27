import { useEffect, useRef } from "react";

/**
 * A soft light halo that smoothly trails the cursor to give the aurora-sky
 * backdrop a subtle sense of depth. Renders behind all app content and is
 * disabled automatically for users who prefer reduced motion.
 */
export default function CursorGlow() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;

    let raf = 0;
    let curX = window.innerWidth / 2;
    let curY = window.innerHeight * 0.35;
    let tgtX = curX;
    let tgtY = curY;

    const onMove = (e: MouseEvent) => {
      tgtX = e.clientX;
      tgtY = e.clientY;
    };

    const tick = () => {
      // ease toward the pointer so the glow lags slightly ("follows around")
      curX += (tgtX - curX) * 0.12;
      curY += (tgtY - curY) * 0.12;
      el.style.transform = `translate3d(${curX}px, ${curY}px, 0)`;
      raf = requestAnimationFrame(tick);
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    raf = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("mousemove", onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  return <div ref={ref} className="cursor-glow" aria-hidden="true" />;
}
