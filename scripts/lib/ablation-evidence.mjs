import { createHash } from "node:crypto";

export const ABLATION_CONDITIONS = Object.freeze(["code-only", "code-iac", "code-iac-runtime", "evidence-grounded", "llm-only"]);

function object(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function sha(value) {
  return /^[0-9a-f]{64}$/u.test(value ?? "");
}

function exact(values, expected) {
  return Array.isArray(values) && values.length === expected.length && [...values].sort().join("\0") === [...expected].sort().join("\0");
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (object(value)) return `{${Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(",")}}`;
  return JSON.stringify(value);
}

export function ablationDesignSha256(design) {
  if (!object(design)) throw new Error("ablation design must be an object");
  return createHash("sha256").update(stable(design)).digest("hex");
}

function exactConfigKeys(configs) {
  return object(configs) && Object.keys(configs).sort().join("\0") === [...ABLATION_CONDITIONS].sort().join("\0");
}

export function validateAblationEvidence(evidence) {
  const issues = [];
  if (!object(evidence)) return ["ablation evidence must be an object"];
  if (evidence.schema_version !== 1) issues.push("schema_version must equal 1");
  if (!["pending", "complete"].includes(evidence.status)) issues.push("status must be pending or complete");
  if (!object(evidence.design) || !exact(evidence.design.conditions, ABLATION_CONDITIONS) || !exactConfigKeys(evidence.design.configs)) issues.push("design must contain the exact five conditions and configs");
  if (evidence.status === "pending") {
    const configEmpty = exactConfigKeys(evidence.design?.configs) && Object.values(evidence.design.configs).every((config) => object(config) && config.version === null && config.sha256 === null);
    if (evidence.design?.status !== "prepared" || evidence.design?.human_approval !== null || !configEmpty || evidence.study_dataset_sha256 !== null || !Array.isArray(evidence.runs) || evidence.runs.length !== 0 || evidence.results !== null || evidence.replay !== null || !Array.isArray(evidence.post_outcome_changes) || evidence.post_outcome_changes.length !== 0) issues.push("pending ablation must contain no frozen configuration or result evidence");
    return issues;
  }
  if (evidence.design?.status !== "frozen") issues.push("complete ablation requires a frozen design");
  for (const key of ["truth_sha256", "task_set_sha256", "scoring_sha256", "exclusions_sha256", "parser_sha256", "prompt_sha256"]) {
    if (!sha(evidence.design?.[key])) issues.push(`design ${key} is required`);
  }
  if (exactConfigKeys(evidence.design?.configs)) {
    for (const condition of ABLATION_CONDITIONS) {
      const config = evidence.design.configs[condition];
      if (!object(config) || !nonEmpty(config.version) || !sha(config.sha256)) issues.push(`${condition} requires a frozen version and hash`);
    }
  }
  if (!object(evidence.design?.human_approval) || evidence.design.human_approval.actor_type !== "human" || evidence.design.human_approval.decision !== "approved" || !sha(evidence.design.human_approval.sha256)) issues.push("frozen design requires hash-bound human approval");
  if (!sha(evidence.study_dataset_sha256)) issues.push("complete ablation requires frozen STUDY-103 dataset hash");
  if (!Array.isArray(evidence.runs) || evidence.runs.length === 0) issues.push("complete ablation requires run rows");
  const designSha = object(evidence.design) ? ablationDesignSha256(evidence.design) : null;
  const ids = new Set();
  const byCase = new Map();
  if (Array.isArray(evidence.runs)) evidence.runs.forEach((run, index) => {
    if (!object(run)) {
      issues.push(`run ${index} must be an object`);
      return;
    }
    if (!nonEmpty(run.run_id) || ids.has(run.run_id) || !nonEmpty(run.case_id) || !ABLATION_CONDITIONS.includes(run.condition)) issues.push(`run ${index} requires unique ID, case, and condition`);
    else ids.add(run.run_id);
    if (run.design_sha256 !== designSha || run.config_sha256 !== evidence.design?.configs?.[run.condition]?.sha256) issues.push(`run ${index} does not bind the frozen design/config`);
    if (!["completed", "failed"].includes(run.status)) issues.push(`run ${index} has invalid status`);
    if (run.status === "completed" && (!Number.isFinite(run.score) || !Number.isInteger(run.claims) || run.claims < 0 || !Number.isInteger(run.citation_supported_claims) || run.citation_supported_claims < 0 || run.citation_supported_claims > run.claims || typeof run.repair_verified !== "boolean")) issues.push(`run ${index} has incomplete result metrics`);
    const conditions = byCase.get(run.case_id) ?? [];
    conditions.push(run.condition);
    byCase.set(run.case_id, conditions);
  });
  for (const [caseId, conditions] of byCase) {
    if (!exact(conditions, ABLATION_CONDITIONS)) issues.push(`${caseId} must contain each frozen condition exactly once`);
  }
  if (!object(evidence.results) || !/^[0-9a-f]{40}$/u.test(evidence.results.analysis_code_commit) || !sha(evidence.results.normalized_results_sha256) || !sha(evidence.results.metrics_sha256)) issues.push("complete ablation requires hash-bound analysis results");
  if (!object(evidence.replay) || !sha(evidence.replay.first_sha256) || evidence.replay.first_sha256 !== evidence.replay.second_sha256) issues.push("metric replay must reproduce an identical hash");
  if (!Array.isArray(evidence.post_outcome_changes) || evidence.post_outcome_changes.length !== 0) issues.push("prompt/parser/config changes after outcomes are forbidden");
  return issues;
}

export function evaluateAblationClosure(evidence) {
  const issues = validateAblationEvidence(evidence);
  const blockers = issues.map((_, index) => `ablation_validation_${index + 1}`);
  if (evidence?.status !== "complete") blockers.push("ablation_not_executed");
  return { schema_version: 1, status: blockers.length === 0 ? "CLOSED" : "PREPARATORY", closed: blockers.length === 0, blockers };
}

export function assertAblationClosure(evidence) {
  const result = evaluateAblationClosure(evidence);
  if (!result.closed) throw new Error(`ABLATION_GATE_INCOMPLETE: ${result.blockers.join(",")}`);
  return result;
}
