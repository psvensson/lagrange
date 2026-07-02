import {PARTITION_SERVICE_SHARED} from './partition-service-shared.js';

const {
  PARTITION_SERVICE_DEFAULT,
  PARTITION_SERVICE_ERROR_MSG,
  PARTITION_SERVICE_EVENT,
  PARTITION_SERVICE_LITERAL,
  PARTITION_SERVICE_LOG_MSG,
  PARTITION_SERVICE_TYPE,
} = PARTITION_SERVICE_SHARED;

class PartitionServiceLifecycleMethods {
  /**
   * Stop all rebalancing activity for this partition.
   * @return {Promise<void>}
   */
  async quiesceRebalancing() {
    if (
      this.rebalancerLeadershipSink &&
      typeof this.rebalancerLeadershipSink.setLeader ===
        PARTITION_SERVICE_TYPE.FUNCTION
    ) {
      this.rebalancerLeadershipSink.setLeader(false);
    }
    if (this.rebalancer) {
      if (
        typeof this.rebalancer.setLeader === PARTITION_SERVICE_TYPE.FUNCTION
      ) {
        this.rebalancer.setLeader(false);
      }
      if (typeof this.rebalancer.shutdown === PARTITION_SERVICE_TYPE.FUNCTION) {
        this.rebalancer.shutdown();
      }
      this.rebalancer = null;
    }
    if (this.rebalanceCoordinator && this.ownsRebalanceCoordinator) {
      try {
        await this.rebalanceCoordinator.shutdown();
      } catch (error) {
        this.logger.warn(
          PARTITION_SERVICE_ERROR_MSG.REBALANCE_COORDINATOR_SHUTDOWN_FAILED,
          {
            partitionId: this.partitionId,
            replicaId: this.replicaId,
            error: error.message,
          },
        );
      }
    }
    this.rebalanceCoordinator = null;
    this.ownsRebalanceCoordinator = false;
  }
  /**
   * Get compact partition runtime statistics for diagnostics attribution.
   * @return {Object}
   */
  getStats() {
    const pendingRequestTrackerStats =
      this.pendingRequestTracker &&
      typeof this.pendingRequestTracker.getStats === PARTITION_SERVICE_TYPE.FUNCTION ?
        this.pendingRequestTracker.getStats() :
        null;
    return {
      partitionId: this.partitionId,
      replicaId: this.replicaId,
      role: this.role,
      isLeader: this.isLeader,
      initialized: this.initialized,
      cdcReplay: {
        bufferedEvents: this.cdcEventBuffer.size(),
        replayBufferGrowthCount: this.cdcReplayBufferGrowthCount,
        replayRetryDepth: this.cdcReplayRetryDepth,
        replayDelayMs: this.cdcBufferReplayDelayMs,
        replayInFlight: this.cdcBufferReplayInFlight,
        subscriberCount: this.cdcSubscribers.size,
      },
      pendingRequestCount: pendingRequestTrackerStats?.pendingCount || 0,
      pendingRequestTracker: pendingRequestTrackerStats,
    };
  }
  /**
   * Shutdown the partition service.
   * @return {Promise<void>}
   */
  async shutdown() {
    this.isShutdown = true;
    this.leaderActivationGate.shutdown();
    this.logger.info(PARTITION_SERVICE_LOG_MSG.SHUTTING_DOWN, {
      partitionId: this.partitionId,
      replicaId: this.replicaId,
    });
    if (this.learnerPromotionTimer) {
      clearTimeout(this.learnerPromotionTimer);
      this.learnerPromotionTimer = null;
    }
    this.peerReconciliationScheduled = false;
    if (
      this.systemTableCache &&
      typeof this.systemTableCache.offCacheChange ===
        PARTITION_SERVICE_TYPE.FUNCTION &&
      this.systemTableCacheChangeListener
    ) {
      this.systemTableCache.offCacheChange(this.systemTableCacheChangeListener);
    }
    if (this.logAdapter) {
      this.logAdapter.close();
    }
    if (this.raft) {
      this.raftProvider.shutdownNode(this.raft);
      this.raft = null;
    }
    this.stopPeriodicSizeUpdates();
    this.stopPreparedStateHoldTimeoutSweep();
    if (
      typeof this.releaseMetadataPublicationReadinessListener ===
      PARTITION_SERVICE_TYPE.FUNCTION
    ) {
      this.releaseMetadataPublicationReadinessListener();
    }
    this.releaseMetadataPublicationReadinessListener = null;
    this._metadataPublicationReadinessState = null;
    this.roleMutationHelper.shutdown();
    this.leaderNodeMutationHelper.shutdown();
    if (this.cdcBufferReplayTimer) {
      clearTimeout(this.cdcBufferReplayTimer);
      this.cdcBufferReplayTimer = null;
    }
    this.cdcBufferReplayInFlight = false;
    if (this.pendingRequestTracker) {
      this.pendingRequestTracker.clear();
    }
    this.clearPendingCommittedWrites(
      PARTITION_SERVICE_LITERAL.PARTITION_SERVICE_SHUTDOWN,
    );
    await this.quiesceRebalancing();
    if (this.pendingCDCEventDeliveries.size > 0) {
      await Promise.allSettled([...this.pendingCDCEventDeliveries]);
      this.pendingCDCEventDeliveries.clear();
    }
    if (this.transport) {
      this.transport.unregister(this.unifiedAddress);
    }
    if (this.db) {
      this.db.close();
      this.db = null;
    }
    this.initialized = false;
    this.cdcSubscribers.clear();
    this.cdcSubscriberWrappers.clear();
    this.cdcSubscriberStates.clear();
    this.cdcSubscriptionEpoch = 0;
    this.cdcEventSequenceNumber = 0;
    this.cdcBufferReplayDelayMs =
      PARTITION_SERVICE_DEFAULT.CDC_BUFFER_REPLAY_INITIAL_DELAY_MS;
    this.cdcReplayBufferGrowthCount = 0;
    this.cdcReplayRetryDepth = 0;
    this.recentlyAppliedEntryKeys.clear();
    this.recentlyAppliedEntryOrder = [];
    this.pendingCDCEventDeliveries.clear();
    this.emit(PARTITION_SERVICE_EVENT.SHUTDOWN, {
      partitionId: this.partitionId,
      replicaId: this.replicaId,
    });
  }
}

function createPartitionServiceLifecycleMethods() {
  const methods = {};
  for (const name of Object.getOwnPropertyNames(PartitionServiceLifecycleMethods.prototype)) {
    if (name !== 'constructor') {
      methods[name] = PartitionServiceLifecycleMethods.prototype[name];
    }
  }
  return methods;
}

export {createPartitionServiceLifecycleMethods};
