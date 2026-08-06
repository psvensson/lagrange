// Deterministic evidence harness for the remove-safety-universal-floor quest:
// receipt declarations only. The shared runtime
// (scripts/quest-evidence-harness-runtime.js) re-runs each recorded proof
// command and writes the probe artifact.

import path from 'node:path';

import {
  runQuestEvidenceHarness,
} from './quest-evidence-harness-runtime.js';

const RECEIPTS = Object.freeze([
  Object.freeze({
    id: 'universal-tier-applies-to-user-partition',
    testFile:
      'test/rebalancer/operation-workflow-remove-safety-universal-floor.test.js',
    detail: 'an ordinary (non-system) user-partition REMOVE no longer ' +
      'bypasses the execution-time safety floor: it is DEFERRED when the ' +
      'post-removal voter-ready count would drop below the min-replica ' +
      'floor, SAFE when the floor stays satisfied or the removed replica is ' +
      'not voter-ready — the systemTable early return is restructured into a ' +
      'universal tier (audit finding 1; red-on-revert: restoring the early ' +
      'return fails the defer test)',
  }),
  Object.freeze({
    id: 'system-tier-scope-preserved',
    testFile:
      'test/rebalancer/operation-workflow-remove-safety-universal-floor.test.js',
    detail: 'the published-membership / leader-tenure / ' +
      'priority-control-plane checks stay scoped to system entities: the ' +
      'universal tier never invokes the priority-tier context methods for a ' +
      'user partition (they throw if reached), and a system partition still ' +
      'runs the system tier',
  }),
  Object.freeze({
    id: 'remove-safety-suites-green',
    testFile: 'test/rebalancer/quorum-conditioned-remove-safety.test.js',
    detail: 'the pre-existing critical REMOVE safety suite passes with the ' +
      'universal floor engaged (error-normalization fixtures updated to seed ' +
      'replica rows now that user partitions are evaluated locally instead ' +
      'of bypassed)',
  }),
]);

const QUEST_ID = 'remove-safety-universal-floor';
const SOLVE_DIR = 'solve';
const EVIDENCE_DIR = 'evidence';
const RECEIPT_FILENAME = 'remove-safety-universal-floor.receipt.json';

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: path.join(SOLVE_DIR, EVIDENCE_DIR, RECEIPT_FILENAME),
  receipts: RECEIPTS,
});
