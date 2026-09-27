# Non-D3 common module capability fixture

Status: **development verification complete on the retained macOS run; research tool choice/configuration remains proposed**. No D3 source, case, prediction, label, rule applicability, freeze or research result is an input or output. The synthetic sources here were written for this check and are not an independent accuracy benchmark.

This fixture invokes the committed module-dependency adapter from Guardian **e32ef53eeb07bc8c904b6a1e6a8b897d16def820**, analyzer **0.1.0-development**, with **dependency-cruiser 18.3.0**, **TypeScript 5.9.3**, and **Node 22.16.0**. `guardian-pin.json` records the source and compiled module SHA-256 values and exact upstream paths; the retained copies are unmodified. This isolated adapter slice is not a rebuilt or newly released Guardian package and does not replace Benchmark's historical runtime. Comparator transitive versions and registry integrity hashes are in `tools/package-lock.json`.

## Inputs and interpretation

`fixtures.json` retains every developer-authored source byte, tsconfig, package export map, grouping, symlink specification, and expected cross-group file-pair set. `dependency-cruiser.json` retains the common configuration. The source population is these artificial trees only. The runner has no option to supply a repository or D3 path: it materializes each declared fixture in a fresh temporary directory, reads source without executing it, and preserves that directory for audit.

The pair unit is `(source file, resolved target file)` crossing distinct explicitly mapped groups. It is not import-occurrence recall, whole-repository architecture accuracy, or service interaction recovery. Dependency-cruiser supplies no physical source line/column in this output; the common capability is explicitly **edge-only**. Occurrence scoring is unsupported unless a separately validated and frozen position extractor exists. Guardian's occurrence evidence is retained and checked against fixture lines. Both tools' same-group dependencies are excluded by the same normalizer; raw outputs and comparator outside-scope dependencies remain visible. Same-group exclusions are distinguished from outside-production dependencies. Resolved production edges with an unmapped source or target are normalization errors and fail common qualification. Type-only syntax uses `verbatimModuleSyntax: false` and comparator `tsPreCompilationDeps: false`; this is not a statement about every compiler mode.

| Fixture | Retained behavior | Comparison boundary |
| --- | --- | --- |
| value-syntax | Both produce the five developer-expected pairs for value import, re-export, side effect, literal dynamic import and unshadowed `require`; explicit type-only forms add no edge | Shared within this fixture/configuration |
| alias | Both resolve the explicit tsconfig alias; same-group import retained in raw comparator output | Shared within this fixture/configuration |
| self-package-export | Guardian resolves the internal package self-export; comparator reports it unresolved | Candidate failed common-capability qualification; no shared success |
| unresolved | Both retain the missing target as unresolved | Unsupported; an empty pair set is not success |
| computed-dynamic | Both omit the computed target | Unsupported; matching omissions are not evidence of correctness |
| shadowed-require | Guardian excludes the locally bound function; comparator emits a dependency | Unsupported mismatch, retained without scoring |
| symlink | Guardian marks the link target outside its verified regular-file tree; comparator follows to the regular target | Unsupported source-semantics mismatch; do not use on linked D3 source |

The symlink is synthesized only inside a temporary developer fixture. Capturing on Windows may require symlink permission; inability to create it fails the capture rather than omitting it. The retained capture is macOS only. Cross-platform CI verifies retained bytes and normalization, not fresh cross-platform comparator execution.

`expected_pairs` are source-derived developer assertions. `expected_shared` locks the observed engineering qualification during development, including the failed package-export candidate; it is not a predeclared research eligibility rule. An initial harness attempt stopped on dependency-cruiser's unresolved pseudo-module identity; the normalization was corrected to retain that identity as data without using it as a path. No tool implementation or D3 outcome was changed. All capability gaps must be resolved or explicitly excluded through the eventual research method before a D3 comparison. This fixture cannot approve that method.

## Reproduce with pinned tools

From the Benchmark repository, use Node 22.16.0:

```sh
npm ci --prefix development/common-module-capability/tools --ignore-scripts --no-audit --no-fund
node development/common-module-capability/capture.mjs /absolute/new/non-d3-receipt
node development/common-module-capability/verify.mjs
node --test test/common-module-capability.test.mjs
```

The capture directory must not exist. Installation uses the lockfile and skips lifecycle scripts. Capture records actual executable/arguments/cwd, UTC start/end, exit/signal, stdout/stderr hashes, OS/architecture, tool versions, input hashes, and the exact raw outputs for all seven fixtures. Failed invocation output is kept and stops capture; no failure is replaced by a passing empty result. A completed new capture can be verified with the exported `verifyReceipt(base, receiptDirectory)` function; the CLI verifies the committed `receipt/`.

`receipt/manifest.json` binds this run. Changes to inputs, outputs, result flags or the declared population fail validation. Verification checks the ordered tools, exact command arguments, executable and working-directory consistency with recorded capture roots, canonical UTC timestamps, and sequential timing within the capture interval. These are structural provenance checks, not an independent attestation of the recorded executable or machine. Regression tests demonstrate failed-process rejection, missing-input rejection, byte tampering, invented success, missing comparator edges, invalid Guardian source locations, and unsupported-empty-result handling. These checks run in the ordinary unit suite without installing comparator tools. They provide software evidence only. No D3 research gate or manuscript claim is changed.
