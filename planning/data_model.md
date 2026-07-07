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
| full_name | text | Display name |
| role | enum (manager, new_hire) | User role in the system |
| team_id | int | FK to teams.id - which team this user belongs to |
| auth_provider | text | Source of auth (Google, GitHub, SSO) |
| created_at | timestamp | Record creation time |
| updated_at | timestamp | Record last update |

**Constraints:**
- Unique: email

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
| source_type | enum (upload, url, google_doc) | Ingestion source |
| source_url | text (nullable) | Original link when applicable |
| storage_path | text (nullable) | Object storage key/path for uploads |
| mime_type | text | File/content type |
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
| created_by_user_id | int | FK to users.id (manager who created it) |
| published_at | timestamp (nullable) | Publication timestamp |
| source_document_ids | jsonb | Array of document IDs used to generate quiz |
| generation_config | jsonb (nullable) | AI config used (difficulty/count/types) |
| questions_payload | jsonb | Embedded questions array (prompt, type, options, correct answer, explanation, order) |
| attempts_payload | jsonb (nullable) | Embedded attempt records per user (attempt_number, timestamps, score, pass/fail, selected answers) |
| created_at | timestamp | Record creation time |
| updated_at | timestamp | Record last update |

---

## Relationship Summary

- **users** belong to one **team**
- **teams** have many **documents** and **quizzes**
- **quizzes** reference **documents** via JSON array (simplified)
- **quizzes.questions_payload** stores question and option data (replaces questions + question_options tables)
- **quizzes.attempts_payload** stores user attempts and per-question answers (replaces quiz_attempts + attempt_answers tables)

---

## Implementation Order

1. **Core identity:** users, teams
2. **Content:** documents
3. **Quiz authoring + learner flow:** quizzes (including embedded questions/options and attempts/answers)
