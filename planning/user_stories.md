# Project Proposal

Pod Members: Frida, Esmeralda, Reyna, Melanie

## Problem Statement

The goal is to make onboarding more interactive, consistent, and effective — so new employees feel confident and informed from day one.

## User Roles

A new hire: a user who is seeking a fast patch to become a productive full-time employee
An intern: a user who is seeking focused, foundational knowledge to complete short-term tasks
A manager: a user who is maintaining onboarding materials and tracking team readiness

## User Personas

### Role: Manager
Marcus is a 42-year-old engineering manager living in Chicago, Illinois. He manages a rapidly growing team of 8 full-time Salesforce developers and relies heavily on a desktop-first setup, constantly switching between Jira, Slack, and DevOps tools. He will use the app weekly to upload new system documentation and check on his team's technical readiness before assigning them active sprint tickets. He is highly motivated to stop spending 5+ hours a week answering the same routine codebase setup questions, but his main pain point is that his team's documentation is wildly scattered across Confluence, text files, and pinned Slack messages, leaving him with zero time to manually write quizzes to test if people actually understand it.

### Role: Manager
Sarah is a 31-year-old Lead Admin based in Austin, Texas, who oversees a hybrid team of business analysts and system configuration specialists. She splits her time equally between her desktop and her phone, preferring to monitor team performance and approve access requests via mobile notifications between meetings. She uses the app almost daily during onboarding cycles to ensure her team strictly adheres to enterprise compliance rules and Org customization guidelines. Her biggest frustration is that new team members often claim they "finished reading" the onboarding wiki, but immediately make critical naming-convention errors in Sandbox environments because they didn't actually retain the information.

### Role: New Hire
Devi is a 24-year-old recent computer science graduate who just relocated to Atlanta, Georgia, for her first corporate role. She is a digital native who works primarily on her desktop but expects slick, modern web experiences that look just as good on her phone. She will use the app daily during her first two weeks to study up and pass her mandatory onboarding checkpoints so she can prove herself and pick up her first real user story. Her biggest pain point is intense imposter syndrome; she feels completely overwhelmed by the sheer volume of technical architecture diagrams thrown at her and is terrified of asking "stupid questions" about the team's local git branching strategy.

### Role: New Hire
Javier is a 38-year-old veteran architect working remotely from Denver, Colorado. He is an extreme power user who works strictly from a multi-monitor desktop setup and despises clunky, over-simplified UI wizard flows. He will use the app intensively for just 2 or 3 days to bypass standard corporate fluff and target his learning directly toward this specific company's highly customized, complex multi-org integration frameworks. His primary pain point is that standard onboarding paths are far too generic and waste his time teaching him core Salesforce basics he already knows, rather than letting him quickly test out of familiar concepts to focus strictly on local custom code architecture.

### Role: intern
Liam is a 20-year-old college junior studying Information Systems, living in Seattle, Washington, for a 10-week summer internship. He uses a laptop for school and work but manages his life entirely phone-first, meaning he appreciates bite-sized, gamified learning interfaces he can click through easily. He will use the app heavily during his first three days to get up to speed on basic Salesforce data modeling and flow builder rules so he can tackle lower-complexity bug fixes. His main pain point is a massive learning curve combined with a highly compressed timeline; he knows he only has a few weeks to deliver value and gets stuck easily if onboarding material isn't broken down into small, digestible milestones.

### Role: intern
Chloe is a 22-year-old senior completing a part-time winter internship from her apartment in Boston, Massachusetts, while finishing her degree. She balances her time between university classes and a 15-hour weekly work schedule, meaning her app usage is highly fragmented across irregular hours (like late nights or short gaps between classes). Her motivation is to learn the team’s specific business discovery processes and documentation standards so she can shadow client meetings. Her major pain point is that her onboarding materials change constantly as the team updates workflows, making it difficult for her to know if she is studying the most up-to-date business requirements for her short-term project.

## User Stories

1. As a manager, I want to upload and organize onboarding documents in one place, so that new team members can find everything without asking repeatedly.
2. As a manager, I want to create short quizzes from onboarding material, so that I can verify new hires actually understand key concepts.
3. As a manager, I want to assign onboarding modules by role (new hire vs intern), so that each person gets content relevant to their responsibilities.
4. As a manager, I want to see each person's onboarding progress and quiz scores, so that I know who is ready for project work.
5. As a manager, I want to update onboarding content with version history, so that the team always studies current processes and standards.
6. As a new hire, I want a guided onboarding path with clear daily milestones, so that I can build confidence and avoid feeling overwhelmed.
7. As a new hire, I want to take interactive checks after each module, so that I can confirm I retained the most important information.
8. As a new hire, I want to quickly ask context-aware questions while studying, so that I can get unstuck without waiting for a manager.
9. As an intern, I want onboarding content broken into short, bite-sized lessons, so that I can learn effectively during limited work windows.
10. As an intern, I want mobile-friendly progress tracking and reminders, so that I can stay on track between classes and meetings.
11. As an intern, I want beginner-friendly examples tied to real team tasks, so that I can contribute sooner on low-risk tickets.
12. As a manager, I want automated alerts when someone is falling behind onboarding milestones, so that I can intervene early and provide support.
13. As a new hire, I want to ask clarifying questions directly inside a documentation module and receive immediate, context-specific explanations, so that I can overcome technical jargon without needing to interrupt a colleague. (AI Feature)
14. As a manager, I want the system to suggest relevant quiz questions based on the documentation I just uploaded, so that I can instantly verify comprehension without spending hours writing assessments manually. (AI Feature)

## Wireframe (Bonus)

Insert link or image to your group's wireframe. 

## Decisions Log — User Stories

- **Story we debated the scope of**: Story 5 (Version History). We initially wanted full version tracking (git-style history). We realized building an entire audit trail system is too broad for a rapid MVP.
  **How we resolved it**:  We resolved it by pivoting to a "critical update notification" flag, which satisfies Chloe's persona need without heavy database overhead.
- **Story we cut (and why)**: We cut a proposed story: "As an intern, I want a gamified leaderboard with point tracking." While Liam likes gamified learning, building a global leaderboard introduces community features and competition elements that are distracting from the core problem of documentation clarity.
- **Story that changed after Claude's feedback**: Story 8 (Testing Out). We noticed our stories forced everyone down the exact same linear path. This directly conflicted with our veteran persona (Javier), who despises corporate fluff. We added a specific story allowing users to challenge a module upfront to bypass it.
- **AI feature story: user benefit we landed on**: For Story 13 & 14, we strictly focused on reduced friction and time-saving benefits. We stripped out references to "the LLM", "backend embeddings", or "vector search API calls" to ensure the stories describe the end-user experience, keeping technical implementation details strictly in our planning.md API contracts.
