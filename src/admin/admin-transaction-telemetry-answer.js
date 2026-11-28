/**
 * The node-local answer of GET /api/admin/diagnostics/transactions (quest
 * transaction-path-telemetry-export): built synchronously from memory, with
 * no I/O, no await and no system cache, so it answers while the control
 * plane is stalled. Each owner's section is read through the owner's own
 * read; a section whose owner is absent is named unavailable.
 *
 * The answer builder is bound in the admin composition with the node's
 * durable boot incarnation (lagrange-runtime-startup.js reserves it). It is
 * never read from the admin API's bootIncarnation field: that field feeds
 * load-lane admission and keeps its own semantics.
 */
import {
  TRANSACTION_TELEMETRY_CURSOR_PARAM,
  TRANSACTION_TELEMETRY_CURSOR_REFUSAL,
  TRANSACTION_TELEMETRY_SCHEMA_VERSION,
  TRANSACTION_TELEMETRY_UNAVAILABLE_REASON,
  unavailableTelemetrySection,
} from '../diagnostics/transaction-telemetry-collection.js';
import {
  readTelemetryClockMs,
  readTelemetryTimeOriginEpochMs,
} from '../diagnostics/telemetry-histogram.js';
import {
  firstObservedAtMsOf,
  indexParticipantRequests,
  participantRequestsOfSample,
  readParticipantRequestTelemetrySection,
} from '../query/query-executor-delivery-telemetry.js';

const CURSOR_PATTERN = /^\d+$/u;
const PARAM = TRANSACTION_TELEMETRY_CURSOR_PARAM;
const BUILDER_ARGUMENTS_ERR =
  'createTransactionTelemetryAnswerBuilder requires a nodeId and a positive integer ' +
  'bootIncarnation from its durable owner';

function notComposed() {
  return unavailableTelemetrySection(TRANSACTION_TELEMETRY_UNAVAILABLE_REASON.NOT_COMPOSED);
}

// Each coordinator sample, and each transaction completed without a sample,
// gets the executor's request records of its transaction, joined by
// transactionId (ruling 49): a request of a transaction restored from rows is
// attributed to its entry, not left as an orphan. Without the executor's
// section the coordinator section is not composed either.
function coordinatorSectionOf(sqlQueryEngine, sinceSequence) {
  const coordinator = sqlQueryEngine?.transactionCoordinator;
  const requests = sqlQueryEngine?.queryExecutor?.participantRequestTelemetry;
  if (coordinator === undefined || requests === undefined) return notComposed();
  const section = coordinator.readTransactionTelemetrySection({sinceSequence});
  const index = indexParticipantRequests(requests);
  for (const sample of section.samples.entries) {
    sample.participantRequests = participantRequestsOfSample(index, sample);
  }
  for (const entry of section.withoutSample.entries) {
    entry.startedAtMonotonicMs = firstObservedAtMsOf(index, entry.identity.transactionId,
      entry.startedAtMonotonicMs);
    entry.participantRequests = participantRequestsOfSample(index, entry);
  }
  return section;
}

function deliverySectionOf(sqlQueryEngine) {
  const store = sqlQueryEngine?.queryExecutor?.participantRequestTelemetry;
  return store === undefined ? notComposed() : readParticipantRequestTelemetrySection(store);
}

// A non-negative integer query value; anything else is NaN.
function parseCursorInteger(raw) {
  return typeof raw === 'string' && CURSOR_PATTERN.test(raw) ? Number(raw) : Number.NaN;
}

/**
 * Read the cursor query parameters. An absent sinceSequence means 0 (from
 * the start of the ring) and needs no window; a sinceSequence above 0 needs
 * the bootIncarnation and telemetryEpoch of the answer it came from.
 * Anything else is refused.
 * @param {Object} [query]
 * @return {Object|null} {sinceSequence, bootIncarnation, telemetryEpoch};
 *   the window is 0 for a cursor of 0.
 */
function parseTransactionTelemetryCursor(query = {}) {
  const raw = query?.[PARAM.SINCE_SEQUENCE];
  const sinceSequence = raw === undefined ? 0 : parseCursorInteger(raw);
  if (!Number.isSafeInteger(sinceSequence)) return null;
  if (sinceSequence === 0) return {sinceSequence, bootIncarnation: 0, telemetryEpoch: 0};
  const bootIncarnation = parseCursorInteger(query[PARAM.BOOT_INCARNATION]);
  const telemetryEpoch = parseCursorInteger(query[PARAM.TELEMETRY_EPOCH]);
  return Number.isSafeInteger(bootIncarnation) && bootIncarnation > 0 &&
    Number.isSafeInteger(telemetryEpoch) && telemetryEpoch > 0 ?
    {sinceSequence, bootIncarnation, telemetryEpoch} : null;
}

// A cursor above 0 read in another window would page an unrelated ring.
function cursorRefusalOf(cursor, bootIncarnation, coordinatorSection) {
  if (cursor.sinceSequence === 0) return null;
  if (cursor.bootIncarnation !== bootIncarnation) {
    return TRANSACTION_TELEMETRY_CURSOR_REFUSAL.OTHER_BOOT_INCARNATION;
  }
  return coordinatorSection.telemetryEpoch === cursor.telemetryEpoch ? null :
    TRANSACTION_TELEMETRY_CURSOR_REFUSAL.OTHER_TELEMETRY_EPOCH;
}

/**
 * Bind the answer to this node's identity.
 * @param {Object} identity - {nodeId, bootIncarnation}.
 * @return {Function} ({sqlQueryEngine, cursor}) -> {answer} or
 *   {cursorRefusal: {reason, bootIncarnation, telemetryEpoch}} naming this
 *   node's window.
 */
function createTransactionTelemetryAnswerBuilder({nodeId, bootIncarnation}) {
  if (typeof nodeId !== 'string' || nodeId.length === 0 ||
      !Number.isSafeInteger(bootIncarnation) || bootIncarnation <= 0) {
    throw new TypeError(BUILDER_ARGUMENTS_ERR);
  }
  return function buildTransactionTelemetryAnswer({sqlQueryEngine, cursor}) {
    const {sinceSequence} = cursor;
    const startedAtMs = readTelemetryClockMs();
    const coordinator = coordinatorSectionOf(sqlQueryEngine, sinceSequence);
    const refusal = cursorRefusalOf(cursor, bootIncarnation, coordinator);
    if (refusal !== null) {
      return {cursorRefusal: {reason: refusal, bootIncarnation,
        telemetryEpoch: coordinator.telemetryEpoch}};
    }
    const sections = {coordinator, delivery: deliverySectionOf(sqlQueryEngine)};
    const capturedAtMonotonicMs = readTelemetryClockMs();
    return {answer: {
      schemaVersion: TRANSACTION_TELEMETRY_SCHEMA_VERSION,
      nodeId,
      bootIncarnation,
      capturedAtEpochMs: Date.now(),
      capturedAtMonotonicMs,
      timeOriginEpochMs: readTelemetryTimeOriginEpochMs(),
      answerBuildMs: capturedAtMonotonicMs - startedAtMs,
      sinceSequence,
      sections,
    }};
  };
}

export {createTransactionTelemetryAnswerBuilder, parseTransactionTelemetryCursor};
