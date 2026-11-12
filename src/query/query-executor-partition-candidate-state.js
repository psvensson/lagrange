import {QUERY_EXECUTOR_SHARED} from './query-executor-shared.js';
import {TRANSPORT_DELIVERY_OUTCOME_REASON_CODE} from
  '../transport/transport-semantic-outcome.js';

const {
  QUERY_EXECUTOR_LITERAL,
  QUERY_EXECUTOR_ROUTING_OPTION_FIELD,
  QUERY_LOG_MSG,
  QUERY_ROUTING_REPAIR_REASON,
} = QUERY_EXECUTOR_SHARED;

// The transport owner's outcomes that say the candidate's NODE was not
// reached: there is no connection to it, the connection closed, it could not
// be opened in time, or the wait for its router's ACK ended with no ACK (the
// transport owner names that reason; it is never re-derived here from a
// timeout). Every other undelivered outcome is about the one replica or the
// one delivery - the handler failed, the delivery was deferred, the
// acknowledged request was not answered in time (answer_timeout: the node's
// router accepted it), or the lifetime was spent with no fact about the ACK
// (unestablished_timeout: nothing accuses the node) - and leaves the node's
// other replicas eligible.
const NODE_UNREACHABLE_TRANSPORT_REASON_CODES = Object.freeze([
  TRANSPORT_DELIVERY_OUTCOME_REASON_CODE.ACK_TIMEOUT,
  TRANSPORT_DELIVERY_OUTCOME_REASON_CODE.NO_CONNECTION,
  TRANSPORT_DELIVERY_OUTCOME_REASON_CODE.CONNECTION_CLOSED,
  TRANSPORT_DELIVERY_OUTCOME_REASON_CODE.WEBSOCKET_CONNECT_TIMEOUT,
]);

/**
 * The node a delivery candidate lives on: the one identity both the
 * per-node read budget split and the unreachable-node skip decide on.
 * @param {Object} candidate - A delivery candidate.
 * @return {string|null} The node key, or null when the candidate names none.
 */
function resolveCandidateNodeKey(candidate) {
  if (
    typeof candidate?.nodeId === QUERY_EXECUTOR_LITERAL.STRING_STRING &&
    candidate.nodeId.length > 0
  ) {
    return candidate.nodeId;
  }
  if (
    typeof candidate?.node_id === QUERY_EXECUTOR_LITERAL.STRING_STRING &&
    candidate.node_id.length > 0
  ) {
    return candidate.node_id;
  }
  const address = candidate?.address;
  if (
    typeof address !== QUERY_EXECUTOR_LITERAL.STRING_STRING ||
    address.length === 0
  ) {
    return null;
  }
  const slashIndex = address.indexOf('/');
  return slashIndex > 0 ? address.slice(0, slashIndex) : address;
}

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
  const transportUnreachableNodeKeys = new Set();
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
        excludedDeliveryAddresses.has(address) ||
        (forRead &&
          transportUnreachableNodeKeys.has(resolveCandidateNodeKey(serviceInfo)))
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
    // A read candidate's delivery ended with this transport outcome (the
    // transport owner's, never re-derived here): when it says the remote
    // node was not reached, the node's remaining replicas are skipped for
    // this execution.
    observeCandidateTransportOutcome(serviceInfo, transportOutcome) {
      const nodeKey = resolveCandidateNodeKey(serviceInfo);
      if (
        nodeKey !== null &&
        nodeKey !== executor.nodeId &&
        NODE_UNREACHABLE_TRANSPORT_REASON_CODES.includes(
          transportOutcome?.reasonCode)
      ) {
        transportUnreachableNodeKeys.add(nodeKey);
      }
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

export {createPartitionCandidateDeliveryState, resolveCandidateNodeKey};
