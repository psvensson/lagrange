/**
 * R-1b (amendment-1 step 3, BR14): the priority-recovery drain never
 * completes or releases a partition REPLACE from its own evidence. Where it
 * would settle another operation CONVERGED (or release it), a partition
 * REPLACE is SOURCE_RETIREMENT_OWNED: the drain hands it back to its owner,
 * which decides from committed membership. A remote owner is woken once per
 * change of the drain's verdict, not once per sweep.
 *
 * Universe: every priority-recovery completion state and every drain source
 * state (production enumerations), for a partition REPLACE in each of its
 * owner phases and, as the control, for a REMOVE.
 */

import {test} from '../../src/test-helpers/tap.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {OperationType} from '../../src/rebalancer/replica-status.js';
import {
  OPERATION_WORKFLOW_OWNER_SEGMENT_7_STAGE_SHARED as SHARED,
} from '../../src/rebalancer/operation-workflow-recovery-reconcile-shared.js';
import {
  REPLACE_OWNER_PHASE_WORKFLOW_STEPS,
} from '../../src/rebalancer/replica-operation-step-policy.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {createTestCoordinator} from './test-helpers.js';

const {
  PRIORITY_RECOVERY_COMPLETION_STATE,
  PRIORITY_RECOVERY_OPERATION_DRAIN_OWNER_ACTION,
  PRIORITY_RECOVERY_OPERATION_DRAIN_SOURCE_STATE,
  PRIORITY_RECOVERY_OPERATION_DRAIN_STATE,
} = SHARED;

const PARTITION_ID = 'replica_operations-p1';
const SETTLING_STATES = Object.freeze(new Set([
  PRIORITY_RECOVERY_OPERATION_DRAIN_STATE.CONVERGED,
  PRIORITY_RECOVERY_OPERATION_DRAIN_STATE.OWNER_UNAVAILABLE_RELEASED,
]));

function operationOf(type, workflowStep) {
  return {
    operationId: `drain-${type}-${workflowStep}`,
    type,
    partitionId: PARTITION_ID,
    entityType: 'partition',
    entityId: PARTITION_ID,
    replicaId: `${PARTITION_ID}-r4`,
    sourceReplicaId: `${PARTITION_ID}-r1`,
    sourceNodeId: 'node-1',
    targetNodeId: 'node-4',
    workflowStep,
    stepsHistory: [{step: workflowStep, timestamp: Date.now()}],
  };
}

function withCoordinator(body) {
  return async (t) => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
    ConfigurationManager.getInstance().initialize({});
    LoggingService.getInstance().initialize({level: 'error'});
    const coordinator = createTestCoordinator({nodeId: 'node-planner'});
    coordinator.initialize();
    try {
      await body(t, coordinator.workflowOwner);
    } finally {
      await coordinator.shutdown();
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
    }
  };
}

test('R-1b: the drain never settles a partition REPLACE; it hands it back',
  withCoordinator(async (t, owner) => {
    let controlSettled = 0;
    for (const completionState of
      Object.values(PRIORITY_RECOVERY_COMPLETION_STATE)) {
      for (const sourceState of
        Object.values(PRIORITY_RECOVERY_OPERATION_DRAIN_SOURCE_STATE)) {
        const decide = (operation) =>
          owner.resolvePriorityRecoveryOperationDrainState(
            {state: completionState}, {state: sourceState}, null, operation);
        const control = decide(operationOf(OperationType.REMOVE,
          WORKFLOW_STEP.STOPPING));
        if (SETTLING_STATES.has(control)) {
          controlSettled += 1;
        }
        for (const step of REPLACE_OWNER_PHASE_WORKFLOW_STEPS) {
          const decided = decide(operationOf(OperationType.REPLACE, step));
          t.notOk(SETTLING_STATES.has(decided),
            `${step} ${completionState}/${sourceState}: never settled by ` +
              `the drain (${decided})`);
          if (SETTLING_STATES.has(control)) {
            t.equal(decided,
              PRIORITY_RECOVERY_OPERATION_DRAIN_STATE.SOURCE_RETIREMENT_OWNED,
              `${step} ${completionState}/${sourceState}: handed back`);
          }
        }
      }
    }
    t.ok(controlSettled > 0, 'control: the drain does settle a REMOVE');
  }));

test('BR14: a remote owner is woken once per drain-verdict change',
  withCoordinator(async (t, owner) => {
    const operation = operationOf(OperationType.REPLACE,
      WORKFLOW_STEP.STOPPING);
    let sourceState =
      PRIORITY_RECOVERY_OPERATION_DRAIN_SOURCE_STATE.REMOVAL_CONFIRMED;
    owner.isPriorityRecoveryOperationDrainCandidate = () => true;
    owner.readAvailablePriorityRecoveryPlanningSnapshot = async () => ({});
    owner.buildPriorityRecoveryAssessmentContextForOperation = () => ({});
    owner.buildPriorityRecoveryCompletionForOperation = () => ({
      state: PRIORITY_RECOVERY_COMPLETION_STATE.CONVERGED});
    owner.resolvePriorityRecoveryRemoteSupersededTargetDrainError = () => null;
    owner.buildPriorityRecoveryOperationDrainSourceSnapshot = async () => ({
      state: sourceState, sourceReplicaId: operation.sourceReplicaId,
      observationState: null, lifecycleStatus: null});
    owner.repository.isOperationLocallyOwned = () => false;
    owner.shouldRetryCoordinatorCreatedRemoteHandoff = () => true;
    owner.isDispatchRetryableWorkflowStep = () => true;
    const ownerAction = async () =>
      (await owner.buildPriorityRecoveryOperationDrainSnapshot(operation))
        .ownerAction;
    t.equal(await ownerAction(),
      PRIORITY_RECOVERY_OPERATION_DRAIN_OWNER_ACTION.WAKE_REMOTE_OWNER,
      'the first hand-back wakes the remote owner');
    t.not(await ownerAction(),
      PRIORITY_RECOVERY_OPERATION_DRAIN_OWNER_ACTION.WAKE_REMOTE_OWNER,
      'the same verdict on the next sweep wakes nobody');
    sourceState =
      PRIORITY_RECOVERY_OPERATION_DRAIN_SOURCE_STATE.NOT_REQUIRED;
    t.equal(await ownerAction(),
      PRIORITY_RECOVERY_OPERATION_DRAIN_OWNER_ACTION.WAKE_REMOTE_OWNER,
      'a changed verdict wakes it again');
  }));
