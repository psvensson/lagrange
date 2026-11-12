// The sole founder's group retirement decision
// (src/node/replica-removal-sole-founder.js) over a REAL lone founder's
// database file: the claim is the one predicate the REMOVE's admission uses,
// and every field of it is required. The state machine's authoritative read
// is the one collaborator this test answers for (the rows a control plane
// would return); the durable record is read from the real file.

import assert from 'node:assert/strict';
import {test} from 'node:test';

import {PartitionNodeCluster} from
  '../raft/raft-rs-backend/partition-node-cluster.js';
import {
  SOLE_FOUNDER_RETIREMENT as STATE,
  decideSoleFounderRetirement,
} from '../../src/node/replica-removal-sole-founder.js';
import {
  DURABLE_OWN_HISTORY,
  DURABLE_OWN_MEMBERSHIP,
} from '../../src/raft/raft-rs-durable-own-group-record.js';
import {buildFailedCreateRemoveToken} from
  '../../src/rebalancer/failed-create-cleanup-token.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';

const PARTITION_ID = 'sole-founder-decision';
const REPLICA_ID = 'sole-founder-a';
const NODE_ID = 'sole-founder-node';
const OPERATION_ID = 'cleanup-op';
const ROUNDS = 400;

// The FAILED row the cleanup was decided on, and the REMOVING row the
// lifecycle owner's claim transition wrote from it.
const PRECONDITION = Object.freeze({
  service_id: REPLICA_ID, replica_id: REPLICA_ID, group_id: null,
  partition_id: PARTITION_ID, node_id: NODE_ID, service_type: 'partition',
  created_at: 1_000, status: ReplicaStatus.FAILED,
  cleanup_token: 'failed-create:op', create_attempt_token: 'attempt-1',
  state_entered_at: 2_000});
const CLAIMED = Object.freeze({...PRECONDITION,
  status: ReplicaStatus.REMOVING, previous_state: ReplicaStatus.FAILED,
  cleanup_token: buildFailedCreateRemoveToken(OPERATION_ID),
  state_entered_at: 3_000});
const REQUEST = Object.freeze({operationId: OPERATION_ID,
  partitionId: PARTITION_ID, replicaId: REPLICA_ID,
  failedCreatePrecondition: PRECONDITION});

function loneFounder(t) {
  const cluster = new PartitionNodeCluster({partitionId: PARTITION_ID,
    replicaIds: [REPLICA_ID]});
  t.after(() => cluster.dispose());
  cluster.tickers = [REPLICA_ID];
  assert.ok(cluster.settle(() => cluster.leaderReplicaId() === REPLICA_ID,
    {rounds: ROUNDS}), 'setup: the lone founder leads');
  return cluster;
}

// The handler members the decision reads; `fileReads` counts the reads of
// the replica's database path.
function handlerOver(cluster, observation) {
  const handler = {
    fileReads: 0,
    replicaStateMachine: {
      observeAuthoritativeReplicaLifecycle: async (replicaId) => {
        assert.equal(replicaId, REPLICA_ID);
        return observation;
      },
    },
    getPartitionDbPath: (partitionId, replicaId) => {
      assert.deepEqual([partitionId, replicaId], [PARTITION_ID, REPLICA_ID]);
      handler.fileReads += 1;
      return cluster.dbFileOf(REPLICA_ID);
    },
  };
  return handler;
}

test('the claim and the sole, empty record together retire the group',
  async (t) => {
    const cluster = loneFounder(t);
    const handler = handlerOver(cluster, {available: true, row: CLAIMED});
    assert.deepEqual(await decideSoleFounderRetirement(handler, REQUEST), {
      state: STATE.RETIRES_GROUP,
      membership: DURABLE_OWN_MEMBERSHIP.SOLE_MEMBER,
      history: DURABLE_OWN_HISTORY.EMPTY, cause: null});
    assert.equal(handler.fileReads, 1);
  });

test('an authoritative row that cannot be read is CLAIM_UNAVAILABLE; the ' +
  'file is not consulted', async (t) => {
  const cluster = loneFounder(t);
  const handler = handlerOver(cluster, {available: false, row: CLAIMED});
  assert.deepEqual(await decideSoleFounderRetirement(handler, REQUEST),
    {state: STATE.CLAIM_UNAVAILABLE, membership: null, history: null,
      cause: null});
  assert.equal(handler.fileReads, 0);
});

// Every way the row, or the request, is not this removal's claim.
const NOT_THE_CLAIM = Object.freeze({
  'the row is not REMOVING': {row: {status: ReplicaStatus.FAILED}},
  'the row did not come out of FAILED':
    {row: {previous_state: ReplicaStatus.ACTIVE}},
  'the row is another node\'s': {row: {node_id: 'another-node'}},
  'the row carries another operation\'s remove token':
    {row: {cleanup_token: buildFailedCreateRemoveToken('another-op')}},
  'the row carries no remove token': {row: {cleanup_token: null}},
  'the row is of another create attempt':
    {row: {create_attempt_token: 'attempt-2'}},
  'the row is of another incarnation': {row: {created_at: 1_001}},
  'the row is not a later generation than the precondition':
    {row: {state_entered_at: PRECONDITION.state_entered_at}},
  'the row is absent': {absent: true},
  'the removal carries no precondition (an ordinary REMOVE, a re-drive)':
    {request: {failedCreatePrecondition: null}},
  'the removal is another operation': {request: {operationId: 'another-op'}},
});

for (const [label, {row = {}, request = {}, absent = false}] of
  Object.entries(NOT_THE_CLAIM)) {
  test(`NOT_CLAIMED when ${label}; the file is not consulted`, async (t) => {
    const cluster = loneFounder(t);
    const handler = handlerOver(cluster, {available: true,
      row: absent ? null : {...CLAIMED, ...row}});
    assert.deepEqual(await decideSoleFounderRetirement(handler,
      {...REQUEST, ...request}),
    {state: STATE.NOT_CLAIMED, membership: null, history: null, cause: null});
    assert.equal(handler.fileReads, 0);
  });
}
