# D3 module-edge truth rubric

**Preparation amendment:** Read [method packet v0.1.0](D3-METHOD-PACKET.v0.1.0.md) before labeling. It proposes the module occurrence/edge endpoint, explicit Unknown/scoring scope, resolver freeze and joint acceptance. Conflicting legacy case-classification instructions are historical; no method acceptance is asserted.

Version 0.1.0, 2026-09-28. Status: **candidate method before official annotation and inference**. This narrows `D3-CASE-RUBRIC.v0.2.0.md`; it does not reclassify any existing review or authorize a tool run. Its case population is pinned by `cases.json` SHA-256 `44cc064a3555c90cc20d2a38ab61d67c6af598c1825bf5290cca2269ec801d35`.

## Unit and reading boundary

The primary truth unit is one direct module-dependency **occurrence** in a scoped production source file on a specific repository, case, base/head side and immutable commit. A second, derived unit is a deduplicated module-group edge. Do not equate an import with an inter-service HTTP/data/cache/message relation or an upstream architecture violation.

For each of the 56 primary cases, read every changed path marked `primary-candidate`, its base/head source and the unchanged source/configuration needed for resolution. The four context-only cases remain in the disposition record and are not negative examples. Keep Etherpad H019 `tar.json` as required non-TypeScript context, not a dependency occurrence. Maintain a coverage record of every eligible file examined, including files with **zero** relevant occurrences; a positive quote alone cannot establish a negative result.

Eligible syntax is an ES value import/re-export, literal CommonJS `require`, or literal dynamic `import`. Explicit type-only references, tests, generated/vendor files and computed specifiers are excluded or Unknown according to the frozen common-capability mapping. For a mixed import, record which bindings are runtime values. A package-name import is not a source-group edge until the exact package-export/path resolution at that commit is established. Never execute upstream source or configuration to infer a target. A symlink is a Git object, not permission to traverse it.

Each proposed truth occurrence must record:

- repository, case ID, side, full commit, source path, physical line and column, short literal source quote, and syntax kind;
- literal specifier, resolved target path/package subpath if supported, source and target module groups, and the exact resolver/config evidence;
- disposition `resolved`, `unresolved`, `unsupported`, or `out-of-scope`, with a reason for any non-resolved disposition;
- source bytes/blob hash and AI suggestion reference, input scope, sharing and actual human verification extent.

An occurrence without an identifiable target remains Unknown. An occurrence whose target is outside the frozen mapping remains explicitly unmapped, not silently cast as a rule violation or a true negative. Preserve duplicate syntax occurrences, then derive deduplicated edges using a predeclared key `(repository, case, side, source group, dependency type, target group)`; also retain file-level endpoints separately so group aggregation cannot hide localization errors. When the same group edge exists on both sides, a changed import statement is not automatically an added group edge.

## Two author-associated reviews

Hiếu and Hoàng may use AI to inspect all source and propose complete occurrence inventories. They are both development-associated and have disclosed earlier D3 output exposure; the review is **nonblind and exploratory**. Keep each original source review, AI suggestion/provenance, raw bytes and SHA-256 before comparison. If they use or share the same AI answer, report the dependence and do not call their agreement independent. A source quote from AI must be checked against the pinned commit/path/line. Compute original agreement before joint reconciliation; unresolved differences remain Unknown, not forced to a preferred tool outcome.

No ArchSync or dependency-cruiser D3 output may be used as truth. Prior exposure cannot be undone; note its uncertain extent. A tool result may be consulted only after original truth records and the analysis configuration are sealed, and its influence on any later amendment must be disclosed.

## Matching and reporting

Freeze both tool packages, source-tree construction, resolver options, component mapping, source filter, edge key and matching code before reading new D3 outputs. Compare exact resolved occurrence/edge keys in the common supported subset. An extra predicted edge is FP; a missed reviewed edge is FN; a matching edge is TP. Precision, recall and F1 are **not estimable** when their denominators are zero. Cases with unresolved truth are not converted to correct negatives. Separately report attempted, completed, unsupported, failed, truth-Unknown and scored counts, first for each repository and then, if useful, pooled. Keep failures in all-attempted coverage and report a conservative all-attempted success count alongside conditional scores.

The four conditionally selected module restrictions are a **secondary** analysis. Only after historical rule applicability and relevant base/head edges are verified may a case be called an introduced rule violation. An unchanged pre-existing violation is not introduced. If the selected cases produce no introduced positives, positive-class recall is not estimable; do not use all-negative accuracy as evidence that the tool detects violations. `evolution` and whole-architecture `no-impact` are outside this narrow truth rubric unless a separate exhaustive topology census and contract are approved before tool output.

This rubric does not claim developer-independent labels, external validity, statistical significance or superiority over a baseline. The paper's contribution comparison must distinguish an externally published tool's **capabilities** from measured results on this frozen common task, and report disadvantages and unsupported behavior as carefully as advantages.
