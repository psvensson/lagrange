/**
 * Tests for CDCIntegrationService.
 * Requirements: 5.6, 5.7, 5.8, 5.9, 5.10
 */

import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import {
  CDCIntegrationService,
  EPOCH_CONFIG_KEY,
} from '../../src/cdc/cdc-integration-service.js';
import {
  SYSTEM_TABLE_NAME,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
} from '../../src/query/query-constants.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
} from '../../src/control-plane/control-plane-system-table-visibility-constants.js';
import {
} from '../../src/control-plane/owner-contract-outcome.js';
import {
} from '../../src/control-plane/timeout-budget.js';
import {
} from '../../src/control-plane/read-model-contract.js';
import {AssignmentEpochManager} from '../../src/rebalancer/assignment-epoch-manager.js';
import {AssignmentEpoch} from '../../src/rebalancer/assignment-epoch.js';
import {
  createMockSqlQueryEngine,
} from './cdc-integration-service-test-support.js';

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
      tableName: SYSTEM_TABLE_NAME.CONFIG,
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
    tableName: SYSTEM_TABLE_NAME.NODES,
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
    tableName: SYSTEM_TABLE_NAME.NODES,
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
    tableName: SYSTEM_TABLE_NAME.NODES,
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
    tableName: SYSTEM_TABLE_NAME.CONFIG,
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
    tableName: SYSTEM_TABLE_NAME.NODES,
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
    tableName: SYSTEM_TABLE_NAME.NODES,
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
    tableName: SYSTEM_TABLE_NAME.NODES,
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
    tableName: SYSTEM_TABLE_NAME.NODES,
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
    tableName: SYSTEM_TABLE_NAME.NODES,
    operation: 'UPDATE',
    data: {
      node_id: 'node-1',
      status: NodeState.READY,
    },
  };
  service.handleNodeStateCDC(event1);

  // Second event with same state
  const event2 = {
    tableName: SYSTEM_TABLE_NAME.NODES,
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
      tableName: SYSTEM_TABLE_NAME.NODES,
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
    tableName: SYSTEM_TABLE_NAME.NODES,
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
    tableName: SYSTEM_TABLE_NAME.NODES,
    operation: 'UPDATE',
    data: {
      node_id: 'node-1',
      status: NodeState.READY,
    },
  });

  // Then transition to DRAINING
  service.handleNodeStateCDC({
    tableName: SYSTEM_TABLE_NAME.NODES,
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

const CDC_INTEGRATION_SERVICE_TABLE_NAME_EXTRACTION_STATE = Object.freeze({
  FOUND: 'found',
  INVALID_INPUT: 'invalid_input',
  NOT_FOUND: 'not_found',
});

test('CDCIntegrationService - extractTableNameFromSQL extracts from INSERT', async (t) => {
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
  });
  service.initialize();

  const tableNameResult = service.extractTableNameFromSQL(
    'INSERT INTO services (service_id, address) VALUES (?, ?)',
  );

  t.same(
    tableNameResult,
    {
      state: CDC_INTEGRATION_SERVICE_TABLE_NAME_EXTRACTION_STATE.FOUND,
      tableName: 'services',
    },
    'should extract table name from INSERT',
  );
  t.end();
});

test('extractTableNameFromSQL extracts from INSERT OR REPLACE', async (t) => {
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
  });
  service.initialize();

  const tableNameResult = service.extractTableNameFromSQL(
    'INSERT OR REPLACE INTO partitions (partition_id, table_name) VALUES (?, ?)',
  );

  t.same(
    tableNameResult,
    {
      state: CDC_INTEGRATION_SERVICE_TABLE_NAME_EXTRACTION_STATE.FOUND,
      tableName: 'partitions',
    },
    'should extract table name from INSERT OR REPLACE',
  );
  t.end();
});

test('extractTableNameFromSQL extracts from INSERT OR IGNORE', async (t) => {
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
  });
  service.initialize();

  const tableNameResult = service.extractTableNameFromSQL(
    'INSERT OR IGNORE INTO config (config_key, config_value) VALUES (?, ?)',
  );

  t.same(
    tableNameResult,
    {
      state: CDC_INTEGRATION_SERVICE_TABLE_NAME_EXTRACTION_STATE.FOUND,
      tableName: 'config',
    },
    'should extract table name from INSERT OR IGNORE',
  );
  t.end();
});

test('CDCIntegrationService - extractTableNameFromSQL extracts from UPDATE', async (t) => {
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
  });
  service.initialize();

  const tableNameResult = service.extractTableNameFromSQL(
    'UPDATE nodes SET status = ? WHERE node_id = ?',
  );

  t.same(
    tableNameResult,
    {
      state: CDC_INTEGRATION_SERVICE_TABLE_NAME_EXTRACTION_STATE.FOUND,
      tableName: 'nodes',
    },
    'should extract table name from UPDATE',
  );
  t.end();
});

test('CDCIntegrationService - extractTableNameFromSQL extracts from DELETE', async (t) => {
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
  });
  service.initialize();

  const tableNameResult = service.extractTableNameFromSQL(
    'DELETE FROM replica_operations WHERE operation_id = ?',
  );

  t.same(
    tableNameResult,
    {
      state: CDC_INTEGRATION_SERVICE_TABLE_NAME_EXTRACTION_STATE.FOUND,
      tableName: 'replica_operations',
    },
    'should extract table name from DELETE',
  );
  t.end();
});

test('CDCIntegrationService - extractTableNameFromSQL returns explicit invalid and not-found states', async (t) => {
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
  });
  service.initialize();

  t.same(
    service.extractTableNameFromSQL(''),
    {
      state: CDC_INTEGRATION_SERVICE_TABLE_NAME_EXTRACTION_STATE.INVALID_INPUT,
    },
    'should return explicit invalid_input for empty string',
  );
  t.same(
    service.extractTableNameFromSQL(null),
    {
      state: CDC_INTEGRATION_SERVICE_TABLE_NAME_EXTRACTION_STATE.INVALID_INPUT,
    },
    'should return explicit invalid_input for null',
  );
  t.same(
    service.extractTableNameFromSQL('INVALID SQL'),
    {
      state: CDC_INTEGRATION_SERVICE_TABLE_NAME_EXTRACTION_STATE.NOT_FOUND,
    },
    'should return explicit not_found for invalid SQL',
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
      SYSTEM_TABLE_NAME.SERVICES,
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
      SYSTEM_TABLE_NAME.SERVICES,
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

test('CDCIntegrationService - canWriteSystemTableLocally detects local leader ownership',
  async (t) => {
    const service = new CDCIntegrationService({
      nodeId: 'test-node',
      partitionServicesProvider: new Map([
        ['services-p1-r1', {
          partitionId: 'services-p1',
          initialized: true,
          isLeader: true,
          executeQuery: async () => ({success: true, affectedRows: 1}),
        }],
      ]),
    });
    service.initialize();

    t.equal(
      service.canWriteSystemTableLocally(SYSTEM_TABLE_NAME.SERVICES),
      true,
      'should treat a local services leader as a writable owner',
    );
    t.equal(
      service.canWriteSystemTableLocally('not_a_system_table'),
      false,
      'should reject unknown tables',
    );
    t.end();
  });

test('CDCIntegrationService - steady-state writes use isolated SQL sessions',
  async (t) => {
    const observedSessions = [];
    const mockSqlEngine = {
      executedQueries: [],
      async executeQuery(sql, params = [], options = {}) {
        this.executedQueries.push({sql, params, options});
        observedSessions.push(options.sessionId || null);
        if (!options.sessionId || options.sessionId === 'default') {
          return {
            success: false,
            error: 'Transaction already active for this session',
          };
        }
        return {
          success: true,
          affectedRows: 1,
        };
      },
    };
    const service = new CDCIntegrationService({
      nodeId: 'test-node',
      sqlQueryEngine: mockSqlEngine,
    });
    service.initialize();

    const result = await service.insertSystemTableRow(
      SYSTEM_TABLE_NAME.SERVICES,
      {
        service_id: 'service-1',
        address: 'node1/service/1',
      },
      {skipCacheWait: true},
    );

    t.equal(result.success, true, 'should succeed with an isolated session');
    t.equal(observedSessions.length, 1, 'should execute one routed SQL write');
    t.type(observedSessions[0], 'string', 'should provide a SQL session id');
    t.not(observedSessions[0], 'default', 'should not reuse the default session');
    t.match(
      observedSessions[0],
      /^cdc-system-write:/,
      'should use the CDC system-write session prefix',
    );
    t.end();
  });

test('CDCIntegrationService - steady-state writes keep a stable widened ' +
  'recovery selection key across isolated SQL sessions',
async (t) => {
  const observedSessions = [];
  const observedRecoveryCandidateSelectionKeys = [];
  const mockSqlEngine = {
    executedQueries: [],
    async executeQuery(sql, params = [], options = {}) {
      this.executedQueries.push({sql, params, options});
      observedSessions.push(options.sessionId || null);
      observedRecoveryCandidateSelectionKeys.push(
        options.recoveryCandidateSelectionKey || null,
      );
      return {
        success: true,
        affectedRows: 1,
      };
    },
  };
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
    sqlQueryEngine: mockSqlEngine,
  });
  service.initialize();

  await service.insertSystemTableRow(
    SYSTEM_TABLE_NAME.SERVICES,
    {
      service_id: 'service-routing-key-1',
      address: 'node1/service/routing-key-1',
    },
    {skipCacheWait: true},
  );
  await service.insertSystemTableRow(
    SYSTEM_TABLE_NAME.SERVICES,
    {
      service_id: 'service-routing-key-1',
      address: 'node1/service/routing-key-1',
    },
    {skipCacheWait: true},
  );

  t.equal(observedSessions.length, 2, 'should execute both routed SQL writes');
  t.not(
    observedSessions[0],
    observedSessions[1],
    'steady-state CDC writes should still use isolated SQL sessions',
  );
  t.type(
    observedRecoveryCandidateSelectionKeys[0],
    'string',
    'steady-state CDC writes should pass one explicit widened-routing selection key',
  );
  t.equal(
    observedRecoveryCandidateSelectionKeys[0],
    observedRecoveryCandidateSelectionKeys[1],
    'identical steady-state CDC writes should reuse the same widened-routing selection key',
  );
  t.end();
});

test('CDCIntegrationService - update upsert and delete preserve routed ' +
  'session and widened selection options',
async (t) => {
  const observedQueries = [];
  const expectedRecoveryCandidateSelectionKey =
    'cdc-recovery-selection-key';
  const expectedSessionId = 'cdc-system-write:explicit-session';
  const expectedVisibilityResult = {visibilityState: 'visible'};
  const mockSqlEngine = {
    async executeQuery(sql, params = [], options = {}) {
      observedQueries.push({sql, params, options});
      return {
        success: true,
        affectedRows: 1,
      };
    },
  };
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
    sqlQueryEngine: mockSqlEngine,
  });
  service.initialize();
  service.waitForCacheUpdate =
    async () => expectedVisibilityResult;

  await service.updateSystemTableRow(
    SYSTEM_TABLE_NAME.SERVICES,
    {service_id: 'service-routing-key-2'},
    {status: 'active'},
    {
      recoveryCandidateSelectionKey:
        expectedRecoveryCandidateSelectionKey,
      sessionId: expectedSessionId,
    },
  );
  await service.upsertSystemTableRow(
    SYSTEM_TABLE_NAME.SERVICES,
    {
      service_id: 'service-routing-key-2',
      address: 'node1/service/routing-key-2',
    },
    {
      recoveryCandidateSelectionKey:
        expectedRecoveryCandidateSelectionKey,
      sessionId: expectedSessionId,
    },
  );
  await service.deleteSystemTableRow(
    SYSTEM_TABLE_NAME.SERVICES,
    {service_id: 'service-routing-key-2'},
    {
      recoveryCandidateSelectionKey:
        expectedRecoveryCandidateSelectionKey,
      sessionId: expectedSessionId,
    },
  );

  t.equal(
    observedQueries.length,
    3,
    'should execute one routed SQL write per mutation type',
  );
  for (const observedQuery of observedQueries) {
    t.equal(
      observedQuery.options.sessionId,
      expectedSessionId,
      'mutation should preserve the explicit routed SQL session id',
    );
    t.equal(
      observedQuery.options.recoveryCandidateSelectionKey,
      expectedRecoveryCandidateSelectionKey,
      'mutation should preserve the widened recovery candidate selection key',
    );
  }
});
