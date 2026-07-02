/**
 * Runtime resource diagnostics sampler.
 *
 * Produces point-in-time and trend diagnostics for process resource usage and
 * subsystem counters to help isolate leak and hot-loop behavior.
 */

import fs from 'node:fs';
import os from 'node:os';
import {performance} from 'node:perf_hooks';
import {NUM, SUBSYSTEM} from '../constants/index.js';
import {LoggingService} from '../logging/logging-service.js';
import {LogsTableService} from '../logging/logs-table-service.js';

const LOCAL_STR_FUNCTION = 'function';
const LOCAL_STR_OBJECT = 'object';

const RESOURCE_DIAGNOSTICS_DEFAULT = Object.freeze({
  HISTORY_LIMIT: 180,
  TREND_WINDOW_SAMPLES: 12,
  TOP_SIGNAL_LIMIT: 12,
  COMPACT_TOP_SIGNAL_LIMIT: 10,
  MAX_FLATTEN_DEPTH: 4,
  MAX_SIGNAL_COUNT: 2048,
  MIN_ELAPSED_MS: 1,
  PERCENT_FACTOR: 100,
  MICROS_PER_MILLISECOND: 1000,
  MILLIS_PER_SECOND: 1000,
  SECONDS_PER_MINUTE: 60,
  PROC_SELF_IO_PATH: '/proc/self/io',
  WRITE_BYTES_PREFIX: 'write_bytes:',
});

const RESOURCE_DIAGNOSTICS_OWNER_COMPONENT = Object.freeze([
  Object.freeze({name: 'messageRouter', field: 'messageRouter'}),
  Object.freeze({name: 'transport', field: 'transport'}),
  Object.freeze({name: 'rpcClient', field: 'rpcClient'}),
  Object.freeze({name: 'cdcIntegration', field: 'cdcIntegrationService'}),
  Object.freeze({name: 'replicaHandler', field: 'replicaHandler'}),
  Object.freeze({name: 'replicaStateMachine', field: 'replicaStateMachine'}),
  Object.freeze({name: 'heartbeatService', field: 'heartbeatService'}),
  Object.freeze({name: 'leaseService', field: 'leaseService'}),
  Object.freeze({name: 'endpointService', field: 'endpointService'}),
  Object.freeze({name: 'dispatchService', field: 'dispatchService'}),
  Object.freeze({name: 'tablePolicyService', field: 'tablePolicyService'}),
  Object.freeze({name: 'latencyTopology', field: 'latencyTopology'}),
  Object.freeze({name: 'runtimeServiceHandler', field: 'runtimeServiceHandler'}),
]);

const RESOURCE_DIAGNOSTICS_WARNING = Object.freeze({
  SIGNAL_LIMIT_REACHED:
    'Resource diagnostics signal limit reached; truncating component signal extraction',
});

const SIGNAL_PATH = Object.freeze({
  DOT: '.',
  LENGTH_SUFFIX: '.length',
});

const UNKNOWN_NODE_ID = 'unknown-node';

function normalizePositiveInteger(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
}

function roundToTwo(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.round(value * RESOURCE_DIAGNOSTICS_DEFAULT.PERCENT_FACTOR) /
    RESOURCE_DIAGNOSTICS_DEFAULT.PERCENT_FACTOR;
}

function getNestedPath(parentPath, childKey) {
  if (!parentPath) {
    return String(childKey);
  }
  return `${parentPath}${SIGNAL_PATH.DOT}${childKey}`;
}

class ResourceDiagnosticsSampler {
  /**
   * @param {Object} [options]
   * @param {string} [options.nodeId]
   * @param {Object|null} [options.owner]
   * @param {number} [options.historyLimit]
   * @param {number} [options.trendWindowSamples]
   * @param {number} [options.topSignalLimit]
   */
  constructor(options = {}) {
    this.nodeId = options.nodeId || UNKNOWN_NODE_ID;
    this.owner = options.owner || null;
    this.historyLimit = normalizePositiveInteger(
      options.historyLimit,
      RESOURCE_DIAGNOSTICS_DEFAULT.HISTORY_LIMIT,
    );
    this.trendWindowSamples = normalizePositiveInteger(
      options.trendWindowSamples,
      RESOURCE_DIAGNOSTICS_DEFAULT.TREND_WINDOW_SAMPLES,
    );
    this.topSignalLimit = normalizePositiveInteger(
      options.topSignalLimit,
      RESOURCE_DIAGNOSTICS_DEFAULT.TOP_SIGNAL_LIMIT,
    );

    this.samples = [];
    this.lastCpuUsage = process.cpuUsage();
    this.lastCpuTimestampMs = Date.now();
    this.lastWriteBytes = this.readProcessWriteBytes();
    this.lastWriteTimestampMs = Date.now();
    this.lastEluSample = performance.eventLoopUtilization();
    this.signalLimitWarningLogged = false;

    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem(SUBSYSTEM.RESOURCE_DIAGNOSTICS) :
      console;
  }

  /**
   * Collect a new sample and return full diagnostics report.
   * @return {Object}
   */
  getReport() {
    const latestSample = this.collect();
    const latest = this.buildPublicSample(latestSample);
    const trend = this.buildTrendReport();
    return {
      nodeId: this.nodeId,
      sampleCount: this.samples.length,
      historyLimit: this.historyLimit,
      trendWindowSamples: this.trendWindowSamples,
      latest,
      trend,
      compact: this.buildCompactReport(latest, trend),
    };
  }

  /**
   * Build compact operator-facing diagnostics view.
   * @param {Object} latest
   * @param {Object|null} trend
   * @return {Object}
   * @private
   */
  buildCompactReport(latest, trend) {
    return {
      cpuPercent: latest?.process?.cpuPercent ?? null,
      eventLoopUtilizationPercent:
        latest?.process?.eventLoopUtilizationPercent ?? null,
      rssGrowthPerMinBytes: trend?.rssGrowthPerMinBytes ?? null,
      writeRateBytesPerSec: trend?.writeRateBytesPerSec ?? null,
      topGrowingSignals: Array.isArray(trend?.topGrowingSignals) ?
        trend.topGrowingSignals.slice(
          0,
          RESOURCE_DIAGNOSTICS_DEFAULT.COMPACT_TOP_SIGNAL_LIMIT,
        ) :
        [],
    };
  }

  /**
   * Collect and store one sample.
   * @return {Object}
   */
  collect() {
    const nowMs = Date.now();
    const memory = process.memoryUsage();
    const processUsage = process.resourceUsage();
    const cpuUsage = process.cpuUsage();
    const cpuDeltaUserUs = cpuUsage.user - this.lastCpuUsage.user;
    const cpuDeltaSystemUs = cpuUsage.system - this.lastCpuUsage.system;
    const cpuDeltaTotalUs = cpuDeltaUserUs + cpuDeltaSystemUs;
    const elapsedCpuMs = Math.max(
      RESOURCE_DIAGNOSTICS_DEFAULT.MIN_ELAPSED_MS,
      nowMs - this.lastCpuTimestampMs,
    );

    const writeBytesTotal = this.readProcessWriteBytes();
    const elapsedIoMs = Math.max(
      RESOURCE_DIAGNOSTICS_DEFAULT.MIN_ELAPSED_MS,
      nowMs - this.lastWriteTimestampMs,
    );
    const writeBytesDelta = Number.isFinite(writeBytesTotal) &&
      Number.isFinite(this.lastWriteBytes) ?
      Math.max(0, writeBytesTotal - this.lastWriteBytes) :
      null;
    const writeBytesPerSec = Number.isFinite(writeBytesDelta) ?
      writeBytesDelta /
        (elapsedIoMs / RESOURCE_DIAGNOSTICS_DEFAULT.MILLIS_PER_SECOND) :
      null;

    const eluDelta = performance.eventLoopUtilization(this.lastEluSample);
    this.lastEluSample = performance.eventLoopUtilization();

    const componentStats = this.collectComponentStats();
    const componentSignals = this.flattenComponentSignals(componentStats);

    const sample = {
      timestamp: nowMs,
      uptimeSec: process.uptime(),
      process: {
        rssBytes: memory.rss,
        heapUsedBytes: memory.heapUsed,
        heapTotalBytes: memory.heapTotal,
        externalBytes: memory.external,
        arrayBuffersBytes: memory.arrayBuffers,
        cpuUserDeltaUs: cpuDeltaUserUs,
        cpuSystemDeltaUs: cpuDeltaSystemUs,
        cpuPercent: this.calculateCpuPercent(cpuDeltaTotalUs, elapsedCpuMs),
        eventLoopUtilizationPercent:
          roundToTwo(eluDelta.utilization * RESOURCE_DIAGNOSTICS_DEFAULT.PERCENT_FACTOR),
        maxRssBytes:
          processUsage.maxRSS * NUM.BYTES_PER_KIB,
        fsReadOps: processUsage.fsRead,
        fsWriteOps: processUsage.fsWrite,
      },
      io: {
        writeBytesTotal,
        writeBytesDelta,
        writeBytesPerSec: Number.isFinite(writeBytesPerSec) ?
          roundToTwo(writeBytesPerSec) :
          null,
      },
      components: componentStats,
      componentSignals,
    };

    this.lastCpuUsage = cpuUsage;
    this.lastCpuTimestampMs = nowMs;
    this.lastWriteBytes = writeBytesTotal;
    this.lastWriteTimestampMs = nowMs;

    this.samples.push(sample);
    if (this.samples.length > this.historyLimit) {
      this.samples.shift();
    }

    return sample;
  }

  /**
   * Build a compact public sample view.
   * @param {Object} sample
   * @return {Object}
   * @private
   */
  buildPublicSample(sample) {
    return {
      timestamp: sample.timestamp,
      uptimeSec: roundToTwo(sample.uptimeSec),
      process: {
        rssBytes: sample.process.rssBytes,
        heapUsedBytes: sample.process.heapUsedBytes,
        heapTotalBytes: sample.process.heapTotalBytes,
        externalBytes: sample.process.externalBytes,
        arrayBuffersBytes: sample.process.arrayBuffersBytes,
        cpuPercent: sample.process.cpuPercent,
        eventLoopUtilizationPercent:
          sample.process.eventLoopUtilizationPercent,
        fsReadOps: sample.process.fsReadOps,
        fsWriteOps: sample.process.fsWriteOps,
      },
      io: {
        writeBytesTotal: sample.io.writeBytesTotal,
        writeBytesDelta: sample.io.writeBytesDelta,
        writeBytesPerSec: sample.io.writeBytesPerSec,
      },
      components: sample.components,
    };
  }

  /**
   * Build trend report from recent samples.
   * @return {Object|null}
   * @private
   */
  buildTrendReport() {
    if (this.samples.length < 2) {
      return null;
    }

    const windowSize = Math.min(
      this.trendWindowSamples,
      this.samples.length - 1,
    );
    const startIndex = this.samples.length - 1 - windowSize;
    const start = this.samples[startIndex];
    const end = this.samples[this.samples.length - 1];
    const elapsedSec = Math.max(
      RESOURCE_DIAGNOSTICS_DEFAULT.MIN_ELAPSED_MS /
        RESOURCE_DIAGNOSTICS_DEFAULT.MILLIS_PER_SECOND,
      (end.timestamp - start.timestamp) /
        RESOURCE_DIAGNOSTICS_DEFAULT.MILLIS_PER_SECOND,
    );
    const elapsedMinutes = elapsedSec / RESOURCE_DIAGNOSTICS_DEFAULT.SECONDS_PER_MINUTE;

    const rssDeltaBytes = end.process.rssBytes - start.process.rssBytes;
    const heapDeltaBytes = end.process.heapUsedBytes - start.process.heapUsedBytes;
    const writeDeltaBytes = Number.isFinite(end.io.writeBytesTotal) &&
      Number.isFinite(start.io.writeBytesTotal) ?
      end.io.writeBytesTotal - start.io.writeBytesTotal :
      null;

    return {
      windowSamples: windowSize + 1,
      elapsedSec: roundToTwo(elapsedSec),
      rssDeltaBytes,
      heapUsedDeltaBytes: heapDeltaBytes,
      rssGrowthPerMinBytes: roundToTwo(rssDeltaBytes / elapsedMinutes),
      heapGrowthPerMinBytes: roundToTwo(heapDeltaBytes / elapsedMinutes),
      writeDeltaBytes,
      writeRateBytesPerSec: Number.isFinite(writeDeltaBytes) ?
        roundToTwo(writeDeltaBytes / elapsedSec) :
        null,
      topGrowingSignals: this.computeTopGrowingSignals(
        start.componentSignals,
        end.componentSignals,
        elapsedSec,
      ),
    };
  }

  /**
   * Compute highest-growth numeric component signals in the trend window.
   * @param {Object} startSignals
   * @param {Object} endSignals
   * @param {number} elapsedSec
   * @return {Object[]}
   * @private
   */
  computeTopGrowingSignals(startSignals, endSignals, elapsedSec) {
    const results = [];
    for (const [signal, endValue] of Object.entries(endSignals)) {
      const startValue = Number.isFinite(startSignals[signal]) ?
        startSignals[signal] :
        0;
      const delta = endValue - startValue;
      if (!Number.isFinite(delta) || delta <= 0) {
        continue;
      }
      results.push({
        signal,
        delta,
        ratePerSec: roundToTwo(delta / elapsedSec),
      });
    }

    return results
      .sort((left, right) => right.delta - left.delta)
      .slice(0, this.topSignalLimit);
  }

  /**
   * Collect component stats from logging, logs table service, and owner fields.
   * @return {Object}
   * @private
   */
  collectComponentStats() {
    const stats = {};
    const loggingService = LoggingService.getInstance();
    if (loggingService.isInitialized() &&
      typeof loggingService.getDiagnosticsStats === LOCAL_STR_FUNCTION) {
      stats.logging = loggingService.getDiagnosticsStats();
    }

    const logsTableService = LogsTableService.instance;
    if (logsTableService &&
      typeof logsTableService.getStats === LOCAL_STR_FUNCTION) {
      stats.logsTable = logsTableService.getStats();
    }

    const owner = this.owner;
    if (!owner || typeof owner !== LOCAL_STR_OBJECT) {
      return stats;
    }

    for (const component of RESOURCE_DIAGNOSTICS_OWNER_COMPONENT) {
      const componentRef = owner[component.field];
      if (!componentRef || typeof componentRef.getStats !== LOCAL_STR_FUNCTION) {
        continue;
      }
      const componentStats = componentRef.getStats();
      if (!componentStats ||
        typeof componentStats !== LOCAL_STR_OBJECT ||
        typeof componentStats.then === LOCAL_STR_FUNCTION) {
        continue;
      }
      stats[component.name] = componentStats;
    }

    if (owner.serviceLifecycleManager &&
      typeof owner.serviceLifecycleManager.getMetrics === LOCAL_STR_FUNCTION) {
      stats.serviceLifecycleManager = owner.serviceLifecycleManager.getMetrics();
    }

    if (owner.serviceReconciler &&
      typeof owner.serviceReconciler.getStats === LOCAL_STR_FUNCTION) {
      stats.serviceReconciler = owner.serviceReconciler.getStats();
    }

    return stats;
  }

  /**
   * Flatten nested component stats into numeric leaf signals.
   * @param {Object} componentStats
   * @return {Object}
   * @private
   */
  flattenComponentSignals(componentStats) {
    const result = {};
    let truncated = false;

    const walk = (value, path, depth) => {
      if (Object.keys(result).length >=
        RESOURCE_DIAGNOSTICS_DEFAULT.MAX_SIGNAL_COUNT) {
        truncated = true;
        return;
      }

      if (Number.isFinite(value)) {
        result[path] = value;
        return;
      }

      if (Array.isArray(value)) {
        result[`${path}${SIGNAL_PATH.LENGTH_SUFFIX}`] = value.length;
        return;
      }

      if (!value || typeof value !== 'object') {
        return;
      }

      if (depth >= RESOURCE_DIAGNOSTICS_DEFAULT.MAX_FLATTEN_DEPTH) {
        return;
      }

      for (const [childKey, childValue] of Object.entries(value)) {
        walk(childValue, getNestedPath(path, childKey), depth + 1);
      }
    };

    for (const [componentName, value] of Object.entries(componentStats)) {
      walk(value, componentName, 0);
    }

    if (truncated && !this.signalLimitWarningLogged && this.logger?.warn) {
      this.logger.warn(RESOURCE_DIAGNOSTICS_WARNING.SIGNAL_LIMIT_REACHED, {
        nodeId: this.nodeId,
        maxSignalCount: RESOURCE_DIAGNOSTICS_DEFAULT.MAX_SIGNAL_COUNT,
      });
      this.signalLimitWarningLogged = true;
    }

    return result;
  }

  /**
   * Calculate process CPU percent across all cores.
   * @param {number} cpuDeltaUs
   * @param {number} elapsedMs
   * @return {number}
   * @private
   */
  calculateCpuPercent(cpuDeltaUs, elapsedMs) {
    const cpuCount = Math.max(1, os.cpus().length);
    const elapsedUs =
      elapsedMs * RESOURCE_DIAGNOSTICS_DEFAULT.MICROS_PER_MILLISECOND;
    const normalized = cpuDeltaUs / (elapsedUs * cpuCount);
    return roundToTwo(normalized * RESOURCE_DIAGNOSTICS_DEFAULT.PERCENT_FACTOR);
  }

  /**
   * Read total bytes written by this process from /proc/self/io on Linux.
   * Returns null when unavailable.
   * @return {number|null}
   * @private
   */
  readProcessWriteBytes() {
    try {
      const content = fs.readFileSync(
        RESOURCE_DIAGNOSTICS_DEFAULT.PROC_SELF_IO_PATH,
        'utf8',
      );
      const row = content
        .split('\n')
        .find((line) => line.startsWith(
          RESOURCE_DIAGNOSTICS_DEFAULT.WRITE_BYTES_PREFIX,
        ));
      if (!row) {
        return null;
      }
      const parsed = Number(
        row.substring(RESOURCE_DIAGNOSTICS_DEFAULT.WRITE_BYTES_PREFIX.length)
          .trim(),
      );
      return Number.isFinite(parsed) ? parsed : null;
    } catch (_error) {
      return null;
    }
  }
}

export {ResourceDiagnosticsSampler};
