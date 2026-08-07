# Handoff — SageForce (AI Onboarding Quiz App)

This doc is for whoever at Salesforce picks up this project next. It's a snapshot of what exists, how to get running, what's solid, what's rough, and where to go next. Written at the end of the CodePath x Salesforce SITE capstone (Aug 2026) by the original pod: **Frida Arriaga, Esmeralda Benitez, Reyna Obregon, Melanie Perez**.

If you only read one section, read [§6 Next Steps](#6-recommended-next-steps).

---

## 1. What this is

**Problem:** Salesforce teams onboard new hires with scattered docs (wikis, PDFs, GitHub READMEs, Google Docs). Onboarding is inconsistent and managers answer the same questions repeatedly.

**Solution ("SageForce"):** A manager imports their team's real onboarding material (upload, Google Drive, or GitHub repo), then:
1. **AI-generates a quiz** from it, with every question citing its exact source doc/snippet.
2. Gives everyone a **RAG-backed chatbot ("Ask Sage")** to ask onboarding questions and get cited answers grounded in the team's own docs.

Managers assign quizzes to new hires and track completion/scores on a dashboard.

- **Live deployment:** https://las-techies-1.onrender.com/
- **Repo:** https://github.com/Las-Techies/las-techies

## 2. Where to look first

This repo already has a lot of documentation — don't re-derive things that are already written down:

| Doc | What it's for |
| --- | --- |
| [`SETUP.md`](./SETUP.md) | Step-by-step local dev setup (env vars, Supabase, running both servers) |
| [`planning/project_plan.md`](./planning/project_plan.md) | Original spec + a "Decisions Log" tracking every place the shipped app diverged from the original plan, and why |
| [`planning/data_model.md`](./planning/data_model.md), [`planning/api_contracts.md`](./planning/api_contracts.md) | **Partially stale** — see the Decisions Log in `project_plan.md` for what actually shipped instead. `backend/prisma/schema.prisma` is the real source of truth for the data model. |
| [`backend/README.md`](./backend/README.md), [`frontend/README.md`](./frontend/README.md) | Folder structure per app |
| [`reflections/`](./reflections/) | Pod's sprint retrospectives (context on what was hard, what changed) |

## 3. Tech stack

| Layer | Choice |
| --- | --- |
| Language | TypeScript everywhere (frontend + backend) |
| Frontend | React + Vite (SPA) |
| Backend | Node.js + Express |
| ORM | Prisma v6 |
| Database | Postgres on Supabase, with the **pgvector** extension for embeddings |
| Auth | Supabase Auth (email/password + Google OAuth) |
| AI (quiz gen + chat) | Claude via **Salesforce internal LLM Gateway** (dev) / **OpenRouter** (prod — gateway is dev/internal-only) |
| Embeddings | `all-MiniLM-L6-v2` running locally via Transformers.js/ONNX (no per-call API cost) |
| Email | Nodemailer over Gmail app password (invite emails) |
| Hosting | Render (Docker, both frontend + backend); `docker-compose.yml` at repo root for local container parity |

## 4. Architecture, one paragraph

Every `/api` request runs through `requireAuth` middleware, which verifies the Supabase JWT server-side and attaches `{id, teamId, role}` to `req.user` — there are no standalone `/api/auth/*` endpoints. Every controller scopes queries by `req.user.teamId`, never a client-supplied id. Documents (upload/Google Drive/GitHub) are chunked and embedded into `DocumentChunk` (pgvector) for the "Ask Sage" RAG chatbot. Quiz generation streams via SSE, batches questions ≤10 at a time, and rejects/retries any question missing a citation.

## 5. Current state — what works today

- Manager signup/login, team creation, inviting new hires by email
- Document ingestion: direct upload (PDF/DOCX/txt), Google Drive (file or folder), GitHub repo (`.md` files, own OAuth App)
- AI quiz generation from selected docs, with live SSE progress, manager review/edit/regenerate-single-question, publish
- Manager assigns published quizzes to specific new hires; email notification
- New hire: home page timeline of assigned quizzes, quiz-taking UI with timer + leave-guard, results/score
- "Ask Sage" RAG chatbot in the shared document Library, with persisted conversation history and confidence-gated fallback
- Manager dashboard: per-quiz and per-learner stats in one call
- Deployed and working at the Render URL above

## 6. Recommended next steps

Roughly ordered by "cheapest fix, biggest risk reduction" first.

1. **Server-side quiz grading (highest priority).** Today grading happens entirely client-side: the quiz payload sent to the browser includes `isCorrect` on every option, `QuizTakingPage.tsx` computes the score itself, and the backend's completion endpoint trusts `req.body.score` verbatim with no recomputation. A technically savvy new hire can read answers out of the network tab or POST `score: 100` directly. Fix: submit only selected option IDs; have the server compute the score against the stored answer key.
2. **No automated tests.** `backend/package.json`'s `test` script is a placeholder. Nothing has unit/integration coverage. Start with the highest-risk logic: quiz-generation validation/retry, RAG retrieval/confidence gating, and auth/team-scoping middleware.
3. **No rate limiting.** AI endpoints (quiz generation, chat) have no throttling — a real cost-control and abuse gap on pay-per-call LLM providers. The original plan called for ~10/hour/team on quiz generation; never wired up.
4. **Reshuffle quiz options per attempt.** Fisher-Yates shuffle runs once at generation time and is baked into the stored `questionsPayload`, so every retake shows the same option order — a repeat-taker can memorize positions instead of re-reading. Reshuffle at read time instead of generation time.
5. **Structured outputs / tool-calling for quiz generation.** Batching (≤10 questions/call) is a workaround for fragile JSON parsing. If the LLM provider supports schema-constrained output, malformed JSON becomes structurally impossible instead of just less likely — removes the whole batch-retry mechanism's reason to exist.
6. **Orphaned files in storage.** Deleting a `Document` row deletes DB data (chunks cascade) but never deletes the underlying file from Supabase Storage — a slow resource leak.
7. **Duplicate document detection.** Re-uploading the same file or re-importing the same GitHub repo/Drive folder creates a brand-new `Document` (and fresh embeddings) every time — no check on title/URL/content hash.
8. **Re-add `GET /api/teams/:teamId/progress`** (aggregate team progress endpoint) — was in the original plan, cut for time.
9. **Salesforce SSO.** Login is currently email/password + Google only. A Salesforce Connected App would follow the same OAuth pattern already built for GitHub (register app → get client id/secret → handshake → encrypted token storage).
10. **Multi-team membership.** A user currently belongs to exactly one team (MVP simplification); a real model needs a join table. Note a manager can already own/switch between *multiple* teams — it's specifically the *new-hire* side that's single-team.
11. **pgvector indexing (IVFFlat/HNSW)** once chunk counts get large — today's exact-scan search is fine only at current (small) scale.
12. **GUS integration**, if/when internal Salesforce access to it becomes available — was scoped out for lack of access, not lack of interest (see `planning/project_plan.md` open questions).

## 7. Handoff logistics — accounts & access you'll need

Whoever continues this needs access transferred/re-created for:

- **GitHub org/repo** — `Las-Techies/las-techies` (or wherever it's forked to).
- **Supabase project** — owns the Postgres DB + Auth. Either get added as a member of the existing project, or spin up a new one and run `npx prisma migrate deploy` against it (see `SETUP.md` §2, §5). Migrations live in `backend/prisma/migrations/`, and `schema.prisma` is the real source of truth for the data model — don't trust `planning/data_model.md`, which has drifted (see the Decisions Log in `planning/project_plan.md`).
- **Render** — hosts the live deployment (frontend + backend, both Dockerized). Get added as a collaborator on the Render services, or redeploy fresh using `backend/Dockerfile`, `frontend/Dockerfile`, and `docker-compose.yml` as a reference.
- **Salesforce internal LLM Gateway** (dev-only) — requires a personal key via internal DevBar tooling; only usable by Salesforce employees. Production already auto-switches to **OpenRouter** instead (see `env.useOpenRouter` in `backend/src/config/env.ts`), so a fresh OpenRouter API key is the more portable option if gateway access isn't available.
- **GitHub OAuth App** (for the "Pick from GitHub" import feature — separate from login) — register a new one at github.com/settings/developers if not inheriting the existing app's client id/secret. See `backend/.env.example` for exact setup steps and the callback URL format.
- **Google Cloud Console project** — for Google sign-in + Google Drive/Picker import. Needs OAuth client id + Drive/Picker APIs enabled; see `frontend/.env.example`.
- **Gmail app password** — for sending invite emails via Nodemailer. Any Gmail account with 2FA + an app password works; see `backend/.env.example`.
- All required env vars and where each value comes from are fully documented in `backend/.env.example`, `frontend/.env.example`, and `SETUP.md` — start there rather than guessing.

## 8. Honest gaps not worth re-discovering the hard way

- Grading trust, no tests, no rate limiting — covered above, these are the real ones.
- Mobile responsiveness/accessibility was never audited.
- One manager team can't see another manager's uploaded documents even on the same team roster in certain multi-manager edge cases — `deleteDocumentForUser` filters by uploader, not just team, so cross-manager document deletion returns a 404 rather than succeeding or clearly explaining why.
- A new hire can technically load a draft (unpublished) quiz by ID if they know/guess it — `getQuiz` doesn't filter by `status` or role. Not reachable through normal UI flow, but not server-enforced either.

## 9. Original pod contacts

Frida Arriaga, Esmeralda Benitez, Reyna Obregon, Melanie Perez — mentors were Greg Merrill, Aryan Tyagi, Jennifer Jin, Mitch Mikusek, and Srinivas Ranganathan (CodePath x Salesforce SITE program, 2026 cohort). Reach out to Frida through her school email: frida.arriaga@berkeley.edu
