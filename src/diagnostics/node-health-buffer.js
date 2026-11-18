/**
 * Node health buffer: about one hour of this node's own health samples, in
 * memory only.
 *
 * RULE - health data is a HINT. It describes how loaded this process, its
 * machine and its links were; it is evidence for a person or a report
 * classifying a run. It is never an input to a safety, authority, admission,
 * routing or placement decision: nothing under src/rebalancer, the readiness
 * owners of src/control-plane, the admission owners of src/node or src/query
 * may import this module or node-health-collection.js
 * (scripts/checks/check-health-hint-imports.js enforces it).
 *
 * It is NOT a table: no system table, no virtual table, no SQL surface, no
 * disk, no Raft entry and no CDC event carries it. It is read through one
 * explicit function, collectNodeHealth (node-health-collection.js), so that
 * nobody mistakes it for data with a regular table's durability or cost.
 *
 * Owner and lifetime (R13): one buffer per node process, created with the
 * process and discarded with it. It is fed by the process's one periodic
 * diagnostics tick (periodic-diagnostics-reporters.js) and by the diagnostics
 * producers that already build these samples for their console lines; it
 * arms no timer of its own.
 *
 * Retention shape: every series keeps its most recent samples raw, and folds
 * each sample that ages out of the raw ring into a one-minute bucket (sample
 * count, and per numeric field its sum and maximum). Both rings have a fixed
 * capacity by count; the oldest entry is evicted. Keyed series (per peer, per
 * served table) also bound their number of keys: a new key evicts the key
 * updated least recently, so the series follows the keys that are active now.
 */

import {
  HOST_FACTS_READING_INTERVAL_MS,
  sharedHostResourceFactsReader,
} from './host-resource-facts.js';

const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60 * MS_PER_SECOND;
// The field every sample carries its time in; it is never downsampled.
const SAMPLE_TIME_FIELD = 'atMs';

/**
 * Retention and capacity. The buffer's size is bounded by these counts, not
 * by time: a producer that samples faster than its nominal cadence shortens
 * the raw window, it never grows the buffer.
 */
const NODE_HEALTH_RETENTION = Object.freeze({
  // Raw samples are kept for about five minutes: long enough to cover a
  // scenario's failing wait with full resolution (the longest product bound a
  // run-health verdict uses is the router's 30 s liveness window), short
  // enough that the 1 s per-peer series stays a few hundred entries.
  RAW_WINDOW_MS: 5 * MS_PER_MINUTE,
  // Older samples are folded into one-minute buckets: 55 of them complete
  // the hour behind the five raw minutes.
  BUCKET_MS: MS_PER_MINUTE,
  BUCKET_CAPACITY: 55,
  // The process sample cadence: one sample per 5 s resolves a 30 s sustained
  // window with six points. It is the host-facts reading cadence, so each
  // sample costs at most the process's one shared /proc and /sys reading.
  PROCESS_SAMPLE_INTERVAL_MS: HOST_FACTS_READING_INTERVAL_MS,
  PROCESS_RAW_CAPACITY: 60,
  // The event-loop delay sampler's cadence is 10 s.
  EVENT_LOOP_RAW_CAPACITY: 30,
  // The router's peer-traffic cadence is 1 s per active peer.
  PEER_TRAFFIC_RAW_CAPACITY: 300,
  // The router reports at most 16 peers per interval; a cluster larger than
  // this keeps the 16 peers updated most recently and counts evicted keys.
  // Only identified peers (by node id) are kept: a socket's traffic before
  // its IDENTIFY is counted, never given a key.
  PEER_KEY_CAPACITY: 16,
  // Served queries are kept per table as buckets only (their raw lines are
  // per table, operation and caller every second, already on the console).
  SERVED_TABLE_KEY_CAPACITY: 32,
  // ACK timeouts are events, not a cadence: the most recent 256.
  ACK_TIMEOUT_CAPACITY: 256,
  // CDC deliveries (waves) arrive in bursts: the most recent 300 raw, like
  // one peer's traffic, then buckets.
  CDC_WAVE_RAW_CAPACITY: 300,
  // CDC applies are per event and can be thousands per second, so they are
  // kept per table as buckets only (count, lag sum and maximum).
  CDC_APPLY_TABLE_KEY_CAPACITY: 32,
});

const NODE_HEALTH_SERIES = Object.freeze({
  PROCESS: 'process',
  EVENT_LOOP: 'eventLoop',
  PEER_TRAFFIC: 'peerTraffic',
  SERVED_QUERIES: 'servedQueries',
  ACK_TIMEOUTS: 'ackTimeouts',
  CDC_WAVES: 'cdcWaves',
  CDC_APPLIES: 'cdcApplies',
});

const NODE_HEALTH_STATE = Object.freeze({
  MEASURED: 'measured',
  UNAVAILABLE: 'unavailable',
});

const NODE_HEALTH_UNAVAILABLE_REASON = Object.freeze({
  // The process's diagnostics tick is not running (in-process harness, or a
  // watchdog disabled by its threshold), so nothing feeds the buffer.
  FEED_NOT_STARTED: 'diagnostics_tick_not_running',
  NO_SAMPLE_YET: 'no_sample_yet',
  // No producer has handed this series a sample since the process started.
  PRODUCER_NOT_ATTACHED: 'producer_has_recorded_nothing',
  NOTHING_SINCE: 'no_sample_since_requested_time',
  // Even the minute buckets of the slice exceed the collection's byte bound.
  OVER_RESPONSE_BOUND: 'over_response_bound',
});

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * One series: a raw ring and a ring of one-minute buckets.
 */
class BoundedHealthSeries {
  constructor({rawCapacity, bucketCapacity = NODE_HEALTH_RETENTION.BUCKET_CAPACITY,
    bucketMs = NODE_HEALTH_RETENTION.BUCKET_MS}) {
    this.rawCapacity = rawCapacity;
    this.bucketCapacity = bucketCapacity;
    this.bucketMs = bucketMs;
    this.raw = [];
    this.buckets = [];
    this.evictedBuckets = 0;
  }

  /**
   * @param {number} atMs - The sample's time.
   * @param {Object} sample - Flat record; numeric fields are downsampled,
   *   other fields are kept only while the sample is raw.
   * @return {void}
   */
  append(atMs, sample) {
    this.raw.push({atMs, ...sample});
    while (this.raw.length > this.rawCapacity) {
      this.fold(this.raw.shift());
    }
  }

  fold(sample) {
    const startMs = Math.floor(sample.atMs / this.bucketMs) * this.bucketMs;
    let bucket = this.buckets[this.buckets.length - 1];
    if (bucket === undefined || bucket.startMs !== startMs) {
      bucket = {startMs, samples: 0, sum: {}, max: {}};
      this.buckets.push(bucket);
      if (this.buckets.length > this.bucketCapacity) {
        this.buckets.shift();
        this.evictedBuckets += 1;
      }
    }
    bucket.samples += 1;
    for (const [field, value] of Object.entries(sample)) {
      if (field === SAMPLE_TIME_FIELD || !isFiniteNumber(value)) continue;
      bucket.sum[field] = (bucket.sum[field] ?? 0) + value;
      bucket.max[field] = Math.max(bucket.max[field] ?? value, value);
    }
  }

  entryCount() {
    return this.raw.length + this.buckets.length;
  }

  /**
   * @param {number} sinceMs - Only entries at or after this time.
   * @return {{raw: Array<Object>, downsampled: Array<Object>}}
   */
  slice(sinceMs) {
    return {
      raw: this.raw.filter((sample) => sample.atMs >= sinceMs),
      downsampled: this.buckets.filter((bucket) =>
        bucket.startMs + this.bucketMs > sinceMs),
    };
  }
}

/**
 * A bounded set of series by key (peer node id, table name). The map's order
 * is the update order: an appended key moves to the end, and a new key past
 * the capacity evicts the first one, the key updated least recently.
 */
class KeyedHealthSeries {
  constructor({keyCapacity, rawCapacity}) {
    this.keyCapacity = keyCapacity;
    this.rawCapacity = rawCapacity;
    this.byKey = new Map();
    this.evictedKeys = 0;
  }

  append(key, atMs, sample) {
    let series = this.byKey.get(key);
    if (series === undefined) {
      series = new BoundedHealthSeries({rawCapacity: this.rawCapacity});
      if (this.byKey.size >= this.keyCapacity) {
        this.byKey.delete(this.byKey.keys().next().value);
        this.evictedKeys += 1;
      }
    } else {
      this.byKey.delete(key);
    }
    this.byKey.set(key, series);
    series.append(atMs, sample);
  }

  entryCount() {
    let count = 0;
    for (const series of this.byKey.values()) count += series.entryCount();
    return count;
  }
}

function measuredNumber(fact, field) {
  return fact?.state === NODE_HEALTH_STATE.MEASURED && isFiniteNumber(fact[field]) ?
    fact[field] : null;
}

// The numeric host facts worth an hour of history, flattened so that the
// bucket fold can keep their sum and maximum. A fact without a reading is
// null here and its typed reason stays in `hostUnavailable`.
function flattenHostFacts(host) {
  const flat = {
    hostRxBytes: measuredNumber(host.network, 'rxBytes'),
    hostTxBytes: measuredNumber(host.network, 'txBytes'),
    tcpRetransmittedSegments: measuredNumber(host.tcp, 'retransmittedSegments'),
    tcpOutSegments: measuredNumber(host.tcp, 'outSegments'),
    cpuStealTicks: measuredNumber(host.cpu, 'stealTicks'),
    cpuIowaitTicks: measuredNumber(host.cpu, 'iowaitTicks'),
    cpuTotalTicks: measuredNumber(host.cpu, 'totalTicks'),
    load1: measuredNumber(host.load, 'load1'),
    memoryAvailableBytes: measuredNumber(host.memory, 'availableBytes'),
    memoryFullStallPercent: measuredNumber(host.memoryPressure, 'fullAvg10Percent'),
    ioSomeStallPercent: measuredNumber(host.ioPressure, 'someAvg10Percent'),
    thermalCoreThrottleEvents: measuredNumber(host.thermalThrottle, 'coreThrottleEvents'),
    thermalPackageThrottleEvents:
      measuredNumber(host.thermalThrottle, 'packageThrottleEvents'),
    wirelessSignalDbm: host.wireless?.state === NODE_HEALTH_STATE.MEASURED ?
      host.wireless.links[0].signalLevelDbm : null,
  };
  const hostUnavailable = {};
  for (const [name, fact] of Object.entries(host)) {
    if (fact?.state === NODE_HEALTH_STATE.UNAVAILABLE) hostUnavailable[name] = fact.reason;
  }
  return {flat, hostUnavailable};
}

class NodeHealthBuffer {
  /**
   * @param {Object} [options]
   * @param {Object} [options.hostFactsReader] Reader of /proc and /sys facts;
   *   the process's one shared reader unless a test supplies its own.
   * @param {Function} [options.readProcess] () => {cpuUsage, memoryUsage}.
   */
  constructor({hostFactsReader = sharedHostResourceFactsReader,
    readProcess = () => ({cpu: process.cpuUsage(), memory: process.memoryUsage()})} = {}) {
    this.hostFactsReader = hostFactsReader;
    this.readProcess = readProcess;
    this.process = new BoundedHealthSeries(
      {rawCapacity: NODE_HEALTH_RETENTION.PROCESS_RAW_CAPACITY});
    this.eventLoop = new BoundedHealthSeries(
      {rawCapacity: NODE_HEALTH_RETENTION.EVENT_LOOP_RAW_CAPACITY});
    this.peerTraffic = new KeyedHealthSeries({
      keyCapacity: NODE_HEALTH_RETENTION.PEER_KEY_CAPACITY,
      rawCapacity: NODE_HEALTH_RETENTION.PEER_TRAFFIC_RAW_CAPACITY,
    });
    // Bucket-only: a raw capacity of zero folds every sample at once.
    this.servedQueries = new KeyedHealthSeries({
      keyCapacity: NODE_HEALTH_RETENTION.SERVED_TABLE_KEY_CAPACITY,
      rawCapacity: 0,
    });
    this.cdcWaves = new BoundedHealthSeries(
      {rawCapacity: NODE_HEALTH_RETENTION.CDC_WAVE_RAW_CAPACITY});
    this.cdcApplies = new KeyedHealthSeries({
      keyCapacity: NODE_HEALTH_RETENTION.CDC_APPLY_TABLE_KEY_CAPACITY,
      rawCapacity: 0,
    });
    this.ackTimeouts = [];
    this.evictedAckTimeouts = 0;
    this.recordFailures = 0;
    this.lastRecordFailure = null;
    // Peer-traffic lines of a socket not yet identified (keyed by its
    // connection id): counted here, never given a peer key.
    this.unidentifiedPeerLines = 0;
    this.recordsBeforeFirstTick = 0;
    this.firstTickAtMs = null;
    this.lastTickAtMs = null;
    this.maxTickGapMs = 0;
    this.lastProcessSampleAtMs = null;
    this.lastCpu = null;
    this.hostUnavailable = {};
  }

  /**
   * The periodic diagnostics tick. Takes a process sample when one is due.
   * @param {number} nowMs - The tick's wall clock.
   * @return {void}
   */
  tick(nowMs) {
    if (this.firstTickAtMs === null) this.firstTickAtMs = nowMs;
    if (this.lastTickAtMs !== null) {
      this.maxTickGapMs = Math.max(this.maxTickGapMs, nowMs - this.lastTickAtMs);
    }
    this.lastTickAtMs = nowMs;
    if (this.lastProcessSampleAtMs !== null &&
        nowMs - this.lastProcessSampleAtMs <
          NODE_HEALTH_RETENTION.PROCESS_SAMPLE_INTERVAL_MS) {
      return;
    }
    this.sampleProcess(nowMs);
  }

  sampleProcess(nowMs) {
    const {cpu, memory} = this.readProcess();
    const elapsedMs = this.lastProcessSampleAtMs === null ?
      null : nowMs - this.lastProcessSampleAtMs;
    // Percent of ONE core, like a container's CPU percent: a node process
    // is one event-loop thread, so 100 means that thread never yielded.
    const cpuPercentOfOneCore = this.lastCpu === null || !(elapsedMs > 0) ? null :
      ((cpu.user - this.lastCpu.user) + (cpu.system - this.lastCpu.system)) /
        (elapsedMs * MS_PER_SECOND) * 100;
    const {flat, hostUnavailable} = flattenHostFacts(this.hostFactsReader.read(nowMs));
    this.hostUnavailable = hostUnavailable;
    this.process.append(nowMs, {
      cpuPercentOfOneCore,
      rssBytes: memory.rss,
      heapUsedBytes: memory.heapUsed,
      externalBytes: memory.external,
      // The longest interval between two diagnostics ticks since the last
      // sample: the watchdog's heartbeat arriving late is a blocked loop.
      maxTickGapMs: this.maxTickGapMs,
      ...flat,
    });
    this.maxTickGapMs = 0;
    this.lastCpu = cpu;
    this.lastProcessSampleAtMs = nowMs;
  }

  /**
   * @param {number} atMs
   * @param {Object} sample - The event-loop delay sampler's line context.
   * @return {void}
   */
  recordEventLoopDelay(atMs, sample) {
    this.eventLoop.append(atMs, sample);
  }

  /**
   * @param {number} atMs
   * @param {Object} line - The router's peer-traffic line context; its
   *   `peerIdentified` says whether `peerNodeId` is the peer's node id.
   * @return {void}
   */
  recordPeerTraffic(atMs, line) {
    const {peerNodeId, peerIdentified, framesSent, framesReceived, ...numeric} = line;
    if (peerIdentified !== true) {
      this.unidentifiedPeerLines += 1;
      return;
    }
    const flat = {...numeric};
    for (const [frameClass, count] of Object.entries(framesSent ?? {})) {
      flat[`framesSent_${frameClass}`] = count;
    }
    for (const [frameClass, count] of Object.entries(framesReceived ?? {})) {
      flat[`framesReceived_${frameClass}`] = count;
    }
    this.peerTraffic.append(String(peerNodeId), atMs, flat);
  }

  /**
   * @param {number} atMs
   * @param {Object} line - The router's served-query line context.
   * @return {void}
   */
  recordServedQuery(atMs, line) {
    this.servedQueries.append(String(line.tableName), atMs, {
      queries: line.queries,
      rows: line.rows,
      responseBytes: line.responseBytes,
      largestResponseBytes: line.largestResponseBytes,
      executionMs: line.executionMs,
      maxExecutionMs: line.maxExecutionMs,
    });
  }

  /**
   * @param {number} atMs
   * @param {Object} detail - The router's ACK-timeout detail line context.
   * @return {void}
   */
  recordAckTimeout(atMs, detail) {
    this.ackTimeouts.push({
      atMs,
      targetNodeId: detail.targetNodeId ?? null,
      boundMs: detail.boundMs ?? null,
      elapsedMs: detail.elapsedMs ?? null,
      payloadBytes: detail.payloadBytes ?? null,
      bufferedAmountNow: detail.bufferedAmountNow ?? null,
      queuePending: detail.queuePending ?? null,
    });
    if (this.ackTimeouts.length > NODE_HEALTH_RETENTION.ACK_TIMEOUT_CAPACITY) {
      this.ackTimeouts.shift();
      this.evictedAckTimeouts += 1;
    }
  }

  /**
   * @param {number} atMs
   * @param {Object} wave - A finished CDC delivery: {waveMs, sourceApplyMs,
   *   eventCount, targets, failedTargets}.
   * @return {void}
   */
  recordCdcWave(atMs, wave) {
    this.cdcWaves.append(atMs, {
      waveMs: wave.waveMs,
      sourceApplyMs: wave.sourceApplyMs ?? null,
      eventCount: wave.eventCount ?? null,
      targets: wave.targets ?? null,
      failedTargets: wave.failedTargets ?? null,
    });
  }

  /**
   * @param {number} atMs
   * @param {Object} applied - One CDC event applied to the cache:
   *   {tableName, lagMs, receivedToAppliedMs}.
   * @return {void}
   */
  recordCdcApply(atMs, applied) {
    this.cdcApplies.append(String(applied.tableName), atMs, {
      lagMs: applied.lagMs,
      receivedToAppliedMs: applied.receivedToAppliedMs,
    });
  }

  /** @return {number} Entries held across every series (the memory bound's unit). */
  entryCount() {
    return this.process.entryCount() + this.eventLoop.entryCount() +
      this.peerTraffic.entryCount() + this.servedQueries.entryCount() +
      this.cdcWaves.entryCount() + this.cdcApplies.entryCount() +
      this.ackTimeouts.length;
  }
}

/**
 * The most entries one buffer can hold, from the retention constants alone.
 * @return {number}
 */
function nodeHealthEntryCapacity() {
  const R = NODE_HEALTH_RETENTION;
  return (R.PROCESS_RAW_CAPACITY + R.BUCKET_CAPACITY) +
    (R.EVENT_LOOP_RAW_CAPACITY + R.BUCKET_CAPACITY) +
    R.PEER_KEY_CAPACITY * (R.PEER_TRAFFIC_RAW_CAPACITY + R.BUCKET_CAPACITY) +
    R.SERVED_TABLE_KEY_CAPACITY * R.BUCKET_CAPACITY +
    (R.CDC_WAVE_RAW_CAPACITY + R.BUCKET_CAPACITY) +
    R.CDC_APPLY_TABLE_KEY_CAPACITY * R.BUCKET_CAPACITY +
    R.ACK_TIMEOUT_CAPACITY;
}

// The node process's one buffer. Created with the process, never persisted.
const sharedNodeHealthBuffer = new NodeHealthBuffer();

const SERIES_RECORDER = Object.freeze({
  [NODE_HEALTH_SERIES.PEER_TRAFFIC]: (buffer, atMs, sample) =>
    buffer.recordPeerTraffic(atMs, sample),
  [NODE_HEALTH_SERIES.SERVED_QUERIES]: (buffer, atMs, sample) =>
    buffer.recordServedQuery(atMs, sample),
  [NODE_HEALTH_SERIES.ACK_TIMEOUTS]: (buffer, atMs, sample) =>
    buffer.recordAckTimeout(atMs, sample),
  [NODE_HEALTH_SERIES.CDC_WAVES]: (buffer, atMs, sample) =>
    buffer.recordCdcWave(atMs, sample),
  [NODE_HEALTH_SERIES.CDC_APPLIES]: (buffer, atMs, sample) =>
    buffer.recordCdcApply(atMs, sample),
});

/**
 * The producers' one entry: hand a sample to the node health buffer beside
 * the console line that already describes it. It never throws - a failure
 * is counted on the buffer and the caller's delivery, apply or log line is
 * untouched - and it reads no clock of its own: the sample is stamped with
 * the last diagnostics tick (at most one watchdog interval old). Before
 * the first tick nothing feeds the buffer and the sample is only counted.
 * @param {string} series - A NODE_HEALTH_SERIES member a producer feeds.
 * @param {Function} buildSample - () => the sample; called inside the guard,
 *   so that building it cannot fail the caller either, and only when the
 *   buffer is being fed.
 * @param {Object} [buffer] - The node health buffer.
 * @return {void}
 */
function recordNodeHealthSample(series, buildSample, buffer = sharedNodeHealthBuffer) {
  try {
    if (buffer.lastTickAtMs === null) {
      buffer.recordsBeforeFirstTick += 1;
      return;
    }
    SERIES_RECORDER[series](buffer, buffer.lastTickAtMs, buildSample());
  } catch (error) {
    buffer.recordFailures += 1;
    buffer.lastRecordFailure = error;
  }
}

export {
  BoundedHealthSeries,
  NODE_HEALTH_RETENTION,
  NODE_HEALTH_SERIES,
  NODE_HEALTH_STATE,
  NODE_HEALTH_UNAVAILABLE_REASON,
  NodeHealthBuffer,
  nodeHealthEntryCapacity,
  recordNodeHealthSample,
  sharedNodeHealthBuffer,
};
