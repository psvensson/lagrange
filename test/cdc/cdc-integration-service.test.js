/**
 * Tests for CDCIntegrationService.
 * Requirements: 5.6, 5.7, 5.8, 5.9, 5.10
 */

import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import {
  CDCIntegrationService,
  CDCOperationType,
  VALID_SYSTEM_TABLES,
} from '../../src/cdc/cdc-integration-service.js';
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

test('CDCIntegrationService - constructor', async (t) => {
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
  });

  t.equal(service.nodeId, 'test-node', 'should set nodeId');
  t.equal(service.isInitialized(), false, 'should not be initialized');
  t.end();
});

test('CDCIntegrationService - constructor has no _nodeStates field', async (t) => {
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
  });

  t.equal(
    Object.prototype.hasOwnProperty.call(service, '_nodeStates'),
    false,
    'should not have _nodeStates property (node state tracking owned by CDCEventHandler)',
  );
  t.end();
});

test('CDCIntegrationService - initialize', async (t) => {
  const mockSqlEngine = createMockSqlQueryEngine();
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
  });

  service.initialize({
    sqlQueryEngine: mockSqlEngine,
  });

  t.equal(service.isInitialized(), true, 'should be initialized');
  t.end();
});

test('CDCIntegrationService - insertSystemTableRow', async (t) => {
  const mockSqlEngine = createMockSqlQueryEngine();
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
    sqlQueryEngine: mockSqlEngine,
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
  t.equal(mockSqlEngine.executedQueries.length, 1, 'should execute one query');
  t.ok(
    mockSqlEngine.executedQueries[0].sql.includes('INSERT INTO'),
    'should be INSERT query',
  );
  t.end();
});

test('CDCIntegrationService - insertSystemTableRow generates id', async (t) => {
  const mockSqlEngine = createMockSqlQueryEngine();
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
    sqlQueryEngine: mockSqlEngine,
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
  t.ok(result.data.node_id, 'should generate node_id');
  t.end();
});

test('CDCIntegrationService - updateSystemTableRow', async (t) => {
  const mockSqlEngine = createMockSqlQueryEngine();
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
    sqlQueryEngine: mockSqlEngine,
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
  t.equal(mockSqlEngine.executedQueries.length, 1, 'should execute one query');
  t.ok(
    mockSqlEngine.executedQueries[0].sql.includes('UPDATE'),
    'should be UPDATE query',
  );
  t.end();
});

test('CDCIntegrationService - deleteSystemTableRow', async (t) => {
  const mockSqlEngine = createMockSqlQueryEngine();
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
    sqlQueryEngine: mockSqlEngine,
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
  t.equal(mockSqlEngine.executedQueries.length, 1, 'should execute one query');
  t.ok(
    mockSqlEngine.executedQueries[0].sql.includes('DELETE'),
    'should be DELETE query',
  );
  t.end();
});

test('CDCIntegrationService - validates table name', async (t) => {
  const mockSqlEngine = createMockSqlQueryEngine();
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
    sqlQueryEngine: mockSqlEngine,
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
  const mockSqlEngine = createMockSqlQueryEngine();
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
    sqlQueryEngine: mockSqlEngine,
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
  const mockSqlEngine = createMockSqlQueryEngine();
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
    sqlQueryEngine: mockSqlEngine,
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
  const mockSqlEngine = createMockSqlQueryEngine();
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
    sqlQueryEngine: mockSqlEngine,
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

test('CDCIntegrationService - throws when sqlQueryEngine not available', async (t) => {
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
  });
  service.initialize();

  try {
    await service.insertSystemTableRow(SystemTableName.NODES, {node_id: '1'});
    t.fail('should throw error when sqlQueryEngine not available');
  } catch (error) {
    t.ok(error.message.includes('sqlQueryEngine not provided'),
      'should have error message');
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
  const mockSqlEngine = createMockSqlQueryEngine();
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
    sqlQueryEngine: mockSqlEngine,
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
  const mockSqlEngine = createMockSqlQueryEngine();
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
    sqlQueryEngine: mockSqlEngine,
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


// Import epoch-related classes for testing
import {AssignmentEpochManager} from '../../src/rebalancer/assignment-epoch-manager.js';
import {AssignmentEpoch} from '../../src/rebalancer/assignment-epoch.js';
import {EPOCH_CONFIG_KEY} from '../../src/cdc/cdc-integration-service.js';

test('CDCIntegrationService - setEpochManager', async (t) => {
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
  });

  const epochManager = new AssignmentEpochManager({nodeId: 'test-node'});
  epochManager.initialize();

  service.setEpochManager(epochManager);

  t.equal(service.epochManager, epochManager, 'should set epoch manager');
  t.end();
});

test('CDCIntegrationService - setEpochManager throws on null', async (t) => {
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
  });

  try {
    service.setEpochManager(null);
    t.fail('should throw error for null epoch manager');
  } catch (error) {
    t.ok(error.message.includes('epochManager is required'), 'should have error message');
  }
  t.end();
});

test('CDCIntegrationService - handleEpochChangeCDC applies valid epoch', async (t) => {
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
  });
  service.initialize();

  const epochManager = new AssignmentEpochManager({nodeId: 'test-node'});
  epochManager.initialize();
  service.setEpochManager(epochManager);

  // Create a new epoch to apply
  const newEpoch = new AssignmentEpoch({
    epoch: 1,
    assignments: {'partition-1': ['node-1', 'node-2']},
    timestamp: Date.now().toString(),
    proposedBy: 'other-node',
  });

  const cdcEvent = {
    tableName: SystemTableName.CONFIG,
    operation: 'UPDATE',
    data: {
      config_key: EPOCH_CONFIG_KEY,
      config_value: JSON.stringify(newEpoch.toObject()),
    },
  };

  const result = service.handleEpochChangeCDC(cdcEvent);

  t.equal(result.applied, true, 'should apply epoch');
  t.equal(result.epoch, 1, 'should return epoch number');
  t.equal(epochManager.getCurrentEpoch().epoch, 1, 'epoch manager should have new epoch');
  t.end();
});

test('CDCIntegrationService - handleEpochChangeCDC emits epochChange event', async (t) => {
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
  });
  service.initialize();

  const epochManager = new AssignmentEpochManager({nodeId: 'test-node'});
  epochManager.initialize();
  service.setEpochManager(epochManager);

  const events = [];
  service.on('epochChange', (e) => events.push(e));

  const newEpoch = new AssignmentEpoch({
    epoch: 1,
    assignments: {'partition-1': ['node-1']},
    timestamp: '12345',
    proposedBy: 'other-node',
  });

  const cdcEvent = {
    tableName: SystemTableName.CONFIG,
    operation: 'UPDATE',
    data: {
      config_key: EPOCH_CONFIG_KEY,
      config_value: newEpoch.toObject(),
    },
  };

  service.handleEpochChangeCDC(cdcEvent);

  t.equal(events.length, 1, 'should emit one epochChange event');
  t.equal(events[0].epoch, 1, 'event should have epoch number');
  t.equal(events[0].source, 'cdc', 'event should have cdc source');
  t.equal(events[0].proposedBy, 'other-node', 'event should have proposedBy');
  t.end();
});

test('CDCIntegrationService - handleEpochChangeCDC rejects non-epoch config key', async (t) => {
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
  });
  service.initialize();

  const epochManager = new AssignmentEpochManager({nodeId: 'test-node'});
  epochManager.initialize();
  service.setEpochManager(epochManager);

  const cdcEvent = {
    tableName: SystemTableName.CONFIG,
    operation: 'UPDATE',
    data: {
      config_key: 'some_other_config',
      config_value: 'some_value',
    },
  };

  const result = service.handleEpochChangeCDC(cdcEvent);

  t.equal(result.applied, false, 'should not apply');
  t.ok(result.error.includes('Not an epoch change event'), 'should have error message');
  t.end();
});

test('CDCIntegrationService - handleEpochChangeCDC rejects stale epoch', async (t) => {
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
  });
  service.initialize();

  const epochManager = new AssignmentEpochManager({nodeId: 'test-node'});
  // Initialize with epoch 5
  const initialEpoch = new AssignmentEpoch({
    epoch: 5,
    assignments: {'partition-1': ['node-1']},
    timestamp: Date.now().toString(),
    proposedBy: 'test-node',
  });
  epochManager.initialize(initialEpoch);
  service.setEpochManager(epochManager);

  // Try to apply epoch 3 (stale)
  const staleEpoch = new AssignmentEpoch({
    epoch: 3,
    assignments: {'partition-1': ['node-2']},
    timestamp: Date.now().toString(),
    proposedBy: 'other-node',
  });

  const cdcEvent = {
    tableName: SystemTableName.CONFIG,
    operation: 'UPDATE',
    data: {
      config_key: EPOCH_CONFIG_KEY,
      config_value: JSON.stringify(staleEpoch.toObject()),
    },
  };

  const result = service.handleEpochChangeCDC(cdcEvent);

  t.equal(result.applied, false, 'should not apply stale epoch');
  t.ok(result.error.includes('stale'), 'should have stale error message');
  t.equal(epochManager.getCurrentEpoch().epoch, 5, 'epoch should remain at 5');
  t.end();
});

test('CDCIntegrationService - handleEpochChangeCDC without epoch manager', async (t) => {
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
  });
  service.initialize();

  const cdcEvent = {
    tableName: SystemTableName.CONFIG,
    operation: 'UPDATE',
    data: {
      config_key: EPOCH_CONFIG_KEY,
      config_value: JSON.stringify({
        epoch: 1,
        assignments: {},
        timestamp: '12345',
        proposedBy: 'node-1',
      }),
    },
  };

  const result = service.handleEpochChangeCDC(cdcEvent);

  t.equal(result.applied, false, 'should not apply without epoch manager');
  t.ok(result.error.includes('Epoch manager not set'), 'should have error message');
  t.end();
});

test('CDCIntegrationService - handleEpochChangeCDC with invalid event', async (t) => {
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
  });
  service.initialize();

  const epochManager = new AssignmentEpochManager({nodeId: 'test-node'});
  epochManager.initialize();
  service.setEpochManager(epochManager);

  const result = service.handleEpochChangeCDC(null);

  t.equal(result.applied, false, 'should not apply null event');
  t.ok(result.error.includes('Invalid CDC event'), 'should have error message');
  t.end();
});

test('CDCIntegrationService - handleEpochChangeCDC with invalid JSON', async (t) => {
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
  });
  service.initialize();

  const epochManager = new AssignmentEpochManager({nodeId: 'test-node'});
  epochManager.initialize();
  service.setEpochManager(epochManager);

  const cdcEvent = {
    tableName: SystemTableName.CONFIG,
    operation: 'UPDATE',
    data: {
      config_key: EPOCH_CONFIG_KEY,
      config_value: 'not valid json {{{',
    },
  };

  const result = service.handleEpochChangeCDC(cdcEvent);

  t.equal(result.applied, false, 'should not apply with invalid JSON');
  t.ok(result.error.includes('Failed to parse epoch data'), 'should have parse error');
  t.end();
});

test('CDCIntegrationService - handleEpochChangeCDC with invalid epoch data', async (t) => {
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
  });
  service.initialize();

  const epochManager = new AssignmentEpochManager({nodeId: 'test-node'});
  epochManager.initialize();
  service.setEpochManager(epochManager);

  const cdcEvent = {
    tableName: SystemTableName.CONFIG,
    operation: 'UPDATE',
    data: {
      config_key: EPOCH_CONFIG_KEY,
      config_value: JSON.stringify({
        epoch: -1, // Invalid: negative epoch
        assignments: {},
        timestamp: '12345',
        proposedBy: 'node-1',
      }),
    },
  };

  const result = service.handleEpochChangeCDC(cdcEvent);

  t.equal(result.applied, false, 'should not apply with invalid epoch data');
  t.ok(result.error.includes('Failed to create epoch'), 'should have create error');
  t.end();
});

test('CDCIntegrationService - tracks epochChanges in stats', async (t) => {
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
  });
  service.initialize();

  const epochManager = new AssignmentEpochManager({nodeId: 'test-node'});
  epochManager.initialize();
  service.setEpochManager(epochManager);

  // Apply two epochs
  for (let i = 1; i <= 2; i++) {
    const epoch = new AssignmentEpoch({
      epoch: i,
      assignments: {'partition-1': ['node-1']},
      timestamp: Date.now().toString(),
      proposedBy: 'other-node',
    });

    const cdcEvent = {
      tableName: SystemTableName.CONFIG,
      operation: 'UPDATE',
      data: {
        config_key: EPOCH_CONFIG_KEY,
        config_value: epoch.toObject(),
      },
    };

    service.handleEpochChangeCDC(cdcEvent);
  }

  const stats = service.getStats();
  t.equal(stats.epochChanges, 2, 'should track epoch changes');
  t.end();
});

test('CDCIntegrationService - EPOCH_CONFIG_KEY is exported', async (t) => {
  t.equal(EPOCH_CONFIG_KEY, 'current_epoch', 'should export correct config key');
  t.end();
});


// Import EventEmitter for creating mock rebalancer
import {EventEmitter} from 'events';
import {NodeState} from '../../src/node/node-lifecycle-state-machine.js';

/**
 * Create a mock rebalancer for testing CDC integration.
 * Mimics the event-emitting behavior of UnifiedRebalancer.onNodeStateChange().
 * @return {Object} Mock rebalancer with onNodeStateChange method.
 */
function createMockRebalancer() {
  const emitter = new EventEmitter();
  emitter.onNodeStateChange = function(nodeId, oldState, newState) {
    // Emit nodeStateChange event (always)
    this.emit('nodeStateChange', {
      nodeId,
      oldState,
      newState,
      timestamp: Date.now(),
    });

    // Determine if rebalancing is needed
    let rebalanceNeeded = false;
    let reason = null;

    if (newState === NodeState.READY && oldState !== NodeState.READY) {
      rebalanceNeeded = true;
      reason = 'node_became_ready';
    }
    if (newState === NodeState.DRAINING) {
      rebalanceNeeded = true;
      reason = 'node_draining';
    }
    if (oldState === NodeState.READY && newState !== NodeState.READY &&
        newState !== NodeState.DRAINING) {
      rebalanceNeeded = true;
      reason = 'node_left_ready';
    }
    if (newState === NodeState.STOPPED) {
      rebalanceNeeded = true;
      reason = 'node_stopped';
    }

    if (rebalanceNeeded) {
      this.emit('rebalanceNeeded', {
        nodeId,
        oldState,
        newState,
        reason,
        timestamp: Date.now(),
      });
    }
  };
  return emitter;
}

test('CDCIntegrationService - setRebalancer', async (t) => {
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
  });

  const rebalancer = createMockRebalancer();

  service.setRebalancer(rebalancer);

  t.equal(service.rebalancer, rebalancer, 'should set rebalancer');
  t.end();
});

test('CDCIntegrationService - setRebalancer throws on null', async (t) => {
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
  });

  try {
    service.setRebalancer(null);
    t.fail('should throw error for null rebalancer');
  } catch (error) {
    t.ok(error.message.includes('rebalancer is required'), 'should have error message');
  }
  t.end();
});

test('CDCIntegrationService - handleNodeStateCDC processes valid event', async (t) => {
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
  });
  service.initialize();

  const cdcEvent = {
    tableName: SystemTableName.NODES,
    operation: 'UPDATE',
    data: {
      node_id: 'node-1',
      status: NodeState.READY,
    },
  };

  const result = service.handleNodeStateCDC(cdcEvent);

  t.equal(result.processed, true, 'should process event');
  t.equal(result.nodeId, 'node-1', 'should return node ID');
  t.equal(result.newState, NodeState.READY, 'should return new state');
  t.equal(result.stateChanged, true, 'should indicate state changed');
  t.end();
});

test('CDCIntegrationService - handleNodeStateCDC emits nodeStateChange event', async (t) => {
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
  });
  service.initialize();

  const events = [];
  service.on('nodeStateChange', (e) => events.push(e));

  const cdcEvent = {
    tableName: SystemTableName.NODES,
    operation: 'UPDATE',
    data: {
      node_id: 'node-1',
      status: NodeState.READY,
    },
  };

  service.handleNodeStateCDC(cdcEvent);

  t.equal(events.length, 1, 'should emit one nodeStateChange event');
  t.equal(events[0].nodeId, 'node-1', 'event should have node ID');
  t.equal(events[0].newState, NodeState.READY, 'event should have new state');
  t.equal(events[0].source, 'cdc', 'event should have cdc source');
  t.end();
});

test('CDCIntegrationService - handleNodeStateCDC triggers rebalancer', async (t) => {
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
  });
  service.initialize();

  const rebalancer = createMockRebalancer();
  const rebalancerEvents = [];
  rebalancer.on('nodeStateChange', (e) => rebalancerEvents.push(e));

  service.setRebalancer(rebalancer);

  const cdcEvent = {
    tableName: SystemTableName.NODES,
    operation: 'UPDATE',
    data: {
      node_id: 'node-1',
      status: NodeState.READY,
    },
  };

  service.handleNodeStateCDC(cdcEvent);

  t.equal(rebalancerEvents.length, 1, 'should trigger rebalancer');
  t.equal(rebalancerEvents[0].nodeId, 'node-1', 'rebalancer should receive node ID');
  t.equal(rebalancerEvents[0].newState, NodeState.READY, 'rebalancer should receive new state');
  t.end();
});

test('CDCIntegrationService - handleNodeStateCDC rejects non-nodes table', async (t) => {
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
  });
  service.initialize();

  const cdcEvent = {
    tableName: SystemTableName.CONFIG,
    operation: 'UPDATE',
    data: {
      config_key: 'some_key',
      config_value: 'some_value',
    },
  };

  const result = service.handleNodeStateCDC(cdcEvent);

  t.equal(result.processed, false, 'should not process');
  t.ok(result.error.includes('Not a nodes table event'), 'should have error message');
  t.end();
});

test('CDCIntegrationService - handleNodeStateCDC rejects invalid event', async (t) => {
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
  });
  service.initialize();

  const result = service.handleNodeStateCDC(null);

  t.equal(result.processed, false, 'should not process null event');
  t.ok(result.error.includes('Invalid CDC event'), 'should have error message');
  t.end();
});

test('CDCIntegrationService - handleNodeStateCDC rejects missing node_id', async (t) => {
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
  });
  service.initialize();

  const cdcEvent = {
    tableName: SystemTableName.NODES,
    operation: 'UPDATE',
    data: {
      status: NodeState.READY,
    },
  };

  const result = service.handleNodeStateCDC(cdcEvent);

  t.equal(result.processed, false, 'should not process');
  t.ok(result.error.includes('Missing node_id'), 'should have error message');
  t.end();
});

test('CDCIntegrationService - handleNodeStateCDC rejects missing status', async (t) => {
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
  });
  service.initialize();

  const cdcEvent = {
    tableName: SystemTableName.NODES,
    operation: 'UPDATE',
    data: {
      node_id: 'node-1',
    },
  };

  const result = service.handleNodeStateCDC(cdcEvent);

  t.equal(result.processed, false, 'should not process');
  t.ok(result.error.includes('Missing status'), 'should have error message');
  t.end();
});

test('CDCIntegrationService - handleNodeStateCDC tracks state changes', async (t) => {
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
  });
  service.initialize();

  // First state change: null -> JOINING
  const event1 = {
    tableName: SystemTableName.NODES,
    operation: 'INSERT',
    data: {
      node_id: 'node-1',
      status: NodeState.JOINING,
    },
  };
  const result1 = service.handleNodeStateCDC(event1);
  t.equal(result1.oldState, null, 'first event should have null old state');
  t.equal(result1.newState, NodeState.JOINING, 'first event should have JOINING new state');

  // Second state change: JOINING -> READY
  const event2 = {
    tableName: SystemTableName.NODES,
    operation: 'UPDATE',
    data: {
      node_id: 'node-1',
      status: NodeState.READY,
    },
  };
  const result2 = service.handleNodeStateCDC(event2);
  t.equal(result2.oldState, NodeState.JOINING, 'second event should have JOINING old state');
  t.equal(result2.newState, NodeState.READY, 'second event should have READY new state');

  t.end();
});

test('CDCIntegrationService - handleNodeStateCDC skips unchanged state', async (t) => {
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
  });
  service.initialize();

  const events = [];
  service.on('nodeStateChange', (e) => events.push(e));

  // First event sets state to READY
  const event1 = {
    tableName: SystemTableName.NODES,
    operation: 'UPDATE',
    data: {
      node_id: 'node-1',
      status: NodeState.READY,
    },
  };
  service.handleNodeStateCDC(event1);

  // Second event with same state
  const event2 = {
    tableName: SystemTableName.NODES,
    operation: 'UPDATE',
    data: {
      node_id: 'node-1',
      status: NodeState.READY,
    },
  };
  const result = service.handleNodeStateCDC(event2);

  t.equal(result.processed, true, 'should process event');
  t.equal(result.stateChanged, false, 'should indicate state not changed');
  t.equal(events.length, 1, 'should only emit one event (for first change)');
  t.end();
});

test('CDCIntegrationService - handleNodeStateCDC tracks nodeStateChanges in stats', async (t) => {
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
  });
  service.initialize();

  // Process multiple state changes
  const states = [NodeState.JOINING, NodeState.READY, NodeState.DRAINING];
  for (const status of states) {
    const cdcEvent = {
      tableName: SystemTableName.NODES,
      operation: 'UPDATE',
      data: {
        node_id: 'node-1',
        status,
      },
    };
    service.handleNodeStateCDC(cdcEvent);
  }

  const stats = service.getStats();
  t.equal(stats.nodeStateChanges, 3, 'should track node state changes');
  t.end();
});

test('CDCIntegrationService - handleNodeStateCDC without rebalancer', async (t) => {
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
  });
  service.initialize();

  // Don't set rebalancer

  const cdcEvent = {
    tableName: SystemTableName.NODES,
    operation: 'UPDATE',
    data: {
      node_id: 'node-1',
      status: NodeState.READY,
    },
  };

  // Should not throw, just skip rebalancer notification
  const result = service.handleNodeStateCDC(cdcEvent);

  t.equal(result.processed, true, 'should process event without rebalancer');
  t.equal(result.stateChanged, true, 'should indicate state changed');
  t.end();
});

test('CDCIntegrationService - handleNodeStateCDC handles DRAINING state', async (t) => {
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
  });
  service.initialize();

  const rebalancer = createMockRebalancer();
  const rebalanceNeededEvents = [];
  rebalancer.on('rebalanceNeeded', (e) => rebalanceNeededEvents.push(e));

  service.setRebalancer(rebalancer);

  // First set to READY
  service.handleNodeStateCDC({
    tableName: SystemTableName.NODES,
    operation: 'UPDATE',
    data: {
      node_id: 'node-1',
      status: NodeState.READY,
    },
  });

  // Then transition to DRAINING
  service.handleNodeStateCDC({
    tableName: SystemTableName.NODES,
    operation: 'UPDATE',
    data: {
      node_id: 'node-1',
      status: NodeState.DRAINING,
    },
  });

  // Rebalancer should emit rebalanceNeeded for DRAINING
  t.ok(
    rebalanceNeededEvents.some((e) => e.reason === 'node_draining'),
    'should trigger rebalance for draining node',
  );
  t.end();
});

test('CDCIntegrationService - setBootstrapMode enables bootstrap mode', async (t) => {
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
  });
  service.initialize();

  const mockPartitionServices = new Map();
  mockPartitionServices.set('partition-1', {id: 'partition-1'});
  mockPartitionServices.set('partition-2', {id: 'partition-2'});

  service.setBootstrapMode(true, mockPartitionServices);

  t.equal(service.bootstrapMode, true, 'should enable bootstrap mode');
  t.equal(service.localPartitionServices, mockPartitionServices, 'should store partition services');
  t.end();
});

test('CDCIntegrationService - setBootstrapMode disables bootstrap mode', async (t) => {
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
  });
  service.initialize();

  const mockPartitionServices = new Map();
  mockPartitionServices.set('partition-1', {id: 'partition-1'});

  service.setBootstrapMode(true, mockPartitionServices);
  t.equal(service.bootstrapMode, true, 'should enable bootstrap mode');

  service.setBootstrapMode(false, null);

  t.equal(service.bootstrapMode, false, 'should disable bootstrap mode');
  t.equal(service.localPartitionServices, null, 'should clear partition services');
  t.end();
});

test('CDCIntegrationService - clearBootstrapMode disables bootstrap mode', async (t) => {
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
  });
  service.initialize();

  const mockPartitionServices = new Map();
  mockPartitionServices.set('partition-1', {id: 'partition-1'});

  service.setBootstrapMode(true, mockPartitionServices);
  t.equal(service.bootstrapMode, true, 'should enable bootstrap mode');

  service.clearBootstrapMode();

  t.equal(service.bootstrapMode, false, 'should disable bootstrap mode');
  t.equal(service.localPartitionServices, null, 'should clear partition services');
  t.end();
});

test('CDCIntegrationService - setBootstrapMode requires Map when enabling', async (t) => {
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
  });
  service.initialize();

  try {
    service.setBootstrapMode(true, null);
    t.fail('should throw error when enabling without partition services');
  } catch (error) {
    t.ok(error.message.includes('requires a Map'), 'should throw error about Map requirement');
  }

  try {
    service.setBootstrapMode(true, {});
    t.fail('should throw error when enabling with non-Map object');
  } catch (error) {
    t.ok(error.message.includes('requires a Map'), 'should throw error about Map requirement');
  }

  t.end();
});

test('CDCIntegrationService - bootstrap mode starts disabled', async (t) => {
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
  });

  t.equal(service.bootstrapMode, false, 'should start with bootstrap mode disabled');
  t.equal(service.localPartitionServices, null, 'should start with null partition services');
  t.end();
});

test('CDCIntegrationService - extractTableNameFromSQL extracts from INSERT', async (t) => {
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
  });
  service.initialize();

  const tableName = service.extractTableNameFromSQL(
    'INSERT INTO services (service_id, address) VALUES (?, ?)',
  );

  t.equal(tableName, 'services', 'should extract table name from INSERT');
  t.end();
});

test('extractTableNameFromSQL extracts from INSERT OR REPLACE', async (t) => {
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
  });
  service.initialize();

  const tableName = service.extractTableNameFromSQL(
    'INSERT OR REPLACE INTO partitions (partition_id, table_name) VALUES (?, ?)',
  );

  t.equal(tableName, 'partitions', 'should extract table name from INSERT OR REPLACE');
  t.end();
});

test('CDCIntegrationService - extractTableNameFromSQL extracts from UPDATE', async (t) => {
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
  });
  service.initialize();

  const tableName = service.extractTableNameFromSQL(
    'UPDATE nodes SET status = ? WHERE node_id = ?',
  );

  t.equal(tableName, 'nodes', 'should extract table name from UPDATE');
  t.end();
});

test('CDCIntegrationService - extractTableNameFromSQL extracts from DELETE', async (t) => {
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
  });
  service.initialize();

  const tableName = service.extractTableNameFromSQL(
    'DELETE FROM replica_operations WHERE operation_id = ?',
  );

  t.equal(tableName, 'replica_operations', 'should extract table name from DELETE');
  t.end();
});

test('CDCIntegrationService - extractTableNameFromSQL returns null for invalid SQL', async (t) => {
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
  });
  service.initialize();

  t.equal(service.extractTableNameFromSQL(''), null, 'should return null for empty string');
  t.equal(service.extractTableNameFromSQL(null), null, 'should return null for null');
  t.equal(
    service.extractTableNameFromSQL('INVALID SQL'),
    null,
    'should return null for invalid SQL',
  );
  t.end();
});

test('executeSQLDirectToLocalPartition executes on local partition', async (t) => {
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
  });
  service.initialize();

  // Mock partition service
  const mockPartitionService = {
    partitionId: 'services-p1',
    initialized: true,
    isLeader: true,
    executeLocalQuery: async (sql, params) => {
      t.ok(sql.includes('INSERT INTO services'), 'should receive INSERT SQL');
      t.equal(params.length, 2, 'should receive params');
      return {success: true, affectedRows: 1};
    },
  };

  const mockPartitionServices = new Map();
  mockPartitionServices.set('services-p1', mockPartitionService);

  service.setBootstrapMode(true, mockPartitionServices);

  const result = await service.executeSQLDirectToLocalPartition(
    'INSERT INTO services (service_id, address) VALUES (?, ?)',
    ['service-1', 'node1/service/1'],
  );

  t.ok(result.success, 'should return success');
  t.equal(result.affectedRows, 1, 'should return affected rows');
  t.end();
});

test('executeSQLDirectToLocalPartition throws when not in bootstrap mode', async (t) => {
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
  });
  service.initialize();

  try {
    await service.executeSQLDirectToLocalPartition(
      'INSERT INTO services (service_id) VALUES (?)',
      ['service-1'],
    );
    t.fail('should throw error when not in bootstrap mode');
  } catch (error) {
    t.ok(error.message.includes('bootstrap mode'), 'should throw error about bootstrap mode');
  }

  t.end();
});

test('executeSQLDirectToLocalPartition throws when partition not found', async (t) => {
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
  });
  service.initialize();

  const mockPartitionServices = new Map();
  mockPartitionServices.set('nodes-p1', {
    partitionId: 'nodes-p1',
    initialized: true,
    isLeader: true,
    executeLocalQuery: async () => ({success: true, affectedRows: 1}),
  });

  service.setBootstrapMode(true, mockPartitionServices);

  try {
    await service.executeSQLDirectToLocalPartition(
      'INSERT INTO services (service_id) VALUES (?)',
      ['service-1'],
    );
    t.fail('should throw error when partition not found');
  } catch (error) {
    t.ok(
      error.message.includes('Partition services not initialized') ||
      error.message.includes('No local partition service found'),
      'should throw error about missing partition',
    );
    t.ok(error.message.includes('services'), 'should mention the table name');
  }

  t.end();
});

test('executeSQLDirectToLocalPartition throws when SQL parsing fails', async (t) => {
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
  });
  service.initialize();

  const mockPartitionServices = new Map();
  mockPartitionServices.set('services-p1', {
    partitionId: 'services-p1',
    initialized: true,
    isLeader: true,
    executeLocalQuery: async () => ({success: true, affectedRows: 1}),
  });

  service.setBootstrapMode(true, mockPartitionServices);

  try {
    await service.executeSQLDirectToLocalPartition('INVALID SQL', []);
    t.fail('should throw error when SQL parsing fails');
  } catch (error) {
    t.ok(
      error.message.includes('Could not extract table name'),
      'should throw error about table name extraction',
    );
  }

  t.end();
});

test('executeSQLDirectToLocalPartition handles partition errors', async (t) => {
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
  });
  service.initialize();

  const mockPartitionService = {
    partitionId: 'services-p1',
    initialized: true,
    isLeader: true,
    executeLocalQuery: async () => {
      return {success: false, error: 'Partition error'};
    },
  };

  const mockPartitionServices = new Map();
  mockPartitionServices.set('services-p1', mockPartitionService);

  service.setBootstrapMode(true, mockPartitionServices);

  try {
    await service.executeSQLDirectToLocalPartition(
      'INSERT INTO services (service_id) VALUES (?)',
      ['service-1'],
    );
    t.fail('should throw error when partition returns error');
  } catch (error) {
    t.ok(error.message.includes('Partition error'), 'should throw partition error');
  }

  t.end();
});

test('CDCIntegrationService - executeSQL routes to direct partition in bootstrap mode',
  async (t) => {
    const service = new CDCIntegrationService({
      nodeId: 'test-node',
    });
    service.initialize();

    let directCallMade = false;
    const mockPartitionService = {
      partitionId: 'services-p1',
      initialized: true,
      isLeader: true,
      executeLocalQuery: async (_sql, _params) => {
        directCallMade = true;
        return {success: true, affectedRows: 1};
      },
    };

    const mockPartitionServices = new Map();
    mockPartitionServices.set('services-p1', mockPartitionService);

    service.setBootstrapMode(true, mockPartitionServices);

    const result = await service.insertSystemTableRow(
      SystemTableName.SERVICES,
      {
        service_id: 'service-1',
        address: 'node1/service/1',
      },
    );

    t.ok(result.success, 'should succeed');
    t.ok(directCallMade, 'should call direct partition method in bootstrap mode');
    t.end();
  });

test('CDCIntegrationService - executeSQL routes to SQL engine in normal mode',
  async (t) => {
    const mockSqlEngine = createMockSqlQueryEngine();
    const service = new CDCIntegrationService({
      nodeId: 'test-node',
      sqlQueryEngine: mockSqlEngine,
    });
    service.initialize();

    // Ensure bootstrap mode is disabled (default state)
    t.equal(service.bootstrapMode, false, 'bootstrap mode should be disabled');

    const result = await service.insertSystemTableRow(
      SystemTableName.SERVICES,
      {
        service_id: 'service-1',
        address: 'node1/service/1',
      },
    );

    t.ok(result.success, 'should succeed');
    t.equal(
      mockSqlEngine.executedQueries.length,
      1,
      'should execute query through SQL engine',
    );
    t.ok(
      mockSqlEngine.executedQueries[0].sql.includes('INSERT INTO'),
      'should execute INSERT query',
    );
    t.end();
  });

test('CDCIntegrationService - executeSQL switches from bootstrap to normal mode',
  async (t) => {
    const mockSqlEngine = createMockSqlQueryEngine();
    const service = new CDCIntegrationService({
      nodeId: 'test-node',
      sqlQueryEngine: mockSqlEngine,
    });
    service.initialize();

    let directCallCount = 0;
    const mockPartitionService = {
      partitionId: 'services-p1',
      initialized: true,
      isLeader: true,
      executeLocalQuery: async (_sql, _params) => {
        directCallCount++;
        return {success: true, affectedRows: 1};
      },
    };

    const mockPartitionServices = new Map();
    mockPartitionServices.set('services-p1', mockPartitionService);

    // Enable bootstrap mode
    service.setBootstrapMode(true, mockPartitionServices);

    // First insert should go direct to partition
    await service.insertSystemTableRow(SystemTableName.SERVICES, {
      service_id: 'service-1',
      address: 'node1/service/1',
    });

    t.equal(directCallCount, 1, 'should call direct partition in bootstrap mode');
    t.equal(
      mockSqlEngine.executedQueries.length,
      0,
      'should not call SQL engine in bootstrap mode',
    );

    // Disable bootstrap mode
    service.clearBootstrapMode();

    // Second insert should go through SQL engine
    await service.insertSystemTableRow(SystemTableName.SERVICES, {
      service_id: 'service-2',
      address: 'node1/service/2',
    });

    t.equal(
      directCallCount,
      1,
      'should not call direct partition after bootstrap mode disabled',
    );
    t.equal(
      mockSqlEngine.executedQueries.length,
      1,
      'should call SQL engine after bootstrap mode disabled',
    );
    t.end();
  });

test('CDCIntegrationService - executeSQL throws when SQL engine missing in normal mode',
  async (t) => {
    const service = new CDCIntegrationService({
      nodeId: 'test-node',
    });
    service.initialize();

    // No SQL engine set and bootstrap mode disabled
    t.equal(service.bootstrapMode, false, 'bootstrap mode should be disabled');
    t.equal(service.sqlQueryEngine, null, 'SQL engine should be null');

    try {
      await service.insertSystemTableRow(SystemTableName.SERVICES, {
        service_id: 'service-1',
        address: 'node1/service/1',
      });
      t.fail('should throw error when SQL engine missing in normal mode');
    } catch (error) {
      t.ok(
        error.message.includes('sqlQueryEngine not provided'),
        'should throw error about missing SQL engine',
      );
    }

    t.end();
  });

test('CDCIntegrationService - executeSQL single code path based on mode flag',
  async (t) => {
    const mockSqlEngine = createMockSqlQueryEngine();
    const service = new CDCIntegrationService({
      nodeId: 'test-node',
      sqlQueryEngine: mockSqlEngine,
    });
    service.initialize();

    const mockPartitionService = {
      partitionId: 'nodes-p1',
      initialized: true,
      isLeader: true,
      executeLocalQuery: async (_sql, _params) => {
        return {success: true, affectedRows: 1};
      },
    };

    const mockPartitionServices = new Map();
    mockPartitionServices.set('nodes-p1', mockPartitionService);

    // Test 1: Bootstrap mode enabled - should use direct path
    service.setBootstrapMode(true, mockPartitionServices);
    await service.insertSystemTableRow(SystemTableName.NODES, {
      node_id: 'node-1',
      node_address: 'localhost:8080',
    });
    t.equal(
      mockSqlEngine.executedQueries.length,
      0,
      'should not use SQL engine in bootstrap mode',
    );

    // Test 2: Bootstrap mode disabled - should use SQL engine path
    service.clearBootstrapMode();
    await service.insertSystemTableRow(SystemTableName.NODES, {
      node_id: 'node-2',
      node_address: 'localhost:8081',
    });
    t.equal(
      mockSqlEngine.executedQueries.length,
      1,
      'should use SQL engine in normal mode',
    );

    t.end();
  });

test('CDCIntegrationService - transient detection includes leader-transition query failures',
  async (t) => {
    const service = new CDCIntegrationService({
      nodeId: 'test-node',
    });

    t.equal(
      service.isTransientCdcError('Query failed'),
      true,
      'generic query-failed wrapper should be treated as transient for CDC writes',
    );
    t.equal(
      service.isTransientCdcError('Failed to forward write to leader'),
      true,
      'leader-forwarding failures should be retried',
    );
    t.equal(
      service.isTransientCdcError('Message timeout'),
      true,
      'transport timeout during leader handoff should be retried',
    );
    t.equal(
      service.isTransientCdcError('SQL syntax error near FROM'),
      false,
      'non-transient SQL errors should not be retried',
    );
    t.end();
  });
