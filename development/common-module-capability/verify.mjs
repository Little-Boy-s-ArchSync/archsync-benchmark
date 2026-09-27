import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { resolve, relative, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
export const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const encode = (value) => `${JSON.stringify(value, null, 2)}\n`;
export const inputNames = ['fixtures.json', 'dependency-cruiser.json', 'guardian-pin.json', 'capture.mjs', 'verify.mjs', 'tools/guardian-run.mjs', 'tools/guardian/module-dependencies.js', 'tools/guardian/module-dependencies.ts', 'tools/package.json', 'tools/package-lock.json'];
export const pairs = (rows) => [...new Set(rows.map((row) => JSON.stringify(row)))].sort().map((row) => JSON.parse(row));
const within = (path) => typeof path === 'string' && !isAbsolute(path) && !path.includes('\\') && path.split('/').every((part) => part && part !== '..' && part !== '.');
export function normalize(spec, guardian, comparator) {
  assert.equal(guardian.analyzer.id, 'archsync-module-dependencies');
  assert.equal(guardian.analyzer.version, '0.1.0-development');
  assert(Array.isArray(guardian.edges) && Array.isArray(guardian.unresolved));
  assert(Array.isArray(comparator.modules), 'Comparator modules missing');
  const group = (path) => [...spec.mapping].sort((a, b) => b.prefix.length - a.prefix.length).find((m) => path.startsWith(m.prefix))?.component;
  const production = new Set(Object.keys(spec.files).filter((path) => path.startsWith('src/') && /\.[cm]?[jt]sx?$/.test(path) && !/\.d\.[cm]?ts$/.test(path)));
  const guardianPairs = pairs(guardian.edges.flatMap((edge) => edge.evidence.map((e) => {
    assert(production.has(e.file) && production.has(e.target_file), 'Guardian edge escaped declared regular production files');
    assert.equal(edge.from, group(e.file)); assert.equal(edge.to, group(e.target_file));
    assert.notEqual(edge.from, edge.to);
    assert(Number.isSafeInteger(e.line) && e.line > 0 && spec.files[e.file].split(/\r?\n/)[e.line - 1]?.includes(e.specifier), 'Guardian source evidence does not match developer fixture');
    return [e.file, e.target_file];
  })));
  const observations = [], outside = [], unresolved = [];
  for (const module of comparator.modules) {
    assert(typeof module.source === 'string', 'Comparator source identity missing'); // Unresolved pseudo-modules may contain ../; never use them as filesystem paths.
    for (const dependency of module.dependencies) {
      const target = dependency.resolved ?? dependency.module;
      if (dependency.couldNotResolve) unresolved.push({ from: module.source, target });
      else if (production.has(module.source) && production.has(target) && group(module.source) && group(target) && group(module.source) !== group(target)) observations.push([module.source, target]);
      else outside.push({ from: module.source, target });
    }
  }
  const comparatorPairs = pairs(observations);
  const expected = pairs(spec.expected_pairs);
  const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
  const common = spec.classification === 'common-candidate';
  return { id: spec.id, classification: spec.classification,
    guardian_pairs: guardianPairs, comparator_pairs: comparatorPairs, expected_pairs: expected,
    guardian_matches_developer_expectation: same(guardianPairs, expected),
    comparator_matches_developer_expectation: same(comparatorPairs, expected),
    guardian_unresolved: guardian.unresolved, comparator_unresolved: unresolved, comparator_outside_comparison: outside,
    guardian_syntax: guardian.edges.flatMap((edge) => edge.evidence.map((e) => e.syntax)).sort(),
    shared_fixture_pass: common && same(guardianPairs, expected) && same(comparatorPairs, expected) && guardian.unresolved.length === 0 && unresolved.length === 0,
    meaning: common ? 'bounded-development-fixture-only' : 'unsupported-probe-never-scored-as-common-success',
    d3_eligible: false, research_result: false };
}
export async function verifyReceipt(base, receiptDirectory) {
  const readJSON = async (path) => JSON.parse(await readFile(path, 'utf8'));
  const manifest = await readJSON(resolve(receiptDirectory, 'manifest.json'));
  assert.equal(manifest.schema, 'non-d3-common-capability-receipt/1');
  assert.equal(manifest.status, 'development-only-proposed-research-tooling');
  assert.equal(manifest.d3_executed, false); assert.equal(manifest.research_complete, false);
  assert.equal(manifest.guardian_commit, 'e32ef53eeb07bc8c904b6a1e6a8b897d16def820');
  assert.equal(manifest.node, 'v22.16.0');
  assert.deepEqual(manifest.versions, { 'dependency-cruiser': '18.3.0', typescript: '5.9.3' });
  assert.deepEqual(manifest.inputs.map((row) => row.path), inputNames, 'Input inventory incomplete');
  for (const row of manifest.inputs) {
    assert(within(row.path)); assert.equal(hash(await readFile(resolve(base, row.path))), row.sha256, `Input changed: ${row.path}`);
  }
  const fixture = await readJSON(resolve(base, 'fixtures.json'));
  assert.equal(fixture.purpose, 'developer-authored-software-fixtures-not-research-ground-truth');
  assert.deepEqual(manifest.cases.map((row) => row.id), fixture.cases.map((row) => row.id));
  const expectedFiles = new Set(['manifest.json']);
  assert.equal(manifest.cases.length, 7, 'Declared development population changed');
  for (const record of manifest.cases) {
    assert.equal(record.invocations.length, 2);
    for (const invocation of record.invocations) {
      assert.equal(invocation.exit_code, 0, 'Failed tool invocation cannot count as fixture success');
      assert.equal(invocation.signal, null);
      for (const channel of ['stdout', 'stderr']) {
        const name = `${record.id}/${invocation.tool}.${channel}.txt`;
        expectedFiles.add(name);
        assert.equal(hash(await readFile(resolve(receiptDirectory, name))), invocation[`${channel}_sha256`], `Output changed: ${name}`);
      }
    }
    const spec = fixture.cases.find((item) => item.id === record.id);
    const guardian = await readJSON(resolve(receiptDirectory, `${record.id}/guardian.stdout.txt`));
    const comparator = await readJSON(resolve(receiptDirectory, `${record.id}/comparator.stdout.txt`));
    const calculated = normalize(spec, guardian, comparator);
    assert.deepEqual(record.normalized, calculated, 'Normalized result differs from raw outputs');
    assert.deepEqual(guardian.unresolved.map((row) => row.reason).sort(), [...spec.expected_guardian_unresolved].sort(), 'Expected unresolved diagnostic changed');
    if (spec.classification === 'common-candidate') {
      assert.equal(calculated.shared_fixture_pass, spec.expected_shared, `Common fixture qualification changed: ${spec.id}`);
      if (spec.expected_guardian_syntax) assert.deepEqual(calculated.guardian_syntax, [...spec.expected_guardian_syntax].sort());
    } else assert.equal(calculated.shared_fixture_pass, false);
  }
  const seen = [];
  async function walk(path) { for (const item of await readdir(path, { withFileTypes: true })) { const child = resolve(path, item.name); if (item.isDirectory()) await walk(child); else { assert(item.isFile()); seen.push(relative(receiptDirectory, child).replaceAll('\\', '/')); } } }
  await walk(receiptDirectory);
  assert.deepEqual(seen.sort(), [...expectedFiles].sort(), 'Receipt has missing or extra artifacts');
  return { cases: manifest.cases.length, common_fixture_passes: manifest.cases.filter((c) => c.normalized.shared_fixture_pass).length, failed_common_candidates: manifest.cases.filter((c) => c.normalized.classification === 'common-candidate' && !c.normalized.shared_fixture_pass).length, unsupported_probes: manifest.cases.filter((c) => c.normalized.classification === 'unsupported-probe').length, d3_executed: false };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const base = resolve(import.meta.dirname);
  console.log(JSON.stringify(await verifyReceipt(base, resolve(base, 'receipt')), null, 2));
}
