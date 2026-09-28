import assert from 'node:assert/strict';
import test from 'node:test';
import { candidatePaths, censusProductionCandidates } from '../scripts/d3-review/production-role-candidates.mjs';

const semantics = {
  test_path_regex: '(^|/)(__tests__|test|tests|fixtures)(/|$)|\\.(test|spec)\\.[cm]?[jt]sx?$',
  source_extensions: ['.ts', '.tsx', '.js', '.jsx'],
};

test('production candidate prefilter drops tests, unsupported extensions, and no source evidence', () => {
  const entries = [
    { path: 'src/__tests__/router.test.ts', git_blob: 'a'.repeat(40) },
    { path: 'src/router.spec.ts', git_blob: 'b'.repeat(40) },
    { path: 'src/router.ts', git_blob: 'c'.repeat(40) },
    { path: 'src/router.json', git_blob: 'd'.repeat(40) },
    { path: 'src/router.test.js', git_blob: 'e'.repeat(40) },
    { path: 'src/types.d.ts', git_blob: 'f'.repeat(40) },
    { path: 'src/types.d.mts', git_blob: '1'.repeat(40) },
  ];
  assert.deepEqual(candidatePaths(entries, semantics), [entries[2]]);
});

test('production candidate census cannot accept decisions or predictions', () => {
  const census = { schema: 'd3-historical-source-role-census/1',
    status: 'source-role-metadata-only-not-applicability',
    rows: Array.from({ length: 152 }, (_, index) => ({ repository: 'fixture/repo',
      case_id: `CASE-${index}`, rule_id: 'RULE', side: 'base',
      commit: 'a'.repeat(40), commit_tree: 'b'.repeat(40),
      source_component: 'source', target_component: 'target',
      source_regular_paths: 1, target_regular_paths: 1,
      rule_applicability: null, truth_label: null, tool_prediction: null })) };
  const contract = { schema: 'd3-research-contract-proposal/1', status: 'proposed-not-accepted',
    module_semantics: semantics, repositories: [{ id: 'fixture/repo', mapping: [] }] };
  assert.throws(() => censusProductionCandidates(census, contract, {}), /Missing pinned repository or bare Git directory/u);
  const accepted = structuredClone(census);
  accepted.rows[0].rule_applicability = 'applicable';
  assert.throws(() => censusProductionCandidates(accepted, contract, {}), /Expected values to be strictly equal/u);
  const labeled = structuredClone(census);
  labeled.rows[0].truth_label = true;
  assert.throws(() => censusProductionCandidates(labeled, contract, {}), /Expected values to be strictly equal/u);
});
