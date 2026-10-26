# Adapting an IHO application

The CLI can build a complete generic Vue 3 test environment. A real IHO page still needs a repository-owned adapter for its providers, routes, host data and HTTP contracts. Keep those adapters in the application repository.

## Existing environment

Keep existing Vitest plugins, aliases, compiler defines and dependency inlining. A separate flow configuration can extend the existing configuration, but verify array merging: explicitly select setup files and includes so legacy tests do not leak into the flow suite. Set the actual configuration and script paths in `iho-test.config.json`.

Generated `vitest.iho.config.ts` is an independent starter, not a replacement for business-specific configuration. It includes a separate `tests/iho-env` fixture to prove Vue SFC compilation, DOM interaction and MSW interception. Its passing result is not application coverage. The flow command targets `tests/flows` and fails when that suite is empty.

## Page harness

Mount the real page with real UI providers, business descendants, Pinia and the relevant router. Supply qiankun/host values at the host interface and configure HTTP responses at the network boundary. A user action helper must dispatch a DOM interaction, not call the page's private method. Keep the page's feedback/confirmation UI observable.

Project singleton stores, request caches, global event buses and discrete dialogs require explicit lifecycle handling. Standard Testing Library cleanup is only the base; add project disposers where the real application owns other state.

For layout-dependent widgets, first identify the exact missing DOM primitive. Use a narrow adapter with documented limitations. Replacing the whole business table or form would remove the behavior being tested.

## Lessons verified in the pilot applications

- OTC confirmation promises settle in the real modal transition's `onAfterLeave`. Vue Test Utils transition stubs prevented the submit sequence from completing; retaining real Transition/Teleport fixed the flow. Applications mounted through their production `createApp` path do not necessarily have this stub, so inspect the actual mounting path first.
- A successful toast can precede the list refresh. OTC now waits for the server-returned row status and cleared selection before teardown; otherwise the refresh may leak into the next scenario.
- MIIAS uses a virtual classification tree. happy-dom did not produce its initial viewport ResizeObserver notification; a narrow viewport notification adapter allowed the real tree to render. The adapter does not construct business rows or substitute the tree.
- The business component library imports unused RTC SDKs. A call-failing fake at that external device interface keeps accidental usage visible while allowing unrelated page flows to load.
- Whole-library prebundling can pull native canvas binaries into an unsuitable compilation path. The pilots kept business/UI libraries in source transformation and optimized only observed icon packages. Measure cold start separately from interaction time; do not promise a universal speedup.
- Prefer the environment's supported teardown and production disposers over stacking global timer spies. A pilot timer wrapper recursively captured its own spy and invalidated the suite; any cleanup abstraction must survive repeated mounting and reordered cases.

## Knowledge

The project profile points to a local directory, a pinned Git checkout, or an OpenViking directory containing the catalog and its referenced files. `rules` reads cataloged accepted rules with SHA-256 verification. It is deterministic catalog search, not semantic search. Reading a memory/draft by explicit ID does not turn it into an accepted rule.

Local snapshots and the Git provider require no service. The OpenViking adapter uses the documented GET content/read API and makes no writes, recalls or commits. One authorized deployment passed [live validation](openviking-live-validation.md); automated protocol tests inject HTTP responses. New deployments still require authorization and compatibility verification.

## Acceptance

The scaffold's environment test and types must pass. The repository's genuine flow suite must contain passing, non-skipped cases and demonstrate at least one meaningful failure condition. `doctor --run` invokes the configured flow and typecheck scripts, checks Vitest JSON counts and fails for empty/skipped suites. This checks execution evidence, not the semantic quality of the tests; review the actual flow and its requirement separately.
