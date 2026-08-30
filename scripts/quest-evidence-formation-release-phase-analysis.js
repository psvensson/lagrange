// Deterministic evidence harness for the formation-release-phase-analysis
// quest: receipt declarations only. The shared runtime
// (scripts/quest-evidence-harness-runtime.js) re-runs each recorded proof
// command and writes the test-receipt probe artifact
// (solve/evidence/formation-release-phase-analysis.receipt.json). Each
// receipt re-executes one focused witness scenario rather than trusting a
// claim, so a regression that flips a witness red flips this receipt to
// fail and the quest's doneWhen cannot close on stale green evidence.
//
// Receipt honesty: the witness file uses raw node:test so each scenario is
// independently selectable with --test-name-pattern by its anchored name.
// On HEAD (before the cure) there is no per-phase projection and no
// analyze:formation-release-phases script, so phase-timeline-per-node,
// phase-outcome-from-analyzer-classification, phase-cli-renders-report-dir,
// phase-projection-carries-no-new-verdict, npm-script-registered and
// witness-deterministic are RED; analyzer-classification-unchanged is green
// and must stay green — a cure that turns it red is rejected.

import path from 'node:path';

import {
  runQuestEvidenceHarness,
} from './quest-evidence-harness-runtime.js';

const WITNESS_TEST = 'test/scripts/analyze-formation-release-phases.test.js';
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
    id: 'phase-timeline-per-node',
    command: scenarioCommand('^phase-timeline-per-node'),
    detail: 'every cohort member of every captured generation gets W ' +
      '(capture) -> handoff observed -> barrier release -> READY instants ' +
      'with deltas from W over the recorded 07-13-07 excerpt',
  }),
  Object.freeze({
    id: 'phase-outcome-from-analyzer-classification',
    command: scenarioCommand('^phase-outcome-from-analyzer-classification'),
    detail: 'each generation\'s classified outcome, the closure verdict, the ' +
      'failure reasons and completionMs are copied from the closure ' +
      'analyzer, never re-derived (single classification owner)',
  }),
  Object.freeze({
    id: 'phase-cli-renders-report-dir',
    command: scenarioCommand('^phase-cli-renders-report-dir'),
    detail: 'the CLI reads report.json and full-logs/ from one per-run ' +
      'report directory and prints the per-node timeline and classified ' +
      'outcome as text and as --json',
  }),
  Object.freeze({
    id: 'phase-projection-carries-no-new-verdict',
    command: scenarioCommand('^phase-projection-carries-no-new-verdict'),
    detail: 'the projection exposes no pass/fail field of its own at the ' +
      'run, generation or node level beyond the analyzer\'s copied verdict',
  }),
  Object.freeze({
    id: 'analyzer-classification-unchanged',
    command: scenarioCommand('^analyzer-classification-unchanged'),
    detail: 'the closure analyzer still classifies the recorded run on its ' +
      'own: completed + retained_uncompleted_at_teardown, closure failed',
  }),
  Object.freeze({
    id: 'npm-script-registered',
    command: scenarioCommand('^npm-script-registered'),
    detail: 'package.json exposes analyze:formation-release-phases and the ' +
      'npm run commands index lists it',
  }),
  Object.freeze({
    id: 'witness-deterministic',
    command: scenarioCommand('^witness-deterministic'),
    detail: 'two projections (and renderings) of the identical recorded run ' +
      'are identical',
  }),
]);

const QUEST_ID = 'formation-release-phase-analysis';
const SOLVE_DIR = 'solve';
const EVIDENCE_DIR = 'evidence';
const RECEIPT_FILENAME = 'formation-release-phase-analysis.receipt.json';

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: path.join(SOLVE_DIR, EVIDENCE_DIR, RECEIPT_FILENAME),
  receipts: RECEIPTS,
});
