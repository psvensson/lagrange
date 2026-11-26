import fs from 'node:fs';
import os from 'node:os';
import {NUM, STRING} from '../constants/index.js';

const samplesBySource = /* @__PURE__ */ new WeakMap();
let nextHostStatisticsSampleId = 1;
const PROC_MEMINFO_PATH = '/proc/meminfo';
const MEM_AVAILABLE_KB_PATTERN = /^MemAvailable:\s+(\d+)\s+kB$/mu;
const BYTES_PER_KIB = 1024;
const LINUX_PLATFORM = 'linux';

export function readLinuxMemAvailableBytes(totalMemory, osFreeMemoryBytes, meminfoContent = null) {
  try {
    const content = typeof meminfoContent === 'string' ?
      meminfoContent :
      fs.readFileSync(PROC_MEMINFO_PATH, STRING.ENCODING_UTF8);
    const match = MEM_AVAILABLE_KB_PATTERN.exec(content);
    if (!match) return osFreeMemoryBytes;
    const availableBytes = Number(match[1]) * BYTES_PER_KIB;
    if (!Number.isFinite(availableBytes) || availableBytes < 0) {
      return osFreeMemoryBytes;
    }
    return Math.min(totalMemory, availableBytes);
  } catch {
    return osFreeMemoryBytes;
  }
}

function resolveAvailableHostMemoryBytes(source, totalMemory) {
  const freeMemory = source.freemem();
  if (source === os && source.platform() === LINUX_PLATFORM) {
    return readLinuxMemAvailableBytes(totalMemory, freeMemory);
  }
  return freeMemory;
}

const CPU_MEASUREMENT_MODE = Object.freeze({
  INTERVAL_DELTA: 'interval_delta',
  CUMULATIVE_BASELINE: 'cumulative_baseline',
});

function readCachedSample(source, clock, nowMs, maxAgeMs) {
  const samplesByClock = samplesBySource.get(source);
  const entry = samplesByClock?.get(clock) || null;
  const sample = entry?.sample || null;
  const ageMs = sample ? nowMs - sample.sampledAtMs : null;
  if (sample && ageMs >= 0 && ageMs < maxAgeMs) {
    return sample;
  }
  return null;
}

function readPreviousRawTicks(source, clock) {
  const entry = samplesBySource.get(source)?.get(clock);
  return entry?.rawTicks || null;
}

function storeSample(source, clock, sample, rawTicks) {
  let samplesByClock = samplesBySource.get(source);
  if (!samplesByClock) {
    samplesByClock = /* @__PURE__ */ new WeakMap();
    samplesBySource.set(source, samplesByClock);
  }
  const previous = samplesByClock.get(clock);
  const retainedTicks = rawTicks || previous?.rawTicks || null;
  samplesByClock.set(clock, Object.freeze({sample, rawTicks: retainedTicks}));
}

function computeHostCpuUsage(totalIdle, totalTick, previousTicks, nowMs) {
  if (
    previousTicks !== null &&
    nowMs > previousTicks.sampledAtMs
  ) {
    const deltaTick = totalTick - previousTicks.totalTick;
    const deltaIdle = totalIdle - previousTicks.totalIdle;
    if (deltaTick > 0 && deltaIdle >= 0 && deltaIdle <= deltaTick) {
      return {
        cpuUsagePercent: ((deltaTick - deltaIdle) / deltaTick) * NUM.HUNDRED,
        cpuMeasurementMode: CPU_MEASUREMENT_MODE.INTERVAL_DELTA,
      };
    }
  }
  const cumulative = totalTick > 0 ?
    ((totalTick - totalIdle) / totalTick) * NUM.HUNDRED :
    0;
  return {
    cpuUsagePercent: cumulative,
    cpuMeasurementMode: CPU_MEASUREMENT_MODE.CUMULATIVE_BASELINE,
  };
}

/**
 * Sample process-host statistics once per source, clock, and collection
 * interval. Several NodeService owners can coexist in one process, but their
 * CPU and memory source is host-wide and should not be re-materialized once
 * per logical node.
 *
 * @param {Object} source - Host-statistics source (normally node:os).
 * @param {Function} clock - Clock defining the sample's time domain.
 * @param {number} nowMs - Current time in the clock's domain.
 * @param {number} maxAgeMs - Configured collection interval.
 * @return {Object} Internal host-statistics sample containing only scalars.
 */
function sampleNodeHostStatistics(source, clock, nowMs, maxAgeMs) {
  const cached = readCachedSample(source, clock, nowMs, maxAgeMs);
  if (cached) {
    return cached;
  }

  const cpus = source.cpus();
  const totalMemory = source.totalmem();
  const freeMemory = resolveAvailableHostMemoryBytes(source, totalMemory);
  const usedMemory = totalMemory - freeMemory;
  let totalIdle = 0;
  let totalTick = 0;
  for (const cpu of cpus) {
    for (const type of Object.keys(cpu.times)) {
      totalTick += cpu.times[type];
    }
    totalIdle += cpu.times.idle;
  }
  const previousTicks = readPreviousRawTicks(source, clock);
  const {cpuUsagePercent, cpuMeasurementMode} = computeHostCpuUsage(
    totalIdle,
    totalTick,
    previousTicks,
    nowMs,
  );
  const memoryUsagePercent = (usedMemory / totalMemory) * NUM.HUNDRED;
  const sampleId = nextHostStatisticsSampleId++;
  const sample = Object.freeze({
    sampleId,
    sampledAtMs: nowMs,
    cpuCount: cpus.length,
    cpuModel: cpus[0]?.model || STRING.UNKNOWN,
    cpuUsagePercent:
      Math.round(cpuUsagePercent * NUM.HUNDRED) / NUM.HUNDRED,
    cpuMeasurementMode,
    totalMemory,
    usedMemory,
    freeMemory,
    memoryUsagePercent:
      Math.round(memoryUsagePercent * NUM.HUNDRED) / NUM.HUNDRED,
    platform: source.platform(),
    arch: source.arch(),
    hostname: source.hostname(),
  });
  const shouldAdvanceBaseline =
    previousTicks === null || nowMs >= previousTicks.sampledAtMs;
  storeSample(
    source,
    clock,
    sample,
    shouldAdvanceBaseline ?
      Object.freeze({sampledAtMs: nowMs, totalIdle, totalTick}) :
      null,
  );
  return sample;
}

/**
 * Assemble the node-local statistics snapshot a runtime reports as its own.
 *
 * Everything here is evidence ABOUT ONE NODE - its uptime against its own
 * start time, its own service registry, its own thread pool - which is why it
 * takes the runtime rather than reading any of it from the process.
 *
 * @param {Object} runtime - the NodeService.
 * @param {Object} reading - {nowMs, hostStats, poolStats}.
 * @return {Object} the node statistics snapshot.
 */
function buildNodeStatsSnapshot(runtime, {nowMs, hostStats, poolStats}) {
  const sampledAtMs = Number.isFinite(hostStats?.sampledAtMs) ?
    hostStats.sampledAtMs :
    nowMs;
  return {
    nodeId: runtime.nodeId,
    nodeAddress: runtime.nodeAddress,
    status: runtime.status,
    uptime: nowMs - runtime.startTime,
    timestamp: sampledAtMs,
    sampledAtMs,
    ...(Number.isSafeInteger(hostStats?.sampleId) ?
      {sampleId: hostStats.sampleId} :
      {}),
    cpu: {
      count: hostStats.cpuCount,
      model: hostStats.cpuModel,
      usagePercent: hostStats.cpuUsagePercent,
    },
    memory: {
      totalBytes: hostStats.totalMemory,
      usedBytes: hostStats.usedMemory,
      freeBytes: hostStats.freeMemory,
      usagePercent: hostStats.memoryUsagePercent,
    },
    services: {
      total: runtime.services.size,
      running: runtime.getRunningServiceCount(),
      messageGroups: runtime.messageGroupServices.size,
    },
    threadPool: poolStats,
    platform: {
      os: hostStats.platform,
      arch: hostStats.arch,
      nodeVersion: process.version,
      hostname: hostStats.hostname,
    },
  };
}

export {buildNodeStatsSnapshot, sampleNodeHostStatistics};
