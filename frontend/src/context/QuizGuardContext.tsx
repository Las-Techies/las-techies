import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

/**
 * Tracks whether a new hire is mid-quiz so the rest of the app (chiefly
 * AppNav) can guard against accidentally navigating away and losing progress.
 *
 * Two pieces:
 * - `isQuizInProgress` — set true by QuizTakingPage once the quiz starts, and
 *   cleared on submit/unmount. Drives the beforeunload warning + the nav
 *   confirm modal.
 * - `requestNavigation(go)` — AppNav (and any in-app link) calls this instead
 *   of navigating directly. When a quiz is in progress it stashes the pending
 *   action and opens a confirm modal; otherwise it runs immediately.
 */
type QuizGuardContextValue = {
  isQuizInProgress: boolean;
  setQuizInProgress: (inProgress: boolean) => void;
  /** True while the "leave the quiz?" confirm modal is open. */
  isLeavePromptOpen: boolean;
  /**
   * Guarded navigation entry point. Runs `go` immediately when no quiz is in
   * progress; otherwise opens the confirm modal and defers `go` until the
   * user confirms.
   */
  requestNavigation: (go: () => void) => void;
  /** Confirm leaving: runs the pending navigation and clears quiz state. */
  confirmLeave: () => void;
  /** Dismiss the modal and stay on the quiz. */
  cancelLeave: () => void;
};

const QuizGuardContext = createContext<QuizGuardContextValue | undefined>(undefined);

export function QuizGuardProvider({ children }: { children: ReactNode }) {
  const [isQuizInProgress, setIsQuizInProgress] = useState(false);
  const [isLeavePromptOpen, setIsLeavePromptOpen] = useState(false);
  // The navigation action deferred while the confirm modal is open.
  const pendingActionRef = useRef<(() => void) | null>(null);

  const setQuizInProgress = useCallback((inProgress: boolean) => {
    setIsQuizInProgress(inProgress);
    // Leaving the quiz (submit/unmount) invalidates any deferred prompt.
    if (!inProgress) {
      setIsLeavePromptOpen(false);
      pendingActionRef.current = null;
    }
  }, []);

  const requestNavigation = useCallback(
    (go: () => void) => {
      if (!isQuizInProgress) {
        go();
        return;
      }
      pendingActionRef.current = go;
      setIsLeavePromptOpen(true);
    },
    [isQuizInProgress]
  );

  const confirmLeave = useCallback(() => {
    const go = pendingActionRef.current;
    pendingActionRef.current = null;
    setIsLeavePromptOpen(false);
    setIsQuizInProgress(false);
    go?.();
  }, []);

  const cancelLeave = useCallback(() => {
    pendingActionRef.current = null;
    setIsLeavePromptOpen(false);
  }, []);

  return (
    <QuizGuardContext.Provider
      value={{
        isQuizInProgress,
        setQuizInProgress,
        isLeavePromptOpen,
        requestNavigation,
        confirmLeave,
        cancelLeave,
      }}
    >
      {children}
    </QuizGuardContext.Provider>
  );
}

export function useQuizGuard(): QuizGuardContextValue {
  const context = useContext(QuizGuardContext);
  if (!context) {
    throw new Error("useQuizGuard must be used within a QuizGuardProvider");
  }
  return context;
}
