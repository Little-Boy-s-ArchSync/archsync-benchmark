# D3 portable source-tree preflight

Status: public-Git path and mode audit only. This does not construct a runnable
tree, select a historical project configuration, review a rule, create a truth
label, run a study tool, or estimate comparative performance.

The `receipt.json` is rebuilt from the exact 93 selected public commit IDs in
the upstream commit audit. For every commit it verifies the offline commit
object, root tree and ordered parents, then enumerates exact Git tree paths.
Regular files, symlinks and potential Windows-path hazards are recorded.
Symlinks are identified only by their Git blob IDs; their targets are not
followed or materialized. Case-fold collisions, reserved device names,
forbidden characters and long paths are surfaced for a later versioned
tree-construction decision. A clean path scan would not, by itself, mean that
dependency resolution or either D3 tool is ready.

The retained source-only scan found 128,656 **regular-file occurrences across 93
commit trees**, not 128,656 distinct files or observations; 32 symlink
occurrences were not followed and no incompatible path was identified by the
declared conservative checks. Its raw `receipt.json` SHA-256 is
`09c60fe18a12e5bd5292e360ec50c9a402afbd62378be9499e396a3e8c19bfee`.
No source tree was materialized and no prediction was executed. The audit does
not prove that a Windows checkout, TypeScript resolver or study tool will work.

Use complete local bare copies of the three public repositories. The auditor
disables Git lazy fetching, replacement objects and external protocols:

```text
node scripts/d3-review/portable-tree-audit.mjs --check holdout/d3-portable-tree-preflight-20260928/receipt.json <hyperdx-bare-git> <reactive-resume-bare-git> <etherpad-bare-git>
```

This preflight must not be interpreted as permission to materialize or execute
upstream code. A later accepted method needs to state how every nonregular,
unsupported or missing source is handled before identical tool inputs can be
claimed. The original 152 rule-applicability decisions and two author review
inventories remain separate and unfilled.
