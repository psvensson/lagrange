/**
 * Property Test: Terminal sub-phase auto-advances parent state
 * Feature: system-architecture-consolidation,
 *   Property 3: Terminal sub-phase auto-advances parent state
 *
 * **Validates: Requirements 1.6**
 *
 * *For any* terminal sub-phase (CACHE_HYDRATION for STARTING,
 * QUERYING_STATE for JOINING), completing the sub-phase shall
 * cause the parent state to advance to the next top-level state
 * (STARTING → CONNECTING, JOINING → READY).
 */

import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {
  NodeLifecycleStateMachine,
  TERMINAL_SUB_PHASE_ADVANCE,
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
 * Full sub-phase sequences that end with the terminal sub-phase.
 * For STARTING: the bootstrap sequence ending in CACHE_HYDRATION.
 * For JOINING: two paths (via CREATING or JOINING message group)
 * both ending in QUERYING_STATE.
 */
const TERMINAL_SCENARIOS = [
  {
    parentState: NODE_STATE.STARTING,
    sequence: [
      BOOTSTRAP_SUB_PHASE.INFRASTRUCTURE,
      BOOTSTRAP_SUB_PHASE.MESSAGE_GROUPS,
      BOOTSTRAP_SUB_PHASE.PARTITIONS,
      BOOTSTRAP_SUB_PHASE.REGISTRATION,
      BOOTSTRAP_SUB_PHASE.CACHE_HYDRATION,
    ],
    terminalSubPhase: BOOTSTRAP_SUB_PHASE.CACHE_HYDRATION,
    expectedNextState: NODE_STATE.CONNECTING,
  },
  {
    parentState: NODE_STATE.JOINING,
    sequence: [
      JOINING_SUB_PHASE.CONTACTING_SEED,
      JOINING_SUB_PHASE.CONNECTING_WEBSOCKET,
      JOINING_SUB_PHASE.CREATING_MESSAGE_GROUP,
      JOINING_SUB_PHASE.WAITING_LEADERSHIP,
      JOINING_SUB_PHASE.QUERYING_STATE,
    ],
    terminalSubPhase: JOINING_SUB_PHASE.QUERYING_STATE,
    expectedNextState: NODE_STATE.READY,
  },
  {
    parentState: NODE_STATE.JOINING,
    sequence: [
      JOINING_SUB_PHASE.CONTACTING_SEED,
      JOINING_SUB_PHASE.CONNECTING_WEBSOCKET,
      JOINING_SUB_PHASE.JOINING_MESSAGE_GROUP,
      JOINING_SUB_PHASE.WAITING_LEADERSHIP,
      JOINING_SUB_PHASE.QUERYING_STATE,
    ],
    terminalSubPhase: JOINING_SUB_PHASE.QUERYING_STATE,
    expectedNextState: NODE_STATE.READY,
  },
];

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

test('Property 3: Terminal sub-phase auto-advances parent state',
  async (t) => {
    /**
     * Property: For any terminal sub-phase scenario, after
     * completing the full sub-phase sequence, the parent state
     * advances to the expected next top-level state.
     */
    t.test(
      'parent state advances after terminal sub-phase',
      async (t) => {
        fc.assert(
          fc.property(
            fc.constantFrom(...TERMINAL_SCENARIOS),
            (scenario) => {
              const sm = new NodeLifecycleStateMachine({
                nodeId: 'prop-test',
                initialState: scenario.parentState,
              });

              // Walk through the full sub-phase sequence
              for (const subPhase of scenario.sequence) {
                sm.transitionSubPhase(subPhase);
              }

              // Parent state must have advanced
              return sm.getState() ===
                scenario.expectedNextState;
            },
          ),
          {numRuns: 10},
        );

        t.pass(
          'parent state advances to correct next state ' +
          'after terminal sub-phase',
        );
      },
    );

    /**
     * Property: For any terminal sub-phase scenario, after
     * the terminal sub-phase completes, getSubPhase() returns
     * null (sub-phase is cleared on parent transition).
     */
    t.test(
      'sub-phase is cleared after terminal auto-advance',
      async (t) => {
        fc.assert(
          fc.property(
            fc.constantFrom(...TERMINAL_SCENARIOS),
            (scenario) => {
              const sm = new NodeLifecycleStateMachine({
                nodeId: 'prop-test',
                initialState: scenario.parentState,
              });

              for (const subPhase of scenario.sequence) {
                sm.transitionSubPhase(subPhase);
              }

              // Sub-phase must be null after auto-advance
              return sm.getSubPhase() === null;
            },
          ),
          {numRuns: 10},
        );

        t.pass(
          'sub-phase is cleared after terminal auto-advance',
        );
      },
    );

    /**
     * Property: For any terminal sub-phase scenario, a
     * stateChange event is emitted with the correct from/to
     * values when the parent auto-advances.
     */
    t.test(
      'stateChange event emitted with correct from/to',
      async (t) => {
        fc.assert(
          fc.property(
            fc.constantFrom(...TERMINAL_SCENARIOS),
            (scenario) => {
              const sm = new NodeLifecycleStateMachine({
                nodeId: 'prop-test',
                initialState: scenario.parentState,
              });

              const stateEvents = [];
              sm.on(
                NODE_LIFECYCLE_EVENT.STATE_CHANGE,
                (evt) => stateEvents.push(evt),
              );

              for (const subPhase of scenario.sequence) {
                sm.transitionSubPhase(subPhase);
              }

              // Exactly one stateChange event from auto-advance
              if (stateEvents.length !== 1) return false;

              const evt = stateEvents[0];

              // from must be the original parent state
              if (evt.from !== scenario.parentState) return false;

              // to must be the expected next state
              if (evt.to !== scenario.expectedNextState) {
                return false;
              }

              // timestamp must be a number
              if (typeof evt.timestamp !== 'number') {
                return false;
              }

              return true;
            },
          ),
          {numRuns: 10},
        );

        t.pass(
          'stateChange event has correct from/to on ' +
          'terminal auto-advance',
        );
      },
    );

    /**
     * Property: The TERMINAL_SUB_PHASE_ADVANCE map is consistent
     * with the actual auto-advance behavior — every entry in the
     * map produces the mapped next state when the terminal
     * sub-phase is reached.
     */
    t.test(
      'TERMINAL_SUB_PHASE_ADVANCE map matches behavior',
      async (t) => {
        fc.assert(
          fc.property(
            fc.constantFrom(...TERMINAL_SCENARIOS),
            (scenario) => {
              const mappedNextState =
                TERMINAL_SUB_PHASE_ADVANCE[
                  scenario.terminalSubPhase
                ];

              // The map must contain the terminal sub-phase
              if (mappedNextState === undefined) return false;

              // The mapped state must match expected
              return mappedNextState ===
                scenario.expectedNextState;
            },
          ),
          {numRuns: 10},
        );

        t.pass(
          'TERMINAL_SUB_PHASE_ADVANCE map is consistent ' +
          'with auto-advance behavior',
        );
      },
    );
  });
