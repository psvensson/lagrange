/**
 * Cluster Readiness Signal — composite readiness evaluator for the
 * rebalancer's first planning cycle.
 *
 * Evaluates three conditions before declaring the cluster ready:
 *   1. CDC pipeline ready (delegates to CDCPipelineReadinessGate)
 *   2. Expected nodes registered with ACTIVE status
 *   3. Cache hydrated for all CDC-propagated tables
 *
 * The signal is a stateless evaluator — it reads from existing state
 * (CDCPipelineReadinessGate, SystemTableCache). It does not maintain
 * its own state or cache.
 *
 * Requirements: 4.2
 *
 * @module rebalancer/cluster-readiness-signal
 */

import {LoggingService} from '../logging/logging-service.js';
import {COLUMN, TABLES} from '../constants/index.js';
import {NODE_STATE} from '../constants/node-state.js';
import {
  CDC_LIFECYCLE_LOG_MSG,
  CLUSTER_READINESS_CONDITION,
} from '../constants/cdc-lifecycle-constants.js';

const SIGNAL_SUBSYSTEM = 'cluster-readiness-signal';

/**
 * ClusterReadinessSignal evaluates whether the cluster has reached a
 * stable state suitable for rebalancer planning.
 */
class ClusterReadinessSignal {
  /**
   * @param {Object} options
   * @param {Object} options.cdcPipelineReadinessGate —
   *   CDCPipelineReadinessGate instance
   * @param {Object} options.systemTableCache — SystemTableCache instance
   * @param {number} options.expectedNodeCount — number of nodes expected
   */
  constructor(options = {}) {
    this.cdcPipelineReadinessGate = options.cdcPipelineReadinessGate;
    this.systemTableCache = options.systemTableCache;
    this.expectedNodeCount = options.expectedNodeCount || 0;

    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem(SIGNAL_SUBSYSTEM) : console;
  }

  /**
   * Evaluate cluster readiness for rebalancer planning.
   *
   * @param {Object} context — same context as CDCPipelineReadinessGate
   * @param {Map} context.partitionServices — partition replicas
   * @param {Map} context.messageGroupServices — message group replicas
   * @return {{ready: boolean, unmetConditions: string[]}}
   */
  evaluate(context) {
    const unmetConditions = [];

    if (!this._checkCdcPipelineReady(context)) {
      unmetConditions.push(CLUSTER_READINESS_CONDITION.CDC_PIPELINE_READY);
    }

    if (!this._checkNodesRegistered()) {
      unmetConditions.push(CLUSTER_READINESS_CONDITION.NODES_REGISTERED);
    }

    if (!this._checkCacheHydrated()) {
      unmetConditions.push(CLUSTER_READINESS_CONDITION.CACHE_HYDRATED);
    }

    const ready = unmetConditions.length === 0;

    if (!ready) {
      this.logger.info(CDC_LIFECYCLE_LOG_MSG.CLUSTER_NOT_READY, {
        unmetConditions,
        expectedNodeCount: this.expectedNodeCount,
      });
    }

    return {ready, unmetConditions};
  }

  /**
   * Delegate to CDCPipelineReadinessGate.
   *
   * @param {Object} context
   * @return {boolean}
   * @private
   */
  _checkCdcPipelineReady(context) {
    if (!this.cdcPipelineReadinessGate) {
      return false;
    }
    const result = this.cdcPipelineReadinessGate.evaluate(context);
    return result.ready;
  }

  /**
   * Check that the SystemTableCache nodes table contains at least
   * expectedNodeCount entries with ACTIVE status.
   *
   * @return {boolean}
   * @private
   */
  _checkNodesRegistered() {
    if (!this.systemTableCache || this.expectedNodeCount <= 0) {
      return this.expectedNodeCount <= 0;
    }

    try {
      const activeNodes = this.systemTableCache.filter(
        TABLES.NODES,
        (node) => node[COLUMN.STATUS] === NODE_STATE.ACTIVE,
      );
      return activeNodes.length >= this.expectedNodeCount;
    } catch (_err) {
      return false;
    }
  }

  /**
   * Core membership tables that always have entries after bootstrap.
   * Used to verify cache hydration without requiring every
   * CDC-propagated table to be non-empty (many are legitimately
   * empty in a fresh cluster).
   * @type {string[]}
   * @private
   */
  static CORE_HYDRATION_TABLES = [
    TABLES.NODES,
    TABLES.PARTITIONS,
    TABLES.SERVICES,
    TABLES.TABLES,
    TABLES.MESSAGE_GROUPS,
    TABLES.CONFIG,
  ];

  /**
   * Check that the SystemTableCache has been hydrated by verifying
   * core membership tables contain data. Many CDC-propagated tables
   * (sql_transactions, debug_sessions, storage_reservations, etc.)
   * are legitimately empty in a fresh cluster, so we only check the
   * tables that always have entries after bootstrap.
   *
   * @return {boolean}
   * @private
   */
  _checkCacheHydrated() {
    if (!this.systemTableCache) {
      return false;
    }

    for (const tableName of ClusterReadinessSignal.CORE_HYDRATION_TABLES) {
      try {
        const records = this.systemTableCache.getAll(tableName);
        if (!records || records.length === 0) {
          return false;
        }
      } catch (_err) {
        return false;
      }
    }

    return true;
  }
}

export {ClusterReadinessSignal};
