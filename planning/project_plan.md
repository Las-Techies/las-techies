# Project Plan

Pod Members: **Esme, Frida, Melanie, Reyna**

## Problem Statement and Description

Salesforce teams often onboard new hires with documentation that is scattered across different tools, formats, and owners. Because the content is not centralized or measured consistently, onboarding takes longer, managers answer the same questions repeatedly, and new hires ramp up at uneven speeds.

Our web app solves this by turning existing team onboarding docs into a structured, measurable onboarding flow. Managers can upload or import documentation (files, Confluence, GitHub), generate AI-assisted quiz drafts based on that real team content, review/edit before publishing, and monitor completion and scores in a team dashboard. New hires use one team-scoped portal to read onboarding material, take published quizzes, and validate readiness before joining sprint work.

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
- **Output:** Draft quiz with `questions[]` (prompt, options, correct answer, explanation).
- **Validation:** Good output is valid schema, requested count, grounded in docs, and editable; bad output is malformed/duplicated/hallucinated.
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
| Put chatbot in shared Library page for both roles          | Sprint 2 | Feature placement         | Both managers and interns need doc-based Q&A                     |
| Required source citations in chatbot responses             | Sprint 3 | Output quality rules      | Improves trust and reduces hallucinations                        |
| Routed chatbot through backend with team scoping           | Sprint 3 | Architecture/security     | Protects API keys and enforces data isolation                    |
| Added low-confidence fallback message + doc suggestions    | Sprint 4 | UX fallback               | Avoids showing weak answers and keeps user moving                |


## Project Management Checklist

- Set up GitHub Issues by user story
- Create Milestones by sprint
- Keep Project Board updated (Backlog, In Progress, Review, Done)
- Track API/data model updates when contracts evolve

