// The L6 fences between the two transaction protocols (TX1 design revision
// 10, section 11.3's mixed-version window; 0.0.15, the cutover): until a
// partition's cutover, the legacy sessionId-only path keeps staging with
// BEGIN IMMEDIATE on the shared connection, and its local COMMIT changes data
// on the leader only, outside the log and the write generation. So the
// protocols never touch one partition at once:
// - a legacy BEGIN is refused, typed, while a participant transaction is
//   staging, preparing or PREPARED here (ALREADY_ACTIVE), once participant
//   admission is enabled here (its generation origin applied:
//   LEGACY_SESSION_FENCED - every later participant transaction would
//   otherwise prepare over rows its replicas do not share), and while the
//   cutover sequence pauses new mutation admission (CUTOVER_PAUSED,
//   retryable); a legacy BEGIN it lets through is recorded on the
//   connection's stamp, which then refuses participant admission on that
//   connection until it is reopened
//   (partition-participant-transaction-connection.js);
// - a sessionId-only PREPARE, COMMIT, ROLLBACK or QUERY that names the
//   routing sessionId of a participant transaction staging here or PREPARED
//   here (its durable row, read from the store) is refused, typed, never run
//   against the legacy maps or as a sessionless write; once decided, the
//   sessionId is the legacy path's again;
// - once the origin has applied here the legacy path is retired on this
//   partition: a sessionId-only PREPARE, COMMIT or ROLLBACK for a session
//   that is not open here is refused LEGACY_SESSION_FENCED (the legacy path
//   used to answer it from its maps); a session admitted before the origin
//   still finishes through the legacy path (accepted work). A sessionId-only
//   QUERY for a session not open here keeps the unknown-session semantics
//   (an ordinary, fully admitted sessionless write: the engine stamps its
//   client session on ordinary statements too), and a sessionId-only outcome
//   read keeps answering from the retained legacy outcome table;
// - a sessionId-only outcome read answers UNKNOWN, never NOT_COMMITTED from
//   absence, for a sessionId a participant transaction carries (its outcome
//   is keyed by transactionId, which the legacy read cannot name).
// The participant side fences the other way: its BEGIN is refused while a
// legacy session is open (partition-participant-transaction-request.js).
import {PARTICIPANT_COMMIT_OUTCOME} from '../constants/transactions.js';
import {PARTITION_SERVICE_SHARED} from './partition-service-shared.js';
import {
  isParticipantSessionKnown,
  isParticipantSessionPrepared,
  isPartitionReserved,
  readPartitionWriteOrigin,
} from './partition-participant-transaction-store.js';
import {
  hasParticipantSession,
  participantSessionNamed,
} from './partition-participant-transaction-session.js';
import {noteLegacySessionServed} from './partition-participant-transaction-connection.js';
import {participantCutoverPauseOf} from './partition-participant-transaction-pause.js';
import {
  PARTICIPANT_TRANSACTION_FAILURE_CODE as CODE,
  PARTICIPANT_TRANSACTION_MESSAGE as MESSAGE,
} from './partition-participant-transaction-constants.js';

const {
  PARTITION_SERVICE_ERROR_MSG,
  PARTITION_SERVICE_LITERAL,
  PARTITION_SERVICE_OPERATION,
} = PARTITION_SERVICE_SHARED;

const LEGACY_BEGIN = new Set([PARTITION_SERVICE_OPERATION.BEGIN_TRANSACTION,
  PARTITION_SERVICE_LITERAL.BEGIN]);
const LEGACY_SESSION_CONTROL = new Set([
  PARTITION_SERVICE_OPERATION.PREPARE_TRANSACTION, PARTITION_SERVICE_LITERAL.PREPARE,
  PARTITION_SERVICE_OPERATION.COMMIT, PARTITION_SERVICE_OPERATION.ROLLBACK]);

/**
 * Whether a participant transaction holds the partition: a staging session
 * on this leader (any phase) or a PREPARED row here.
 * @param {Object} service - The partition.
 * @return {boolean} Whether one non-terminal participant transaction exists.
 */
function participantTransactionActive(service) {
  return hasParticipantSession(service) || isPartitionReserved(service.db);
}

function fenced(service, payload, failureCode, error) {
  return {success: false, operation: payload?.operation,
    partitionId: service.partitionId, error, failureCode};
}

function legacyFenceRefusal(service, payload) {
  return fenced(service, payload, CODE.LEGACY_SESSION_FENCED,
    `${MESSAGE.REFUSED}${MESSAGE.CODE_SEPARATOR}${CODE.LEGACY_SESSION_FENCED}`);
}

// The cutover's pause: a legacy BEGIN is retried, never failed.
function pausedRefusal(service, payload) {
  return {...fenced(service, payload, CODE.CUTOVER_PAUSED,
    `${MESSAGE.REFUSED}${MESSAGE.CODE_SEPARATOR}${CODE.CUTOVER_PAUSED}`),
  deferRetry: true};
}

// Whether a legacy session the request names is open here (accepted work the
// legacy path finishes, whatever the partition's cutover state).
function legacySessionOpen(service, payload) {
  return service.resolveOpenTransactionState(
    service.normalizeTransactionSessionId(payload?.sessionId ?? null)) !== null;
}

// Whether a sessionId-only request names a participant transaction that is
// not decided: staging here (volatile) or PREPARED here (its durable row).
function namesParticipantSession(service, payload) {
  return typeof payload?.sessionId === 'string' &&
    (participantSessionNamed(service, payload.sessionId) !== null ||
      isParticipantSessionPrepared(service.db, payload.sessionId));
}

// Whether a participant transaction carries the routing sessionId a
// sessionId-only request names (staging here, or recorded in a row).
function participantCarriesSession(service, sessionId) {
  return participantSessionNamed(service, sessionId) !== null ||
    isParticipantSessionKnown(service.db, sessionId);
}

// A sessionId-only outcome read of a sessionId a participant transaction
// carries: the legacy answer, except that absence is UNKNOWN.
function legacyOutcomeAnswer(service, payload, sessionId) {
  const epoch = Number.isFinite(payload.transactionEpoch) ?
    Math.floor(payload.transactionEpoch) : null;
  const legacy = service.resolveTransactionCommitOutcome(sessionId, epoch);
  return {success: true, outcome: legacy === PARTICIPANT_COMMIT_OUTCOME.NOT_COMMITTED ?
    PARTICIPANT_COMMIT_OUTCOME.UNKNOWN : legacy};
}

/**
 * The fence's answer to a sessionId-only TRANSACTION request, or undefined
 * when the legacy path answers it.
 * @param {Object} service - The partition.
 * @param {Object} payload - The request (no transactionId).
 * @return {Object|undefined} The fenced answer, or undefined.
 */
function fenceLegacyTransactionRequest(service, payload) {
  const operation = payload?.operation;
  if (LEGACY_BEGIN.has(operation)) {
    if (participantTransactionActive(service)) {
      return fenced(service, payload, CODE.ALREADY_ACTIVE,
        PARTITION_SERVICE_ERROR_MSG.TRANSACTION_ALREADY_ACTIVE);
    }
    if (readPartitionWriteOrigin(service.db) !== null) {
      return legacyFenceRefusal(service, payload);
    }
    if (participantCutoverPauseOf(service) !== null) {
      return pausedRefusal(service, payload);
    }
    noteLegacySessionServed(service.db);
    return undefined;
  }
  if (LEGACY_SESSION_CONTROL.has(operation)) {
    if (namesParticipantSession(service, payload)) {
      return legacyFenceRefusal(service, payload);
    }
    return readPartitionWriteOrigin(service.db) !== null &&
      !legacySessionOpen(service, payload) ?
      legacyFenceRefusal(service, payload) : undefined;
  }
  const sessionId = service.normalizeTransactionSessionId(payload?.sessionId ?? null);
  return operation === PARTITION_SERVICE_OPERATION.TRANSACTION_OUTCOME &&
    participantCarriesSession(service, sessionId) ?
    legacyOutcomeAnswer(service, payload, sessionId) : undefined;
}

/**
 * The fence's answer to a sessionId-only QUERY that names the routing
 * sessionId of a participant transaction staging or PREPARED here (it is
 * never staged in the legacy maps nor run as a sessionless write); null for
 * every other QUERY.
 * @param {Object} service - The partition.
 * @param {Object} payload - The QUERY (no transactionId).
 * @return {Object|null} The acknowledged refusal, or null.
 */
function fenceLegacySessionQuery(service, payload) {
  return namesParticipantSession(service, payload) ?
    {acknowledged: true, ...legacyFenceRefusal(service, payload)} : null;
}

// Direct local writes have no replicated outcome. Once the origin exists
// this execution path is retired permanently, including bootstrap callers.
// Reads continue through their normal statement owner while release pauses.
function fenceLegacyLocalMutation(service) {
  if (readPartitionWriteOrigin(service.db) !== null) {
    return legacyFenceRefusal(service, {});
  }
  return participantCutoverPauseOf(service) !== null ?
    pausedRefusal(service, {}) : null;
}

export {
  fenceLegacyLocalMutation,
  fenceLegacySessionQuery,
  fenceLegacyTransactionRequest,
  participantTransactionActive,
};
