import * as COORDINATOR_CREATED_HANDOFF
  from './operation-workflow-coordinator-created-handoff-scheduling.js';

class OperationWorkflowCoordinatorCreatedHandoffRetryRegistry {
  cloneOperationSnapshot(operation) {
    return COORDINATOR_CREATED_HANDOFF.cloneOperationSnapshot(operation);
  }

  resolveCoordinatorCreatedOperationOwnerNodeId(operation) {
    return COORDINATOR_CREATED_HANDOFF
      .resolveCoordinatorCreatedOperationOwnerNodeId(this, operation);
  }

  resolveCoordinatorCreatedHandoffDiagnosticDestination(
    operation,
    options = {},
  ) {
    return COORDINATOR_CREATED_HANDOFF
      .resolveCoordinatorCreatedHandoffDiagnosticDestination(
        this,
        operation,
        options,
      );
  }

  isCoordinatorCreatedOperationLocallyOwned(operation) {
    return COORDINATOR_CREATED_HANDOFF.isCoordinatorCreatedOperationLocallyOwned(
      this,
      operation,
    );
  }

  buildCoordinatorCreatedDispatchIngress(nodeId) {
    return COORDINATOR_CREATED_HANDOFF.buildCoordinatorCreatedDispatchIngress(
      nodeId,
    );
  }

  buildCoordinatorCreatedDispatchRow(operation) {
    return COORDINATOR_CREATED_HANDOFF.buildCoordinatorCreatedDispatchRow(
      operation,
    );
  }

  shouldRetryCoordinatorCreatedRemoteHandoff(operation, options = {}) {
    return COORDINATOR_CREATED_HANDOFF
      .shouldRetryCoordinatorCreatedRemoteHandoff(
        this,
        operation,
        options,
      );
  }

  buildCoordinatorCreatedRemoteHandoffTimeoutDecision(
    operation,
    now = Date.now(),
    options = {},
  ) {
    return COORDINATOR_CREATED_HANDOFF
      .buildCoordinatorCreatedRemoteHandoffTimeoutDecision(
        this,
        operation,
        now,
        options,
      );
  }

  canContinueCoordinatorCreatedRemoteHandoff(operation, delayMs) {
    return COORDINATOR_CREATED_HANDOFF
      .canContinueCoordinatorCreatedRemoteHandoff(
        this,
        operation,
        delayMs,
      );
  }

  scheduleCoordinatorCreatedRemoteHandoffFollowUp(
    operation,
    delayMs,
    options = {},
  ) {
    return COORDINATOR_CREATED_HANDOFF
      .scheduleCoordinatorCreatedRemoteHandoffFollowUp(
        this,
        operation,
        delayMs,
        options,
      );
  }
}

export {OperationWorkflowCoordinatorCreatedHandoffRetryRegistry};
