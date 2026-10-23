# IHO behavior testing toolkit

This repository owns the reusable bootstrap CLI, knowledge providers and two agent skills. Business page fixtures and project-specific render adapters stay in their application repositories.

When changing a provider or bootstrap operation, run `npm test`. Keep generated project tests runnable without this checkout, model access or an online knowledge service. Preserve existing project configuration during initialization; show conflicts instead of overwriting custom files.

Skill authoring follows skill-creator and writing-for-agents when available. Common rule content belongs in the versioned knowledge catalog; skills explain how to retrieve and apply it. Record provenance for imported examples and verify them against real project results.

OpenViking live validation passed on the authorized deployment on 2026-10-23; see docs/openviking-live-validation.md for evidence and scope. Obtain user agreement before connecting to their service or enabling a plugin; existing session authorization applies. Automated adapter tests use injected responses and do not prove compatibility with every deployment. The memory plugin is not required and remains disabled in the three pilot projects.
