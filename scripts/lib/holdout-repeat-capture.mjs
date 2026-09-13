import { createHash } from "node:crypto";
import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { isAbsolute, join, relative, sep } from "node:path";

import { isSafeHoldoutPath, verifyRepositoryPin } from "./holdout.mjs";

const hash = (value) => createHash("sha256").update(value).digest("hex");
const encode = (value) => `${JSON.stringify(value, null, 2)}\n`;
const comparePaths = (a, b) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path));
const pinKeys = ["id", "url", "commit", "license_spdx", "license_file", "license_sha256", "scope", "retrieved_at", "tree_sha256", "environment", "tracked_files"];
const observationKeys = pinKeys.filter((key) => !["id", "license_spdx"].includes(key));
const failures = new Set(["HOLDOUT_CAPTURE_PIN_INVALID", "HOLDOUT_REPEAT_ADAPTER_INVALID", "HOLDOUT_REPEAT_CHECKOUT_INVALID", "HOLDOUT_REPEAT_OBSERVATION_INVALID", "HOLDOUT_REPEAT_PIN_MISMATCH"]);

function keys(value, expected) {
  return value !== null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === expected.length && expected.every((key) => Object.hasOwn(value, key));
}

function pinInvalid() {
  throw new Error("HOLDOUT_CAPTURE_PIN_INVALID");
}

function normalizePin(pin) {
  if (!keys(pin, pinKeys) || !pinKeys.filter((key) => !["environment", "tracked_files"].includes(key)).every((key) => typeof pin[key] === "string") || verifyRepositoryPin(pin, pin).length > 0 || !keys(pin.environment, ["node", "package_manager", "platform", "arch"])) pinInvalid();
  const { node, package_manager, platform, arch } = pin.environment;
  if (!/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/u.test(node) || !/^(npm|pnpm|yarn)@\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/u.test(package_manager) || typeof platform !== "string" || !/^[a-z0-9_]+$/u.test(platform) || typeof arch !== "string" || !/^[a-z0-9_]+$/u.test(arch)) pinInvalid();
  if (!Array.isArray(pin.tracked_files) || pin.tracked_files.length === 0 || pin.tracked_files.length > 100_000) pinInvalid();
  const paths = new Set();
  const aliases = new Map();
  const tracked = pin.tracked_files.map((entry) => {
    if (!keys(entry, ["path", "mode", "git_blob", "sha256"]) || !isSafeHoldoutPath(entry.path) || !["100644", "100755"].includes(entry.mode) || typeof entry.git_blob !== "string" || !/^[a-f0-9]{40}$/u.test(entry.git_blob) || typeof entry.sha256 !== "string" || !/^[a-f0-9]{64}$/u.test(entry.sha256) || paths.has(entry.path.toLowerCase())) pinInvalid();
    paths.add(entry.path.toLowerCase());
    return { path: entry.path, mode: entry.mode, git_blob: entry.git_blob, sha256: entry.sha256 };
  }).sort(comparePaths);
  for (const entry of tracked) {
    const parts = entry.path.split("/");
    for (let length = 1; length <= parts.length; length += 1) {
      const prefix = parts.slice(0, length).join("/");
      const key = prefix.toLowerCase();
      if ((aliases.has(key) && aliases.get(key) !== prefix) || (length < parts.length && paths.has(key))) pinInvalid();
      aliases.set(key, prefix);
    }
  }
  const license = tracked.find((entry) => entry.path === pin.license_file);
  if (!license || license.sha256 !== pin.license_sha256 || !tracked.some((entry) => entry.path.startsWith(`${pin.scope}/`)) || hash(tracked.map((entry) => `${entry.path}\0${entry.sha256}`).join("\n")) !== pin.tree_sha256) pinInvalid();
  // Explicit field order and UTF-8 path order make JSON independent of input order/locale.
  return {
    id: pin.id, url: pin.url, commit: pin.commit, license_spdx: pin.license_spdx,
    license_file: pin.license_file, license_sha256: pin.license_sha256, scope: pin.scope,
    retrieved_at: pin.retrieved_at, tree_sha256: pin.tree_sha256,
    environment: { node, package_manager, platform, arch }, tracked_files: tracked,
  };
}

/** Serialize complete capture evidence for review; this never approves selection or freezes D3. */
export function createRepositoryCaptureManifest(pin) {
  const body = { schema_version: 1, status: "proposed", repository: normalizePin(pin) };
  return { ...body, manifest_sha256: hash(encode(body)) };
}

/** The expected digest must come from the caller's separately reviewed immutable input. */
export function serializeRepositoryCaptureManifest(manifest, expectedSha256) {
  if (!keys(manifest, ["schema_version", "status", "repository", "manifest_sha256"]) || manifest.schema_version !== 1 || manifest.status !== "proposed" || !/^[a-f0-9]{64}$/u.test(expectedSha256)) throw new Error("HOLDOUT_CAPTURE_MANIFEST_INVALID");
  const canonical = createRepositoryCaptureManifest(manifest.repository);
  if (canonical.manifest_sha256 !== manifest.manifest_sha256 || canonical.manifest_sha256 !== expectedSha256) throw new Error("HOLDOUT_CAPTURE_MANIFEST_CHANGED");
  return encode(canonical);
}

/** Trusted host seams authorize the exact capture and supply a new Git adapter per attempt. */
export async function repeatRepositoryCapture({ manifest, expectedSha256, workspaceRoot, authorizeCapture, createAdapters }) {
  const canonical = JSON.parse(serializeRepositoryCaptureManifest(manifest, expectedSha256));
  if (typeof workspaceRoot !== "string" || !isAbsolute(workspaceRoot) || typeof authorizeCapture !== "function" || typeof createAdapters !== "function" || await realpath(workspaceRoot) !== workspaceRoot) throw new Error("HOLDOUT_REPEAT_CONFIGURATION_INVALID");
  if (await authorizeCapture(structuredClone(canonical)) !== true) throw new Error("HOLDOUT_REPEAT_NOT_AUTHORIZED");
  const directory = await mkdtemp(join(workspaceRoot, "holdout-repeat-"));
  const adaptersSeen = new Set();
  const attempts = [];
  let cleanup = { status: "completed" };
  try {
    for (let number = 1; number <= 2; number += 1) {
      const attemptRoot = join(directory, `attempt-${number}`);
      const attempt = { number, status: "failed", stage: "workspace" };
      try {
        await mkdir(attemptRoot);
        attempt.stage = "adapter";
        const adapters = await createAdapters({ workspaceRoot: attemptRoot, attempt: number });
        if (!adapters || typeof adapters.clone !== "function" || typeof adapters.inspect !== "function" || adaptersSeen.has(adapters)) throw new Error("HOLDOUT_REPEAT_ADAPTER_INVALID");
        adaptersSeen.add(adapters);
        const pin = canonical.repository;
        attempt.stage = "clone";
        const checkout = await adapters.clone({ url: pin.url, commit: pin.commit, scope: pin.scope });
        if (typeof checkout !== "string" || !isAbsolute(checkout)) throw new Error("HOLDOUT_REPEAT_CHECKOUT_INVALID");
        const inside = relative(attemptRoot, checkout);
        if (!isSafeHoldoutPath(inside.split(sep).join("/")) || await realpath(checkout) !== checkout) throw new Error("HOLDOUT_REPEAT_CHECKOUT_INVALID");
        attempt.stage = "inspect";
        const observation = await adapters.inspect(checkout, structuredClone(pin));
        if (!keys(observation, observationKeys)) throw new Error("HOLDOUT_REPEAT_OBSERVATION_INVALID");
        const observed = normalizePin({ id: pin.id, license_spdx: pin.license_spdx, ...observation });
        // Retain well-formed mismatches and their actual timestamps, never raw exception text.
        attempt.observation = observed;
        attempt.observation_sha256 = hash(encode(observed));
        attempt.stage = "compare";
        if (verifyRepositoryPin(pin, observed).length > 0 || encode({ ...observed, retrieved_at: pin.retrieved_at }) !== encode(pin)) throw new Error("HOLDOUT_REPEAT_PIN_MISMATCH");
        attempt.status = "matched";
      } catch (error) {
        attempt.failure_code = error instanceof Error && failures.has(error.message) ? error.message : "HOLDOUT_CAPTURE_OPERATION_FAILED";
      }
      attempts.push(attempt);
    }
  } finally {
    // Only this invocation's fresh directory is removed. Never expose filesystem errors.
    try {
      await rm(directory, { recursive: true, force: true });
    } catch {
      cleanup = { status: "failed", failure_code: "HOLDOUT_REPEAT_CLEANUP_FAILED" };
    }
  }
  const receipt = {
    schema_version: 1, scope: "technical-repeat-capture-only", research_closure: false,
    manifest_sha256: canonical.manifest_sha256,
    status: cleanup.status === "completed" && attempts.every((attempt) => attempt.status === "matched") ? "MATCHED" : "BLOCKED",
    attempts, cleanup,
  };
  return { ...receipt, receipt_sha256: hash(encode(receipt)) };
}
