/**
 * Bug Condition Exploration — System Partition Start Delay (Bug F)
 *
 * These tests encode the EXPECTED behavior after the fix. The default
 * systemPartitionStartDelayMs is 0ms, removing the entity-type lock so
 * system partitions rely on the existing stabilization and readiness
 * gates instead of a second timer.
 *
 * Bug F: systemPartitionStartDelayMs defaulted to 600000ms (10 minutes),
 * blocking ALL system partition rebalancing for 10 minutes after
 * UnifiedRebalancer construction — even after rolling restarts when
 * redistribution is urgently needed.
 */

import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {
  UnifiedRebalancer,
  EntityType,
} from '../../src/rebalancer/unified-rebalancer.js';
import {SYSTEM_TABLE_NAME} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {ConfigurationManager} from
  '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  REBALANCER_DEFAULT,
} from '../../src/rebalancer/rebalancer-constants.js';

const SYSTEM_PARTITION_SUFFIX = '-p1';
const SYSTEM_PARTITION_IDS = Object.values(SYSTEM_TABLE_NAME)
  .map((name) => `${name}${SYSTEM_PARTITION_SUFFIX}`);
const EXPECTED_DEFAULT_DELAY_MS = 0;
const START_JITTER_MS =
  REBALANCER_DEFAULT.UNIFIED.PERIODIC_CHECK_JITTER_MS;
const MAX_EFFECTIVE_DELAY_MS = EXPECTED_DEFAULT_DELAY_MS + START_JITTER_MS;
const MAX_ELAPSED_MS = 600000;
const ZERO = 0;

function initializeTestEnvironment() {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize({
      node: {id: 'test-node'},
      logging: {level: 'error'},
    });
  }
  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize({level: 'error'});
  }
}

function createMockCache(nodes = []) {
  const now = Date.now();
  const normalizedNodes = nodes.map((node) => ({
    connection_state: 'ready',
    ready_lease_expires_at: now + 10000,
    ...node,
  }));
  const cache = {
    nodes: new Map(
      normalizedNodes.map((node) => [node.node_id, node]),
    ),
    services: new Map(),
    partitions: new Map(),
    tables: new Map(),
    message_groups: new Map(),
    replica_operations: new Map(),
  };
  return {
    get: (tableName, key) => cache[tableName]?.get(key),
    filter: (tableName, predicate) => {
      const table = cache[tableName];
      if (!table) return [];
      return Array.from(table.values()).filter(predicate);
    },
    getAll: (tableName) => {
      const table = cache[tableName];
      if (!table) return [];
      return Array.from(table.values());
    },
  };
}

function createMockReadinessService(mockCache) {
  return {
    getNodeReadinessSync: (nodeId) => {
      const nodeRow = mockCache.get('nodes', nodeId);
      const now = Date.now();
      const leaseExpiry = Number(
        nodeRow?.ready_lease_expires_at,
      );
      const leaseValid =
        Number.isFinite(leaseExpiry) && leaseExpiry > now;
      const isActive = nodeRow?.status === 'active';
      const healthy = isActive && leaseValid;
      return {
        nodeId,
        dimensions: {
          [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]:
            healthy,
        },
      };
    },
  };
}

function createSystemPartitionRebalancer(entityId) {
  const mockCache = createMockCache([
    {node_id: 'node-1', status: 'active'},
  ]);
  const mockReadiness = createMockReadinessService(mockCache);
  return new UnifiedRebalancer({
    entityId,
    entityType: EntityType.PARTITION,
    nodeId: 'node-1',
    systemTableCache: mockCache,
    cdcIntegrationService: {
      insertSystemTableRow: async () => ({success: true}),
      updateSystemTableRow: async () => ({success: true}),
    },
    tablePolicyService: {
      getPolicyForPartition: () => ({}),
      getMessageGroupPolicy: async () => ({}),
    },
    messageRouter: {
      getConnectionState: () => 'connected',
      deliver: async () => ({acknowledged: true}),
      pingNode: async () => true,
      isOutboundQueueAvailable: () => true,
    },
    rebalanceCoordinator: {
      getMoveSafetyError: () => null,
      createOperation: async () => ({operationId: 'op-1'}),
      executeOperation: async () => ({success: true}),
      canStartAddOperation: async () => true,
      canStartRemoveOperation: async () => true,
      getStats: () => ({
        operationsCreated: ZERO,
        operationsCompleted: ZERO,
      }),
      storageAccountingService: {estimateReplicaBytes: () => 1},
      storageAdmissionService: {
        checkAdd: async () => ({decision: 'allow'}),
      },
    },
    sqlQueryEngine: {
      async executeQuery() {
        return {success: true, rows: []};
      },
    },
    controlPlaneReadinessService: mockReadiness,
  });
}

test('Bug F — system partition default start delay is zero',
  async (t) => {
    initializeTestEnvironment();

    await t.test(
      'getRebalanceStartDelayMs returns 0 for system ' +
      'partitions with default config',
      async (t) => {
        const rebalancer = createSystemPartitionRebalancer(
          'nodes-p1',
        );
        const delay = rebalancer.getRebalanceStartDelayMs();
        t.equal(
          delay,
          EXPECTED_DEFAULT_DELAY_MS,
          'system partition start delay should default to ' +
          '0, not 600000',
        );
      },
    );

    await t.test(
      'getTimeUntilRebalanceStartEligible returns positive ' +
      'value immediately after construction',
      async (t) => {
        const rebalancer = createSystemPartitionRebalancer(
          'services-p1',
        );
        const remaining =
          rebalancer.getTimeUntilRebalanceStartEligible();
        t.ok(
          remaining === ZERO &&
            remaining <= MAX_EFFECTIVE_DELAY_MS,
          'system partition should be eligible immediately',
        );
      },
    );

    await t.test(
      'getTimeUntilRebalanceStartEligible returns 0 after ' +
      'construction with zero default delay',
      async (t) => {
        const rebalancer = createSystemPartitionRebalancer(
          'services-p1',
        );
        const remaining =
          rebalancer.getTimeUntilRebalanceStartEligible();
        t.equal(
          remaining,
          ZERO,
          'system partition should be eligible immediately',
        );
      },
    );

    await t.test(
      'property: all system partition IDs have zero start ' +
      'delay with default config',
      async (t) => {
        const systemPartitionIdArb = fc.constantFrom(
          ...SYSTEM_PARTITION_IDS,
        );

        fc.assert(
          fc.property(
            systemPartitionIdArb,
            (entityId) => {
              const rebalancer =
                createSystemPartitionRebalancer(entityId);
              const delay =
                rebalancer.getRebalanceStartDelayMs();
              return delay === EXPECTED_DEFAULT_DELAY_MS;
            },
          ),
          {numRuns: 10},
        );
        t.pass(
          'all system partition IDs return 0 start delay',
        );
      },
    );

    await t.test(
      'property: system partitions are eligible immediately ' +
      'at any timestamp within former 10-minute window',
      async (t) => {
        const elapsedArb = fc.integer({
          min: ZERO,
          max: MAX_ELAPSED_MS,
        });

        fc.assert(
          fc.property(
            elapsedArb,
            (elapsedMs) => {
              const rebalancer =
                createSystemPartitionRebalancer('nodes-p1');
              const checkTime =
                rebalancer.rebalanceStartAtMs + elapsedMs;
              const remaining =
                rebalancer.getTimeUntilRebalanceStartEligible(
                  checkTime,
                );
              return remaining === ZERO;
            },
          ),
          {numRuns: 10},
        );
        t.pass(
          'system partitions eligible at all timestamps ' +
          'after 30s within former 10-minute window',
        );
      },
    );
  },
);
