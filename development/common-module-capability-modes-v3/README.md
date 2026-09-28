# Non-D3 module-capability compiler-mode probes

Status: **synthetic development evidence, not a D3 method freeze or result**.
No D3 source, case, prediction, label or study metric is read by this runner.

This overlay of the historical seven-case development fixture probes three
compiler modes observed as configuration candidates in the pinned D3 Git
objects. The fixture source itself is developer-authored, not sampled from D3.

| Candidate probe | Source-derived expectation | Retained local behavior |
| --- | --- | --- |
| Bundler plus `verbatimModuleSyntax: true` | A bare `import { type Shape }` has a runtime side-effect dependency; `import type` and `export type` remain excluded. Six cross-group file pairs are expected. | Both tools produced those six pairs. |
| CommonJS plus TypeScript path alias | A literal `require('@lib/value')` resolves to one internal source file. | Both tools produced that file pair. |
| NodeNext plus internal package self-export | One internal export resolves to a regular source file, with dependency-cruiser `exportsFields` enabled as in the v2 development revision. | Both tools produced that file pair. |

The four earlier unsupported probes are retained: missing target, computed
dynamic import, shadowed `require` and symlink. Matching empty outputs on an
unsupported probe do not count as success. The bounded endpoint is still a
cross-group **source-file pair**, not occurrence localization, rule violation,
whole-architecture conformance, or evidence of accuracy on real repositories.

The first diagnostic capture under `receipt-hypothesis/` tested an explicit
hypothesis that the Bundler/`verbatimModuleSyntax` probe would *not* qualify
as shared. The actual raw outputs satisfied the source-derived six-pair
expectation in both tools, so the verifier rejected that false
`expected_shared=false` hypothesis. The capture was retained, not relabeled
as a passing run. The second capture under `receipt/` changed only the
development qualification expectation to true and passed the existing
seven-case receipt verifier. Both runs have the same normalized results;
comparator raw stdout contains run-specific temporary paths, so its raw
SHA-256 varies. `profile.json` pins both manifest hashes and the overlay
fixture/configuration bytes. The local operator reran the tools twice; these
are **not independent-person replicates**.

To verify the retained receipts without running either tool:

```sh
node development/common-module-capability-modes-v3/runner.mjs verify
```

To reproduce in a new directory with Node 22.16.0, TypeScript 5.9.3 and
dependency-cruiser 18.3.0:

```sh
npm ci --prefix development/common-module-capability/tools --ignore-scripts --no-audit --no-fund
node development/common-module-capability-modes-v3/runner.mjs capture /absolute/new/receipt-directory
```

The new manifest will have different timestamps and temporary paths. Compare
its verified normalized results and source/config hashes; do not overwrite the
retained captures. This positive synthetic qualification still does **not**
prove that any candidate config was effective at a D3 commit or that package,
workspace and alias resolution is complete there. The per-case configuration
and reviewed source truth must be accepted before either D3 tool run.
