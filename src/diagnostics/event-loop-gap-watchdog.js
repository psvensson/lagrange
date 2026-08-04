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
import {Session} from 'node:inspector';
import {LoggingService} from '../logging/logging-service.js';
import {SUBSYSTEM} from '../constants/index.js';

const WATCHDOG_DEFAULT = Object.freeze({
  THRESHOLD_MS: 1000,
  INTERVAL_MS: 250,
  MAX_REPORTED_SITES: 12,
  PROFILE_WINDOW_MS: 30000,
  PROFILE_SAMPLING_INTERVAL_US: 2000,
  PROFILE_TOP_FRAMES: 10,
});

const WATCHDOG_ENV = Object.freeze({
  THRESHOLD_MS: 'LAGRANGE_LOOP_GAP_THRESHOLD_MS',
  PROFILE: 'LAGRANGE_LOOP_GAP_PROFILE',
});

const WATCHDOG_LOG_MSG = Object.freeze({
  GAP_DETECTED: 'Event loop gap detected',
  STARTED: 'Event loop gap watchdog started',
  PROFILE_WINDOW: 'Event loop gap profile window',
  PROFILE_ERROR: 'Event loop gap profiler error',
  MEMORY_SAMPLE: 'Process memory sample',
});

// CL-030: periodic heap telemetry so an unbounded-growth curve is
// attributable post-mortem without a profiler (the 145024Z-run2 seed
// OOMed at the 1.46GB heap limit with NO memory series in any artifact
// channel). Console-only, one line a minute.
const WATCHDOG_MEMORY_SAMPLE_INTERVAL_MS = 60 * 1000;

const WATCHDOG_BYTES_PER_MB = 1024 * 1024;

/**
 * @return {Object} process.memoryUsage() rounded to MB for log payloads.
 */
function buildMemorySampleMb() {
  const usage = process.memoryUsage();
  return {
    heapUsedMb: Math.round(usage.heapUsed / WATCHDOG_BYTES_PER_MB),
    heapTotalMb: Math.round(usage.heapTotal / WATCHDOG_BYTES_PER_MB),
    rssMb: Math.round(usage.rss / WATCHDOG_BYTES_PER_MB),
    externalMb: Math.round((usage.external || 0) / WATCHDOG_BYTES_PER_MB),
  };
}

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

/**
 * In-process V8 sampling profiler driven by the watchdog heartbeat. The
 * profile window rotates on the first tick after windowMs elapses — ticks
 * starve while the loop is blocked, so a block always lands inside the
 * window that rotates right after it ends. Windows containing no gap are
 * discarded silently, so the converged phases cost nothing in output.
 */
class GapSamplingProfiler {
  /**
   * @param {Object} [options]
   * @param {number} [options.windowMs]
   * @param {number} [options.samplingIntervalUs]
   * @param {number} [options.topFrames]
   */
  constructor(options = {}) {
    this.windowMs = Number.isFinite(options.windowMs) && options.windowMs > 0 ?
      Math.floor(options.windowMs) :
      WATCHDOG_DEFAULT.PROFILE_WINDOW_MS;
    this.samplingIntervalUs = Number.isFinite(options.samplingIntervalUs) &&
      options.samplingIntervalUs > 0 ?
      Math.floor(options.samplingIntervalUs) :
      WATCHDOG_DEFAULT.PROFILE_SAMPLING_INTERVAL_US;
    this.topFrames = Number.isFinite(options.topFrames) &&
      options.topFrames > 0 ?
      Math.floor(options.topFrames) :
      WATCHDOG_DEFAULT.PROFILE_TOP_FRAMES;
    this.session = null;
    this.windowStartedAtMs = 0;
    this.rotating = false;
  }

  /**
   * @param {string} method
   * @param {Object} [params]
   * @return {Promise<Object>}
   * @private
   */
  post(method, params = {}) {
    return new Promise((resolve, reject) => {
      this.session.post(method, params, (error, result) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(result);
      });
    });
  }

  /**
   * @return {Promise<void>}
   */
  async start() {
    this.session = new Session();
    this.session.connect();
    await this.post('Profiler.enable');
    await this.post('Profiler.setSamplingInterval', {
      interval: this.samplingIntervalUs,
    });
    await this.post('Profiler.start');
    this.windowStartedAtMs = Date.now();
  }

  /**
   * @return {boolean} Whether the current window has elapsed.
   */
  isWindowElapsed(nowMs) {
    return this.session !== null &&
      !this.rotating &&
      nowMs - this.windowStartedAtMs >= this.windowMs;
  }

  /**
   * Stop the current window, aggregate top self-time frames, restart.
   * @return {Promise<{windowMs: number, totalSamples: number,
   *   topFrames: Array<Object>}|null>}
   */
  async rotateWindow() {
    if (!this.session || this.rotating) {
      return null;
    }
    this.rotating = true;
    try {
      const nowMs = Date.now();
      const windowMs = nowMs - this.windowStartedAtMs;
      const {profile} = await this.post('Profiler.stop');
      await this.post('Profiler.start');
      this.windowStartedAtMs = Date.now();
      return {
        windowMs,
        ...this.aggregateTopFrames(profile),
        topInclusiveFrames: this.aggregateTopInclusiveFrames(profile),
      };
    } finally {
      this.rotating = false;
    }
  }

  /**
   * Aggregate INCLUSIVE (self + descendants) hit counts per function. Where
   * self-time is diffuse across many small callees, the inclusive ranking
   * names the driving loop instead. Functions reached from multiple parents
   * are summed across their stack nodes; recursive frames may exceed 100%.
   * Meta frames ((root), (program), (idle), (garbage collector)) excluded.
   * @param {Object} profile - V8 CPU profile.
   * @return {Array<Object>}
   * @private
   */
  aggregateTopInclusiveFrames(profile) {
    const nodes = Array.isArray(profile?.nodes) ? profile.nodes : [];
    if (nodes.length === 0) {
      return [];
    }
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const subtreeHitsById = new Map();
    const computeSubtreeHits = (nodeId) => {
      if (subtreeHitsById.has(nodeId)) {
        return subtreeHitsById.get(nodeId);
      }
      const node = nodeById.get(nodeId);
      if (!node) {
        return 0;
      }
      let total = Number.isFinite(node.hitCount) ? node.hitCount : 0;
      for (const childId of node.children || []) {
        total += computeSubtreeHits(childId);
      }
      subtreeHitsById.set(nodeId, total);
      return total;
    };
    let totalSamples = 0;
    for (const node of nodes) {
      totalSamples += Number.isFinite(node.hitCount) ? node.hitCount : 0;
    }
    const META_FRAMES = new Set([
      '(root)', '(program)', '(idle)', '(garbage collector)',
    ]);
    const inclusiveByKey = new Map();
    for (const node of nodes) {
      const callFrame = node.callFrame || {};
      const fn = callFrame.functionName || '(anonymous)';
      if (META_FRAMES.has(fn)) {
        continue;
      }
      const url = this.compactUrl(callFrame.url);
      const line = Number.isFinite(callFrame.lineNumber) ?
        callFrame.lineNumber + 1 :
        null;
      const key = `${fn}@${url}:${line}`;
      const frame = inclusiveByKey.get(key) ||
        {fn, url, line, inclusiveHits: 0};
      frame.inclusiveHits += computeSubtreeHits(node.id);
      inclusiveByKey.set(key, frame);
    }
    return [...inclusiveByKey.values()]
      .sort((left, right) => right.inclusiveHits - left.inclusiveHits)
      .slice(0, this.topFrames)
      .map((frame) => ({
        ...frame,
        inclusiveMs: Math.round(
          (frame.inclusiveHits * this.samplingIntervalUs) / 1000,
        ),
        inclusiveShare: totalSamples > 0 ?
          Number((frame.inclusiveHits / totalSamples).toFixed(3)) :
          0,
      }));
  }

  /**
   * Aggregate hit counts per FUNCTION (fn+url+line), largest self time
   * first. A hot function reached via many call paths appears as many
   * profile nodes; per-node ranking understates it (observed: the CL-010
   * culprit occupied 5+ of the top-10 node slots while its per-node shares
   * looked small).
   * @param {Object} profile - V8 CPU profile.
   * @return {{totalSamples: number, topFrames: Array<Object>}}
   * @private
   */
  aggregateTopFrames(profile) {
    const nodes = Array.isArray(profile?.nodes) ? profile.nodes : [];
    let totalSamples = 0;
    const frameByKey = new Map();
    for (const node of nodes) {
      const hitCount = Number.isFinite(node.hitCount) ? node.hitCount : 0;
      if (hitCount <= 0) {
        continue;
      }
      totalSamples += hitCount;
      const callFrame = node.callFrame || {};
      const fn = callFrame.functionName || '(anonymous)';
      const url = this.compactUrl(callFrame.url);
      const line = Number.isFinite(callFrame.lineNumber) ?
        callFrame.lineNumber + 1 :
        null;
      const key = `${fn}@${url}:${line}`;
      const frame = frameByKey.get(key) ||
        {fn, url, line, hits: 0, stackNodes: 0};
      frame.hits += hitCount;
      frame.stackNodes += 1;
      frameByKey.set(key, frame);
    }
    const topFrames = [...frameByKey.values()]
      .sort((left, right) => right.hits - left.hits)
      .slice(0, this.topFrames)
      .map((frame) => ({
        ...frame,
        selfMs: Math.round((frame.hits * this.samplingIntervalUs) / 1000),
        share: totalSamples > 0 ?
          Number((frame.hits / totalSamples).toFixed(3)) :
          0,
      }));
    return {totalSamples, topFrames};
  }

  /**
   * @param {string} url
   * @return {string}
   * @private
   */
  compactUrl(url) {
    const normalized = String(url || '');
    const sourceIndex = normalized.lastIndexOf('/src/');
    if (sourceIndex >= 0) {
      return normalized.slice(sourceIndex + 1);
    }
    const nodeModulesIndex = normalized.lastIndexOf('/node_modules/');
    if (nodeModulesIndex >= 0) {
      return normalized.slice(nodeModulesIndex + 1);
    }
    return normalized;
  }

  stop() {
    if (this.session) {
      try {
        this.session.disconnect();
      } catch (_error) {
        // Best-effort teardown.
      }
      this.session = null;
    }
  }
}

class EventLoopGapWatchdog {
  /**
   * @param {Object} [options]
   * @param {number} [options.thresholdMs] - Minimum loop gap to report;
   *   0 disables the watchdog entirely.
   * @param {number} [options.intervalMs] - Heartbeat interval.
   * @param {Object} [options.registry] - Sync-section registry (tests only).
   * @param {boolean} [options.profileEnabled] - Enable the sampling
   *   profiler; defaults to the LAGRANGE_LOOP_GAP_PROFILE env switch.
   * @param {Object} [options.profilerOptions] - GapSamplingProfiler options.
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
    const envProfile = process.env[WATCHDOG_ENV.PROFILE];
    this.profileEnabled = typeof options.profileEnabled === 'boolean' ?
      options.profileEnabled :
      envProfile === '1' || envProfile === 'true';
    this.profiler = this.profileEnabled ?
      new GapSamplingProfiler(options.profilerOptions) :
      null;
    this.gapsInProfileWindow = 0;
    this.intervalHandle = null;
    this.expectedAtMs = 0;
    this.lastRegistrySnapshot = null;
    this.lastEluSample = null;
    this.gapCount = 0;
    this.totalGapMs = 0;
    this.maxGapMs = 0;
    // Unexplained = gap time not covered by tagged app-owned sections; the
    // host-noise share consumed by run-validity budgets (app-owned stalls are
    // system-under-test behavior and must stay measurable as red).
    this.totalUnexplainedMs = 0;
    this.maxUnexplainedGapMs = 0;
    this.startedAtMs = 0;
    this.lastMemorySampleAtMs = 0;
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
    if (this.profiler) {
      this.profiler.start().catch((error) => {
        this.logConsoleOnly(
          WATCHDOG_LOG_LEVEL.WARN,
          WATCHDOG_LOG_MSG.PROFILE_ERROR,
          {error: error?.message || String(error)},
        );
        this.profiler = null;
      });
    }
    this.logConsoleOnly(WATCHDOG_LOG_LEVEL.INFO, WATCHDOG_LOG_MSG.STARTED, {
      thresholdMs: this.thresholdMs,
      intervalMs: this.intervalMs,
      profileEnabled: this.profiler !== null,
    });
    return true;
  }

  stop() {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
    if (this.profiler) {
      this.profiler.stop();
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
    if (gapMs >= this.thresholdMs) {
      this.gapsInProfileWindow += 1;
    }
    if (this.profiler && this.profiler.isWindowElapsed(nowMs)) {
      this.rotateProfileWindow();
    }
    if (
      nowMs - this.lastMemorySampleAtMs >= WATCHDOG_MEMORY_SAMPLE_INTERVAL_MS
    ) {
      this.lastMemorySampleAtMs = nowMs;
      this.logConsoleOnly(
        WATCHDOG_LOG_LEVEL.INFO,
        WATCHDOG_LOG_MSG.MEMORY_SAMPLE,
        buildMemorySampleMb(),
      );
    }
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
    this.totalUnexplainedMs += unexplainedMs;
    if (unexplainedMs > this.maxUnexplainedGapMs) {
      this.maxUnexplainedGapMs = unexplainedMs;
    }
    const wallMs = Math.max(1, nowMs - this.startedAtMs);

    this.logConsoleOnly(
      WATCHDOG_LOG_LEVEL.WARN,
      WATCHDOG_LOG_MSG.GAP_DETECTED,
      {
        gapMs: Math.round(gapMs),
        taggedExclusiveMs: Math.round(taggedExclusiveDeltaMs),
        unexplainedMs,
        memory: buildMemorySampleMb(),
        eventLoopUtilization: Number(eluDelta.utilization.toFixed(4)),
        openSections: this.registry.openSections(performance.now()),
        siteDeltas,
        cumulative: {
          gapCount: this.gapCount,
          totalGapMs: Math.round(this.totalGapMs),
          maxGapMs: Math.round(this.maxGapMs),
          totalUnexplainedMs: Math.round(this.totalUnexplainedMs),
          maxUnexplainedGapMs: Math.round(this.maxUnexplainedGapMs),
          blockedPercentOfWall: Number(
            ((this.totalGapMs / wallMs) * 100).toFixed(2),
          ),
        },
      },
    );
  }

  /**
   * Rotate the profile window; emit top frames only when the closed window
   * contained at least one gap.
   * @return {void}
   * @private
   */
  rotateProfileWindow() {
    const gapsInWindow = this.gapsInProfileWindow;
    this.gapsInProfileWindow = 0;
    this.profiler.rotateWindow().then((windowReport) => {
      if (!windowReport || gapsInWindow === 0) {
        return;
      }
      this.logConsoleOnly(
        WATCHDOG_LOG_LEVEL.WARN,
        WATCHDOG_LOG_MSG.PROFILE_WINDOW,
        {
          gapsInWindow,
          windowMs: Math.round(windowReport.windowMs),
          totalSamples: windowReport.totalSamples,
          topFrames: windowReport.topFrames,
          topInclusiveFrames: windowReport.topInclusiveFrames,
        },
      );
    }).catch((error) => {
      this.logConsoleOnly(
        WATCHDOG_LOG_LEVEL.WARN,
        WATCHDOG_LOG_MSG.PROFILE_ERROR,
        {error: error?.message || String(error)},
      );
    });
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

/**
 * Read-only accessor for the shared sync-section registry that the
 * process-wide watchdog and trackSyncSection write to. Lets diagnostics and
 * tests assert per-site attribution without threading a registry reference
 * through unrelated constructors (the production watchdog composes the shared
 * default at src/index.js).
 * @return {SyncSectionRegistry}
 */
function getSharedSyncSectionRegistry() {
  return sharedSyncSectionRegistry;
}

export {
  EventLoopGapWatchdog,
  GapSamplingProfiler,
  SyncSectionRegistry,
  enterSyncSection,
  exitSyncSection,
  getSharedSyncSectionRegistry,
  trackSyncSection,
};
