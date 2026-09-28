import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gitId, sha256 } from '../d3-source-review/files.mjs';
import { verifyTransfer } from '../d3-source-review/transfer.mjs';
import { isSafeHoldoutPath } from '../lib/holdout.mjs';

export const CASES_SHA256 = '44cc064a3555c90cc20d2a38ab61d67c6af598c1825bf5290cca2269ec801d35';
export const TRANSFER_SHA256 = '0cb702b6df6e684b587f97cc39d64dc1cb7d535c92aff2896962b2d55c26f341';
const oid = /^[a-f0-9]{40}$/u;
const sourceConfig = /(^|\/)(?:tsconfig[^/]*\.json|jsconfig[^/]*\.json|package\.json|pnpm-workspace\.yaml|lerna\.json|nx\.json|turbo\.json)$/u;

/** Candidates only; a basename does not prove that a config was applied. */
export function isConfigCandidate(path) {
  return isSafeHoldoutPath(path) && sourceConfig.test(path);
}

export function ancestorConfigCandidates(primaryPaths, configPaths) {
  const directories = new Set(['.']);
  for (const path of primaryPaths) {
    assert(isSafeHoldoutPath(path), 'Unsafe primary path');
    let parent = dirname(path).replaceAll('\\', '/');
    while (parent !== '.') {
      directories.add(parent);
      parent = dirname(parent).replaceAll('\\', '/');
    }
  }
  return configPaths.filter((path) => directories.has(dirname(path).replaceAll('\\', '/'))).sort();
}

function git(gitDir, args, maxBuffer = 64 * 1024 * 1024) {
  const result = spawnSync('git', ['--no-replace-objects', `--git-dir=${gitDir}`, ...args], {
    shell: false, windowsHide: true, timeout: 30000, maxBuffer,
    env: { ...process.env, GIT_NO_LAZY_FETCH: '1', GIT_ALLOW_PROTOCOL: '', GIT_TERMINAL_PROMPT: '0' },
  });
  assert.equal(result.status, 0, `Pinned Git object unavailable: ${result.stderr?.toString('utf8')}`);
  return result.stdout;
}

function treeCandidates(raw) {
  const result = [];
  for (const record of raw.toString('utf8').split('\0')) {
    if (!record) continue;
    const match = /^(100644|100755|120000) blob ([a-f0-9]{40})\t([^\r\n]+)$/u.exec(record);
    if (!match) continue;
    const [, mode, blob, path] = match;
    if (isConfigCandidate(path)) result.push({ path, mode, git_blob: blob });
  }
  return result.sort((a, b) => a.path.localeCompare(b.path, 'en'));
}

/** Reproducible source metadata only, never an effective-config or edge decision. */
export async function buildProjectConfigPreparation(casesRaw, transferRoot) {
  assert(Buffer.isBuffer(casesRaw) && sha256(casesRaw) === CASES_SHA256, 'Selected D3 case bytes changed');
  const bundle = JSON.parse(casesRaw.toString('utf8'));
  assert.equal(bundle.schema, 'd3-review-cases/1');
  assert.equal(bundle.cases.length, 56);
  assert.equal(bundle.context_only_cases.length, 4);
  const transfer = await verifyTransfer(transferRoot, TRANSFER_SHA256);
  const caseSides = [];
  const commits = new Map();
  const blobCache = new Map();
  const seenCases = new Set();
  for (const item of bundle.cases) {
    assert(/^[a-z0-9-]+\/[a-z0-9-]+$/iu.test(item.repository));
    assert(typeof item.id === 'string' && item.id.length > 0);
    assert(oid.test(item.base) && oid.test(item.head));
    const caseKey = JSON.stringify([item.repository, item.id]);
    assert(!seenCases.has(caseKey), 'Duplicate selected case'); seenCases.add(caseKey);
    const primaryPaths = item.scope_path_roles.filter((row) => row.role === 'primary-candidate')
      .map((row) => row.path).sort();
    assert(primaryPaths.length > 0 && new Set(primaryPaths).size === primaryPaths.length);
    assert(primaryPaths.every(isSafeHoldoutPath));
    const repositorySlug = item.repository.replace('/', '--');
    const gitDir = join(transfer.root, 'data/d3-change-packets-20260927-01', repositorySlug, 'objects.git');
    for (const [side, commit] of [['base', item.base], ['head', item.head]]) {
      const identity = `${item.repository}@${commit}`;
      if (!commits.has(identity)) {
        assert.equal(gitId('commit', git(gitDir, ['cat-file', 'commit', commit])), commit,
          'Historical commit Git object identity mismatch');
        const records = treeCandidates(git(gitDir, ['ls-tree', '-r', '-z', commit]));
        const configs = records.map((record) => {
          const key = `${item.repository}@${record.git_blob}`;
          if (!blobCache.has(key)) {
            const bytes = git(gitDir, ['cat-file', 'blob', record.git_blob], 8 * 1024 * 1024);
            assert.equal(gitId('blob', bytes), record.git_blob, 'Configuration Git blob differs from tree');
            blobCache.set(key, { bytes: bytes.length, sha256: sha256(bytes) });
          }
          return { ...record, ...blobCache.get(key), source_status: record.mode === '120000' ?
            'symlink-not-followed' : 'regular-config-candidate' };
        });
        commits.set(identity, { repository: item.repository, commit, config_candidates: configs });
      }
      const configPaths = commits.get(identity).config_candidates.map((row) => row.path);
      caseSides.push({ repository: item.repository, case_id: item.id, side, commit,
        primary_paths: primaryPaths, ancestor_config_candidate_paths: ancestorConfigCandidates(primaryPaths, configPaths),
        effective_project_config: null, review_status: 'unreviewed' });
    }
  }
  const orderedCommits = [...commits.values()].sort((a, b) =>
    `${a.repository}@${a.commit}`.localeCompare(`${b.repository}@${b.commit}`, 'en'));
  const summary = { selected_cases: 56, case_sides: caseSides.length, unique_commits: orderedCommits.length,
    config_candidate_rows: orderedCommits.reduce((total, row) => total + row.config_candidates.length, 0),
    effective_configs_accepted: 0, labels_created: 0, predictions_executed: 0 };
  assert.equal(summary.case_sides, 112);
  assert.equal(summary.unique_commits, 93);
  return { schema: 'd3-project-config-preparation/1', status: 'source-config-candidates-not-reviewed',
    cases_sha256: CASES_SHA256, transfer_sha256: TRANSFER_SHA256, summary, commits: orderedCommits,
    case_sides: caseSides };
}

async function main() {
  const [command, casesPath, transferPath, outputPath] = process.argv.slice(2);
  assert(['build', 'verify'].includes(command) && casesPath && transferPath && outputPath && process.argv.length === 6,
    'Usage: node project-config-preparation.mjs build|verify <cases.json> <transfer-root> <inventory.json>');
  const result = await buildProjectConfigPreparation(await readFile(resolve(casesPath)), resolve(transferPath));
  const bytes = Buffer.from(`${JSON.stringify(result, null, 2)}\n`);
  if (command === 'build') {
    await writeFile(resolve(outputPath), bytes, { flag: 'wx' });
    process.stdout.write(`WROTE SOURCE-CONFIG CANDIDATES ${outputPath}\n`);
  } else {
    assert.deepEqual(await readFile(resolve(outputPath)), bytes, 'Config inventory differs from pinned source bytes');
    process.stdout.write(`VERIFIED SOURCE-CONFIG CANDIDATES ${outputPath}\n`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => { process.stderr.write(`${error.stack ?? error}\n`); process.exitCode = 1; });
}
