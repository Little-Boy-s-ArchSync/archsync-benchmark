import assert from 'node:assert/strict';
import test from 'node:test';
import { exactFileEdgeScore, scoreSelectedCasePair } from '../scripts/d3-review/paired-edge-metrics.mjs';

const scope = { repository: 'fixture/repo', case_id: 'F-1', side: 'head' };
const edge = (source_path, target_path, side = 'head') => ({
  repository: scope.repository, case_id: scope.case_id, side,
  source_path, target_path, source_group: 'server', dependency: 'module-import', target_group: 'shared',
});

function pair(baseTruth, headTruth, outputs = {}) {
  const side = (name, truth) => ({
    truth: { status: 'complete', edges: truth },
    outputs: {
      guardian: { status: 'completed', edges: outputs[name]?.guardian ?? truth },
      'dependency-cruiser': { status: 'completed', edges: outputs[name]?.['dependency-cruiser'] ?? truth },
    },
  });
  return { repository: scope.repository, case_id: scope.case_id,
    sides: { base: side('base', baseTruth), head: side('head', headTruth) } };
}

test('matches exact file endpoints, not only module groups', () => {
  const result = exactFileEdgeScore([edge('src/a.ts', 'src/b.ts')], [edge('src/a.ts', 'src/c.ts')], scope);
  assert.deepEqual([result.tp, result.fp, result.fn], [0, 1, 1]);
  assert.deepEqual([result.precision, result.recall, result.f1], [0, 0, 0]);
});

test('never invents perfect precision or recall for empty denominators', () => {
  const empty = exactFileEdgeScore([], [], scope);
  assert.deepEqual([empty.precision, empty.recall, empty.f1], [null, null, null]);
  assert.equal(empty.precision_reason, 'zero-predicted-positive-denominator');
  assert.equal(empty.recall_reason, 'zero-truth-positive-denominator');
  const missed = exactFileEdgeScore([edge('src/a.ts', 'src/b.ts')], [], scope);
  assert.deepEqual([missed.precision, missed.recall, missed.f1], [null, 0, null]);
  const spurious = exactFileEdgeScore([], [edge('src/a.ts', 'src/b.ts')], scope);
  assert.deepEqual([spurious.precision, spurious.recall, spurious.f1], [0, null, null]);
});

test('rejects duplicate, wrong-side and same-group file edges before scoring', () => {
  const one = edge('src/a.ts', 'src/b.ts');
  assert.throws(() => exactFileEdgeScore([one, one], [], scope), /Duplicate file-edge key/u);
  assert.throws(() => exactFileEdgeScore([edge('src/a.ts', 'src/b.ts', 'base')], [], scope), /side differs/u);
  assert.throws(() => exactFileEdgeScore([{ ...one, target_group: 'server' }], [], scope), /cross-group/u);
  assert.throws(() => exactFileEdgeScore([one], [{ ...one, target_group: 'other' }], scope), /target-group mapping differs/u);
});

test('marks exact empty cases separately from positive-class evidence', () => {
  const result = scoreSelectedCasePair(pair([], []));
  assert.equal(result.paired_comparable, true);
  for (const tool of ['guardian', 'dependency-cruiser']) {
    assert.equal(result.tools[tool].exact_case_success, true);
    assert.equal(result.tools[tool].empty_truth_case, true);
    assert.equal(result.tools[tool].side_scores.base.recall, null);
  }
});

test('keeps a failed tool attempted, not an empty prediction or paired comparison', () => {
  const candidate = pair([], [edge('src/a.ts', 'src/b.ts')]);
  candidate.sides.head.outputs.guardian = { status: 'failed', reason: 'process exit 2' };
  const result = scoreSelectedCasePair(candidate);
  assert.equal(result.tools.guardian.attempted, true);
  assert.equal(result.tools.guardian.completed, false);
  assert.equal(result.tools.guardian.scored, false);
  assert.equal(result.tools.guardian.side_scores.head, null);
  assert.equal(result.tools.guardian.exact_case_success, null);
  assert.equal(result.tools['dependency-cruiser'].scored, true);
  assert.equal(result.paired_comparable, false);
});

test('keeps a truth-Unknown side out of both tool scores', () => {
  const candidate = pair([], [edge('src/a.ts', 'src/b.ts')]);
  candidate.sides.head.truth = { status: 'unknown', reason: 'historical target resolution unresolved' };
  const result = scoreSelectedCasePair(candidate);
  assert.equal(result.truth_unknown, true);
  assert.equal(result.paired_comparable, false);
  for (const tool of ['guardian', 'dependency-cruiser']) {
    assert.equal(result.tools[tool].scored, false);
    assert.equal(result.tools[tool].side_scores.head, null);
    assert.equal(result.tools[tool].exact_case_success, null);
  }
});

test('a missing case side or unexplained failure cannot silently become a score', () => {
  const candidate = pair([], []);
  delete candidate.sides.base;
  assert.throws(() => scoreSelectedCasePair(candidate), /Both case sides/u);
  const failed = pair([], []);
  failed.sides.base.outputs.guardian = { status: 'failed' };
  assert.throws(() => scoreSelectedCasePair(failed), /requires a reason/u);
});

test('source-unsupported truth and tool-unsupported output remain attempted but unscored', () => {
  const candidate = pair([], []);
  candidate.sides.base.truth = { status: 'unsupported', reason: 'frozen source feature outside common capability' };
  candidate.sides.head.outputs.guardian = { status: 'unsupported', reason: 'unsupported fixture syntax' };
  const result = scoreSelectedCasePair(candidate);
  assert.equal(result.truth_unsupported, true);
  assert.equal(result.paired_comparable, false);
  assert.equal(result.tools.guardian.attempted, true);
  assert.equal(result.tools.guardian.completed, false);
  assert.equal(result.tools['dependency-cruiser'].scored, false);
});
