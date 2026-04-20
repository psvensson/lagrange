import { REPLICA_DISPATCH_SERVICE_SHARED } from './replica-dispatch-service-shared.js';
import { ReplicaDispatchServiceSegment4 } from './replica-dispatch-service-segment-4.js';

const {
  COLUMN,
  CONTROL_PLANE_ALLOWED_STATES,
  CONTROL_PLANE_CONFIG_KEY,
  CONTROL_PLANE_EVENT,
  CONTROL_PLANE_NODE_STATE_PUBLICATION_MODE,
  CONTROL_PLANE_NODE_STATE_REPLAY_CONTEXT,
  CONTROL_PLANE_READINESS_DIMENSION,
  ConfigurationManager,
  ControlPlaneField,
  ControlPlaneMessageType,
  ControlPlaneReadinessService,
  DEFAULT_READY_LEASE_MS,
  DISPATCH_DEFAULT,
  DISPATCH_ERROR_MSG,
  DISPATCH_EVENT,
  DISPATCH_LOG_MSG,
  DISPATCH_QUEUE_NAME,
  DISPATCH_READINESS_ERROR_CODE,
  DISPATCH_READINESS_ERROR_REASON,
  DISPATCH_READINESS_MESSAGE,
  DISPATCH_READINESS_REASON,
  DISPATCH_STATE,
  DISPATCH_SUBSYSTEM,
  EventEmitter,
  LoggingService,
  MEMBERSHIP_PUBLICATION_STATUS,
  MESSAGE_GROUP_CDC_INGRESS_ACTION,
  NODE_STATE_UPDATE_RETRY_ACTION,
  NODE_STATE_UPDATE_RETRY_CLASS,
  NODE_STATE_UPDATE_RETRY_POLICY,
  NUM,
  OPERATION_METADATA_KEY,
  OperationType,
  OwnerKeyReconcileQueue,
  QUERY_ERROR_CODE,
  QUERY_ERROR_MSG,
  READY_NODE_PUBLICATION_ADVANCEMENT_STATE,
  REBALANCE_COORDINATOR_EVENT,
  RECONCILE_REASON,
  REPLICA_DISPATCH_SERVICE_LITERAL,
  REPLICA_OPERATION_VISIBILITY_READ_MODE,
  ReplicaOperationField,
  SERVICE_STATUS,
  SERVICE_TYPE,
  STATE,
  STRING,
  SYSTEM_TABLE_NAME,
  TYPEOF,
  WORKFLOW_STEP,
  assertCritical,
  compareNodeHeartbeatWatermarks,
  createControlPlaneRuntimeBundle,
  getControlPlaneErrorCode,
  getControlPlaneErrorMessage,
  getControlPlaneMessageRequiredTables,
  getControlPlaneNodeStatePublicationProfile,
  getControlPlaneRetryAfterMs,
  getNodeHeartbeatWatermark,
  getOperationMetadataObject,
  getOperationMetadataString,
  getOperationMetadataStringArray,
  isCoordinatorOwnedOperationType,
  isHeartbeatEscalatedControlPlaneNodeStatePublicationMode,
  isRetryableControlPlaneError,
  isTerminalMembershipPublicationStatus,
  resolveControlPlaneNodeStatePublicationMode,
  resolveReadyNodePublicationAdvancementState,
  resolveReplayControlPlaneNodeStatePublicationMode,
  shouldUseAuthoritativePriorityRecoveryRediscovery,
  unwrapRowReadResult,
  wasNodeRecordReadyWhenWritten,
} = REPLICA_DISPATCH_SERVICE_SHARED;

class ReplicaDispatchService extends ReplicaDispatchServiceSegment4 {
  isControlMessage(payload) {
    return Object.values(ControlPlaneMessageType).includes(payload?.type);
  }

  /**
   * Stop the dispatch service.
   */
  stop() {
    if (this.directDispatchServiceAddress &&
        this.messageRouter &&
        typeof this.messageRouter.unregister === TYPEOF.FUNCTION) {
      this.messageRouter.unregister(this.directDispatchServiceAddress);
    }
    this.directDispatchServiceHandler = null;
    this.directDispatchServiceAddress = null;

    if (this.coordinatorOperationCreatedListener &&
        this.rebalanceCoordinator &&
        typeof this.rebalanceCoordinator.off === TYPEOF.FUNCTION) {
      this.rebalanceCoordinator.off(
        REBALANCE_COORDINATOR_EVENT.OPERATION_CREATED,
        this.coordinatorOperationCreatedListener,
      );
    }
    this.coordinatorOperationCreatedListener = null;

    if (this.cacheChangeListener &&
        this.systemTableCache &&
        typeof this.systemTableCache.offCacheChange === TYPEOF.FUNCTION) {
      this.systemTableCache.offCacheChange(this.cacheChangeListener);
    }
    this.cacheChangeListener = null;

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
    this.retryInFlightNodes.clear();
    this.nodeStateUpdateWatermarks.clear();
    this.nodeReadyRetryWatermarks.clear();
    for (const operationId of this.operationDispatchDeferredRetries.keys()) {
      this.clearDeferredOperationDispatchRetry(operationId);
    }
    for (const nodeId of this.nodeStateUpdateDeferredRetries.keys()) {
      this.clearDeferredNodeStateUpdateRetry(nodeId);
    }
    this.nodeStateUpdateRetryStateByNodeId.clear();
    this.nodeStateUpdateQueueAssignments.clear();
    this.nextNodeStateUpdateQueueIndex = NUM.ZERO;

    if (Array.isArray(this.operationDispatchQueues) &&
        this.operationDispatchQueues.length > NUM.ZERO) {
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

