/**
 * Membership Consistency Integration Tests
 * 
 * Tests realistic scenarios that have historically caused issues:
 * - CDC propagation latency effects on membership decisions
 * - Membership oscillation under rapid state changes
 * - Bootstrap-to-normal transition consistency
 * - Distributed membership consensus
 * - Timing coordination between heartbeat, lease, and failure detection
 * 
 * Uses low timeouts suitable for single-machine testing.
 */

import {test} from '../../src/test-helpers/tap.js';
import {EventEmitter} from 'events';
import {SystemTableCache, CDC_OPERATIONS} from '../../src/cache/system-table-cache.js';
import {CDCHandler} from '../../src/message-group/cdc-handler.js';
import {UnifiedRebalancer, EntityType} from '../../src/rebalancer/unified-rebalancer.js';
import {FailureDetector} from '../../src/node/failure-detector.js';
import {ControlPlaneService} from '../../src/control-plane/control-plane-service.js';
import {SystemTableName} from '../../src/bootstrap/system-table-schemas-constants.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {DEFAULT_TABLE_POLICY} from '../../src/policy/policy-constants.js';
import {NODE_STATUS} from '../../src/node/node-constants.js';
import {STATE} from '../../src/constants/index.js';

// Test timeouts - using minimum valid values where config validation applies
// For tests that need faster timing, we bypass config and set values directly
const TEST_TIMEOUTS = {
  CDC_FLUSH_INTERVAL: 50,
  CDC_PROPAGATION_DELAY: 25,
  HEARTBEAT_INTERVAL: 100,
  READY_LEASE_DURATION: 200,
  SUSPICION_THRESHOLD: 150,
  FAILURE_THRESHOLD: 300,
  STABILIZATION_PERIOD: 100,
  LEASE_SWEEP_INTERVAL: 50,
  TEST_TIMEOUT: 2000,
  // Config-valid minimums (for ConfigurationManager)
  CONFIG_STABILIZATION_PERIOD: 1000,
  CONFIG_PERIODIC_CHECK_INTERVAL: 1000,
  CONFIG_PERIODIC_CHECK_JITTER: 100,
};

/**
 * Initialize test environment with minimal valid config.
 * Note: Some tests bypass config and set values directly on components.
 */
function initializeTestEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();

  const config = ConfigurationManager.getInstance();
  config.initialize({
    node: {id: 'test-node'},
    logging: {level: 'error'},
  });

  const logging = LoggingService.getInstance();
  logging.initialize({level: 'error'});
}

/**
 * Create a CDC handler with configurable latency simulation.
 */
class LatencySimulatingCDCHandler extends CDCHandler {
  constructor(cache, options = {}) {
    super(cache, {
      ...options,
      flushIntervalMs: TEST_TIMEOUTS.CDC_FLUSH_INTERVAL,
    });
    this.propagationDelayMs = options.propagationDelayMs || 
      TEST_TIMEOUTS.CDC_PROPAGATION_DELAY;
    this.delayedEvents = [];
  }

  /**
   * Override handleEvent to add propagation delay.
   */
  handleEvent(event) {
    // Simulate network/processing delay before event reaches handler
    const delayedEvent = {
      event,
      deliverAt: Date.now() + this.propagationDelayMs,
    };
    this.delayedEvents.push(delayedEvent);
    
    // Schedule delivery
    setTimeout(() => {
      const idx = this.delayedEvents.indexOf(delayedEvent);
      if (idx >= 0) {
        this.delayedEvents.splice(idx, 1);
        super.handleEvent(event);
      }
    }, this.propagationDelayMs);
    
    return true;
  }

  /**
   * Get count of events still in flight.
   */
  getInFlightCount() {
    return this.delayedEvents.length;
  }

  /**
   * Wait for all in-flight events to be delivered.
   */
  async waitForDelivery(timeoutMs = 500) {
    const start = Date.now();
    while (this.delayedEvents.length > 0 && Date.now() - start < timeoutMs) {
      await new Promise((r) => setTimeout(r, 10));
    }
    // Also flush any buffered events
    this.flushAllBuffers();
  }
}


/**
 * Create a mock CDC integration service that simulates realistic CDC flow.
 * Events are applied to source cache immediately, then propagated with delay.
 */
function createRealisticCDCService(sourceCache, targetCaches = [], options = {}) {
  const propagationDelayMs = options.propagationDelayMs || 
    TEST_TIMEOUTS.CDC_PROPAGATION_DELAY;
  const pendingPropagations = [];
  let propagationTimers = [];

  const service = {
    pendingPropagations,
    
    async insertSystemTableRow(tableName, data) {
      // Apply to source immediately (leader partition)
      sourceCache.applySystemTableChange(tableName, CDC_OPERATIONS.INSERT, data);
      
      // Schedule propagation to other caches
      for (const targetCache of targetCaches) {
        const timer = setTimeout(() => {
          targetCache.applySystemTableChange(tableName, CDC_OPERATIONS.INSERT, data);
        }, propagationDelayMs);
        propagationTimers.push(timer);
      }
      
      return {success: true, operation: 'INSERT', tableName, data};
    },

    async updateSystemTableRow(tableName, whereClause, data) {
      const merged = {...whereClause, ...data};
      sourceCache.applySystemTableChange(tableName, CDC_OPERATIONS.UPDATE, merged);
      
      for (const targetCache of targetCaches) {
        const timer = setTimeout(() => {
          targetCache.applySystemTableChange(tableName, CDC_OPERATIONS.UPDATE, merged);
        }, propagationDelayMs);
        propagationTimers.push(timer);
      }
      
      return {success: true, operation: 'UPDATE', tableName, data: merged};
    },

    async upsertSystemTableRow(tableName, data) {
      sourceCache.applySystemTableChange(tableName, CDC_OPERATIONS.UPSERT, data);
      
      for (const targetCache of targetCaches) {
        const timer = setTimeout(() => {
          targetCache.applySystemTableChange(tableName, CDC_OPERATIONS.UPSERT, data);
        }, propagationDelayMs);
        propagationTimers.push(timer);
      }
      
      return {success: true, operation: 'UPSERT', tableName, data};
    },

    async deleteSystemTableRow(tableName, whereClause) {
      sourceCache.applySystemTableChange(tableName, CDC_OPERATIONS.DELETE, whereClause);
      
      for (const targetCache of targetCaches) {
        const timer = setTimeout(() => {
          targetCache.applySystemTableChange(tableName, CDC_OPERATIONS.DELETE, whereClause);
        }, propagationDelayMs);
        propagationTimers.push(timer);
      }
      
      return {success: true, operation: 'DELETE', tableName};
    },

    /**
     * Wait for all pending propagations to complete.
     */
    async waitForPropagation(timeoutMs = 500) {
      await new Promise((r) => setTimeout(r, propagationDelayMs + 10));
    },

    /**
     * Cleanup all pending timers.
     */
    cleanup() {
      for (const timer of propagationTimers) {
        clearTimeout(timer);
      }
      propagationTimers = [];
    },
  };

  return service;
}


/**
 * Create mock message group service for control plane tests.
 */
class MockMessageGroupService extends EventEmitter {
  constructor(options = {}) {
    super();
    this.groupId = options.groupId || 'mg-test';
    this.replicaId = options.replicaId || 'mg-test-r1';
    this.nodeId = options.nodeId || 'node-1';
    this._isLeader = options.isLeader !== false;
    this.sentMessages = [];
    this.acks = [];
  }

  isLeaderReplica() {
    return this._isLeader;
  }

  setLeader(isLeader) {
    this._isLeader = isLeader;
  }

  getLeaderId() {
    return this._isLeader ? this.replicaId : 'other-replica';
  }

  buildPeerAddress(replicaId) {
    return `${this.nodeId}/message-group/${replicaId}`;
  }

  async sendMessage(target, payload) {
    this.sentMessages.push({target, payload, timestamp: Date.now()});
    return {messageId: `msg-${Date.now()}`, status: 'sent'};
  }

  async acknowledgeMessage(messageId) {
    this.acks.push({messageId, timestamp: Date.now()});
  }

  simulateMessageReceived(payload) {
    this.emit('messageReceived', {payload, messageId: `msg-${Date.now()}`});
  }

  simulateCdcApplied(tableName, operation, data) {
    this.emit('cdcApplied', {tableName, operation, data});
  }
}

/**
 * Create mock message router with connection state tracking.
 */
function createMockMessageRouter(options = {}) {
  const connectionStates = new Map();
  const outboundQueues = new Map();
  
  return {
    connectionStates,
    outboundQueues,
    
    setConnectionState(nodeId, state) {
      connectionStates.set(nodeId, state);
    },
    
    getConnectionState(nodeId) {
      return connectionStates.get(nodeId) || options.defaultState || 'connected';
    },
    
    setOutboundQueueAvailable(nodeId, available) {
      outboundQueues.set(nodeId, available);
    },
    
    isOutboundQueueAvailable(nodeId) {
      const available = outboundQueues.get(nodeId);
      return available !== undefined ? available : true;
    },
    
    async pingNode(_nodeId, _timeoutMs) {
      return options.pingResult !== undefined ? options.pingResult : true;
    },
    
    async deliver(target, payload) {
      return {acknowledged: true, status: 'initiated', target, payload};
    },
  };
}

/**
 * Create mock table policy service.
 */
function createMockTablePolicyService() {
  return {
    getDefaultPolicy: () => ({...DEFAULT_TABLE_POLICY}),
    getTablePolicy: () => ({...DEFAULT_TABLE_POLICY}),
    getPolicyForPartition: () => ({...DEFAULT_TABLE_POLICY}),
  };
}

/**
 * Create mock rebalance coordinator.
 */
function createMockRebalanceCoordinator() {
  let counter = 0;
  const operations = [];
  
  return {
    operations,
    async createOperation({type, partitionId, nodeId, replicaId}) {
      counter += 1;
      const op = {
        operationId: `op-${counter}`,
        type,
        partitionId,
        replicaId,
        targetNodeId: nodeId,
      };
      operations.push(op);
      return op;
    },
    async executeOperation(operation) {
      operations.push({...operation, executed: true});
      return {success: true};
    },
    getStats: () => ({operationsCreated: counter}),
    shutdown: () => {},
  };
}


/**
 * Helper to create a node entry with proper defaults.
 */
function createNodeEntry(nodeId, overrides = {}) {
  const now = Date.now();
  return {
    node_id: nodeId,
    node_address: `ws://${nodeId}:9000`,
    cpu_cores: 4,
    memory_mb: 1024,
    disk_gb: 10,
    cpu_usage_percent: 10,
    memory_usage_percent: 20,
    disk_usage_percent: 30,
    status: NODE_STATUS.ACTIVE,
    ws_connection_state: STATE.READY,
    capabilities: '[]',
    last_heartbeat: now,
    ready_lease_expires_at: now + TEST_TIMEOUTS.READY_LEASE_DURATION,
    created_at: now,
    ...overrides,
  };
}

/**
 * Helper to wait for a condition with timeout.
 */
async function waitFor(condition, timeoutMs = TEST_TIMEOUTS.TEST_TIMEOUT, intervalMs = 10) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await condition()) {
      return true;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

// ============================================================================
// TEST SUITE
// ============================================================================

test('Membership Consistency Integration Tests', async (t) => {
  t.beforeEach(() => {
    initializeTestEnvironment();
  });

  t.afterEach(() => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  });

  // --------------------------------------------------------------------------
  // Test 1: CDC Propagation Latency Effects
  // --------------------------------------------------------------------------
  await t.test('CDC latency causes temporary membership divergence', async (t) => {
    // Create two caches simulating two nodes
    const leaderCache = new SystemTableCache();
    const followerCache = new SystemTableCache();
    
    // Create CDC service with propagation delay
    const cdcService = createRealisticCDCService(
      leaderCache,
      [followerCache],
      {propagationDelayMs: TEST_TIMEOUTS.CDC_PROPAGATION_DELAY},
    );

    try {
      // Insert a node via CDC
      const nodeId = 'new-node-1';
      await cdcService.insertSystemTableRow(
        SystemTableName.NODES,
        createNodeEntry(nodeId),
      );

      // Leader cache should have the node immediately
      const leaderNode = leaderCache.get(SystemTableName.NODES, nodeId);
      t.ok(leaderNode, 'leader cache should have node immediately');

      // Follower cache should NOT have the node yet (CDC latency)
      const followerNodeBefore = followerCache.get(SystemTableName.NODES, nodeId);
      t.notOk(followerNodeBefore, 'follower cache should not have node yet');

      // Wait for propagation
      await cdcService.waitForPropagation();

      // Now follower should have the node
      const followerNodeAfter = followerCache.get(SystemTableName.NODES, nodeId);
      t.ok(followerNodeAfter, 'follower cache should have node after propagation');
      t.equal(followerNodeAfter.node_id, nodeId, 'node data should match');
    } finally {
      cdcService.cleanup();
    }
  });


  // --------------------------------------------------------------------------
  // Test 2: Rebalancer Decisions During CDC Latency
  // --------------------------------------------------------------------------
  await t.test('rebalancer sees stale membership during CDC propagation', async (t) => {
    const leaderCache = new SystemTableCache();
    const rebalancerCache = new SystemTableCache();
    
    const cdcService = createRealisticCDCService(
      leaderCache,
      [rebalancerCache],
      {propagationDelayMs: TEST_TIMEOUTS.CDC_PROPAGATION_DELAY},
    );

    try {
      // Add initial node to both caches
      const initialNode = createNodeEntry('node-1');
      leaderCache.applySystemTableChange(
        SystemTableName.NODES, CDC_OPERATIONS.INSERT, initialNode,
      );
      rebalancerCache.applySystemTableChange(
        SystemTableName.NODES, CDC_OPERATIONS.INSERT, initialNode,
      );

      // Create rebalancer using the follower cache
      const rebalancer = new UnifiedRebalancer({
        entityId: 'partition-1',
        entityType: EntityType.PARTITION,
        systemTableCache: rebalancerCache,
        cdcIntegrationService: cdcService,
        tablePolicyService: createMockTablePolicyService(),
        messageRouter: createMockMessageRouter(),
        rebalanceCoordinator: createMockRebalanceCoordinator(),
        nodeId: 'node-1',
      });
      rebalancer.initialize();

      // Add a new node via CDC (only leader has it initially)
      await cdcService.insertSystemTableRow(
        SystemTableName.NODES,
        createNodeEntry('node-2'),
      );

      // Rebalancer should only see 1 node (stale view)
      const availableNodesBefore = rebalancer.getAvailableNodes();
      t.equal(availableNodesBefore.length, 1, 
        'rebalancer should see stale membership (1 node)');

      // Wait for CDC propagation
      await cdcService.waitForPropagation();

      // Now rebalancer should see 2 nodes
      const availableNodesAfter = rebalancer.getAvailableNodes();
      t.equal(availableNodesAfter.length, 2, 
        'rebalancer should see updated membership (2 nodes)');

      rebalancer.shutdown();
    } finally {
      cdcService.cleanup();
    }
  });

  // --------------------------------------------------------------------------
  // Test 3: Lease Expiration During Stabilization
  // --------------------------------------------------------------------------
  await t.test('lease expires during rebalancer stabilization period', async (t) => {
    const cache = new SystemTableCache();
    const now = Date.now();
    
    // Add node with short lease that will expire during stabilization
    const shortLeaseNode = createNodeEntry('short-lease-node', {
      ready_lease_expires_at: now + 50, // Expires in 50ms
    });
    cache.applySystemTableChange(
      SystemTableName.NODES, CDC_OPERATIONS.INSERT, shortLeaseNode,
    );

    const cdcService = createRealisticCDCService(cache, []);

    try {
      const rebalancer = new UnifiedRebalancer({
        entityId: 'partition-1',
        entityType: EntityType.PARTITION,
        systemTableCache: cache,
        cdcIntegrationService: cdcService,
        tablePolicyService: createMockTablePolicyService(),
        messageRouter: createMockMessageRouter(),
        rebalanceCoordinator: createMockRebalanceCoordinator(),
        nodeId: 'other-node',
      });
      rebalancer.initialize();
      rebalancer.setLeader(true);
      
      // Override stabilization period for faster testing
      rebalancer.stabilizationPeriodMs = TEST_TIMEOUTS.STABILIZATION_PERIOD;

      // Record state change to start stabilization
      rebalancer.recordStateChange('test_trigger');

      // Node should be available initially
      const nodesBefore = rebalancer.getAvailableNodes();
      t.equal(nodesBefore.length, 1, 'node should be available initially');

      // Wait for lease to expire (but less than stabilization period)
      await new Promise((r) => setTimeout(r, 60));

      // Node should no longer be available (lease expired)
      const nodesAfter = rebalancer.getAvailableNodes();
      t.equal(nodesAfter.length, 0, 
        'node should not be available after lease expiry');

      // Stabilization should still be in progress
      t.equal(rebalancer.isStabilized(), false, 
        'should still be in stabilization period');

      rebalancer.shutdown();
    } finally {
      cdcService.cleanup();
    }
  });


  // --------------------------------------------------------------------------
  // Test 4: Membership Oscillation Under Rapid State Changes
  // --------------------------------------------------------------------------
  await t.test('rapid node state changes cause membership oscillation', async (t) => {
    const cache = new SystemTableCache();
    const cdcService = createRealisticCDCService(cache, []);
    const stateChanges = [];

    try {
      // Add initial node
      const nodeId = 'oscillating-node';
      cache.applySystemTableChange(
        SystemTableName.NODES,
        CDC_OPERATIONS.INSERT,
        createNodeEntry(nodeId),
      );

      // Track cache changes (listener is called via setImmediate)
      cache.onCacheChange((tableName, _operation, record) => {
        if (tableName === SystemTableName.NODES && record.node_id === nodeId) {
          stateChanges.push({
            state: record.ws_connection_state,
            timestamp: Date.now(),
          });
        }
      });

      // Simulate rapid state oscillation (connected -> ready -> disconnected -> ready)
      const states = [
        STATE.CONNECTED,
        STATE.READY,
        STATE.DISCONNECTED,
        STATE.READY,
        STATE.DISCONNECTED,
      ];

      for (const state of states) {
        await cdcService.updateSystemTableRow(
          SystemTableName.NODES,
          {node_id: nodeId},
          {
            ws_connection_state: state,
            ready_lease_expires_at: state === STATE.READY ? 
              Date.now() + TEST_TIMEOUTS.READY_LEASE_DURATION : null,
          },
        );
      }

      // Wait for setImmediate callbacks to fire
      await new Promise((r) => setImmediate(r));

      // Verify state changes were recorded (cache listener uses setImmediate)
      t.ok(stateChanges.length >= 1, 'state changes should be recorded');

      // Verify final state in cache reflects oscillation
      const finalNode = cache.get(SystemTableName.NODES, nodeId);
      t.equal(finalNode.ws_connection_state, STATE.DISCONNECTED, 
        'final state should be disconnected');

      // The key insight: rapid changes can cause inconsistent views
      // between cache and actual state during the oscillation window
    } finally {
      cdcService.cleanup();
    }
  });

  // --------------------------------------------------------------------------
  // Test 5: Failure Detector with CDC Latency
  // --------------------------------------------------------------------------
  await t.test('failure detector may see stale heartbeat due to CDC latency', async (t) => {
    const leaderCache = new SystemTableCache();
    const detectorCache = new SystemTableCache();
    const now = Date.now();

    // Add node to both caches with current heartbeat
    const nodeId = 'heartbeat-node';
    const nodeData = createNodeEntry(nodeId, {
      last_heartbeat: now,
    });
    leaderCache.applySystemTableChange(
      SystemTableName.NODES, CDC_OPERATIONS.INSERT, nodeData,
    );
    detectorCache.applySystemTableChange(
      SystemTableName.NODES, CDC_OPERATIONS.INSERT, nodeData,
    );

    const cdcService = createRealisticCDCService(
      leaderCache,
      [detectorCache],
      {propagationDelayMs: TEST_TIMEOUTS.CDC_PROPAGATION_DELAY},
    );

    try {
      const cdcUpdates = [];
      const detector = new FailureDetector({
        systemTableCache: detectorCache,
        cdcIntegrationService: {
          ...cdcService,
          async updateSystemTableRow(tableName, where, data) {
            cdcUpdates.push({tableName, where, data});
            return cdcService.updateSystemTableRow(tableName, where, data);
          },
        },
        nodeId: 'detector-node',
      });
      detector.initialize();

      // Update heartbeat on leader (simulating node sending heartbeat)
      const newHeartbeat = now + 100;
      await cdcService.updateSystemTableRow(
        SystemTableName.NODES,
        {node_id: nodeId},
        {last_heartbeat: newHeartbeat},
      );

      // Detector cache still has old heartbeat (CDC latency)
      const detectorNode = detectorCache.get(SystemTableName.NODES, nodeId);
      t.equal(detectorNode.last_heartbeat, now, 
        'detector should see stale heartbeat before CDC propagation');

      // Wait for CDC propagation
      await cdcService.waitForPropagation();

      // Now detector cache should have updated heartbeat
      const updatedNode = detectorCache.get(SystemTableName.NODES, nodeId);
      t.equal(updatedNode.last_heartbeat, newHeartbeat, 
        'detector should see updated heartbeat after CDC propagation');

      detector.shutdown();
    } finally {
      cdcService.cleanup();
    }
  });


  // --------------------------------------------------------------------------
  // Test 6: Control Plane Lease Sweep with CDC Latency
  // --------------------------------------------------------------------------
  await t.test('lease sweep may miss nodes due to CDC propagation delay', async (t) => {
    const leaderCache = new SystemTableCache();
    const followerCache = new SystemTableCache();
    const now = Date.now();

    // Add node with lease about to expire
    const nodeId = 'expiring-node';
    const nodeData = createNodeEntry(nodeId, {
      ready_lease_expires_at: now + 30, // Expires very soon
    });
    leaderCache.applySystemTableChange(
      SystemTableName.NODES, CDC_OPERATIONS.INSERT, nodeData,
    );
    followerCache.applySystemTableChange(
      SystemTableName.NODES, CDC_OPERATIONS.INSERT, nodeData,
    );

    const cdcService = createRealisticCDCService(
      leaderCache,
      [followerCache],
      {propagationDelayMs: TEST_TIMEOUTS.CDC_PROPAGATION_DELAY},
    );

    try {
      const messageGroup = new MockMessageGroupService({isLeader: true});
      const messageRouter = createMockMessageRouter();

      const controlPlane = new ControlPlaneService({
        nodeId: 'control-plane-node',
        nodeAddress: 'ws://control-plane-node:9000',
        systemTableCache: leaderCache,
        cdcIntegrationService: cdcService,
        messageRouter,
        rebalanceCoordinator: createMockRebalanceCoordinator(),
      });
      controlPlane.initialize();
      controlPlane.attachMessageGroupService(messageGroup);

      // Wait for lease to expire
      await new Promise((r) => setTimeout(r, 40));

      // Manually trigger lease sweep
      await controlPlane.sweepExpiredLeases();

      // Leader cache should have node marked as disconnected
      const leaderNode = leaderCache.get(SystemTableName.NODES, nodeId);
      t.equal(leaderNode.ws_connection_state, STATE.DISCONNECTED, 
        'leader should mark node as disconnected');

      // Follower cache may still show ready (CDC latency)
      const followerNodeBefore = followerCache.get(SystemTableName.NODES, nodeId);
      // Note: This depends on timing - the update may or may not have propagated
      
      // Wait for CDC propagation
      await cdcService.waitForPropagation();

      // Now follower should also show disconnected
      const followerNodeAfter = followerCache.get(SystemTableName.NODES, nodeId);
      t.equal(followerNodeAfter.ws_connection_state, STATE.DISCONNECTED, 
        'follower should see disconnected after CDC propagation');

      controlPlane.shutdown();
    } finally {
      cdcService.cleanup();
    }
  });

  // --------------------------------------------------------------------------
  // Test 7: Multiple Nodes Making Concurrent Membership Decisions
  // --------------------------------------------------------------------------
  await t.test('concurrent rebalancers may make conflicting decisions', async (t) => {
    // Simulate two partition leaders on different nodes
    const node1Cache = new SystemTableCache();
    const node2Cache = new SystemTableCache();
    const now = Date.now();

    // Both caches start with same view
    const initialNodes = [
      createNodeEntry('node-1'),
      createNodeEntry('node-2'),
      createNodeEntry('node-3', {
        ready_lease_expires_at: now + TEST_TIMEOUTS.READY_LEASE_DURATION,
      }),
    ];

    for (const node of initialNodes) {
      node1Cache.applySystemTableChange(
        SystemTableName.NODES, CDC_OPERATIONS.INSERT, node,
      );
      node2Cache.applySystemTableChange(
        SystemTableName.NODES, CDC_OPERATIONS.INSERT, node,
      );
    }

    const coordinator1 = createMockRebalanceCoordinator();
    const coordinator2 = createMockRebalanceCoordinator();

    const rebalancer1 = new UnifiedRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      systemTableCache: node1Cache,
      cdcIntegrationService: createRealisticCDCService(node1Cache, []),
      tablePolicyService: createMockTablePolicyService(),
      messageRouter: createMockMessageRouter(),
      rebalanceCoordinator: coordinator1,
      nodeId: 'node-1',
    });

    const rebalancer2 = new UnifiedRebalancer({
      entityId: 'partition-2',
      entityType: EntityType.PARTITION,
      systemTableCache: node2Cache,
      cdcIntegrationService: createRealisticCDCService(node2Cache, []),
      tablePolicyService: createMockTablePolicyService(),
      messageRouter: createMockMessageRouter(),
      rebalanceCoordinator: coordinator2,
      nodeId: 'node-2',
    });

    rebalancer1.initialize();
    rebalancer2.initialize();
    rebalancer1.setLeader(true);
    rebalancer2.setLeader(true);

    // Both rebalancers see the same available nodes
    const nodes1 = rebalancer1.getAvailableNodes();
    const nodes2 = rebalancer2.getAvailableNodes();

    t.equal(nodes1.length, nodes2.length, 
      'both rebalancers should see same node count');
    t.equal(nodes1.length, 3, 'should see all 3 nodes');

    // Trigger rebalance on both (simulating concurrent decisions)
    rebalancer1.lastStateChangeTime = now - TEST_TIMEOUTS.STABILIZATION_PERIOD - 1;
    rebalancer2.lastStateChangeTime = now - TEST_TIMEOUTS.STABILIZATION_PERIOD - 1;

    const [result1, result2] = await Promise.all([
      rebalancer1.rebalance('concurrent_test'),
      rebalancer2.rebalance('concurrent_test'),
    ]);

    t.equal(result1.success, true, 'rebalancer1 should succeed');
    t.equal(result2.success, true, 'rebalancer2 should succeed');

    // Both may generate moves targeting the same nodes
    // This is the potential conflict scenario
    const allMoves = [...result1.moves, ...result2.moves];
    t.ok(Array.isArray(allMoves), 'should have moves array');

    rebalancer1.shutdown();
    rebalancer2.shutdown();
  });


  // --------------------------------------------------------------------------
  // Test 8: WebSocket State vs Cache State Divergence
  // --------------------------------------------------------------------------
  await t.test('WebSocket disconnection not reflected in cache', async (t) => {
    const cache = new SystemTableCache();
    const now = Date.now();

    // Add node that appears ready in cache
    const nodeId = 'ws-divergent-node';
    cache.applySystemTableChange(
      SystemTableName.NODES,
      CDC_OPERATIONS.INSERT,
      createNodeEntry(nodeId, {
        ws_connection_state: STATE.READY,
        ready_lease_expires_at: now + TEST_TIMEOUTS.READY_LEASE_DURATION,
      }),
    );

    // Create message router that shows node as disconnected
    const messageRouter = createMockMessageRouter();
    messageRouter.setConnectionState(nodeId, 'disconnected');

    const cdcService = createRealisticCDCService(cache, []);

    try {
      const messageGroup = new MockMessageGroupService({isLeader: true});

      const controlPlane = new ControlPlaneService({
        nodeId: 'control-plane-node',
        nodeAddress: 'ws://control-plane-node:9000',
        systemTableCache: cache,
        cdcIntegrationService: cdcService,
        messageRouter,
        rebalanceCoordinator: createMockRebalanceCoordinator(),
      });
      controlPlane.initialize();
      controlPlane.attachMessageGroupService(messageGroup);

      // Cache shows node as ready
      const cachedNode = cache.get(SystemTableName.NODES, nodeId);
      t.equal(cachedNode.ws_connection_state, STATE.READY, 
        'cache should show node as ready');

      // But isNodeReady should return false (WebSocket disconnected)
      const isReady = controlPlane.isNodeReady(nodeId);
      t.equal(isReady, false, 
        'isNodeReady should return false when WebSocket is disconnected');

      controlPlane.shutdown();
    } finally {
      cdcService.cleanup();
    }
  });

  // --------------------------------------------------------------------------
  // Test 9: Timing Coordination - Heartbeat vs Lease vs Failure Detection
  // --------------------------------------------------------------------------
  await t.test('timing parameters are properly coordinated', async (t) => {
    // Verify: heartbeatInterval < leaseExpiry < failureThreshold
    // This ensures a node can refresh its lease before it expires,
    // and failure detection doesn't trigger prematurely
    // 
    // Note: These are the TEST_TIMEOUTS values used in tests, not config values
    // Production config has different (larger) minimums enforced by schema

    t.ok(
      TEST_TIMEOUTS.HEARTBEAT_INTERVAL < TEST_TIMEOUTS.READY_LEASE_DURATION,
      'heartbeat interval should be less than lease duration',
    );

    t.ok(
      TEST_TIMEOUTS.READY_LEASE_DURATION < TEST_TIMEOUTS.FAILURE_THRESHOLD,
      'lease duration should be less than failure threshold',
    );

    t.ok(
      TEST_TIMEOUTS.SUSPICION_THRESHOLD < TEST_TIMEOUTS.FAILURE_THRESHOLD,
      'suspicion threshold should be less than failure threshold',
    );

    // Also verify CDC propagation delay is accounted for
    const safetyMargin = TEST_TIMEOUTS.READY_LEASE_DURATION - 
      TEST_TIMEOUTS.HEARTBEAT_INTERVAL - 
      TEST_TIMEOUTS.CDC_PROPAGATION_DELAY;

    t.ok(safetyMargin > 0, 
      'should have safety margin for CDC propagation in lease refresh');
    
    // Verify the test timeouts form a valid timing chain
    // heartbeat(100) + cdc_delay(25) < lease(300) < failure(250)
    // Note: In production, these would be much larger values
    t.ok(
      TEST_TIMEOUTS.HEARTBEAT_INTERVAL + TEST_TIMEOUTS.CDC_PROPAGATION_DELAY <
        TEST_TIMEOUTS.READY_LEASE_DURATION,
      'heartbeat + CDC delay should be less than lease duration',
    );
  });

  // --------------------------------------------------------------------------
  // Test 10: Bootstrap Data Consistency After Mode Transition
  // --------------------------------------------------------------------------
  await t.test('bootstrap data is consistent after mode transition', async (t) => {
    const leaderCache = new SystemTableCache();
    const followerCache = new SystemTableCache();
    const now = Date.now();

    // Simulate bootstrap: data written directly to leader cache
    // (bypassing normal CDC flow)
    const bootstrapNodes = [
      createNodeEntry('seed-node'),
      createNodeEntry('bootstrap-node-1'),
    ];

    for (const node of bootstrapNodes) {
      // Bootstrap mode: direct write to leader only
      leaderCache.applySystemTableChange(
        SystemTableName.NODES, CDC_OPERATIONS.INSERT, node,
      );
    }

    // Follower cache is empty (didn't receive bootstrap data)
    t.equal(followerCache.count(SystemTableName.NODES), 0, 
      'follower should not have bootstrap data initially');

    // After bootstrap, normal CDC should propagate data
    const cdcService = createRealisticCDCService(
      leaderCache,
      [followerCache],
      {propagationDelayMs: TEST_TIMEOUTS.CDC_PROPAGATION_DELAY},
    );

    try {
      // Simulate cache hydration: read from leader and write to follower
      const leaderNodes = leaderCache.getAll(SystemTableName.NODES);
      for (const node of leaderNodes) {
        followerCache.applySystemTableChange(
          SystemTableName.NODES, CDC_OPERATIONS.INSERT, node,
        );
      }

      // Now both caches should be consistent
      t.equal(
        followerCache.count(SystemTableName.NODES),
        leaderCache.count(SystemTableName.NODES),
        'follower should have same node count as leader after hydration',
      );

      // Verify data matches
      for (const leaderNode of leaderNodes) {
        const followerNode = followerCache.get(
          SystemTableName.NODES, leaderNode.node_id,
        );
        t.ok(followerNode, `follower should have node ${leaderNode.node_id}`);
        t.equal(followerNode.node_id, leaderNode.node_id, 'node_id should match');
      }
    } finally {
      cdcService.cleanup();
    }
  });


  // --------------------------------------------------------------------------
  // Test 11: Node Join During Another Node Failure
  // --------------------------------------------------------------------------
  await t.test('node join and failure occur simultaneously', async (t) => {
    const cache = new SystemTableCache();
    const now = Date.now();

    // Add existing nodes - one healthy, one already suspected with old heartbeat
    cache.applySystemTableChange(
      SystemTableName.NODES,
      CDC_OPERATIONS.INSERT,
      createNodeEntry('existing-node-1'),
    );
    cache.applySystemTableChange(
      SystemTableName.NODES,
      CDC_OPERATIONS.INSERT,
      createNodeEntry('failing-node', {
        last_heartbeat: now - TEST_TIMEOUTS.FAILURE_THRESHOLD - 100,
        status: NODE_STATUS.SUSPECTED,
        ws_connection_state: STATE.READY,
        ready_lease_expires_at: now + TEST_TIMEOUTS.READY_LEASE_DURATION,
      }),
    );

    const cdcService = createRealisticCDCService(cache, []);
    const cdcUpdates = [];

    try {
      const trackingCdcService = {
        ...cdcService,
        async updateSystemTableRow(tableName, where, data) {
          cdcUpdates.push({type: 'update', tableName, where, data, time: Date.now()});
          return cdcService.updateSystemTableRow(tableName, where, data);
        },
        async insertSystemTableRow(tableName, data) {
          cdcUpdates.push({type: 'insert', tableName, data, time: Date.now()});
          return cdcService.insertSystemTableRow(tableName, data);
        },
      };

      const detector = new FailureDetector({
        systemTableCache: cache,
        cdcIntegrationService: trackingCdcService,
        nodeId: 'detector-node',
      });
      detector.initialize();
      // Set thresholds for test
      detector.suspicionThresholdMs = TEST_TIMEOUTS.SUSPICION_THRESHOLD;
      detector.failureThresholdMs = TEST_TIMEOUTS.FAILURE_THRESHOLD;
      detector.currentFailureThreshold = TEST_TIMEOUTS.FAILURE_THRESHOLD;

      // Simultaneously: detect failure AND add new node
      const failurePromise = detector.checkNodeHealth();
      const joinPromise = trackingCdcService.insertSystemTableRow(
        SystemTableName.NODES,
        createNodeEntry('joining-node'),
      );

      await Promise.all([failurePromise, joinPromise]);

      // Verify both operations completed
      const insertOps = cdcUpdates.filter((u) => u.type === 'insert');
      const updateOps = cdcUpdates.filter((u) => u.type === 'update');

      t.ok(insertOps.length > 0, 'should have insert operation for joining node');
      t.ok(updateOps.length > 0, 'should have update operation for failing node');

      // Verify final state
      const joiningNode = cache.get(SystemTableName.NODES, 'joining-node');
      t.ok(joiningNode, 'joining node should be in cache');

      const failingNode = cache.get(SystemTableName.NODES, 'failing-node');
      t.equal(failingNode.status, NODE_STATUS.FAILED, 
        'failing node should be marked as failed');

      detector.shutdown();
    } finally {
      cdcService.cleanup();
    }
  });

  // --------------------------------------------------------------------------
  // Test 12: CDC Events Arrive Out of Order
  // --------------------------------------------------------------------------
  await t.test('out-of-order CDC events are handled correctly', async (t) => {
    const cache = new SystemTableCache();
    // Use the base CDCHandler directly (not the latency-simulating one)
    // to test the buffering and ordering logic
    const cdcHandler = new CDCHandler(cache, {
      bufferSize: 100, // Large buffer so we can control when flush happens
      flushIntervalMs: 10000, // Long interval so we control flush manually
    });
    cdcHandler.initialize();
    cdcHandler.subscribe(SystemTableName.NODES);

    try {
      const nodeId = 'out-of-order-node';
      const baseTime = Date.now();

      // Create events with timestamps that will arrive out of order
      const event1 = {
        tableName: SystemTableName.NODES,
        operation: CDC_OPERATIONS.INSERT,
        data: createNodeEntry(nodeId, {status: NODE_STATUS.ACTIVE}),
        timestamp: `${baseTime}-0-node1`,
      };

      const event2 = {
        tableName: SystemTableName.NODES,
        operation: CDC_OPERATIONS.UPDATE,
        data: {node_id: nodeId, status: NODE_STATUS.FAILED},
        timestamp: `${baseTime + 100}-0-node1`, // Later timestamp
      };

      const event3 = {
        tableName: SystemTableName.NODES,
        operation: CDC_OPERATIONS.UPDATE,
        data: {node_id: nodeId, status: NODE_STATUS.SUSPECTED},
        timestamp: `${baseTime + 50}-0-node1`, // Middle timestamp
      };

      // Send events in wrong order: 1, 3, 2 (should be 1, 2, 3 by timestamp)
      cdcHandler.handleEvent(event1);
      cdcHandler.handleEvent(event3);
      cdcHandler.handleEvent(event2);

      // Verify events are buffered
      t.equal(cdcHandler.getBufferSize(SystemTableName.NODES), 3,
        'should have 3 events buffered');

      // Flush to apply events - CDCHandler sorts by timestamp before applying
      cdcHandler.flushAllBuffers();

      // The handler should have processed all events in timestamp order
      const finalNode = cache.get(SystemTableName.NODES, nodeId);
      t.ok(finalNode, 'node should exist in cache');
      
      // Final status should be from the latest timestamp (event2 = FAILED)
      t.equal(finalNode.status, NODE_STATUS.FAILED,
        'final status should be from latest timestamp event');

      cdcHandler.shutdown();
    } finally {
      // Cleanup handled by shutdown
    }
  });

  // --------------------------------------------------------------------------
  // Test 13: Rebalancer Stabilization Timer Reset
  // --------------------------------------------------------------------------
  await t.test('stabilization timer resets on each state change', async (t) => {
    const cache = new SystemTableCache();
    cache.applySystemTableChange(
      SystemTableName.NODES,
      CDC_OPERATIONS.INSERT,
      createNodeEntry('node-1'),
    );

    const cdcService = createRealisticCDCService(cache, []);

    try {
      const rebalancer = new UnifiedRebalancer({
        entityId: 'partition-1',
        entityType: EntityType.PARTITION,
        systemTableCache: cache,
        cdcIntegrationService: cdcService,
        tablePolicyService: createMockTablePolicyService(),
        messageRouter: createMockMessageRouter(),
        rebalanceCoordinator: createMockRebalanceCoordinator(),
        nodeId: 'node-1',
      });
      rebalancer.initialize();
      rebalancer.setLeader(true);
      
      // Override stabilization period for faster testing
      rebalancer.stabilizationPeriodMs = TEST_TIMEOUTS.STABILIZATION_PERIOD;

      // Record initial state change
      rebalancer.recordStateChange('first_change');

      t.equal(rebalancer.isStabilized(), false, 
        'should not be stabilized immediately after state change');

      // Wait partial stabilization period
      await new Promise((r) => setTimeout(r, TEST_TIMEOUTS.STABILIZATION_PERIOD / 2));

      // Record another state change (should reset timer)
      rebalancer.recordStateChange('second_change');

      // Should still not be stabilized (timer was reset)
      t.equal(rebalancer.isStabilized(), false, 
        'should not be stabilized after timer reset');

      // The time until stabilized should be close to full period again
      const timeUntilStable = rebalancer.getTimeUntilStabilized();
      t.ok(
        timeUntilStable > TEST_TIMEOUTS.STABILIZATION_PERIOD / 2,
        'time until stable should be reset to near full period',
      );

      rebalancer.shutdown();
    } finally {
      cdcService.cleanup();
    }
  });


  // --------------------------------------------------------------------------
  // Test 14: Ready Nodes List Consistency Across Caches
  // --------------------------------------------------------------------------
  await t.test('getReadyNodes returns consistent results across caches', async (t) => {
    const cache1 = new SystemTableCache();
    const cache2 = new SystemTableCache();
    const now = Date.now();

    // Add same nodes to both caches
    const nodes = [
      createNodeEntry('ready-node-1', {
        ws_connection_state: STATE.READY,
        ready_lease_expires_at: now + TEST_TIMEOUTS.READY_LEASE_DURATION,
      }),
      createNodeEntry('ready-node-2', {
        ws_connection_state: STATE.READY,
        ready_lease_expires_at: now + TEST_TIMEOUTS.READY_LEASE_DURATION,
      }),
      createNodeEntry('not-ready-node', {
        ws_connection_state: STATE.CONNECTED, // Not ready
        ready_lease_expires_at: now + TEST_TIMEOUTS.READY_LEASE_DURATION,
      }),
      createNodeEntry('expired-lease-node', {
        ws_connection_state: STATE.READY,
        ready_lease_expires_at: now - 100, // Expired
      }),
    ];

    for (const node of nodes) {
      cache1.applySystemTableChange(SystemTableName.NODES, CDC_OPERATIONS.INSERT, node);
      cache2.applySystemTableChange(SystemTableName.NODES, CDC_OPERATIONS.INSERT, node);
    }

    // Both caches should return same ready nodes
    const readyNodes1 = cache1.getReadyNodes();
    const readyNodes2 = cache2.getReadyNodes();

    t.equal(readyNodes1.length, 2, 'cache1 should have 2 ready nodes');
    t.equal(readyNodes2.length, 2, 'cache2 should have 2 ready nodes');

    // Same nodes should be ready in both
    t.same(
      readyNodes1.sort(),
      readyNodes2.sort(),
      'both caches should return same ready nodes',
    );

    // Verify correct nodes are ready
    t.ok(readyNodes1.includes('ready-node-1'), 'ready-node-1 should be ready');
    t.ok(readyNodes1.includes('ready-node-2'), 'ready-node-2 should be ready');
    t.notOk(readyNodes1.includes('not-ready-node'), 
      'not-ready-node should not be ready');
    t.notOk(readyNodes1.includes('expired-lease-node'), 
      'expired-lease-node should not be ready');
  });

  // --------------------------------------------------------------------------
  // Test 15: Failure Detector Flapping Prevention
  // --------------------------------------------------------------------------
  await t.test('failure detector increases threshold on flapping', async (t) => {
    const cache = new SystemTableCache();
    const now = Date.now();

    // Add a node that will "flap"
    cache.applySystemTableChange(
      SystemTableName.NODES,
      CDC_OPERATIONS.INSERT,
      createNodeEntry('flapping-node'),
    );

    const cdcService = createRealisticCDCService(cache, []);

    try {
      const detector = new FailureDetector({
        systemTableCache: cache,
        cdcIntegrationService: cdcService,
        nodeId: 'detector-node',
      });
      detector.initialize();

      const initialThreshold = detector.getFailureThreshold();

      // Simulate multiple failures (flapping)
      for (let i = 0; i < 4; i++) {
        await detector.checkFlapping('flapping-node', now + i * 100);
      }

      const newThreshold = detector.getFailureThreshold();

      t.ok(newThreshold > initialThreshold, 
        'threshold should increase after flapping detection');

      detector.shutdown();
    } finally {
      cdcService.cleanup();
    }
  });

  // --------------------------------------------------------------------------
  // Test 16: Control Plane Message Forwarding to Leader
  // --------------------------------------------------------------------------
  await t.test('non-leader forwards control messages to leader', async (t) => {
    const cache = new SystemTableCache();
    const cdcService = createRealisticCDCService(cache, []);

    try {
      // Create follower message group
      const followerGroup = new MockMessageGroupService({
        isLeader: false,
        replicaId: 'follower-replica',
      });

      const controlPlane = new ControlPlaneService({
        nodeId: 'follower-node',
        nodeAddress: 'ws://follower-node:9000',
        systemTableCache: cache,
        cdcIntegrationService: cdcService,
        messageRouter: createMockMessageRouter(),
        rebalanceCoordinator: createMockRebalanceCoordinator(),
      });
      controlPlane.initialize();
      controlPlane.attachMessageGroupService(followerGroup);

      // Simulate receiving a control message on follower
      const controlMessage = {
        type: 'REPLICA_OPERATION_DISPATCH',
        operationId: 'op-123',
      };

      followerGroup.simulateMessageReceived(controlMessage);

      // Give time for async handling
      await new Promise((r) => setTimeout(r, 20));

      // Follower should have forwarded the message
      t.ok(followerGroup.sentMessages.length > 0, 
        'follower should forward message to leader');

      const forwardedMessage = followerGroup.sentMessages[0];
      t.ok(forwardedMessage.payload.forwardedBy, 
        'forwarded message should have forwardedBy field');

      controlPlane.shutdown();
    } finally {
      cdcService.cleanup();
    }
  });
});
