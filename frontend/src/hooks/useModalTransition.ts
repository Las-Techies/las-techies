import { useEffect, useRef, useState } from "react";

// Matches --modal-close-dur in global.css's `.t-modal` rules. Keeping this
// in sync manually (rather than reading the CSS var) is fine here — if the
// token ever changes, bump this constant too.
const MODAL_CLOSE_MS = 150;

/**
 * Keeps a conditionally-rendered modal mounted for `--modal-close-dur`
 * after `isOpen` flips back to false, so the `.is-closing` scale-down /
 * fade transition on `.t-modal` (see global.css) actually gets to play
 * instead of the dialog disappearing the instant its condition goes falsy.
 *
 * Usage:
 *   const { shouldRender, phaseClassName } = useModalTransition(isOpen);
 *   if (!shouldRender) return null;
 *   <div className={`modal-backdrop t-modal-backdrop ${phaseClassName}`}>
 *     <div className={`modal-card t-modal ${phaseClassName}`}>…</div>
 *   </div>
 */
export function useModalTransition(isOpen: boolean) {
  const [shouldRender, setShouldRender] = useState(isOpen);
  const [isEntered, setIsEntered] = useState(isOpen);
  const rafRef = useRef<number | null>(null);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (closeTimeoutRef.current !== null) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }

    if (isOpen) {
      setShouldRender(true);
      // Double rAF: mount in the closed (base) state first, then flip to
      // .is-open on the next paint so the browser actually has something
      // to transition from instead of jumping straight to the open state.
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = requestAnimationFrame(() => setIsEntered(true));
      });
      return () => {
        if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      };
    }

    setIsEntered(false);
    closeTimeoutRef.current = setTimeout(() => setShouldRender(false), MODAL_CLOSE_MS);
    return () => {
      if (closeTimeoutRef.current !== null) clearTimeout(closeTimeoutRef.current);
    };
  }, [isOpen]);

  return {
    shouldRender,
    phaseClassName: isEntered ? "is-open" : "is-closing",
  };
}

/**
 * Remembers the last non-null/undefined value it was given. Pair with
 * `useModalTransition` for dialogs whose content is derived from a
 * nullable "which item is open" piece of state (e.g. a selected row id) —
 * closing that state to `null` would otherwise blank the dialog's content
 * out from under it while the close animation is still playing.
 */
export function useLastNonNull<T>(value: T | null | undefined): T | null {
  const [frozen, setFrozen] = useState<T | null>(value ?? null);

  useEffect(() => {
    if (value != null) setFrozen(value);
  }, [value]);

  return frozen;
}
