# Frontend

React (Vite) client for the AI Onboarding Quiz App. Signs in via **Supabase Auth** (email/password or magic link) and calls the backend API with the Supabase access token as `Authorization: Bearer <token>`.

## Folder structure

```text
frontend/
└── src/
    ├── main.(tsx|jsx)      # app entry
    ├── App.(tsx|jsx)       # top-level routes/layout
    ├── api/                # thin fetch clients per resource (attach auth token)
    ├── pages/              # one per screen in planning/project_plan.md "Pages/Screens"
    ├── components/         # reusable UI (buttons, cards, quiz question, etc.)
    ├── context/            # AuthContext (current user/role/team from Supabase + /api/auth/me)
    ├── hooks/              # reusable React hooks (data fetching, forms)
    └── styles/             # global styles / theme
```

## Pages map to `planning/project_plan.md`

`Login`, `ManagerDashboard`, `DocumentPortal` (upload + Confluence + GitHub), `Library` (docs + Ask AI), `QuizBuilder` (generate/edit/publish), `QuizList`, `QuizDetail`, `QuizTaking`, `Results`.

## Env vars (Vite exposes only `VITE_`-prefixed vars to the browser)

`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (the anon key is safe for the browser — never put the service role key here), `VITE_API_BASE_URL`.
