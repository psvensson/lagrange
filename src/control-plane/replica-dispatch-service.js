import {REPLICA_DISPATCH_SERVICE_SHARED} from './replica-dispatch-service-shared.js';
import {ReplicaDispatchReadinessCapture} from './replica-dispatch-readiness-capture.js';
import {CONTROL_PLANE_AUTHORITATIVE_READ_MODE} from
  './control-plane-system-table-gateway-constants.js';
import {SERVICE_INSTANCE_OUTCOME as LEGACY_AUTHORITY} from
  '../constants/service-instance.js';
import {UNIFIED_SERVICE_TYPE, WORKFLOW_STEP} from '../constants/index.js';
import {OperationType} from '../rebalancer/replica-status.js';
import {isIncompleteOperationRowStep} from
  '../rebalancer/replica-operation-step-policy.js';

const {
  CONTROL_PLANE_EVENT,
  DISPATCH_LOG_MSG,
  DISPATCH_STATE,
  getControlPlaneMessageCompletionKind,
  REBALANCE_COORDINATOR_EVENT,
} = REPLICA_DISPATCH_SERVICE_SHARED;

function unregisterMessageGroupHandlers(mgService, handlers) {
  if (handlers.ownsApplicationCompletion &&
      typeof mgService.unregisterApplicationMessageCompletionHandler ===
        'function') {
    mgService.unregisterApplicationMessageCompletionHandler(
      handlers.ownedMessageTypes,
      handlers.onMessageReceived,
    );
  } else {
    mgService.off(
      CONTROL_PLANE_EVENT.MESSAGE_RECEIVED,
      handlers.onMessageReceived,
    );
  }
  mgService.off(
    CONTROL_PLANE_EVENT.CDC_APPLIED,
    handlers.onCdcApplied,
  );
}

class ReplicaDispatchService extends ReplicaDispatchReadinessCapture {
  /**
   * A pre-canonical target's services row has no provable entity binding.
   * Ask the existing operation repository's strict authoritative owner,
   * never local cache or the caller's claimed entity, for REMOVE permission.
   * No response from this read grants new CREATE authority.
   */
  async authorizeLegacyRuntimeRemoval({operationId, entityId, replicaId, nodeId} = {}) {
    const repository = this.rebalanceCoordinator?.repository;
    if (typeof repository?.queryAuthoritativeOperationVisibilityObservation !== 'function') {
      return {outcome: LEGACY_AUTHORITY.UNAVAILABLE};
    }
    let observation;
    try {
      observation = await repository.queryAuthoritativeOperationVisibilityObservation(
        operationId, {
          authoritativeReadMode: CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
          requireAbsenceConfirmation: true,
        });
    } catch {
      return {outcome: LEGACY_AUTHORITY.UNAVAILABLE};
    }
    const operation = observation?.operation;
    if (!operation) return {outcome: observation?.deferredOutcome ?
      LEGACY_AUTHORITY.UNAVAILABLE : LEGACY_AUTHORITY.CONTENT_CONFLICT};
    const matches = operation.operationId === operationId &&
      operation.type === OperationType.REMOVE &&
      operation.entityType === UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE &&
      operation.entityId === entityId &&
      operation.replicaId === replicaId &&
      operation.targetNodeId === nodeId &&
      operation.workflowStep !== WORKFLOW_STEP.PENDING &&
      isIncompleteOperationRowStep(operation.type, operation.workflowStep);
    return {outcome: matches ? LEGACY_AUTHORITY.ADMITTED :
      LEGACY_AUTHORITY.CONTENT_CONFLICT};
  }

  isControlMessage(payload) {
    return getControlPlaneMessageCompletionKind(payload?.type) !== null;
  }

  /**
   * Stop the dispatch service.
   */
  stop() {
    if (this.directDispatchServiceAddress &&
        this.messageRouter &&
        typeof this.messageRouter.unregister === 'function') {
      this.messageRouter.unregister(this.directDispatchServiceAddress);
    }
    this.directDispatchServiceHandler = null;
    this.directDispatchServiceAddress = null;

    if (this.coordinatorOperationCreatedListener &&
        this.rebalanceCoordinator &&
        typeof this.rebalanceCoordinator.off === 'function') {
      this.rebalanceCoordinator.off(
        REBALANCE_COORDINATOR_EVENT.OPERATION_CREATED,
        this.coordinatorOperationCreatedListener,
      );
    }
    this.coordinatorOperationCreatedListener = null;

    if (this.cacheChangeListener &&
        this.systemTableCache &&
        typeof this.systemTableCache.offCacheChange === 'function') {
      this.systemTableCache.offCacheChange(this.cacheChangeListener);
    }
    this.cacheChangeListener = null;

    if (typeof this.readinessPlanningSnapshotUnsubscribe === 'function') {
      this.readinessPlanningSnapshotUnsubscribe();
    }
    this.readinessPlanningSnapshotUnsubscribe = null;

    for (const [mgService, handlers] of this.messageGroupHandlers) {
      unregisterMessageGroupHandlers(mgService, handlers);
    }
    this.messageGroupHandlers.clear();
    this.messageGroupServices.clear();
    this.dispatchInFlight.clear();
    this.priorityDispatchInFlight.clear();
    this.directDispatchWakeupsInFlight.clear();
    this.retryInFlightNodes.clear();
    this.nodeReadyRetryWatermarks.clear();
    this.readinessPlanningSnapshotTokenByOwnerKey.clear();
    this.readinessPlanningSnapshotPendingTokenByOwnerKey.clear();
    for (const operationId of this.operationDispatchDeferredRetries.keys()) {
      this.clearDeferredOperationDispatchRetry(operationId);
    }
    for (
      const deferredAckRetry of
      this.membershipPublicationAckDeferredRetries.values()
    ) {
      if (deferredAckRetry?.timeoutHandle) {
        this.clearTimeoutFn(deferredAckRetry.timeoutHandle);
      }
    }
    this.membershipPublicationAckDeferredRetries.clear();

    if (Array.isArray(this.operationDispatchQueues) &&
        this.operationDispatchQueues.length > 0) {
      for (const operationDispatchQueue of this.operationDispatchQueues) {
        operationDispatchQueue.shutdown();
      }
    } else {
      this.operationDispatchQueue.shutdown();
    }
    this.nodeReadyRetryQueue.shutdown();
    this.membershipPublicationAdvanceQueue.shutdown();

    this.state = DISPATCH_STATE.STOPPED;
    this.logger.info(DISPATCH_LOG_MSG.STOPPED, {nodeId: this.nodeId});
  }

  /**
   * Get the current state.
   * @return {string} Current lifecycle state.
   */
  getState() {
    return this.state;
  }
}
export {ReplicaDispatchService};
