import {QUERY_EXECUTOR_SHARED} from './query-executor-shared.js';

const {
  QUERY_EXECUTOR_LITERAL,
  QUERY_EXECUTOR_ROUTING_OPTION_FIELD,
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
  // Straggler-hedge attempts exclude the delivery addresses the primary
  // attempt already targeted so the hedge lands on a different replica.
  const excludedDeliveryAddresses = new Set(
    Array.isArray(executionOptions.excludeDeliveryAddresses) ?
      executionOptions.excludeDeliveryAddresses :
      [],
  );
  let leaderRecoveryQueued = false;
  let retryCurrentAddressOnNextAttempt = false;
  let deferPartitionRetryOnNextAttempt = false;

  const getRecoveryCandidateSelectionOptions = () => ({
    [QUERY_EXECUTOR_ROUTING_OPTION_FIELD.READ_AUTHORITY]:
      executionOptions?.readAuthority || null,
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
        [QUERY_EXECUTOR_ROUTING_OPTION_FIELD.READ_AUTHORITY]:
          executionOptions?.readAuthority || null,
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
        address.length === 0 ||
        attemptedAddresses.has(address) ||
        excludedDeliveryAddresses.has(address)
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
      if (recoveryCandidates.length === 0) {
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
        participantNodeId.length > 0 &&
        Number.isInteger(currentCandidateIndex) &&
        currentCandidateIndex >= 0;
      if (!shouldDeprioritizeSameNodeCandidates) {
        candidateQueue.push(...recoveryCandidates);
        return;
      }
      const nextCandidateIndex = currentCandidateIndex + 1;
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
        if (refreshedRecoveryCandidates.length > 0) {
          candidateQueue.push(...refreshedRecoveryCandidates);
        }
      }
    },
  };
}

export {createPartitionCandidateDeliveryState};
