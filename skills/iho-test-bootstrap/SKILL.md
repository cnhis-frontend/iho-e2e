---
name: iho-test-bootstrap
description: Initialize or repair non-browser behavior testing in Vue 3 IHO projects, including missing dependencies, Vitest configuration, DOM/MSW setup and test typechecking. Use for test infrastructure onboarding or migration.
---

Build a runnable testing environment and one real business flow. Environment smoke and business coverage are separate acceptance results. Project installations include a portable toolkit snapshot in this skill's `toolkit/`; commit both IHO skill directories together.

1. Read repository instructions and inspect the working tree, Node version, package manager, lockfile, Vue/Vite versions and existing tests. Preserve existing configuration and user edits. This toolkit targets Vue 3; report other stacks rather than migrating them implicitly.
2. From this skill's directory, run `node scripts/run.mjs init --project <absolute-project-path>` to review the plan. `--apply` installs missing dependencies with the detected package manager, creates configuration/setup/typechecking and runs environment validation. Use `--no-install` or `--no-verify` only when explicitly needed, and report those steps as incomplete. Existing custom files are preserved, not overwritten.
3. Read the project's `iho-test.config.json` and use `node scripts/run.mjs rules --project <path> --id iho.behavior-testing` to obtain pinned public rules. Knowledge is pluggable; honor the project's current provider and the user's permissions. Bootstrap never enables OpenViking or changes plugin configuration.
4. If the project already has a working environment, reuse it. Map its actual script names, test configuration, flow directory and documentation in the profile. Adapt only necessary compiler plugins, aliases, application providers, host ports and cleanup. When adaptation is needed, run `node scripts/run.mjs info` and read its `adaptationGuide` absolute path, resolved from the project's bundled toolkit.
5. Implement one flow from an independent requirement/ADR through real DOM interactions and the real service chain. Add a relevant failure branch and verify sensitivity to the corresponding bug. Existing behavior may already pass; a reversible mutation can demonstrate detection without pretending the environment was initially broken.
6. Run `node scripts/run.mjs doctor --project <path> --run`. Static diagnosis alone is not evidence of passing tests. Fix new failures, preserve unrelated existing failures in the report, and leave production fixtures and tests runnable without this toolkit checkout.

Record the actual rule source/version, real and simulated interfaces, test commands/results and remaining limitations in project test documentation. Add a short repository instruction pointing to that document once it exists. Replace old tests only after mapping their business rules to verified coverage.
