import * as DISPATCH_REARM_EVIDENCE
  from './operation-workflow-dispatch-rearm-evidence.js';

class OperationWorkflowCoordinatorCreatedHandoffRetryRegistry {
  cloneOperationSnapshot(operation) {
    return DISPATCH_REARM_EVIDENCE.cloneOperationSnapshot(operation);
  }

  resolveCoordinatorCreatedOperationOwnerNodeId(operation) {
    return DISPATCH_REARM_EVIDENCE
      .resolveCoordinatorCreatedOperationOwnerNodeId(this, operation);
  }

  resolveCoordinatorCreatedHandoffDiagnosticDestination(
    operation,
    options = {},
  ) {
    return DISPATCH_REARM_EVIDENCE
      .resolveCoordinatorCreatedHandoffDiagnosticDestination(
        this,
        operation,
        options,
      );
  }

  isCoordinatorCreatedOperationLocallyOwned(operation) {
    return DISPATCH_REARM_EVIDENCE.isCoordinatorCreatedOperationLocallyOwned(
      this,
      operation,
    );
  }

  buildCoordinatorCreatedDispatchIngress(nodeId) {
    return DISPATCH_REARM_EVIDENCE.buildCoordinatorCreatedDispatchIngress(
      nodeId,
    );
  }

  buildCoordinatorCreatedDispatchRow(operation) {
    return DISPATCH_REARM_EVIDENCE.buildCoordinatorCreatedDispatchRow(
      operation,
    );
  }

  shouldRetryCoordinatorCreatedRemoteHandoff(operation, options = {}) {
    return DISPATCH_REARM_EVIDENCE
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
    return DISPATCH_REARM_EVIDENCE
      .buildCoordinatorCreatedRemoteHandoffTimeoutDecision(
        this,
        operation,
        now,
        options,
      );
  }

  canContinueCoordinatorCreatedRemoteHandoff(operation, delayMs) {
    return DISPATCH_REARM_EVIDENCE
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
    return DISPATCH_REARM_EVIDENCE
      .scheduleCoordinatorCreatedRemoteHandoffFollowUp(
        this,
        operation,
        delayMs,
        options,
      );
  }
}

export {OperationWorkflowCoordinatorCreatedHandoffRetryRegistry};
