/**
 * Tests for CDCIntegrationService.
 * Requirements: 5.6, 5.7, 5.8, 5.9, 5.10
 */

import {test, beforeEach, afterEach} from 'tap';
import {
  CDCIntegrationService,
  CDCOperationType,
  VALID_SYSTEM_TABLES,
} from '../../src/cdc/cdc-integration-service.js';
import {SystemTableName} from '../../src/bootstrap/system-table-schemas.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

// Initialize configuration and logging for tests
beforeEach(() => {
  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize({});
  }

  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize({level: 'error'});
  }
});

afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

/**
 * Create a mock partition service for testing.
 * @return {Object} Mock partition service.
 */
function createMockPartition() {
  const insertedRows = [];
  const updatedRows = [];
  const deletedRows = [];

  return {
    insertedRows,
    updatedRows,
    deletedRows,
    async insertData(tableName, data) {
      insertedRows.push({tableName, data});
      return {
        success: true,
        changes: 1,
        lastInsertRowid: insertedRows.length,
      };
    },
    async updateData(tableName, whereClause, data) {
      updatedRows.push({tableName, whereClause, data});
      return {
        success: true,
        changes: 1,
      };
    },
    async deleteData(tableName, whereClause) {
      deletedRows.push({tableName, whereClause});
      return {
        success: true,
        changes: 1,
      };
    },
  };
}

test('CDCIntegrationService - constructor', async (t) => {
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
  });

  t.equal(service.nodeId, 'test-node', 'should set nodeId');
  t.equal(service.isInitialized(), false, 'should not be initialized');
  t.end();
});

test('CDCIntegrationService - initialize', async (t) => {
  const mockPartition = createMockPartition();
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
  });

  service.initialize({
    getPartitionForTable: () => mockPartition,
  });

  t.equal(service.isInitialized(), true, 'should be initialized');
  t.end();
});

test('CDCIntegrationService - insertSystemTableRow', async (t) => {
  const mockPartition = createMockPartition();
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
    getPartitionForTable: () => mockPartition,
  });
  service.initialize();

  const data = {
    node_id: 'node-1',
    node_address: 'localhost:8080',
    cpu_cores: 4,
    memory_mb: 8192,
    disk_gb: 100,
    status: 'active',
    last_heartbeat: Date.now(),
    created_at: Date.now(),
  };

  const result = await service.insertSystemTableRow(SystemTableName.NODES, data);

  t.equal(result.success, true, 'should succeed');
  t.equal(result.operation, CDCOperationType.INSERT, 'should be INSERT operation');
  t.equal(result.tableName, SystemTableName.NODES, 'should have correct table name');
  t.equal(mockPartition.insertedRows.length, 1, 'should insert one row');
  t.equal(
    mockPartition.insertedRows[0].tableName,
    SystemTableName.NODES,
    'should insert to correct table',
  );
  t.end();
});

test('CDCIntegrationService - insertSystemTableRow generates id', async (t) => {
  const mockPartition = createMockPartition();
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
    getPartitionForTable: () => mockPartition,
  });
  service.initialize();

  const data = {
    node_address: 'localhost:8080',
    cpu_cores: 4,
    memory_mb: 8192,
    disk_gb: 100,
    status: 'active',
    last_heartbeat: Date.now(),
    created_at: Date.now(),
  };

  const result = await service.insertSystemTableRow(SystemTableName.NODES, data);

  t.equal(result.success, true, 'should succeed');
  t.ok(result.data.id, 'should generate id');
  t.ok(result.data.node_id, 'should generate node_id');
  t.end();
});

test('CDCIntegrationService - updateSystemTableRow', async (t) => {
  const mockPartition = createMockPartition();
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
    getPartitionForTable: () => mockPartition,
  });
  service.initialize();

  const whereClause = {node_id: 'node-1'};
  const data = {
    status: 'suspected',
    last_heartbeat: Date.now(),
  };

  const result = await service.updateSystemTableRow(
    SystemTableName.NODES,
    whereClause,
    data,
  );

  t.equal(result.success, true, 'should succeed');
  t.equal(result.operation, CDCOperationType.UPDATE, 'should be UPDATE operation');
  t.equal(result.tableName, SystemTableName.NODES, 'should have correct table name');
  t.equal(mockPartition.updatedRows.length, 1, 'should update one row');
  t.same(
    mockPartition.updatedRows[0].whereClause,
    whereClause,
    'should have correct whereClause',
  );
  t.end();
});

test('CDCIntegrationService - deleteSystemTableRow', async (t) => {
  const mockPartition = createMockPartition();
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
    getPartitionForTable: () => mockPartition,
  });
  service.initialize();

  const whereClause = {node_id: 'node-1'};

  const result = await service.deleteSystemTableRow(
    SystemTableName.NODES,
    whereClause,
  );

  t.equal(result.success, true, 'should succeed');
  t.equal(result.operation, CDCOperationType.DELETE, 'should be DELETE operation');
  t.equal(result.tableName, SystemTableName.NODES, 'should have correct table name');
  t.equal(mockPartition.deletedRows.length, 1, 'should delete one row');
  t.same(
    mockPartition.deletedRows[0].whereClause,
    whereClause,
    'should have correct whereClause',
  );
  t.end();
});

test('CDCIntegrationService - validates table name', async (t) => {
  const mockPartition = createMockPartition();
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
    getPartitionForTable: () => mockPartition,
  });
  service.initialize();

  try {
    await service.insertSystemTableRow('invalid_table', {id: '1'});
    t.fail('should throw error for invalid table');
  } catch (error) {
    t.ok(error.message.includes('Invalid system table name'), 'should have error message');
  }
  t.end();
});

test('CDCIntegrationService - validates data object', async (t) => {
  const mockPartition = createMockPartition();
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
    getPartitionForTable: () => mockPartition,
  });
  service.initialize();

  try {
    await service.insertSystemTableRow(SystemTableName.NODES, null);
    t.fail('should throw error for null data');
  } catch (error) {
    t.ok(error.message.includes('requires data object'), 'should have error message');
  }
  t.end();
});

test('CDCIntegrationService - requires primary key for update', async (t) => {
  const mockPartition = createMockPartition();
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
    getPartitionForTable: () => mockPartition,
  });
  service.initialize();

  try {
    await service.updateSystemTableRow(
      SystemTableName.NODES,
      {status: 'active'}, // Missing primary key
      {status: 'failed'},
    );
    t.fail('should throw error for missing primary key');
  } catch (error) {
    t.ok(error.message.includes('requires primary key'), 'should have error message');
  }
  t.end();
});

test('CDCIntegrationService - requires primary key for delete', async (t) => {
  const mockPartition = createMockPartition();
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
    getPartitionForTable: () => mockPartition,
  });
  service.initialize();

  try {
    await service.deleteSystemTableRow(
      SystemTableName.NODES,
      {status: 'active'}, // Missing primary key
    );
    t.fail('should throw error for missing primary key');
  } catch (error) {
    t.ok(error.message.includes('requires primary key'), 'should have error message');
  }
  t.end();
});

test('CDCIntegrationService - throws when partition not available', async (t) => {
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
    getPartitionForTable: () => null,
  });
  service.initialize();

  try {
    await service.insertSystemTableRow(SystemTableName.NODES, {node_id: '1'});
    t.fail('should throw error when partition not available');
  } catch (error) {
    t.ok(error.message.includes('No partition available'), 'should have error message');
  }
  t.end();
});

test('CDCIntegrationService - throws when not initialized', async (t) => {
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
  });

  try {
    await service.insertSystemTableRow(SystemTableName.NODES, {node_id: '1'});
    t.fail('should throw error when not initialized');
  } catch (error) {
    t.ok(error.message.includes('not properly initialized'), 'should have error message');
  }
  t.end();
});

test('CDCIntegrationService - tracks statistics', async (t) => {
  const mockPartition = createMockPartition();
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
    getPartitionForTable: () => mockPartition,
  });
  service.initialize();

  await service.insertSystemTableRow(SystemTableName.NODES, {node_id: '1'});
  await service.insertSystemTableRow(SystemTableName.NODES, {node_id: '2'});
  await service.updateSystemTableRow(
    SystemTableName.NODES,
    {node_id: '1'},
    {status: 'failed'},
  );
  await service.deleteSystemTableRow(SystemTableName.NODES, {node_id: '2'});

  const stats = service.getStats();
  t.equal(stats.inserts, 2, 'should track inserts');
  t.equal(stats.updates, 1, 'should track updates');
  t.equal(stats.deletes, 1, 'should track deletes');
  t.equal(stats.total, 4, 'should track total');
  t.end();
});

test('CDCIntegrationService - emits events', async (t) => {
  const mockPartition = createMockPartition();
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
    getPartitionForTable: () => mockPartition,
  });
  service.initialize();

  const events = [];
  service.on('insert', (e) => events.push({type: 'insert', ...e}));
  service.on('update', (e) => events.push({type: 'update', ...e}));
  service.on('delete', (e) => events.push({type: 'delete', ...e}));

  await service.insertSystemTableRow(SystemTableName.NODES, {node_id: '1'});
  await service.updateSystemTableRow(
    SystemTableName.NODES,
    {node_id: '1'},
    {status: 'failed'},
  );
  await service.deleteSystemTableRow(SystemTableName.NODES, {node_id: '1'});

  t.equal(events.length, 3, 'should emit 3 events');
  t.equal(events[0].type, 'insert', 'should emit insert event');
  t.equal(events[1].type, 'update', 'should emit update event');
  t.equal(events[2].type, 'delete', 'should emit delete event');
  t.end();
});

test('CDCIntegrationService - VALID_SYSTEM_TABLES contains all system tables', async (t) => {
  t.ok(VALID_SYSTEM_TABLES.includes(SystemTableName.NODES), 'should include nodes');
  t.ok(VALID_SYSTEM_TABLES.includes(SystemTableName.SERVICES), 'should include services');
  t.ok(VALID_SYSTEM_TABLES.includes(SystemTableName.PARTITIONS), 'should include partitions');
  t.ok(VALID_SYSTEM_TABLES.includes(SystemTableName.TABLES), 'should include tables');
  t.ok(
    VALID_SYSTEM_TABLES.includes(SystemTableName.MESSAGE_GROUPS),
    'should include message_groups',
  );
  t.ok(VALID_SYSTEM_TABLES.includes(SystemTableName.INDICES), 'should include indices');
  t.ok(VALID_SYSTEM_TABLES.includes(SystemTableName.LOGS), 'should include logs');
  t.ok(VALID_SYSTEM_TABLES.includes(SystemTableName.CONFIG), 'should include config');
  t.end();
});

test('CDCIntegrationService - resetStats', async (t) => {
  const mockPartition = createMockPartition();
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
    getPartitionForTable: () => mockPartition,
  });
  service.initialize();

  await service.insertSystemTableRow(SystemTableName.NODES, {node_id: '1'});

  let stats = service.getStats();
  t.equal(stats.inserts, 1, 'should have 1 insert');

  service.resetStats();
  stats = service.getStats();
  t.equal(stats.inserts, 0, 'should reset inserts');
  t.equal(stats.total, 0, 'should reset total');
  t.end();
});
