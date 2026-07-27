import { useRef } from "react";

/**
 * transitions.dev "avatar group hover" — hovering one item in a horizontal
 * row lifts it and gently lifts its neighbors with a power-falloff, then
 * everything snaps back with a bouncy overshoot on mouse-leave.
 *
 * Reads the --avatar-* motion tokens from global.css. Apply the returned
 * `rootRef`/`rootProps` to the row container, and spread `getItemProps(i)`
 * onto each item that also carries the `.t-avatar` class.
 *
 * The transition-timing-function is set inline immediately before writing
 * the `--shift` / `--scale-active` custom properties (rather than declared
 * once in CSS) so the hover-in and the mouse-leave return can use different
 * eases — a clean ease-in on the way up, a bouncy spring on the way back —
 * without a second `.is-leaving` class.
 */
export function useAvatarGroupHover<T extends HTMLElement = HTMLDivElement>() {
  const rootRef = useRef<T>(null);

  const setShifts = (activeIdx: number | null, phase: "in" | "out") => {
    const root = rootRef.current;
    if (!root) return;

    const cs = getComputedStyle(document.documentElement);
    const num = (name: string, fallback: number) => {
      const value = parseFloat(cs.getPropertyValue(name));
      return Number.isFinite(value) ? value : fallback;
    };
    const ease = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;

    const lift = num("--avatar-lift", -4);
    const falloff = num("--avatar-falloff", 0.45);
    const scale = num("--avatar-scale", 1.05);
    const timingFunction =
      phase === "out"
        ? ease("--avatar-ease-out", "cubic-bezier(0.34, 3.85, 0.64, 1)")
        : ease("--avatar-ease-in", "cubic-bezier(0.22, 1, 0.36, 1)");

    root.querySelectorAll<HTMLElement>(".t-avatar").forEach((el, i) => {
      el.style.transitionTimingFunction = timingFunction;
      if (activeIdx == null) {
        el.style.setProperty("--shift", "0px");
        el.style.setProperty("--scale-active", "1");
        return;
      }
      const distance = Math.abs(i - activeIdx);
      el.style.setProperty("--shift", (lift * Math.pow(falloff, distance)).toFixed(3) + "px");
      el.style.setProperty("--scale-active", i === activeIdx ? String(scale) : "1");
    });
  };

  return {
    rootRef,
    rootProps: {
      onMouseLeave: () => setShifts(null, "out"),
    },
    getItemProps: (index: number) => ({
      onMouseEnter: () => setShifts(index, "in"),
    }),
  };
}
