// Deterministic evidence harness for the blocked-spread-evaluation-event-
// wake quest: receipt declarations only. The shared runtime
// (scripts/quest-evidence-harness-runtime.js) re-runs each recorded proof
// command and writes the probe artifact.

import path from 'node:path';

import {
  runQuestEvidenceHarness,
} from './quest-evidence-harness-runtime.js';

const RECEIPTS = Object.freeze([
  Object.freeze({
    id: 'blocked-spread-wakes-on-release',
    testFile:
      'test/rebalancer/blocked-spread-release-event-wake.test.js',
    detail: 'a background entity parked on the blocked branch of ' +
      'resolvePrioritySpreadPlanningGateDecision (the live-run shape: ' +
      'nodes-p1 deferred with the flat [stableWindow, stableWindow+' +
      'jitter) release delay) registers an event-driven wake with the ' +
      'shared background-priority-spread-release tracker; when the ' +
      'priority partition\'s event-driven evaluations observe the ' +
      'blocker clear and resolve the stable release, the tracker ' +
      'notifies its readiness-owner scope and the parked entity is ' +
      'enqueued through the owner reconcile queue with the typed ' +
      'priority_spread_release_wake reason — before its fallback timer ' +
      'would have fired — and its re-evaluation plans immediately ' +
      '(red-on-revert: without the wake the priority partition returns ' +
      'before advancing the fence, no wake registry exists, and the ' +
      'parked entity sleeps out its full flat timer)',
  }),
  Object.freeze({
    id: 'stability-window-and-fallback-preserved',
    testFile:
      'test/rebalancer/blocked-spread-release-event-wake.test.js',
    detail: 'the recorded oscillation cure is untouched by the wake: the ' +
      'blocked-branch flat release delay law and the stabilizing-branch ' +
      'exact-deadline delay are still scheduled as fallback timers even ' +
      'with a wake registered; release still requires the full ' +
      'continuous-clear stability window (no wake fires one tick before ' +
      'maturity); every registered sharer is woken exactly once at ' +
      'stable release; and a fresh blocked observation re-arms a full ' +
      'new window with zero residual stability credit and no premature ' +
      'second wake',
  }),
]);

const QUEST_ID = 'blocked-spread-evaluation-event-wake';
const SOLVE_DIR = 'solve';
const EVIDENCE_DIR = 'evidence';
const RECEIPT_FILENAME =
  'blocked-spread-evaluation-event-wake.receipt.json';

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: path.join(SOLVE_DIR, EVIDENCE_DIR, RECEIPT_FILENAME),
  receipts: RECEIPTS,
});
