import assert from 'node:assert/strict';
import {test} from 'node:test';
import {STATE, TABLES} from '../../../src/constants/index.js';
import {
  ReplicaOperationField, ReplicaOperationMessageType, ReplicaOperationResponseStatus,
} from '../../../src/rebalancer/replica-operation-constants.js';
import {OperationType, ReplicaStatus} from '../../../src/rebalancer/replica-status.js';
import {buildDeliveryEnvelope} from '../../../src/transport/transport-semantic-outcome.js';
import {
  createRemovalSourceHandler, durableLifecycleState, nextTurns,
  partitionClusterAtRowAddresses, rowDrivenRetirements,
} from '../../node/replica-removal-consensus-exit-fixture.js';
import {ledgerRows} from '../../partition/placement-admission-fixture.js';
import {
  createMockCache, createMockPolicyService, createTestCoordinator,
} from '../../rebalancer/test-helpers.js';
import {
  RAFT_FOUNDING_GROWTH_OUTCOME, addLearnerReplicaToCluster, admitLearnerAndSettle,
  appliedStateOf, catchUpLearnerAndSettle, peerIdOf, proposeGroupGrowthPromote,
  settleCluster, turnChainValue,
} from './founding-growth-test-support.js';
import {
  SEED, SEED_REPLICA, TARGET, withPlacementLeaseAuthority,
} from './formation-placement-lease-authority-fixture.js';

const SECOND_LEARNER = 'contexts-p1-race-learner';
const GROWTH_OPERATION = 'formation-placement-late-growth';
const DELIVERY_BOUND_ROUNDS = 40;
const QUIET_LOGGER = Object.freeze({debug() {}, info() {}, warn() {}});

function nodeIdOf(replicaId) {
  if (replicaId === SEED_REPLICA) return SEED;
  return replicaId === SECOND_LEARNER ? 'node-contexts-p1-race-learner' : TARGET;
}

function addressedCluster(founders, {partitionId}) {
  return partitionClusterAtRowAddresses(partitionId, founders, {nodeIdOf});
}

function serviceRowOf(row) {
  assert.ok(Number.isSafeInteger(row.created_at));
  return {...row, address: `${row.node_id}/partition/${row.replica_id}`};
}

async function admitRetirement(context) {
  const {initial, nodes, ledger, cache} = context;
  nodes.goPastExpiry();
  assert.deepEqual(await nodes.sweep(STATE.DISCONNECTED), [TARGET]);
  await context.observeCommittedPlacement();
  assert.equal(nodes.nodeRow().connection_state, STATE.DISCONNECTED);
  assert.equal(nodes.nodeRow().ready_lease_expires_at, null);
  const removal = ledgerRows(ledger).find((row) => row.type === OperationType.REMOVE);
  assert.equal(removal?.replica_id, initial.replica_id);
  const rows = cache.getAll(TABLES.SERVICES).map(serviceRowOf);
  return {removal, rows};
}

function commitLatePromotion(cluster, targetReplicaId) {
  addLearnerReplicaToCluster(cluster, SEED_REPLICA, SECOND_LEARNER);
  admitLearnerAndSettle(cluster, SEED_REPLICA, SECOND_LEARNER);
  const replicaIdentities = [targetReplicaId, SECOND_LEARNER];
  for (const learner of replicaIdentities) {
    catchUpLearnerAndSettle(cluster, SEED_REPLICA, learner, GROWTH_OPERATION);
  }
  const promoted = turnChainValue(proposeGroupGrowthPromote(cluster.node(SEED_REPLICA), {
    operationId: GROWTH_OPERATION, replicaIdentities,
  }));
  assert.equal(promoted.reason, RAFT_FOUNDING_GROWTH_OUTCOME.PROMOTION_PROPOSED);
  assert.ok(settleCluster(cluster, () => {
    const state = appliedStateOf(cluster, SEED_REPLICA);
    return state.voters.length === 3 && state.votersOutgoing.length === 0;
  }), 'native promotion must reach its stable committed configuration');
}

function sourceOf(cluster, row, operations) {
  return createRemovalSourceHandler({cluster, replicaId: row.replica_id,
    partitionId: row.partition_id, nodeId: row.node_id,
    cache: createMockCache({services: [row]}),
    rowOf: (status) => ({...row, status}), replicaOperations: operations});
}

function openDispatchOwner({source, rows, removal, nodes, cluster, deliveries,
  leader}) {
  const coordinator = createTestCoordinator({
    nodeId: SEED, enableTimeouts: false, replaceWitness: false,
    committedMembershipFixture: false,
    tablePolicyService: createMockPolicyService({
      getPolicyForPartition: () => ({targetReplicaCount: 3, minReplicaCount: 2}),
    }),
    cacheData: {
      services: rows, replicaOperations: [removal],
      nodes: [{node_id: SEED, status: 'active'}, nodes.nodeRow()],
      partitions: [{partition_id: cluster.partitionId, leader_node_id: SEED}],
    },
    messageRouter: {
      async deliver(address, payload) {
        deliveries.push({address, payload});
        const receiver = address.startsWith(`${SEED}/`) ? leader : source;
        const answer = await receiver.handler.handleMessage({
          payload, correlationId: removal.operation_id,
        });
        return buildDeliveryEnvelope({acknowledged: true}, answer);
      },
      getConnectionState: () => STATE.CONNECTED,
      pingNode: async () => true,
      isOutboundQueueAvailable: () => true,
    },
  });
  return coordinator;
}

async function deliverCommittedSourceChange(source, cluster) {
  const deliver = rowDrivenRetirements({cluster, partitionId: cluster.partitionId,
    replicaIds: [...cluster.replicaIds], logger: QUIET_LOGGER});
  for (let round = 0; round < DELIVERY_BOUND_ROUNDS; round += 1) {
    const row = source.lifecycleStore.durable.services.values().next().value;
    if (row?.status === ReplicaStatus.REMOVING) {
      deliver(row);
      return row;
    }
    await nextTurns(1);
  }
  return null;
}

test('late native promotion preserves an incumbent named by an admitted learner REMOVE',
  async (t) => withPlacementLeaseAuthority(async (context) => {
    const {cluster, initial, nodes} = context;
    const {removal, rows} = await admitRetirement(context);
    const target = rows.find((row) => row.replica_id === initial.replica_id);
    assert.equal(target.raft_role, 'learner', 'SERVICES remains the admitted learner view');
    const peerId = peerIdOf(cluster, SEED_REPLICA, initial.replica_id);
    assert.ok(appliedStateOf(cluster, SEED_REPLICA).learners.includes(peerId));

    // The committed placement admission precedes the native promotion result.
    commitLatePromotion(cluster, initial.replica_id);
    assert.ok(appliedStateOf(cluster, SEED_REPLICA).voters.includes(peerId));
    const source = sourceOf(cluster, target, [removal]);
    const leader = sourceOf(cluster, rows.find((row) => row.replica_id === SEED_REPLICA),
      [removal]);
    const deliveries = [];
    const coordinator = openDispatchOwner({source, rows, removal, nodes, cluster,
      deliveries, leader});
    try {
      const observed = durableLifecycleState(
        cluster.replica(initial.replica_id).dbFile, cluster.partitionId);
      const answer = await coordinator.dispatchOperation(removal);
      const changed = await deliverCommittedSourceChange(source, cluster);
      settleCluster(cluster, () =>
        !appliedStateOf(cluster, SEED_REPLICA).voters.includes(peerId));
      const post = appliedStateOf(cluster, SEED_REPLICA);
      t.diagnostic(JSON.stringify({answer, deliveries, changed, voters: post.voters}));
      assert.ok(deliveries.some(({payload}) => payload.operationId === removal.operation_id),
        'the exact committed intent must engage existing dispatch');
      assert.ok(post.voters.includes(peerId), 'an admitted learner REMOVE cannot remove a voter');
      assert.equal(changed, null, 'no generic REMOVING row may trigger native peer removal');
      assert.equal(durableLifecycleState(cluster.replica(initial.replica_id).dbFile,
        cluster.partitionId), observed);
    } finally {
      await coordinator.shutdown();
      await source.dispose();
      await leader.dispose();
    }
  }, {createCluster: addressedCluster}));

test('guarded disconnect can clear the exact learner on the leader while its host remains lost',
  async (t) => withPlacementLeaseAuthority(async (context) => {
    const {cluster, initial} = context;
    const targetId = initial.replica_id;
    cluster.isolate(targetId);
    const {removal, rows} = await admitRetirement(context);
    const peerId = peerIdOf(cluster, SEED_REPLICA, targetId);
    const before = appliedStateOf(cluster, SEED_REPLICA);
    assert.ok(before.learners.includes(peerId), 'the lost host still holds a native learner');
    const leader = sourceOf(cluster, rows.find((row) => row.replica_id === SEED_REPLICA),
      [removal]);
    try {
      const answer = await leader.handler.handleMessage({payload: {
        [ReplicaOperationField.TYPE]: ReplicaOperationMessageType.REMOVE_LEARNER,
        [ReplicaOperationField.OPERATION_ID]: removal.operation_id,
        [ReplicaOperationField.PARTITION_ID]: cluster.partitionId,
        [ReplicaOperationField.REPLICA_ID]: targetId,
      }, correlationId: removal.operation_id});
      t.diagnostic(JSON.stringify(answer));
      assert.equal(answer.status, ReplicaOperationResponseStatus.INITIATED);
      assert.equal(answer[ReplicaOperationField.PROPOSAL].reason,
        RAFT_FOUNDING_GROWTH_OUTCOME.LEARNER_REMOVAL_PROPOSED);
      assert.ok(settleCluster(cluster, () =>
        !appliedStateOf(cluster, SEED_REPLICA).learners.includes(peerId)));
      assert.deepEqual(appliedStateOf(cluster, SEED_REPLICA).voters, before.voters);
      assert.ok(cluster.isolated.has(targetId), 'clearing required no answer from lost host');
    } finally {
      await leader.dispose();
    }
  }, {createCluster: addressedCluster}));
