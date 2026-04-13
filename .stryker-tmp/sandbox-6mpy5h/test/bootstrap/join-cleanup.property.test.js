/**
 * Property Tests: Join failure cleanup
 *
 * **Property 4: Join failure cleanup**
 * *For any* join phase at which a joining node bootstrap can fail,
 * executing the cleanup procedure SHALL withdraw partial membership through
 * the canonical owner paths without issuing duplicate direct row deletes from
 * the failed joiner.
 *
 * **Validates: Requirements 7.2**
 *
 * Feature: architecture-violations-cleanup, Property 4
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {NodeJoiningService} from '../../src/bootstrap/node-joining-service.js';
import {JOINING_PHASE} from '../../src/bootstrap/bootstrap-constants.js';
import {NodeState} from '../../src/node/node-lifecycle-state-machine.js';
import {TABLES, COLUMN, STATE} from '../../src/constants/index.js';

/**
 * Joining phases that represent real failure points.
 * Excludes NOT_STARTED, COMPLETE, and FAILED which are
 * not phases where join work has been done.
 */
const FAILURE_PHASES = Object.values(JOINING_PHASE).filter(
  (p) =>
    p !== JOINING_PHASE.NOT_STARTED &&
    p !== JOINING_PHASE.COMPLETE &&
    p !== JOINING_PHASE.FAILED,
);

/**
 * Phases that include the QUERYING_STATE cleanup step,
 * meaning node membership may need to be withdrawn.
 */
const PHASES_WITH_QUERYING_STATE_CLEANUP = FAILURE_PHASES.filter(
  (p) => p === JOINING_PHASE.QUERYING_STATE,
);

/**
 * Phases that include the MESSAGE_GROUP cleanup step,
 * meaning message group replicas should be shut down.
 */
const PHASES_WITH_MG_CLEANUP = FAILURE_PHASES.filter(
  (p) =>
    p === JOINING_PHASE.QUERYING_STATE ||
    p === JOINING_PHASE.WAITING_LEADERSHIP ||
    p === JOINING_PHASE.CREATING_MESSAGE_GROUP ||
    p === JOINING_PHASE.JOINING_MESSAGE_GROUP,
);

/**
 * Create a minimal NodeJoiningService with mock dependencies
 * that track all cleanup operations.
 * @param {Object} cleanupContext - The cleanup context with IDs.
 * @return {Object} Object with service and tracking state.
 */
function createTrackedJoiningService(cleanupContext) {
  const service = new NodeJoiningService({
    nodeId: 'test-joining-node',
    nodeAddress: 'http://localhost:4000',
    seedNodeAddress: 'http://localhost:3000',
    wsPort: null,
  });

  // Tracking state for verifying cleanup completeness
  const tracking = {
    directNodeDeletes: 0,
    directServiceDeletes: 0,
    nodeStateUpdates: [],
    messageGroupsShutdown: new Set(),
    routerShutdown: false,
    transportShutdown: false,
    lifecycleTransitioned: false,
  };

  // Silent logger
  const noop = () => {};
  service.logger = {
    info: noop,
    warn: noop,
    error: noop,
    debug: noop,
  };

  // Mock CDC integration service that tracks deletions
  service.cdcIntegrationService = {
    deleteSystemTableRow: async (table, where) => {
      if (table === TABLES.NODES && where[COLUMN.NODE_ID]) {
        tracking.directNodeDeletes += 1;
      }
      if (table === TABLES.SERVICES && where[COLUMN.SERVICE_ID]) {
        tracking.directServiceDeletes += 1;
      }
    },
  };
  service.sendControlPlaneNodeStateUpdate = async (options) => {
    tracking.nodeStateUpdates.push(options);
  };
  service.joinCleanupHandler.delegates.getRegisteredJoinNodeId = () =>
    cleanupContext.registeredNodeId;

  // Mock message group services
  const messageGroupServices = new Map();
  for (const serviceId of cleanupContext.createdServiceIds) {
    messageGroupServices.set(serviceId, {
      replicaId: serviceId,
      shutdownCalled: false,
      shutdown: async function() {
        this.shutdownCalled = true;
        tracking.messageGroupsShutdown.add(serviceId);
      },
    });
  }
  service.messageGroupServices = messageGroupServices;

  // Mock message router
  service.messageRouter = {
    unregister: noop,
    shutdown: async () => {
      tracking.routerShutdown = true;
    },
  };

  // Mock transport (may be same as router or separate)
  service.transport = {
    shutdown: async () => {
      tracking.transportShutdown = true;
    },
  };

  return {service, tracking};
}

test('Property 4: Join failure cleanup', async (t) => {
  /**
   * Property: For any valid failure phase, after cleanup, all
 * registered node membership should be withdrawn through the
 * NODE_STATE_UPDATE owner path, and cleanup should not issue
 * direct row deletions for nodes/services.
   */
  t.test(
    'cleanup withdraws membership without direct node/service deletes',
    async (t) => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...PHASES_WITH_QUERYING_STATE_CLEANUP),
          fc.record({
            registeredNodeId: fc.option(fc.uuid(), {nil: null}),
            createdServiceIds: fc.array(
              fc.uuid(), {minLength: 1, maxLength: 5},
            ),
            createdMessageGroupIds: fc.array(
              fc.uuid(), {minLength: 0, maxLength: 3},
            ),
          }),
          async (failedPhase, context) => {
            const {service, tracking} =
              createTrackedJoiningService(context);

            await service.cleanupFailedJoin(
              failedPhase, context,
            );

            if (context.registeredNodeId) {
              const disconnectedUpdate = tracking.nodeStateUpdates.find(
                (update) => update?.state === STATE.DISCONNECTED,
              );
              if (!disconnectedUpdate) {
                return false;
              }
            } else if (tracking.nodeStateUpdates.length > 0) {
              return false;
            }

            return tracking.directNodeDeletes === 0 &&
              tracking.directServiceDeletes === 0;
          },
        ),
        {numRuns: 10},
      );

      t.pass(
        'cleanup withdraws membership without direct node/service deletes',
      );
    });

  /**
   * Property: For phases that include MG cleanup, all message
   * group services should be shut down.
   */
  t.test(
    'message groups are shut down for MG-related failure phases',
    async (t) => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...PHASES_WITH_MG_CLEANUP),
          fc.record({
            registeredNodeId: fc.option(fc.uuid(), {nil: null}),
            createdServiceIds: fc.array(
              fc.uuid(), {minLength: 1, maxLength: 5},
            ),
            createdMessageGroupIds: fc.array(
              fc.uuid(), {minLength: 0, maxLength: 3},
            ),
          }),
          async (failedPhase, context) => {
            const {service, tracking} =
              createTrackedJoiningService(context);

            await service.cleanupFailedJoin(
              failedPhase, context,
            );

            // Every message group service must have been shut down
            // (MG cleanup runs WAITING_LEADERSHIP and/or
            // MESSAGE_GROUP steps which both shut down MG services)
            for (const svcId of context.createdServiceIds) {
              if (!tracking.messageGroupsShutdown.has(svcId)) {
                return false;
              }
            }

            return true;
          },
        ),
        {numRuns: 10},
      );

      t.pass(
        'message groups are shut down for MG-related failure phases',
      );
    });

  /**
   * Property: After cleanup, the lifecycle state machine should
   * be in STOPPED state for any failure phase.
   */
  t.test(
    'lifecycle transitions to STOPPED for any failure phase',
    async (t) => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...FAILURE_PHASES),
          fc.record({
            registeredNodeId: fc.option(fc.uuid(), {nil: null}),
            createdServiceIds: fc.array(
              fc.uuid(), {minLength: 0, maxLength: 5},
            ),
            createdMessageGroupIds: fc.array(
              fc.uuid(), {minLength: 0, maxLength: 3},
            ),
          }),
          async (failedPhase, context) => {
            const {service} =
              createTrackedJoiningService(context);

            await service.cleanupFailedJoin(
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
   * Property: Cleanup SHALL never throw, even with random inputs.
   * Errors during individual cleanup steps are logged but not
   * propagated.
   */
  t.test(
    'cleanup never throws for any failure phase and context',
    async (t) => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...FAILURE_PHASES),
          fc.record({
            registeredNodeId: fc.option(fc.uuid(), {nil: null}),
            createdServiceIds: fc.array(
              fc.uuid(), {minLength: 0, maxLength: 5},
            ),
            createdMessageGroupIds: fc.array(
              fc.uuid(), {minLength: 0, maxLength: 3},
            ),
          }),
          async (failedPhase, context) => {
            const {service} =
              createTrackedJoiningService(context);

            // Make some mocks throw to test error resilience
            service.cdcIntegrationService = {
              deleteSystemTableRow: async () => {
                throw new Error('simulated CDC failure');
              },
            };

            let threw = false;
            try {
              await service.cleanupFailedJoin(
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
});
