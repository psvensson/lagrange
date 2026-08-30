// Deterministic evidence harness for the
// solver-land-generated-output-coverage quest: receipt declarations only.
// The shared runtime (scripts/quest-evidence-harness-runtime.js) re-runs
// each recorded proof command and writes the test-receipt probe artifact
// (solve/evidence/solver-land-generated-output-coverage.receipt.json).
// Each receipt re-executes one focused witness scenario rather than trusting
// a claim, so a regression that flips a witness red flips this receipt to
// fail and the quest's doneWhen cannot close on stale green evidence.
//
// Receipt honesty: the witness file uses raw node:test so each scenario is
// independently selectable with --test-name-pattern by its anchored name.
// On HEAD (before the cure) the fresh-generated-seal-covered-at-land,
// landing-commits-fresh-seal-with-union and
// classification-manifest-fresh-covered receipts are RED (the 2026-08-30
// committed: no (commit-gate) landing on 81c30686e);
// stale-generated-output-stays-uncovered,
// non-generated-uncovered-path-still-blocks-unchanged,
// evidence-only-landing-unchanged and witness-deterministic are green and
// must stay green — a cure that turns them red is rejected.

import path from 'node:path';

import {
  runQuestEvidenceHarness,
} from './quest-evidence-harness-runtime.js';

const WITNESS_TEST =
  'test/solve/solver-land-generated-output-coverage.test.js';
const NODE_TEST_COMMAND_PREFIX = 'node --test ';
const TEST_NAME_PATTERN_FLAG_PREFIX = '--test-name-pattern="';
const DOUBLE_QUOTE = '"';
const SPACE = ' ';

// One verbatim proof command per scenario. node --test --test-name-pattern
// selects exactly one top-level witness scenario by its anchored name, so a
// green receipt is honest (its scenario exits 0) and a red receipt is honest
// (its scenario exits non-zero).
function scenarioCommand(scenarioPattern) {
  return NODE_TEST_COMMAND_PREFIX +
    TEST_NAME_PATTERN_FLAG_PREFIX + scenarioPattern + DOUBLE_QUOTE +
    SPACE + WITNESS_TEST;
}

const RECEIPTS = Object.freeze([
  Object.freeze({
    id: 'fresh-generated-seal-covered-at-land',
    command: scenarioCommand('^fresh-generated-seal-covered-at-land'),
    detail: 'the test/shards/impact-graph-seal.json rewritten by the ' +
      'landing\'s own inventory refresh (after the top-of-land union guard, ' +
      'before the commit gate audit) is covered because it is byte-identical ' +
      'to a fresh regeneration from the exact candidate, so the first land ' +
      'commits instead of reporting committed: no (commit-gate) and leaves ' +
      'no dirty seal for a hand checkout and a second land',
  }),
  Object.freeze({
    id: 'landing-commits-fresh-seal-with-union',
    command: scenarioCommand('^landing-commits-fresh-seal-with-union'),
    detail: 'outside solve/ the landing commit is exactly the recorded union ' +
      'plus the fresh seal, whose committed bytes equal a regeneration from ' +
      'the committed tree; the landing never pushes',
  }),
  Object.freeze({
    id: 'classification-manifest-fresh-covered',
    command: scenarioCommand('^classification-manifest-fresh-covered'),
    detail: 'dirty test classification manifests (the other registered ' +
      'generated outputs) byte-identical to their regeneration from the ' +
      'candidate are covered and ride the landing commit with the union',
  }),
  Object.freeze({
    id: 'stale-generated-output-stays-uncovered',
    command: scenarioCommand('^stale-generated-output-stays-uncovered'),
    detail: 'a registered generated output whose bytes differ from a fresh ' +
      'regeneration stays uncovered: the landing blocks with the typed ' +
      'blocked-uncovered-source-paths problem naming it, commits nothing ' +
      'and never rewrites the operator\'s bytes',
  }),
  Object.freeze({
    id: 'non-generated-uncovered-path-still-blocks-unchanged',
    command: scenarioCommand('^non-generated-uncovered-path-still-blocks-unchanged'),
    detail: 'a dirty source path outside the recorded union blocks the ' +
      'landing exactly as before (the union guard from ' +
      'solver-land-recorded-attempt-union-guard keeps its semantics)',
  }),
  Object.freeze({
    id: 'evidence-only-landing-unchanged',
    command: scenarioCommand('^evidence-only-landing-unchanged'),
    detail: 'a quest with no delta outside solve/ keeps its verdict ' +
      'not-required landing and commits only solve/ artifacts',
  }),
  Object.freeze({
    id: 'witness-deterministic',
    command: scenarioCommand('^witness-deterministic'),
    detail: 'two identical incident fixtures produce the identical landing ' +
      'outcome',
  }),
]);

const QUEST_ID = 'solver-land-generated-output-coverage';
const SOLVE_DIR = 'solve';
const EVIDENCE_DIR = 'evidence';
const RECEIPT_FILENAME =
  'solver-land-generated-output-coverage.receipt.json';

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: path.join(SOLVE_DIR, EVIDENCE_DIR, RECEIPT_FILENAME),
  receipts: RECEIPTS,
});
