import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {TablePolicyService} from '../../src/policy/table-policy-service.js';
import {POLICY_ERROR_CODE} from '../../src/policy/policy-constants.js';
import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
import {OperationType} from '../../src/rebalancer/replica-status.js';
import {ReplicaOperationMessageType} from '../../src/rebalancer/replica-operation-constants.js';
import {createMockCache, createTestCoordinator} from './test-helpers.js';

const PARTITION = 'minimum-five-user-p1';
const TABLE = 'minimum-five-user';
const NODE = 'node-1';
const UNAVAILABLE = {code: POLICY_ERROR_CODE.READ_UNAVAILABLE, deferRetry: true};

function serviceRow(index) {
  return {service_id: `${PARTITION}-r${index}`, replica_id: `${PARTITION}-r${index}`,
    partition_id: PARTITION, node_id: `node-${index}`, service_type: 'partition',
    status: 'active', raft_role: index === 1 ? 'leader' : 'follower',
    address: `node-${index}/partition/${PARTITION}-r${index}`};
}

function buildScenario() {
  const clock = new VirtualTimeSource({startMs: Date.now()});
  const partition = {partition_id: PARTITION, table_id: TABLE, replica_count: 5};
  const table = {table_id: TABLE, table_policies: '{"minReplicaCount":5}'};
  const cache = createMockCache({partitions: [partition], tables: [table],
    nodes: Array.from({length: 6}, (_unused, i) => ({node_id: `node-${i + 1}`,
      status: 'active', connection_state: 'ready', ready_lease_expires_at: clock.now() + 60_000})),
    services: Array.from({length: 5}, (_unused, i) => serviceRow(i + 1))});
  const policyOwner = new TablePolicyService({systemTableCache: cache});
  const removals = [];
  const coordinator = createTestCoordinator({nodeId: NODE, systemTableCache: cache,
    tablePolicyService: policyOwner, enableTimeouts: false,
    setTimeoutFn: clock.setTimeout.bind(clock), clearTimeoutFn: clock.clearTimeout.bind(clock),
    messageRouter: {
      getConnectionState: () => 'connected', pingNode: async () => true,
      isOutboundQueueAvailable: () => true,
      deliver: async (_target, payload) => {
        if (payload.type === ReplicaOperationMessageType.REMOVE_REPLICA) removals.push(payload);
        return buildDeliveryEnvelope({acknowledged: true}, {status: 'initiated'});
      },
    }});
  return {clock, partition, table, cache, policyOwner, coordinator,
    owner: coordinator.workflowOwner, removals};
}

const FAULTS = {
  absent_owner: (world) => {
    world.owner.tablePolicyService = null;
  },
  absent_partition: (world) => {
    world.cache.delete('partitions', PARTITION);
  },
  undeclared_target: (world) => {
    world.cache.upsert('partitions', {...world.partition, replica_count: null});
  },
  absent_table: (world) => {
    world.cache.delete('tables', TABLE);
  },
  malformed_policy: (world) => {
    world.cache.upsert('tables', {...world.table, table_policies: '{'});
  },
  invalid_minimum: (world) => {
    world.cache.upsert('tables', {...world.table, table_policies: '{"minReplicaCount":1.5}'});
  },
  failed_read: (world) => {
    world.policyOwner.readTableRow = async () => {
      throw new Error('finite policy read fault');
    };
  },
};

test('unavailable policy cannot lower the minimum-five REMOVE floor or terminalize its retained owner retry', async (t) => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({logging: {level: 'error'}});
  LoggingService.getInstance().initialize({level: 'error'});
  try {
    for (const [name, inject] of Object.entries(FAULTS)) {
      await t.test(name, async () => {
        const world = buildScenario();
        try {
          const operation = await world.coordinator.createOperation({type: OperationType.REMOVE,
            partitionId: PARTITION, nodeId: NODE, replicaId: `${PARTITION}-r1`, emitOperationCreated: false});
          const baseline = await world.owner.evaluateRemoveSafety(operation);
          assert.match(baseline.error, /below minimum/, 'five voters cannot lose one under minimum five');
          const readTableRow = world.policyOwner.readTableRow;
          inject(world);
          await assert.rejects(world.owner.evaluateRemoveSafety(operation), UNAVAILABLE);
          const result = await world.coordinator.executeOperation(operation);
          assert.equal(result.reason, 'deferred_retry_pending', JSON.stringify(result));
          assert.deepEqual(world.removals, []);
          assert.equal(
            world.owner.transitionRetryTimerByOperationId.has(operation.operationId), true,
          );
          assert.ok(world.owner.getTransitionRetryOperationSnapshot(operation.operationId));
          const retained = await world.coordinator.getOperation(operation.operationId);
          assert.notEqual(retained.workflowStep, 'failed');
          assert.equal(retained.completedAt, null);

          world.owner.tablePolicyService = world.policyOwner;
          world.policyOwner.readTableRow = readTableRow;
          world.cache.upsert('partitions', world.partition);
          world.cache.upsert('tables', world.table);
          world.cache.upsert('services', serviceRow(6));
          const restored = await world.owner.evaluateRemoveSafety(retained);
          assert.equal(restored.error, null);
          // Drive the same retained operation through the execution owner after
          // restoring evidence. Timer-trigger proof is in the planning witness.
          world.owner.clearTransitionRetry(operation.operationId);
          await world.coordinator.executeOperation(retained);
          assert.equal(world.removals.length, 1, 'six voters permit exactly the requested removal');
        } finally {
          await world.coordinator.shutdown();
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
