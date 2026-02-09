/**
 * Property Test: Sub-phase events contain correct context
 * Feature: system-architecture-consolidation,
 *   Property 2: Sub-phase events contain correct context
 *
 * **Validates: Requirements 1.4**
 *
 * *For any* valid sub-phase transition, the emitted `subPhaseChange`
 * event shall contain the correct parent state, the previous
 * sub-phase, and the new sub-phase.
 */

import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {
  NodeLifecycleStateMachine,
} from '../../src/node/node-lifecycle-state-machine.js';
import {
  BOOTSTRAP_SUB_PHASE,
  JOINING_SUB_PHASE,
  NODE_LIFECYCLE_EVENT,
} from '../../src/node/node-constants.js';
import {NODE_STATE} from '../../src/constants/node-state.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

/**
 * Parent states that support sub-phases.
 * @type {string[]}
 */
const SUB_PHASE_PARENT_STATES = [
  NODE_STATE.STARTING,
  NODE_STATE.JOINING,
];

/**
 * All valid non-terminal sub-phase sequences for STARTING.
 * Terminal sub-phase (CACHE_HYDRATION) auto-advances parent state,
 * so we exclude it to keep the parent state stable for event checks.
 * @type {string[][]}
 */
const STARTING_SEQUENCES = [
  [BOOTSTRAP_SUB_PHASE.INFRASTRUCTURE],
  [
    BOOTSTRAP_SUB_PHASE.INFRASTRUCTURE,
    BOOTSTRAP_SUB_PHASE.MESSAGE_GROUPS,
  ],
  [
    BOOTSTRAP_SUB_PHASE.INFRASTRUCTURE,
    BOOTSTRAP_SUB_PHASE.MESSAGE_GROUPS,
    BOOTSTRAP_SUB_PHASE.PARTITIONS,
  ],
  [
    BOOTSTRAP_SUB_PHASE.INFRASTRUCTURE,
    BOOTSTRAP_SUB_PHASE.MESSAGE_GROUPS,
    BOOTSTRAP_SUB_PHASE.PARTITIONS,
    BOOTSTRAP_SUB_PHASE.REGISTRATION,
  ],
];

/**
 * All valid non-terminal sub-phase sequences for JOINING.
 * Two paths: via CREATING_MESSAGE_GROUP or JOINING_MESSAGE_GROUP.
 * Terminal sub-phase (QUERYING_STATE) auto-advances parent state.
 * @type {string[][]}
 */
const JOINING_SEQUENCES_CREATE_PATH = [
  [JOINING_SUB_PHASE.CONTACTING_SEED],
  [
    JOINING_SUB_PHASE.CONTACTING_SEED,
    JOINING_SUB_PHASE.CONNECTING_WEBSOCKET,
  ],
  [
    JOINING_SUB_PHASE.CONTACTING_SEED,
    JOINING_SUB_PHASE.CONNECTING_WEBSOCKET,
    JOINING_SUB_PHASE.CREATING_MESSAGE_GROUP,
  ],
  [
    JOINING_SUB_PHASE.CONTACTING_SEED,
    JOINING_SUB_PHASE.CONNECTING_WEBSOCKET,
    JOINING_SUB_PHASE.CREATING_MESSAGE_GROUP,
    JOINING_SUB_PHASE.WAITING_LEADERSHIP,
  ],
];

const JOINING_SEQUENCES_JOIN_PATH = [
  [JOINING_SUB_PHASE.CONTACTING_SEED],
  [
    JOINING_SUB_PHASE.CONTACTING_SEED,
    JOINING_SUB_PHASE.CONNECTING_WEBSOCKET,
  ],
  [
    JOINING_SUB_PHASE.CONTACTING_SEED,
    JOINING_SUB_PHASE.CONNECTING_WEBSOCKET,
    JOINING_SUB_PHASE.JOINING_MESSAGE_GROUP,
  ],
  [
    JOINING_SUB_PHASE.CONTACTING_SEED,
    JOINING_SUB_PHASE.CONNECTING_WEBSOCKET,
    JOINING_SUB_PHASE.JOINING_MESSAGE_GROUP,
    JOINING_SUB_PHASE.WAITING_LEADERSHIP,
  ],
];

/**
 * All non-terminal sequences for JOINING (both paths combined).
 * @type {string[][]}
 */
const JOINING_SEQUENCES = [
  ...JOINING_SEQUENCES_CREATE_PATH,
  ...JOINING_SEQUENCES_JOIN_PATH,
];

/**
 * Map parent state to its valid non-terminal sequences.
 */
const SEQUENCES_BY_PARENT = {
  [NODE_STATE.STARTING]: STARTING_SEQUENCES,
  [NODE_STATE.JOINING]: JOINING_SEQUENCES,
};

beforeEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize({node: {id: 'property-test-node'}});
  const logger = LoggingService.getInstance();
  logger.initialize({level: 'error'});
});

afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

test('Property 2: Sub-phase events contain correct context',
  async (t) => {
    /**
     * Property: For any valid sub-phase transition, the emitted
     * subPhaseChange event contains the correct parentState,
     * from (previous sub-phase), to (new sub-phase), and a
     * numeric timestamp.
     */
    t.test(
      'subPhaseChange event has correct parentState, from, to',
      async (t) => {
        fc.assert(
          fc.property(
            fc.constantFrom(...SUB_PHASE_PARENT_STATES)
              .chain((parentState) =>
                fc.constantFrom(
                  ...SEQUENCES_BY_PARENT[parentState],
                ).map((sequence) => ({parentState, sequence})),
              ),
            ({parentState, sequence}) => {
              const sm = new NodeLifecycleStateMachine({
                nodeId: 'prop-test',
                initialState: parentState,
              });

              const events = [];
              sm.on(
                NODE_LIFECYCLE_EVENT.SUB_PHASE_CHANGE,
                (evt) => events.push(evt),
              );

              // Walk through each sub-phase in the sequence
              for (const subPhase of sequence) {
                sm.transitionSubPhase(subPhase);
              }

              // Must have received one event per transition
              if (events.length !== sequence.length) return false;

              // Verify each event's context
              let expectedFrom = null;
              for (let i = 0; i < sequence.length; i++) {
                const evt = events[i];
                const expectedTo = sequence[i];

                // parentState must match the parent state
                if (evt.parentState !== parentState) return false;

                // from must be the previous sub-phase (null
                // for the first transition)
                if (evt.from !== expectedFrom) return false;

                // to must be the new sub-phase
                if (evt.to !== expectedTo) return false;

                // timestamp must be a number
                if (typeof evt.timestamp !== 'number') {
                  return false;
                }

                expectedFrom = expectedTo;
              }

              return true;
            },
          ),
          {numRuns: 10},
        );

        t.pass(
          'subPhaseChange events contain correct context ' +
          'for all valid sequences',
        );
      },
    );

    /**
     * Property: For any valid sub-phase transition, the emitted
     * event timestamps are monotonically non-decreasing.
     */
    t.test(
      'subPhaseChange event timestamps are non-decreasing',
      async (t) => {
        fc.assert(
          fc.property(
            fc.constantFrom(...SUB_PHASE_PARENT_STATES)
              .chain((parentState) =>
                fc.constantFrom(
                  ...SEQUENCES_BY_PARENT[parentState],
                ).map((sequence) => ({parentState, sequence})),
              ),
            ({parentState, sequence}) => {
              const sm = new NodeLifecycleStateMachine({
                nodeId: 'prop-test',
                initialState: parentState,
              });

              const timestamps = [];
              sm.on(
                NODE_LIFECYCLE_EVENT.SUB_PHASE_CHANGE,
                (evt) => timestamps.push(evt.timestamp),
              );

              for (const subPhase of sequence) {
                sm.transitionSubPhase(subPhase);
              }

              // Timestamps must be non-decreasing
              for (let i = 1; i < timestamps.length; i++) {
                if (timestamps[i] < timestamps[i - 1]) {
                  return false;
                }
              }

              return true;
            },
          ),
          {numRuns: 10},
        );

        t.pass(
          'event timestamps are monotonically non-decreasing',
        );
      },
    );

    /**
     * Property: For any valid sub-phase transition, the first
     * event's `from` field is always null (since sub-phase starts
     * as null).
     */
    t.test(
      'first subPhaseChange event always has from=null',
      async (t) => {
        fc.assert(
          fc.property(
            fc.constantFrom(...SUB_PHASE_PARENT_STATES)
              .chain((parentState) =>
                fc.constantFrom(
                  ...SEQUENCES_BY_PARENT[parentState],
                ).map((sequence) => ({parentState, sequence})),
              ),
            ({parentState, sequence}) => {
              const sm = new NodeLifecycleStateMachine({
                nodeId: 'prop-test',
                initialState: parentState,
              });

              let firstEvent = null;
              sm.once(
                NODE_LIFECYCLE_EVENT.SUB_PHASE_CHANGE,
                (evt) => {
                  firstEvent = evt;
                },
              );

              // Transition to the first sub-phase
              sm.transitionSubPhase(sequence[0]);

              // First event must have from=null
              if (firstEvent === null) return false;
              return firstEvent.from === null;
            },
          ),
          {numRuns: 10},
        );

        t.pass(
          'first subPhaseChange event always has from=null',
        );
      },
    );

    /**
     * Property: For any valid sub-phase transition, exactly one
     * subPhaseChange event is emitted per transitionSubPhase call.
     */
    t.test(
      'exactly one event emitted per transitionSubPhase call',
      async (t) => {
        fc.assert(
          fc.property(
            fc.constantFrom(...SUB_PHASE_PARENT_STATES)
              .chain((parentState) =>
                fc.constantFrom(
                  ...SEQUENCES_BY_PARENT[parentState],
                ).map((sequence) => ({parentState, sequence})),
              ),
            ({parentState, sequence}) => {
              const sm = new NodeLifecycleStateMachine({
                nodeId: 'prop-test',
                initialState: parentState,
              });

              let eventCount = 0;
              sm.on(
                NODE_LIFECYCLE_EVENT.SUB_PHASE_CHANGE,
                () => {
                  eventCount++;
                },
              );

              for (const subPhase of sequence) {
                const countBefore = eventCount;
                sm.transitionSubPhase(subPhase);
                // Exactly one event per call
                if (eventCount !== countBefore + 1) return false;
              }

              return eventCount === sequence.length;
            },
          ),
          {numRuns: 10},
        );

        t.pass(
          'exactly one event emitted per transitionSubPhase call',
        );
      },
    );
  });
