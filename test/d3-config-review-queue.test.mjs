import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { buildConfigReviewQueue, INVENTORY_SHA256 } from '../scripts/d3-review/config-review-queue.mjs';
import { sha256 } from '../scripts/d3-source-review/files.mjs';

const inventoryUrl = new URL('../holdout/d3-project-config-preparation/inventory.json', import.meta.url);
const queueUrl = new URL('../holdout/d3-project-config-preparation/file-side-review-queue.json', import.meta.url);

test('300 file-side configuration rows are reproducible from pinned source metadata', async () => {
  const input = await readFile(inventoryUrl);
  const output = await readFile(queueUrl);
  assert.equal(sha256(input), INVENTORY_SHA256);
  assert.equal(sha256(output), '9de6225e51e76e7c5dbb3d91f81fd5d527befd5f4bcc8aaa0b97d0eded8edf2a');
  assert.deepEqual(output, Buffer.from(`${JSON.stringify(buildConfigReviewQueue(input), null, 2)}\n`));
  const queue = JSON.parse(output.toString('utf8'));
  assert.deepEqual(queue.summary, { case_sides: 112, file_sides: 300,
    per_repository: { 'amruthpillai/reactive-resume': 80, 'ether/etherpad': 76,
      'hyperdxio/hyperdx': 144 },
    effective_configs_accepted: 0, labels_created: 0, predictions_executed: 0 });
  assert(queue.rows.every((row) => row.review_status === 'unreviewed' &&
    row.source_presence === 'not-verified-by-config-inventory' &&
    row.effective_project_config === null && row.resolved_extends_chain === null &&
    row.package_workspace_resolution === null && row.review_evidence === null));
  assert(queue.rows.every((row) => row.ancestor_config_candidates.length > 0));
});

test('nearby compiler configs remain competing candidates, not an accepted project', async () => {
  const queue = JSON.parse(await readFile(queueUrl, 'utf8'));
  const hyperdx = queue.rows.find((row) => row.case_id === 'hyperdxio--hyperdx-H001' &&
    row.side === 'base' && row.source_path === 'packages/api/src/tasks/checkAlerts/template.ts');
  assert.deepEqual(hyperdx.nearest_compiler_config_candidates_by_directory_only,
    ['packages/api/tsconfig.build.json', 'packages/api/tsconfig.json',
      'packages/api/tsconfig.vercel.json']);
  assert.equal(hyperdx.effective_project_config, null);
  const allKeys = queue.rows.map((row) => JSON.stringify([row.repository, row.case_id,
    row.side, row.commit, row.source_path]));
  assert.equal(new Set(allKeys).size, 300);
});

test('changed source metadata cannot be reinterpreted as reviewed configuration', async () => {
  const input = await readFile(inventoryUrl);
  const changed = Buffer.from(input);
  changed[50] ^= 1;
  assert.throws(() => buildConfigReviewQueue(changed), /inventory bytes changed/);
});
