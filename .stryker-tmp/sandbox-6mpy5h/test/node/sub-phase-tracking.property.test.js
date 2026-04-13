/**
 * Property Test: Sub-phase tracking correctness
 * Feature: system-architecture-consolidation,
 *   Property 1: Sub-phase tracking correctness
 *
 * **Validates: Requirements 1.2, 1.3**
 *
 * *For any* parent state that supports sub-phases (STARTING or JOINING),
 * and *for any* valid sub-phase sequence for that parent state, the
 * NodeLifecycleStateMachine shall correctly track each sub-phase
 * transition, with `getSubPhase()` returning the current sub-phase
 * after each transition.
 */
// @ts-nocheck


import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {
  NodeLifecycleStateMachine,
  VALID_SUB_PHASES,
  VALID_SUB_PHASE_TRANSITIONS,
} from '../../src/node/node-lifecycle-state-machine.js';
import {
  BOOTSTRAP_SUB_PHASE,
  JOINING_SUB_PHASE,
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
 * so we build sequences up to but not including the terminal.
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
 * Two paths exist: via CREATING_MESSAGE_GROUP or JOINING_MESSAGE_GROUP.
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

test('Property 1: Sub-phase tracking correctness',
  async (t) => {
    /**
     * Property: For any parent state that supports sub-phases and
     * any valid non-terminal sub-phase sequence for that parent
     * state, getSubPhase() returns the correct sub-phase after
     * each transition.
     *
     * Uses fc.constantFrom to pick a parent state, then picks a
     * valid sequence for that parent state.
     */
    t.test(
      'getSubPhase tracks each transition in valid sequences',
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

              // Verify initial sub-phase is null
              if (sm.getSubPhase() !== null) return false;

              // Walk through each sub-phase in the sequence
              for (const subPhase of sequence) {
                sm.transitionSubPhase(subPhase);

                // getSubPhase must return the sub-phase we
                // just transitioned to
                if (sm.getSubPhase() !== subPhase) return false;
              }

              return true;
            },
          ),
          {numRuns: 10},
        );

        t.pass(
          'getSubPhase correctly tracks all valid ' +
          'sub-phase sequences',
        );
      },
    );

    /**
     * Property: For any parent state that supports sub-phases,
     * every sub-phase in a valid sequence is a member of
     * VALID_SUB_PHASES for that parent state.
     */
    t.test(
      'all sub-phases in valid sequences belong to parent',
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
              const validForParent =
                VALID_SUB_PHASES[parentState];

              return sequence.every(
                (sp) => validForParent.includes(sp),
              );
            },
          ),
          {numRuns: 10},
        );

        t.pass(
          'all sub-phases belong to their parent state',
        );
      },
    );

    /**
     * Property: For any parent state and valid sub-phase sequence,
     * each consecutive pair follows the VALID_SUB_PHASE_TRANSITIONS
     * map (including null → first sub-phase).
     */
    t.test(
      'sub-phase transitions follow valid transition map',
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

              // Walk through and verify no exceptions thrown
              for (const subPhase of sequence) {
                sm.transitionSubPhase(subPhase);
              }

              // Verify final sub-phase matches last in sequence
              return sm.getSubPhase() ===
                sequence[sequence.length - 1];
            },
          ),
          {numRuns: 10},
        );

        t.pass(
          'all transitions follow the valid transition map',
        );
      },
    );

    /**
     * Property: For any parent state, the sub-phase starts as null
     * and after the first valid transition, getSubPhase returns
     * the first sub-phase in the sequence.
     */
    t.test(
      'sub-phase starts null and updates on first transition',
      async (t) => {
        fc.assert(
          fc.property(
            fc.constantFrom(...SUB_PHASE_PARENT_STATES),
            (parentState) => {
              const sm = new NodeLifecycleStateMachine({
                nodeId: 'prop-test',
                initialState: parentState,
              });

              // Must start as null
              if (sm.getSubPhase() !== null) return false;

              // Get valid first sub-phases from transition map
              const firstSubPhases =
                VALID_SUB_PHASE_TRANSITIONS['null'] || [];
              const validForParent =
                VALID_SUB_PHASES[parentState];

              // Find a first sub-phase valid for this parent
              const firstSubPhase = firstSubPhases.find(
                (sp) => validForParent.includes(sp),
              );

              if (!firstSubPhase) return false;

              sm.transitionSubPhase(firstSubPhase);
              return sm.getSubPhase() === firstSubPhase;
            },
          ),
          {numRuns: 10},
        );

        t.pass(
          'sub-phase correctly initializes from null',
        );
      },
    );
  });
