/**
 * Telemetry shape primitives (quest transaction-path-telemetry-export): a
 * fixed base-2 histogram that records without allocation, the one clock
 * read telemetry uses, the per-process telemetry epoch, and a most-recent
 * ring addressed by a monotonic sequence.
 *
 * Telemetry is a hint: nothing that decides, schedules, budgets, retries or
 * persists reads it. Readers take snapshots and subtract them; nothing here
 * resets, so concurrent readers never disturb one another.
 */
import {performance} from 'node:perf_hooks';

// 2^k microseconds for k = 4..25 (16 us to 33.55 s), then one overflow
// bucket: CPU work, WAL fsync and network round trips fall in separate
// buckets, and the 30 s statement budget stays inside the bounded range.
const FIRST_BOUND_EXPONENT = 4;
const TELEMETRY_HISTOGRAM_BUCKET_COUNT = 23;
const OVERFLOW_BUCKET_INDEX = TELEMETRY_HISTOGRAM_BUCKET_COUNT - 1;
const TELEMETRY_HISTOGRAM_BUCKET_UPPER_BOUNDS_US = Object.freeze(Array.from(
  {length: OVERFLOW_BUCKET_INDEX},
  (_, index) => 2 ** (index + FIRST_BOUND_EXPONENT),
));
const LAST_BOUNDED_US = TELEMETRY_HISTOGRAM_BUCKET_UPPER_BOUNDS_US[OVERFLOW_BUCKET_INDEX - 1];
const MICROSECONDS_PER_MS = 1000;
const INT32_BITS = 32;

let lastTelemetryEpoch = 0;

/**
 * The monotonic clock every observation point reads.
 * @return {number} Milliseconds since the process time origin.
 */
function readTelemetryClockMs() {
  return performance.now();
}

/**
 * Wall-clock time of the monotonic clock's origin.
 * @return {number}
 */
function readTelemetryTimeOriginEpochMs() {
  return performance.timeOrigin;
}

/**
 * Take the next telemetry epoch of this process: a store created later has
 * a larger epoch, so a reader can tell a replaced store from a restart-free
 * continuation of the same one.
 * @return {number}
 */
function takeTelemetryEpoch() {
  lastTelemetryEpoch += 1;
  return lastTelemetryEpoch;
}

/**
 * @return {{count: number, sumMs: number, bucketCounts: Float64Array}}
 */
function createTelemetryHistogram() {
  return {
    count: 0,
    sumMs: 0,
    bucketCounts: new Float64Array(TELEMETRY_HISTOGRAM_BUCKET_COUNT),
  };
}

function bucketIndexOfMicroseconds(us) {
  if (us > LAST_BOUNDED_US) return OVERFLOW_BUCKET_INDEX;
  if (us <= TELEMETRY_HISTOGRAM_BUCKET_UPPER_BOUNDS_US[0]) return 0;
  return INT32_BITS - Math.clz32(us - 1) - FIRST_BOUND_EXPONENT;
}

/**
 * Record one duration. Upper bounds are inclusive.
 * @param {Object} histogram - From createTelemetryHistogram.
 * @param {number} ms - Duration in milliseconds.
 */
function recordTelemetryHistogram(histogram, ms) {
  const value = ms > 0 ? ms : 0;
  histogram.count += 1;
  histogram.sumMs += value;
  histogram.bucketCounts[bucketIndexOfMicroseconds(Math.ceil(value * MICROSECONDS_PER_MS))] += 1;
}

/**
 * @param {Object} histogram
 * @return {{count: number, sumMs: number, bucketCounts: number[]}}
 */
function snapshotTelemetryHistogram(histogram) {
  return {
    count: histogram.count,
    sumMs: histogram.sumMs,
    bucketCounts: Array.from(histogram.bucketCounts),
  };
}

/**
 * The bucket-wise difference of two snapshots of one histogram.
 * @param {Object} later
 * @param {Object} earlier
 * @return {{count: number, sumMs: number, bucketCounts: number[]}}
 */
function subtractTelemetryHistogramSnapshots(later, earlier) {
  return {
    count: later.count - earlier.count,
    sumMs: later.sumMs - earlier.sumMs,
    bucketCounts: later.bucketCounts.map((count, index) => count - earlier.bucketCounts[index]),
  };
}

/**
 * A most-recent ring: the last `capacity` values, each numbered by a
 * sequence that starts at 1 and never repeats within the ring's life.
 * @param {number} capacity
 * @return {Object}
 */
function createTelemetryRing(capacity) {
  return {capacity, slots: new Array(capacity), lastSequence: 0, lastEvictedValue: null};
}

/**
 * Append a value and return its sequence; the oldest value is overwritten
 * once the ring is full.
 * @param {Object} ring
 * @param {*} value
 * @return {number}
 */
function appendTelemetryRing(ring, value) {
  const slot = ring.lastSequence % ring.capacity;
  if (ring.lastSequence >= ring.capacity) ring.lastEvictedValue = ring.slots[slot];
  ring.slots[slot] = value;
  ring.lastSequence += 1;
  return ring.lastSequence;
}

/**
 * @param {Object} ring
 * @return {number} The oldest retained sequence (1 while nothing was evicted).
 */
function firstRetainedTelemetrySequence(ring) {
  return Math.max(1, ring.lastSequence - ring.capacity + 1);
}

/**
 * The values after `sinceSequence`, oldest first, with what the cursor
 * missed.
 * @param {Object} ring
 * @param {number} sinceSequence
 * @return {{firstRetainedSequence: number, lastSequence: number,
 *   droppedCount: number, values: Array}}
 */
function readTelemetryRingSince(ring, sinceSequence) {
  const firstRetainedSequence = firstRetainedTelemetrySequence(ring);
  const values = [];
  for (let sequence = Math.max(sinceSequence + 1, firstRetainedSequence);
    sequence <= ring.lastSequence; sequence += 1) {
    values.push(ring.slots[(sequence - 1) % ring.capacity]);
  }
  return {
    firstRetainedSequence,
    lastSequence: ring.lastSequence,
    droppedCount: Math.max(0, firstRetainedSequence - sinceSequence - 1),
    values,
  };
}

/**
 * Every retained value, oldest first.
 * @param {Object} ring
 * @return {Array}
 */
function retainedTelemetryRingValues(ring) {
  return readTelemetryRingSince(ring, 0).values;
}

export {
  TELEMETRY_HISTOGRAM_BUCKET_COUNT,
  TELEMETRY_HISTOGRAM_BUCKET_UPPER_BOUNDS_US,
  appendTelemetryRing,
  createTelemetryHistogram,
  createTelemetryRing,
  readTelemetryClockMs,
  readTelemetryRingSince,
  readTelemetryTimeOriginEpochMs,
  recordTelemetryHistogram,
  retainedTelemetryRingValues,
  snapshotTelemetryHistogram,
  subtractTelemetryHistogramSnapshots,
  takeTelemetryEpoch,
};
