import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {TablePolicyService} from '../../src/policy/table-policy-service.js';
import {
  POLICY_AUTHORITY_STATE,
  POLICY_ERROR_CODE,
} from '../../src/policy/policy-constants.js';
import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
import {OperationType} from '../../src/rebalancer/replica-status.js';
import {ReplicaOperationMessageType} from '../../src/rebalancer/replica-operation-constants.js';
import {createMockCache, createTestCoordinator} from './test-helpers.js';

const PARTITION = 'minimum-five-user-p1';
const TABLE = 'minimum-five-user';
const GROUP = 'mg-minimum-five';
const NODE = 'node-1';
const UNAVAILABLE = {code: POLICY_ERROR_CODE.READ_UNAVAILABLE, deferRetry: true};
async function advanceClockAndDrainRetries(clock, ms) {
  clock.advance(ms);
  for (let i = 0; i < 20; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

const SYSTEM_PARTITION_BY_TABLE = Object.freeze({
  partitions: 'partitions-p1',
  tables: 'tables-p1',
  message_groups: 'message_groups-p1',
});

function serviceRow(index) {
  return {
    service_id: `${PARTITION}-r${index}`,
    replica_id: `${PARTITION}-r${index}`,
    partition_id: PARTITION,
    node_id: `node-${index}`,
    service_type: 'partition',
    status: 'active',
    // The removed replica (r1) is a follower: these cells are about the
    // policy floor and its retained retry, not leadership; a leading r1
    // would be held by the removal leadership gate (2026-11-11) for a
    // named transfer this fixture group (no voters beyond its leader)
    // cannot model.
    raft_role: index === 2 ? 'leader' : 'follower',
    address: `node-${index}/partition/${PARTITION}-r${index}`,
  };
}

function messageGroupServiceRow(index) {
  return {
    service_id: `${GROUP}-r${index}`,
    replica_id: `${GROUP}-r${index}`,
    group_id: GROUP,
    partition_id: GROUP,
    node_id: `node-${index}`,
    service_type: 'message_group',
    status: 'active',
    raft_role: index === 1 ? 'leader' : 'follower',
    address: `node-${index}/message_group/${GROUP}-r${index}`,
  };
}

function buildAuthoritativePolicyGateway(cache, faultState) {
  return {
    executeRead: async ({readFromCache}) => ({
      success: true,
      rows: typeof readFromCache === 'function' ? readFromCache() : [],
    }),
    readAuthoritativeRows: async (tableName, _sql, params = [], options = {}) => {
      faultState.lastReadOptions = options;
      if (faultState.readError) {
        throw new Error(faultState.readError);
      }
      const key = params[0] || null;
      const row = key ? cache.get(tableName, key) : null;
      const partitionId = SYSTEM_PARTITION_BY_TABLE[tableName] || 'partitions-p1';
      return {
        success: true,
        rowSetComplete: faultState.rowSetComplete,
        rows: row ? [{...row}] : [],
        readAuthorityWitness: {
          state: 'observed',
          partitionId,
          servingNodeId: NODE,
          servingReplicaId: `${partitionId}-r1`,
          role: faultState.witnessRole,
          leaderNodeId: NODE,
          term: 1,
          commitIndex: 1,
          appliedIndex: 1,
          observedAtMs: 1_000_000,
        },
      };
    },
  };
}

function buildCoordinatorForCache({clock, cache, policyOwner, removals, Deletions}) {
  const coordinator = createTestCoordinator({
    nodeId: NODE,
    systemTableCache: cache,
    tablePolicyService: policyOwner || undefined,
    enableTimeouts: false,
    setTimeoutFn: clock.setTimeout.bind(clock),
    clearTimeoutFn: clock.clearTimeout.bind(clock),
    messageRouter: {
      getConnectionState: () => 'connected',
      pingNode: async () => true,
      isOutboundQueueAvailable: () => true,
      deliver: async (_target, payload) => {
        if (payload.type === ReplicaOperationMessageType.REMOVE_REPLICA) {
          removals.push(payload);
          Deletions.push(payload.replicaId);
          cache.delete('services', payload.replicaId);
        }
        return buildDeliveryEnvelope({acknowledged: true}, {status: 'initiated'});
      },
    },
  });
  if (policyOwner === null) {
    coordinator.tablePolicyService = null;
    coordinator.workflowOwner.tablePolicyService = null;
  }
  return coordinator;
}

function buildActiveReadyNodes(clock) {
  return Array.from({length: 6}, (_unused, i) => ({
    node_id: `node-${i + 1}`,
    status: 'active',
    connection_state: 'ready',
    ready_lease_expires_at: clock.now() + 60_000,
  }));
}

function buildScenarioWorld(clock, cache, extraFields) {
  const faultState = {
    rowSetComplete: true,
    witnessRole: 'leader',
    readError: null,
    lastReadOptions: null,
  };
  const policyOwner = new TablePolicyService({
    systemTableCache: cache,
    controlPlaneSystemTableGateway: buildAuthoritativePolicyGateway(cache, faultState),
    now: () => clock.now(),
  });
  const removals = [];
  const sourceDeletions = [];
  const coordinator = buildCoordinatorForCache({
    clock,
    cache,
    policyOwner,
    removals,
    Deletions: sourceDeletions,
  });
  return {
    clock,
    ...extraFields,
    cache,
    faultState,
    policyOwner,
    activePolicyOwner: policyOwner,
    extraPolicyServices: [],
    coordinator,
    owner: coordinator.workflowOwner,
    removals,
    sourceDeletions,
    setActivePolicyOwner(nextOwner) {
      this.activePolicyOwner = nextOwner;
      this.coordinator.tablePolicyService = nextOwner;
      this.owner.tablePolicyService = nextOwner;
    },
  };
}

function buildScenario() {
  const clock = new VirtualTimeSource({startMs: Date.now()});
  const partition = {partition_id: PARTITION, table_id: TABLE, replica_count: 5};
  const table = {table_id: TABLE, table_policies: '{"minReplicaCount":5}'};
  const cache = createMockCache({
    partitions: [partition],
    tables: [table],
    nodes: buildActiveReadyNodes(clock),
    services: Array.from({length: 5}, (_unused, i) => serviceRow(i + 1)),
  });
  return buildScenarioWorld(clock, cache, {partition, table});
}

function buildMessageGroupScenario() {
  const clock = new VirtualTimeSource({startMs: Date.now()});
  const messageGroup = {
    group_id: GROUP,
    replica_count: 5,
    policy: JSON.stringify({targetReplicaCount: 5, maxReplicaCount: 7}),
  };
  const cache = createMockCache({
    messageGroups: [messageGroup],
    nodes: buildActiveReadyNodes(clock),
    services: Array.from({length: 5}, (_unused, i) => messageGroupServiceRow(i + 1)),
  });
  return buildScenarioWorld(clock, cache, {messageGroup});
}

const FAULTS = {
  absent_owner: {
    expectedState: POLICY_AUTHORITY_STATE.UNAVAILABLE_OR_STALE,
    inject: (world) => {
      world.setActivePolicyOwner(null);
    },
  },
  cache_only_service: {
    expectedState: POLICY_AUTHORITY_STATE.UNAVAILABLE_OR_STALE,
    inject: (world) => {
      const cacheOnly = new TablePolicyService({systemTableCache: world.cache});
      world.extraPolicyServices.push(cacheOnly);
      world.setActivePolicyOwner(cacheOnly);
    },
  },
  old_getter_only_owner: {
    expectedState: POLICY_AUTHORITY_STATE.UNAVAILABLE_OR_STALE,
    inject: (world) => {
      world.setActivePolicyOwner({
        getPolicyForPartition: async () => ({
          targetReplicaCount: 3,
          minReplicaCount: 3,
        }),
      });
    },
  },
  follower_incomplete_witness: {
    expectedState: POLICY_AUTHORITY_STATE.UNAVAILABLE_OR_STALE,
    inject: (world) => {
      world.faultState.rowSetComplete = false;
      world.faultState.witnessRole = 'follower';
    },
  },
  absent_partition: {
    expectedState: POLICY_AUTHORITY_STATE.AUTHORITATIVE_ABSENCE,
    inject: (world) => {
      world.cache.delete('partitions', PARTITION);
    },
  },
  undeclared_target: {
    expectedState: POLICY_AUTHORITY_STATE.AUTHORITATIVE_ABSENCE,
    inject: (world) => {
      world.cache.upsert('partitions', {...world.partition, replica_count: null});
    },
  },
  absent_table: {
    expectedState: POLICY_AUTHORITY_STATE.AUTHORITATIVE_ABSENCE,
    inject: (world) => {
      world.cache.delete('tables', TABLE);
    },
  },
  malformed_policy: {
    expectedState: POLICY_AUTHORITY_STATE.UNAVAILABLE_OR_STALE,
    inject: (world) => {
      world.cache.upsert('tables', {...world.table, table_policies: '{'});
    },
  },
  invalid_minimum: {
    expectedState: POLICY_AUTHORITY_STATE.UNAVAILABLE_OR_STALE,
    inject: (world) => {
      world.cache.upsert('tables', {...world.table, table_policies: '{"minReplicaCount":1.5}'});
    },
  },
  failed_read: {
    expectedState: POLICY_AUTHORITY_STATE.UNAVAILABLE_OR_STALE,
    inject: (world) => {
      world.faultState.readError = 'finite policy read fault';
    },
  },
};

const MESSAGE_GROUP_FAULTS = {
  absent_owner: {
    expectedState: POLICY_AUTHORITY_STATE.UNAVAILABLE_OR_STALE,
    inject: (world) => {
      world.setActivePolicyOwner(null);
    },
  },
  cache_only_service: {
    expectedState: POLICY_AUTHORITY_STATE.UNAVAILABLE_OR_STALE,
    inject: (world) => {
      const cacheOnly = new TablePolicyService({systemTableCache: world.cache});
      world.extraPolicyServices.push(cacheOnly);
      world.setActivePolicyOwner(cacheOnly);
    },
  },
  old_getter_only_owner: {
    expectedState: POLICY_AUTHORITY_STATE.UNAVAILABLE_OR_STALE,
    inject: (world) => {
      world.setActivePolicyOwner({
        getMessageGroupPolicy: async () => ({
          targetReplicaCount: 3,
          minReplicaCount: 3,
        }),
      });
    },
  },
  follower_incomplete_witness: {
    expectedState: POLICY_AUTHORITY_STATE.UNAVAILABLE_OR_STALE,
    inject: (world) => {
      world.faultState.rowSetComplete = false;
      world.faultState.witnessRole = 'follower';
    },
  },
  absent_message_group: {
    expectedState: POLICY_AUTHORITY_STATE.AUTHORITATIVE_ABSENCE,
    inject: (world) => {
      world.cache.delete('message_groups', GROUP);
    },
  },
  undeclared_target: {
    expectedState: POLICY_AUTHORITY_STATE.AUTHORITATIVE_ABSENCE,
    inject: (world) => {
      world.cache.upsert('message_groups', {
        group_id: GROUP,
        replica_count: null,
        policy: JSON.stringify({ensureLocalAccess: true}),
      });
    },
  },
  malformed_policy: {
    expectedState: POLICY_AUTHORITY_STATE.UNAVAILABLE_OR_STALE,
    inject: (world) => {
      world.cache.upsert('message_groups', {
        ...world.messageGroup,
        policy: '{',
      });
    },
  },
  invalid_target: {
    expectedState: POLICY_AUTHORITY_STATE.UNAVAILABLE_OR_STALE,
    inject: (world) => {
      world.cache.upsert('message_groups', {
        ...world.messageGroup,
        replica_count: 4,
        policy: JSON.stringify({targetReplicaCount: 4}),
      });
    },
  },
  stale_cached_policy_after_read_fault: {
    expectedState: POLICY_AUTHORITY_STATE.UNAVAILABLE_OR_STALE,
    inject: (world) => {
      world.policyOwner.policyCache.set(`mg:${GROUP}`, {
        policy: {targetReplicaCount: 3, maxReplicaCount: 5},
        rawPolicy: JSON.stringify({targetReplicaCount: 3}),
        rawReplicaCount: 3,
        timestamp: world.clock.now(),
      });
      world.faultState.readError = 'message_groups authority unavailable';
    },
  },
};

test('unavailable policy cannot lower the minimum-five REMOVE floor or terminalize its retained owner retry', async (t) => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({logging: {level: 'error'}});
  LoggingService.getInstance().initialize({level: 'error'});
  try {
    for (const [name, fault] of Object.entries(FAULTS)) {
      await t.test(`partition:${name}`, async () => {
        const world = buildScenario();
        let restartedCoordinator = null;
        try {
          const operation = await world.coordinator.createOperation({
            type: OperationType.REMOVE,
            partitionId: PARTITION,
            nodeId: NODE,
            replicaId: `${PARTITION}-r1`,
            emitOperationCreated: false,
          });
          const baseline = await world.owner.evaluateRemoveSafety(operation);
          assert.match(baseline.error, /below minimum/, 'five voters cannot lose one under minimum five');
          assert.deepEqual(world.faultState.lastReadOptions, {
            strategy: 'authoritative_required',
            authoritativeReadMode: 'owner_rpc_required',
            leaderMode: 'required',
            preferLeader: true,
            localReadConsistency: 'local_leader',
            replicaFallbackConsistency: 'local_leader',
          });

          fault.inject(world);
          const fact = await world.owner.resolvePartitionRemoveSafetyPolicyFact(PARTITION);
          assert.equal(fact.state, fault.expectedState);
          await assert.rejects(world.owner.evaluateRemoveSafety(operation), UNAVAILABLE);
          const result = await world.coordinator.executeOperation(operation);
          assert.equal(result.reason, 'deferred_retry_pending', JSON.stringify(result));
          assert.deepEqual(world.removals, []);
          assert.deepEqual(world.sourceDeletions, []);
          assert.ok(world.cache.get('services', `${PARTITION}-r1`), 'source replica must remain intact');
          assert.equal(
            world.owner.transitionRetryTimerByOperationId.has(operation.operationId),
            true,
          );
          assert.ok(world.owner.getTransitionRetryOperationSnapshot(operation.operationId));
          const retained = await world.coordinator.getOperation(operation.operationId);
          assert.notEqual(retained.workflowStep, 'failed');
          assert.equal(retained.completedAt, null);

          // Simulate coordinator restart WHILE the policy fault is still active:
          // recovery must not authorize removal or fail the operation, and must retain the retry timer.
          await world.coordinator.shutdown();
          restartedCoordinator = buildCoordinatorForCache({
            clock: world.clock,
            cache: world.cache,
            policyOwner: world.activePolicyOwner,
            removals: world.removals,
            Deletions: world.sourceDeletions,
          });
          const recoveryDuringFault = await restartedCoordinator.handleRecovery();
          assert.equal(
            recoveryDuringFault.markedFailed,
            0,
            'pending REMOVE must not be marked failed on coordinator restart during policy fault',
          );
          assert.deepEqual(world.removals, []);
          assert.deepEqual(world.sourceDeletions, []);
          assert.equal(
            restartedCoordinator.workflowOwner.transitionRetryTimerByOperationId.has(
              operation.operationId,
            ),
            true,
            'replacement coordinator must retain canonical retry timer while policy remains unavailable',
          );

          // Now restore valid authoritative policy (target 5, min 5) and 6 countable replicas,
          // and advance the virtual clock so the retained canonical retry timer fires.
          world.faultState.rowSetComplete = true;
          world.faultState.witnessRole = 'leader';
          world.faultState.readError = null;
          world.cache.upsert('partitions', world.partition);
          world.cache.upsert('tables', world.table);
          world.cache.upsert('services', serviceRow(6));
          restartedCoordinator.tablePolicyService = world.policyOwner;
          restartedCoordinator.workflowOwner.tablePolicyService = world.policyOwner;

          await advanceClockAndDrainRetries(world.clock, 5_000);
          assert.equal(world.removals.length, 1, 'retained canonical retry dispatches REMOVE once policy and 6 voters are restored');
          assert.deepEqual(world.sourceDeletions, [`${PARTITION}-r1`]);
        } finally {
          if (restartedCoordinator) {
            await restartedCoordinator.shutdown();
          }
          await world.coordinator.shutdown();
          for (const extraService of world.extraPolicyServices) {
            extraService.shutdown();
          }
          world.policyOwner.shutdown();
          assert.equal(world.clock.pendingTimerCount(), 0);
        }
      });
    }

    for (const [name, fault] of Object.entries(MESSAGE_GROUP_FAULTS)) {
      await t.test(`message_group:${name}`, async () => {
        const world = buildMessageGroupScenario();
        let restartedCoordinator = null;
        try {
          const operation = await world.coordinator.createOperation({
            type: OperationType.REMOVE,
            partitionId: GROUP,
            entityType: 'message_group',
            entityId: GROUP,
            nodeId: NODE,
            replicaId: `${GROUP}-r1`,
            emitOperationCreated: false,
          });
          // Prime policyCache with target 5 first so faults also prove cached policy cannot bypass row observation.
          await world.policyOwner.getMessageGroupPolicy(GROUP);
          const baseline = await world.owner.evaluateRemoveSafety(operation);
          assert.match(
            baseline.error,
            /below minimum \(4\/5\)/,
            'with target 5 and 5 countable replicas, removal leaving 4 is blocked',
          );
          assert.deepEqual(world.faultState.lastReadOptions, {
            strategy: 'authoritative_required',
            authoritativeReadMode: 'owner_rpc_required',
            leaderMode: 'required',
            preferLeader: true,
            localReadConsistency: 'local_leader',
            replicaFallbackConsistency: 'local_leader',
          });

          fault.inject(world);
          const fact = await world.owner.resolveEntityRemoveSafetyPolicyFact(
            'message_group',
            GROUP,
          );
          assert.equal(fact.state, fault.expectedState);
          await assert.rejects(
            world.owner.evaluateRemoveSafety(operation),
            UNAVAILABLE,
          );
          const result = await world.coordinator.executeOperation(operation);
          assert.equal(result.reason, 'deferred_retry_pending', JSON.stringify(result));
          assert.deepEqual(world.removals, []);
          assert.deepEqual(world.sourceDeletions, []);
          assert.ok(
            world.cache.get('services', `${GROUP}-r1`),
            'source replica must not be deleted while policy is unavailable',
          );
          const retained = await world.coordinator.getOperation(operation.operationId);
          assert.notEqual(retained.workflowStep, 'failed');
          assert.equal(retained.completedAt, null);

          // Simulate coordinator restart WHILE the policy fault is still active.
          await world.coordinator.shutdown();
          restartedCoordinator = buildCoordinatorForCache({
            clock: world.clock,
            cache: world.cache,
            policyOwner: world.activePolicyOwner,
            removals: world.removals,
            Deletions: world.sourceDeletions,
          });
          const recoveryDuringFault = await restartedCoordinator.handleRecovery();
          assert.equal(recoveryDuringFault.markedFailed, 0);
          assert.deepEqual(world.removals, []);
          assert.deepEqual(world.sourceDeletions, []);
          assert.equal(
            restartedCoordinator.workflowOwner.transitionRetryTimerByOperationId.has(
              operation.operationId,
            ),
            true,
            'replacement coordinator must retain canonical retry timer while message_group policy remains unavailable',
          );

          // Restore valid authoritative policy (target 5) and 6 countable replicas,
          // and advance the virtual clock so the retained canonical retry timer fires.
          world.faultState.rowSetComplete = true;
          world.faultState.witnessRole = 'leader';
          world.faultState.readError = null;
          world.cache.upsert('message_groups', world.messageGroup);
          world.cache.upsert('services', messageGroupServiceRow(6));
          restartedCoordinator.tablePolicyService = world.policyOwner;
          restartedCoordinator.workflowOwner.tablePolicyService = world.policyOwner;

          await advanceClockAndDrainRetries(world.clock, 5_000);
          assert.equal(
            world.removals.length,
            1,
            'restored valid policy (target 5) and 6 countable replicas resume the pending REMOVE via canonical retry',
          );
          assert.deepEqual(world.sourceDeletions, [`${GROUP}-r1`]);
        } finally {
          if (restartedCoordinator) {
            await restartedCoordinator.shutdown();
          }
          await world.coordinator.shutdown();
          for (const extraService of world.extraPolicyServices) {
            extraService.shutdown();
          }
          world.policyOwner.shutdown();
          assert.equal(world.clock.pendingTimerCount(), 0);
        }
      });
    }
  } finally {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  }
});
