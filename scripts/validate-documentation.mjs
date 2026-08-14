import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const readJson = async (relativePath) =>
  JSON.parse(await readFile(new URL(relativePath, import.meta.url), "utf8"));

const [groundTruth, phase2, patterns, baseline, evidence, orderReadme] =
  await Promise.all([
    readJson("../order-platform/ground-truth.json"),
    readJson("../evidence/phase-2-results.json"),
    readJson("../evidence/typescript-pattern-results.json"),
    readJson("../evidence/typescript-pattern-baseline-v0.1.json"),
    readFile(new URL("../EVIDENCE.md", import.meta.url), "utf8"),
    readFile(new URL("../order-platform/README.md", import.meta.url), "utf8"),
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
  `VALID DOCUMENTATION (${groundTruth.cases.length} cases, ${d2.positive_signals + d2.negative_signals} signals, ${d1.total_analyzer_executions} D1 analyzer executions)`,
);
