import {deliveryTransportOf, deliveryAnswerOf} from '../transport/transport-semantic-outcome.js';
import {REPLICA_DISPATCH_SERVICE_SHARED} from './replica-dispatch-service-shared.js';

const {
  ControlPlaneField,
  ControlPlaneMessageType,
  OPERATION_WORKFLOW_OWNER_LITERAL,
  REPLICA_DISPATCH_SERVICE_LITERAL,
  classifySystemPartition,
  isDeliveredTransportDeliveryOutcome,
} = REPLICA_DISPATCH_SERVICE_SHARED;

const DIRECT_DISPATCH_WAKEUP_EMPTY_VALUE = null;
const DIRECT_DISPATCH_WAKEUP_DELIVERY_OPTION_FIELD = Object.freeze({
  DELIVERY_PRIORITY: 'deliveryPriority',
  DELIVERY_SOURCE: 'deliverySource',
  TARGET_NODE_ID: 'targetNodeId',
  TIMEOUT_MS: 'timeoutMs',
});

// A persisted row is flat. An input with extra fields or non-scalar values
// still goes through the canonical decoder and wake-row builder.
function samePersistedWakeRow(left, right) {
  if (!left || !right) return false;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every((key) => {
    const value = left[key];
    const type = typeof value;
    return (value === null || type === 'string' || type === 'number' || type === 'boolean') &&
      Object.hasOwn(right, key) && Object.is(value, right[key]);
  });
}

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
    if (normalizedNodeId.length === 0) {
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
        'function'
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
    if (classifySystemPartition({partitionId}).priorityControlPlane) {
      deliveryOptions[
        DIRECT_DISPATCH_WAKEUP_DELIVERY_OPTION_FIELD.DELIVERY_PRIORITY
      ] = OPERATION_WORKFLOW_OWNER_LITERAL.CRITICAL;
    }
    return deliveryOptions;
  },

  sendDirectDispatchWakeupFromRow(row) {
    const current = this.directDispatchWakeupsInFlight.get(row.operation_id);
    if (current?.validatedReplay && samePersistedWakeRow(row, current.row)) {
      return Promise.resolve(this.coalesceActiveDirectDispatchWakeup(row.operation_id, current.row, true));
    }
    return this.sendDirectDispatchWakeup(this.buildOperationFromRow(row), row);
  },

  /**
   * Send one bounded direct owner wake-up when a newly created operation is
   * owned by another node and CDC/cache visibility may lag.
   * @param {Object} operation
   * @return {Promise<boolean>}
   * @private
   */
  async sendDirectDispatchWakeup(operation, replayRow = null) {
    if (
      !operation?.operationId ||
      !this.messageRouter ||
      typeof this.messageRouter.deliver !== 'function'
    ) {
      return false;
    }
    const operationRow = this.buildOperationRowFromCoordinator(operation);
    const validatedReplay = samePersistedWakeRow(replayRow, operationRow);
    if (
      this.coalesceActiveDirectDispatchWakeup(
        operation.operationId,
        operationRow,
        validatedReplay,
      )
    ) {
      return true;
    }
    const ownerNodeId = this.resolveReplicaOperationOwnerNodeId(operation);
    const targetAddress = this.buildDirectDispatchServiceAddress(ownerNodeId);
    if (!targetAddress) {
      return false;
    }
    this.markDirectDispatchWakeupInFlight(operation.operationId, operationRow, validatedReplay);
    try {
      const deliveryEnvelope = await this.messageRouter.deliver(
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
      );
      const transport = deliveryTransportOf(deliveryEnvelope);
      const answer = deliveryAnswerOf(deliveryEnvelope);
      const latestOperationRow = this.clearDirectDispatchWakeupInFlight(
        operation.operationId,
        operationRow,
      );
      // Woken only when delivered and the dispatch owner did not refuse; its
      // own refusal defers through the dispatch owner, not the transport.
      const delivered = isDeliveredTransportDeliveryOutcome(transport);
      if (delivered && answer?.success !== false) {
        this.scheduleRemoteDispatchWakeupVerification(
          operation.operationId,
          latestOperationRow,
        );
        return true;
      }
      this.deferOperationDispatchRetry(
        operation.operationId,
        delivered ? answer : transport,
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
