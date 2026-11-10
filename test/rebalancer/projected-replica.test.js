// The projected replica (src/rebalancer/projected-replica.js): the one
// record type of a replica the rebalancer plans over. Pinned: the field set,
// the values copied from a full decoded services row, the replica identity
// derivation (stored replica_id, else service_id), the terminal create
// target built from a planned change, the planned change applied to a
// stored row, the frozen results, and every typed refusal (a raw row, a
// narrow projection, a non-record, an incomplete planned change, a value
// that is not a projected replica).

import assert from 'node:assert/strict';
import {test} from 'node:test';

import {SERVICE_TYPE} from '../../src/constants/service.js';
import {
  decodeServicesRow,
  defineServicesProjection,
} from '../../src/control-plane/services-row-decoder.js';
import {ROW_ABSENT} from '../../src/control-plane/system-table-row-decoding.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {
  PROJECTED_REPLICA_ERROR_CODE,
  PROJECTED_REPLICA_FIELD,
  PROJECTED_REPLICA_FIELDS,
  PROJECTED_REPLICA_REFUSAL,
  ProjectedReplicaError,
  TERMINAL_CREATE_TARGET_REPLICA_STATE,
  assertProjectedReplica,
  buildTerminalCreateTargetReplica,
  projectReplicaAsTerminalCreateTarget,
  projectReplicaFromServicesRow,
  projectReplicasFromServicesRows,
  readLowerCaseReplicaText,
  readPlacementStatus,
} from '../../src/rebalancer/projected-replica.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {servicesRow} from '../test-helpers/system-table-row-fixture.js';

const STORED = Object.freeze({
  service_id: 'partition-1:node-2', service_type: 'partition', node_id: 'node-2',
  partition_id: 'partition-1', group_id: null, replica_id: 'partition-1:node-2',
  raft_role: 'LEADER', status: 'ACTIVE', state_entered_at: 1700, previous_state: 'syncing',
  trigger_reason: 'promoted', error_message: null, cleanup_token: null,
  create_attempt_token: 'attempt-7', address: 'ws://node-2:8080', created_at: 1000,
  updated_at: 1800,
});

function refusal(fn, reason, field) {
  assert.throws(fn, (error) => {
    assert.ok(error instanceof ProjectedReplicaError);
    assert.equal(error.code, PROJECTED_REPLICA_ERROR_CODE);
    assert.equal(error.reason, reason);
    assert.equal(error.field, field);
    return true;
  });
}

test('a projected replica carries exactly its fields, from the decoded row', () => {
  const replica = projectReplicaFromServicesRow(decodeServicesRow(servicesRow(STORED)));
  assert.deepEqual(Object.keys(replica).sort(), [...PROJECTED_REPLICA_FIELDS].sort());
  assert.deepEqual(replica, {
    replicaId: 'partition-1:node-2',
    serviceId: 'partition-1:node-2',
    serviceType: SERVICE_TYPE.PARTITION,
    partitionId: 'partition-1',
    groupId: ROW_ABSENT,
    nodeId: 'node-2',
    // Kept as stored, case included (round 5): readers that lower-cased at
    // HEAD read through readLowerCaseReplicaText.
    status: 'ACTIVE',
    raftRole: 'LEADER',
    address: 'ws://node-2:8080',
    createdAt: 1000,
    stateEnteredAt: 1700,
    createAttemptToken: 'attempt-7',
    previousState: 'syncing',
    cleanupToken: ROW_ABSENT,
  });
  assert.ok(Object.isFrozen(replica));
  assert.equal(Object.hasOwn(replica, 'projection'), false);
});

test('replicaId is the stored replica_id, else the service_id (NULL and \'\' alike)', () => {
  const stored = projectReplicaFromServicesRow(decodeServicesRow(servicesRow({
    ...STORED, service_id: 'runtime-a-r1', replica_id: 'endpoint-9',
  })));
  assert.equal(stored.replicaId, 'endpoint-9');
  assert.equal(stored.serviceId, 'runtime-a-r1');
  const seeded = projectReplicaFromServicesRow(decodeServicesRow(servicesRow({
    ...STORED, replica_id: null,
  })));
  assert.equal(seeded.replicaId, 'partition-1:node-2');
  assert.equal(seeded.serviceId, 'partition-1:node-2');
  // HEAD derived the identity as `replica_id || service_id`.
  const empty = projectReplicaFromServicesRow(decodeServicesRow(servicesRow({
    ...STORED, service_id: 'runtime-a-r2', replica_id: '',
  })));
  assert.equal(empty.replicaId, 'runtime-a-r2');
});

test('a NULL raft_role and address decode to ROW_ABSENT, status stays as stored', () => {
  const replica = projectReplicaFromServicesRow(decodeServicesRow(servicesRow({
    ...STORED, raft_role: null, address: null, status: 'Syncing',
  })));
  assert.equal(replica.raftRole, ROW_ABSENT);
  assert.equal(replica.address, ROW_ABSENT);
  assert.equal(replica.status, 'Syncing');
  assert.equal(readLowerCaseReplicaText(replica.status), ReplicaStatus.SYNCING);
  assert.equal(readLowerCaseReplicaText(replica.raftRole), '');
});

test('an unknown or wrongly-typed stored value is projected as stored', () => {
  const replica = projectReplicaFromServicesRow(decodeServicesRow(servicesRow({
    ...STORED, status: 'not_a_status', raft_role: 'witness', created_at: 'yesterday',
  })));
  assert.equal(replica.status, 'not_a_status');
  assert.equal(replica.raftRole, 'witness');
  assert.equal(replica.createdAt, 'yesterday');
});

test('readPlacementStatus reads HEAD\'s `status || ACTIVE`', () => {
  for (const [status, expected] of [[null, ReplicaStatus.ACTIVE], ['', ReplicaStatus.ACTIVE],
    ['ACTIVE', 'ACTIVE'], ['failed', 'failed']]) {
    const replica = projectReplicaFromServicesRow(decodeServicesRow(servicesRow({
      ...STORED, status})));
    assert.equal(readPlacementStatus(replica), expected, `status ${status}`);
  }
});

test('only the full decoded row builds a projected replica', () => {
  refusal(() => projectReplicaFromServicesRow(servicesRow(STORED)),
    PROJECTED_REPLICA_REFUSAL.NOT_A_DECODED_SERVICES_ROW, undefined);
  const narrow = defineServicesProjection('projected_replica_test_narrow',
    ['service_id', 'node_id', 'status']);
  refusal(() => projectReplicaFromServicesRow(decodeServicesRow(
    {service_id: 's', node_id: 'n', status: 'active'}, narrow)),
  PROJECTED_REPLICA_REFUSAL.NOT_A_DECODED_SERVICES_ROW, undefined);
  for (const value of [null, undefined, 'row', 7, ['service_id']]) {
    refusal(() => projectReplicaFromServicesRow(value),
      PROJECTED_REPLICA_REFUSAL.NOT_A_DECODED_SERVICES_ROW, undefined);
  }
});

test('projectReplicasFromServicesRows decodes then projects every row', () => {
  const replicas = projectReplicasFromServicesRows([
    servicesRow(STORED), servicesRow({...STORED, service_id: 'other', node_id: 'node-3'}),
    servicesRow({...STORED, service_id: 'x', node_id: 'node-9', status: 'not_a_status'}),
  ]);
  assert.deepEqual(replicas.map((replica) => [replica.nodeId, replica.status]),
    [['node-2', 'ACTIVE'], ['node-3', 'ACTIVE'], ['node-9', 'not_a_status']]);
});

test('a terminal create target is a partition replica the ledger proves', () => {
  const replica = buildTerminalCreateTargetReplica({
    replicaId: 'partition-1:node-4', partitionId: 'partition-1', nodeId: 'node-4',
  });
  assert.deepEqual(Object.keys(replica).sort(), [...PROJECTED_REPLICA_FIELDS].sort());
  assert.deepEqual(TERMINAL_CREATE_TARGET_REPLICA_STATE,
    {status: ReplicaStatus.ACTIVE, raftRole: RAFT_ROLE.FOLLOWER});
  assert.deepEqual(replica, {
    replicaId: 'partition-1:node-4',
    serviceId: 'partition-1:node-4',
    serviceType: SERVICE_TYPE.PARTITION,
    partitionId: 'partition-1',
    groupId: ROW_ABSENT,
    nodeId: 'node-4',
    status: ReplicaStatus.ACTIVE,
    raftRole: RAFT_ROLE.FOLLOWER,
    address: ROW_ABSENT,
    createdAt: ROW_ABSENT,
    stateEnteredAt: ROW_ABSENT,
    createAttemptToken: ROW_ABSENT,
    previousState: ROW_ABSENT,
    cleanupToken: ROW_ABSENT,
  });
  assert.ok(Object.isFrozen(replica));
  for (const [field, target] of [
    [PROJECTED_REPLICA_FIELD.REPLICA_ID, {replicaId: '', partitionId: 'p', nodeId: 'n'}],
    [PROJECTED_REPLICA_FIELD.PARTITION_ID, {replicaId: 'r', partitionId: null, nodeId: 'n'}],
    [PROJECTED_REPLICA_FIELD.NODE_ID, {replicaId: 'r', partitionId: 'p'}],
  ]) {
    refusal(() => buildTerminalCreateTargetReplica(target),
      PROJECTED_REPLICA_REFUSAL.PLANNED_CHANGE_INCOMPLETE, field);
  }
});

test('the planned change applied to a stored row keeps every other field', () => {
  const stored = projectReplicaFromServicesRow(decodeServicesRow(servicesRow({
    ...STORED, status: 'syncing', raft_role: 'learner',
  })));
  const projected = projectReplicaAsTerminalCreateTarget(stored);
  assert.deepEqual(projected, {
    ...stored, status: ReplicaStatus.ACTIVE, raftRole: RAFT_ROLE.FOLLOWER,
  });
  assert.ok(Object.isFrozen(projected));
  assert.equal(stored.status, ReplicaStatus.SYNCING);
  refusal(() => projectReplicaAsTerminalCreateTarget(servicesRow(STORED)),
    PROJECTED_REPLICA_REFUSAL.NOT_A_PROJECTED_REPLICA, PROJECTED_REPLICA_FIELD.REPLICA_ID);
});

test('assertProjectedReplica returns the replica and refuses anything else', () => {
  const replica = projectReplicaFromServicesRow(decodeServicesRow(servicesRow(STORED)));
  assert.equal(assertProjectedReplica(replica), replica);
  const {cleanupToken: _dropped, ...missingOne} = replica;
  refusal(() => assertProjectedReplica(missingOne),
    PROJECTED_REPLICA_REFUSAL.NOT_A_PROJECTED_REPLICA, PROJECTED_REPLICA_FIELD.CLEANUP_TOKEN);
  refusal(() => assertProjectedReplica({node_id: 'n', status: 'active'}),
    PROJECTED_REPLICA_REFUSAL.NOT_A_PROJECTED_REPLICA, PROJECTED_REPLICA_FIELD.REPLICA_ID);
  for (const value of [null, 'replica', [replica]]) {
    refusal(() => assertProjectedReplica(value),
      PROJECTED_REPLICA_REFUSAL.NOT_A_PROJECTED_REPLICA, undefined);
  }
});
