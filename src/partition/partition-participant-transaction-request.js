// The participant's transaction requests (TX1 design revision 10, sections
// 2.2, 3.1, 4 and 7): the one owner of how a TRANSACTION or QUERY request that
// carries a transactionId is answered. BEGIN opens a volatile staging session
// on the leader (partition-participant-transaction-session.js) with the
// BEGIN-time write generation, and opens no SQLite transaction; a session
// statement stages under c' (partition-participant-transaction-staging.js);
// PREPARE seals the session's staged operations into a PARTICIPANT_PREPARE;
// COMMIT and a bound ROLLBACK propose the PARTICIPANT_DECISION bound to the
// coordinator's decision record; an unbound ROLLBACK only discards volatile
// staging; an outcome read answers from the durable row, on any replica; and
// a statement for a sealed, prepared or decided transaction is refused,
// typed, never run as a sessionless write. Transaction admission is enabled
// on a partition once, by the leader proposing the generation origin (design
// 0.0.13); until that origin has applied here, BEGIN is refused, typed, so
// every base a transaction reads counts from a committed origin. A leader
// whose determinism self-check failed refuses every BEGIN.
//
// Each command is proposed under its own deterministic entryId through the
// write commit owner (startPartitionRaftWriteCommit: the pending commit is
// registered before the proposal, a retry joins it, and its deadline and the
// leader-loss release answer a proposed command as an unknown outcome), and
// the leader stamps PREPARE and decision commands with its execution
// envelope (partition-transaction-execution-envelope.js).
//
// Every TRANSACTION request belongs to this owner. A QUERY is this owner's
// when it carries any current identity field, or when its routing sessionId
// collides with current volatile/durable participant custody. Every other
// QUERY is ordinary routing traffic.

import {PARTICIPANT_COMMIT_OUTCOME} from '../constants/transactions.js';
import {TABLES} from '../constants/tables.js';
import {PARTITION_SERVICE_SHARED} from './partition-service-shared.js';
import {
  partitionWriteLeadershipRefusalOf,
  startPartitionRaftWriteCommit,
} from './partition-service-raft-write-commit.js';
import {
  isRetryableWriteFailureCode,
  isWriteOutcomeUnknown,
} from './partition-write-kernel.js';
import {
  PARTITION_COMMITTED_COMMAND_ORIGIN,
  admitCommittedCommand,
  committedCommandRefusalResult,
} from './partition-committed-command-admission.js';
import {
  buildDecisionCommand,
  buildGenerationOriginCommand,
  buildPrepareCommand,
  decisionBindingRefusalOf,
  decisionEntryIdOf,
  decisionMatchesPreparedRow,
  identityRefusalOf,
  prepareEntryIdOf,
  validationTextOf,
} from './partition-participant-transaction-bytes.js';
import {
  isPartitionReserved,
  participantOutcomeOf,
  readParticipantTransactionRow,
  readPartitionWriteGeneration,
  readPartitionWriteOrigin,
} from './partition-participant-transaction-store.js';
import {operationResultsOf} from './partition-participant-transaction-apply.js';
import {
  endParticipantSession,
  findParticipantSession,
  openParticipantSession,
  participantRoutingSessionCollision,
  participantTransactionActive,
} from './partition-participant-transaction-session.js';
import {runParticipantSessionStatement} from
  './partition-participant-transaction-staging.js';
import {participantDeterminismSelfCheckOf} from
  './partition-participant-transaction-self-check.js';
import {participantConnectionStampOf} from
  './partition-participant-transaction-connection.js';
import {participantCutoverPauseOf} from './partition-participant-transaction-pause.js';
import {coordinatorTableParticipantRefusal} from
  '../query/distributed/distributed-transaction-participant-admission.js';
import {readTransactionSchemaEnforcement, TRANSACTION_SCHEMA_ENFORCEMENT_ERROR,
  TRANSACTION_SCHEMA_ENFORCEMENT_STATE} from
  '../query/distributed/distributed-transaction-schema-enforcement.js';
import {TOPOLOGY_TRANSITION_KIND, topologyTransitionOf} from
  './partition-participant-transaction-topology-fence.js';
import {executionEnvelopeOf} from './partition-transaction-execution-envelope.js';
import {transactionStatementKindOf} from './partition-transaction-determinism.js';
import {TRANSACTION_STATEMENT_KIND} from './partition-transaction-determinism-constants.js';
import {copyStrictOwnDataRecord} from '../utils/strict-own-data.js';
import {
  PARTICIPANT_TRANSACTION_DECISION as DECISION,
  PARTICIPANT_TRANSACTION_FAILURE_CODE as CODE,
  PARTICIPANT_TRANSACTION_MESSAGE as MESSAGE,
  PARTICIPANT_TRANSACTION_REFUSAL_CAUSE as CAUSE,
  PARTICIPANT_TRANSACTION_SESSION_PHASE as PHASE,
  PARTICIPANT_TRANSACTION_STATE as STATE,
} from './partition-participant-transaction-constants.js';

const {
  PARTITION_SERVICE_LITERAL,
  PARTITION_SERVICE_OPERATION,
} = PARTITION_SERVICE_SHARED;

// What a decision request does when the durable row and the session leave it
// to the log: it is proposed, and its apply decides.
const PROPOSE_DECISION = Object.freeze({proposeDecision: true});
const REQUEST_IDENTITY_FIELDS = Object.freeze([
  'transactionId',
  'participantId',
  'commitMode',
  'transactionEpoch',
]);
const PARTICIPANT_QUERY_KIND = Object.freeze({
  ORDINARY: 'ordinary',
  CURRENT: 'current',
  REFUSED: 'refused',
});
const objectHasOwn = Object.hasOwn;

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function requestCarriesIdentity(request) {
  for (let index = 0; index < REQUEST_IDENTITY_FIELDS.length; index += 1) {
    if (objectHasOwn(request, REQUEST_IDENTITY_FIELDS[index])) return true;
  }
  return false;
}

/**
 * Classify one strict own-data request as current participant traffic,
 * current identity refusal, or ordinary QUERY traffic.
 * @param {Object} payload - A TRANSACTION or QUERY request.
 * @return {Object} Discriminated request classification.
 */
function participantQueryClassification(service, payload) {
  const request = copyStrictOwnDataRecord(payload);
  if (request === null) {
    return {kind: PARTICIPANT_QUERY_KIND.REFUSED, request: {},
      failureCode: CODE.IDENTITY_REQUIRED};
  } else if (requestCarriesIdentity(request)) {
    const failureCode = identityRefusalOf(request, service.partitionId);
    return failureCode === null ?
      {kind: PARTICIPANT_QUERY_KIND.CURRENT, request} :
      {kind: PARTICIPANT_QUERY_KIND.REFUSED, request, failureCode};
  } else if (participantRoutingSessionCollision(service, request.sessionId)) {
    return {kind: PARTICIPANT_QUERY_KIND.REFUSED, request,
      failureCode: identityRefusalOf(request, service.partitionId)};
  }
  return {kind: PARTICIPANT_QUERY_KIND.ORDINARY, request};
}

function answerOf(service, payload, fields) {
  return {
    operation: payload.operation,
    partitionId: service.partitionId,
    transactionId: payload.transactionId ?? null,
    participantId: payload.participantId ?? null,
    ...fields,
  };
}

function refusalOf(service, payload, failureCode, fields = {}) {
  return answerOf(service, payload, {
    success: false,
    error: `${MESSAGE.REFUSED}${MESSAGE.CODE_SEPARATOR}${failureCode}`,
    failureCode,
    ...fields,
  });
}

function identityOf(payload) {
  return {
    sessionId: payload.sessionId ?? null,
    transactionId: payload.transactionId,
    participantId: payload.participantId,
    commitMode: payload.commitMode,
    transactionEpoch: payload.transactionEpoch,
  };
}

function stampOf(service) {
  return {
    timestamp: service.hlcClock.now().toString(),
    proposedBy: service.replicaId,
    proposedAt: service.timeSource.now(),
  };
}

// A PREPARE's or decision's stamp: the leader's execution envelope, then the
// proposal stamp (design 2.3's pinned field order).
function commandStampOf(service) {
  return {executionEnvelope: executionEnvelopeOf(service.db), ...stampOf(service)};
}

// The write kernel's answer, typed for the participant: a command that may
// still commit is UNKNOWN, one-to-one with the kernel's unknown outcome.
function proposalAnswerOf(service, payload, answer) {
  const typed = answerOf(service, payload, answer);
  return isWriteOutcomeUnknown(answer) ?
    {...typed, outcome: PARTICIPANT_COMMIT_OUTCOME.UNKNOWN} : typed;
}

// The admission owner's refusal of a command this owner built, asked before
// any session state changes for it; null when it may be proposed.
function admissionRefusalOf(service, payload, command) {
  const admission = admitCommittedCommand(command,
    {origin: PARTITION_COMMITTED_COMMAND_ORIGIN.TRANSACTION_OWNER});
  return admission.admitted ? null : answerOf(service, payload,
    committedCommandRefusalResult(admission, service.partitionId));
}

async function proposeAdmitted(service, payload, command) {
  return proposalAnswerOf(service, payload, await startPartitionRaftWriteCommit(
    service, {entry: command, phaseTimings: null,
      applyStartMs: service.timeSource.now()}));
}

// The durable row of this transaction, which ends any session left of it (a
// PREPARE that applied while its answer was lost): the row is the authority.
function rowEndingSession(service, payload) {
  const row = readParticipantTransactionRow(service.db, payload);
  const session = findParticipantSession(service, payload);
  if (row !== null && session !== null) {
    endParticipantSession(service, session);
  }
  return {row, session: row === null ? session : null};
}

// A session's own refusal before it may serve a request: another epoch for
// this transactionId, or a doomed session's code.
function sessionRefusalOf(service, payload, session) {
  if (session.identity.transactionEpoch !== payload.transactionEpoch) {
    return refusalOf(service, payload, CODE.IDENTITY_MISMATCH);
  }
  return session.phase === PHASE.DOOMED ?
    refusalOf(service, payload, session.doomCode) : null;
}

function volatileStateOf(session) {
  return session.phase === PHASE.PREPARING ? STATE.PREPARING : STATE.ACTIVE;
}

// --- BEGIN ---

function topologyRefusalOf(service, payload) {
  const topology = topologyTransitionOf(service);
  return topology === null ? null : refusalOf(service, payload,
    topology.kind === TOPOLOGY_TRANSITION_KIND.UNAVAILABLE ?
      CODE.TOPOLOGY_UNAVAILABLE : CODE.TOPOLOGY_TRANSITION_ACTIVE,
    {deferRetry: true, topology});
}

// What refuses a BEGIN before any session is looked up: leadership (a
// session stages on the leader only), the generation origin, the leader's
// self-check, the removal fence.
function beginRefusalOf(service, payload) {
  const leadership = partitionWriteLeadershipRefusalOf(service);
  if (leadership !== null) {
    return answerOf(service, payload, leadership);
  }
  if (participantCutoverPauseOf(service) !== null) {
    return refusalOf(service, payload, CODE.CUTOVER_PAUSED, {deferRetry: true});
  }
  const origin = readPartitionWriteOrigin(service.db);
  if (origin === null) {
    return refusalOf(service, payload, CODE.GENERATION_ORIGIN_PENDING,
      participantOutcomeOf(null));
  }
  if (participantDeterminismSelfCheckOf(service)?.passed !== true) {
    return refusalOf(service, payload, CODE.DETERMINISM_SELF_CHECK_FAILED);
  }
  return service.removalServingAdmissionFenced === true ?
    refusalOf(service, payload, CODE.REMOVAL_FENCED, {deferRetry: true}) :
    topologyRefusalOf(service, payload);
}

function existingSessionAnswer(service, payload, session) {
  const refused = sessionRefusalOf(service, payload, session);
  if (refused !== null) {
    return refused;
  }
  return session.phase === PHASE.PREPARING ?
    refusalOf(service, payload, CODE.PREPARING, participantOutcomeOf(null,
      STATE.PREPARING)) :
    answerOf(service, payload, {success: true, idempotent: true,
      ...participantOutcomeOf(null, STATE.ACTIVE)});
}

function beginParticipantSession(service, payload) {
  const coordinatorRefusal = coordinatorTableParticipantRefusal(service.tableName);
  if (coordinatorRefusal !== null) return answerOf(service, payload, coordinatorRefusal);
  const refused = beginRefusalOf(service, payload);
  if (refused !== null) {
    return refused;
  }
  const {row, session} = rowEndingSession(service, payload);
  if (row !== null) {
    return refusalOf(service, payload, row.state === STATE.PREPARED ?
      CODE.SEALED : CODE.TERMINAL, participantOutcomeOf(row));
  }
  if (session !== null) {
    return existingSessionAnswer(service, payload, session);
  }
  // One non-terminal participant transaction per partition.
  if (participantTransactionActive(service)) {
    return refusalOf(service, payload, CODE.ALREADY_ACTIVE);
  }
  // The conflict base (design 3.2): read at BEGIN, carried unchanged, with
  // the origin it counts from (design 0.0.13).
  openParticipantSession(service, identityOf(payload), {
    generationBase: readPartitionWriteGeneration(service.db),
    originIndex: readPartitionWriteOrigin(service.db).originIndex,
  });
  return answerOf(service, payload, {success: true,
    sessionId: payload.sessionId ?? null,
    transactionEpoch: payload.transactionEpoch,
    ...participantOutcomeOf(null, STATE.ACTIVE)});
}

// --- PREPARE ---

// What a PREPARE answer leaves of its sealed session: a refusal that settled
// nothing (the reservation's, a retryable kernel refusal, an unknown
// outcome) keeps it sealed for the coordinator's retry, which re-proposes the
// same bytes; any other answer ends it (PREPARED: the row is the authority).
function keepsSealedSession(answer) {
  return answer?.success !== true && (answer?.failureCode === CODE.RESERVED ||
    isRetryableWriteFailureCode(answer?.failureCode));
}

async function proposeSealedPrepare(service, payload, session) {
  session.inFlight = true;
  let answer;
  try {
    answer = await proposeAdmitted(service, payload, session.sealed);
  } finally {
    session.inFlight = false;
  }
  if (!keepsSealedSession(answer)) {
    endParticipantSession(service, session);
  }
  return answer;
}

function sealSession(service, payload, session) {
  // Advisory: the apply is the authority over the carried base.
  if (readPartitionWriteGeneration(service.db) !== session.generationBase) {
    endParticipantSession(service, session);
    return refusalOf(service, payload, CODE.PREPARE_REFUSED,
      {refusalCause: CAUSE.CONFLICT, ...participantOutcomeOf(null)});
  }
  const command = buildPrepareCommand(identityOf(payload), {
    operationsText: JSON.stringify(session.operations),
    validationText: validationTextOf(session.generationBase, service.partitionId,
      session.originIndex)}, commandStampOf(service));
  const refused = admissionRefusalOf(service, payload, command);
  if (refused !== null) {
    return refused;
  }
  session.phase = PHASE.PREPARING;
  session.sealed = command;
  return null;
}

async function prepareSession(service, payload, session) {
  const refused = sessionRefusalOf(service, payload, session);
  if (refused !== null) {
    return refused;
  }
  if (session.sealed !== null && session.sealed.commitMode !== payload.commitMode) {
    return refusalOf(service, payload, CODE.IDENTITY_MISMATCH);
  }
  if (isPartitionReserved(service.db)) {
    return refusalOf(service, payload, CODE.RESERVED,
      {deferRetry: true, ...participantOutcomeOf(null, volatileStateOf(session))});
  }
  // A sealed command already submitted belongs to its outcome owner. Only
  // a new PREPARE is topology admission; retries retain their exact bytes.
  if (session.sealed === null) {
    const topology = topologyRefusalOf(service, payload);
    if (topology !== null) return topology;
  }
  const sealRefusal = session.sealed === null ?
    sealSession(service, payload, session) : null;
  return sealRefusal ?? proposeSealedPrepare(service, payload, session);
}

async function prepareParticipant(service, payload) {
  const leadership = partitionWriteLeadershipRefusalOf(service);
  if (leadership !== null) {
    return answerOf(service, payload, leadership);
  }
  const pending = service.getPendingCommittedWriteOutcome(
    prepareEntryIdOf(payload.participantId));
  if (pending !== null) {
    return proposalAnswerOf(service, payload, await pending);
  }
  const {row, session} = rowEndingSession(service, payload);
  if (row !== null) {
    return row.state === STATE.PREPARED ?
      answerOf(service, payload, {success: true,
        ...participantOutcomeOf(row)}) :
      refusalOf(service, payload, CODE.TERMINAL, participantOutcomeOf(row));
  }
  return session === null ? refusalOf(service, payload, CODE.NOT_ACTIVE,
    participantOutcomeOf(null)) : prepareSession(service, payload, session);
}

// --- COMMIT and bound ROLLBACK ---

function bindingOf(payload) {
  return {
    ...identityOf(payload),
    decision: payload.decision,
    preparedDigest: payload.preparedDigest ?? null,
    decisionText: payload.decisionText,
    decisionDigest: payload.decisionDigest,
  };
}

function decidedRowAnswer(service, payload, binding, row) {
  const repeated = binding.decisionDigest === row.decisionDigest;
  if (row.state === STATE.COMMITTED && repeated &&
      binding.decision === DECISION.COMMIT) {
    return answerOf(service, payload, {success: true, replayed: true,
      ...participantOutcomeOf(row), results: operationResultsOf(service, row)});
  }
  if (row.state === STATE.ROLLED_BACK && repeated &&
      binding.decision === DECISION.ROLLBACK) {
    return answerOf(service, payload, {success: true, replayed: true,
      ...participantOutcomeOf(row)});
  }
  return refusalOf(service, payload, CODE.DECISION_CONFLICT,
    participantOutcomeOf(row));
}

// What the durable row answers before anything is proposed (design 4), or
// PROPOSE_DECISION.
function decisionOverRow(service, payload, binding, row) {
  if (row.commitMode !== binding.commitMode ||
      row.transactionEpoch !== binding.transactionEpoch) {
    return refusalOf(service, payload, CODE.IDENTITY_MISMATCH,
      participantOutcomeOf(row));
  }
  if (row.state === STATE.PREPARED) {
    return decisionMatchesPreparedRow(binding, row) ? PROPOSE_DECISION :
      refusalOf(service, payload, CODE.DECISION_DIGEST_MISMATCH,
        participantOutcomeOf(row));
  }
  if (row.state === STATE.REFUSED) {
    return binding.decision === DECISION.ROLLBACK ?
      answerOf(service, payload, {success: true,
        ...participantOutcomeOf(row)}) :
      refusalOf(service, payload, CODE.NOT_PREPARED,
        participantOutcomeOf(row));
  }
  return decidedRowAnswer(service, payload, binding, row);
}

// With no row: a staging session is never prepared - a COMMIT of it is
// refused, a ROLLBACK discards it and proposes its TOMBSTONE; with no session
// the decision is proposed and its apply decides.
function decisionOverSession(service, payload, binding, session) {
  if (session !== null && binding.decision === DECISION.COMMIT) {
    return refusalOf(service, payload, CODE.NOT_PREPARED,
      participantOutcomeOf(null, volatileStateOf(session)));
  }
  if (session !== null) {
    endParticipantSession(service, session);
  }
  return PROPOSE_DECISION;
}

function decisionRequestRefusalOf(binding, decision) {
  if (!isNonEmptyString(binding.decisionDigest)) {
    return CODE.DECISION_BINDING_REQUIRED;
  }
  return binding.decision === decision ?
    decisionBindingRefusalOf(binding) : CODE.DECISION_DIGEST_MISMATCH;
}

async function decideParticipant(service, payload, decision) {
  const leadership = partitionWriteLeadershipRefusalOf(service);
  if (leadership !== null) {
    return answerOf(service, payload, leadership);
  }
  const binding = bindingOf(payload);
  const bindingRefusal = decisionRequestRefusalOf(binding, decision);
  if (bindingRefusal !== null) {
    return refusalOf(service, payload, bindingRefusal);
  }
  const pending = service.getPendingCommittedWriteOutcome(
    decisionEntryIdOf(payload.participantId, binding.decisionDigest));
  if (pending !== null) {
    return proposalAnswerOf(service, payload, await pending);
  }
  const {row, session} = rowEndingSession(service, payload);
  if (decision === DECISION.COMMIT && session?.phase === PHASE.PREPARING) {
    return refusalOf(service, payload, CODE.PREPARING, {deferRetry: true});
  }
  const command = buildDecisionCommand(identityOf(payload), binding,
    commandStampOf(service));
  const refused = admissionRefusalOf(service, payload, command);
  if (refused !== null) {
    return refused;
  }
  const answered = row === null ?
    decisionOverSession(service, payload, binding, session) :
    decisionOverRow(service, payload, binding, row);
  return answered === PROPOSE_DECISION ?
    proposeAdmitted(service, payload, command) : answered;
}

// --- unbound ROLLBACK: volatile staging only (design 2.4) ---

function unboundRollback(service, payload) {
  const {row, session} = rowEndingSession(service, payload);
  if (row !== null) {
    if (row.state === STATE.PREPARED) {
      return refusalOf(service, payload, CODE.DECISION_BINDING_REQUIRED,
        participantOutcomeOf(row));
    }
    return row.state === STATE.COMMITTED ?
      refusalOf(service, payload, CODE.DECISION_CONFLICT,
        participantOutcomeOf(row)) :
      answerOf(service, payload, {success: true, durable: true,
        ...participantOutcomeOf(row)});
  }
  // A PREPARE was sent: only a bound decision may end it (seam C).
  if (session?.phase === PHASE.PREPARING) {
    return refusalOf(service, payload, CODE.PREPARING, {deferRetry: true});
  }
  if (session !== null) {
    endParticipantSession(service, session);
  }
  return answerOf(service, payload, {success: true, durable: false,
    ...participantOutcomeOf(null)});
}

function rollbackParticipant(service, payload) {
  return isNonEmptyString(payload.decisionDigest) ?
    decideParticipant(service, payload, DECISION.ROLLBACK) :
    unboundRollback(service, payload);
}

// --- outcome read (design 5.2), any replica ---

function participantOutcomeAnswer(service, payload) {
  const row = readParticipantTransactionRow(service.db, payload);
  const session = row === null ? findParticipantSession(service, payload) : null;
  return answerOf(service, payload, {success: true,
    ...participantOutcomeOf(row, session === null ? STATE.ABSENT :
      volatileStateOf(session))});
}

function answerParticipantRequest(service, payload) {
  switch (payload.operation) {
  case PARTITION_SERVICE_LITERAL.BEGIN:
    return beginParticipantSession(service, payload);
  case PARTITION_SERVICE_LITERAL.PREPARE:
    return prepareParticipant(service, payload);
  case PARTITION_SERVICE_OPERATION.COMMIT:
    return decideParticipant(service, payload, DECISION.COMMIT);
  case PARTITION_SERVICE_OPERATION.ROLLBACK:
    return rollbackParticipant(service, payload);
  case PARTITION_SERVICE_OPERATION.TRANSACTION_OUTCOME:
    return participantOutcomeAnswer(service, payload);
  default:
    return null;
  }
}

/**
 * Route one TRANSACTION request. Every request is current: malformed identity
 * is refused by the canonical identity owner and never selects another
 * protocol. Null is the answer for an operation this owner does not know.
 * @param {Object} service - The partition.
 * @param {Object} payload - The TRANSACTION request.
 * @return {Promise<Object|null>} The answer.
 */
function routeParticipantTransactionRequest(service, payload) {
  const request = copyStrictOwnDataRecord(payload) ?? {};
  const identityRefusal = identityRefusalOf(request, service.partitionId);
  return Promise.resolve(identityRefusal === null ?
    answerParticipantRequest(service, request) :
    refusalOf(service, request, identityRefusal));
}

// --- session statements (QUERY) ---

function sessionStatementAnswer(service, payload) {
  const identityRefusal = identityRefusalOf(payload, service.partitionId);
  if (identityRefusal !== null) {
    return refusalOf(service, payload, identityRefusal);
  }
  const {row, session} = rowEndingSession(service, payload);
  if (row !== null) {
    return refusalOf(service, payload, row.state === STATE.PREPARED ?
      CODE.SEALED : CODE.TERMINAL, participantOutcomeOf(row));
  }
  if (session === null) {
    return refusalOf(service, payload, CODE.NOT_ACTIVE, participantOutcomeOf(null));
  }
  const refused = sessionRefusalOf(service, payload, session);
  if (refused !== null) {
    return refused;
  }
  // A sealed session stages no write; it still reads its sealed operations.
  if (session.phase === PHASE.PREPARING &&
      transactionStatementKindOf(payload.sql) === TRANSACTION_STATEMENT_KIND.WRITE) {
    return refusalOf(service, payload, CODE.PREPARING);
  }
  return answerOf(service, payload,
    runParticipantSessionStatement(service, session, payload));
}

/**
 * Return the current owner's early malformed/collision answer. Valid current
 * queries keep their ordinary epoch and leadership gates before staging.
 * @param {Object} service - The partition.
 * @param {Object} payload - The QUERY request.
 * @return {Object|null} Acknowledged refusal, or null.
 */
function answerParticipantQueryIdentityRefusal(service, payload) {
  const classified = participantQueryClassification(service, payload);
  return classified.kind === PARTICIPANT_QUERY_KIND.REFUSED ?
    {acknowledged: true, ...refusalOf(service, classified.request,
      classified.failureCode)} : null;
}

/**
 * Whether removal admission must route this QUERY through the participant
 * owner: a current session still in volatile custody, a routing collision,
 * or a malformed strict record. A valid identity with no current session is
 * new work and remains fenced.
 * @param {Object} service - The partition.
 * @param {Object} payload - The QUERY request.
 * @return {boolean} Whether this owner must answer it.
 */
function admitsParticipantSessionQueryDuringRemoval(service, payload) {
  const classified = participantQueryClassification(service, payload);
  return classified.kind === PARTICIPANT_QUERY_KIND.REFUSED ||
    (classified.kind === PARTICIPANT_QUERY_KIND.CURRENT &&
      findParticipantSession(service, classified.request) !== null);
}

/**
 * Answer a valid current QUERY: a statement of the transaction
 * staging on this leader is staged or read under c'; one for a transaction
 * not staging here now (PREPARING for a write, PREPARED, decided, or unknown
 * here) is refused, typed, never run as an ordinary write. Null for ordinary
 * QUERY traffic.
 * @param {Object} service - The partition.
 * @param {Object} payload - The QUERY request.
 * @return {Object|null} The acknowledged answer, or null.
 */
function answerParticipantSessionQuery(service, payload) {
  try {
    const classified = participantQueryClassification(service, payload);
    if (classified.kind === PARTICIPANT_QUERY_KIND.ORDINARY) return null;
    if (classified.kind === PARTICIPANT_QUERY_KIND.REFUSED) {
      return {acknowledged: true, ...refusalOf(service, classified.request,
        classified.failureCode)};
    }
    return {acknowledged: true,
      ...sessionStatementAnswer(service, classified.request)};
  } catch (statementError) {
    // An unexpected failure answers this request; nothing staged changed.
    return {acknowledged: true, success: false, error: statementError?.message,
      errorCode: statementError?.code ?? null, partitionId: service.partitionId};
  }
}

/**
 * Enable participant transactions on this partition (design 0.0.13): the
 * leader proposes the generation origin once, through the write commit owner
 * under its deterministic entryId, after the release owner's L6 drain; an
 * origin already applied here is answered from the generation row and nothing
 * is proposed. Until the origin has applied, BEGIN is refused
 * GENERATION_ORIGIN_PENDING. The leader's connection must have served no
 * legacy session since its open (0.0.14, the L6 clause): one that did is
 * refused CONNECTION_SERVED_LEGACY, and the cutover reopens it through the
 * lifecycle owner first (partition-participant-transaction-connection.js).
 * @param {Object} service - The partition (its leader).
 * @return {Promise<Object>} The origin's answer ({success, originIndex,
 *   originTerm}), or a typed refusal.
 */
async function enableParticipantTransactionAdmission(service) {
  const recorded = readPartitionWriteOrigin(service.db);
  const coordinatorEnforcement = service.tableName === TABLES.SQL_TRANSACTIONS ?
    readTransactionSchemaEnforcement(service.db) : null;
  if (recorded !== null &&
      coordinatorEnforcement?.state !== TRANSACTION_SCHEMA_ENFORCEMENT_STATE.REQUIRED) {
    if (coordinatorEnforcement !== null &&
        coordinatorEnforcement.state !== TRANSACTION_SCHEMA_ENFORCEMENT_STATE.ENFORCED) {
      return {success: false,
        failureCode: TRANSACTION_SCHEMA_ENFORCEMENT_ERROR.SCHEMA,
        errorCode: TRANSACTION_SCHEMA_ENFORCEMENT_ERROR.SCHEMA,
        error: TRANSACTION_SCHEMA_ENFORCEMENT_ERROR.SCHEMA,
        partitionId: service.partitionId, enforcement: coordinatorEnforcement};
    }
    return {success: true, alreadyEnabled: true,
      partitionId: service.partitionId, ...recorded};
  }
  const leadership = partitionWriteLeadershipRefusalOf(service);
  if (leadership !== null) {
    return leadership;
  }
  const payload = {partitionId: service.partitionId};
  const connection = participantConnectionStampOf(service.db);
  if (connection.servedLegacy) {
    return refusalOf(service, payload, CODE.CONNECTION_SERVED_LEGACY,
      {connectionGeneration: connection.generation});
  }
  const command = buildGenerationOriginCommand(service.partitionId,
    stampOf(service));
  const pending = service.getPendingCommittedWriteOutcome(command.entryId);
  if (pending !== null) {
    return answerOf(service, payload, await pending);
  }
  return admissionRefusalOf(service, payload, command) ??
    answerOf(service, payload, await startPartitionRaftWriteCommit(service,
      {entry: command, phaseTimings: null,
        applyStartMs: service.timeSource.now()}));
}

export {
  answerParticipantQueryIdentityRefusal,
  answerParticipantSessionQuery,
  admitsParticipantSessionQueryDuringRemoval,
  enableParticipantTransactionAdmission,
  routeParticipantTransactionRequest,
};
