/**
 * Runtime resource diagnostics sampler.
 *
 * Produces point-in-time and trend diagnostics for process resource usage and
 * subsystem counters to help isolate leak and hot-loop behavior.
 */

import {isMainThread} from 'node:worker_threads';
import {effectiveCpuCores, hostBusyPercent, hostTicks} from './resource-cpu-capacity.js';
import {resourceSampleFields} from './placement-resource-sample.js';
import fs from 'node:fs';
import os from 'node:os';
import {monitorEventLoopDelay, performance} from 'node:perf_hooks';
import {NUM, SUBSYSTEM} from '../constants/index.js';
import {LoggingService} from '../logging/logging-service.js';
import {LogsTableService} from '../logging/logs-table-service.js';

const LOCAL_STR_FUNCTION = 'function';
const LOCAL_STR_OBJECT = 'object';
const EVENT_LOOP_DELAY_RESOLUTION_MS = 10;
const NANOS_PER_MILLISECOND = 1_000_000;

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

function readIntervalEventLoopDelayMs(histogram) {
  const meanNs = histogram.mean;
  histogram.reset();
  if (!Number.isFinite(meanNs) || meanNs <= 0) return null;
  const delayMs = Math.max(
    0,
    (meanNs / NANOS_PER_MILLISECOND) - EVENT_LOOP_DELAY_RESOLUTION_MS,
  );
  return roundToTwo(delayMs);
}

function defaultNowMs() {
  return Date.now();
}

function defaultEluSample(prev) {
  return prev ?
    performance.eventLoopUtilization(prev) :
    performance.eventLoopUtilization();
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
    this.nowFn = options.nowFn ?? defaultNowMs;
    this.intervalClock = options.nowFn ?? (() => performance.now());
    this.cpuUsageFn = options.cpuUsageFn ?? (() => process.cpuUsage());
    this.cpusFn = options.cpusFn ?? (() => os.cpus());
    this.threadCpuUsageFn = options.threadCpuUsageFn ??
      (() => isMainThread ? process.threadCpuUsage?.() : null);
    this.lastThreadUsage = this.threadCpuUsageFn();
    this.lastHostTicks = hostTicks(this.cpusFn());
    this.eluFn = options.eluFn ?? defaultEluSample;
    this.eventLoopDelayHistogram = options.eventLoopDelayProvider ?
      null :
      monitorEventLoopDelay({resolution: EVENT_LOOP_DELAY_RESOLUTION_MS});
    this.eventLoopDelayHistogram?.enable();
    this.eventLoopDelayProvider = options.eventLoopDelayProvider ??
      (() => readIntervalEventLoopDelayMs(this.eventLoopDelayHistogram));

    this.nextSampleId = 0;
    this.samples = [];
    this.lastReport = null;
    this.lastReportTimestampMs = null;
    const initialNowMs = this.nowFn();
    this.lastCpuUsage = this.cpuUsageFn();
    this.lastCpuTimestampMs = this.intervalClock();
    this.lastWriteBytes = this.readProcessWriteBytes();
    this.lastWriteTimestampMs = initialNowMs;
    this.lastEluSample = this.eluFn();
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
    const report = {
      nodeId: this.nodeId,
      sampleId: latestSample.sampleId,
      sampleCount: this.samples.length,
      historyLimit: this.historyLimit,
      trendWindowSamples: this.trendWindowSamples,
      latest,
      trend,
      compact: this.buildCompactReport(latest, trend),
    };
    this.lastReport = report;
    this.lastReportTimestampMs = latestSample.timestamp;
    return report;
  }

  /**
   * Return a cached diagnostics report when sampled within maxAgeMs, or
   * collect a fresh one once per observation interval.
   * @param {number} [maxAgeMs=1000]
   * @return {Object}
   */
  getSharedReport(maxAgeMs = RESOURCE_DIAGNOSTICS_DEFAULT.MILLIS_PER_SECOND) {
    const nowMs = this.nowFn();
    const normalizedMaxAgeMs = Number.isFinite(maxAgeMs) && maxAgeMs > 0 ?
      maxAgeMs :
      0;
    if (
      this.lastReport !== null &&
      Number.isFinite(this.lastReportTimestampMs) &&
      nowMs >= this.lastReportTimestampMs &&
      nowMs - this.lastReportTimestampMs < normalizedMaxAgeMs
    ) {
      return this.lastReport;
    }
    return this.getReport();
  }

  /**
   * Build compact operator-facing diagnostics view.
   * @param {Object} latest
   * @param {Object|null} trend
   * @return {Object}
   * @private
   */
  buildCompactReport(latest, trend) {
    const proc = latest?.process || {};
    const tr = trend || {};
    const signals = Array.isArray(tr.topGrowingSignals) ?
      tr.topGrowingSignals.slice(0, RESOURCE_DIAGNOSTICS_DEFAULT.COMPACT_TOP_SIGNAL_LIMIT) :
      [];
    return {
      processCpuPercentOfHostCores: proc.processCpuPercentOfHostCores ?? null,
      cpuCount: proc.cpuCount ?? null,
      ...resourceSampleFields(proc),
      rssGrowthPerMinBytes: tr.rssGrowthPerMinBytes ?? null,
      writeRateBytesPerSec: tr.writeRateBytesPerSec ?? null,
      topGrowingSignals: signals,
    };
  }

  /**
   * Read the latest event-loop delay in milliseconds from the canonical
   * delay provider.
   * @return {number|null}
   * @private
   */
  readEventLoopDelayMs() {
    const value = this.eventLoopDelayProvider();
    return Number.isFinite(value) && value >= 0 ? roundToTwo(value) : null;
  }

  /**
   * Collect and store one sample.
   * @return {Object}
   */
  collect() {
    const nowMs = this.nowFn();
    const memory = process.memoryUsage();
    const processUsage = process.resourceUsage();
    const intervalEndMs = this.intervalClock();
    const cpuUsage = this.cpuUsageFn();
    const cpuDeltaUserUs = Math.max(0, cpuUsage.user - this.lastCpuUsage.user);
    const cpuDeltaSystemUs = Math.max(0, cpuUsage.system - this.lastCpuUsage.system);
    const cpuDeltaTotalUs = cpuDeltaUserUs + cpuDeltaSystemUs;
    const cpus = this.cpusFn();
    const cpuCount = cpus.length;
    const currentHostTicks = hostTicks(cpus);
    const thread = this.threadCpuUsageFn();
    const sampleIntervalMs = intervalEndMs - this.lastCpuTimestampMs;
    const intervalUs = sampleIntervalMs * RESOURCE_DIAGNOSTICS_DEFAULT.MICROS_PER_MILLISECOND;
    const threadDeltaUs = thread && this.lastThreadUsage ?
      thread.user - this.lastThreadUsage.user + thread.system - this.lastThreadUsage.system : null;

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

    const eluDelta = this.eluFn(this.lastEluSample);
    this.lastEluSample = this.eluFn();

    const componentStats = this.collectComponentStats();
    const componentSignals = this.flattenComponentSignals(componentStats);
    this.nextSampleId += 1;

    const sample = {
      sampleId: this.nextSampleId,
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
        cpuCount,
        processCpuPercentOfHostCores: this.calculateProcessCpuPercentOfHostCores(cpuDeltaTotalUs,
          sampleIntervalMs, cpuCount),
        sampleIntervalMs: sampleIntervalMs > 0 ? sampleIntervalMs : null,
        mainThreadCpuPercent: intervalUs > 0 && threadDeltaUs !== null && threadDeltaUs >= 0 ?
          roundToTwo(100 * threadDeltaUs / intervalUs) : null,
        processCpuCores: intervalUs > 0 ? cpuDeltaTotalUs / intervalUs : null,
        effectiveCpuCores: effectiveCpuCores(),
        hostCpuUtilizationPercent: intervalUs > 0 ?
          hostBusyPercent(this.lastHostTicks, currentHostTicks) : null,
        eventLoopUtilizationPercent: intervalUs > 0 && Number.isFinite(eluDelta.utilization) ?
          roundToTwo(eluDelta.utilization * RESOURCE_DIAGNOSTICS_DEFAULT.PERCENT_FACTOR) : null,
        eventLoopDelayMs: this.readEventLoopDelayMs(),
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

    this.lastHostTicks = currentHostTicks;
    this.lastThreadUsage = thread;
    this.lastCpuUsage = cpuUsage;
    this.lastCpuTimestampMs = intervalEndMs;
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
      sampleId: sample.sampleId,
      timestamp: sample.timestamp,
      uptimeSec: roundToTwo(sample.uptimeSec),
      process: {
        rssBytes: sample.process.rssBytes,
        heapUsedBytes: sample.process.heapUsedBytes,
        heapTotalBytes: sample.process.heapTotalBytes,
        externalBytes: sample.process.externalBytes,
        arrayBuffersBytes: sample.process.arrayBuffersBytes,
        cpuCount: sample.process.cpuCount,
        processCpuPercentOfHostCores: sample.process.processCpuPercentOfHostCores,
        ...resourceSampleFields(sample.process),
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
    if (typeof logsTableService?.getStats === LOCAL_STR_FUNCTION) {
      stats.logsTable = logsTableService.getStats();
    }
    if (this.owner && typeof this.owner === LOCAL_STR_OBJECT) {
      for (const component of RESOURCE_DIAGNOSTICS_OWNER_COMPONENT) {
        const componentRef = this.owner[component.field];
        if (!componentRef || typeof componentRef.getStats !== LOCAL_STR_FUNCTION) {
          continue;
        }
        const componentStats = componentRef.getStats();
        if (componentStats && typeof componentStats === LOCAL_STR_OBJECT) {
          stats[component.name] = componentStats;
        }
      }
      if (typeof this.owner.serviceLifecycleManager?.getMetrics === LOCAL_STR_FUNCTION) {
        stats.serviceLifecycleManager = this.owner.serviceLifecycleManager.getMetrics();
      }
      if (typeof this.owner.serviceReconciler?.getStats === LOCAL_STR_FUNCTION) {
        stats.serviceReconciler = this.owner.serviceReconciler.getStats();
      }
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
    let signalCount = 0;
    let truncated = false;

    const walk = (value, path, depth) => {
      if (signalCount >=
        RESOURCE_DIAGNOSTICS_DEFAULT.MAX_SIGNAL_COUNT) {
        truncated = true;
        return;
      }

      if (Number.isFinite(value)) {
        if (!Object.hasOwn(result, path)) {
          signalCount += 1;
        }
        result[path] = value;
        return;
      }

      if (Array.isArray(value)) {
        const lengthPath = `${path}${SIGNAL_PATH.LENGTH_SUFFIX}`;
        if (!Object.hasOwn(result, lengthPath)) {
          signalCount += 1;
        }
        result[lengthPath] = value.length;
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
   * @param {number} cpuCount
   * @return {number|null}
   * @private
   */
  calculateProcessCpuPercentOfHostCores(cpuDeltaUs, elapsedMs, cpuCount) {
    if (!(elapsedMs > 0 && cpuCount > 0)) return null;
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
