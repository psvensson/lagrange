/**
 * Tests for CDCEventHandler.
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10
 */

import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import {CDCEventHandler} from '../../src/cdc/cdc-event-handler.js';
import {SystemTableName} from '../../src/bootstrap/system-table-schemas-constants.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {AssignmentEpochManager} from '../../src/rebalancer/assignment-epoch-manager.js';
import {AssignmentEpoch} from '../../src/rebalancer/assignment-epoch.js';
import {NodeState} from '../../src/node/node-lifecycle-state-machine.js';
import {CDC_EPOCH_CONFIG_KEY} from '../../src/cdc/cdc-constants.js';
import {ENTRYPOINT_DEFAULT} from '../../src/constants/entrypoint.js';
import {CDC_OPERATION} from '../../src/constants/index.js';

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
 * Create a mock event context for testing.
 * @param {Object} overrides - Optional overrides for the context.
 * @return {Object} Mock event context.
 */
function createMockEventContext(overrides = {}) {
  const events = [];
  return {
    epochManager: overrides.epochManager || null,
    rebalancer: overrides.rebalancer || null,
    messageRouter: overrides.messageRouter || null,
    events,
    emit(eventName, data) {
      events.push({eventName, data});
    },
    incrementEpochChanges: overrides.incrementEpochChanges || (() => {}),
    incrementNodeStateChanges: overrides.incrementNodeStateChanges || (() => {}),
  };
}


/**
 * Create a mock rebalancer for testing.
 * @return {Object} Mock rebalancer with onNodeStateChange method.
 */
function createMockRebalancer() {
  const calls = [];
  return {
    calls,
    onNodeStateChange(nodeId, oldState, newState) {
      calls.push({nodeId, oldState, newState});
    },
  };
}

/**
 * Create a mock message router for testing.
 * @param {Object} options - Options for the mock.
 * @return {Object} Mock message router.
 */
function createMockMessageRouter(options = {}) {
  const connections = [];
  const nodeConnections = options.connectedNodes ?
    new Map(options.connectedNodes.map((id) => [id, true])) :
    new Map();

  return {
    nodeConnections,
    connections,
    async connectToNode(nodeId, wsAddress) {
      if (options.shouldFail) {
        throw new Error(options.failureMessage || 'Connection failed');
      }
      connections.push({nodeId, wsAddress});
      nodeConnections.set(nodeId, true);
    },
  };
}

// =============================================================================
// Constructor Tests
// =============================================================================

test('CDCEventHandler - constructor requires nodeId', async (t) => {
  try {
    new CDCEventHandler({eventContext: {}});
    t.fail('should throw error for missing nodeId');
  } catch (error) {
    t.ok(error.message.includes('requires nodeId'), 'should have error message');
  }
  t.end();
});

test('CDCEventHandler - constructor requires eventContext', async (t) => {
  try {
    new CDCEventHandler({nodeId: 'test-node'});
    t.fail('should throw error for missing eventContext');
  } catch (error) {
    t.ok(error.message.includes('requires eventContext'), 'should have error message');
  }
  t.end();
});

test('CDCEventHandler - constructor succeeds with valid options', async (t) => {
  const context = createMockEventContext();
  const handler = new CDCEventHandler({
    nodeId: 'test-node',
    eventContext: context,
  });

  t.equal(handler.nodeId, 'test-node', 'should set nodeId');
  t.equal(handler.eventContext, context, 'should set eventContext');
  t.end();
});


// =============================================================================
// handleEpochChangeCDC Tests - Requirements 3.1, 3.2, 3.3, 3.9
// =============================================================================

test('handleEpochChangeCDC - applies valid epoch event (Req 3.1)', async (t) => {
  const epochManager = new AssignmentEpochManager({nodeId: 'test-node'});
  epochManager.initialize();

  let epochChangesCount = 0;
  const context = createMockEventContext({
    epochManager,
    incrementEpochChanges: () => epochChangesCount++,
  });

  const handler = new CDCEventHandler({
    nodeId: 'test-node',
    eventContext: context,
  });

  const newEpoch = new AssignmentEpoch({
    epoch: 1,
    assignments: {'partition-1': ['node-1', 'node-2']},
    timestamp: Date.now().toString(),
    proposedBy: 'other-node',
  });

  const cdcEvent = {
    tableName: SystemTableName.CONFIG,
    operation: CDC_OPERATION.UPDATE,
    data: {
      config_key: CDC_EPOCH_CONFIG_KEY,
      config_value: JSON.stringify(newEpoch.toObject()),
    },
  };

  const result = handler.handleEpochChangeCDC(cdcEvent);

  t.equal(result.applied, true, 'should apply epoch');
  t.equal(result.epoch, 1, 'should return epoch number');
  t.equal(epochManager.getCurrentEpoch().epoch, 1, 'epoch manager should have new epoch');
  t.equal(epochChangesCount, 1, 'should increment epoch changes');
  t.equal(context.events.length, 1, 'should emit one event');
  t.equal(context.events[0].eventName, 'epochChange', 'should emit epochChange event');
  t.end();
});

test('handleEpochChangeCDC - handles config_value as object', async (t) => {
  const epochManager = new AssignmentEpochManager({nodeId: 'test-node'});
  epochManager.initialize();

  const context = createMockEventContext({epochManager});
  const handler = new CDCEventHandler({
    nodeId: 'test-node',
    eventContext: context,
  });

  const cdcEvent = {
    tableName: SystemTableName.CONFIG,
    operation: CDC_OPERATION.UPDATE,
    data: {
      config_key: CDC_EPOCH_CONFIG_KEY,
      config_value: {
        epoch: 1,
        assignments: {'partition-1': ['node-1']},
        timestamp: '12345',
        proposedBy: 'other-node',
      },
    },
  };

  const result = handler.handleEpochChangeCDC(cdcEvent);

  t.equal(result.applied, true, 'should apply epoch from object');
  t.equal(result.epoch, 1, 'should return epoch number');
  t.end();
});


test('handleEpochChangeCDC - returns error for invalid JSON (Req 3.2)', async (t) => {
  const epochManager = new AssignmentEpochManager({nodeId: 'test-node'});
  epochManager.initialize();

  const context = createMockEventContext({epochManager});
  const handler = new CDCEventHandler({
    nodeId: 'test-node',
    eventContext: context,
  });

  const cdcEvent = {
    tableName: SystemTableName.CONFIG,
    operation: CDC_OPERATION.UPDATE,
    data: {
      config_key: CDC_EPOCH_CONFIG_KEY,
      config_value: 'not valid json {{{',
    },
  };

  const result = handler.handleEpochChangeCDC(cdcEvent);

  t.equal(result.applied, false, 'should not apply with invalid JSON');
  t.ok(result.error.includes('Failed to parse epoch data'), 'should have parse error');
  t.equal(context.events.length, 0, 'should not emit events');
  t.end();
});

test('handleEpochChangeCDC - returns error for non-epoch config key (Req 3.3)', async (t) => {
  const epochManager = new AssignmentEpochManager({nodeId: 'test-node'});
  epochManager.initialize();

  const context = createMockEventContext({epochManager});
  const handler = new CDCEventHandler({
    nodeId: 'test-node',
    eventContext: context,
  });

  const cdcEvent = {
    tableName: SystemTableName.CONFIG,
    operation: CDC_OPERATION.UPDATE,
    data: {
      config_key: 'some_other_config',
      config_value: 'some_value',
    },
  };

  const result = handler.handleEpochChangeCDC(cdcEvent);

  t.equal(result.applied, false, 'should not apply');
  t.ok(result.error.includes('Not an epoch change event'), 'should have error message');
  t.end();
});

test('handleEpochChangeCDC - returns error without epoch manager (Req 3.9)', async (t) => {
  const context = createMockEventContext({epochManager: null});
  const handler = new CDCEventHandler({
    nodeId: 'test-node',
    eventContext: context,
  });

  const cdcEvent = {
    tableName: SystemTableName.CONFIG,
    operation: CDC_OPERATION.UPDATE,
    data: {
      config_key: CDC_EPOCH_CONFIG_KEY,
      config_value: JSON.stringify({
        epoch: 1,
        assignments: {},
        timestamp: '12345',
        proposedBy: 'node-1',
      }),
    },
  };

  const result = handler.handleEpochChangeCDC(cdcEvent);

  t.equal(result.applied, false, 'should not apply without epoch manager');
  t.ok(result.error.includes('Epoch manager not set'), 'should have error message');
  t.end();
});


test('handleEpochChangeCDC - returns error for null event', async (t) => {
  const epochManager = new AssignmentEpochManager({nodeId: 'test-node'});
  epochManager.initialize();

  const context = createMockEventContext({epochManager});
  const handler = new CDCEventHandler({
    nodeId: 'test-node',
    eventContext: context,
  });

  const result = handler.handleEpochChangeCDC(null);

  t.equal(result.applied, false, 'should not apply null event');
  t.ok(result.error.includes('Invalid CDC event'), 'should have error message');
  t.end();
});

test('handleEpochChangeCDC - returns error for invalid epoch data', async (t) => {
  const epochManager = new AssignmentEpochManager({nodeId: 'test-node'});
  epochManager.initialize();

  const context = createMockEventContext({epochManager});
  const handler = new CDCEventHandler({
    nodeId: 'test-node',
    eventContext: context,
  });

  const cdcEvent = {
    tableName: SystemTableName.CONFIG,
    operation: CDC_OPERATION.UPDATE,
    data: {
      config_key: CDC_EPOCH_CONFIG_KEY,
      config_value: JSON.stringify({
        epoch: -1, // Invalid: negative epoch
        assignments: {},
        timestamp: '12345',
        proposedBy: 'node-1',
      }),
    },
  };

  const result = handler.handleEpochChangeCDC(cdcEvent);

  t.equal(result.applied, false, 'should not apply with invalid epoch data');
  t.ok(result.error.includes('Failed to create epoch'), 'should have create error');
  t.end();
});

test('handleEpochChangeCDC - rejects stale epoch', async (t) => {
  const epochManager = new AssignmentEpochManager({nodeId: 'test-node'});
  const initialEpoch = new AssignmentEpoch({
    epoch: 5,
    assignments: {'partition-1': ['node-1']},
    timestamp: Date.now().toString(),
    proposedBy: 'test-node',
  });
  epochManager.initialize(initialEpoch);

  const context = createMockEventContext({epochManager});
  const handler = new CDCEventHandler({
    nodeId: 'test-node',
    eventContext: context,
  });

  const staleEpoch = new AssignmentEpoch({
    epoch: 3,
    assignments: {'partition-1': ['node-2']},
    timestamp: Date.now().toString(),
    proposedBy: 'other-node',
  });

  const cdcEvent = {
    tableName: SystemTableName.CONFIG,
    operation: CDC_OPERATION.UPDATE,
    data: {
      config_key: CDC_EPOCH_CONFIG_KEY,
      config_value: JSON.stringify(staleEpoch.toObject()),
    },
  };

  const result = handler.handleEpochChangeCDC(cdcEvent);

  t.equal(result.applied, false, 'should not apply stale epoch');
  t.ok(result.error.includes('stale'), 'should have stale error message');
  t.equal(epochManager.getCurrentEpoch().epoch, 5, 'epoch should remain at 5');
  t.end();
});


// =============================================================================
// handleNodeStateCDC Tests - Requirements 3.4, 3.5
// =============================================================================

test('handleNodeStateCDC - processes valid state change (Req 3.4)', async (t) => {
  const rebalancer = createMockRebalancer();
  let stateChangesCount = 0;
  const context = createMockEventContext({
    rebalancer,
    incrementNodeStateChanges: () => stateChangesCount++,
  });

  const handler = new CDCEventHandler({
    nodeId: 'test-node',
    eventContext: context,
  });

  const cdcEvent = {
    tableName: SystemTableName.NODES,
    operation: CDC_OPERATION.UPDATE,
    data: {
      node_id: 'node-1',
      status: NodeState.READY,
    },
  };

  const result = handler.handleNodeStateCDC(cdcEvent);

  t.equal(result.processed, true, 'should process event');
  t.equal(result.nodeId, 'node-1', 'should return node ID');
  t.equal(result.newState, NodeState.READY, 'should return new state');
  t.equal(result.stateChanged, true, 'should indicate state changed');
  t.equal(stateChangesCount, 1, 'should increment state changes');
  t.equal(rebalancer.calls.length, 1, 'should notify rebalancer');
  t.equal(rebalancer.calls[0].nodeId, 'node-1', 'rebalancer should receive node ID');
  t.equal(context.events.length, 1, 'should emit one event');
  t.equal(context.events[0].eventName, 'nodeStateChange', 'should emit nodeStateChange event');
  t.end();
});

test('handleNodeStateCDC - tracks state transitions', async (t) => {
  const context = createMockEventContext();
  const handler = new CDCEventHandler({
    nodeId: 'test-node',
    eventContext: context,
  });

  // First state change: null -> JOINING
  const event1 = {
    tableName: SystemTableName.NODES,
    operation: CDC_OPERATION.INSERT,
    data: {
      node_id: 'node-1',
      status: NodeState.JOINING,
    },
  };
  const result1 = handler.handleNodeStateCDC(event1);
  t.equal(result1.oldState, null, 'first event should have null old state');
  t.equal(result1.newState, NodeState.JOINING, 'first event should have JOINING new state');

  // Second state change: JOINING -> READY
  const event2 = {
    tableName: SystemTableName.NODES,
    operation: CDC_OPERATION.UPDATE,
    data: {
      node_id: 'node-1',
      status: NodeState.READY,
    },
  };
  const result2 = handler.handleNodeStateCDC(event2);
  t.equal(result2.oldState, NodeState.JOINING, 'second event should have JOINING old state');
  t.equal(result2.newState, NodeState.READY, 'second event should have READY new state');

  t.end();
});

test('handleNodeStateCDC - ignores stale state events by updated_at ordering', async (t) => {
  const rebalancer = createMockRebalancer();
  let stateChangesCount = 0;
  const context = createMockEventContext({
    rebalancer,
    incrementNodeStateChanges: () => stateChangesCount++,
  });
  const handler = new CDCEventHandler({
    nodeId: 'test-node',
    eventContext: context,
  });

  const latestEvent = {
    tableName: SystemTableName.NODES,
    operation: CDC_OPERATION.UPDATE,
    data: {
      node_id: 'node-1',
      status: NodeState.READY,
      updated_at: 200,
    },
  };
  handler.handleNodeStateCDC(latestEvent);

  const staleEvent = {
    tableName: SystemTableName.NODES,
    operation: CDC_OPERATION.UPDATE,
    data: {
      node_id: 'node-1',
      status: NodeState.DRAINING,
      updated_at: 150,
    },
  };
  const result = handler.handleNodeStateCDC(staleEvent);

  t.equal(result.processed, true, 'should process stale event as no-op');
  t.equal(result.stateChanged, false, 'should not apply stale state transition');
  t.equal(result.staleEventIgnored, true, 'should mark stale event as ignored');
  t.equal(handler.getNodeStates().get('node-1'), NodeState.READY,
    'should keep latest known state');
  t.equal(stateChangesCount, 1, 'should not increment state changes for stale event');
  t.equal(rebalancer.calls.length, 1, 'should not notify rebalancer for stale event');
  t.end();
});

test('handleNodeStateCDC - uses last_heartbeat ordering when updated_at missing', async (t) => {
  const rebalancer = createMockRebalancer();
  let stateChangesCount = 0;
  const context = createMockEventContext({
    rebalancer,
    incrementNodeStateChanges: () => stateChangesCount++,
  });
  const handler = new CDCEventHandler({
    nodeId: 'test-node',
    eventContext: context,
  });

  handler.handleNodeStateCDC({
    tableName: SystemTableName.NODES,
    operation: CDC_OPERATION.UPDATE,
    data: {
      node_id: 'node-1',
      status: NodeState.JOINING,
      last_heartbeat: 100,
    },
  });

  const stale = handler.handleNodeStateCDC({
    tableName: SystemTableName.NODES,
    operation: CDC_OPERATION.UPDATE,
    data: {
      node_id: 'node-1',
      status: NodeState.READY,
      last_heartbeat: 90,
    },
  });

  const newer = handler.handleNodeStateCDC({
    tableName: SystemTableName.NODES,
    operation: CDC_OPERATION.UPDATE,
    data: {
      node_id: 'node-1',
      status: NodeState.READY,
      last_heartbeat: 110,
    },
  });

  t.equal(stale.stateChanged, false, 'should ignore stale heartbeat event');
  t.equal(stale.staleEventIgnored, true, 'should mark stale heartbeat event');
  t.equal(newer.stateChanged, true, 'should apply newer heartbeat event');
  t.equal(handler.getNodeStates().get('node-1'), NodeState.READY,
    'should reflect newest state transition');
  t.equal(stateChangesCount, 2, 'should count only non-stale transitions');
  t.equal(rebalancer.calls.length, 2, 'should notify rebalancer only for non-stale transitions');
  t.end();
});


test('handleNodeStateCDC - skips unchanged state (Req 3.5)', async (t) => {
  const context = createMockEventContext();
  const handler = new CDCEventHandler({
    nodeId: 'test-node',
    eventContext: context,
  });

  // First event sets state to READY
  const event1 = {
    tableName: SystemTableName.NODES,
    operation: CDC_OPERATION.UPDATE,
    data: {
      node_id: 'node-1',
      status: NodeState.READY,
    },
  };
  handler.handleNodeStateCDC(event1);

  // Second event with same state
  const event2 = {
    tableName: SystemTableName.NODES,
    operation: CDC_OPERATION.UPDATE,
    data: {
      node_id: 'node-1',
      status: NodeState.READY,
    },
  };
  const result = handler.handleNodeStateCDC(event2);

  t.equal(result.processed, true, 'should process event');
  t.equal(result.stateChanged, false, 'should indicate state not changed');
  t.equal(context.events.length, 1, 'should only emit one event (for first change)');
  t.end();
});

test('handleNodeStateCDC - works without rebalancer', async (t) => {
  const context = createMockEventContext({rebalancer: null});
  const handler = new CDCEventHandler({
    nodeId: 'test-node',
    eventContext: context,
  });

  const cdcEvent = {
    tableName: SystemTableName.NODES,
    operation: CDC_OPERATION.UPDATE,
    data: {
      node_id: 'node-1',
      status: NodeState.READY,
    },
  };

  const result = handler.handleNodeStateCDC(cdcEvent);

  t.equal(result.processed, true, 'should process event without rebalancer');
  t.equal(result.stateChanged, true, 'should indicate state changed');
  t.end();
});

test('handleNodeStateCDC - rejects non-nodes table', async (t) => {
  const context = createMockEventContext();
  const handler = new CDCEventHandler({
    nodeId: 'test-node',
    eventContext: context,
  });

  const cdcEvent = {
    tableName: SystemTableName.CONFIG,
    operation: CDC_OPERATION.UPDATE,
    data: {
      config_key: 'some_key',
      config_value: 'some_value',
    },
  };

  const result = handler.handleNodeStateCDC(cdcEvent);

  t.equal(result.processed, false, 'should not process');
  t.ok(result.error.includes('Not a nodes table event'), 'should have error message');
  t.end();
});


test('handleNodeStateCDC - rejects null event', async (t) => {
  const context = createMockEventContext();
  const handler = new CDCEventHandler({
    nodeId: 'test-node',
    eventContext: context,
  });

  const result = handler.handleNodeStateCDC(null);

  t.equal(result.processed, false, 'should not process null event');
  t.ok(result.error.includes('Invalid CDC event'), 'should have error message');
  t.end();
});

test('handleNodeStateCDC - rejects missing node_id', async (t) => {
  const context = createMockEventContext();
  const handler = new CDCEventHandler({
    nodeId: 'test-node',
    eventContext: context,
  });

  const cdcEvent = {
    tableName: SystemTableName.NODES,
    operation: CDC_OPERATION.UPDATE,
    data: {
      status: NodeState.READY,
    },
  };

  const result = handler.handleNodeStateCDC(cdcEvent);

  t.equal(result.processed, false, 'should not process');
  t.ok(result.error.includes('Missing node_id'), 'should have error message');
  t.end();
});

test('handleNodeStateCDC - rejects missing status', async (t) => {
  const context = createMockEventContext();
  const handler = new CDCEventHandler({
    nodeId: 'test-node',
    eventContext: context,
  });

  const cdcEvent = {
    tableName: SystemTableName.NODES,
    operation: CDC_OPERATION.UPDATE,
    data: {
      node_id: 'node-1',
    },
  };

  const result = handler.handleNodeStateCDC(cdcEvent);

  t.equal(result.processed, false, 'should not process');
  t.ok(result.error.includes('Missing status'), 'should have error message');
  t.end();
});

// =============================================================================
// handleNodeJoinedCDC Tests - Requirements 3.6, 3.7, 3.10
// =============================================================================

test('handleNodeJoinedCDC - connects to new node (Req 3.6)', async (t) => {
  const messageRouter = createMockMessageRouter();
  const context = createMockEventContext({messageRouter});

  const handler = new CDCEventHandler({
    nodeId: 'test-node',
    eventContext: context,
  });

  const cdcEvent = {
    tableName: SystemTableName.NODES,
    operation: CDC_OPERATION.INSERT,
    data: {
      node_id: 'new-node',
      node_address: 'localhost:8080',
    },
  };

  const result = await handler.handleNodeJoinedCDC(cdcEvent);

  t.equal(result.processed, true, 'should process event');
  t.equal(result.nodeId, 'new-node', 'should return node ID');
  t.equal(result.connected, true, 'should indicate connected');
  t.equal(messageRouter.connections.length, 1, 'should make one connection');
  t.equal(messageRouter.connections[0].nodeId, 'new-node', 'should connect to correct node');
  t.equal(context.events.length, 1, 'should emit one event');
  t.equal(context.events[0].eventName, 'nodeJoined', 'should emit nodeJoined event');
  t.end();
});


test('handleNodeJoinedCDC - skips self node (Req 3.7)', async (t) => {
  const messageRouter = createMockMessageRouter();
  const context = createMockEventContext({messageRouter});

  const handler = new CDCEventHandler({
    nodeId: 'test-node',
    eventContext: context,
  });

  const cdcEvent = {
    tableName: SystemTableName.NODES,
    operation: CDC_OPERATION.INSERT,
    data: {
      node_id: 'test-node', // Same as handler's nodeId
      node_address: 'localhost:8080',
    },
  };

  const result = await handler.handleNodeJoinedCDC(cdcEvent);

  t.equal(result.processed, true, 'should process event');
  t.equal(result.skipped, true, 'should indicate skipped');
  t.equal(result.reason, 'self', 'should have self reason');
  t.equal(result.connected, false, 'should not connect');
  t.equal(messageRouter.connections.length, 0, 'should not make connections');
  t.end();
});

test('handleNodeJoinedCDC - skips already connected node', async (t) => {
  const messageRouter = createMockMessageRouter({connectedNodes: ['existing-node']});
  const context = createMockEventContext({messageRouter});

  const handler = new CDCEventHandler({
    nodeId: 'test-node',
    eventContext: context,
  });

  const cdcEvent = {
    tableName: SystemTableName.NODES,
    operation: CDC_OPERATION.INSERT,
    data: {
      node_id: 'existing-node',
      node_address: 'localhost:8080',
    },
  };

  const result = await handler.handleNodeJoinedCDC(cdcEvent);

  t.equal(result.processed, true, 'should process event');
  t.equal(result.skipped, true, 'should indicate skipped');
  t.equal(result.reason, 'already_connected', 'should have already_connected reason');
  t.equal(result.connected, false, 'should not connect');
  t.end();
});

test('handleNodeJoinedCDC - returns error without message router (Req 3.10)', async (t) => {
  const context = createMockEventContext({messageRouter: null});

  const handler = new CDCEventHandler({
    nodeId: 'test-node',
    eventContext: context,
  });

  const cdcEvent = {
    tableName: SystemTableName.NODES,
    operation: CDC_OPERATION.INSERT,
    data: {
      node_id: 'new-node',
      node_address: 'localhost:8080',
    },
  };

  const result = await handler.handleNodeJoinedCDC(cdcEvent);

  t.equal(result.processed, false, 'should not process');
  t.ok(result.error.includes('Message router not set'), 'should have error message');
  t.end();
});


test('handleNodeJoinedCDC - rejects non-INSERT operation', async (t) => {
  const messageRouter = createMockMessageRouter();
  const context = createMockEventContext({messageRouter});

  const handler = new CDCEventHandler({
    nodeId: 'test-node',
    eventContext: context,
  });

  const cdcEvent = {
    tableName: SystemTableName.NODES,
    operation: CDC_OPERATION.UPDATE, // Not INSERT
    data: {
      node_id: 'new-node',
      node_address: 'localhost:8080',
    },
  };

  const result = await handler.handleNodeJoinedCDC(cdcEvent);

  t.equal(result.processed, false, 'should not process UPDATE');
  t.ok(result.error.includes('Not an INSERT operation'), 'should have error message');
  t.end();
});

test('handleNodeJoinedCDC - rejects non-nodes table', async (t) => {
  const messageRouter = createMockMessageRouter();
  const context = createMockEventContext({messageRouter});

  const handler = new CDCEventHandler({
    nodeId: 'test-node',
    eventContext: context,
  });

  const cdcEvent = {
    tableName: SystemTableName.CONFIG,
    operation: CDC_OPERATION.INSERT,
    data: {
      config_key: 'some_key',
      config_value: 'some_value',
    },
  };

  const result = await handler.handleNodeJoinedCDC(cdcEvent);

  t.equal(result.processed, false, 'should not process');
  t.ok(result.error.includes('Not a nodes table event'), 'should have error message');
  t.end();
});

test('handleNodeJoinedCDC - rejects null event', async (t) => {
  const messageRouter = createMockMessageRouter();
  const context = createMockEventContext({messageRouter});

  const handler = new CDCEventHandler({
    nodeId: 'test-node',
    eventContext: context,
  });

  const result = await handler.handleNodeJoinedCDC(null);

  t.equal(result.processed, false, 'should not process null event');
  t.ok(result.error.includes('Invalid CDC event'), 'should have error message');
  t.end();
});

test('handleNodeJoinedCDC - rejects missing node_id', async (t) => {
  const messageRouter = createMockMessageRouter();
  const context = createMockEventContext({messageRouter});

  const handler = new CDCEventHandler({
    nodeId: 'test-node',
    eventContext: context,
  });

  const cdcEvent = {
    tableName: SystemTableName.NODES,
    operation: CDC_OPERATION.INSERT,
    data: {
      node_address: 'localhost:8080',
    },
  };

  const result = await handler.handleNodeJoinedCDC(cdcEvent);

  t.equal(result.processed, false, 'should not process');
  t.ok(result.error.includes('Missing node_id'), 'should have error message');
  t.end();
});


test('handleNodeJoinedCDC - rejects missing node_address', async (t) => {
  const messageRouter = createMockMessageRouter();
  const context = createMockEventContext({messageRouter});

  const handler = new CDCEventHandler({
    nodeId: 'test-node',
    eventContext: context,
  });

  const cdcEvent = {
    tableName: SystemTableName.NODES,
    operation: CDC_OPERATION.INSERT,
    data: {
      node_id: 'new-node',
    },
  };

  const result = await handler.handleNodeJoinedCDC(cdcEvent);

  t.equal(result.processed, false, 'should not process');
  t.ok(result.error.includes('Missing node_address'), 'should have error message');
  t.end();
});

test('handleNodeJoinedCDC - handles connection failure gracefully', async (t) => {
  const messageRouter = createMockMessageRouter({
    shouldFail: true,
    failureMessage: 'Connection refused',
  });
  const context = createMockEventContext({messageRouter});

  const handler = new CDCEventHandler({
    nodeId: 'test-node',
    eventContext: context,
  });

  const cdcEvent = {
    tableName: SystemTableName.NODES,
    operation: CDC_OPERATION.INSERT,
    data: {
      node_id: 'new-node',
      node_address: 'localhost:8080',
    },
  };

  const result = await handler.handleNodeJoinedCDC(cdcEvent);

  t.equal(result.processed, false, 'should not process on failure');
  t.equal(result.nodeId, 'new-node', 'should return node ID');
  t.ok(result.error.includes('Connection refused'), 'should have error message');
  t.equal(context.events.length, 0, 'should not emit events on failure');
  t.end();
});

// =============================================================================
// deriveWsAddressFromNodeAddress Tests - Requirement 3.8
// =============================================================================

test('deriveWsAddressFromNodeAddress - derives correct WebSocket URL (Req 3.8)', async (t) => {
  const context = createMockEventContext();
  const handler = new CDCEventHandler({
    nodeId: 'test-node',
    eventContext: context,
  });

  const wsAddress = handler.deriveWsAddressFromNodeAddress('localhost:8080');

  const expectedWsPort = 8080 + ENTRYPOINT_DEFAULT.WS_PORT_OFFSET;
  t.equal(wsAddress, `ws://localhost:${expectedWsPort}`, 'should derive correct WebSocket URL');
  t.end();
});

test('deriveWsAddressFromNodeAddress - handles different ports', async (t) => {
  const context = createMockEventContext();
  const handler = new CDCEventHandler({
    nodeId: 'test-node',
    eventContext: context,
  });

  const testCases = [
    {input: 'localhost:3000', expectedPort: 3000 + ENTRYPOINT_DEFAULT.WS_PORT_OFFSET},
    {input: '192.168.1.1:9000', expectedPort: 9000 + ENTRYPOINT_DEFAULT.WS_PORT_OFFSET},
    {input: 'example.com:80', expectedPort: 80 + ENTRYPOINT_DEFAULT.WS_PORT_OFFSET},
  ];

  for (const tc of testCases) {
    const wsAddress = handler.deriveWsAddressFromNodeAddress(tc.input);
    const hostname = tc.input.split(':')[0];
    t.equal(wsAddress, `ws://${hostname}:${tc.expectedPort}`, `should handle ${tc.input}`);
  }
  t.end();
});


test('deriveWsAddressFromNodeAddress - returns null for invalid input', async (t) => {
  const context = createMockEventContext();
  const handler = new CDCEventHandler({
    nodeId: 'test-node',
    eventContext: context,
  });

  const invalidInputs = [
    null,
    undefined,
    '',
    'localhost', // No port
    ':8080', // No hostname
    'localhost:', // Empty port
    'localhost:abc', // Non-numeric port
    'localhost:-1', // Negative port
    'localhost:0', // Zero port
    123, // Not a string
  ];

  for (const input of invalidInputs) {
    const result = handler.deriveWsAddressFromNodeAddress(input);
    t.equal(result, null, `should return null for invalid input: ${JSON.stringify(input)}`);
  }
  t.end();
});

test('deriveWsAddressFromNodeAddress - handles IPv6 addresses', async (t) => {
  const context = createMockEventContext();
  const handler = new CDCEventHandler({
    nodeId: 'test-node',
    eventContext: context,
  });

  // IPv6 with port uses last colon as separator
  const wsAddress = handler.deriveWsAddressFromNodeAddress('[::1]:8080');

  const expectedWsPort = 8080 + ENTRYPOINT_DEFAULT.WS_PORT_OFFSET;
  t.equal(wsAddress, `ws://[::1]:${expectedWsPort}`, 'should handle IPv6 address');
  t.end();
});

// =============================================================================
// Node State Tracking Tests
// =============================================================================

test('getNodeStates - returns tracked states', async (t) => {
  const context = createMockEventContext();
  const handler = new CDCEventHandler({
    nodeId: 'test-node',
    eventContext: context,
  });

  // Process some state changes
  handler.handleNodeStateCDC({
    tableName: SystemTableName.NODES,
    operation: CDC_OPERATION.UPDATE,
    data: {node_id: 'node-1', status: NodeState.READY},
  });

  handler.handleNodeStateCDC({
    tableName: SystemTableName.NODES,
    operation: CDC_OPERATION.UPDATE,
    data: {node_id: 'node-2', status: NodeState.JOINING},
  });

  const states = handler.getNodeStates();

  t.ok(states instanceof Map, 'should return a Map');
  t.equal(states.get('node-1'), NodeState.READY, 'should track node-1 state');
  t.equal(states.get('node-2'), NodeState.JOINING, 'should track node-2 state');
  t.end();
});

test('setNodeState - sets node state for initialization', async (t) => {
  const context = createMockEventContext();
  const handler = new CDCEventHandler({
    nodeId: 'test-node',
    eventContext: context,
  });

  handler.setNodeState('node-1', NodeState.READY);
  handler.setNodeState('node-2', NodeState.DRAINING);

  const states = handler.getNodeStates();
  t.equal(states.get('node-1'), NodeState.READY, 'should set node-1 state');
  t.equal(states.get('node-2'), NodeState.DRAINING, 'should set node-2 state');
  t.end();
});

test('setNodeState - affects subsequent state change detection', async (t) => {
  const context = createMockEventContext();
  const handler = new CDCEventHandler({
    nodeId: 'test-node',
    eventContext: context,
  });

  // Pre-set state
  handler.setNodeState('node-1', NodeState.READY);

  // Process event with same state
  const result = handler.handleNodeStateCDC({
    tableName: SystemTableName.NODES,
    operation: CDC_OPERATION.UPDATE,
    data: {node_id: 'node-1', status: NodeState.READY},
  });

  t.equal(result.stateChanged, false, 'should detect no change from pre-set state');
  t.equal(result.oldState, NodeState.READY, 'should have correct old state');
  t.end();
});
