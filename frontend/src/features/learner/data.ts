// Lightweight labels shared by the new-hire Home screen. Document content now
// comes from the backend; only these placeholder labels remain as fallbacks for
// fields the backend does not yet provide (assigned-by, team, etc.).

export type SourceKind = "file" | "confluence" | "repo";

export const learnerModule = {
  title: "OSHA Basics 2026",
  assignedBy: "Maria Santos",
  team: "Frontline Ops Team",
  dueLabel: "Jul 5",
  description:
    "Review the team's safety materials, then pass the quiz to complete your onboarding.",
  totalDocs: 4,
};
