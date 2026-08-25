import { createHash } from "node:crypto";

const DATASET_STATUSES = new Set(["synthetic-provisional", "frozen"]);
const RUN_STATUSES = new Set(["completed", "failed", "inconclusive"]);

function object(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function sha(value) {
  return /^[0-9a-f]{64}$/u.test(value);
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (object(value)) return `{${Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(",")}}`;
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function analysisDatasetSha256(rows) {
  if (!Array.isArray(rows)) throw new Error("analysis rows must be an array");
  return sha256(stable(rows));
}

export function validateAnalysisDataset(dataset) {
  const issues = [];
  if (!object(dataset)) return ["analysis dataset must be an object"];
  if (dataset.schema_version !== 1) issues.push("schema_version must equal 1");
  if (!nonEmpty(dataset.dataset_id)) issues.push("dataset_id is required");
  if (!DATASET_STATUSES.has(dataset.status)) issues.push("status must be synthetic-provisional or frozen");
  if (typeof dataset.synthetic !== "boolean") issues.push("synthetic must be boolean");
  if ((dataset.status === "synthetic-provisional") !== (dataset.synthetic === true)) issues.push("synthetic data must remain synthetic-provisional and frozen data must be non-synthetic");
  if (!object(dataset.statistical_plan) || !sha(dataset.statistical_plan.sha256) || !["proposed", "frozen"].includes(dataset.statistical_plan.status) || !nonEmpty(dataset.statistical_plan.version)) issues.push("statistical_plan requires status, version, and SHA-256");
  if (!Array.isArray(dataset.rows) || dataset.rows.length === 0) return [...issues, "analysis rows must be non-empty"];
  if (!sha(dataset.raw_dataset_sha256) || dataset.raw_dataset_sha256 !== analysisDatasetSha256(dataset.rows)) issues.push("raw_dataset_sha256 must bind the exact rows");
  const seen = new Set();
  dataset.rows.forEach((row, index) => {
    if (!object(row)) {
      issues.push(`row ${index} must be an object`);
      return;
    }
    const key = `${row.run_id}\0${row.outcome}`;
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/u.test(row.run_id) || !/^[a-z0-9][a-z0-9_-]*$/u.test(row.outcome) || seen.has(key)) issues.push(`row ${index} requires a unique run/outcome key`);
    else seen.add(key);
    if (!/^[A-Za-z0-9][A-Za-z0-9+-]*$/u.test(row.condition)) issues.push(`row ${index} has invalid condition`);
    if (!RUN_STATUSES.has(row.status)) issues.push(`row ${index} has invalid status`);
    const measured = Number.isFinite(row.numerator) && row.numerator >= 0 && Number.isFinite(row.denominator) && row.denominator > 0 && row.value === row.numerator / row.denominator;
    const retainedFailure = row.status !== "completed" && row.numerator === null && row.denominator === null && row.value === null;
    if (!measured && !retainedFailure) issues.push(`row ${index} requires an exact numerator/denominator/value or retained failure`);
  });
  if (dataset.status === "synthetic-provisional" && dataset.approval !== null) issues.push("synthetic-provisional dataset approval must be null");
  if (dataset.status === "frozen" && (!object(dataset.approval) || dataset.approval.actor_type !== "human" || dataset.approval.decision !== "approved" || !nonEmpty(dataset.approval.reviewer_id) || !nonEmpty(dataset.approval.approved_at) || !sha(dataset.approval.sha256))) issues.push("frozen dataset requires hash-bound human approval");
  return issues;
}

function csvCell(value) {
  return value === null ? "" : String(value);
}

function buildArtifacts(dataset, publishable) {
  const label = publishable ? "FROZEN ANALYSIS" : "SYNTHETIC PREPARATORY DRY RUN — NOT RESEARCH RESULTS";
  const rows = [...dataset.rows].sort((left, right) => `${left.outcome}\0${left.condition}\0${left.run_id}`.localeCompare(`${right.outcome}\0${right.condition}\0${right.run_id}`));
  const header = ["dataset_status", "run_id", "condition", "run_status", "outcome", "numerator", "denominator", "value"];
  const resultsCsv = `${[header, ...rows.map((row) => [dataset.status, row.run_id, row.condition, row.status, row.outcome, row.numerator, row.denominator, row.value])].map((record) => record.map(csvCell).join(",")).join("\n")}\n`;
  const tableRows = rows.map((row) => `| ${row.run_id} | ${row.condition} | ${row.status} | ${row.outcome} | ${row.numerator ?? "—"} | ${row.denominator ?? "—"} | ${row.value ?? "—"} |`).join("\n");
  const tableMarkdown = `# ${label}\n\nDataset: \`${dataset.dataset_id}\`\n\nStatus: \`${dataset.status}\`\n\nRows include failed and inconclusive runs.\n\n| Run | Condition | Status | Outcome | Numerator | Denominator | Value |\n| --- | --- | --- | --- | ---: | ---: | ---: |\n${tableRows}\n`;
  const numeric = rows.filter((row) => row.value !== null);
  const maximum = Math.max(1, ...numeric.map((row) => row.value));
  const bars = numeric.map((row, index) => {
    const width = Math.round((row.value / maximum) * 400);
    const y = 55 + index * 28;
    return `<text x="10" y="${y + 14}" font-size="12">${row.run_id}/${row.outcome}</text><rect x="190" y="${y}" width="${width}" height="18" fill="#64748b"/><text x="${200 + width}" y="${y + 14}" font-size="12">${row.value}</text>`;
  }).join("");
  const height = 80 + numeric.length * 28;
  const figureSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="680" height="${height}" role="img" aria-label="${label}"><rect width="100%" height="100%" fill="white"/><text x="10" y="24" font-size="16" font-weight="bold">${label}</text>${bars}</svg>\n`;
  const files = {
    "results.csv": resultsCsv,
    "table.md": tableMarkdown,
    "figure.svg": figureSvg,
  };
  const manifest = {
    schema_version: 1,
    dataset_id: dataset.dataset_id,
    raw_dataset_sha256: dataset.raw_dataset_sha256,
    statistical_plan: structuredClone(dataset.statistical_plan),
    status: publishable ? "frozen-analysis" : "synthetic-preparatory",
    publishable,
    files: Object.fromEntries(Object.entries(files).sort(([left], [right]) => left.localeCompare(right)).map(([file, content]) => [file, sha256(content)])),
  };
  return { ...files, manifest: { ...manifest, manifest_sha256: sha256(stable(manifest)) } };
}

export function createPreparatoryAnalysisArtifacts(dataset) {
  const issues = validateAnalysisDataset(dataset);
  if (issues.length > 0) throw new Error(`invalid analysis dataset: ${issues.join("; ")}`);
  if (dataset.status !== "synthetic-provisional" || dataset.synthetic !== true || dataset.approval !== null) throw new Error("preparatory pipeline accepts only unapproved synthetic-provisional fixtures");
  return buildArtifacts(dataset, false);
}

function independentAuditGate(value) {
  return object(value) && value.actor_type === "human" && value.independent === true && value.decision === "reproduced" && /^https:\/\//u.test(value.url) && /^[0-9a-f]{40}$/u.test(value.commit) && sha(value.sha256);
}

export function assertPublishableAnalysis(dataset, independentAudit) {
  const issues = validateAnalysisDataset(dataset);
  const blockers = issues.map((_, index) => `dataset_validation_${index + 1}`);
  if (dataset?.status !== "frozen") blockers.push("dataset_not_frozen");
  if (dataset?.synthetic !== false) blockers.push("dataset_is_synthetic");
  if (dataset?.statistical_plan?.status !== "frozen") blockers.push("statistical_plan_not_frozen");
  if (!independentAuditGate(independentAudit)) blockers.push("independent_reproduction_missing");
  if (blockers.length > 0) throw new Error(`ANALYSIS_GATE_INCOMPLETE: ${blockers.join(",")}`);
  return buildArtifacts(dataset, true);
}

export function verifyAnalysisArtifacts(dataset, artifacts, publishable = false) {
  if (!object(artifacts)) return false;
  try {
    const expected = publishable ? assertPublishableAnalysis(dataset, artifacts.independent_audit) : createPreparatoryAnalysisArtifacts(dataset);
    const actual = publishable ? Object.fromEntries(Object.entries(artifacts).filter(([key]) => key !== "independent_audit")) : artifacts;
    return stable(expected) === stable(actual);
  } catch {
    return false;
  }
}
