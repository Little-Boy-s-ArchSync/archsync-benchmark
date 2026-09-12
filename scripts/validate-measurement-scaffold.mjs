import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { openStudyArtifactStore } from "./lib/study-artifact-store.mjs";

import {
  STUDY_STATISTICAL_PLAN_SOURCE,
  calculateStudyMetrics,
  validateInstrumentation,
  validateInstrumentationArtifacts,
  validateStatisticalPlanSource,
  validateStudyManifest,
  validateTaskSuite,
} from "./lib/measurement-study.mjs";

const root = new URL("../", import.meta.url);
const suite = JSON.parse(await readFile(new URL("measurement-study/task-suite.json", root), "utf8"));
const manifest = JSON.parse(await readFile(new URL("measurement-study/manifest.template.json", root), "utf8"));
const statisticalPlan = JSON.parse(await readFile(new URL("measurement-study/statistical-plan-source.json", root), "utf8"));
assert.deepEqual(validateTaskSuite(suite), []);
assert.deepEqual(validateStudyManifest(manifest), []);
assert.deepEqual(validateStatisticalPlanSource(statisticalPlan), []);
assert.deepEqual(statisticalPlan, STUDY_STATISTICAL_PLAN_SOURCE);
assert.equal(suite.status, "technical-dry-run-only");
assert.equal(manifest.status, "proposed");
assert.equal(manifest.approvals, null);
assert.equal(statisticalPlan.status, "proposed");

function payload(type, condition) {
  if (type === "run_started") return { environment_sha256: "a".repeat(64), task_suite_sha256: "b".repeat(64), study_manifest_sha256: "c".repeat(64) };
  if (type === "baseline_recorded") return { baseline_commit: "d".repeat(40), tree_sha256: "e".repeat(64) };
  if (type === "prompt_recorded") return {
    prompt_sha256: "1".repeat(64),
    response_sha256: "2".repeat(64),
    provider_config_sha256: "3".repeat(64),
    redaction: { passed: true, audit_sha256: "4".repeat(64) },
    prompt_path: `synthetic/${condition}/prompt.json`,
    output_path: `synthetic/${condition}/output.json`,
  };
  if (type === "task_submitted") return { commit_chain: ["5".repeat(40)], acceptance_commands: ["pnpm test"] };
  if (type === "tests_recorded") return {
    commands: ["pnpm test"],
    results: [{ command: "pnpm test", status: "passed", exit_code: 0, duration_ms: 0 }],
    findings: 0,
    approvals: 0,
    repairs: 0,
  };
  return { status: "completed", wall_time_ms: 0, tokens: condition === "A" ? 0 : 1, findings: 0, approvals: 0, repairs: 0, ended_at: "2026-08-26T00:00:06Z", deviations: [] };
}

const events = [];
for (const condition of ["A", "B", "C", "D"]) {
  const types = ["run_started", "baseline_recorded", ...(condition === "A" ? [] : ["prompt_recorded"]), "task_submitted", "tests_recorded", "run_finished"];
  types.forEach((type, index) => events.push({
    event_id: `dry-${condition}-${index}`,
    run_id: `dry-${condition}`,
    task_id: "TASK-001",
    condition,
    type,
    recorded_at: `2026-08-26T00:00:0${type === "run_finished" ? 6 : index}Z`,
    payload: payload(type, condition),
  }));
}
assert.deepEqual(validateInstrumentation(events), []);

// These in-memory bytes are controlled fixtures, never participant/provider data.
const artifacts = new Map();
for (const event of events) {
  event.attempt_id = `${event.run_id}-synthetic-attempt`;
  function bind(target, pathKey, hashKey, role) {
    const path = `synthetic/${event.event_id}/${role}.json`;
    const bytes = Buffer.from(JSON.stringify({ fixture: "synthetic-only", run_id: event.run_id, role }));
    target[pathKey] = path;
    target[hashKey] = createHash("sha256").update(bytes).digest("hex");
    artifacts.set(path, bytes);
  }
  if (event.type === "run_started") for (const key of ["environment", "task_suite", "study_manifest"]) bind(event.payload, `${key}_path`, `${key}_sha256`, key);
  if (event.type === "baseline_recorded") bind(event.payload, "tree_path", "tree_sha256", "tree");
  if (event.type === "prompt_recorded") {
    bind(event.payload, "prompt_path", "prompt_sha256", "prompt");
    bind(event.payload, "output_path", "response_sha256", "response");
    bind(event.payload, "provider_config_path", "provider_config_sha256", "provider-config");
    bind(event.payload.redaction, "audit_path", "audit_sha256", "redaction-audit");
  }
  const receipt = Buffer.from(JSON.stringify({ schema_version: 1, event }));
  event.artifact = { path: `synthetic/${event.event_id}/receipt.json`, sha256: createHash("sha256").update(receipt).digest("hex") };
  artifacts.set(event.artifact.path, receipt);
}
assert.deepEqual(await validateInstrumentationArtifacts(events, async (path) => artifacts.get(path)), []);

// Exercise the concrete disk intake with the same synthetic-only bytes. These
// locally calculated fixture pins are not independently reviewed study pins.
const storeRoot = await realpath(await mkdtemp(join(tmpdir(), "archsync-study-dry-run-")));
try {
  const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
  for (const [path, bytes] of artifacts) {
    const target = join(storeRoot, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, bytes);
  }
  const eventBytes = Buffer.from(`${JSON.stringify(events)}\n`);
  await writeFile(join(storeRoot, "events.json"), eventBytes);
  const inventory = {
    schema_version: 1,
    kind: "study-artifact-store",
    event_log: { path: "events.json", sha256: digest(eventBytes) },
    runs: ["A", "B", "C", "D"].map((condition) => {
      const runEvents = events.filter((event) => event.condition === condition);
      return {
        run_id: runEvents[0].run_id,
        attempt_id: runEvents[0].attempt_id,
        task_id: runEvents[0].task_id,
        condition,
        artifacts: [...artifacts].filter(([path]) => runEvents.some((event) => path.startsWith(`synthetic/${event.event_id}/`)))
          .map(([path, bytes]) => ({ path, sha256: digest(bytes) })),
      };
    }),
  };
  const inventoryBytes = Buffer.from(`${JSON.stringify(inventory)}\n`);
  await writeFile(join(storeRoot, "manifest.json"), inventoryBytes);
  const store = await openStudyArtifactStore({ root: storeRoot, manifest: { path: "manifest.json", sha256: digest(inventoryBytes) }, event_log_sha256: digest(eventBytes) });
  assert.deepEqual(store.events, events);
  assert.deepEqual(await validateInstrumentationArtifacts(store.events, store.readArtifact), []);
  assert.equal(store.receipt.run_count, 4);
  assert.equal(store.receipt.authenticated_capture, false);
  assert.equal(store.receipt.human_approval_verified, false);
} finally {
  await rm(storeRoot, { recursive: true, force: true });
}

const descriptive = calculateStudyMetrics(["A", "B", "C", "D"].map((condition, index) => ({
  run_id: `synthetic-metric-${condition}`,
  condition,
  status: index === 0 ? "completed" : index === 1 ? "failed" : "inconclusive",
  commits: 1,
  violations: 0,
  time_to_fix_ms: null,
  merge_delay_ms: 0,
  approvals: 0,
  false_blocks: 0,
  token_cost_usd: 0,
  compute_cost_usd: 0,
  repair: { attempted: false, success: false, regression: false },
})), statisticalPlan);
assert.equal(descriptive.analysis_status, "descriptive-preparatory");
assert.equal(descriptive.assigned_n, 4);
assert.equal(descriptive.analyzed_n, 4);

const readme = await readFile(new URL("measurement-study/README.md", root), "utf8");
assert.match(readme, /no participant, agent, pilot, or final-study result/iu);
assert.match(readme, /blocked by EXP-103, STAT-101, PILOT-101, ETH-101 and DATA-101/iu);
assert.match(readme, /Empty placeholder payloads fail/iu);
console.log("VALID MEASUREMENT SCAFFOLD (A-D synthetic logging, pinned local-store intake and exact-byte artifact binding dry run; proposed STAT-101 linked; no research execution)");
