import assert from 'node:assert/strict';
import {test} from 'node:test';

const TEST_NAME = 'node:test failing fixture';
const FAILURE_MESSAGE = 'runner must preserve assertion failures';

test(TEST_NAME, () => {
  assert.fail(FAILURE_MESSAGE);
});
