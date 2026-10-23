# IHO behavior testing toolkit

This repository owns the reusable bootstrap CLI, knowledge providers and two agent skills. Business page fixtures and project-specific render adapters stay in their application repositories.

When changing a provider or bootstrap operation, run `npm test`. Keep generated project tests runnable without this checkout, model access or an online knowledge service. Preserve existing project configuration during initialization; show conflicts instead of overwriting custom files.

Skill authoring follows skill-creator and writing-for-agents when available. Common rule content belongs in the versioned knowledge catalog; skills explain how to retrieve and apply it. Record provenance for imported examples and verify them against real project results.

OpenViking integration is currently offline only. Do not enable an OpenViking plugin or connect to the user's service without prior user agreement. HTTP adapter tests use injected responses and do not prove live compatibility.
