import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  GUARDIAN_SOURCE_COMMIT,
  METHOD_ARTIFACT_PATHS,
  buildFreezeManifest,
  edgeKey,
  occurrenceKey,
  validateFreezeManifest,
  validateModuleReview,
} from '../scripts/d3-review/module-method.mjs';
import { sha256 } from '../scripts/d3-source-review/files.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));

test('blank scaffold carries no declaration, labels, outputs or acceptance', async () => {
  const review = JSON.parse(await readFile(join(root, 'holdout/d3-module-method/v0.2.0/review.template.json')));
  assert.deepEqual(validateModuleReview(review), { status: 'BLANK_PREPARATION_NOT_A_REVIEW', research_complete: false, cases: 0 });
  assert.equal(review.reviewer.id, null);
  assert.equal(review.reviewer.prior_output_exposure, null);
  assert.deepEqual(review.case_envelopes, []);
});

test('legacy four-label sheet is categorically incompatible with module endpoint', () => {
  for (const schema of ['d3-author-review/1', 'd3-change-case-review/1']) {
    assert.throws(() => validateModuleReview({ schema, rows: [] }), /Legacy four-label review cannot satisfy/);
  }
  assert.throws(() => validateModuleReview({ schema: 'd3-module-inventory-review/2', status: 'original-sealed', method_manifest_sha256: 'a'.repeat(64),
    cases_sha256: 'b'.repeat(64), reviewer: { relationship: 'development-associated-author' }, case_envelopes: [] }), /56 primary cases/);
});

test('occurrence and edge identities retain physical location and exact endpoint', () => {
  const occurrence = { repository: 'fixture/repo', case_id: 'F-1', side: 'head', source_path: 'src/a.ts', start_line: 3,
    start_column: 8, syntax: 'import', literal_specifier: './b.js', resolved_target_path: 'src/b.ts' };
  const edge = { repository: 'fixture/repo', case_id: 'F-1', side: 'head', source_group: 'a', dependency: 'module-import', target_group: 'b' };
  assert.deepEqual(occurrenceKey(occurrence), ['fixture/repo', 'F-1', 'head', 'src/a.ts', 3, 8, 'import', './b.js', 'src/b.ts']);
  assert.deepEqual(edgeKey(edge), ['fixture/repo', 'F-1', 'head', 'a', 'module-import', 'b']);
});

test('freeze manifest verifies raw bytes and pins merged Guardian source without pretending fixture freeze', async () => {
  const manifest = await buildFreezeManifest(root);
  assert.equal(manifest.guardian_source_commit, GUARDIAN_SOURCE_COMMIT);
  assert.deepEqual(manifest.artifacts.map((row) => row.path), [...METHOD_ARTIFACT_PATHS]);
  assert.deepEqual(manifest.human_acceptance, { hieu: null, hoang: null });
  const report = await validateFreezeManifest(manifest, root);
  assert.equal(report.status, 'VERIFIED_PROPOSAL_BLOCKED_ON_HUMANS_AND_FIXTURES');
  assert.equal(report.tools.guardian_source_pinned, true);
  assert.equal(report.tools.fixture_freeze_complete, false);
  assert(report.resolver.unresolved.includes('source_eligibility'));
});

test('freeze manifest fails closed after a byte changes', async (t) => {
  const temp = await mkdtemp(join(tmpdir(), 'd3-module-method-'));
  t.after(() => rm(temp, { recursive: true, force: true }));
  for (const path of METHOD_ARTIFACT_PATHS) {
    const destination = join(temp, path); await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, await readFile(join(root, path)));
  }
  const manifest = await buildFreezeManifest(temp);
  const target = join(temp, METHOD_ARTIFACT_PATHS[0]);
  await writeFile(target, Buffer.concat([await readFile(target), Buffer.from(' ')]));
  await assert.rejects(() => validateFreezeManifest(manifest, temp), /Method artifact changed/);
});

test('statistical plan leaves zero-denominator recall unestimated', async () => {
  const planBytes = await readFile(join(root, 'holdout/d3-module-method/v0.2.0/statistical-plan.template.json'));
  const plan = JSON.parse(planBytes);
  assert.match(plan.metrics.recall, /null with reason when denominator is zero/);
  assert.match(plan.zero_positive_policy, /Never report 100% recall/);
  assert.equal(sha256(planBytes).length, 64);
});
