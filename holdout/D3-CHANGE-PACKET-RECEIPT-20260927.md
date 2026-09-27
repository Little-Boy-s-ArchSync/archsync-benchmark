# D3 real historical change collection receipt

This is verified source preparation, not a completed D3 evaluation. No
architecture decisions, independent human labels or analyzer predictions were
produced. Collection began at 2026-09-27T10:26:31.664Z and the first complete
offline verification finished at 2026-09-27T10:28:31.511Z.

## Retained source changes

| Repository | Candidate pairs captured and verified | Backend path occurrences | Distinct backend paths | Distinct base/head revisions | Head commit window (UTC) |
| --- | ---: | ---: | ---: | ---: | --- |
| hyperdxio/hyperdx | 20 | 110 | 81 | 31 | 2026-08-18 to 2026-08-24 |
| amruthpillai/reactive-resume | 20 | 65 | 31 | 38 | 2026-07-08 to 2026-08-20 |
| ether/etherpad | 20 | 39 | 26 | 30 | 2026-06-17 to 2026-08-21 |

All 60 preselected candidate pairs were retained, with zero collection failures
and no empty backend diff. There are 214 changed-path occurrences, 138 distinct
repository-qualified paths and 99 distinct repository-qualified endpoint
revisions. Of the 214 occurrences, 213 have `.ts`/`.tsx` paths, including tests.
These are collection descriptors, not 60 independent observations, 214 edges,
accuracy denominators or proof of scientific adequacy. The sample is purposive,
commit windows differ, and revisions/files overlap. A three-repository sample
cannot establish general performance over all TypeScript systems.

## Checks actually performed

- Reconciled candidate IDs and parent metadata with the retained original
  provider responses, without message/outcome filtering or replacement.
- Retrieved every selected head and recorded parent into private bare Git
  stores; no project checkout, script execution or dependency installation.
- Checked Git commit IDs and actual parent links. Offline `git fsck --strict`
  passed for all three stores.
- Regenerated every full tree listing, whole-repository diff and backend diff
  from retained Git objects and matched the saved bytes.
- Verified changed source blobs by Git object ID and SHA-256; preserved modes,
  additions, deletions and changes instead of inferring architecture meaning.
- Compared every head's actual Git committer timestamp with the API metadata.
- Checked the root LICENSE entry across all 120 base/head appearances. Each
  repository has one unchanged license blob across those appearances:
  HyperDX `295e7dfdf4e5702c54af5fbab42db890c958fb7c` (MIT header), Reactive Resume
  `474c93d9dc3f213c2fd6d735162777f6e9022021` (MIT header), and Etherpad
  `366aa1a47ada71731706b5c1a2bb0933438f4d02` (Apache License 2.0 header).
  Original license content remains in each Git store; no new licensing grant
  or general legal assurance is inferred from this metadata check.

## Artifacts and reproducibility

Packet: `private-evidence/d3-change-packets-20260927-01/`.

- Change summary SHA-256: `70cecbb9d6839ba397465e49ff1854d04629032e7b80e08f8d934ac6aa011a0a`.
- Collector SHA-256 recorded before fetch: `cbae955f023b6f343f8c1fc2b481ac47cf837f6379c89951cbd05aa08c4cc4c8`.
- Source profile SHA-256: `282655115c1ecc254f2c69f0695550b31dabb80c3cca105fc3d0ab88c92b81cc`.
- Retained second offline verification SHA-256: `e4663ce8aada79daa0975cc9513c024f38955202bad81c083a5310cb96342fb0`.
- Each blank reviewer case worksheet SHA-256: `9ea46d719920e28652c88f9cf5ba85644a0bbf137a50b78840b0ccf4bbc49679`.

Recorded environment: Node 22.16.0, Git 2.53.0.windows.1, Windows x64.

```powershell
node scripts/prepare-d3-change-packets.mjs verify "D:\Little Boys\ArchSync\private-evidence\d3-change-packets-20260927-01" "C:\Program Files\Git\cmd\git.exe"
```

The `review-preparation` folder contains a 60-row case index for each of two
reviewers. Identity, timestamp, decision, rationale, evidence, confidence,
prediction-exposure and AI-assistance fields are all blank. Identical worksheet
hashes reflect identical empty preparation, not agreement between reviewers.
The worksheet does not replace the governed graph/case annotation artifacts.

## Scientific state remains incomplete

Final selection and leakage review, true role/exposure declarations, accepted
rubric and architecture contracts, independently performed annotation,
adjudication, statistical-plan/tool-input freeze, matched comparator execution,
per-repository error analysis and research result audit remain outstanding.
The current paper candidate `f3e5c8ad8471ce871b6f25573ba68f20e4a531dc` still
correctly states that an independent holdout and accepted external comparison
are missing. Source collection does not justify removing those limitations.

## Local software validation

The complete normal `pnpm verify` command passed after these additions, with
199 unit tests passing and zero failed/skipped tests. Six new controlled
engineering tests exercise diff parsing, retained modes/parents, unsafe-input
rejection, fixed diff options, UTC timestamp handling and blank human fields.
The configured library-coverage gate passed; it does not measure every line
of the top-level collectors. The real offline packet verification supplies
the separate integration evidence above. Hosted CI and independent code review
have not been claimed. A separate `pnpm holdout:gate` still fails as expected
for the unfrozen manifest, approved pins, human approval, ground truth, tool
package pins and statistical plan. That failure must not be bypassed or
reported as a completed D3 experiment.
