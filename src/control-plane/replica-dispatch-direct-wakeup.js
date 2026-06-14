import {REPLICA_DISPATCH_SERVICE_SHARED} from './replica-dispatch-service-shared.js';

const {
  ControlPlaneField,
  ControlPlaneMessageType,
  NUM,
  OPERATION_WORKFLOW_OWNER_LITERAL,
  REPLICA_DISPATCH_SERVICE_LITERAL,
  TYPEOF,
  classifyTransportDeliveryOutcome,
  isDeliveredTransportDeliveryOutcome,
  isPriorityControlPlanePartition,
} = REPLICA_DISPATCH_SERVICE_SHARED;

const DIRECT_DISPATCH_WAKEUP_EMPTY_VALUE = null;
const DIRECT_DISPATCH_WAKEUP_DELIVERY_OPTION_FIELD = Object.freeze({
  DELIVERY_PRIORITY: 'deliveryPriority',
  DELIVERY_SOURCE: 'deliverySource',
  TARGET_NODE_ID: 'targetNodeId',
  TIMEOUT_MS: 'timeoutMs',
});
const DIRECT_DISPATCH_WAKEUP_CLASSIFY_OPTION_FIELD = Object.freeze({
  DEFAULT_RETRY_AFTER_MS: 'defaultRetryAfterMs',
});

/**
 * Direct owner wake-up methods attached to the dispatch service prototype.
 * These resolve one replica operation's owner node and deliver one bounded
 * direct router wake-up when CDC/cache visibility may lag. They run with the
 * service instance as `this`, sharing the same prototype chain as the
 * lifecycle methods.
 */
const REPLICA_DISPATCH_DIRECT_WAKEUP_METHODS = {
  /**
   * Build the direct router address used to wake one replica-operation owner.
   * @param {string} nodeId
   * @return {string|null}
   * @private
   */
  buildDirectDispatchServiceAddress(nodeId) {
    const normalizedNodeId = String(nodeId || '').trim();
    if (normalizedNodeId.length === NUM.ZERO) {
      return null;
    }
    return `${normalizedNodeId}/service/replica-dispatch`;
  },

  /**
   * Resolve the current owner node for one replica operation.
   * @param {Object} operation
   * @return {string|null}
   * @private
   */
  resolveReplicaOperationOwnerNodeId(operation) {
    if (
      this.rebalanceCoordinator &&
      typeof this.rebalanceCoordinator.resolveOperationOwnerNodeId ===
        TYPEOF.FUNCTION
    ) {
      return this.rebalanceCoordinator.resolveOperationOwnerNodeId(operation);
    }
    return operation?.targetNodeId || operation?.target_node_id || null;
  },

  /**
   * Build bounded transport options for direct replica-dispatch wake-ups.
   * @param {Object} operation
   * @param {string} ownerNodeId
   * @return {Object}
   * @private
   */
  buildDirectDispatchWakeupDeliveryOptions(operation, ownerNodeId) {
    const deliveryOptions = {
      [DIRECT_DISPATCH_WAKEUP_DELIVERY_OPTION_FIELD.TARGET_NODE_ID]:
        ownerNodeId,
      [DIRECT_DISPATCH_WAKEUP_DELIVERY_OPTION_FIELD.TIMEOUT_MS]:
        this.replicaOperationDispatchTimeoutMs,
      [DIRECT_DISPATCH_WAKEUP_DELIVERY_OPTION_FIELD.DELIVERY_SOURCE]:
        OPERATION_WORKFLOW_OWNER_LITERAL.COORDINATOR_CREATED_REMOTE_HANDOFF,
    };
    const partitionId =
      operation?.partitionId ||
      operation?.partition_id ||
      DIRECT_DISPATCH_WAKEUP_EMPTY_VALUE;
    if (isPriorityControlPlanePartition({partitionId})) {
      deliveryOptions[
        DIRECT_DISPATCH_WAKEUP_DELIVERY_OPTION_FIELD.DELIVERY_PRIORITY
      ] = OPERATION_WORKFLOW_OWNER_LITERAL.CRITICAL;
    }
    return deliveryOptions;
  },

  /**
   * Send one bounded direct owner wake-up when a newly created operation is
   * owned by another node and CDC/cache visibility may lag.
   * @param {Object} operation
   * @return {Promise<boolean>}
   * @private
   */
  async sendDirectDispatchWakeup(operation) {
    if (
      !operation?.operationId ||
      !this.messageRouter ||
      typeof this.messageRouter.deliver !== TYPEOF.FUNCTION
    ) {
      return false;
    }
    const operationRow = this.buildOperationRowFromCoordinator(operation);
    if (
      this.coalesceActiveDirectDispatchWakeup(
        operation.operationId,
        operationRow,
      )
    ) {
      return true;
    }
    const ownerNodeId = this.resolveReplicaOperationOwnerNodeId(operation);
    const targetAddress = this.buildDirectDispatchServiceAddress(ownerNodeId);
    if (!targetAddress) {
      return false;
    }
    this.markDirectDispatchWakeupInFlight(operation.operationId, operationRow);
    try {
      const deliveryOutcome = classifyTransportDeliveryOutcome(
        await this.messageRouter.deliver(
          targetAddress,
          {
            type: ControlPlaneMessageType.REPLICA_OPERATION_DISPATCH,
            [ControlPlaneField.OPERATION_ID]: operation.operationId,
            [ControlPlaneField.OPERATION_ROW]: operationRow,
          },
          this.buildDirectDispatchWakeupDeliveryOptions(
            operation,
            ownerNodeId,
          ),
        ),
        {
          [DIRECT_DISPATCH_WAKEUP_CLASSIFY_OPTION_FIELD.DEFAULT_RETRY_AFTER_MS]:
            this.operationDispatchRetryAfterMs,
        },
      );
      const latestOperationRow = this.clearDirectDispatchWakeupInFlight(
        operation.operationId,
        operationRow,
      );
      if (isDeliveredTransportDeliveryOutcome(deliveryOutcome)) {
        this.scheduleRemoteDispatchWakeupVerification(
          operation.operationId,
          latestOperationRow,
        );
        return true;
      }
      this.deferOperationDispatchRetry(
        operation.operationId,
        deliveryOutcome,
        latestOperationRow,
        {
          [REPLICA_DISPATCH_SERVICE_LITERAL.REFRESH_ROW_BEFORE_DISPATCH]:
            true,
        },
      );
      return false;
    } catch (error) {
      const latestOperationRow = this.clearDirectDispatchWakeupInFlight(
        operation.operationId,
        operationRow,
      );
      this.deferOperationDispatchRetry(
        operation.operationId,
        error,
        latestOperationRow,
        {
          [REPLICA_DISPATCH_SERVICE_LITERAL.REFRESH_ROW_BEFORE_DISPATCH]:
            true,
        },
      );
      return false;
    }
  },
};

export {REPLICA_DISPATCH_DIRECT_WAKEUP_METHODS};
