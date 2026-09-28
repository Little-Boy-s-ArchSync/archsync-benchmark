import assert from 'node:assert/strict';
import { edgeKey } from './module-method.mjs';

const tools = Object.freeze(['guardian', 'dependency-cruiser']);
const sides = Object.freeze(['base', 'head']);
const truthStatuses = new Set(['complete', 'unknown', 'unsupported']);
const outputStatuses = new Set(['completed', 'failed', 'unsupported']);

function nonempty(value) {
  return typeof value === 'string' && value.length > 0;
}

function checkedEdges(edges, scope) {
  assert(Array.isArray(edges), 'Edges must be an array');
  const keys = new Map();
  for (const edge of edges) {
    assert(edge && typeof edge === 'object', 'Every edge must be an object');
    assert.equal(edge.repository, scope.repository, 'Edge repository differs from case scope');
    assert.equal(edge.case_id, scope.case_id, 'Edge case differs from case scope');
    assert.equal(edge.side, scope.side, 'Edge side differs from case scope');
    assert.equal(edge.dependency, 'module-import', 'Only direct module-import edges are scored');
    assert(nonempty(edge.source_path) && nonempty(edge.target_path), 'File endpoints are required');
    assert(nonempty(edge.source_group) && nonempty(edge.target_group), 'Module groups are required');
    assert.notEqual(edge.source_group, edge.target_group, 'Only cross-group edges are scored');
    const key = JSON.stringify(edgeKey(edge));
    assert(!keys.has(key), 'Duplicate file-edge key in one inventory');
    keys.set(key, edge);
  }
  return keys;
}

export function exactFileEdgeScore(truthEdges, predictedEdges, scope) {
  assert(nonempty(scope?.repository) && nonempty(scope?.case_id) && sides.includes(scope?.side),
    'An exact repository, case and side scope is required');
  const truth = checkedEdges(truthEdges, scope);
  const predicted = checkedEdges(predictedEdges, scope);
  let tp = 0;
  for (const [key, predictedEdge] of predicted) {
    if (!truth.has(key)) continue;
    const truthEdge = truth.get(key);
    assert.equal(predictedEdge.source_group, truthEdge.source_group, 'Matched edge source-group mapping differs');
    assert.equal(predictedEdge.target_group, truthEdge.target_group, 'Matched edge target-group mapping differs');
    tp += 1;
  }
  const fp = predicted.size - tp;
  const fn = truth.size - tp;
  const precision = tp + fp === 0 ? null : tp / (tp + fp);
  const recall = tp + fn === 0 ? null : tp / (tp + fn);
  const f1 = precision === null || recall === null ? null :
    (precision + recall === 0 ? 0 : 2 * precision * recall / (precision + recall));
  return {
    truth_edges: truth.size, predicted_edges: predicted.size, tp, fp, fn,
    precision, recall, f1,
    precision_reason: precision === null ? 'zero-predicted-positive-denominator' : null,
    recall_reason: recall === null ? 'zero-truth-positive-denominator' : null,
    f1_reason: f1 === null ? 'precision-or-recall-not-estimable' : null,
  };
}

function checkedSide(side, scope) {
  assert(side && typeof side === 'object', 'Both case sides are required');
  assert(truthStatuses.has(side.truth?.status), 'Truth status must be complete, unknown or unsupported');
  if (side.truth.status === 'complete') checkedEdges(side.truth.edges, scope);
  else assert(nonempty(side.truth.reason), 'Unknown or unsupported truth requires a reason');
  for (const tool of tools) {
    const output = side.outputs?.[tool];
    assert(outputStatuses.has(output?.status), `Missing or invalid ${tool} output status`);
    if (output.status === 'completed') checkedEdges(output.edges, scope);
    else assert(nonempty(output.reason), `${tool} failure or unsupported output requires a reason`);
  }
}

export function scoreSelectedCasePair(candidate) {
  assert(nonempty(candidate?.repository) && nonempty(candidate?.case_id), 'Selected case identity is required');
  for (const side of sides) checkedSide(candidate.sides?.[side],
    { repository: candidate.repository, case_id: candidate.case_id, side });

  const scores = {};
  for (const tool of tools) {
    const ready = sides.every((side) => candidate.sides[side].truth.status === 'complete' &&
      candidate.sides[side].outputs[tool].status === 'completed');
    const sideScores = Object.fromEntries(sides.map((side) => {
      const row = candidate.sides[side];
      const score = row.truth.status === 'complete' && row.outputs[tool].status === 'completed' ?
        exactFileEdgeScore(row.truth.edges, row.outputs[tool].edges,
          { repository: candidate.repository, case_id: candidate.case_id, side }) : null;
      return [side, score];
    }));
    scores[tool] = {
      attempted: true,
      completed: sides.every((side) => candidate.sides[side].outputs[tool].status === 'completed'),
      scored: ready,
      side_scores: sideScores,
      exact_case_success: ready ? sides.every((side) => sideScores[side].fp === 0 && sideScores[side].fn === 0) : null,
      empty_truth_case: ready ? sides.every((side) => sideScores[side].truth_edges === 0) : null,
    };
  }
  return {
    repository: candidate.repository,
    case_id: candidate.case_id,
    truth_unknown: sides.some((side) => candidate.sides[side].truth.status === 'unknown'),
    truth_unsupported: sides.some((side) => candidate.sides[side].truth.status === 'unsupported'),
    paired_comparable: tools.every((tool) => scores[tool].scored),
    tools: scores,
  };
}
