/**
 * Property Tests: Seed bootstrap failure cleanup
 *
 * **Property 3: Seed bootstrap failure cleanup**
 * *For any* bootstrap phase at which a seed node bootstrap can fail,
 * executing the cleanup procedure SHALL result in zero partial entries
 * remaining in the nodes, services, partitions, and message_groups
 * system tables that were created during the failed bootstrap attempt.
 *
 * **Validates: Requirements 7.1, 7.3**
 *
 * Feature: architecture-violations-cleanup, Property 3
 */

import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {BootstrapService} from '../../src/bootstrap/bootstrap-service.js';
import {
  BOOTSTRAP_PHASE,
  BOOTSTRAP_CLEANUP_STEP,
} from '../../src/bootstrap/bootstrap-constants.js';
import {NodeState} from '../../src/node/node-lifecycle-state-machine.js';

/**
 * Bootstrap phases that represent real failure points.
 * Excludes NOT_STARTED, COMPLETE, and FAILED which are
 * not phases where bootstrap work has been done.
 */
const FAILURE_PHASES = Object.values(BOOTSTRAP_PHASE).filter(
  (p) =>
    p !== BOOTSTRAP_PHASE.NOT_STARTED &&
    p !== BOOTSTRAP_PHASE.COMPLETE &&
    p !== BOOTSTRAP_PHASE.FAILED,
);

/**
 * Maps each failure phase to the cleanup steps that will execute.
 * Cleanup runs from the failed phase backward through INFRASTRUCTURE.
 * A failure at CACHE_HYDRATION runs all 5 steps; INFRASTRUCTURE runs 1.
 */
const PHASE_CLEANUP_INCLUDES = Object.freeze({
  [BOOTSTRAP_PHASE.CACHE_HYDRATION]: new Set([
    BOOTSTRAP_CLEANUP_STEP.CACHE_HYDRATION,
    BOOTSTRAP_CLEANUP_STEP.REGISTRATION,
    BOOTSTRAP_CLEANUP_STEP.PARTITIONS,
    BOOTSTRAP_CLEANUP_STEP.MESSAGE_GROUPS,
    BOOTSTRAP_CLEANUP_STEP.INFRASTRUCTURE,
  ]),
  [BOOTSTRAP_PHASE.REGISTRATION]: new Set([
    BOOTSTRAP_CLEANUP_STEP.REGISTRATION,
    BOOTSTRAP_CLEANUP_STEP.PARTITIONS,
    BOOTSTRAP_CLEANUP_STEP.MESSAGE_GROUPS,
    BOOTSTRAP_CLEANUP_STEP.INFRASTRUCTURE,
  ]),
  [BOOTSTRAP_PHASE.PARTITIONS]: new Set([
    BOOTSTRAP_CLEANUP_STEP.PARTITIONS,
    BOOTSTRAP_CLEANUP_STEP.MESSAGE_GROUPS,
    BOOTSTRAP_CLEANUP_STEP.INFRASTRUCTURE,
  ]),
  [BOOTSTRAP_PHASE.MESSAGE_GROUPS]: new Set([
    BOOTSTRAP_CLEANUP_STEP.MESSAGE_GROUPS,
    BOOTSTRAP_CLEANUP_STEP.INFRASTRUCTURE,
  ]),
  [BOOTSTRAP_PHASE.INFRASTRUCTURE]: new Set([
    BOOTSTRAP_CLEANUP_STEP.INFRASTRUCTURE,
  ]),
});

/**
 * Create a minimal BootstrapService with mock dependencies
 * that track all cleanup operations.
 * @param {Object} cleanupContext - The cleanup context with IDs.
 * @return {Object} Object with service and tracking state.
 */
function createTrackedBootstrapService(cleanupContext) {
  const service = new BootstrapService({
    nodeId: 'test-seed-node',
    nodeAddress: 'http://localhost:3000',
    wsPort: null,
  });

  // Tracking state for verifying cleanup completeness
  const tracking = {
    partitionsShutdown: new Set(),
    messageGroupsShutdown: new Set(),
    routerShutdown: false,
    cacheCleared: false,
    writerDisabled: false,
    controlPlaneShutdown: false,
    rpcShutdown: false,
    replicaHandlerShutdown: false,
    replicaSmCleared: false,
  };

  // Silent logger
  const noop = () => {};
  service.logger = {
    info: noop,
    warn: noop,
    error: noop,
    debug: noop,
  };

  // Mock partition services
  const partitionServices = new Map();
  for (const partitionId of cleanupContext.createdPartitions) {
    partitionServices.set(partitionId, {
      partitionId,
      shutdownCalled: false,
      getUnifiedAddress: () =>
        `test-seed-node/partition/${partitionId}`,
      shutdown: async function() {
        this.shutdownCalled = true;
        tracking.partitionsShutdown.add(partitionId);
      },
    });
  }
  service.partitionServices = partitionServices;

  // Mock message group services
  const messageGroupServices = new Map();
  const messageGroupReplicas = [];
  for (const mgId of cleanupContext.createdMessageGroups) {
    const replicaId = `${mgId}-r1`;
    const mgService = {
      groupId: mgId,
      replicaId,
      systemTableCache: null,
      shutdownCalled: false,
      shutdown: async function() {
        this.shutdownCalled = true;
        tracking.messageGroupsShutdown.add(mgId);
      },
    };
    messageGroupServices.set(replicaId, mgService);
    messageGroupReplicas.push(mgService);
  }
  service.messageGroupServices = messageGroupServices;
  service.messageGroupReplicas = messageGroupReplicas;

  // Mock message router
  service.messageRouter = {
    unregister: noop,
    shutdown: async () => {
      tracking.routerShutdown = true;
    },
  };
  service.transport = service.messageRouter;

  // Mock system table cache
  service.systemTableCache = {
    clear: () => {
      tracking.cacheCleared = true;
    },
  };

  // Mock system table writer
  service.systemTableWriter = {
    disable: () => {
      tracking.writerDisabled = true;
    },
  };

  // Mock control plane service
  service.controlPlaneService = {
    shutdown: () => {
      tracking.controlPlaneShutdown = true;
    },
  };

  // Mock RPC client
  service.rpcClient = {
    shutdown: async () => {
      tracking.rpcShutdown = true;
    },
  };

  // Mock replica handler
  service.replicaHandler = {
    unregisterFromRouter: noop,
    shutdown: () => {
      tracking.replicaHandlerShutdown = true;
    },
  };

  // Mock replica state machine
  service.replicaStateMachine = {
    stopTimeoutChecker: noop,
    clear: () => {
      tracking.replicaSmCleared = true;
    },
  };

  // Mock epoch manager and other services
  service.epochManager = {mock: true};
  service.tablePolicyService = {mock: true};
  service.rebalanceCoordinator = {mock: true};

  return {service, tracking};
}

test('Property 3: Seed bootstrap failure cleanup', async (t) => {
  /**
   * Property: For any failure phase that includes the PARTITIONS
   * cleanup step, all partition services SHALL be shut down.
   */
  t.test('partitions are shut down when partition cleanup runs',
    async (t) => {
      // Only test phases where partition cleanup actually runs
      const phasesWithPartitionCleanup = FAILURE_PHASES.filter(
        (p) => PHASE_CLEANUP_INCLUDES[p].has(
          BOOTSTRAP_CLEANUP_STEP.PARTITIONS,
        ),
      );

      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...phasesWithPartitionCleanup),
          fc.record({
            createdPartitions: fc.array(
              fc.uuid(), {minLength: 0, maxLength: 5},
            ),
            createdServices: fc.array(
              fc.uuid(), {minLength: 0, maxLength: 5},
            ),
            createdMessageGroups: fc.array(
              fc.uuid(), {minLength: 0, maxLength: 3},
            ),
            registeredNodeId: fc.option(fc.uuid(), {nil: null}),
          }),
          async (failedPhase, context) => {
            const {service, tracking} =
              createTrackedBootstrapService(context);

            await service.cleanupFailedBootstrap(
              failedPhase, context,
            );

            // Every created partition must have been shut down
            for (const partitionId of context.createdPartitions) {
              if (!tracking.partitionsShutdown.has(partitionId)) {
                return false;
              }
            }

            // The partitionServices map must be empty
            return service.partitionServices.size === 0;
          },
        ),
        {numRuns: 10},
      );

      t.pass('partitions are shut down when partition cleanup runs');
    });

  /**
   * Property: For any failure phase that includes the MESSAGE_GROUPS
   * cleanup step, all message group services SHALL be shut down.
   */
  t.test('message groups are shut down when MG cleanup runs',
    async (t) => {
      // Only test phases where message group cleanup actually runs
      const phasesWithMgCleanup = FAILURE_PHASES.filter(
        (p) => PHASE_CLEANUP_INCLUDES[p].has(
          BOOTSTRAP_CLEANUP_STEP.MESSAGE_GROUPS,
        ),
      );

      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...phasesWithMgCleanup),
          fc.record({
            createdPartitions: fc.array(
              fc.uuid(), {minLength: 0, maxLength: 5},
            ),
            createdServices: fc.array(
              fc.uuid(), {minLength: 0, maxLength: 5},
            ),
            createdMessageGroups: fc.array(
              fc.uuid(), {minLength: 0, maxLength: 3},
            ),
            registeredNodeId: fc.option(fc.uuid(), {nil: null}),
          }),
          async (failedPhase, context) => {
            const {service, tracking} =
              createTrackedBootstrapService(context);

            await service.cleanupFailedBootstrap(
              failedPhase, context,
            );

            // Every created message group must have been shut down
            for (const mgId of context.createdMessageGroups) {
              if (!tracking.messageGroupsShutdown.has(mgId)) {
                return false;
              }
            }

            // The messageGroupServices map must be empty
            // and messageGroupReplicas must be empty
            return service.messageGroupServices.size === 0 &&
              service.messageGroupReplicas.length === 0;
          },
        ),
        {numRuns: 10},
      );

      t.pass(
        'message groups are shut down when MG cleanup runs',
      );
    });

  /**
   * Property: For any failure phase, cleanup SHALL always transition
   * the lifecycle state machine to STOPPED.
   */
  t.test('lifecycle transitions to STOPPED for any failure phase',
    async (t) => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...FAILURE_PHASES),
          fc.record({
            createdPartitions: fc.array(
              fc.uuid(), {minLength: 0, maxLength: 5},
            ),
            createdServices: fc.array(
              fc.uuid(), {minLength: 0, maxLength: 5},
            ),
            createdMessageGroups: fc.array(
              fc.uuid(), {minLength: 0, maxLength: 3},
            ),
            registeredNodeId: fc.option(fc.uuid(), {nil: null}),
          }),
          async (failedPhase, context) => {
            const {service} =
              createTrackedBootstrapService(context);

            await service.cleanupFailedBootstrap(
              failedPhase, context,
            );

            return service.lifecycleStateMachine.getState() ===
              NodeState.STOPPED;
          },
        ),
        {numRuns: 10},
      );

      t.pass(
        'lifecycle transitions to STOPPED for any failure phase',
      );
    });

  /**
   * Property: For any failure phase, cleanup SHALL always shut down
   * the message router (infrastructure cleanup).
   */
  t.test('message router is shut down for any failure phase',
    async (t) => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...FAILURE_PHASES),
          fc.record({
            createdPartitions: fc.array(
              fc.uuid(), {minLength: 0, maxLength: 5},
            ),
            createdServices: fc.array(
              fc.uuid(), {minLength: 0, maxLength: 5},
            ),
            createdMessageGroups: fc.array(
              fc.uuid(), {minLength: 0, maxLength: 3},
            ),
            registeredNodeId: fc.option(fc.uuid(), {nil: null}),
          }),
          async (failedPhase, context) => {
            const {service, tracking} =
              createTrackedBootstrapService(context);

            await service.cleanupFailedBootstrap(
              failedPhase, context,
            );

            // Router must be shut down and nulled
            return tracking.routerShutdown &&
              service.messageRouter === null;
          },
        ),
        {numRuns: 10},
      );

      t.pass('message router is shut down for any failure phase');
    });

  /**
   * Property: For any failure phase, after cleanup completes,
   * infrastructure references (router, transport) SHALL be nulled
   * since INFRASTRUCTURE cleanup always runs.
   */
  t.test('infrastructure references are nulled after cleanup',
    async (t) => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...FAILURE_PHASES),
          fc.record({
            createdPartitions: fc.array(
              fc.uuid(), {minLength: 0, maxLength: 5},
            ),
            createdServices: fc.array(
              fc.uuid(), {minLength: 0, maxLength: 5},
            ),
            createdMessageGroups: fc.array(
              fc.uuid(), {minLength: 0, maxLength: 3},
            ),
            registeredNodeId: fc.option(fc.uuid(), {nil: null}),
          }),
          async (failedPhase, context) => {
            const {service} =
              createTrackedBootstrapService(context);

            await service.cleanupFailedBootstrap(
              failedPhase, context,
            );

            // Infrastructure cleanup always runs, so router
            // and transport must always be nulled
            return service.messageRouter === null &&
              service.transport === null;
          },
        ),
        {numRuns: 10},
      );

      t.pass('infrastructure references are nulled after cleanup');
    });

  /**
   * Property: Cleanup SHALL never throw, even with random inputs.
   * Errors during individual cleanup steps are logged but not
   * propagated.
   */
  t.test('cleanup never throws for any failure phase and context',
    async (t) => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...FAILURE_PHASES),
          fc.record({
            createdPartitions: fc.array(
              fc.uuid(), {minLength: 0, maxLength: 5},
            ),
            createdServices: fc.array(
              fc.uuid(), {minLength: 0, maxLength: 5},
            ),
            createdMessageGroups: fc.array(
              fc.uuid(), {minLength: 0, maxLength: 3},
            ),
            registeredNodeId: fc.option(fc.uuid(), {nil: null}),
          }),
          async (failedPhase, context) => {
            const {service} =
              createTrackedBootstrapService(context);

            let threw = false;
            try {
              await service.cleanupFailedBootstrap(
                failedPhase, context,
              );
            } catch (_err) {
              threw = true;
            }

            return !threw;
          },
        ),
        {numRuns: 10},
      );

      t.pass(
        'cleanup never throws for any failure phase and context',
      );
    });

  /**
   * Property: For CACHE_HYDRATION failures, all 5 cleanup steps
   * SHALL execute (the maximum cleanup path).
   */
  t.test('CACHE_HYDRATION failure runs all cleanup steps',
    async (t) => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            createdPartitions: fc.array(
              fc.uuid(), {minLength: 1, maxLength: 5},
            ),
            createdServices: fc.array(
              fc.uuid(), {minLength: 1, maxLength: 5},
            ),
            createdMessageGroups: fc.array(
              fc.uuid(), {minLength: 1, maxLength: 3},
            ),
            registeredNodeId: fc.option(fc.uuid(), {nil: null}),
          }),
          async (context) => {
            const {service} =
              createTrackedBootstrapService(context);

            // Track which cleanup steps execute
            const stepsExecuted = [];
            const origCache =
              service._cleanupCacheHydration.bind(service);
            service._cleanupCacheHydration = async () => {
              stepsExecuted.push(
                BOOTSTRAP_CLEANUP_STEP.CACHE_HYDRATION,
              );
              return origCache();
            };
            const origReg =
              service._cleanupRegistration.bind(service);
            service._cleanupRegistration = async (ctx) => {
              stepsExecuted.push(
                BOOTSTRAP_CLEANUP_STEP.REGISTRATION,
              );
              return origReg(ctx);
            };
            const origPart =
              service._cleanupPartitions.bind(service);
            service._cleanupPartitions = async () => {
              stepsExecuted.push(
                BOOTSTRAP_CLEANUP_STEP.PARTITIONS,
              );
              return origPart();
            };
            const origMg =
              service._cleanupMessageGroups.bind(service);
            service._cleanupMessageGroups = async () => {
              stepsExecuted.push(
                BOOTSTRAP_CLEANUP_STEP.MESSAGE_GROUPS,
              );
              return origMg();
            };
            const origInfra =
              service._cleanupInfrastructure.bind(service);
            service._cleanupInfrastructure = async () => {
              stepsExecuted.push(
                BOOTSTRAP_CLEANUP_STEP.INFRASTRUCTURE,
              );
              return origInfra();
            };

            await service.cleanupFailedBootstrap(
              BOOTSTRAP_PHASE.CACHE_HYDRATION, context,
            );

            // All 5 steps must execute in reverse order
            const expectedSteps = [
              BOOTSTRAP_CLEANUP_STEP.CACHE_HYDRATION,
              BOOTSTRAP_CLEANUP_STEP.REGISTRATION,
              BOOTSTRAP_CLEANUP_STEP.PARTITIONS,
              BOOTSTRAP_CLEANUP_STEP.MESSAGE_GROUPS,
              BOOTSTRAP_CLEANUP_STEP.INFRASTRUCTURE,
            ];

            if (stepsExecuted.length !== expectedSteps.length) {
              return false;
            }
            for (let i = 0; i < expectedSteps.length; i++) {
              if (stepsExecuted[i] !== expectedSteps[i]) {
                return false;
              }
            }
            return true;
          },
        ),
        {numRuns: 10},
      );

      t.pass('CACHE_HYDRATION failure runs all cleanup steps');
    });

  /**
   * Property: For INFRASTRUCTURE failures, only the infrastructure
   * cleanup step SHALL execute (the minimum cleanup path).
   */
  t.test('INFRASTRUCTURE failure runs only infrastructure cleanup',
    async (t) => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            createdPartitions: fc.array(
              fc.uuid(), {minLength: 0, maxLength: 5},
            ),
            createdServices: fc.array(
              fc.uuid(), {minLength: 0, maxLength: 5},
            ),
            createdMessageGroups: fc.array(
              fc.uuid(), {minLength: 0, maxLength: 3},
            ),
            registeredNodeId: fc.option(fc.uuid(), {nil: null}),
          }),
          async (context) => {
            const {service} =
              createTrackedBootstrapService(context);

            // Track which cleanup steps execute
            const stepsExecuted = [];
            const origInfra =
              service._cleanupInfrastructure.bind(service);
            service._cleanupInfrastructure = async () => {
              stepsExecuted.push(
                BOOTSTRAP_CLEANUP_STEP.INFRASTRUCTURE,
              );
              return origInfra();
            };
            service._cleanupCacheHydration = async () => {
              stepsExecuted.push(
                BOOTSTRAP_CLEANUP_STEP.CACHE_HYDRATION,
              );
              return 'success';
            };
            service._cleanupRegistration = async () => {
              stepsExecuted.push(
                BOOTSTRAP_CLEANUP_STEP.REGISTRATION,
              );
              return 'success';
            };
            service._cleanupPartitions = async () => {
              stepsExecuted.push(
                BOOTSTRAP_CLEANUP_STEP.PARTITIONS,
              );
              return 'success';
            };
            service._cleanupMessageGroups = async () => {
              stepsExecuted.push(
                BOOTSTRAP_CLEANUP_STEP.MESSAGE_GROUPS,
              );
              return 'success';
            };

            await service.cleanupFailedBootstrap(
              BOOTSTRAP_PHASE.INFRASTRUCTURE, context,
            );

            // Only INFRASTRUCTURE step should execute
            return stepsExecuted.length === 1 &&
              stepsExecuted[0] ===
                BOOTSTRAP_CLEANUP_STEP.INFRASTRUCTURE;
          },
        ),
        {numRuns: 10},
      );

      t.pass(
        'INFRASTRUCTURE failure runs only infrastructure cleanup',
      );
    });
});
