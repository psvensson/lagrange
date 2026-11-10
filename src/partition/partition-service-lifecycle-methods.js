import {PARTITION_SERVICE_SHARED} from './partition-service-shared.js';
import {
  PARTITION_WRITE_RELEASE_CAUSE,
  buildReleasedPendingWriteAnswer,
} from './partition-write-kernel.js';
import {
  reportReplicaHandlerRetirement,
  requireReplicaHandlerRetirement,
  retireReplicaTransportHandler,
} from '../node/replica-transport-handler-identity.js';
import {endReplicaLeadershipTenure} from '../raft/replica-leadership-state.js';
import {assertRaftOperationSucceeded} from '../raft/raft-operation-port.js';

const {
  PARTITION_SERVICE_DEFAULT,
  PARTITION_SERVICE_ERROR_MSG,
  PARTITION_SERVICE_EVENT,
  PARTITION_SERVICE_LOG_MSG,
} = PARTITION_SERVICE_SHARED;

async function closePartitionConsensusResources(service) {
  if (service.learnerPromotionTimer) {
    clearTimeout(service.learnerPromotionTimer);
    service.learnerPromotionTimer = null;
  }
  service.peerReconciliationScheduled = false;
  if (service.systemTableCache && service.systemTableCacheChangeListener) {
    service.systemTableCache.offCacheChange(
      service.systemTableCacheChangeListener);
  }
  const port = service.raft;
  if (port) {
    assertRaftOperationSucceeded(await port.close());
    if (service.raft === port) {
      service.raft = null;
    }
  }
}

function clearPartitionLifecycleListeners(service) {
  if (service.releaseMetadataPublicationReadinessListener) {
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

// Retire this replica's exact transport handler through its lifecycle owner
// (owner decision N2); a refused retirement is surfaced, never discarded.
async function retirePartitionTransportHandler(service) {
  const outcome = await retireReplicaTransportHandler({
    transport: service.transport,
    address: service.unifiedAddress,
    handler: service.transportHandler,
    replicaId: service.replicaId,
    lane: service.resolveHandlerRetirementLane?.() ||
      service.replicaStateMachine,
  });
  reportReplicaHandlerRetirement(service.logger, {
    address: service.unifiedAddress,
    replicaId: service.replicaId,
  }, outcome);
  requireReplicaHandlerRetirement(outcome);
}

function closePartitionPersistenceResources(service) {
  if (service.db) {
    service.db.close();
    service.db = null;
  }
}

/**
 * Stop all rebalancing activity for this partition.
 * @return {Promise<void>}
 */
async function quiesceRebalancing(service) {
  if (service.rebalancerLeadershipSink) {
    service.rebalancerLeadershipSink.setLeader(false);
  }
  if (service.rebalancer) {
    service.rebalancer.setLeader(false);
    service.rebalancer.shutdown();
    service.rebalancer = null;
  }
  if (service.rebalanceCoordinator && service.ownsRebalanceCoordinator) {
    try {
      await service.rebalanceCoordinator.shutdown();
    } catch (error) {
      service.logger.warn(
        PARTITION_SERVICE_ERROR_MSG.REBALANCE_COORDINATOR_SHUTDOWN_FAILED,
        {
          partitionId: service.partitionId,
          replicaId: service.replicaId,
          error: error.message,
        },
      );
    }
  }
  service.rebalanceCoordinator = null;
  service.ownsRebalanceCoordinator = false;
}

/**
 * Get compact partition runtime statistics for diagnostics attribution.
 * @return {Object}
 */
function getStats(service) {
  // The constructor's PendingRequestTracker.
  const pendingRequestTrackerStats = service.pendingRequestTracker.getStats();
  return {
    partitionId: service.partitionId,
    replicaId: service.replicaId,
    role: service.role,
    isLeader: service.isLeader,
    initialized: service.initialized,
    cdcReplay: {
      bufferedEvents: service.cdcEventBuffer.size(),
      replayBufferGrowthCount: service.cdcReplayBufferGrowthCount,
      replayRetryDepth: service.cdcReplayRetryDepth,
      replayDelayMs: service.cdcBufferReplayDelayMs,
      replayInFlight: service.cdcBufferReplayInFlight,
      subscriberCount: service.cdcSubscribers.size,
    },
    pendingRequestCount: pendingRequestTrackerStats?.pendingCount || 0,
    pendingRequestTracker: pendingRequestTrackerStats,
  };
}

/**
 * Shutdown the partition service.
 * @return {Promise<void>}
 */
function shutdown(service) {
  if (service.shutdownSettlement) {
    return service.shutdownSettlement;
  }
  service.isShutdown = true;
  service.initialized = false;
  const {promise, resolve, reject} = Promise.withResolvers();
  service.shutdownSettlement = promise;
  const release = async () => {
    service.emit(PARTITION_SERVICE_EVENT.SHUTDOWN_STARTED, {
      partitionId: service.partitionId,
      replicaId: service.replicaId,
    });
    const initialization = service.initializationSettlement;
    if (initialization && service.initializationOwnsCleanup !== true) {
      await Promise.allSettled([initialization]);
    }
    service.initialized = false;
    service.leaderActivationGate.shutdown();
    service.logger.info(PARTITION_SERVICE_LOG_MSG.SHUTTING_DOWN, {
      partitionId: service.partitionId,
      replicaId: service.replicaId,
    });
    // A tenure claim must not outlive its replica (see
    // clearLocalCanonicalLeaderClaimOnTeardown).
    service.clearLocalCanonicalLeaderClaimOnTeardown();
    // No reader continues a closed replica's leadership.
    endReplicaLeadershipTenure(service);
    await closePartitionConsensusResources(service);
    service.stopPeriodicSizeUpdates();
    service.stopPreparedStateHoldTimeoutSweep();
    service.roleMutationHelper.shutdown();
    service.leaderNodeMutationHelper.shutdown();
    clearPartitionLifecycleListeners(service);
    service.clearMetadataPublicationReadinessSlots();
    // Every pending write is released with the write kernel's typed answer:
    // one handed to consensus may still commit, so its outcome is not known
    // here; one never handed to it was not proposed.
    service.releasePendingCommittedWrites((pending) =>
      buildReleasedPendingWriteAnswer(pending, service.partitionId,
        {cause: PARTITION_WRITE_RELEASE_CAUSE.SHUTDOWN}));
    await service.quiesceRebalancing();
    if (service.pendingCDCEventDeliveries.size > 0) {
      await Promise.allSettled([...service.pendingCDCEventDeliveries]);
      service.pendingCDCEventDeliveries.clear();
    }
    await retirePartitionTransportHandler(service);
    closePartitionPersistenceResources(service);
    service.cdcSubscribers.clear();
    service.cdcSubscriberWrappers.clear();
    service.cdcSubscriberStates.clear();
    service.cdcSubscriptionEpoch = 0;
    service.cdcEventSequenceNumber = 0;
    service.cdcBufferReplayDelayMs =
      PARTITION_SERVICE_DEFAULT.CDC_BUFFER_REPLAY_INITIAL_DELAY_MS;
    service.cdcReplayBufferGrowthCount = 0;
    service.cdcReplayRetryDepth = 0;
    service.pendingCDCEventDeliveries.clear();
    service.clearStartupFailure();
    service.emit(PARTITION_SERVICE_EVENT.SHUTDOWN, {
      partitionId: service.partitionId,
      replicaId: service.replicaId,
    });
  };
  release().then(resolve, (error) => {
    if (service.shutdownSettlement === promise) {
      service.shutdownSettlement = null;
    }
    reject(error);
  });
  return promise;
}

export {
  getStats,
  quiesceRebalancing,
  shutdown,
};
