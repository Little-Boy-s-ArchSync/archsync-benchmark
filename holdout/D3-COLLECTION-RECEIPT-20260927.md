# D3 source collection receipt

Observed on 2026-09-27, 09:54:12 to 09:55:27 UTC. This is source preparation,
not a completed independent holdout or an accuracy measurement.

## Original regular-file collection (retained unchanged)

| Repository | Pinned commit | Complete tracked files | Scoped TypeScript files | Proposed review files | Outcome |
| --- | --- | ---: | ---: | ---: | --- |
| hyperdxio/hyperdx | e0d2932802bf1b315b420a8a4214a6c0691a7835 | 1699 | 268 | 167 | Full source captured and bytes verified |
| amruthpillai/reactive-resume | 3c195dc3f8db5ccae4aa4aff0cefe54980c02b74 | Not captured | Not measured | Not measured | Existing capture adapter rejected a symlink |
| ether/etherpad | d85d254ac093dc0801188fd954751c33b181e45c | 1136 | 133 | 133 | Full source captured and bytes verified |

HyperDX's retained source is 40,149,703 bytes; Etherpad's is 16,456,322 bytes.
Their proposed non-test TypeScript populations have 42,762 and 23,475 physical
lines respectively. Physical lines include comments and blanks; these are not
logical source-line counts, architecture observations, or independent samples.
The path-based proposed exclusions are retained alongside included files and
must be reviewed before freezing any scientific denominator.

The GitHub tree API for Reactive Resume at the exact selected commit returned
`truncated: false` and one nonregular tracked entry: `CLAUDE.md`, mode `120000`,
blob `47dc3e3d863cfb5727b87d785d09abf9743c0a72`. The original collection receipt
retains `HOLDOUT_CAPTURE_UNSAFE_TRACKED_ENTRY`. This is a capture limitation,
not an ArchSync analysis failure, and no replacement repository was selected.
Do not delete this entry from the tree, relabel its mode, or call a partial
capture a complete one. The append-only recovery below preserves link bytes
without following them in a separate preparatory format; it does not rewrite
the original failure or grant scientific execution approval.

## Provenance

- Baseline Benchmark commit: `5e6db8b7ac0d0c7e8c0d4ffd8732a5889dab7535`.
- Selection plan SHA-256: `7f146571d652f6eeaf6f07633c4e7df5d053361517dacbe6803d901393dfbc32`.
- Collection script SHA-256: `cf3d65bac5e0e30a488dbfd828284027470053da910eec1365fd3072b2d86489`.
- Collection summary SHA-256: `8620ac86f19cf8cef71d83188753a6cc4d138d0f0617a78267f89996d0461c87`.
- Packet verification receipt SHA-256: `6322d0a959b9fcc45d2d3cc325263cbe4871a98a12496f58b14fef0cd444a071`.
- HyperDX capture-manifest digest: `bf87e6279a545c73943233db1d44aa2464f743ce65d6cb954d0fc473998b00e6`.
- Etherpad capture-manifest digest: `4d27809052aae411792920a3360434474976659b0fa02cf01ca4c86e3d105763`.

The private working packet is in the workspace's
`private-evidence/d3-source-preparation-20260927-01/` directory. Each successful
repository retains raw source, its Git object store, full capture manifest,
source inventory and two separate blank reviewer ledgers/observation files.
No identity, decision, confidence, blinding declaration or approval was supplied
for either reviewer. Metadata are not a substitute for independently held truth.

Verification reread every retained regular file, checked SHA-256 and Git blob
identity, rejected unexpected/missing files, reconciled the TypeScript file
population, and independently counted physical line boundaries. The focused
44-test preparation/holdout suite passed on Node 22.16.0/Windows. These tests
exercise software behavior, not D3 accuracy. The existing official execution
gate still rejects the uncompleted frozen dataset, labels and approval inputs.

## Reproduce the read-only packet check

From this worktree, run:

```powershell
node scripts/verify-d3-preparation.mjs "D:\Little Boys\ArchSync\private-evidence\d3-source-preparation-20260927-01"
```

Do not use `--write-packets` on the existing packet: it refuses to overwrite
reviewer files. Keep originals and append revisions as new versions.

The original plan, the proposed scientific protocol and frozen D1/D2/P3
evidence are unchanged. No analyzer or comparator prediction was produced on
these sources. D3 completion and manuscript-result updates remain outstanding.

## Real history candidates retained separately

The history collector subsequently retained the first 20 API-returned commits
touching each pinned backend scope, 60 metadata records in total. All have one
parent in the retained response. The raw API bytes, order, commit/parent IDs,
retrieval times and hashes are retained; an offline verifier reconciled each
normalized row to the original response. These are candidate historical changes,
not 60 independently labelled cases or 60 completed executions. Base/head source
snapshots for these pairs are not yet captured. Five-entry metadata previews
preceded the recorded sampling plan and are disclosed in it; no tool predictions
were inspected and this sequence is not described as blind preregistration.

Packet: `private-evidence/d3-history-preparation-20260927-01/`.
History summary SHA-256:
`3b70ff1d7231826381922ee0186af793da1f6d839802c906cb562ca910dde109`.

```powershell
node scripts/verify-d3-history.mjs "D:\Little Boys\ArchSync\private-evidence\d3-history-preparation-20260927-01"
```

## Reactive Resume append-only object recovery

On 2026-09-27, 10:15:26 to 10:16:24 UTC, the new preparatory object collector
fetched the same selected commit, without substitution, source execution or
checkout. It retained 1,445 tracked entries (1,444 regular files and one
symlink), representing 43,532,114 tracked bytes. The `CLAUDE.md` symlink's
nine bytes are retained by Git blob ID, never dereferenced. There are 33 scoped
TypeScript files and 22 proposed non-test/declaration review files. Combined
with the original two captures, the proposed review workload is 322 files;
this is not 322 labelled observations or experimental cases.

The separate `d3-git-object-packet/1` manifest records modes, original paths,
blob IDs and SHA-256 digests. Verification recomputed the selected Git commit
object ID, recursively verified every raw tree object from the root tree,
matched the full listing to that tree, and checked every referenced blob and
the absence of extra/missing objects. It did not judge any architecture label.
The new format still needs independent technical review before becoming a
frozen experiment input; it is not accepted by the old regular-file manifest
API and must not be passed off as one.

- Packet: `private-evidence/d3-reactive-resume-objects-20260927-01/`.
- Manifest SHA-256: `7868ba025ebf1ddca3238458fc9170b4edcde905715a1304bfa4e2c1feda6e55`.
- Verification receipt SHA-256: `84dd33a9b8de8b5e0771c57bbea0005a36463d0b89a68b45daf83cb60107911d`.

```powershell
node scripts/capture-d3-object-packet.mjs verify "D:\Little Boys\ArchSync\private-evidence\d3-reactive-resume-objects-20260927-01"
```

Five additional controlled engineering tests cover link preservation without
dereference, modified/extra blobs, relabelled links, altered commit/tree bytes,
malformed objects, submodules, traversal, duplicate entries and size limits.
They are not research examples and cannot enter D3 accuracy denominators.

## Final local engineering verification

On 2026-09-27, the final source-preparation implementation passed the complete
normal `pnpm verify` command on Node 22.16.0 and pnpm 11.16.0/Windows, including
193 unit tests (193 pass, zero fail/skip) and the repository's configured
library-coverage gate. The coverage target is `scripts/lib/*.mjs`; it is not
an accuracy measurement and does not assert full line coverage of the new
top-level collectors. The source/object/history packet checks were rerun
successfully against the retained real artifacts. Hosted CI, independent
technical review, final data selection, real annotation, statistical-plan
freeze and D3 tool execution are not claimed by this local verification.
