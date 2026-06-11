/**
 * CL-008 guard: reusing an in-flight operation for a planned move must be
 * side-effect-free when the dispatch layer already owns the next attempt.
 *
 * Production witness (closure record CL-008, stat-gate-20260610T192851Z):
 * every planning tick re-executed moves whose operations were still PENDING;
 * the coordinator's recent-intent cache absorbed the duplicate creates
 * silently but re-armed dispatch unconditionally — one authoritative owner
 * read + claim write + remote dispatch attempt per tick per partition
 * against a creeping joiner that already had a deferred retry scheduled.
 *
 * The guard: maybeRearmReusedPendingOperation skips the rearm when the
 * workflow owner reports a live deferred retry (dispatch/transition retry
 * timers, transition-retry grace, or a created-operation handoff retry).
 * Rearm is reserved for the missed-handoff state — PENDING with no live
 * timer — which this test proves still rearms.
 */

import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {
  REBALANCE_COORDINATOR_LOG_MSG,
} from '../../src/rebalancer/rebalancer-constants.js';
import {createTestCoordinator} from './test-helpers.js';

const TEST_OPERATION_ID = 'reused-pending-op-1';
const TEST_PARTITION_ID = 'sql_transactions-p1';
const TEST_TARGET_NODE_ID = 'joiner-node-2';

function buildPendingOperation(overrides = {}) {
  return {
    operationId: TEST_OPERATION_ID,
    operation_id: TEST_OPERATION_ID,
    partitionId: TEST_PARTITION_ID,
    partition_id: TEST_PARTITION_ID,
    targetNodeId: TEST_TARGET_NODE_ID,
    target_node_id: TEST_TARGET_NODE_ID,
    type: 'REPLACE',
    workflowStep: WORKFLOW_STEP.PENDING,
    workflow_step: WORKFLOW_STEP.PENDING,
    status: 'pending',
    ...overrides,
  };
}

function installSpies(coordinator, ownerState) {
  const calls = {armed: 0, reuseLogs: []};
  coordinator.workflowOwner = {
    isOperationDeferredRetryActive: (operationId) =>
      ownerState.deferredRetryActive === true &&
      operationId === TEST_OPERATION_ID,
    hasActiveCreatedOperationHandoffRetry: (operationId) =>
      ownerState.handoffRetryActive === true &&
      operationId === TEST_OPERATION_ID,
    armCoordinatorCreatedOperation: async () => {
      calls.armed += 1;
      return true;
    },
  };
  const baseLogger = coordinator.logger;
  coordinator.logger = {
    ...console,
    debug: () => {},
    info: (message, context) => {
      if (
        message === REBALANCE_COORDINATOR_LOG_MSG.REUSED_IN_FLIGHT_OPERATION
      ) {
        calls.reuseLogs.push(context);
      }
    },
    warn: () => {},
    error: (...args) => baseLogger.error(...args),
  };
  return calls;
}

test('CL-008: reused-operation rearm guard', async (t) => {
  t.beforeEach(async () => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
    ConfigurationManager.getInstance().initialize({});
    LoggingService.getInstance().initialize({level: 'error'});
  });

  t.afterEach(async () => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  });

  await t.test(
    'PENDING reuse with a live deferred dispatch retry is NOT rearmed',
    async (t) => {
      const coordinator = createTestCoordinator();
      const calls = installSpies(coordinator, {deferredRetryActive: true});
      const operation = buildPendingOperation();

      const result =
        await coordinator.maybeRearmReusedPendingOperation(operation);

      t.equal(result, operation, 'returns the reused operation');
      t.equal(calls.armed, 0, 'does not rearm dispatch');
      t.equal(calls.reuseLogs.length, 1, 'emits the reuse witness log');
      t.equal(
        calls.reuseLogs[0].rearmAction,
        'skip_live_deferred_retry',
        'witness log records the skip decision',
      );
      t.equal(
        calls.reuseLogs[0].operationId,
        TEST_OPERATION_ID,
        'witness log carries the operation id',
      );
      t.equal(
        calls.reuseLogs[0].moveTargetNodeId,
        TEST_TARGET_NODE_ID,
        'witness log carries the move target (un-clobbered key)',
      );
    },
  );

  await t.test(
    'PENDING reuse with a live created-operation handoff retry is NOT ' +
      'rearmed (timer lane not covered by isOperationDeferredRetryActive)',
    async (t) => {
      const coordinator = createTestCoordinator();
      const calls = installSpies(coordinator, {handoffRetryActive: true});

      await coordinator.maybeRearmReusedPendingOperation(
        buildPendingOperation(),
      );

      t.equal(calls.armed, 0, 'does not rearm dispatch');
      t.equal(
        calls.reuseLogs[0].rearmAction,
        'skip_live_deferred_retry',
        'witness log records the skip decision',
      );
    },
  );

  await t.test(
    'PENDING reuse with NO live retry timer still rearms ' +
      '(missed-handoff recovery preserved)',
    async (t) => {
      const coordinator = createTestCoordinator();
      const calls = installSpies(coordinator, {});

      await coordinator.maybeRearmReusedPendingOperation(
        buildPendingOperation(),
      );

      t.equal(calls.armed, 1, 'rearms dispatch exactly once');
      t.equal(
        calls.reuseLogs[0].rearmAction,
        'rearm_dispatch',
        'witness log records the rearm decision',
      );
    },
  );

  await t.test(
    'reuse of an operation past PENDING is never rearmed',
    async (t) => {
      const coordinator = createTestCoordinator();
      const calls = installSpies(coordinator, {});

      await coordinator.maybeRearmReusedPendingOperation(
        buildPendingOperation({
          workflowStep: WORKFLOW_STEP.SENDING,
          workflow_step: WORKFLOW_STEP.SENDING,
        }),
      );

      t.equal(calls.armed, 0, 'does not rearm dispatch');
      t.equal(
        calls.reuseLogs[0].rearmAction,
        'skip_not_pending',
        'witness log records the non-pending skip',
      );
    },
  );

  await t.test(
    'missing workflow owner degrades to the pre-guard rearm behavior',
    async (t) => {
      const coordinator = createTestCoordinator();
      const calls = installSpies(coordinator, {});
      coordinator.workflowOwner = null;

      const result = await coordinator.maybeRearmReusedPendingOperation(
        buildPendingOperation(),
      );

      t.equal(result.operationId, TEST_OPERATION_ID, 'returns the operation');
      t.equal(
        calls.reuseLogs[0].rearmAction,
        'rearm_dispatch',
        'no owner means no live-timer evidence — rearm proceeds',
      );
    },
  );
});
