// Deterministic evidence harness for the
// formation-release-handoff-negative-control-integrity quest: receipt
// declarations only. The shared runtime
// (scripts/quest-evidence-harness-runtime.js) re-runs each recorded proof
// command and writes the test-receipt probe artifact
// (solve/evidence/formation-release-handoff-negative-control-integrity.receipt.json).
// Each receipt re-executes the focused test file rather than trusting a
// claim, so a regression that flips a subtest red flips this receipt to
// fail and the quest's doneWhen cannot close on stale green evidence.

import path from 'node:path';

import {
  runQuestEvidenceHarness,
} from './quest-evidence-harness-runtime.js';

const NEGATIVE_CONTROL_TEST =
  'test/scripts/run-formation-release-handoff-gcp-negative-control.test.js';
const ANALYZER_TEST =
  'test/scripts/run-formation-release-handoff-gcp.test.js';

const RECEIPTS = Object.freeze([
  Object.freeze({
    id: 'fixed-reported-in-fixed-lane',
    testFile: NEGATIVE_CONTROL_TEST,
    detail: 'a fixed-variant report maps to the certification scenario ' +
      'formation-release-handoff-closure and counts toward the fixed ' +
      'consecutive-run population (lane separation suite)',
  }),
  Object.freeze({
    id: 'reverted-control-in-separate-lane',
    testFile: NEGATIVE_CONTROL_TEST,
    detail: 'a reverted-variant report maps to the DISTINCT control ' +
      'scenario formation-release-handoff-closure-reverted-control, so ' +
      'an expected-failing control can never enter the fixed ' +
      'certification stream (the scenario-harness probe is scenario-keyed)',
  }),
  Object.freeze({
    id: 'control-refuses-equal-fingerprints',
    testFile: NEGATIVE_CONTROL_TEST,
    detail: 'the control refuses to run (ERROR_FINGERPRINT_EQUALITY) when ' +
      'the deployed reverted source fingerprint equals the fixed source ' +
      'fingerprint — the assertion that would have caught the historical ' +
      'false control',
  }),
  Object.freeze({
    id: 'byte-distinct-single-axis-revert',
    testFile: NEGATIVE_CONTROL_TEST,
    detail: 'the isolated-worktree revert deploys DIFFERENT source than ' +
      'the main tree (fixed and reverted fingerprints differ) and the ' +
      'main tree is byte-identical before/after; the reverse patch is a ' +
      'deterministic unified diff against the candidate, not a historical ' +
      'commit',
  }),
  Object.freeze({
    id: 'expected-control-red-passes-control',
    testFile: NEGATIVE_CONTROL_TEST,
    detail: 'EXPECTED control red: reverted source reproducing the named ' +
      'regression (noStrandedGeneration/generationRetainedAcrossReopen/' +
      'invalidRevocation) makes the negative-control scenario PASS',
  }),
  Object.freeze({
    id: 'unexpected-control-green-fails-control',
    testFile: NEGATIVE_CONTROL_TEST,
    detail: 'UNEXPECTED control green: reverted source closing ' +
      'successfully makes the negative-control scenario FAIL ' +
      '(expectedRegressionObserved false)',
  }),
  Object.freeze({
    id: 'organic-fixed-failure-resets-streak',
    testFile: NEGATIVE_CONTROL_TEST,
    detail: 'an ORGANIC fixed-source failure stays in the fixed lane and ' +
      'still resets the consecutive-run streak (passed IS the product ' +
      'closure, no control block); it is never hidden by the control ' +
      'machinery',
  }),
  Object.freeze({
    id: 'analyzer-tests-stay-green',
    testFile: ANALYZER_TEST,
    detail: 'the neighboring analyzer/runner tests remain green (42/42): ' +
      'the negative-control change is additive on the runner boundary and ' +
      'does not regress the formation-release-handoff-closure analyzer or ' +
      'its mandated deterministic cases',
  }),
]);

const QUEST_ID = 'formation-release-handoff-negative-control-integrity';
const SOLVE_DIR = 'solve';
const EVIDENCE_DIR = 'evidence';
const RECEIPT_FILENAME =
  'formation-release-handoff-negative-control-integrity.receipt.json';

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: path.join(SOLVE_DIR, EVIDENCE_DIR, RECEIPT_FILENAME),
  receipts: RECEIPTS,
});
