import {PARTITION_SERVICE_SHARED} from './partition-service-shared.js';
import {isVoterRaftRole} from '../raft/replica-voter-readiness.js';

const {
  CONTROL_PLANE_PARTITION_IDS,
  CONTROL_PLANE_READINESS_DIMENSION,
  PARTITION_SERVICE_ERROR_MSG,
  PARTITION_SERVICE_LITERAL,
  PARTITION_SERVICE_LOG_MSG,
  PARTITION_SERVICE_STATUS,
  PARTITION_SERVICE_VALUE,
  PRESSURE_WORK_CLASS,
  SYSTEM_TABLE_NAME,
  isSystemTableWriteReady,
  normalizePublishedRaftRole,
} = PARTITION_SERVICE_SHARED;

class PartitionServiceMetadataDeliveryMethods {
  /**
   * Queue a raft role update for persistence.
   * @param {string} role - New raft role.
   * @private
   */
  queueRoleUpdate(role) {
    this.roleMutationHelper.queue(
      normalizePublishedRaftRole(role, {collapseLeaderToFollower: true}),
    );
  }
  /**
   * Queue a partition leader update for persistence.
   * @param {string} leaderNodeId - Leader node ID.
   * @private
   */
  queueLeaderNodeUpdate(leaderNodeId) {
    this.leaderNodeMutationHelper.queue(leaderNodeId);
  }
  /**
   * Persist the latest pending raft role update.
   * @return {Promise<void>}
   * @private
   */
  async flushRoleUpdate() {
    return this.roleMutationHelper.flush();
  }
  /**
   * Level-triggered durable re-assert of this replica's CURRENT raft role.
   * Called by the replica handler's voter-ready seam right after the CL-035
   * local cache seed: the seed makes the promotion locally visible while the
   * durable write can still be lost (run-27: a dropped/dedup-masked write
   * left the whole cluster reading a raft LEADER as a learner forever). The
   * owner (this service) re-queues from its own state; the helper's
   * authoritative dedup makes the re-queue a no-op when the durable row
   * already converged.
   * @return {boolean} Whether a re-assert was queued.
   */
  reassertDurableRaftRole() {
    if (!isVoterRaftRole(this.role)) {
      return false;
    }
    this.queueRoleUpdate(this.role);
    return true;
  }
  /**
   * Persist the latest pending partition leader update.
   * @return {Promise<void>}
   * @private
   */
  async flushLeaderNodeUpdate() {
    return this.leaderNodeMutationHelper.flush();
  }
  /**
   * Check if the partitions partition leader is available for writes.
   * @return {boolean} True if a leader with an address is known.
   * @private
   */
  isPartitionsLeaderAvailable() {
    if (
      isSystemTableWriteReady(
        this.systemTableCache,
        SYSTEM_TABLE_NAME.PARTITIONS,
      )
    ) {
      return true;
    }
    return (
      this.cdcIntegrationService?.canWriteSystemTableLocally?.(
        SYSTEM_TABLE_NAME.PARTITIONS,
      ) === true
    );
  }
  /**
   * Check if the services table is writable through either cache-visible
   * routing metadata or the local services-p1 leader owner.
   * @return {boolean} True if writes can be issued safely.
   * @private
   */
  isServicesLeaderAvailable() {
    if (
      isSystemTableWriteReady(this.systemTableCache, SYSTEM_TABLE_NAME.SERVICES)
    ) {
      return true;
    }
    return (
      this.cdcIntegrationService?.canWriteSystemTableLocally?.(
        SYSTEM_TABLE_NAME.SERVICES,
      ) === true
    );
  }
  getMetadataPublicationDeliveryPriority() {
    return CONTROL_PLANE_PARTITION_IDS.has(this.partitionId) ?
      PARTITION_SERVICE_LITERAL.CRITICAL :
      PARTITION_SERVICE_LITERAL.BACKGROUND;
  }
  getMetadataPublicationWorkClass() {
    return CONTROL_PLANE_PARTITION_IDS.has(this.partitionId) ?
      PRESSURE_WORK_CLASS.CRITICAL :
      PRESSURE_WORK_CLASS.BACKGROUND;
  }
  shouldMetadataPublicationAllowPressureDefer() {
    return (
      this.getMetadataPublicationWorkClass() !== PRESSURE_WORK_CLASS.CRITICAL
    );
  }
  getMetadataPublicationReadinessDimension() {
    return CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE;
  }
  /**
   * Trigger an immediate rebalance check.
   * Called when a significant cluster event occurs (e.g., node join).
   * @param {string} reason - Reason for the trigger.
   */
  triggerRebalanceCheck(reason) {
    if (this.rebalancer && this.isLeader) {
      this.rebalancer.recordStateChange(reason);
    }
  }
  /**
   * Extract ACK from transport response.
   * Requirements: 6.1, 6.2, 6.3, 6.4
   * @param {Object} result - Transport result (now flat structure).
   * @param {string} requestId - Expected request ID.
   * @return {Object|null} ACK or null if not found.
   * @private
   */
  extractAckFromResponse(result, requestId) {
    if (!result) return null;
    if (result.request_id === requestId) {
      return result;
    }
    if (result.result) {
      throw new Error(PARTITION_SERVICE_ERROR_MSG.NESTED_ACK_UNSUPPORTED);
    }
    return null;
  }
  /**
   * Deliver a message via transport and wait for ACK with timeout.
   * Uses PendingRequestTracker instead of EventEmitter-based ACK handling.
   * Requirements: 3.1, 6.1, 6.2, 6.3, 6.4
   * @param {Object} transport - MessageRouter instance.
   * @param {string} targetAddress - Target address (e.g., 'node-2/lifecycle').
   * @param {Object} message - Message to send.
   * @param {number} timeoutMs - Timeout in milliseconds.
   * @return {Promise<Object>} ACK response or timeout error.
   * @private
   */
  async deliverWithAck(
    transport,
    targetAddress,
    message,
    timeoutMs = PARTITION_SERVICE_VALUE.DEFAULT_TIMEOUT_MS,
  ) {
    const requestId = message.request_id;
    this.logger.debug(PARTITION_SERVICE_LOG_MSG.DELIVERING_WITH_ACK, {
      requestId,
      targetAddress,
      messageType: message.type,
      partitionId: this.partitionId,
    });
    const trackPromise = this.pendingRequestTracker.track(requestId, {
      type: message.type,
      targetAddress,
      timeoutMs,
    });
    let earlyRejection = null;
    const buildTrackerShutdownAck = () => ({
      request_id: requestId,
      status: PARTITION_SERVICE_STATUS.INITIATED,
      message: PARTITION_SERVICE_LOG_MSG.REPLICA_REMOVAL_SELF,
    });
    trackPromise.catch((err) => {
      earlyRejection = err;
    });
    try {
      const result = await transport.deliver(targetAddress, message);
      if (earlyRejection) {
        if (
          earlyRejection.message === PARTITION_SERVICE_LOG_MSG.TRACKER_SHUTDOWN
        ) {
          this.logger.debug(
            PARTITION_SERVICE_LOG_MSG.TRACKER_SHUTDOWN_DELIVERY,
            {requestId, partitionId: this.partitionId},
          );
          return buildTrackerShutdownAck();
        }
        throw earlyRejection;
      }
      if (result && result.acknowledged === false) {
        const errorMsg =
          result.error || PARTITION_SERVICE_ERROR_MSG.DELIVERY_NOT_ACK;
        this.logger.warn(PARTITION_SERVICE_ERROR_MSG.MESSAGE_DELIVERY_FAILED, {
          requestId,
          targetAddress,
          error: errorMsg,
          partitionId: this.partitionId,
        });
        if (this.pendingRequestTracker.hasPending(requestId)) {
          this.pendingRequestTracker.reject(
            requestId,
            new Error(`Delivery failed: ${errorMsg}`),
          );
        }
        throw new Error(`Delivery failed: ${errorMsg}`);
      }
      const ack = this.extractAckFromResponse(result, requestId);
      if (ack) {
        this.pendingRequestTracker.resolve(requestId, ack);
        this.logger.debug(PARTITION_SERVICE_LOG_MSG.RECEIVED_ACK, {
          requestId,
          status: ack.status,
          partitionId: this.partitionId,
        });
        return ack;
      }
      return await trackPromise;
    } catch (error) {
      if (error.message === PARTITION_SERVICE_LOG_MSG.TRACKER_SHUTDOWN) {
        this.logger.debug(PARTITION_SERVICE_LOG_MSG.TRACKER_SHUTDOWN_ACK, {
          requestId,
          partitionId: this.partitionId,
        });
        return buildTrackerShutdownAck();
      }
      if (this.pendingRequestTracker.hasPending(requestId)) {
        this.pendingRequestTracker.reject(requestId, error);
      }
      throw error;
    }
  }
}

function createPartitionServiceMetadataDeliveryMethods() {
  const methods = {};
  const prototypeNames =
    Object.getOwnPropertyNames(PartitionServiceMetadataDeliveryMethods.prototype);
  for (const name of prototypeNames) {
    if (name !== 'constructor') {
      methods[name] = PartitionServiceMetadataDeliveryMethods.prototype[name];
    }
  }
  return methods;
}

export {createPartitionServiceMetadataDeliveryMethods};
