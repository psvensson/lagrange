/**
 * Tests for NodeLifecycleService.
 * Requirements: 5.6, 5.7, 5.8
 */

import {test, beforeEach, afterEach} from 'tap';
import {
  NodeLifecycleService,
  NodeLifecycleStatus,
} from '../../src/node/node-lifecycle-service.js';
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
 * Create a mock CDC integration service for testing.
 * @return {Object} Mock CDC integration service.
 */
function createMockCDCService() {
  const operations = [];

  return {
    operations,
    async insertSystemTableRow(tableName, data) {
      operations.push({type: 'insert', tableName, data});
      return {success: true, operation: 'INSERT', tableName, data};
    },
    async updateSystemTableRow(tableName, whereClause, data) {
      operations.push({type: 'update', tableName, whereClause, data});
      return {success: true, operation: 'UPDATE', tableName, whereClause, data};
    },
    async deleteSystemTableRow(tableName, whereClause) {
      operations.push({type: 'delete', tableName, whereClause});
      return {success: true, operation: 'DELETE', tableName, whereClause};
    },
  };
}

test('NodeLifecycleService - constructor', async (t) => {
  const service = new NodeLifecycleService({
    nodeId: 'test-node',
  });

  t.equal(service.nodeId, 'test-node', 'should set nodeId');
  t.equal(service.isInitialized(), false, 'should not be initialized');
  t.end();
});

test('NodeLifecycleService - initialize', async (t) => {
  const mockCDC = createMockCDCService();
  const service = new NodeLifecycleService({
    nodeId: 'test-node',
    cdcIntegrationService: mockCDC,
  });

  service.initialize();

  t.equal(service.isInitialized(), true, 'should be initialized');
  t.end();
});

test('NodeLifecycleService - initialize requires cdcIntegrationService', async (t) => {
  const service = new NodeLifecycleService({
    nodeId: 'test-node',
  });

  try {
    service.initialize();
    t.fail('should throw error');
  } catch (error) {
    t.ok(
      error.message.includes('requires cdcIntegrationService'),
      'should have error message',
    );
  }
  t.end();
});

test('NodeLifecycleService - initialize requires nodeId', async (t) => {
  const mockCDC = createMockCDCService();
  const service = new NodeLifecycleService({
    cdcIntegrationService: mockCDC,
  });

  try {
    service.initialize();
    t.fail('should throw error');
  } catch (error) {
    t.ok(error.message.includes('requires nodeId'), 'should have error message');
  }
  t.end();
});

test('NodeLifecycleService - registerNode', async (t) => {
  const mockCDC = createMockCDCService();
  const service = new NodeLifecycleService({
    nodeId: 'test-node',
    cdcIntegrationService: mockCDC,
  });
  service.initialize();

  const nodeData = {
    node_id: 'new-node-1',
    node_address: 'localhost:8080',
    cpu_cores: 4,
    memory_mb: 8192,
    disk_gb: 100,
  };

  const result = await service.registerNode(nodeData);

  t.equal(result.success, true, 'should succeed');
  t.equal(mockCDC.operations.length, 1, 'should have one operation');
  t.equal(mockCDC.operations[0].type, 'insert', 'should be insert');
  t.equal(
    mockCDC.operations[0].tableName,
    SystemTableName.NODES,
    'should insert to nodes table',
  );
  t.equal(
    mockCDC.operations[0].data.node_id,
    'new-node-1',
    'should have correct node_id',
  );
  t.equal(
    mockCDC.operations[0].data.status,
    NodeLifecycleStatus.ACTIVE,
    'should have active status',
  );
  t.end();
});

test('NodeLifecycleService - updateHeartbeat', async (t) => {
  const mockCDC = createMockCDCService();
  const service = new NodeLifecycleService({
    nodeId: 'test-node',
    cdcIntegrationService: mockCDC,
  });
  service.initialize();

  const result = await service.updateHeartbeat('node-1', {
    cpu_usage_percent: 50,
    memory_usage_percent: 60,
  });

  t.equal(result.success, true, 'should succeed');
  t.equal(mockCDC.operations.length, 1, 'should have one operation');
  t.equal(mockCDC.operations[0].type, 'update', 'should be update');
  t.equal(
    mockCDC.operations[0].tableName,
    SystemTableName.NODES,
    'should update nodes table',
  );
  t.same(
    mockCDC.operations[0].whereClause,
    {node_id: 'node-1'},
    'should have correct whereClause',
  );
  t.ok(
    mockCDC.operations[0].data.last_heartbeat,
    'should have last_heartbeat',
  );
  t.equal(
    mockCDC.operations[0].data.cpu_usage_percent,
    50,
    'should have cpu_usage_percent',
  );
  t.end();
});

test('NodeLifecycleService - markNodeFailed', async (t) => {
  const mockCDC = createMockCDCService();
  const service = new NodeLifecycleService({
    nodeId: 'test-node',
    cdcIntegrationService: mockCDC,
  });
  service.initialize();

  const result = await service.markNodeFailed('node-1', 'heartbeat_timeout');

  t.equal(result.success, true, 'should succeed');
  t.equal(mockCDC.operations.length, 1, 'should have one operation');
  t.equal(mockCDC.operations[0].type, 'update', 'should be update');
  t.equal(
    mockCDC.operations[0].data.status,
    NodeLifecycleStatus.FAILED,
    'should set status to failed',
  );
  t.end();
});

test('NodeLifecycleService - markNodeSuspected', async (t) => {
  const mockCDC = createMockCDCService();
  const service = new NodeLifecycleService({
    nodeId: 'test-node',
    cdcIntegrationService: mockCDC,
  });
  service.initialize();

  const result = await service.markNodeSuspected('node-1');

  t.equal(result.success, true, 'should succeed');
  t.equal(
    mockCDC.operations[0].data.status,
    NodeLifecycleStatus.SUSPECTED,
    'should set status to suspected',
  );
  t.end();
});

test('NodeLifecycleService - markNodeActive', async (t) => {
  const mockCDC = createMockCDCService();
  const service = new NodeLifecycleService({
    nodeId: 'test-node',
    cdcIntegrationService: mockCDC,
  });
  service.initialize();

  const result = await service.markNodeActive('node-1');

  t.equal(result.success, true, 'should succeed');
  t.equal(
    mockCDC.operations[0].data.status,
    NodeLifecycleStatus.ACTIVE,
    'should set status to active',
  );
  t.ok(
    mockCDC.operations[0].data.last_heartbeat,
    'should update last_heartbeat',
  );
  t.end();
});

test('NodeLifecycleService - removeNode', async (t) => {
  const mockCDC = createMockCDCService();
  const service = new NodeLifecycleService({
    nodeId: 'test-node',
    cdcIntegrationService: mockCDC,
  });
  service.initialize();

  const result = await service.removeNode('node-1');

  t.equal(result.success, true, 'should succeed');
  t.equal(mockCDC.operations.length, 1, 'should have one operation');
  t.equal(mockCDC.operations[0].type, 'delete', 'should be delete');
  t.same(
    mockCDC.operations[0].whereClause,
    {node_id: 'node-1'},
    'should have correct whereClause',
  );
  t.end();
});

test('NodeLifecycleService - emits events', async (t) => {
  const mockCDC = createMockCDCService();
  const service = new NodeLifecycleService({
    nodeId: 'test-node',
    cdcIntegrationService: mockCDC,
  });
  service.initialize();

  const events = [];
  service.on('nodeRegistered', (e) => events.push({type: 'registered', ...e}));
  service.on('heartbeatUpdated', (e) => events.push({type: 'heartbeat', ...e}));
  service.on('nodeFailed', (e) => events.push({type: 'failed', ...e}));
  service.on('nodeSuspected', (e) => events.push({type: 'suspected', ...e}));
  service.on('nodeActive', (e) => events.push({type: 'active', ...e}));
  service.on('nodeRemoved', (e) => events.push({type: 'removed', ...e}));

  await service.registerNode({node_id: 'n1', node_address: 'addr1'});
  await service.updateHeartbeat('n1');
  await service.markNodeSuspected('n1');
  await service.markNodeFailed('n1');
  await service.markNodeActive('n1');
  await service.removeNode('n1');

  t.equal(events.length, 6, 'should emit 6 events');
  t.equal(events[0].type, 'registered', 'should emit registered');
  t.equal(events[1].type, 'heartbeat', 'should emit heartbeat');
  t.equal(events[2].type, 'suspected', 'should emit suspected');
  t.equal(events[3].type, 'failed', 'should emit failed');
  t.equal(events[4].type, 'active', 'should emit active');
  t.equal(events[5].type, 'removed', 'should emit removed');
  t.end();
});

test('NodeLifecycleService - tracks known nodes', async (t) => {
  const mockCDC = createMockCDCService();
  const service = new NodeLifecycleService({
    nodeId: 'test-node',
    cdcIntegrationService: mockCDC,
  });
  service.initialize();

  await service.registerNode({node_id: 'n1', node_address: 'addr1'});
  await service.registerNode({node_id: 'n2', node_address: 'addr2'});

  const knownNodes = service.getKnownNodes();
  t.equal(knownNodes.size, 2, 'should track 2 nodes');
  t.ok(knownNodes.has('n1'), 'should have n1');
  t.ok(knownNodes.has('n2'), 'should have n2');

  await service.removeNode('n1');
  const updatedNodes = service.getKnownNodes();
  t.equal(updatedNodes.size, 1, 'should have 1 node after removal');
  t.notOk(updatedNodes.has('n1'), 'should not have n1');
  t.end();
});

test('NodeLifecycleService - throws when not initialized', async (t) => {
  const service = new NodeLifecycleService({
    nodeId: 'test-node',
  });

  try {
    await service.registerNode({node_id: 'n1'});
    t.fail('should throw error');
  } catch (error) {
    t.ok(error.message.includes('not initialized'), 'should have error message');
  }
  t.end();
});

test('NodeLifecycleService - shutdown', async (t) => {
  const mockCDC = createMockCDCService();
  const service = new NodeLifecycleService({
    nodeId: 'test-node',
    cdcIntegrationService: mockCDC,
  });
  service.initialize();

  await service.registerNode({node_id: 'n1', node_address: 'addr1'});
  t.equal(service.getKnownNodes().size, 1, 'should have 1 node');

  service.shutdown();

  t.equal(service.isInitialized(), false, 'should not be initialized');
  t.equal(service.getKnownNodes().size, 0, 'should clear known nodes');
  t.end();
});

test('NodeLifecycleService - NodeLifecycleStatus values', async (t) => {
  t.equal(NodeLifecycleStatus.ACTIVE, 'active', 'should have active');
  t.equal(NodeLifecycleStatus.SUSPECTED, 'suspected', 'should have suspected');
  t.equal(NodeLifecycleStatus.FAILED, 'failed', 'should have failed');
  t.equal(NodeLifecycleStatus.SHUTTING_DOWN, 'shutting_down', 'should have shutting_down');
  t.equal(NodeLifecycleStatus.STOPPED, 'stopped', 'should have stopped');
  t.end();
});
