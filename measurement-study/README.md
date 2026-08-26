# A–B–C–D measurement-study infrastructure

Status: **technical dry-run only — no participant, agent, pilot, or final-study result**.

The task suite keeps the baseline, feature sequence, expected behavior and acceptance commands outside the treatment configuration. A is Human, B is AI, C is AI+repository context and D is AI+repository context+ArchSync evidence. The committed tasks exercise the instrumentation on the existing Order Platform lab; they are not a frozen final sample and cannot establish productivity or drift claims.

The library validates immutable task IDs, A–D treatment isolation, proposed/frozen manifests, complete event envelopes, failure-retaining metric denominators, five-condition multi-source ablation design and deterministic normalized analysis artifacts. `pnpm study:verify` performs a synthetic A–D logging dry run with no model or participant.

Every event payload must contain the artifact it claims to record. Run start binds environment, task-suite and study-manifest hashes; baseline binds commit/tree; AI conditions bind redacted prompt/response/provider-configuration artifacts; submission binds a non-empty commit chain and acceptance commands; test records bind commands to results and counts; finish records status, time, usage, counts, deviations and end time. Empty placeholder payloads fail.

STUDY-104 descriptive metric preparation is pinned to Paper PR #17 and the proposed STAT-101 file/hash in `statistical-plan-source.json`. Outputs retain assigned and analyzed `n`, status counts, explicit numerator/denominator/value triples, Wilson intervals for binary proportions, and observed median/IQR duration summaries. This linkage is preparatory: STAT-101 is not preregistered or frozen, so the helper makes no population or experimental claim.

Main execution remains blocked by EXP-103, STAT-101, PILOT-101, ETH-101 and DATA-101. A frozen manifest requires separate human ethics, data and Lead approvals. Pilot data must remain outside the final sample, and failed/inconclusive runs must remain in the dataset.
