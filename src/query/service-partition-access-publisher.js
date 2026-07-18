/**
 * Publisher for the service↔partition access attribution feed
 * (service↔data affinity placement epic).
 *
 * Periodically drains the node-local ServicePartitionAccessMetrics
 * accumulator and upserts one CDC-propagated `service_partition_access`
 * row per (node, service) through the control-plane system-table
 * gateway, following the node-heartbeat publication pattern: coalesced,
 * REPLACE_PENDING merge, background work class, no cache-wait. Rows
 * carry the DELTA counts of the just-drained window; a failed upsert
 * merges its counts back into the accumulator so they survive to the
 * next flush.
 *
 * Lifecycle: `start()` is idempotent and arms an unref'd interval (a
 * leaked instance can never hold the process open); `stop()` clears it.
 * The SQL engine starts the publisher lazily on the first recorded
 * access and stops it from `shutdown()`.
 */

import {
  SERVICE_PARTITION_ACCESS_COL as SPA_COL,
  TABLES,
} from '../constants/index.js';
import {
  CONTROL_PLANE_MUTATION_MERGE_POLICY,
} from '../control-plane/control-plane-system-table-gateway.js';
import {
  PRESSURE_WORK_CLASS,
} from '../control-plane/pressure-governor.js';

const SERVICE_PARTITION_ACCESS_PUBLISH_INTERVAL_MS = 30000;
const ACCESS_ID_SEPARATOR = ':';
const COALESCING_KEY_PREFIX = 'service-access';
const ACCESS_PUBLISH_LOG_MSG = Object.freeze({
  FLUSH_FAILED: 'service partition access publish failed',
  ROW_PUBLISH_FAILED: 'service partition access row publish failed',
});

class ServicePartitionAccessPublisher {
  /**
   * @param {Object} options
   * @param {string} options.nodeId - Publishing node id.
   * @param {Object} options.metrics - ServicePartitionAccessMetrics.
   * @param {Function} options.getGateway - Returns the control-plane
   *   system-table gateway (resolved lazily so construction order does
   *   not matter).
   * @param {Function} options.getLogger - Returns the engine logger
   *   (resolved lazily; the engine assigns it after construction).
   * @param {number} [options.intervalMs] - Publish cadence.
   * @param {Function} [options.now] - Clock (injectable for tests).
   */
  constructor(options = {}) {
    this.nodeId = options.nodeId;
    this.metrics = options.metrics;
    this.getGateway = options.getGateway;
    this.getLogger = typeof options.getLogger === 'function' ?
      options.getLogger :
      () => null;
    this.intervalMs =
      Number.isFinite(options.intervalMs) && options.intervalMs > 0 ?
        Math.floor(options.intervalMs) :
        SERVICE_PARTITION_ACCESS_PUBLISH_INTERVAL_MS;
    this.now = typeof options.now === 'function' ?
      options.now :
      () => Date.now();
    this.timer = null;
    this.stopped = false;
    this.publishInFlight = false;
    this.windowStartedAtMs = this.now();
  }

  /**
   * Arm the periodic flush. Idempotent; refuses to re-arm after
   * stop() so a statement served during node drain cannot revive a
   * shut-down publisher.
   */
  start() {
    if (this.timer || this.stopped) {
      return;
    }
    this.timer = setInterval(() => {
      this.publishOnce().catch((error) => {
        this.getLogger()?.warn?.(
          ACCESS_PUBLISH_LOG_MSG.FLUSH_FAILED,
          {nodeId: this.nodeId, error: error?.message},
        );
      });
    }, this.intervalMs);
    if (typeof this.timer.unref === 'function') {
      this.timer.unref();
    }
  }

  /**
   * Disarm the periodic flush terminally. Idempotent.
   */
  stop() {
    this.stopped = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Drain the accumulator and upsert one row per service with pending
   * counts. Failed upserts merge their counts back for the next flush.
   * @return {Promise<{published: number, failed: number}>}
   */
  async publishOnce() {
    // Single-flight: a slow gateway must not let the next tick drain a
    // second delta under the same coalescing key (self-supersede would
    // drop the intermediate window).
    if (this.publishInFlight || !this.metrics?.hasData()) {
      return {published: 0, failed: 0};
    }
    const gateway = this.getGateway?.();
    if (!gateway) {
      return {published: 0, failed: 0};
    }
    this.publishInFlight = true;
    try {
      return await this.publishDrainedSnapshot(gateway);
    } finally {
      this.publishInFlight = false;
    }
  }

  /**
   * @param {Object} gateway - Control-plane system-table gateway.
   * @return {Promise<{published: number, failed: number}>}
   * @private
   */
  async publishDrainedSnapshot(gateway) {
    const snapshot = this.metrics.snapshotAndReset();
    const windowStartedAtMs = this.windowStartedAtMs;
    const publishedAtMs = this.now();
    this.windowStartedAtMs = publishedAtMs;
    let published = 0;
    let failed = 0;
    for (const [serviceId, partitionCounts] of Object.entries(snapshot)) {
      const row = {
        [SPA_COL.ACCESS_ID]:
          `${this.nodeId}${ACCESS_ID_SEPARATOR}${serviceId}`,
        [SPA_COL.NODE_ID]: this.nodeId,
        [SPA_COL.SERVICE_ID]: serviceId,
        [SPA_COL.ACCESS_JSON]: JSON.stringify(partitionCounts),
        [SPA_COL.WINDOW_STARTED_AT]: windowStartedAtMs,
        [SPA_COL.PUBLISHED_AT]: publishedAtMs,
      };
      if (await this.publishServiceRow(gateway, serviceId, row)) {
        published += 1;
      } else {
        failed += 1;
        this.metrics.merge({[serviceId]: partitionCounts});
      }
    }
    return {published, failed};
  }

  /**
   * Upsert one service's delta row. Returns false for BOTH failure
   * shapes: a thrown gateway error AND a resolved non-write outcome —
   * the gateway signals readiness-deferred and coalescing-superseded
   * by RESOLVING (success:false / superseded:true) rather than
   * throwing, and those rows were not written either.
   * @param {Object} gateway
   * @param {string} serviceId
   * @param {Object} row
   * @return {Promise<boolean>} True when the row was written.
   * @private
   */
  async publishServiceRow(gateway, serviceId, row) {
    try {
      const result = await gateway.upsertSystemTableRow(
        TABLES.SERVICE_PARTITION_ACCESS,
        row,
        this.buildPublishOptions(serviceId),
      );
      if (result?.success === false || result?.superseded === true) {
        this.getLogger()?.warn?.(
          ACCESS_PUBLISH_LOG_MSG.ROW_PUBLISH_FAILED,
          {nodeId: this.nodeId, serviceId, outcome: result?.outcome},
        );
        return false;
      }
      return true;
    } catch (error) {
      this.getLogger()?.warn?.(
        ACCESS_PUBLISH_LOG_MSG.ROW_PUBLISH_FAILED,
        {nodeId: this.nodeId, serviceId, error: error?.message},
      );
      return false;
    }
  }

  /**
   * Heartbeat-pattern write options: background, coalesced per
   * (node, service), replace-pending, never waiting on cache
   * convergence.
   * @param {string} serviceId
   * @return {Object}
   * @private
   */
  buildPublishOptions(serviceId) {
    return {
      allowCoalescing: true,
      coalescingKey:
        `${COALESCING_KEY_PREFIX}${ACCESS_ID_SEPARATOR}` +
        `${this.nodeId}${ACCESS_ID_SEPARATOR}${serviceId}`,
      mergePolicy: CONTROL_PLANE_MUTATION_MERGE_POLICY.REPLACE_PENDING,
      pressureRetryAfterMs: this.intervalMs,
      skipCacheWait: true,
      workClass: PRESSURE_WORK_CLASS.BACKGROUND,
    };
  }
}

export {ServicePartitionAccessPublisher};
