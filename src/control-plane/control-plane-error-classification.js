import {
  NUM,
} from '../constants/index.js';
import {isRetryableWriteError} from '../constants/errors.js';
import {
  PRESSURE_GOVERNOR_ERROR_CODE,
} from './pressure-governor.js';
import {ROUTER_ERROR_MSG} from '../constants/transport.js';
import {
  isPartitionWriteFailureCode,
  isReroutableWriteFailureCode,
  isRetryableWriteFailureCode,
} from '../partition/partition-write-kernel.js';


const numberIsSafeInteger = Number.isSafeInteger;

const RETRYABLE_CONTROL_PLANE_ERROR_FRAGMENTS = Object.freeze([
  'Distributed operation failed due to participant failures',
  'authoritative_row_source_unavailable',
  'Outbound queue for node',
  'No connection to node',
  'Connection to node',
  'No handler registered for address',
  'Message timeout',
  'Cache update not observed for',
  'query_admission_deferred',
  'closed',
  'control_plane_pressure_degraded',
  ROUTER_ERROR_MSG.PENDING_RESPONSE_TIMEOUT,
  'Transaction already active on this partition',
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
    'Distributed operation failed due to participant failures',
  NO_CONNECTION_TO_NODE:
    'No connection to node',
  CONNECTION_TO_NODE:
    'Connection to node',
  OUTBOUND_QUEUE_FOR_NODE:
    'Outbound queue for node',
  NO_HANDLER_REGISTERED_FOR_ADDRESS:
    'No handler registered for address',
  PENDING_RESPONSE_TIMEOUT: ROUTER_ERROR_MSG.PENDING_RESPONSE_TIMEOUT,
  CONTROL_PLANE_PRESSURE_DEGRADED:
    'control_plane_pressure_degraded',
});

const CONTROL_PLANE_FAILURE_ERROR_CODE = Object.freeze({
  DISTRIBUTED_PARTICIPANT_FAILURE:
    'DISTRIBUTED_PARTICIPANT_FAILURE',
  CONTROL_PLANE_PRESSURE_DEGRADED:
    PRESSURE_GOVERNOR_ERROR_CODE.CONTROL_PLANE_PRESSURE_DEGRADED,
});

const STALE_NODE_INCARNATION_CODE = 'STALE_NODE_INCARNATION';

const STALE_NODE_INCARNATION_ERROR_MESSAGE =
  'Refusing node state update from a stale boot incarnation';

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

// The failures a candidate links: its cause, its first failed participant,
// its participant failures, and the failed answers among its participant
// results (a distributed write's participant carries the partition's own
// typed answer, and its own participant failures).
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
  if (Array.isArray(candidate.participantResults)) {
    for (const participantResult of candidate.participantResults) {
      if (participantResult?.success === false) {
        queue.push(participantResult);
      }
    }
  }
}

// How far a walk of a failure's linked failures reads (R07): a fixed window
// (the text, marker and delay reads), or every failure the value links - each
// linked object once, so the walk is bounded by the value's own causes and
// participant lists - for the partition write answers that decide a retry or
// a reroute by their codes (verification round 4, F23: a failed-for-good
// answer beyond a window must still decide).
const LINKED_FAILURE_WALK = Object.freeze({
  WINDOW: 'window',
  EVERY_LINKED_FAILURE: 'every_linked_failure',
});

function collectLinkedControlPlaneFailures(value,
  walk = LINKED_FAILURE_WALK.WINDOW) {
  const queue = [value];
  const visited = new Set();
  const collected = [];
  const withinWalk = () => walk === LINKED_FAILURE_WALK.EVERY_LINKED_FAILURE ||
    collected.length < MAX_LINKED_CONTROL_PLANE_FAILURES;

  while (queue.length > 0 && withinWalk()) {
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

// Whether one candidate of a failure that links no partition write code is
// retryable by its own text or markers (a failure linking one is decided by
// its codes: decidePartitionWriteRetry). A partition write answer that
// reached here as text alone is classified by the errors owner's texts; the
// fragments above are for the failures that are not partition write answers.
function isRetryableControlPlaneCandidate(candidate) {
  if (candidate?.deferRetry === true ||
      getDirectControlPlaneErrorCode(candidate) ===
        PRESSURE_GOVERNOR_ERROR_CODE.CONTROL_PLANE_PRESSURE_DEGRADED ||
      getDirectControlPlaneRetryAfterMs(candidate) > 0) {
    return true;
  }
  const message = getDirectControlPlaneErrorMessage(candidate);
  return isRetryableWriteError(message) ||
    RETRYABLE_CONTROL_PLANE_ERROR_FRAGMENTS.some((fragment) =>
      message.includes(fragment));
}

// How the partition write answers a failure links decide its retry (R07):
// they did not fail for good (every linked partition answer's code is
// retryable), one failed for good, or the failure links none - it is then
// decided by what it carries besides a partition code.
const PARTITION_WRITE_RETRY_DECISION = Object.freeze({
  RETRYABLE: 'retryable',
  FAILED_FOR_GOOD: 'failed_for_good',
  NO_PARTITION_ANSWER: 'no_partition_answer',
});

/**
 * How the partition write answers a failure links decide its retry, by the
 * write kernel's codes alone and before any text: a distributed write's
 * summary text (the coordinator's generic one, a retryable text for a
 * failure that is not a partition answer) never retries a participant that
 * failed for good, whether the write had one participant or several (quest
 * reroute-carries-the-entry-id, verification round 3, F22 and F21). It
 * reads every partition answer the failure links (round 4, F23).
 * @param {*} value - A failure, a failed result, or an error.
 * @return {string} A PARTITION_WRITE_RETRY_DECISION.
 */
function decidePartitionWriteRetry(value) {
  const codes = collectLinkedControlPlaneFailures(value,
    LINKED_FAILURE_WALK.EVERY_LINKED_FAILURE)
    .map((candidate) => candidate?.failureCode)
    .filter(isPartitionWriteFailureCode);
  if (codes.length === 0) {
    return PARTITION_WRITE_RETRY_DECISION.NO_PARTITION_ANSWER;
  }
  return codes.every(isRetryableWriteFailureCode) ?
    PARTITION_WRITE_RETRY_DECISION.RETRYABLE :
    PARTITION_WRITE_RETRY_DECISION.FAILED_FOR_GOOD;
}

/**
 * Whether a failure links a partition write answer the write kernel codes:
 * its retry is then decided by those codes alone (isRetryableControlPlaneError),
 * and a retry loop's own texts never decide it.
 * @param {*} value - A failure, a failed result, or an error.
 * @return {boolean} Whether a linked partition answer carries a kernel code.
 */
function linksPartitionWriteAnswer(value) {
  return Boolean(value) && decidePartitionWriteRetry(value) !==
    PARTITION_WRITE_RETRY_DECISION.NO_PARTITION_ANSWER;
}

function isRetryableControlPlaneError(value) {
  if (!value) {
    return false;
  }
  const decision = decidePartitionWriteRetry(value);
  if (decision !== PARTITION_WRITE_RETRY_DECISION.NO_PARTITION_ANSWER) {
    return decision === PARTITION_WRITE_RETRY_DECISION.RETRYABLE;
  }
  return collectLinkedControlPlaneFailures(value).some(
    isRetryableControlPlaneCandidate);
}

/**
 * Whether a failure links a partition write answer a caller may route again
 * by its code (the write kernel's isReroutableWriteFailureCode): the one walk
 * of a failure's linked partition answers for a reroute decision.
 * @param {*} value - A failure, a failed result, or an error.
 * @param {Object} [options] - {carriesEntryId}: whether the caller routes the
 *   write again under the entryId it was answered for.
 * @return {boolean} Whether a linked partition answer is reroutable.
 */
function hasReroutableWriteFailure(value, {carriesEntryId = false} = {}) {
  if (!value) {
    return false;
  }
  return collectLinkedControlPlaneFailures(value,
    LINKED_FAILURE_WALK.EVERY_LINKED_FAILURE).some((candidate) =>
    isReroutableWriteFailureCode(candidate?.failureCode, {carriesEntryId}));
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
  CONTROL_PLANE_FAILURE_REASON,
  STALE_NODE_INCARNATION_CODE,
  buildStaleNodeIncarnationError,
  getControlPlaneErrorCode,
  getControlPlaneFailureSummary,
  getControlPlaneErrorMessage,
  getControlPlaneRetryAfterMs,
  hasReroutableWriteFailure,
  isRetryableControlPlaneError,
  linksPartitionWriteAnswer,
  normalizeKnownNodeBootIncarnation,
  RETRYABLE_CONTROL_PLANE_ERROR_FRAGMENTS,
};
