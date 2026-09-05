// Deterministic evidence harness for the membership-epoch-null-rehydration
// quest: receipt declarations only. The shared runtime
// (scripts/quest-evidence-harness-runtime.js) re-runs each recorded proof
// command and writes the probe artifact.

import path from 'node:path';

import {
  runQuestEvidenceHarness,
} from './quest-evidence-harness-runtime.js';

const TEST_FILE =
  'test/rebalancer/replica-operation-membership-epoch-binding.test.js';
const FENCE_TEST_FILE = 'test/rebalancer/assignment-epoch-fencing.test.js';

const RECEIPTS = Object.freeze([
  Object.freeze({
    id: 'E1-null-round-trip',
    testFile: TEST_FILE,
    detail: 'a replica_operations row persisted with membership_publication_epoch ' +
      '= SQL NULL through the real repository INSERT rehydrates via the real ' +
      'SQL and cache read routes as an UNBOUND operation (field absent, ' +
      'never 0); red-on-revert: Number(row.col) or ?? 0 in rowToOperation',
  }),
  Object.freeze({
    id: 'E2-epoch-zero-preserved',
    testFile: TEST_FILE,
    detail: 'a durable epoch 0 rehydrates as BOUND epoch 0 (zero is a legal ' +
      'operation-domain epoch, not a NULL sentinel); red-on-revert: treating ' +
      'zero as absent in the decoder',
  }),
  Object.freeze({
    id: 'E3-positive-epoch-preserved',
    testFile: TEST_FILE,
    detail: 'a durable epoch 2 rehydrates as in-memory 2',
  }),
  Object.freeze({
    id: 'E4-unbound-dispatch-follows-unbound-rule',
    testFile: TEST_FILE,
    detail: 'a rehydrated NULL-epoch ADD with current published epoch 2 ' +
      'passes the real dispatch epoch gate under the existing unbound rule: ' +
      'no "Stale dispatch for published membership epoch 0" failure, the ' +
      'executor request carries no fabricated epoch',
  }),
  Object.freeze({
    id: 'E5-stale-bound-still-rejected',
    testFile: TEST_FILE,
    detail: 'a rehydrated epoch-1 ADD against current epoch 2 is still failed ' +
      'closed as "Stale dispatch for published membership epoch 1; current ' +
      'epoch is 2" before any delivery; red-on-revert: disabling the ' +
      'stale-bound comparison',
  }),
  Object.freeze({
    id: 'E6-current-bound-accepted',
    testFile: TEST_FILE,
    detail: 'a rehydrated epoch-2 ADD against current epoch 2 dispatches and ' +
      'carries membershipPublicationEpoch 2 in the executor request',
  }),
  Object.freeze({
    id: 'E7-malformed-durable-fails-closed',
    testFile: TEST_FILE,
    detail: 'durable text, negative, fractional, and empty-text epoch values ' +
      'reachable through the SQLite column, and a string epoch on a cache ' +
      'row, throw INVALID_MEMBERSHIP_PUBLICATION_EPOCH_BINDING at ' +
      'rehydration instead of coercing into an epoch; the decode table pins ' +
      'undefined/null -> unbound, 0/2 -> bound, and every other ' +
      'representation -> invalid',
  }),
  Object.freeze({
    id: 'E8-single-decoder-inventory',
    testFile: TEST_FILE,
    detail: 'every src file reading the membership epoch is classified: 7 ' +
      'behaviour-changing readers import the single decode owner, the ' +
      'encode/schema pass-through set is closed, and zero src sites ' +
      'reinterpret the field with Number/parseInt/Math or a ?? 0 / || 0 ' +
      'sentinel',
  }),
  Object.freeze({
    id: 'epoch-fence-suite-green',
    testFile: FENCE_TEST_FILE,
    detail: 'the pre-existing assignment-epoch-fencing suite (creation ' +
      'deferral, dispatch stale rejection, unreadable deferral, durable ' +
      'planning epoch) stays green on the shared harness',
  }),
]);

const QUEST_ID = 'membership-epoch-null-rehydration';
const SOLVE_DIR = 'solve';
const EVIDENCE_DIR = 'evidence';
const RECEIPT_FILENAME = 'membership-epoch-null-rehydration.receipt.json';

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: path.join(SOLVE_DIR, EVIDENCE_DIR, RECEIPT_FILENAME),
  receipts: RECEIPTS,
});
