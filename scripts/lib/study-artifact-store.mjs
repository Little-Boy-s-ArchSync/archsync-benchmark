import { createHash } from "node:crypto";
import fs from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { validateInstrumentation, validateInstrumentationArtifacts } from "./measurement-study.mjs";

export const STUDY_ARTIFACT_STORE_LIMITS = Object.freeze({
  file_bytes: 4 * 1024 * 1024,
  total_bytes: 64 * 1024 * 1024,
  artifacts: 4096,
  events: 10000,
});

function fail(message) {
  throw new Error(`STUDY_ARTIFACT_STORE_INVALID: ${message}`);
}

function object(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value, keys) {
  return object(value) && Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
}

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function validSha(value) {
  return typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);
}

function safePath(value) {
  return typeof value === "string" && value.length <= 1024 && /^[A-Za-z0-9_./-]+$/u.test(value)
    && value.split("/").every((part) => part.length > 0 && part.length <= 255 && part !== "." && part !== ".."
      && !part.endsWith(".") && !/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/iu.test(part));
}

function reference(value) {
  return exactKeys(value, ["path", "sha256"]) && safePath(value.path) && validSha(value.sha256);
}

function sameStat(left, right) {
  return ["dev", "ino", "mode", "nlink", "size", "mtimeNs", "ctimeNs"].every((key) => left[key] === right[key]);
}

function eventReferences(event) {
  const payload = event.payload;
  const references = [event.artifact];
  const add = (path, sha256) => references.push({ path, sha256 });
  if (event.type === "run_started") for (const key of ["environment", "task_suite", "study_manifest"]) add(payload[`${key}_path`], payload[`${key}_sha256`]);
  if (event.type === "baseline_recorded") add(payload.tree_path, payload.tree_sha256);
  if (event.type === "prompt_recorded") {
    add(payload.prompt_path, payload.prompt_sha256);
    add(payload.output_path, payload.response_sha256);
    add(payload.provider_config_path, payload.provider_config_sha256);
    add(payload.redaction.audit_path, payload.redaction.audit_sha256);
  }
  return references;
}

// This portable intake requires a trusted, quiescent local filesystem. Metadata
// checks detect observed changes; they are not an openat-style hostile-writer
// sandbox. Once intake succeeds, the reader never consults that filesystem again.
export async function openStudyArtifactStore(options) {
  if (!exactKeys(options, ["root", "manifest", "event_log_sha256"]) || typeof options.root !== "string" || !isAbsolute(options.root)
    || !reference(options.manifest) || !validSha(options.event_log_sha256)) fail("absolute root and externally pinned manifest/event-log digests are required");
  const root = resolve(options.root);
  const pinnedManifest = { ...options.manifest };
  const pinnedLogSha = options.event_log_sha256;
  const directories = new Map();
  let totalBytes = 0;

  function checkDirectory(path) {
    const stat = fs.lstatSync(path, { bigint: true });
    if (!stat.isDirectory() || stat.isSymbolicLink()) fail("artifact root and ancestors must be real directories");
    if (directories.has(path) && !sameStat(directories.get(path), stat)) fail("artifact directory changed during intake");
    directories.set(path, stat);
  }

  checkDirectory(root);
  if (fs.realpathSync.native(root) !== root) fail("artifact root must be canonical without symlink aliases");

  function readPinned(ref) {
    const parts = ref.path.split("/");
    let parent = root;
    checkDirectory(parent);
    for (const part of parts.slice(0, -1)) {
      parent = join(parent, part);
      checkDirectory(parent);
    }
    const path = join(root, ...parts);
    const before = fs.lstatSync(path, { bigint: true });
    if (!before.isFile() || before.nlink !== 1n) fail("artifacts must be regular files with one link");
    if (before.size <= 0n || before.size > BigInt(STUDY_ARTIFACT_STORE_LIMITS.file_bytes)) fail("artifact size is empty or exceeds the file limit");
    if (totalBytes + Number(before.size) > STUDY_ARTIFACT_STORE_LIMITS.total_bytes) fail("artifact store exceeds the total byte limit");
    // Undefined platform flags coerce to zero. Pre/post lstat + descriptor identity
    // checks remain mandatory on every platform, including Windows.
    const fd = fs.openSync(path, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    let bytes;
    try {
      if (!sameStat(before, fs.fstatSync(fd, { bigint: true }))) fail("artifact changed before descriptor capture");
      const buffer = Buffer.alloc(Number(before.size) + 1);
      let length = 0;
      while (length < buffer.length) {
        const count = fs.readSync(fd, buffer, length, buffer.length - length, length);
        if (count === 0) break;
        length += count;
      }
      if (length !== Number(before.size) || !sameStat(before, fs.fstatSync(fd, { bigint: true }))
        || !sameStat(before, fs.lstatSync(path, { bigint: true }))) fail("artifact changed during capture");
      bytes = buffer.subarray(0, length);
    } finally {
      fs.closeSync(fd);
    }
    for (const directory of directories.keys()) checkDirectory(directory);
    if (digest(bytes) !== ref.sha256) fail("artifact SHA-256 mismatch");
    totalBytes += bytes.length;
    return bytes;
  }

  function parsePinned(ref) {
    const bytes = readPinned(ref);
    // Reject invalid UTF-8 instead of letting replacement characters create a
    // different JSON interpretation of hash-bound source bytes.
    if (!Buffer.from(bytes.toString("utf8")).equals(bytes)) fail("JSON artifacts require valid UTF-8");
    try {
      return JSON.parse(bytes.toString("utf8"));
    } catch {
      return fail("manifest and event log must contain JSON");
    }
  }

  const manifest = parsePinned(pinnedManifest);
  if (!exactKeys(manifest, ["schema_version", "kind", "event_log", "runs"]) || manifest.schema_version !== 1 || manifest.kind !== "study-artifact-store"
    || !reference(manifest.event_log) || manifest.event_log.sha256 !== pinnedLogSha || !Array.isArray(manifest.runs) || manifest.runs.length === 0) fail("manifest must bind the separately pinned event log and run inventory");

  const paths = new Set([pinnedManifest.path.toLowerCase()]);
  function uniquePath(path) {
    const key = path.toLowerCase();
    if (paths.has(key)) fail("store paths must be unique without case aliases or cross-run reuse");
    paths.add(key);
  }
  uniquePath(manifest.event_log.path);
  const runs = new Map();
  const attempts = new Set();
  const inventory = new Map();
  for (const run of manifest.runs) {
    if (!exactKeys(run, ["run_id", "attempt_id", "task_id", "condition", "artifacts"]) || ![run.run_id, run.attempt_id, run.task_id].every((value) => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]*$/u.test(value))
      || !["A", "B", "C", "D"].includes(run.condition) || !Array.isArray(run.artifacts) || run.artifacts.length === 0 || runs.has(run.run_id) || attempts.has(run.attempt_id)) fail("manifest requires unique stable run/attempt identities and artifact inventories");
    runs.set(run.run_id, run);
    attempts.add(run.attempt_id);
    for (const ref of run.artifacts) {
      if (!reference(ref)) fail("run inventory contains an invalid artifact reference");
      uniquePath(ref.path);
      inventory.set(ref.path, { ...ref, run_id: run.run_id });
    }
  }
  if (inventory.size > STUDY_ARTIFACT_STORE_LIMITS.artifacts) fail("artifact inventory exceeds the file count limit");
  const events = parsePinned(manifest.event_log);
  if (!Array.isArray(events) || events.length > STUDY_ARTIFACT_STORE_LIMITS.events) fail("event log must be an array within the event limit");
  const issues = validateInstrumentation(events);
  if (issues.length > 0) fail(`event log is invalid: ${issues.join("; ")}`);
  const seenRuns = new Set();
  const referenced = new Set();
  for (const event of events) {
    const run = runs.get(event.run_id);
    if (!run || ["attempt_id", "task_id", "condition"].some((key) => event[key] !== run[key])) fail("event log does not match the pinned run/attempt inventory");
    seenRuns.add(event.run_id);
    for (const ref of eventReferences(event)) {
      const stored = inventory.get(ref?.path);
      if (!reference(ref) || !stored || stored.sha256 !== ref.sha256 || stored.run_id !== event.run_id) fail("event artifact does not match its run-owned inventory entry");
      referenced.add(ref.path);
    }
  }
  if (seenRuns.size !== runs.size || referenced.size !== inventory.size) fail("manifest contains an unobserved run or unreferenced artifact");
  const captured = new Map();
  for (const ref of inventory.values()) captured.set(ref.path, readPinned({ path: ref.path, sha256: ref.sha256 }));
  for (const directory of directories.keys()) checkDirectory(directory);
  const readArtifact = async (path) => {
    if (!safePath(path) || !captured.has(path)) fail("reader accepts only the exact captured artifact inventory");
    return Buffer.from(captured.get(path));
  };
  const artifactIssues = await validateInstrumentationArtifacts(events, readArtifact);
  if (artifactIssues.length > 0) fail(`artifact verification failed: ${artifactIssues.join("; ")}`);
  const receipt = Object.freeze({
    schema_version: 1,
    verification: "content-bound-local-snapshot",
    manifest_sha256: pinnedManifest.sha256,
    event_log_sha256: pinnedLogSha,
    run_count: runs.size,
    event_count: events.length,
    artifact_count: captured.size,
    bytes_captured: totalBytes,
    authenticated_capture: false,
    human_approval_verified: false,
  });
  return Object.freeze({
    readArtifact,
    get events() { return structuredClone(events); },
    get manifest() { return structuredClone(manifest); },
    receipt,
  });
}
