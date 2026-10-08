#!/usr/bin/env node
import assert from 'node:assert/strict';

import {runQuestEvidenceHarness} from './harness-runtime.js';
import {refuseUnderProbe} from '../../src/test-helpers/probe-guard.js';

const QUEST_ID = 'raft-rs-local-open-storage-binding-completeness';
const OUTPUT_FILE =
  'solve/quests/raft-rs-local-open-storage-binding-completeness/evidence/receipt.json';
const LOCAL_OPEN_MATRIX_TEST =
  'test/raft/raft-rs-backend/snapshot-owner-r4-local-open-future-acceptance.test.js';
const SUPPORTED_BOUNDARY_TEST =
  'test/raft/raft-rs-backend/snapshot-owner-r4-supported-fault-boundary.test.js';
const DURABLE_REJOIN_TEST =
  'test/raft/raft-rs-backend/durable-rejoin-record-refusal.test.js';

const RECEIPT_ID_LOCAL_OPEN = 'local-open-per-fact-storage-binding';
const RECEIPT_ID_KNOWN_WIPE = 'known-wipe-current-db-hold-replays';
const RECEIPT_ID_READ_UNAVAILABLE = 'read-unavailable-does-not-fabricate-absence';
const RECEIPT_ID_COLD_RESTART = 'three-voter-intact-cold-restart';
const PROBE_REFUSAL_LABEL = 'the Dependency-B local-open evidence harness';
const SCOPE_ASSERTION_MESSAGE =
  'Dependency-B harness stays inside the reviewed local-open receipt scope';
const RECEIPT_FILE_ASSERTION_MESSAGE =
  'Dependency-B harness runs only local-open/known-wipe/read-unavailable/cold-restart witnesses';

function receiptIds(receipts) {
  return receipts.map((receipt) => receipt.id);
}

const receipts = Object.freeze([
  {
    id: RECEIPT_ID_LOCAL_OPEN,
    testFile: LOCAL_OPEN_MATRIX_TEST,
    testNamePattern: '^R4 future acceptance: incomplete or contradictory LOCAL_OPEN facts refuse before core while legal vote zero and native-record lag restore$',
    detail: 'future R4 per-fact matrix reaches the current local-open owner red while retaining legal vote0 and native-record lag positives',
  },
  {
    id: RECEIPT_ID_KNOWN_WIPE,
    testFile: SUPPORTED_BOUNDARY_TEST,
    testNamePattern: '^R4 supported fault boundary - a real prior open then DB wipe drives ReplicaHandler into PartitionService reseed hold before native core$',
    detail: 'real prior open, current DB wipe, durable SERVICES prior-existence, same-byte HOLD replay and zero create_node for the refused reopen',
  },
  {
    id: RECEIPT_ID_READ_UNAVAILABLE,
    testFile: DURABLE_REJOIN_TEST,
    testNamePattern: '^T5: a rejoin with a durable record restores its own configuration, not the planted rows; an unreadable record is a retryable host failure at the same phase$',
    detail: 'applied-state unreadability in the durable rejoin record is retryable at DURABLE_RECORD_READ and is distinct from missing/non-retryable absence; broader per-fact unreadability remains with the local-open matrix red',
  },
  {
    id: RECEIPT_ID_COLD_RESTART,
    testFile: SUPPORTED_BOUNDARY_TEST,
    testNamePattern: '^R4 ordinary cold restart - three intact voters elect and commit with no preexisting live leader$',
    detail: 'three intact file-backed voters close, reopen, elect without a live old leader and commit an ordinary entry',
  },
]);

refuseUnderProbe(PROBE_REFUSAL_LABEL);
assert.deepEqual(receiptIds(receipts), [
  RECEIPT_ID_LOCAL_OPEN,
  RECEIPT_ID_KNOWN_WIPE,
  RECEIPT_ID_READ_UNAVAILABLE,
  RECEIPT_ID_COLD_RESTART,
], SCOPE_ASSERTION_MESSAGE);
assert.equal(receipts.every((receipt) =>
  [LOCAL_OPEN_MATRIX_TEST, SUPPORTED_BOUNDARY_TEST, DURABLE_REJOIN_TEST]
    .includes(receipt.testFile)), true,
RECEIPT_FILE_ASSERTION_MESSAGE);

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: OUTPUT_FILE,
  receipts,
});
