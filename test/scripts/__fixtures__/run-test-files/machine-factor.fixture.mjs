import assert from 'node:assert/strict';
import {test} from 'node:test';
import {scaleByMachineFactor} from '../../../../scripts/test-machine-factor.js';

const REFERENCE_MS = 30000;
const EXPECTED_MS = 90000;
const EXPECTED_CAP_SECONDS = '90';

test('runtime and declared budget use the child environment',
  {timeout: scaleByMachineFactor(REFERENCE_MS)}, () => {
    assert.equal(scaleByMachineFactor(REFERENCE_MS), EXPECTED_MS);
    assert.equal(process.env.TAP_TIMEOUT, EXPECTED_CAP_SECONDS);
  });
