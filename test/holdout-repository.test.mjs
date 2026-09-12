import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { access, chmod, link, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { createGitRepositoryAdapters, matchesTrackedExecutableMode } from "../scripts/lib/holdout-repository.mjs";
import { computeTrackedTreeSha256, materializeRepositoryPin } from "../scripts/lib/holdout.mjs";

const execute = promisify(execFile);
const gitExecutable = await (async () => {
  for (const directory of process.env.PATH.split(delimiter)) {
    const candidate = resolve(directory, process.platform === "win32" ? "git.exe" : "git");
    try { await access(candidate); return candidate; } catch { /* Try the next host PATH entry. */ }
  }
  throw new Error("Git is required for controlled repository integration fixtures");
})();
const hash = (content) => createHash("sha256").update(content).digest("hex");
const retrievedAt = "2026-09-12T03:04:05.123Z";

async function fixture(t) {
  const root = await realpath(await mkdtemp(join(tmpdir(), "holdout-controlled-")));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = join(root, "fixture");
  await mkdir(source);
  const git = async (...args) => (await execute(gitExecutable, ["-c", "user.name=Controlled fixture", "-c", "user.email=fixture@example.invalid", ...args], {
    cwd: source, env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, HOME: root, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_AUTHOR_DATE: retrievedAt, GIT_COMMITTER_DATE: retrievedAt },
  })).stdout.trim();
  await git("init", "--template=", "--initial-branch=main");
  await git("config", "core.autocrlf", "false");
  await git("config", "core.symlinks", "true");
  const files = [
    { path: "LICENSE", content: Buffer.from([0x4d, 0x49, 0x54, 0x0d, 0x0a, 0xff, 0x00]) },
    { path: "packages/api/index.ts", content: Buffer.from("export const fixture = true;\r\n") },
    { path: "packages/api/run.sh", content: Buffer.from("#!/bin/sh\nexit 77\n") },
    { path: ".gitattributes", content: Buffer.from("*.ts filter=fixture-filter\n") },
    { path: "other/Z.ts", content: Buffer.from("export {};\n") },
  ];
  for (const entry of files) {
    await mkdir(join(source, entry.path, ".."), { recursive: true });
    await writeFile(join(source, entry.path), entry.content);
  }
  await chmod(join(source, "packages/api/run.sh"), 0o755);
  await git("add", ".");
  await git("update-index", "--chmod=+x", "packages/api/run.sh");
  await git("commit", "-m", "Controlled local capture fixture");
  const commit = await git("rev-parse", "HEAD");
  const manager = join(root, "controlled-package-manager");
  await writeFile(manager, "process.stdout.write('11.16.0\\n');\n");
  const pin = {
    id: "controlled-local-fixture", url: "https://github.com/example/controlled-local-fixture", commit,
    scope: "packages/api", license_spdx: "MIT", license_file: "LICENSE", license_sha256: hash(files[0].content),
    tree_sha256: computeTrackedTreeSha256(files), retrieved_at: "2026-09-12T00:00:00Z",
    environment: { node: process.versions.node, package_manager: "pnpm@11.16.0" },
  };
  const workspaceRoot = join(root, "captures");
  const calls = [];
  const runLocal = async (executable, args, options) => {
    calls.push({ executable, args: [...args], options: structuredClone(options) });
    if (executable === gitExecutable && args.includes("fetch")) {
      assert.equal(args.at(-2), "origin");
      // Only this trusted test transport substitutes the local controlled source.
      args = [...args];
      args[args.length - 2] = source;
      options = { ...options, env: { ...options.env, GIT_ALLOW_PROTOCOL: "file" } };
    }
    return execute(executable, args, options);
  };
  const options = { workspaceRoot, packageManager: { name: "pnpm", executable: process.execPath, arguments: [manager] }, gitExecutable, run: runLocal, now: () => retrievedAt };
  return { root, source, git, files, pin, workspaceRoot, manager, calls, runLocal, options };
}

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
