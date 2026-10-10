// Evidence validation only. Selection and execution remain repository-owned.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const [root, offsetText, ...selected] = process.argv.slice(2);
assert(root && selected.length > 0);
const offset = Number(offsetText);
assert(Number.isSafeInteger(offset) && offset >= 0);
const bytes = fs.readFileSync(path.join(root, 'test-output/reports/test-results.ndjson'));
assert(bytes.length >= offset);
const rows = bytes.subarray(offset).toString('utf8').trim().split('\n').map(JSON.parse);
assert.equal(rows.length, selected.length, 'every selected file must have one fresh result');
assert.deepEqual(rows.map((r) => r.file).sort(), [...selected].sort());
const classes = JSON.parse(fs.readFileSync(path.join(root, 'test/shards/primary-classes.json'))).classes;
const {UNIT_TEST_TIMEOUT_MS} = await import(pathToFileURL(path.join(root,
  'src/test-helpers/test-timeout-constants.js')));
const limits = {unit: UNIT_TEST_TIMEOUT_MS, integration: 30000};
for (const row of rows) {
  assert.equal(row.ok, true, row.file);
  assert.equal(row.attempt, 1, 'a retry is not a first-attempt pass');
  assert.equal(row.retriedOnce, false);
  assert(Number.isFinite(row.durationMs) && row.durationMs > 0);
  const limit = limits[classes[row.file]];
  assert(Number.isFinite(limit), 'no guessed budget for an unclassified file');
  assert(row.durationMs <= limit, `${row.file} exceeded its unchanged ${limit} ms file budget`);
}
console.log(JSON.stringify({files: rows.length, allWithinExistingBudgets: true, rows}, null, 2));
