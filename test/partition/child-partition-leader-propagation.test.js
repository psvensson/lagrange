/**
 * Regression test: child partition leader election updates partitions row.
 *
 * Proves that when a child partition (simulating split output) elects a
 * Raft leader, the partitions system table row is updated with
 * leader_node_id via the canonical owner path:
 *   applyReplicaLeadership → queueLeaderNodeUpdate →
 *   leaderNodeMutationHelper.flush → cdcIntegrationService.updateSystemTableRow
 *
 * Uses AuthoritativeRowMutationHelper → cdcIntegrationService (the canonical
 * owner path per system guidelines §1.4.6).
 *
 * Feature: cdc-continuity-topology-transitions
 * Task 4.2
 * **Validates: Requirements 4.1, 4.2, 4.3, 4.4**
 */

import {test} from '../../src/test-helpers/tap.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {COLUMN, NUM, SERVICE_STATUS, SERVICE_TYPE, TABLES}
  from '../../src/constants/index.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {
  SYSTEM_TABLE_NAME,
  INITIAL_PARTITION_IDS,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
  PARTITION_SERVICE_EVENT,
} from '../../src/partition/partition-service-constants.js';

/**
 * Partition ID for the child partition under test.
 * Simulates a split-output child partition.
 */
const CHILD_PARTITION_ID = 'child-partition-leader-prop';
const CHILD_TABLE_ID = 'child-table-leader-prop';
const CHILD_TABLE_NAME = SYSTEM_TABLE_NAME.NODES;
const CHILD_REPLICA_ID = 'child-partition-leader-prop-r1';
const CHILD_NODE_ID = 'child-node-leader-prop';

/**
 * The partitions system table initial partition ID, used by
 * isSystemTableWriteReady to verify write readiness.
 */
const PARTITIONS_SYSTEM_PARTITION_ID =
  INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.PARTITIONS];

function initializeTestConfig() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize({node: {id: CHILD_NODE_ID}});
  const logger = LoggingService.getInstance();
  logger.initialize({level: 'error'});
}

/**
 * Build a mock systemTableCache that makes isSystemTableWriteReady
 * return true for the partitions table. The cache must contain:
 * - A partition record for the partitions system table partition
 * - A leader service record for that partition
 * Also supports get() for the child partition row (used by
 * readRowFromCache in the leaderNodeMutationHelper).
 */
function createMockSystemTableCache() {
  const partitionRecords = [
    {[COLUMN.PARTITION_ID]: PARTITIONS_SYSTEM_PARTITION_ID},
  ];
  const serviceRecords = [
    {
      [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
      [COLUMN.PARTITION_ID]: PARTITIONS_SYSTEM_PARTITION_ID,
      [COLUMN.RAFT_ROLE]: RAFT_ROLE.LEADER,
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      [COLUMN.ADDRESS]: 'mock-address',
    },
  ];
  const childPartitionRow = {
    [COLUMN.PARTITION_ID]: CHILD_PARTITION_ID,
    [COLUMN.LEADER_NODE_ID]: null,
    [COLUMN.UPDATED_AT]: null,
  };

  return {
    filter: (tableName, predicate) => {
      if (tableName === TABLES.PARTITIONS) {
        return partitionRecords.filter(predicate);
      }
      if (tableName === TABLES.SERVICES) {
        return serviceRecords.filter(predicate);
      }
      return [];
    },
    get: (tableName, key) => {
      if (tableName === TABLES.PARTITIONS &&
          key === CHILD_PARTITION_ID) {
        return childPartitionRow;
      }
      return null;
    },
    getAll: (tableName) => {
      if (tableName === TABLES.PARTITIONS) {
        return partitionRecords;
      }
      if (tableName === TABLES.SERVICES) {
        return serviceRecords;
      }
      return [];
    },
  };
}

/**
 * Create a mock cdcIntegrationService that captures updateSystemTableRow
 * calls. This is the canonical write path for system table mutations.
 * @return {{service: Object, calls: Array}} mock service and captured calls
 */
function createMockCdcIntegrationService() {
  const calls = [];
  const service = {
    updateSystemTableRow:
      async (tableName, whereClause, data, options) => {
        calls.push({tableName, whereClause, data, options});
        return {success: true, partitionResult: {affectedRows: NUM.ONE}};
      },
  };
  return {service, calls};
}

/**
 * Create a child PartitionService simulating a split-output partition.
 * Single-replica so it becomes leader immediately on initialize().
 * @param {Object} cdcIntegrationService - mock CDC integration service
 * @param {Object} systemTableCache - mock system table cache
 * @return {PartitionService} child partition service
 */
function createChildPartition(cdcIntegrationService, systemTableCache) {
  return new PartitionService({
    partitionId: CHILD_PARTITION_ID,
    tableId: CHILD_TABLE_ID,
    tableName: CHILD_TABLE_NAME,
    replicaId: CHILD_REPLICA_ID,
    replicaIds: [CHILD_REPLICA_ID],
    nodeId: CHILD_NODE_ID,
    dbPath: ':memory:',
    cdcIntegrationService,
    systemTableCache,
  });
}

test('setup child partition leader propagation tests', async (t) => {
  initializeTestConfig();
  t.pass('configuration initialized');
});

test('child partition leader election writes leader_node_id to ' +
  'partitions row via cdcIntegrationService (canonical owner path)',
async (t) => {
  const {service: cdcService, calls} =
    createMockCdcIntegrationService();
  const cache = createMockSystemTableCache();
  const partition = createChildPartition(cdcService, cache);

  try {
    await partition.initialize();

    // Single-replica partition becomes leader immediately during
    // initialize(). The leader election triggers:
    //   applyReplicaLeadership → queueLeaderNodeUpdate(nodeId) →
    //   leaderNodeMutationHelper.queue(nodeId) → flush() →
    //   cdcIntegrationService.updateSystemTableRow(...)
    // Allow the async flush to complete.
    await Promise.resolve();
    await Promise.resolve();

    t.ok(
      partition.isLeader,
      'child partition should be leader after single-replica init',
    );

    // Filter calls targeting the partitions table specifically.
    const partitionWrites = calls.filter(
      (call) => call.tableName === SYSTEM_TABLE_NAME.PARTITIONS,
    );

    t.ok(
      partitionWrites.length > NUM.ZERO,
      'leader election should write to partitions table via ' +
      'cdcIntegrationService.updateSystemTableRow',
    );

    const leaderWrite = partitionWrites[NUM.ZERO];
    t.equal(
      leaderWrite.tableName,
      SYSTEM_TABLE_NAME.PARTITIONS,
      'write should target the partitions system table',
    );
    t.equal(
      leaderWrite.whereClause[COLUMN.PARTITION_ID],
      CHILD_PARTITION_ID,
      'write should address the child partition by partition_id',
    );
    t.equal(
      leaderWrite.data[COLUMN.LEADER_NODE_ID],
      CHILD_NODE_ID,
      'write should set leader_node_id to the elected leader node',
    );
    t.ok(
      leaderWrite.data[COLUMN.UPDATED_AT],
      'write should include updated_at timestamp',
    );
  } finally {
    await partition.shutdown();
  }
});

test('leader_node_id update uses AuthoritativeRowMutationHelper ' +
  '(not a direct SQL write)',
async (t) => {
  const {service: cdcService, calls} =
    createMockCdcIntegrationService();
  const cache = createMockSystemTableCache();
  const partition = createChildPartition(cdcService, cache);

  try {
    await partition.initialize();
    await Promise.resolve();
    await Promise.resolve();

    // The leaderNodeMutationHelper is the canonical owner for
    // leader_node_id writes. Verify it was used by checking that
    // the helper's persistedValue matches the node ID.
    t.equal(
      partition.leaderNodeMutationHelper.persistedValue,
      CHILD_NODE_ID,
      'leaderNodeMutationHelper should track the persisted ' +
      'leader_node_id after successful flush',
    );
    t.equal(
      partition.leaderNodeMutationHelper.pendingValue,
      null,
      'leaderNodeMutationHelper should have no pending value ' +
      'after successful flush',
    );

    // Verify the write went through cdcIntegrationService (which
    // generates CDC events for propagation to all nodes).
    const partitionWrites = calls.filter(
      (call) => call.tableName === SYSTEM_TABLE_NAME.PARTITIONS,
    );
    t.ok(
      partitionWrites.length > NUM.ZERO,
      'write must go through cdcIntegrationService to generate ' +
      'CDC events for system cache propagation',
    );
  } finally {
    await partition.shutdown();
  }
});

test('child partition emits LEADER_ELECTED event on leader election',
  async (t) => {
    const {service: cdcService} = createMockCdcIntegrationService();
    const cache = createMockSystemTableCache();
    const partition = createChildPartition(cdcService, cache);

    const leaderEvents = [];
    partition.on(
      PARTITION_SERVICE_EVENT.LEADER_ELECTED,
      (data) => leaderEvents.push(data),
    );

    try {
      await partition.initialize();

      t.equal(
        leaderEvents.length, NUM.ONE,
        'child partition should emit exactly one LEADER_ELECTED event',
      );
      t.equal(
        leaderEvents[NUM.ZERO].partitionId,
        CHILD_PARTITION_ID,
        'LEADER_ELECTED event should include the child partition ID',
      );
      t.equal(
        leaderEvents[NUM.ZERO].leaderId,
        CHILD_REPLICA_ID,
        'LEADER_ELECTED event should identify the elected leader',
      );
    } finally {
      await partition.shutdown();
    }
  });

test('leader_node_id write is not issued without cdcIntegrationService',
  async (t) => {
    const cache = createMockSystemTableCache();
    // Create partition without cdcIntegrationService — the helper
    // should queue the value but not attempt a write.
    const partition = new PartitionService({
      partitionId: CHILD_PARTITION_ID,
      tableId: CHILD_TABLE_ID,
      tableName: CHILD_TABLE_NAME,
      replicaId: CHILD_REPLICA_ID,
      replicaIds: [CHILD_REPLICA_ID],
      nodeId: CHILD_NODE_ID,
      dbPath: ':memory:',
      systemTableCache: cache,
    });

    try {
      await partition.initialize();
      await Promise.resolve();
      await Promise.resolve();

      t.ok(
        partition.isLeader,
        'partition should still become leader without cdcIntegrationService',
      );
      // Without cdcIntegrationService, the helper queues but cannot flush.
      // pendingValue should remain set (no write occurred).
      t.equal(
        partition.leaderNodeMutationHelper.persistedValue,
        null,
        'no write should be persisted without cdcIntegrationService',
      );
    } finally {
      await partition.shutdown();
    }
  });

test('cleanup child partition leader propagation tests', async (t) => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  t.pass('cleanup complete');
});
