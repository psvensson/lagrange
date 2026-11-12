import assert from 'node:assert/strict';
import {test} from 'node:test';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {OperationType} from '../../src/rebalancer/replica-status.js';
import {REPLICA_CLEANUP_ERROR_CODE} from '../../src/node/replica-cleanup-constants.js';
import {buildFailedRemovalOutcome} from '../../src/node/replica-removal-debt-errors.js';
import {buildExecutorOutcome} from '../../src/rebalancer/executor-outcome-emitter.js';
import {EXECUTOR_OUTCOME_TYPE} from '../../src/rebalancer/executor-outcome-constants.js';
import {applyOperationWorkflowExecutorOutcomeReconcileMethods} from '../../src/rebalancer/operation-workflow-executor-outcome-reconcile-methods.js';
import {isDispatchRetryableWorkflowStep, isRemoveInitialDispatchPhase,
  isCreateRearmDispatchPhase} from '../../src/rebalancer/operation-workflow-dispatch-rearm-evidence.js';

// Real production builder, wire shape and classification, with a plain REMOVE
// repository predicate. This probes the consumer decision, not a full coordinator.
class DiagnosticOwner {
  constructor() {
    this.repository = {isReplaceRemoveDispatchPhase: () => false};
  }
  isDispatchRetryableWorkflowStep(operation) {
    return isDispatchRetryableWorkflowStep(this, operation);
  }
  isRemoveInitialDispatchPhase(operation) {
    return isRemoveInitialDispatchPhase(operation);
  }
  isCreateRearmDispatchPhase(operation) {
    return isCreateRearmDispatchPhase(this, operation);
  }
}
applyOperationWorkflowExecutorOutcomeReconcileMethods(DiagnosticOwner);
function classify(partitionId, {
  deferRetry = true,
  code = REPLICA_CLEANUP_ERROR_CODE.RUNTIME_RELEASE_DEFERRED,
  type = OperationType.REMOVE,
  outcomeType = EXECUTOR_OUTCOME_TYPE.REPLICA_REMOVE_FAILED,
  workflowStep = WORKFLOW_STEP.STOPPING,
} = {}) {
  const owner = new DiagnosticOwner();
  const replicaId = partitionId + '-r1';
  const error = Object.assign(new Error('Exact runtime shutdown deferred'), {
    code,
    errorCode: code,
    deferRetry,
  });
  const outcome = buildExecutorOutcome(outcomeType,
    'cleanup-op', WORKFLOW_STEP.FAILED,
    {...buildFailedRemovalOutcome(replicaId, error), partitionId});
  const operation = {operationId: 'cleanup-op', type,
    partitionId, replicaId, entityType: 'partition', workflowStep};
  const received = owner.buildExecutorFailureOutcomeErrorLike(outcome, 'fallback');
  const evidence = owner.buildExecutorFailureReconcileEvidence(operation, received, outcome);
  const decision = owner.resolveExecutorFailureReconcileState(evidence);
  assert.equal(outcome.deferRetry === true, deferRetry);
  assert.equal(received.code, code);
  assert.equal(evidence.dispatchRetryableWorkflowStep, true);
  assert.equal(evidence.retryableControlPlaneFailure, deferRetry);
  return decision;
}
test('control: system-partition REMOVE runtime debt enters retry decision', () => {
  assert.equal(classify('replica_operations-p1'), 'defer_retry');
});
test('ordinary user-partition REMOVE runtime debt must retain a retry owner', () => {
  assert.equal(classify('orders-p1'), 'defer_retry');
});

test('permanent cleanup identity refusal remains terminal', () => {
  assert.equal(classify('orders-p1', {
    code: REPLICA_CLEANUP_ERROR_CODE.CLEANUP_IDENTITY_CONFLICT, deferRetry: false,
  }), 'fail_operation');
});

test('REMOVE continuation policy does not silently adopt a CREATE failure', () => {
  assert.equal(classify('orders-p1', {type: OperationType.ADD,
    outcomeType: EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_FAILED,
    workflowStep: WORKFLOW_STEP.PENDING}), 'fail_operation');
});
