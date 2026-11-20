import {assertDurableRejoinStorageAdmission} from
  '../../../src/bootstrap/durable-rejoin-storage-admission.js';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';
import Database from 'better-sqlite3';
import {REPLICA_OPERATIONS_SCHEMA, SERVICES_SCHEMA} from '../../../src/bootstrap/system-table-schemas-constants.js';
import {generateCreateTableSQL} from '../../../src/bootstrap/system-table-schema-sql.js';
import {SERVICE_TYPE, STATE, TABLES, WORKFLOW_STEP} from '../../../src/constants/index.js';
import {
  LEARNER_RETIREMENT_OUTCOME, ReplicaOperationField, ReplicaOperationMessageType,
  ReplicaOperationResponseStatus,
} from '../../../src/rebalancer/replica-operation-constants.js';
import {OperationType, ReplicaStatus} from '../../../src/rebalancer/replica-status.js';
import {buildDeliveryEnvelope} from '../../../src/transport/transport-semantic-outcome.js';
import {ROUTER_NO_CONNECTION_ERROR_CODE} from '../../../src/transport/transport-error-codes.js';
import {
  createRemovalSourceHandler, durableLifecycleState, nextTurns,
  partitionClusterAtRowAddresses, rowDrivenRetirements,
} from '../../node/replica-removal-consensus-exit-fixture.js';
import {PARTITION_SERVICE_EVENT} from '../../../src/partition/partition-service-constants.js';
import {relayPartitionConsensusObservations} from
  '../../../src/partition/partition-service-raft-lifecycle-wiring.js';
import {commitLedgerStatement, ledgerRows} from '../../partition/placement-admission-fixture.js';
import {createLifecycleServiceRow} from '../../test-helpers/lifecycle-state-store.js';
import {
  createMockCache, createMockPolicyService, createTestCoordinator,
} from '../../rebalancer/test-helpers.js';
import {
  COMMITTED_MEMBERSHIP_READ_PURPOSE, RAFT_FOUNDING_GROWTH_OUTCOME, RAFT_OPERATION_OUTCOME,
  addLearnerReplicaToCluster, admitLearnerAndSettle,
  appliedStateOf, catchUpLearnerAndSettle, peerIdOf, proposeGroupGrowthPromote,
  settleCluster, turnChainValue,
} from './founding-growth-test-support.js';
import {
  BOOT, SEED, SEED_REPLICA, TARGET, withPlacementLeaseAuthority,
} from './formation-placement-lease-authority-fixture.js';

const SECOND_LEARNER = 'contexts-p1-race-learner';
const GROWTH_OPERATION = 'formation-placement-late-growth';
const DELIVERY_BOUND_ROUNDS = 40;
const CONTROL_OBSERVATION_BOUND_MS = 2000;
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

function projectCommittedTable(schema, sql, params, state) {
  // Preserve the actual schema and SQL SELECT projection at this fixture port.
  // Its mutation schedule stays controlled by the lifecycle store.
  const db = new Database(':memory:');
  try {
    db.exec(generateCreateTableSQL(schema));
    const columns = schema.columns.map(({name}) => name);
    const markers = columns.map(() => '?').join(', ');
    const insert = db.prepare(`INSERT INTO ${schema.tableName} (${columns.join(', ')}) VALUES (${markers})`);
    for (const row of state.values()) insert.run(...columns.map((column) => row[column] ?? null));
    return db.prepare(sql).all(...params);
  } finally {
    db.close();
  }
}

function sourceOf(cluster, row, operations, ownerIncarnation = BOOT) {
  const source = createRemovalSourceHandler({cluster, replicaId: row.replica_id,
    partitionId: row.partition_id, nodeId: row.node_id,
    cache: createMockCache({services: [row], partitions: [{partition_id: row.partition_id,
      leader_node_id: SEED}]}),
    createdAt: row.created_at, ownerIncarnation,
    rowOf: (status) => ({...row, status, raftRole: row.raft_role,
      stateEnteredAt: row.state_entered_at, updatedAt: row.updated_at}),
    replicaOperations: operations});
  const {gateway, durable} = source.lifecycleStore;
  const read = gateway.readAuthoritativeRows.bind(gateway);
  gateway.readAuthoritativeRows = async (table, sql, params, options) => {
    const result = await read(table, sql, params, options);
    const schema = table === TABLES.SERVICES ? SERVICES_SCHEMA :
      table === TABLES.REPLICA_OPERATIONS ? REPLICA_OPERATIONS_SCHEMA : null;
    return schema && result.success === true ? {...result, rowSetComplete: true,
      rows: projectCommittedTable(schema, sql, params, durable[table])} : result;
  };
  return source;
}

function bindRetirementAuthority(leader, nodes, sourceRow, source = null) {
  const services = leader.lifecycleStore.durable.services;
  services.set(sourceRow.replica_id,
    source?.lifecycleStore.durable.services.get(sourceRow.replica_id) ??
    createLifecycleServiceRow({
      serviceId: sourceRow.service_id, serviceType: sourceRow.service_type,
      replicaId: sourceRow.replica_id, nodeId: sourceRow.node_id,
      partitionId: sourceRow.partition_id, address: sourceRow.address,
      status: sourceRow.status, raftRole: sourceRow.raft_role,
      createdAt: sourceRow.created_at, stateEnteredAt: sourceRow.state_entered_at,
      updatedAt: sourceRow.updated_at,
    }));
  if (source) source.lifecycleStore.durable.services = services;
  const gateway = leader.lifecycleStore.gateway;
  const read = gateway.readAuthoritativeRows.bind(gateway);
  gateway.readAuthoritativeRows = (table, sql, params, options) =>
    table === TABLES.NODES ? nodes.readAuthoritativeNodes(sql, params) :
      read(table, sql, params, options);
}

function openDispatchOwner({source, rows, removal, nodes, cluster, deliveries,
  leader, clock = null, onLocalDelivery = null, beforeDelivery = null, receiverAnswer = null}) {
  bindRetirementAuthority(leader, nodes, rows.find((row) =>
    row.replica_id === removal.replica_id), source);
  const coordinator = createTestCoordinator({
    nodeId: SEED, enableTimeouts: false, replaceWitness: false,
    committedMembershipFixture: false,
    ...(clock === null ? {} : {
      setTimeoutFn: clock.setTimeout.bind(clock),
      clearTimeoutFn: clock.clearTimeout.bind(clock),
    }),
    tablePolicyService: createMockPolicyService({
      getPolicyForPartition: () => ({targetReplicaCount: 3, minReplicaCount: 2}),
    }),
    cacheData: {
      services: rows, replicaOperations: [removal],
      nodes: [{node_id: SEED, status: 'active'}, nodes.nodeRow()],
      partitions: [{partition_id: cluster.partitionId, leader_node_id: SEED}],
    },
    readinessFixture: {callbacks: {
      readServeEligibility: nodes.authority.readServeEligibility.bind(nodes.authority),
      answerCommittedNodes: nodes.authority.answerCommittedNodes.bind(nodes.authority),
      subscribeServeEligibility: nodes.authority.subscribe.bind(nodes.authority),
    }},
    messageRouter: {
      async deliver(address, payload) {
        const entry = {address, payload};
        deliveries.push(entry);
        await beforeDelivery?.(payload);
        const receiver = address.startsWith(`${SEED}/`) ? leader : source;
        if (receiver === source && cluster.isolated.has(removal.replica_id)) {
          return buildDeliveryEnvelope({errorCode: ROUTER_NO_CONNECTION_ERROR_CODE});
        }
        const substituted = receiverAnswer?.(payload);
        const answer = substituted ?? await receiver.handler.handleMessage({
          payload, correlationId: removal.operation_id,
        });
        entry.answer = answer;
        if (receiver === source) onLocalDelivery?.(payload, answer);
        return buildDeliveryEnvelope({acknowledged: true}, answer);
      },
      getConnectionState: () => STATE.CONNECTED,
      pingNode: async () => true,
      isOutboundQueueAvailable: () => true,
    },
  });
  const gateway = coordinator.repository.controlPlaneSystemTableGateway;
  const ownerRead = gateway.readAuthoritativeRows.bind(gateway);
  const leaderGateway = leader.lifecycleStore.gateway;
  gateway.readAuthoritativeRows = (table, sql, params, options) =>
    table === TABLES.SERVICES && /WHERE service_id = \?/u.test(sql) ?
      leaderGateway.readAuthoritativeRows(table, sql, params, options) :
      ownerRead(table, sql, params, options);
  source.handler.messageRouter = coordinator.workflowOwner.messageRouter;
  relayPartitionConsensusObservations(leader.service);
  coordinator.workflowOwner.attachReplicaConsensusEvents(leader.handler.consensusEvents);
  return coordinator;
}

async function deliverCommittedSourceChange(source, cluster) {
  const deliver = rowDrivenRetirements({cluster, partitionId: cluster.partitionId,
    replicaIds: [...cluster.replicaIds], logger: QUIET_LOGGER});
  for (let round = 0; round < DELIVERY_BOUND_ROUNDS; round += 1) {
    const row = source.serviceChanges.find((entry) => entry.status === ReplicaStatus.REMOVING);
    if (row) {
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
    assert.ok(JSON.parse(removal.steps_history)[0].placementAdmission.learnerRetirement,
      'ledger binds the exact generation before dispatch');
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
      assert.ok(deliveries.some(({payload}) => payload.operationId === removal.operation_id &&
        payload.type === ReplicaOperationMessageType.REMOVE_LEARNER),
      'the exact committed intent reached the native role guard');
      assert.ok(post.voters.includes(peerId), 'an admitted learner REMOVE cannot remove a voter');
      assert.ok(deliveries.every(({payload}) =>
        payload.type !== ReplicaOperationMessageType.REMOVE_REPLICA));
      assert.equal(changed, null, 'no generic REMOVING row may trigger native peer removal');
      assert.equal(durableLifecycleState(cluster.replica(initial.replica_id).dbFile,
        cluster.partitionId), observed);
    } finally {
      await coordinator.shutdown();
      await source.dispose();
      await leader.dispose();
    }
  }, {createCluster: addressedCluster}));

test('a historical unscoped learner REMOVE never dispatches after the learner becomes a voter',
  async (t) => withPlacementLeaseAuthority(async (context) => {
    const {cluster, initial, nodes, ledger} = context;
    const admitted = await admitRetirement(context);
    const history = JSON.parse(admitted.removal.steps_history);
    delete history[0].placementAdmission.learnerRetirement;
    assert.equal(commitLedgerStatement(ledger, 'historical-unscoped-removal',
      'UPDATE replica_operations SET steps_history = ? WHERE operation_id = ?',
      [JSON.stringify(history), admitted.removal.operation_id]), null);
    const historical = ledgerRows(ledger).find((row) =>
      row.operation_id === admitted.removal.operation_id);
    const rows = admitted.rows.map((row) => row.replica_id !== initial.replica_id ? row :
      {...row, raft_role: 'follower'});
    const target = rows.find((row) => row.replica_id === initial.replica_id);
    const peer = peerIdOf(cluster, SEED_REPLICA, initial.replica_id);
    commitLatePromotion(cluster, initial.replica_id);
    assert.ok(appliedStateOf(cluster, SEED_REPLICA).voters.includes(peer));
    const source = sourceOf(cluster, target, [historical]);
    const leader = sourceOf(cluster, rows.find((row) => row.replica_id === SEED_REPLICA),
      [historical]);
    const deliveries = [];
    const coordinator = openDispatchOwner({source, rows, removal: historical, nodes, cluster,
      leader, deliveries});
    try {
      const result = await coordinator.dispatchOperation(historical);
      const pending = await coordinator.getOperation(historical.operation_id);
      assert.equal(result.error, LEARNER_RETIREMENT_OUTCOME.INTENT_UNSCOPED);
      assert.equal(pending.completedAt, null);
      assert.deepEqual(deliveries, []);
      assert.deepEqual(source.serviceChanges, []);
      assert.ok(appliedStateOf(cluster, SEED_REPLICA).voters.includes(peer));
      t.diagnostic(JSON.stringify({result, pendingStep: pending.workflowStep, peer}));
    } finally {
      await coordinator.shutdown();
      await source.dispose();
      await leader.dispose();
    }
  }, {createCluster: addressedCluster}));

test('guarded disconnect can clear the exact learner on the leader while its host remains lost',
  async (t) => withPlacementLeaseAuthority(async (context) => {
    const {cluster, initial, nodes} = context;
    const targetId = initial.replica_id;
    cluster.isolate(targetId);
    const {removal, rows} = await admitRetirement(context);
    const peerId = peerIdOf(cluster, SEED_REPLICA, targetId);
    const before = appliedStateOf(cluster, SEED_REPLICA);
    assert.ok(before.learners.includes(peerId), 'the lost host still holds a native learner');
    const leader = sourceOf(cluster, rows.find((row) => row.replica_id === SEED_REPLICA),
      [removal]);
    bindRetirementAuthority(leader, nodes, rows.find((row) => row.replica_id === targetId));
    try {
      const payload = {
        [ReplicaOperationField.TYPE]: ReplicaOperationMessageType.REMOVE_LEARNER,
        [ReplicaOperationField.OPERATION_ID]: removal.operation_id,
        [ReplicaOperationField.OPERATION_TYPE]: OperationType.REMOVE,
        [ReplicaOperationField.PARTITION_ID]: cluster.partitionId,
        [ReplicaOperationField.REPLICA_ID]: targetId,
      };
      const omittedScope = await leader.handler.handleMessage({
        payload, correlationId: removal.operation_id,
      });
      assert.equal(omittedScope.status, ReplicaOperationResponseStatus.ERROR);
      const malformedScope = await leader.handler.handleMessage({payload: {...payload,
        [ReplicaOperationField.LEARNER_RETIREMENT]: {targetNodeId: TARGET, canPropose: true},
      }, correlationId: removal.operation_id});
      assert.equal(malformedScope.status, ReplicaOperationResponseStatus.ERROR);
      assert.ok(appliedStateOf(cluster, SEED_REPLICA).learners.includes(peerId));
      const admitted = JSON.parse(removal.steps_history)[0].placementAdmission.learnerRetirement;
      const answer = await leader.handler.handleMessage({payload: {...payload,
        [ReplicaOperationField.LEARNER_RETIREMENT]: {
          ...admitted, targetNodeId: TARGET, canPropose: true,
        },
      }, correlationId: removal.operation_id});
      t.diagnostic(JSON.stringify({omittedScope, answer}));
      assert.equal(answer.status, ReplicaOperationResponseStatus.COMPLETED);
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

async function seeRejoinedCleanup(context, t) {
  const {first, rejoinDelivery, coordinator, removal, nodes, deliveries, cluster} = context;
  const bounded = Promise.withResolvers();
  const timeout = setTimeout(() => bounded.reject(new Error(
    'committed rejoin did not wake the retained cleanup')),
  CONTROL_OBSERVATION_BOUND_MS);
  try {
    return await Promise.race([rejoinDelivery.promise, bounded.promise]);
  } finally {
    clearTimeout(timeout);
    const state = await coordinator.getOperation(removal.operation_id);
    const membership = cluster.node(SEED_REPLICA).readCommittedMembership({
      purpose: COMMITTED_MEMBERSHIP_READ_PURPOSE.RETIREMENT,
    });
    t.diagnostic(JSON.stringify({first, step: state?.workflowStep, node: nodes.nodeRow(),
      membership, nativeStatus: cluster.node(SEED_REPLICA).readStatus(), deliveries}));
  }
}

for (const restart of [false, true]) {
  const rejoin = restart ? 'same-disk process restart' : 'same-boot rejoin';
  test(`the workflow clears a lost learner before its captured generation cleans up on ${rejoin}`,
    {timeout: 7000}, async (t) => withPlacementLeaseAuthority(async (context) => {
      const {cluster, initial, nodes, clock} = context;
      const targetId = initial.replica_id;
      cluster.isolate(targetId);
      const {rows, removal} = await admitRetirement(context);
      const service = rows.find((row) => row.replica_id === targetId);
      const source = sourceOf(cluster, service, [removal]);
      const leader = sourceOf(cluster, rows.find((row) => row.replica_id === SEED_REPLICA),
        [removal]);
      const deliveries = [];
      const consensusWakes = [];
      leader.service.on(PARTITION_SERVICE_EVENT.CONSENSUS_OBSERVED,
        (observation) => consensusWakes.push(observation));
      const rejoinDelivery = Promise.withResolvers();
      const rejoinedNode = Promise.withResolvers();
      let checkedMembership = false;
      const coordinator = openDispatchOwner({source, rows, removal, nodes, cluster,
        deliveries, leader, clock, async beforeDelivery(payload) {
          if (payload.type !== ReplicaOperationMessageType.REMOVE_LEARNER) return;
          if (checkedMembership) await rejoinedNode.promise;
          checkedMembership = true;
        }, onLocalDelivery(payload, answer) {
          if (payload.type === ReplicaOperationMessageType.REMOVE_REPLICA) {
            rejoinDelivery.resolve(answer);
          }
        }});
      try {
        const peerId = peerIdOf(cluster, SEED_REPLICA, targetId);
        assert.ok(appliedStateOf(cluster, SEED_REPLICA).learners.includes(peerId));
        const first = await coordinator.dispatchOperation(removal);
        assert.ok(settleCluster(cluster, () =>
          !appliedStateOf(cluster, SEED_REPLICA).learners.includes(peerId)));
        assert.ok(consensusWakes.some((event) => event.partitionId === cluster.partitionId &&
          event.replicaId === SEED_REPLICA && event.confState &&
          event.confState.learners.every((learner) => String(learner) !== peerId)),
        'the actual partition consensus relay carried committed learner absence');
        assert.ok(deliveries.some(({address, payload}) => address.startsWith(`${SEED}/`) &&
        payload.type === ReplicaOperationMessageType.REMOVE_LEARNER));
        assert.equal(source.lifecycleStore.durable.services.get(targetId).status,
          ReplicaStatus.ACTIVE, 'the isolated target has not cleaned up');
        const rejoinedBoot = BOOT + Number(restart);
        if (restart) {
          const disk = cluster.replica(targetId).dbFile;
          await source.dispose();
          assert.equal(cluster.restart(targetId).dbFile, disk);
          nodes.publishNewBootAtSameWatermark();
          Object.assign(source, sourceOf(cluster, service, [removal], rejoinedBoot));
          source.lifecycleStore.durable.services = leader.lifecycleStore.durable.services;
          source.handler.messageRouter = coordinator.workflowOwner.messageRouter;
        }
        assert.equal(cluster.isolated.delete(targetId), true);
        const readyObserved = nodes.waitForCommittedTarget((row) =>
          row.boot_incarnation === rejoinedBoot && row.connection_state === STATE.READY);
        await nodes.renew(rejoinedBoot);
        await readyObserved;
        rejoinedNode.resolve();
        await context.observeCommittedPlacement();
        // Virtual retry timers do not advance. This turn has to come from the
        // committed owner event after the genuine same-boot READY publication.
        const retried = await seeRejoinedCleanup({
          first, rejoinDelivery, coordinator, removal, nodes, deliveries, cluster,
        }, t);
        assert.equal(retried.status, ReplicaOperationResponseStatus.INITIATED);
        const cleanup = await deliverCommittedSourceChange(source, cluster);
        t.diagnostic(JSON.stringify({first, retried, cleanup, deliveries}));
        assert.equal(cleanup?.created_at,
          JSON.parse(removal.steps_history)[0].placementAdmission.learnerRetirement.replicaCreatedAt);
        assert.equal(cleanup.trigger_reason, 'placement_learner_membership_cleared');
        const cleanupDelivery = deliveries.findLast(({payload}) =>
          payload.type === ReplicaOperationMessageType.REMOVE_REPLICA);
        assert.equal(cleanupDelivery.payload.learnerRetirement.nodeBootIncarnation, rejoinedBoot);
        assert.equal(deliveries.filter(({payload}) =>
          payload.type === ReplicaOperationMessageType.REMOVE_LEARNER &&
        payload.learnerRetirement.canPropose === true).length >= 1, true);
        if (restart) {
          assert.equal(deliveries.findLast(({payload}) =>
            payload.type === ReplicaOperationMessageType.REMOVE_LEARNER)
            .payload.learnerRetirement.canPropose, false);
        }
        for (let turn = 0; turn < DELIVERY_BOUND_ROUNDS &&
        source.lifecycleStore.durable.services.has(targetId); turn += 1) {
          await nextTurns(1);
        }
        assert.equal(source.lifecycleStore.durable.services.has(targetId), false);
      } finally {
        rejoinedNode.resolve();
        await coordinator.shutdown();
        await source.dispose();
        await leader.dispose();
      }
    }, {createCluster: addressedCluster}));
}

for (const successor of ['boot', 'service generation']) {
  test(`a held learner REMOVE cannot cross a newer ${successor}`,
    async (t) => withPlacementLeaseAuthority(async (context) => {
      const {cluster, initial, nodes} = context;
      const targetId = initial.replica_id;
      const admitted = await admitRetirement(context);
      const {removal} = admitted;
      const rows = successor === 'boot' ? admitted.rows : admitted.rows.map((row) =>
        row.replica_id === targetId ? {...row, created_at: row.created_at + 1} : row);
      if (successor === 'boot') nodes.publishNewBootAtSameWatermark();
      await context.observeCommittedPlacement();
      const source = sourceOf(cluster, rows.find((row) => row.replica_id === targetId), [removal]);
      const leader = sourceOf(cluster, rows.find((row) => row.replica_id === SEED_REPLICA),
        [removal]);
      const deliveries = [];
      const coordinator = openDispatchOwner({source, rows, removal, nodes, cluster,
        deliveries, leader});
      try {
        const outcome = await coordinator.dispatchOperation(removal);
        t.diagnostic(JSON.stringify({outcome, deliveries}));
        const peerId = peerIdOf(cluster, SEED_REPLICA, targetId);
        assert.ok(appliedStateOf(cluster, SEED_REPLICA).learners.includes(peerId));
        if (successor === 'boot') {
          assert.ok(deliveries.some(({payload}) =>
            payload.type === ReplicaOperationMessageType.REMOVE_LEARNER &&
            payload.learnerRetirement.canPropose === false));
          assert.ok(deliveries.every(({payload}) =>
            payload.type === ReplicaOperationMessageType.REMOVE_LEARNER &&
            payload.learnerRetirement.canPropose === false),
          'the newer boot can only request proof of prior native absence');
        } else {
          assert.deepEqual(deliveries, [], 'the old service generation granted no transport effect');
        }
      } finally {
        await coordinator.shutdown();
        await source.dispose();
        await leader.dispose();
      }
    }, {createCluster: addressedCluster}));
}

test('committed native absence hands a permanently lost learner to restart cleanup before settling',
  {timeout: 7000}, async (t) => withPlacementLeaseAuthority(async (context) => {
    const {cluster, initial, nodes, clock} = context;
    const targetId = initial.replica_id;
    cluster.isolate(targetId);
    const {rows, removal} = await admitRetirement(context);
    const target = rows.find((row) => row.replica_id === targetId);
    const source = sourceOf(cluster, target, [removal]);
    const leader = sourceOf(cluster, rows.find((row) => row.replica_id === SEED_REPLICA), [removal]);
    const deliveries = [];
    const commitReached = Promise.withResolvers();
    const commitReleased = Promise.withResolvers();
    const coordinator = openDispatchOwner({source, rows, removal, nodes, cluster,
      deliveries, leader, clock});
    const gateway = leader.lifecycleStore.gateway;
    const apply = gateway.submitMutation.bind(gateway);
    gateway.submitMutation = async (mutation, options) => {
      if (mutation.data?.service_type === SERVICE_TYPE.PARTITION_CLEANUP) {
        commitReached.resolve(mutation);
        await commitReleased.promise;
      }
      return apply(mutation, options);
    };
    const readOperation = async () => {
      const result = await coordinator.repository.controlPlaneSystemTableGateway.readAuthoritativeRows(
        TABLES.REPLICA_OPERATIONS, 'SELECT * FROM replica_operations WHERE operation_id = ?',
        [removal.operation_id]);
      return result.rows[0];
    };
    try {
      const peerId = peerIdOf(cluster, SEED_REPLICA, targetId);
      assert.ok(appliedStateOf(cluster, SEED_REPLICA).learners.includes(peerId));
      await coordinator.dispatchOperation(removal);
      assert.ok(settleCluster(cluster, () =>
        !appliedStateOf(cluster, SEED_REPLICA).learners.includes(peerId)));
      const redrive = coordinator.dispatchOperation(removal);
      const takeover = await waitForHeldRequest(commitReached);
      assert.equal(takeover.whereClause.created_at, target.created_at);
      assert.equal(takeover.whereClause.cleanup_token,
        `placement-learner-retire:${removal.operation_id}`);
      assert.equal((await readOperation()).completed_at, null);
      assert.equal(source.lifecycleStore.durable.services.get(targetId).service_type,
        SERVICE_TYPE.PARTITION);

      commitReleased.resolve();
      await redrive;
      for (let turns = 0; turns < DELIVERY_BOUND_ROUNDS &&
          (await readOperation()).completed_at === null; turns += 1) await nextTurns(1);
      const terminal = await readOperation();
      assert.equal(terminal.workflow_step, WORKFLOW_STEP.REMOVED);
      assert.ok(Number.isFinite(terminal.completed_at));
      assert.equal(nodes.nodeRow().connection_state, STATE.DISCONNECTED);
      assert.equal(deliveries.some(({payload}) =>
        payload.type === ReplicaOperationMessageType.REMOVE_REPLICA), false);
      const tombstone = source.lifecycleStore.durable.services.get(targetId);
      assert.equal(tombstone.service_type, SERVICE_TYPE.PARTITION_CLEANUP);
      assert.equal(tombstone.created_at, target.created_at);
      assert.equal(tombstone.cleanup_token, takeover.whereClause.cleanup_token);

      // A fresh process's local cleanup consults the committed ledger and
      // SERVICES owner receipt, rather than needing the original dispatcher.
      source.lifecycleStore.durable.replica_operations.set(terminal.operation_id, terminal);
      const file = path.join(source.handler.dataDir, 'partitions', cluster.partitionId,
        `${targetId}.db`);
      fs.mkdirSync(path.dirname(file), {recursive: true});
      fs.copyFileSync(cluster.replica(targetId).dbFile, file);
      await assert.rejects(assertDurableRejoinStorageAdmission(source.handler.replicaStateMachine,
        restoreAuthorityOf(target)), {code: 'DURABLE_REJOIN_PLACEMENT_RETIREMENT_OWNS_DISK'});
      const restarted = source.restart();
      await restarted.handler.removedReplicaCleanupDebtSweepTask;
      assert.equal(fs.existsSync(file), false);
      assert.equal(source.lifecycleStore.durable.services.has(targetId), false);
      t.diagnostic(JSON.stringify({takeover, terminal, tombstone, deliveries}));
    } finally {
      commitReleased.resolve();
      await coordinator.shutdown();
      await source.dispose();
      await leader.dispose();
    }
  }, {createCluster: addressedCluster}));

function restoreAuthorityOf(row) {
  return {restoringExistingReplica: true, replicaId: row.replica_id, lifecycleAuthority: {
    replicaId: row.service_id, replicaCreatedAt: row.created_at,
    serviceType: row.service_type, partitionId: row.partition_id,
    nodeId: row.node_id, status: row.status, durableVersionColumn: 'state_entered_at',
    durableVersion: row.state_entered_at,
  }};
}

async function waitForHeldRequest(entered) {
  const bound = Promise.withResolvers();
  const timer = setTimeout(() => bound.reject(new Error(
    'the exact learner proposal did not reach the delivery boundary')),
  CONTROL_OBSERVATION_BOUND_MS);
  try {
    return await Promise.race([entered.promise, bound.promise]);
  } finally {
    clearTimeout(timer);
  }
}

for (const change of ['boot', 'service birth']) {
  test(`a held native proposal cannot overtake a committed newer ${change}`,
    {timeout: 7000}, async (t) => withPlacementLeaseAuthority(async (context) => {
      const {cluster, initial, nodes, clock} = context;
      const {rows, removal} = await admitRetirement(context);
      const target = rows.find((row) => row.replica_id === initial.replica_id);
      const source = sourceOf(cluster, target, [removal]);
      const leader = sourceOf(cluster, rows.find((row) => row.replica_id === SEED_REPLICA),
        [removal]);
      leader.lifecycleStore.durable.services.set(target.replica_id, target);
      const entered = Promise.withResolvers();
      const resume = Promise.withResolvers();
      const deliveries = [];
      let held = false;
      const coordinator = openDispatchOwner({source, rows, removal, nodes, cluster,
        deliveries, leader, clock, async beforeDelivery(payload) {
          if (!held && payload.type === ReplicaOperationMessageType.REMOVE_LEARNER &&
              payload.learnerRetirement.canPropose) {
            held = true;
            entered.resolve(payload);
            await resume.promise;
          }
        }});
      const run = coordinator.dispatchOperation(removal);
      try {
        const captured = await waitForHeldRequest(entered);
        assert.equal(captured.operationId, removal.operation_id);
        assert.equal(captured.learnerRetirement.replicaCreatedAt, target.created_at);
        if (change === 'boot') {
          nodes.publishNewBootAtSameWatermark();
          await nodes.renew(BOOT + 1);
          await nodes.waitForCommittedTarget((row) => row.boot_incarnation === BOOT + 1 &&
            row.connection_state === STATE.READY);
          await assertDurableRejoinStorageAdmission(source.handler.replicaStateMachine,
            restoreAuthorityOf(target));
        } else {
          const next = {...target, created_at: target.created_at + 1};
          leader.lifecycleStore.durable.services.set(target.replica_id, next);
          coordinator.repository.systemTableCache.upsert(TABLES.SERVICES, next);
        }
        resume.resolve();
        await run;
        const peer = peerIdOf(cluster, SEED_REPLICA, initial.replica_id);
        const retained = appliedStateOf(cluster, SEED_REPLICA).learners.includes(peer);
        t.diagnostic(JSON.stringify({change, node: nodes.nodeRow(), retained, deliveries}));
        assert.equal(retained, true, 'a newer committed authority retained the native member');
        assert.equal(source.serviceChanges.some((row) =>
          row.status !== ReplicaStatus.ACTIVE || row.cleanup_token !== null), false);
        if (change === 'boot') {
          const recovered = source.lifecycleStore.durable.services.get(target.replica_id);
          assert.equal(recovered.created_at, target.created_at);
          assert.ok(recovered.state_entered_at > target.state_entered_at,
            'the actual restore owner acquired a newer lifecycle version');
        }
      } finally {
        resume.resolve();
        await Promise.allSettled([run]);
        await coordinator.shutdown();
        await source.dispose();
        await leader.dispose();
      }
    }, {createCluster: addressedCluster}));
}

test('the committed retire custody wins against a restart using a fresh restore plan',
  {timeout: 7000}, async (t) => withPlacementLeaseAuthority(async (context) => {
    const {cluster, initial, nodes, clock} = context;
    const {rows, removal} = await admitRetirement(context);
    const target = rows.find((row) => row.replica_id === initial.replica_id);
    const source = sourceOf(cluster, target, [removal]);
    const leader = sourceOf(cluster, rows.find((row) => row.replica_id === SEED_REPLICA),
      [removal]);
    const entered = Promise.withResolvers();
    const resume = Promise.withResolvers();
    const deliveries = [];
    const coordinator = openDispatchOwner({source, rows, removal, nodes, cluster,
      deliveries, leader, clock});
    const gateway = leader.lifecycleStore.gateway;
    const mutate = gateway.submitMutation.bind(gateway);
    gateway.submitMutation = async (mutation, options) => {
      const answer = await mutate(mutation, options);
      if (mutation.tableName === TABLES.SERVICES &&
          typeof mutation.data?.cleanup_token === 'string') {
        entered.resolve(leader.lifecycleStore.durable.services.get(target.replica_id));
        await resume.promise;
      }
      return answer;
    };
    const run = coordinator.dispatchOperation(removal);
    try {
      const custody = await waitForHeldRequest(entered);
      assert.equal(custody.created_at, target.created_at);
      assert.ok(custody.state_entered_at > target.state_entered_at);
      const peer = peerIdOf(cluster, SEED_REPLICA, target.replica_id);
      assert.ok(appliedStateOf(cluster, SEED_REPLICA).learners.includes(peer));
      nodes.publishNewBootAtSameWatermark();
      await assert.rejects(assertDurableRejoinStorageAdmission(source.handler.replicaStateMachine,
        restoreAuthorityOf(custody)), {code: 'DURABLE_REJOIN_PLACEMENT_RETIREMENT_OWNS_DISK'});
      resume.resolve();
      const result = await run;
      assert.ok(settleCluster(cluster, () =>
        !appliedStateOf(cluster, SEED_REPLICA).learners.includes(peer)));
      t.diagnostic(JSON.stringify({custody, result, deliveries}));
    } finally {
      resume.resolve();
      await Promise.allSettled([run]);
      await coordinator.shutdown();
      await source.dispose();
      await leader.dispose();
    }
  }, {createCluster: addressedCluster}));

for (const flaw of ['foreign operation', 'wrong status', 'different birth', 'contradictory proposal',
  'unpersisted cleanup custody']) {
  test(`a retirement reply with ${flaw} cannot terminate the scoped operation`,
    {timeout: 7000}, async (t) => withPlacementLeaseAuthority(async (context) => {
      const {cluster, initial, nodes, clock} = context;
      const {rows, removal} = await admitRetirement(context);
      const source = sourceOf(cluster, rows.find((row) => row.replica_id === initial.replica_id),
        [removal]);
      const leader = sourceOf(cluster, rows.find((row) => row.replica_id === SEED_REPLICA),
        [removal]);
      const deliveries = [];
      const coordinator = openDispatchOwner({source, rows, removal, nodes, cluster, deliveries,
        leader, clock, receiverAnswer(payload) {
          if (payload.type !== ReplicaOperationMessageType.REMOVE_LEARNER) return undefined;
          const echo = {...payload.learnerRetirement};
          const answer = {status: ReplicaOperationResponseStatus.COMPLETED,
            operationId: payload.operationId, partitionId: cluster.partitionId,
            replicaId: initial.replica_id, nodeId: SEED,
            [ReplicaOperationField.LEARNER_RETIREMENT]: 'learner_retirement_superseded',
            [ReplicaOperationField.LEARNER_RETIREMENT_SCOPE]: echo};
          if (flaw === 'foreign operation') answer.operationId = 'different-retirement';
          if (flaw === 'wrong status') answer.status = ReplicaOperationResponseStatus.ERROR;
          if (flaw === 'different birth') echo.replicaCreatedAt += 1;
          if (flaw === 'contradictory proposal') {
            answer[ReplicaOperationField.PROPOSAL] = {outcome: RAFT_OPERATION_OUTCOME.CORE_OK,
              reason: RAFT_FOUNDING_GROWTH_OUTCOME.LEARNER_REMOVAL_PROPOSED,
              replicaIdentity: initial.replica_id};
          }
          if (flaw === 'unpersisted cleanup custody') {
            answer[ReplicaOperationField.LEARNER_RETIREMENT] =
              LEARNER_RETIREMENT_OUTCOME.CLEANUP_OWNED;
            answer[ReplicaOperationField.LEARNER_RETIREMENT_CUSTODY] =
              `placement-learner-retire:${payload.operationId}`;
          }
          return answer;
        }});
      try {
        const result = await coordinator.dispatchOperation(removal);
        const current = await coordinator.getOperation(removal.operation_id);
        t.diagnostic(JSON.stringify({result, current: current.workflowStep, deliveries}));
        assert.ok(deliveries.some(({payload}) => payload.operationId === removal.operation_id));
        assert.equal(current.completedAt, null,
          'an unbound reply cannot settle an admitted removal');
        assert.equal(source.serviceChanges.length, 0);
      } finally {
        await coordinator.shutdown();
        await source.dispose();
        await leader.dispose();
      }
    }, {createCluster: addressedCluster}));
}
