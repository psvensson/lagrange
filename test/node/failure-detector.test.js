/**
 * Tests for FailureDetector.
 * Requirements: 14.1
 */

import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import {FailureDetector} from '../../src/node/failure-detector.js';
import {NODE_STATUS as NodeStatus} from '../../src/node/node-constants.js';
import {FAILURE_DETECTOR_SQL} from '../../src/node/node-constants.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {SystemTableName} from '../../src/bootstrap/system-table-schemas-constants.js';
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

/**
 * Create a mock system table cache as a SQL query engine for testing.
 * @param {Object} data - Initial cache data.
 * @return {Object} Mock SQL query engine.
 */
function createMockSqlEngine(data = {}) {
  const cache = {
    nodes: data.nodes || [],
    services: data.services || [],
  };

  return {
    async executeQuery(sql, params = []) {
      if (sql === FAILURE_DETECTOR_SQL.SELECT_ALL_NODES) {
        return {rows: cache.nodes, success: true};
      }
      if (sql === FAILURE_DETECTOR_SQL.SELECT_SERVICES_BY_NODE_AND_TYPE) {
        const nodeId = params[0];
        const serviceType = params[1];
        const filtered = cache.services.filter(
          (s) => s.node_id === nodeId && s.service_type === serviceType,
        );
        return {rows: filtered, success: true};
      }
      return {rows: [], success: true};
    },
    // Allow tests to update cache
    setNodes(nodes) {
      cache.nodes = nodes;
    },
    setServices(services) {
      cache.services = services;
    },
  };
}

test('FailureDetector - constructor', async (t) => {
  const detector = new FailureDetector({
    nodeId: 'test-node',
  });

  t.equal(detector.nodeId, 'test-node', 'should set nodeId');
  t.equal(detector.isInitialized(), false, 'should not be initialized');
  t.equal(detector.isRunning(), false, 'should not be running');
  t.end();
});

test('FailureDetector - initialize', async (t) => {
  const mockCDC = createMockCDCService();
  const mockEngine = createMockSqlEngine();
  const detector = new FailureDetector({
    nodeId: 'test-node',
    sqlQueryEngine: mockEngine,
    cdcIntegrationService: mockCDC,
  });

  detector.initialize();

  t.equal(detector.isInitialized(), true, 'should be initialized');
  t.end();
});

test('FailureDetector - initialize requires nodeId', async (t) => {
  const detector = new FailureDetector({});

  try {
    detector.initialize();
    t.fail('should throw error');
  } catch (error) {
    t.ok(error.message.includes('requires nodeId'), 'should have error message');
  }
  t.end();
});

test('FailureDetector - start and stop', async (t) => {
  const mockCDC = createMockCDCService();
  const mockEngine = createMockSqlEngine();
  const detector = new FailureDetector({
    nodeId: 'test-node',
    sqlQueryEngine: mockEngine,
    cdcIntegrationService: mockCDC,
  });
  detector.initialize();

  detector.start();
  t.equal(detector.isRunning(), true, 'should be running after start');

  detector.stop();
  t.equal(detector.isRunning(), false, 'should not be running after stop');
  t.end();
});

test('FailureDetector - adaptive reset timer is demand-driven', async (t) => {
  const mockCDC = createMockCDCService();
  const mockEngine = createMockSqlEngine();
  const detector = new FailureDetector({
    nodeId: 'test-node',
    sqlQueryEngine: mockEngine,
    cdcIntegrationService: mockCDC,
  });
  detector.initialize();

  detector.start();
  t.equal(detector.adaptiveResetTimer, null,
    'should not schedule reset timer before failures');

  await detector.checkFlapping('node-1', Date.now());
  t.ok(detector.adaptiveResetTimer,
    'should start reset timer once failures are tracked');

  detector.stop();
  t.equal(detector.adaptiveResetTimer, null, 'should clear reset timer on stop');
  t.end();
});

test('FailureDetector - start requires initialization', async (t) => {
  const detector = new FailureDetector({
    nodeId: 'test-node',
  });

  try {
    detector.start();
    t.fail('should throw error');
  } catch (error) {
    t.ok(error.message.includes('not initialized'), 'should have error message');
  }
  t.end();
});

test('FailureDetector - detects node suspicion', async (t) => {
  const mockCDC = createMockCDCService();
  const now = Date.now();

  const mockEngine = createMockSqlEngine({
    nodes: [
      {
        node_id: 'node-1',
        status: NodeStatus.ACTIVE,
        last_heartbeat: now - 12000, // 12 seconds ago (> 10s suspicion threshold)
      },
    ],
  });

  const detector = new FailureDetector({
    nodeId: 'test-node',
    sqlQueryEngine: mockEngine,
    cdcIntegrationService: mockCDC,
  });
  detector.initialize();

  const events = [];
  detector.on('nodeSuspected', (e) => events.push(e));

  await detector.checkNodeHealth();

  t.equal(events.length, 1, 'should emit nodeSuspected event');
  t.equal(events[0].nodeId, 'node-1', 'should have correct nodeId');
  t.equal(mockCDC.operations.length, 1, 'should have one CDC operation');
  t.equal(mockCDC.operations[0].data.status, NodeStatus.SUSPECTED,
    'should update status to suspected');
  t.end();
});

test('FailureDetector - skips stale suspicion overwrite when heartbeat advanced after snapshot',
  async (t) => {
    const now = Date.now();
    const observedNode = {
      node_id: 'node-1',
      status: NodeStatus.ACTIVE,
      last_heartbeat: now - 12000,
    };
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
      async deleteSystemTableRow() {
        t.fail('stale suspicion guard miss should not delete rows');
      },
    };

    const mockEngine = createMockSqlEngine({
      nodes: [observedNode],
    });

    const detector = new FailureDetector({
      nodeId: 'test-node',
      sqlQueryEngine: mockEngine,
      cdcIntegrationService: mockCDC,
    });
    detector.initialize();

    const events = [];
    detector.on('nodeSuspected', (event) => events.push(event));

    await detector.checkNodeHealth();

    t.same(
      attemptedWhereClause,
      {
        node_id: 'node-1',
        status: NodeStatus.ACTIVE,
        last_heartbeat: observedNode.last_heartbeat,
      },
      'suspicion guard should target the observed node snapshot',
    );
    t.equal(events.length, 0, 'guard miss should suppress stale suspicion event');
    t.equal(mockCDC.operations.length, 1, 'should attempt one guarded update');
    t.end();
  });

test('FailureDetector - detects node failure', async (t) => {
  const mockCDC = createMockCDCService();
  const now = Date.now();

  const mockEngine = createMockSqlEngine({
    nodes: [
      {
        node_id: 'node-1',
        status: NodeStatus.SUSPECTED, // Already suspected
        last_heartbeat: now - 20000, // 20 seconds ago (> 15s failure threshold)
      },
    ],
    services: [],
  });

  const detector = new FailureDetector({
    nodeId: 'test-node',
    sqlQueryEngine: mockEngine,
    cdcIntegrationService: mockCDC,
  });
  detector.initialize();

  const events = [];
  detector.on('nodeFailure', (e) => events.push(e));

  await detector.checkNodeHealth();

  t.equal(events.length, 1, 'should emit nodeFailure event');
  t.equal(events[0].nodeId, 'node-1', 'should have correct nodeId');
  t.ok(mockCDC.operations.some((op) =>
    op.data.status === NodeStatus.FAILED,
  ), 'should update status to failed');
  t.end();
});

test('FailureDetector - marks replicas as failed on node failure', async (t) => {
  const mockCDC = createMockCDCService();
  const now = Date.now();

  const mockEngine = createMockSqlEngine({
    nodes: [
      {
        node_id: 'node-1',
        status: NodeStatus.SUSPECTED,
        last_heartbeat: now - 20000,
      },
    ],
    services: [
      {
        service_id: 'service-1',
        node_id: 'node-1',
        service_type: 'partition',
        partition_id: 'partition-1',
        status: ReplicaStatus.ACTIVE,
      },
      {
        service_id: 'service-2',
        node_id: 'node-1',
        service_type: 'message_group_replica',
        group_id: 'group-1',
        status: ReplicaStatus.ACTIVE,
      },
      {
        service_id: 'service-3',
        node_id: 'node-2', // Different node, should not be affected
        service_type: 'partition',
        partition_id: 'partition-2',
        status: ReplicaStatus.ACTIVE,
      },
    ],
  });

  const detector = new FailureDetector({
    nodeId: 'test-node',
    sqlQueryEngine: mockEngine,
    cdcIntegrationService: mockCDC,
  });
  detector.initialize();

  const replicaEvents = [];
  detector.on('replicaFailed', (e) => replicaEvents.push(e));

  await detector.checkNodeHealth();

  t.equal(replicaEvents.length, 2, 'should emit 2 replicaFailed events');
  t.ok(replicaEvents.some((e) => e.serviceId === 'service-1'),
    'should mark partition replica as failed');
  t.ok(replicaEvents.some((e) => e.serviceId === 'service-2'),
    'should mark message group replica as failed');

  // Check CDC operations for replica updates
  const replicaUpdates = mockCDC.operations.filter((op) =>
    op.tableName === SystemTableName.SERVICES &&
    op.data.status === ReplicaStatus.FAILED,
  );
  t.equal(replicaUpdates.length, 2, 'should have 2 replica status updates');
  t.end();
});

test('FailureDetector - detects node recovery', async (t) => {
  const mockCDC = createMockCDCService();
  const now = Date.now();

  const mockEngine = createMockSqlEngine({
    nodes: [
      {
        node_id: 'node-1',
        status: NodeStatus.FAILED,
        last_heartbeat: now - 5000, // Recent heartbeat (recovered)
        failed_at: now - 60000,
      },
    ],
  });

  const detector = new FailureDetector({
    nodeId: 'test-node',
    sqlQueryEngine: mockEngine,
    cdcIntegrationService: mockCDC,
  });
  detector.initialize();

  const events = [];
  detector.on('nodeRecovery', (e) => events.push(e));

  await detector.checkNodeHealth();

  t.equal(events.length, 1, 'should emit nodeRecovery event');
  t.equal(events[0].nodeId, 'node-1', 'should have correct nodeId');
  t.ok(mockCDC.operations.some((op) =>
    op.data.status === NodeStatus.RECOVERING,
  ), 'should update status to recovering');
  t.end();
});

test('FailureDetector - skips self node', async (t) => {
  const mockCDC = createMockCDCService();
  const now = Date.now();

  const mockEngine = createMockSqlEngine({
    nodes: [
      {
        node_id: 'test-node', // Same as detector's nodeId
        status: NodeStatus.ACTIVE,
        last_heartbeat: now - 20000, // Would trigger failure if not skipped
      },
    ],
  });

  const detector = new FailureDetector({
    nodeId: 'test-node',
    sqlQueryEngine: mockEngine,
    cdcIntegrationService: mockCDC,
  });
  detector.initialize();

  await detector.checkNodeHealth();

  t.equal(mockCDC.operations.length, 0, 'should not update self node');
  t.end();
});

test('FailureDetector - skips already failed nodes', async (t) => {
  const mockCDC = createMockCDCService();
  const now = Date.now();

  const mockEngine = createMockSqlEngine({
    nodes: [
      {
        node_id: 'node-1',
        status: NodeStatus.FAILED, // Already failed
        last_heartbeat: now - 60000, // Very old heartbeat
      },
    ],
  });

  const detector = new FailureDetector({
    nodeId: 'test-node',
    sqlQueryEngine: mockEngine,
    cdcIntegrationService: mockCDC,
  });
  detector.initialize();

  await detector.checkNodeHealth();

  t.equal(mockCDC.operations.length, 0, 'should not update already failed node');
  t.end();
});

test('FailureDetector - healthy nodes are not affected', async (t) => {
  const mockCDC = createMockCDCService();
  const now = Date.now();

  const mockEngine = createMockSqlEngine({
    nodes: [
      {
        node_id: 'node-1',
        status: NodeStatus.ACTIVE,
        last_heartbeat: now - 3000, // Recent heartbeat (healthy)
      },
    ],
  });

  const detector = new FailureDetector({
    nodeId: 'test-node',
    sqlQueryEngine: mockEngine,
    cdcIntegrationService: mockCDC,
  });
  detector.initialize();

  await detector.checkNodeHealth();

  t.equal(mockCDC.operations.length, 0, 'should not update healthy node');
  t.end();
});

test('FailureDetector - getStats', async (t) => {
  const mockCDC = createMockCDCService();
  const mockEngine = createMockSqlEngine();
  const detector = new FailureDetector({
    nodeId: 'test-node',
    sqlQueryEngine: mockEngine,
    cdcIntegrationService: mockCDC,
  });
  detector.initialize();

  const stats = detector.getStats();

  t.equal(stats.nodeId, 'test-node', 'should have nodeId');
  t.ok(stats.checkIntervalMs > 0, 'should have checkIntervalMs');
  t.ok(stats.currentFailureThreshold > 0, 'should have currentFailureThreshold');
  t.equal(stats.isRunning, false, 'should not be running');
  t.equal(stats.initialized, true, 'should be initialized');
  t.end();
});

test('FailureDetector - shutdown', async (t) => {
  const mockCDC = createMockCDCService();
  const mockEngine = createMockSqlEngine();
  const detector = new FailureDetector({
    nodeId: 'test-node',
    sqlQueryEngine: mockEngine,
    cdcIntegrationService: mockCDC,
  });
  detector.initialize();
  detector.start();

  t.equal(detector.isRunning(), true, 'should be running');

  detector.shutdown();

  t.equal(detector.isRunning(), false, 'should not be running');
  t.equal(detector.isInitialized(), false, 'should not be initialized');
  t.end();
});

test('FailureDetector - NodeStatus values', async (t) => {
  t.equal(NodeStatus.ACTIVE, 'active', 'should have active');
  t.equal(NodeStatus.SUSPECTED, 'suspected', 'should have suspected');
  t.equal(NodeStatus.FAILED, 'failed', 'should have failed');
  t.equal(NodeStatus.RECOVERING, 'recovering', 'should have recovering');
  t.end();
});

test('FailureDetector - ReplicaStatus values', async (t) => {
  t.equal(ReplicaStatus.PENDING, 'pending', 'should have pending');
  t.equal(ReplicaStatus.CREATING, 'creating', 'should have creating');
  t.equal(ReplicaStatus.SYNCING, 'syncing', 'should have syncing');
  t.equal(ReplicaStatus.ACTIVE, 'active', 'should have active');
  t.equal(ReplicaStatus.REMOVING, 'removing', 'should have removing');
  t.equal(ReplicaStatus.REMOVED, 'removed', 'should have removed');
  t.equal(ReplicaStatus.FAILED, 'failed', 'should have failed');
  t.end();
});
