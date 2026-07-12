/**
 * Straggler-hedging state for parallel query fan-outs.
 *
 * A hedged fan-out races each partition's primary attempt against an
 * optional speculative retry ("hedge") on an alternative replica. This
 * module owns the first-result-wins bookkeeping: per-partition settlement
 * promises, delivery-target observations recorded by the router side
 * (used to force the hedge onto a different replica), and the straggler
 * trigger threshold.
 *
 * The coordinator (`parallel-query-coordinator.js`) drives the timers and
 * executes the attempts; nothing here schedules work by itself.
 */

import {QUERY_DEFAULTS} from '../query-constants.js';

/**
 * Create the mutable state for one hedged partition chunk.
 * @param {Array<string>} partitionIds - Partitions in the chunk.
 * @param {Object} executionOptions - Chunk execution options; hedge
 *   attempts reuse these (minus the delivery observer) so priority,
 *   readiness dimension, and cancellation propagate.
 * @return {Object} Hedged fan-out state.
 */
function createHedgedFanoutState(partitionIds, executionOptions = {}) {
  const results = new Map();
  const pendingPartitions = new Set(partitionIds);
  const settlementResolvers = new Map();
  const settledPromises = partitionIds.map(
    (partitionId) =>
      new Promise((resolve) => {
        settlementResolvers.set(partitionId, resolve);
      }),
  );
  const deliveryObservations = new Map();
  const state = {
    launchedAtMs: Date.now(),
    results,
    pendingPartitions,
    settlementResolvers,
    settledPromises,
    deliveryObservations,
    hedgeExecutionOptions: executionOptions,
    primaryExecutionOptions: {
      ...executionOptions,
      hedgeDeliveryObserver: (observation) =>
        recordHedgeDeliveryObservation(deliveryObservations, observation),
    },
  };
  return state;
}

/**
 * Record one router-side delivery attempt of a primary partition attempt.
 * @param {Map<string, Object>} deliveryObservations - Observation map.
 * @param {Object} observation - {partitionId, address, nodeId,
 *   candidateCount} for the delivery attempt.
 */
function recordHedgeDeliveryObservation(deliveryObservations, observation) {
  const {partitionId, address, nodeId, candidateCount} = observation;
  const existing = deliveryObservations.get(partitionId);
  if (existing) {
    existing.attemptedAddresses.add(address);
    existing.attemptedNodeIds.add(nodeId);
    existing.candidateCount = Math.max(existing.candidateCount, candidateCount);
    return;
  }
  deliveryObservations.set(partitionId, {
    attemptedAddresses: new Set([address]),
    attemptedNodeIds: new Set([nodeId]),
    candidateCount,
  });
}

/**
 * Resolve whether a hedge can target an alternative replica through the
 * wired partitionQueryExecutor path, and with which execution options.
 * Hedging is declined when the primary's routing snapshot exposed at most
 * one candidate (nothing to hedge to) or when the primary already rotated
 * through every candidate.
 * @param {Object} state - Hedged fan-out state.
 * @param {string} partitionId - Straggling partition.
 * @return {{available: boolean, executionOptions: Object}}
 */
function resolveWiredHedgeDelivery(state, partitionId) {
  const observation = state.deliveryObservations.get(partitionId);
  const declined = {available: false, executionOptions: {}};
  if (!observation) {
    return declined;
  }
  if (observation.candidateCount <= 1 ||
    observation.attemptedAddresses.size >= observation.candidateCount) {
    return declined;
  }
  return {
    available: true,
    executionOptions: {
      ...state.hedgeExecutionOptions,
      excludeDeliveryAddresses: [...observation.attemptedAddresses],
    },
  };
}

/**
 * Resolve the effective straggler-hedge trigger threshold. The relative
 * trigger (median x multiplier) is chunk-relative; the named absolute
 * floor stops sub-floor medians from hedging ordinary jitter.
 * @param {number} medianLatencyMs - Median completed-partition latency.
 * @param {number} stragglerThresholdMultiplier - Configured multiplier.
 * @return {number} Threshold in milliseconds.
 */
function resolveStragglerHedgeThresholdMs(
  medianLatencyMs,
  stragglerThresholdMultiplier,
) {
  return Math.max(
    medianLatencyMs * stragglerThresholdMultiplier,
    QUERY_DEFAULTS.COORDINATOR_HEDGE_MIN_STRAGGLER_THRESHOLD_MS,
  );
}

/**
 * Settle one partition with its first authoritative outcome. Later
 * arrivals (the losing attempt) are reported to the caller as discarded.
 * @param {Object} state - Hedged fan-out state.
 * @param {string} partitionId - Partition to settle.
 * @param {Object} outcome - Canonical partition execution outcome.
 * @return {boolean} True when this outcome won; false when discarded.
 */
function settleHedgedPartition(state, partitionId, outcome) {
  if (state.results.has(partitionId)) {
    return false;
  }
  state.results.set(partitionId, outcome);
  state.pendingPartitions.delete(partitionId);
  state.settlementResolvers.get(partitionId)(outcome);
  return true;
}

export {
  createHedgedFanoutState,
  resolveStragglerHedgeThresholdMs,
  resolveWiredHedgeDelivery,
  settleHedgedPartition,
};
