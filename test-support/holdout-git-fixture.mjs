import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { access, chmod, mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { promisify } from "node:util";
import { computeTrackedTreeSha256 } from "../scripts/lib/holdout.mjs";

const execute = promisify(execFile);
const gitExecutable = await (async () => {
  for (const directory of process.env.PATH.split(delimiter)) {
    const candidate = resolve(directory, process.platform === "win32" ? "git.exe" : "git");
    try { await access(candidate); return candidate; } catch { /* Try the next host PATH entry. */ }
  }
  throw new Error("Git is required for controlled repository integration fixtures");
})();
const hash = (content) => createHash("sha256").update(content).digest("hex");
export const retrievedAt = "2026-09-12T03:04:05.123Z";

export async function fixture(t) {
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
