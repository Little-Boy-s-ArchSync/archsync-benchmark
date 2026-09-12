import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { promises } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { mkdir, readFile, readdir, symlink, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import test from "node:test";

import { createGitRepositoryAdapters } from "../scripts/lib/holdout-repository.mjs";
import { createRepositoryCaptureManifest, repeatRepositoryCapture, serializeRepositoryCaptureManifest } from "../scripts/lib/holdout-repeat-capture.mjs";
import { fixture } from "../test-support/holdout-git-fixture.mjs";

const hash = (value) => createHash("sha256").update(value).digest("hex");
const encode = (value) => `${JSON.stringify(value, null, 2)}\n`;
const treeHash = (files) => hash([...files].sort((a, b) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path))).map((entry) => `${entry.path}\0${entry.sha256}`).join("\n"));

async function prepared(t) {
  const f = await fixture(t);
  f.gitOptions = f.options;
  const initial = createGitRepositoryAdapters(f.options);
  const checkout = await initial.clone(f.pin);
  const observed = await initial.inspect(checkout, f.pin);
  const pin = { ...f.pin, ...observed };
  const manifest = createRepositoryCaptureManifest(pin);
  const workspaceRoot = join(f.root, "repeats");
  await mkdir(workspaceRoot);
  const options = {
    manifest, expectedSha256: manifest.manifest_sha256, workspaceRoot,
    // Explicitly test-only transport authorization; never a human selection decision.
    authorizeCapture: async () => true,
    createAdapters: ({ workspaceRoot }) => createGitRepositoryAdapters({ ...f.gitOptions, workspaceRoot }),
  };
  return { ...f, pin, manifest, options };
}

test("complete manifests canonicalize field/path order, bind all metadata and reject changed immutable inputs", async (t) => {
  const f = await prepared(t);
  const reverse = Object.fromEntries(Object.entries(f.pin).reverse());
  reverse.environment = Object.fromEntries(Object.entries(reverse.environment).reverse());
  reverse.tracked_files = reverse.tracked_files.toReversed().map((entry) => Object.fromEntries(Object.entries(entry).reverse()));
  assert.deepEqual(createRepositoryCaptureManifest(reverse), f.manifest);
  const bytes = serializeRepositoryCaptureManifest(f.manifest, f.manifest.manifest_sha256);
  assert.ok(bytes.endsWith("\n"));
  assert.deepEqual(JSON.parse(bytes), f.manifest);
  const changed = structuredClone(f.manifest);
  changed.repository.license_spdx = "BSD-3-Clause";
  assert.throws(() => serializeRepositoryCaptureManifest(changed, f.manifest.manifest_sha256), /MANIFEST_CHANGED/);
  const rehashed = createRepositoryCaptureManifest(changed.repository);
  assert.throws(() => serializeRepositoryCaptureManifest(rehashed, f.manifest.manifest_sha256), /MANIFEST_CHANGED/);
  for (const manifest of [null, [], {}, { ...f.manifest, extra: true }, { ...f.manifest, schema_version: 2 }, { ...f.manifest, status: "frozen" }]) assert.throws(() => serializeRepositoryCaptureManifest(manifest, f.manifest.manifest_sha256), /MANIFEST_INVALID/);
  assert.throws(() => serializeRepositoryCaptureManifest(f.manifest, "unreviewed"), /MANIFEST_INVALID/);
});

test("complete pin validation rejects omitted, unsafe, aliased, inconsistent and untyped fields", async (t) => {
  const f = await prepared(t);
  const changes = [
    () => null, (p) => ({ ...p, extra: true }), (p) => ({ ...p, commit: [p.commit] }),
    (p) => ({ ...p, id: "" }), (p) => ({ ...p, environment: { node: p.environment.node, package_manager: p.environment.package_manager } }),
    ...[{ node: "latest" }, { package_manager: "bash@1.2.3" }, { platform: undefined }, { platform: "bad platform" }, { arch: undefined }, { arch: "bad arch" }].map((environment) => (p) => ({ ...p, environment: { ...p.environment, ...environment } })),
    ...[null, [], new Array(100_001), [null], [{ path: "x" }]].map((tracked_files) => (p) => ({ ...p, tracked_files })),
    ...[{ path: "../escape" }, { mode: "120000" }, { git_blob: "bad" }, { git_blob: ["a".repeat(40)] }, { sha256: "bad" }, { sha256: ["a".repeat(64)] }].map((change) => (p) => ({ ...p, tracked_files: [{ ...p.tracked_files[0], ...change }, ...p.tracked_files.slice(1)] })),
    (p) => ({ ...p, tracked_files: [...p.tracked_files, p.tracked_files[0]] }),
    (p) => ({ ...p, tracked_files: [...p.tracked_files, { ...p.tracked_files[0], path: "license" }] }),
    (p) => ({ ...p, tracked_files: [...p.tracked_files, { ...p.tracked_files[0], path: "Packages/elsewhere.ts" }] }),
    (p) => ({ ...p, tracked_files: [...p.tracked_files, { ...p.tracked_files[0], path: "packages" }] }),
    (p) => ({ ...p, license_file: "missing" }), (p) => ({ ...p, license_sha256: "0".repeat(64) }),
    (p) => ({ ...p, scope: "missing" }), (p) => ({ ...p, tree_sha256: "0".repeat(64) }),
  ];
  for (const change of changes) assert.throws(() => createRepositoryCaptureManifest(change(structuredClone(f.pin))), /PIN_INVALID/);
});

test("real local Git repeats use distinct adapters/object stores, preserve exact bytes and clean only owned scratch", async (t) => {
  const f = await prepared(t);
  await writeFile(join(f.source, "packages/api/index.ts"), "different branch bytes\n");
  await f.git("commit", "-am", "Advance local fixture branch");
  const attempts = [];
  const callsBefore = f.calls.length;
  const run = () => repeatRepositoryCapture({ ...f.options, createAdapters: (context) => {
    attempts.push(context);
    return createGitRepositoryAdapters({ ...f.gitOptions, ...context, now: () => `2026-09-12T03:04:0${context.attempt + 5}.123Z` });
  } });
  const result = await run();
  assert.equal(result.status, "MATCHED");
  assert.equal(result.research_closure, false);
  assert.equal(result.attempts.length, 2);
  assert.ok(result.attempts.every((attempt) => attempt.status === "matched"));
  assert.notEqual(attempts[0].workspaceRoot, attempts[1].workspaceRoot);
  assert.equal(f.calls.slice(callsBefore).filter((call) => call.args.includes("fetch")).length, 2);
  assert.notEqual(result.attempts[0].observation.retrieved_at, result.attempts[1].observation.retrieved_at);
  for (const attempt of result.attempts) {
    assert.equal(attempt.observation.commit, f.pin.commit);
    assert.equal(attempt.observation.tree_sha256, f.pin.tree_sha256);
    assert.equal(attempt.observation.license_sha256, f.pin.license_sha256);
    assert.deepEqual(attempt.observation.tracked_files, f.manifest.repository.tracked_files);
    assert.equal(attempt.observation_sha256, hash(encode(attempt.observation)));
  }
  const { receipt_sha256, ...body } = result;
  assert.equal(receipt_sha256, hash(encode(body)));
  assert.ok(!JSON.stringify(result).includes(f.root));
  assert.deepEqual(await readdir(f.options.workspaceRoot), []);
  assert.deepEqual(await run(), result, "scratch paths do not enter canonical receipts");
  assert.equal(await readFile(join(f.source, "packages/api/index.ts"), "utf8"), "different branch bytes\n");
});

test("authorization and manifest/configuration refusals happen before any factory or capture", async (t) => {
  const f = await prepared(t);
  let calls = 0;
  const options = { ...f.options, createAdapters: () => { calls += 1; } };
  for (const result of [false, null, "approved", {}]) await assert.rejects(repeatRepositoryCapture({ ...options, authorizeCapture: () => result }), /NOT_AUTHORIZED/);
  for (const change of [{ workspaceRoot: null }, { workspaceRoot: "." }, { authorizeCapture: null }, { createAdapters: null }]) await assert.rejects(repeatRepositoryCapture({ ...options, ...change }), /CONFIGURATION_INVALID/);
  const alias = join(f.root, "workspace-alias");
  await symlink(f.options.workspaceRoot, alias, process.platform === "win32" ? "junction" : "dir");
  await assert.rejects(repeatRepositoryCapture({ ...options, workspaceRoot: alias }), /CONFIGURATION_INVALID/);
  await assert.rejects(repeatRepositoryCapture({ ...options, expectedSha256: "0".repeat(64) }), /MANIFEST_CHANGED/);
  assert.equal(calls, 0);
  assert.deepEqual(await readdir(f.options.workspaceRoot), []);
});

test("caller and trusted-seam mutations cannot change the snapshotted reviewed pin", async (t) => {
  const f = await prepared(t);
  const result = await repeatRepositoryCapture({ ...f.options, authorizeCapture: (input) => {
    input.repository.commit = "0".repeat(40);
    f.manifest.repository.commit = "0".repeat(40);
    return true;
  }, createAdapters: ({ workspaceRoot }) => {
    const adapters = createGitRepositoryAdapters({ ...f.gitOptions, workspaceRoot });
    return { clone: adapters.clone, inspect: async (checkout, pin) => {
      const observation = await adapters.inspect(checkout, pin);
      pin.environment.node = "99.0.0";
      return observation;
    } };
  } });
  assert.equal(result.status, "MATCHED");
  assert.ok(result.attempts.every((attempt) => attempt.observation.commit === f.pin.commit));
});

test("complete observation comparison retains every mismatch including platform, architecture, modes and blob IDs", async (t) => {
  const f = await prepared(t);
  const changes = [
    (o) => { o.url = "https://github.com/example/other"; }, (o) => { o.commit = "0".repeat(40); },
    (o) => { o.scope = "other"; }, (o) => { o.retrieved_at = "2020-01-01T00:00:00Z"; },
    ...[{ node: "99.0.0" }, { package_manager: "npm@1.2.3" }, { platform: "other" }, { arch: "other" }].map((change) => (o) => Object.assign(o.environment, change)),
    (o) => { const file = o.tracked_files.find((entry) => entry.path === "other/Z.ts"); o.license_file = file.path; o.license_sha256 = file.sha256; },
    (o) => { o.tracked_files[0].mode = o.tracked_files[0].mode === "100644" ? "100755" : "100644"; },
    (o) => { o.tracked_files[0].git_blob = "0".repeat(40); },
    (o) => { const file = o.tracked_files.find((entry) => entry.path === "other/Z.ts"); file.sha256 = "0".repeat(64); o.tree_sha256 = treeHash(o.tracked_files); },
  ];
  for (const mutate of changes) {
    const result = await repeatRepositoryCapture({ ...f.options, createAdapters: ({ workspaceRoot, attempt }) => {
      const adapters = createGitRepositoryAdapters({ ...f.gitOptions, workspaceRoot });
      return { clone: adapters.clone, inspect: async (...args) => {
        const observed = await adapters.inspect(...args);
        if (attempt === 1) mutate(observed);
        return observed;
      } };
    } });
    assert.equal(result.status, "BLOCKED");
    assert.equal(result.attempts[0].failure_code, "HOLDOUT_REPEAT_PIN_MISMATCH");
    assert.ok(result.attempts[0].observation);
    assert.equal(result.attempts[1].status, "matched");
    assert.deepEqual(await readdir(f.options.workspaceRoot), []);
  }
});

test("transport, inspection and malformed-observation failures stay failed and never leak raw exception text", async (t) => {
  const f = await prepared(t);
  const modes = ["transport", "bytes", "missing", "malformed", "inventory", "nonerror"];
  for (const mode of modes) {
    const result = await repeatRepositoryCapture({ ...f.options, createAdapters: ({ workspaceRoot, attempt }) => {
      const adapters = createGitRepositoryAdapters({ ...f.gitOptions, workspaceRoot });
      return { clone: async (pin) => {
        if (mode === "transport") throw new Error("private-token-value /sensitive/host/path");
        if (mode === "nonerror") throw "private-token-value";
        const checkout = await adapters.clone(pin);
        if (mode === "bytes") await writeFile(join(checkout, "LICENSE"), "modified captured bytes");
        return checkout;
      }, inspect: async (...args) => {
        const observed = await adapters.inspect(...args);
        if (mode === "missing") delete observed.tracked_files;
        if (mode === "malformed") return null;
        if (mode === "inventory") observed.tracked_files = [];
        return observed;
      } };
    } });
    assert.equal(result.status, "BLOCKED");
    assert.equal(result.attempts.length, 2);
    assert.ok(result.attempts.every((attempt) => attempt.status === "failed"));
    assert.ok(!JSON.stringify(result).includes("private-token-value"));
    assert.ok(!JSON.stringify(result).includes("/sensitive"));
    assert.deepEqual(await readdir(f.options.workspaceRoot), []);
  }
});

test("factory reuse, missing operations and checkout escape/alias are refused without deleting external paths", async (t) => {
  const f = await prepared(t);
  let reused;
  const result = await repeatRepositoryCapture({ ...f.options, createAdapters: ({ workspaceRoot }) => {
    reused ??= createGitRepositoryAdapters({ ...f.gitOptions, workspaceRoot });
    return reused;
  } });
  assert.equal(result.attempts[0].status, "matched");
  assert.equal(result.attempts[1].failure_code, "HOLDOUT_REPEAT_ADAPTER_INVALID");
  for (const factory of [() => null, () => ({}), () => ({ clone() {} }), () => { throw new Error("factory failure"); }]) {
    const result = await repeatRepositoryCapture({ ...f.options, createAdapters: factory });
    assert.equal(result.status, "BLOCKED");
    assert.ok(result.attempts.every((attempt) => attempt.stage === "adapter"));
  }
  for (const path of [null, "relative", f.source, "root", "alias", "relative-alias"]) {
    const result = await repeatRepositoryCapture({ ...f.options, createAdapters: async ({ workspaceRoot }) => {
      const alias = join(workspaceRoot, "alias");
      if (path === "alias") await symlink(f.source, alias, process.platform === "win32" ? "junction" : "dir");
      return { clone: () => path === "root" ? workspaceRoot : path === "alias" ? alias : path === "relative-alias" ? join(workspaceRoot, relative(workspaceRoot, f.source)) : path, inspect: () => { assert.fail("escaped checkout must not be inspected"); } };
    } });
    assert.ok(result.attempts.every((attempt) => attempt.failure_code === "HOLDOUT_REPEAT_CHECKOUT_INVALID"));
    assert.equal(await readFile(join(f.source, "LICENSE"), "hex"), f.files[0].content.toString("hex"));
  }
});

test("cleanup failure retains both journals in a hashed blocked receipt without filesystem paths", async (t) => {
  const f = await prepared(t);
  const originalRm = promises.rm;
  const removal = t.mock.method(promises, "rm", async (path, options) => {
    if (dirname(path) === f.options.workspaceRoot) {
      const error = new Error(`EACCES: cannot remove ${path}/private-name`);
      Object.assign(error, { code: "EACCES", path, syscall: "rmdir" });
      throw error;
    }
    return originalRm(path, options);
  });
  syncBuiltinESMExports();
  try {
    const result = await repeatRepositoryCapture(f.options);
    assert.equal(result.status, "BLOCKED");
    assert.deepEqual(result.cleanup, { status: "failed", failure_code: "HOLDOUT_REPEAT_CLEANUP_FAILED" });
    assert.equal(result.attempts.length, 2);
    assert.ok(result.attempts.every((attempt) => attempt.status === "matched"));
    const { receipt_sha256, ...body } = result;
    assert.equal(receipt_sha256, hash(encode(body)));
    assert.ok(!JSON.stringify(result).includes(f.root));
    assert.ok(!JSON.stringify(result).includes("private-name"));
    assert.equal((await readdir(f.options.workspaceRoot)).length, 1);
  } finally {
    removal.mock.restore();
    syncBuiltinESMExports();
  }
});
