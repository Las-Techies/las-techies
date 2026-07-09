# API Contracts

## Overview
This document defines every endpoint the frontend will call and the backend will serve. Each entry includes request/response shapes, error cases, and which external APIs are used in the implementation.

---

## External APIs Used

| API | Purpose | Used In Endpoints |
|-----|---------|-------------------|
| **Salesforce LLM Gateway Express** (Claude) | Generate quiz questions from documents | `POST /api/quizzes/generate` |
| **Confluence REST API** | Fetch Confluence page content | `POST /api/documents/import-confluence` |
| **GitHub API** | Fetch repository documentation/code | `POST /api/documents/import-github` |
| **Okta (OIDC SSO)** | Authenticate `@salesforce.com` employees only | `GET /api/auth/login`, `GET /api/auth/callback` |
| **Local Libraries** (pdf-parse, mammoth) | Parse uploaded files | `POST /api/documents/upload` |

---

## API Endpoints

### Documents

| CRUD | HTTP Verb | Endpoint | Description | Request Shape | Response Shape | Error Cases | External API Used | User Stories |
|------|-----------|----------|-------------|---------------|----------------|-------------|-------------------|--------------|
| Create | POST | `/api/documents/upload` | Upload and process one or more document files (PDF, DOCX, MD). Partial success: each file is processed independently, so a batch can partly succeed. | `multipart/form-data`: `{ files: File[], teamId: number, titles?: string[] }` | Array with one result per file: `[{ index: number, filename: string, status: "ready" \| "failed", document?: { id: number, teamId: number, title: string, sourceType: "upload", rawText: string, createdAt: Date }, error?: { code: string, message: string } }]`. HTTP `201` if all succeed, `207 Multi-Status` if some succeed and some fail, `400` if all fail or the request is invalid. | Per-file (in results array): `invalid_file_type`, `file_too_large`, `extraction_failed`. Request-level: 400 if no files provided, 401 if unauthenticated, 403 if not manager | **pdf-parse** (PDF), **mammoth.js** (DOCX) | 1, 2 |
| Create | POST | `/api/documents/import-confluence` | Import documentation from Confluence page | `{ teamId: number, confluenceUrl: string }` | `{ id: number, teamId: number, title: string, sourceType: "confluence", sourceUrl: string, status: "ready", rawText: string, createdAt: Date }` | 400 if invalid URL, 404 if page not found, 401 if invalid Confluence token, 403 if not manager | **Confluence REST API** | 1, 2 |
| Create | POST | `/api/documents/import-github` | Import documentation from GitHub repository | `{ teamId: number, githubUrl: string, paths?: string[] }` | `{ id: number, teamId: number, title: string, sourceType: "github", sourceUrl: string, status: "ready", rawText: string, createdAt: Date }` | 400 if invalid URL, 404 if repo/file not found, 401 if invalid GitHub token, 403 if not manager | **GitHub API** | 1, 2 |
| Read | GET | `/api/teams/:teamId/documents` | Fetch a team's documents for the learner library; supports newest-first sorting and filtering by source type | Query params (all optional): `sort` = `"newest"` (default) \| `"oldest"`, `type` = `"upload"` \| `"confluence"` \| `"github"` \| `"google_doc"` (omit for all), `limit?: number`, `offset?: number` | `[{ id: number, title: string, sourceType: string, sourceUrl?: string, uploadedBy: { id: number, fullName: string }, createdAt: Date }]` | 400 if invalid `sort`/`type` value, 404 if team not found, 401 if unauthenticated, 403 if not team member | None | 1, 2 |
| Read | GET | `/api/documents/:documentId` | Fetch single document details | — | `{ id: number, teamId: number, title: string, sourceType: string, rawText: string, createdAt: Date }` | 404 if document not found, 401 if unauthenticated, 403 if not team member | None | 1 |
| Delete | DELETE | `/api/documents/:documentId` | Delete a document | — | `{ success: true, message: "Document deleted" }` | 404 if not found, 401 if unauthenticated, 403 if not manager | None | 1 |

---

### Quizzes

| CRUD | HTTP Verb | Endpoint | Description | Request Shape | Response Shape | Error Cases | External API Used | User Stories |
|------|-----------|----------|-------------|---------------|----------------|-------------|-------------------|--------------|
| Create | POST | `/api/quizzes/generate` | Generate quiz from documents using AI | `{ teamId: number, documentIds: number[], config: { numQuestions: number, difficulty: "easy"\|"medium"\|"hard", questionTypes: string[] } }` | `{ id: number, teamId: number, title: string, status: "draft", questions: [{ id: number, prompt: string, type: string, options: [{ id: number, text: string, isCorrect: boolean }], explanation: string }], createdAt: Date }` | 400 if invalid config, 404 if documents not found, 429 if rate limited, 500 if AI generation fails, 401 if unauthenticated, 403 if not manager | **Salesforce LLM Gateway Express** (Claude Sonnet 4.5) | 2, 3 |
| Read | GET | `/api/teams/:teamId/quizzes` | Fetch all quizzes for a team | — | `[{ id: number, title: string, status: "draft"\|"published"\|"archived", approved: boolean, createdBy: { id: number, fullName: string }, publishedAt?: Date, createdAt: Date }]` | 404 if team not found, 401 if unauthenticated | None | 2, 4 |
| Read | GET | `/api/quizzes/:quizId` | Fetch single quiz with questions | — | `{ id: number, teamId: number, title: string, description?: string, status: string, approved: boolean, questions: [{ id: number, prompt: string, type: string, options: [{ id: number, text: string }] }], createdAt: Date }` | 404 if quiz not found, 401 if unauthenticated, 403 if not team member or quiz not published | None | 4, 5 |
| Update | PATCH | `/api/quizzes/:quizId` | Update quiz title/description | `{ title?: string, description?: string }` | `{ id: number, title: string, description?: string, updatedAt: Date }` | 404 if not found, 400 if invalid data, 401 if unauthenticated, 403 if not manager | None | 3 |
| Update | PATCH | `/api/quizzes/:quizId/publish` | Publish a draft quiz (the creating manager approves it as part of publishing) | `{ publishedAt?: Date }` | `{ id: number, status: "published", approved: true, publishedAt: Date }` | 404 if not found, 400 if already published, 401 if unauthenticated, 403 if not manager | None | 3 |
| Update | PATCH | `/api/quizzes/:quizId/archive` | Archive a quiz | — | `{ id: number, status: "archived" }` | 404 if not found, 401 if unauthenticated, 403 if not manager | None | 3 |
| Delete | DELETE | `/api/quizzes/:quizId` | Delete a quiz | — | `{ success: true, message: "Quiz deleted" }` | 404 if not found, 401 if unauthenticated, 403 if not manager | None | 3 |

---

### Questions (managed within a quiz's `questions_payload`)

Questions are **not** a standalone table — they live inside `quizzes.questions_payload` (see `data_model.md`). These routes are therefore scoped under a quiz, and the backend edits the JSON payload in place: an update **replaces** the matching question object (i.e. delete it from `questions_payload` and re-add the new version), and a delete removes it from the array. `:questionId` is the synthetic id stored on each question object within the payload.

| CRUD | HTTP Verb | Endpoint | Description | Request Shape | Response Shape | Error Cases | External API Used | User Stories |
|------|-----------|----------|-------------|---------------|----------------|-------------|-------------------|--------------|
| Create | POST | `/api/quizzes/:quizId/questions` | Add a question to the quiz's `questions_payload` | `{ prompt: string, type: string, options: [{ text: string, isCorrect: boolean }], explanation?: string }` | `{ id: number, prompt: string, type: string, options: [{ id: number, text: string, isCorrect: boolean }], explanation?: string }` | 404 if quiz not found, 400 if invalid data, 403 if quiz already published or not manager, 401 if unauthenticated | None | 3 |
| Update | PATCH | `/api/quizzes/:quizId/questions/:questionId` | Edit a question before publishing; replaces the matching question object inside `questions_payload` (delete + re-add) | `{ prompt?: string, explanation?: string, options?: [{ id?: string, text: string, isCorrect: boolean }] }` | `{ id: number, prompt: string, type: string, options: [{ id: number, text: string, isCorrect: boolean }], explanation: string, updatedAt: Date }` | 404 if quiz/question not found, 400 if invalid data, 403 if quiz already published or not manager, 401 if unauthenticated | None | 3 |
| Delete | DELETE | `/api/quizzes/:quizId/questions/:questionId` | Remove a question from the quiz's `questions_payload` | — | `{ success: true, message: "Question deleted" }` | 404 if quiz/question not found, 403 if quiz already published or not manager, 401 if unauthenticated | None | 3 |

---

### Quiz Attempts

Attempts are stored in their own `quiz_attempts` table (see `data_model.md`), so each attempt is an independently addressable resource with its own `id`. Each attempt's per-question answers are embedded on the attempt row as `answers_payload` (they are only ever read together with the attempt).

| CRUD | HTTP Verb | Endpoint | Description | Request Shape | Response Shape | Error Cases | External API Used | User Stories |
|------|-----------|----------|-------------|---------------|----------------|-------------|-------------------|--------------|
| Create | POST | `/api/quiz-attempts` | Start a new quiz attempt | `{ quizId: number, userId: number }` | `{ id: number, quizId: number, userId: number, attemptNumber: number, status: "in_progress", startedAt: Date }` | 404 if quiz not found, 400 if quiz not published, 401 if unauthenticated | None | 4 |
| Create | POST | `/api/quiz-attempts/:attemptId/answers` | Submit answer for a question | `{ questionId: number, selectedOptionId: number }` | `{ id: number, attemptId: number, questionId: number, isCorrect?: boolean, answeredAt: Date }` | 404 if attempt/question not found, 400 if already answered, 401 if unauthenticated, 403 if not attempt owner | None | 5 |
| Update | POST | `/api/quiz-attempts/:attemptId/submit` | Submit completed quiz attempt | — | `{ id: number, status: "submitted", submittedAt: Date, scorePercent: number, passed: boolean }` | 404 if not found, 400 if already submitted or incomplete, 401 if unauthenticated, 403 if not attempt owner | None | 5 |
| Read | GET | `/api/users/:userId/quiz-attempts` | Get all quiz attempts for a user | — | `[{ id: number, quiz: { id: number, title: string }, attemptNumber: number, status: string, scorePercent?: number, passed?: boolean, startedAt: Date, submittedAt?: Date }]` | 404 if user not found, 401 if unauthenticated, 403 if not same user or manager | None | 4, 6 |
| Read | GET | `/api/quiz-attempts/:attemptId` | Get single quiz attempt details | — | `{ id: number, quiz: { id: number, title: string }, attemptNumber: number, status: string, scorePercent?: number, answers: [{ questionId: number, selectedOptionId?: number, isCorrect?: boolean }], startedAt: Date, submittedAt?: Date }` | 404 if not found, 401 if unauthenticated, 403 if not attempt owner or manager | None | 5, 6 |

---

### Teams

| CRUD | HTTP Verb | Endpoint | Description | Request Shape | Response Shape | Error Cases | External API Used | User Stories |
|------|-----------|----------|-------------|---------------|----------------|-------------|-------------------|--------------|
| Create | POST | `/api/teams` | Create a new team | `{ name: string, description: string }` | `{ id: number, name: string, description: string, createdBy: number, createdAt: Date }` | 400 if invalid data, 401 if unauthenticated, 403 if not manager | None | 1 |
| Read | GET | `/api/teams/:teamId` | Get team details | — | `{ id: number, name: string, description: string, members: [{ id: number, fullName: string, role: string }], createdAt: Date }` | 404 if not found, 401 if unauthenticated, 403 if not team member | None | 1, 6 |
| Read | GET | `/api/teams/:teamId/progress` | Get team onboarding progress dashboard | — | `{ teamId: number, totalMembers: number, quizzes: [{ id: number, title: string, completionRate: number, avgScore: number }], members: [{ id: number, fullName: string, completedQuizzes: number, avgScore: number }] }` | 404 if team not found, 401 if unauthenticated, 403 if not manager | None | 6 |

---

### Users / Authentication (Okta OIDC SSO)

Authentication uses **Okta as the Identity Provider**. Only users with a valid `@salesforce.com` Okta account can log in; MFA and user provisioning/deprovisioning are enforced by Okta company-wide. The app uses the OIDC Authorization Code flow with PKCE and **never stores passwords**.

| CRUD | HTTP Verb | Endpoint | Description | Request Shape | Response Shape | Error Cases | External API Used | User Stories |
|------|-----------|----------|-------------|---------------|----------------|-------------|-------------------|--------------|
| Create | GET | `/api/auth/login` | Start SSO login; redirect user to Okta | — | `302` redirect to Okta authorize URL | 500 if IdP config invalid | **Okta (OIDC)** | 1 |
| Create | GET | `/api/auth/callback` | Okta redirect target; exchange code for tokens and create session | query: `{ code: string, state: string }` | `302` redirect to app with session cookie set | 401 if token/`state` invalid, 403 if email not `@salesforce.com` | **Okta (OIDC)** | 1 |
| Read | GET | `/api/auth/me` | Get current authenticated user | — | `{ id: number, email: string, fullName: string, role: string, teamId: number }` | 401 if unauthenticated | None | All |
| Delete | POST | `/api/auth/logout` | End the app session (and optionally Okta session) | — | `{ success: true }` (or `302` to logged-out page) | 401 if unauthenticated | **Okta (OIDC)** | All |

---

## External API Implementation Details

### 1. Salesforce LLM Gateway Express (Claude)

**Used in:** `POST /api/quizzes/generate`

**Backend Implementation:**
```javascript
// In backend/services/quizGenerator.js
async function generateQuizWithClaude(documentText, config) {
  const response = await fetch(process.env.LLM_GATEWAY_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.ENG_AI_MODEL_GW_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5-20250929',
      messages: [
        {
          role: 'system',
          content: 'You are a quiz generator for Salesforce onboarding documentation.'
        },
        {
          role: 'user',
          content: buildPrompt(documentText, config)
        }
      ]
    })
  });

  const data = await response.json();
  return JSON.parse(data.choices[0].message.content);
}
```

---

### 2. Confluence REST API

**Used in:** `POST /api/documents/import-confluence`

**Backend Implementation:**
```javascript
// In backend/services/confluenceImporter.js
async function fetchConfluencePage(pageId) {
  const response = await fetch(
    `https://confluence.internal.salesforce.com/rest/api/content/${pageId}?expand=body.storage`,
    {
      headers: {
        'Authorization': `Bearer ${process.env.CONFLUENCE_PAT}`,
        'Accept': 'application/json'
      }
    }
  );

  const data = await response.json();
  return {
    title: data.title,
    html: data.body.storage.value
  };
}
```

---

### 3. GitHub API

**Used in:** `POST /api/documents/import-github`

**Backend Implementation:**
```javascript
// In backend/services/githubImporter.js
async function fetchGitHubFile(owner, repo, path) {
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
    {
      headers: {
        'Authorization': `token ${process.env.GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3.raw'
      }
    }
  );

  return await response.text();
}
```

---

### 4. Okta OIDC SSO

**Used in:** `GET /api/auth/login`, `GET /api/auth/callback`

**Backend Implementation:**
```javascript
// In backend/services/auth.js
// Step 1: /api/auth/login builds the Okta authorize URL (Authorization Code + PKCE)
function buildAuthorizeUrl({ state, codeChallenge }) {
  const params = new URLSearchParams({
    client_id: process.env.OKTA_CLIENT_ID,
    redirect_uri: process.env.OKTA_REDIRECT_URI,
    response_type: 'code',
    scope: 'openid profile email',
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256'
  });
  return `${process.env.OKTA_ISSUER}/v1/authorize?${params}`;
}

// Step 2: /api/auth/callback exchanges the code for tokens, then verifies
async function exchangeCodeForTokens({ code, codeVerifier }) {
  const response = await fetch(`${process.env.OKTA_ISSUER}/v1/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: process.env.OKTA_CLIENT_ID,
      redirect_uri: process.env.OKTA_REDIRECT_URI,
      code,
      code_verifier: codeVerifier
    })
  });

  const { id_token } = await response.json();
  const claims = await verifyIdToken(id_token); // validate signature, iss, aud, exp

  // Defense-in-depth: enforce Salesforce email domain
  if (!claims.email.endsWith('@salesforce.com')) {
    throw new Error('Forbidden: non-Salesforce account');
  }
  return claims; // { sub, email, name, ... }
}
```

---

### 5. Local File Processing

**Used in:** `POST /api/documents/upload`

**Backend Implementation:**
```javascript
// In backend/services/documentProcessor.js
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');

async function processDocument(file) {
  const ext = path.extname(file.originalname).toLowerCase();

  switch(ext) {
    case '.pdf':
      return await pdfParse(file.buffer).then(data => data.text);
    case '.docx':
      return await mammoth.extractRawText({ buffer: file.buffer })
        .then(result => result.value);
    case '.md':
    case '.txt':
      return file.buffer.toString('utf-8');
    default:
      throw new Error('Unsupported file type');
  }
}
```

---

## Notes

- All endpoints require authentication unless specified (only `/api/auth/login` and `/api/auth/callback` are public).
- Authentication is handled via Okta SSO; the app never stores passwords. A middleware layer validates the session cookie on every protected endpoint and attaches the user + role + team_id to the request.
- Manager-only endpoints: document upload/import, quiz generation, quiz publish, team progress dashboard
- New hire endpoints: quiz taking, viewing published quizzes, viewing own attempts
- Team-scoped data: Always filter by `teamId` to ensure data isolation
- Rate limiting: Implement rate limiting on quiz generation endpoint (max 10/hour per team)
- File size limits: 10MB per file for uploads
- Multi-file upload with partial success: `POST /api/documents/upload` accepts a batch of files and processes each one independently. Each file becomes its own row in the `documents` table. The response always returns a per-file results array (`status: "ready" | "failed"` with an `error` on failure), so a batch can partly succeed — valid files are saved even if others fail. Status codes: `201` all succeeded, `207 Multi-Status` mixed, `400` all failed/invalid. Files may first return `status: "processing"` and update to `ready`/`failed` as extraction completes (matches the "Uploaded Files" list in the upload wireframe).
- Pagination: Implement for list endpoints (documents, quizzes, attempts) with default limit of 20
- Learner document library: The learner module surfaces the manager's uploaded materials directly (no AI-generated learning content). `GET /api/teams/:teamId/documents` returns a flat, newest-first list (`sort=newest` by default) and filter chips map to the `type` query param. The frontend groups the returned list by `sourceType` to render the "Recently added" strip and the Files / Confluence / Repos sections.
- Google Docs (`google_doc` source type): There is no direct Google Drive API import in the MVP. Managers add Google Docs content via **export-then-upload** — download the doc as PDF or DOCX from Google (File → Download) and add it through `POST /api/documents/upload`. The `google_doc` value in the `source_type` enum and the `type` filter is reserved for a future one-click Google Drive import (Nice to Have, Phase 2), which would require Google OAuth 2.0.

---

## User Stories Reference

1. **Team Setup** - Manager creates team and uploads/imports documentation
2. **Document Management** - Manager adds various doc sources (files, Confluence, GitHub)
3. **Quiz Creation** - Manager generates quiz, reviews, edits, and publishes
4. **Quiz Discovery** - New hire browses available quizzes
5. **Quiz Taking** - New hire completes quiz and receives feedback
6. **Progress Tracking** - Manager views team progress and completion rates
