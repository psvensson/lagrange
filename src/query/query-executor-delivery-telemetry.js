/**
 * The query executor's participant request section of the transaction-path
 * telemetry (quest transaction-path-telemetry-export, B5; ruling 49): one
 * record per executeOnPartition call with its operation, partition, time,
 * deliveries and named outcome, histograms by operation, and a most-recent
 * ring of the records that carry a transaction identity. The answer builder
 * joins those records into the coordinator's samples by transactionId at read
 * time; the executor has no route to the coordinator.
 *
 * Telemetry is a hint: nothing that decides reads it. The record is the one
 * object a request adds; it is taken and settled synchronously inside the
 * executor's existing control flow.
 */
import {
  PARTICIPANT_REQUEST_OPERATION,
  PARTICIPANT_REQUEST_OUTCOME,
  PARTICIPANT_REQUESTS_STATE,
  PARTICIPANT_REQUESTS_UNAVAILABLE_REASON,
  TRANSACTION_TELEMETRY_AVAILABILITY,
  TRANSACTION_TELEMETRY_OBSERVATION,
  TRANSACTION_TELEMETRY_SECTION,
  createTelemetryObservations,
  snapshotTelemetryObservations,
} from '../diagnostics/transaction-telemetry-collection.js';
import {
  appendTelemetryRing,
  createTelemetryRing,
  readTelemetryClockMs,
  recordTelemetryHistogram,
  retainedTelemetryRingValues,
  takeTelemetryEpoch,
} from '../diagnostics/telemetry-histogram.js';
import {QUERY_OPERATION} from './query-constants.js';

// Participant request records joined into samples at read time: about 55 per
// new_order, so the ring covers the busiest expected poll interval. About
// 3.2 MB retained when full (measured 2026-11-28).
const PARTICIPANT_REQUEST_RING_CAPACITY = 16384;
const SETTLE_OBSERVATIONS = 2;
const CONTROL_OPERATION = Object.freeze({
  [QUERY_OPERATION.BEGIN]: PARTICIPANT_REQUEST_OPERATION.BEGIN,
  [QUERY_OPERATION.PREPARE]: PARTICIPANT_REQUEST_OPERATION.PREPARE,
  [QUERY_OPERATION.COMMIT]: PARTICIPANT_REQUEST_OPERATION.COMMIT,
  [QUERY_OPERATION.ROLLBACK]: PARTICIPANT_REQUEST_OPERATION.ROLLBACK,
  [QUERY_OPERATION.TRANSACTION_OUTCOME]: PARTICIPANT_REQUEST_OPERATION.TRANSACTION_OUTCOME,
});

/**
 * @return {Object} The executor's participant request store.
 */
function createParticipantRequestTelemetryStore() {
  const observations = createTelemetryObservations(TRANSACTION_TELEMETRY_SECTION.DELIVERY);
  const byOperation = {};
  for (const operation of Object.values(PARTICIPANT_REQUEST_OPERATION)) {
    byOperation[operation] =
      observations[`${TRANSACTION_TELEMETRY_OBSERVATION.PARTICIPANT_REQUEST}.${operation}`];
  }
  return {
    telemetryEpoch: takeTelemetryEpoch(),
    observationCount: 0,
    observations,
    byOperation,
    requests: createTelemetryRing(PARTICIPANT_REQUEST_RING_CAPACITY),
  };
}

/**
 * Take the record of one executeOnPartition call at its start.
 * @param {string} partitionId
 * @param {boolean} forRead
 * @return {Object}
 */
function begin(partitionId, forRead) {
  return {partitionId, forRead, request: null, attempts: 0, settled: false,
    startedAtMs: readTelemetryClockMs(), settledAtMs: 0, ms: 0};
}

/**
 * Count one delivery of the request; the first built request names the
 * operation and the transaction.
 * @param {Object} record - From begin.
 * @param {Object} request - The request message built for this delivery.
 */
function noteSubmission(record, request) {
  record.attempts += 1;
  if (record.request === null) record.request = request;
}

function operationOf(record, request) {
  if (request.type === QUERY_OPERATION.TRANSACTION) return CONTROL_OPERATION[request.operation];
  return record.forRead ? PARTICIPANT_REQUEST_OPERATION.QUERY_READ :
    PARTICIPANT_REQUEST_OPERATION.QUERY_WRITE;
}

// A call that never built a request delivered nothing to a participant: it
// is no participant request, and its time stays in the operation that made
// it. A request of an open transaction carries the transaction's identity
// (control requests and stamped statements alike); only those are joined.
function finish(executor, record, outcome) {
  if (record.settled) return;
  record.settled = true;
  const request = record.request;
  record.request = null;
  if (request === null) return;
  const store = executor.participantRequestTelemetry;
  record.settledAtMs = readTelemetryClockMs();
  record.ms = record.settledAtMs - record.startedAtMs;
  record.outcome = outcome;
  record.operation = operationOf(record, request);
  record.transactionId = request.transactionId;
  const histogram = store.byOperation[record.operation];
  if (histogram === undefined) return;
  recordTelemetryHistogram(histogram, record.ms);
  store.observationCount += SETTLE_OBSERVATIONS;
  if (typeof record.transactionId === 'string') appendTelemetryRing(store.requests, record);
}

/**
 * Settle the record with what executeOnPartition returns.
 * @param {Object} executor
 * @param {Object} record
 * @param {Object} result
 * @return {Object} The result, unchanged.
 */
function settle(executor, record, result) {
  finish(executor, record, result?.success === true ?
    PARTICIPANT_REQUEST_OUTCOME.ACCEPTED : PARTICIPANT_REQUEST_OUTCOME.FAILED);
  return result;
}

/**
 * Settle the record with what executeOnPartition throws.
 * @param {Object} executor
 * @param {Object} record
 * @param {*} error
 * @return {*} The error, unchanged.
 */
function settleThrown(executor, record, error) {
  finish(executor, record, PARTICIPANT_REQUEST_OUTCOME.THROWN);
  return error;
}

/**
 * @param {Object} store
 * @return {Object} The measured delivery section.
 */
function readParticipantRequestTelemetrySection(store) {
  const {capacity, lastSequence} = store.requests;
  return {
    availability: {state: TRANSACTION_TELEMETRY_AVAILABILITY.MEASURED},
    telemetryEpoch: store.telemetryEpoch,
    observationCount: store.observationCount,
    observations: snapshotTelemetryObservations(store.observations),
    requests: {
      capacity,
      retainedCount: Math.min(capacity, lastSequence),
      droppedCount: Math.max(0, lastSequence - capacity),
    },
  };
}

/**
 * One pass over the retained records, grouped by transaction.
 * @param {Object} store
 * @return {{byTransaction: Map<string, Object[]>, lastEvictedSettledAtMs: number}}
 */
function indexParticipantRequests(store) {
  const byTransaction = new Map();
  for (const record of retainedTelemetryRingValues(store.requests)) {
    const records = byTransaction.get(record.transactionId);
    if (records === undefined) {
      byTransaction.set(record.transactionId, [record]);
    } else {
      records.push(record);
    }
  }
  const evicted = store.requests.lastEvictedValue;
  return {byTransaction,
    lastEvictedSettledAtMs: evicted === null ? Number.NEGATIVE_INFINITY : evicted.settledAtMs};
}

/**
 * The first time this node observed a transaction completed without a
 * sample: its first telemetry observation or its earliest retained request,
 * whichever came first (a transaction restored from rows may send a request
 * before its first metadata write).
 * @param {Object} index - From indexParticipantRequests.
 * @param {string} transactionId
 * @param {number} observedAtMs - The handle's first observation.
 * @return {number}
 */
function firstObservedAtMsOf(index, transactionId, observedAtMs) {
  let first = observedAtMs;
  for (const record of index.byTransaction.get(transactionId) ?? []) {
    first = Math.min(first, record.startedAtMs);
  }
  return first;
}

/**
 * The participant requests of one coordinator sample, in request order, or
 * EVICTED when a record that may belong to it has left the ring.
 * @param {Object} index - From indexParticipantRequests.
 * @param {Object} sample - A coordinator sample.
 * @return {Object}
 */
function participantRequestsOfSample(index, sample) {
  if (index.lastEvictedSettledAtMs >= sample.startedAtMonotonicMs) {
    return {state: PARTICIPANT_REQUESTS_STATE.UNAVAILABLE,
      reason: PARTICIPANT_REQUESTS_UNAVAILABLE_REASON.EVICTED};
  }
  const records = index.byTransaction.get(sample.identity.transactionId) ?? [];
  return {
    state: PARTICIPANT_REQUESTS_STATE.MEASURED,
    entries: records
      .map((record) => ({partitionId: record.partitionId, operation: record.operation,
        startOffsetMs: record.startedAtMs - sample.startedAtMonotonicMs, ms: record.ms,
        attempts: record.attempts, outcome: record.outcome}))
      .sort((left, right) => left.startOffsetMs - right.startOffsetMs),
  };
}

export {
  begin,
  createParticipantRequestTelemetryStore,
  firstObservedAtMsOf,
  indexParticipantRequests,
  noteSubmission,
  participantRequestsOfSample,
  readParticipantRequestTelemetrySection,
  settle,
  settleThrown,
};
