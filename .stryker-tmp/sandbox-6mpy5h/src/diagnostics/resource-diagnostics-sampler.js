/**
 * Runtime resource diagnostics sampler.
 *
 * Produces point-in-time and trend diagnostics for process resource usage and
 * subsystem counters to help isolate leak and hot-loop behavior.
 */
// @ts-nocheck
function stryNS_9fa48() {
  var g = typeof globalThis === 'object' && globalThis && globalThis.Math === Math && globalThis || new Function("return this")();
  var ns = g.__stryker__ || (g.__stryker__ = {});
  if (ns.activeMutant === undefined && g.process && g.process.env && g.process.env.__STRYKER_ACTIVE_MUTANT__) {
    ns.activeMutant = g.process.env.__STRYKER_ACTIVE_MUTANT__;
  }
  function retrieveNS() {
    return ns;
  }
  stryNS_9fa48 = retrieveNS;
  return retrieveNS();
}
stryNS_9fa48();
function stryCov_9fa48() {
  var ns = stryNS_9fa48();
  var cov = ns.mutantCoverage || (ns.mutantCoverage = {
    static: {},
    perTest: {}
  });
  function cover() {
    var c = cov.static;
    if (ns.currentTestId) {
      c = cov.perTest[ns.currentTestId] = cov.perTest[ns.currentTestId] || {};
    }
    var a = arguments;
    for (var i = 0; i < a.length; i++) {
      c[a[i]] = (c[a[i]] || 0) + 1;
    }
  }
  stryCov_9fa48 = cover;
  cover.apply(null, arguments);
}
function stryMutAct_9fa48(id) {
  var ns = stryNS_9fa48();
  function isActive(id) {
    if (ns.activeMutant === id) {
      if (ns.hitCount !== void 0 && ++ns.hitCount > ns.hitLimit) {
        throw new Error('Stryker: Hit count limit reached (' + ns.hitCount + ')');
      }
      return true;
    }
    return false;
  }
  stryMutAct_9fa48 = isActive;
  return isActive(id);
}
import fs from 'node:fs';
import os from 'node:os';
import { performance } from 'node:perf_hooks';
import { NUM, SUBSYSTEM } from '../constants/index.js';
import { LoggingService } from '../logging/logging-service.js';
import { LogsTableService } from '../logging/logs-table-service.js';
const RESOURCE_DIAGNOSTICS_DEFAULT = Object.freeze(stryMutAct_9fa48("78809") ? {} : (stryCov_9fa48("78809"), {
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
  PROC_SELF_IO_PATH: stryMutAct_9fa48("78810") ? "" : (stryCov_9fa48("78810"), '/proc/self/io'),
  WRITE_BYTES_PREFIX: stryMutAct_9fa48("78811") ? "" : (stryCov_9fa48("78811"), 'write_bytes:')
}));
const RESOURCE_DIAGNOSTICS_OWNER_COMPONENT = Object.freeze(stryMutAct_9fa48("78812") ? [] : (stryCov_9fa48("78812"), [Object.freeze(stryMutAct_9fa48("78813") ? {} : (stryCov_9fa48("78813"), {
  name: stryMutAct_9fa48("78814") ? "" : (stryCov_9fa48("78814"), 'messageRouter'),
  field: stryMutAct_9fa48("78815") ? "" : (stryCov_9fa48("78815"), 'messageRouter')
})), Object.freeze(stryMutAct_9fa48("78816") ? {} : (stryCov_9fa48("78816"), {
  name: stryMutAct_9fa48("78817") ? "" : (stryCov_9fa48("78817"), 'transport'),
  field: stryMutAct_9fa48("78818") ? "" : (stryCov_9fa48("78818"), 'transport')
})), Object.freeze(stryMutAct_9fa48("78819") ? {} : (stryCov_9fa48("78819"), {
  name: stryMutAct_9fa48("78820") ? "" : (stryCov_9fa48("78820"), 'rpcClient'),
  field: stryMutAct_9fa48("78821") ? "" : (stryCov_9fa48("78821"), 'rpcClient')
})), Object.freeze(stryMutAct_9fa48("78822") ? {} : (stryCov_9fa48("78822"), {
  name: stryMutAct_9fa48("78823") ? "" : (stryCov_9fa48("78823"), 'cdcIntegration'),
  field: stryMutAct_9fa48("78824") ? "" : (stryCov_9fa48("78824"), 'cdcIntegrationService')
})), Object.freeze(stryMutAct_9fa48("78825") ? {} : (stryCov_9fa48("78825"), {
  name: stryMutAct_9fa48("78826") ? "" : (stryCov_9fa48("78826"), 'replicaHandler'),
  field: stryMutAct_9fa48("78827") ? "" : (stryCov_9fa48("78827"), 'replicaHandler')
})), Object.freeze(stryMutAct_9fa48("78828") ? {} : (stryCov_9fa48("78828"), {
  name: stryMutAct_9fa48("78829") ? "" : (stryCov_9fa48("78829"), 'replicaStateMachine'),
  field: stryMutAct_9fa48("78830") ? "" : (stryCov_9fa48("78830"), 'replicaStateMachine')
})), Object.freeze(stryMutAct_9fa48("78831") ? {} : (stryCov_9fa48("78831"), {
  name: stryMutAct_9fa48("78832") ? "" : (stryCov_9fa48("78832"), 'heartbeatService'),
  field: stryMutAct_9fa48("78833") ? "" : (stryCov_9fa48("78833"), 'heartbeatService')
})), Object.freeze(stryMutAct_9fa48("78834") ? {} : (stryCov_9fa48("78834"), {
  name: stryMutAct_9fa48("78835") ? "" : (stryCov_9fa48("78835"), 'leaseService'),
  field: stryMutAct_9fa48("78836") ? "" : (stryCov_9fa48("78836"), 'leaseService')
})), Object.freeze(stryMutAct_9fa48("78837") ? {} : (stryCov_9fa48("78837"), {
  name: stryMutAct_9fa48("78838") ? "" : (stryCov_9fa48("78838"), 'endpointService'),
  field: stryMutAct_9fa48("78839") ? "" : (stryCov_9fa48("78839"), 'endpointService')
})), Object.freeze(stryMutAct_9fa48("78840") ? {} : (stryCov_9fa48("78840"), {
  name: stryMutAct_9fa48("78841") ? "" : (stryCov_9fa48("78841"), 'dispatchService'),
  field: stryMutAct_9fa48("78842") ? "" : (stryCov_9fa48("78842"), 'dispatchService')
})), Object.freeze(stryMutAct_9fa48("78843") ? {} : (stryCov_9fa48("78843"), {
  name: stryMutAct_9fa48("78844") ? "" : (stryCov_9fa48("78844"), 'tablePolicyService'),
  field: stryMutAct_9fa48("78845") ? "" : (stryCov_9fa48("78845"), 'tablePolicyService')
})), Object.freeze(stryMutAct_9fa48("78846") ? {} : (stryCov_9fa48("78846"), {
  name: stryMutAct_9fa48("78847") ? "" : (stryCov_9fa48("78847"), 'latencyTopology'),
  field: stryMutAct_9fa48("78848") ? "" : (stryCov_9fa48("78848"), 'latencyTopology')
})), Object.freeze(stryMutAct_9fa48("78849") ? {} : (stryCov_9fa48("78849"), {
  name: stryMutAct_9fa48("78850") ? "" : (stryCov_9fa48("78850"), 'runtimeServiceHandler'),
  field: stryMutAct_9fa48("78851") ? "" : (stryCov_9fa48("78851"), 'runtimeServiceHandler')
}))]));
const RESOURCE_DIAGNOSTICS_WARNING = Object.freeze(stryMutAct_9fa48("78852") ? {} : (stryCov_9fa48("78852"), {
  SIGNAL_LIMIT_REACHED: stryMutAct_9fa48("78853") ? "" : (stryCov_9fa48("78853"), 'Resource diagnostics signal limit reached; truncating component signal extraction')
}));
const SIGNAL_PATH = Object.freeze(stryMutAct_9fa48("78854") ? {} : (stryCov_9fa48("78854"), {
  DOT: stryMutAct_9fa48("78855") ? "" : (stryCov_9fa48("78855"), '.'),
  LENGTH_SUFFIX: stryMutAct_9fa48("78856") ? "" : (stryCov_9fa48("78856"), '.length')
}));
const UNKNOWN_NODE_ID = stryMutAct_9fa48("78857") ? "" : (stryCov_9fa48("78857"), 'unknown-node');
function normalizePositiveInteger(value, fallback) {
  if (stryMutAct_9fa48("78858")) {
    {}
  } else {
    stryCov_9fa48("78858");
    const parsed = Number(value);
    if (stryMutAct_9fa48("78861") ? !Number.isFinite(parsed) && parsed <= NUM.ZERO : stryMutAct_9fa48("78860") ? false : stryMutAct_9fa48("78859") ? true : (stryCov_9fa48("78859", "78860", "78861"), (stryMutAct_9fa48("78862") ? Number.isFinite(parsed) : (stryCov_9fa48("78862"), !Number.isFinite(parsed))) || (stryMutAct_9fa48("78865") ? parsed > NUM.ZERO : stryMutAct_9fa48("78864") ? parsed < NUM.ZERO : stryMutAct_9fa48("78863") ? false : (stryCov_9fa48("78863", "78864", "78865"), parsed <= NUM.ZERO)))) {
      if (stryMutAct_9fa48("78866")) {
        {}
      } else {
        stryCov_9fa48("78866");
        return fallback;
      }
    }
    return Math.floor(parsed);
  }
}
function roundToTwo(value) {
  if (stryMutAct_9fa48("78867")) {
    {}
  } else {
    stryCov_9fa48("78867");
    if (stryMutAct_9fa48("78870") ? false : stryMutAct_9fa48("78869") ? true : stryMutAct_9fa48("78868") ? Number.isFinite(value) : (stryCov_9fa48("78868", "78869", "78870"), !Number.isFinite(value))) {
      if (stryMutAct_9fa48("78871")) {
        {}
      } else {
        stryCov_9fa48("78871");
        return NUM.ZERO;
      }
    }
    return stryMutAct_9fa48("78872") ? Math.round(value * RESOURCE_DIAGNOSTICS_DEFAULT.PERCENT_FACTOR) * RESOURCE_DIAGNOSTICS_DEFAULT.PERCENT_FACTOR : (stryCov_9fa48("78872"), Math.round(stryMutAct_9fa48("78873") ? value / RESOURCE_DIAGNOSTICS_DEFAULT.PERCENT_FACTOR : (stryCov_9fa48("78873"), value * RESOURCE_DIAGNOSTICS_DEFAULT.PERCENT_FACTOR)) / RESOURCE_DIAGNOSTICS_DEFAULT.PERCENT_FACTOR);
  }
}
function getNestedPath(parentPath, childKey) {
  if (stryMutAct_9fa48("78874")) {
    {}
  } else {
    stryCov_9fa48("78874");
    if (stryMutAct_9fa48("78877") ? false : stryMutAct_9fa48("78876") ? true : stryMutAct_9fa48("78875") ? parentPath : (stryCov_9fa48("78875", "78876", "78877"), !parentPath)) {
      if (stryMutAct_9fa48("78878")) {
        {}
      } else {
        stryCov_9fa48("78878");
        return String(childKey);
      }
    }
    return stryMutAct_9fa48("78879") ? `` : (stryCov_9fa48("78879"), `${parentPath}${SIGNAL_PATH.DOT}${childKey}`);
  }
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
    if (stryMutAct_9fa48("78880")) {
      {}
    } else {
      stryCov_9fa48("78880");
      this.nodeId = stryMutAct_9fa48("78883") ? options.nodeId && UNKNOWN_NODE_ID : stryMutAct_9fa48("78882") ? false : stryMutAct_9fa48("78881") ? true : (stryCov_9fa48("78881", "78882", "78883"), options.nodeId || UNKNOWN_NODE_ID);
      this.owner = stryMutAct_9fa48("78886") ? options.owner && null : stryMutAct_9fa48("78885") ? false : stryMutAct_9fa48("78884") ? true : (stryCov_9fa48("78884", "78885", "78886"), options.owner || null);
      this.historyLimit = normalizePositiveInteger(options.historyLimit, RESOURCE_DIAGNOSTICS_DEFAULT.HISTORY_LIMIT);
      this.trendWindowSamples = normalizePositiveInteger(options.trendWindowSamples, RESOURCE_DIAGNOSTICS_DEFAULT.TREND_WINDOW_SAMPLES);
      this.topSignalLimit = normalizePositiveInteger(options.topSignalLimit, RESOURCE_DIAGNOSTICS_DEFAULT.TOP_SIGNAL_LIMIT);
      this.samples = stryMutAct_9fa48("78887") ? ["Stryker was here"] : (stryCov_9fa48("78887"), []);
      this.lastCpuUsage = process.cpuUsage();
      this.lastCpuTimestampMs = Date.now();
      this.lastWriteBytes = this.readProcessWriteBytes();
      this.lastWriteTimestampMs = Date.now();
      this.lastEluSample = performance.eventLoopUtilization();
      this.signalLimitWarningLogged = stryMutAct_9fa48("78888") ? true : (stryCov_9fa48("78888"), false);
      const loggingService = LoggingService.getInstance();
      this.logger = loggingService.isInitialized() ? loggingService.forSubsystem(SUBSYSTEM.RESOURCE_DIAGNOSTICS) : console;
    }
  }

  /**
   * Collect a new sample and return full diagnostics report.
   * @return {Object}
   */
  getReport() {
    if (stryMutAct_9fa48("78889")) {
      {}
    } else {
      stryCov_9fa48("78889");
      const latestSample = this.collect();
      const latest = this.buildPublicSample(latestSample);
      const trend = this.buildTrendReport();
      return stryMutAct_9fa48("78890") ? {} : (stryCov_9fa48("78890"), {
        nodeId: this.nodeId,
        sampleCount: this.samples.length,
        historyLimit: this.historyLimit,
        trendWindowSamples: this.trendWindowSamples,
        latest,
        trend,
        compact: this.buildCompactReport(latest, trend)
      });
    }
  }

  /**
   * Build compact operator-facing diagnostics view.
   * @param {Object} latest
   * @param {Object|null} trend
   * @return {Object}
   * @private
   */
  buildCompactReport(latest, trend) {
    if (stryMutAct_9fa48("78891")) {
      {}
    } else {
      stryCov_9fa48("78891");
      return stryMutAct_9fa48("78892") ? {} : (stryCov_9fa48("78892"), {
        cpuPercent: stryMutAct_9fa48("78893") ? latest?.process?.cpuPercent && null : (stryCov_9fa48("78893"), (stryMutAct_9fa48("78895") ? latest.process?.cpuPercent : stryMutAct_9fa48("78894") ? latest?.process.cpuPercent : (stryCov_9fa48("78894", "78895"), latest?.process?.cpuPercent)) ?? null),
        eventLoopUtilizationPercent: stryMutAct_9fa48("78896") ? latest?.process?.eventLoopUtilizationPercent && null : (stryCov_9fa48("78896"), (stryMutAct_9fa48("78898") ? latest.process?.eventLoopUtilizationPercent : stryMutAct_9fa48("78897") ? latest?.process.eventLoopUtilizationPercent : (stryCov_9fa48("78897", "78898"), latest?.process?.eventLoopUtilizationPercent)) ?? null),
        rssGrowthPerMinBytes: stryMutAct_9fa48("78899") ? trend?.rssGrowthPerMinBytes && null : (stryCov_9fa48("78899"), (stryMutAct_9fa48("78900") ? trend.rssGrowthPerMinBytes : (stryCov_9fa48("78900"), trend?.rssGrowthPerMinBytes)) ?? null),
        writeRateBytesPerSec: stryMutAct_9fa48("78901") ? trend?.writeRateBytesPerSec && null : (stryCov_9fa48("78901"), (stryMutAct_9fa48("78902") ? trend.writeRateBytesPerSec : (stryCov_9fa48("78902"), trend?.writeRateBytesPerSec)) ?? null),
        topGrowingSignals: Array.isArray(stryMutAct_9fa48("78903") ? trend.topGrowingSignals : (stryCov_9fa48("78903"), trend?.topGrowingSignals)) ? stryMutAct_9fa48("78904") ? trend.topGrowingSignals : (stryCov_9fa48("78904"), trend.topGrowingSignals.slice(NUM.ZERO, RESOURCE_DIAGNOSTICS_DEFAULT.COMPACT_TOP_SIGNAL_LIMIT)) : stryMutAct_9fa48("78905") ? ["Stryker was here"] : (stryCov_9fa48("78905"), [])
      });
    }
  }

  /**
   * Collect and store one sample.
   * @return {Object}
   */
  collect() {
    if (stryMutAct_9fa48("78906")) {
      {}
    } else {
      stryCov_9fa48("78906");
      const nowMs = Date.now();
      const memory = process.memoryUsage();
      const processUsage = process.resourceUsage();
      const cpuUsage = process.cpuUsage();
      const cpuDeltaUserUs = stryMutAct_9fa48("78907") ? cpuUsage.user + this.lastCpuUsage.user : (stryCov_9fa48("78907"), cpuUsage.user - this.lastCpuUsage.user);
      const cpuDeltaSystemUs = stryMutAct_9fa48("78908") ? cpuUsage.system + this.lastCpuUsage.system : (stryCov_9fa48("78908"), cpuUsage.system - this.lastCpuUsage.system);
      const cpuDeltaTotalUs = stryMutAct_9fa48("78909") ? cpuDeltaUserUs - cpuDeltaSystemUs : (stryCov_9fa48("78909"), cpuDeltaUserUs + cpuDeltaSystemUs);
      const elapsedCpuMs = stryMutAct_9fa48("78910") ? Math.min(RESOURCE_DIAGNOSTICS_DEFAULT.MIN_ELAPSED_MS, nowMs - this.lastCpuTimestampMs) : (stryCov_9fa48("78910"), Math.max(RESOURCE_DIAGNOSTICS_DEFAULT.MIN_ELAPSED_MS, stryMutAct_9fa48("78911") ? nowMs + this.lastCpuTimestampMs : (stryCov_9fa48("78911"), nowMs - this.lastCpuTimestampMs)));
      const writeBytesTotal = this.readProcessWriteBytes();
      const elapsedIoMs = stryMutAct_9fa48("78912") ? Math.min(RESOURCE_DIAGNOSTICS_DEFAULT.MIN_ELAPSED_MS, nowMs - this.lastWriteTimestampMs) : (stryCov_9fa48("78912"), Math.max(RESOURCE_DIAGNOSTICS_DEFAULT.MIN_ELAPSED_MS, stryMutAct_9fa48("78913") ? nowMs + this.lastWriteTimestampMs : (stryCov_9fa48("78913"), nowMs - this.lastWriteTimestampMs)));
      const writeBytesDelta = (stryMutAct_9fa48("78916") ? Number.isFinite(writeBytesTotal) || Number.isFinite(this.lastWriteBytes) : stryMutAct_9fa48("78915") ? false : stryMutAct_9fa48("78914") ? true : (stryCov_9fa48("78914", "78915", "78916"), Number.isFinite(writeBytesTotal) && Number.isFinite(this.lastWriteBytes))) ? stryMutAct_9fa48("78917") ? Math.min(NUM.ZERO, writeBytesTotal - this.lastWriteBytes) : (stryCov_9fa48("78917"), Math.max(NUM.ZERO, stryMutAct_9fa48("78918") ? writeBytesTotal + this.lastWriteBytes : (stryCov_9fa48("78918"), writeBytesTotal - this.lastWriteBytes))) : null;
      const writeBytesPerSec = Number.isFinite(writeBytesDelta) ? stryMutAct_9fa48("78919") ? writeBytesDelta * (elapsedIoMs / RESOURCE_DIAGNOSTICS_DEFAULT.MILLIS_PER_SECOND) : (stryCov_9fa48("78919"), writeBytesDelta / (stryMutAct_9fa48("78920") ? elapsedIoMs * RESOURCE_DIAGNOSTICS_DEFAULT.MILLIS_PER_SECOND : (stryCov_9fa48("78920"), elapsedIoMs / RESOURCE_DIAGNOSTICS_DEFAULT.MILLIS_PER_SECOND))) : null;
      const eluDelta = performance.eventLoopUtilization(this.lastEluSample);
      this.lastEluSample = performance.eventLoopUtilization();
      const componentStats = this.collectComponentStats();
      const componentSignals = this.flattenComponentSignals(componentStats);
      const sample = stryMutAct_9fa48("78921") ? {} : (stryCov_9fa48("78921"), {
        timestamp: nowMs,
        uptimeSec: process.uptime(),
        process: stryMutAct_9fa48("78922") ? {} : (stryCov_9fa48("78922"), {
          rssBytes: memory.rss,
          heapUsedBytes: memory.heapUsed,
          heapTotalBytes: memory.heapTotal,
          externalBytes: memory.external,
          arrayBuffersBytes: memory.arrayBuffers,
          cpuUserDeltaUs: cpuDeltaUserUs,
          cpuSystemDeltaUs: cpuDeltaSystemUs,
          cpuPercent: this.calculateCpuPercent(cpuDeltaTotalUs, elapsedCpuMs),
          eventLoopUtilizationPercent: roundToTwo(stryMutAct_9fa48("78923") ? eluDelta.utilization / RESOURCE_DIAGNOSTICS_DEFAULT.PERCENT_FACTOR : (stryCov_9fa48("78923"), eluDelta.utilization * RESOURCE_DIAGNOSTICS_DEFAULT.PERCENT_FACTOR)),
          maxRssBytes: stryMutAct_9fa48("78924") ? processUsage.maxRSS / NUM.BYTES_PER_KIB : (stryCov_9fa48("78924"), processUsage.maxRSS * NUM.BYTES_PER_KIB),
          fsReadOps: processUsage.fsRead,
          fsWriteOps: processUsage.fsWrite
        }),
        io: stryMutAct_9fa48("78925") ? {} : (stryCov_9fa48("78925"), {
          writeBytesTotal,
          writeBytesDelta,
          writeBytesPerSec: Number.isFinite(writeBytesPerSec) ? roundToTwo(writeBytesPerSec) : null
        }),
        components: componentStats,
        componentSignals
      });
      this.lastCpuUsage = cpuUsage;
      this.lastCpuTimestampMs = nowMs;
      this.lastWriteBytes = writeBytesTotal;
      this.lastWriteTimestampMs = nowMs;
      this.samples.push(sample);
      if (stryMutAct_9fa48("78929") ? this.samples.length <= this.historyLimit : stryMutAct_9fa48("78928") ? this.samples.length >= this.historyLimit : stryMutAct_9fa48("78927") ? false : stryMutAct_9fa48("78926") ? true : (stryCov_9fa48("78926", "78927", "78928", "78929"), this.samples.length > this.historyLimit)) {
        if (stryMutAct_9fa48("78930")) {
          {}
        } else {
          stryCov_9fa48("78930");
          this.samples.shift();
        }
      }
      return sample;
    }
  }

  /**
   * Build a compact public sample view.
   * @param {Object} sample
   * @return {Object}
   * @private
   */
  buildPublicSample(sample) {
    if (stryMutAct_9fa48("78931")) {
      {}
    } else {
      stryCov_9fa48("78931");
      return stryMutAct_9fa48("78932") ? {} : (stryCov_9fa48("78932"), {
        timestamp: sample.timestamp,
        uptimeSec: roundToTwo(sample.uptimeSec),
        process: stryMutAct_9fa48("78933") ? {} : (stryCov_9fa48("78933"), {
          rssBytes: sample.process.rssBytes,
          heapUsedBytes: sample.process.heapUsedBytes,
          heapTotalBytes: sample.process.heapTotalBytes,
          externalBytes: sample.process.externalBytes,
          arrayBuffersBytes: sample.process.arrayBuffersBytes,
          cpuPercent: sample.process.cpuPercent,
          eventLoopUtilizationPercent: sample.process.eventLoopUtilizationPercent,
          fsReadOps: sample.process.fsReadOps,
          fsWriteOps: sample.process.fsWriteOps
        }),
        io: stryMutAct_9fa48("78934") ? {} : (stryCov_9fa48("78934"), {
          writeBytesTotal: sample.io.writeBytesTotal,
          writeBytesDelta: sample.io.writeBytesDelta,
          writeBytesPerSec: sample.io.writeBytesPerSec
        }),
        components: sample.components
      });
    }
  }

  /**
   * Build trend report from recent samples.
   * @return {Object|null}
   * @private
   */
  buildTrendReport() {
    if (stryMutAct_9fa48("78935")) {
      {}
    } else {
      stryCov_9fa48("78935");
      if (stryMutAct_9fa48("78939") ? this.samples.length >= 2 : stryMutAct_9fa48("78938") ? this.samples.length <= 2 : stryMutAct_9fa48("78937") ? false : stryMutAct_9fa48("78936") ? true : (stryCov_9fa48("78936", "78937", "78938", "78939"), this.samples.length < 2)) {
        if (stryMutAct_9fa48("78940")) {
          {}
        } else {
          stryCov_9fa48("78940");
          return null;
        }
      }
      const windowSize = stryMutAct_9fa48("78941") ? Math.max(this.trendWindowSamples, this.samples.length - 1) : (stryCov_9fa48("78941"), Math.min(this.trendWindowSamples, stryMutAct_9fa48("78942") ? this.samples.length + 1 : (stryCov_9fa48("78942"), this.samples.length - 1)));
      const startIndex = stryMutAct_9fa48("78943") ? this.samples.length - 1 + windowSize : (stryCov_9fa48("78943"), (stryMutAct_9fa48("78944") ? this.samples.length + 1 : (stryCov_9fa48("78944"), this.samples.length - 1)) - windowSize);
      const start = this.samples[startIndex];
      const end = this.samples[stryMutAct_9fa48("78945") ? this.samples.length + 1 : (stryCov_9fa48("78945"), this.samples.length - 1)];
      const elapsedSec = stryMutAct_9fa48("78946") ? Math.min(RESOURCE_DIAGNOSTICS_DEFAULT.MIN_ELAPSED_MS / RESOURCE_DIAGNOSTICS_DEFAULT.MILLIS_PER_SECOND, (end.timestamp - start.timestamp) / RESOURCE_DIAGNOSTICS_DEFAULT.MILLIS_PER_SECOND) : (stryCov_9fa48("78946"), Math.max(stryMutAct_9fa48("78947") ? RESOURCE_DIAGNOSTICS_DEFAULT.MIN_ELAPSED_MS * RESOURCE_DIAGNOSTICS_DEFAULT.MILLIS_PER_SECOND : (stryCov_9fa48("78947"), RESOURCE_DIAGNOSTICS_DEFAULT.MIN_ELAPSED_MS / RESOURCE_DIAGNOSTICS_DEFAULT.MILLIS_PER_SECOND), stryMutAct_9fa48("78948") ? (end.timestamp - start.timestamp) * RESOURCE_DIAGNOSTICS_DEFAULT.MILLIS_PER_SECOND : (stryCov_9fa48("78948"), (stryMutAct_9fa48("78949") ? end.timestamp + start.timestamp : (stryCov_9fa48("78949"), end.timestamp - start.timestamp)) / RESOURCE_DIAGNOSTICS_DEFAULT.MILLIS_PER_SECOND)));
      const elapsedMinutes = stryMutAct_9fa48("78950") ? elapsedSec * RESOURCE_DIAGNOSTICS_DEFAULT.SECONDS_PER_MINUTE : (stryCov_9fa48("78950"), elapsedSec / RESOURCE_DIAGNOSTICS_DEFAULT.SECONDS_PER_MINUTE);
      const rssDeltaBytes = stryMutAct_9fa48("78951") ? end.process.rssBytes + start.process.rssBytes : (stryCov_9fa48("78951"), end.process.rssBytes - start.process.rssBytes);
      const heapDeltaBytes = stryMutAct_9fa48("78952") ? end.process.heapUsedBytes + start.process.heapUsedBytes : (stryCov_9fa48("78952"), end.process.heapUsedBytes - start.process.heapUsedBytes);
      const writeDeltaBytes = (stryMutAct_9fa48("78955") ? Number.isFinite(end.io.writeBytesTotal) || Number.isFinite(start.io.writeBytesTotal) : stryMutAct_9fa48("78954") ? false : stryMutAct_9fa48("78953") ? true : (stryCov_9fa48("78953", "78954", "78955"), Number.isFinite(end.io.writeBytesTotal) && Number.isFinite(start.io.writeBytesTotal))) ? stryMutAct_9fa48("78956") ? end.io.writeBytesTotal + start.io.writeBytesTotal : (stryCov_9fa48("78956"), end.io.writeBytesTotal - start.io.writeBytesTotal) : null;
      return stryMutAct_9fa48("78957") ? {} : (stryCov_9fa48("78957"), {
        windowSamples: stryMutAct_9fa48("78958") ? windowSize - NUM.ONE : (stryCov_9fa48("78958"), windowSize + NUM.ONE),
        elapsedSec: roundToTwo(elapsedSec),
        rssDeltaBytes,
        heapUsedDeltaBytes: heapDeltaBytes,
        rssGrowthPerMinBytes: roundToTwo(stryMutAct_9fa48("78959") ? rssDeltaBytes * elapsedMinutes : (stryCov_9fa48("78959"), rssDeltaBytes / elapsedMinutes)),
        heapGrowthPerMinBytes: roundToTwo(stryMutAct_9fa48("78960") ? heapDeltaBytes * elapsedMinutes : (stryCov_9fa48("78960"), heapDeltaBytes / elapsedMinutes)),
        writeDeltaBytes,
        writeRateBytesPerSec: Number.isFinite(writeDeltaBytes) ? roundToTwo(stryMutAct_9fa48("78961") ? writeDeltaBytes * elapsedSec : (stryCov_9fa48("78961"), writeDeltaBytes / elapsedSec)) : null,
        topGrowingSignals: this.computeTopGrowingSignals(start.componentSignals, end.componentSignals, elapsedSec)
      });
    }
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
    if (stryMutAct_9fa48("78962")) {
      {}
    } else {
      stryCov_9fa48("78962");
      const results = stryMutAct_9fa48("78963") ? ["Stryker was here"] : (stryCov_9fa48("78963"), []);
      for (const [signal, endValue] of Object.entries(endSignals)) {
        if (stryMutAct_9fa48("78964")) {
          {}
        } else {
          stryCov_9fa48("78964");
          const startValue = Number.isFinite(startSignals[signal]) ? startSignals[signal] : NUM.ZERO;
          const delta = stryMutAct_9fa48("78965") ? endValue + startValue : (stryCov_9fa48("78965"), endValue - startValue);
          if (stryMutAct_9fa48("78968") ? !Number.isFinite(delta) && delta <= NUM.ZERO : stryMutAct_9fa48("78967") ? false : stryMutAct_9fa48("78966") ? true : (stryCov_9fa48("78966", "78967", "78968"), (stryMutAct_9fa48("78969") ? Number.isFinite(delta) : (stryCov_9fa48("78969"), !Number.isFinite(delta))) || (stryMutAct_9fa48("78972") ? delta > NUM.ZERO : stryMutAct_9fa48("78971") ? delta < NUM.ZERO : stryMutAct_9fa48("78970") ? false : (stryCov_9fa48("78970", "78971", "78972"), delta <= NUM.ZERO)))) {
            if (stryMutAct_9fa48("78973")) {
              {}
            } else {
              stryCov_9fa48("78973");
              continue;
            }
          }
          results.push(stryMutAct_9fa48("78974") ? {} : (stryCov_9fa48("78974"), {
            signal,
            delta,
            ratePerSec: roundToTwo(stryMutAct_9fa48("78975") ? delta * elapsedSec : (stryCov_9fa48("78975"), delta / elapsedSec))
          }));
        }
      }
      return stryMutAct_9fa48("78977") ? results.slice(NUM.ZERO, this.topSignalLimit) : stryMutAct_9fa48("78976") ? results.sort((left, right) => right.delta - left.delta) : (stryCov_9fa48("78976", "78977"), results.sort(stryMutAct_9fa48("78978") ? () => undefined : (stryCov_9fa48("78978"), (left, right) => stryMutAct_9fa48("78979") ? right.delta + left.delta : (stryCov_9fa48("78979"), right.delta - left.delta))).slice(NUM.ZERO, this.topSignalLimit));
    }
  }

  /**
   * Collect component stats from logging, logs table service, and owner fields.
   * @return {Object}
   * @private
   */
  collectComponentStats() {
    if (stryMutAct_9fa48("78980")) {
      {}
    } else {
      stryCov_9fa48("78980");
      const stats = {};
      const loggingService = LoggingService.getInstance();
      if (stryMutAct_9fa48("78983") ? loggingService.isInitialized() || typeof loggingService.getDiagnosticsStats === 'function' : stryMutAct_9fa48("78982") ? false : stryMutAct_9fa48("78981") ? true : (stryCov_9fa48("78981", "78982", "78983"), loggingService.isInitialized() && (stryMutAct_9fa48("78985") ? typeof loggingService.getDiagnosticsStats !== 'function' : stryMutAct_9fa48("78984") ? true : (stryCov_9fa48("78984", "78985"), typeof loggingService.getDiagnosticsStats === (stryMutAct_9fa48("78986") ? "" : (stryCov_9fa48("78986"), 'function')))))) {
        if (stryMutAct_9fa48("78987")) {
          {}
        } else {
          stryCov_9fa48("78987");
          stats.logging = loggingService.getDiagnosticsStats();
        }
      }
      const logsTableService = LogsTableService.instance;
      if (stryMutAct_9fa48("78990") ? logsTableService || typeof logsTableService.getStats === 'function' : stryMutAct_9fa48("78989") ? false : stryMutAct_9fa48("78988") ? true : (stryCov_9fa48("78988", "78989", "78990"), logsTableService && (stryMutAct_9fa48("78992") ? typeof logsTableService.getStats !== 'function' : stryMutAct_9fa48("78991") ? true : (stryCov_9fa48("78991", "78992"), typeof logsTableService.getStats === (stryMutAct_9fa48("78993") ? "" : (stryCov_9fa48("78993"), 'function')))))) {
        if (stryMutAct_9fa48("78994")) {
          {}
        } else {
          stryCov_9fa48("78994");
          stats.logsTable = logsTableService.getStats();
        }
      }
      const owner = this.owner;
      if (stryMutAct_9fa48("78997") ? !owner && typeof owner !== 'object' : stryMutAct_9fa48("78996") ? false : stryMutAct_9fa48("78995") ? true : (stryCov_9fa48("78995", "78996", "78997"), (stryMutAct_9fa48("78998") ? owner : (stryCov_9fa48("78998"), !owner)) || (stryMutAct_9fa48("79000") ? typeof owner === 'object' : stryMutAct_9fa48("78999") ? false : (stryCov_9fa48("78999", "79000"), typeof owner !== (stryMutAct_9fa48("79001") ? "" : (stryCov_9fa48("79001"), 'object')))))) {
        if (stryMutAct_9fa48("79002")) {
          {}
        } else {
          stryCov_9fa48("79002");
          return stats;
        }
      }
      for (const component of RESOURCE_DIAGNOSTICS_OWNER_COMPONENT) {
        if (stryMutAct_9fa48("79003")) {
          {}
        } else {
          stryCov_9fa48("79003");
          const componentRef = owner[component.field];
          if (stryMutAct_9fa48("79006") ? !componentRef && typeof componentRef.getStats !== 'function' : stryMutAct_9fa48("79005") ? false : stryMutAct_9fa48("79004") ? true : (stryCov_9fa48("79004", "79005", "79006"), (stryMutAct_9fa48("79007") ? componentRef : (stryCov_9fa48("79007"), !componentRef)) || (stryMutAct_9fa48("79009") ? typeof componentRef.getStats === 'function' : stryMutAct_9fa48("79008") ? false : (stryCov_9fa48("79008", "79009"), typeof componentRef.getStats !== (stryMutAct_9fa48("79010") ? "" : (stryCov_9fa48("79010"), 'function')))))) {
            if (stryMutAct_9fa48("79011")) {
              {}
            } else {
              stryCov_9fa48("79011");
              continue;
            }
          }
          const componentStats = componentRef.getStats();
          if (stryMutAct_9fa48("79014") ? (!componentStats || typeof componentStats !== 'object') && typeof componentStats.then === 'function' : stryMutAct_9fa48("79013") ? false : stryMutAct_9fa48("79012") ? true : (stryCov_9fa48("79012", "79013", "79014"), (stryMutAct_9fa48("79016") ? !componentStats && typeof componentStats !== 'object' : stryMutAct_9fa48("79015") ? false : (stryCov_9fa48("79015", "79016"), (stryMutAct_9fa48("79017") ? componentStats : (stryCov_9fa48("79017"), !componentStats)) || (stryMutAct_9fa48("79019") ? typeof componentStats === 'object' : stryMutAct_9fa48("79018") ? false : (stryCov_9fa48("79018", "79019"), typeof componentStats !== (stryMutAct_9fa48("79020") ? "" : (stryCov_9fa48("79020"), 'object')))))) || (stryMutAct_9fa48("79022") ? typeof componentStats.then !== 'function' : stryMutAct_9fa48("79021") ? false : (stryCov_9fa48("79021", "79022"), typeof componentStats.then === (stryMutAct_9fa48("79023") ? "" : (stryCov_9fa48("79023"), 'function')))))) {
            if (stryMutAct_9fa48("79024")) {
              {}
            } else {
              stryCov_9fa48("79024");
              continue;
            }
          }
          stats[component.name] = componentStats;
        }
      }
      if (stryMutAct_9fa48("79027") ? owner.serviceLifecycleManager || typeof owner.serviceLifecycleManager.getMetrics === 'function' : stryMutAct_9fa48("79026") ? false : stryMutAct_9fa48("79025") ? true : (stryCov_9fa48("79025", "79026", "79027"), owner.serviceLifecycleManager && (stryMutAct_9fa48("79029") ? typeof owner.serviceLifecycleManager.getMetrics !== 'function' : stryMutAct_9fa48("79028") ? true : (stryCov_9fa48("79028", "79029"), typeof owner.serviceLifecycleManager.getMetrics === (stryMutAct_9fa48("79030") ? "" : (stryCov_9fa48("79030"), 'function')))))) {
        if (stryMutAct_9fa48("79031")) {
          {}
        } else {
          stryCov_9fa48("79031");
          stats.serviceLifecycleManager = owner.serviceLifecycleManager.getMetrics();
        }
      }
      if (stryMutAct_9fa48("79034") ? owner.serviceReconciler || typeof owner.serviceReconciler.getStats === 'function' : stryMutAct_9fa48("79033") ? false : stryMutAct_9fa48("79032") ? true : (stryCov_9fa48("79032", "79033", "79034"), owner.serviceReconciler && (stryMutAct_9fa48("79036") ? typeof owner.serviceReconciler.getStats !== 'function' : stryMutAct_9fa48("79035") ? true : (stryCov_9fa48("79035", "79036"), typeof owner.serviceReconciler.getStats === (stryMutAct_9fa48("79037") ? "" : (stryCov_9fa48("79037"), 'function')))))) {
        if (stryMutAct_9fa48("79038")) {
          {}
        } else {
          stryCov_9fa48("79038");
          stats.serviceReconciler = owner.serviceReconciler.getStats();
        }
      }
      return stats;
    }
  }

  /**
   * Flatten nested component stats into numeric leaf signals.
   * @param {Object} componentStats
   * @return {Object}
   * @private
   */
  flattenComponentSignals(componentStats) {
    if (stryMutAct_9fa48("79039")) {
      {}
    } else {
      stryCov_9fa48("79039");
      const result = {};
      let truncated = stryMutAct_9fa48("79040") ? true : (stryCov_9fa48("79040"), false);
      const walk = (value, path, depth) => {
        if (stryMutAct_9fa48("79041")) {
          {}
        } else {
          stryCov_9fa48("79041");
          if (stryMutAct_9fa48("79045") ? Object.keys(result).length < RESOURCE_DIAGNOSTICS_DEFAULT.MAX_SIGNAL_COUNT : stryMutAct_9fa48("79044") ? Object.keys(result).length > RESOURCE_DIAGNOSTICS_DEFAULT.MAX_SIGNAL_COUNT : stryMutAct_9fa48("79043") ? false : stryMutAct_9fa48("79042") ? true : (stryCov_9fa48("79042", "79043", "79044", "79045"), Object.keys(result).length >= RESOURCE_DIAGNOSTICS_DEFAULT.MAX_SIGNAL_COUNT)) {
            if (stryMutAct_9fa48("79046")) {
              {}
            } else {
              stryCov_9fa48("79046");
              truncated = stryMutAct_9fa48("79047") ? false : (stryCov_9fa48("79047"), true);
              return;
            }
          }
          if (stryMutAct_9fa48("79049") ? false : stryMutAct_9fa48("79048") ? true : (stryCov_9fa48("79048", "79049"), Number.isFinite(value))) {
            if (stryMutAct_9fa48("79050")) {
              {}
            } else {
              stryCov_9fa48("79050");
              result[path] = value;
              return;
            }
          }
          if (stryMutAct_9fa48("79052") ? false : stryMutAct_9fa48("79051") ? true : (stryCov_9fa48("79051", "79052"), Array.isArray(value))) {
            if (stryMutAct_9fa48("79053")) {
              {}
            } else {
              stryCov_9fa48("79053");
              result[stryMutAct_9fa48("79054") ? `` : (stryCov_9fa48("79054"), `${path}${SIGNAL_PATH.LENGTH_SUFFIX}`)] = value.length;
              return;
            }
          }
          if (stryMutAct_9fa48("79057") ? !value && typeof value !== 'object' : stryMutAct_9fa48("79056") ? false : stryMutAct_9fa48("79055") ? true : (stryCov_9fa48("79055", "79056", "79057"), (stryMutAct_9fa48("79058") ? value : (stryCov_9fa48("79058"), !value)) || (stryMutAct_9fa48("79060") ? typeof value === 'object' : stryMutAct_9fa48("79059") ? false : (stryCov_9fa48("79059", "79060"), typeof value !== (stryMutAct_9fa48("79061") ? "" : (stryCov_9fa48("79061"), 'object')))))) {
            if (stryMutAct_9fa48("79062")) {
              {}
            } else {
              stryCov_9fa48("79062");
              return;
            }
          }
          if (stryMutAct_9fa48("79066") ? depth < RESOURCE_DIAGNOSTICS_DEFAULT.MAX_FLATTEN_DEPTH : stryMutAct_9fa48("79065") ? depth > RESOURCE_DIAGNOSTICS_DEFAULT.MAX_FLATTEN_DEPTH : stryMutAct_9fa48("79064") ? false : stryMutAct_9fa48("79063") ? true : (stryCov_9fa48("79063", "79064", "79065", "79066"), depth >= RESOURCE_DIAGNOSTICS_DEFAULT.MAX_FLATTEN_DEPTH)) {
            if (stryMutAct_9fa48("79067")) {
              {}
            } else {
              stryCov_9fa48("79067");
              return;
            }
          }
          for (const [childKey, childValue] of Object.entries(value)) {
            if (stryMutAct_9fa48("79068")) {
              {}
            } else {
              stryCov_9fa48("79068");
              walk(childValue, getNestedPath(path, childKey), stryMutAct_9fa48("79069") ? depth - NUM.ONE : (stryCov_9fa48("79069"), depth + NUM.ONE));
            }
          }
        }
      };
      for (const [componentName, value] of Object.entries(componentStats)) {
        if (stryMutAct_9fa48("79070")) {
          {}
        } else {
          stryCov_9fa48("79070");
          walk(value, componentName, NUM.ZERO);
        }
      }
      if (stryMutAct_9fa48("79073") ? truncated && !this.signalLimitWarningLogged || this.logger?.warn : stryMutAct_9fa48("79072") ? false : stryMutAct_9fa48("79071") ? true : (stryCov_9fa48("79071", "79072", "79073"), (stryMutAct_9fa48("79075") ? truncated || !this.signalLimitWarningLogged : stryMutAct_9fa48("79074") ? true : (stryCov_9fa48("79074", "79075"), truncated && (stryMutAct_9fa48("79076") ? this.signalLimitWarningLogged : (stryCov_9fa48("79076"), !this.signalLimitWarningLogged)))) && (stryMutAct_9fa48("79077") ? this.logger.warn : (stryCov_9fa48("79077"), this.logger?.warn)))) {
        if (stryMutAct_9fa48("79078")) {
          {}
        } else {
          stryCov_9fa48("79078");
          this.logger.warn(RESOURCE_DIAGNOSTICS_WARNING.SIGNAL_LIMIT_REACHED, stryMutAct_9fa48("79079") ? {} : (stryCov_9fa48("79079"), {
            nodeId: this.nodeId,
            maxSignalCount: RESOURCE_DIAGNOSTICS_DEFAULT.MAX_SIGNAL_COUNT
          }));
          this.signalLimitWarningLogged = stryMutAct_9fa48("79080") ? false : (stryCov_9fa48("79080"), true);
        }
      }
      return result;
    }
  }

  /**
   * Calculate process CPU percent across all cores.
   * @param {number} cpuDeltaUs
   * @param {number} elapsedMs
   * @return {number}
   * @private
   */
  calculateCpuPercent(cpuDeltaUs, elapsedMs) {
    if (stryMutAct_9fa48("79081")) {
      {}
    } else {
      stryCov_9fa48("79081");
      const cpuCount = stryMutAct_9fa48("79082") ? Math.min(NUM.ONE, os.cpus().length) : (stryCov_9fa48("79082"), Math.max(NUM.ONE, os.cpus().length));
      const elapsedUs = stryMutAct_9fa48("79083") ? elapsedMs / RESOURCE_DIAGNOSTICS_DEFAULT.MICROS_PER_MILLISECOND : (stryCov_9fa48("79083"), elapsedMs * RESOURCE_DIAGNOSTICS_DEFAULT.MICROS_PER_MILLISECOND);
      const normalized = stryMutAct_9fa48("79084") ? cpuDeltaUs * (elapsedUs * cpuCount) : (stryCov_9fa48("79084"), cpuDeltaUs / (stryMutAct_9fa48("79085") ? elapsedUs / cpuCount : (stryCov_9fa48("79085"), elapsedUs * cpuCount)));
      return roundToTwo(stryMutAct_9fa48("79086") ? normalized / RESOURCE_DIAGNOSTICS_DEFAULT.PERCENT_FACTOR : (stryCov_9fa48("79086"), normalized * RESOURCE_DIAGNOSTICS_DEFAULT.PERCENT_FACTOR));
    }
  }

  /**
   * Read total bytes written by this process from /proc/self/io on Linux.
   * Returns null when unavailable.
   * @return {number|null}
   * @private
   */
  readProcessWriteBytes() {
    if (stryMutAct_9fa48("79087")) {
      {}
    } else {
      stryCov_9fa48("79087");
      try {
        if (stryMutAct_9fa48("79088")) {
          {}
        } else {
          stryCov_9fa48("79088");
          const content = fs.readFileSync(RESOURCE_DIAGNOSTICS_DEFAULT.PROC_SELF_IO_PATH, stryMutAct_9fa48("79089") ? "" : (stryCov_9fa48("79089"), 'utf8'));
          const row = content.split(stryMutAct_9fa48("79090") ? "" : (stryCov_9fa48("79090"), '\n')).find(stryMutAct_9fa48("79091") ? () => undefined : (stryCov_9fa48("79091"), line => stryMutAct_9fa48("79092") ? line.endsWith(RESOURCE_DIAGNOSTICS_DEFAULT.WRITE_BYTES_PREFIX) : (stryCov_9fa48("79092"), line.startsWith(RESOURCE_DIAGNOSTICS_DEFAULT.WRITE_BYTES_PREFIX))));
          if (stryMutAct_9fa48("79095") ? false : stryMutAct_9fa48("79094") ? true : stryMutAct_9fa48("79093") ? row : (stryCov_9fa48("79093", "79094", "79095"), !row)) {
            if (stryMutAct_9fa48("79096")) {
              {}
            } else {
              stryCov_9fa48("79096");
              return null;
            }
          }
          const parsed = Number(stryMutAct_9fa48("79098") ? row.trim() : stryMutAct_9fa48("79097") ? row.substring(RESOURCE_DIAGNOSTICS_DEFAULT.WRITE_BYTES_PREFIX.length) : (stryCov_9fa48("79097", "79098"), row.substring(RESOURCE_DIAGNOSTICS_DEFAULT.WRITE_BYTES_PREFIX.length).trim()));
          return Number.isFinite(parsed) ? parsed : null;
        }
      } catch (_error) {
        if (stryMutAct_9fa48("79099")) {
          {}
        } else {
          stryCov_9fa48("79099");
          return null;
        }
      }
    }
  }
}
export { ResourceDiagnosticsSampler };