import assert from 'node:assert/strict';
import {existsSync, writeFileSync} from 'node:fs';
import {test} from 'node:test';

// Red on its first run and green on every later one: the marker file named by
// the environment records that the first run happened.
const MARKER_ENV = 'RUN_TEST_FILES_FAILS_ONCE_MARKER';
const TEST_NAME = 'fails once, then passes';
const FIRST_RUN_MESSAGE = 'the first attempt is red on purpose';

test(TEST_NAME, () => {
  const marker = process.env[MARKER_ENV];
  assert.ok(marker, `${MARKER_ENV} names the marker file`);
  if (!existsSync(marker)) {
    writeFileSync(marker, TEST_NAME);
    assert.fail(FIRST_RUN_MESSAGE);
  }
});
