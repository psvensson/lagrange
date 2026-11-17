import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  collectCensusProblems,
  runNegativeControls,
} from '../../scripts/checks/independent-portability-q0-census.js';

const CENSUS_FILE = new URL(
  '../../solve/quests/independent-portability-q0-specification-census/evidence/census.json',
  import.meta.url,
);

function readCensus() {
  return JSON.parse(fs.readFileSync(CENSUS_FILE, 'utf8'));
}

test('Q0 evidence is pinned to a real source commit with explicit typed holds', () => {
  assert.deepEqual(collectCensusProblems(readCensus()), []);
});

test('Q0 checker rejects missing, stale, duplicate, unclassified and unowned evidence', () => {
  assert.deepEqual(runNegativeControls(readCensus()), []);
});

test('Q0 rejects a source row substituted with a different existing path', () => {
  const census = readCensus();
  census.rows[0].anchor = census.rows[1].anchor;
  assert.ok(collectCensusProblems(census).some((problem) =>
    problem.startsWith('wrong-anchor:')));
});
