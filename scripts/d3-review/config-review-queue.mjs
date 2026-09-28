import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { sha256 } from '../d3-source-review/files.mjs';
import { isSafeHoldoutPath } from '../lib/holdout.mjs';
import { ancestorConfigCandidates } from './project-config-preparation.mjs';

export const INVENTORY_SHA256 = 'fc2911d7357f547400551547c3fd4dc4fe40aaff3818a5b60db2e12677444709';
const tsconfigName = /(?:^|\/)(?:tsconfig[^/]*|jsconfig[^/]*)\.json$/u;
const oid = /^[a-f0-9]{40}$/u;
const digest = /^[a-f0-9]{64}$/u;

function directoryDepth(path) {
  const parent = dirname(path).replaceAll('\\', '/');
  return parent === '.' ? 0 : parent.split('/').length;
}

/** A review queue, not a compiler-project or resolution decision. */
export function buildConfigReviewQueue(raw) {
  assert(Buffer.isBuffer(raw) && sha256(raw) === INVENTORY_SHA256,
    'Pinned project-configuration inventory bytes changed');
  const inventory = JSON.parse(raw.toString('utf8'));
  assert.equal(inventory.schema, 'd3-project-config-preparation/1');
  assert.equal(inventory.case_sides.length, 112);
  assert.equal(inventory.commits.length, 93);
  assert.equal(inventory.summary.effective_configs_accepted, 0);
  const commitMap = new Map();
  for (const commit of inventory.commits) {
    assert(oid.test(commit.commit));
    const key = `${commit.repository}@${commit.commit}`;
    assert(!commitMap.has(key), 'Duplicate historical commit');
    assert(new Set(commit.config_candidates.map((row) => row.path)).size === commit.config_candidates.length);
    for (const candidate of commit.config_candidates) {
      assert(isSafeHoldoutPath(candidate.path) && digest.test(candidate.sha256));
      assert.equal(candidate.source_status, 'regular-config-candidate');
    }
    commitMap.set(key, commit);
  }
  const rows = [];
  const seenSides = new Set();
  for (const side of inventory.case_sides) {
    assert(['base', 'head'].includes(side.side) && oid.test(side.commit));
    assert.equal(side.effective_project_config, null);
    assert.equal(side.review_status, 'unreviewed');
    const sideKey = JSON.stringify([side.repository, side.case_id, side.side]);
    assert(!seenSides.has(sideKey), 'Duplicate case side');
    seenSides.add(sideKey);
    const commit = commitMap.get(`${side.repository}@${side.commit}`);
    assert(commit, 'Missing pinned commit/configuration inventory');
    const configMap = new Map(commit.config_candidates.map((candidate) => [candidate.path, candidate]));
    const expectedUnion = new Set();
    for (const sourcePath of side.primary_paths) {
      assert(isSafeHoldoutPath(sourcePath), 'Unsafe source path');
      const paths = ancestorConfigCandidates([sourcePath], [...configMap.keys()]);
      assert(paths.length > 0, 'Source path has no config candidates');
      for (const path of paths) expectedUnion.add(path);
      const candidates = paths.map((path) => ({
        path,
        git_blob: configMap.get(path).git_blob,
        sha256: configMap.get(path).sha256,
        directory_depth: directoryDepth(path),
        kind: tsconfigName.test(path) ? 'compiler-config-candidate' : 'project-metadata-candidate',
      }));
      const compilerCandidates = candidates.filter((row) => row.kind === 'compiler-config-candidate');
      const nearestDepth = Math.max(-1, ...compilerCandidates.map((row) => row.directory_depth));
      const nearest = compilerCandidates.filter((row) => row.directory_depth === nearestDepth)
        .map((row) => row.path);
      rows.push({ repository: side.repository, case_id: side.case_id, side: side.side,
        commit: side.commit, source_path: sourcePath,
        source_presence: 'not-verified-by-config-inventory',
        ancestor_config_candidates: candidates,
        nearest_compiler_config_candidates_by_directory_only: nearest,
        effective_project_config: null, resolved_extends_chain: null,
        package_workspace_resolution: null, review_evidence: null, review_status: 'unreviewed' });
    }
    assert.deepEqual([...expectedUnion].sort(), [...side.ancestor_config_candidate_paths].sort(),
      'Per-path queue does not cover the retained case-side config candidates');
  }
  assert.equal(rows.length, 300, 'Selected scope must retain every primary file side');
  const perRepository = Object.fromEntries(['amruthpillai/reactive-resume', 'ether/etherpad',
    'hyperdxio/hyperdx'].map((repository) => [repository, rows.filter((row) => row.repository === repository).length]));
  assert.deepEqual(perRepository, { 'amruthpillai/reactive-resume': 80,
    'ether/etherpad': 76, 'hyperdxio/hyperdx': 144 });
  return { schema: 'd3-file-side-config-review-queue/1', status: 'candidate-paths-only-unreviewed',
    source_inventory_sha256: INVENTORY_SHA256,
    summary: { case_sides: 112, file_sides: 300, per_repository: perRepository,
      effective_configs_accepted: 0, labels_created: 0, predictions_executed: 0 },
    rows };
}

async function main() {
  const [command, inventoryPath, outputPath] = process.argv.slice(2);
  assert(['build', 'update', 'verify'].includes(command) && inventoryPath && outputPath && process.argv.length === 5,
    'Usage: node config-review-queue.mjs build|update|verify <inventory.json> <queue.json>');
  const queue = buildConfigReviewQueue(await readFile(resolve(inventoryPath)));
  const bytes = Buffer.from(`${JSON.stringify(queue, null, 2)}\n`);
  if (command === 'build' || command === 'update') {
    await writeFile(resolve(outputPath), bytes, command === 'build' ? { flag: 'wx' } : undefined);
    process.stdout.write(`WROTE UNREVIEWED CONFIG QUEUE ${outputPath}\n`);
  } else {
    assert.deepEqual(await readFile(resolve(outputPath)), bytes, 'Review queue differs from pinned inventory');
    process.stdout.write(`VERIFIED UNREVIEWED CONFIG QUEUE ${outputPath}\n`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => { process.stderr.write(`${error.stack ?? error}\n`); process.exitCode = 1; });
}
