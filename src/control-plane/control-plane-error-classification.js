import {
  NUM,
} from '../constants/index.js';
import {
  OPERATION_INTENT_TERMINAL_COLLISION_CODE,
  isRetryableWriteError,
} from '../constants/errors.js';
import {
  PRESSURE_GOVERNOR_ERROR_CODE,
} from './pressure-governor.js';
import {CDC_ERROR_CODE} from '../cdc/cdc-constants.js';
import {QUERY_ERROR_CODE, QUERY_ERROR_MSG} from '../query/query-constants.js';
import {APPLICATION_DATABASE_ERROR_CODE} from
  '../query/application-database-constants.js';
import {SCHEMA_PROVISIONING_ERROR_CODE} from
  '../query/schema-provisioning-job-constants.js';
import {
  OUTBOUND_QUEUE_BACKPRESSURE_ERROR_CODE,
  ROUTER_CONNECTION_CLOSED_ERROR_CODE,
  ROUTER_HANDLER_FAILED_ERROR_CODE,
  ROUTER_MESSAGE_TIMEOUT_ERROR_CODE,
  ROUTER_NO_CONNECTION_ERROR_CODE,
  ROUTER_QUERY_TRANSPORT_NOT_READY_ERROR_CODE,
  WEBSOCKET_CONNECT_TIMEOUT_ERROR_CODE,
} from '../transport/transport-error-codes.js';
import {
  isPartitionWriteFailureCode,
  isRetryableWriteFailureCode,
} from '../partition/partition-write-kernel.js';


const numberIsSafeInteger = Number.isSafeInteger;
const objectHasOwn = Object.hasOwn;
const COMMITTED_STATEMENT_FAILURE_OUTCOME = 'statement_failed';
// What the classifier decides for a whole failure (the failed answer or
// thrown error, with everything linked to it). UNCLASSIFIED is the named
// state of a failure no owner lists: it is neither retried nor recorded as
// permanent by this classifier; its consumer decides on that state.
// STOPPED is the named state of a failure whose outcome belongs to another
// owner (this node's own shutdown, a transaction decision in doubt that
// recovery resolves): it is neither retried nor recorded as permanent.
const TYPED_DISTRIBUTED_FAILURE_DECISION = Object.freeze({
  RETRYABLE: 'retryable',
  STOPPED: 'stopped',
  TERMINAL: 'terminal',
  UNCLASSIFIED: 'unclassified',
});

// What one linked failure says by its own codes, markers and text.
const CONTROL_PLANE_FAILURE_CANDIDATE_CLASS = Object.freeze({
  PERMANENT: 'permanent',
  STOPPED: 'stopped',
  TRANSIENT: 'transient',
  UNCLASSIFIED: 'unclassified',
});

const RETRYABLE_CONTROL_PLANE_ERROR_FRAGMENTS = Object.freeze([
  'authoritative_row_source_unavailable',
  'Outbound queue for node',
  'No connection to node',
  'Connection to node',
  'No handler registered for address',
  'Cache update not observed for',
  'query_admission_deferred',
  'closed',
  'control_plane_pressure_degraded',
  'No active transaction to commit',
]);

const CONTROL_PLANE_FAILURE_REASON = Object.freeze({
  AUTHORITATIVE_ROW_SOURCE_UNAVAILABLE:
    'authoritative_row_source_unavailable',
  DISTRIBUTED_PARTICIPANT_FAILURE:
    'distributed_participant_failure',
  RECONNECT_DELIVERY_FAILURE:
    'reconnect_delivery_failure',
  PRESSURE_DEGRADED:
    'control_plane_pressure_degraded',
  UNKNOWN:
    'unknown',
});

const CONTROL_PLANE_CONVERGENCE_CLASS = Object.freeze({
  CRITICAL: 'critical_convergence',
  ORDINARY_REPAIR: 'ordinary_repair',
  DIAGNOSTIC_REPAIR: 'diagnostic_repair',
});

const CONTROL_PLANE_CONVERGENCE_PRESSURE_OUTCOME = Object.freeze({
  CRITICAL_ADMITTED: 'critical_admitted',
  CRITICAL_DEFERRED: 'critical_deferred',
  CRITICAL_REJECTED: 'critical_rejected',
  ORDINARY_DEFERRED: 'ordinary_deferred',
  DIAGNOSTIC_DEFERRED: 'diagnostic_deferred',
});

const CONTROL_PLANE_FAILURE_FRAGMENT = Object.freeze({
  AUTHORITATIVE_ROW_SOURCE_UNAVAILABLE:
    'authoritative_row_source_unavailable',
  DISTRIBUTED_PARTICIPANT_FAILURE:
    QUERY_ERROR_MSG.DISTRIBUTED_PARTICIPANT_FAILURE,
  NO_CONNECTION_TO_NODE:
    'No connection to node',
  CONNECTION_TO_NODE:
    'Connection to node',
  OUTBOUND_QUEUE_FOR_NODE:
    'Outbound queue for node',
  NO_HANDLER_REGISTERED_FOR_ADDRESS:
    'No handler registered for address',
  CONTROL_PLANE_PRESSURE_DEGRADED:
    'control_plane_pressure_degraded',
});

const CONTROL_PLANE_FAILURE_ERROR_CODE = Object.freeze({
  DISTRIBUTED_PARTICIPANT_FAILURE:
    QUERY_ERROR_CODE.DISTRIBUTED_PARTICIPANT_FAILURE,
  CONTROL_PLANE_PRESSURE_DEGRADED:
    PRESSURE_GOVERNOR_ERROR_CODE.CONTROL_PLANE_PRESSURE_DEGRADED,
});

const STALE_NODE_INCARNATION_CODE = 'STALE_NODE_INCARNATION';

const STALE_NODE_INCARNATION_ERROR_MESSAGE =
  'Refusing node state update from a stale boot incarnation';

const {PERMANENT, STOPPED, TRANSIENT, UNCLASSIFIED} =
  CONTROL_PLANE_FAILURE_CANDIDATE_CLASS;

function codeDecision(candidateClass, reason) {
  return Object.freeze({candidateClass, reason});
}

// The one decision per typed code this classifier reads, each code imported
// from the owner that raises it. Every query and transport code is listed:
// one left unclassified is so by decision, with its reason, and a new owner
// code fails the classification witness until it is decided here. A code
// decides its failure whatever its text or retry hints say.
const CONTROL_PLANE_ERROR_CODE_DECISION = Object.freeze({
  // Transport (transport-error-codes.js). A re-send after any of these is
  // the same logical write under the loop's one write identity (R14), so an
  // ACK timeout (not received) and an answer timeout (received, perhaps
  // executed) are decided alike here: both are retried.
  [ROUTER_MESSAGE_TIMEOUT_ERROR_CODE]: codeDecision(TRANSIENT,
    'the delivery lifetime was spent; the re-send is idempotent'),
  [ROUTER_CONNECTION_CLOSED_ERROR_CODE]: codeDecision(TRANSIENT,
    'the connection closed; a later attempt reconnects'),
  [ROUTER_NO_CONNECTION_ERROR_CODE]: codeDecision(TRANSIENT,
    'no frame left: no connection to the target yet'),
  [WEBSOCKET_CONNECT_TIMEOUT_ERROR_CODE]: codeDecision(TRANSIENT,
    'no frame left: the connect attempt timed out'),
  [OUTBOUND_QUEUE_BACKPRESSURE_ERROR_CODE]: codeDecision(TRANSIENT,
    'no frame left: the outbound queue refused under pressure (R12)'),
  [ROUTER_QUERY_TRANSPORT_NOT_READY_ERROR_CODE]: codeDecision(TRANSIENT,
    'no frame left: the query transport is not ready yet'),
  [ROUTER_HANDLER_FAILED_ERROR_CODE]: codeDecision(UNCLASSIFIED,
    'the target handler threw: why is not known here'),
  // Pressure and the fan-out coordinator.
  [PRESSURE_GOVERNOR_ERROR_CODE.CONTROL_PLANE_PRESSURE_DEGRADED]:
    codeDecision(TRANSIENT, 'pressure defers the write (R12)'),
  [QUERY_ERROR_CODE.COORDINATOR_QUERY_TIMEOUT]: codeDecision(TRANSIENT,
    'the chunk deadline passed under load (R12)'),
  [QUERY_ERROR_CODE.DISTRIBUTED_PARTICIPANT_FAILURE]: codeDecision(
    UNCLASSIFIED, 'the fan-out wrapper: its participants decide'),
  // The one producer of this code is this process's query executor
  // (throwIfCancelled): this node is going down, so a retry here can only
  // spin to its deadline, and nothing is permanently wrong with the write.
  // A remote node's shutdown reaches a caller as a transport failure.
  [QUERY_ERROR_CODE.QUERY_EXECUTOR_SHUTTING_DOWN]: codeDecision(STOPPED,
    'this node\'s own executor is shutting down'),
  // Provisioning: the owner names these retryable or unavailable for now.
  [QUERY_ERROR_CODE.TABLE_PARTITION_PROVISIONING_RETRYABLE]: codeDecision(
    TRANSIENT, 'the founding operations are not yet visible'),
  [QUERY_ERROR_CODE.PROVISIONING_UNAVAILABLE]: codeDecision(TRANSIENT,
    'the provisioning owner defers the request'),
  [QUERY_ERROR_CODE.PARTITION_EPOCH_EVIDENCE_DEFERRED]: codeDecision(
    TRANSIENT, 'the write defers until the epoch evidence hydrates'),
  // Transactions. An in-doubt decision is resolved by transaction recovery,
  // never by a blind re-send: the loop stops and records nothing.
  [QUERY_ERROR_CODE.TRANSACTION_DECISION_IN_DOUBT]: codeDecision(STOPPED,
    'recovery resolves the in-doubt decision'),
  [QUERY_ERROR_CODE.TRANSACTION_DECISION_RECORDED]: codeDecision(
    UNCLASSIFIED, 'the writer follows the recorded decision itself'),
  [QUERY_ERROR_CODE.TRANSACTION_COMMIT_DECIDED]: codeDecision(UNCLASSIFIED,
    'the decided commit stands; recovery completes it'),
  [QUERY_ERROR_CODE.TRANSACTION_ACTIVE]: codeDecision(UNCLASSIFIED,
    'session state: the caller decides'),
  [QUERY_ERROR_CODE.NO_TRANSACTION]: codeDecision(UNCLASSIFIED,
    'session state: the caller decides'),
  [QUERY_ERROR_CODE.COMMIT_FAILED]: codeDecision(UNCLASSIFIED,
    'the commit outcome is the transaction owner\'s'),
  [QUERY_ERROR_CODE.ROLLBACK_FAILED]: codeDecision(UNCLASSIFIED,
    'the rollback outcome is the transaction owner\'s'),
  [QUERY_ERROR_CODE.TRANSACTION_PARTICIPANTS_FROZEN]: codeDecision(
    UNCLASSIFIED, 'a transaction-shape refusal the caller decides'),
  [QUERY_ERROR_CODE.TRANSACTION_RECOVERY_INCOMPLETE]: codeDecision(
    UNCLASSIFIED, 'recovery owns the transaction row'),
  [QUERY_ERROR_CODE.TRANSACTION_STATE_PERSIST_FAILED]: codeDecision(
    UNCLASSIFIED, 'its cause decides, when one is linked'),
  [QUERY_ERROR_CODE.TRANSACTION_STATE_PERSISTENCE_UNAVAILABLE]: codeDecision(
    UNCLASSIFIED, 'an engine capability the caller decides on'),
  [QUERY_ERROR_CODE.TRANSACTION_CONFLICT]: codeDecision(UNCLASSIFIED,
    'the transaction rolled back; re-running it is the client\'s choice'),
  [QUERY_ERROR_CODE.WRITE_CONFLICT]: codeDecision(UNCLASSIFIED,
    'the transaction rolled back; re-running it is the client\'s choice'),
  [QUERY_ERROR_CODE.LOCK_NOT_AVAILABLE]: codeDecision(UNCLASSIFIED,
    'NOWAIT asked not to wait; the client decides'),
  [QUERY_ERROR_CODE.TIMEOUT]: codeDecision(UNCLASSIFIED,
    'a transaction statement timeout: its outcome is the client\'s'),
  // Statement and catalog refusals.
  [QUERY_ERROR_CODE.BOOTSTRAP_COHORT_CONFLICT]: codeDecision(PERMANENT,
    'the bootstrap cohort is fixed'),
  [QUERY_ERROR_CODE.SYSTEM_TABLE_NAME_RESERVED]: codeDecision(PERMANENT,
    'the name is reserved'),
  [QUERY_ERROR_CODE.PRIMARY_KEY_REQUIRED]: codeDecision(PERMANENT,
    'the statement lacks a primary key'),
  [QUERY_ERROR_CODE.SYNTAX_ERROR]: codeDecision(PERMANENT,
    'the text does not parse'),
  [QUERY_ERROR_CODE.TABLE_EXISTS]: codeDecision(UNCLASSIFIED,
    'an idempotent re-create reads it; the caller decides'),
  [QUERY_ERROR_CODE.TABLE_NOT_FOUND]: codeDecision(UNCLASSIFIED,
    'a concurrent CREATE may make it appear; the caller decides'),
  [QUERY_ERROR_CODE.PARTITION_NOT_FOUND]: codeDecision(UNCLASSIFIED,
    'routing may hydrate it; the caller decides'),
  [QUERY_ERROR_CODE.STALE_PARTITION_EPOCH]: codeDecision(UNCLASSIFIED,
    'a re-send carries the same stale epoch; the caller re-resolves'),
  [QUERY_ERROR_CODE.RUNTIME_ACCESS_DENIED]: codeDecision(UNCLASSIFIED,
    'an access policy refusal the caller decides on'),
  [QUERY_ERROR_CODE.SYSTEM_TABLE_WRITE_REFUSED]: codeDecision(UNCLASSIFIED,
    'a client-write refusal; owners never raise it'),
  [QUERY_ERROR_CODE.MULTIPLE_STATEMENTS_UNSUPPORTED]: codeDecision(
    UNCLASSIFIED, 'a client-text refusal; owners never raise it'),
  [QUERY_ERROR_CODE.EMPTY_STATEMENT]: codeDecision(UNCLASSIFIED,
    'a client-text refusal; owners never raise it'),
  [QUERY_ERROR_CODE.UNSUPPORTED_SQL_FEATURE]: codeDecision(UNCLASSIFIED,
    'a client-text refusal; owners never raise it'),
  [QUERY_ERROR_CODE.TRANSACTION_CONTROL_SYNTAX_ERROR]: codeDecision(
    UNCLASSIFIED, 'a client-text refusal; owners never raise it'),
  [QUERY_ERROR_CODE.INTERNAL_ERROR]: codeDecision(UNCLASSIFIED,
    'an internal failure says nothing of a retry'),
  // Other owners.
  [APPLICATION_DATABASE_ERROR_CODE.INVALID_ARGUMENT]: codeDecision(
    PERMANENT, 'the argument is invalid'),
  [SCHEMA_PROVISIONING_ERROR_CODE.INTENT_CONFLICT]: codeDecision(PERMANENT,
    'the schema intent conflicts'),
  [OPERATION_INTENT_TERMINAL_COLLISION_CODE]: codeDecision(PERMANENT,
    'the intent\'s operation is durably terminal'),
  [STALE_NODE_INCARNATION_CODE]: codeDecision(PERMANENT,
    'a zombie writer never becomes fresh'),
});

function decidedCodeClasses(candidate) {
  return directFailureCodes(candidate)
    .map((code) => objectHasOwn(CONTROL_PLANE_ERROR_CODE_DECISION, code) ?
      CONTROL_PLANE_ERROR_CODE_DECISION[code].candidateClass : UNCLASSIFIED);
}

// SQLite primary result codes of a statement its data refused, read as the
// prefix of an extended code. The typed answer of such a statement is the
// committed statement failure (isTypedCommittedStatementFailure); these
// prefixes cover the same failure where only its code reached here.
// SQLITE_ERROR is not among them: it also names a missing table or column,
// which a later attempt may find.
const PERMANENT_CONTROL_PLANE_CODE_PREFIXES = Object.freeze([
  'SQLITE_CONSTRAINT',
  'SQLITE_MISMATCH',
]);

// Failures that reach the classifier as a text alone, with no typed code at
// their producer.
const PERMANENT_CONTROL_PLANE_MESSAGE_FRAGMENTS = Object.freeze([
  'unique constraint failed',
  'not null constraint failed',
  'check constraint failed',
  'foreign key constraint failed',
  'primary key must be unique',
  'syntax error',
]);

/**
 * Build the typed terminal refusal a receiver raises when a writer stamps a
 * boot incarnation LOWER than the receiver's best-known incarnation for that
 * nodeId. The error is terminal (never retried): a zombie writer can never
 * become fresh by retrying.
 * @param {Object} [options={}] - Fence context.
 * @param {string} [options.nodeId] - The fenced node id.
 * @param {number} [options.receivedIncarnation] - Incarnation on the write.
 * @param {number} [options.knownIncarnation] - Receiver high-water incarnation.
 * @return {Error} Typed error with code STALE_NODE_INCARNATION.
 */
function buildStaleNodeIncarnationError(options = {}) {
  const error = new Error(STALE_NODE_INCARNATION_ERROR_MESSAGE);
  error.code = STALE_NODE_INCARNATION_CODE;
  error.nodeId = options.nodeId || null;
  error.receivedIncarnation = Number.isSafeInteger(
    options.receivedIncarnation,
  ) ?
    options.receivedIncarnation :
    null;
  error.knownIncarnation = Number.isSafeInteger(options.knownIncarnation) ?
    options.knownIncarnation :
    null;
  return error;
}

/**
 * Normalize one boot-incarnation candidate: a positive safe integer is KNOWN,
 * anything else (0, absent, non-numeric — the pre-incarnation compat shape)
 * is UNKNOWN and never fences.
 * @param {*} value - Candidate incarnation.
 * @return {number} The known incarnation, or 0 when unknown.
 */
function normalizeKnownNodeBootIncarnation(value) {
  return typeof value === 'number' && numberIsSafeInteger(value) && value > 0 ?
    value : 0;
}

const MAX_LINKED_CONTROL_PLANE_FAILURES = NUM.EIGHT;

function getDirectControlPlaneErrorMessage(value) {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value?.message === 'string') {
    return value.message;
  }
  if (typeof value?.error === 'string') {
    return value.error;
  }
  return '';
}

function getDirectControlPlaneErrorCode(value) {
  if (typeof value?.code === 'string') {
    return value.code;
  }
  if (typeof value?.errorCode === 'string') {
    return value.errorCode;
  }
  return '';
}

function getDirectControlPlaneRetryAfterMs(value) {
  return Number.isFinite(value?.retryAfterMs) ?
    Math.max(0, Math.floor(value.retryAfterMs)) :
    0;
}

// A candidate enters the collection when it is a first visit of an object or
// any string; other primitives are skipped.
function admitLinkedFailureCandidate(candidate, visited) {
  if (!candidate) {
    return false;
  }
  if (typeof candidate === 'object') {
    if (visited.has(candidate)) {
      return false;
    }
    visited.add(candidate);
    return true;
  }
  return typeof candidate === 'string';
}

function enqueueLinkedFailureSources(queue, candidate) {
  if (candidate.cause) {
    queue.push(candidate.cause);
  }
  if (candidate.firstFailedParticipant &&
      typeof candidate.firstFailedParticipant === 'object') {
    queue.push(candidate.firstFailedParticipant);
  }
  if (Array.isArray(candidate.participantFailures)) {
    for (const participantFailure of candidate.participantFailures) {
      queue.push(participantFailure);
    }
  }
  if (Array.isArray(candidate.partitionErrors)) {
    for (const partitionError of candidate.partitionErrors) {
      queue.push(partitionError);
    }
  }
}

function collectLinkedControlPlaneFailures(value) {
  const queue = [value];
  const visited = new Set();
  const collected = [];

  while (queue.length > 0 &&
      collected.length < MAX_LINKED_CONTROL_PLANE_FAILURES) {
    const candidate = queue.shift();
    if (!admitLinkedFailureCandidate(candidate, visited)) {
      continue;
    }
    collected.push(candidate);
    if (typeof candidate === 'object') {
      enqueueLinkedFailureSources(queue, candidate);
    }
  }

  return collected;
}

function getControlPlaneErrorMessage(value) {
  return getDirectControlPlaneErrorMessage(value);
}

function getControlPlaneErrorCode(value) {
  return getDirectControlPlaneErrorCode(value);
}

function getControlPlaneRetryAfterMs(value) {
  let retryAfterMs = 0;
  for (const candidate of collectLinkedControlPlaneFailures(value)) {
    retryAfterMs = Math.max(
      retryAfterMs,
      getDirectControlPlaneRetryAfterMs(candidate),
    );
  }
  return retryAfterMs;
}

function directFailureCodes(candidate) {
  return [getDirectControlPlaneErrorCode(candidate), candidate?.failureCode]
    .filter((code) => typeof code === 'string' && code.length > 0);
}

function hasPermanentControlPlaneCode(candidate) {
  return decidedCodeClasses(candidate).includes(PERMANENT) ||
    directFailureCodes(candidate).some((code) =>
      PERMANENT_CONTROL_PLANE_CODE_PREFIXES.some((prefix) =>
        code.startsWith(prefix)));
}

function hasPermanentControlPlaneText(candidate) {
  const message = getDirectControlPlaneErrorMessage(candidate).toLowerCase();
  return PERMANENT_CONTROL_PLANE_MESSAGE_FRAGMENTS.some((fragment) =>
    message.includes(fragment));
}

function hasTransientControlPlaneSignal(candidate) {
  if (candidate?.deferRetry === true ||
      getDirectControlPlaneRetryAfterMs(candidate) > 0 ||
      decidedCodeClasses(candidate).includes(TRANSIENT)) {
    return true;
  }
  const message = getDirectControlPlaneErrorMessage(candidate);
  return isRetryableWriteError(message) ||
    RETRYABLE_CONTROL_PLANE_ERROR_FRAGMENTS.some((fragment) =>
      message.includes(fragment));
}

// What one linked failure says of itself - never of what is linked to it. A
// partition write answer is classified by its one owner: by the write
// kernel's code when it carries one (the code decides, whatever its text or
// retry hints), by the errors owner's texts when only the text reached here.
// A permanent code or text overrides a retry hint on the same failure.
function classifyControlPlaneFailureCandidate(candidate) {
  if (decidedCodeClasses(candidate).includes(STOPPED)) {
    return STOPPED;
  }
  if (isControlPlaneWriterShutDownCandidate(candidate) ||
      isTypedCommittedStatementFailure(candidate)) {
    return CONTROL_PLANE_FAILURE_CANDIDATE_CLASS.PERMANENT;
  }
  if (isPartitionWriteFailureCode(candidate?.failureCode)) {
    return isRetryableWriteFailureCode(candidate.failureCode) ?
      CONTROL_PLANE_FAILURE_CANDIDATE_CLASS.TRANSIENT :
      CONTROL_PLANE_FAILURE_CANDIDATE_CLASS.PERMANENT;
  }
  if (hasPermanentControlPlaneCode(candidate) ||
      hasPermanentControlPlaneText(candidate)) {
    return CONTROL_PLANE_FAILURE_CANDIDATE_CLASS.PERMANENT;
  }
  return hasTransientControlPlaneSignal(candidate) ?
    CONTROL_PLANE_FAILURE_CANDIDATE_CLASS.TRANSIENT :
    CONTROL_PLANE_FAILURE_CANDIDATE_CLASS.UNCLASSIFIED;
}

// The CDC integration service's terminal lifecycle answer: its writer is shut
// down, so no retry through it can succeed. It decides whatever else is linked
// to it (its cause may be a retryable answer, e.g. a released write whose
// outcome is unknown).
function isControlPlaneWriterShutDownCandidate(candidate) {
  return getDirectControlPlaneErrorCode(candidate) === CDC_ERROR_CODE.SHUT_DOWN;
}

/**
 * Whether a failure is (or links) the CDC integration service's terminal
 * shut-down answer: the writer on this node is torn down.
 * @param {*} value - The failed result or error.
 * @return {boolean}
 */
function isControlPlaneWriterShutDown(value) {
  if (!value) {
    return false;
  }
  return collectLinkedControlPlaneFailures(value).some(
    isControlPlaneWriterShutDownCandidate);
}

function isTypedCommittedStatementFailure(candidate) {
  return candidate?.committed === true &&
    candidate?.outcome === COMMITTED_STATEMENT_FAILURE_OUTCOME &&
    typeof candidate?.failureCode === 'string' &&
    candidate.failureCode.length > 0;
}

// What a failure says when it says nothing of itself: its own class, else
// the class of the first failure in its cause chain that has one. A cause
// never overrides a failure's own class; it decides an unclassified one.
function classifyFailureThroughCauses(failure) {
  const visited = new Set();
  let candidate = failure;
  while (admitLinkedFailureCandidate(candidate, visited) &&
      visited.size <= MAX_LINKED_CONTROL_PLANE_FAILURES) {
    const candidateClass = classifyControlPlaneFailureCandidate(candidate);
    if (candidateClass !== UNCLASSIFIED || typeof candidate !== 'object') {
      return candidateClass;
    }
    candidate = candidate.cause;
  }
  return UNCLASSIFIED;
}

// The participants of a fan-out, from every linked failure that lists them:
// each is one member of the failed set, so each one's own class counts. A
// participant given as its error text alone is a member too.
function readParticipantFailureEntries(linkedFailures) {
  const entries = new Set();
  for (const candidate of linkedFailures) {
    if (typeof candidate !== 'object') {
      continue;
    }
    for (const list of [candidate.participantFailures,
      candidate.partitionErrors, [candidate.firstFailedParticipant]]) {
      for (const entry of Array.isArray(list) ? list : []) {
        if ((entry && typeof entry === 'object') ||
            (typeof entry === 'string' && entry.length > 0)) {
          entries.add(entry);
        }
      }
    }
  }
  return [...entries];
}

/**
 * The one decision on a failed control-plane answer or error. Across links
 * the writer's shut-down answer decides (terminal), then a stopping code
 * (this node's shutdown, an in-doubt transaction decision: stopped). Otherwise
 * the failure's own class - read through its cause chain when it has none of
 * its own - decides when it is permanent (a linked cause never vetoes a
 * failure's own class: an unknown write outcome stays retryable whatever
 * caused it); then its participant set, each read the same way: any
 * permanent participant is terminal, else any transient participant is
 * retryable; a set of unclassified participants, or none, leaves the
 * decision to the retry signals of the failure and its links, and without
 * one the failure is unclassified.
 * @param {*} value - The failed result or error.
 * @return {string} One of TYPED_DISTRIBUTED_FAILURE_DECISION.
 */
function classifyTypedDistributedFailure(value) {
  const linkedFailures = collectLinkedControlPlaneFailures(value);
  if (linkedFailures.some(isControlPlaneWriterShutDownCandidate)) {
    return TYPED_DISTRIBUTED_FAILURE_DECISION.TERMINAL;
  }
  const participants = readParticipantFailureEntries(linkedFailures);
  if ([...linkedFailures, ...participants].some((candidate) =>
    classifyControlPlaneFailureCandidate(candidate) === STOPPED)) {
    return TYPED_DISTRIBUTED_FAILURE_DECISION.STOPPED;
  }
  if (classifyFailureThroughCauses(linkedFailures[0]) === PERMANENT) {
    return TYPED_DISTRIBUTED_FAILURE_DECISION.TERMINAL;
  }
  const participantClasses = participants.map(classifyFailureThroughCauses);
  if (participantClasses.includes(PERMANENT)) {
    return TYPED_DISTRIBUTED_FAILURE_DECISION.TERMINAL;
  }
  if (participantClasses.includes(TRANSIENT) ||
      linkedFailures.some((candidate) =>
        classifyControlPlaneFailureCandidate(candidate) === TRANSIENT)) {
    return TYPED_DISTRIBUTED_FAILURE_DECISION.RETRYABLE;
  }
  return TYPED_DISTRIBUTED_FAILURE_DECISION.UNCLASSIFIED;
}

function isTerminalTypedDistributedFailure(value) {
  return classifyTypedDistributedFailure(value) ===
    TYPED_DISTRIBUTED_FAILURE_DECISION.TERMINAL;
}

// The wrapper a failed fan-out answers with, as its typed code or as its
// text (a caller that rethrows the answer keeps only the text): it says that
// participants failed and nothing of why.
function isDistributedParticipantFailureWrapper(candidate) {
  return getDirectControlPlaneErrorCode(candidate) ===
      CONTROL_PLANE_FAILURE_ERROR_CODE.DISTRIBUTED_PARTICIPANT_FAILURE ||
    getDirectControlPlaneErrorMessage(candidate).includes(
      CONTROL_PLANE_FAILURE_FRAGMENT.DISTRIBUTED_PARTICIPANT_FAILURE);
}

/**
 * What a control-plane retry loop asks: whether to make the attempt again.
 * A retryable decision is retried; a terminal or stopped one is not. An
 * unclassified failure is retried only when it is a failed fan-out - its
 * participants failed and none is known to be permanent; any other
 * unclassified failure is not retried.
 * A consumer for which an unclassified fan-out must not be retried decides
 * on classifyTypedDistributedFailure instead.
 * @param {*} value - The failed result or error.
 * @return {boolean}
 */
function isRetryableControlPlaneError(value) {
  const decision = classifyTypedDistributedFailure(value);
  if (decision !== TYPED_DISTRIBUTED_FAILURE_DECISION.UNCLASSIFIED) {
    return decision === TYPED_DISTRIBUTED_FAILURE_DECISION.RETRYABLE;
  }
  return collectLinkedControlPlaneFailures(value)
    .some(isDistributedParticipantFailureWrapper);
}

function resolveControlPlanePrimaryFailureReason(summary) {
  if (summary.authoritativeRowSourceUnavailableCount > 0) {
    return CONTROL_PLANE_FAILURE_REASON.AUTHORITATIVE_ROW_SOURCE_UNAVAILABLE;
  }
  if (summary.distributedParticipantFailureCount > 0) {
    return CONTROL_PLANE_FAILURE_REASON.DISTRIBUTED_PARTICIPANT_FAILURE;
  }
  if (summary.reconnectDeliveryFailureCount > 0) {
    return CONTROL_PLANE_FAILURE_REASON.RECONNECT_DELIVERY_FAILURE;
  }
  if (summary.pressureDegradedCount > 0) {
    return CONTROL_PLANE_FAILURE_REASON.PRESSURE_DEGRADED;
  }
  return CONTROL_PLANE_FAILURE_REASON.UNKNOWN;
}

function getControlPlaneFailureSummary(value) {
  const summary = {
    primaryReason: CONTROL_PLANE_FAILURE_REASON.UNKNOWN,
    linkedFailureCount: 0,
    retryable: isRetryableControlPlaneError(value),
    authoritativeRowSourceUnavailableCount: 0,
    distributedParticipantFailureCount: 0,
    reconnectDeliveryFailureCount: 0,
    pressureDegradedCount: 0,
  };

  for (const candidate of collectLinkedControlPlaneFailures(value)) {
    summary.linkedFailureCount += 1;
    const message = getDirectControlPlaneErrorMessage(candidate);
    const errorCode = getDirectControlPlaneErrorCode(candidate);

    if (message.includes(
      CONTROL_PLANE_FAILURE_FRAGMENT.AUTHORITATIVE_ROW_SOURCE_UNAVAILABLE,
    )) {
      summary.authoritativeRowSourceUnavailableCount += 1;
    }
    if (
      message.includes(
        CONTROL_PLANE_FAILURE_FRAGMENT.DISTRIBUTED_PARTICIPANT_FAILURE,
      ) ||
      errorCode ===
        CONTROL_PLANE_FAILURE_ERROR_CODE.DISTRIBUTED_PARTICIPANT_FAILURE
    ) {
      summary.distributedParticipantFailureCount += 1;
    }
    if (
      message.includes(CONTROL_PLANE_FAILURE_FRAGMENT.NO_CONNECTION_TO_NODE) ||
      message.includes(CONTROL_PLANE_FAILURE_FRAGMENT.CONNECTION_TO_NODE) ||
      message.includes(CONTROL_PLANE_FAILURE_FRAGMENT.OUTBOUND_QUEUE_FOR_NODE) ||
      message.includes(
        CONTROL_PLANE_FAILURE_FRAGMENT.NO_HANDLER_REGISTERED_FOR_ADDRESS,
      )
    ) {
      summary.reconnectDeliveryFailureCount += 1;
    }
    if (
      message.includes(
        CONTROL_PLANE_FAILURE_FRAGMENT.CONTROL_PLANE_PRESSURE_DEGRADED,
      ) ||
      errorCode ===
        CONTROL_PLANE_FAILURE_ERROR_CODE.CONTROL_PLANE_PRESSURE_DEGRADED
    ) {
      summary.pressureDegradedCount += 1;
    }
  }

  summary.primaryReason = resolveControlPlanePrimaryFailureReason(summary);

  return summary;
}

export {
  CONTROL_PLANE_CONVERGENCE_CLASS,
  CONTROL_PLANE_CONVERGENCE_PRESSURE_OUTCOME,
  CONTROL_PLANE_ERROR_CODE_DECISION,
  CONTROL_PLANE_FAILURE_REASON,
  STALE_NODE_INCARNATION_CODE,
  TYPED_DISTRIBUTED_FAILURE_DECISION,
  buildStaleNodeIncarnationError,
  classifyTypedDistributedFailure,
  getControlPlaneErrorCode,
  getControlPlaneFailureSummary,
  getControlPlaneErrorMessage,
  getControlPlaneRetryAfterMs,
  isControlPlaneWriterShutDown,
  isRetryableControlPlaneError,
  isTerminalTypedDistributedFailure,
  normalizeKnownNodeBootIncarnation,
};
