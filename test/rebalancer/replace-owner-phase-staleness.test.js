/**
 * A6 (amendment-1 step 4, under S9 and D2): a partition REPLACE in its
 * owner phases - from ACTIVE (the source-removal phase, S9: no time bound)
 * through STOPPING (durable removal intent, D2: no timer-driven outcome) - is
 * never classified stale, abandoned or "not active" by the age of its step.
 * Per A5's rule it stops counting as active only when the failure detector
 * marked its target replica FAILED.
 *
 * Consumers witnessed through their owners:
 *  - the replica-operation liveness owner (isReplicaOperationStale), read by
 *    the topology-settling view, follow-up contexts and admin labels;
 *  - the workflow owner's concurrent-operation predicates
 *    (isConcurrentOperationStalePastStepTimeout,
 *    isConcurrentOperationTargetUncontactable), read by the remove-safety
 *    serialization gate (CL-043/CL-044) and the ledger interlock.
 *
 * Universe: every non-terminal REPLACE step (production enumeration), aged
 * past every step timeout the liveness owner knows and past the operation
 * budget. Oracle for "owner phase": the REPLACE step order itself - ACTIVE
 * and every non-terminal step after it. Control: an earlier step, aged the
 * same way, is stale - so the witness can see staleness at all.
 */

import {test} from '../../src/test-helpers/tap.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {
  OPERATION_TERMINAL_WORKFLOW_STEPS_BY_TYPE,
  OperationType,
  ReplicaStatus,
  WORKFLOW_STEP_TO_STATUS,
  getWorkflowSteps,
} from '../../src/rebalancer/replica-status.js';
import {
  DEFAULT_STEP_TIMEOUT_MS_BY_WORKFLOW_STEP,
  isReplicaOperationStale,
  normalizeReplicaOperationRecord,
} from '../../src/rebalancer/replica-operation-liveness.js';
import {TIMEOUT_BUDGET_DEFAULT} from '../../src/control-plane/timeout-budget.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {createTestCoordinator} from './test-helpers.js';

const PARTITION_ID = 'a6-staleness-p1';
const SOURCE = Object.freeze({replicaId: 'a6-staleness-p1-r1', nodeId: 'node-1'});
const TARGET = Object.freeze({replicaId: 'a6-staleness-p1-r4', nodeId: 'node-4'});
const NOW_MS = 1_900_000_000_000;

const REPLACE_STEPS = getWorkflowSteps(OperationType.REPLACE);
const NON_TERMINAL_REPLACE_STEPS = Object.freeze(REPLACE_STEPS.filter((step) =>
  !OPERATION_TERMINAL_WORKFLOW_STEPS_BY_TYPE.get(OperationType.REPLACE)
    .has(step)));
const OWNER_PHASE_STEPS = Object.freeze(new Set(NON_TERMINAL_REPLACE_STEPS
  .slice(NON_TERMINAL_REPLACE_STEPS.indexOf(WORKFLOW_STEP.ACTIVE))));
// Past every step timeout the liveness owner knows, and past the operation
// budget, by a minute.
const AGE_PAST_EVERY_BUDGET_MS = Math.max(
  ...Object.values(DEFAULT_STEP_TIMEOUT_MS_BY_WORKFLOW_STEP),
  TIMEOUT_BUDGET_DEFAULT.REBALANCE_OPERATION_BUDGET_MS,
) + 60_000;

function replaceRow(workflowStep, ageMs) {
  const enteredAt = NOW_MS - ageMs;
  return {
    operationId: `a6-replace-${workflowStep}`,
    operation_id: `a6-replace-${workflowStep}`,
    type: OperationType.REPLACE,
    entityType: 'partition',
    entity_type: 'partition',
    entityId: PARTITION_ID,
    partitionId: PARTITION_ID,
    partition_id: PARTITION_ID,
    replicaId: TARGET.replicaId,
    sourceReplicaId: SOURCE.replicaId,
    targetNodeId: TARGET.nodeId,
    target_node_id: TARGET.nodeId,
    workflowStep,
    status: WORKFLOW_STEP_TO_STATUS[workflowStep],
    createdAt: enteredAt,
    updatedAt: enteredAt,
    stepsHistory: [{
      step: workflowStep,
      timestamp: enteredAt,
      sourceReplicaId: SOURCE.replicaId,
    }],
  };
}

function serviceRow({replicaId, nodeId}, status) {
  return {
    service_id: replicaId,
    replica_id: replicaId,
    service_type: 'partition',
    partition_id: PARTITION_ID,
    node_id: nodeId,
    status,
  };
}

function coordinatorWithTarget(targetStatus) {
  const coordinator = createTestCoordinator({
    nodeId: 'node-planner',
    cacheData: {
      services: [
        serviceRow(SOURCE, ReplicaStatus.ACTIVE),
        serviceRow(TARGET, targetStatus),
      ],
    },
    messageRouter: {
      // A transiently unreachable target: a ping is not the failure
      // detector's verdict.
      pingNode: async () => false,
      deliver: async () => ({acknowledged: true, status: 'completed'}),
      getConnectionState: () => 'disconnected',
      isOutboundQueueAvailable: () => true,
    },
  });
  coordinator.initialize();
  return coordinator;
}

test('A6: a partition REPLACE in its owner phases is never stale by age',
  async (t) => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
    ConfigurationManager.getInstance().initialize({});
    LoggingService.getInstance().initialize({level: 'error'});
    t.teardown(() => {
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
    });
    t.ok(OWNER_PHASE_STEPS.has(WORKFLOW_STEP.ACTIVE) &&
      OWNER_PHASE_STEPS.size < NON_TERMINAL_REPLACE_STEPS.length,
    'the owner phases are a proper, non-empty tail of the REPLACE steps');

    await t.test('the liveness owner', async (t) => {
      let controlStale = 0;
      for (const step of NON_TERMINAL_REPLACE_STEPS) {
        const record = normalizeReplicaOperationRecord(
          replaceRow(step, AGE_PAST_EVERY_BUDGET_MS), {nowMs: NOW_MS});
        const stale = isReplicaOperationStale(record, {nowMs: NOW_MS});
        if (OWNER_PHASE_STEPS.has(step)) {
          t.equal(stale, false,
            `${step}: not stale ${AGE_PAST_EVERY_BUDGET_MS} ms into the step`);
        } else if (stale) {
          controlStale += 1;
        }
      }
      t.ok(controlStale > 0,
        'control: a pre-ACTIVE step aged the same way is stale');
    });

    await t.test('the workflow owner, target alive', async (t) => {
      const coordinator = coordinatorWithTarget(ReplicaStatus.ACTIVE);
      try {
        const owner = coordinator.workflowOwner;
        for (const step of OWNER_PHASE_STEPS) {
          const operation = replaceRow(step, AGE_PAST_EVERY_BUDGET_MS);
          t.equal(
            owner.isConcurrentOperationStalePastStepTimeout(operation, NOW_MS),
            false, `${step}: still an active concurrent operation`);
          t.equal(
            await owner.isConcurrentOperationTargetUncontactable(operation),
            false, `${step}: a failed ping is not the failure detector`);
        }
      } finally {
        await coordinator.shutdown();
      }
    });

    await t.test('the workflow owner, target FAILED by the failure detector',
      async (t) => {
        const coordinator = coordinatorWithTarget(ReplicaStatus.FAILED);
        try {
          const owner = coordinator.workflowOwner;
          for (const step of OWNER_PHASE_STEPS) {
            const operation = replaceRow(step, 0);
            t.equal(
              owner.isConcurrentOperationStalePastStepTimeout(
                operation, NOW_MS),
              true, `${step}: a dead target ends its hold at once`);
          }
        } finally {
          await coordinator.shutdown();
        }
      });
  });

// A14b: under a deferred authoritative operation read, with the contained
// pressure that normally lets a priority REMOVE proceed, the REMOVE creation
// guards (in createOperation's order) fail closed while the cache holds a
// non-terminal REPLACE on the partition - in every non-terminal step.
const PRIORITY_PARTITION_ID = 'control_plane_publications-p1';

async function removeGuardsRefuse(cachedOperations) {
  const coordinator = createTestCoordinator({
    nodeId: 'node-planner',
    cacheData: {replicaOperations: cachedOperations},
    messageRouter: {
      deliver: async () => ({acknowledged: true, status: 'completed'}),
      getOutboundPressureSummary: () => ({backpressured: true}),
      getConnectionState: () => 'connected',
      pingNode: async () => true,
      isOutboundQueueAvailable: () => true,
    },
  });
  coordinator.initialize();
  coordinator.repository.getOperationsByEntityAuthoritativeObservation =
    async () => ({
      state: 'deferred',
      operationCount: 0,
      operations: [],
      deferredOutcome: {
        completionState: 'operation_visibility_deferred',
        reasonCode: 'operation_visibility_deferred',
        retryAfterMs: 125,
      },
      retryAfterMs: 125,
    });
  const context = {
    normalizedMoveType: OperationType.REMOVE,
    partitionId: PRIORITY_PARTITION_ID,
    entityType: 'partition',
    entityId: PRIORITY_PARTITION_ID,
    move: {replicaId: `${PRIORITY_PARTITION_ID}-r2`},
  };
  try {
    await coordinator.ensureNoConflictingInFlightReplaceForRemove(context);
    await coordinator.ensurePriorityControlPlaneRemoveLaneAvailable(context);
    return false;
  } catch (_refused) {
    return true;
  } finally {
    await coordinator.shutdown();
  }
}

function cachedReplaceRow(workflowStep) {
  return {
    operation_id: `a14b-replace-${workflowStep}`,
    type: OperationType.REPLACE,
    entity_type: 'partition',
    entity_id: PRIORITY_PARTITION_ID,
    partition_id: PRIORITY_PARTITION_ID,
    replica_id: `${PRIORITY_PARTITION_ID}-r4`,
    target_node_id: 'node-4',
    status: WORKFLOW_STEP_TO_STATUS[workflowStep],
    workflow_step: workflowStep,
    stepsHistory: [{step: workflowStep,
      sourceReplicaId: `${PRIORITY_PARTITION_ID}-r1`}],
  };
}

test('A14b: REMOVE creation fails closed under deferred visibility while ' +
  'the cache holds a non-terminal REPLACE', async (t) => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({});
  LoggingService.getInstance().initialize({level: 'error'});
  t.teardown(() => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  });
  t.equal(await removeGuardsRefuse([]), false,
    'control: with nothing cached the contained-pressure allowance admits ' +
      'the REMOVE (the fail-open this guards)');
  for (const step of NON_TERMINAL_REPLACE_STEPS) {
    t.equal(await removeGuardsRefuse([cachedReplaceRow(step)]), true,
      `${step}: a cached REPLACE refuses the REMOVE`);
  }
});
