# D3 file-side configuration review queue

Status: source-configuration **candidates**, not an accepted D3 execution
method, label, prediction or result. This queue derives exactly 300 primary
file-side rows from the pinned 112 case-side configuration inventory. It does
not expand the 56 selected cases or treat the four context-only cases as
negatives.

`file-side-review-queue.json` is a deterministic view of the previously
verified Git-object census, with each candidate's historical path, Git blob
and SHA-256. `nearest_compiler_config_candidates_by_directory_only` helps
reviewers locate relevant files; directory proximity does **not** establish
which compiler project, build variant, `extends` chain or workspace map either
tool actually used. The config census also does not verify whether a primary
source path was present on that side; `source_presence` remains explicitly
unverified, including for paths absent in the separate source checklist.
HyperDX, for example, has three competing
`packages/api/tsconfig*.json` files at the same directory depth. All
`effective_project_config`, `resolved_extends_chain`,
`package_workspace_resolution` and `review_evidence` fields remain `null`,
and all 300 rows remain `unreviewed`.

Hiếu and Hoàng must each inspect exact historical source/config bytes before
agreeing a separate versioned project-configuration decision. Preserve this
blank queue unchanged; put reviewed decisions in a new artifact with explicit
source evidence and record unsupported or ambiguous cases. This queue does
not close the comparator-configuration, package-resolution, applicability,
source-truth or method-freeze gates. Do not run either tool on D3 from it.

Verify from the pinned inventory:

```sh
node scripts/d3-review/config-review-queue.mjs verify holdout/d3-project-config-preparation/inventory.json holdout/d3-project-config-preparation/file-side-review-queue.json
```
