# Backend

Express API for the AI Onboarding Quiz App. Stack: **Node.js + Express**, **Prisma v6** (Postgres on Supabase), **Supabase Auth**, and the **Salesforce Express LLM Gateway** for AI. **Language: TypeScript** (official team decision — see `planning/project_plan.md`). Contracts live in `planning/`.

## Folder structure

```text
backend/
├── prisma/                 # schema.prisma + generated migrations (source of truth for tables)
└── src/
    ├── index.(ts|js)       # server entry: start Express
    ├── app.(ts|js)         # express app: middleware + route mounting
    ├── config/             # env loading/validation, Supabase + Prisma client setup
    ├── routes/             # one file per resource (maps 1:1 to planning/api_contracts.md)
    ├── controllers/        # request/response handling + input validation
    ├── services/           # business logic + external APIs (LLM gateway, GitHub, Confluence, docs)
    ├── models/             # thin data-access layer over Prisma (per table)
    ├── middleware/         # auth (verify Supabase token), role/team guards, rate limit, uploads, errors
    ├── db/                 # Prisma client singleton
    │   └── seeds/          # sample teams/users/docs for local dev
    └── utils/              # prompt builders, validators, helpers
```

## How folders map to `planning/api_contracts.md`

- `routes/` + `controllers/`: `documents`, `quizzes`, `questions`, `quiz-attempts`, `teams`, `auth`
- `services/`: `authService` (Supabase), `quizGenerator` (LLM gateway), `githubImporter`, `confluenceImporter`, `documentProcessor` (pdf-parse/mammoth), `scoring`
- `models/`: `user`, `team`, `document`, `quiz`, `quizAttempt` (questions live inside `quizzes.questions_payload`)
- `prisma/schema.prisma`: the 5 tables from `planning/data_model.md`

## Env vars (put real values in `.env`, never commit it)

`DATABASE_URL`, `DIRECT_URL` (Supabase Postgres), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ALLOWED_EMAIL_DOMAIN`, `LLM_GATEWAY_URL`, `ENG_AI_MODEL_GW_KEY`, `GITHUB_TOKEN`, `CONFLUENCE_PAT`.
