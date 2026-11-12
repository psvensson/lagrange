// The named admission of recreating a replica after a snapshot install
// (quest partition-checkpoint-epoch-generation, finding 1): its decision is
// total over what the authoritative lifecycle read can answer.

import assert from 'node:assert/strict';
import {test} from 'node:test';

import {SERVICE_TYPE} from '../../src/constants/service.js';
import {
  decideRecreateAfterInstallAdmission,
} from '../../src/node/replica-recreate-after-install-admission.js';
import {
  REPLICA_RECREATE_ADMISSION as ADMISSION,
  REPLICA_RECREATE_ADMISSION_REASON as REASON,
} from '../../src/node/replica-snapshot-install-constants.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';

const REPLICA = Object.freeze({replicaId: 'rows-p1-r2', partitionId: 'rows-p1',
  nodeId: 'node-b'});

function rowOf(fields = {}) {
  return {service_id: REPLICA.replicaId, service_type: SERVICE_TYPE.PARTITION,
    partition_id: REPLICA.partitionId, node_id: REPLICA.nodeId,
    status: ReplicaStatus.ACTIVE, ...fields};
}

function decide(row, available = true) {
  const {decision, reason, admitted} =
    decideRecreateAfterInstallAdmission({available, row}, REPLICA);
  return {decision, reason, admitted};
}

function expected(decision, reason) {
  return {decision, reason, admitted: decision === ADMISSION.ADMITTED};
}

test('every lifecycle status has a decision, and only ACTIVE and SYNCING ' +
  'admit', () => {
  const decisions = {
    [ReplicaStatus.ACTIVE]: [ADMISSION.ADMITTED, REASON.ROW_ACTIVE],
    [ReplicaStatus.SYNCING]: [ADMISSION.ADMITTED, REASON.ROW_SYNCING],
    [ReplicaStatus.PENDING]: [ADMISSION.HELD, REASON.ROW_BEFORE_SYNCING],
    [ReplicaStatus.CREATING]: [ADMISSION.HELD, REASON.ROW_BEFORE_SYNCING],
    [ReplicaStatus.HELD]: [ADMISSION.HELD, REASON.ROW_BEFORE_SYNCING],
    [ReplicaStatus.REMOVING]: [ADMISSION.REFUSED, REASON.ROW_REMOVAL_IN_PROGRESS],
    [ReplicaStatus.REMOVED]: [ADMISSION.REFUSED, REASON.ROW_REMOVAL_IN_PROGRESS],
    [ReplicaStatus.FAILED]: [ADMISSION.REFUSED, REASON.ROW_FAILED],
  };
  assert.deepEqual(Object.keys(decisions).sort(),
    Object.values(ReplicaStatus).sort(),
    'the witness names every status the lifecycle has');
  for (const [status, [decision, reason]] of Object.entries(decisions)) {
    assert.deepEqual(decide(rowOf({status})), expected(decision, reason), status);
  }
  assert.deepEqual(decide(rowOf({status: 'a status of a later version'})),
    expected(ADMISSION.REFUSED, REASON.ROW_STATUS_UNKNOWN),
    'a status the table does not know is refused, never admitted');
});

test('an unobservable row holds; it never refuses and never admits', () => {
  assert.deepEqual(decide(null, false),
    expected(ADMISSION.HELD, REASON.ROW_UNOBSERVABLE));
  assert.deepEqual(decide(rowOf(), false),
    expected(ADMISSION.HELD, REASON.ROW_UNOBSERVABLE),
    'whatever row an unavailable read carries is not read');
});

test('a replica whose row another owner holds, or that has none, is ' +
  'refused', () => {
  assert.deepEqual(decide(null), expected(ADMISSION.REFUSED, REASON.ROW_ABSENT));
  assert.deepEqual(decide(rowOf({service_type: SERVICE_TYPE.PARTITION_CLEANUP})),
    expected(ADMISSION.REFUSED, REASON.ROW_CLEANUP_OWNED));
  for (const other of [{service_type: SERVICE_TYPE.MESSAGE_GROUP},
    {node_id: 'node-c'}, {partition_id: 'rows-p2'}, {service_id: 'rows-p1-r9'}]) {
    assert.deepEqual(decide(rowOf(other)),
      expected(ADMISSION.REFUSED, REASON.ROW_NOT_THIS_REPLICA),
      JSON.stringify(other));
  }
});

test('the decision carries the row status it was made from', () => {
  assert.equal(decideRecreateAfterInstallAdmission(
    {available: true, row: rowOf({status: ReplicaStatus.SYNCING})}, REPLICA)
    .rowStatus, ReplicaStatus.SYNCING);
  assert.equal(decideRecreateAfterInstallAdmission(
    {available: false, row: null}, REPLICA).rowStatus, 'none');
});
