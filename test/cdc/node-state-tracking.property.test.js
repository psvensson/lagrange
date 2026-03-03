/**
 * Property test for Node State Tracking Consistency.
 *
 * Property 2: For any sequence of node state CDC events for the same node,
 * the CDCEventHandler's tracked state SHALL always reflect the most recent
 * state value, and state changes SHALL only emit events when the state
 * actually changes.
 *
 * **Validates: Requirements 3.4, 3.5**
 *
 * Feature: test-coverage-improvements
 * Property: Node State Tracking Consistency
 */

import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {CDCEventHandler} from '../../src/cdc/cdc-event-handler.js';
import {SYSTEM_TABLE_NAME} from '../../src/bootstrap/system-table-schemas-constants.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {NodeState} from '../../src/node/node-lifecycle-state-machine.js';
import {CDC_OPERATION} from '../../src/constants/index.js';

// Valid node states for property testing
const VALID_NODE_STATES = [
  NodeState.STARTING,
  NodeState.CONNECTING,
  NodeState.DISCOVERING,
  NodeState.JOINING,
  NodeState.READY,
  NodeState.DRAINING,
  NodeState.STOPPED,
];

/**
 * Initialize test environment with required singletons.
 */
function initializeTestEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();

  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize({});
  }

  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize({level: 'error'});
  }
}

/**
 * Cleanup test environment.
 */
function cleanupTestEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
}

beforeEach(() => {
  initializeTestEnvironment();
});

afterEach(() => {
  cleanupTestEnvironment();
});

/**
 * Create a mock event context for testing.
 * @return {Object} Mock event context with event tracking.
 */
function createMockEventContext() {
  const events = [];
  let nodeStateChanges = 0;
  return {
    epochManager: null,
    rebalancer: null,
    messageRouter: null,
    events,
    emit(eventName, data) {
      events.push({eventName, data});
    },
    incrementEpochChanges: () => {},
    incrementNodeStateChanges: () => nodeStateChanges++,
    getNodeStateChanges: () => nodeStateChanges,
  };
}

/**
 * Arbitrary for generating valid node IDs (alphanumeric, 1-20 chars).
 */
const nodeIdArb = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9-]{0,19}$/);

/**
 * Arbitrary for generating valid node states.
 */
const nodeStateArb = fc.constantFrom(...VALID_NODE_STATES);

/**
 * Arbitrary for generating a sequence of node state CDC events for the same node.
 */
const nodeStateEventSequenceArb = fc.record({
  nodeId: nodeIdArb,
  states: fc.array(nodeStateArb, {minLength: 1, maxLength: 20}),
});

/**
 * Create a node state CDC event.
 * @param {string} nodeId - The node ID.
 * @param {string} state - The node state.
 * @return {Object} CDC event object.
 */
function createNodeStateCDCEvent(nodeId, state) {
  return {
    tableName: SYSTEM_TABLE_NAME.NODES,
    operation: CDC_OPERATION.UPDATE,
    data: {
      node_id: nodeId,
      status: state,
    },
  };
}

/**
 * Property 2: Node State Tracking Consistency
 *
 * For any sequence of node state CDC events for the same node, the
 * CDCEventHandler's tracked state SHALL always reflect the most recent
 * state value, and state changes SHALL only emit events when the state
 * actually changes.
 *
 * **Validates: Requirements 3.4, 3.5**
 */
test('Property: Node state tracking reflects most recent state', async (t) => {
  await fc.assert(
    fc.property(
      nodeStateEventSequenceArb,
      (eventSequence) => {
        const context = createMockEventContext();
        const handler = new CDCEventHandler({
          nodeId: 'test-handler-node',
          eventContext: context,
        });

        const {nodeId, states} = eventSequence;

        // Process all state events
        for (const state of states) {
          const cdcEvent = createNodeStateCDCEvent(nodeId, state);
          handler.handleNodeStateCDC(cdcEvent);
        }

        // Verify tracked state matches the last state in the sequence
        const trackedStates = handler.getNodeStates();
        const finalTrackedState = trackedStates.get(nodeId);
        const expectedFinalState = states[states.length - 1];

        return finalTrackedState === expectedFinalState;
      },
    ),
    {numRuns: 10},
  );

  t.pass('Node state tracking reflects most recent state');
});

/**
 * Property: State changes only emit events when state actually changes.
 *
 * For any sequence of node state CDC events, the number of emitted
 * nodeStateChange events SHALL equal the number of actual state transitions
 * (consecutive different states).
 *
 * **Validates: Requirements 3.4, 3.5**
 */
test('Property: Events emitted only on actual state changes', async (t) => {
  await fc.assert(
    fc.property(
      nodeStateEventSequenceArb,
      (eventSequence) => {
        const context = createMockEventContext();
        const handler = new CDCEventHandler({
          nodeId: 'test-handler-node',
          eventContext: context,
        });

        const {nodeId, states} = eventSequence;

        // Process all state events
        for (const state of states) {
          const cdcEvent = createNodeStateCDCEvent(nodeId, state);
          handler.handleNodeStateCDC(cdcEvent);
        }

        // Count expected state changes (transitions between different states)
        let expectedChanges = 0;
        let previousState = null;
        for (const state of states) {
          if (state !== previousState) {
            expectedChanges++;
            previousState = state;
          }
        }

        // Count actual emitted events
        const emittedEvents = context.events.filter(
          (e) => e.eventName === 'nodeStateChange',
        );

        return emittedEvents.length === expectedChanges;
      },
    ),
    {numRuns: 10},
  );

  t.pass('Events emitted only on actual state changes');
});

/**
 * Property: Consecutive duplicate states do not emit events.
 *
 * For any sequence where the same state appears consecutively, only the
 * first occurrence SHALL emit an event.
 *
 * **Validates: Requirements 3.5**
 */
test('Property: Consecutive duplicate states do not emit events', async (t) => {
  await fc.assert(
    fc.property(
      nodeIdArb,
      nodeStateArb,
      fc.integer({min: 2, max: 10}),
      (nodeId, state, repeatCount) => {
        const context = createMockEventContext();
        const handler = new CDCEventHandler({
          nodeId: 'test-handler-node',
          eventContext: context,
        });

        // Send the same state multiple times
        for (let i = 0; i < repeatCount; i++) {
          const cdcEvent = createNodeStateCDCEvent(nodeId, state);
          handler.handleNodeStateCDC(cdcEvent);
        }

        // Should only emit one event (for the first state change from null)
        const emittedEvents = context.events.filter(
          (e) => e.eventName === 'nodeStateChange',
        );

        return emittedEvents.length === 1;
      },
    ),
    {numRuns: 10},
  );

  t.pass('Consecutive duplicate states do not emit events');
});

/**
 * Property: State tracking is independent per node.
 *
 * For any two different nodes with their own state sequences, the tracked
 * states SHALL be independent and reflect each node's most recent state.
 *
 * **Validates: Requirements 3.4, 3.5**
 */
test('Property: State tracking is independent per node', async (t) => {
  await fc.assert(
    fc.property(
      nodeStateEventSequenceArb,
      nodeStateEventSequenceArb,
      (seq1, seq2) => {
        // Ensure different node IDs
        const nodeId1 = seq1.nodeId;
        const nodeId2 = nodeId1 === seq2.nodeId ? seq2.nodeId + '-alt' : seq2.nodeId;

        const context = createMockEventContext();
        const handler = new CDCEventHandler({
          nodeId: 'test-handler-node',
          eventContext: context,
        });

        // Interleave events from both nodes
        const maxLen = Math.max(seq1.states.length, seq2.states.length);
        for (let i = 0; i < maxLen; i++) {
          if (i < seq1.states.length) {
            const cdcEvent = createNodeStateCDCEvent(nodeId1, seq1.states[i]);
            handler.handleNodeStateCDC(cdcEvent);
          }
          if (i < seq2.states.length) {
            const cdcEvent = createNodeStateCDCEvent(nodeId2, seq2.states[i]);
            handler.handleNodeStateCDC(cdcEvent);
          }
        }

        // Verify each node's tracked state is independent
        const trackedStates = handler.getNodeStates();
        const finalState1 = trackedStates.get(nodeId1);
        const finalState2 = trackedStates.get(nodeId2);

        const expectedState1 = seq1.states[seq1.states.length - 1];
        const expectedState2 = seq2.states[seq2.states.length - 1];

        return finalState1 === expectedState1 && finalState2 === expectedState2;
      },
    ),
    {numRuns: 10},
  );

  t.pass('State tracking is independent per node');
});

/**
 * Property: Emitted events contain correct old and new state values.
 *
 * For any state transition, the emitted event SHALL contain the correct
 * oldState (previous tracked state or null) and newState values.
 *
 * **Validates: Requirements 3.4, 3.5**
 */
test('Property: Emitted events contain correct state values', async (t) => {
  await fc.assert(
    fc.property(
      nodeStateEventSequenceArb,
      (eventSequence) => {
        const context = createMockEventContext();
        const handler = new CDCEventHandler({
          nodeId: 'test-handler-node',
          eventContext: context,
        });

        const {nodeId, states} = eventSequence;

        // Track expected transitions
        const expectedTransitions = [];
        let previousState = null;
        for (const state of states) {
          if (state !== previousState) {
            expectedTransitions.push({
              oldState: previousState,
              newState: state,
            });
            previousState = state;
          }
        }

        // Process all state events
        for (const state of states) {
          const cdcEvent = createNodeStateCDCEvent(nodeId, state);
          handler.handleNodeStateCDC(cdcEvent);
        }

        // Verify emitted events match expected transitions
        const emittedEvents = context.events.filter(
          (e) => e.eventName === 'nodeStateChange',
        );

        if (emittedEvents.length !== expectedTransitions.length) {
          return false;
        }

        for (let i = 0; i < emittedEvents.length; i++) {
          const emitted = emittedEvents[i].data;
          const expected = expectedTransitions[i];

          if (emitted.oldState !== expected.oldState ||
              emitted.newState !== expected.newState) {
            return false;
          }
        }

        return true;
      },
    ),
    {numRuns: 10},
  );

  t.pass('Emitted events contain correct state values');
});
