import type { CSSProperties } from "react";

/**
 * Low-fidelity placeholder block with a left-to-right shimmer — used to sketch
 * the shape of content that's still loading (a "skeleton screen") instead of a
 * spinner or "Loading…" text. Size it with `width`/`height` and round it with
 * `radius`; compose several together to mirror a real card/row layout so the UI
 * reads as "these boxes are about to fill in."
 *
 * The shimmer is purely decorative, so it's hidden from assistive tech and
 * collapses to a static gray box under prefers-reduced-motion (handled in CSS).
 */
export default function Skeleton({
  width,
  height = 14,
  radius = 8,
  className,
  style,
}: {
  width?: number | string;
  height?: number | string;
  radius?: number | string;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      aria-hidden
      className={`skeleton${className ? ` ${className}` : ""}`}
      style={{ width, height, borderRadius: radius, ...style }}
    />
  );
}

/**
 * Placeholder for a list of quiz question cards (prompt + four options) —
 * reuses the real `.qcard`/`.qopts` classes so it drops into the same
 * containers the loaded questions render into (quiz-details modal, review
 * screen, quiz-taking). Pass the wrapper `className` the real list uses.
 */
export function QuizCardsSkeleton({
  count = 3,
  className = "qcards rp-qcards",
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div className={className} aria-busy="true">
      {Array.from({ length: count }, (_, i) => (
        <article className="qcard is-skeleton" key={i}>
          <div className="qcard-head">
            <Skeleton width={26} height={26} radius={999} />
            <Skeleton width={`${78 - (i % 3) * 9}%`} height={16} style={{ flex: 1 }} />
          </div>
          <ul className="qopts">
            {[0, 1, 2, 3].map((j) => (
              <li className="qopt" key={j}>
                <span className="qopt-radio" aria-hidden />
                <Skeleton width={`${68 - j * 8}%`} height={13} />
              </li>
            ))}
          </ul>
        </article>
      ))}
    </div>
  );
}

/**
 * Placeholder for the team roster (checkbox + name/email rows) used in the
 * assign/invite modals.
 */
export function RosterSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="learner-roster" aria-busy="true">
      {Array.from({ length: count }, (_, i) => (
        <div className="learner-roster-item is-skeleton" key={i}>
          <Skeleton width={18} height={18} radius={5} />
          <span
            className="learner-roster-name"
            style={{ display: "grid", gap: 6, flex: 1 }}
          >
            <Skeleton width={`${48 + (i % 3) * 10}%`} height={13} />
            <Skeleton width={`${68 - (i % 3) * 6}%`} height={11} />
          </span>
        </div>
      ))}
    </div>
  );
}
