import {PARTITION_SERVICE_SHARED} from './partition-service-shared.js';
import {
  PARTITION_WRITE_RELEASE_CAUSE,
  buildReleasedPendingWriteAnswer,
} from './partition-write-kernel.js';

const {
  PARTITION_SERVICE_DEFAULT,
  PARTITION_SERVICE_ERROR_MSG,
  PARTITION_SERVICE_EVENT,
  PARTITION_SERVICE_LOG_MSG,
  PARTITION_SERVICE_TYPE,
} = PARTITION_SERVICE_SHARED;

function closePartitionConsensusResources(service) {
  if (service.learnerPromotionTimer) {
    clearTimeout(service.learnerPromotionTimer);
    service.learnerPromotionTimer = null;
  }
  service.peerReconciliationScheduled = false;
  if (service.systemTableCache &&
      typeof service.systemTableCache.offCacheChange ===
        PARTITION_SERVICE_TYPE.FUNCTION &&
      service.systemTableCacheChangeListener) {
    service.systemTableCache.offCacheChange(
      service.systemTableCacheChangeListener);
  }
  if (service.raft) {
    service.raft.close();
    service.raft = null;
  }
}

function clearPartitionLifecycleListeners(service) {
  if (typeof service.releaseMetadataPublicationReadinessListener ===
      PARTITION_SERVICE_TYPE.FUNCTION) {
    service.releaseMetadataPublicationReadinessListener();
  }
  if (service.cdcBufferReplayTimer) {
    clearTimeout(service.cdcBufferReplayTimer);
    service.cdcBufferReplayTimer = null;
  }
  service.cdcBufferReplayInFlight = false;
  if (service.pendingRequestTracker) {
    service.pendingRequestTracker.clear();
  }
}

// The lifecycle owner whose activation effect section guards this replica's
// handler (owner decision N2). Activation refuses a service whose lane is not
// the state machine it activates through, so retirement and activation always
// meet at the same owner.
function resolveReplicaHandlerRetirementLane(service) {
  return service.resolveHandlerRetirementLane?.() ||
    service.replicaStateMachine ||
    null;
}

// Retire this replica's exact transport handler through its lifecycle owner
// (owner decision N2): an activation that confirmed this handler in its lane
// completes its ACTIVE CAS first; a later one finds it gone. A successor's
// handler under the same address is never removed, and there is no by-address
// fallback: registration already required the exact-retirement API.
async function retirePartitionTransportHandler(service) {
  const transport = service.transport;
  const handler = service.transportHandler;
  if (!transport || !handler) return;
  const retire = () => {
    transport.unregisterExact(service.unifiedAddress, handler);
  };
  const lane = resolveReplicaHandlerRetirementLane(service);
  if (typeof lane?.retireReplicaHandler === PARTITION_SERVICE_TYPE.FUNCTION) {
    await lane.retireReplicaHandler(service.replicaId, retire);
    return;
  }
  // No lifecycle lane: activation refused this service (its lane is not the
  // activating state machine), so no effect section can guard this handler.
  retire();
}

function closePartitionPersistenceResources(service) {
  if (service.db) {
    service.db.close();
    service.db = null;
  }
}

class PartitionServiceLifecycleMethods {
  /**
   * The lifecycle owner that retires this replica's transport handler.
   * @return {Object|null}
   */
  resolveReplicaHandlerRetirementLane() {
    return resolveReplicaHandlerRetirementLane(this);
  }
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
    // A tenure claim must not outlive its replica (see
    // clearLocalCanonicalLeaderClaimOnTeardown).
    this.clearLocalCanonicalLeaderClaimOnTeardown?.();
    closePartitionConsensusResources(this);
    this.stopPeriodicSizeUpdates();
    this.stopPreparedStateHoldTimeoutSweep();
    this.roleMutationHelper.shutdown();
    this.leaderNodeMutationHelper.shutdown();
    clearPartitionLifecycleListeners(this);
    this.releaseMetadataPublicationReadinessListener = null;
    this._metadataPublicationReadinessState = null;
    // Every pending write is released with the write kernel's typed answer:
    // one handed to consensus may still commit, so its outcome is not known
    // here; one never handed to it was not proposed.
    this.releasePendingCommittedWrites((pending) =>
      buildReleasedPendingWriteAnswer(pending, this.partitionId,
        {cause: PARTITION_WRITE_RELEASE_CAUSE.SHUTDOWN}));
    await this.quiesceRebalancing();
    if (this.pendingCDCEventDeliveries.size > 0) {
      await Promise.allSettled([...this.pendingCDCEventDeliveries]);
      this.pendingCDCEventDeliveries.clear();
    }
    await retirePartitionTransportHandler(this);
    closePartitionPersistenceResources(this);
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
