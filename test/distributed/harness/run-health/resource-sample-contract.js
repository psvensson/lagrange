/**
 * The shape of one resource sample (samples.ndjson): how container stats and
 * the node's own process and host facts become sample fields, each a
 * measurement or a typed unavailable reason, and how successive cumulative
 * counters become rates.
 *
 * Collection path: container CPU and memory come from the node's Docker
 * daemon (the harness's existing provider); process and host facts come from
 * the node's own diagnostics route (/api/admin/diagnostics/services), which
 * reads /proc and /sys inside the node's container. In a multi-host run the
 * container shares its host's network namespace, so those host facts are the
 * host's interfaces and TCP stack; no ssh is involved.
 */

import {
  HOST_FACT_STATE,
} from '../../../../src/diagnostics/host-resource-facts.js';
import {
  CONTAINER_NETWORK_COUNTER_SCOPE,
  SAMPLE_UNAVAILABLE_REASON,
} from './resource-sample-vocabulary.js';

const PROCESS_DIAGNOSTICS_UNAVAILABLE_PREFIX =
  'Process resource diagnostics unavailable for node ';
// The harness HTTP client's status for a request that got no response at
// all: connection refused, reset, or its timeout (cluster-base-layer.js).
const HTTP_NO_RESPONSE_STATUS = -1;
const MILLISECONDS_PER_SECOND = 1000;
const RATE_DECIMALS = 3;
const SHARE_DECIMALS = 4;

function unavailable(reason, detail = {}) {
  return {state: HOST_FACT_STATE.UNAVAILABLE, reason, ...detail};
}

/**
 * The error a node handle throws when its diagnostics route gave no usable
 * answer, carrying the typed reason.
 * @param {string} nodeId
 * @param {number} httpStatus - The response status, -1 without a response.
 * @return {Error}
 */
function processDiagnosticsUnavailableError(nodeId, httpStatus) {
  const error = new Error(PROCESS_DIAGNOSTICS_UNAVAILABLE_PREFIX + nodeId +
    ' (status=' + String(httpStatus) + ')');
  error.unavailable = unavailable(
    httpStatus === HTTP_NO_RESPONSE_STATUS ?
      SAMPLE_UNAVAILABLE_REASON.ADMIN_ENDPOINT_UNREACHABLE :
      SAMPLE_UNAVAILABLE_REASON.ADMIN_ENDPOINT_REFUSED_STATUS,
    {httpStatus},
  );
  return error;
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * The host facts section of a node's latest resource sample.
 * @param {Object} latest - `diagnostics.resources.latest` of the route.
 * @return {Object} The node's host facts, or the typed reason it sent none
 *   (a node image older than the host-facts reader).
 */
function decodeNodeHostFacts(latest) {
  return isRecord(latest?.host) ?
    latest.host :
    unavailable(SAMPLE_UNAVAILABLE_REASON.NODE_REPORTS_NO_HOST_FACTS);
}

/**
 * The process load gauges of a node's latest resource sample.
 * @param {Object} processSnapshot - `latest.process` of the route.
 * @return {{cpuPercent: number|null, eventLoopUtilizationPercent: number|null}}
 */
function decodeProcessLoad(processSnapshot) {
  const gauge = (value) => (Number.isFinite(value) ? value : null);
  return {
    cpuPercent: gauge(processSnapshot?.cpuPercent),
    eventLoopUtilizationPercent: gauge(processSnapshot?.eventLoopUtilizationPercent),
  };
}

/**
 * Sample fields of one container stats reading.
 * @param {Object} stats - DockerProvider.getContainerStats result.
 * @return {Object}
 */
function containerSampleFields(stats) {
  const fields = {
    cpuPercent: stats.cpuPercent,
    containerMemoryWorkingSetBytes: stats.memoryUsageBytes,
    containerMemoryLimitBytes: stats.memoryLimitBytes,
  };
  if (stats.networkCounterScope === CONTAINER_NETWORK_COUNTER_SCOPE.CONTAINER_NAMESPACE) {
    return {...fields, rxBytes: stats.rxBytes, txBytes: stats.txBytes,
      networkCounterScope: stats.networkCounterScope};
  }
  return {...fields, containerNetworkUnavailable: unavailable(
    stats.networkCounterScope === CONTAINER_NETWORK_COUNTER_SCOPE.NOT_REPORTED ?
      SAMPLE_UNAVAILABLE_REASON.CONTAINER_HAS_NO_NETWORK_NAMESPACE :
      SAMPLE_UNAVAILABLE_REASON.PROVIDER_STATED_NO_COUNTER_SCOPE)};
}

function containerUnavailableFields(reason, message) {
  return {
    containerStatsError: message,
    containerStatsUnavailable: unavailable(reason),
  };
}

/**
 * Sample fields of one process diagnostics reading.
 * @param {Object} diagnostics - Node handle getProcessResourceDiagnostics result.
 * @return {Object}
 */
function processSampleFields(diagnostics) {
  const fields = {
    processCapturedAt: diagnostics.capturedAt,
    processRssBytes: diagnostics.process.rssBytes,
    processHeapUsedBytes: diagnostics.process.heapUsedBytes,
    processHeapTotalBytes: diagnostics.process.heapTotalBytes,
    processExternalBytes: diagnostics.process.externalBytes,
    processArrayBuffersBytes: diagnostics.process.arrayBuffersBytes,
    host: isRecord(diagnostics.host) ?
      diagnostics.host :
      unavailable(SAMPLE_UNAVAILABLE_REASON.NODE_REPORTS_NO_HOST_FACTS),
  };
  if (isRecord(diagnostics.load)) {
    fields.processCpuPercent = diagnostics.load.cpuPercent;
    fields.processEventLoopUtilizationPercent =
      diagnostics.load.eventLoopUtilizationPercent;
  }
  return fields;
}

/**
 * Sample fields of a failed process diagnostics reading: the message as
 * before, the typed reason, and the host facts that failed with it.
 * @param {Error} error
 * @param {string} message - The normalized capture message.
 * @return {Object}
 */
function processUnavailableFields(error, message) {
  const reason = isRecord(error?.unavailable) ?
    error.unavailable :
    unavailable(SAMPLE_UNAVAILABLE_REASON.PROCESS_DIAGNOSTICS_INVALID);
  return {
    processDiagnosticsError: message,
    processDiagnosticsUnavailable: reason,
    host: unavailable(reason.reason),
  };
}

function isMeasured(fact) {
  return isRecord(fact) && fact.state === HOST_FACT_STATE.MEASURED;
}

function round(value, decimals) {
  return Number(value.toFixed(decimals));
}

// One counter's increase between two readings, or the reason there is none.
function counterDelta(current, previous) {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) {
    return unavailable(SAMPLE_UNAVAILABLE_REASON.FIRST_READING);
  }
  return current < previous ?
    unavailable(SAMPLE_UNAVAILABLE_REASON.COUNTER_WENT_BACKWARDS) :
    current - previous;
}

function perSecond(delta, intervalMs) {
  return Number.isFinite(delta) ?
    round(delta / (intervalMs / MILLISECONDS_PER_SECOND), RATE_DECIMALS) :
    delta;
}

function factDelta(current, previous, field) {
  if (!isMeasured(current)) {
    return unavailable(current?.reason ?? SAMPLE_UNAVAILABLE_REASON.NODE_REPORTS_NO_HOST_FACTS);
  }
  return counterDelta(current[field], isMeasured(previous) ? previous[field] : Number.NaN);
}

function cpuShare(current, previous, field) {
  const ticks = factDelta(current, previous, field);
  const total = factDelta(current, previous, 'totalTicks');
  if (!Number.isFinite(ticks)) return ticks;
  if (!Number.isFinite(total)) return total;
  return total === 0 ?
    unavailable(SAMPLE_UNAVAILABLE_REASON.FIRST_READING) :
    round(ticks / total, SHARE_DECIMALS);
}

/**
 * Rates between a node's successive samples. Every rate is a number or a
 * typed unavailable state; the first sample of a node has no deltas.
 */
class ResourceRateTracker {
  constructor() {
    this.previousByNodeId = new Map();
  }

  /**
   * @param {Object} sample - One sample, with its cumulative fields set.
   * @return {Object} The sample's `rates` section.
   */
  ratesOf(sample) {
    const previous = this.previousByNodeId.get(sample.nodeId);
    this.previousByNodeId.set(sample.nodeId, sample);
    if (previous === undefined) {
      return unavailable(SAMPLE_UNAVAILABLE_REASON.FIRST_READING);
    }
    const hostNow = isRecord(sample.host) ? sample.host : {};
    const hostBefore = isRecord(previous.host) ? previous.host : {};
    const hostIntervalMs = Number.isFinite(hostNow.capturedAt) &&
      Number.isFinite(hostBefore.capturedAt) && hostNow.capturedAt > hostBefore.capturedAt ?
      hostNow.capturedAt - hostBefore.capturedAt :
      sample.timestamp - previous.timestamp;
    const hostRate = (fact, field) => perSecond(
      factDelta(hostNow[fact], hostBefore[fact], field), hostIntervalMs);
    const hostCount = (fact, field) =>
      factDelta(hostNow[fact], hostBefore[fact], field);
    const containerIntervalMs = sample.timestamp - previous.timestamp;
    const containerRate = (field) => (isRecord(sample.containerNetworkUnavailable) ?
      sample.containerNetworkUnavailable :
      perSecond(counterDelta(sample[field], previous[field]), containerIntervalMs));
    return {
      state: HOST_FACT_STATE.MEASURED,
      intervalMs: containerIntervalMs,
      hostIntervalMs,
      containerRxBytesPerSecond: containerRate('rxBytes'),
      containerTxBytesPerSecond: containerRate('txBytes'),
      hostRxBytesPerSecond: hostRate('network', 'rxBytes'),
      hostTxBytesPerSecond: hostRate('network', 'txBytes'),
      hostNetworkErrorsAndDrops: hostCount('network', 'rxErrorsAndDrops'),
      tcpRetransmittedSegments: hostCount('tcp', 'retransmittedSegments'),
      tcpOutSegments: hostCount('tcp', 'outSegments'),
      hostCpuStealShare: cpuShare(hostNow.cpu, hostBefore.cpu, 'stealTicks'),
      hostCpuIowaitShare: cpuShare(hostNow.cpu, hostBefore.cpu, 'iowaitTicks'),
      thermalCoreThrottleEvents: hostCount('thermalThrottle', 'coreThrottleEvents'),
      thermalPackageThrottleEvents: hostCount('thermalThrottle', 'packageThrottleEvents'),
    };
  }
}

// Disk flush latency has no cheap existing probe in the product or harness;
// the kernel's I/O pressure (host.ioPressure) is the recorded substitute.
const DISK_FLUSH_LATENCY_UNAVAILABLE = Object.freeze(
  unavailable(SAMPLE_UNAVAILABLE_REASON.NO_EXISTING_PROBE));

export {
  DISK_FLUSH_LATENCY_UNAVAILABLE,
  ResourceRateTracker,
  containerSampleFields,
  containerUnavailableFields,
  decodeNodeHostFacts,
  decodeProcessLoad,
  processDiagnosticsUnavailableError,
  processSampleFields,
  processUnavailableFields,
  unavailable,
};
