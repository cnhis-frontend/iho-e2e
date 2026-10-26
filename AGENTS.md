# IHO behavior testing toolkit

This repository owns the reusable bootstrap CLI, knowledge providers and two agent skills. Business page fixtures and project-specific render adapters stay in their application repositories.

When changing a provider or bootstrap operation, run `npm test`. Keep generated project tests runnable without this checkout, model access or an online knowledge service. Preserve existing project configuration during initialization; show conflicts instead of overwriting custom files.

After successful environment verification, remove temporary probes, example components and debug-only code created for that verification. Preserve reusable test infrastructure and actual regression coverage, repair references to removed files, and verify the remaining setup. Keep failed diagnostics until their cause is understood; never delete project-owned edits as temporary output.

Skill authoring follows skill-creator and writing-for-agents when available. Common rule content belongs in the versioned knowledge catalog; skills explain how to retrieve and apply it. Keep distributed code, examples and documentation independent of consuming projects: use synthetic fixtures and placeholders, and keep business scenarios, repository paths and project acceptance reports in their own repositories.

OpenViking validation scope is documented in docs/openviking-live-validation.md. Obtain user agreement before connecting to their service or enabling a plugin; existing session authorization applies. Automated adapter tests use injected responses and do not prove compatibility with every deployment. The memory plugin is not required; preserve the consuming project's plugin settings and connection permissions.
