# MVP Data Model - Core Tables

## Overview
Simplified data model for AI Onboarding Quiz App with only essential tables needed for MVP.

**Assumption:** Each user belongs to ONE team (simplified from many-to-many relationship).

---

## 1. users

| Column Name | Data Type | Description |
|-------------|-----------|-------------|
| id | uuid | Primary key |
| email | text | Unique login identifier |
| full_name | text | Display name |
| role | enum (manager, new_hire) | User role in the system |
| team_id | uuid | FK to teams.id - which team this user belongs to |
| auth_provider | text | Source of auth (Google, GitHub, SSO) |
| created_at | timestamp | Record creation time |
| updated_at | timestamp | Record last update |

**Constraints:**
- Unique: email

---

## 2. teams

| Column Name | Data Type | Description |
|-------------|-----------|-------------|
| id | uuid | Primary key |
| name | text | Team name shown in UI |
| description | text | Onboarding/team context description |
| created_by_user_id | uuid | FK to users.id (team owner/creator) |
| created_at | timestamp | Record creation time |
| updated_at | timestamp | Record last update |

---

## 3. documents

| Column Name | Data Type | Description |
|-------------|-----------|-------------|
| id | uuid | Primary key |
| team_id | uuid | FK to teams.id (team-scoped access) |
| uploaded_by_user_id | uuid | FK to users.id |
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
| id | uuid | Primary key |
| team_id | uuid | FK to teams.id |
| title | text | Quiz title shown to users |
| description | text (nullable) | Quiz context/instructions |
| status | enum (draft, published, archived) | Lifecycle state |
| created_by_user_id | uuid | FK to users.id (manager who created it) |
| published_at | timestamp (nullable) | Publication timestamp |
| source_document_ids | jsonb | Array of document IDs used to generate quiz |
| generation_config | jsonb (nullable) | AI config used (difficulty/count/types) |
| created_at | timestamp | Record creation time |
| updated_at | timestamp | Record last update |

---

## 5. questions

| Column Name | Data Type | Description |
|-------------|-----------|-------------|
| id | uuid | Primary key |
| quiz_id | uuid | FK to quizzes.id |
| question_order | int | Display order |
| type | enum (multiple_choice, true_false) | Question format |
| prompt | text | Question text |
| explanation | text (nullable) | Rationale for correct answer |
| difficulty | enum (easy, medium, hard) (nullable) | Optional tuning metadata |
| created_at | timestamp | Record creation time |
| updated_at | timestamp | Record last update |

**Constraints:**
- Unique: (quiz_id, question_order)

---

## 6. question_options

| Column Name | Data Type | Description |
|-------------|-----------|-------------|
| id | uuid | Primary key |
| question_id | uuid | FK to questions.id |
| option_order | int | Display order |
| option_text | text | Answer option text |
| is_correct | boolean | Correctness flag |

**Constraints:**
- Unique: (question_id, option_order)

---

## 7. quiz_attempts

| Column Name | Data Type | Description |
|-------------|-----------|-------------|
| id | uuid | Primary key |
| quiz_id | uuid | FK to quizzes.id |
| user_id | uuid | FK to users.id |
| attempt_number | int | Per-user attempt sequence for a quiz |
| started_at | timestamp | Start time |
| submitted_at | timestamp (nullable) | Submit time |
| score_percent | numeric(5,2) (nullable) | Final score percentage |
| passed | boolean (nullable) | Pass/fail against threshold |
| status | enum (in_progress, submitted) | Attempt state |

**Constraints:**
- Unique: (quiz_id, user_id, attempt_number)

---

## 8. attempt_answers

| Column Name | Data Type | Description |
|-------------|-----------|-------------|
| id | uuid | Primary key |
| attempt_id | uuid | FK to quiz_attempts.id |
| question_id | uuid | FK to questions.id |
| selected_option_id | uuid (nullable) | FK to question_options.id for selected answer |
| is_correct | boolean (nullable) | Grading result |
| answered_at | timestamp | Answer timestamp |

**Constraints:**
- Unique: (attempt_id, question_id)

---

## Relationship Summary

- **users** belong to one **team**
- **teams** have many **documents** and **quizzes**
- **quizzes** reference **documents** via JSON array (simplified)
- **quizzes** have many **questions**
- **questions** have many **question_options**
- **users** take **quiz_attempts** on **quizzes**
- **quiz_attempts** have many **attempt_answers**

---

## Implementation Order

1. **Core identity:** users, teams
2. **Content:** documents
3. **Quiz authoring:** quizzes, questions, question_options
4. **Learner flow:** quiz_attempts, attempt_answers
