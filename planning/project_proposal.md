# Project Proposal

Pod Members: Frida Arriaga, Esmeralda Benitez, Reyna Obregon, Melanie Perez

## Problem Statement

Salesforce teams often onboard new hires with scattered documentation that varies in quality, format, and accessibility. This creates slow ramp-up time, repeated clarification questions, and inconsistent onboarding outcomes across teams. Our target audience is Salesforce team leads/managers who maintain onboarding materials and new hires who need a faster, clearer path to becoming productive contributors.

## Theme

Productivity/Professional Services

## Description

The main purpose of our project is to streamline team-specific onboarding by transforming existing documentation into measurable learning through AI-generated quizzes.

Our platform provides a centralized onboarding portal where Salesforce teams can upload or link their current onboarding resources without rebuilding content from scratch. The AI backend parses these materials and generates quizzes tailored to each team’s workflows, infrastructure, codebase, and processes. New hires complete these quizzes to validate understanding before joining sprint work, while managers track completion and performance through a dashboard.

Key features include:
- Doc Submission Portal for uploading/linking onboarding docs in multiple formats
- AI-Powered Quiz Generation from submitted team documentation
- Team-Scoped Quizzes customized per team context
- Multi-Format Doc Support (Google Docs, PDFs, markdown, wikis, transcripts, etc.)
- Progress Tracking dashboard for completion and pass/fail visibility

Our target users will use the website in two main ways:
1. Team leads submit and maintain onboarding content, then monitor new-hire progress.
2. New hires complete their team-specific quiz to confirm readiness before active sprint participation.

## Expected Features List

- Team onboarding portal with role-based access
- Upload/link support for docs, PDFs, markdown, and transcript text
- AI pipeline for document parsing and topic extraction
- Auto-generated quiz creation from team content
- Quiz editing/review flow for managers before publishing
- New-hire quiz-taking interface with scoring and feedback
- Progress dashboard for managers/team leads
- Team-level analytics (completion rates, average score, weak-topic insights)
- Notification/reminder system for incomplete onboarding tasks

## Related Work

Related products include:
- Learning management systems (LMS) such as Workday Learning, Trailblaze, Confluence, Gus
- Documentation platforms like Google Drive, where managers can upload and organize team onboarding documents
- Quiz/assessment tools such as Kahoot, Quizizz, and Google Forms

How our project stands out:
- Team-customized onboarding at scale: unlike generic LMS flows, quizzes are generated from each team’s real onboarding docs.
- Documentation-first workflow: teams reuse existing materials instead of recreating courses from scratch.
- Multi-format ingestion: supports mixed onboarding sources (docs, markdown, transcripts, wikis, etc.) in one pipeline.
- Readiness-focused outcomes: directly measures whether new hires understand team-specific context before joining sprint work.

## Open Questions

- What is the best architecture for reliable multi-format document ingestion and parsing at scale?
- How do we ensure generated quiz questions are accurate, non-ambiguous, and aligned with team expectations?
- What evaluation metrics should define onboarding success (pass threshold, retention over time, sprint ramp-up speed)?
- What privacy/security constraints apply to internal Salesforce documentation and how should data be stored/processed?
- Should quiz generation be fully automatic, or require manager approval before publishing?
- What integrations are most important for MVP (GitHub, Google Docs API, internal wiki exports, Slack)?
- How can we ensure that when users answer a quiz question incorrectly, they are shown the exact source document and section where the correct answer comes from (Slackbot integration)?
