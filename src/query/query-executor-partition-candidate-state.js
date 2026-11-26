import {QUERY_EXECUTOR_SHARED} from './query-executor-shared.js';
import {resolvePartitionRetryDelayMs} from './query-execution-budget.js';
import {
  TRANSPORT_DELIVERY_OUTCOME_REASON_CODE,
  deliveryTransportOf,
} from '../transport/transport-semantic-outcome.js';

const {
  QUERY_EXECUTOR_LITERAL,
  QUERY_EXECUTOR_ROUTING_OPTION_FIELD,
  QUERY_LOG_MSG,
  QUERY_ROUTING_REPAIR_REASON,
} = QUERY_EXECUTOR_SHARED;

function createPartitionCandidateEligibility(executor, partitionId, executionOptions) {
  // Straggler-hedge attempts must land on a different replica from their primary.
  const addresses = executionOptions.excludeDeliveryAddresses;
  const excluded = new Set(Array.isArray(addresses) ? addresses : []);
  function allowsAddress(address) {
    return typeof address === QUERY_EXECUTOR_LITERAL.STRING_STRING &&
      address.length > 0 && !excluded.has(address);
  }
  function accepts(serviceInfo, address, snapshot) {
    if (!allowsAddress(address)) return false;
    const row = executor.findRoutingSnapshotService(snapshot, serviceInfo, address);
    return !executor.isTemporarilyUnroutableAddress(partitionId, address, row);
  }
  function prioritize(resolution, requireCanonicalLeader) {
    if (requireCanonicalLeader) return resolution;
    const candidates = executor.prioritizeSessionPartitionAddress(
      resolution.candidates, resolution.routingSnapshot, executionOptions.sessionId, partitionId);
    return {...resolution, candidates};
  }
  function resolve(resolution, inspectEligible, requireCanonicalLeader) {
    if (!inspectEligible) return resolution;
    // A pin can nominate a route from the snapshot as well as reorder one.
    // Evaluate eligibility after that last nomination, before any use of the set.
    const {candidates, routingSnapshot} = prioritize(resolution, requireCanonicalLeader);
    const seen = new Set();
    const eligible = candidates.filter((candidate) => {
      const {address} = candidate;
      if (seen.has(address) || !accepts(candidate, address, routingSnapshot)) return false;
      seen.add(address);
      return true;
    });
    return {
      ...resolution, candidates: eligible, ownerHadCandidates: resolution.candidates.length > 0,
    };
  }
  function redirectCandidate(address, {routingSnapshot}) {
    const row = routingSnapshot.routableServices.find((entry) => entry.address === address);
    if (!row) return null;
    const candidate = {address, nodeId: row.node_id, replicaId: row.service_id || row.replica_id};
    return accepts(candidate, address, routingSnapshot) ? candidate : null;
  }
  return {accepts, prioritize, resolve, redirectCandidate};
}

function createPartitionCandidateDeliveryState({
  allowReadinessAuthoritativeRefresh,
  candidateQueue,
  candidateEligibility,
  inspectEligibleCandidates,
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
        [QUERY_EXECUTOR_ROUTING_OPTION_FIELD.POST_ADMISSION_SETTLEMENT]:
          executionOptions?.postAdmissionSettlement === true,
        [QUERY_EXECUTOR_ROUTING_OPTION_FIELD.READ_AUTHORITY]:
          executionOptions?.readAuthority || null,
        recoveryCandidateSelectionKey:
          executionOptions.recoveryCandidateSelectionKey,
        transactionIdentity: executionOptions?.transactionIdentity || null,
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
      return attemptedAddresses.has(address) ||
        (!inspectEligibleCandidates && !candidateEligibility.accepts(
          serviceInfo, address, routingSnapshot));
    },
    markAttemptedAddress(address) {
      attemptedAddresses.add(address);
    },
    queueLeaderRecoveryCandidates(
      currentCandidateIndex = null,
      participantNodeId = null,
    ) {
      if (inspectEligibleCandidates || leaderRecoveryQueued) {
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
        if (inspectEligibleCandidates) return; // The next inspection reads the owner again.
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
    async handleRedirectTransportNoHandler(
      delivery,
      serviceInfo,
      address,
      candidateIndex,
    ) {
      if (
        deliveryTransportOf(delivery).reasonCode !==
        TRANSPORT_DELIVERY_OUTCOME_REASON_CODE.NO_HANDLER
      ) {
        return false;
      }
      await this.handleNoHandlerCandidate(serviceInfo, address);
      this.queueLeaderRecoveryCandidates(
        candidateIndex,
        serviceInfo?.nodeId || null,
      );
      return true;
    },
  };
}

/**
 * Report one delivery attempt to a straggler-hedging observer when the
 * caller supplied one, so a speculative retry can be forced onto a
 * different replica than the primary attempt targeted.
 * @param {Object} executionOptions - Execution options.
 * @param {string} partitionId - Partition ID.
 * @param {Object} serviceInfo - Candidate service info.
 * @param {string} address - Delivery address.
 * @param {number} candidateCount - Distinct routable candidates seen.
 * @private
 */
function notifyHedgeDeliveryObserver(
  executionOptions,
  partitionId,
  serviceInfo,
  address,
  candidateCount,
) {
  const observer = executionOptions?.hedgeDeliveryObserver;
  if (typeof observer !== QUERY_EXECUTOR_LITERAL.STRING_FUNCTION) {
    return;
  }
  observer({
    partitionId,
    address,
    nodeId: serviceInfo?.nodeId,
    candidateCount,
  });
}

function isTargetDeferralRequested(details) {
  return Boolean(
    details &&
    (details.backpressured === true ||
      details.deferRetry === true ||
      (Number.isFinite(details.retryAfterMs) && details.retryAfterMs > 0)),
  );
}

function createPartitionTargetRetryTracker({
  now,
  defaultRetryDelayMs,
  waitForRetryBudget,
}) {
  const deferrals = new Map();

  function getRemainingDelayMs(address) {
    if (typeof address !== QUERY_EXECUTOR_LITERAL.STRING_STRING ||
        !deferrals.has(address)) {
      return 0;
    }
    const entry = deferrals.get(address);
    const elapsedWallMs = Math.max(0, now() - entry.recordedAtMs);
    const remainingMs = entry.remainingMs - elapsedWallMs;
    if (remainingMs <= 0) {
      deferrals.delete(address);
      return 0;
    }
    return remainingMs;
  }

  function creditElapsedWaitMs(waitedMs) {
    const nowMs = now();
    const numericWaited = Number.isFinite(waitedMs) && waitedMs > 0 ?
      Math.floor(waitedMs) : 0;
    for (const [address, entry] of deferrals) {
      const elapsedWallMs = Math.max(0, nowMs - entry.recordedAtMs);
      const creditedMs = Math.max(elapsedWallMs, numericWaited);
      const nextRemainingMs = entry.remainingMs - creditedMs;
      if (nextRemainingMs <= 0) {
        deferrals.delete(address);
      } else {
        deferrals.set(address, {
          remainingMs: nextRemainingMs,
          recordedAtMs: nowMs,
        });
      }
    }
  }

  function recordTargetFailure(address, details) {
    if (typeof address !== QUERY_EXECUTOR_LITERAL.STRING_STRING ||
        address.length === 0 ||
        !isTargetDeferralRequested(details)) {
      return;
    }
    const delayMs = resolvePartitionRetryDelayMs(defaultRetryDelayMs, details);
    if (!Number.isFinite(delayMs) || delayMs <= 0) return;
    const currentRemaining = getRemainingDelayMs(address);
    deferrals.set(address, {
      remainingMs: Math.max(currentRemaining, Math.floor(delayMs)),
      recordedAtMs: now(),
    });
  }

  function getMaxRemainingDelayMs() {
    let maxDelayMs = 0;
    for (const address of [...deferrals.keys()]) {
      maxDelayMs = Math.max(maxDelayMs, getRemainingDelayMs(address));
    }
    return maxDelayMs;
  }

  async function awaitTargetReady(address) {
    const remainingMs = getRemainingDelayMs(address);
    if (remainingMs <= 0) return true;
    const ok = await waitForRetryBudget(remainingMs);
    creditElapsedWaitMs(remainingMs);
    if (ok) deferrals.delete(address);
    return ok;
  }

  function hasImmediateCandidateAfter(candidateQueue, candidateIndex, attemptedAddresses) {
    if (!Array.isArray(candidateQueue)) return false;
    for (let index = candidateIndex + 1; index < candidateQueue.length; index += 1) {
      const address = candidateQueue[index]?.address;
      if (typeof address === QUERY_EXECUTOR_LITERAL.STRING_STRING &&
          address.length > 0 &&
          !attemptedAddresses.has(address) &&
          getRemainingDelayMs(address) <= 0) {
        return true;
      }
    }
    return false;
  }

  function mergeFailureRetryDetails(previousDetails, nextDetails) {
    if (!nextDetails || isTargetDeferralRequested(nextDetails)) {
      return nextDetails;
    }
    const activeMaxDelayMs = getMaxRemainingDelayMs();
    if (activeMaxDelayMs <= 0) return nextDetails;
    return {
      ...nextDetails,
      retryAfterMs: activeMaxDelayMs,
      ...(previousDetails?.deferRetry === true ? {deferRetry: true} : {}),
      ...(previousDetails?.backpressured === true ? {backpressured: true} : {}),
    };
  }

  return Object.freeze({
    awaitTargetReady,
    clearTarget: (address) => deferrals.delete(address),
    creditElapsedWaitMs,
    getMaxRemainingDelayMs,
    getRemainingDelayMs,
    hasImmediateCandidateAfter,
    mergeFailureRetryDetails,
    recordTargetFailure,
  });
}

export {
  createPartitionCandidateDeliveryState,
  createPartitionCandidateEligibility,
  createPartitionTargetRetryTracker,
  notifyHedgeDeliveryObserver,
};
