import assert from 'node:assert/strict';
import {test} from 'node:test';

const TEST_NAME = 'node:test fixture executes';

test(TEST_NAME, () => {
  assert.ok(true);
});
