/**
 * Tests for NodeLifecycleService.
 *
 * NodeLifecycleService is a write-only helper for node registration,
 * heartbeat updates, and node removal. Failure detection is owned
 * solely by FailureDetector.
 *
 * Requirements: 5.6, 5.7, 5.8
 */

import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import {
  NodeLifecycleService,
  NodeLifecycleStatus,
} from '../../src/node/node-lifecycle-service.js';
import {SYSTEM_TABLE_NAME} from '../../src/bootstrap/system-table-schemas-constants.js';
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

function createMockMutationGateway() {
  const operations = [];
  return {
    operations,
    async submitMutation(mutation, options = {}) {
      operations.push({...mutation, options});
      return {success: true, mutation, options};
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

test('NodeLifecycleService - initialize accepts control-plane mutation gateway',
  async (t) => {
    const mockGateway = createMockMutationGateway();
    const service = new NodeLifecycleService({
      nodeId: 'test-node',
      controlPlaneSystemTableGateway: mockGateway,
    });

    service.initialize();

    t.equal(service.isInitialized(), true, 'should initialize with mutation gateway');
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
    SYSTEM_TABLE_NAME.NODES,
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
    SYSTEM_TABLE_NAME.NODES,
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

test('NodeLifecycleService - routes writes through control-plane mutation ingress',
  async (t) => {
    const mockGateway = createMockMutationGateway();
    const service = new NodeLifecycleService({
      nodeId: 'test-node',
      controlPlaneSystemTableGateway: mockGateway,
    });
    service.initialize();

    await service.updateHeartbeat('node-1');

    t.equal(mockGateway.operations.length, 1, 'should submit one mutation');
    t.equal(mockGateway.operations[0].operation, 'update', 'should use update mutation');
    t.equal(
      mockGateway.operations[0].tableName,
      SYSTEM_TABLE_NAME.NODES,
      'should target the nodes table through one ingress',
    );
    t.equal(
      mockGateway.operations[0].options.allowPressureDefer,
      true,
      'heartbeat writes should opt into gateway defer handling',
    );
  });

test('NodeLifecycleService - emits events for write operations', async (t) => {
  const mockCDC = createMockCDCService();
  const service = new NodeLifecycleService({
    nodeId: 'test-node',
    cdcIntegrationService: mockCDC,
  });
  service.initialize();

  const events = [];
  service.on('nodeRegistered', (e) => events.push({type: 'registered', ...e}));
  service.on('heartbeatUpdated', (e) => events.push({type: 'heartbeat', ...e}));
  service.on('nodeRemoved', (e) => events.push({type: 'removed', ...e}));

  await service.registerNode({node_id: 'n1', node_address: 'addr1'});
  await service.updateHeartbeat('n1');
  await service.removeNode('n1');

  t.equal(events.length, 3, 'should emit 3 events');
  t.equal(events[0].type, 'registered', 'should emit registered');
  t.equal(events[1].type, 'heartbeat', 'should emit heartbeat');
  t.equal(events[2].type, 'removed', 'should emit removed');
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

  service.shutdown();

  t.equal(service.isInitialized(), false, 'should not be initialized');
  t.end();
});

test('NodeLifecycleService - NodeLifecycleStatus values', async (t) => {
  t.equal(NodeLifecycleStatus.ACTIVE, 'active', 'should have active');
  t.equal(NodeLifecycleStatus.SUSPECTED, 'suspected', 'should have suspected');
  t.equal(NodeLifecycleStatus.FAILED, 'failed', 'should have failed');
  t.equal(
    NodeLifecycleStatus.SHUTTING_DOWN,
    'shutting_down',
    'should have shutting_down',
  );
  t.equal(NodeLifecycleStatus.STOPPED, 'stopped', 'should have stopped');
  t.end();
});

test('NodeLifecycleService - does not have failure detection methods', async (t) => {
  const mockCDC = createMockCDCService();
  const service = new NodeLifecycleService({
    nodeId: 'test-node',
    cdcIntegrationService: mockCDC,
  });

  t.equal(
    typeof service.detectFailedNodes,
    'undefined',
    'should not have detectFailedNodes',
  );
  t.equal(
    typeof service.startFailureDetection,
    'undefined',
    'should not have startFailureDetection',
  );
  t.equal(
    typeof service.stopFailureDetection,
    'undefined',
    'should not have stopFailureDetection',
  );
  t.equal(
    typeof service.markNodeFailed,
    'undefined',
    'should not have markNodeFailed',
  );
  t.equal(
    typeof service.markNodeSuspected,
    'undefined',
    'should not have markNodeSuspected',
  );
  t.equal(
    typeof service.markNodeActive,
    'undefined',
    'should not have markNodeActive',
  );
  t.equal(
    typeof service.getKnownNodes,
    'undefined',
    'should not have getKnownNodes',
  );
  t.end();
});

test('NodeLifecycleService - does not have failure detection fields', async (t) => {
  const service = new NodeLifecycleService({
    nodeId: 'test-node',
  });

  t.equal(service.knownNodes, undefined, 'should not have knownNodes');
  t.equal(
    service.failureDetectionTimer,
    undefined,
    'should not have failureDetectionTimer',
  );
  t.equal(
    service.heartbeatTimeoutMs,
    undefined,
    'should not have heartbeatTimeoutMs',
  );
  t.equal(
    service.failureDetectionIntervalMs,
    undefined,
    'should not have failureDetectionIntervalMs',
  );
  t.end();
});
