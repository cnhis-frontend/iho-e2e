---
name: iho-behavior-testing
description: Implement or update behavior-focused tests for IHO Vue business features and bug fixes using the project's real page harness and external adapters. Complements mattpocock TDD; does not require new tests for documentation or purely visual changes.
---

Use the existing project test harness to verify a user capability through agreed public interfaces.

1. Read the project test guide referenced by AGENTS.md, then the relevant requirement, CONTEXT.md and ADR. Inspect `iho-test.config.json`. If the testing environment is missing, use iho-test-bootstrap when available or read its sibling SKILL.md.
2. Run `node scripts/run.mjs rules --project <absolute-project-path>` from this skill's directory. Read relevant rule bodies by `--id`, recording provenance. Use the configured knowledge provider; do not enable a disabled plugin. Required rules being unavailable is different from no search matches. Follow the project's explicit snapshot fallback policy.
3. Name the behavior and independent expected result before implementing its test. Use an existing confirmed test interface where applicable. When mattpocock TDD is active, preserve its red/green cadence and interface agreement rules; this skill supplies project mechanics, not a second development workflow.
4. Reuse the genuine page/feature harness and external fixtures. Implement the next behavior through DOM interaction or an agreed public business interface. Keep assertions on observable outcomes and external protocols. When rendering or isolation is unclear, run `node scripts/run.mjs info` and read its `adaptationGuide` absolute path; this works through installed directory links too.
5. Execute relevant flow and test-typechecking scripts. For bugs, demonstrate the regression fails before its fix; for newly added coverage of existing behavior, establish detection through a reversible fault if needed. Avoid adding broad tests that merely reproduce implementation decisions.

At completion report scenarios verified, exact commands/results, required external fakes, rule versions and unverified browser/backend/device behavior. Keep fixture updates tied to requirements/contracts. A renamed component or reorganized hook alone should not force a new behavioral expectation.
