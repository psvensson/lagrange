// Deterministic evidence harness for the terminal-write-refusal-retry-
// ownership quest: receipt declarations only. The shared runtime
// (scripts/quest-evidence-harness-runtime.js) re-runs each recorded proof
// command and writes the probe artifact.

import path from 'node:path';

import {
  runQuestEvidenceHarness,
} from './quest-evidence-harness-runtime.js';

const RECEIPTS = Object.freeze([
  Object.freeze({
    id: 'refused-terminal-keeps-retry-owner-and-arms-repair',
    testFile:
      'test/rebalancer/cl-029-target-completion-evidence-retry-owner.test.js',
    detail: 'completeOperation/failOperation no longer erase the armed ' +
      'retry lanes at entry: a terminal persist whose typed disposition ' +
      'is REFUSED (the resolveZeroChangeOperationUpdate zero-change arm ' +
      'against a visible-but-unsatisfied non-terminal authority row) ' +
      'leaves the retained executor-outcome payload and its timed retry ' +
      'untouched, keeps the storage reservation ACTIVE, emits exactly ' +
      'one typed warn naming operationId/disposition/step, and arms the ' +
      'EXISTING operation-workflow-terminal-transition-repair (the same ' +
      'mechanism the committed-but-invisible confirm path uses; no new ' +
      'timer minted) so the refused write always keeps a retry owner ' +
      'that re-asserts the retained terminal projection until it lands; ' +
      'clearing every retry lane is now a consequence of a PROVEN ' +
      'terminal (committed write, TERMINAL_ADOPTED winner, or ' +
      'IDEMPOTENT_REPLAY) — those release-gated dispositions keep ' +
      'today\'s behavior exactly (red-on-revert: the pre-write ' +
      'clearTerminalOperationRetryState kills the armed visibility ' +
      'retry mid-backoff, the refusal returns silently, and the ' +
      'operation is left with no owner at all)',
  }),
  Object.freeze({
    id: 'drain-reports-truthful-progress',
    testFile:
      'test/rebalancer/operation-workflow-progress-event-driven-reentry' +
      '.test.js',
    detail: 'completeOperation/failOperation return their typed ' +
      '{committed, disposition} transition outcome and the priority ' +
      'recovery drain propagates truthful progress from all three of ' +
      'its settle arms (complete, superseded-target fail, stale-drain ' +
      'fail): a REFUSED termination reports progressed:false so ' +
      'level-triggered machinery keeps re-driving instead of believing ' +
      'a settle that never landed, while committed and release-gated ' +
      'proven-terminal outcomes still report progressed:true ' +
      '(red-on-revert: the drain returned true unconditionally after a ' +
      'void completeOperation — 175-249 termination decisions per ' +
      'run with zero durable terminals and zero escalation)',
  }),
]);

const QUEST_ID = 'terminal-write-refusal-retry-ownership';
const SOLVE_DIR = 'solve';
const EVIDENCE_DIR = 'evidence';
const RECEIPT_FILENAME =
  'terminal-write-refusal-retry-ownership.receipt.json';

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: path.join(SOLVE_DIR, EVIDENCE_DIR, RECEIPT_FILENAME),
  receipts: RECEIPTS,
});
