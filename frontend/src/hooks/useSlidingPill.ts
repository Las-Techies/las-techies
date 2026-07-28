import { useLayoutEffect, useRef } from "react";

/**
 * transitions.dev "tabs sliding" — a pill slides between the active option
 * in a segmented control / tab bar. Measures with getBoundingClientRect
 * (rather than offsetLeft/offsetWidth) so it works regardless of what's
 * positioned between the container and the active item.
 *
 * Usage: put `containerRef` on the bar, `pillRef` on the absolutely
 * positioned pill element inside it, and `setItemRef(key)` as a ref
 * callback on each option. The pill snaps to position on first paint
 * (no transition) and slides on every subsequent `activeKey` change.
 */
export function useSlidingPill<
  C extends HTMLElement = HTMLDivElement,
  P extends HTMLElement = HTMLDivElement,
>(activeKey: string | number) {
  const containerRef = useRef<C | null>(null);
  const pillRef = useRef<P | null>(null);
  const itemsRef = useRef(new Map<string | number, HTMLElement>());
  const hasMountedRef = useRef(false);

  const move = (animate: boolean) => {
    const container = containerRef.current;
    const pill = pillRef.current;
    const active = itemsRef.current.get(activeKey);
    if (!container || !pill || !active) return;

    const containerRect = container.getBoundingClientRect();
    const activeRect = active.getBoundingClientRect();
    const left = activeRect.left - containerRect.left;

    if (!animate) {
      const prevTransition = pill.style.transition;
      pill.style.transition = "none";
      pill.style.transform = `translateX(${left}px)`;
      pill.style.width = `${activeRect.width}px`;
      void pill.offsetWidth;
      pill.style.transition = prevTransition;
      return;
    }

    pill.style.transform = `translateX(${left}px)`;
    pill.style.width = `${activeRect.width}px`;
  };

  useLayoutEffect(() => {
    move(hasMountedRef.current);
    hasMountedRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey]);

  useLayoutEffect(() => {
    const handleResize = () => move(false);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setItemRef = (key: string | number) => (el: HTMLElement | null) => {
    if (el) itemsRef.current.set(key, el);
    else itemsRef.current.delete(key);
  };

  return { containerRef, pillRef, setItemRef };
}
