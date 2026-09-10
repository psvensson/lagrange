import {NUM, STRING} from '../constants/index.js';

const samplesBySource = /* @__PURE__ */ new WeakMap();

function readCachedSample(source, clock, nowMs, maxAgeMs) {
  const samplesByClock = samplesBySource.get(source);
  const sample = samplesByClock?.get(clock) || null;
  const ageMs = sample ? nowMs - sample.sampledAtMs : null;
  if (sample && ageMs >= 0 && ageMs < maxAgeMs) {
    return sample;
  }
  return null;
}

function storeSample(source, clock, sample) {
  let samplesByClock = samplesBySource.get(source);
  if (!samplesByClock) {
    samplesByClock = /* @__PURE__ */ new WeakMap();
    samplesBySource.set(source, samplesByClock);
  }
  samplesByClock.set(clock, sample);
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
  const freeMemory = source.freemem();
  const usedMemory = totalMemory - freeMemory;
  let totalIdle = 0;
  let totalTick = 0;
  for (const cpu of cpus) {
    for (const type of Object.keys(cpu.times)) {
      totalTick += cpu.times[type];
    }
    totalIdle += cpu.times.idle;
  }
  const cpuUsagePercent =
    ((totalTick - totalIdle) / totalTick) * NUM.HUNDRED;
  const memoryUsagePercent = (usedMemory / totalMemory) * NUM.HUNDRED;
  const sample = Object.freeze({
    sampledAtMs: nowMs,
    cpuCount: cpus.length,
    cpuModel: cpus[0]?.model || STRING.UNKNOWN,
    cpuUsagePercent:
      Math.round(cpuUsagePercent * NUM.HUNDRED) / NUM.HUNDRED,
    totalMemory,
    usedMemory,
    freeMemory,
    memoryUsagePercent:
      Math.round(memoryUsagePercent * NUM.HUNDRED) / NUM.HUNDRED,
    platform: source.platform(),
    arch: source.arch(),
    hostname: source.hostname(),
  });
  storeSample(source, clock, sample);
  return sample;
}

export {sampleNodeHostStatistics};
