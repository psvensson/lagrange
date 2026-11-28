/**
 * The transaction-path telemetry contract (quest
 * transaction-path-telemetry-export): its vocabulary, the one catalogue of
 * observation points, the answer validator, the window between two answers
 * and the caller-side collection of one answer per node.
 *
 * A node answers for itself from memory (GET
 * /api/admin/diagnostics/transactions). A caller asks each node directly and
 * gets one typed entry per node; nothing fans out over the transport being
 * measured. Telemetry is a hint: nothing that decides reads it.
 */
import {ADMIN_ROUTE} from '../admin/admin-constants.js';
import {
  TELEMETRY_HISTOGRAM_BUCKET_COUNT,
  createTelemetryHistogram,
  snapshotTelemetryHistogram,
  subtractTelemetryHistogramSnapshots,
} from './telemetry-histogram.js';

const TRANSACTION_TELEMETRY_SCHEMA_VERSION = 1;
// The cursor of the route: a sinceSequence above 0 names the window it was
// read in, (bootIncarnation, the coordinator section's telemetryEpoch); a
// cursor of another window is refused, typed, never answered as an empty
// page.
const TRANSACTION_TELEMETRY_CURSOR_PARAM = Object.freeze({
  SINCE_SEQUENCE: 'sinceSequence',
  BOOT_INCARNATION: 'bootIncarnation',
  TELEMETRY_EPOCH: 'telemetryEpoch',
});
const TRANSACTION_TELEMETRY_CURSOR_REFUSAL = Object.freeze({
  OTHER_BOOT_INCARNATION: 'OTHER_BOOT_INCARNATION',
  OTHER_TELEMETRY_EPOCH: 'OTHER_TELEMETRY_EPOCH',
});
const TRANSACTION_TELEMETRY_ACCOUNTING_TOLERANCE_MS = 0.5;

const TRANSACTION_TELEMETRY_SECTION = Object.freeze({
  COORDINATOR: 'coordinator',
  DELIVERY: 'delivery',
});

const TRANSACTION_TELEMETRY_AVAILABILITY = Object.freeze({
  MEASURED: 'measured',
  UNAVAILABLE: 'unavailable',
});

const TRANSACTION_TELEMETRY_UNAVAILABLE_REASON = Object.freeze({
  NOT_COMPOSED: 'NOT_COMPOSED',
});

const TRANSACTION_TELEMETRY_OBSERVATION_KIND = Object.freeze({
  HISTOGRAM: 'histogram',
  COUNTER: 'counter',
});

const TRANSACTION_TELEMETRY_UNIT = Object.freeze({MS: 'Ms', COUNT: 'Count'});

// Observation names; a labelled observation's id is `<name>.<label>`.
const TRANSACTION_TELEMETRY_OBSERVATION = Object.freeze({
  FIFO_WAIT: 'fifoWaitMs',
  RUN: 'runMs',
  COMMIT_SUB_PHASE: 'commitSubPhaseMs',
  COMMIT_UNATTRIBUTED: 'commitUnattributedMs',
  ROLLBACK_SUB_PHASE: 'rollbackSubPhaseMs',
  ROLLBACK_UNATTRIBUTED: 'rollbackUnattributedMs',
  RETRY_BACKOFF: 'participantRetryBackoffMs',
  METADATA_PERSIST: 'metadataPersistMs',
  METADATA_READBACK: 'metadataReadbackCount',
  COMPLETED_WITHOUT_SAMPLE: 'completedWithoutSampleCount',
  PARTICIPANT_REQUEST: 'participantRequestMs',
});

// Why a transaction this coordinator completed has no sample: one restored
// from rows has no BEGIN on this node, so no lane operations or accounting.
const TRANSACTION_WITHOUT_SAMPLE_REASON = Object.freeze({
  RECOVERED_FROM_ROWS: 'RECOVERED_FROM_ROWS',
});

// The session-lane operations of the coordinator (B2, B4).
const TRANSACTION_OPERATION_KIND = Object.freeze({
  BEGIN: 'BEGIN',
  WRITE: 'WRITE',
  READ: 'READ',
  COMMIT: 'COMMIT',
  ROLLBACK: 'ROLLBACK',
  RECOVERY: 'RECOVERY',
});

// Sub-phases of a terminal operation, in the order they run. The PREPARING
// and COMMITTING status writes are atomic with the freeze and the decision,
// so they are not phases of their own. A COMMIT that decides ROLLBACK fans
// out ROLLBACK; a phase that did not run is absent.
const TRANSACTION_SUB_PHASE = Object.freeze({
  FREEZE: 'FREEZE',
  PREPARE_FANOUT: 'PREPARE_FANOUT',
  PREPARED_STATUS: 'PREPARED_STATUS',
  DECISION: 'DECISION',
  COMMIT_FANOUT: 'COMMIT_FANOUT',
  ROLLBACK_FANOUT: 'ROLLBACK_FANOUT',
  SETTLEMENT: 'SETTLEMENT',
});

// Coordinator-to-participant requests at executeOnPartition (B5).
const PARTICIPANT_REQUEST_OPERATION = Object.freeze({
  QUERY_READ: 'QUERY_READ',
  QUERY_WRITE: 'QUERY_WRITE',
  BEGIN: 'BEGIN',
  PREPARE: 'PREPARE',
  COMMIT: 'COMMIT',
  ROLLBACK: 'ROLLBACK',
  TRANSACTION_OUTCOME: 'TRANSACTION_OUTCOME',
});

const TRANSACTION_TELEMETRY_NODE_STATE = Object.freeze({
  ANSWERED: 'ANSWERED',
  UNREACHABLE: 'UNREACHABLE',
  TIMED_OUT: 'TIMED_OUT',
  HTTP_REFUSED: 'HTTP_REFUSED',
  MALFORMED: 'MALFORMED',
});

const TRANSACTION_TELEMETRY_WINDOW_STATE = Object.freeze({
  COMPARABLE: 'COMPARABLE',
  INCOMPARABLE_RESTARTED: 'INCOMPARABLE_RESTARTED',
});

const TRANSACTION_TELEMETRY_INVALID_REASON = Object.freeze({
  NOT_AN_OBJECT: 'NOT_AN_OBJECT',
  SCHEMA_VERSION: 'SCHEMA_VERSION',
  NODE_IDENTITY: 'NODE_IDENTITY',
  CAPTURE_TIMES: 'CAPTURE_TIMES',
  SECTION_SET: 'SECTION_SET',
  AVAILABILITY: 'AVAILABILITY',
  OBSERVATION_SET: 'OBSERVATION_SET',
  OBSERVATION_VALUE: 'OBSERVATION_VALUE',
  SAMPLE_WINDOW: 'SAMPLE_WINDOW',
  SAMPLE_SHAPE: 'SAMPLE_SHAPE',
  ACCOUNTING: 'ACCOUNTING',
  NODE_ID_MISMATCH: 'NODE_ID_MISMATCH',
});

const HTTP_OK = 200;
const SAMPLE_OPERATIONS_LIMIT = 64;
const WITNESS = Object.freeze({W2: 'W2', W3: 'W3', W4: 'W4'});
const OWNER = Object.freeze({
  STATEMENT: 'src/query/distributed/distributed-transaction-statement.js',
  PARTICIPANT_SET: 'src/query/distributed/distributed-transaction-participant-set.js',
  DECISION_PROTOCOL: 'src/query/distributed/distributed-transaction-decision-protocol.js',
  PROTOCOL: 'src/query/distributed/distributed-transaction-protocol.js',
  TELEMETRY: 'src/query/distributed/distributed-transaction-telemetry.js',
  PERSISTENCE: 'src/query/sql-query-engine-transaction-persistence-methods.js',
  DELIVERY: 'src/query/query-executor-delivery-telemetry.js',
});
// The purpose of one coordinator metadata submission (B8), named by the
// site that makes it.
const TRANSACTION_METADATA_PERSIST_PURPOSE = Object.freeze({
  REGISTRATION: 'registration',
  PARTICIPANT_ADMISSION: 'participantAdmission',
  STATEMENT_OUTCOME: 'statementOutcome',
  MANIFEST_FREEZE: 'manifestFreeze',
  PREPARING: 'preparing',
  DECISION_AND_COMMITTING: 'decisionAndCommitting',
  SETTLEMENT: 'settlement',
});
const METADATA_PERSIST_PURPOSES = Object.freeze(
  Object.values(TRANSACTION_METADATA_PERSIST_PURPOSE));
const PARTICIPANT_REQUESTS_STATE = Object.freeze({
  MEASURED: 'measured',
  UNAVAILABLE: 'unavailable',
});
const PARTICIPANT_REQUESTS_UNAVAILABLE_REASON = Object.freeze({EVICTED: 'EVICTED'});
// A COMMIT that ended rolled back without any participant naming a refusal
// cause (a spent budget, an untyped participant failure).
const TRANSACTION_FAILURE_REFUSAL = Object.freeze({NOT_REFUSED: 'NOT_REFUSED'});
const PARTICIPANT_REQUEST_OUTCOME = Object.freeze({
  ACCEPTED: 'ACCEPTED',
  FAILED: 'FAILED',
  THROWN: 'THROWN',
});
const COMMIT_SUB_PHASES = Object.freeze(Object.values(TRANSACTION_SUB_PHASE));
const ROLLBACK_SUB_PHASES = Object.freeze([
  TRANSACTION_SUB_PHASE.FREEZE,
  TRANSACTION_SUB_PHASE.DECISION,
  TRANSACTION_SUB_PHASE.ROLLBACK_FANOUT,
  TRANSACTION_SUB_PHASE.SETTLEMENT,
]);
const KIND_WITNESS = Object.freeze({
  BEGIN: WITNESS.W2,
  WRITE: WITNESS.W2,
  READ: WITNESS.W3,
  COMMIT: WITNESS.W2,
  ROLLBACK: WITNESS.W2,
  RECOVERY: WITNESS.W4,
});
const REQUEST_WITNESS = Object.freeze({
  QUERY_READ: WITNESS.W3,
  QUERY_WRITE: WITNESS.W2,
  BEGIN: WITNESS.W2,
  PREPARE: WITNESS.W2,
  COMMIT: WITNESS.W2,
  ROLLBACK: WITNESS.W2,
  TRANSACTION_OUTCOME: WITNESS.W2,
});
const COUNTER_FIELDS = Object.freeze(['count']);
const COLLECT_ARGUMENTS_ERR =
  'collectTransactionTelemetry requires nodes [{nodeId, adminUrl, sinceSequence}] (with ' +
  'bootIncarnation and telemetryEpoch when sinceSequence is above 0), a positive integer ' +
  'deadlineMs and fetchAnswer';

function entry(section, id, kind, owner, witness) {
  const unit = kind === TRANSACTION_TELEMETRY_OBSERVATION_KIND.HISTOGRAM ?
    TRANSACTION_TELEMETRY_UNIT.MS : TRANSACTION_TELEMETRY_UNIT.COUNT;
  return Object.freeze({id, section, kind, unit, owner, witness});
}

function histogramEntries(section, prefix, labels, owner, witnessOf) {
  return labels.map((label) => entry(section, `${prefix}.${label}`,
    TRANSACTION_TELEMETRY_OBSERVATION_KIND.HISTOGRAM, owner, witnessOf(label)));
}

function subPhaseOwner(phase) {
  return phase === TRANSACTION_SUB_PHASE.FREEZE ? OWNER.PARTICIPANT_SET : OWNER.DECISION_PROTOCOL;
}

function buildCatalogue() {
  const {COORDINATOR, DELIVERY} = TRANSACTION_TELEMETRY_SECTION;
  const {HISTOGRAM, COUNTER} = TRANSACTION_TELEMETRY_OBSERVATION_KIND;
  const NAME = TRANSACTION_TELEMETRY_OBSERVATION;
  const kinds = Object.values(TRANSACTION_OPERATION_KIND);
  const atW2 = () => WITNESS.W2;
  const byKind = (kind) => KIND_WITNESS[kind];
  return Object.freeze([
    ...histogramEntries(COORDINATOR, NAME.FIFO_WAIT, kinds, OWNER.STATEMENT, byKind),
    ...histogramEntries(COORDINATOR, NAME.RUN, kinds, OWNER.STATEMENT, byKind),
    ...COMMIT_SUB_PHASES.map((phase) => entry(COORDINATOR, `${NAME.COMMIT_SUB_PHASE}.${phase}`,
      HISTOGRAM, subPhaseOwner(phase), WITNESS.W2)),
    entry(COORDINATOR, NAME.COMMIT_UNATTRIBUTED, HISTOGRAM, OWNER.DECISION_PROTOCOL, WITNESS.W2),
    ...ROLLBACK_SUB_PHASES.map((phase) => entry(COORDINATOR,
      `${NAME.ROLLBACK_SUB_PHASE}.${phase}`, HISTOGRAM, subPhaseOwner(phase), WITNESS.W2)),
    entry(COORDINATOR, NAME.ROLLBACK_UNATTRIBUTED, HISTOGRAM, OWNER.DECISION_PROTOCOL,
      WITNESS.W2),
    entry(COORDINATOR, NAME.RETRY_BACKOFF, HISTOGRAM, OWNER.PROTOCOL, WITNESS.W2),
    ...histogramEntries(COORDINATOR, NAME.METADATA_PERSIST, METADATA_PERSIST_PURPOSES,
      OWNER.TELEMETRY, atW2),
    entry(COORDINATOR, NAME.METADATA_READBACK, COUNTER, OWNER.PERSISTENCE, WITNESS.W2),
    ...Object.values(TRANSACTION_WITHOUT_SAMPLE_REASON).map((reason) => entry(COORDINATOR,
      `${NAME.COMPLETED_WITHOUT_SAMPLE}.${reason}`, COUNTER, OWNER.TELEMETRY, WITNESS.W4)),
    ...histogramEntries(DELIVERY, NAME.PARTICIPANT_REQUEST,
      Object.values(PARTICIPANT_REQUEST_OPERATION), OWNER.DELIVERY,
      (operation) => REQUEST_WITNESS[operation]),
  ]);
}

// Every observation point, each driven above zero by its named witness
// (test/diagnostics/transaction-telemetry-export-witnesses.js). A section
// answer contains exactly the entries of its section.
const TRANSACTION_TELEMETRY_CATALOGUE = buildCatalogue();

function catalogueEntriesOf(section) {
  return TRANSACTION_TELEMETRY_CATALOGUE.filter((candidate) => candidate.section === section);
}

/**
 * The observation set of one section: exactly its catalogue entries, each a
 * histogram or a counter at zero.
 * @param {string} section
 * @return {Object<string, Object>}
 */
function createTelemetryObservations(section) {
  const observations = {};
  for (const {id, kind} of catalogueEntriesOf(section)) {
    observations[id] = kind === TRANSACTION_TELEMETRY_OBSERVATION_KIND.HISTOGRAM ?
      createTelemetryHistogram() : {count: 0};
  }
  return observations;
}

/**
 * @param {Object<string, Object>} observations
 * @return {Object<string, Object>} Plain snapshots of every observation.
 */
function snapshotTelemetryObservations(observations) {
  const snapshot = {};
  for (const [id, observation] of Object.entries(observations)) {
    snapshot[id] = observation.bucketCounts === undefined ?
      {count: observation.count} : snapshotTelemetryHistogram(observation);
  }
  return snapshot;
}

/**
 * A section that cannot be measured on this node, with its named reason.
 * @param {string} reason
 * @return {Object}
 */
function unavailableTelemetrySection(reason) {
  return {availability: {state: TRANSACTION_TELEMETRY_AVAILABILITY.UNAVAILABLE, reason}};
}

// --- Validation --------------------------------------------------------------

const VALID = Object.freeze({valid: true, reason: null});

function invalid(reason) {
  return {valid: false, reason};
}

function isNonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function isNonNegativeNumber(value) {
  return Number.isFinite(value) && value >= 0;
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function sameKeys(object, expected) {
  const keys = Object.keys(object).sort();
  return keys.length === expected.length && keys.every((key, index) => key === expected[index]);
}

function validObservationValue(value, kind) {
  if (!isNonNegativeInteger(value?.count)) return false;
  if (kind === TRANSACTION_TELEMETRY_OBSERVATION_KIND.COUNTER) {
    return sameKeys(value, COUNTER_FIELDS);
  }
  return isNonNegativeNumber(value.sumMs) && Array.isArray(value.bucketCounts) &&
    value.bucketCounts.length === TELEMETRY_HISTOGRAM_BUCKET_COUNT &&
    value.bucketCounts.every(isNonNegativeInteger) &&
    value.bucketCounts.reduce((total, count) => total + count, 0) === value.count;
}

function validateObservations(observations, section) {
  const entries = catalogueEntriesOf(section);
  if (!observations || typeof observations !== 'object' ||
      !sameKeys(observations, entries.map(({id}) => id).sort())) {
    return invalid(TRANSACTION_TELEMETRY_INVALID_REASON.OBSERVATION_SET);
  }
  return entries.every(({id, kind}) => validObservationValue(observations[id], kind)) ?
    VALID : invalid(TRANSACTION_TELEMETRY_INVALID_REASON.OBSERVATION_VALUE);
}

function withinTolerance(left, right) {
  return Math.abs(left - right) <= TRANSACTION_TELEMETRY_ACCOUNTING_TOLERANCE_MS;
}

function terminalUnattributedOf(operation) {
  if (operation.kind === TRANSACTION_OPERATION_KIND.COMMIT) return operation.commitUnattributedMs;
  if (operation.kind === TRANSACTION_OPERATION_KIND.ROLLBACK) {
    return operation.rollbackUnattributedMs;
  }
  return null;
}

function validOperation(operation) {
  if (!Object.hasOwn(TRANSACTION_OPERATION_KIND, operation?.kind) ||
      !isNonNegativeNumber(operation.startOffsetMs) ||
      !isNonNegativeNumber(operation.fifoWaitMs) || !isNonNegativeNumber(operation.runMs) ||
      !Array.isArray(operation.subPhases)) {
    return false;
  }
  const unattributed = terminalUnattributedOf(operation);
  if (unattributed === null) return operation.subPhases.length === 0;
  const phases = operation.subPhases.reduce((total, phase) =>
    (Object.hasOwn(TRANSACTION_SUB_PHASE, phase?.phase) && isNonNegativeNumber(phase.ms) ?
      total + phase.ms : Number.NaN), 0);
  return Number.isFinite(phases) &&
    unattributed >= -TRANSACTION_TELEMETRY_ACCOUNTING_TOLERANCE_MS &&
    withinTolerance(operation.runMs, phases + unattributed);
}

function validateSampleAccounting(sample) {
  const {totalMs, attributedMs, betweenOperationsMs, unattributedMs} = sample.accounting ?? {};
  if (![totalMs, attributedMs, betweenOperationsMs].every(isNonNegativeNumber) ||
      !Number.isFinite(unattributedMs)) {
    return invalid(TRANSACTION_TELEMETRY_INVALID_REASON.SAMPLE_SHAPE);
  }
  let operationsMs = 0;
  for (const operation of sample.operations) {
    operationsMs += operation.fifoWaitMs + operation.runMs;
  }
  const holds = withinTolerance(attributedMs, operationsMs) &&
    unattributedMs >= -TRANSACTION_TELEMETRY_ACCOUNTING_TOLERANCE_MS &&
    withinTolerance(totalMs, attributedMs + betweenOperationsMs + unattributedMs);
  return holds ? VALID : invalid(TRANSACTION_TELEMETRY_INVALID_REASON.ACCOUNTING);
}

function validPurposeMap(map, validValue) {
  return Boolean(map) && sameKeys(map, [...METADATA_PERSIST_PURPOSES].sort()) &&
    METADATA_PERSIST_PURPOSES.every((purpose) => validValue(map[purpose]));
}

function validSampleMetadata(metadata) {
  return validPurposeMap(metadata?.submissionCountByPurpose, isNonNegativeInteger) &&
    validPurposeMap(metadata.persistMsByPurpose, isNonNegativeNumber) &&
    isNonNegativeInteger(metadata.readbackCount) &&
    isNonNegativeInteger(metadata.skippedParticipantSetMutationCount);
}

function validParticipantRequest(request) {
  return isNonEmptyString(request?.partitionId) &&
    Object.hasOwn(PARTICIPANT_REQUEST_OPERATION, request.operation) &&
    Object.hasOwn(PARTICIPANT_REQUEST_OUTCOME, request.outcome) &&
    isNonNegativeNumber(request.startOffsetMs) && isNonNegativeNumber(request.ms) &&
    isNonNegativeInteger(request.attempts);
}

function validParticipantRequests(requests) {
  if (requests?.state === PARTICIPANT_REQUESTS_STATE.UNAVAILABLE) {
    return Object.hasOwn(PARTICIPANT_REQUESTS_UNAVAILABLE_REASON, requests.reason);
  }
  return requests?.state === PARTICIPANT_REQUESTS_STATE.MEASURED &&
    Array.isArray(requests.entries) && requests.entries.every(validParticipantRequest);
}

function validFailure(failure) {
  return failure === undefined || (isNonEmptyString(failure?.stage) &&
    isNonEmptyString(failure.refusalCause) && isNonEmptyString(failure.errorCode));
}

function validSampleCounts(sample) {
  return [sample.writeStatementCount, sample.readStatementCount,
    sample.participantCount, sample.operationsOmittedCount, sample.observationCount]
    .every(isNonNegativeInteger) &&
    isNonNegativeNumber(sample.writeStatementsMs) && isNonNegativeNumber(sample.readStatementsMs);
}

function validSampleIdentity(sample, sinceSequence, lastSequence) {
  return Number.isSafeInteger(sample?.completionSequence) &&
    sample.completionSequence > sinceSequence && sample.completionSequence <= lastSequence &&
    isNonEmptyString(sample.identity?.sessionId) &&
    isNonEmptyString(sample.identity?.transactionId) &&
    isNonNegativeNumber(sample.startedAtMonotonicMs);
}

function validSampleOperations(operations) {
  return Array.isArray(operations) && operations.length <= SAMPLE_OPERATIONS_LIMIT &&
    operations.every(validOperation);
}

function validSampleShape(sample, sinceSequence, lastSequence) {
  return validSampleIdentity(sample, sinceSequence, lastSequence) &&
    isNonEmptyString(sample.outcome) && validFailure(sample.failure) &&
    validSampleOperations(sample.operations) && validSampleCounts(sample) &&
    validSampleMetadata(sample.metadata) &&
    validParticipantRequests(sample.participantRequests);
}

function validateSamples(samples, sinceSequence) {
  if (!samples || !isNonNegativeInteger(samples.capacity) ||
      !isNonNegativeInteger(samples.lastCompletionSequence) ||
      !isNonNegativeInteger(samples.droppedCount) ||
      !Number.isSafeInteger(samples.firstRetainedSequence) || !Array.isArray(samples.entries)) {
    return invalid(TRANSACTION_TELEMETRY_INVALID_REASON.SAMPLE_WINDOW);
  }
  let previous = sinceSequence;
  for (const sample of samples.entries) {
    if (!validSampleShape(sample, previous, samples.lastCompletionSequence)) {
      return invalid(TRANSACTION_TELEMETRY_INVALID_REASON.SAMPLE_SHAPE);
    }
    const accounting = validateSampleAccounting(sample);
    if (!accounting.valid) return accounting;
    previous = sample.completionSequence;
  }
  return VALID;
}

function validWithoutSampleEntry(entry) {
  return Number.isSafeInteger(entry?.completionSequence) && entry.completionSequence > 0 &&
    isNonEmptyString(entry.identity?.transactionId) &&
    isNonNegativeNumber(entry.startedAtMonotonicMs) &&
    Object.hasOwn(TRANSACTION_WITHOUT_SAMPLE_REASON, entry.reason) &&
    isNonEmptyString(entry.outcome) && validFailure(entry.failure) &&
    validSampleMetadata(entry.metadata) && isNonNegativeInteger(entry.observationCount) &&
    validParticipantRequests(entry.participantRequests);
}

function validateWithoutSample(withoutSample) {
  return withoutSample && isNonNegativeInteger(withoutSample.capacity) &&
    isNonNegativeInteger(withoutSample.droppedCount) && Array.isArray(withoutSample.entries) &&
    withoutSample.entries.length <= withoutSample.capacity &&
    withoutSample.entries.every(validWithoutSampleEntry) ?
    VALID : invalid(TRANSACTION_TELEMETRY_INVALID_REASON.SAMPLE_SHAPE);
}

function validateCoordinatorRings(section, sinceSequence) {
  const samples = validateSamples(section.samples, sinceSequence);
  return samples.valid ? validateWithoutSample(section.withoutSample) : samples;
}

function validateRequestRing(requests) {
  return requests && isNonNegativeInteger(requests.capacity) &&
    isNonNegativeInteger(requests.retainedCount) &&
    isNonNegativeInteger(requests.droppedCount) ?
    VALID : invalid(TRANSACTION_TELEMETRY_INVALID_REASON.SAMPLE_WINDOW);
}

function validateSection(name, section, sinceSequence) {
  const state = section?.availability?.state;
  if (state === TRANSACTION_TELEMETRY_AVAILABILITY.UNAVAILABLE) {
    return Object.hasOwn(TRANSACTION_TELEMETRY_UNAVAILABLE_REASON, section.availability.reason) ?
      VALID : invalid(TRANSACTION_TELEMETRY_INVALID_REASON.AVAILABILITY);
  }
  if (state !== TRANSACTION_TELEMETRY_AVAILABILITY.MEASURED ||
      !Number.isSafeInteger(section.telemetryEpoch) || section.telemetryEpoch <= 0 ||
      !isNonNegativeInteger(section.observationCount)) {
    return invalid(TRANSACTION_TELEMETRY_INVALID_REASON.AVAILABILITY);
  }
  const observations = validateObservations(section.observations, name);
  if (!observations.valid) return observations;
  return name === TRANSACTION_TELEMETRY_SECTION.COORDINATOR ?
    validateCoordinatorRings(section, sinceSequence) : validateRequestRing(section.requests);
}

function validateAnswerHeader(answer) {
  if (answer?.schemaVersion !== TRANSACTION_TELEMETRY_SCHEMA_VERSION) {
    return invalid(TRANSACTION_TELEMETRY_INVALID_REASON.SCHEMA_VERSION);
  }
  if (!isNonEmptyString(answer.nodeId) || !Number.isSafeInteger(answer.bootIncarnation) ||
      answer.bootIncarnation <= 0) {
    return invalid(TRANSACTION_TELEMETRY_INVALID_REASON.NODE_IDENTITY);
  }
  const times = [answer.capturedAtEpochMs, answer.capturedAtMonotonicMs,
    answer.timeOriginEpochMs, answer.answerBuildMs];
  return times.every(isNonNegativeNumber) && isNonNegativeInteger(answer.sinceSequence) ?
    VALID : invalid(TRANSACTION_TELEMETRY_INVALID_REASON.CAPTURE_TIMES);
}

/**
 * Check one node answer against the contract, including every sample's
 * accounting identity.
 * @param {*} answer
 * @return {{valid: boolean, reason: (string|null)}}
 */
function validateTransactionTelemetryAnswer(answer) {
  if (!answer || typeof answer !== 'object') {
    return invalid(TRANSACTION_TELEMETRY_INVALID_REASON.NOT_AN_OBJECT);
  }
  const header = validateAnswerHeader(answer);
  if (!header.valid) return header;
  const names = Object.values(TRANSACTION_TELEMETRY_SECTION).sort();
  if (!answer.sections || typeof answer.sections !== 'object' ||
      !sameKeys(answer.sections, names)) {
    return invalid(TRANSACTION_TELEMETRY_INVALID_REASON.SECTION_SET);
  }
  for (const name of names) {
    const verdict = validateSection(name, answer.sections[name], answer.sinceSequence);
    if (!verdict.valid) return verdict;
  }
  return VALID;
}

// --- Window ------------------------------------------------------------------

function isMeasured(section) {
  return section?.availability?.state === TRANSACTION_TELEMETRY_AVAILABILITY.MEASURED;
}

function sectionWindow(earlier, later) {
  if (!isMeasured(earlier) || !isMeasured(later)) {
    return isMeasured(later) ? earlier : later;
  }
  const observations = {};
  for (const [id, value] of Object.entries(later.observations)) {
    observations[id] = value.bucketCounts === undefined ?
      {count: value.count - earlier.observations[id].count} :
      subtractTelemetryHistogramSnapshots(value, earlier.observations[id]);
  }
  return {availability: later.availability, observations};
}

function sameTelemetryIncarnation(earlier, later) {
  if (earlier.bootIncarnation !== later.bootIncarnation) return false;
  return Object.values(TRANSACTION_TELEMETRY_SECTION).every((name) => {
    const before = earlier.sections[name];
    const after = later.sections[name];
    return !isMeasured(before) || !isMeasured(after) ||
      before.telemetryEpoch === after.telemetryEpoch;
  });
}

/**
 * The window between two valid answers of one node: bucket-wise deltas when
 * the boot incarnation and every measured section's telemetry epoch match,
 * else INCOMPARABLE_RESTARTED with no delta.
 * @param {Object} earlier
 * @param {Object} later
 * @return {Object}
 */
function deriveTransactionTelemetryWindow(earlier, later) {
  if (!sameTelemetryIncarnation(earlier, later)) {
    return {state: TRANSACTION_TELEMETRY_WINDOW_STATE.INCOMPARABLE_RESTARTED};
  }
  const sections = {};
  for (const name of Object.values(TRANSACTION_TELEMETRY_SECTION)) {
    sections[name] = sectionWindow(earlier.sections[name], later.sections[name]);
  }
  return {state: TRANSACTION_TELEMETRY_WINDOW_STATE.COMPARABLE, sections};
}

// --- Collection --------------------------------------------------------------

const DEADLINE_PASSED = Symbol('deadlinePassed');

function transactionTelemetryUrlOf(node) {
  const param = TRANSACTION_TELEMETRY_CURSOR_PARAM;
  const window = node.sinceSequence === 0 ? '' :
    `&${param.BOOT_INCARNATION}=${node.bootIncarnation}` +
    `&${param.TELEMETRY_EPOCH}=${node.telemetryEpoch}`;
  return `${node.adminUrl}${ADMIN_ROUTE.TRANSACTION_DIAGNOSTICS}?` +
    `${param.SINCE_SEQUENCE}=${node.sinceSequence}${window}`;
}

function isPositiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

// A cursor above 0 names the window it was read in.
function validCollectionNode(node) {
  return isNonEmptyString(node?.nodeId) && isNonEmptyString(node.adminUrl) &&
    isNonNegativeInteger(node.sinceSequence) && (node.sinceSequence === 0 ||
      (isPositiveInteger(node.bootIncarnation) && isPositiveInteger(node.telemetryEpoch)));
}

function errorCodeOf(error) {
  if (isNonEmptyString(error?.code)) return error.code;
  return isNonEmptyString(error?.name) ? error.name : typeof error;
}

// The body of a 200 answer: valid and answered by the node that was asked.
function answeredBodyVerdictOf(nodeId, body) {
  const verdict = validateTransactionTelemetryAnswer(body);
  return verdict.valid && body.nodeId !== nodeId ?
    invalid(TRANSACTION_TELEMETRY_INVALID_REASON.NODE_ID_MISMATCH) : verdict;
}

function classifyResponse(base, response) {
  if (!Number.isSafeInteger(response?.status)) {
    return {...base, state: TRANSACTION_TELEMETRY_NODE_STATE.MALFORMED,
      reason: TRANSACTION_TELEMETRY_INVALID_REASON.NOT_AN_OBJECT};
  } else if (response.status !== HTTP_OK) {
    const refusal = response.body?.reason;
    return {...base, state: TRANSACTION_TELEMETRY_NODE_STATE.HTTP_REFUSED,
      httpStatus: response.status,
      ...(Object.hasOwn(TRANSACTION_TELEMETRY_CURSOR_REFUSAL, refusal) ? {reason: refusal} : {})};
  }
  const verdict = answeredBodyVerdictOf(base.nodeId, response.body);
  return verdict.valid ?
    {...base, state: TRANSACTION_TELEMETRY_NODE_STATE.ANSWERED, answer: response.body} :
    {...base, state: TRANSACTION_TELEMETRY_NODE_STATE.MALFORMED, reason: verdict.reason};
}

async function collectNodeTelemetry(node, deadlineMs, fetchAnswer) {
  const base = {nodeId: node.nodeId, adminUrl: node.adminUrl};
  const controller = new AbortController();
  let timer = null;
  const deadline = new Promise((resolve) => {
    timer = setTimeout(() => resolve(DEADLINE_PASSED), deadlineMs);
  });
  const request = Promise.resolve()
    .then(() => fetchAnswer({nodeId: node.nodeId,
      url: transactionTelemetryUrlOf(node),
      signal: controller.signal}))
    .then((response) => ({rejected: false, response}),
      (error) => ({rejected: true, error}));
  try {
    const settled = await Promise.race([request, deadline]);
    if (settled === DEADLINE_PASSED) {
      controller.abort();
      return {...base, state: TRANSACTION_TELEMETRY_NODE_STATE.TIMED_OUT, deadlineMs};
    } else if (settled.rejected) {
      return {...base, state: TRANSACTION_TELEMETRY_NODE_STATE.UNREACHABLE,
        errorCode: errorCodeOf(settled.error)};
    }
    return classifyResponse(base, settled.response);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Ask every node for its own answer, each within `deadlineMs`, and return
 * one typed entry per node in the order asked: ANSWERED (with the answer),
 * UNREACHABLE (errorCode), TIMED_OUT (the request is aborted), HTTP_REFUSED
 * (httpStatus) or MALFORMED (reason).
 * @param {Object} options - {nodes: [{nodeId, adminUrl, sinceSequence,
 *   bootIncarnation, telemetryEpoch}] (the window only for a cursor above 0),
 *   deadlineMs, fetchAnswer({nodeId, url, signal}) -> {status, body}}.
 * @return {Promise<Object[]>}
 */
async function collectTransactionTelemetry({nodes, deadlineMs, fetchAnswer}) {
  if (!Array.isArray(nodes) || !Number.isSafeInteger(deadlineMs) || deadlineMs <= 0 ||
      typeof fetchAnswer !== 'function' || !nodes.every(validCollectionNode)) {
    throw new TypeError(COLLECT_ARGUMENTS_ERR);
  }
  return Promise.all(nodes.map((node) => collectNodeTelemetry(node, deadlineMs, fetchAnswer)));
}

export {
  PARTICIPANT_REQUEST_OPERATION,
  PARTICIPANT_REQUEST_OUTCOME,
  PARTICIPANT_REQUESTS_STATE,
  PARTICIPANT_REQUESTS_UNAVAILABLE_REASON,
  TRANSACTION_FAILURE_REFUSAL,
  TRANSACTION_METADATA_PERSIST_PURPOSE,
  TRANSACTION_OPERATION_KIND,
  TRANSACTION_SUB_PHASE,
  TRANSACTION_TELEMETRY_AVAILABILITY,
  TRANSACTION_TELEMETRY_CATALOGUE,
  TRANSACTION_TELEMETRY_CURSOR_PARAM,
  TRANSACTION_TELEMETRY_CURSOR_REFUSAL,
  TRANSACTION_TELEMETRY_NODE_STATE,
  TRANSACTION_TELEMETRY_OBSERVATION,
  TRANSACTION_TELEMETRY_SCHEMA_VERSION,
  TRANSACTION_TELEMETRY_SECTION,
  TRANSACTION_TELEMETRY_UNAVAILABLE_REASON,
  TRANSACTION_TELEMETRY_WINDOW_STATE,
  TRANSACTION_WITHOUT_SAMPLE_REASON,
  collectTransactionTelemetry,
  createTelemetryObservations,
  deriveTransactionTelemetryWindow,
  snapshotTelemetryObservations,
  unavailableTelemetrySection,
  validateTransactionTelemetryAnswer,
};
