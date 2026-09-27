# D3 local validation review — 2026-09-27

This follow-up to PR #12 reviews the local preparation code against the D3 review handoff. It supplies software fixes and verification, not completed D3 annotation or research approval.

## Findings resolved

- Two different repository IDs could refer to the same GitHub repository and satisfy the repository-count check. The manifest now requires distinct repository URLs, comparing case-insensitively while retaining the original URL values.
- URL capitalization could bypass the tuning-repository exclusion. The same normalization now applies to that comparison.
- Approval and adjudication timestamps accepted arbitrary nonempty text. They now require the existing strict UTC timestamp format and a valid calendar date.

Both new regression groups fail against baseline `5e6db8b7ac0d0c7e8c0d4ffd8732a5889dab7535` and pass with the fixes. Local Node 22.16.0 / pnpm 11.16.0 verification passes: 186 unit tests, no failures or skips, and 100% required library line/branch/function coverage. The source-bound receipt is `evidence/unit-coverage.json`. Hosted checks and the normal pre-push gate are separately reported on the PR.

## Handoff limits retained

The source-capture and capture-manifest implementation accepts regular Git blob modes 100644/100755. The handoff describes an alternative Reactive Resume capture preserving symlinks; that representation requires technical review before integration. Do not remove symlinks or change the population to bypass verification.

The two collection/change-packet receipts and the claimed 60-case private packet were unavailable in the local workspace. Their hashes, case count, provenance and completeness were not verified in this review. The candidate/scaffold checks validate the existing preparation artifacts, not that missing packet.

The source-location verifier remains an explicitly called mechanical helper. Final orchestration must require it and bind the approved source population, actual role/exposure declarations, original reviewer records, adjudication, analysis plan and execution pins. URL normalization cannot detect renamed repositories, forks or copied code. Valid timestamp syntax does not authenticate approval or establish reviewer independence.

Follow `PROTOCOL.md` and `README.md` for the remaining human and freeze requirements. No source-derived labels, reviewer declarations, D3 predictions, dataset freeze or scientific result were produced by this local review.
