/**
 * Property Test: Stabilization Reset on Trigger Events
 *
 * Property 6: For any event in the set {node_joined, node_left, node_failed,
 * replica_failed, policy_changed}, when the event is delivered to
 * UnifiedRebalancer, the stabilization timer SHALL be reset
 * (lastStateChangeTime updated to current time).
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {UnifiedRebalancer} from '../../src/rebalancer/unified-rebalancer.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  STABILIZATION_RESET_TRIGGER,
  REBALANCER_ENTITY_TYPE,
  REBALANCER_NODE_STATUS,
  REBALANCER_DEFAULT_POLICY,
} from '../../src/rebalancer/rebalancer-constants.js';

/**
 * All stabilization reset trigger constants.
 */
const ALL_TRIGGERS = Object.values(STABILIZATION_RESET_TRIGGER);

/**
 * Maximum allowed delta (ms) between Date.now() and lastStateChangeTime
 * after a recordStateChange call.
 */
const MAX_TIME_DELTA_MS = 50;

/**
 * Initialize test singletons.
 */
function initializeTestDependencies() {
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
 * Reset test singletons.
 */
function resetTestDependencies() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
}

/**
 * Create mock dependencies for UnifiedRebalancer.
 * @return {Object} Mock dependencies.
 */
function createMockDependencies() {
  const mockCache = {
    filter: () => [],
    get: () => null,
  };

  const mockCdc = {};

  const mockPolicy = {
    getPolicyForPartition: () => ({...REBALANCER_DEFAULT_POLICY.TABLE}),
  };

  const mockRouter = {};

  const mockCoordinator = {
    getMoveSafetyError: () => null,
  };

  return {
    mockCache,
    mockCdc,
    mockPolicy,
    mockRouter,
    mockCoordinator,
  };
}

/**
 * Create a UnifiedRebalancer instance configured for testing.
 * @param {Object} [overrides] - Optional dependency overrides.
 * @return {UnifiedRebalancer} Configured rebalancer.
 */
function createTestRebalancer(overrides = {}) {
  const deps = createMockDependencies();

  const rebalancer = new UnifiedRebalancer({
    entityId: 'test-partition-p1',
    entityType: REBALANCER_ENTITY_TYPE.PARTITION,
    systemTableCache: overrides.systemTableCache || deps.mockCache,
    cdcIntegrationService: overrides.cdcIntegrationService || deps.mockCdc,
    tablePolicyService: overrides.tablePolicyService || deps.mockPolicy,
    nodeId: 'test-node',
    messageRouter: overrides.messageRouter || deps.mockRouter,
    rebalanceCoordinator:
      overrides.rebalanceCoordinator || deps.mockCoordinator,
  });

  rebalancer.isLeader = true;

  return rebalancer;
}

/**
 * Clean up timers created by the rebalancer.
 * @param {UnifiedRebalancer} rebalancer - Rebalancer to clean up.
 */
function cleanupRebalancer(rebalancer) {
  clearTimeout(rebalancer.stabilizationTimer);
  clearTimeout(rebalancer.scheduledCheck);
  rebalancer.rebalanceCheckQueue.shutdown();
}

test('Property 6: Stabilization reset on trigger events', async (t) => {
  t.beforeEach(() => {
    initializeTestDependencies();
  });

  t.afterEach(() => {
    resetTestDependencies();
  });

  /**
   * Property: For any trigger constant in STABILIZATION_RESET_TRIGGER,
   * calling recordStateChange(trigger) SHALL update lastStateChangeTime
   * to approximately the current time.
   */
  t.test(
    'recordStateChange updates lastStateChangeTime for any trigger',
    async () => {
      const triggerArb = fc.constantFrom(...ALL_TRIGGERS);

      fc.assert(
        fc.property(
          triggerArb,
          (trigger) => {
            initializeTestDependencies();

            const rebalancer = createTestRebalancer();

            // Set lastStateChangeTime to a past value to detect the update
            rebalancer.lastStateChangeTime = 0;

            const before = Date.now();
            rebalancer.recordStateChange(trigger);
            const after = Date.now();

            const updated = rebalancer.lastStateChangeTime;

            cleanupRebalancer(rebalancer);
            resetTestDependencies();

            // lastStateChangeTime must be within the [before, after] window
            return updated >= before &&
              updated <= after &&
              (after - updated) < MAX_TIME_DELTA_MS;
          },
        ),
        {numRuns: 10},
      );
    },
  );

  /**
   * Property: For any node state transition that triggers rebalancing
   * (ACTIVE→FAILED, non-ACTIVE→ACTIVE, ACTIVE→non-ACTIVE),
   * onNodeStateChange SHALL reset lastStateChangeTime to current time.
   */
  t.test(
    'onNodeStateChange resets stabilization for node state transitions',
    async () => {
      const nodeIdArb = fc.stringMatching(/^node-[a-z0-9]{1,8}$/);

      // Generate transitions that trigger rebalancing
      const transitionArb = fc.constantFrom(
        {
          oldState: REBALANCER_NODE_STATUS.ACTIVE,
          newState: REBALANCER_NODE_STATUS.FAILED,
        },
        {
          oldState: REBALANCER_NODE_STATUS.SUSPECTED,
          newState: REBALANCER_NODE_STATUS.ACTIVE,
        },
        {
          oldState: REBALANCER_NODE_STATUS.FAILED,
          newState: REBALANCER_NODE_STATUS.ACTIVE,
        },
        {
          oldState: REBALANCER_NODE_STATUS.ACTIVE,
          newState: REBALANCER_NODE_STATUS.SUSPECTED,
        },
      );

      fc.assert(
        fc.property(
          nodeIdArb,
          transitionArb,
          (nodeId, transition) => {
            initializeTestDependencies();

            const rebalancer = createTestRebalancer();

            // Set lastStateChangeTime to a past value to detect the update
            rebalancer.lastStateChangeTime = 0;

            const before = Date.now();
            rebalancer.onNodeStateChange(
              nodeId,
              transition.oldState,
              transition.newState,
            );
            const after = Date.now();

            const updated = rebalancer.lastStateChangeTime;

            cleanupRebalancer(rebalancer);
            resetTestDependencies();

            // lastStateChangeTime must be updated to approximately now
            return updated >= before &&
              updated <= after &&
              (after - updated) < MAX_TIME_DELTA_MS;
          },
        ),
        {numRuns: 10},
      );
    },
  );
});
