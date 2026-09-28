import assert from 'node:assert/strict';
import { test } from 'node:test';
import { verifyV3 } from '../development/common-module-capability-modes-v3/runner.mjs';

test('retained compiler-mode receipts verify with unsupported probes unchanged', async () => {
  assert.deepEqual(await verifyV3(), {
    cases: 7, common_fixture_passes: 3, failed_common_candidates: 0,
    unsupported_probes: 4, d3_executed: false,
  });
});
