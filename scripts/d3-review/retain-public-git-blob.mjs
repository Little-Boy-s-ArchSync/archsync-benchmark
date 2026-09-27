import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { gitId, sha256 } from '../d3-source-review/files.mjs';
import { encode } from './review.mjs';

const [repository, commit, path, expectedBlob, expectedSha256, outputDir] = process.argv.slice(2);
assert(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(repository ?? ''), 'Safe owner/repository required');
assert(/^[a-f0-9]{40}$/u.test(commit ?? '') && /^[a-f0-9]{40}$/u.test(expectedBlob ?? ''), 'Full Git identities required');
assert(/^[a-f0-9]{64}$/u.test(expectedSha256 ?? ''), 'SHA-256 required');
assert(typeof path === 'string' && path.split('/').every((part) => part && part !== '.' && part !== '..') && !path.includes('\\'), 'Safe repository path required');
assert(isAbsolute(outputDir ?? ''), 'New absolute output directory required');

const url = `https://raw.githubusercontent.com/${repository}/${commit}/${path.split('/').map(encodeURIComponent).join('/')}`;
const response = await fetch(url, { headers: { 'User-Agent': 'ArchSync-D3-source-provenance' }, signal: AbortSignal.timeout(30000) });
assert(response.ok, `Upstream source retrieval failed: HTTP ${response.status}`);
const bytes = Buffer.from(await response.arrayBuffer());
assert.equal(gitId('blob', bytes), expectedBlob, 'Remote bytes do not match pinned Git blob');
assert.equal(sha256(bytes), expectedSha256, 'Remote bytes do not match pinned SHA-256');
const receipt = { schema: 'd3-supplemental-upstream-source/1', status: 'source-only-not-label-or-prediction',
  repository, commit, path, source_url: url, retrieved_at_utc: new Date().toISOString(),
  git_blob: expectedBlob, sha256: expectedSha256, bytes: bytes.length,
  original_packet_modified: false, labels_created: false, predictions_executed: false };
await mkdir(outputDir);
await writeFile(join(outputDir, 'source.bytes'), bytes, { flag: 'wx' });
await writeFile(join(outputDir, 'receipt.json'), encode(receipt), { flag: 'wx' });
console.log(encode(receipt));
