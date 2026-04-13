/**
 * Integration tests for sys-postgres-wire scale, failover, and
 * rebalance flows.
 *
 * Validates that:
 * 1. MovePlanner plans ADD moves when under target replica count.
 * 2. MovePlanner plans REMOVE moves when over target replica count.
 * 3. In-flight operations suppress new moves.
 * 4. Failed replicas trigger REMOVE moves.
 *
 * Requirements: 15.2
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from
  '../../src/config/configuration-manager.js';
import {LoggingService} from
  '../../src/logging/logging-service.js';
import {MovePlanner} from
  '../../src/rebalancer/move-planner.js';
import {
  REBALANCER_ENTITY_TYPE,
  REBALANCER_DEFAULT_POLICY,
  REBALANCER_MOVE_TYPE,
  MOVE_REASON,
} from '../../src/rebalancer/rebalancer-constants.js';
import {ReplicaStatus} from
  '../../src/rebalancer/replica-status.js';
import {META_SERVICE_ID} from
  '../../src/constants/wasm-meta.js';

function initEnv() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({});
  LoggingService.getInstance().initialize({level: 'error'});
}

function createMoveStateProvider(options = {}) {
  const {
    nodes = [],
    currentReplicas = [],
    inFlightOperations = [],
    pendingMoves = new Set(),
    pendingAddNodes = new Set(),
  } = options;
  return {
    getAvailableNodes: () => nodes,
    getCurrentReplicas: () => currentReplicas,
    getHealthyReplicas: (replicas) =>
      replicas.filter((r) => r.status === ReplicaStatus.ACTIVE),
    getInFlightOperations: () => inFlightOperations,
    hasPendingMove: (id) => pendingMoves.has(id),
    hasPendingAddForNode: (id) => pendingAddNodes.has(id),
  };
}

test('pgwire rebalance integration', async (t) => {
  t.beforeEach(initEnv);
  t.afterEach(() => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  });

  await t.test(
    'scale-out: plans ADD when under target',
    async (t) => {
      const nodes = [
        {node_id: 'n1', cpu_usage_percent: 10},
        {node_id: 'n2', cpu_usage_percent: 20},
        {node_id: 'n3', cpu_usage_percent: 30},
      ];
      const currentReplicas = [
        {
          service_id: META_SERVICE_ID.POSTGRES_WIRE,
          node_id: 'n1',
          status: ReplicaStatus.ACTIVE,
        },
      ];
      const planner = new MovePlanner({
        entityId: META_SERVICE_ID.POSTGRES_WIRE,
        entityType: REBALANCER_ENTITY_TYPE.RUNTIME_SERVICE,
        moveStateProvider: createMoveStateProvider({
          nodes,
          currentReplicas,
        }),
      });
      const policy = {
        ...REBALANCER_DEFAULT_POLICY.RUNTIME_SERVICE,
      };
      const target = await planner.calculateTargetState(
        currentReplicas, policy,
      );
      const moves = planner.calculateMoves(
        currentReplicas, target,
      );
      const adds = moves.filter(
        (m) => m.type === REBALANCER_MOVE_TYPE.ADD,
      );
      t.ok(adds.length > 0, 'at least one ADD planned');
      for (const add of adds) {
        t.ok(add.nodeId, 'ADD has target node');
        t.not(add.nodeId, 'n1', 'ADD targets different node');
      }
    },
  );

  await t.test(
    'failover: REMOVE planned for failed replica',
    async (t) => {
      const nodes = [
        {node_id: 'n1', cpu_usage_percent: 10},
        {node_id: 'n2', cpu_usage_percent: 20},
        {node_id: 'n3', cpu_usage_percent: 30},
      ];
      const currentReplicas = [
        {
          service_id: META_SERVICE_ID.POSTGRES_WIRE,
          node_id: 'n1',
          status: ReplicaStatus.ACTIVE,
        },
        {
          service_id: META_SERVICE_ID.POSTGRES_WIRE,
          node_id: 'n2',
          status: ReplicaStatus.FAILED,
        },
        {
          service_id: META_SERVICE_ID.POSTGRES_WIRE,
          node_id: 'n3',
          status: ReplicaStatus.ACTIVE,
        },
      ];
      const planner = new MovePlanner({
        entityId: META_SERVICE_ID.POSTGRES_WIRE,
        entityType: REBALANCER_ENTITY_TYPE.RUNTIME_SERVICE,
        moveStateProvider: createMoveStateProvider({
          nodes,
          currentReplicas,
        }),
      });
      const policy = {
        ...REBALANCER_DEFAULT_POLICY.RUNTIME_SERVICE,
      };
      const target = await planner.calculateTargetState(
        currentReplicas, policy,
      );
      const moves = planner.calculateMoves(
        currentReplicas, target,
      );
      const removes = moves.filter(
        (m) => m.type === REBALANCER_MOVE_TYPE.REMOVE &&
          m.reason === MOVE_REASON.REPLICA_FAILED,
      );
      t.ok(
        removes.length > 0,
        'REMOVE planned for failed replica',
      );
    },
  );

  await t.test(
    'rebalance: in-flight ops suppress new moves',
    async (t) => {
      const nodes = [
        {node_id: 'n1', cpu_usage_percent: 10},
        {node_id: 'n2', cpu_usage_percent: 20},
        {node_id: 'n3', cpu_usage_percent: 30},
      ];
      const currentReplicas = [
        {
          service_id: META_SERVICE_ID.POSTGRES_WIRE,
          node_id: 'n1',
          status: ReplicaStatus.ACTIVE,
        },
      ];
      const inFlightOperations = [
        {
          operation_id: 'op-1',
          entity_type: 'runtime_service',
          entity_id: META_SERVICE_ID.POSTGRES_WIRE,
          status: 'pending',
          target_node_id: 'n2',
        },
      ];
      const planner = new MovePlanner({
        entityId: META_SERVICE_ID.POSTGRES_WIRE,
        entityType: REBALANCER_ENTITY_TYPE.RUNTIME_SERVICE,
        moveStateProvider: createMoveStateProvider({
          nodes,
          currentReplicas,
          inFlightOperations,
        }),
      });
      const policy = {
        ...REBALANCER_DEFAULT_POLICY.RUNTIME_SERVICE,
      };
      const target = await planner.calculateTargetState(
        currentReplicas, policy,
      );
      const moves = planner.calculateMoves(
        currentReplicas, target,
      );
      t.equal(
        moves.length, 0,
        'no new moves when in-flight ops exist',
      );
    },
  );

  await t.test(
    'scale-down: REMOVE when over target',
    async (t) => {
      const nodes = [
        {node_id: 'n1', cpu_usage_percent: 10},
        {node_id: 'n2', cpu_usage_percent: 20},
        {node_id: 'n3', cpu_usage_percent: 30},
      ];
      const currentReplicas = [
        {
          service_id: META_SERVICE_ID.POSTGRES_WIRE,
          node_id: 'n1',
          status: ReplicaStatus.ACTIVE,
        },
        {
          service_id: META_SERVICE_ID.POSTGRES_WIRE,
          node_id: 'n2',
          status: ReplicaStatus.ACTIVE,
        },
        {
          service_id: META_SERVICE_ID.POSTGRES_WIRE,
          node_id: 'n3',
          status: ReplicaStatus.ACTIVE,
        },
        {
          service_id: META_SERVICE_ID.POSTGRES_WIRE,
          node_id: 'n1',
          status: ReplicaStatus.ACTIVE,
        },
      ];
      const planner = new MovePlanner({
        entityId: META_SERVICE_ID.POSTGRES_WIRE,
        entityType: REBALANCER_ENTITY_TYPE.RUNTIME_SERVICE,
        moveStateProvider: createMoveStateProvider({
          nodes,
          currentReplicas,
        }),
      });
      const policy = {
        ...REBALANCER_DEFAULT_POLICY.RUNTIME_SERVICE,
        targetReplicaCount: 3,
      };
      const target = await planner.calculateTargetState(
        currentReplicas, policy,
      );
      const moves = planner.calculateMoves(
        currentReplicas, target,
      );
      const removes = moves.filter(
        (m) => m.type === REBALANCER_MOVE_TYPE.REMOVE,
      );
      t.ok(
        removes.length > 0,
        'REMOVE planned when over target',
      );
    },
  );
});
