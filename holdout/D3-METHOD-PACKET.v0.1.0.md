# D3 module method packet — version 0.1.0

Status: **proposed, preparation only, not accepted or executable**. This packet supersedes conflicting case-classification instructions for the proposed module endpoint; it does not modify source packets, create applicability decisions, labels or results. Hiếu and Hoàng must jointly accept an exact version/hash before official annotation. Existing `d3:review` case worksheets and validators remain legacy and cannot validate module occurrence inventories or complete this freeze.

## Required order and stop conditions

1. Wait for Guardian #17's exact candidate to pass all three hosted OS checks, receive fresh eligible review, and merge. Record the accepted source commit; a development head or green CI alone is insufficient.
2. Test ArchSync and dependency-cruiser against the **same non-D3** fixtures. Record fixture inputs/expected outputs, both actual outputs, mismatches, source/package versions and hashes. Freeze their common capability, configuration and resolver policy. No D3 outcomes may select fixtures or tune implementations. Disclose each author's actual prior exposure and later development separately; leave unconfirmed details explicitly unknown.
3. Finalize this method, the occurrence schema, matching/denominator policy and all 152 conditional-rule case/side applicability records. Jointly accept the exact manifest/version/hash. Then each author separately reviews the 56 primary cases, including eligible files with zero dependencies. Preserve originals and SHA-256 before agreement or reconciliation.
4. Only after tools, configuration and original/adjudicated truth are sealed, execute both tools on identical eligible base/head trees. Preserve failures and all provenance; retain Unknown. No automatic switch to accepted, runnable or complete is introduced here.
5. Update the manuscript only from measured, source-bound results. The existing `holdout:gate` remains a separate closed prerequisite.

## Primary inventory and source boundary

The primary units are (a) direct import/re-export occurrences and (b) deduplicated directed module-group edges in eligible changed production files on each case side. Never describe this as exhaustive whole-repository recall. Four conditional restrictions provide **secondary** introduced-violation descriptions only. Whole-architecture `evolution`/`no-impact` and legacy four-class accuracy are not this endpoint.

Each review contains 56 case envelopes with repository, case ID, base/head commits, method hash and reviewer provenance. Each envelope includes a file-coverage ledger for every eligible changed path/side: commit, path, mode, Git blob, SHA-256, reviewed/excluded/missing status, reason, and occurrence count (including zero). Required unchanged resolver context has its own source records. Each occurrence records side/commit/path, physical start line/column, exact short quote, source blob/SHA-256, syntax, literal specifier, resolved target path and blob/SHA-256, source/target groups, resolver-evidence references, disposition/reason and AI provenance. Do not manufacture records for nonexistent/deleted-side files; record their absence and pinned tree evidence.

Occurrence key: `(repository, case, side, source path, start line, start column, syntax, literal specifier, resolved target path)`. A normalization fixture must prove both tools expose the same physical occurrence positions; if either cannot, occurrence scoring is unsupported for that construct and both tools use only the separately declared common edge task. Edge key: `(repository, case, side, source group, dependency, target group)`, deduplicated once per side; retain the file-level endpoints and all occurrence references. Compare side inventories first; derive additions/removals from sets only where both sides have complete truth. A modified import is not necessarily a newly added edge.

## Resolver/shared-capability decision table to freeze

Every row below needs a concrete selected behavior, non-D3 fixture IDs for both tools, outcome and hashes. Until completed, the policy is unresolved and annotation must not start. This document does not silently choose TypeScript or Node semantics for the authors.

| Dimension | Required frozen decision |
| --- | --- |
| Source eligibility | Exact production prefixes, extensions, test/generated/vendor exclusions, deleted/renamed files, exact-case paths; zero-occurrence coverage |
| ESM | Side-effect/empty-clause imports and exports; runtime bindings; type-only and mixed bindings under the selected `verbatimModuleSyntax` setting |
| Calls | Lexically unshadowed CommonJS `require`; shadowing/hoisting/destructuring; literal dynamic imports including template-literal and import-options policy; computed calls |
| Relative targets | Exact extension/index precedence, TS-to-JS mapping, directory imports, file case, declaration-only targets |
| Project configuration | Selected TS/module-resolution version and mode, nested configs, extends/references, baseUrl/paths and configuration precedence; configuration must be parsed, never executed |
| Packages | Workspace boundaries, exports/imports conditions and subpaths, package.json main/types precedence, builtins/external targets, missing packages and declaration-only resolution |
| Trees and links | Exact base/head Git-tree construction, retained object membership and mode; symlinks remain mode120000 objects and are never traversed; explicit unsupported/unresolved handling |
| Tool normalization | Common directed edge orientation, syntax/location mapping, file-to-group rules, deduplication, unknowns, malformed source and parser errors |

No per-tool private resolution shortcuts, silent fallback, installation scripts or upstream-code execution. Unsupported behavior in either implementation excludes that construct from *both* tools' conditional common-capability score, based on source/config features identified before D3 predictions; retain it in attempted coverage.

## Operational Unknown and scoring scope

Use one disposition per occurrence: `resolved-in-scope`, `resolved-out-of-scope`, `unresolved-target`, `unsupported-syntax-or-resolver`, or `missing-or-conflicting-source`. The last three are truth-Unknown, each with an explicit reason. Out-of-scope targets require positive source/config evidence and a frozen boundary; they are not rule violations or negative examples. A missing resolver decision is Unknown, not an exclusion selected after a prediction.

An occurrence score includes only source-reviewed, common-capability occurrences in **complete file-side partitions**. Any truth-Unknown, unread eligible path or missing required resolver context makes that entire file-side unscorable for occurrence metrics for both tools. Group-edge presence can aggregate across files, so an unknown file-side makes the containing case-side unscorable for group-edge metrics. Case-change and secondary introduced-violation scores require both relevant sides complete; unresolved historical applicability makes the corresponding rule comparison Unknown. Preserve known observations in these partitions for audit, but do not score predictions there as FP/TP/FN. Never convert Unknown truth into agreement because a tool also reports Unknown.

Source-truth Unknown differs from tool failure: once truth/capability eligibility is sealed, a tool crash, unsupported response or malformed output stays a failed attempted run. It is not allowed to remove that source-eligible case from the paired accounting. Report conditional scores for valid outputs plus all-attempted coverage/success, never an invented empty prediction graph for a crash.

## Denominators, matching and zero positives

Keep all60 captured cases: 56 primary attempts and four context-only exclusions, with repository counts19/17/20. Report per repository first: captured, primary eligible, attempted, tool-completed, unsupported, failed, truth-Unknown and scored. These are overlapping dispositions where appropriate (e.g. a case can contain Unknown and a completed run), not categories to sum blindly; publish IDs/sets and definitions. Primary attempted count remains56 per tool; side-run count is separate. Unsupported/failed/Unknown never disappear from attempted coverage.

Within complete common-capability partitions and valid outputs, exact matching gives TP=intersection, FP=prediction minus truth, FN=truth minus prediction. Deduplicate only for the edge task. Preserve occurrence multiplicity. Report truth, prediction, TP/FP/FN counts and denominator counts separately for occurrence and edge tasks. Precision=TP/(TP+FP); recall=TP/(TP+FN); each is null with a reason when its own denominator is zero. F1 is null unless both P and R are estimable; if both are estimable and P+R=0, F1=0, otherwise 2PR/(P+R). Zero truth positives therefore never produce 100% recall.

For paired conditional comparisons, publish the same source-defined eligible set and the intersection of valid-output runs; also report each tool's own valid-output subset without presenting those unequal subsets as a paired comparison. Conservative all-attempted exact-case success = cases with complete truth, valid output and exactly matching edge sets on both sides /56, per tool (per-repository denominators19/17/20). Unknown, unsupported and failed cases are not successes; this operational measure is **not accuracy**, and empty-positive cases must be reported separately. Completion coverage=valid-output attempted cases/56. Positive-class detection claims require positive truth support.

Original agreement: compare the two preserved inventories/coverage/dispositions before adjudication, report union/intersection and exact-match disagreements per repository; do not reuse case-label Cohen's kappa as occurrence agreement. A future categorical agreement statistic requires its own frozen shared universe (including negatives). Adjudication preserves both originals and explicit unresolved differences.

## 152-row applicability contract

Use `D3-APPLICABILITY-LEDGER.v0.1.0.md` and the preparation validator in `scripts/d3-review/method-packet.mjs`. Preserve the blank input unchanged. A structurally valid ledger is neither scientific acceptance nor proof that a restriction was upstream policy. Human source interpretation is required; none is supplied by this packet.

## Freeze/provenance manifest and joint acceptance

A final manifest must enumerate relative artifact paths, role, schema/version and raw-byte SHA-256 for: selected cases/scope and source transfer; all supplementary source receipts/objects; four-rule selection and original contract; reviewed152-row ledger; module rubric and occurrence/file-coverage schemas; resolver decision table; common-capability fixture inputs, expected outputs and actual tool outputs; source/tree construction policy; both tools' accepted source commits/package archives/lockfiles/configuration; group mapping/source filters; normalization/matching/metrics implementation and tests; this analysis policy; annotation/exposure/AI protocol. Pin tool runtime versions and repeat count. Hash immutable artifact bytes, not only reserialized JSON. Archive that manifest externally before reviews; reviews bind its raw SHA-256.

Hiếu **and** Hoàng separately record real reviewer identity, decision, UTC time, retained decision reference, manifest version and SHA-256. Both must accept the same bytes; a changed artifact creates a new manifest version requiring renewed acceptance before dependent work. Do not prefill identities' acceptance, timestamps or review claims. Store original review bytes/hashes and sealing references before comparison; adjudication records reference both originals. Each AI record identifies actual tool/model if known (otherwise unknown), input artifact hashes/scope including prediction exposure, retained output reference+hash, sharing, and actual human verification extent. Shared AI output makes agreement dependent. Both authors are development-associated and nonblind; actual prediction exposure remains an individual factual disclosure and stays unknown where unconfirmed. Never claim externally independent validation.

## Execution receipt and manuscript propagation

Each run records tool/source/package/config/manifest hashes, case/base/head/source-tree identifiers, exact command and environment/runtime, UTC start/end, exit code, raw stdout/stderr and hashes, raw graph/output hash, unsupported/error records and metric implementation hash. Preserve failed originals and all repeat runs; repeats do not increase sample size. A fix after outputs requires a declared post-hoc amendment, preserved original result and revised provenance, not a new untouched holdout claim.

After real results exist, revise Methods (selection, resolution, truth, author/AI exposure), Results (per-repo counts and P/R/F1 with coverage), Discussion (common-capability limits), Threats (nonblind author association, correlated cases, purposive scope), and Abstract (only supported measured claims). Remove future independent-holdout and TV3 wording that this study does not fulfill, replacing it with accurate completed/pending status. Preparation alone changes no manuscript result or research-completion status.
