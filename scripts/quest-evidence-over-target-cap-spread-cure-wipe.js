// Deterministic evidence harness for the over-target-cap-spread-cure-wipe
// quest: receipt declarations only. The shared runtime
// (scripts/quest-evidence-harness-runtime.js) re-runs each recorded proof
// command and writes the probe artifact.

import path from 'node:path';

import {
  runQuestEvidenceHarness,
} from './quest-evidence-harness-runtime.js';

const RECEIPTS = Object.freeze([
  Object.freeze({
    id: 'over-target-cap-preserves-open-spread-cure',
    testFile:
      'test/rebalancer/critical-spread-terminal-stall-repro.test.js',
    detail: 'the exact archived ec-postfix-20260810T060111Z shape ' +
      '(activeCount=4, targetReplicaCount=3, activeDistinctNodeCount=2, ' +
      'targetDistinctNodeCount=3, zero in-flight operations) driven through ' +
      'the REAL UnifiedRebalancer + RebalanceCoordinator: the over-creation ' +
      'cap retains the floor-restoring spread-cure ADD instead of wiping it ' +
      '(addMoves.length = 0), the retained move is ADMITTED in the same ' +
      'evaluation cycle, and a spread-restoring operation row targeting a ' +
      'free node is persisted; red-on-revert verified 2026-08-10 by ' +
      'restoring HEAD copies of move-planner-move-calculation-methods.js, ' +
      'move-planner-priority-spread-cure.js and ' +
      'replica-placement-cure-policy.js — the over-target case then plans ' +
      'only a drain REMOVE and no add-like move (the wipe), failing this ' +
      'file; the companion over-target case in ' +
      'test/rebalancer/spread-cure-at-target-minting-gap.test.js pins the ' +
      'same cure through terminal drain-residue rows',
  }),
  Object.freeze({
    id: 'surplus-growth-still-refused',
    testFile: 'test/rebalancer/move-planner-over-creation-cap.test.js',
    detail: 'the fail-closed floor and retention exactness: an ' +
      'already-spread over-target partition (distinct-node floor met) gets ' +
      'ZERO add-like moves and still drains; retention is gap-capped and ' +
      'refuses ADDs onto already-hosting nodes (target 4 over ' +
      '[n1,n1,n2,n3] with actives on {n1,n4}: only ONE fresh-node ADD ' +
      'survives, the hosting-node ADD and the beyond-gap ADD are refused); ' +
      'the promotion-window raft-voter cap still fires; the drain resumes ' +
      'once the floor is met; the integration twin (already-spread ' +
      'over-target partition creates no add-like operation row) lives in ' +
      'test/rebalancer/spread-cure-at-target-minting-gap.test.js; ' +
      'red-on-revert verified 2026-08-10 (HEAD copies of the three source ' +
      'files fail this file: the cap wipes the retained cure cases)',
  }),
]);

const QUEST_ID = 'over-target-cap-spread-cure-wipe';
const SOLVE_DIR = 'solve';
const EVIDENCE_DIR = 'evidence';
const RECEIPT_FILENAME = 'over-target-cap-spread-cure-wipe.receipt.json';

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: path.join(SOLVE_DIR, EVIDENCE_DIR, RECEIPT_FILENAME),
  receipts: RECEIPTS,
});
