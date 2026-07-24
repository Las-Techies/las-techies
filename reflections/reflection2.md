# Reflection #2

Pod Members: **Esme, Frida, Melanie, Reyna**

## Reflection Questions

* Name at least one successful thing this week.

We got a working end-to-end MVP scenario running: a manager signs in with Google (and can name the team they're creating at signup), uploads or imports onboarding docs (file upload, Google Doc/Drive, and GitHub repo), generates an AI quiz grounded in that content with per-question citations, and invites a new hire by email. The new hire accepts the invite, reads the material, and takes the assigned quiz. We also shipped the RAG-backed "Ask Sage" chatbot (pgvector similarity search over document chunks) as a floating widget available to both roles.

* What were some challenges you and/or your group faced this week?

The biggest challenge was scope creep versus our original spec. As we built, our real architecture diverged from the planning docs in several places — most notably we replaced the planned `quiz_attempts` model with a simpler `QuizAssignment` flow, dropped the Confluence import in favor of Google Drive + GitHub, and never built the standalone `/api/auth/*` and `/api/quiz-attempts/*` endpoints because auth is handled by middleware and assignment tracking covered the learner flow. Keeping everyone aligned on which endpoints and tables actually exist got harder as the code moved faster than the docs. We also spent real effort on the citation-highlighting feature (matching AI-cited snippets back to the source doc, including a fuzzy/multi-sentence fallback).

* Did you finish all of your tasks in your sprint plan for this week? If you did not finish all of the planned tasks, how would you prioritize the remaining tasks on your list?  (i.e over planned, did not know how to implement certain features, miscommunication from the team, had to pivot from original plans, etc.)

We finished the core MVP path but pivoted away from a few originally-planned items. We had to cut the separate quiz-attempts resource, the manager progress dashboard endpoint (`/api/teams/:teamId/progress`), the Confluence importer, and the GUS team-import endpoint. Most of these were deliberate scope cuts to hit a coherent MVP rather than blocked work. Remaining priorities for Sprint 3, in order: (1) a real manager progress/results view, (2) persisting learner results server-side (right now some learner state lives in `localStorage`), and (3) reconciling the remaining planning docs with what we shipped.

* Did your team perform a spec audit this sprint? What did you find — were there gaps between the documented and actual behavior? Is the Spec Reconciliation — Sprint 2 Midpoint section committed to your repo?

Yes. We audited `data_model.md`, `api_contracts.md`, the State Architecture table, and the AI Feature spec in `project_plan.md`. We found meaningful drift: the data model still described a `quiz_attempts` table and `approved`/`published_at` quiz fields that no longer exist (the code uses `QuizAssignment` plus `passingScore`/`timeLimitMinutes`/`dueDate`), and it didn't document the new `DocumentChunk`, `ChatConversation`, `ChatMessage`, and `Invite` tables. The API contracts listed auth and quiz-attempt endpoints that were never built and import routes (Confluence) we replaced with Google Drive/GitHub. The AI quiz-generation spec, by contrast, matched the code well (citations, retry, manager-only). The full findings are committed in the **Spec Reconciliation — Sprint 2 Midpoint** section of `planning/project_plan.md`.

* Which spec sections were most useful during development? Which were too vague to be actionable, and how did you address that?

The AI Feature spec (quiz generation) and the question payload contract were the most useful — the explicit required-fields list and citation-validation rule translated almost directly into the generator's validation code. The Library AI Chatbot spec was too vague to build against ("final route can be confirmed during implementation," raw_text context with no retrieval strategy); we addressed it by designing the RAG pipeline (chunking + embeddings + pgvector) ourselves and are now backfilling the spec to describe it. The State Architecture table also drifted quickly because we settled on a mostly-`localStorage` approach for the workflow instead of the in-memory state owners it described.

* Were there features you cut for MVP? Did you update the spec to reflect those decisions — and record them in the Decisions Log?

Yes — we cut the standalone quiz-attempts resource, the Confluence importer, the GUS import, and the dedicated `/api/auth/*` endpoints. We updated `project_plan.md` to mark these out of scope and recorded each cut (with rationale) in the new Decisions Log section alongside the AI Feature Decisions Log.

* Which features and user stories are "at risk"? How will you adjust your plan for Sprint 3?

"Progress Tracking" (manager dashboard of completion rates and average scores) is the most at-risk story — the assignment model captures scores per assignment but we haven't built the aggregate view or endpoint. Server-side persistence of learner results is also at risk since some learner/quiz state still lives in `localStorage`. For Sprint 3 we'll prioritize a real progress endpoint + dashboard and migrate learner state off `localStorage`, keeping the scope tight rather than adding new ingestion sources.
