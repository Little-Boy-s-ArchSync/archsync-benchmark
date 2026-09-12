import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { delimiter, dirname, isAbsolute, join } from "node:path";
import { promisify } from "node:util";

import { computeTrackedTreeSha256, isHoldoutRepositoryUrl, isHoldoutTimestamp, isSafeHoldoutPath } from "./holdout.mjs";

const execute = promisify(execFile);
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const maxBytes = 64 * 1024 * 1024;

function descriptor(value) {
  if (!value || !isHoldoutRepositoryUrl(value.url) || !/^[a-f0-9]{40}$/u.test(value.commit) || !isSafeHoldoutPath(value.scope)) throw new Error("HOLDOUT_CAPTURE_DESCRIPTOR_INVALID");
}

export function matchesTrackedExecutableMode(actualMode, trackedMode, platform = process.platform) {
  // Windows does not expose POSIX executable bits; preserve the Git mode in provenance.
  return platform === "win32" || Boolean(actualMode & 0o111) === (trackedMode === "100755");
}

// This transport seam is trusted host infrastructure, never repository content.
export function createGitRepositoryAdapters({ workspaceRoot, packageManager, gitExecutable, run = execute, now = () => new Date().toISOString() }) {
  if (!isAbsolute(workspaceRoot) || !isAbsolute(gitExecutable) || !["npm", "pnpm", "yarn"].includes(packageManager?.name) || !isAbsolute(packageManager.executable)) throw new Error("HOLDOUT_CAPTURE_CONFIGURATION_INVALID");
  const manager = structuredClone(packageManager);
  const managerArguments = manager.arguments ?? [];
  if (!Array.isArray(managerArguments) || managerArguments.some((arg) => typeof arg !== "string")) throw new Error("HOLDOUT_CAPTURE_CONFIGURATION_INVALID");
  const captures = new Map();

  async function command(executable, args, cwd) {
    // Do not inherit Git overrides, credentials, proxies, Node hooks, or package configuration.
    const { stdout } = await run(executable, args, {
      cwd, encoding: "buffer", shell: false, timeout: 120_000, maxBuffer: maxBytes,
      env: {
        PATH: [dirname(process.execPath), "/usr/bin", "/bin"].join(delimiter), HOME: cwd, XDG_CONFIG_HOME: cwd,
        SystemRoot: process.env.SystemRoot,
        LC_ALL: "C", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null",
        GIT_TERMINAL_PROMPT: "0", GIT_ALLOW_PROTOCOL: "https", GIT_NO_REPLACE_OBJECTS: "1",
      },
    });
    return Buffer.from(stdout);
  }

  async function git(args, cwd) {
    return command(gitExecutable, ["-c", "core.hooksPath=/dev/null", "-c", "credential.helper=", "-c", "http.followRedirects=false", ...args], cwd);
  }

  return {
    async clone(input) {
      descriptor(input);
      const pin = structuredClone(input);
      await mkdir(workspaceRoot, { recursive: true });
      if ((await realpath(workspaceRoot)) !== workspaceRoot) throw new Error("HOLDOUT_CAPTURE_WORKSPACE_ALIAS");
      const container = await mkdtemp(join(workspaceRoot, "holdout-"));
      try {
        const objects = join(container, "objects.git");
        const checkout = join(container, "source");
        await git(["init", "--bare", "--template=", objects], container);
        await git(["--git-dir", objects, "remote", "add", "origin", pin.url], container);
        await git(["--git-dir", objects, "fetch", "--no-tags", "--depth=1", "origin", pin.commit], container);
        const commit = (await git(["--git-dir", objects, "rev-parse", "--verify", "FETCH_HEAD^{commit}"], container)).toString("utf8").trim();
        if (commit !== pin.commit) throw new Error("HOLDOUT_CAPTURE_COMMIT_MISMATCH");
        const tree = await git(["--git-dir", objects, "ls-tree", "-rlz", "--full-tree", commit], container);
        const rows = new TextDecoder("utf-8", { fatal: true }).decode(tree).split("\0");
        if (rows.pop() !== "" || rows.length === 0 || rows.length > 100_000) throw new Error("HOLDOUT_CAPTURE_TREE_INVALID");
        const aliases = new Map();
        let totalBytes = 0;
        const entries = rows.map((row) => {
          const match = /^(100644|100755) blob ([a-f0-9]{40}) +([0-9]+)\t(.+)$/u.exec(row);
          if (!match || !isSafeHoldoutPath(match[4])) throw new Error("HOLDOUT_CAPTURE_UNSAFE_TRACKED_ENTRY");
          const [, mode, oid, size, path] = match;
          const parts = path.split("/");
          for (let end = 1; end <= parts.length; end += 1) {
            const prefix = parts.slice(0, end).join("/");
            const key = prefix.toLowerCase();
            if (aliases.has(key) && aliases.get(key) !== prefix) throw new Error("HOLDOUT_CAPTURE_PATH_COLLISION");
            aliases.set(key, prefix);
          }
          totalBytes += Number(size);
          if (totalBytes > maxBytes) throw new Error("HOLDOUT_CAPTURE_SIZE_LIMIT");
          return { path, mode, oid, size: Number(size) };
        });
        if (!entries.some((entry) => entry.path.startsWith(`${pin.scope}/`))) throw new Error("HOLDOUT_CAPTURE_SCOPE_MISSING");
        // No checkout hooks, attributes, filters, submodules, or repository code execute.
        await mkdir(checkout);
        for (const entry of entries) {
          const content = await git(["--git-dir", objects, "cat-file", "blob", entry.oid], container);
          if (content.length !== entry.size) throw new Error("HOLDOUT_CAPTURE_BLOB_SIZE_MISMATCH");
          entry.sha256 = digest(content);
          const path = join(checkout, entry.path);
          await mkdir(dirname(path), { recursive: true });
          await writeFile(path, content, { flag: "wx" });
          await chmod(path, entry.mode === "100755" ? 0o755 : 0o644);
        }
        const version = (await command(manager.executable, [...managerArguments, "--version"], container)).toString("utf8").trim();
        if (!/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/u.test(version)) throw new Error("HOLDOUT_CAPTURE_PACKAGE_MANAGER_VERSION_INVALID");
        const retrievedAt = now();
        if (!isHoldoutTimestamp(retrievedAt)) throw new Error("HOLDOUT_CAPTURE_TIME_INVALID");
        const environment = { node: process.versions.node, package_manager: `${manager.name}@${version}`, platform: process.platform, arch: process.arch };
        captures.set(checkout, { pin, entries, retrievedAt, environment });
        return checkout;
      } catch (error) {
        await rm(container, { recursive: true, force: true });
        throw error;
      }
    },

    async inspect(checkout, repository) {
      descriptor(repository);
      const capture = captures.get(checkout);
      if (!capture || await realpath(checkout) !== checkout) throw new Error("HOLDOUT_CAPTURE_CHECKOUT_INVALID");
      if (capture.pin.url !== repository.url || capture.pin.commit !== repository.commit || capture.pin.scope !== repository.scope) throw new Error("HOLDOUT_CAPTURE_DESCRIPTOR_MISMATCH");
      if (!isSafeHoldoutPath(repository.license_file)) throw new Error("HOLDOUT_CAPTURE_LICENSE_INVALID");
      const expected = new Map(capture.entries.map((entry) => [entry.path, entry]));
      const observed = [];
      async function walk(directory, prefix) {
        for (const name of await readdir(directory)) {
          const path = `${prefix}${name}`;
          const absolute = join(directory, name);
          const stat = await lstat(absolute);
          if (stat.isDirectory()) {
            if (!capture.entries.some((entry) => entry.path.startsWith(`${path}/`))) throw new Error("HOLDOUT_CAPTURE_UNTRACKED_DIRECTORY");
            await walk(absolute, `${path}/`);
          } else {
            const entry = expected.get(path);
            if (!stat.isFile() || stat.nlink !== 1 || !entry || !matchesTrackedExecutableMode(stat.mode, entry.mode)) throw new Error("HOLDOUT_CAPTURE_FILE_INVALID");
            const content = await readFile(absolute);
            if (digest(content) !== entry.sha256) throw new Error("HOLDOUT_CAPTURE_BYTES_CHANGED");
            observed.push({ path, content });
          }
        }
      }
      await walk(checkout, "");
      if (observed.length !== expected.size) throw new Error("HOLDOUT_CAPTURE_FILES_MISSING");
      const license = observed.find((entry) => entry.path === repository.license_file);
      if (!license) throw new Error("HOLDOUT_CAPTURE_LICENSE_UNTRACKED");
      return {
        url: capture.pin.url, commit: capture.pin.commit, scope: capture.pin.scope,
        tree_sha256: computeTrackedTreeSha256(observed), license_file: license.path, license_sha256: digest(license.content),
        retrieved_at: capture.retrievedAt, environment: structuredClone(capture.environment),
        tracked_files: capture.entries.map(({ path, mode, oid, sha256 }) => ({ path, mode, git_blob: oid, sha256 })),
      };
    },
  };
}
