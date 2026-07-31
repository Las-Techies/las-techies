# Reflection #3

Pod Members: **Esme, Frida, Melanie, Reyna**

## Reflection Questions

* Name at least one successful thing this week.

One major success this week was stabilizing the manager and learner flows end-to-end in deployment, not just locally. We fixed several high-impact bugs across auth and dashboard behavior (route protection, invite handling, manager redirects, and null-safe dashboard loading), and we also improved quiz quality by shuffling answer options so the correct answer is not always first and tightening citation/highlight behavior. By the end of the sprint, we had a much more realistic product experience with fewer brittle edge cases.

* What were some challenges you and/or your group faced this week?

Our biggest challenge was production reliability and environment drift between local and Render. We spent significant time debugging deployment-specific failures (CORS, memory limits during generation, dependency/version mismatches, OAuth callback behavior, and frontend build failures). We also had recurring token/auth complexity around Google and GitHub integrations, especially when provider tokens expired or were missing after refresh. Another challenge was that quick bug fixes could introduce follow-on regressions, so we had to be much more disciplined with retesting after each change.

* Did you finish all of your tasks in your sprint plan for this week? If you did not finish all of the planned tasks, how would you prioritize the remaining tasks on your list?  (i.e over planned, did not know how to implement certain features, miscommunication from the team, had to pivot from original plans, etc.)

We completed most of our planned priorities, but we also had to pivot substantial time toward urgent production fixes that were not on the original sprint list. Because those issues affected core usability, we prioritized stability over adding net-new features. Remaining work will be prioritized in this order: (1) harden GitHub OAuth/token handling so picker and repo import are consistent, (2) reduce deployment fragility by locking build/runtime assumptions, and (3) continue incremental UX polish only after core reliability paths are stable.

* Did the resources provided to you help prepare you in planning and executing your capstone project sprint this week? Be specific, what resources did you find particularly helpful or which tasks did you need more support on?

Yes, the resources were helpful, especially when combined with advisor guidance and iterative debugging practices. The planning docs gave us a baseline for scope and architecture, and code reviews/checklists helped us catch issues before shipping. The area where we needed more support was OAuth/provider-token lifecycle behavior across environments (local vs deployed), since that was the most error-prone and least intuitive part of the sprint. We learned that having clearer runbooks for auth/debug workflows would have saved time.

* Which features and user stories would you consider “at risk”? How will you change your plan if those items remain “at risk”?

The most at-risk feature remains GitHub repo import UX, specifically the user-facing "Connect GitHub" and repo-picker reliability when tokens are stale or already-linked identities return edge-case errors. A second at-risk area is scaling quiz generation reliability under constrained deployment memory. If these remain at risk, we will keep a strict fallback-first plan: default to stable backend token-based import paths, improve user messaging for reconnect flows, and postpone non-critical enhancements until auth and generation reliability are consistently passing in production.
