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
  QUERY_ERROR_MSG,
  QUERY_LOG_MSG,
} from '../query-constants.js';
import {
  estimateResultBytes,
  PartitionQueryMetrics,
} from './parallel-query-execution-metrics.js';
import {
  buildPartitionExecutionFailureOutcome,
  buildPartitionExecutionSuccessOutcome,
  normalizePartitionExecutionFailureSnapshot,
} from './parallel-query-partition-outcomes.js';
import {
  createHedgedFanoutState,
  resolveStragglerHedgeThresholdMs,
  resolveWiredHedgeDelivery,
  settleHedgedPartition,
} from './parallel-query-hedging.js';

const REPLICA_STATUS = Object.freeze({
  ACTIVE: 'active',
});

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
      // Cancel any pending speculative executions
      for (const [, controller] of speculativePromises) {
        if (controller && controller.abort) {
          controller.abort();
        }
      }
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
        hedging.primaryExecutionOptions,
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
          hedging.results,
          hedging.pendingPartitions,
          hedging,
        );
      }
    }
  },

  /**
   * Start speculative execution ("hedge") on an alternative replica.
   * In the wired path the hedge re-enters the partitionQueryExecutor with
   * the primary's delivery addresses excluded; in the registry path it
   * targets an alternative active replica service. When no alternative
   * exists, nothing is hedged.
   * Requirements: 26.11
   * @param {string} partitionId - Partition ID.
   * @param {string} sql - SQL query.
   * @param {Array} params - Query parameters.
   * @param {QueryExecutionMetrics} metrics - Metrics tracker.
   * @param {Map} speculativePromises - Map of speculative promises.
   * @param {Map} results - Results map.
   * @param {Set} pendingPartitions - Set of pending partitions.
   * @param {Object} [hedging] - Hedged fan-out state (wired path only).
   * @private
   */
  startSpeculativeExecution(
    partitionId,
    sql,
    params,
    metrics,
    speculativePromises,
    results,
    pendingPartitions,
    hedging = undefined,
  ) {
    const hedgeDelivery = this.resolveHedgeDelivery(partitionId, hedging);
    if (!hedgeDelivery.available) {
      this.logger.debug(QUERY_LOG_MSG.NO_ALTERNATIVE_REPLICAS, {partitionId});
      return;
    }

    this.logger.debug(QUERY_LOG_MSG.SPECULATIVE_EXEC_START, {
      partitionId,
      replicaId: hedgeDelivery.replicaId,
    });

    metrics.speculativeExecutions++;
    if (!metrics.stragglers.includes(partitionId)) {
      metrics.stragglers.push(partitionId);
    }

    const speculativeMetrics = new PartitionQueryMetrics(partitionId);
    speculativeMetrics.isSpeculative = true;
    speculativeMetrics.start();

    const speculativePromise = this.executeQueryOnService(
      hedgeDelivery.service,
      sql,
      params,
      partitionId,
      hedgeDelivery.executionOptions,
    ).then((result) => this.acceptSpeculativeResult({
      partitionId,
      result,
      speculativeMetrics,
      metrics,
      results,
      pendingPartitions,
      hedging,
    })).catch((error) => {
      speculativeMetrics.fail(error);
      this.logger.debug(QUERY_LOG_MSG.SPECULATIVE_EXEC_FAILED, {
        partitionId,
        error: error.message,
      });
      return {success: false, error: error.message, rows: []};
    });

    speculativePromises.set(partitionId, {promise: speculativePromise});
  },

  /**
   * Resolve where a hedge attempt can execute. Wired deployments hedge
   * through the partitionQueryExecutor callback with the primary's
   * delivery targets excluded; registry deployments select an alternative
   * active replica service directly.
   * @param {string} partitionId - Partition ID.
   * @param {Object|undefined} hedging - Hedged fan-out state.
   * @return {Object} Hedge delivery descriptor.
   * @private
   */
  resolveHedgeDelivery(partitionId, hedging) {
    const unavailable = {available: false};
    if (this.partitionQueryExecutor) {
      if (!hedging) {
        return unavailable;
      }
      const wiredDelivery = resolveWiredHedgeDelivery(hedging, partitionId);
      if (!wiredDelivery.available) {
        return unavailable;
      }
      return {
        available: true,
        service: undefined,
        replicaId: undefined,
        executionOptions: wiredDelivery.executionOptions,
      };
    }
    const replicas = this.getAlternativeReplicas(partitionId);
    const alternativeReplica = replicas.find((r) =>
      r.status === REPLICA_STATUS.ACTIVE || r.status === undefined,
    );
    if (!alternativeReplica) {
      return unavailable;
    }
    return {
      available: true,
      service: alternativeReplica,
      replicaId: alternativeReplica.replicaId,
      executionOptions: {},
    };
  },

  /**
   * Accept a completed speculative attempt. A failed hedge can never win
   * the partition; a successful hedge wins only when the primary has not
   * already settled, in which case its metrics and canonical success
   * outcome are recorded. The losing primary's later completion attempts
   * to re-add its own partition metrics; QueryExecutionMetrics'
   * first-completion-wins rule discards that re-add so fan-out totals
   * count each partition exactly once.
   * @param {Object} input - Speculative completion context.
   * @return {Object} The raw speculative result (for promise chaining).
   * @private
   */
  acceptSpeculativeResult({
    partitionId,
    result,
    speculativeMetrics,
    metrics,
    results,
    pendingPartitions,
    hedging,
  }) {
    if (result && result.success === false) {
      speculativeMetrics.fail(
        new Error(result.error || QUERY_ERROR_MSG.QUERY_ROUTING_FAILED),
        result,
      );
      return result;
    }
    speculativeMetrics.complete(
      result.rows?.length || 0,
      estimateResultBytes(result.rows),
    );
    if (results.has(partitionId)) {
      this.logger.debug(QUERY_LOG_MSG.HEDGE_LOSER_RESULT_DISCARDED, {
        partitionId,
      });
      return result;
    }
    metrics.addPartitionMetrics(speculativeMetrics);
    const outcome = buildPartitionExecutionSuccessOutcome(
      partitionId,
      speculativeMetrics,
      result,
    );
    if (hedging) {
      settleHedgedPartition(hedging, partitionId, outcome);
      return result;
    }
    results.set(partitionId, outcome);
    pendingPartitions.delete(partitionId);
    return result;
  },

};

function installParallelQueryCoordinatorHedgingMethods(target) {
  for (const [name, value] of Object.entries(
    parallelQueryCoordinatorHedgingMethods,
  )) {
    Object.defineProperty(target.prototype, name, {
      value,
      configurable: true,
      writable: true,
    });
  }
}

export {installParallelQueryCoordinatorHedgingMethods};
