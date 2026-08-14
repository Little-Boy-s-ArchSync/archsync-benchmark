import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const readJson = async (relativePath) =>
  JSON.parse(await readFile(new URL(relativePath, import.meta.url), "utf8"));

const [groundTruth, phase2, phase3, patterns, baseline, evidence, orderReadme, phase3Audit] =
  await Promise.all([
    readJson("../order-platform/ground-truth.json"),
    readJson("../evidence/phase-2-results.json"),
    readJson("../evidence/phase-3-results.json"),
    readJson("../evidence/typescript-pattern-results.json"),
    readJson("../evidence/typescript-pattern-baseline-v0.1.json"),
    readFile(new URL("../EVIDENCE.md", import.meta.url), "utf8"),
    readFile(new URL("../order-platform/README.md", import.meta.url), "utf8"),
    readFile(new URL("../PHASE3-AUDIT.md", import.meta.url), "utf8"),
  ]);

const counts = groundTruth.cases.reduce(
  (actual, benchmarkCase) => {
    actual[benchmarkCase.expected.classification] += 1;
    return actual;
  },
  { "no-impact": 0, violation: 0, evolution: 0 },
);

const d1 = phase2.evaluation_protocol;
const outcomes = phase2.outcome_counts;
const phase3Outcomes = phase3.outcome_counts;
const d2 = patterns.result.metrics.overall;
const d2Baseline = baseline.result.metrics.overall;
const matrixRows = evidence.match(/^\| case-\d{2} \|/gm) ?? [];

assert.equal(
  matrixRows.length,
  groundTruth.cases.length,
  "EVIDENCE.md case-matrix row count is stale",
);
for (const benchmarkCase of groundTruth.cases) {
  assert.match(
    evidence,
    new RegExp(`^\\| ${benchmarkCase.id} \\|`, "m"),
    `EVIDENCE.md is missing ${benchmarkCase.id}`,
  );
}

const evidenceClaims = [
  `${counts["no-impact"]} no-impact / ${counts.violation} violation / ${counts.evolution} evolution`,
  `classification agreement: \`${outcomes.classification_matches}/${outcomes.classification_cases}\` cases`,
  `exact violation rule-set agreement: \`${outcomes.violation_rule_set_matches}/${outcomes.violation_rule_cases}\` violation cases`,
  `expected evidence file and exact-line agreement: \`${outcomes.evidence_exact_line_matches}/${outcomes.source_evidence_cases}\` finding-bearing cases`,
  `deterministic replay: \`${outcomes.deterministic_cases}/${outcomes.deterministic_cases_total}\` cases`,
  `\`${d1.total_analyzer_executions}\` analyzer executions in one D1 evaluation`,
  `merge-decision agreement: \`${phase3Outcomes.decision_matches}/${phase3Outcomes.total_cases}\` cases`,
  `changed-file agreement: \`${phase3Outcomes.changed_file_matches}/${phase3Outcomes.total_cases}\` cases`,
  `architecture-delta agreement: \`${phase3Outcomes.architecture_delta_matches}/${phase3Outcomes.total_cases}\` cases`,
  `incremental/full-scan equivalence: \`${phase3Outcomes.incremental_full_scan_matches}/${phase3Outcomes.total_cases}\` cases`,
  `baseline-cache hits on the repeated run: \`${phase3Outcomes.cache_hits_on_repeat}/${phase3Outcomes.total_cases}\` cases`,
  `component-incremental parsing: \`${phase3.incremental_scope.parsed_typescript_files}/${phase3.incremental_scope.head_typescript_files}\` TypeScript file instances`,
  `Cold median/p95 was \`${phase3.performance.cold_median_ms.toFixed(2)}/${phase3.performance.cold_p95_ms.toFixed(2)} ms\``,
  `warm median/p95 was \`${phase3.performance.warm_median_ms.toFixed(2)}/${phase3.performance.warm_p95_ms.toFixed(2)} ms\``,
  `TP=${d2.true_positive}`,
  `FP=${d2.false_positive}`,
  `FN=${d2.false_negative}`,
  `TN=${d2.true_negative}`,
  `TP=${d2Baseline.true_positive}`,
  `FP=${d2Baseline.false_positive}`,
  `FN=${d2Baseline.false_negative}`,
  `TN=${d2Baseline.true_negative}`,
];
for (const claim of evidenceClaims) {
  assert.ok(evidence.includes(claim), `EVIDENCE.md is missing: ${claim}`);
}

const auditClaims = [
  "Classification, decision, changed-file, architecture-delta, and incremental/full-scan agreement: 20/20 each.",
  "Violation rule-set agreement: 7/7.",
  "Exact evidence file and line agreement: 11/11 finding-bearing cases.",
  "Incremental analysis scope: 57/189 TypeScript file instances, or 0.3016.",
  "Recorded Windows cold median/p95: 540.00/571.60 ms.",
  "Recorded Windows warm median/p95: 249.75/278.27 ms.",
];
for (const claim of auditClaims) {
  assert.ok(phase3Audit.includes(claim), `PHASE3-AUDIT.md is missing: ${claim}`);
}

const orderReadmeClaims = [
  `defines ${groundTruth.cases.length} labeled changes`,
  `${counts["no-impact"]} no-impact cases`,
  `${counts.violation} architecture violations`,
  `${counts.evolution} valid architecture evolutions`,
];
for (const claim of orderReadmeClaims) {
  assert.ok(
    orderReadme.includes(claim),
    `order-platform/README.md is missing: ${claim}`,
  );
}

console.log(
  `VALID DOCUMENTATION (${groundTruth.cases.length} cases, ${d2.positive_signals + d2.negative_signals} signals, ${d1.total_analyzer_executions} D1 analyzer executions, ${phase3.protocol.analyses_per_case * phase3.protocol.cases} Phase 3 checks, ${phase3.protocol.analyzer_calls_per_case * phase3.protocol.cases} Phase 3 analyzer calls)`,
);
