# D3 module method freeze scaffold — v0.2.0

Status: **proposal only; not accepted, not runnable and not a D3 result**.

The resolver template now records four conservative candidate decisions supported
by the study contract and retained non-D3 v1 fixtures: source eligibility,
runtime ES syntax, literal CommonJS/dynamic imports, and exact source-file-edge
normalization. Relative resolution, per-side project configuration, and
package/workspace resolution remain undecided. The merged exports-field v2
development fixture demonstrates a candidate configuration that repairs the
v1 self-package-export mismatch on synthetic source, but that v2 receipt and
configuration are not bound by this v0.2.0 manifest. It cannot silently turn
package exports into a supported D3 feature. Both authors must choose and bind
an exact configuration or leave the feature unsupported before execution.

This directory defines the files that Hiếu and Hoàng must jointly freeze before either tool is run on D3. It records the merged Guardian source commit `e32ef53eeb07bc8c904b6a1e6a8b897d16def820`, binds the development common-capability packet merged at Benchmark `efc1a14bc650056f98fd2093c79effb79ce7cc87`, and binds the candidate package-preflight receipt merged at Benchmark `ab0a93266601bc45cf817f1771fba8d37cb062c7`. The package receipt supplies candidate archive hashes and identities, but the archives are not committed and no independent reproduction is complete, so it is not a package or method freeze. The capability packet supports only the cross-group file-edge task: dependency-cruiser supplies no physical occurrence positions, so occurrence scoring remains unsupported. Exact configuration and scientific method acceptance remain pending. Human acceptance and personal declaration fields intentionally remain `null`.

## Endpoint

The truth inventory retains source-bound direct module occurrences and derived, deduplicated cross-group **source-file** edges. The present comparative endpoint is the exact source-file/target-file pair: the retained comparator output lacks physical source positions, so occurrence-level comparative scoring is disabled until a separately validated position extractor is frozen. Group-level aggregation is secondary and must not hide wrong-file localization. Every eligible changed file is represented on both base and head, including reviewed files containing zero occurrences. An occurrence binds repository, case, side, commit, source path, physical line/column, exact quote, source object hashes, syntax/specifier, resolver evidence, target and group mapping, disposition and AI provenance. The derived file edge keeps every supporting occurrence key.

The legacy `d3-author-review/1` four-label sheets and CSV first-pass worksheets cannot satisfy this endpoint. They have no complete file-side coverage, occurrence location, resolver evidence or edge inventory. `validateModuleReview()` rejects those schemas explicitly. For an official selected-scope D3 review, use `validateAcceptedD3Review()` with the original selected case bundle as raw bytes, not a parsed object: it requires the accepted bundle SHA-256 `44cc064a3555c90cc20d2a38ab61d67c6af598c1825bf5290cca2269ec801d35`, not merely a self-declared review hash. The underlying validator then matches each covered file-side to the bundle's mode and Git blob, checks regular-file SHA-256, and verifies each occurrence quote at its stated physical line and column. This enforces the recorded case-scope decision but does not approve the full method or authenticate a reviewer's work. These checks establish byte and location consistency, not exhaustive dependency recall or scientific truth. Legacy sheets remain historical preparation records and must not be converted into module truth by changing a schema name.

## Files

- `holdout/D3-ANALYSIS-PLAN.v0.2.0.md` states the proposed primary source-file-edge estimand, per-repository denominators, Unknown propagation, and bounded reporting; the manifest pins its raw bytes alongside the machine-readable statistical template.
- `file-coverage.schema.json` records every file/side, including absence, symlink, exclusions, Unknown and a zero occurrence count.
- `occurrence.schema.json` records each direct dependency occurrence and resolver/AI provenance.
- `module-edge.schema.json` records the exact deduplicated cross-group source-file edge and its occurrence references.
- `review.schema.json` composes the three inventories for all 56 primary cases.
- `freeze-manifest.schema.json` defines the proposal manifest and keeps every scientific-completion claim false.
- `review.template.json` is deliberately blank and contains no personal declaration, label or acceptance.
- `resolver-policy.template.json` exposes every unresolved resolver/common-capability dimension.
- Its `unknown_policy` freezes propagation from occurrences to file-sides, case-sides and change comparisons, while keeping tool failures in attempted coverage.
- `statistical-plan.template.json` freezes denominators and zero-denominator behavior. Unsupported, failed and truth-Unknown attempts stay visible.
- `tool-pins.template.json` binds the merged Guardian adapter source, dependency-cruiser 18.3.0 configuration/lockfile, merged non-D3 receipt and candidate archive hashes from the merged package preflight. It keeps unavailable archive bytes, independent reproduction and joint method acceptance as explicit blockers.
- `applicability-reviewed.template.json` is a blank destination shape only. The immutable 152-row checklist must be copied by the controlled builder and filled through actual source review; this file is not that review.
- `freeze-manifest.json` hashes the raw bytes and sizes of the preceding artifacts. It does not hash itself. Archive its raw SHA-256 externally when both authors accept a completed version.
- The manifest also pins `scripts/d3-review/module-method.mjs` and `test/d3-module-method.test.mjs`, so validator or deterministic-test changes invalidate the proposal hash.

## Required sequence

1. Review the merged Guardian/dependency-cruiser development receipt and its retained inputs, expected output, raw output, exit code, version, configuration and hashes. Jointly decide whether its narrow cross-group file-edge capability is accepted before viewing new D3 predictions; it does not establish occurrence scoring.
2. Complete the resolver policy and all 152 historical applicability rows with exact source evidence. Both authors accept one manifest version and raw hash.
3. Generate two separate 56-case review files. Each must include complete file-side coverage, occurrences and edges plus the reviewer's actual development/output/AI declaration. Preserve each original file and raw hash before comparison.
4. Resolve differences only after originals are sealed. Unresolved differences remain Unknown.
5. Only then execute both frozen tools on identical eligible D3 trees and compute the declared per-repository metrics and coverage. Preserve failures, stdout/stderr, exit code, configuration and hashes.

`node scripts/d3-review/module-method.mjs` verifies deterministic bytes and reports all known open structural/method gates; use `--write` only after intentionally changing a listed artifact. Its status is not a readiness claim. It never confirms scientific truth, identity, acceptance, labels, outputs or completion. `pnpm holdout:gate` remains closed until its separate requirements are met.
