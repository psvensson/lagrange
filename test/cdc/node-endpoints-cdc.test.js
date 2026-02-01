/**
 * Tests for CDC integration with node_endpoints table.
 * Verifies that INSERT, UPDATE, DELETE operations generate CDC events
 * and that SystemTableCache is updated correctly.
 * Requirements: 6.4, 6.5
 */

import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import {
  CDCIntegrationService,
  CDCOperationType,
  VALID_SYSTEM_TABLES,
} from '../../src/cdc/cdc-integration-service.js';
import {SystemTableName} from '../../src/bootstrap/system-table-schemas-constants.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {TABLES} from '../../src/constants/index.js';
import {TRANSPORT_TYPE, ENDPOINT_STATUS} from '../../src/constants/transport-types.js';

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
 * Create a mock SQL query engine for testing.
 * @return {Object} Mock SQL query engine.
 */
function createMockSqlQueryEngine() {
  const executedQueries = [];

  return {
    executedQueries,
    async executeQuery(sql, params = []) {
      executedQueries.push({sql, params});
      return {
        success: true,
        affectedRows: 1,
      };
    },
  };
}

test('node_endpoints is in VALID_SYSTEM_TABLES', async (t) => {
  t.ok(
    VALID_SYSTEM_TABLES.includes(SystemTableName.NODE_ENDPOINTS),
    'VALID_SYSTEM_TABLES should include node_endpoints',
  );
  t.ok(
    VALID_SYSTEM_TABLES.includes(TABLES.NODE_ENDPOINTS),
    'VALID_SYSTEM_TABLES should include node_endpoints via TABLES constant',
  );
  t.end();
});

test('SystemTableName includes NODE_ENDPOINTS', async (t) => {
  t.equal(
    SystemTableName.NODE_ENDPOINTS,
    TABLES.NODE_ENDPOINTS,
    'SystemTableName.NODE_ENDPOINTS should equal TABLES.NODE_ENDPOINTS',
  );
  t.equal(
    SystemTableName.NODE_ENDPOINTS,
    'node_endpoints',
    'SystemTableName.NODE_ENDPOINTS should be "node_endpoints"',
  );
  t.end();
});

test('CDCIntegrationService - insertSystemTableRow for node_endpoints', async (t) => {
  const mockSqlEngine = createMockSqlQueryEngine();
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
    sqlQueryEngine: mockSqlEngine,
  });
  service.initialize();

  const now = Date.now();
  const data = {
    endpoint_id: 'ep-1',
    node_id: 'node-1',
    transport_type: TRANSPORT_TYPE.WEBSOCKET,
    address: 'ws://localhost:8080',
    priority: 0,
    metadata: JSON.stringify({tls: false}),
    status: ENDPOINT_STATUS.ACTIVE,
    created_at: now,
    updated_at: now,
  };

  const result = await service.insertSystemTableRow(SystemTableName.NODE_ENDPOINTS, data);

  t.equal(result.success, true, 'should succeed');
  t.equal(result.operation, CDCOperationType.INSERT, 'should be INSERT operation');
  t.equal(result.tableName, SystemTableName.NODE_ENDPOINTS, 'should have correct table name');
  t.equal(mockSqlEngine.executedQueries.length, 1, 'should execute one query');
  t.ok(
    mockSqlEngine.executedQueries[0].sql.includes('INSERT INTO'),
    'should be INSERT query',
  );
  t.ok(
    mockSqlEngine.executedQueries[0].sql.includes('node_endpoints'),
    'should target node_endpoints table',
  );
  t.end();
});

test('CDCIntegrationService - insertSystemTableRow generates endpoint_id', async (t) => {
  const mockSqlEngine = createMockSqlQueryEngine();
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
    sqlQueryEngine: mockSqlEngine,
  });
  service.initialize();

  const now = Date.now();
  const data = {
    node_id: 'node-1',
    transport_type: TRANSPORT_TYPE.WEBSOCKET,
    address: 'ws://localhost:8080',
    priority: 0,
    status: ENDPOINT_STATUS.ACTIVE,
    created_at: now,
    updated_at: now,
  };

  const result = await service.insertSystemTableRow(SystemTableName.NODE_ENDPOINTS, data);

  t.equal(result.success, true, 'should succeed');
  t.ok(result.data.endpoint_id, 'should generate endpoint_id');
  t.end();
});

test('CDCIntegrationService - updateSystemTableRow for node_endpoints', async (t) => {
  const mockSqlEngine = createMockSqlQueryEngine();
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
    sqlQueryEngine: mockSqlEngine,
  });
  service.initialize();

  const whereClause = {endpoint_id: 'ep-1'};
  const data = {
    status: ENDPOINT_STATUS.INACTIVE,
    updated_at: Date.now(),
  };

  const result = await service.updateSystemTableRow(
    SystemTableName.NODE_ENDPOINTS,
    whereClause,
    data,
  );

  t.equal(result.success, true, 'should succeed');
  t.equal(result.operation, CDCOperationType.UPDATE, 'should be UPDATE operation');
  t.equal(result.tableName, SystemTableName.NODE_ENDPOINTS, 'should have correct table name');
  t.equal(mockSqlEngine.executedQueries.length, 1, 'should execute one query');
  t.ok(
    mockSqlEngine.executedQueries[0].sql.includes('UPDATE'),
    'should be UPDATE query',
  );
  t.ok(
    mockSqlEngine.executedQueries[0].sql.includes('node_endpoints'),
    'should target node_endpoints table',
  );
  t.end();
});

test('CDCIntegrationService - deleteSystemTableRow for node_endpoints', async (t) => {
  const mockSqlEngine = createMockSqlQueryEngine();
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
    sqlQueryEngine: mockSqlEngine,
  });
  service.initialize();

  const whereClause = {endpoint_id: 'ep-1'};

  const result = await service.deleteSystemTableRow(
    SystemTableName.NODE_ENDPOINTS,
    whereClause,
  );

  t.equal(result.success, true, 'should succeed');
  t.equal(result.operation, CDCOperationType.DELETE, 'should be DELETE operation');
  t.equal(result.tableName, SystemTableName.NODE_ENDPOINTS, 'should have correct table name');
  t.equal(mockSqlEngine.executedQueries.length, 1, 'should execute one query');
  t.ok(
    mockSqlEngine.executedQueries[0].sql.includes('DELETE'),
    'should be DELETE query',
  );
  t.ok(
    mockSqlEngine.executedQueries[0].sql.includes('node_endpoints'),
    'should target node_endpoints table',
  );
  t.end();
});

test('CDCIntegrationService - emits events for node_endpoints operations', async (t) => {
  const mockSqlEngine = createMockSqlQueryEngine();
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
    sqlQueryEngine: mockSqlEngine,
  });
  service.initialize();

  const events = [];
  service.on('insert', (e) => events.push({type: 'insert', ...e}));
  service.on('update', (e) => events.push({type: 'update', ...e}));
  service.on('delete', (e) => events.push({type: 'delete', ...e}));

  const now = Date.now();
  await service.insertSystemTableRow(SystemTableName.NODE_ENDPOINTS, {
    endpoint_id: 'ep-1',
    node_id: 'node-1',
    transport_type: TRANSPORT_TYPE.WEBSOCKET,
    address: 'ws://localhost:8080',
    priority: 0,
    status: ENDPOINT_STATUS.ACTIVE,
    created_at: now,
    updated_at: now,
  });

  await service.updateSystemTableRow(
    SystemTableName.NODE_ENDPOINTS,
    {endpoint_id: 'ep-1'},
    {status: ENDPOINT_STATUS.INACTIVE},
  );

  await service.deleteSystemTableRow(
    SystemTableName.NODE_ENDPOINTS,
    {endpoint_id: 'ep-1'},
  );

  t.equal(events.length, 3, 'should emit 3 events');
  t.equal(events[0].type, 'insert', 'should emit insert event');
  t.equal(events[0].tableName, SystemTableName.NODE_ENDPOINTS, 'insert event has correct table');
  t.equal(events[1].type, 'update', 'should emit update event');
  t.equal(events[1].tableName, SystemTableName.NODE_ENDPOINTS, 'update event has correct table');
  t.equal(events[2].type, 'delete', 'should emit delete event');
  t.equal(events[2].tableName, SystemTableName.NODE_ENDPOINTS, 'delete event has correct table');
  t.end();
});

test('SystemTableCache - applySystemTableChange for node_endpoints INSERT', async (t) => {
  const cache = new SystemTableCache();

  const now = Date.now();
  const endpointData = {
    endpoint_id: 'ep-1',
    node_id: 'node-1',
    transport_type: TRANSPORT_TYPE.WEBSOCKET,
    address: 'ws://localhost:8080',
    priority: 0,
    metadata: JSON.stringify({tls: false}),
    status: ENDPOINT_STATUS.ACTIVE,
    created_at: now,
    updated_at: now,
  };

  cache.applySystemTableChange(TABLES.NODE_ENDPOINTS, 'INSERT', endpointData);

  const retrieved = cache.get(TABLES.NODE_ENDPOINTS, 'ep-1');
  t.ok(retrieved, 'should retrieve inserted endpoint');
  t.equal(retrieved.endpoint_id, 'ep-1', 'should have correct endpoint_id');
  t.equal(retrieved.node_id, 'node-1', 'should have correct node_id');
  t.equal(retrieved.transport_type, TRANSPORT_TYPE.WEBSOCKET, 'should have correct transport_type');
  t.equal(retrieved.address, 'ws://localhost:8080', 'should have correct address');
  t.equal(retrieved.priority, 0, 'should have correct priority');
  t.equal(retrieved.status, ENDPOINT_STATUS.ACTIVE, 'should have correct status');
  t.end();
});

test('SystemTableCache - applySystemTableChange for node_endpoints UPDATE', async (t) => {
  const cache = new SystemTableCache();

  const now = Date.now();
  const endpointData = {
    endpoint_id: 'ep-1',
    node_id: 'node-1',
    transport_type: TRANSPORT_TYPE.WEBSOCKET,
    address: 'ws://localhost:8080',
    priority: 0,
    status: ENDPOINT_STATUS.ACTIVE,
    created_at: now,
    updated_at: now,
  };

  cache.applySystemTableChange(TABLES.NODE_ENDPOINTS, 'INSERT', endpointData);

  // Update the endpoint
  const updateData = {
    endpoint_id: 'ep-1',
    status: ENDPOINT_STATUS.INACTIVE,
    updated_at: now + 1000,
  };

  cache.applySystemTableChange(TABLES.NODE_ENDPOINTS, 'UPDATE', updateData);

  const retrieved = cache.get(TABLES.NODE_ENDPOINTS, 'ep-1');
  t.ok(retrieved, 'should retrieve updated endpoint');
  t.equal(retrieved.status, ENDPOINT_STATUS.INACTIVE, 'should have updated status');
  t.equal(retrieved.node_id, 'node-1', 'should preserve node_id');
  t.equal(retrieved.transport_type, TRANSPORT_TYPE.WEBSOCKET, 'should preserve transport_type');
  t.end();
});

test('SystemTableCache - applySystemTableChange for node_endpoints DELETE', async (t) => {
  const cache = new SystemTableCache();

  const now = Date.now();
  const endpointData = {
    endpoint_id: 'ep-1',
    node_id: 'node-1',
    transport_type: TRANSPORT_TYPE.WEBSOCKET,
    address: 'ws://localhost:8080',
    priority: 0,
    status: ENDPOINT_STATUS.ACTIVE,
    created_at: now,
    updated_at: now,
  };

  cache.applySystemTableChange(TABLES.NODE_ENDPOINTS, 'INSERT', endpointData);
  t.ok(cache.has(TABLES.NODE_ENDPOINTS, 'ep-1'), 'should have endpoint before delete');

  cache.applySystemTableChange(TABLES.NODE_ENDPOINTS, 'DELETE', {endpoint_id: 'ep-1'});

  t.notOk(cache.has(TABLES.NODE_ENDPOINTS, 'ep-1'), 'should not have endpoint after delete');
  t.end();
});

test('SystemTableCache - getEndpointsForNode returns endpoints sorted by priority', async (t) => {
  const cache = new SystemTableCache();

  const now = Date.now();

  // Insert endpoints with different priorities (out of order)
  cache.applySystemTableChange(TABLES.NODE_ENDPOINTS, 'INSERT', {
    endpoint_id: 'ep-3',
    node_id: 'node-1',
    transport_type: 'veilid',
    address: 'veilid://abc123',
    priority: 20,
    status: ENDPOINT_STATUS.ACTIVE,
    created_at: now,
    updated_at: now,
  });

  cache.applySystemTableChange(TABLES.NODE_ENDPOINTS, 'INSERT', {
    endpoint_id: 'ep-1',
    node_id: 'node-1',
    transport_type: TRANSPORT_TYPE.WEBSOCKET,
    address: 'ws://localhost:8080',
    priority: 0,
    status: ENDPOINT_STATUS.ACTIVE,
    created_at: now,
    updated_at: now,
  });

  cache.applySystemTableChange(TABLES.NODE_ENDPOINTS, 'INSERT', {
    endpoint_id: 'ep-2',
    node_id: 'node-1',
    transport_type: 'nats',
    address: 'nats://localhost:4222',
    priority: 10,
    status: ENDPOINT_STATUS.ACTIVE,
    created_at: now,
    updated_at: now,
  });

  // Insert endpoint for different node
  cache.applySystemTableChange(TABLES.NODE_ENDPOINTS, 'INSERT', {
    endpoint_id: 'ep-4',
    node_id: 'node-2',
    transport_type: TRANSPORT_TYPE.WEBSOCKET,
    address: 'ws://localhost:8081',
    priority: 0,
    status: ENDPOINT_STATUS.ACTIVE,
    created_at: now,
    updated_at: now,
  });

  const endpoints = cache.getEndpointsForNode('node-1');

  t.equal(endpoints.length, 3, 'should return 3 endpoints for node-1');
  t.equal(endpoints[0].endpoint_id, 'ep-1', 'first endpoint should have priority 0');
  t.equal(endpoints[0].priority, 0, 'first endpoint priority should be 0');
  t.equal(endpoints[1].endpoint_id, 'ep-2', 'second endpoint should have priority 10');
  t.equal(endpoints[1].priority, 10, 'second endpoint priority should be 10');
  t.equal(endpoints[2].endpoint_id, 'ep-3', 'third endpoint should have priority 20');
  t.equal(endpoints[2].priority, 20, 'third endpoint priority should be 20');
  t.end();
});

test('SystemTableCache - notifies listeners on node_endpoints changes', async (t) => {
  const cache = new SystemTableCache();
  const notifications = [];

  cache.onCacheChange((tableName, operation, record) => {
    notifications.push({tableName, operation, record});
  });

  const now = Date.now();
  const endpointData = {
    endpoint_id: 'ep-1',
    node_id: 'node-1',
    transport_type: TRANSPORT_TYPE.WEBSOCKET,
    address: 'ws://localhost:8080',
    priority: 0,
    status: ENDPOINT_STATUS.ACTIVE,
    created_at: now,
    updated_at: now,
  };

  cache.applySystemTableChange(TABLES.NODE_ENDPOINTS, 'INSERT', endpointData);

  // Wait for setImmediate to fire
  await new Promise((resolve) => setImmediate(resolve));

  t.equal(notifications.length, 1, 'should have one notification');
  t.equal(notifications[0].tableName, TABLES.NODE_ENDPOINTS, 'notification has correct table');
  t.equal(notifications[0].operation, 'INSERT', 'notification has correct operation');
  t.equal(notifications[0].record.endpoint_id, 'ep-1', 'notification has correct record');
  t.end();
});

test('CDCIntegrationService - requires endpoint_id for update', async (t) => {
  const mockSqlEngine = createMockSqlQueryEngine();
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
    sqlQueryEngine: mockSqlEngine,
  });
  service.initialize();

  try {
    await service.updateSystemTableRow(
      SystemTableName.NODE_ENDPOINTS,
      {status: ENDPOINT_STATUS.ACTIVE}, // Missing endpoint_id
      {status: ENDPOINT_STATUS.INACTIVE},
    );
    t.fail('should throw error for missing primary key');
  } catch (error) {
    t.ok(error.message.includes('requires primary key'), 'should have error message');
  }
  t.end();
});

test('CDCIntegrationService - requires endpoint_id for delete', async (t) => {
  const mockSqlEngine = createMockSqlQueryEngine();
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
    sqlQueryEngine: mockSqlEngine,
  });
  service.initialize();

  try {
    await service.deleteSystemTableRow(
      SystemTableName.NODE_ENDPOINTS,
      {status: ENDPOINT_STATUS.ACTIVE}, // Missing endpoint_id
    );
    t.fail('should throw error for missing primary key');
  } catch (error) {
    t.ok(error.message.includes('requires primary key'), 'should have error message');
  }
  t.end();
});

test('CDCIntegrationService - upsertSystemTableRow for node_endpoints', async (t) => {
  const mockSqlEngine = createMockSqlQueryEngine();
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
    sqlQueryEngine: mockSqlEngine,
  });
  service.initialize();

  const now = Date.now();
  const data = {
    endpoint_id: 'ep-1',
    node_id: 'node-1',
    transport_type: TRANSPORT_TYPE.WEBSOCKET,
    address: 'ws://localhost:8080',
    priority: 0,
    status: ENDPOINT_STATUS.ACTIVE,
    created_at: now,
    updated_at: now,
  };

  const result = await service.upsertSystemTableRow(SystemTableName.NODE_ENDPOINTS, data);

  t.equal(result.success, true, 'should succeed');
  t.equal(result.operation, CDCOperationType.UPSERT, 'should be UPSERT operation');
  t.equal(result.tableName, SystemTableName.NODE_ENDPOINTS, 'should have correct table name');
  t.ok(
    mockSqlEngine.executedQueries[0].sql.includes('INSERT OR REPLACE'),
    'should be INSERT OR REPLACE query',
  );
  t.end();
});
