import assert from 'node:assert/strict';
import {test} from 'node:test';

// Run by the runner with GIT_DIR, GIT_WORK_TREE and GIT_INDEX_FILE set in its
// own environment: none of them may reach a test process.
test('no git repository pointer reaches a test process', () => {
  for (const name of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE']) {
    assert.equal(process.env[name], undefined, name);
  }
});
