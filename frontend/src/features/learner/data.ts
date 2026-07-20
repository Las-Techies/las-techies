// Static content for the new-hire Learner Module. This is a frontend-only
// representation of a team's onboarding library — it mirrors the multi-format
// ingestion in the plan (uploaded files, Confluence pages, GitHub repos) so the
// UI can be built and demoed without new backend endpoints.

export type SourceKind = "file" | "confluence" | "repo";

export type LibraryDoc = {
  id: string;
  title: string;
  kind: SourceKind;
  typeLabel: string;
  addedLabel: string;
  pages?: number;
  /** Rendered inside the "View source" reader modal. */
  content: string;
  /** Sentence highlighted in the reader as the key/cited passage. */
  highlight?: string;
};

export const learnerModule = {
  title: "OSHA Basics 2026",
  assignedBy: "Maria Santos",
  team: "Frontline Ops Team",
  dueLabel: "Jul 5",
  description:
    "Review the team's safety materials, then pass the quiz to complete your onboarding.",
  totalDocs: 4,
};

export const recentlyAdded = [
  { id: "recent-1", title: "OSHA Quick Guide (2026)", addedLabel: "Added today" },
  { id: "recent-2", title: "Hazard Communication", addedLabel: "Added today" },
  { id: "recent-3", title: "PPE Requirements Overview", addedLabel: "Added 2 days ago" },
  { id: "recent-4", title: "Zone A Work Procedures", addedLabel: "Added 2 days ago" },
  { id: "recent-5", title: "Emergency Response Plan", addedLabel: "Added 3 days ago" },
  { id: "recent-6", title: "Lockout / Tagout Basics", addedLabel: "Added 3 days ago" },
  { id: "recent-7", title: "Fire Safety Overview", addedLabel: "Added 4 days ago" },
  { id: "recent-8", title: "Deployment Runbook", addedLabel: "Added 5 days ago" },
];

export const libraryDocs: LibraryDoc[] = [
  {
    id: "osha-guidelines",
    title: "OSHA_2026_Guidelines.pdf",
    kind: "file",
    typeLabel: "PDF",
    addedLabel: "Added 2 days ago",
    pages: 12,
    highlight:
      "Hearing protection must be worn when noise levels exceed 85 dB as measured by a calibrated sound level meter.",
    content: `OSHA 2026 Workplace Safety Guidelines

3. Personal Protective Equipment (PPE) — Zone A

All personnel working in Zone A must use appropriate personal protective equipment to minimize exposure to workplace hazards. The following PPE is required at all times while in this zone:

Hard hats meeting ANSI Z89.1 standards, safety glasses with side shields, cut-resistant gloves, steel-toe boots with slip-resistant soles, and high-visibility vests or clothing.

Hearing protection must be worn when noise levels exceed 85 dB as measured by a calibrated sound level meter.

PPE must be properly fitted, maintained in good condition, and replaced immediately if damaged or compromised. Employees are responsible for inspecting their PPE before each use.

3.1 Inspection Schedule

Fire extinguishers shall be inspected prior to each shift and formally inspected every 6 months. Inspectors must ensure any defective equipment is removed from service and replaced before use.`,
  },
  {
    id: "zone-a-procedures",
    title: "Zone_A_Work_Procedures.pdf",
    kind: "file",
    typeLabel: "PDF",
    addedLabel: "Added 2 days ago",
    pages: 8,
    highlight:
      "Only certified operators may enter Zone A during active machinery operation.",
    content: `Zone A Work Procedures

1. Entry and Access

Only certified operators may enter Zone A during active machinery operation. All others must wait for a supervised entry window and sign the Zone A access log.

2. Lockout / Tagout

Before servicing any equipment, apply lockout/tagout procedures and verify zero energy state. Never remove another worker's lock or tag.

3. Emergency Stops

Emergency stop buttons are located at each workstation and every 20 feet along the main corridor. Familiarize yourself with the nearest stop before beginning work.`,
  },
  {
    id: "deployment-runbook",
    title: "Deployment Runbook",
    kind: "confluence",
    typeLabel: "Confluence",
    addedLabel: "Added 3 days ago",
    highlight: "Always run the pre-deploy checklist before promoting to production.",
    content: `Deployment Runbook

Pre-checks

Always run the pre-deploy checklist before promoting to production. Confirm the staging smoke tests are green and that the on-call engineer has acknowledged the release window.

Release Steps

1. Tag the release and open the deploy pipeline.
2. Promote to staging and verify health checks.
3. Promote to production in batches, monitoring error rates between each batch.

Rollback

If error rates exceed the threshold, trigger an automatic rollback and page the on-call engineer.`,
  },
  {
    id: "team-infra-readme",
    title: "team-infra / README.md",
    kind: "repo",
    typeLabel: "GitHub",
    addedLabel: "Added 5 days ago",
    highlight: "Run `make bootstrap` once to provision your local environment.",
    content: `team-infra / README.md

Getting Started

Run \`make bootstrap\` once to provision your local environment. This installs dependencies, configures your local database, and seeds test data.

Common Commands

- \`make dev\` — start the local stack
- \`make test\` — run the full test suite
- \`make deploy ENV=staging\` — deploy to staging

Repository Layout

The \`/modules\` directory contains reusable infrastructure modules. Team-owned services live under \`/services\`.`,
  },
];
