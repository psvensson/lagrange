/**
 * Preservation Property Tests — System Partition Start Delay (Bug F)
 *
 * These tests capture existing behavior that MUST be preserved after
 * the fix. They MUST PASS on both unfixed and fixed code.
 *
 * Preserved behaviors:
 * - User partition start delay remains 0
 * - isCriticalSystemPartition() still identifies system partitions
 * - Explicit non-zero systemPartitionStartDelayMs config is honored
 * - isSystemPartitionEntity() classification is unchanged
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

const SYSTEM_PARTITION_SUFFIX = '-p1';
const SYSTEM_PARTITION_IDS = Object.values(SYSTEM_TABLE_NAME)
  .map((name) => `${name}${SYSTEM_PARTITION_SUFFIX}`);
const SYSTEM_PARTITION_ID_SET = new Set(SYSTEM_PARTITION_IDS);
const USER_PARTITION_DELAY_MS = 0;
const EXPLICIT_DELAY_MIN = 1000;
const EXPLICIT_DELAY_MAX = 900000;
const ZERO = 0;

function initializeTestEnvironment(overrides = {}) {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize({
      node: {id: 'test-node'},
      logging: {level: 'error'},
      rebalancer: overrides.rebalancer || {},
    });
  }
  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize({level: 'error'});
  }
}

function createMockCache() {
  const now = Date.now();
  const cache = {
    nodes: new Map([
      ['node-1', {
        node_id: 'node-1',
        status: 'active',
        connection_state: 'ready',
        ready_lease_expires_at: now + 10000,
      }],
    ]),
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

function createMockReadinessService() {
  return {
    getNodeReadinessSync: (nodeId) => ({
      nodeId,
      dimensions: {
        [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: true,
      },
    }),
  };
}

function createRebalancer(entityId, entityType = EntityType.PARTITION) {
  const mockCache = createMockCache();
  return new UnifiedRebalancer({
    entityId,
    entityType,
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
    controlPlaneReadinessService: createMockReadinessService(),
  });
}

test('Preservation — user partition timing unchanged',
  async (t) => {
    initializeTestEnvironment();

    await t.test(
      'property: user partition IDs always have zero start delay',
      async (t) => {
        const userPartitionIdArb = fc.string({
          minLength: 1,
          maxLength: 20,
        }).filter((id) => !SYSTEM_PARTITION_ID_SET.has(id));

        fc.assert(
          fc.property(
            userPartitionIdArb,
            (entityId) => {
              const rebalancer = createRebalancer(entityId);
              return rebalancer.getRebalanceStartDelayMs() ===
                USER_PARTITION_DELAY_MS;
            },
          ),
          {numRuns: 10},
        );
        t.pass(
          'user partitions always return 0 start delay',
        );
      },
    );
  },
);

test('Preservation — critical system partition classification',
  async (t) => {
    initializeTestEnvironment();

    await t.test(
      'property: all system partition IDs are classified as ' +
      'critical system partitions',
      async (t) => {
        const systemPartitionIdArb = fc.constantFrom(
          ...SYSTEM_PARTITION_IDS,
        );

        fc.assert(
          fc.property(
            systemPartitionIdArb,
            (entityId) => {
              const rebalancer = createRebalancer(entityId);
              return rebalancer.isCriticalSystemPartition() ===
                true;
            },
          ),
          {numRuns: 10},
        );
        t.pass(
          'all system partition IDs classified as critical',
        );
      },
    );

    await t.test(
      'property: isSystemPartitionEntity returns true for ' +
      'system partition IDs and false for others',
      async (t) => {
        const systemIdArb = fc.constantFrom(
          ...SYSTEM_PARTITION_IDS,
        );
        const nonSystemIdArb = fc.string({
          minLength: 1,
          maxLength: 20,
        }).filter((id) => !SYSTEM_PARTITION_ID_SET.has(id));

        fc.assert(
          fc.property(
            systemIdArb,
            (entityId) => {
              const rebalancer = createRebalancer(entityId);
              return rebalancer.isSystemPartitionEntity() === true;
            },
          ),
          {numRuns: 10},
        );

        fc.assert(
          fc.property(
            nonSystemIdArb,
            (entityId) => {
              const rebalancer = createRebalancer(entityId);
              return rebalancer.isSystemPartitionEntity() === false;
            },
          ),
          {numRuns: 10},
        );
        t.pass(
          'isSystemPartitionEntity classification correct',
        );
      },
    );
  },
);

test('Preservation — explicit non-zero config honored',
  async (t) => {
    await t.test(
      'property: explicit systemPartitionStartDelayMs config ' +
      'is used as start delay',
      async (t) => {
        const delayArb = fc.integer({
          min: EXPLICIT_DELAY_MIN,
          max: EXPLICIT_DELAY_MAX,
        });

        fc.assert(
          fc.property(
            delayArb,
            (delayMs) => {
              initializeTestEnvironment({
                rebalancer: {
                  systemPartitionStartDelayMs: delayMs,
                },
              });
              const rebalancer = createRebalancer('nodes-p1');
              const actual =
                rebalancer.getRebalanceStartDelayMs();
              return actual === delayMs;
            },
          ),
          {numRuns: 10},
        );
        t.pass(
          'explicit config values are honored for system ' +
          'partition start delay',
        );
      },
    );
  },
);
