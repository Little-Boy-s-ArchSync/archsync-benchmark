import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import test from 'node:test';
import { verifyReceipt, normalize } from '../development/common-module-capability/verify.mjs';
const base = resolve(import.meta.dirname, '../development/common-module-capability');
const json = async (path) => JSON.parse(await readFile(path, 'utf8'));
async function altered(t, mutate) {
  const copy = await mkdtemp(join(tmpdir(), 'common-capability-test-'));
  t.after(() => rm(copy, { recursive: true, force: true }));
  await cp(join(base, 'receipt'), copy, { recursive: true });
  const file = join(copy, 'manifest.json');
  const record = await json(file); mutate(record);
  await writeFile(file, JSON.stringify(record));
  return copy;
}
test('retained non-D3 tool outputs reproduce shared cases and preserve capability gaps', async () => {
  assert.deepEqual(await verifyReceipt(base, join(base, 'receipt')), { cases: 7, common_fixture_passes: 2, failed_common_candidates: 1, unsupported_probes: 4, d3_executed: false });
});
test('failed process, omitted input and invented result status cannot pass retained verification', async (t) => {
  for (const mutation of [
    (m) => { m.cases[0].invocations[0].exit_code = 1; },
    (m) => { m.inputs.pop(); },
    (m) => { m.research_complete = true; },
    (m) => { m.guardian_commit = '0'.repeat(40); },
    (m) => { m.cases[2].normalized.shared_fixture_pass = true; },
  ]) await assert.rejects(verifyReceipt(base, await altered(t, mutation)));
});
test('raw output byte changes fail even when summary claims success', async (t) => {
  const copy = await altered(t, () => {});
  await writeFile(join(copy, 'value-syntax/guardian.stdout.txt'), '{}');
  await assert.rejects(verifyReceipt(base, copy), /Output changed/);
});
test('shared fixture detects missing comparator edge and unsupported emptiness never counts as success', async () => {
  const fixtures = await json(join(base, 'fixtures.json'));
  const spec = fixtures.cases[0];
  const g = await json(join(base, 'receipt/value-syntax/guardian.stdout.txt'));
  const d = await json(join(base, 'receipt/value-syntax/comparator.stdout.txt'));
  d.modules.find((m) => m.source === 'src/app/main.ts').dependencies.pop();
  assert.equal(normalize(spec, g, d).shared_fixture_pass, false);
  const unsupported = fixtures.cases.find((c) => c.id === 'computed-dynamic');
  const ug = await json(join(base, 'receipt/computed-dynamic/guardian.stdout.txt'));
  const ud = await json(join(base, 'receipt/computed-dynamic/comparator.stdout.txt'));
  assert.equal(normalize(unsupported, ug, ud).shared_fixture_pass, false);
  g.edges[0].evidence[0].line = 999;
  assert.throws(() => normalize(spec, g, d), /source evidence/);
});
test('command provenance and sequential UTC timing reject tampering', async (t) => {
  for (const mutation of [
    (m) => { m.cases[0].invocations[0].tool = 'comparator'; },
    (m) => { m.cases[0].invocations[0].executable += '-other'; },
    (m) => { m.cases[0].invocations[1].args[5] = 'external'; },
    (m) => { m.cases[0].invocations[0].cwd += '/other'; },
    (m) => { m.cases[0].invocations[0].started_at = 'yesterday'; },
    (m) => { m.cases[0].invocations[0].finished_at = '2000-01-01T00:00:00.000Z'; },
    (m) => { m.cases[0].invocations[1].started_at = m.started_at; },
    (m) => { m.finished_at = m.started_at; },
    (m) => { m.capture_context.scratch_root = 'relative'; },
  ]) await assert.rejects(verifyReceipt(base, await altered(t, mutation)));
});
test('unmapped resolved production endpoints fail qualification while same-group edges remain explicit', async () => {
  const fixtures = await json(join(base, 'fixtures.json'));
  const spec = fixtures.cases.find((c) => c.id === 'alias');
  const g = await json(join(base, 'receipt/alias/guardian.stdout.txt'));
  const d = await json(join(base, 'receipt/alias/comparator.stdout.txt'));
  const original = normalize(spec, g, d);
  assert.equal(original.shared_fixture_pass, true);
  assert(original.comparator_outside_comparison.some((e) => e.reason === 'same-group'));
  assert.equal(original.comparison_capability, 'cross-group-file-edge-only');
  assert.equal(original.comparator_source_positions, 'not-provided');
  assert.equal(original.occurrence_scoring_supported, false);
  spec.files['src/unmapped/value.ts'] = 'export const value = 1;\n';
  for (const endpoint of ['source', 'target']) {
    const changed = structuredClone(d);
    if (endpoint === 'target') changed.modules.find((m) => m.source === 'src/app/main.ts').dependencies.push({ resolved: 'src/unmapped/value.ts', couldNotResolve: false });
    else changed.modules.push({ source: 'src/unmapped/value.ts', dependencies: [{ resolved: 'src/lib/value.ts', couldNotResolve: false }] });
    const result = normalize(spec, g, changed);
    assert.deepEqual(result.comparator_pairs, original.comparator_pairs);
    assert.equal(result.shared_fixture_pass, false);
    assert.deepEqual(result.comparator_normalization_errors[0].unmapped, [endpoint]);
  }
});
