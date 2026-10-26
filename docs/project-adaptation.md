# Adapting an IHO application

The CLI can build a complete generic Vue 3 test environment. A real IHO page still needs a repository-owned adapter for its providers, routes, host data and HTTP contracts. Keep those adapters in the application repository.

## Existing environment

Keep existing Vitest plugins, aliases, compiler defines and dependency inlining. A separate flow configuration can extend the existing configuration, but verify array merging: explicitly select setup files and includes so legacy tests do not leak into the flow suite. Set the actual configuration and script paths in `iho-test.config.json`.

Generated `vitest.iho.config.ts` is an independent starter, not a replacement for business-specific configuration. Initialization uses a temporary `tests/.iho-env-*` fixture to prove Vue SFC compilation, DOM interaction and MSW interception, then removes its unchanged files after success. Its passing result is not application coverage. The flow command targets `tests/flows` and fails when that suite is empty.

## Page harness

Mount the real page with real UI providers, business descendants, Pinia and the relevant router. Supply qiankun/host values at the host interface and configure HTTP responses at the network boundary. A user action helper must dispatch a DOM interaction, not call the page's private method. Keep the page's feedback/confirmation UI observable.

Project singleton stores, request caches, global event buses and discrete dialogs require explicit lifecycle handling. Standard Testing Library cleanup is only the base; add project disposers where the real application owns other state.

For layout-dependent widgets, first identify the exact missing DOM primitive. Use a narrow adapter with documented limitations. Replacing the whole business table or form would remove the behavior being tested.

## Common integration concerns

- A dialog promise may settle in a transition callback such as `onAfterLeave`. Check whether transition stubs suppress that callback; retain the relevant Transition/Teleport behavior when the flow depends on it.
- A successful toast can precede completion of a list refresh. Wait for the expected returned data and selection state before teardown so pending work cannot leak into another test.
- Virtual lists and trees may require a viewport notification unavailable in the simulated DOM. Adapt the missing ResizeObserver capability narrowly; the adapter must not construct business rows or substitute the component.
- A component library may import unused device or RTC SDKs. A call-failing fake at that external device interface keeps accidental usage visible while allowing unrelated flows to load.
- Whole-library prebundling can pull native modules into an unsuitable compilation path. Preserve source transformation when required and optimize only dependencies supported by observed failures or measurements.
- Prefer the environment's supported teardown and production disposers over stacking global timer spies. Validate cleanup across repeated mounting and reordered cases; a wrapper must not recursively capture its own spy.

## Knowledge

The project profile points to a local directory, a pinned Git checkout, or an OpenViking directory containing the catalog and its referenced files. `rules` reads cataloged accepted rules with SHA-256 verification. It is deterministic catalog search, not semantic search. Reading a memory/draft by explicit ID does not turn it into an accepted rule.

Local snapshots and the Git provider require no service. The OpenViking adapter uses the documented GET content/read API and makes no writes, recalls or commits. One authorized deployment passed [live validation](openviking-live-validation.md); automated protocol tests inject HTTP responses. New deployments still require authorization and compatibility verification.

## Acceptance

The scaffold's environment test and types must pass. The repository's genuine flow suite must contain passing, non-skipped cases and demonstrate at least one meaningful failure condition. `doctor --run` invokes the configured flow and typecheck scripts, checks Vitest JSON counts and fails for empty/skipped suites. This checks execution evidence, not the semantic quality of the tests; review the actual flow and its requirement separately.

After verification, remove temporary examples, debug-only code and unreferenced probe helpers introduced during setup. Preserve shared support and meaningful regression tests; explicitly record any probe kept for ongoing coverage. Update scripts/config/imports/docs that reference removed files, and rerun affected checks. Failed diagnostics and project-modified files require review rather than blanket deletion. Environment-only setup may finish without business coverage; do not leave dummy tests to conceal that distinction.
