# ArchSync Benchmark

The proposed D3 independent-holdout protocol, blind-review handbook, immutable templates, repository pin/tree/license verifier, adjudication checker, exact two-pass harness, explicit-denominator metrics/error taxonomy, scalability/oracle tooling and synthetic PR-history replay live in [`holdout/`](holdout/) and [`pr-history/`](pr-history/). A separate EVAL-102 artifact ranks exactly ten commit-pinned candidate systems without selecting or freezing any of them; `pnpm holdout:candidates:verify` validates its permissive-license, GitHub provenance, topology, pattern-evidence, and human-gate fields. The scaffolds are technically verified by `pnpm holdout:verify`, `pnpm pr-history:verify` and the 100% unit-coverage gate. `holdout:gate` and `pr-history:gate` remain closed because final repository selection, leakage clearance, ground truth, freeze, approval and real-system extraction require external human action.

ANALYSIS-101 also includes a result-free Jupyter notebook index validated by `pnpm analysis:notebook:verify`; the deterministic Node pipeline remains canonical, so neither Python nor Jupyter is an install/runtime dependency.

The Phase 4 evaluation and Phase 7 measurement-study technical foundations now include a 12-case AI safety regression corpus, canonical Guardian run-manifest adaptation, blind P4-123 rubric/timing, unsupported-claim and repair calculations, config-separated ablation/citation metrics, non-empty A–D instrumentation, pinned STAT-101 linkage, pilot and five-condition ablation evidence schemas, a watermarked synthetic CSV/table/figure pipeline, and an independent reproduction runbook. Run `pnpm ai-eval:verify`, `pnpm study:verify`, `pnpm pilot:verify`, `pnpm ablation:verify`, `pnpm analysis:verify` and `pnpm repl:verify`. Their corresponding `:gate` commands intentionally fail until real provider, participant, pilot, freeze, security, ethics/data and independent-auditor evidence exists.

The proposed Phase 6 runtime fixture foundation lives in [`runtime/`](runtime/README.md). It produces deterministic runtime snapshots, normalized graphs, per-goal scorecards and a deliberately pending approval record. `pnpm runtime:gate` fails closed on eight Phase 5, governance, human, privacy/security and independent non-synthetic validation prerequisites; no ADR approval, architecture acceptance or experimental validation is claimed.

Ground-truth datasets and reproducible architecture-change scenarios for ArchSync.

**Phase 1 foundation:** model, graph and conformance contracts are executable. **Phase 2 analyzer gate:** strengthened and reproducible as v0.2. **Phase 3 PR gate:** Git-diff decisions, baseline caching and component-incremental analysis are reproducible as v0.3. `ground-truth.json` is the canonical end-to-end benchmark manifest.

**Phase 5 preparation:** [`iac/`](iac/) contains a 20-case Terraform,
Kubernetes, identity, conflict, and security corpus pinned to Guardian commit
`de11e48a8f69fbe5cd32f052489a323e1c81eab3`. The preparatory verifier runs it
twice, checks exact source evidence and per-rule metrics, hashes every input and
runtime artifact, and proves the corpus is not modified. This is not a final
research freeze: P4-120, Phase 5 ADR acceptance, independent Security approval,
and human ground-truth freeze remain explicit blockers. `pnpm iac:gate` therefore
fails closed even when `pnpm iac:verify` confirms the technical bundle.
The requirement-by-requirement record is in
[`PHASE5-IAC-AUDIT.md`](PHASE5-IAC-AUDIT.md).

## Order Platform lab

The baseline has exactly five components: frontend, gateway, order-service, payment-service and postgres.

`order-platform/ground-truth.json` defines 20 labeled changes. Every patch is applied independently to the clean baseline and analyzed by the pinned `@archsync/guardian` package.

The expected distribution is:

- 9 no-impact cases
- 7 architecture violations
- 4 valid architecture evolutions that require approval

The separate `typescript-patterns` corpus contains 40 annotated source signals: 20 positives and 20 hard negatives across `fetch`, PostgreSQL, Redis, AMQP publishing and AMQP consumption. It is a development/regression corpus, not an independent external holdout.

Measured on that same frozen corpus, the pinned analyzer versions produce:

| Analyzer | TP | FP | FN | TN | Precision | Recall | F1 | Specificity |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| v0.1 baseline | 18 | 4 | 2 | 16 | 0.818182 | 0.900000 | 0.857143 | 0.800000 |
| v0.2 provenance-aware | 20 | 0 | 0 | 20 | 1.000000 | 1.000000 | 1.000000 | 1.000000 |

These are corpus-bound regression results, not a claim of perfect accuracy on arbitrary TypeScript repositories.

## Verify

```bash
pnpm install --frozen-lockfile
pnpm verify
```

## Clean-checkout quickstart

The Phase 3 MVP can be reproduced from this repository alone because Core and Guardian are pinned as SHA-256-verified package artifacts. On a machine with Git and Node.js 22 or later:

```bash
git clone https://github.com/Little-Boy-s-ArchSync/archsync-benchmark.git
cd archsync-benchmark
corepack enable
corepack prepare pnpm@11.16.0 --activate
pnpm install --frozen-lockfile
pnpm demo
pnpm phase3:verify
```

`pnpm demo` executes one real `PASS`, one `BLOCK`, and one `REVIEW` patch with concise presentation output. It verifies the actual classification, decision, changed-file set and cold `MISS` to warm `HIT` cache transition. The runner uses Node child processes with `shell: false`, so it does not depend on Bash or PowerShell syntax. The clean GitHub Actions jobs execute the full verifier and this same demo command on Ubuntu, Windows and macOS, providing a cross-platform reproducible-machine check. Shared-runner duration is operational evidence for those runs, not a universal installation-time guarantee.

Run a single decision or reveal the complete technical gate output when needed:

```bash
pnpm demo:pass
pnpm demo:block
pnpm demo:review
pnpm demo --scenario block --verbose
pnpm demo --scenario all --json
```

See [`README-DEMO.md`](README-DEMO.md) for the short Vietnamese presentation script and the boundary between demo output and research evidence.

Verification checks the SHA-256 of the vendored packages built from pinned Core and Guardian revisions, validates both datasets, confirms that all 20 patches apply cleanly and reruns the Guardian analyzer against every case and annotated signal. The vendored packages allow the complete gate to run from a clean checkout without access tokens for the private source repositories.

The benchmark's deterministic validation libraries are covered by 110 detailed tests with enforced 100% line, branch and function coverage. [`evidence/unit-coverage.json`](evidence/unit-coverage.json) records the measured totals and SHA-256 provenance for the libraries, tests, package metadata, lockfile and runtime-artifact manifest. Top-level evidence and demo processes are validated by the full real-artifact integration gate rather than being counted as unit-library coverage.

Expected Phase 2 result:

```text
VALID PHASE 2 BENCHMARK EVIDENCE (20/20 cases, exact source evidence)
VALID TYPESCRIPT PATTERN EVIDENCE (20/20 positive, 20/20 hard-negative signals)
VALID PHASE 3 BENCHMARK EVIDENCE (20/20 decisions, 20/20 incremental/full-scan equivalence, 11/11 exact evidence, 57/189 files parsed)
```

The committed [`evidence/phase-2-results.json`](evidence/phase-2-results.json) records full-graph and changed-graph node/edge precision/recall/F1, classification agreement (`20/20`), violation rule-set agreement (`7/7`), exact file/line evidence agreement (`11/11` finding-bearing cases), and deterministic replay (`20/20`). [`evidence/typescript-pattern-baseline-v0.1.json`](evidence/typescript-pattern-baseline-v0.1.json) freezes the v0.1 analyzer result on the later challenge corpus; the v0.2 result is stored separately in `evidence/typescript-pattern-results.json`. SHA-256 provenance binds results to their manifests, sources and runtime artifacts. GitHub Actions reruns the complete gate on `ubuntu-latest`, `windows-latest` and `macos-latest`.

The Phase 3 artifact [`evidence/phase-3-results.json`](evidence/phase-3-results.json) applies the same 20 patches as real Git working-tree diffs. It records `20/20` classification and merge-decision matches, `20/20` changed-file matches, `20/20` exact architecture-delta matches, `20/20` incremental/full-scan equivalence checks, `7/7` violation rule-set matches, `11/11` exact evidence lines, deterministic cold/warm replay and `20/20` baseline-cache hits. Each incremental result is checked against a separate full scan of the same patched head, preventing a stable but incorrect incremental merge from satisfying the gate. Component-incremental analysis parsed 57 of 189 TypeScript file instances across the 20 head repositories (`0.3016`). The committed evidence also records its machine and cold/warm latency samples; those values are environment-specific measurements, not general performance estimates.

The complete requirement-by-requirement Phase 1--3 decision and paper-claim boundary are recorded in [`PHASE1-3-AUDIT.md`](PHASE1-3-AUDIT.md). The detailed Phase 3 exit-gate record remains in [`PHASE3-AUDIT.md`](PHASE3-AUDIT.md).

## Demo from source code

```bash
# Forbidden frontend -> payment-service call with ARCH-001 and file/line evidence
pnpm demo:case06

# Redis topology evolution requiring review
pnpm demo:case09
```

Each command copies the clean baseline to a temporary directory, applies one real patch, scans the resulting TypeScript source and checks the predicted classification against ground truth. The temporary directory is removed afterward.

Phase 3 Git-diff demo commands create a temporary Git baseline, apply the same real patches, run the cold and cache-hit incremental checks, and return success only when the merge decision matches ground truth:

```bash
pnpm demo
pnpm demo:pass
pnpm demo:block
pnpm demo:review

# Compatibility commands retained for exact legacy case reproduction
pnpm demo:phase3:pass
pnpm demo:phase3:block
pnpm demo:phase3:review
```

The three commands demonstrate the complete pull-request contract without leaving temporary repositories or generated reports in the workspace.

## Pull-request gate

The repository includes [`.github/workflows/architecture-gate.yml`](.github/workflows/architecture-gate.yml) as a live consumer of Guardian v0.3. For a pull request that changes the Order Platform model, source tree, or pinned Guardian artifact, the workflow fetches full Git history, restores the baseline graph cache, checks the proposed source against the merge base, emits GitHub annotations, and uploads the Markdown decision report.

Configure this workflow as a required status check when the repository plan supports branch protection. [`.github/CODEOWNERS`](.github/CODEOWNERS) assigns the current architecture contract to a real repository owner so model changes request review. ArchSync never rewrites or self-approves `architecture.yaml`; without an enforced repository approval policy, a contributor with merge authority could still change code and contract together and bypass the intended governance boundary.

Every case also carries explicit acceptance criteria and an expected source location. SHA-256 integrity fields bind `ground-truth.json` to the architecture model, baseline source tree and complete patch set. Intentional fixture changes require:

```bash
pnpm integrity:update
pnpm phase2:update
pnpm phase3:update
pnpm patterns:update
pnpm runtime:update
pnpm iac:update
pnpm ai-eval:update
pnpm analysis:update
pnpm pr-history:update
pnpm coverage:update
pnpm verify
```

The complete TV3 preparatory task/gate mapping is recorded in [`TV3-TECHNICAL-PREPARATION.md`](TV3-TECHNICAL-PREPARATION.md).
