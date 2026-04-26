import {NUM, TYPEOF} from '../constants/index.js';

export function createPartitionDeliveryAttemptState({
  initialCandidates = [],
  forRead = false,
  preferSameLatencyGroup = false,
  routingSnapshot = null,
  executionOptions = {},
  recoveryCandidateSelectionKey = null,
  getLeaderRecoveryCandidates,
  hasRemainingRecoveryCandidate,
} = {}) {
  const candidateQueue = Array.isArray(initialCandidates) ?
    [...initialCandidates] :
    [];
  const attemptedAddresses = new Set();
  const shadowedRecoveryNodeIds = new Set();
  let retryCurrentAddressOnNextAttempt = false;
  let deferPartitionRetryOnNextAttempt = false;
  let leaderRecoveryQueued = false;

  return {
    candidateQueue,
    getAttemptedAddresses() {
      return attemptedAddresses;
    },
    getShadowedNodeIds() {
      return shadowedRecoveryNodeIds;
    },
    markAttemptedAddress(address) {
      attemptedAddresses.add(address);
    },
    shadowRecoveryNodeId(nodeId) {
      if (typeof nodeId !== TYPEOF.STRING || nodeId.length === NUM.ZERO) {
        return;
      }
      shadowedRecoveryNodeIds.add(nodeId);
    },
    insertRecoveryCandidates(currentCandidateIndex, recoveryCandidates) {
      if (!Array.isArray(recoveryCandidates) || recoveryCandidates.length === NUM.ZERO) {
        return false;
      }
      leaderRecoveryQueued = true;
      candidateQueue.splice(
        currentCandidateIndex + NUM.ONE,
        NUM.ZERO,
        ...recoveryCandidates,
      );
      return true;
    },
    queueLeaderRecoveryCandidates(currentCandidateIndex) {
      if (forRead || leaderRecoveryQueued) {
        return false;
      }
      const recoveryCandidates = getLeaderRecoveryCandidates(
        routingSnapshot,
        attemptedAddresses,
        preferSameLatencyGroup,
        {
          recoveryCandidateSelectionKey,
          sessionId: executionOptions.sessionId,
          shadowedNodeIds: shadowedRecoveryNodeIds,
        },
      );
      return this.insertRecoveryCandidates(
        currentCandidateIndex,
        recoveryCandidates,
      );
    },
    requestRetryCurrentAddress() {
      retryCurrentAddressOnNextAttempt = true;
    },
    shouldRetryCurrentAddress() {
      return retryCurrentAddressOnNextAttempt;
    },
    requestDeferredPartitionRetry() {
      deferPartitionRetryOnNextAttempt = true;
    },
    shouldDeferPartitionRetry() {
      return deferPartitionRetryOnNextAttempt;
    },
    buildRetryDecisionExecutionOptions(currentCandidateIndex, currentAddress) {
      return {
        ...executionOptions,
        alternateRecoveryCandidateAvailable: hasRemainingRecoveryCandidate(
          candidateQueue,
          currentCandidateIndex,
          attemptedAddresses,
          currentAddress,
        ),
      };
    },
  };
}
