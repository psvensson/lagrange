/**
 * Unit tests for bootstrap mode functionality.
 * Tests the temporary direct write path used by seed node during bootstrap.
 * Validates: Requirement 8.7
 */

import {test} from '../../src/test-helpers/tap.js';
import {CDCIntegrationService} from '../../src/cdc/cdc-integration-service.js';
import {SYSTEM_TABLE_NAME} from '../../src/bootstrap/system-table-schemas-constants.js';
import {WRITE_ROUTER_MODE} from '../../src/cdc/write-router/index.js';

// Use hardcoded partition IDs matching the constants file
const NODES_PARTITION_ID = 'nodes-p1';
const SERVICES_PARTITION_ID = 'services-p1';
const PARTITIONS_PARTITION_ID = 'partitions-p1';

/**
 * Create a mock SQL query engine for testing.
 * @return {Object} Mock SQL query engine.
 */
function createMockSqlQueryEngine() {
  return {
    executeQuery: async (_sql, _params) => {
      return {success: true, rows: [], affectedRows: 1};
    },
  };
}

/**
 * Create a mock partition service for testing.
 * @param {string} partitionId - Partition ID.
 * @param {boolean} shouldSucceed - Whether executeLocalQuery should succeed.
 * @return {Object} Mock partition service.
 */
function createMockPartitionService(partitionId, shouldSucceed = true) {
  return {
    partitionId,
    initialized: true,
    isLeader: true,
    executeLocalQuery: async (_sql, _params) => {
      if (shouldSucceed) {
        return {success: true, affectedRows: 1, rows: []};
      }
      return {success: false, error: 'Mock partition error'};
    },
  };
}

// Test 1: Bootstrap mode enable/disable
test('Bootstrap mode - enable sets flag and stores partition services', (t) => {
  const service = new CDCIntegrationService({nodeId: 'test-seed-node'});
  service.initialize();

  const mockPartitionServices = new Map();
  mockPartitionServices.set(
    NODES_PARTITION_ID,
    createMockPartitionService(NODES_PARTITION_ID),
  );
  mockPartitionServices.set(
    SERVICES_PARTITION_ID,
    createMockPartitionService(SERVICES_PARTITION_ID),
  );

  service.setBootstrapMode(true, mockPartitionServices);

  t.equal(service.bootstrapMode, true, 'bootstrap mode should be enabled');
  t.equal(service.localPartitionServices, mockPartitionServices, 'should store ref');
  t.equal(service.localPartitionServices.size, 2, 'should have 2 partition services');
  t.end();
});

test('Bootstrap mode - disable clears flag and partition services', (t) => {
  const service = new CDCIntegrationService({nodeId: 'test-seed-node'});
  service.initialize();

  const mockPartitionServices = new Map();
  mockPartitionServices.set(
    NODES_PARTITION_ID,
    createMockPartitionService(NODES_PARTITION_ID),
  );

  service.setBootstrapMode(true, mockPartitionServices);
  t.equal(service.bootstrapMode, true, 'should be enabled');

  service.setBootstrapMode(false, null);

  t.equal(service.bootstrapMode, false, 'bootstrap mode should be disabled');
  t.equal(service.localPartitionServices, null, 'should clear partition services');
  t.end();
});

test('Bootstrap mode - clearBootstrapMode is convenience method', (t) => {
  const service = new CDCIntegrationService({nodeId: 'test-seed-node'});
  service.initialize();

  const mockPartitionServices = new Map();
  mockPartitionServices.set(
    NODES_PARTITION_ID,
    createMockPartitionService(NODES_PARTITION_ID),
  );

  service.setBootstrapMode(true, mockPartitionServices);
  service.clearBootstrapMode();

  t.equal(service.bootstrapMode, false, 'should be disabled');
  t.equal(service.localPartitionServices, null, 'should clear partition services');
  t.end();
});

test('Bootstrap mode - requires Map when enabling', (t) => {
  const service = new CDCIntegrationService({nodeId: 'test-seed-node'});
  service.initialize();

  try {
    service.setBootstrapMode(true, null);
    t.fail('should throw when enabling with null');
  } catch (error) {
    t.ok(error.message.includes('requires a Map'), 'should throw Map error');
  }

  try {
    service.setBootstrapMode(true, {});
    t.fail('should throw when enabling with plain object');
  } catch (error) {
    t.ok(error.message.includes('requires a Map'), 'should throw Map error');
  }

  t.end();
});

test('Bootstrap mode - starts disabled by default', (t) => {
  const service = new CDCIntegrationService({nodeId: 'test-seed-node'});
  t.equal(service.bootstrapMode, false, 'should start disabled');
  t.equal(service.localPartitionServices, null, 'should have no partition services');
  t.equal(
    service.writeRouter.mode,
    WRITE_ROUTER_MODE.SQL_ROUTED,
    'should start with SQL write router',
  );
  t.end();
});

test('Bootstrap mode - swaps write router strategy on mode transitions', (t) => {
  const service = new CDCIntegrationService({nodeId: 'test-seed-node'});
  service.initialize();

  const mockPartitionServices = new Map();
  mockPartitionServices.set(
    NODES_PARTITION_ID,
    createMockPartitionService(NODES_PARTITION_ID),
  );

  service.setBootstrapMode(true, mockPartitionServices);
  t.equal(
    service.writeRouter.mode,
    WRITE_ROUTER_MODE.BOOTSTRAP_DIRECT,
    'should use bootstrap direct write router when enabled',
  );

  service.clearBootstrapMode();
  t.equal(
    service.writeRouter.mode,
    WRITE_ROUTER_MODE.SQL_ROUTED,
    'should switch back to SQL write router when disabled',
  );
  t.end();
});

// Test 2: Direct write to local partition
test('Bootstrap mode - direct write executes on correct partition', async (t) => {
  const service = new CDCIntegrationService({nodeId: 'test-seed-node'});
  service.initialize();

  let executedSql = null;
  const mockPartitionService = {
    partitionId: SERVICES_PARTITION_ID,
    initialized: true,
    isLeader: true,
    executeLocalQuery: async (sql, _params) => {
      executedSql = sql;
      return {success: true, affectedRows: 1};
    },
  };

  const mockPartitionServices = new Map();
  mockPartitionServices.set(SERVICES_PARTITION_ID, mockPartitionService);
  service.setBootstrapMode(true, mockPartitionServices);

  const sql = 'INSERT INTO services (service_id) VALUES (?)';
  const result = await service.executeSQLDirectToLocalPartition(sql, ['svc-1']);

  t.ok(result.success, 'should return success');
  t.equal(executedSql, sql, 'should pass SQL to partition');
  t.end();
});

test('Bootstrap mode - direct write finds partition by table name', async (t) => {
  const service = new CDCIntegrationService({nodeId: 'test-seed-node'});
  service.initialize();

  const mockPartitionServices = new Map();
  mockPartitionServices.set(
    NODES_PARTITION_ID,
    createMockPartitionService(NODES_PARTITION_ID),
  );
  mockPartitionServices.set(
    SERVICES_PARTITION_ID,
    createMockPartitionService(SERVICES_PARTITION_ID),
  );
  mockPartitionServices.set(
    PARTITIONS_PARTITION_ID,
    createMockPartitionService(PARTITIONS_PARTITION_ID),
  );

  service.setBootstrapMode(true, mockPartitionServices);

  const r1 = await service.executeSQLDirectToLocalPartition(
    'INSERT INTO nodes (node_id) VALUES (?)',
    ['node-1'],
  );
  t.ok(r1.success, 'should succeed for nodes table');

  const r2 = await service.executeSQLDirectToLocalPartition(
    'INSERT INTO services (service_id) VALUES (?)',
    ['service-1'],
  );
  t.ok(r2.success, 'should succeed for services table');

  t.end();
});

test('Bootstrap mode - direct write throws when partition not found', async (t) => {
  const service = new CDCIntegrationService({nodeId: 'test-seed-node'});
  service.initialize();

  const mockPartitionServices = new Map();
  mockPartitionServices.set(
    NODES_PARTITION_ID,
    createMockPartitionService(NODES_PARTITION_ID),
  );
  service.setBootstrapMode(true, mockPartitionServices);

  try {
    await service.executeSQLDirectToLocalPartition(
      'INSERT INTO services (service_id) VALUES (?)',
      ['service-1'],
    );
    t.fail('should throw when partition not found');
  } catch (error) {
    t.ok(
      error.message.includes('Partition services not initialized') ||
      error.message.includes('No local partition service found'),
      'should throw error about missing partition',
    );
  }
  t.end();
});

test('Bootstrap mode - direct write throws when not in bootstrap mode', async (t) => {
  const service = new CDCIntegrationService({nodeId: 'test-seed-node'});
  service.initialize();

  try {
    await service.executeSQLDirectToLocalPartition(
      'INSERT INTO nodes (node_id) VALUES (?)',
      ['node-1'],
    );
    t.fail('should throw when not in bootstrap mode');
  } catch (error) {
    t.ok(error.message.includes('bootstrap mode'), 'should throw bootstrap error');
  }
  t.end();
});

test('Bootstrap mode - direct write throws when SQL parsing fails', async (t) => {
  const service = new CDCIntegrationService({nodeId: 'test-seed-node'});
  service.initialize();

  const mockPartitionServices = new Map();
  mockPartitionServices.set(
    NODES_PARTITION_ID,
    createMockPartitionService(NODES_PARTITION_ID),
  );
  service.setBootstrapMode(true, mockPartitionServices);

  try {
    await service.executeSQLDirectToLocalPartition('INVALID SQL', []);
    t.fail('should throw when SQL parsing fails');
  } catch (error) {
    t.ok(
      error.message.includes('Could not extract table name'),
      'should throw table name error',
    );
  }
  t.end();
});

test('Bootstrap mode - direct write handles partition errors', async (t) => {
  const service = new CDCIntegrationService({nodeId: 'test-seed-node'});
  service.initialize();

  const mockPartitionService = createMockPartitionService(NODES_PARTITION_ID, false);
  const mockPartitionServices = new Map();
  mockPartitionServices.set(NODES_PARTITION_ID, mockPartitionService);
  service.setBootstrapMode(true, mockPartitionServices);

  try {
    await service.executeSQLDirectToLocalPartition(
      'INSERT INTO nodes (node_id) VALUES (?)',
      ['node-1'],
    );
    t.fail('should throw when partition returns error');
  } catch (error) {
    t.ok(error.message.includes('Mock partition error'), 'should throw partition error');
  }
  t.end();
});

// Test 3: executeSQL routing based on mode
test('Bootstrap mode - routes to direct partition when enabled', async (t) => {
  const service = new CDCIntegrationService({nodeId: 'test-seed-node'});
  service.initialize();

  let directCallMade = false;
  const mockPartitionService = {
    partitionId: NODES_PARTITION_ID,
    initialized: true,
    isLeader: true,
    executeLocalQuery: async (_sql, _params) => {
      directCallMade = true;
      return {success: true, affectedRows: 1};
    },
  };

  const mockPartitionServices = new Map();
  mockPartitionServices.set(NODES_PARTITION_ID, mockPartitionService);
  service.setBootstrapMode(true, mockPartitionServices);

  const result = await service.insertSystemTableRow(SYSTEM_TABLE_NAME.NODES, {
    node_id: 'node-1',
    node_address: 'localhost:8080',
  });

  t.ok(result.success, 'should succeed');
  t.ok(directCallMade, 'should call direct partition method');
  t.end();
});

test('Bootstrap mode - routes to SQL engine when disabled', async (t) => {
  const mockSqlEngine = createMockSqlQueryEngine();
  const service = new CDCIntegrationService({
    nodeId: 'test-seed-node',
    sqlQueryEngine: mockSqlEngine,
  });
  service.initialize();

  let sqlEngineCalled = false;
  mockSqlEngine.executeQuery = async (_sql, _params) => {
    sqlEngineCalled = true;
    return {success: true, affectedRows: 1};
  };

  const result = await service.insertSystemTableRow(SYSTEM_TABLE_NAME.NODES, {
    node_id: 'node-1',
    node_address: 'localhost:8080',
  });

  t.ok(result.success, 'should succeed');
  t.ok(sqlEngineCalled, 'should call SQL engine');
  t.end();
});

test('Bootstrap mode - switches from bootstrap to normal mode', async (t) => {
  const mockSqlEngine = createMockSqlQueryEngine();
  const service = new CDCIntegrationService({
    nodeId: 'test-seed-node',
    sqlQueryEngine: mockSqlEngine,
  });
  service.initialize();

  let directCallCount = 0;
  let sqlEngineCallCount = 0;

  const mockPartitionService = {
    partitionId: NODES_PARTITION_ID,
    initialized: true,
    isLeader: true,
    executeLocalQuery: async (_sql, _params) => {
      directCallCount++;
      return {success: true, affectedRows: 1};
    },
  };

  mockSqlEngine.executeQuery = async (_sql, _params) => {
    sqlEngineCallCount++;
    return {success: true, affectedRows: 1};
  };

  const mockPartitionServices = new Map();
  mockPartitionServices.set(NODES_PARTITION_ID, mockPartitionService);

  // Phase 1: Bootstrap mode enabled
  service.setBootstrapMode(true, mockPartitionServices);
  await service.insertSystemTableRow(SYSTEM_TABLE_NAME.NODES, {
    node_id: 'node-1',
    node_address: 'localhost:8080',
  });

  t.equal(directCallCount, 1, 'should call direct partition in bootstrap mode');
  t.equal(sqlEngineCallCount, 0, 'should not call SQL engine in bootstrap mode');

  // Phase 2: Bootstrap mode disabled
  service.clearBootstrapMode();
  await service.insertSystemTableRow(SYSTEM_TABLE_NAME.NODES, {
    node_id: 'node-2',
    node_address: 'localhost:8081',
  });

  t.equal(directCallCount, 1, 'should not call direct partition after disable');
  t.equal(sqlEngineCallCount, 1, 'should call SQL engine after disable');
  t.end();
});

test('Bootstrap mode - throws when SQL engine missing in normal mode', async (t) => {
  const service = new CDCIntegrationService({nodeId: 'test-seed-node'});
  service.initialize();

  try {
    await service.insertSystemTableRow(SYSTEM_TABLE_NAME.NODES, {
      node_id: 'node-1',
      node_address: 'localhost:8080',
    });
    t.fail('should throw when SQL engine missing');
  } catch (error) {
    t.ok(
      error.message.includes('sqlQueryEngine not provided'),
      'should throw SQL engine error',
    );
  }
  t.end();
});
