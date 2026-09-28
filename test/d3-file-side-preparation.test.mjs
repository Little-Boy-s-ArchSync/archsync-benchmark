import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { buildFileSidePreparation } from '../scripts/d3-review/file-side-preparation.mjs';
import { gitId, sha256 } from '../scripts/d3-source-review/files.mjs';

function fixture() {
  const text = "import { value } from './value';\n";
  const bytes = Buffer.from(text);
  const file = { path: 'src/main.ts', side: 'head', git_blob: gitId('blob', bytes), mode: '100644',
    bytes: bytes.length, sha256: sha256(bytes), text, citable: true, line_count: 1 };
  const cases = Array.from({ length: 56 }, (_, index) => ({
    id: `C${String(index + 1).padStart(3, '0')}`, repository: 'example/repository',
    base: 'a'.repeat(40), head: 'b'.repeat(40),
    scope_path_roles: [{ path: 'src/main.ts', role: 'primary-candidate' },
      { path: 'tests/main.test.ts', role: 'context-only' }], files: [file],
  }));
  return { schema: 'd3-review-cases/1', cases, context_only_cases: [{}, {}, {}, {}] };
}

function build(input, expectedSha = null) {
  const raw = Buffer.from(JSON.stringify(input));
  return buildFileSidePreparation(raw, expectedSha ?? sha256(raw));
}

test('source preparation records both sides without inventing a negative or a review', () => {
  const result = build(fixture());
  assert.equal(result.status, 'source-metadata-only-not-reviewed');
  assert.deepEqual(result.summary, { cases: 56, primary_paths: 56, file_sides: 112,
    present_regular: 56, symlink_not_followed: 0, absent_at_side: 56 });
  assert.equal(result.tool_predictions_used, false);
  assert.equal(result.review_decisions_created, false);
  assert.deepEqual(result.cases[0].file_sides.map(({ source_status }) => source_status),
    ['absent-at-side', 'present-regular']);
  assert(result.cases.every((item) => item.file_sides.every((side) =>
    side.review_status === 'unreviewed' && side.occurrence_count === null)));
  assert(!JSON.stringify(result).includes('tests/main.test.ts'));
  assert(!JSON.stringify(result).includes("import { value }"));
});

test('preparation rejects a substituted selected bundle', () => {
  const raw = Buffer.from(JSON.stringify(fixture()));
  assert.throws(() => buildFileSidePreparation(raw), /not the pinned input/);
});

test('preparation rejects source-byte and Git-object mismatches', () => {
  const input = fixture();
  input.cases[0].files[0].text = "import { other } from './value';\n";
  assert.throws(() => build(input), /Source SHA-256 differs/);
  input.cases[0].files[0].sha256 = sha256(Buffer.from(input.cases[0].files[0].text));
  assert.throws(() => build(input), /Source Git blob differs/);
});

test('preparation rejects duplicate, unsafe and missing population descriptors', () => {
  const repeated = fixture(); repeated.cases[1].id = repeated.cases[0].id;
  assert.throws(() => build(repeated), /Duplicate selected case/);
  const unsafe = fixture(); unsafe.cases[0].scope_path_roles[0].path = '../secret.ts';
  assert.throws(() => build(unsafe), /Unsafe primary path/);
  const missing = fixture(); missing.cases.pop();
  assert.throws(() => build(missing), /Expected 56 selected cases/);
});

test('retained inventory stays a source-only, unreviewed checklist', async () => {
  const raw = await readFile(new URL('../holdout/d3-file-side-preparation/inventory.json', import.meta.url));
  assert.equal(sha256(raw), 'c629044a356c2a83a1a28eb85078f813b227862a088e64476674e1c54f06f68a');
  const inventory = JSON.parse(raw.toString('utf8'));
  assert.equal(inventory.cases_sha256, '44cc064a3555c90cc20d2a38ab61d67c6af598c1825bf5290cca2269ec801d35');
  assert.equal(inventory.status, 'source-metadata-only-not-reviewed');
  assert.deepEqual(inventory.summary, { cases: 56, primary_paths: 150, file_sides: 300,
    present_regular: 281, symlink_not_followed: 0, absent_at_side: 19 });
  assert.equal(inventory.tool_predictions_used, false);
  assert.equal(inventory.review_decisions_created, false);
  assert.equal(inventory.cases.length, 56);
  assert.equal(inventory.cases.reduce((count, item) => count + item.file_sides.length, 0), 300);
  for (const item of inventory.cases) for (const side of item.file_sides) {
    assert.equal(side.review_status, 'unreviewed');
    assert.equal(side.occurrence_count, null);
    assert(['present-regular', 'absent-at-side'].includes(side.source_status));
  }
  assert(!raw.includes(Buffer.from('"label"')));
  assert(!raw.includes(Buffer.from('"prediction"')));
  assert(!raw.includes(Buffer.from('"text"')));
});
