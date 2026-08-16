import {REPLICA_DISPATCH_SERVICE_SHARED} from './replica-dispatch-service-shared.js';
import {ReplicaDispatchReadinessCapture} from './replica-dispatch-readiness-capture.js';

const {
  CONTROL_PLANE_EVENT,
  ControlPlaneMessageType,
  DISPATCH_LOG_MSG,
  DISPATCH_STATE,
  REBALANCE_COORDINATOR_EVENT,
} = REPLICA_DISPATCH_SERVICE_SHARED;

class ReplicaDispatchService extends ReplicaDispatchReadinessCapture {
  isControlMessage(payload) {
    return Object.values(ControlPlaneMessageType).includes(payload?.type);
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
      mgService.off(
        CONTROL_PLANE_EVENT.MESSAGE_RECEIVED,
        handlers.onMessageReceived,
      );
      mgService.off(
        CONTROL_PLANE_EVENT.CDC_APPLIED,
        handlers.onCdcApplied,
      );
    }
    this.messageGroupHandlers.clear();
    this.messageGroupServices.clear();
    this.dispatchInFlight.clear();
    this.priorityDispatchInFlight.clear();
    this.directDispatchWakeupsInFlight.clear();
    this.retryInFlightNodes.clear();
    this.nodeStateUpdateWatermarks.clear();
    this.nodeBootIncarnationWatermarks.clear();
    this.nodeReadyRetryWatermarks.clear();
    this.readinessPlanningSnapshotTokenByOwnerKey.clear();
    this.readinessPlanningSnapshotPendingTokenByOwnerKey.clear();
    for (const operationId of this.operationDispatchDeferredRetries.keys()) {
      this.clearDeferredOperationDispatchRetry(operationId);
    }
    for (const nodeId of this.nodeStateUpdateDeferredRetries.keys()) {
      this.clearDeferredNodeStateUpdateRetry(nodeId);
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
    this.nodeStateUpdateRetryStateByNodeId.clear();
    this.nodeStateUpdateQueueAssignments.clear();
    this.nextNodeStateUpdateQueueIndex = 0;

    if (Array.isArray(this.operationDispatchQueues) &&
        this.operationDispatchQueues.length > 0) {
      for (const operationDispatchQueue of this.operationDispatchQueues) {
        operationDispatchQueue.shutdown();
      }
    } else {
      this.operationDispatchQueue.shutdown();
    }
    for (const nodeStateUpdateQueue of this.nodeStateUpdateQueues) {
      nodeStateUpdateQueue.shutdown();
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
