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

import {EventEmitter} from 'events';
import {LoggingService} from '../logging/logging-service.js';
import {emitInvariant} from '../invariants/invariant-emitter.js';
import {INVARIANT_ID} from '../invariants/invariant-catalog.js';
import {
  CDC_LIFECYCLE_LOG_MSG,
  CDC_PIPELINE_READINESS_CONDITION,
  CDC_PIPELINE_READINESS_GATE,
  CDC_PIPELINE_READINESS_NOW,
  CDC_PIPELINE_READINESS_POLL_INTERVAL_MS,
  CDC_PIPELINE_READINESS_SLEEP,
  CDC_PIPELINE_READINESS_TIMEOUT_MS,
} from '../constants/cdc-lifecycle-constants.js';

function normalizeUnmetConditions(unmetConditions) {
  return Array.isArray(unmetConditions) ?
    [...unmetConditions].sort() :
    [];
}

function buildUnmetSignature(result) {
  return JSON.stringify(normalizeUnmetConditions(result?.unmetConditions));
}

/**
 * CDCPipelineReadinessGate evaluates whether the CDC pipeline is fully
 * wired and capable of propagating events from partition leaders to the
 * SystemTableCache.
 */
class CDCPipelineReadinessGate extends EventEmitter {
  /**
   * @param {Object} options
   * @param {Object} options.systemTableCache — SystemTableCache instance
   * @param {string[]} options.cdcPropagatedTables — from CDC_PROPAGATED_TABLES
   */
  constructor(options = CDC_PIPELINE_READINESS_GATE.DEFAULT_OPTIONS) {
    super();
    this.systemTableCache = options.systemTableCache;
    this.cdcPropagatedTables =
      options.cdcPropagatedTables ||
      CDC_PIPELINE_READINESS_GATE.EMPTY_PROPAGATED_TABLES;
    this._pipelineProven = false;
    this._now = typeof options.now === 'function' ?
      options.now :
      CDC_PIPELINE_READINESS_NOW;
    this._sleep = typeof options.sleep === 'function' ?
      options.sleep :
      CDC_PIPELINE_READINESS_SLEEP;

    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.forSubsystem(
      CDC_PIPELINE_READINESS_GATE.SUBSYSTEM,
    );

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

    const ready = unmetConditions.length === 0;
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
    const startMs = this._now();
    const deadline = startMs + timeout;
    let lastProgressAtMs = startMs;
    let lastSignature = null;

    while (true) {
      const result = this.evaluate(context);
      if (result.ready) {
        emitInvariant(this, {
          invariantId: INVARIANT_ID.CDC_SUBSCRIPTION_PROGRESS_VISIBLE,
          passed: true,
          entityId: CDC_PIPELINE_READINESS_GATE.ENTITY_ID,
          owningSubsystem: CDC_PIPELINE_READINESS_GATE.SUBSYSTEM,
          observed: {
            unmetConditions: [],
          },
        });
        this.logger.info(CDC_LIFECYCLE_LOG_MSG.PIPELINE_READY);
        return result;
      }

      const signature = buildUnmetSignature(result);
      if (signature !== lastSignature) {
        lastSignature = signature;
        lastProgressAtMs = this._now();
      }

      if (this._now() >= deadline) {
        const timeoutKind = lastProgressAtMs === startMs ?
          CDC_PIPELINE_READINESS_GATE.TIMEOUT_KIND.NO_PROGRESS :
          CDC_PIPELINE_READINESS_GATE.TIMEOUT_KIND.
            ABSOLUTE_DEADLINE_EXHAUSTED;
        this.logger.warn(
          CDC_LIFECYCLE_LOG_MSG.PIPELINE_READINESS_TIMEOUT,
          {
            unmetConditions: result.unmetConditions,
            timeoutMs: timeout,
            timeoutKind,
            lastProgressElapsedMs: Math.max(0, lastProgressAtMs - startMs),
          },
        );
        emitInvariant(this, {
          invariantId: INVARIANT_ID.CDC_SUBSCRIPTION_PROGRESS_VISIBLE,
          passed: false,
          entityId: CDC_PIPELINE_READINESS_GATE.ENTITY_ID,
          owningSubsystem: CDC_PIPELINE_READINESS_GATE.SUBSYSTEM,
          observed: {
            unmetConditions: result.unmetConditions,
            timeoutMs: timeout,
            timeoutKind,
            lastProgressElapsedMs: Math.max(0, lastProgressAtMs - startMs),
          },
        });
        const error = new Error(
          `${CDC_LIFECYCLE_LOG_MSG.PIPELINE_READINESS_TIMEOUT}: ` +
          `unmet=[${result.unmetConditions.join(', ')}] ` +
          `timeout=${timeout}ms ` +
          `kind=${timeoutKind}`,
        );
        error.unmetConditions = result.unmetConditions;
        error.timeoutMs = timeout;
        error.timeoutKind = timeoutKind;
        error.lastProgressElapsedMs = Math.max(0, lastProgressAtMs - startMs);
        throw error;
      }

      await this._sleep(interval);
    }
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
    if (this.cdcPropagatedTables.length === 0) {
      return true;
    }
    if (!partitionServices || partitionServices.size === 0) {
      return false;
    }

    for (const tableName of this.cdcPropagatedTables) {
      let hasSubscriber = false;
      for (const partition of partitionServices.values()) {
        if (partition.tableName === tableName &&
            partition.cdcSubscribers &&
            partition.cdcSubscribers.size > 0) {
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
    if (!messageGroupServices || messageGroupServices.size === 0) {
      return false;
    }

    for (const mg of messageGroupServices.values()) {
      if (typeof mg.isLeaderReplica === 'function' &&
          mg.isLeaderReplica()) {
        return true;
      }
      if (typeof mg.getLeaderId === 'function') {
        const leaderId = mg.getLeaderId();
        if (typeof leaderId === 'string' &&
            leaderId.length > 0) {
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
        if (records && records.length > 0) {
          return true;
        }
      } catch (error) {
        this.logger.debug(CDC_LIFECYCLE_LOG_MSG.PIPELINE_CACHE_PROBE_FAILED, {
          tableName,
          error: error.message,
        });
      }
    }
    return false;
  }
}

export {CDCPipelineReadinessGate};
