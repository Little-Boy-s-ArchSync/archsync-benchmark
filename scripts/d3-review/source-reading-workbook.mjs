import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ACCEPTED_CASES_SHA256 } from './file-side-preparation.mjs';

const columns = [
  'row_type', 'repository', 'case_id', 'side', 'commit', 'source_path',
  'source_git_blob', 'source_sha256', 'source_status', 'parse_status',
  'hint_index', 'syntax', 'line', 'column', 'literal_preview', 'quote_preview',
  'quote_sha256', 'reviewer_disposition', 'reviewer_target_path',
  'reviewer_reason', 'reviewer_evidence', 'reviewer_verified_at_utc',
];

function safeDisplay(value) {
  const printable = String(value ?? '').replaceAll('\\', '\\\\')
    .replaceAll('\r', '\\r').replaceAll('\n', '\\n').replaceAll('\t', '\\t');
  // Quoting a CSV cell alone does not prevent spreadsheet formula execution.
  return /^[=+\-@]/u.test(printable) ? `'${printable}` : printable;
}

function csvRow(values) {
  return values.map((value) => {
    const display = safeDisplay(value);
    return /[,"\r\n]/u.test(display) ? `"${display.replaceAll('"', '""')}"` : display;
  }).join(',');
}

/** Blank review aid only: no target resolution, disposition, label or negative inference. */
export function buildSourceReadingWorkbook(packet) {
  assert.equal(packet?.schema, 'd3-source-syntax-hints/1');
  assert.equal(packet.cases_sha256, ACCEPTED_CASES_SHA256);
  assert.equal(packet.study_tool_predictions_used, false);
  assert.equal(packet.human_review_complete, false);
  assert.equal(packet.empty_hints_are_not_negative_evidence, true);
  assert.equal(packet.summary?.cases, 56);
  assert.equal(packet.summary?.file_sides, 300);
  assert.equal(packet.summary?.syntax_hints, 2970);
  const rows = [columns.join(',')];
  let fileSides = 0, hints = 0;
  for (const item of packet.cases) {
    for (const side of item.file_sides) {
      assert.equal(side.review_status, 'unreviewed');
      assert.equal(side.zero_dependency_claim, false);
      const common = { repository: item.repository, case_id: item.case_id, side: side.side,
        commit: side.commit, source_path: side.path, source_git_blob: side.git_blob,
        source_sha256: side.source_sha256, source_status: side.source_status,
        parse_status: side.parse_status };
      const row = (kind, hint = {}, hintIndex = '') => csvRow(columns.map((column) => {
        if (column === 'row_type') return kind;
        if (column === 'hint_index') return hintIndex;
        if (column === 'literal_preview') return hint.literal_value;
        if (column === 'quote_preview') return hint.quote;
        return common[column] ?? hint[column] ?? '';
      }));
      rows.push(row('file-side'));
      fileSides += 1;
      side.hints.forEach((hint, index) => {
        assert.equal(hint.review_status, 'unreviewed-syntax-hint');
        rows.push(row('syntax-hint', hint, index + 1));
        hints += 1;
      });
    }
  }
  assert.equal(fileSides, 300);
  assert.equal(hints, 2970);
  return `${rows.join('\n')}\n`;
}

async function main() {
  const [command, input, output] = process.argv.slice(2);
  assert(['build', 'verify'].includes(command) && input && output && process.argv.length === 5,
    'Usage: node source-reading-workbook.mjs build|verify <hints.json> <workbook.csv>');
  const workbook = Buffer.from(buildSourceReadingWorkbook(JSON.parse(await readFile(resolve(input)))), 'utf8');
  if (command === 'build') {
    await writeFile(resolve(output), workbook, { flag: 'wx' });
    process.stdout.write(`WROTE UNREVIEWED SOURCE WORKBOOK ${output}\n`);
  } else {
    assert.deepEqual(await readFile(resolve(output)), workbook, 'Workbook differs from pinned syntax hints');
    process.stdout.write(`VERIFIED UNREVIEWED SOURCE WORKBOOK ${output}\n`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => { process.stderr.write(`${error.stack ?? error}\n`); process.exitCode = 1; });
}
