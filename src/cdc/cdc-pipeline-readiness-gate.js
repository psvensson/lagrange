/**
 * CDC Pipeline Readiness Gate — composite readiness evaluator for the
 * CDC pipeline.
 *
 * Evaluates three conditions before declaring the pipeline ready:
 *   1. Subscriptions active on all CDC-propagated tables
 *   2. Propagation message group has an elected leader
 *   3. Pipeline has delivered at least one event to SystemTableCache
 *
 * The gate is a stateless evaluator — it reads from existing state
 * (partition subscriber counts, message group leader status, cache
 * change notifications). It does not maintain its own state or cache.
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4
 *
 * @module cdc/cdc-pipeline-readiness-gate
 */

import {LoggingService} from '../logging/logging-service.js';
import {NUM, TYPEOF} from '../constants/index.js';
import {
  CDC_LIFECYCLE_LOG_MSG,
  CDC_PIPELINE_READINESS_CONDITION,
  CDC_PIPELINE_READINESS_POLL_INTERVAL_MS,
  CDC_PIPELINE_READINESS_TIMEOUT_MS,
} from '../constants/cdc-lifecycle-constants.js';

const GATE_SUBSYSTEM = 'cdc-pipeline-readiness';

/**
 * CDCPipelineReadinessGate evaluates whether the CDC pipeline is fully
 * wired and capable of propagating events from partition leaders to the
 * SystemTableCache.
 */
class CDCPipelineReadinessGate {
  /**
   * @param {Object} options
   * @param {Object} options.systemTableCache — SystemTableCache instance
   * @param {string[]} options.cdcPropagatedTables — from CDC_PROPAGATED_TABLES
   */
  constructor(options = {}) {
    this.systemTableCache = options.systemTableCache;
    this.cdcPropagatedTables = options.cdcPropagatedTables || [];
    this._pipelineProven = false;

    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem(GATE_SUBSYSTEM) : console;

    // If the cache already has data for any CDC-propagated table, the
    // pipeline is already proven (cache was hydrated before the gate
    // was created — seed bootstrap or join-time snapshot hydration).
    if (this.systemTableCache && this._cacheAlreadyHydrated()) {
      this._pipelineProven = true;
    }

    // One-shot listener: once the cache receives any change, the
    // pipeline is proven to work end-to-end.
    this._cacheListener = () => {
      this._pipelineProven = true;
      if (this.systemTableCache) {
        this.systemTableCache.offCacheChange(this._cacheListener);
      }
    };

    if (this.systemTableCache && !this._pipelineProven) {
      this.systemTableCache.onCacheChange(this._cacheListener);
    }
  }

  /**
   * Evaluate pipeline readiness.
   *
   * @param {Object} context
   * @param {Map} context.partitionServices — partition replicas
   * @param {Map} context.messageGroupServices — message group replicas
   * @param {boolean} [context.requirePropagationLeader=true] - When false,
   * propagation-leader status is treated as non-blocking.
   * @return {{ready: boolean, unmetConditions: string[]}}
   */
  evaluate(context) {
    const requirePropagationLeader =
      context?.requirePropagationLeader !== false;
    const unmetConditions = [];

    if (!this._checkSubscriptionsActive(context)) {
      unmetConditions.push(
        CDC_PIPELINE_READINESS_CONDITION.SUBSCRIPTIONS_ACTIVE,
      );
    }

    if (requirePropagationLeader && !this._checkPropagationLeader(context)) {
      unmetConditions.push(
        CDC_PIPELINE_READINESS_CONDITION.PROPAGATION_LEADER,
      );
    }

    if (!this._pipelineProven) {
      unmetConditions.push(
        CDC_PIPELINE_READINESS_CONDITION.PIPELINE_PROVEN,
      );
    }

    const ready = unmetConditions.length === NUM.ZERO;
    return {ready, unmetConditions};
  }

  /**
   * Wait for pipeline readiness with timeout.
   *
   * Polls evaluate() at pollIntervalMs intervals using setTimeout-based
   * polling to avoid timer leaks. Rejects on timeout with unmet
   * conditions in the error.
   *
   * @param {Object} context
   * @param {number} [timeoutMs]
   * @param {number} [pollIntervalMs]
   * @return {Promise<{ready: boolean, unmetConditions: string[]}>}
   */
  async waitForReady(context, timeoutMs, pollIntervalMs) {
    const timeout = timeoutMs || CDC_PIPELINE_READINESS_TIMEOUT_MS;
    const interval = pollIntervalMs || CDC_PIPELINE_READINESS_POLL_INTERVAL_MS;
    const deadline = Date.now() + timeout;

    return new Promise((resolve, reject) => {
      const poll = () => {
        const result = this.evaluate(context);
        if (result.ready) {
          this.logger.info(CDC_LIFECYCLE_LOG_MSG.PIPELINE_READY);
          resolve(result);
          return;
        }

        if (Date.now() >= deadline) {
          this.logger.warn(
            CDC_LIFECYCLE_LOG_MSG.PIPELINE_READINESS_TIMEOUT,
            {unmetConditions: result.unmetConditions, timeoutMs: timeout},
          );
          const error = new Error(
            `${CDC_LIFECYCLE_LOG_MSG.PIPELINE_READINESS_TIMEOUT}: ` +
            `unmet=[${result.unmetConditions.join(', ')}] ` +
            `timeout=${timeout}ms`,
          );
          error.unmetConditions = result.unmetConditions;
          error.timeoutMs = timeout;
          reject(error);
          return;
        }

        setTimeout(poll, interval);
      };

      poll();
    });
  }

  /**
   * Check that CDC subscriptions are active.
   *
   * On a seed node this verifies every CDC-propagated table has at
   * least one partition replica with a registered CDC subscriber.
   *
   * On a joining node the per-partition check is not applicable
   * because CDC events arrive through message group propagation, not
   * local partition subscribers. In that case the caller sets
   * `context.cdcSubscriptionsActive = true` after its CDC integration
   * service subscriptions are established, which satisfies this check.
   *
   * @param {Object} context
   * @return {boolean}
   * @private
   */
  _checkSubscriptionsActive(context) {
    // Joining-node path: CDC events arrive via message group
    // propagation. The caller signals readiness explicitly.
    if (context.cdcSubscriptionsActive === true) {
      return true;
    }

    // Seed-node path: verify per-partition subscribers.
    const partitionServices = context.partitionServices;
    if (this.cdcPropagatedTables.length === NUM.ZERO) {
      return true;
    }
    if (!partitionServices || partitionServices.size === NUM.ZERO) {
      return false;
    }

    for (const tableName of this.cdcPropagatedTables) {
      let hasSubscriber = false;
      for (const partition of partitionServices.values()) {
        if (partition.tableName === tableName &&
            partition.cdcSubscribers &&
            partition.cdcSubscribers.size > NUM.ZERO) {
          hasSubscriber = true;
          break;
        }
      }
      if (!hasSubscriber) {
        return false;
      }
    }

    return true;
  }

  /**
   * Check that at least one message group service reports as leader.
   *
   * @param {Object} context
   * @return {boolean}
   * @private
   */
  _checkPropagationLeader(context) {
    const messageGroupServices = context.messageGroupServices;
    if (!messageGroupServices || messageGroupServices.size === NUM.ZERO) {
      return false;
    }

    for (const mg of messageGroupServices.values()) {
      if (typeof mg.isLeaderReplica === TYPEOF.FUNCTION &&
          mg.isLeaderReplica()) {
        return true;
      }
      if (typeof mg.getLeaderId === TYPEOF.FUNCTION) {
        const leaderId = mg.getLeaderId();
        if (typeof leaderId === TYPEOF.STRING &&
            leaderId.length > NUM.ZERO) {
          return true;
        }
      }
    }

    return false;
  }
  /**
   * Check whether the cache already contains data for at least one
   * CDC-propagated table. When true, the pipeline is considered
   * proven because data has already reached the cache (via bootstrap
   * hydration or snapshot replay) before the gate was created.
   *
   * @return {boolean}
   * @private
   */
  _cacheAlreadyHydrated() {
    for (const tableName of this.cdcPropagatedTables) {
      try {
        const records = this.systemTableCache.getAll(tableName);
        if (records && records.length > NUM.ZERO) {
          return true;
        }
      } catch (_err) {
        // Table may not exist in cache yet — skip
      }
    }
    return false;
  }
}

export {CDCPipelineReadinessGate};
