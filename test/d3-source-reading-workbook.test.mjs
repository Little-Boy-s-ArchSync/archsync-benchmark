import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { sha256 } from '../scripts/d3-source-review/files.mjs';
import { buildSourceReadingWorkbook } from '../scripts/d3-review/source-reading-workbook.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const hintsPath = join(root, 'holdout/d3-source-syntax-hints/hints.json');
const workbookPath = join(root, 'holdout/d3-source-syntax-hints/reading-workbook.csv');

test('retained reading workbook is blank review preparation derived from pinned hints', async () => {
  const hints = JSON.parse(await readFile(hintsPath));
  const workbook = await readFile(workbookPath);
  assert.deepEqual(workbook, Buffer.from(buildSourceReadingWorkbook(hints), 'utf8'));
  assert.equal(sha256(workbook), 'c0c657d24a5b8f216cdafb6bce3b6cdedc2ed88a0d5da1418085b394754d67f3');
  const lines = workbook.toString('utf8').trimEnd().split('\n');
  assert.equal(lines.length, 1 + 300 + 2970);
  assert.equal(lines.filter((line) => line.startsWith('file-side,')).length, 300);
  assert.equal(lines.filter((line) => line.startsWith('syntax-hint,')).length, 2970);
  assert(lines[0].endsWith('reviewer_disposition,reviewer_target_path,reviewer_reason,reviewer_evidence,reviewer_verified_at_utc'));
  assert(lines.slice(1).every((line) => line.endsWith(',,,,,')),
    'Reviewer decision, target, reason, evidence and time must stay blank');
  assert.equal(hints.study_tool_predictions_used, false);
  assert.equal(hints.human_review_complete, false);
});

test('source-derived spreadsheet cells cannot execute formulas or inject rows', async () => {
  const hints = JSON.parse(await readFile(hintsPath));
  const first = hints.cases[0].file_sides[0].hints[0];
  const original = { ...first };
  Object.assign(first, { literal_value: '=HYPERLINK("bad")', quote: '+SUM(1,2)\nnext-row' });
  const rows = buildSourceReadingWorkbook(hints).split('\n');
  assert.equal(rows.length, 1 + 300 + 2970 + 1);
  assert(rows.some((row) => row.includes("'=HYPERLINK")));
  assert(rows.some((row) => row.includes("'+SUM(1,2)\\nnext-row")));
  Object.assign(first, original);
});

test('a workbook cannot turn unreviewed source into accepted truth', async () => {
  const hints = JSON.parse(await readFile(hintsPath));
  hints.cases[0].file_sides[0].review_status = 'reviewed';
  assert.throws(() => buildSourceReadingWorkbook(hints), /unreviewed/);
  hints.cases[0].file_sides[0].review_status = 'unreviewed';
  hints.cases[0].file_sides[0].zero_dependency_claim = true;
  assert.throws(() => buildSourceReadingWorkbook(hints), /false/);
});
