import {PROTECTED_PRIORITY_BUDGET_WORKFLOW_STEPS} from './replica-operation-step-policy.js';
import {OPERATION_WORKFLOW_OWNER_SHARED} from './operation-workflow-owner-shared.js';

const {
  TIMEOUT_BUDGET_DEFAULT,
  WORKFLOW_STEP,
} = OPERATION_WORKFLOW_OWNER_SHARED;

class OperationWorkflowTransitionRetryGrace {
  constructor(options) {
    this.deadlineByOperationId = options.deadlineByOperationId;
    this.getTimeoutForStep = options.getTimeoutForStep;
    this.isCriticalSystemPartition = options.isCriticalSystemPartition;
    this.isPriorityControlPlanePartition =
      options.isPriorityControlPlanePartition;
  }

  /**
   * @param {string|null} operationId
   * @return {void}
   */
  clear(operationId) {
    this.deadlineByOperationId.delete(operationId);
  }

  /**
   * @return {void}
   */
  clearAll() {
    this.deadlineByOperationId.clear();
  }

  /**
   * @param {string|null} operationId
   * @param {Object} [context={}]
   * @param {number} [delayMs=0]
   * @return {void}
   */
  record(operationId, context = {}, delayMs = 0) {
    if (!operationId) {
      return;
    }
    const workflowStep =
      typeof context.workflowStep === 'string' &&
      context.workflowStep.length > 0 ?
        context.workflowStep :
        WORKFLOW_STEP.PENDING;
    const partitionId = context.partitionId || null;
    const stepTimeout = this.getTimeoutForStep(
      workflowStep,
      partitionId ? {partitionId} : null,
    );
    const retryDelayMs =
      Number.isFinite(delayMs) && delayMs > 0 ? delayMs : 0;
    const requestedGraceDeadlineMs = Date.now() + retryDelayMs;
    const durableProgressAtMs = Number.isFinite(context.updatedAt) ?
      context.updatedAt :
      Number.isFinite(context.updatedAtMs) ?
        context.updatedAtMs :
        Number.isFinite(context.createdAt) ?
          context.createdAt :
          Number.isFinite(context.createdAtMs) ?
            context.createdAtMs :
            null;
    const timeoutCeilingMs = this.resolveTimeoutCeilingMs(
      context,
      workflowStep,
      durableProgressAtMs,
      stepTimeout,
    );
    const graceDeadlineMs = Number.isFinite(timeoutCeilingMs) ?
      Math.min(timeoutCeilingMs, requestedGraceDeadlineMs) :
      requestedGraceDeadlineMs;
    const existingDeadlineMs = Number(
      this.deadlineByOperationId.get(operationId),
    );
    this.deadlineByOperationId.set(
      operationId,
      Number.isFinite(timeoutCeilingMs) && Number.isFinite(existingDeadlineMs) ?
        Math.min(
          timeoutCeilingMs,
          Math.max(existingDeadlineMs, graceDeadlineMs),
        ) :
        Number.isFinite(existingDeadlineMs) ?
          Math.max(existingDeadlineMs, graceDeadlineMs) :
          graceDeadlineMs,
    );
  }

  /**
   * Critical dispatch/remove-dispatch retries may stay explicitly deferred
   * under control-plane pressure until the enclosing rebalance budget is
   * exhausted. Create-rearm retries still use the stricter step timeout
   * ceiling because they model stalled target provisioning, not dispatch
   * pressure.
   *
   * @param {Object} context
   * @param {string} workflowStep
   * @param {number|null} durableProgressAtMs
   * @param {number} stepTimeout
   * @return {number|null}
   */
  resolveTimeoutCeilingMs(
    context,
    workflowStep,
    durableProgressAtMs,
    stepTimeout,
  ) {
    if (!Number.isFinite(durableProgressAtMs)) {
      return null;
    }
    if (!this.usesOperationBudget(context, workflowStep)) {
      return durableProgressAtMs + stepTimeout;
    }

    const operationStartedAtMs = Number.isFinite(context.createdAt) ?
      context.createdAt :
      Number.isFinite(context.createdAtMs) ?
        context.createdAtMs :
        durableProgressAtMs;
    return (
      operationStartedAtMs +
      TIMEOUT_BUDGET_DEFAULT.REBALANCE_OPERATION_BUDGET_MS
    );
  }

  /**
   * Retryable control-plane pressure on critical dispatch/remove-dispatch
   * workflow steps should spend the overall rebalance budget instead of
   * expiring at the stale step timestamp.
   *
   * @param {Object} context
   * @param {string} workflowStep
   * @return {boolean}
   */
  usesOperationBudget(context, workflowStep) {
    const partitionId =
      typeof context?.partitionId === 'string' &&
      context.partitionId.length > 0 ?
        context.partitionId :
        null;
    const usesProtectedPriorityBudget =
      this.isCriticalSystemPartition(partitionId) ||
      (
        typeof this.isPriorityControlPlanePartition === 'function' &&
        this.isPriorityControlPlanePartition(partitionId)
      );
    if (!usesProtectedPriorityBudget) {
      return false;
    }
    return PROTECTED_PRIORITY_BUDGET_WORKFLOW_STEPS.has(workflowStep);
  }

  /**
   * @param {string|null} operationId
   * @param {number} [now=Date.now()]
   * @return {boolean}
   */
  isActive(operationId, now = Date.now()) {
    if (!operationId) {
      return false;
    }
    const deadlineMs = Number(this.deadlineByOperationId.get(operationId));
    if (!Number.isFinite(deadlineMs)) {
      return false;
    }
    if (deadlineMs <= now) {
      this.deadlineByOperationId.delete(operationId);
      return false;
    }
    return true;
  }
}

export {OperationWorkflowTransitionRetryGrace};
