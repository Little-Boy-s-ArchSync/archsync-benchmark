import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { validateInstrumentationArtifacts } from "../scripts/lib/measurement-study.mjs";
import { openStudyArtifactStore, STUDY_ARTIFACT_STORE_LIMITS } from "../scripts/lib/study-artifact-store.mjs";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const json = (value) => Buffer.from(`${JSON.stringify(value)}\n`);

// Authored fixtures only: there are no human identities, approvals or real runs.
function fixture(t, conditions = ["B"], status = "failed") {
  const parent = fs.realpathSync.native(fs.mkdtempSync(join(tmpdir(), "archsync-study-store-")));
  const root = join(parent, "store");
  fs.mkdirSync(root);
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const files = new Map();
  const events = [];
  const manifest = { schema_version: 1, kind: "study-artifact-store", event_log: null, runs: [] };
  for (const [runIndex, condition] of conditions.entries()) {
    const run = { run_id: `synthetic-${runIndex}`, attempt_id: `synthetic-attempt-${runIndex}`, task_id: "TASK-001", condition, artifacts: [] };
    const bind = (name, bytes) => {
      const path = `${run.run_id}/${name}.json`;
      files.set(path, bytes);
      const ref = { path, sha256: hash(bytes) };
      run.artifacts.push(ref);
      return { ...ref };
    };
    const source = (name) => bind(name, json({ fixture: "synthetic-only", run_id: run.run_id, name }));
    const started = {};
    for (const key of ["environment", "task_suite", "study_manifest"]) {
      const ref = source(key);
      started[`${key}_path`] = ref.path;
      started[`${key}_sha256`] = ref.sha256;
    }
    const tree = source("tree");
    const payloads = [
      ["run_started", started],
      ["baseline_recorded", { baseline_commit: "a".repeat(40), tree_path: tree.path, tree_sha256: tree.sha256 }],
    ];
    if (condition !== "A") {
      const prompt = source("prompt"); const response = source("response"); const provider = source("provider"); const audit = source("redaction");
      payloads.push(["prompt_recorded", { prompt_path: prompt.path, prompt_sha256: prompt.sha256, output_path: response.path, response_sha256: response.sha256,
        provider_config_path: provider.path, provider_config_sha256: provider.sha256, redaction: { passed: true, audit_path: audit.path, audit_sha256: audit.sha256 } }]);
    }
    payloads.push(["task_submitted", { commit_chain: ["b".repeat(40)], acceptance_commands: ["controlled-test"] }]);
    payloads.push(["tests_recorded", { commands: ["controlled-test"], results: [{ command: "controlled-test", status: status === "completed" ? "passed" : "failed", exit_code: status === "completed" ? 0 : 1, duration_ms: 1 }], findings: 2, approvals: 0, repairs: 0 }]);
    payloads.push(["run_finished", { status, wall_time_ms: 10, tokens: condition === "A" ? 0 : 1, findings: 2, approvals: 0, repairs: 0, ended_at: "2026-09-13T00:00:06Z", deviations: [] }]);
    for (const [index, [type, payload]] of payloads.entries()) {
      const event = { event_id: `${run.run_id}-event-${index}`, run_id: run.run_id, attempt_id: run.attempt_id, task_id: run.task_id, condition, type,
        recorded_at: `2026-09-13T00:00:0${type === "run_finished" ? 6 : index}Z`, payload };
      event.artifact = bind(`event-${index}`, json({ schema_version: 1, event }));
      events.push(event);
    }
    manifest.runs.push(run);
  }
  const persist = () => {
    for (const [path, bytes] of files) {
      fs.mkdirSync(dirname(join(root, path)), { recursive: true });
      fs.writeFileSync(join(root, path), bytes);
    }
    const log = json(events);
    fs.writeFileSync(join(root, "events.json"), log);
    manifest.event_log = { path: "events.json", sha256: hash(log) };
    const bytes = json(manifest);
    fs.writeFileSync(join(root, "manifest.json"), bytes);
    return { root, manifest: { path: "manifest.json", sha256: hash(bytes) }, event_log_sha256: hash(log) };
  };
  const repinManifest = () => {
    const bytes = json(manifest);
    fs.writeFileSync(join(root, "manifest.json"), bytes);
    return { root, manifest: { path: "manifest.json", sha256: hash(bytes) }, event_log_sha256: manifest.event_log?.sha256 ?? "a".repeat(64) };
  };
  return { parent, root, files, events, manifest, persist, repinManifest, options: persist() };
}

test("local intake pins complete A-D attempts, retains failures and exposes only immutable copied bytes", async (t) => {
  for (const status of ["completed", "failed", "inconclusive"]) {
    const f = fixture(t, ["A", "B", "C", "D"], status);
    const store = await openStudyArtifactStore(f.options);
    assert.deepEqual(await validateInstrumentationArtifacts(store.events, store.readArtifact), []);
    assert.deepEqual(store.events, f.events);
    assert.deepEqual(store.manifest, f.manifest);
    assert.equal(store.receipt.run_count, 4);
    assert.equal(store.receipt.authenticated_capture, false);
    assert.equal(store.receipt.human_approval_verified, false);
    assert.equal(store.receipt.manifest_sha256, f.options.manifest.sha256);
    assert.equal(store.receipt.event_log_sha256, f.options.event_log_sha256);
    assert.ok(Object.isFrozen(store) && Object.isFrozen(store.receipt));
    const [path, bytes] = f.files.entries().next().value;
    (await store.readArtifact(path)).fill(0);
    store.events[0].run_id = "substituted";
    store.manifest.runs.length = 0;
    assert.deepEqual(await store.readArtifact(path), bytes);
    assert.deepEqual(store.events, f.events);
    assert.deepEqual(store.manifest, f.manifest);
    fs.rmSync(f.root, { recursive: true });
    assert.deepEqual(await validateInstrumentationArtifacts(store.events, store.readArtifact), []);
    await assert.rejects(openStudyArtifactStore(f.options), /ENOENT/);
    for (const path of ["../escape", "unknown.json", undefined]) await assert.rejects(store.readArtifact(path), /exact captured artifact inventory/);
  }
});

test("caller pins cannot be replaced by self-consistent rewritten manifests or event logs", async (t) => {
  const f = fixture(t);
  await assert.rejects(openStudyArtifactStore({ ...f.options, manifest: { ...f.options.manifest, sha256: "f".repeat(64) } }), /SHA-256 mismatch/);
  await assert.rejects(openStudyArtifactStore({ ...f.options, event_log_sha256: "f".repeat(64) }), /separately pinned event log/);
  const original = structuredClone(f.options);
  f.events.at(-1).payload.deviations.push("synthetic change");
  const updated = f.persist();
  await assert.rejects(openStudyArtifactStore(original), /SHA-256 mismatch/);
  await assert.rejects(openStudyArtifactStore({ ...updated, event_log_sha256: original.event_log_sha256 }), /separately pinned event log/);
  // Updating both caller pins still cannot erase the old receipt's event claims.
  await assert.rejects(openStudyArtifactStore(updated), /exact event and run\/attempt binding/);
});

test("intake rejects malformed caller pins and every noncanonical artifact path before reading it", async (t) => {
  const f = fixture(t);
  for (const options of [null, [], {}, { ...f.options, extra: true }, { ...f.options, root: 4 }, { ...f.options, root: "relative" }, { ...f.options, event_log_sha256: 4 }, { ...f.options, event_log_sha256: "bad" }, { ...f.options, manifest: null }, { ...f.options, manifest: { ...f.options.manifest, extra: true } }, { ...f.options, manifest: { ...f.options.manifest, sha256: "bad" } }]) {
    await assert.rejects(openStudyArtifactStore(options), /externally pinned/);
  }
  for (const path of [undefined, "", "/outside", "../outside", "a/../b", "a/./b", "a//b", "C:/outside", "a\\b", "a\0b", "https://example.invalid/a", "%2e%2e/a", "é.json", "bad.", "CON", "a/nul.json", "x".repeat(1025), "a/" + "x".repeat(256)]) {
    await assert.rejects(openStudyArtifactStore({ ...f.options, manifest: { path, sha256: "a".repeat(64) } }), /externally pinned/);
  }
});

test("manifest schema, unique run identities and closed file inventory are enforced", async (t) => {
  const f = fixture(t);
  const original = structuredClone(f.manifest);
  for (const change of [
    (m) => { m.schema_version = 2; }, (m) => { m.kind = "other"; }, (m) => { m.extra = true; },
    (m) => { m.event_log = null; }, (m) => { m.runs = null; }, (m) => { m.runs = []; },
    (m) => { m.runs[0] = null; }, (m) => { m.runs[0].run_id = ""; }, (m) => { m.runs[0].attempt_id = 1; },
    (m) => { m.runs[0].task_id = "unsafe id"; }, (m) => { m.runs[0].condition = "X"; },
    (m) => { m.runs[0].artifacts = null; }, (m) => { m.runs[0].artifacts = []; },
    (m) => { m.runs.push(structuredClone(m.runs[0])); },
    (m) => { m.runs.push({ ...structuredClone(m.runs[0]), run_id: "other" }); },
    (m) => { m.runs[0].artifacts[0].path = "../outside"; },
    (m) => { m.runs[0].artifacts.push({ ...m.runs[0].artifacts[0] }); },
    (m) => { m.runs[0].artifacts.push({ ...m.runs[0].artifacts[0], path: m.runs[0].artifacts[0].path.toUpperCase() }); },
    (m) => { m.runs[0].artifacts[0].path = "events.json"; },
    (m) => { m.event_log.path = "manifest.json"; },
  ]) {
    Object.keys(f.manifest).forEach((key) => delete f.manifest[key]); Object.assign(f.manifest, structuredClone(original)); change(f.manifest);
    await assert.rejects(openStudyArtifactStore(f.repinManifest()), /STUDY_ARTIFACT_STORE_INVALID/);
  }
});

test("both pinned JSON inputs reject invalid encoding, invalid JSON and non-array event logs", async (t) => {
  const f = fixture(t);
  for (const content of [Buffer.from([0xff]), Buffer.from("not JSON"), json(null), json({}), json([])]) {
    fs.writeFileSync(join(f.root, "manifest.json"), content);
    await assert.rejects(openStudyArtifactStore({ ...f.options, manifest: { path: "manifest.json", sha256: hash(content) } }), /STUDY_ARTIFACT_STORE_INVALID/);
  }
  for (const value of [null, {}, [], [null], ["bad event"], Array(STUDY_ARTIFACT_STORE_LIMITS.events + 1).fill(null)]) {
    const bytes = json(value);
    fs.writeFileSync(join(f.root, "events.json"), bytes);
    f.manifest.event_log.sha256 = hash(bytes);
    await assert.rejects(openStudyArtifactStore(f.repinManifest()), /event log/);
  }
});

test("missing or altered manifest, log and artifact files fail fresh intake", async (t) => {
  const f = fixture(t);
  for (const path of ["manifest.json", "events.json", ...f.files.keys()]) {
    const absolute = join(f.root, path); const bytes = fs.readFileSync(absolute);
    fs.unlinkSync(absolute);
    await assert.rejects(openStudyArtifactStore(f.options), /ENOENT/, path);
    fs.writeFileSync(absolute, Buffer.concat([bytes, Buffer.from("\n")]));
    await assert.rejects(openStudyArtifactStore(f.options), /SHA-256 mismatch/, path);
    fs.writeFileSync(absolute, bytes);
  }
  assert.deepEqual((await openStudyArtifactStore(f.options)).events, f.events);
});

test("cross-run substitution, unobserved runs and unreferenced files cannot enter the captured inventory", async (t) => {
  for (const change of [
    (f) => { f.events[0].attempt_id = "other-attempt"; },
    (f) => { f.manifest.runs[0].run_id = "not-observed"; },
    (f) => { f.manifest.runs[0].task_id = "TASK-002"; },
    (f) => { f.manifest.runs[0].condition = "D"; },
    (f) => { f.events[0].artifact = f.events.at(-1).artifact; },
    (f) => { delete f.events[0].artifact; },
    (f) => { f.events[0].payload.environment_path = "missing.json"; },
    (f) => { f.manifest.runs[0].artifacts[0].sha256 = "f".repeat(64); },
    (f) => { f.manifest.runs[0].artifacts.push({ path: "unreferenced.json", sha256: "f".repeat(64) }); },
    (f) => { f.events.splice(f.events.findIndex((e) => e.run_id === "synthetic-1")); },
  ]) {
    const f = fixture(t, ["A", "B"]); change(f);
    await assert.rejects(openStudyArtifactStore(f.persist()), /inventory|unobserved|unreferenced/);
  }
});

test("root, ancestor and file symlinks, hardlinks and nonregular files are rejected", async (t) => {
  const f = fixture(t);
  const outside = join(f.parent, "outside"); fs.mkdirSync(outside);
  const alias = join(f.parent, "alias"); fs.symlinkSync(f.root, alias, "junction");
  await assert.rejects(openStudyArtifactStore({ ...f.options, root: alias }), /real directories/);
  const parentAlias = join(f.parent, "parent-alias"); fs.symlinkSync(f.parent, parentAlias, "junction");
  await assert.rejects(openStudyArtifactStore({ ...f.options, root: join(parentAlias, "store") }), /canonical/);
  await assert.rejects(openStudyArtifactStore({ ...f.options, root: join(f.root, "manifest.json") }), /real directories/);
  const path = f.manifest.runs[0].artifacts[0].path;
  const target = join(f.root, path); const bytes = fs.readFileSync(target);
  const externalFile = join(outside, "bytes.json"); fs.writeFileSync(externalFile, bytes);
  for (const substitute of [
    () => fs.symlinkSync(externalFile, target),
    () => fs.linkSync(externalFile, target),
    () => fs.mkdirSync(target),
  ]) {
    fs.rmSync(target); substitute();
    await assert.rejects(openStudyArtifactStore(f.options), /regular files/);
    fs.rmSync(target, { recursive: true }); fs.writeFileSync(target, bytes);
  }
  const runDirectory = join(f.root, "synthetic-0");
  fs.renameSync(runDirectory, join(outside, "run")); fs.symlinkSync(join(outside, "run"), runDirectory, "junction");
  await assert.rejects(openStudyArtifactStore(f.options), /real directories/);
});

test("file, total byte and inventory count limits bound intake before returning a reader", async (t) => {
  const f = fixture(t);
  const path = join(f.root, f.manifest.runs[0].artifacts[0].path);
  for (const length of [0, STUDY_ARTIFACT_STORE_LIMITS.file_bytes + 1]) {
    fs.truncateSync(path, length);
    await assert.rejects(openStudyArtifactStore(f.options), /artifact size/);
  }
  const many = fixture(t);
  many.manifest.runs[0].artifacts = Array.from({ length: STUDY_ARTIFACT_STORE_LIMITS.artifacts + 1 }, (_, i) => ({ path: `synthetic-0/file-${i}`, sha256: "a".repeat(64) }));
  await assert.rejects(openStudyArtifactStore(many.repinManifest()), /file count limit/);
  const big = fixture(t, ["A", "A", "A", "A"]);
  const bytes = Buffer.alloc(STUDY_ARTIFACT_STORE_LIMITS.file_bytes, 32);
  for (const run of big.manifest.runs) for (const ref of run.artifacts.filter((r) => !r.path.includes("event-"))) {
    big.files.set(ref.path, bytes); ref.sha256 = hash(bytes);
    for (const event of big.events.filter((e) => e.run_id === run.run_id)) for (const [key, value] of Object.entries(event.payload)) {
      if (value === ref.path) event.payload[key.replace(/_path$/u, "_sha256")] = ref.sha256;
    }
  }
  await assert.rejects(openStudyArtifactStore(big.persist()), /total byte limit/);
});

test("observed file and directory mutations are rejected and all opened descriptors close", async (t) => {
  for (const stage of ["before-descriptor", "during-read", "same-size-during-read", "directory-change"]) {
    const f = fixture(t); const target = join(f.root, "manifest.json");
    const realOpen = fs.openSync; const realRead = fs.readSync; const realClose = fs.closeSync;
    let targetFd; let opened = 0; let closed = 0; let changed = false;
    const openMock = t.mock.method(fs, "openSync", (...args) => {
      const fd = realOpen(...args); opened += 1;
      if (args[0] === target) {
        targetFd = fd;
        if (stage === "before-descriptor") fs.appendFileSync(target, " ");
      }
      return fd;
    });
    const readMock = t.mock.method(fs, "readSync", (...args) => {
      const count = realRead(...args);
      if (!changed && args[0] === targetFd && stage !== "before-descriptor") {
        changed = true;
        if (stage === "during-read") fs.appendFileSync(target, " ");
        if (stage === "same-size-during-read") fs.writeFileSync(target, Buffer.alloc(fs.statSync(target).size, 32));
        if (stage === "directory-change") fs.mkdirSync(join(f.root, "unexpected"));
      }
      return count;
    });
    const closeMock = t.mock.method(fs, "closeSync", (fd) => { closed += 1; return realClose(fd); });
    try {
      await assert.rejects(openStudyArtifactStore(f.options), /changed/);
      assert.equal(closed, opened);
    } finally { openMock.mock.restore(); readMock.mock.restore(); closeMock.mock.restore(); }
  }
});
