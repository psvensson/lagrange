// Fixture scenarios for the anchored-runner control. One of these FAILS on
// purpose, so the tests are registered only when this file is the entry point
// of a `node --test` run: importing it (for the names) must not register a
// deliberate failure into the importing suite, and the file deliberately does
// not match the *.test.js discovery glob so no lane collects it.
import test from 'node:test';
import assert from 'node:assert/strict';

const FIXTURE_SCENARIO = Object.freeze({
  PASSES: 'anchored-runner-fixture-passes',
  FAILS: 'anchored-runner-fixture-fails',
  ABSENT: 'anchored-runner-fixture-absent-on-purpose',
});
const ENTRY_ARGV_INDEX = 1;
const DELIBERATE_FAILURE = 'deliberate fixture failure';

function isEntryPoint() {
  const entry = process.argv[ENTRY_ARGV_INDEX];
  return typeof entry === 'string' && entry.endsWith(
    'anchored-runner-fixture-cases.js');
}

if (isEntryPoint()) {
  test(FIXTURE_SCENARIO.PASSES, () => {
    assert.ok(true);
  });
  test(FIXTURE_SCENARIO.FAILS, () => {
    assert.fail(DELIBERATE_FAILURE);
  });
}

export {FIXTURE_SCENARIO};
