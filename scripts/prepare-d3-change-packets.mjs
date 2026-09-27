import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { delimiter, dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { isHoldoutRepositoryUrl, isSafeHoldoutPath } from './lib/holdout.mjs';

const execute = promisify(execFile);
const hash = (bytes, algorithm = 'sha256') => createHash(algorithm).update(bytes).digest('hex');
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const oidPattern = /^[a-f0-9]{40}$/u;
const zero = '0'.repeat(40);
const objectId = (type, bytes) => hash(Buffer.concat([Buffer.from(`${type} ${bytes.length}\0`), bytes]), 'sha1');

export function parseRawChanges(bytes) {
  if (bytes.length === 0) return [];
  const rows = new TextDecoder('utf-8', { fatal: true }).decode(bytes).split('\0');
  assert.equal(rows.pop(), '', 'Raw diff must be NUL terminated');
  assert.equal(rows.length % 2, 0, 'Raw diff pairs required');
  const entries = [];
  const paths = new Set();
  for (let index = 0; index < rows.length; index += 2) {
    const match = /^:(000000|100644|100755|120000|160000) (000000|100644|100755|120000|160000) ([a-f0-9]{40}) ([a-f0-9]{40}) ([AMDT])$/u.exec(rows[index]);
    const path = rows[index + 1];
    assert(match && isSafeHoldoutPath(path) && !paths.has(path), 'Invalid raw diff entry');
    const [, base_mode, head_mode, base_oid, head_oid, status] = match;
    assert.equal(base_mode === '000000', base_oid === zero, 'Base mode/object disagreement');
    assert.equal(head_mode === '000000', head_oid === zero, 'Head mode/object disagreement');
    assert.equal(status === 'A', base_oid === zero, 'Addition mismatch');
    assert.equal(status === 'D', head_oid === zero, 'Deletion mismatch');
    paths.add(path);
    entries.push({ path, status, base_mode, head_mode, base_oid, head_oid });
  }
  return entries;
}

export function commitParents(bytes) {
  const headers = bytes.toString('utf8').split('\n\n')[0];
  assert(/^tree [a-f0-9]{40}\n/u.test(`${headers}\n`), 'Invalid commit headers');
  return [...headers.matchAll(/^parent ([a-f0-9]{40})$/gmu)].map((match) => match[1]);
}

function hostGit(executable, directory) {
  assert(isAbsolute(executable) && isAbsolute(directory));
  return async (args) => {
    const result = await execute(executable, ['-c', 'core.hooksPath=/dev/null', '-c', 'credential.helper=',
      '-c', 'http.followRedirects=false', '-c', 'gc.auto=0', '-c', 'maintenance.auto=false', ...args], {
      cwd: directory, encoding: 'buffer', shell: false, windowsHide: true, timeout: 120000, maxBuffer: 64 * 1024 * 1024,
      env: { PATH: [dirname(process.execPath), '/usr/bin', '/bin'].join(delimiter), SystemRoot: process.env.SystemRoot,
        LC_ALL: 'C', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_TERMINAL_PROMPT: '0',
        GIT_ALLOW_PROTOCOL: 'https', GIT_NO_REPLACE_OBJECTS: '1' },
    });
    return { stdout: Buffer.from(result.stdout), stderr: Buffer.from(result.stderr) };
  };
}

export function diffArguments(kind, base, head, scope) {
  assert(oidPattern.test(base) && oidPattern.test(head));
  assert(scope === undefined || isSafeHoldoutPath(scope));
  assert(['raw', 'patch'].includes(kind));
  const options = kind === 'raw' ? ['--raw', '-z', '--no-abbrev'] :
    ['--patch', '--binary', '--full-index', '--unified=3', '--diff-algorithm=myers', '--src-prefix=a/', '--dst-prefix=b/'];
  return ['diff', '--no-ext-diff', '--no-textconv', '--no-color', '--no-renames', ...options, base, head, '--', ...(scope ? [scope] : [])];
}

export async function captureChanges(historyDirectory, output, executable) {
  assert([historyDirectory, output, executable].every(isAbsolute));
  const historyBytes = await readFile(join(historyDirectory, 'history-summary.json'));
  const history = JSON.parse(historyBytes);
  const historyPlanBytes = await readFile(join(historyDirectory, 'history-collection-plan.json'));
  const historyPlan = JSON.parse(historyPlanBytes);
  assert.equal(hash(historyPlanBytes), history.plan_sha256);
  assert.equal(history.predictions_executed, false);
  assert.equal(history.labels_present, false);
  assert.deepEqual(history.receipts.map((receipt) => receipt.repository), historyPlan.repositories.map((repo) => repo.id));
  for (const receipt of history.receipts) {
    const selected = historyPlan.repositories.find((repo) => repo.id === receipt.repository);
    assert(isHoldoutRepositoryUrl(selected.url) && selected.url === `https://github.com/${receipt.repository}`);
    assert.equal(receipt.scope, selected.scope);
    assert(isSafeHoldoutPath(receipt.scope));
    assert(receipt.records.every((row, index) => row.candidate_id === `${receipt.repository.replace('/', '--')}-H${String(index + 1).padStart(3, '0')}`));
    const folder = join(historyDirectory, receipt.repository.replace('/', '--'));
    assert.deepEqual(JSON.parse(await readFile(join(folder, 'history-receipt.json'))), receipt);
    assert.equal(receipt.status, 'HISTORY_METADATA_CAPTURED_NOT_CASE_LABELS');
    const raw = await readFile(join(folder, 'raw-commits.json'));
    assert.equal(hash(raw), receipt.raw_sha256);
    assert.deepEqual(JSON.parse(raw).map((row) => ({ commit: row.sha, parents: row.parents.map((parent) => parent.sha) })),
      receipt.records.map(({ commit, parents }) => ({ commit, parents })));
    assert.equal(new Set(receipt.records.map((row) => row.candidate_id)).size, receipt.records.length);
  }
  await mkdir(output);
  assert.equal(await realpath(output), output);
  const gitVersion = (await hostGit(executable, output)(['--version'])).stdout.toString('utf8').trim();
  const plan = { schema: 'd3-history-change-selection/1', recorded_at: new Date().toISOString(),
    collector_sha256: hash(await readFile(fileURLToPath(import.meta.url))),
    environment: { node: process.versions.node, git: gitVersion, platform: process.platform, arch: process.arch },
    status: 'preparation-only-not-frozen', history_summary_sha256: hash(historyBytes), history_plan_sha256: hash(historyPlanBytes),
    rule: 'Retain every candidate and failure from the previously captured first-20-per-scope history list. No filtering by tool outcome or inferred architecture impact.',
    rename_policy: 'Disable rename inference; retain explicit additions/deletions and mode changes.',
    repositories: historyPlan.repositories, receipts: history.receipts,
    predictions_permitted: false, official_execution_authorized: false };
  const planBytes = json(plan);
  await writeFile(join(output, 'selection-before-fetch.json'), planBytes, { flag: 'wx' });
  const repositories = [];
  for (const input of history.receipts) {
    const selected = historyPlan.repositories.find((repo) => repo.id === input.repository);
    assert(selected && isHoldoutRepositoryUrl(selected.url));
    assert(input.records.every((row) => oidPattern.test(row.commit) && row.parents.every((oid) => oidPattern.test(oid))));
    const folder = join(output, input.repository.replace('/', '--'));
    await mkdir(folder);
    const git = hostGit(executable, folder);
    const objects = join(folder, 'objects.git');
    const record = { repository: input.repository, scope: input.scope, cases: [], started_at: new Date().toISOString() };
    try {
      await git(['init', '--bare', '--template=', objects]);
      const revisions = [...new Set(input.records.flatMap((row) => [row.commit, ...row.parents]))];
      const fetch = await git(['--git-dir', objects, 'fetch', '--no-tags', '--depth=1', selected.url, ...revisions]);
      await writeFile(join(folder, 'fetch.stdout'), fetch.stdout, { flag: 'wx' });
      await writeFile(join(folder, 'fetch.stderr'), fetch.stderr, { flag: 'wx' });
      await mkdir(join(folder, 'cases'));
      await mkdir(join(folder, 'blobs'));
      const savedBlobs = new Set();
      for (const candidate of input.records) {
        const item = { id: candidate.candidate_id, head: candidate.commit, parents: candidate.parents,
          base: candidate.comparison_parent, label: null, predictions_executed: false };
        const caseFolder = join(folder, 'cases', item.id);
        await mkdir(caseFolder);
        const artifacts = {};
        const save = async (name, bytes) => {
          await writeFile(join(caseFolder, name), bytes, { flag: 'wx' });
          artifacts[name] = { sha256: hash(bytes), bytes: bytes.length };
        };
        try {
          const headCommit = (await git(['--git-dir', objects, 'cat-file', 'commit', item.head])).stdout;
          assert.equal(objectId('commit', headCommit), item.head);
          assert.deepEqual(commitParents(headCommit), item.parents, 'Provider parent metadata mismatch');
          await save('head.commit', headCommit);
          if (item.parents.length !== 1 || item.base !== item.parents[0]) throw new Error('NON_SINGLE_PARENT_REQUIRES_DESIGN_REVIEW');
          const baseCommit = (await git(['--git-dir', objects, 'cat-file', 'commit', item.base])).stdout;
          assert.equal(objectId('commit', baseCommit), item.base);
          await save('base.commit', baseCommit);
          for (const [name, oid] of [['base.tree', item.base], ['head.tree', item.head]]) {
            await save(name, (await git(['--git-dir', objects, 'ls-tree', '-rlz', '--full-tree', oid])).stdout);
          }
          for (const [name, kind, scope] of [['all.raw', 'raw', undefined], ['scope.raw', 'raw', input.scope], ['all.diff', 'patch', undefined], ['scope.diff', 'patch', input.scope]]) {
            await save(name, (await git(['--git-dir', objects, ...diffArguments(kind, item.base, item.head, scope)])).stdout);
          }
          const all = parseRawChanges(await readFile(join(caseFolder, 'all.raw')));
          const scoped = parseRawChanges(await readFile(join(caseFolder, 'scope.raw')));
          assert.deepEqual(scoped, all.filter((row) => row.path.startsWith(`${input.scope}/`)));
          const blobs = [];
          for (const entry of scoped) for (const side of ['base', 'head']) {
            const oid = entry[`${side}_oid`];
            const mode = entry[`${side}_mode`];
            if (mode === '000000' || mode === '160000') continue;
            const bytes = (await git(['--git-dir', objects, 'cat-file', 'blob', oid])).stdout;
            assert.equal(objectId('blob', bytes), oid);
            if (!savedBlobs.has(oid)) {
              await writeFile(join(folder, 'blobs', oid), bytes, { flag: 'wx' });
              savedBlobs.add(oid);
            }
            blobs.push({ path: entry.path, side, git_blob: oid, mode, bytes: bytes.length, sha256: hash(bytes) });
          }
          Object.assign(item, { status: 'CHANGE_SOURCE_CAPTURED_NOT_LABELLED', changed_paths_all: all.length,
            changed_paths_in_scope: scoped.length, unsupported_submodule_paths: scoped.filter((entry) => [entry.base_mode, entry.head_mode].includes('160000')).map((entry) => entry.path),
            changes: scoped, blobs });
        } catch (error) {
          Object.assign(item, { status: 'CHANGE_CAPTURE_FAILED', error: String(error.message).slice(0, 3000) });
        }
        item.artifacts = artifacts;
        await writeFile(join(caseFolder, 'case-receipt.json'), json(item), { flag: 'wx' });
        record.cases.push(item);
        console.log(`${input.repository} ${item.id}: ${item.status}`);
      }
      const fsck = await git(['--git-dir', objects, 'fsck', '--strict', '--no-reflogs']);
      await writeFile(join(folder, 'fsck.stdout'), fsck.stdout, { flag: 'wx' });
      await writeFile(join(folder, 'fsck.stderr'), fsck.stderr, { flag: 'wx' });
      record.status = 'GIT_OBJECTS_RETAINED';
    } catch (error) {
      record.status = 'REPOSITORY_CAPTURE_FAILED';
      record.error = String(error.message).slice(0, 4000);
    }
    record.finished_at = new Date().toISOString();
    await writeFile(join(folder, 'repository-receipt.json'), json(record), { flag: 'wx' });
    repositories.push(record);
  }
  const summary = { schema: 'd3-change-packets/1', selection_sha256: hash(planBytes), repositories,
    predictions_executed: false, labels_present: false, research_complete: false };
  await writeFile(join(output, 'change-summary.json'), json(summary), { flag: 'wx' });
  return summary;
}

export async function verifyChanges(directory, executable) {
  const summaryBytes = await readFile(join(directory, 'change-summary.json'));
  const summary = JSON.parse(summaryBytes);
  assert.equal(summary.schema, 'd3-change-packets/1');
  const selectionBytes = await readFile(join(directory, 'selection-before-fetch.json'));
  assert.equal(hash(selectionBytes), summary.selection_sha256);
  const selection = JSON.parse(selectionBytes);
  for (const key of ['predictions_executed', 'labels_present', 'research_complete']) assert.equal(summary[key], false);
  assert.deepEqual(summary.repositories.map((repo) => repo.repository), selection.receipts.map((repo) => repo.repository));
  const reports = [];
  for (const repository of summary.repositories) {
    const folder = join(directory, repository.repository.replace('/', '--'));
    const original = selection.receipts.find((row) => row.repository === repository.repository);
    assert.deepEqual(JSON.parse(await readFile(join(folder, 'repository-receipt.json'))), repository);
    if (repository.status === 'REPOSITORY_CAPTURE_FAILED') {
      reports.push({ repository: repository.repository, status: repository.status, retained_failure: repository.error });
      continue;
    }
    assert.equal(repository.status, 'GIT_OBJECTS_RETAINED');
    assert.deepEqual(repository.cases.map((row) => row.id), original.records.map((row) => row.candidate_id));
    const git = hostGit(executable, folder);
    const objects = join(folder, 'objects.git');
    await git(['--git-dir', objects, 'fsck', '--strict', '--no-reflogs']);
    let passed = 0;
    let failures = 0;
    let scopedPathOccurrences = 0;
    let emptyScopes = 0;
    for (const item of repository.cases) {
      const candidate = original.records.find((row) => row.candidate_id === item.id);
      assert.equal(item.head, candidate.commit);
      assert.equal(item.base, candidate.comparison_parent);
      assert.deepEqual(item.parents, candidate.parents);
      assert.equal(item.label, null);
      assert.equal(item.predictions_executed, false);
      const caseFolder = join(folder, 'cases', item.id);
      assert.deepEqual(JSON.parse(await readFile(join(caseFolder, 'case-receipt.json'))), item);
      for (const [name, expected] of Object.entries(item.artifacts)) {
        assert(isSafeHoldoutPath(name) && !name.includes('/'));
        const bytes = await readFile(join(caseFolder, name));
        assert.equal(hash(bytes), expected.sha256);
        assert.equal(bytes.length, expected.bytes);
      }
      if (item.status === 'CHANGE_CAPTURE_FAILED') { failures += 1; continue; }
      assert.equal(item.status, 'CHANGE_SOURCE_CAPTURED_NOT_LABELLED');
      const headCommit = await readFile(join(caseFolder, 'head.commit'));
      assert.equal(objectId('commit', headCommit), item.head);
      assert.deepEqual(commitParents(headCommit), item.parents);
      assert.equal(item.parents.length, 1);
      assert.equal(item.base, item.parents[0]);
      assert.equal(objectId('commit', await readFile(join(caseFolder, 'base.commit'))), item.base);
      for (const [name, oid] of [['base.tree', item.base], ['head.tree', item.head]]) {
        assert.deepEqual(await readFile(join(caseFolder, name)), (await git(['--git-dir', objects, 'ls-tree', '-rlz', '--full-tree', oid])).stdout);
      }
      for (const [name, kind, scope] of [['all.raw', 'raw', undefined], ['scope.raw', 'raw', repository.scope], ['all.diff', 'patch', undefined], ['scope.diff', 'patch', repository.scope]]) {
        const expected = (await git(['--git-dir', objects, ...diffArguments(kind, item.base, item.head, scope)])).stdout;
        assert.deepEqual(await readFile(join(caseFolder, name)), expected, `Diff changed: ${item.id}/${name}`);
      }
      const all = parseRawChanges(await readFile(join(caseFolder, 'all.raw')));
      const scoped = parseRawChanges(await readFile(join(caseFolder, 'scope.raw')));
      assert.deepEqual(scoped, all.filter((row) => row.path.startsWith(`${repository.scope}/`)));
      assert.deepEqual(scoped, item.changes);
      assert.equal(item.changed_paths_all, all.length);
      assert.equal(item.changed_paths_in_scope, scoped.length);
      const expectedBlobRefs = scoped.flatMap((row) => ['base', 'head'].filter((side) => !['000000', '160000'].includes(row[`${side}_mode`])).map((side) => ({ path: row.path, side, git_blob: row[`${side}_oid`], mode: row[`${side}_mode`] })));
      assert.deepEqual(item.blobs.map(({ sha256, bytes, ...blob }) => blob), expectedBlobRefs);
      for (const blob of item.blobs) {
        const bytes = await readFile(join(folder, 'blobs', blob.git_blob));
        assert.equal(objectId('blob', bytes), blob.git_blob);
        assert.equal(hash(bytes), blob.sha256);
        assert.equal(bytes.length, blob.bytes);
      }
      assert.deepEqual(item.unsupported_submodule_paths, scoped.filter((row) => [row.base_mode, row.head_mode].includes('160000')).map((row) => row.path));
      passed += 1;
      scopedPathOccurrences += scoped.length;
      if (scoped.length === 0) emptyScopes += 1;
    }
    reports.push({ repository: repository.repository, status: 'OFFLINE_GIT_DIFF_VERIFIED_NOT_LABELS', candidate_cases: repository.cases.length,
      verified_change_packets: passed, failed_change_packets: failures, scoped_path_occurrences: scopedPathOccurrences, empty_scope_cases: emptyScopes });
  }
  return { summary_sha256: hash(summaryBytes), repositories: reports, verified_at: new Date().toISOString(), predictions: 0, labels: 0, research_complete: false };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [mode, ...args] = process.argv.slice(2);
  assert(['capture', 'verify'].includes(mode), 'Usage: capture ABS_HISTORY_DIR ABS_NEW_OUTPUT ABS_GIT | verify ABS_PACKET_DIR ABS_GIT');
  if (mode === 'capture') {
    const summary = await captureChanges(...args);
    console.log(json({ summary: 'change-summary.json', repositories: summary.repositories.map((repo) => ({
      repository: repo.repository, status: repo.status, cases: repo.cases.length,
      failed_cases: repo.cases.filter((row) => row.status === 'CHANGE_CAPTURE_FAILED').length,
    })), labels: 0, predictions: 0, research_complete: false }));
    if (summary.repositories.some((repo) => repo.status === 'REPOSITORY_CAPTURE_FAILED' || repo.cases.some((row) => row.status === 'CHANGE_CAPTURE_FAILED'))) process.exitCode = 1;
  }
  else console.log(json(await verifyChanges(...args)));
}
