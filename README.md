# SITE Capstone Project

SITE Course Year: **2026**

Cohort: **Salesforce x Codepath**

Team Member Names:**Frida Arriaga, Esmeralda Benitez, Reyna Obregon, Melanie Perez**

Mentors Names: **Greg Merrill, Aryan Tyagi, Jennifer Jin, Mitch Mikusek, & Srinivas Ranganathan**

Project Code Repository Links

* [Frontend Repo Link](https://github.com/Las-Techies/las-techies/tree/main/frontend)
* [Backend Repo Link](https://github.com/Las-Techies/las-techies/tree/main/backend)

## Project Overview

### Theme

Productivity/Professional Services

### Description

The main purpose of our project is to streamline team-specific onboarding by transforming existing documentation into measurable learning through AI-generated quizzes.

Our platform provides a centralized onboarding portal where Salesforce teams can upload or link their current onboarding resources without rebuilding content from scratch. The AI backend parses these materials and generates quizzes tailored to each team’s workflows, infrastructure, codebase, and processes. New hires complete these quizzes to validate understanding before joining sprint work, while managers track completion and performance through a dashboard.


Deployment Website: **https://las-techies-1.onrender.com/**

### Tech stack

- **Frontend:** [React](https://react.dev/) + [Vite](https://vite.dev/), [React Router](https://reactrouter.com/), [Framer Motion](https://www.framer.com/motion/), [Lenis](https://github.com/darkroomengineering/lenis)
- **Backend:** [Node.js](https://nodejs.org/) + [Express](https://expressjs.com/), [Prisma](https://www.prisma.io/) (Postgres on [Supabase](https://supabase.com/)), [pgvector](https://github.com/pgvector/pgvector) for embeddings
- **Auth:** [Supabase Auth](https://supabase.com/docs/guides/auth)
- **AI:** Salesforce Express LLM Gateway for quiz generation and the Ask Sage document chat; [@huggingface/transformers](https://github.com/huggingface/transformers.js) for local embeddings
- **Document parsing:** [pdf-parse](https://www.npmjs.com/package/pdf-parse), [mammoth](https://github.com/mwilliamson/mammoth.js) (DOCX), [multer](https://github.com/expressjs/multer) uploads
- **Email:** [nodemailer](https://nodemailer.com/)

### Getting started

The app is split into two packages, each with its own setup instructions and
required environment variables:

- [backend/README.md](backend/README.md) — Express API, Prisma schema, env vars
- [frontend/README.md](frontend/README.md) — React + Vite client

Run each in its own terminal:

```bash
# Backend
cd backend && npm install && npm run dev

# Frontend
cd frontend && npm install && npm run dev
```

Project planning docs and API contracts live in [planning/](planning/).
