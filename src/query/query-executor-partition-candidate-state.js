import {QUERY_EXECUTOR_SHARED} from './query-executor-shared.js';

const {
  NUM,
  QUERY_EXECUTOR_LITERAL,
  QUERY_LOG_MSG,
  QUERY_ROUTING_REPAIR_REASON,
} = QUERY_EXECUTOR_SHARED;

function createPartitionCandidateDeliveryState({
  allowReadinessAuthoritativeRefresh,
  candidateQueue,
  executionOptions = {},
  executor,
  forRead,
  partitionId,
  preferLeader,
  preferSameLatencyGroup,
  routingReadinessDimension,
  routingSnapshot,
  runtimeRoutingRepairState,
}) {
  const attemptedAddresses = new Set();
  let leaderRecoveryQueued = false;
  let retryCurrentAddressOnNextAttempt = false;
  let deferPartitionRetryOnNextAttempt = false;

  const getRecoveryCandidateSelectionOptions = () => ({
    recoveryCandidateSelectionKey:
      executionOptions.recoveryCandidateSelectionKey,
  });
  const refreshRoutingSnapshot = () => {
    const refreshedResolution = executor.resolvePartitionServiceCandidates(
      partitionId,
      forRead,
      preferLeader,
      preferSameLatencyGroup,
      routingReadinessDimension,
      {
        allowReadinessAuthoritativeRefresh,
        recoveryCandidateSelectionKey:
          executionOptions.recoveryCandidateSelectionKey,
      },
    );
    routingSnapshot = refreshedResolution.routingSnapshot;
    return routingSnapshot;
  };

  return {
    attemptedAddresses,
    candidateQueue,
    getRoutingSnapshot() {
      return routingSnapshot;
    },
    shouldSkipCandidateDelivery(serviceInfo, address) {
      if (
        typeof address !== QUERY_EXECUTOR_LITERAL.STRING_STRING ||
        address.length === NUM.ZERO ||
        attemptedAddresses.has(address)
      ) {
        return true;
      }
      const witnessedService = executor.findRoutingSnapshotService(
        routingSnapshot,
        serviceInfo,
        address,
      );
      return executor.isTemporarilyUnroutableAddress(
        partitionId,
        address,
        witnessedService,
      );
    },
    markAttemptedAddress(address) {
      attemptedAddresses.add(address);
    },
    queueLeaderRecoveryCandidates(
      currentCandidateIndex = null,
      participantNodeId = null,
    ) {
      if (leaderRecoveryQueued) {
        return;
      }
      const recoveryCandidates = executor.getLeaderRecoveryCandidates(
        routingSnapshot,
        attemptedAddresses,
        preferSameLatencyGroup,
        getRecoveryCandidateSelectionOptions(),
      );
      if (recoveryCandidates.length === NUM.ZERO) {
        return;
      }
      leaderRecoveryQueued = true;
      const recoveryRoutingContract =
        executor.resolveCanonicalLeaderGapRecoveryRoutingContract(
          partitionId,
          routingSnapshot,
          routingReadinessDimension,
          allowReadinessAuthoritativeRefresh,
        );
      const shouldDeprioritizeSameNodeCandidates =
        recoveryRoutingContract.preferDifferentNodeAfterRuntimeWitness ===
          true &&
        typeof participantNodeId === QUERY_EXECUTOR_LITERAL.STRING_STRING &&
        participantNodeId.length > NUM.ZERO &&
        Number.isInteger(currentCandidateIndex) &&
        currentCandidateIndex >= NUM.ZERO;
      if (!shouldDeprioritizeSameNodeCandidates) {
        candidateQueue.push(...recoveryCandidates);
        return;
      }
      const nextCandidateIndex = currentCandidateIndex + NUM.ONE;
      const retainedTailCandidates = candidateQueue
        .slice(nextCandidateIndex)
        .filter((candidate) => candidate?.nodeId !== participantNodeId);
      candidateQueue.splice(
        nextCandidateIndex,
        candidateQueue.length - nextCandidateIndex,
        ...recoveryCandidates,
        ...retainedTailCandidates,
      );
    },
    requestRetryCurrentAddress() {
      retryCurrentAddressOnNextAttempt = true;
    },
    requestDeferredPartitionRetry() {
      deferPartitionRetryOnNextAttempt = true;
    },
    shouldRetryCurrentAddress() {
      return retryCurrentAddressOnNextAttempt;
    },
    shouldDeferPartitionRetry() {
      return deferPartitionRetryOnNextAttempt;
    },
    async handleNoHandlerCandidate(serviceInfo, address) {
      const witnessedService = executor.findRoutingSnapshotService(
        routingSnapshot,
        serviceInfo,
        address,
      );
      executor.logger.warn(QUERY_LOG_MSG.NO_HANDLER_FOR_PARTITION, {
        partitionId,
        address,
      });
      executor.markTemporarilyUnroutableAddress(
        partitionId,
        address,
        witnessedService,
      );
      if (
        executor.getSessionPartitionAddress(
          executionOptions.sessionId,
          partitionId,
        ) === address
      ) {
        executor.clearSessionPartitionAddress(
          executionOptions.sessionId,
          partitionId,
        );
      }
      if (
        runtimeRoutingRepairState.awaited !== true &&
        (await executor.maybeAwaitRuntimeRoutingRepair(routingSnapshot, {
          partitionId,
          participantNodeId: serviceInfo?.nodeId || null,
          routingReadinessDimension,
          allowReadinessAuthoritativeRefresh,
          refreshReason: QUERY_ROUTING_REPAIR_REASON.NO_HANDLER_STALE_SERVICE,
        }))
      ) {
        runtimeRoutingRepairState.awaited = true;
        refreshRoutingSnapshot();
        const refreshedRecoveryCandidates = executor.getLeaderRecoveryCandidates(
          routingSnapshot,
          attemptedAddresses,
          preferSameLatencyGroup,
          getRecoveryCandidateSelectionOptions(),
        );
        if (refreshedRecoveryCandidates.length > NUM.ZERO) {
          candidateQueue.push(...refreshedRecoveryCandidates);
        }
      }
    },
  };
}

export {createPartitionCandidateDeliveryState};
