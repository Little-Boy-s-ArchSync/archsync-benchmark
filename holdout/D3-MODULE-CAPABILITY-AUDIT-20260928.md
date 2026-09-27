# D3 module-capability audit

Date: 2026-09-28. Status: technical audit, **not** a tool-result experiment.

The approved initial D3 unit is a direct source-module dependency aggregated to a named in-process module group. The proposed contract includes ES value imports/re-exports and literal `require`/dynamic `import`; type-only imports and test-only files are excluded. An eligible comparison requires ArchSync and dependency-cruiser to receive the same frozen source revisions, path mapping, resolution semantics and edge definition.

## Current implementation check

- ArchSync Core supports the relationship type `dependency` (`archsync-core/src/model.ts`), so the model can express a module edge.
- The present Guardian detector union (`archsync-guardian/src/contracts.ts`) contains `component-root`, `typescript-fetch`, `typescript-pg`, `typescript-redis` and AMQP publish/consume, but no source-module dependency detector.
- Guardian's TypeScript analyzer (`archsync-guardian/src/analyzer.ts`) parses import declarations to recognize library bindings for its runtime-resource detectors. Its relationship-emission walk creates fetch, PostgreSQL, Redis and AMQP relations; it does not resolve local imports into module-to-module graph edges.
- The current Benchmark D3 preparation contains packet verification and review intake, not a runnable capability-matched ArchSync/dependency-cruiser comparison over the 56 selected cases. The proposed contract itself states that no executable module adapter or baseline equivalence has been asserted.

Therefore **do not run or publish module-level accuracy for the existing Guardian as if this capability already existed**. Core schema compatibility is not detector support. A zero output from an unsupported detector is not a measured false negative, and comparing Guardian runtime signals to dependency-cruiser import edges would compare different tasks.

A separate local Guardian development branch `research/d3-module-detector-20260928` now contains an opt-in `analyzeModuleDependencies` adapter at commits `af9c941` and `1a88a65`. It supports source-group mapping, TypeScript-resolved value imports/re-exports and literal `require`/dynamic import on development fixtures; it excludes type-only/test/declaration files and reports unresolved imports. Full local Guardian `pnpm verify` passed with 100% configured coverage after exact evidence regeneration. This is **not** the pinned benchmark package, a D3 run or proof of package-export/resolver parity across the three real repositories. The prior paragraph remains true for the Guardian version currently pinned by Benchmark.

## Work required before an exploratory module experiment

1. Implement and independently test a versioned ArchSync module-edge detector/adapter on development fixtures outside D3; support the frozen source/edge/resolver semantics or declare unsupported subsets. Preserve package SHA and commit before the official D3 run. Because both authors disclosed previous D3 output exposure, this remains a nonblind exploratory study even if the new adapter is frozen before new runs.
2. Prepare a version-pinned dependency-cruiser configuration with an exact common-capability mapping. Dry-run only on development fixtures; retain raw outputs and failed resolutions.
3. Resolve source-packet reconstruction, including Reactive Resume symlink Git-object mode, without silently following links or changing source bytes. Verify every base/head tree and manifest hash.
4. Accept each applicable study-defined rule and historical base/head applicability; finish two disclosed author reviews and source evidence. Preserve initial reviews before reconciliation and Unknowns after it.
5. Freeze the analysis plan, run both tools on the exact same eligible cases, retain stdout/stderr/exit status/configuration/hash and compute per-repository denominators. Unsupported/failure/Unknown cases remain visible. Do not infer edge recall from one case label.

No label, prediction, baseline score, comparative claim or paper result is created by this audit.
