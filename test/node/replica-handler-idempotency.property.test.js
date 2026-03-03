/**
 * Property-based tests for ReplicaHandler idempotency using cache state.
 * Feature: guideline-violations-cleanup
 * Property 1: ReplicaHandler idempotency uses cache state
 * Validates: Requirements 2.2, 2.3
 */

import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {ReplicaHandler} from '../../src/node/replica-handler.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {SYSTEM_TABLE_NAME} from '../../src/bootstrap/system-table-schemas-constants.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  ReplicaOperationMessageType,
  ReplicaOperationResponseStatus,
} from '../../src/rebalancer/replica-operation-constants.js';

/**
 * Create a mock CDC integration service.
 * @param {SystemTableCache} [cache] - Optional cache to update.
 * @return {Object} Mock CDC service.
 */
function createMockCDCService(cache) {
  return {
    async insertSystemTableRow(tableName, data) {
      cache?.applySystemTableChange(tableName, 'INSERT', data);
      return {success: true, operation: 'INSERT', tableName, data};
    },
    async updateSystemTableRow(tableName, whereClause, data) {
      const merged = {...whereClause, ...data};
      cache?.applySystemTableChange(tableName, 'UPDATE', merged);
      return {success: true, operation: 'UPDATE', tableName, whereClause, data: merged};
    },
    async upsertSystemTableRow(tableName, data) {
      cache?.applySystemTableChange(tableName, 'INSERT', data);
      return {success: true, operation: 'UPSERT', tableName, data};
    },
    async deleteSystemTableRow(tableName, whereClause) {
      cache?.applySystemTableChange(tableName, 'DELETE', whereClause);
      return {success: true, operation: 'DELETE', tableName, whereClause};
    },
  };
}

/**
 * Create a mock partition service factory.
 * @return {Function} Factory function.
 */
function createMockPartitionServiceFactory() {
  return async (options) => {
    return {
      partitionId: options.partitionId,
      replicaId: options.replicaId,
      initialized: true,
      async shutdown() {},
      async syncFromLeader() {},
    };
  };
}

/**
 * Seed a system table cache with minimal required data.
 * @param {Object} options - Seed options.
 * @return {SystemTableCache} Seeded cache.
 */
function createSeededCache(options = {}) {
  const cache = new SystemTableCache();
  const tableId = options.tableId || 'table-1';
  const tableName = options.tableName || 'test_table';
  const partitionId = options.partitionId || 'partition-1';
  const leaderNodeId = options.leaderNodeId || 'leader-node';
  const leaderReplicaId = options.leaderReplicaId || 'leader-replica';
  const schema = options.schema || {
    columns: [{name: 'id', type: 'TEXT', primaryKey: true}],
  };

  cache.applySystemTableChange(SYSTEM_TABLE_NAME.TABLES, 'INSERT', {
    table_id: tableId,
    table_name: tableName,
    schema_definition: JSON.stringify(schema),
  });

  cache.applySystemTableChange(SYSTEM_TABLE_NAME.PARTITIONS, 'INSERT', {
    partition_id: partitionId,
    table_id: tableId,
    partition_key_start: null,
    partition_key_end: null,
    leader_node_id: leaderNodeId,
  });

  cache.applySystemTableChange(SYSTEM_TABLE_NAME.SERVICES, 'INSERT', {
    service_id: leaderReplicaId,
    service_type: 'partition',
    partition_id: partitionId,
    node_id: leaderNodeId,
    raft_role: 'leader',
    status: ReplicaStatus.ACTIVE,
    address: `${leaderNodeId}/partition/${leaderReplicaId}`,
    created_at: Date.now(),
    updated_at: Date.now(),
  });

  return cache;
}

test('ReplicaHandler idempotency property tests', async (t) => {
  let tempDir;

  t.beforeEach(() => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();

    const config = ConfigurationManager.getInstance();
    config.initialize({});

    const logging = LoggingService.getInstance();
    logging.initialize({level: 'error'});

    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'replica-handler-prop-test-'));
  });

  t.afterEach(() => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();

    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, {recursive: true, force: true});
    }
  });

  t.test('Property 1: ReplicaHandler idempotency uses cache state', async (t) => {
    /**
     * **Validates: Requirements 2.2, 2.3**
     *
     * For any replica ID and any status value in the services table of the
     * System_Table_Cache, when a CREATE_REPLICA request arrives for that replica,
     * the ReplicaHandler's idempotency response should reflect the status from
     * the cache.
     *
     * - ACTIVE status → ALREADY_EXISTS response
     * - CREATING/SYNCING status → IN_PROGRESS response
     * - No cache entry → INITIATED response (new replica)
     */

    const replicaIdArb = fc.string({minLength: 1, maxLength: 20});
    const statusArb = fc.constantFrom(
      ReplicaStatus.ACTIVE,
      ReplicaStatus.CREATING,
      ReplicaStatus.SYNCING,
      ReplicaStatus.REMOVING,
      ReplicaStatus.REMOVED,
      ReplicaStatus.FAILED,
    );

    await fc.assert(
      fc.asyncProperty(replicaIdArb, statusArb, async (replicaId, status) => {
        const cache = createSeededCache();
        const mockCDC = createMockCDCService(cache);
        const nodeId = 'test-node';

        // Seed the cache with a replica in the given status
        cache.applySystemTableChange(SYSTEM_TABLE_NAME.SERVICES, 'INSERT', {
          service_id: replicaId,
          service_type: 'partition',
          partition_id: 'partition-1',
          node_id: nodeId,
          raft_role: 'follower',
          status: status,
          address: `${nodeId}/partition/${replicaId}`,
          created_at: Date.now(),
          updated_at: Date.now(),
        });

        const handler = new ReplicaHandler({
          nodeId: nodeId,
          dataDir: tempDir,
          systemTableCache: cache,
          cdcIntegrationService: mockCDC,
          createPartitionService: createMockPartitionServiceFactory(),
        });

        handler.initialize();

        const request = {
          operationId: `op-${replicaId}`,
          partitionId: 'partition-1',
          replicaId: replicaId,
        };

        const response = await handler.handleCreateReplica(request);

        // Verify idempotency response matches cache state
        if (status === ReplicaStatus.ACTIVE) {
          t.equal(
            response.status,
            ReplicaOperationResponseStatus.ALREADY_EXISTS,
            `ACTIVE replica should return ALREADY_EXISTS (replicaId: ${replicaId})`,
          );
        } else if (status === ReplicaStatus.CREATING || status === ReplicaStatus.SYNCING) {
          t.equal(
            response.status,
            ReplicaOperationResponseStatus.IN_PROGRESS,
            `${status} replica should return IN_PROGRESS (replicaId: ${replicaId})`,
          );
        } else {
          // For REMOVING, REMOVED, FAILED - the handler should initiate a new creation
          // (these are terminal or error states, not in-progress creation states)
          t.ok(
            response.status === ReplicaOperationResponseStatus.INITIATED ||
            response.status === ReplicaOperationResponseStatus.IN_PROGRESS,
            `${status} replica should allow re-creation (replicaId: ${replicaId})`,
          );
        }

        handler.shutdown();
      }),
      {numRuns: 10},
    );
  });

  t.test('Property 1 variant: No cache entry initiates new replica', async (t) => {
    /**
     * **Validates: Requirements 2.2, 2.3**
     *
     * When a replica does not exist in the cache, CREATE_REPLICA should
     * initiate a new replica creation.
     */

    const replicaIdArb = fc.string({minLength: 1, maxLength: 20});

    await fc.assert(
      fc.asyncProperty(replicaIdArb, async (replicaId) => {
        const cache = createSeededCache();
        const mockCDC = createMockCDCService(cache);
        const nodeId = 'test-node';

        // Do NOT seed the replica in the cache - it doesn't exist

        const handler = new ReplicaHandler({
          nodeId: nodeId,
          dataDir: tempDir,
          systemTableCache: cache,
          cdcIntegrationService: mockCDC,
          createPartitionService: createMockPartitionServiceFactory(),
        });

        handler.initialize();

        const request = {
          operationId: `op-${replicaId}`,
          partitionId: 'partition-1',
          replicaId: replicaId,
        };

        const response = await handler.handleCreateReplica(request);

        // Should initiate new replica creation
        t.equal(
          response.status,
          ReplicaOperationResponseStatus.INITIATED,
          `Non-existent replica should return INITIATED (replicaId: ${replicaId})`,
        );

        handler.shutdown();
      }),
      {numRuns: 10},
    );
  });

  t.test('Property 1 variant: Cache state overrides for different nodes', async (t) => {
    /**
     * **Validates: Requirements 2.2, 2.3**
     *
     * When a replica exists in the cache but belongs to a different node,
     * the handler should treat it as non-existent for this node.
     */

    const replicaIdArb = fc.string({minLength: 1, maxLength: 20});
    const statusArb = fc.constantFrom(
      ReplicaStatus.ACTIVE,
      ReplicaStatus.CREATING,
      ReplicaStatus.SYNCING,
    );

    await fc.assert(
      fc.asyncProperty(replicaIdArb, statusArb, async (replicaId, status) => {
        const cache = createSeededCache();
        const mockCDC = createMockCDCService(cache);
        const nodeId = 'test-node';
        const otherNodeId = 'other-node';

        // Seed the cache with a replica on a DIFFERENT node
        cache.applySystemTableChange(SYSTEM_TABLE_NAME.SERVICES, 'INSERT', {
          service_id: replicaId,
          service_type: 'partition',
          partition_id: 'partition-1',
          node_id: otherNodeId, // Different node!
          raft_role: 'follower',
          status: status,
          address: `${otherNodeId}/partition/${replicaId}`,
          created_at: Date.now(),
          updated_at: Date.now(),
        });

        const handler = new ReplicaHandler({
          nodeId: nodeId,
          dataDir: tempDir,
          systemTableCache: cache,
          cdcIntegrationService: mockCDC,
          createPartitionService: createMockPartitionServiceFactory(),
        });

        handler.initialize();

        const request = {
          operationId: `op-${replicaId}`,
          partitionId: 'partition-1',
          replicaId: replicaId,
        };

        const response = await handler.handleCreateReplica(request);

        // Should initiate new replica since it doesn't exist on THIS node
        t.equal(
          response.status,
          ReplicaOperationResponseStatus.INITIATED,
          `Replica on different node should return INITIATED (replicaId: ${replicaId})`,
        );

        handler.shutdown();
      }),
      {numRuns: 10},
    );
  });
});
