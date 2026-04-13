/**
 * Tests for NodeReintegrationService.
 * Requirements: 14.4
 */
// @ts-nocheck


import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import {
  NodeReintegrationService,
  NodeStatus,
  ReintegrationStatus,
} from '../../src/node/node-reintegration-service.js';
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
      return {
        success: true,
        partitionResult: {affectedRows: 1},
        mutation,
        options,
      };
    },
  };
}

/**
 * Create a mock system table cache for testing.
 * @param {Object} data - Initial cache data.
 * @return {Object} Mock system table cache.
 */
function createMockCache(data = {}) {
  const cache = {
    nodes: data.nodes || [],
  };

  return {
    getAll(tableName) {
      return cache[tableName] || [];
    },
    filter(tableName, predicate) {
      const items = cache[tableName] || [];
      return items.filter(predicate);
    },
    get(tableName, id) {
      const items = cache[tableName] || [];
      return items.find((item) => item.id === id || item.node_id === id);
    },
    // Allow tests to update cache
    setNodes(nodes) {
      cache.nodes = nodes;
    },
  };
}

test('NodeReintegrationService - constructor', async (t) => {
  const service = new NodeReintegrationService({
    nodeId: 'test-node',
  });

  t.equal(service.nodeId, 'test-node', 'should set nodeId');
  t.equal(service.isInitialized(), false, 'should not be initialized');
  t.equal(service.isRunning(), false, 'should not be running');
  t.end();
});

test('NodeReintegrationService - initialize', async (t) => {
  const mockCDC = createMockCDCService();
  const mockCache = createMockCache();
  const service = new NodeReintegrationService({
    nodeId: 'test-node',
    systemTableCache: mockCache,
    cdcIntegrationService: mockCDC,
  });

  service.initialize();

  t.equal(service.isInitialized(), true, 'should be initialized');
  t.end();
});

test('NodeReintegrationService - initialize accepts control-plane mutation gateway',
  async (t) => {
    const mockCache = createMockCache();
    const mockGateway = createMockMutationGateway();
    const service = new NodeReintegrationService({
      nodeId: 'test-node',
      systemTableCache: mockCache,
      controlPlaneSystemTableGateway: mockGateway,
    });

    service.initialize();

    t.equal(service.isInitialized(), true, 'should initialize with mutation gateway');
  });

test('NodeReintegrationService - initialize requires nodeId', async (t) => {
  const service = new NodeReintegrationService({});

  try {
    service.initialize();
    t.fail('should throw error');
  } catch (error) {
    t.ok(error.message.includes('requires nodeId'), 'should have error message');
  }
  t.end();
});

test('NodeReintegrationService - start and stop', async (t) => {
  const mockCDC = createMockCDCService();
  const mockCache = createMockCache();
  const service = new NodeReintegrationService({
    nodeId: 'test-node',
    systemTableCache: mockCache,
    cdcIntegrationService: mockCDC,
  });
  service.initialize();

  service.start();
  t.equal(service.isRunning(), true, 'should be running after start');

  service.stop();
  t.equal(service.isRunning(), false, 'should not be running after stop');
  t.end();
});

test('NodeReintegrationService - idle cadence backs off and resets on activity',
  async (t) => {
    const mockCDC = createMockCDCService();
    const now = Date.now();
    const mockCache = createMockCache({
      nodes: [
        {
          node_id: 'node-1',
          status: NodeStatus.ACTIVE,
          last_heartbeat: now - 500,
        },
      ],
    });
    const service = new NodeReintegrationService({
      nodeId: 'test-node',
      systemTableCache: mockCache,
      cdcIntegrationService: mockCDC,
    });
    service.initialize();

    const idleSummary = await service.checkRecoveringNodes();
    service.updateCheckCadence(idleSummary);
    t.ok(
      service.currentCheckIntervalMs > service.checkIntervalMs,
      'should increase interval after idle cycle',
    );

    service.updateCheckCadence({hadActivity: true});
    t.equal(
      service.currentCheckIntervalMs,
      service.checkIntervalMs,
      'should reset interval to base when activity is detected',
    );
    t.end();
  });

test('NodeReintegrationService - start requires initialization', async (t) => {
  const service = new NodeReintegrationService({
    nodeId: 'test-node',
  });

  try {
    service.start();
    t.fail('should throw error');
  } catch (error) {
    t.ok(error.message.includes('not initialized'), 'should have error message');
  }
  t.end();
});

test('NodeReintegrationService - reintegrates recovering node', async (t) => {
  const mockCDC = createMockCDCService();
  const now = Date.now();

  const mockCache = createMockCache({
    nodes: [
      {
        node_id: 'node-1',
        status: NodeStatus.RECOVERING,
        last_heartbeat: now - 1000, // Recent heartbeat
        recovered_at: now - 5000,
      },
    ],
  });

  const service = new NodeReintegrationService({
    nodeId: 'test-node',
    systemTableCache: mockCache,
    cdcIntegrationService: mockCDC,
  });

  // Use minimal health checks for testing
  service.healthCheckCount = 1;
  service.healthCheckIntervalMs = 10;

  service.initialize();

  const events = [];
  service.on('nodeReintegrated', (e) => events.push({type: 'reintegrated', ...e}));
  service.on('triggerRebalancing', (e) => events.push({type: 'rebalancing', ...e}));

  await service.checkRecoveringNodes();

  // Allow microtasks to complete
  await Promise.resolve();

  t.ok(events.some((e) => e.type === 'reintegrated'),
    'should emit nodeReintegrated event');
  t.ok(events.some((e) => e.type === 'rebalancing'),
    'should emit triggerRebalancing event');

  // Check CDC operation
  const updateOps = mockCDC.operations.filter((op) =>
    op.type === 'update' && op.tableName === SYSTEM_TABLE_NAME.NODES,
  );
  t.ok(updateOps.length > 0, 'should have update operation');
  t.ok(updateOps.some((op) => op.data.status === NodeStatus.ACTIVE),
    'should update status to active');

  // Clean up
  service.shutdown();
  t.end();
});

test('NodeReintegrationService - routes reintegration writes through control-plane ingress',
  async (t) => {
    const now = Date.now();
    const mockCache = createMockCache();
    const mockGateway = createMockMutationGateway();
    const service = new NodeReintegrationService({
      nodeId: 'test-node',
      systemTableCache: mockCache,
      controlPlaneSystemTableGateway: mockGateway,
    });
    service.initialize();

    await service.completeReintegration({
      node_id: 'node-1',
      status: NodeStatus.RECOVERING,
      last_heartbeat: now - 1000,
      recovered_at: now - 5000,
    });

    t.equal(mockGateway.operations.length, 1, 'should submit one mutation');
    t.equal(mockGateway.operations[0].operation, 'update', 'should use update mutation');
    t.equal(
      mockGateway.operations[0].options.deliveryPriority,
      'critical',
      'reintegration completion should use the control-plane critical lane',
    );
    service.shutdown();
  });

test('NodeReintegrationService - skips self node', async (t) => {
  const mockCDC = createMockCDCService();
  const now = Date.now();

  const mockCache = createMockCache({
    nodes: [
      {
        node_id: 'test-node', // Same as service nodeId
        status: NodeStatus.RECOVERING,
        last_heartbeat: now - 1000,
        recovered_at: now - 5000,
      },
    ],
  });

  const service = new NodeReintegrationService({
    nodeId: 'test-node',
    systemTableCache: mockCache,
    cdcIntegrationService: mockCDC,
  });
  service.initialize();

  await service.checkRecoveringNodes();

  t.equal(mockCDC.operations.length, 0, 'should not process self node');
  t.end();
});

test('NodeReintegrationService - skips non-recovering nodes', async (t) => {
  const mockCDC = createMockCDCService();
  const now = Date.now();

  const mockCache = createMockCache({
    nodes: [
      {
        node_id: 'node-1',
        status: NodeStatus.ACTIVE, // Not recovering
        last_heartbeat: now - 1000,
      },
      {
        node_id: 'node-2',
        status: NodeStatus.FAILED, // Not recovering
        last_heartbeat: now - 60000,
      },
    ],
  });

  const service = new NodeReintegrationService({
    nodeId: 'test-node',
    systemTableCache: mockCache,
    cdcIntegrationService: mockCDC,
  });
  service.initialize();

  await service.checkRecoveringNodes();

  t.equal(mockCDC.operations.length, 0, 'should not process non-recovering nodes');
  t.end();
});

test('NodeReintegrationService - fails reintegration on stale heartbeat', async (t) => {
  const mockCDC = createMockCDCService();
  const now = Date.now();

  const mockCache = createMockCache({
    nodes: [
      {
        node_id: 'node-1',
        status: NodeStatus.RECOVERING,
        last_heartbeat: now - 30000, // Stale heartbeat (> 10s)
        recovered_at: now - 5000,
      },
    ],
  });

  const service = new NodeReintegrationService({
    nodeId: 'test-node',
    systemTableCache: mockCache,
    cdcIntegrationService: mockCDC,
  });

  // Use minimal health checks for testing
  service.healthCheckCount = 1;
  service.healthCheckIntervalMs = 10;

  service.initialize();

  const events = [];
  service.on('reintegrationFailed', (e) => events.push(e));

  await service.checkRecoveringNodes();

  // Allow microtasks to complete
  await Promise.resolve();

  t.equal(events.length, 1, 'should emit reintegrationFailed event');
  t.equal(events[0].nodeId, 'node-1', 'should have correct nodeId');
  t.equal(events[0].reason, 'health_check_failed', 'should have correct reason');

  // Check that node was marked as failed
  const updateOps = mockCDC.operations.filter((op) =>
    op.type === 'update' &&
    op.tableName === SYSTEM_TABLE_NAME.NODES &&
    op.data.status === NodeStatus.FAILED,
  );
  t.ok(updateOps.length > 0, 'should mark node as failed');

  // Clean up
  service.shutdown();
  t.end();
});

test('NodeReintegrationService - skips stale reintegration completion overwrite',
  async (t) => {
    const now = Date.now();
    let attemptedWhereClause = null;
    const mockCDC = {
      operations: [],
      async updateSystemTableRow(tableName, whereClause, data) {
        attemptedWhereClause = whereClause;
        this.operations.push({type: 'update', tableName, whereClause, data});
        return {
          success: true,
          partitionResult: {affectedRows: 0},
        };
      },
    };
    const mockCache = createMockCache();
    const service = new NodeReintegrationService({
      nodeId: 'test-node',
      systemTableCache: mockCache,
      cdcIntegrationService: mockCDC,
    });
    service.initialize();

    const node = {
      node_id: 'node-1',
      status: NodeStatus.RECOVERING,
      last_heartbeat: now - 1000,
      recovered_at: now - 5000,
    };
    service.pendingReintegrations.set('node-1', {
      status: ReintegrationStatus.IN_PROGRESS,
      startedAt: now - 1000,
    });
    const events = [];
    service.on('nodeReintegrated', (event) => events.push(event));

    await service.completeReintegration(node);

    t.same(
      attemptedWhereClause,
      {
        node_id: 'node-1',
        status: NodeStatus.RECOVERING,
        last_heartbeat: node.last_heartbeat,
        recovered_at: node.recovered_at,
      },
      'reintegration guard should target the observed recovering node snapshot',
    );
    t.equal(events.length, 0, 'guard miss should suppress reintegration event');
    t.equal(service.reintegrationCount, 0, 'guard miss should not increment reintegration count');
    t.equal(
      service.pendingReintegrations.get('node-1')?.status,
      ReintegrationStatus.IN_PROGRESS,
      'guard miss should keep pending reintegration in progress',
    );

    service.shutdown();
    t.end();
  });

test('NodeReintegrationService - getStats', async (t) => {
  const mockCache = createMockCache();
  const mockCDC = createMockCDCService();

  const service = new NodeReintegrationService({
    nodeId: 'test-node',
    systemTableCache: mockCache,
    cdcIntegrationService: mockCDC,
  });
  service.initialize();

  const stats = service.getStats();

  t.equal(stats.nodeId, 'test-node', 'should have nodeId');
  t.ok(stats.checkIntervalMs > 0, 'should have checkIntervalMs');
  t.ok(stats.healthCheckCount > 0, 'should have healthCheckCount');
  t.equal(stats.pendingReintegrations, 0, 'should have no pending reintegrations');
  t.equal(stats.reintegrationCount, 0, 'should have zero reintegration count');
  t.equal(stats.isRunning, false, 'should not be running');
  t.equal(stats.initialized, true, 'should be initialized');
  t.end();
});

test('NodeReintegrationService - getPendingReintegrations', async (t) => {
  const mockCache = createMockCache();
  const mockCDC = createMockCDCService();

  const service = new NodeReintegrationService({
    nodeId: 'test-node',
    systemTableCache: mockCache,
    cdcIntegrationService: mockCDC,
  });
  service.initialize();

  const pending = service.getPendingReintegrations();

  t.ok(Array.isArray(pending), 'should return array');
  t.equal(pending.length, 0, 'should be empty initially');
  t.end();
});

test('NodeReintegrationService - shutdown', async (t) => {
  const mockCache = createMockCache();
  const mockCDC = createMockCDCService();

  const service = new NodeReintegrationService({
    nodeId: 'test-node',
    systemTableCache: mockCache,
    cdcIntegrationService: mockCDC,
  });
  service.initialize();
  service.start();

  t.equal(service.isRunning(), true, 'should be running');

  service.shutdown();

  t.equal(service.isRunning(), false, 'should not be running');
  t.equal(service.isInitialized(), false, 'should not be initialized');
  t.end();
});

test('NodeReintegrationService - NodeStatus values', async (t) => {
  t.equal(NodeStatus.ACTIVE, 'active', 'should have active');
  t.equal(NodeStatus.SUSPECTED, 'suspected', 'should have suspected');
  t.equal(NodeStatus.FAILED, 'failed', 'should have failed');
  t.equal(NodeStatus.RECOVERING, 'recovering', 'should have recovering');
  t.end();
});

test('NodeReintegrationService - ReintegrationStatus values', async (t) => {
  t.equal(ReintegrationStatus.PENDING, 'pending', 'should have pending');
  t.equal(ReintegrationStatus.IN_PROGRESS, 'in_progress', 'should have in_progress');
  t.equal(ReintegrationStatus.COMPLETED, 'completed', 'should have completed');
  t.equal(ReintegrationStatus.FAILED, 'failed', 'should have failed');
  t.end();
});
