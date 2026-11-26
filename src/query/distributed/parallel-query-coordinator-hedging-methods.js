/**
 * Straggler-hedging execution methods for ParallelQueryCoordinator.
 *
 * Installed onto the coordinator prototype (file-size cap keeps them out
 * of `parallel-query-coordinator.js`). A hedged chunk races each
 * partition's primary attempt against an optional speculative retry on an
 * alternative replica: the first authoritative result wins, the losing
 * attempt is discarded with a debug log, and a failed hedge can never win
 * a partition. State/bookkeeping helpers live in
 * `parallel-query-hedging.js`.
 */

import {
  QUERY_LOG_MSG,
} from '../query-constants.js';
import {
  PartitionQueryMetrics,
} from './parallel-query-execution-metrics.js';
import {
  buildPartitionExecutionFailureOutcome,
  normalizePartitionExecutionFailureSnapshot,
} from './parallel-query-partition-outcomes.js';
import {
  createHedgedFanoutState,
  resolveStragglerHedgeThresholdMs,
  resolveWiredHedgeDelivery,
  settleHedgedPartition,
} from './parallel-query-hedging.js';

const parallelQueryCoordinatorHedgingMethods = {
  /**
   * Execute one partition chunk with straggler hedging: each partition's
   * primary attempt races an optional speculative retry on an alternative
   * replica ("hedge"); the first authoritative result wins and the losing
   * attempt's eventual completion is discarded with a debug log.
   * Requirements: 26.10, 26.11
   * @param {string} sql - SQL query.
   * @param {Array} partitionIds - Partition IDs.
   * @param {Array} params - Query parameters.
   * @param {QueryExecutionMetrics} metrics - Metrics tracker.
   * @param {Promise} timeoutPromise - Timeout promise.
   * @param {Promise|null} cancellationPromise - Cancellation promise.
   * @param {Object} options - Chunk execution options.
   * @return {Promise<Array>} Array of partition results.
   * @private
   */
  async executeWithSpeculativeExecution(
    sql,
    partitionIds,
    params,
    metrics,
    timeoutPromise,
    cancellationPromise,
    options = {},
  ) {
    const hedging = createHedgedFanoutState(partitionIds, options);
    const speculativePromises = new Map();
    this.launchHedgedPrimaryAttempts(
      sql,
      partitionIds,
      params,
      metrics,
      hedging,
    );

    // Periodically hedge pending partitions past the straggler threshold.
    const stragglerCheckInterval = setInterval(
      () => this.hedgePendingStragglers(
        sql,
        params,
        metrics,
        speculativePromises,
        hedging,
      ),
      this.speculativeExecutionDelayMs,
    );

    try {
      // Wait for every partition's first authoritative result, timeout,
      // or cancellation.
      const racePromises = [
        Promise.all(hedging.settledPromises),
        timeoutPromise,
      ];
      if (cancellationPromise) {
        racePromises.push(cancellationPromise);
      }
      await Promise.race(racePromises);

      // Detect and log stragglers
      this.detectAndLogStragglers(metrics);

      return partitionIds.map((id) => hedging.results.get(id));
    } finally {
      clearInterval(stragglerCheckInterval);
      for (const controller of hedging.controllers.values()) controller.abort();
    }
  },

  /**
   * Launch the primary attempt for every partition in a hedged chunk.
   * Each attempt settles its partition on first arrival; a losing
   * arrival is swallowed with a debug log so it can never surface an
   * unhandled rejection or duplicate a partition result.
   * @param {string} sql - SQL query.
   * @param {Array} partitionIds - Partition IDs.
   * @param {Array} params - Query parameters.
   * @param {QueryExecutionMetrics} metrics - Metrics tracker.
   * @param {Object} hedging - Hedged fan-out state.
   * @private
   */
  launchHedgedPrimaryAttempts(sql, partitionIds, params, metrics, hedging) {
    for (const partitionId of partitionIds) {
      this.executeOnPartitionWithMetrics(
        sql,
        partitionId,
        params,
        metrics,
        {...hedging.primaryExecutionOptions, signal: hedging.signals.get(partitionId)},
      ).then((outcome) => {
        this.settleHedgedAttemptOutcome(hedging, partitionId, outcome);
      }).catch((error) => {
        // executeOnPartitionWithMetrics converts failures into outcomes;
        // a rejection here is unexpected, so record it as a failure
        // outcome instead of letting the rejection go unhandled.
        this.logger.debug(QUERY_LOG_MSG.HEDGE_PRIMARY_ATTEMPT_REJECTED, {
          partitionId,
          error: error.message,
        });
        this.settleHedgedAttemptOutcome(
          hedging,
          partitionId,
          this.buildHedgedRejectionOutcome(partitionId, error),
        );
      });
    }
  },

  /**
   * Settle one hedged partition with an arriving outcome; log and discard
   * when the partition already settled (the losing attempt).
   * @param {Object} hedging - Hedged fan-out state.
   * @param {string} partitionId - Partition ID.
   * @param {Object} outcome - Canonical partition execution outcome.
   * @private
   */
  settleHedgedAttemptOutcome(hedging, partitionId, outcome) {
    if (!settleHedgedPartition(hedging, partitionId, outcome)) {
      this.logger.debug(QUERY_LOG_MSG.HEDGE_LOSER_RESULT_DISCARDED, {
        partitionId,
      });
    }
  },

  /**
   * Build a canonical failure outcome for an unexpected primary-attempt
   * rejection inside a hedged fan-out.
   * @param {string} partitionId - Partition ID.
   * @param {Error} error - Rejection error.
   * @return {Object} Failure outcome.
   * @private
   */
  buildHedgedRejectionOutcome(partitionId, error) {
    const partitionMetrics = new PartitionQueryMetrics(partitionId);
    partitionMetrics.start();
    partitionMetrics.fail(error, error);
    return buildPartitionExecutionFailureOutcome(
      normalizePartitionExecutionFailureSnapshot(
        partitionId,
        partitionMetrics,
        error,
        error.message,
      ),
    );
  },

  /**
   * Hedge every pending partition once the chunk has run past the
   * straggler threshold (median-relative with a named absolute floor).
   * The completed-partition gate keeps the trigger evidence-based:
   * hedging starts only after at least one partition has completed. A
   * sub-millisecond completion has latency 0, so the gate checks
   * completion status rather than median > 0; the named floor supplies
   * the threshold when the median rounds to 0.
   * @param {string} sql - SQL query.
   * @param {Array} params - Query parameters.
   * @param {QueryExecutionMetrics} metrics - Metrics tracker.
   * @param {Map} speculativePromises - Map of speculative promises.
   * @param {Object} hedging - Hedged fan-out state.
   * @private
   */
  hedgePendingStragglers(sql, params, metrics, speculativePromises, hedging) {
    if (hedging.pendingPartitions.size === 0 ||
      !metrics.hasCompletedPartitions()) {
      return;
    }
    const stragglerThreshold = resolveStragglerHedgeThresholdMs(
      metrics.getMedianLatency(),
      this.stragglerThresholdMultiplier,
    );
    const elapsedMs = Date.now() - hedging.launchedAtMs;
    if (elapsedMs < stragglerThreshold) {
      return;
    }
    for (const partitionId of hedging.pendingPartitions) {
      if (!speculativePromises.has(partitionId)) {
        this.startSpeculativeExecution(
          partitionId,
          sql,
          params,
          metrics,
          speculativePromises,
          hedging,
        );
      }
    }
  },

  /**
   * Start speculative execution ("hedge") on an alternative replica.
   * Exclude the primary's observed delivery addresses.
   * Requirements: 26.11
   * @param {string} partitionId - Partition ID.
   * @param {string} sql - SQL query.
   * @param {Array} params - Query parameters.
   * @param {QueryExecutionMetrics} metrics - Metrics tracker.
   * @param {Map} speculativePromises - Map of speculative promises.
   * @param {Object} hedging - Hedged fan-out state.
   * @private
   */
  startSpeculativeExecution(
    partitionId,
    sql,
    params,
    metrics,
    speculativePromises,
    hedging,
  ) {
    const hedgeDelivery = resolveWiredHedgeDelivery(hedging, partitionId);
    if (!hedgeDelivery.available) {
      this.logger.debug(QUERY_LOG_MSG.NO_ALTERNATIVE_REPLICAS, {partitionId});
      return;
    }

    this.logger.debug(QUERY_LOG_MSG.SPECULATIVE_EXEC_START, {
      partitionId,
    });

    metrics.speculativeExecutions++;
    if (!metrics.stragglers.includes(partitionId)) {
      metrics.stragglers.push(partitionId);
    }

    const speculativeMetrics = new PartitionQueryMetrics(partitionId);
    speculativeMetrics.isSpeculative = true;
    speculativeMetrics.start();

    const signal = hedging.signals.get(partitionId);
    const speculativePromise = Promise.resolve().then(() => {
      signal.throwIfAborted();
      return this.partitionQueryExecutor(sql, partitionId, params,
        {...hedgeDelivery.executionOptions, signal});
    }).then((result) => this.acceptSpeculativeResult({
      partitionId,
      result,
      speculativeMetrics,
      metrics,
      hedging,
    })).catch((error) => {
      speculativeMetrics.fail(error);
      this.logger.debug(QUERY_LOG_MSG.SPECULATIVE_EXEC_FAILED, {
        partitionId,
        error: error.message,
      });
      return {success: false, error: error.message, rows: []};
    });

    speculativePromises.set(partitionId, speculativePromise);
  },
};

function installParallelQueryCoordinatorHedgingMethods(target) {
  for (const [name, value] of Object.entries(
    parallelQueryCoordinatorHedgingMethods,
  )) {
    if (Object.hasOwn(target.prototype, name)) {
      throw new Error(
        `Duplicate method "${name}" in ${target.name} hedging composition`,
      );
    }
    Object.defineProperty(target.prototype, name, {
      value,
      configurable: true,
      writable: true,
    });
  }
}

export {
  installParallelQueryCoordinatorHedgingMethods,
  parallelQueryCoordinatorHedgingMethods,
};
