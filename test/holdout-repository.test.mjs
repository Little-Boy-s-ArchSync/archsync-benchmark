import assert from "node:assert/strict";
import { chmod, link, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { createGitRepositoryAdapters, matchesTrackedExecutableMode } from "../scripts/lib/holdout-repository.mjs";
import { materializeRepositoryPin } from "../scripts/lib/holdout.mjs";
import { fixture, retrievedAt } from "../test-support/holdout-git-fixture.mjs";

test("controlled Git captures exact historical commit, raw bytes, modes, and measured provenance twice", async (t) => {
  const f = await fixture(t);
  await writeFile(join(f.source, "packages/api/index.ts"), "later branch content\n");
  await f.git("commit", "-am", "Move mutable branch after requested commit");
  await writeFile(join(f.source, "untracked"), "must never enter capture");
  const adapters = createGitRepositoryAdapters(f.options);
  const first = await materializeRepositoryPin(f.pin, adapters);
  const second = await materializeRepositoryPin(f.pin, adapters);
  assert.notEqual(first.checkout, second.checkout);
  assert.deepEqual(first.observation, second.observation);
  assert.deepEqual(await readFile(join(first.checkout, "LICENSE")), f.files[0].content);
  assert.deepEqual(await readFile(join(first.checkout, "packages/api/index.ts")), f.files[1].content);
  assert.equal(first.observation.retrieved_at, retrievedAt);
  assert.equal(first.observation.environment.platform, process.platform);
  assert.equal(first.observation.tracked_files.find((entry) => entry.path.endsWith("run.sh")).mode, "100755");
  first.observation.environment.node = "mutated caller observation";
  assert.equal((await adapters.inspect(first.checkout, f.pin)).environment.node, process.versions.node);
  for (const { options } of f.calls) {
    assert.equal(options.shell, false);
    assert.equal(options.env.GIT_ALLOW_PROTOCOL, "https");
    assert.equal(options.env.NODE_OPTIONS, undefined);
    assert.equal(options.env.GIT_CONFIG_COUNT, undefined);
    assert.equal(options.env.GIT_DIR, undefined);
    assert.equal(options.env.HTTPS_PROXY, undefined);
    assert.ok(!options.cwd.startsWith(first.checkout));
  }
  assert.ok(f.calls.some(({ args }) => args.includes("--no-tags")));
  assert.ok(f.calls.some(({ args }) => args.includes("--template=")));
});

test("capture rejects invalid configuration, descriptor, workspace alias, and unknown checkout", async (t) => {
  const f = await fixture(t);
  for (const change of [{ workspaceRoot: "relative" }, { gitExecutable: "git" }, { packageManager: null }, { packageManager: { name: "bash", executable: process.execPath } }, { packageManager: { name: "npm", executable: "npm" } }, { packageManager: { name: "pnpm", executable: process.execPath, arguments: "bad" } }, { packageManager: { name: "pnpm", executable: process.execPath, arguments: [null] } }]) assert.throws(() => createGitRepositoryAdapters({ ...f.options, ...change }), /CONFIGURATION_INVALID/);
  assert.doesNotThrow(() => createGitRepositoryAdapters({ ...f.options, packageManager: { name: "pnpm", executable: process.execPath } }));
  assert.equal(matchesTrackedExecutableMode(0o644, "100755", "win32"), true);
  assert.equal(matchesTrackedExecutableMode(0o644, "100755", "linux"), false);
  assert.equal(matchesTrackedExecutableMode(0o755, "100755", "linux"), true);
  const adapters = createGitRepositoryAdapters(f.options);
  for (const value of [null, { ...f.pin, url: "https://github.com/example/repo?bad" }, { ...f.pin, commit: "main" }, { ...f.pin, scope: "../escape" }]) await assert.rejects(adapters.clone(value), /DESCRIPTOR_INVALID/);
  await assert.rejects(adapters.inspect(f.source, f.pin), /CHECKOUT_INVALID/);
  const alias = join(f.root, "alias");
  await symlink(f.source, alias, "junction");
  await assert.rejects(createGitRepositoryAdapters({ ...f.options, workspaceRoot: alias }).clone(f.pin), /WORKSPACE_ALIAS/);
  const checkout = await adapters.clone(f.pin);
  for (const change of [{ url: "https://github.com/example/other" }, { commit: "a".repeat(40) }, { scope: "packages/other" }]) await assert.rejects(adapters.inspect(checkout, { ...f.pin, ...change }), /DESCRIPTOR_MISMATCH/);
  await assert.rejects(adapters.inspect(checkout, { ...f.pin, license_file: "../LICENSE" }), /LICENSE_INVALID/);
  await assert.rejects(adapters.inspect(checkout, { ...f.pin, license_file: "MISSING-LICENSE" }), /LICENSE_UNTRACKED/);
  await rm(checkout, { recursive: true });
  await symlink(f.source, checkout, "junction");
  await assert.rejects(adapters.inspect(checkout, f.pin), /CHECKOUT_INVALID/);
});

test("inspection rejects changed, missing, untracked, aliased, and executable-mode drift", async (t) => {
  const f = await fixture(t);
  const adapters = createGitRepositoryAdapters(f.options);
  for (const [mutate, failure] of [
    [async (dir) => writeFile(join(dir, "LICENSE"), "changed"), /BYTES_CHANGED/],
    [async (dir) => rm(join(dir, "LICENSE")), /FILES_MISSING/],
    [async (dir) => writeFile(join(dir, "extra"), "extra"), /FILE_INVALID/],
    [async (dir) => mkdir(join(dir, "extra-directory")), /UNTRACKED_DIRECTORY/],
    ...(process.platform === "win32" ? [] : [[async (dir) => chmod(join(dir, "LICENSE"), 0o755), /FILE_INVALID/]]),
    [async (dir) => { await rm(join(dir, "LICENSE")); await symlink(join(f.source, "LICENSE"), join(dir, "LICENSE")); }, /FILE_INVALID/],
    [async (dir) => { await rm(join(dir, "LICENSE")); await link(join(f.source, "LICENSE"), join(dir, "LICENSE")); }, /FILE_INVALID/],
    [async (dir) => { await rm(join(dir, "packages/api"), { recursive: true }); await symlink(join(f.source, "packages/api"), join(dir, "packages/api"), "junction"); }, /FILE_INVALID/],
  ]) {
    const checkout = await adapters.clone(f.pin);
    await mutate(checkout);
    await assert.rejects(adapters.inspect(checkout, f.pin), failure);
  }
});

test("unsafe tracked symlinks and submodules fail before materialization", async (t) => {
  const f = await fixture(t);
  await symlink("/outside/LICENSE", join(f.source, "unsafe-link"));
  await f.git("add", "unsafe-link");
  await f.git("commit", "-m", "Controlled unsafe symlink fixture");
  const adapters = createGitRepositoryAdapters(f.options);
  await assert.rejects(adapters.clone({ ...f.pin, commit: await f.git("rev-parse", "HEAD") }), /UNSAFE_TRACKED_ENTRY/);
  assert.deepEqual(await readdir(f.workspaceRoot), []);
  await f.git("rm", "unsafe-link");
  await f.git("update-index", "--add", "--cacheinfo", `160000,${f.pin.commit},vendor-submodule`);
  await f.git("commit", "-m", "Controlled gitlink fixture");
  await assert.rejects(adapters.clone({ ...f.pin, commit: await f.git("rev-parse", "HEAD") }), /UNSAFE_TRACKED_ENTRY/);
});

test("capture fails closed on transport, tree, scope, byte, clock, and environment failures and removes partial output", async (t) => {
  const f = await fixture(t);
  const oid = "a".repeat(40);
  const row = (path, size = 1) => `100644 blob ${oid} ${size}\t${path}\0`;
  const mutations = [
    { target: "fetch", error: new Error("CONTROLLED_FETCH_FAILURE"), failure: /FETCH_FAILURE/ },
    { target: "rev-parse", stdout: `${"f".repeat(40)}\n`, failure: /COMMIT_MISMATCH/ },
    { target: "ls-tree", stdout: "", failure: /TREE_INVALID/ },
    { target: "ls-tree", stdout: "unterminated", failure: /TREE_INVALID/ },
    { target: "ls-tree", stdout: row("x").repeat(100_001), failure: /TREE_INVALID/ },
    { target: "ls-tree", stdout: Buffer.from([0xff, 0]), failure: /encoded data/ },
    { target: "ls-tree", stdout: row("../escape"), failure: /UNSAFE_TRACKED_ENTRY/ },
    { target: "ls-tree", stdout: row(".git/config"), failure: /UNSAFE_TRACKED_ENTRY/ },
    { target: "ls-tree", stdout: row("A/x") + row("a/y"), failure: /PATH_COLLISION/ },
    { target: "ls-tree", stdout: row("packages/api/x", 64 * 1024 * 1024 + 1), failure: /SIZE_LIMIT/ },
    { target: "ls-tree", stdout: row("packages/apix/x"), failure: /SCOPE_MISSING/ },
    { target: "cat-file", stdout: "wrong size", failure: /BLOB_SIZE_MISMATCH/ },
    { target: "--version", stdout: "not-a-version", failure: /PACKAGE_MANAGER_VERSION_INVALID/ },
  ];
  for (const mutation of mutations) {
    const adapters = createGitRepositoryAdapters({ ...f.options, run: async (executable, args, options) => {
      if (args.includes(mutation.target)) {
        if (mutation.error) throw mutation.error;
        return { stdout: Buffer.from(mutation.stdout) };
      }
      return f.runLocal(executable, args, options);
    } });
    await assert.rejects(adapters.clone(f.pin), mutation.failure);
    assert.deepEqual(await readdir(f.workspaceRoot), []);
  }
  await assert.rejects(createGitRepositoryAdapters({ ...f.options, now: () => "not-a-time" }).clone(f.pin), /TIME_INVALID/);
  assert.deepEqual(await readdir(f.workspaceRoot), []);
});

test("production command implementation and clock capture locally and fail on missing commits without network", async (t) => {
  const f = await fixture(t);
  const absentExecutable = createGitRepositoryAdapters({ ...f.options, run: undefined, gitExecutable: join(f.root, "missing-git-executable") });
  await assert.rejects(absentExecutable.clone(f.pin), /ENOENT/);
  const adapters = createGitRepositoryAdapters({ ...f.options, now: undefined });
  await assert.rejects(adapters.clone({ ...f.pin, commit: "f".repeat(40) }));
  assert.deepEqual(await readdir(f.workspaceRoot), []);
  const checkout = await adapters.clone(f.pin);
  const observed = await adapters.inspect(checkout, f.pin);
  assert.ok(Number.isFinite(Date.parse(observed.retrieved_at)));
});
