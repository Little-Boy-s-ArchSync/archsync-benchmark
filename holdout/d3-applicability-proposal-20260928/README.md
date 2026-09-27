# Proposed historical applicability evidence — 2026-09-28

**Source evidence verified; all152 final applicability decisions remain pending both authors.** No human declaration, study acceptance, truth label or D3 prediction is supplied.

- 56 selected cases;152 rule/case/base-head rows;532 exact source quotations.
- 13 distinct anchor source-byte versions;459 retained commit/tree/blob objects establish each quote's path membership at its pinned historical commit.
- 34 Reactive Resume rows have an **unverified AI proposal** of applicability based on historical private-source restrictions.
- 118 HyperDX/Etherpad rows remain **proposed unresolved**: source roles alone do not establish activation of study-defined prohibitions.
- All152 `applicability` fields are null, human verification is pending, and acceptance arrays are empty. Both authors must review the source, resolve scientific applicability, and accept a separately versioned method/ledger hash before these rows support rule findings.

`original-checklist.json` preserves the blank original exactly (SHA-256 `2c20c4694b749e565ebce149385407b808e224ee0f5d5471f4aab1e37a1d979a`). `evidence-ledger.json` SHA-256 is `b9655af035700e12ada897db9c8be3a6d803d17a8a97642a57fca776f746a095`. `AI-ANALYSIS.md` describes actual source reading, suggestions and remaining uncertainty. Suggestions are provided as one shared packet; if both authors use them, disclose dependence instead of calling agreement independent.

Build checks the complete pinned source-transfer manifest before reading retained Git objects. It neither checks out upstream source nor runs scripts, detectors or network retrieval. Every retained object is verified by Git object identity; commit-rooted tree traversal proves the exact historical path and refuses symlinks. Source SHA-256 and physical line quotations must also match the original checklist. All13 source versions are available in this transfer's Git object packet, including the Reactive Resume historical architecture version; no external retrieval or substitution is needed here. This does not revise older statements about absence from loose/raw source-file inventories.

Verify retained proof locally:

```sh
node scripts/d3-review/proposed-applicability.mjs check holdout/d3-applicability-proposal-20260928
```

Rebuild to a **new** output directory with separately held original packet and review kit:

```sh
node scripts/d3-review/proposed-applicability.mjs build /absolute/original-transfer /absolute/blank-review-kit /absolute/new-output
```

The generator has fixed source/checklist/cases pins and does not overwrite output directories. Production verification rejects any changed original checklist. Developer tests include deliberate corruption and synthetic Git objects; they do not make human decisions. This proposal's schema is intentionally incompatible with `d3-reviewed-applicability/1`; do not turn a structural pass into joint method acceptance or bypass `holdout:gate`.
