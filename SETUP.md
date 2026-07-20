# Local Setup Guide

This is for anyone (teammates, mentors, managers) who wants to run this project
on their own machine instead of just viewing it on GitHub.

## What you'll need

- **Node.js v20 LTS or later** and npm.
- A **Supabase account** (free tier is enough) — this project uses Supabase for
  its Postgres database and for authentication.
- **(Optional, AI features only)** Access to Salesforce's internal LLM
  Gateway. This is only needed for the "Generate quiz" AI step — everything
  else in the app (login, uploading documents, browsing existing quizzes)
  works without it. See [Salesforce LLM Gateway access](#salesforce-llm-gateway-access-ai-quiz-generation-only)
  below.

## 1. Clone and install dependencies

```bash
git clone https://github.com/Las-Techies/las-techies.git
cd las-techies

cd backend && npm install
cd ../frontend && npm install
```

## 2. Set up Supabase

You have two options:

- **Easiest for a quick local test:** ask a teammate to add you as a member
  on the existing Supabase project and reuse its credentials.
- **Fully isolated (your own data):** create your own free project at
  [supabase.com](https://supabase.com), then run migrations + the seed
  script against it (step 5 below).

Either way, you'll need four values from the Supabase dashboard:

1. **Project Settings → Database** → the connection strings for
   `DATABASE_URL` (pooled/transaction connection) and `DIRECT_URL` (direct
   connection, used for migrations).
2. **Project Settings → API** → the **Project URL**, the **anon /
   publishable key**, and the **service_role / secret key**. Keep the
   service_role key out of the frontend — it's backend-only.

## 3. Backend environment variables

```bash
cd backend
cp .env.example .env
```

Open `backend/.env` and fill in:

| Variable | Where it comes from |
| --- | --- |
| `DATABASE_URL` | Supabase → Project Settings → Database (pooled connection string) |
| `DIRECT_URL` | Supabase → Project Settings → Database (direct connection string) |
| `SUPABASE_URL` | Supabase → Project Settings → API (Project URL) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API (service_role/secret key) |
| `LLM_GATEWAY_URL` / `ENG_AI_MODEL_GW_KEY` | Salesforce internal DevBar — see note below. Leave blank if you don't have access. |

## 4. Frontend environment variables

```bash
cd frontend
cp .env.example .env
```

Open `frontend/.env` and fill in:

| Variable | Where it comes from |
| --- | --- |
| `VITE_SUPABASE_URL` | Same Supabase Project URL as the backend |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase → Project Settings → API (anon/publishable key — **not** service_role) |
| `VITE_API_BASE_URL` | Optional. Leave blank to default to `http://localhost:4000` |

## 5. Set up the database

From `backend/`:

```bash
npx prisma migrate deploy
npx prisma generate
npm run seed   # optional — seeds a demo team, manager user, and sample onboarding docs
```

## 6. Run the app

In one terminal:

```bash
cd backend
npm run dev
```

The API starts at `http://localhost:4000` (quick health check:
`http://localhost:4000/health`).

In a second terminal:

```bash
cd frontend
npm run dev
```

The app starts at `http://localhost:5173`.

## 7. Log in

- **Email/password** works immediately with no extra setup — just sign up
  from the login page.
- **Google sign-in** requires separate Google Cloud Console OAuth
  configuration and being added as a test user, since the app isn't
  verified with Google yet. Not required to use the app — skip it and use
  email/password if you don't need to test that specific flow. Ask a
  teammate if you do need it.

## Salesforce LLM Gateway access (AI quiz generation only)

Quiz generation calls Salesforce's internal Express LLM Gateway, which
requires a personal key issued through Salesforce's internal **DevBar**
tooling. If you're a Salesforce employee, you should be able to generate
your own key the same way any team member did — ask a teammate for the
current DevBar steps if you're not sure where to find it, since internal
tooling can move around.

If you don't have Salesforce internal access at all (e.g. an external
mentor), you can still run and demo everything else locally — login,
document upload, browsing previously-generated quizzes — just leave
`LLM_GATEWAY_URL` and `ENG_AI_MODEL_GW_KEY` blank in `backend/.env`. Clicking
"Generate quiz" will fail with a clear `LLM gateway is not configured`
error instead of crashing the app.

## Troubleshooting

- **`Missing required env var: DATABASE_URL`** — `backend/.env` doesn't
  exist yet, or a value is missing. Re-check step 3.
- **Frontend throws `Missing VITE_SUPABASE_URL or
  VITE_SUPABASE_PUBLISHABLE_KEY`** — `frontend/.env` doesn't exist yet, or a
  value is missing. Re-check step 4.
- **Google sign-in redirects to an error/"access denied" page** — your
  Google account's email isn't on the "Test users" list yet in Google Cloud
  Console (the app is unverified, so only listed test emails can sign in).
  Ask a teammate to add you, or just use email/password instead.
- **"Generate quiz" fails with `LLM gateway is not configured`** — expected
  if `LLM_GATEWAY_URL`/`ENG_AI_MODEL_GW_KEY` aren't set. Everything else in
  the app still works.
- **CORS errors in the browser console** — shouldn't happen; the backend
  allows all origins by default. If you see this, double check the backend
  is actually running and `VITE_API_BASE_URL` (if set) points at it.
