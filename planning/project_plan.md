# Project Plan

Pod Members: **Esme, Frida, Melanie, Reyna**

## Problem Statement and Description

Salesforce teams often onboard new hires with documentation that is scattered across different tools, formats, and owners. Because the content is not centralized or measured consistently, onboarding takes longer, managers answer the same questions repeatedly, and new hires ramp up at uneven speeds.

Our web app solves this by turning existing team onboarding docs into a structured, measurable onboarding flow. Managers can upload or import documentation (files, Confluence, GitHub), generate AI-assisted quiz drafts based on that real team content, review/edit before publishing, and monitor completion and scores in a team dashboard. New hires use one team-scoped portal to read onboarding material, take published quizzes, and validate readiness before joining sprint work.

## Project Board: [https://trello.com/b/5JS2t9Kl/tasks-for-capstone](https://trello.com/b/5JS2t9Kl/tasks-for-capstone)

## Tech Stack & Decisions

- **Language: TypeScript across the whole project (frontend + backend).** Chosen for type safety with Prisma (typed DB results), autocomplete, self-documenting code, and shared API-shape types between frontend and backend. Everyone writes `.ts` / `.tsx`; keep `strict: true` in `tsconfig.json`.
- **Backend:** Node.js + Express (TypeScript)
- **ORM:** Prisma (pinned to v6) against Postgres
- **Database:** Postgres hosted on Supabase
- **Auth:** Supabase Auth (email/password + GitHub/Google); optional `@salesforce.com` domain allowlist enforced by the app
- **Frontend:** React + Vite (TypeScript, `react-ts` template)
- **AI:** Salesforce Express LLM Gateway (Claude)

## User Roles and Personas

- **Manager / Team Lead**
  - Owns onboarding quality for the team
  - Uploads/imports docs, generates quizzes, edits/publishes quizzes, tracks progress
- **New Hire / Intern**
  - Needs faster ramp-up into team workflows
  - Uses the document library, takes published quizzes, reviews results/feedback

## User Stories

1. **Team Setup:** Manager creates a team and onboarding context.
2. **Document Management:** Manager uploads files or imports docs from Confluence/GitHub.
3. **Quiz Creation:** Manager generates AI quiz draft, edits questions, and publishes.
4. **Quiz Discovery:** New hire browses available onboarding quizzes/docs.
5. **Quiz Taking:** New hire completes quiz and receives score/feedback.
6. **Progress Tracking:** Manager views completion rates and average performance.

## Pages/Screens

- Auth/Login (Supabase Auth — email/password + GitHub/Google)
- Manager Dashboard (team progress + quiz/document stats)
- Document Submission/Import Portal (upload + Confluence + GitHub)
- Shared Document Library (manager + new hire)
- Quiz Builder (manager draft generation/edit/publish)
- Quiz List + Quiz Detail
- Quiz Taking Screen (new hire)
- Results / Attempt History
- Team Detail / Team Settings

Wireframes to include (at least 3):

- Document Submission/Import Portal
- Quiz Builder
- Quiz Taking Screen

## Data Model

Core MVP tables:

- **users:** `id`, `email`, `full_name`, `role` (`manager | new_hire`), `team_id`, `auth_provider`, `supabase_user_id`, timestamps
- **teams:** `id`, `name`, `description`, `created_by_user_id`, timestamps
- **documents:** `id`, `team_id`, `uploaded_by_user_id`, `title`, `source_type` (`upload | confluence | github | google_doc`), `source_url`, `storage_path`, `mime_type`, `status` (`processing | ready | failed`), `raw_text`, timestamps
- **quizzes:** `id`, `team_id`, `title`, `description`, `status` (`draft | published | archived`), `created_by_user_id`, `published_at`, `source_document_ids` (jsonb), `generation_config` (jsonb), `questions_payload` (jsonb), timestamps
- **quiz_attempts:** separate table for attempts with `quiz_id`, `user_id`, `attempt_number`, `status`, score/pass fields, `answers_payload`, timestamps

Relationship notes:

- One user belongs to one team (MVP simplification)
- Teams own documents and quizzes
- Quizzes are team-scoped and reference source docs used for generation
- Questions/options are embedded in `quizzes.questions_payload`
- Attempts are separate resources in `quiz_attempts`

---

## External APIs Used


| API                                         | Purpose                                                                                                                           | Used In Endpoints                         |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| **Salesforce LLM Gateway Express** (Claude) | Generate quiz questions from documents                                                                                            | `POST /api/quizzes/generate`              |
| **Confluence REST API**                     | Fetch Confluence page content                                                                                                     | `POST /api/documents/import-confluence`   |
| **GitHub API**                              | Fetch repository documentation/code                                                                                               | `POST /api/documents/import-github`       |
| **Supabase Auth**                           | Authenticate users (email/password + GitHub/Google social login); optional `@salesforce.com` domain allowlist enforced by the app | `POST /api/auth/sync`, `GET /api/auth/me` |
| **GUS API**                                 | Fetch team and membership data to populate the teams/users tables                                                                 | `POST /api/teams/import-gus` (planned)    |
| **Local Libraries** (pdf-parse, mammoth)    | Parse uploaded files                                                                                                              | `POST /api/documents/upload`              |


---

## Endpoints

### Documents

- `POST /api/documents/upload`
- `POST /api/documents/import-confluence`
- `POST /api/documents/import-github`
- `GET /api/teams/:teamId/documents`
- `GET /api/documents/:documentId`
- `DELETE /api/documents/:documentId`

### Quizzes

- `POST /api/quizzes/generate`
- `GET /api/teams/:teamId/quizzes`
- `GET /api/quizzes/:quizId`
- `PATCH /api/quizzes/:quizId`
- `PATCH /api/quizzes/:quizId/publish`
- `PATCH /api/quizzes/:quizId/archive`
- `DELETE /api/quizzes/:quizId`

### Quiz Questions (inside quiz payload)

- `POST /api/quizzes/:quizId/questions`
- `PATCH /api/quizzes/:quizId/questions/:questionId`
- `DELETE /api/quizzes/:quizId/questions/:questionId`

### Quiz Attempts

- `POST /api/quiz-attempts`
- `POST /api/quiz-attempts/:attemptId/answers`
- `POST /api/quiz-attempts/:attemptId/submit`
- `GET /api/users/:userId/quiz-attempts`
- `GET /api/quiz-attempts/:attemptId`

### Teams

- `POST /api/teams`
- `GET /api/teams/:teamId`
- `GET /api/teams/:teamId/progress`

### Auth (Supabase Auth)

- `POST /api/auth/sync`
- `GET /api/auth/me`
- `POST /api/auth/logout`

## State Architecture


|                     |          |                   |               |                                                     |
| ------------------- | -------- | ----------------- | ------------- | --------------------------------------------------- |
| **State Variable**  | **Type** | **Initial Value** | **Owner**     | **Trigger**                                         |
| currentUser         | object   | null              | null          | App                                                 |
| documents           | array    | []                | Dashboard     | Fetch documents, upload success                     |
| isUploading         | boolean  | false             | UploadContent | Upload start/end (Axios request lifecycle)          |
| uploadProgress      | number   | 0                 | UploadContent | Axios upload progress events (0 -> 100)             |
| selectedDocumentIds | array    | []                | ConfigureQuiz | Select/deselect docs for generation                 |
| quizDraft           | object   | null              | null          | ReviewAndPublish                                    |
| isGeneratingQuiz    | boolean  | false             | ConfigureQuiz | Generate click, API response/error                  |
| isTakingQuiz        | boolean  | false             | ModuleQuiz    | Set true on quiz start, false on submit/exit        |
| isQuizSubmitted     | boolean  | false             | ModuleQuiz    | Set true on successful submit, reset on new attempt |
| answers             | object   | {}                | ModuleQuiz    | User selects/changes answer options                 |


## AI Features

### 1) Quiz Generation (Manager)

- **What it does:** Creates quiz drafts from selected onboarding docs.
- **Where it lives:** Manager Quiz Builder -> `Generate Quiz`.
- **Input:** `teamId`, `documentIds[]`, `config` (`numQuestions`, `difficulty`, `questionTypes[]`) + selected docs `raw_text`.
- **Output:** Draft quiz with `questions[]` (prompt, options, correct answer, explanation, citation metadata per question).
- **Validation:** Good output is valid schema, requested count, grounded in docs, editable, and includes per-question citations; bad output is malformed/duplicated/hallucinated or missing citation fields.
- **Question payload contract (required fields):**
  - `prompt`, `type`, `options[]`, `explanation`
  - `citation.sourceDocumentId` (number)
  - `citation.sourceDocumentTitle` (string)
  - `citation.sourceSnippet` (string; short evidence excerpt from source doc)
- **Citation validation rule:** If any generated question is missing citation fields, quiz generation should fail validation and retry (or return a validation error if retries are exhausted).
- **Endpoint:** `POST /api/quizzes/generate`
- **Fallback:** Show error + retry, while keeping manual edit flow available.

### 2) Library AI Chatbot (Manager + Intern)

- **What it does:** Users ask onboarding questions in Library and receive source-based answers from team docs.
- **Where it lives:** Shared Library page -> `Ask AI` panel.
- **Input:** `teamId`, `userId`, `role`, `message`, optional `selectedDocumentIds[]`, recent chat history, retrieved `documents.raw_text` context.
- **Output:** `answer`, `sources[]`, `confidence`, optional `followUps[]`.
- **Validation:** Good output is clear, relevant, and cited; bad output is generic/hallucinated or missing sources.
- **Endpoint:** `POST /api/library/chat` (final route can be confirmed during implementation).
- **Fallback:** If failure/low confidence, show confidence message, suggest related docs, and allow retry/refine question flow.

#### AI Feature Decisions Log


| Decision                                                   | Sprint   | What changed              | Why                                                              |
| ---------------------------------------------------------- | -------- | ------------------------- | ---------------------------------------------------------------- |
| Limited quiz generation to manager actions                 | Sprint 1 | Access control            | Matches role boundaries and prevents unauthorized draft creation |
| Enforced strict JSON format for generated quiz data        | Sprint 1 | Prompt + parsing contract | Reduced malformed outputs and save errors                        |
| Added retry + manual fallback for quiz generation failures | Sprint 2 | Error handling            | Prevents blocked workflow during AI/API issues                   |
| Added per-question citation metadata (`sourceDocumentId`, `sourceDocumentTitle`, `sourceSnippet`) | Sprint 1 | Quiz payload contract     | Enables answer footnotes and improves traceability to source docs |
| Put chatbot in shared Library page for both roles          | Sprint 2 | Feature placement         | Both managers and interns need doc-based Q&A                     |
| Required source citations in chatbot responses             | Sprint 3 | Output quality rules      | Improves trust and reduces hallucinations                        |
| Routed chatbot through backend with team scoping           | Sprint 3 | Architecture/security     | Protects API keys and enforces data isolation                    |
| Added low-confidence fallback message + doc suggestions    | Sprint 4 | UX fallback               | Avoids showing weak answers and keeps user moving                |


## Spec Reconciliation — Sprint 2 Midpoint

### Sections audited
- **Data model:** ⚠️ drift — spec still describes a `quiz_attempts` table and `quizzes.approved` / `published_at` fields that don't exist in `prisma/schema.prisma`. The shipped model uses a `QuizAssignment` table instead, and `Quiz` carries `passingScore` / `timeLimitMinutes` / `dueDate`. Four tables built this sprint are undocumented: `DocumentChunk` (pgvector RAG), `ChatConversation`, `ChatMessage`, and `Invite`.
- **API contracts:** ⚠️ drift — documented `POST /api/auth/sync`, `GET /api/auth/me`, `POST /api/auth/logout`, the `POST /api/quiz-attempts/*` family, `GET /api/teams/:teamId/progress`, `POST /api/teams/import-gus`, and `POST /api/documents/import-confluence` were **not built**. Shipped routes differ: auth is handled entirely in `requireAuth` middleware; imports are `POST /api/documents/import/google-drive`, `.../google-drive-folder`, `.../github-repo`; learner flow is `POST /api/quizzes/:quizId/assignments` + `.../assignments/me/complete`; and there is an invites family (`POST /api/invites`, `GET /api/invites/:token`, `POST /api/invites/:token/accept`) plus `POST /api/library/chat` and conversation routes.
- **State architecture:** ⚠️ drift — the workflow is mostly `localStorage`-backed (`features/quiz/storage.ts`), not the in-memory owners in the table. Doc selection is tracked as an inverse `deselectedDocumentIds` set rather than `selectedDocumentIds`, and there is added module-progress / quiz-attempt local state not listed in the spec.
- **AI feature spec (quiz generation):** ✅ accurate — required question fields, the citation contract (`sourceDocumentId` / `sourceDocumentTitle` / `sourceSnippet`), citation validation with retry, and manager-only access all match `quizGenerator.ts` and `utils/prompts.ts`.
- **AI feature spec (Library chatbot):** ⚠️ drift — spec was underspecified (route "TBD", raw_text context, no retrieval strategy). Actual implementation is a RAG pipeline: documents are chunked and embedded (pgvector, `vector(384)`) and answered via `POST /api/library/chat` with persisted conversations.

### Gaps resolved
- Updated the AI Feature spec sections above to note the chatbot is RAG-backed and the quiz-generation route/contract remain accurate (no code change needed there).
- Flagged the `quiz_attempts` → `QuizAssignment` change and the new tables so `data_model.md` and `api_contracts.md` can be brought into line (tracked as Sprint 3 doc work; the divergences below capture current intent in the meantime).

### Intentional divergences (spec updated to reflect these)
- **`quiz_attempts` replaced by `QuizAssignment`.** We modeled the learner flow as a manager assigning a quiz to a hire who then completes it, rather than a full multi-attempt resource. Simpler and sufficient for MVP.
- **Confluence import dropped; Google Drive/Doc + GitHub repo import added.** We had working Google + GitHub OAuth, so we built against those sources instead.
- **No standalone `/api/auth/*` endpoints.** JWT verification and find-or-create happen in `requireAuth` middleware, so dedicated auth routes were unnecessary.
- **Invites + RAG chatbot + document chunking added.** New capabilities (email invites, pgvector RAG "Ask Sage") built this sprint that weren't in the original scope.
- **LLM provider auto-switches to OpenRouter in production** (gateway in dev). Recorded below.

### Decisions recorded in Decisions Log
See the new **Decisions Log** section below. Entries added this sprint: quiz-attempts → assignments, Confluence → Google/GitHub imports, auth-in-middleware, RAG chatbot via pgvector, email-invite onboarding flow, and OpenRouter-in-production. Cut features (quiz-attempts resource, Confluence import, GUS import, `/api/teams/:teamId/progress`, standalone auth endpoints) are marked out of scope for MVP.

## Decisions Log

| Decision | Sprint | What changed | Why |
| --- | --- | --- | --- |
| Replaced `quiz_attempts` table with `QuizAssignment` | Sprint 2 | Data model + learner API | A manager-assigns / hire-completes flow was enough for MVP; a full multi-attempt resource added complexity we didn't need yet |
| Cut Confluence import; added Google Drive/Doc + GitHub repo import | Sprint 2 | Document ingestion | We had working Google/GitHub OAuth and no Confluence access; built against the sources we could actually reach |
| Handle auth in `requireAuth` middleware instead of `/api/auth/*` endpoints | Sprint 2 | API surface | JWT verify + find-or-create user happens per request in middleware, so standalone auth routes were redundant |
| Built the Library chatbot as a RAG pipeline (chunking + pgvector) | Sprint 2 | AI architecture | Grounding answers in retrieved chunks beats stuffing full `raw_text`; enables citations and scales past the context window |
| Added email-invite onboarding flow (`Invite` table + public preview route) | Sprint 2 | Onboarding UX | Managers needed a way to bring new hires onto a team and assign a quiz in one step |
| Auto-switch LLM provider to OpenRouter in production | Sprint 2 | AI infra | Gateway access is dev-only; OpenRouter keeps generation working in the deployed environment |
| Cut GUS import and `GET /api/teams/:teamId/progress` for MVP | Sprint 2 | Scope | Team import and the aggregate progress dashboard are Sprint 3+ work; out of MVP scope |

## Project Management Checklist

- Set up GitHub Issues by user story
- Create Milestones by sprint
- Keep Project Board updated (Backlog, In Progress, Review, Done)
- Track API/data model updates when contracts evolve

