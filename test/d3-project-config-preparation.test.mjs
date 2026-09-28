import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { ancestorConfigCandidates, isConfigCandidate } from '../scripts/d3-review/project-config-preparation.mjs';
import { sha256 } from '../scripts/d3-source-review/files.mjs';

test('configuration census selects only safe candidate filenames', () => {
  assert.equal(isConfigCandidate('packages/api/tsconfig.build.json'), true);
  assert.equal(isConfigCandidate('package.json'), true);
  assert.equal(isConfigCandidate('pnpm-workspace.yaml'), true);
  assert.equal(isConfigCandidate('src/tsconfig.json.old'), false);
  assert.equal(isConfigCandidate('../tsconfig.json'), false);
  assert.equal(isConfigCandidate('src/main.ts'), false);
});

test('ancestor candidates do not silently choose one effective project', () => {
  const paths = ancestorConfigCandidates(['packages/api/src/main.ts'], [
    'package.json', 'packages/api/package.json', 'packages/api/tsconfig.json',
    'packages/web/tsconfig.json', 'packages/api/src/tsconfig.test.json',
  ]);
  assert.deepEqual(paths, ['package.json', 'packages/api/package.json',
    'packages/api/src/tsconfig.test.json', 'packages/api/tsconfig.json']);
  assert.throws(() => ancestorConfigCandidates(['../escape.ts'], []), /Unsafe primary path/);
});

test('retained 93-commit census contains no accepted config, labels or predictions', async () => {
  const raw = await readFile(new URL('../holdout/d3-project-config-preparation/inventory.json', import.meta.url));
  assert.equal(sha256(raw), 'fc2911d7357f547400551547c3fd4dc4fe40aaff3818a5b60db2e12677444709');
  const inventory = JSON.parse(raw.toString('utf8'));
  assert.equal(inventory.status, 'source-config-candidates-not-reviewed');
  assert.deepEqual(inventory.summary, { selected_cases: 56, case_sides: 112, unique_commits: 93,
    config_candidate_rows: 2946, effective_configs_accepted: 0, labels_created: 0, predictions_executed: 0 });
  assert.equal(inventory.commits.length, 93);
  assert.equal(inventory.case_sides.length, 112);
  assert(inventory.case_sides.every((row) => row.effective_project_config === null &&
    row.review_status === 'unreviewed' && row.ancestor_config_candidate_paths.length > 0));
  assert(inventory.commits.every((commit) => commit.config_candidates.every((row) =>
    row.source_status === 'regular-config-candidate' && /^[a-f0-9]{64}$/u.test(row.sha256))));
  assert(!raw.includes(Buffer.from('"prediction"')));
  assert(!raw.includes(Buffer.from('"label"')));
});
