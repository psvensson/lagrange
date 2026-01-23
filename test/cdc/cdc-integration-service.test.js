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


// Import StateAwareRebalancer for testing node state CDC handler
import {StateAwareRebalancer} from '../../src/rebalancer/state-aware-rebalancer.js';
import {NodeState} from '../../src/node/node-lifecycle-state-machine.js';

test('CDCIntegrationService - setRebalancer', async (t) => {
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
  });

  const rebalancer = new StateAwareRebalancer({nodeId: 'test-node'});

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

  const rebalancer = new StateAwareRebalancer({nodeId: 'test-node'});
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

  const rebalancer = new StateAwareRebalancer({nodeId: 'test-node'});
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
