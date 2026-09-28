import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { sha256 } from '../scripts/d3-source-review/files.mjs';
import { collectSourceSyntaxHints } from '../scripts/d3-review/source-syntax-hints.mjs';

test('syntax aid records locations without resolving runtime behavior', () => {
  const source = [
    "// require('../comment-only')",
    "import type { A } from '../types';",
    "import { type B } from '../mixed';",
    "export { value } from '../value';",
    "const c = require('../common');",
    'const d = import(candidate);',
  ].join('\n');
  const result = collectSourceSyntaxHints(source, 'src/example.ts');
  assert.equal(result.parse_status, 'parsed-not-reviewed');
  assert.deepEqual(result.hints.map((hint) => hint.syntax), [
    'import-declaration', 'import-declaration', 'export-declaration', 'require-call', 'dynamic-import-call',
  ]);
  assert.deepEqual(result.hints.map((hint) => hint.line), [2, 3, 4, 5, 6]);
  assert.equal(result.hints[0].clause_type_only, true);
  assert.equal(result.hints[1].named_bindings_all_type_only, true);
  assert.equal(result.hints[3].binding_resolution, 'not-reviewed');
  assert.equal(result.hints[4].argument_is_literal, false);
  assert(result.hints.every((hint) => hint.review_status === 'unreviewed-syntax-hint'));
});

test('unsupported source and parse diagnostics cannot become clean negative reviews', () => {
  assert.equal(collectSourceSyntaxHints('nothing', 'src/data.json').parse_status, 'unsupported-extension');
  const invalid = collectSourceSyntaxHints('import {', 'src/broken.ts');
  assert.equal(invalid.parse_status, 'diagnostics-require-review');
  assert(invalid.parse_diagnostics.length > 0);
});

test('retained hints bind the accepted source packet without claiming labels or predictions', async () => {
  const raw = await readFile(new URL('../holdout/d3-source-syntax-hints/hints.json', import.meta.url));
  assert.equal(sha256(raw), '366a009e17be4fabd143b12963b9adb73dad31da946ca3e070ee95c578ab1c07');
  const packet = JSON.parse(raw.toString('utf8'));
  assert.equal(packet.schema, 'd3-source-syntax-hints/1');
  assert.equal(packet.cases_sha256, '44cc064a3555c90cc20d2a38ab61d67c6af598c1825bf5290cca2269ec801d35');
  assert.equal(packet.parser.version, '5.9.3');
  assert.equal(packet.study_tool_predictions_used, false);
  assert.equal(packet.human_review_complete, false);
  assert.equal(packet.empty_hints_are_not_negative_evidence, true);
  assert.deepEqual(packet.summary, { cases: 56, file_sides: 300, present_regular: 281,
    absent_at_side: 19, syntax_hints: 2970, parsed_without_hints_not_reviewed: 4,
    diagnostics_requiring_review: 0, source_reviews_completed: 0, labels_created: 0,
    study_tool_predictions_executed: 0 });
  assert.equal(packet.cases.flatMap((item) => item.file_sides).length, 300);
  assert(packet.cases.flatMap((item) => item.file_sides).every((side) =>
    side.review_status === 'unreviewed' && side.zero_dependency_claim === false));
});
