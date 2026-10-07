import assert from 'node:assert/strict';
import {test} from 'node:test';

import {PartitionNodeCluster} from '../raft/raft-rs-backend/partition-node-cluster.js';
import {RaftRsPeerIdentityRegistry} from '../../src/raft/raft-rs-peer-identity.js';
import {RAFT_MEMBERSHIP_OPERATION} from '../../src/raft/raft-operation-port-constants.js';
import {MessageGroupServiceHandler} from '../../src/node/message-group-service-handler.js';
import {ReplicaOperationMessageType, ReplicaOperationResponseStatus} from '../../src/rebalancer/replica-operation-constants.js';

const SETTLE_ROUNDS = 400;

function makeHandler(calls) {
  const cache = {
    get() {
      return null;
    },
    filter() {
      return [];
    },
  };
  const cdc = {
    async executeAuthoritativeSystemTableRead() {
      return {success: true, rows: []};
    },
    async readAuthoritativeRows() {
      return {success: true, rows: []};
    },
    async insertSystemTableRow() {
      return {success: true, partitionResult: {affectedRows: 1}};
    },
    async updateSystemTableRow() {
      return {success: true, partitionResult: {affectedRows: 1}};
    },
  };
  const handler = new MessageGroupServiceHandler({
    nodeId: 'node-target',
    systemTableCache: cache,
    cdcIntegrationService: cdc,
    createMessageGroupReplica: async (options) => {
      calls.push(['create', options]);
      return {created: true};
    },
    startMessageGroupReplica: async (options) => {
      calls.push(['start', options]);
      return {started: true};
    },
    stopMessageGroupReplica: async () => ({stopped: true}),
    resolveLocalMessageGroupReplica: () => ({
      groupId: 'mg-1', replicaId: 'mg-1-r4', nodeId: 'node-target',
    }),
  });
  handler.initialize();
  return handler;
}

function flushImmediate() {
  return new Promise((resolve) => setImmediate(resolve));
}

test('a real committed learner plus exact admission package is the only CREATE path', async () => {
  const founders = ['mg-1-r1', 'mg-1-r2', 'mg-1-r3'];
  const target = 'mg-1-r4';
  const cluster = new PartitionNodeCluster({partitionId: 'mg-1', replicaIds: founders});
  try {
    assert.equal(cluster.settle(() => cluster.leaderReplicaId() !== null,
      {rounds: SETTLE_ROUNDS}), true, 'the real founding group elects');
    const leader = cluster.leaderReplicaId();
    const peerIds = new Set();
    for (const replicaId of founders) {
      peerIds.add(new RaftRsPeerIdentityRegistry(cluster.replica(replicaId).db)
        .registerReplica(target));
    }
    assert.equal(peerIds.size, 1,
      'every surviving voter permanently reserves the same fresh peer id');
    const [targetPeerId] = [...peerIds];
    const proposal = await cluster.node(leader).proposeConfChange({
      type: RAFT_MEMBERSHIP_OPERATION.ADD_LEARNER,
      replicaIdentity: target,
    });
    assert.equal(proposal.outcome, 'CORE_OK', JSON.stringify(proposal));
    assert.equal(cluster.settle(() => founders.every((replicaId) =>
      cluster.node(replicaId).readStatus().confState.learners
        .includes(targetPeerId)), {rounds: SETTLE_ROUNDS}), true,
    'a fresh applied ConfState on every survivor names the exact learner');
    const committed = cluster.node(leader).readStatus();

    const calls = [];
    const handler = makeHandler(calls);
    const response = await handler.handleMessage({
      correlationId: 'committed-learner-create',
      payload: {
        type: ReplicaOperationMessageType.CREATE_REPLICA,
        operationId: 'replace-mg-1-r1-with-r4',
        operationType: 'REPLACE',
        entityType: 'message_group',
        entityId: 'mg-1',
        partitionId: 'mg-1',
        replicaId: target,
        sourceReplicaId: 'mg-1-r1',
        createAdmissionToken: 'admission-token-r4',
        createAdmissionAttemptToken: 'attempt-r4-1',
        createAdmissionAttemptSeq: 1,
        createAdmissionWorkflowUpdatedAt: 10,
        messageGroupMembershipPhase: 'learner_committed',
        messageGroupMembershipIdentity: {
          groupId: 'mg-1', replicaIdentity: target, raftPeerId: targetPeerId,
          peerAddress: 'node-target/message-group/mg-1-r4',
        },
        messageGroupLearnerStamp: {
          term: committed.term,
          configGeneration: committed.confStateGeneration ?? null,
          appliedIndex: committed.appliedIndex,
          voters: committed.confState.voters,
          learners: committed.confState.learners,
        },
        messageGroupJoinPackage: {
          kind: 'raft_log_or_checkpoint',
          groupId: 'mg-1', replicaIdentity: target,
          peerId: targetPeerId,
        },
      },
    });
    await flushImmediate();
    await flushImmediate();

    assert.equal(response.status, ReplicaOperationResponseStatus.INITIATED,
      'the handler crosses its refusal only for the exact committed learner and admission CAS');
    assert.equal(calls.filter(([kind]) => kind === 'create').length, 1,
      'exactly one admitted physical worker starts');
    handler.shutdown();
  } finally {
    cluster.dispose();
  }
});
