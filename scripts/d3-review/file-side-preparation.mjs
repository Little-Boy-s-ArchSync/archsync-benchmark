import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gitId, sha256 } from '../d3-source-review/files.mjs';
import { isSafeHoldoutPath } from '../lib/holdout.mjs';

export const ACCEPTED_CASES_SHA256 = '44cc064a3555c90cc20d2a38ab61d67c6af598c1825bf5290cca2269ec801d35';
const oid = /^[a-f0-9]{40}$/u;
const hex = /^[a-f0-9]{64}$/u;
const key = (side, path) => JSON.stringify([side, path]);

/** Source-byte inventory only. This does not infer eligibility, imports or truth. */
export function buildFileSidePreparation(raw, expectedSha256 = ACCEPTED_CASES_SHA256) {
  assert(Buffer.isBuffer(raw) && raw.length > 0 && raw.length <= 32 * 1024 * 1024, 'Bounded raw case bundle required');
  assert.equal(sha256(raw), expectedSha256, 'Case bundle is not the pinned input');
  const input = JSON.parse(raw.toString('utf8'));
  assert.equal(input.schema, 'd3-review-cases/1');
  assert.equal(input.cases?.length, 56, 'Expected 56 selected cases');
  assert.equal(input.context_only_cases?.length, 4, 'Expected four context-only cases');
  const seenCases = new Set();
  const summary = { cases: 56, primary_paths: 0, file_sides: 0, present_regular: 0, symlink_not_followed: 0, absent_at_side: 0 };
  const cases = input.cases.map((item) => {
    assert(typeof item.repository === 'string' && item.repository.length > 0);
    assert(typeof item.id === 'string' && item.id.length > 0);
    assert(oid.test(item.base) && oid.test(item.head));
    const caseKey = JSON.stringify([item.repository, item.id]);
    assert(!seenCases.has(caseKey), 'Duplicate selected case'); seenCases.add(caseKey);
    assert(Array.isArray(item.scope_path_roles) && Array.isArray(item.files));
    const paths = item.scope_path_roles.filter((row) => row.role === 'primary-candidate').map((row) => row.path);
    assert(paths.length > 0 && new Set(paths).size === paths.length, 'Duplicate or empty primary path set');
    for (const path of paths) assert(isSafeHoldoutPath(path), 'Unsafe primary path');
    summary.primary_paths += paths.length;
    const sourceByKey = new Map();
    for (const source of item.files) {
      assert(['base', 'head'].includes(source.side) && isSafeHoldoutPath(source.path), 'Unsafe source record');
      const sourceKey = key(source.side, source.path);
      assert(!sourceByKey.has(sourceKey), 'Duplicate source file-side');
      sourceByKey.set(sourceKey, source);
    }
    const file_sides = [];
    for (const path of paths.sort()) for (const side of ['base', 'head']) {
      const source = sourceByKey.get(key(side, path));
      const commit = item[side];
      summary.file_sides++;
      if (!source) {
        summary.absent_at_side++;
        file_sides.push({ side, commit, path, tree_mode: 'absent', git_blob: null, sha256: null,
          source_status: 'absent-at-side', review_status: 'unreviewed', occurrence_count: null });
        continue;
      }
      assert(oid.test(source.git_blob) && hex.test(source.sha256), 'Invalid source object identity');
      assert(['100644', '100755', '120000'].includes(source.mode), 'Unsupported Git mode');
      assert(source.citable === true && typeof source.text === 'string', 'Primary source lacks citable text');
      const bytes = Buffer.from(source.text, 'utf8');
      assert.equal(bytes.length, source.bytes, 'Source byte length differs from packet');
      assert.equal(sha256(bytes), source.sha256, 'Source SHA-256 differs from packet');
      assert.equal(gitId('blob', bytes), source.git_blob, 'Source Git blob differs from packet');
      if (source.mode === '120000') summary.symlink_not_followed++;
      else summary.present_regular++;
      file_sides.push({ side, commit, path, tree_mode: source.mode, git_blob: source.git_blob,
        sha256: source.sha256, source_status: source.mode === '120000' ? 'symlink-not-followed' : 'present-regular',
        review_status: 'unreviewed', occurrence_count: null });
    }
    return { repository: item.repository, case_id: item.id, base: item.base, head: item.head, file_sides };
  });
  assert.equal(summary.present_regular + summary.symlink_not_followed + summary.absent_at_side, summary.file_sides);
  return { schema: 'd3-file-side-preparation/1', status: 'source-metadata-only-not-reviewed',
    cases_sha256: sha256(raw), summary, tool_predictions_used: false, review_decisions_created: false, cases };
}

async function main() {
  const [command, input, output] = process.argv.slice(2);
  assert(['build', 'verify'].includes(command) && input && output && process.argv.length === 5,
    'Usage: node file-side-preparation.mjs build|verify <cases.json> <inventory.json>');
  const expected = Buffer.from(JSON.stringify(buildFileSidePreparation(await readFile(resolve(input))), null, 2) + '\n');
  if (command === 'build') {
    await writeFile(resolve(output), expected, { flag: 'wx' });
    process.stdout.write(`WROTE SOURCE-ONLY FILE-SIDE PREPARATION ${output}\n`);
  } else {
    assert.deepEqual(await readFile(resolve(output)), expected, 'Prepared inventory differs from pinned source bytes');
    process.stdout.write(`VERIFIED SOURCE-ONLY FILE-SIDE PREPARATION ${output}\n`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => { process.stderr.write(`${error.stack ?? error}\n`); process.exitCode = 1; });
}
