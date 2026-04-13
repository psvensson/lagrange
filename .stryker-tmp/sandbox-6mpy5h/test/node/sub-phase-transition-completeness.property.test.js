/**
 * Property-based test for sub-phase transition completeness.
 *
 * **Feature: architecture-violations-cleanup,
 *   Property 2: Sub-phase transition completeness**
 *
 * For any bootstrap phase defined in the former BootstrapPhaseStateMachine
 * (INFRASTRUCTURE, MESSAGE_GROUPS, PARTITIONS, REGISTRATION,
 * CACHE_HYDRATION), NodeLifecycleStateMachine SHALL accept the
 * corresponding sub-phase transition when in the STARTING state.
 *
 * **Validates: Requirements 3.4**
 */
// @ts-nocheck


import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {
  NodeLifecycleStateMachine,
  VALID_SUB_PHASES,
} from '../../src/node/node-lifecycle-state-machine.js';
import {BOOTSTRAP_SUB_PHASE} from '../../src/node/node-constants.js';
import {NODE_STATE} from '../../src/constants/node-state.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

/**
 * The ordered sequence of all bootstrap sub-phases, matching the
 * former BootstrapPhaseStateMachine phases.
 * @type {string[]}
 */
const BOOTSTRAP_SEQUENCE = [
  BOOTSTRAP_SUB_PHASE.INFRASTRUCTURE,
  BOOTSTRAP_SUB_PHASE.MESSAGE_GROUPS,
  BOOTSTRAP_SUB_PHASE.PARTITIONS,
  BOOTSTRAP_SUB_PHASE.REGISTRATION,
  BOOTSTRAP_SUB_PHASE.CACHE_HYDRATION,
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

test('Property 2: Sub-phase transition completeness',
  async (t) => {
    /**
     * Property: For any bootstrap sub-phase generated from the
     * set {INFRASTRUCTURE, MESSAGE_GROUPS, PARTITIONS,
     * REGISTRATION, CACHE_HYDRATION}, NodeLifecycleStateMachine
     * accepts the transition when preceded by the correct
     * prior sub-phases in the STARTING state.
     *
     * This verifies that every former BootstrapPhaseStateMachine
     * phase has a corresponding sub-phase in
     * NodeLifecycleStateMachine.
     */
    t.test(
      'each bootstrap sub-phase is accepted when in STARTING ' +
      'state with correct predecessors',
      async (t) => {
        fc.assert(
          fc.property(
            fc.constantFrom(...BOOTSTRAP_SEQUENCE),
            (targetSubPhase) => {
              const sm = new NodeLifecycleStateMachine({
                nodeId: 'prop-test',
                initialState: NODE_STATE.STARTING,
              });

              // Walk through all predecessors up to and
              // including the target sub-phase
              const targetIdx = BOOTSTRAP_SEQUENCE.indexOf(
                targetSubPhase,
              );

              for (let i = 0; i <= targetIdx; i++) {
                const subPhase = BOOTSTRAP_SEQUENCE[i];

                // Skip terminal sub-phase (CACHE_HYDRATION)
                // unless it is the target, because it
                // auto-advances the parent state
                if (
                  subPhase ===
                    BOOTSTRAP_SUB_PHASE.CACHE_HYDRATION &&
                  i < targetIdx
                ) {
                  return false;
                }

                const result = sm.transitionSubPhase(subPhase);
                if (!result) return false;

                // For non-terminal sub-phases, verify the
                // sub-phase was recorded
                if (
                  subPhase !==
                  BOOTSTRAP_SUB_PHASE.CACHE_HYDRATION
                ) {
                  if (sm.getSubPhase() !== subPhase) {
                    return false;
                  }
                }
              }

              return true;
            },
          ),
          {numRuns: 10},
        );

        t.pass(
          'all bootstrap sub-phases accepted in STARTING state',
        );
      },
    );

    /**
     * Property: Every bootstrap sub-phase is a member of the
     * VALID_SUB_PHASES for the STARTING state, confirming
     * NodeLifecycleStateMachine covers all former
     * BootstrapPhaseStateMachine phases.
     */
    t.test(
      'all bootstrap sub-phases are valid for STARTING state',
      async (t) => {
        fc.assert(
          fc.property(
            fc.constantFrom(...BOOTSTRAP_SEQUENCE),
            (subPhase) => {
              const validForStarting =
                VALID_SUB_PHASES[NODE_STATE.STARTING];
              return validForStarting.includes(subPhase);
            },
          ),
          {numRuns: 10},
        );

        t.pass(
          'all bootstrap sub-phases are in VALID_SUB_PHASES ' +
          'for STARTING',
        );
      },
    );

    /**
     * Property: The full ordered sequence of bootstrap sub-phases
     * is accepted by NodeLifecycleStateMachine when transitioning
     * in order from STARTING state, proving the complete
     * bootstrap flow is supported.
     */
    t.test(
      'full bootstrap sub-phase sequence completes ' +
      'successfully',
      async (t) => {
        fc.assert(
          fc.property(
            fc.constant(BOOTSTRAP_SEQUENCE),
            (sequence) => {
              const sm = new NodeLifecycleStateMachine({
                nodeId: 'prop-test',
                initialState: NODE_STATE.STARTING,
              });

              for (const subPhase of sequence) {
                const result = sm.transitionSubPhase(subPhase);
                if (!result) return false;
              }

              // After CACHE_HYDRATION (terminal), the state
              // machine should have auto-advanced past STARTING
              return sm.getState() !== NODE_STATE.STARTING;
            },
          ),
          {numRuns: 10},
        );

        t.pass(
          'full bootstrap sequence accepted and ' +
          'auto-advances state',
        );
      },
    );
  });
