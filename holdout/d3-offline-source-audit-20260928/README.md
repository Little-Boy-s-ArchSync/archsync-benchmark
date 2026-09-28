# D3 offline historical source audit

This is a source-input corroboration, not a D3 review, frozen method, tool run,
label or performance result. It cross-checks the selected 93 public commit,
root-tree and ordered-parent identities from the merged upstream receipt, then
checks the complete tracked tree and offline availability of every referenced
Git blob. The 300 selected file-sides are independently matched to the bare
clones by path, mode, Git blob ID and source SHA-256. Absent sides remain absent.

The source trees contain a Reactive Resume `CLAUDE.md` symlink on 32 selected
commits. The audit counts its Git mode and blob but never dereferences or
materializes it. Tool execution still requires a separate, safe and documented
case-side tree-construction method and effective project configuration. The
audit neither installs dependencies nor executes upstream code, ArchSync or
dependency-cruiser. It does not establish truth-label completeness, rule
applicability, author agreement, external validity or comparative accuracy.

To reproduce, create three public bare clones with full blob data, for example
by cloning with `--bare --filter=blob:none` and subsequently running
`git --git-dir=<clone> fetch --refetch --no-filter origin`. The verifier sets
`GIT_NO_LAZY_FETCH=1`, so it fails rather than quietly downloading a missing
source object during verification. From the Benchmark repository, run:

```text
node scripts/d3-review/offline-source-audit.mjs --check holdout/d3-offline-source-audit-20260928/receipt.json "<hyperdx-bare-git>" "<reactive-resume-bare-git>" "<etherpad-bare-git>"
```

`--write` can create a receipt at a **new** path and refuses to overwrite an
existing file. The verifier pins the exact merged upstream receipt and
file-side inventory hashes, compares every object offline, and emits a
deterministic summary without local paths or timestamps. The checked result
therefore supports reproducibility without treating this public source audit
as D3 experimental evidence.
