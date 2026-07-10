# MVP Data Model - Core Tables

## Overview
Simplified data model for AI Onboarding Quiz App with only essential tables needed for MVP.

**Assumption:** Each user belongs to ONE team (simplified from many-to-many relationship).

---

## 1. users

| Column Name | Data Type | Description |
|-------------|-----------|-------------|
| id | int | Primary key |
| email | text | Unique login identifier |
| first_name | text | User's first name |
| last_name | text | User's last name |
| role | enum (manager, new_hire) | User role in the system |
| team_id | int | FK to teams.id - which team this user belongs to |
| auth_provider | text | Source of auth via Supabase (`email`, `github`, or `google`) |
| supabase_user_id | uuid | Stable Supabase Auth user identifier (`auth.users.id`) |
| created_at | timestamp | Record creation time |
| updated_at | timestamp | Record last update |

**Constraints:**
- Unique: email
- Unique: supabase_user_id

---

## 2. teams

| Column Name | Data Type | Description |
|-------------|-----------|-------------|
| id | int | Primary key |
| name | text | Team name shown in UI |
| description | text | Onboarding/team context description |
| created_by_user_id | int | FK to users.id (team owner/creator) |
| created_at | timestamp | Record creation time |
| updated_at | timestamp | Record last update |

---

## 3. documents

| Column Name | Data Type | Description |
|-------------|-----------|-------------|
| id | int | Primary key |
| team_id | int | FK to teams.id (team-scoped access) |
| uploaded_by_user_id | int | FK to users.id |
| title | text | Human-readable doc title |
| source_type | enum (upload, confluence, github, google_doc) | Ingestion source |
| source_url | text (nullable) | Original link when applicable |
| storage_path | text (nullable) | Object storage key/path for uploads |
| mime_type | text (nullable) | File/content type (set for uploads; may be empty for imports) |
| status | enum (processing, ready, failed) | Ingestion state |
| raw_text | text (nullable) | Normalized extracted text |
| created_at | timestamp | Record creation time |
| updated_at | timestamp | Record last update |

---

## 4. quizzes

| Column Name | Data Type | Description |
|-------------|-----------|-------------|
| id | int | Primary key |
| team_id | int | FK to teams.id |
| title | text | Quiz title shown to users |
| description | text (nullable) | Quiz context/instructions |
| status | enum (draft, published, archived) | Lifecycle state |
| approved | boolean | Whether the quiz is approved for publishing; the creating manager is the approver (default false) |
| created_by_user_id | int | FK to users.id (manager who created it) |
| published_at | timestamp (nullable) | Publication timestamp |
| source_document_ids | jsonb | Array of document IDs used to generate quiz |
| generation_config | jsonb (nullable) | AI config used (difficulty/count/types) |
| questions_payload | jsonb | Embedded questions array (prompt, type, options, correct answer, explanation, order) |
| created_at | timestamp | Record creation time |
| updated_at | timestamp | Record last update |

---

## 5. quiz_attempts

| Column Name | Data Type | Description |
|-------------|-----------|-------------|
| id | int | Primary key |
| quiz_id | int | FK to quizzes.id |
| user_id | int | FK to users.id (the learner taking the quiz) |
| attempt_number | int | Per-user attempt sequence for a quiz |
| status | enum (in_progress, submitted) | Attempt state |
| score_percent | numeric (nullable) | Final score percentage, set on submit |
| passed | boolean (nullable) | Pass/fail against the quiz threshold, set on submit |
| started_at | timestamp | Attempt start time |
| submitted_at | timestamp (nullable) | Attempt submit time |
| answers_payload | jsonb | Embedded per-question answers: array of `{ question_id, selected_option_id, is_correct }` (always read together with the attempt) |
| created_at | timestamp | Record creation time |
| updated_at | timestamp | Record last update |

**Constraints:**
- Unique: (quiz_id, user_id, attempt_number)

**Why a table (not embedded in quizzes):** attempts are write-heavy, per-user, and high-volume — many learners take the same quiz at once. A separate row per attempt avoids write contention on a single quiz row and makes cross-quiz/user queries (e.g. the manager progress dashboard) simple. Each attempt's answers stay embedded as `answers_payload` since they are only ever read together with their attempt.

---

## Relationship Summary

- **users** belong to one **team**
- **teams** have many **documents** and **quizzes**
- **quizzes** reference **documents** via JSON array (simplified)
- **quizzes.questions_payload** stores question and option data (replaces questions + question_options tables)
- **quizzes** have many **quiz_attempts** (one per user attempt)
- **quiz_attempts.answers_payload** stores per-question answers for that attempt (replaces the attempt_answers table)

---

## Implementation Order

1. **Core identity:** users, teams
2. **Content:** documents
3. **Quiz authoring:** quizzes (including embedded questions/options)
4. **Learner flow:** quiz_attempts (including embedded answers)
