import { prisma } from "../client";

/**
 * Seeds a coherent demo dataset that matches the requireAuth stub
 * (user id 1 / team id 1) plus a set of realistic engineering onboarding
 * documents to generate quizzes from.
 *
 * Idempotent: uses upserts keyed on fixed ids, so it's safe to re-run.
 * Run with: npm run seed
 */

const TEAM_ID = 1;
const MANAGER_ID = 1;

type SeedDoc = {
  id: number;
  title: string;
  rawText: string;
};

const onboardingDocuments: SeedDoc[] = [
  {
    id: 1,
    title: "Engineering Onboarding Guide",
    rawText: `Welcome to the Platform Engineering team!

Getting your environment set up:
1. Request access to the GitHub organization and clone the monorepo.
2. Install Node.js v20 LTS and pnpm. Run "pnpm install" from the repo root.
3. Copy .env.example to .env and ask your onboarding buddy for the shared dev credentials. Never commit .env files.
4. Start the local stack with "pnpm dev". This boots the API on port 4000 and the web app on port 5173.
5. Run "pnpm test" to confirm your setup — all suites should pass before you push.

Who to ask for help:
- Slack channel #platform-eng for general questions.
- Your assigned onboarding buddy for environment issues during your first two weeks.
- The on-call engineer (see the on-call runbook) for anything blocking production.

Your first task is always a "good first issue" labeled ticket. Open a draft pull request early so your buddy can give feedback before you're done.`,
  },
  {
    id: 2,
    title: "Deployment and Release Workflow",
    rawText: `Deployment and Release Workflow

Our deployment pipeline follows a strict promotion path: development -> staging -> production.

Step-by-step:
1. Open a pull request against the main branch. Every PR requires at least one approving review.
2. Continuous integration (CI) runs the linter, type checks, and the full test suite. A PR cannot be merged until CI is green.
3. Once merged to main, a release candidate is automatically built and deployed to the staging environment.
4. A team member performs smoke testing on staging. Verify the health check endpoint returns 200 and run the critical-path checklist.
5. To promote to production, a maintainer cuts a release by tagging the commit (for example, v1.4.0) and approving the production deploy in the release dashboard.

Rollbacks:
If a production issue is detected, roll back by re-deploying the previous release tag from the dashboard. Rollbacks take about two minutes. Never hotfix directly on the production server; always go through a PR.

Deploy windows:
Production deploys are allowed Monday through Thursday, 9am to 4pm. No Friday or weekend deploys except for approved emergency hotfixes.`,
  },
  {
    id: 3,
    title: "Team Charter — Onboarding Quiz Platform",
    rawText: `Team Charter: Onboarding Quiz Platform

Mission:
Help managers turn internal documentation into interactive onboarding quizzes so new hires ramp up faster and retain more.

Scope of the MVP:
- Managers upload a document (txt, pdf, or docx).
- The system extracts the text and generates a multiple-choice quiz using an LLM.
- New hires take the quiz and managers review results.

Tech stack:
- Backend: Node.js with Express and TypeScript, Prisma ORM, Postgres hosted on Supabase.
- AI: Salesforce Express LLM Gateway (Claude) for quiz generation.
- Frontend: React with Vite.

Ways of working:
- We work in one-week sprints with a demo every Friday.
- Small pull requests, merged often, each with one review.
- Branch naming: feat/, fix/, chore/. Commit prefixes match.
- Decisions and contracts live in the planning folder so everyone shares one mental model.

Definition of done for a feature:
Code is reviewed, tests pass in CI, the contract in planning is respected, and the change is demoed on staging.`,
  },
  {
    id: 4,
    title: "On-Call Runbook",
    rawText: `On-Call Runbook

Rotation:
On-call rotates weekly, handed off every Monday at 10am during standup. The primary on-call carries the pager; the secondary is backup if the primary does not acknowledge within 15 minutes.

Responsibilities:
- Acknowledge every alert within 15 minutes.
- Triage severity. SEV1 means production is down or data is at risk; SEV2 means degraded but usable; SEV3 is minor.
- For SEV1, start an incident channel, post updates every 30 minutes, and page the engineering manager.

Common issues:
- High API latency: check the database connection pool. If connections are exhausted, restart the API service and investigate slow queries.
- Failed deploy: roll back to the previous release tag from the dashboard, then investigate in staging.
- Auth errors after deploy: verify the environment variables were loaded; a missing secret is the most common cause.

Post-incident:
Every SEV1 and SEV2 requires a blameless postmortem within three business days, documenting the timeline, root cause, and action items.`,
  },
  {
    id: 5,
    title: "Code Review Guidelines",
    rawText: `Code Review Guidelines

Why we review:
Code review spreads knowledge, catches bugs early, and keeps the codebase consistent. Reviews are about the code, never the person.

For the author:
- Keep pull requests small and focused — ideally under 400 lines of change.
- Write a clear description explaining the "why", not just the "what".
- Make sure CI is green before requesting review.
- Respond to every comment, even if just to acknowledge it.

For the reviewer:
- Aim to give a first response within one business day.
- Approve when the code is correct, tested, and readable — not only when it is perfect. Use "nit:" for optional suggestions.
- Block only for correctness, security, or maintainability concerns.

Standards we enforce:
- No secrets committed to the repository.
- New logic is covered by tests.
- Public functions have clear names and types.
- Error handling returns consistent JSON, never leaks stack traces to clients.`,
  },
];

async function main() {
  const team = await prisma.team.upsert({
    where: { id: TEAM_ID },
    update: {},
    create: {
      id: TEAM_ID,
      name: "Platform Engineering",
      description: "Default team for the onboarding quiz MVP demo.",
    },
  });

  const manager = await prisma.user.upsert({
    where: { id: MANAGER_ID },
    update: {},
    create: {
      id: MANAGER_ID,
      email: "manager@example.com",
      fullName: "Demo Manager",
      role: "manager",
      teamId: TEAM_ID,
    },
  });

  for (const doc of onboardingDocuments) {
    await prisma.document.upsert({
      where: { id: doc.id },
      update: {
        title: doc.title,
        rawText: doc.rawText,
        status: "ready",
      },
      create: {
        id: doc.id,
        teamId: TEAM_ID,
        uploadedByUserId: MANAGER_ID,
        title: doc.title,
        sourceType: "upload",
        rawText: doc.rawText,
        status: "ready",
      },
    });
  }

  // Inserting rows with explicit ids does not advance Postgres' autoincrement
  // sequences, so a later upload would try to reuse id 1 and fail. Resync each
  // sequence to MAX(id) so new inserts continue past the seeded rows.
  await resyncSequence("Team");
  await resyncSequence("User");
  await resyncSequence("Document");

  console.log(
    `Seed complete: team "${team.name}" (id ${team.id}), user "${manager.fullName}" (id ${manager.id}), ${onboardingDocuments.length} onboarding documents (ids 1-${onboardingDocuments.length}).`
  );
}

async function resyncSequence(table: string) {
  await prisma.$executeRawUnsafe(
    `SELECT setval(pg_get_serial_sequence('"${table}"', 'id'), COALESCE((SELECT MAX(id) FROM "${table}"), 1))`
  );
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
