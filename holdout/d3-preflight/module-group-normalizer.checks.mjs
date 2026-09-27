import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeModuleGroups } from './module-group-normalizer.mjs';

const graph = () => ({
  adapter: 'archsync-static-esm', adapter_version: '0.1.1',
  scope: 'configured-internal-typescript-static-esm', status: 'complete-within-scope',
  issues: [],
  modules: [{ id: 'a', file: 'src/a.ts' }, { id: 'b', file: 'src/b.ts' }],
  edges: [{ from: 'src/a.ts', to: 'src/b.ts', evidence: [{ file: 'src/a.ts', line: 1, type_only: true }] }],
});
const mapping = { 'src/a.ts': 'server', 'src/b.ts': 'shared' };

test('retains directed file evidence and type-only syntax', () => {
  assert.deepEqual(normalizeModuleGroups(graph(), mapping), [{
    from: 'server', to: 'shared', file_edges: graph().edges,
  }]);
});
test('requires exact coverage and rejects unseen edge endpoints', () => {
  assert.throws(() => normalizeModuleGroups(graph(), { 'src/a.ts': 'server' }), /exactly/);
  const invalid = graph(); invalid.edges[0].to = 'src/out.ts';
  assert.throws(() => normalizeModuleGroups(invalid, mapping), /unknown endpoint/);
});
test('rejects incomplete and incompatible adapter observations', () => {
  for (const change of [{ status: 'incomplete' }, { adapter_version: '0.1.0' }, { issues: [{ code: 'unresolved-module' }] }]) {
    assert.throws(() => normalizeModuleGroups({ ...graph(), ...change }, mapping), /incomplete/);
  }
});
