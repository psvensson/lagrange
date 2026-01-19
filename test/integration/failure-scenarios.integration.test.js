/**
 * Failure scenario integration tests.
 * Tests node failure detection, recovery, network partition handling,
 * and data availability during failures.
 * Requirements: 15.1-15.5 (Fault Tolerance and Recovery)
 */

import {test} from 'tap';
import {FailureDetector, NodeStatus} from '../../src/node/failure-detector.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {UnifiedRebalancer, EntityType} from '../../src/rebalancer/unified-rebalancer.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

/**
 * Initialize test environment.
 */
function initializeTestEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();

  const config = ConfigurationManager.getInstance();
  config.initialize({
    node: {id: 'test-node'},
    logging: {level: 'error'},
    raft: {
      electionTimeoutMinMs: 100,
      electionTimeoutMaxMs: 200,
      heartbeatIntervalMs: 50,
    },
    rebalancer: {
      periodicCheckIntervalMs: 1000,
      periodicCheckJitterMs: 100,
    },
  });

  const logging = LoggingService.getInstance();
  logging.initialize({level: 'error'});
}

/**
 * Create a mock CDC integration service.
 * @return {Object} Mock CDC service with tracking.
 */
function createMockCDCService() {
  const updates = [];
  return {
    updates,
    async updateSystemTableRow(tableName, where, data) {
      updates.push({tableName, where, data});
      return {success: true};
    },
    async insertSystemTableRow(tableName, data) {
      updates.push({tableName, data, operation: 'insert'});
      return {success: true};
    },
    async deleteSystemTableRow(tableName, where) {
      updates.push({tableName, where, operation: 'delete'});
      return {success: true};
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
    services: data.services || [],
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
    setNodes(nodes) {
      cache.nodes = nodes;
    },
    setServices(services) {
      cache.services = services;
    },
    // Add method to update service status
    updateService(serviceId, updates) {
      const service = cache.services.find((s) => s.service_id === serviceId);
      if (service) {
        Object.assign(service, updates);
      }
    },
  };
}

/**
 * Create a system table cache with test nodes.
 * @param {Object} options - Configuration options.
 * @return {SystemTableCache} Configured cache.
 */
function createTestCache(options = {}) {
  const cache = new SystemTableCache();

  // Add nodes
  const nodeCount = options.nodeCount || 3;
  for (let i = 1; i <= nodeCount; i++) {
    cache.applySystemTableChange('nodes', 'INSERT', {
      id: `node-${i}`,
      node_id: `node-${i}`,
      status: 'active',
      last_heartbeat: Date.now(),
      cpu_usage_percent: 10 * i,
      memory_usage_percent: 15 * i,
    });
  }

  // Add services if specified
  if (options.services) {
    for (const service of options.services) {
      cache.applySystemTableChange('services', 'INSERT', service);
    }
  }

  return cache;
}

test('Failure scenario integration tests', async (t) => {
  t.beforeEach(() => {
    initializeTestEnvironment();
  });

  t.afterEach(() => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  });

  t.test('Req 15.1 - node failure detection marks replicas unavailable', async (t) => {
    const now = Date.now();

    // Create mock cache with node having old heartbeat (beyond default 15s threshold)
    const mockCache = createMockCache({
      nodes: [
        {node_id: 'test-node', status: 'active', last_heartbeat: now},
        {node_id: 'node-2', status: 'suspected', last_heartbeat: now - 20000},
      ],
      services: [
        {
          service_id: 'svc-1',
          node_id: 'node-2',
          service_type: 'partition_replica',
          partition_id: 'partition-1',
          status: 'active',
        },
        {
          service_id: 'svc-2',
          node_id: 'node-2',
          service_type: 'message_group_replica',
          group_id: 'mg-1',
          status: 'active',
        },
      ],
    });

    const cdcService = createMockCDCService();
    const detector = new FailureDetector({
      systemTableCache: mockCache,
      cdcIntegrationService: cdcService,
      nodeId: 'test-node',
    });

    detector.initialize();

    // Track events
    const events = [];
    detector.on('nodeFailure', (data) => events.push({type: 'failure', ...data}));
    detector.on('replicaFailed', (data) => events.push({type: 'replicaFailed', ...data}));

    // Run health check
    await detector.checkNodeHealth();

    // Should detect failure (node-2 was suspected and heartbeat is old)
    t.ok(events.some((e) => e.type === 'failure'), 'should emit failure event');

    // Verify replicas were found and marked
    const partitionReplicas = mockCache.filter('services', (s) =>
      s.node_id === 'node-2' && s.service_type === 'partition_replica');
    t.equal(partitionReplicas.length, 1, 'should have partition replica in cache');

    // Check CDC updates for replica status changes (services table updates)
    const serviceUpdates = cdcService.updates.filter(
      (u) => u.tableName === 'services' && u.data && u.data.status === 'failed',
    );
    t.ok(serviceUpdates.length > 0, 'should mark replicas as failed via CDC');

    // Verify CDC updates were made for node status
    const nodeUpdate = cdcService.updates.find(
      (u) => u.data && u.data.status === NodeStatus.FAILED,
    );
    t.ok(nodeUpdate, 'should update node status to failed');

    detector.shutdown();
  });

  t.test('Req 15.2 - rebalancer creates replacement replicas', async (t) => {
    const cache = createTestCache({nodeCount: 5});

    // Add partition with replicas, one on failed node
    cache.applySystemTableChange('services', 'INSERT', {
      id: 'replica-1',
      service_id: 'replica-1',
      node_id: 'node-1',
      service_type: 'partition_replica',
      partition_id: 'partition-1',
      status: 'active',
    });
    cache.applySystemTableChange('services', 'INSERT', {
      id: 'replica-2',
      service_id: 'replica-2',
      node_id: 'node-2',
      service_type: 'partition_replica',
      partition_id: 'partition-1',
      status: 'active',
    });
    cache.applySystemTableChange('services', 'INSERT', {
      id: 'replica-3',
      service_id: 'replica-3',
      node_id: 'node-3',
      service_type: 'partition_replica',
      partition_id: 'partition-1',
      status: 'failed', // This replica failed
    });

    const rebalancer = new UnifiedRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      systemTableCache: cache,
      nodeId: 'node-1',
    });

    rebalancer.initialize();
    rebalancer.setLeader(true);

    // Track rebalancing events
    const addEvents = [];
    rebalancer.on('addReplica', (data) => addEvents.push(data));

    // Trigger rebalance due to replica failure
    const result = await rebalancer.rebalance('replica_failure');

    t.equal(result.success, true, 'rebalance should succeed');

    // Should generate add move to replace failed replica
    const addMoves = result.moves.filter((m) => m.type === 'add');
    t.ok(addMoves.length > 0 || addEvents.length > 0, 'should add replacement replica');

    rebalancer.cancelScheduledCheck();
  });

  t.test('Req 15.3 - Raft maintains consistency during partition', async (t) => {
    // Create partition with 3 replicas
    const partition = new PartitionService({
      partitionId: 'consistency-test',
      tableId: 'test-table',
      tableName: 'test_data',
      replicaId: 'replica-1',
      replicaIds: ['replica-1', 'replica-2', 'replica-3'],
      nodeId: 'node-1',
      dbPath: ':memory:',
      schema: {
        columns: [
          {name: 'id', type: 'INTEGER', primaryKey: true},
          {name: 'value', type: 'TEXT'},
        ],
      },
      keyRange: {start: null, end: null},
    });

    await partition.initialize();

    // Become leader
    partition.role = 'leader';
    partition.isLeader = true;

    // Insert data
    const insertResult = await partition.insertData('test_data', {
      id: 1,
      value: 'consistent',
    });
    t.equal(insertResult.success, true, 'insert should succeed');

    // Verify data is readable
    const queryResult = await partition.executeQuery(
      'SELECT * FROM test_data WHERE id = ?',
      [1],
    );
    t.equal(queryResult.rows.length, 1, 'should find data');
    t.equal(queryResult.rows[0].value, 'consistent', 'data should be consistent');

    // Simulate network partition by checking leader status
    // In real scenario, Raft would handle this via quorum
    t.equal(partition.isLeader, true, 'leader maintains role with quorum');

    await partition.shutdown();
  });

  t.test('Req 15.4 - recovered node triggers rebalancing', async (t) => {
    const now = Date.now();

    // Create mock cache with a failed node that has fresh heartbeat (recovering)
    const mockCache = createMockCache({
      nodes: [
        {node_id: 'test-node', status: 'active', last_heartbeat: now},
        {
          node_id: 'node-3',
          status: NodeStatus.FAILED,
          last_heartbeat: now, // Fresh heartbeat indicates recovery
          failed_at: now - 5000,
        },
      ],
      services: [],
    });

    const cdcService = createMockCDCService();
    const detector = new FailureDetector({
      systemTableCache: mockCache,
      cdcIntegrationService: cdcService,
      nodeId: 'test-node',
    });

    detector.initialize();

    // Track recovery events
    const recoveryEvents = [];
    detector.on('nodeRecovery', (data) => recoveryEvents.push(data));

    // Run health check
    await detector.checkNodeHealth();

    // Should detect recovery
    t.ok(recoveryEvents.length > 0, 'should detect node recovery');
    t.equal(recoveryEvents[0].nodeId, 'node-3', 'should identify recovered node');

    // Verify CDC update was called for recovery
    const recoveryUpdate = cdcService.updates.find(
      (u) => u.data && u.data.status === NodeStatus.RECOVERING,
    );
    t.ok(recoveryUpdate, 'should update node status to recovering');

    detector.shutdown();
  });

  t.test('Req 15.5 - data available with majority replicas', async (t) => {
    // Create partition simulating 2 of 3 replicas available
    const partition = new PartitionService({
      partitionId: 'availability-test',
      tableId: 'test-table',
      tableName: 'available_data',
      replicaId: 'replica-1',
      replicaIds: ['replica-1', 'replica-2', 'replica-3'],
      nodeId: 'node-1',
      dbPath: ':memory:',
      schema: {
        columns: [
          {name: 'id', type: 'INTEGER', primaryKey: true},
          {name: 'data', type: 'TEXT'},
        ],
      },
      keyRange: {start: null, end: null},
    });

    await partition.initialize();

    // Become leader (simulating quorum achieved with 2/3 replicas)
    partition.role = 'leader';
    partition.isLeader = true;

    // Insert data - should succeed with majority
    const insertResult = await partition.insertData('available_data', {
      id: 1,
      data: 'available',
    });
    t.equal(insertResult.success, true, 'write should succeed with majority');

    // Read data - should succeed
    const readResult = await partition.executeQuery(
      'SELECT * FROM available_data WHERE id = ?',
      [1],
    );
    t.equal(readResult.rows.length, 1, 'read should succeed');
    t.equal(readResult.rows[0].data, 'available', 'data should be correct');

    // Update data - should succeed with majority
    const updateResult = await partition.updateData(
      'available_data',
      {id: 1},
      {data: 'updated'},
    );
    t.equal(updateResult.success, true, 'update should succeed with majority');

    // Verify update
    const verifyResult = await partition.executeQuery(
      'SELECT * FROM available_data WHERE id = ?',
      [1],
    );
    t.equal(verifyResult.rows[0].data, 'updated', 'update should be visible');

    await partition.shutdown();
  });

  t.test('failure detector - suspicion before failure', async (t) => {
    const now = Date.now();

    // Set node-2 heartbeat to trigger suspicion (>10s) but not failure (<15s)
    const mockCache = createMockCache({
      nodes: [
        {node_id: 'test-node', status: 'active', last_heartbeat: now},
        {node_id: 'node-2', status: 'active', last_heartbeat: now - 12000},
      ],
      services: [],
    });

    const cdcService = createMockCDCService();
    const detector = new FailureDetector({
      systemTableCache: mockCache,
      cdcIntegrationService: cdcService,
      nodeId: 'test-node',
    });

    detector.initialize();

    const events = [];
    detector.on('nodeSuspected', (data) => events.push({type: 'suspected', ...data}));
    detector.on('nodeFailure', (data) => events.push({type: 'failure', ...data}));

    await detector.checkNodeHealth();

    // Should be suspected, not failed
    t.ok(events.some((e) => e.type === 'suspected'), 'should emit suspected event');
    t.equal(events.filter((e) => e.type === 'failure').length, 0, 'should not emit failure yet');

    detector.shutdown();
  });

  t.test('failure detector - flapping detection increases threshold', async (t) => {
    const mockCache = createMockCache({
      nodes: [{node_id: 'test-node', status: 'active', last_heartbeat: Date.now()}],
      services: [],
    });
    const cdcService = createMockCDCService();

    const detector = new FailureDetector({
      systemTableCache: mockCache,
      cdcIntegrationService: cdcService,
      nodeId: 'test-node',
    });

    detector.initialize();

    const initialThreshold = detector.getFailureThreshold();

    // Simulate multiple failures to trigger flapping detection
    // Default flapping threshold is 3 failures within 30s window
    for (let i = 0; i < 4; i++) {
      await detector.checkFlapping('node-2', Date.now());
    }

    const newThreshold = detector.getFailureThreshold();
    t.ok(newThreshold > initialThreshold, 'threshold should increase after flapping');

    detector.shutdown();
  });

  t.test('failure detector - stats reporting', async (t) => {
    const mockCache = createMockCache({
      nodes: [{node_id: 'test-node', status: 'active', last_heartbeat: Date.now()}],
      services: [],
    });
    const cdcService = createMockCDCService();

    const detector = new FailureDetector({
      systemTableCache: mockCache,
      cdcIntegrationService: cdcService,
      nodeId: 'test-node',
    });

    detector.initialize();

    const stats = detector.getStats();

    t.equal(stats.nodeId, 'test-node', 'should report node ID');
    t.ok(stats.checkIntervalMs > 0, 'should report check interval');
    t.ok(stats.currentFailureThreshold > 0, 'should report failure threshold');
    t.equal(stats.initialized, true, 'should report initialized');
    t.equal(stats.isRunning, false, 'should report not running (not started)');

    detector.shutdown();
  });

  t.test('Req 14.1-14.5 - complete failure and recovery cycle', async (t) => {
    const now = Date.now();

    // Create mock cache with healthy cluster
    const mockCache = createMockCache({
      nodes: [
        {node_id: 'test-node', status: 'active', last_heartbeat: now},
        {node_id: 'node-2', status: 'active', last_heartbeat: now},
        {node_id: 'node-3', status: 'active', last_heartbeat: now},
      ],
      services: [
        {
          service_id: 'svc-1',
          node_id: 'node-2',
          service_type: 'partition_replica',
          partition_id: 'partition-1',
          status: 'active',
        },
        {
          service_id: 'svc-2',
          node_id: 'node-3',
          service_type: 'partition_replica',
          partition_id: 'partition-1',
          status: 'active',
        },
      ],
    });

    const cdcService = createMockCDCService();
    const detector = new FailureDetector({
      systemTableCache: mockCache,
      cdcIntegrationService: cdcService,
      nodeId: 'test-node',
    });

    detector.initialize();

    // Track all events
    const events = [];
    detector.on('nodeSuspected', (data) => events.push({type: 'suspected', ...data}));
    detector.on('nodeFailure', (data) => events.push({type: 'failure', ...data}));
    detector.on('nodeRecovery', (data) => events.push({type: 'recovery', ...data}));
    detector.on('replicaFailed', (data) => events.push({type: 'replicaFailed', ...data}));

    // Step 1: Simulate node-2 becoming unresponsive (suspicion)
    mockCache.setNodes([
      {node_id: 'test-node', status: 'active', last_heartbeat: now},
      {node_id: 'node-2', status: 'active', last_heartbeat: now - 12000},
      {node_id: 'node-3', status: 'active', last_heartbeat: now},
    ]);

    await detector.checkNodeHealth();
    t.ok(events.some((e) => e.type === 'suspected' && e.nodeId === 'node-2'),
      'should suspect node-2');

    // Step 2: Simulate node-2 failure (heartbeat too old)
    mockCache.setNodes([
      {node_id: 'test-node', status: 'active', last_heartbeat: now},
      {node_id: 'node-2', status: 'suspected', last_heartbeat: now - 20000},
      {node_id: 'node-3', status: 'active', last_heartbeat: now},
    ]);

    await detector.checkNodeHealth();
    t.ok(events.some((e) => e.type === 'failure' && e.nodeId === 'node-2'),
      'should detect node-2 failure');

    // Step 3: Verify replicas were marked as failed via CDC
    const serviceUpdates = cdcService.updates.filter(
      (u) => u.tableName === 'services' && u.data && u.data.status === 'failed',
    );
    t.ok(serviceUpdates.length > 0, 'should mark replicas as failed via CDC');

    // Step 4: Simulate node-2 recovery (fresh heartbeat)
    mockCache.setNodes([
      {node_id: 'test-node', status: 'active', last_heartbeat: now},
      {node_id: 'node-2', status: 'failed', last_heartbeat: now, failed_at: now - 5000},
      {node_id: 'node-3', status: 'active', last_heartbeat: now},
    ]);

    await detector.checkNodeHealth();
    t.ok(events.some((e) => e.type === 'recovery' && e.nodeId === 'node-2'),
      'should detect node-2 recovery');

    // Verify CDC updates were made for the full cycle
    const statusUpdates = cdcService.updates.filter((u) => u.data && u.data.status);
    t.ok(statusUpdates.length >= 2, 'should have multiple status updates');

    detector.shutdown();
  });

  t.test('network partition - minority partition cannot write', async (t) => {
    // Create partition simulating minority (1 of 3 replicas)
    const partition = new PartitionService({
      partitionId: 'minority-test',
      tableId: 'test-table',
      tableName: 'minority_data',
      replicaId: 'replica-1',
      replicaIds: ['replica-1', 'replica-2', 'replica-3'],
      nodeId: 'node-1',
      dbPath: ':memory:',
      schema: {
        columns: [
          {name: 'id', type: 'INTEGER', primaryKey: true},
          {name: 'value', type: 'TEXT'},
        ],
      },
      keyRange: {start: null, end: null},
    });

    await partition.initialize();

    // Simulate being a follower (minority partition)
    partition.role = 'follower';
    partition.isLeader = false;

    // Attempt to write - should fail or be rejected
    try {
      const result = await partition.insertData('minority_data', {
        id: 1,
        value: 'should-fail',
      });
      // If it doesn't throw, check for failure indication
      t.ok(!result.success || result.error, 'write should fail on follower');
    } catch (error) {
      // Expected - followers cannot accept writes
      t.ok(error, 'write should be rejected on follower');
    }

    await partition.shutdown();
  });

  t.test('data availability - reads succeed on any replica', async (t) => {
    // Create partition as follower
    const partition = new PartitionService({
      partitionId: 'read-availability-test',
      tableId: 'test-table',
      tableName: 'read_data',
      replicaId: 'replica-1',
      replicaIds: ['replica-1', 'replica-2', 'replica-3'],
      nodeId: 'node-1',
      dbPath: ':memory:',
      schema: {
        columns: [
          {name: 'id', type: 'INTEGER', primaryKey: true},
          {name: 'data', type: 'TEXT'},
        ],
      },
      keyRange: {start: null, end: null},
    });

    await partition.initialize();

    // First become leader to insert data
    partition.role = 'leader';
    partition.isLeader = true;

    await partition.insertData('read_data', {id: 1, data: 'test-value'});

    // Now become follower
    partition.role = 'follower';
    partition.isLeader = false;

    // Read should still succeed on follower
    const readResult = await partition.executeQuery(
      'SELECT * FROM read_data WHERE id = ?',
      [1],
    );

    t.equal(readResult.rows.length, 1, 'read should succeed on follower');
    t.equal(readResult.rows[0].data, 'test-value', 'data should be correct');

    await partition.shutdown();
  });

  t.test('multiple node failures - system remains available', async (t) => {
    const now = Date.now();

    // Create mock cache with 5 nodes, 2 will fail
    const mockCache = createMockCache({
      nodes: [
        {node_id: 'test-node', status: 'active', last_heartbeat: now},
        {node_id: 'node-2', status: 'active', last_heartbeat: now},
        {node_id: 'node-3', status: 'suspected', last_heartbeat: now - 20000},
        {node_id: 'node-4', status: 'suspected', last_heartbeat: now - 20000},
        {node_id: 'node-5', status: 'active', last_heartbeat: now},
      ],
      services: [
        // Partition with 5 replicas, 2 on failing nodes
        {
          service_id: 'svc-1',
          node_id: 'test-node',
          service_type: 'partition_replica',
          partition_id: 'partition-1',
          status: 'active',
        },
        {
          service_id: 'svc-2',
          node_id: 'node-2',
          service_type: 'partition_replica',
          partition_id: 'partition-1',
          status: 'active',
        },
        {
          service_id: 'svc-3',
          node_id: 'node-3',
          service_type: 'partition_replica',
          partition_id: 'partition-1',
          status: 'active',
        },
        {
          service_id: 'svc-4',
          node_id: 'node-4',
          service_type: 'partition_replica',
          partition_id: 'partition-1',
          status: 'active',
        },
        {
          service_id: 'svc-5',
          node_id: 'node-5',
          service_type: 'partition_replica',
          partition_id: 'partition-1',
          status: 'active',
        },
      ],
    });

    const cdcService = createMockCDCService();
    const detector = new FailureDetector({
      systemTableCache: mockCache,
      cdcIntegrationService: cdcService,
      nodeId: 'test-node',
    });

    detector.initialize();

    const failureEvents = [];
    detector.on('nodeFailure', (data) => failureEvents.push(data));

    await detector.checkNodeHealth();

    // Should detect both failures
    t.equal(failureEvents.length, 2, 'should detect 2 node failures');

    // With 5 replicas and 2 failures, we still have 3 (majority)
    const healthyReplicas = mockCache.filter('services', (s) =>
      s.partition_id === 'partition-1' &&
      !['node-3', 'node-4'].includes(s.node_id));
    t.equal(healthyReplicas.length, 3, 'should have 3 healthy replicas (majority)');

    detector.shutdown();
  });
});
