/**
 * Event-loop gap watchdog with synchronous-section attribution.
 *
 * Purpose (closure ledger CL-008 next falsification step): the rolling-restart
 * pressure-creep stall is pinned to the seed taking >5s to ACK for minutes,
 * with an UNVERIFIED claim that 13-26% of wall time is blocked inside
 * synchronous CDC event hydration. This watchdog measures loop blockage
 * directly and attributes it to tagged synchronous sections, quantifying the
 * unexplained remainder instead of guessing.
 *
 * Design constraints (per the --debug-logs observer-effect lesson):
 * - Emits NOTHING while the loop is healthy; one console-only warn line per
 *   detected gap (never the logs table — the stalled distributed write path
 *   rides on it).
 * - Attribution is aggregate counters per site (no per-call allocations
 *   beyond two performance.now() reads), safe for hot paths like per-CDC-event
 *   row fetches.
 * - Tagged sections MUST be synchronous (no await between enter and exit).
 *   Sections may nest; a depth counter accrues exclusive (non-overlapping)
 *   tagged time so the unexplained remainder is not double-counted.
 */

import {performance} from 'node:perf_hooks';
import {LoggingService} from '../logging/logging-service.js';
import {SUBSYSTEM} from '../constants/index.js';

const WATCHDOG_DEFAULT = Object.freeze({
  THRESHOLD_MS: 1000,
  INTERVAL_MS: 250,
  MAX_REPORTED_SITES: 12,
});

const WATCHDOG_ENV = Object.freeze({
  THRESHOLD_MS: 'LAGRANGE_LOOP_GAP_THRESHOLD_MS',
});

const WATCHDOG_LOG_MSG = Object.freeze({
  GAP_DETECTED: 'Event loop gap detected',
  STARTED: 'Event loop gap watchdog started',
});

const WATCHDOG_LOG_LEVEL = Object.freeze({
  WARN: 'warn',
  INFO: 'info',
});

/**
 * Aggregate counters for tagged synchronous sections. Module-level singleton
 * so hot paths can tag without dependency injection.
 */
class SyncSectionRegistry {
  constructor() {
    this.sites = new Map();
    this.depth = 0;
    this.exclusiveTaggedMs = 0;
    this.outermostEnterAt = 0;
  }

  /**
   * @param {string} site
   * @return {Object} Mutable site stats record.
   * @private
   */
  getSite(site) {
    let record = this.sites.get(site);
    if (!record) {
      record = {count: 0, totalMs: 0, maxMs: 0, openEnterAt: 0};
      this.sites.set(site, record);
    }
    return record;
  }

  /**
   * Mark entry into a synchronous section. Returns the token to pass to exit.
   * @param {string} site
   * @return {number}
   */
  enter(site) {
    const nowMs = performance.now();
    if (this.depth === 0) {
      this.outermostEnterAt = nowMs;
    }
    this.depth += 1;
    const record = this.getSite(site);
    record.openEnterAt = nowMs;
    return nowMs;
  }

  /**
   * Mark exit from a synchronous section.
   * @param {string} site
   * @param {number} enterToken - Value returned by enter().
   * @return {void}
   */
  exit(site, enterToken) {
    const nowMs = performance.now();
    const durationMs = nowMs - enterToken;
    const record = this.getSite(site);
    record.count += 1;
    record.totalMs += durationMs;
    if (durationMs > record.maxMs) {
      record.maxMs = durationMs;
    }
    record.openEnterAt = 0;
    if (this.depth > 0) {
      this.depth -= 1;
      if (this.depth === 0) {
        this.exclusiveTaggedMs += nowMs - this.outermostEnterAt;
      }
    }
  }

  /**
   * Snapshot cumulative counters for delta computation by the watchdog.
   * @return {{exclusiveTaggedMs: number, sites: Object}}
   */
  snapshot() {
    const sites = {};
    for (const [site, record] of this.sites.entries()) {
      sites[site] = {
        count: record.count,
        totalMs: record.totalMs,
        maxMs: record.maxMs,
      };
    }
    return {exclusiveTaggedMs: this.exclusiveTaggedMs, sites};
  }

  /**
   * Names of sections currently open (entered, not exited) with open age.
   * @param {number} nowPerfMs
   * @return {Array<{site: string, openForMs: number}>}
   */
  openSections(nowPerfMs) {
    const open = [];
    for (const [site, record] of this.sites.entries()) {
      if (record.openEnterAt > 0) {
        open.push({
          site,
          openForMs: Math.round(nowPerfMs - record.openEnterAt),
        });
      }
    }
    return open;
  }
}

const sharedSyncSectionRegistry = new SyncSectionRegistry();

/**
 * Tag a synchronous section. Usage:
 *   const token = enterSyncSection('cdc_update_row_fetch');
 *   try { ... } finally { exitSyncSection('cdc_update_row_fetch', token); }
 * @param {string} site
 * @return {number}
 */
function enterSyncSection(site) {
  return sharedSyncSectionRegistry.enter(site);
}

/**
 * @param {string} site
 * @param {number} token
 * @return {void}
 */
function exitSyncSection(site, token) {
  sharedSyncSectionRegistry.exit(site, token);
}

/**
 * Convenience wrapper for a synchronous function call.
 * @param {string} site
 * @param {Function} fn
 * @return {*}
 */
function trackSyncSection(site, fn) {
  const token = enterSyncSection(site);
  try {
    return fn();
  } finally {
    exitSyncSection(site, token);
  }
}

class EventLoopGapWatchdog {
  /**
   * @param {Object} [options]
   * @param {number} [options.thresholdMs] - Minimum loop gap to report;
   *   0 disables the watchdog entirely.
   * @param {number} [options.intervalMs] - Heartbeat interval.
   * @param {Object} [options.registry] - Sync-section registry (tests only).
   */
  constructor(options = {}) {
    const envThreshold = Number(process.env[WATCHDOG_ENV.THRESHOLD_MS]);
    this.thresholdMs = Number.isFinite(options.thresholdMs) ?
      options.thresholdMs :
      (Number.isFinite(envThreshold) ?
        envThreshold :
        WATCHDOG_DEFAULT.THRESHOLD_MS);
    this.intervalMs = Number.isFinite(options.intervalMs) &&
      options.intervalMs > 0 ?
      Math.floor(options.intervalMs) :
      WATCHDOG_DEFAULT.INTERVAL_MS;
    this.registry = options.registry || sharedSyncSectionRegistry;
    this.intervalHandle = null;
    this.expectedAtMs = 0;
    this.lastRegistrySnapshot = null;
    this.lastEluSample = null;
    this.gapCount = 0;
    this.totalGapMs = 0;
    this.maxGapMs = 0;
    this.startedAtMs = 0;
  }

  /**
   * Start the heartbeat. No-op when thresholdMs <= 0.
   * @return {boolean} Whether the watchdog is running.
   */
  start() {
    if (this.thresholdMs <= 0 || this.intervalHandle) {
      return this.intervalHandle !== null;
    }
    this.startedAtMs = Date.now();
    this.expectedAtMs = this.startedAtMs + this.intervalMs;
    this.lastRegistrySnapshot = this.registry.snapshot();
    this.lastEluSample = performance.eventLoopUtilization();
    this.intervalHandle = setInterval(() => this.tick(), this.intervalMs);
    if (typeof this.intervalHandle.unref === 'function') {
      this.intervalHandle.unref();
    }
    this.logConsoleOnly(WATCHDOG_LOG_LEVEL.INFO, WATCHDOG_LOG_MSG.STARTED, {
      thresholdMs: this.thresholdMs,
      intervalMs: this.intervalMs,
    });
    return true;
  }

  stop() {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  /**
   * One heartbeat: measure lateness, report when it exceeds the threshold.
   * @return {void}
   * @private
   */
  tick() {
    const nowMs = Date.now();
    const gapMs = nowMs - this.expectedAtMs;
    this.expectedAtMs = nowMs + this.intervalMs;
    if (gapMs < this.thresholdMs) {
      return;
    }

    this.gapCount += 1;
    this.totalGapMs += gapMs;
    if (gapMs > this.maxGapMs) {
      this.maxGapMs = gapMs;
    }

    const snapshot = this.registry.snapshot();
    const previous = this.lastRegistrySnapshot || snapshot;
    this.lastRegistrySnapshot = snapshot;

    const eluDelta = performance.eventLoopUtilization(this.lastEluSample);
    this.lastEluSample = performance.eventLoopUtilization();

    const siteDeltas = this.computeSiteDeltas(previous.sites, snapshot.sites);
    const taggedExclusiveDeltaMs = Math.max(
      0,
      snapshot.exclusiveTaggedMs - previous.exclusiveTaggedMs,
    );
    const unexplainedMs = Math.max(
      0,
      Math.round(gapMs - taggedExclusiveDeltaMs),
    );
    const wallMs = Math.max(1, nowMs - this.startedAtMs);

    this.logConsoleOnly(
      WATCHDOG_LOG_LEVEL.WARN,
      WATCHDOG_LOG_MSG.GAP_DETECTED,
      {
        gapMs: Math.round(gapMs),
        taggedExclusiveMs: Math.round(taggedExclusiveDeltaMs),
        unexplainedMs,
        eventLoopUtilization: Number(eluDelta.utilization.toFixed(4)),
        openSections: this.registry.openSections(performance.now()),
        siteDeltas,
        cumulative: {
          gapCount: this.gapCount,
          totalGapMs: Math.round(this.totalGapMs),
          maxGapMs: Math.round(this.maxGapMs),
          blockedPercentOfWall: Number(
            ((this.totalGapMs / wallMs) * 100).toFixed(2),
          ),
        },
      },
    );
  }

  /**
   * Per-site deltas since the previous report, largest first.
   * @param {Object} previousSites
   * @param {Object} currentSites
   * @return {Array<Object>}
   * @private
   */
  computeSiteDeltas(previousSites, currentSites) {
    const deltas = [];
    for (const [site, current] of Object.entries(currentSites)) {
      const prior = previousSites[site] || {count: 0, totalMs: 0};
      const countDelta = current.count - prior.count;
      const totalMsDelta = current.totalMs - prior.totalMs;
      if (countDelta <= 0 && totalMsDelta <= 0) {
        continue;
      }
      deltas.push({
        site,
        count: countDelta,
        totalMs: Math.round(totalMsDelta),
        maxMs: Math.round(current.maxMs),
      });
    }
    return deltas
      .sort((left, right) => right.totalMs - left.totalMs)
      .slice(0, WATCHDOG_DEFAULT.MAX_REPORTED_SITES);
  }

  /**
   * Console-only emission so a stalled logs-table write path is never asked
   * to carry its own diagnosis.
   * @param {string} level
   * @param {string} message
   * @param {Object} context
   * @return {void}
   * @private
   */
  logConsoleOnly(level, message, context) {
    const loggingService = LoggingService.getInstance();
    if (
      loggingService.isInitialized() &&
      typeof loggingService.logConsoleOnly === 'function'
    ) {
      loggingService.logConsoleOnly(level, message, {
        subsystem: SUBSYSTEM.RESOURCE_DIAGNOSTICS,
        ...context,
      });
      return;
    }
    console.log(JSON.stringify({level, message, ...context}));
  }
}

export {
  EventLoopGapWatchdog,
  SyncSectionRegistry,
  enterSyncSection,
  exitSyncSection,
  trackSyncSection,
};
