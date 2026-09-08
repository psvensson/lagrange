// Deterministic evidence harness for the formation-async-attribution-propagation quest: receipt
// declarations only. The shared runtime
// (scripts/quest-evidence-harness-runtime.js) re-runs each recorded proof
// command and writes the probe artifact. Fill every testFile (a whole
// test file) or testNamePattern (an anchored ^...$ node:test name) before
// the receipt can pass; a placeholder receipt fails closed.

import path from 'node:path';

import {
  runQuestEvidenceHarness,
} from './quest-evidence-harness-runtime.js';

const TEST_FILE = 'test/diagnostics/formation-turn-attribution.test.js';

const RECEIPTS = Object.freeze([
  Object.freeze({
    id: 'exclusive-turn-partition',
    testFile: TEST_FILE,
    detail: 'the production attribution owner charges nested handoffs once, ' +
      'keeps unattributed dispatch explicit, and makes owner + unattributed + ' +
      'idle duration equal the injected-clock window with zero overlap',
  }),
  Object.freeze({
    id: 'awaiting-caller-remains-unattributed',
    testFile: TEST_FILE,
    detail: 'owner-internal Promise and timer descendants retain readiness ' +
      'ownership for 25us while the external awaiting continuation remains ' +
      'in the 5us unattributed segment',
  }),
  Object.freeze({
    id: 'bootstrap-release-survives-async-generations',
    testFile: TEST_FILE,
    detail: 'releaseOwnerDescendants reclassifies an existing bootstrap ' +
      'callback and its next scheduled generation, leaving zero bootstrap ' +
      'duration and all 30us explicitly unattributed',
  }),
  Object.freeze({
    id: 'both-counterexamples-red-on-revert',
    testFile: TEST_FILE,
    detail: 'behavioral mutation witnesses restore each independently ' +
      'rejected algorithm: triggerAsyncId fallback fails the 25/5us caller ' +
      'partition, and context-only propagation retags the released second ' +
      'generation instead of preserving the 0/30us partition',
  }),
  Object.freeze({
    id: 'activation-claim-precedes-hook',
    testFile: TEST_FILE,
    detail: 'the active-window singleton is claimed before injected clock or ' +
      'hook activation and stays claimed through activation rollback and ' +
      'normal hook disable, so reentrant contenders never overlap windows; ' +
      'exact early-release controls make both refusal proofs red',
  }),
  Object.freeze({
    id: 'activation-failure-full-rollback',
    testFile: TEST_FILE,
    detail: 'a hook dirties async owners, duration/dispatch/handoff maps, ' +
      'stack, depth, segment, turn count, and clock state before throwing; ' +
      'disable runs while exclusively claimed, every surface resets, and the ' +
      'same instance retries as a fresh 1us window, while failed terminal ' +
      'clock or hook disable also clears retained one-shot state',
  }),
]);

const QUEST_ID = 'formation-async-attribution-activation-rollback';
const SOLVE_DIR = 'solve';
const EVIDENCE_DIR = 'evidence';
const RECEIPT_FILE = 'formation-async-attribution-propagation.receipt.json';

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: path.join(SOLVE_DIR, EVIDENCE_DIR, RECEIPT_FILE),
  receipts: RECEIPTS,
});
