// Shared fixture of the ReplicaHandler owner-path bypass regressions
// (replica-handler-owner-path-bypass*.test.js): seeded metadata, the CDC and
// partition-service doubles, envelopes, event waits and the per-subtest
// singleton lifecycle.
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {SYSTEM_TABLE_NAME} from '../../src/bootstrap/system-table-schemas-constants.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  createCanonicalLifecycleServiceRow,
  createLifecycleCdcServiceForCache,
} from
  '../test-helpers/lifecycle-state-store.js';
import {withRemovalServingSurface} from '../test-helpers/partition-removal-serving-surface.js';
import {bindRegisteredReplicaHandler} from '../test-helpers/replica-handler-identity-fixture.js';

const TEST_NODE_ID = 'test-node';
const TEST_PARTITION_ID = 'partition-1';
const TEST_TABLE_ID = 'table-1';
const TEST_TABLE_NAME = 'test_table';
const TEST_REPLICA_ID = 'replica-1';
const TEST_LEADER_NODE_ID = 'leader-node';
const TEST_LEADER_REPLICA_ID = 'leader-replica';
const TEST_OPERATION_ID = 'op-bypass-1';
const TEST_REMOVE_OPERATION_ID = 'op-remove-bypass-1';
const TEST_CORRELATION_ID = 'corr-bypass-1';
const TEST_SCHEMA = {
  columns: [{name: 'id', type: 'TEXT', primaryKey: true}],
};

/**
 * Create a seeded SystemTableCache with table, partition, and leader
 * service metadata sufficient for ReplicaHandler context resolution.
 * @return {SystemTableCache} Seeded cache.
 */
function createSeededCache({
  tableId = TEST_TABLE_ID,
  tableName = TEST_TABLE_NAME,
  partitionId = TEST_PARTITION_ID,
  leaderReplicaId = TEST_LEADER_REPLICA_ID,
} = {}) {
  const cache = new SystemTableCache();

  cache.applySystemTableChange(SYSTEM_TABLE_NAME.TABLES, 'INSERT', {
    table_id: tableId,
    table_name: tableName,
    schema_definition: JSON.stringify(TEST_SCHEMA),
  });

  cache.applySystemTableChange(SYSTEM_TABLE_NAME.PARTITIONS, 'INSERT', {
    partition_id: partitionId,
    table_id: tableId,
    partition_key_start: null,
    partition_key_end: null,
    leader_node_id: TEST_LEADER_NODE_ID,
  });

  cache.applySystemTableChange(SYSTEM_TABLE_NAME.SERVICES, 'INSERT',
    createCanonicalLifecycleServiceRow({
      service_id: leaderReplicaId,
      service_type: 'partition',
      partition_id: partitionId,
      node_id: TEST_LEADER_NODE_ID,
      raft_role: 'leader',
      status: ReplicaStatus.ACTIVE,
      address:
        `${TEST_LEADER_NODE_ID}/partition/${leaderReplicaId}`,
      created_at: Date.now(),
      updated_at: Date.now(),
    }));

  return cache;
}

/**
 * Create a mock CDC integration service that tracks all operations.
 * @param {SystemTableCache} cache - Cache to update on writes.
 * @return {Object} Mock CDC service with operation log.
 */
function createMockCDCService(cache) {
  return createLifecycleCdcServiceForCache(cache);
}

// A partition-service double factory (the production removal-serving surface).
function createMockPartitionServiceFactory() {
  return async (options) => bindRegisteredReplicaHandler(withRemovalServingSurface({
    partitionId: options.partitionId,
    replicaId: options.replicaId,
    initialized: true,
    async shutdown() {},
    async syncFromLeader() {},
    async requestReplicaAdmission(operationId) {
      return {operationId, state: 'admitted', lastOutcome: 'proposed'};
    },
  }), options);
}

/**
 * Build a properly formatted envelope for handleMessage.
 * @param {string} type - Message type constant.
 * @param {Object} payload - Message payload fields.
 * @return {Object} Envelope with correlationId and payload.
 */
function buildEnvelope(type, payload) {
  return {
    correlationId: TEST_CORRELATION_ID,
    payload: {type, ...payload},
  };
}

/**
 * Wait for a replica event or failure.
 * @param {ReplicaHandler} handler - Handler instance.
 * @param {string} successEvent - Success event name.
 * @param {string} failureEvent - Failure event name.
 * @return {Promise<Object>} Event payload.
 */
function waitForReplicaEvent(handler, successEvent, failureEvent) {
  return new Promise((resolve, reject) => {
    handler.once(successEvent, resolve);
    handler.once(failureEvent, (event) => {
      reject(new Error(event?.error || 'operation failed'));
    });
  });
}

// Each subtest starts from fresh configuration and logging singletons.
function registerOwnerPathTestLifecycle(t) {
  t.beforeEach(() => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
    ConfigurationManager.getInstance().initialize({});
    LoggingService.getInstance().initialize({level: 'error'});
  });
  t.afterEach(() => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  });
}

export {
  TEST_NODE_ID,
  TEST_PARTITION_ID,
  TEST_REPLICA_ID,
  TEST_OPERATION_ID,
  TEST_REMOVE_OPERATION_ID,
  createSeededCache,
  createMockCDCService,
  createMockPartitionServiceFactory,
  buildEnvelope,
  waitForReplicaEvent,
  registerOwnerPathTestLifecycle,
};
