import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import { delimiter, dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { isHoldoutRepositoryUrl, isSafeHoldoutPath } from './lib/holdout.mjs';

const execute = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const hash = (bytes, algorithm = 'sha256') => createHash(algorithm).update(bytes).digest('hex');
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const limit = 64 * 1024 * 1024;

function gitObjectId(type, bytes) {
  return hash(Buffer.concat([Buffer.from(`${type} ${bytes.length}\0`), bytes]), 'sha1');
}

export function parseBinaryTree(bytes) {
  const entries = [];
  let position = 0;
  while (position < bytes.length) {
    const space = bytes.indexOf(32, position);
    const nul = bytes.indexOf(0, space + 1);
    assert(space > position && nul > space && nul + 21 <= bytes.length, 'Malformed binary tree');
    const mode = bytes.subarray(position, space).toString('ascii');
    const name = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(space + 1, nul));
    assert(['40000', '100644', '100755', '120000'].includes(mode) && isSafeHoldoutPath(name) && !name.includes('/'), 'Unsafe binary tree entry');
    entries.push({ mode, name, oid: bytes.subarray(nul + 1, nul + 21).toString('hex') });
    position = nul + 21;
  }
  assert.equal(new Set(entries.map((entry) => entry.name)).size, entries.length, 'Duplicate binary tree name');
  return entries;
}

// A separate, preparatory archive format: never reinterpret symlinks as source files.
export function parseObjectTree(bytes) {
  const rows = new TextDecoder('utf-8', { fatal: true }).decode(bytes).split('\0');
  assert(rows.pop() === '' && rows.length > 0 && rows.length <= 100_000, 'Invalid tree');
  const paths = new Set();
  let sizeTotal = 0;
  return rows.map((row) => {
    const match = /^(100644|100755|120000) blob ([a-f0-9]{40}) +([0-9]+)\t(.+)$/u.exec(row);
    assert(match && isSafeHoldoutPath(match[4]), 'Unsupported tree entry');
    const [, mode, git_blob, size, path] = match;
    assert(!paths.has(path), 'Duplicate path');
    paths.add(path);
    sizeTotal += Number(size);
    assert(Number.isSafeInteger(sizeTotal) && sizeTotal <= limit, 'Tree size limit');
    return { path, mode, git_blob, bytes: Number(size) };
  });
}

export async function verifyObjectPacket(directory) {
  const manifestBytes = await readFile(join(directory, 'object-manifest.json'));
  const manifest = JSON.parse(manifestBytes);
  assert.equal(manifest.schema, 'd3-git-object-packet/1');
  assert.equal(manifest.status, 'preparation-only-not-execution-approved');
  assert.equal(manifest.predictions_executed, false);
  assert.equal(manifest.independent_labels_present, false);
  const selectionBytes = await readFile(join(directory, 'selection-before-fetch.json'));
  assert.equal(hash(selectionBytes), manifest.selection_sha256, 'Selection changed');
  const selection = JSON.parse(selectionBytes);
  assert.deepEqual(manifest.repository, selection.repository, 'Repository changed');
  const treeBytes = await readFile(join(directory, 'git-ls-tree.raw'));
  assert.equal(hash(treeBytes), manifest.raw_tree_sha256, 'Tree changed');
  const entries = parseObjectTree(treeBytes);
  assert.deepEqual(manifest.entries.map(({ sha256, ...entry }) => entry), entries, 'Tree entries changed');
  const commitBytes = await readFile(join(directory, 'git-commit.raw'));
  assert.equal(gitObjectId('commit', commitBytes), manifest.repository.commit, 'Commit changed');
  const rootTree = /^tree ([a-f0-9]{40})\n/u.exec(commitBytes.toString('utf8'))?.[1];
  assert(rootTree, 'Commit tree missing');
  const seenTrees = new Set();
  const treeEntries = [];
  async function verifyTree(oid, prefix = '', depth = 0) {
    assert(depth < 100 && treeEntries.length < 100_000, 'Tree recursion limit');
    const location = join(directory, 'trees', oid);
    const stat = await lstat(location);
    assert(stat.isFile() && stat.nlink === 1, 'Unsafe tree object');
    const bytes = await readFile(location);
    assert.equal(gitObjectId('tree', bytes), oid, 'Tree identity changed');
    seenTrees.add(oid);
    for (const child of parseBinaryTree(bytes)) {
      const path = `${prefix}${child.name}`;
      if (child.mode === '40000') await verifyTree(child.oid, `${path}/`, depth + 1);
      else treeEntries.push({ path, mode: child.mode, git_blob: child.oid });
    }
  }
  await verifyTree(rootTree);
  assert.deepEqual((await readdir(join(directory, 'trees'))).sort(), [...seenTrees].sort(), 'Missing or extra tree object');
  assert.deepEqual(entries.map(({ bytes, ...entry }) => entry), treeEntries, 'Listing differs from commit tree');
  const expectedObjects = [...new Set(entries.map((entry) => entry.git_blob))].sort();
  assert.deepEqual((await readdir(join(directory, 'blobs'))).sort(), expectedObjects, 'Missing or extra blob');
  const verifiedBlobs = new Map();
  let bytes = 0;
  for (const entry of manifest.entries) {
    if (!verifiedBlobs.has(entry.git_blob)) {
      const location = join(directory, 'blobs', entry.git_blob);
      const stat = await lstat(location);
      assert(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1, 'Unsafe blob file');
      const content = await readFile(location);
      assert.equal(content.length, entry.bytes, 'Blob size changed');
      assert.equal(hash(Buffer.concat([Buffer.from(`blob ${content.length}\0`), content]), 'sha1'), entry.git_blob, 'Blob identity changed');
      verifiedBlobs.set(entry.git_blob, { size: content.length, sha256: hash(content) });
    }
    assert.equal(verifiedBlobs.get(entry.git_blob).sha256, entry.sha256, 'Blob SHA-256 changed');
    assert.equal(verifiedBlobs.get(entry.git_blob).size, entry.bytes);
    bytes += entry.bytes;
  }
  const links = manifest.entries.filter((entry) => entry.mode === '120000');
  const scoped = manifest.entries.filter((entry) => entry.mode !== '120000' && entry.path.startsWith(`${manifest.repository.scope}/`) && /\.tsx?$/u.test(entry.path));
  const reviewFiles = scoped.filter((entry) => !/\.d\.ts$|(?:^|\/)(?:test|tests|__tests__|fixtures|__fixtures__|__mocks__)(?:\/|$)|\.(?:test|spec)\.tsx?$/u.test(entry.path));
  return { status: 'OBJECT_BYTES_VERIFIED_NOT_LABELS', manifest_sha256: hash(manifestBytes), repository: manifest.repository.id,
    tracked_entries: entries.length, regular_files: entries.length - links.length, bytes,
    preserved_symlinks: links.map(({ path, git_blob, bytes }) => ({ path, git_blob, bytes })),
    scoped_typescript_files: scoped.length, proposed_review_files: reviewFiles.length,
    checked_at: new Date().toISOString(), research_complete: false };
}

async function capture(output, gitExecutable) {
  assert(isAbsolute(output) && isAbsolute(gitExecutable), 'Absolute paths required');
  await mkdir(output); // Never overwrite or remove an existing capture.
  assert.equal(await realpath(output), output, 'Output must be canonical');
  const planBytes = await readFile(join(root, 'holdout/selection-preparation-20260927.json'));
  const repository = JSON.parse(planBytes).repositories.find((repo) => repo.id === 'amruthpillai/reactive-resume');
  assert(repository && isHoldoutRepositoryUrl(repository.url) && /^[a-f0-9]{40}$/u.test(repository.commit));
  const selectionBytes = json({ schema: 'd3-object-capture-selection/1', repository,
    collection_plan_sha256: hash(planBytes), recorded_at: new Date().toISOString(),
    reason: 'Append-only recovery of retained regular-file adapter failure; preserve symlink blobs without following them.',
    scientific_execution_authorized: false, predictions_permitted: false });
  await writeFile(join(output, 'selection-before-fetch.json'), selectionBytes, { flag: 'wx' });
  const objects = join(output, 'objects.git');
  async function git(args) {
    const { stdout } = await execute(gitExecutable, ['-c', 'core.hooksPath=/dev/null', '-c', 'credential.helper=', '-c', 'http.followRedirects=false', ...args], {
      cwd: output, encoding: 'buffer', shell: false, windowsHide: true, timeout: 120_000, maxBuffer: limit,
      env: { PATH: [dirname(process.execPath), '/usr/bin', '/bin'].join(delimiter), SystemRoot: process.env.SystemRoot,
        LC_ALL: 'C', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_TERMINAL_PROMPT: '0', GIT_ALLOW_PROTOCOL: 'https', GIT_NO_REPLACE_OBJECTS: '1' },
    });
    return Buffer.from(stdout);
  }
  try {
    await git(['init', '--bare', '--template=', objects]);
    await git(['--git-dir', objects, 'fetch', '--no-tags', '--depth=1', repository.url, repository.commit]);
    assert.equal((await git(['--git-dir', objects, 'rev-parse', '--verify', 'FETCH_HEAD^{commit}'])).toString().trim(), repository.commit);
    const commit = await git(['--git-dir', objects, 'cat-file', 'commit', repository.commit]);
    await writeFile(join(output, 'git-commit.raw'), commit, { flag: 'wx' });
    const rootTree = /^tree ([a-f0-9]{40})\n/u.exec(commit.toString('utf8'))?.[1];
    assert(rootTree, 'Commit tree missing');
    await mkdir(join(output, 'trees'));
    const savedTrees = new Set();
    async function saveTree(oid, depth = 0) {
      assert(depth < 100 && savedTrees.size < 100_000, 'Tree recursion limit');
      if (savedTrees.has(oid)) return;
      const bytes = await git(['--git-dir', objects, 'cat-file', 'tree', oid]);
      assert.equal(gitObjectId('tree', bytes), oid);
      const children = parseBinaryTree(bytes);
      await writeFile(join(output, 'trees', oid), bytes, { flag: 'wx' });
      savedTrees.add(oid);
      for (const child of children) if (child.mode === '40000') await saveTree(child.oid, depth + 1);
    }
    await saveTree(rootTree);
    const tree = await git(['--git-dir', objects, 'ls-tree', '-rlz', '--full-tree', repository.commit]);
    await writeFile(join(output, 'git-ls-tree.raw'), tree, { flag: 'wx' });
    const entries = parseObjectTree(tree);
    assert(entries.some((entry) => entry.path.startsWith(`${repository.scope}/`)), 'Scope missing');
    await mkdir(join(output, 'blobs'));
    const saved = new Map();
    for (const entry of entries) {
      if (!saved.has(entry.git_blob)) {
        const content = await git(['--git-dir', objects, 'cat-file', 'blob', entry.git_blob]);
        assert.equal(content.length, entry.bytes);
        await writeFile(join(output, 'blobs', entry.git_blob), content, { flag: 'wx' });
        saved.set(entry.git_blob, hash(content));
      }
      entry.sha256 = saved.get(entry.git_blob);
    }
    const license = entries.find((entry) => entry.path === repository.license_file);
    assert(license && license.mode !== '120000', 'Regular tracked license required');
    const manifest = { schema: 'd3-git-object-packet/1', status: 'preparation-only-not-execution-approved', repository,
      selection_sha256: hash(selectionBytes), raw_tree_sha256: hash(tree), license_sha256: license.sha256,
      entries, predictions_executed: false, independent_labels_present: false, completed_at: new Date().toISOString() };
    await writeFile(join(output, 'object-manifest.json'), json(manifest), { flag: 'wx' });
    const report = await verifyObjectPacket(output);
    await writeFile(join(output, 'object-verification.json'), json(report), { flag: 'wx' });
    console.log(json(report));
  } catch (error) {
    await writeFile(join(output, 'capture-failure.json'), json({ message: String(error.message), recorded_at: new Date().toISOString(), research_complete: false }), { flag: 'wx' });
    throw error;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [mode, directory, gitExecutable] = process.argv.slice(2);
  assert(['capture', 'verify'].includes(mode) && directory && isAbsolute(directory), 'Usage: capture ABS_NEW_DIR ABS_GIT_EXE | verify ABS_DIR');
  if (mode === 'verify') console.log(json(await verifyObjectPacket(directory)));
  else await capture(directory, gitExecutable);
}
