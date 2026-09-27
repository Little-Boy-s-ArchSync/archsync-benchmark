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
