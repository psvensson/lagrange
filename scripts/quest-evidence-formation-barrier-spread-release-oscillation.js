// Deterministic evidence harness for the formation-barrier-spread-release-
// oscillation quest: receipt declarations only. The shared runtime
// (scripts/quest-evidence-harness-runtime.js) re-runs each recorded proof
// command and writes the probe artifact.

import path from 'node:path';

import {
  runQuestEvidenceHarness,
} from './quest-evidence-harness-runtime.js';

const RECEIPTS = Object.freeze([
  Object.freeze({
    id: 'engaged-barrier-releases-under-execution-faults',
    testFile:
      'test/convergence/dt-formation-barrier-spread-release-oscillation.test.js',
    detail: 'a seed + two pre-ready joiners cohort with every ' +
      'replica_operations-p1 voter on the seed engages the REAL join ' +
      'formation barrier on a virtual clock while the seed executes real ' +
      'MovePlanner spread cures through production-shaped formation faults ' +
      '(session-carrying ledger mutations fail DISTRIBUTED_PARTICIPANT_' +
      'FAILURE while the ledger is concentrated; the authoritative ' +
      'stopping-observation status lane is shed all window; the ' +
      'partition-scoped owner-RPC placement lane answers only ' +
      'intermittently, reproducing the field spread<->observation state ' +
      'flap): the barrier reaches a genuine SATISFIED inside its budget ' +
      'with three distinct voter nodes, zero starved non-terminal ops, no ' +
      'session-carried formation-window ledger mutation (link A: the ' +
      'ledger self-coupled admission INSERT rides the session-less ' +
      'transition lane), a starved STOPPING observation escalated to a ' +
      'typed visible failure after the bounded deferral limit (link B), a ' +
      'later cure completing cleanly, and a sub-limit observation blip ' +
      'completing without any visible failure (red-on-revert: restoring ' +
      'either the session-carried INSERT or the unbounded defer loop ' +
      'times the barrier out at 2/3 distinct nodes — with participant-' +
      'failure admission rejections or a REPLACE pinned at STOPPING ' +
      'respectively)',
  }),
  Object.freeze({
    id: 'fail-closed-formation-cases-preserved',
    testFile:
      'test/convergence/dt-formation-priority-placement-before-active.test.js',
    detail: 'every pre-existing fail-closed formation case is untouched: ' +
      'the two-node cohort bypass, sequential third-node growth bypass, ' +
      'durable-rejoin bypass with fresh-join/unknown modes staying ' +
      'fail-closed on incomplete snapshots, the feasible cohort failing ' +
      'closed and resumable on incomplete voter observation, the ' +
      'authoritative-placement matrix (partial/concentrated/non-owner-' +
      'lane evidence never releases), and the real REPLACE->ADD->REMOVE ' +
      'formation flow releasing only after genuine one-voter-per-node ' +
      'spread with zero in-flight ledger operations',
  }),
]);

const QUEST_ID = 'formation-barrier-spread-release-oscillation';
const SOLVE_DIR = 'solve';
const EVIDENCE_DIR = 'evidence';
const RECEIPT_FILENAME =
  'formation-barrier-spread-release-oscillation.receipt.json';

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: path.join(SOLVE_DIR, EVIDENCE_DIR, RECEIPT_FILENAME),
  receipts: RECEIPTS,
});
