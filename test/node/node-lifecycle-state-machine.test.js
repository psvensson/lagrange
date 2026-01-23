/**
 * Tests for NodeLifecycleStateMachine.
 * Requirements: 2.1, 2.2, 2.3, 2.4
 */

import {test, beforeEach, afterEach} from 'tap';
import {
  NodeLifecycleStateMachine,
  NodeState,
  VALID_TRANSITIONS,
  InvalidTransitionError,
} from '../../src/node/node-lifecycle-state-machine.js';
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

test('NodeState enum - has all required states', async (t) => {
  t.equal(NodeState.STARTING, 'starting', 'should have STARTING');
  t.equal(NodeState.CONNECTING, 'connecting', 'should have CONNECTING');
  t.equal(NodeState.DISCOVERING, 'discovering', 'should have DISCOVERING');
  t.equal(NodeState.JOINING, 'joining', 'should have JOINING');
  t.equal(NodeState.SYNCING, 'syncing', 'should have SYNCING');
  t.equal(NodeState.READY, 'ready', 'should have READY');
  t.equal(NodeState.DRAINING, 'draining', 'should have DRAINING');
  t.equal(NodeState.STOPPED, 'stopped', 'should have STOPPED');
  t.end();
});

test('VALID_TRANSITIONS - defines correct transitions', async (t) => {
  t.same(
    VALID_TRANSITIONS[NodeState.STARTING],
    [NodeState.CONNECTING],
    'STARTING can only go to CONNECTING',
  );
  t.same(
    VALID_TRANSITIONS[NodeState.CONNECTING],
    [NodeState.DISCOVERING, NodeState.STOPPED],
    'CONNECTING can go to DISCOVERING or STOPPED',
  );
  t.same(
    VALID_TRANSITIONS[NodeState.DISCOVERING],
    [NodeState.JOINING, NodeState.STOPPED],
    'DISCOVERING can go to JOINING or STOPPED',
  );
  t.same(
    VALID_TRANSITIONS[NodeState.JOINING],
    [NodeState.SYNCING, NodeState.STOPPED],
    'JOINING can go to SYNCING or STOPPED',
  );
  t.same(
    VALID_TRANSITIONS[NodeState.SYNCING],
    [NodeState.READY, NodeState.STOPPED],
    'SYNCING can go to READY or STOPPED',
  );
  t.same(
    VALID_TRANSITIONS[NodeState.READY],
    [NodeState.DRAINING],
    'READY can only go to DRAINING',
  );
  t.same(
    VALID_TRANSITIONS[NodeState.DRAINING],
    [NodeState.STOPPED],
    'DRAINING can only go to STOPPED',
  );
  t.same(
    VALID_TRANSITIONS[NodeState.STOPPED],
    [],
    'STOPPED has no valid transitions',
  );
  t.end();
});

test('NodeLifecycleStateMachine - constructor defaults', async (t) => {
  const sm = new NodeLifecycleStateMachine();

  t.equal(sm.getState(), NodeState.STARTING, 'should default to STARTING state');
  t.equal(sm.nodeId, 'unknown', 'should default nodeId to unknown');
  t.end();
});

test('NodeLifecycleStateMachine - constructor with options', async (t) => {
  const sm = new NodeLifecycleStateMachine({
    nodeId: 'test-node-1',
    initialState: NodeState.READY,
  });

  t.equal(sm.getState(), NodeState.READY, 'should use provided initial state');
  t.equal(sm.nodeId, 'test-node-1', 'should use provided nodeId');
  t.end();
});

test('NodeLifecycleStateMachine - getState', async (t) => {
  const sm = new NodeLifecycleStateMachine();

  t.equal(sm.getState(), NodeState.STARTING, 'should return current state');
  t.end();
});

test('NodeLifecycleStateMachine - isValidTransition', async (t) => {
  const sm = new NodeLifecycleStateMachine();

  // Valid transitions
  t.equal(
    sm.isValidTransition(NodeState.STARTING, NodeState.CONNECTING),
    true,
    'STARTING -> CONNECTING is valid',
  );
  t.equal(
    sm.isValidTransition(NodeState.CONNECTING, NodeState.DISCOVERING),
    true,
    'CONNECTING -> DISCOVERING is valid',
  );
  t.equal(
    sm.isValidTransition(NodeState.CONNECTING, NodeState.STOPPED),
    true,
    'CONNECTING -> STOPPED is valid',
  );
  t.equal(
    sm.isValidTransition(NodeState.READY, NodeState.DRAINING),
    true,
    'READY -> DRAINING is valid',
  );

  // Invalid transitions
  t.equal(
    sm.isValidTransition(NodeState.STARTING, NodeState.READY),
    false,
    'STARTING -> READY is invalid',
  );
  t.equal(
    sm.isValidTransition(NodeState.READY, NodeState.STARTING),
    false,
    'READY -> STARTING is invalid',
  );
  t.equal(
    sm.isValidTransition(NodeState.STOPPED, NodeState.STARTING),
    false,
    'STOPPED -> STARTING is invalid',
  );
  t.equal(
    sm.isValidTransition(NodeState.READY, NodeState.STOPPED),
    false,
    'READY -> STOPPED is invalid (must go through DRAINING)',
  );

  // Invalid from state
  t.equal(
    sm.isValidTransition('invalid-state', NodeState.READY),
    false,
    'invalid state -> READY is invalid',
  );
  t.end();
});

test('NodeLifecycleStateMachine - transition success', async (t) => {
  const sm = new NodeLifecycleStateMachine();

  t.equal(sm.getState(), NodeState.STARTING, 'should start in STARTING');

  const result = sm.transition(NodeState.CONNECTING);

  t.equal(result, true, 'transition should return true');
  t.equal(sm.getState(), NodeState.CONNECTING, 'state should be CONNECTING');
  t.end();
});

test('NodeLifecycleStateMachine - transition failure', async (t) => {
  const sm = new NodeLifecycleStateMachine();

  const result = sm.transition(NodeState.READY);

  t.equal(result, false, 'transition should return false');
  t.equal(sm.getState(), NodeState.STARTING, 'state should remain STARTING');
  t.end();
});

test('NodeLifecycleStateMachine - full lifecycle transition', async (t) => {
  const sm = new NodeLifecycleStateMachine();

  // Go through the full happy path
  t.equal(sm.transition(NodeState.CONNECTING), true, 'STARTING -> CONNECTING');
  t.equal(sm.transition(NodeState.DISCOVERING), true, 'CONNECTING -> DISCOVERING');
  t.equal(sm.transition(NodeState.JOINING), true, 'DISCOVERING -> JOINING');
  t.equal(sm.transition(NodeState.SYNCING), true, 'JOINING -> SYNCING');
  t.equal(sm.transition(NodeState.READY), true, 'SYNCING -> READY');
  t.equal(sm.transition(NodeState.DRAINING), true, 'READY -> DRAINING');
  t.equal(sm.transition(NodeState.STOPPED), true, 'DRAINING -> STOPPED');

  t.equal(sm.getState(), NodeState.STOPPED, 'should end in STOPPED');
  t.end();
});

test('NodeLifecycleStateMachine - early stop from CONNECTING', async (t) => {
  const sm = new NodeLifecycleStateMachine();

  sm.transition(NodeState.CONNECTING);
  t.equal(sm.transition(NodeState.STOPPED), true, 'CONNECTING -> STOPPED');
  t.equal(sm.getState(), NodeState.STOPPED, 'should be STOPPED');
  t.end();
});

test('NodeLifecycleStateMachine - early stop from DISCOVERING', async (t) => {
  const sm = new NodeLifecycleStateMachine();

  sm.transition(NodeState.CONNECTING);
  sm.transition(NodeState.DISCOVERING);
  t.equal(sm.transition(NodeState.STOPPED), true, 'DISCOVERING -> STOPPED');
  t.equal(sm.getState(), NodeState.STOPPED, 'should be STOPPED');
  t.end();
});

test('NodeLifecycleStateMachine - emits stateChange event', async (t) => {
  const sm = new NodeLifecycleStateMachine({nodeId: 'test-node'});
  const events = [];

  sm.on('stateChange', (event) => {
    events.push(event);
  });

  sm.transition(NodeState.CONNECTING);

  t.equal(events.length, 1, 'should emit one event');
  t.equal(events[0].from, NodeState.STARTING, 'event should have from state');
  t.equal(events[0].to, NodeState.CONNECTING, 'event should have to state');
  t.ok(events[0].timestamp, 'event should have timestamp');
  t.ok(typeof events[0].timestamp === 'number', 'timestamp should be a number');
  t.end();
});

test('NodeLifecycleStateMachine - does not emit event on failed transition', async (t) => {
  const sm = new NodeLifecycleStateMachine();
  const events = [];

  sm.on('stateChange', (event) => {
    events.push(event);
  });

  sm.transition(NodeState.READY); // Invalid transition

  t.equal(events.length, 0, 'should not emit event on failed transition');
  t.end();
});

test('NodeLifecycleStateMachine - multiple transitions emit multiple events', async (t) => {
  const sm = new NodeLifecycleStateMachine();
  const events = [];

  sm.on('stateChange', (event) => {
    events.push(event);
  });

  sm.transition(NodeState.CONNECTING);
  sm.transition(NodeState.DISCOVERING);
  sm.transition(NodeState.JOINING);

  t.equal(events.length, 3, 'should emit three events');
  t.equal(events[0].from, NodeState.STARTING, 'first event from STARTING');
  t.equal(events[0].to, NodeState.CONNECTING, 'first event to CONNECTING');
  t.equal(events[1].from, NodeState.CONNECTING, 'second event from CONNECTING');
  t.equal(events[1].to, NodeState.DISCOVERING, 'second event to DISCOVERING');
  t.equal(events[2].from, NodeState.DISCOVERING, 'third event from DISCOVERING');
  t.equal(events[2].to, NodeState.JOINING, 'third event to JOINING');
  t.end();
});

test('NodeLifecycleStateMachine - isReady', async (t) => {
  const sm = new NodeLifecycleStateMachine();

  t.equal(sm.isReady(), false, 'should not be ready in STARTING');

  sm.transition(NodeState.CONNECTING);
  t.equal(sm.isReady(), false, 'should not be ready in CONNECTING');

  sm.transition(NodeState.DISCOVERING);
  sm.transition(NodeState.JOINING);
  sm.transition(NodeState.SYNCING);
  t.equal(sm.isReady(), false, 'should not be ready in SYNCING');

  sm.transition(NodeState.READY);
  t.equal(sm.isReady(), true, 'should be ready in READY');

  sm.transition(NodeState.DRAINING);
  t.equal(sm.isReady(), false, 'should not be ready in DRAINING');
  t.end();
});

test('NodeLifecycleStateMachine - isDraining', async (t) => {
  const sm = new NodeLifecycleStateMachine();

  t.equal(sm.isDraining(), false, 'should not be draining in STARTING');

  // Go to READY
  sm.transition(NodeState.CONNECTING);
  sm.transition(NodeState.DISCOVERING);
  sm.transition(NodeState.JOINING);
  sm.transition(NodeState.SYNCING);
  sm.transition(NodeState.READY);
  t.equal(sm.isDraining(), false, 'should not be draining in READY');

  sm.transition(NodeState.DRAINING);
  t.equal(sm.isDraining(), true, 'should be draining in DRAINING');

  sm.transition(NodeState.STOPPED);
  t.equal(sm.isDraining(), false, 'should not be draining in STOPPED');
  t.end();
});

test('NodeLifecycleStateMachine - isJoining', async (t) => {
  const sm = new NodeLifecycleStateMachine();

  t.equal(sm.isJoining(), false, 'should not be joining in STARTING');

  sm.transition(NodeState.CONNECTING);
  sm.transition(NodeState.DISCOVERING);
  t.equal(sm.isJoining(), false, 'should not be joining in DISCOVERING');

  sm.transition(NodeState.JOINING);
  t.equal(sm.isJoining(), true, 'should be joining in JOINING');

  sm.transition(NodeState.SYNCING);
  t.equal(sm.isJoining(), false, 'should not be joining in SYNCING');
  t.end();
});

test('NodeLifecycleStateMachine - isStopped', async (t) => {
  const sm = new NodeLifecycleStateMachine();

  t.equal(sm.isStopped(), false, 'should not be stopped in STARTING');

  sm.transition(NodeState.CONNECTING);
  sm.transition(NodeState.STOPPED);
  t.equal(sm.isStopped(), true, 'should be stopped in STOPPED');
  t.end();
});

test('NodeLifecycleStateMachine - isTransitional', async (t) => {
  const sm = new NodeLifecycleStateMachine();

  t.equal(sm.isTransitional(), true, 'STARTING is transitional');

  sm.transition(NodeState.CONNECTING);
  t.equal(sm.isTransitional(), true, 'CONNECTING is transitional');

  sm.transition(NodeState.DISCOVERING);
  sm.transition(NodeState.JOINING);
  sm.transition(NodeState.SYNCING);
  t.equal(sm.isTransitional(), true, 'SYNCING is transitional');

  sm.transition(NodeState.READY);
  t.equal(sm.isTransitional(), false, 'READY is not transitional');

  sm.transition(NodeState.DRAINING);
  t.equal(sm.isTransitional(), true, 'DRAINING is transitional');

  sm.transition(NodeState.STOPPED);
  t.equal(sm.isTransitional(), false, 'STOPPED is not transitional');
  t.end();
});

test('NodeLifecycleStateMachine - getValidTransitions', async (t) => {
  const sm = new NodeLifecycleStateMachine();

  t.same(
    sm.getValidTransitions(),
    [NodeState.CONNECTING],
    'STARTING has CONNECTING as valid transition',
  );

  sm.transition(NodeState.CONNECTING);
  t.same(
    sm.getValidTransitions(),
    [NodeState.DISCOVERING, NodeState.STOPPED],
    'CONNECTING has DISCOVERING and STOPPED as valid transitions',
  );

  sm.transition(NodeState.DISCOVERING);
  sm.transition(NodeState.JOINING);
  sm.transition(NodeState.SYNCING);
  sm.transition(NodeState.READY);
  t.same(
    sm.getValidTransitions(),
    [NodeState.DRAINING],
    'READY has DRAINING as valid transition',
  );

  sm.transition(NodeState.DRAINING);
  sm.transition(NodeState.STOPPED);
  t.same(
    sm.getValidTransitions(),
    [],
    'STOPPED has no valid transitions',
  );
  t.end();
});

test('NodeLifecycleStateMachine - cannot transition from STOPPED', async (t) => {
  const sm = new NodeLifecycleStateMachine({initialState: NodeState.STOPPED});

  t.equal(sm.transition(NodeState.STARTING), false, 'cannot go to STARTING');
  t.equal(sm.transition(NodeState.CONNECTING), false, 'cannot go to CONNECTING');
  t.equal(sm.transition(NodeState.READY), false, 'cannot go to READY');
  t.equal(sm.getState(), NodeState.STOPPED, 'should remain STOPPED');
  t.end();
});

test('InvalidTransitionError - constructor', async (t) => {
  const error = new InvalidTransitionError(
    NodeState.STARTING,
    NodeState.READY,
    [NodeState.CONNECTING],
  );

  t.equal(error.name, 'InvalidTransitionError', 'should have correct name');
  t.equal(error.currentState, NodeState.STARTING, 'should have currentState');
  t.equal(error.attemptedState, NodeState.READY, 'should have attemptedState');
  t.same(error.validTransitions, [NodeState.CONNECTING], 'should have validTransitions');
  t.ok(
    error.message.includes('starting'),
    'message should include current state',
  );
  t.ok(
    error.message.includes('ready'),
    'message should include attempted state',
  );
  t.ok(
    error.message.includes('connecting'),
    'message should include valid transitions',
  );
  t.end();
});

test('InvalidTransitionError - with no valid transitions', async (t) => {
  const error = new InvalidTransitionError(
    NodeState.STOPPED,
    NodeState.STARTING,
    [],
  );

  t.ok(
    error.message.includes('none'),
    'message should indicate no valid transitions',
  );
  t.end();
});
