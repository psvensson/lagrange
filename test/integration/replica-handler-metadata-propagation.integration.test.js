/**
 * Integration test: ReplicaHandler metadata propagation handling.
 *
 * Reproduces delayed cache visibility for table/partition metadata and verifies
 * replica creation waits for metadata propagation instead of failing immediately.
 */

import {test} from '../../src/test-helpers/tap.js';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {ReplicaHandler} from '../../src/node/replica-handler.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {SystemTableName} from '../../src/bootstrap/system-table-schemas-constants.js';
import {ReplicaOperationResponseStatus} from
  '../../src/rebalancer/replica-operation-constants.js';
import {
  cleanupTestEnvironment,
  initializeTestEnvironment,
} from './helpers/cluster-test-helpers.js';

function createMockCDCService(cache) {
  const operations = [];

  return {
    operations,
    async insertSystemTableRow(tableName, data) {
      operations.push({type: 'insert', tableName, data});
      cache?.applySystemTableChange(tableName, 'INSERT', data);
      return {success: true};
    },
    async updateSystemTableRow(tableName, whereClause, data) {
      const merged = {...whereClause, ...data};
      operations.push({type: 'update', tableName, whereClause, data: merged});
      cache?.applySystemTableChange(tableName, 'UPDATE', merged);
      return {success: true};
    },
    async upsertSystemTableRow(tableName, data) {
      operations.push({type: 'upsert', tableName, data});
      cache?.applySystemTableChange(tableName, 'INSERT', data);
      return {success: true};
    },
  };
}

function seedReplicaOperation(cache, operationId, partitionId, replicaId, targetNodeId) {
  const now = Date.now();
  cache.applySystemTableChange(SystemTableName.REPLICA_OPERATIONS, 'INSERT', {
    operation_id: operationId,
    type: 'ADD',
    partition_id: partitionId,
    replica_id: replicaId,
    source_node_id: targetNodeId,
    target_node_id: targetNodeId,
    status: ReplicaStatus.PENDING,
    workflow_step: 'PENDING',
    created_at: now,
    updated_at: now,
    steps_history: '[]',
  });
}

function seedTablePartitionMetadata(cache, tableId, tableName, partitionId) {
  cache.applySystemTableChange(SystemTableName.TABLES, 'INSERT', {
    table_id: tableId,
    table_name: tableName,
    schema_definition: JSON.stringify({
      columns: [{name: 'id', type: 'TEXT', primaryKey: true}],
    }),
  });
  cache.applySystemTableChange(SystemTableName.PARTITIONS, 'INSERT', {
    partition_id: partitionId,
    table_id: tableId,
    partition_key_start: null,
    partition_key_end: null,
    leader_node_id: null,
  });
}

function waitForReplicaEvent(handler, successEvent, failureEvent) {
  return new Promise((resolve, reject) => {
    handler.once(successEvent, resolve);
    handler.once(failureEvent, (event) => {
      reject(new Error(event?.error || 'operation failed'));
    });
  });
}

test('ReplicaHandler metadata propagation integration', {timeout: 30000}, async (t) => {
  let tempDir = null;

  t.beforeEach(() => {
    initializeTestEnvironment({
      nodeId: 'integration-node',
      replicaHandler: {
        syncTimeoutMs: 2000,
      },
    });
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'replica-metadata-int-'));
  });

  t.afterEach(async () => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, {recursive: true, force: true});
    }
    await cleanupTestEnvironment();
  });

  await t.test('CREATE_REPLICA waits for delayed metadata propagation', async (t) => {
    const nodeId = 'integration-node';
    const tableId = 'table-1';
    const tableName = 'test_table';
    const partitionId = 'partition-1';
    const replicaId = 'partition-1-r1';
    const operationId = 'op-1';
    const cache = new SystemTableCache();
    const cdcIntegrationService = createMockCDCService(cache);

    seedReplicaOperation(cache, operationId, partitionId, replicaId, nodeId);

    const handler = new ReplicaHandler({
      nodeId,
      systemTableCache: cache,
      cdcIntegrationService,
      dataDir: tempDir,
      createPartitionService: async (options) => {
        const service = new PartitionService({
          partitionId: options.partitionId,
          tableId: options.tableId,
          tableName: options.tableName,
          schema: options.schema,
          keyRange: options.keyRange,
          replicaId: options.replicaId,
          replicaIds: options.replicaIds,
          nodeId: options.nodeId,
          dbPath: options.dbPath,
          suppressLifecycleLogs: true,
          onInitializationStage: options.onInitializationStage,
        });
        await service.initialize();
        return service;
      },
    });
    handler.initialize();

    const created = waitForReplicaEvent(
      handler,
      'replicaCreated',
      'replicaCreationFailed',
    );

    const delayedMetadataSeedTimer = setTimeout(() => {
      seedTablePartitionMetadata(cache, tableId, tableName, partitionId);
    }, 75);
    t.teardown(() => clearTimeout(delayedMetadataSeedTimer));

    const response = await handler.handleCreateReplica({
      operationId,
      partitionId,
      replicaId,
    });
    t.equal(response.status, ReplicaOperationResponseStatus.INITIATED,
      'create request should return INITIATED');

    await created;

    const failedOperationUpdates = cdcIntegrationService.operations.filter((operation) =>
      operation.type === 'update' &&
      operation.tableName === SystemTableName.REPLICA_OPERATIONS &&
      operation.data?.workflow_step === 'FAILED',
    );
    t.equal(failedOperationUpdates.length, 0,
      'operation should not transition to FAILED during metadata propagation');

    const serviceRow = cache.get(SystemTableName.SERVICES, replicaId);
    t.equal(serviceRow?.status, ReplicaStatus.ACTIVE,
      'replica should become ACTIVE after metadata appears in cache');

    for (const service of handler.localServices.values()) {
      if (service && typeof service.shutdown === 'function') {
        await service.shutdown();
      }
    }
    handler.shutdown();
  });
});
