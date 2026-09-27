# D3 ground-truth handbook and tooling

The blind-review protocol and `holdout:gate` below are an older proposed route, not the current two-author design. Hiếu and Hoàng disclosed prior D3 output exposure and chose a nonblind, AI-assisted exploratory route. AI may read source and propose or pre-fill annotations under `D3-AUTHOR-ANNOTATION-AMENDMENT.md` and `D3-CASE-RUBRIC.v0.2.0.md`; retain AI provenance and do not call shared AI suggestions independent human labels. The existing blind gate remains closed rather than accepting false exposure declarations.

The protocol is proposed, not approved. Do not select final repositories, annotate final truth, run ArchSync, or freeze D3 until EXP-102 and the Lead gates in `PROTOCOL.md` are complete.

`candidates.eval-102.json` is a ranked **candidate-only** inventory of exactly ten active TypeScript systems observed through the authenticated GitHub REST API on 2026-08-25 UTC; `candidate-inventory.schema.json` publishes its JSON Schema. Each record binds the canonical repository, observed default-branch commit, permissive SPDX result and immutable license file, GitHub size/activity snapshot, package-manager/monorepo signals, and commit-pinned source evidence for at least two HTTP/data/cache/message pattern kinds. Every prior-tuning/leakage state remains `unknown-needs-human-check`; the artifact authorizes neither final selection nor freeze. Candidate discovery required no paid provider, while later provider billing and execution gates remain separate.

## Reviewer rules

- A component is an independently meaningful runtime/deployment unit with a stable repository anchor. A folder alone is not enough.
- A relationship requires observable evidence for source, target, and type. Imports that stay inside a component are negative examples.
- A violation requires an applicable frozen rule and exact evidence; suspicious code without a matching rule is not automatically a violation.
- An evolution is a real topology change that is not forbidden and therefore requires review.
- No-impact means no architecture node/edge/rule change in the scoped case.
- Use Unknown when dynamic construction, wrapper indirection, generated code, missing context, or ambiguous ownership prevents a defensible label. Do not guess.

Positive example: a bound `pg.Pool` call from `frontend/src/database.ts:4` to the approved database is a data relationship; it is a violation only if the frozen rule forbids that edge. Negative example: a local object exposing a `query()` method is not PostgreSQL evidence. Unknown example: a framework wrapper resolves a target solely from runtime dependency injection and the frozen source scope has no binding.

Each item must have exactly two distinct blind reviewer rows, source file/line, confidence 0–1, and `saw_prediction=false`. Use immutable raw JSONL files. Adjudication appends a final row; it never overwrites either reviewer.

The annotation validator checks declared IDs, labels and fields, not the real
identity, implementation independence, actual blinding or scientific correctness
of a reviewer. Two different strings and `saw_prediction=false` do not prove two
independent people. The coordinator must retain the real role/exposure
declarations and review evidence required by the approved protocol. A source
file/line supplied in a row is not automatically checked against the source
snapshot by this structural validator.

For the separate mechanical source check, use
[`verifyAnnotationSourceEvidence`](../scripts/lib/holdout-annotation-source.mjs).
It accepts one repository's full capture manifest and a separately retained
reviewed capture digest, the complete tracked file bytes, and both reviewer
rows. Each row additionally requires `repository_id` and `repository_commit`
matching that exact capture. The existing minimal annotation templates remain
structural examples, not source-bound or accepted evidence.

```js
import { verifyAnnotationSourceEvidence } from "../scripts/lib/holdout-annotation-source.mjs";

const receipt = verifyAnnotationSourceEvidence({
  annotations: bothReviewerRowsForOneRepository,
  captureManifest: reviewedCaptureManifest,
  expectedCaptureSha256: separatelyRetainedReviewedDigest,
  trackedEntries: completeCapturedFiles, // [{ path, content: Buffer }, ...]
});
```

This read-only API performs no fetch, analyzer run, approval or write. It checks
all captured paths/bytes against the tree SHA-256 and retained Git blob IDs,
then requires exact case-sensitive cited paths within the declared scope and
existing physical lines in valid UTF-8 text. LF, CRLF, CR, U+2028 and U+2029
are supported, matching TypeScript's line boundaries;
empty files have zero physical lines and a terminal newline does not create an
extra citable line. Binary/invalid text, wrong commits, missing/extra/changed
files, unsafe/out-of-scope paths, oversized captures and invalid rows fail
closed. Collect complete bytes through the trusted, inspected capture under
exclusive coordinator control, not by executing repository code or following
unreviewed filesystem paths.

The receipt binds the capture digest and the parsed annotation array serialized
as two-space JSON plus a final newline. That hash is not a hash of the original
JSONL file; retain the untouched original annotation file and its separate hash
in the governed freeze. The receipt contains locations and hashes, not copied
labels or snippets; handle it under the same private-data policy as the packet.

`SOURCE_LOCATIONS_VERIFIED` means only source-location consistency with supplied
reviewed inputs. It does not independently establish that a Git commit came
from the claimed upstream, that reviewers are independent/blind, that the
referenced line supports a label, or that the inspection is complete enough to
measure recall. These need the capture provenance and actual human review.
`research_closure` stays false. The legacy structural/adjudication/freeze
helpers do not automatically invoke this API; a reviewed final orchestration
must require this check before accepting a source-grounded packet. No current
D3 or research gate is opened by adding it. Controlled in-memory and local-Git
tests are engineering fixtures only, not D3 or measured research accuracy.

The `holdout` validation library provides manifest, URL/commit/scope/tree/license pin materialization, dual-review, immutable adjudication, freeze, exact two-pass replay, metric, error-taxonomy, and scalability/oracle checks at 100% line/branch/function coverage. The materialization API accepts separately injected clone and inspect adapters; [`createGitRepositoryAdapters`](../scripts/lib/holdout-repository.mjs) supplies the Git implementation. It never substitutes a mutable branch for the full commit. Templates are intentionally incomplete so they cannot be mistaken for frozen evidence.

## Repository capture preparation (EVAL-103)

After EVAL-101/EVAL-102 approval, a coordinator can inject `createGitRepositoryAdapters({workspaceRoot, gitExecutable, packageManager})` into `materializeRepositoryPin(repository, adapters)`. The workspace and executable paths must be absolute. The package-manager descriptor names `npm`, `pnpm`, or `yarn` and an approved host executable; optional `arguments` support running an installed package-manager JavaScript entrypoint through an absolute Node executable. The adapter probes `--version` outside the source tree and records the running Node version, platform and architecture. These host executables and the optional `run` transport seam are trusted infrastructure and must never come from the selected repository. No package installation or repository script runs.

For the initial approved capture, call `adapters.clone({url, commit, scope})`, then `adapters.inspect(checkout, {url, commit, scope, license_file})`, and preserve the returned observation as a proposed pin for review. This records evidence; it grants no selection, license, freeze, or execution approval. Later `materializeRepositoryPin` compares the observation with the reviewed complete pin. The adapter accepts only canonical HTTPS GitHub repository URLs and full 40-character commits, fetches that exact commit into a private bare object store, and materializes raw Git blobs without checkout hooks, filters, or attributes. The returned checkout contains only tracked regular files, with no `.git` directory. Retain its sibling object store and capture observation according to the approved provenance policy.

The tree SHA-256 covers **all tracked file bytes and paths in the commit**, including files outside the selected scope. The scope must name a nonempty tracked directory; the license must be a tracked regular file. Records use UTF-8 byte ordering, independent of locale, and hash `path + NUL + file_sha256`, joined by newline. This makes the previously locale-dependent ordering explicit; any future pin must be generated and reviewed with this implementation. The observation also records each Git blob ID and mode. License hashing uses the exact bytes, including line endings and binary bytes. Symlinks, submodules, unsafe/control-character paths, non-NFC names, Git metadata paths and case aliases fail closed across the whole tree. Captures larger than 64 MiB of tracked bytes or 100,000 files are rejected, never truncated; an approved scope/limit design is needed before handling larger repositories.

Inspection rejects missing or extra files/directories, symlinks, hard links, byte changes and POSIX executable-mode changes. Windows does not expose POSIX executable bits; the exact Git mode remains in `tracked_files` provenance there. Keep the private capture workspace under exclusive coordinator control during capture/inspection; these checks are not a sandbox for concurrently executing hostile code. Each repeat clone records its actual retrieval UTC time, which must not predate the original pin, and must match the pinned Node/package-manager versions. An observation cannot silently inherit missing environment or retrieval fields from its expected pin.

`test/holdout-repository.test.mjs` uses only newly created, controlled local Git fixtures through a trusted local transport substitution. Two captures exercise technical repeatability on one host; they are not independent human reproduction. No final candidate was cloned, no license determination was made from fixture bytes, and no EVAL-103 completion is claimed. Remaining requirements are genuine approved selection, reviewed real repository pins/license/environment evidence and independent repeat clone/hash. Candidate inventory, proposed protocol and statistical source linkage remain unchanged.

## Complete pins and repeat capture

[`holdout-repeat-capture.mjs`](../scripts/lib/holdout-repeat-capture.mjs) adds a coordinator for two fresh captures against a complete reviewed pin. `createRepositoryCaptureManifest(pin)` requires the repository ID and SPDX claim plus every field from the Git observation, including the complete tracked-file inventory and all four environment fields (`node`, `package_manager`, `platform`, `arch`). The SPDX claim remains supplied license-review metadata; matching bytes do not make a new legal determination. The inventory must agree with the tree and license hashes, contain the scope, and have unique safe paths with regular Git modes/blob IDs. Unknown, omitted, aliased or inconsistent fields are rejected. The output remains `status: "proposed"` and does not freeze D3.

`serializeRepositoryCaptureManifest(manifest, expectedSha256)` returns canonical UTF-8 JSON text with a trailing newline. Object field order is explicit; tracked paths use UTF-8 byte order. The manifest hash covers the canonical schema/status/repository body, excluding its own hash field. Retain the serialized bytes and their reviewed digest in the approved immutable evidence store. The expected digest must come from separately reviewed inputs, not be recomputed from a replacement manifest at execution time.

After selection and pin-review authorization, call:

```js
const receipt = await repeatRepositoryCapture({
  manifest,
  expectedSha256: reviewedManifestDigest,
  workspaceRoot: canonicalPrivateScratchDirectory,
  authorizeCapture: approvedCaptureService,
  createAdapters: ({ workspaceRoot }) => createGitRepositoryAdapters({
    workspaceRoot,
    gitExecutable: approvedHostGit,
    packageManager: approvedHostPackageManager,
  }),
});
```

The trusted `authorizeCapture` callback receives a copy of the exact canonical manifest and must return the boolean `true` only for an actually permitted capture. Missing authorization stops before creating a workspace or calling the adapter factory. This callback is an integration boundary, not an implemented human-approval service. The factory receives a different owned workspace for each attempt; reusing an adapter or returning a checkout outside that workspace is rejected. The two attempts each fetch and inspect independently through their new adapter. They compare URL/commit/scope/tree/license, Node/package manager, platform/architecture and every tracked path/mode/blob/SHA. Their actual retrieval times must not predate the pin; different later times are retained without pretending they are equal.

Both attempts are retained even after a capture or comparison failure. Well-formed mismatching observations remain available; malformed observations and operation failures retain their stage and a bounded failure code without raw exception text or host paths. A receipt is `MATCHED` only if both attempts match, otherwise `BLOCKED`. Its SHA-256 covers canonical receipt JSON excluding its own hash field. The coordinator removes its temporary clones/object stores. If cleanup fails, the receipt is always `BLOCKED`, retains both attempt journals, and records only `HOLDOUT_REPEAT_CLEANUP_FAILED`; the coordinator must recover its own remaining scratch directory before retrying. The original reviewed capture and durable manifest/receipt storage remain the caller's responsibility under DATA-101. Keep the scratch directory under exclusive coordinator control; neither the factory nor the authorization callback may come from repository content.

The controlled local Git tests cover moved branch tips, complete manifest tampering, distinct capture workspaces, exact environment/mode/blob drift, malformed/missing observations, transport/byte failures, unauthorized requests and path escapes. This provides an executable repeat-capture procedure for the independent operator. Two automated runs on one host are still technical repeatability, not proof of independent human reproduction or final-system provenance.

`pnpm holdout:candidates:verify` fail-closes the ten-record inventory on unsupported or non-permissive licenses, mutable evidence links, incomplete GitHub metadata, inactive/fork status, missing package topology, insufficient pattern evidence, or any accidental selection/freeze authority. `pnpm holdout:verify` verifies the proposed execution scaffold. `pnpm holdout:gate` is the execution closure gate and intentionally exits non-zero with `HOLDOUT_GATE_INCOMPLETE` until the manifest is human-approved and frozen, contains 2–3 complete non-tuning repository pins, binds adjudicated ground truth, and is accompanied by exact Core/Guardian package pins. The double-run harness independently revalidates every repository pin and frozen artifact before calling the analyzer exactly twice; mismatch, invalid output, or nondeterminism is retained and blocks a deterministic result. Before computing a runnable freeze, include `run_context: { packages, environment }` in the manifest, using the exact Core/Guardian package records and execution environment supplied to the harness. The freeze hash then binds those inputs; absent or different run context is rejected before any analyzer call. Input snapshots prevent a caller from changing the verified freeze or execution metadata between awaited runs. Existing proposed templates remain unchanged and closed. Earlier manifests without run context remain readable/verifiable as artifact freezes, but cannot authorize this execution API; no accepted D3 freeze currently exists.

Metric rows carry repository and node/edge/rule units. Pooled and per-repository precision/recall/F1, classification, rule matching, and exact file/line evidence expose numerator and denominator. Root-cause analysis accepts only wrapper, dynamic endpoint, alias, dependency injection, monorepo, generated code, unsupported library, or mapping ambiguity with evidence and an explicit fix/limitation/out-of-scope action. Scalability summaries require 2–3 repositories, at least two environments, and both full and incremental samples per repository; CPU, memory, file/parsed scope, component count, oracle agreement, and failures remain visible. Completed samples require an explicit boolean oracle result; failed samples must not claim an oracle match. Missing oracle evidence is rejected rather than converted into an observed mismatch.

## Replay and metric output schema 2

The replay and metric result objects now emit `schema_version: 2`. This is an
explicit correction to preparatory software, not a replacement of frozen
research evidence or an authorization to run D3. Source/freeze manifest schemas
are unchanged. Downstream consumers must check the result schema before use.

- Any failed repository attempt produces `BLOCKED_ANALYZER_FAILURE`, including
  when both attempts fail with the same error class. `failed_runs` counts failed
  repository attempts, not distinct repositories. `normalized_records_match`
  reports only whether the retained normalized hashes match; matching simplified
  error records do not establish reproducible successful analysis.
- `deterministic: true` and a non-null `normalized_replay_sha256` require every
  attempt to complete and both runs to match. Successful but different outputs
  produce `BLOCKED_NONDETERMINISTIC`. All attempts remain in the receipt. Even
  `PREPARATORY_REPLAY_COMPLETE` proves only replay under these supplied inputs,
  not label accuracy, independent annotation or publication readiness.
- Each analyzer return is copied immediately so a reused mutable output object
  cannot rewrite retained earlier evidence after its hash has been calculated.
- Exact line evidence requires a non-failed prediction, the correct file **and**
  the correct line. Matching line 12 in the wrong file earns no location credit.
  Every `evidence_required` row, including failed predictions, stays in that
  denominator. Zero denominators remain `null`, not perfect scores.

These helpers consume caller-supplied metric flags, not independently verified
labels. Their classification summary is per input metric row across the declared
node/edge/rule units; it must not be reported as change-case accuracy when one
change produces multiple rows. A case-level analysis requires a separately
specified unique case population in the frozen analysis plan.

The regression tests demonstrating these corrections use explicitly synthetic
software fixtures. They are not D3 observations and do not improve or replace
the paper's empirical results. Existing D1/D2/Phase 3 evidence stays unchanged.
