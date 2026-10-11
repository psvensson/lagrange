// The participant's transaction requests (TX1 design revision 10, sections
// 2.2, 4 and 7): the one owner of how a TRANSACTION or QUERY request that
// carries a transactionId is answered. BEGIN records the transaction's
// identity and its BEGIN-time write generation beside the session; PREPARE
// seals the session's staged operations into a PARTICIPANT_PREPARE; COMMIT
// and a bound ROLLBACK propose the PARTICIPANT_DECISION bound to the
// coordinator's decision record; an unbound ROLLBACK only discards volatile
// staging; an outcome read answers from the durable row, on any replica; and
// a session statement for a sealed, prepared or decided transaction is
// refused, typed, never run as a sessionless write. Transaction admission is
// enabled on a partition once, by the leader proposing the generation origin
// (design 0.0.13); until that origin has applied here, BEGIN is refused,
// typed, so every base a transaction reads counts from a committed origin.
//
// Each command is proposed under its own deterministic entryId through the
// write commit owner (startPartitionRaftWriteCommit: the pending commit is
// registered before the proposal, a retry joins it, and its deadline and the
// leader-loss release answer a proposed command as an unknown outcome).
//
// The two identity classes have one outcome authority each, until the
// cutover's drain (the L6 window): a request carrying a transactionId is
// answered from `_participant_transactions` here; a sessionId-only request
// keeps the legacy session path and its `_transaction_outcomes` row. No
// request reads both.
//
// Staging is still the session path's (BEGIN IMMEDIATE held on the shared
// connection across requests; a later TX1 increment replaces it with c').
// PREPARE therefore ends that staging transaction before it proposes: the
// rs-raft store admits no write inside it, and the staged effects were only
// speculative - the PREPARE's dry run and its COMMIT apply the operations as
// carried. While a participant transaction is in flight (PREPARING on this
// leader) or PREPARED here, no BEGIN opens another staging transaction on the
// connection (one non-terminal transaction per partition).

import {PARTICIPANT_COMMIT_OUTCOME} from '../constants/transactions.js';
import {PARTITION_SERVICE_SHARED} from './partition-service-shared.js';
import {startPartitionRaftWriteCommit} from
  './partition-service-raft-write-commit.js';
import {
  PARTITION_WRITE_COMMIT_MODE,
  buildPartitionWriteLeadershipRefusal,
  isWriteOutcomeUnknown,
  resolvePartitionWriteCommitMode,
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
  PARTICIPANT_TRANSACTION_DECISION as DECISION,
  PARTICIPANT_TRANSACTION_FAILURE_CODE as CODE,
  PARTICIPANT_TRANSACTION_MESSAGE as MESSAGE,
  PARTICIPANT_TRANSACTION_REFUSAL_CAUSE as CAUSE,
  PARTICIPANT_TRANSACTION_STATE as STATE,
} from './partition-participant-transaction-constants.js';

const {
  PARTITION_SERVICE_ERROR_MSG,
  PARTITION_SERVICE_LITERAL,
  PARTITION_SERVICE_OPERATION,
  PARTITION_SERVICE_SQL,
  RaftRole,
} = PARTITION_SERVICE_SHARED;

// A session's participant identity and BEGIN-time write generation, kept
// beside the session the session path owns (keyed by its state object, so it
// ends with the session).
const PARTICIPANT_SESSIONS = new WeakMap();
// Per partition service: the participants whose PREPARE this leader proposed
// and has not yet answered (PREPARING).
const PREPARING = new WeakMap();
const BEGIN_OPERATIONS = Object.freeze([
  PARTITION_SERVICE_OPERATION.BEGIN_TRANSACTION,
  PARTITION_SERVICE_LITERAL.BEGIN,
]);
// What a decision request does when the durable row and the session leave it
// to the log: it is proposed, and its apply decides.
const PROPOSE_DECISION = Object.freeze({proposeDecision: true});

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Whether a request carries a transactionId: it is the participant
 * protocol's, answered here; one without is the legacy session path's.
 * @param {Object} payload - A TRANSACTION or QUERY request.
 * @return {boolean} Whether this owner answers it.
 */
function isParticipantTransactionRequest(payload) {
  return payload?.transactionId !== undefined &&
    payload?.transactionId !== null;
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

function preparingOf(service) {
  let preparing = PREPARING.get(service);
  if (preparing === undefined) {
    preparing = new Set();
    PREPARING.set(service, preparing);
  }
  return preparing;
}

function isPreparing(service, participantId) {
  return PREPARING.get(service)?.has(participantId) === true;
}

function participantTransactionInFlight(service) {
  return (PREPARING.get(service)?.size ?? 0) > 0 ||
    isPartitionReserved(service.db);
}

// The session this transaction stages in, or null: the session path keys a
// session by its sessionId (routing context); the transactionId recorded at
// BEGIN must be the request's.
function participantSessionOf(service, payload) {
  const sessionId = service.normalizeTransactionSessionId(
    payload.sessionId ?? null);
  const state = service.activeTransactions.get(sessionId);
  const participant = state === undefined ? undefined :
    PARTICIPANT_SESSIONS.get(state);
  return participant?.transactionId === payload.transactionId ?
    {sessionId, state, participant} : null;
}

// End the session's staging transaction and forget the session (its staged
// effects were speculative: nothing it staged is visible or proposed).
function endSessionStaging(service, session) {
  if (service.db.inTransaction) {
    service.db.exec(PARTITION_SERVICE_SQL.ROLLBACK);
  }
  service.activeTransactions.delete(session.sessionId);
  service.preparedStateLostSessions.delete(session.sessionId);
  service.syncLegacyTransactionAliases();
}

// Only the consensus leader proposes (the write kernel's rule, as applyWrite
// asks it).
function leadershipRefusalOf(service) {
  const consensusStatus = service.raft.readStatus();
  const commitMode = resolvePartitionWriteCommitMode({
    replicaIds: service.replicaIds,
    raftState: consensusStatus.role,
    raftLeaderState: RaftRole.LEADER,
    hasKnownRemoteLeader: service.hasKnownRemoteLeaderWitness(),
  });
  return commitMode === PARTITION_WRITE_COMMIT_MODE.REJECTED ?
    buildPartitionWriteLeadershipRefusal(consensusStatus,
      service.partitionId) : null;
}

function stampOf(service) {
  return {
    timestamp: service.hlcClock.now().toString(),
    proposedBy: service.replicaId,
    proposedAt: service.timeSource.now(),
  };
}

// The write kernel's answer, typed for the participant: a command that may
// still commit is UNKNOWN, one-to-one with the kernel's unknown outcome.
function proposalAnswerOf(service, payload, answer) {
  const typed = answerOf(service, payload, answer);
  return isWriteOutcomeUnknown(answer) ?
    {...typed, outcome: PARTICIPANT_COMMIT_OUTCOME.UNKNOWN} : typed;
}

// The admission owner's refusal of a command this owner built, asked before
// any session is ended for it; null when it may be proposed.
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

// --- BEGIN ---

async function beginParticipantSession(service, payload) {
  const origin = readPartitionWriteOrigin(service.db);
  if (origin === null) {
    return refusalOf(service, payload, CODE.GENERATION_ORIGIN_PENDING,
      participantOutcomeOf(null));
  }
  const row = readParticipantTransactionRow(service.db, payload);
  if (row !== null) {
    return refusalOf(service, payload, row.state === STATE.PREPARED ?
      CODE.SEALED : CODE.TERMINAL, participantOutcomeOf(row));
  }
  const sessionId = service.normalizeTransactionSessionId(
    payload.sessionId ?? null);
  const open = service.activeTransactions.get(sessionId);
  if (open !== undefined) {
    return PARTICIPANT_SESSIONS.get(open)?.transactionId ===
      payload.transactionId ?
      answerOf(service, payload, {success: true, idempotent: true,
        ...participantOutcomeOf(null, STATE.ACTIVE)}) :
      refusalOf(service, payload, CODE.ALREADY_ACTIVE);
  }
  // One non-terminal transaction per partition: another session staging, or
  // a participant transaction PREPARING or PREPARED here.
  if (service.isInTransaction() || participantTransactionInFlight(service)) {
    return refusalOf(service, payload, CODE.ALREADY_ACTIVE);
  }
  const begun = await service.beginTransaction(sessionId,
    payload.transactionEpoch);
  const state = service.activeTransactions.get(sessionId);
  if (state !== undefined) {
    PARTICIPANT_SESSIONS.set(state, {
      transactionId: payload.transactionId,
      transactionEpoch: payload.transactionEpoch,
      // The conflict base (design 3.2): read at BEGIN, carried unchanged,
      // with the origin it counts from (design 0.0.13).
      generationBase: readPartitionWriteGeneration(service.db),
      originIndex: origin.originIndex,
    });
  }
  return answerOf(service, payload, {...begun,
    ...participantOutcomeOf(null, STATE.ACTIVE)});
}

// --- PREPARE ---

function stagedOperationsTextOf(sessionState) {
  try {
    return JSON.stringify(sessionState.operations.map((operation) => ({
      entryId: operation.entryId,
      sql: operation.sql,
      params: Array.isArray(operation.params) ? operation.params : [],
    })));
  } catch (_unencodable) {
    // A param the proposal codec cannot carry (a BigInt) is refused, typed.
    return null;
  }
}

async function proposeSealedPrepare(service, payload, command) {
  const preparing = preparingOf(service);
  preparing.add(payload.participantId);
  try {
    return await proposeAdmitted(service, payload, command);
  } finally {
    preparing.delete(payload.participantId);
  }
}

async function sealAndPrepare(service, payload, session) {
  const operationsText = stagedOperationsTextOf(session.state);
  if (operationsText === null) {
    return refusalOf(service, payload, CODE.SESSION_WRITE_PARAM_UNSUPPORTED);
  }
  if (isPartitionReserved(service.db)) {
    return refusalOf(service, payload, CODE.RESERVED,
      {deferRetry: true, ...participantOutcomeOf(null)});
  }
  // Advisory: the apply is the authority over the carried base.
  if (readPartitionWriteGeneration(service.db) !==
      session.participant.generationBase) {
    endSessionStaging(service, session);
    return refusalOf(service, payload, CODE.PREPARE_REFUSED,
      {refusalCause: CAUSE.CONFLICT, ...participantOutcomeOf(null)});
  }
  const command = buildPrepareCommand(identityOf(payload), {operationsText,
    validationText: validationTextOf(session.participant.generationBase,
      service.partitionId, session.participant.originIndex)},
  stampOf(service));
  const refused = admissionRefusalOf(service, payload, command);
  if (refused !== null) {
    return refused;
  }
  endSessionStaging(service, session);
  return proposeSealedPrepare(service, payload, command);
}

async function prepareParticipant(service, payload) {
  const leadership = leadershipRefusalOf(service);
  if (leadership !== null) {
    return answerOf(service, payload, leadership);
  }
  const pending = service.getPendingCommittedWriteOutcome(
    prepareEntryIdOf(payload.participantId));
  if (pending !== null) {
    return proposalAnswerOf(service, payload, await pending);
  }
  const row = readParticipantTransactionRow(service.db, payload);
  if (row !== null) {
    return row.state === STATE.PREPARED ?
      answerOf(service, payload, {success: true,
        ...participantOutcomeOf(row)}) :
      refusalOf(service, payload, CODE.TERMINAL, participantOutcomeOf(row));
  }
  const session = participantSessionOf(service, payload);
  if (session === null) {
    return refusalOf(service, payload, CODE.NOT_ACTIVE,
      participantOutcomeOf(null));
  }
  if (session.participant.transactionEpoch !== payload.transactionEpoch) {
    return refusalOf(service, payload, CODE.IDENTITY_MISMATCH);
  }
  return sealAndPrepare(service, payload, session);
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
function decisionOverSession(service, payload, binding) {
  const session = participantSessionOf(service, payload);
  if (session !== null && binding.decision === DECISION.COMMIT) {
    return refusalOf(service, payload, CODE.NOT_PREPARED,
      participantOutcomeOf(null, STATE.ACTIVE));
  }
  if (session !== null) {
    endSessionStaging(service, session);
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
  const leadership = leadershipRefusalOf(service);
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
  if (decision === DECISION.COMMIT &&
      isPreparing(service, payload.participantId)) {
    return refusalOf(service, payload, CODE.PREPARING, {deferRetry: true});
  }
  const command = buildDecisionCommand(identityOf(payload), binding,
    stampOf(service));
  const refused = admissionRefusalOf(service, payload, command);
  if (refused !== null) {
    return refused;
  }
  const row = readParticipantTransactionRow(service.db, payload);
  const answered = row === null ?
    decisionOverSession(service, payload, binding) :
    decisionOverRow(service, payload, binding, row);
  return answered === PROPOSE_DECISION ?
    proposeAdmitted(service, payload, command) : answered;
}

// --- unbound ROLLBACK: volatile staging only (design 2.4) ---

function unboundRollback(service, payload) {
  if (isPreparing(service, payload.participantId)) {
    return refusalOf(service, payload, CODE.PREPARING, {deferRetry: true});
  }
  const row = readParticipantTransactionRow(service.db, payload);
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
  const session = participantSessionOf(service, payload);
  if (session !== null) {
    endSessionStaging(service, session);
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

// The volatile state of a transaction with no durable row here.
function volatileStateOf(service, payload) {
  if (isPreparing(service, payload.participantId)) {
    return STATE.PREPARING;
  }
  return participantSessionOf(service, payload) === null ?
    STATE.ABSENT : STATE.ACTIVE;
}

function participantOutcomeAnswer(service, payload) {
  const row = readParticipantTransactionRow(service.db, payload);
  return answerOf(service, payload, {success: true,
    ...participantOutcomeOf(row, row === null ?
      volatileStateOf(service, payload) : STATE.ABSENT)});
}

function answerParticipantRequest(service, payload) {
  switch (payload.operation) {
  case PARTITION_SERVICE_OPERATION.BEGIN_TRANSACTION:
  case PARTITION_SERVICE_LITERAL.BEGIN:
    return beginParticipantSession(service, payload);
  case PARTITION_SERVICE_OPERATION.PREPARE_TRANSACTION:
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
 * Route one TRANSACTION request: a request carrying a transactionId is
 * answered here (null for an operation this owner does not know); a legacy
 * BEGIN while a participant transaction is in flight or PREPARED here is
 * refused, typed; any other request is the legacy session path's (undefined).
 * @param {Object} service - The partition.
 * @param {Object} payload - The TRANSACTION request.
 * @return {(Promise<Object|null>|undefined)} The answer, or undefined.
 */
function routeParticipantTransactionRequest(service, payload) {
  if (isParticipantTransactionRequest(payload)) {
    const identityRefusal = identityRefusalOf(payload, service.partitionId);
    return Promise.resolve(identityRefusal === null ?
      answerParticipantRequest(service, payload) :
      refusalOf(service, payload, identityRefusal));
  }
  if (BEGIN_OPERATIONS.includes(payload?.operation) &&
      participantTransactionInFlight(service)) {
    return Promise.resolve(answerOf(service, payload, {success: false,
      error: PARTITION_SERVICE_ERROR_MSG.TRANSACTION_ALREADY_ACTIVE,
      failureCode: CODE.ALREADY_ACTIVE}));
  }
  return undefined;
}

// The answer to a session statement of a transaction that does not stage
// here now; null when it does (the session path runs it).
function sessionQueryRefusalOf(service, payload) {
  const identityRefusal = identityRefusalOf(payload, service.partitionId);
  if (identityRefusal !== null) {
    return refusalOf(service, payload, identityRefusal);
  }
  const row = readParticipantTransactionRow(service.db, payload);
  if (row !== null) {
    return refusalOf(service, payload, row.state === STATE.PREPARED ?
      CODE.SEALED : CODE.TERMINAL, participantOutcomeOf(row));
  }
  if (isPreparing(service, payload.participantId)) {
    return refusalOf(service, payload, CODE.PREPARING);
  }
  return participantSessionOf(service, payload) === null ?
    refusalOf(service, payload, CODE.NOT_ACTIVE, participantOutcomeOf(null)) :
    null;
}

/**
 * Enable participant transactions on this partition (design 0.0.13): the
 * leader proposes the generation origin once, through the write commit owner
 * under its deterministic entryId, after the release owner's L6 drain; an
 * origin already applied here is answered from the generation row and nothing
 * is proposed. Until the origin has applied, BEGIN is refused
 * GENERATION_ORIGIN_PENDING.
 * @param {Object} service - The partition (its leader).
 * @return {Promise<Object>} The origin's answer ({success, originIndex,
 *   originTerm}), or the write kernel's typed refusal.
 */
async function enableParticipantTransactionAdmission(service) {
  const recorded = readPartitionWriteOrigin(service.db);
  if (recorded !== null) {
    return {success: true, alreadyEnabled: true,
      partitionId: service.partitionId, ...recorded};
  }
  const leadership = leadershipRefusalOf(service);
  if (leadership !== null) {
    return leadership;
  }
  const command = buildGenerationOriginCommand(service.partitionId,
    stampOf(service));
  const payload = {partitionId: service.partitionId};
  const pending = service.getPendingCommittedWriteOutcome(command.entryId);
  if (pending !== null) {
    return answerOf(service, payload, await pending);
  }
  return admissionRefusalOf(service, payload, command) ??
    answerOf(service, payload, await startPartitionRaftWriteCommit(service,
      {entry: command, phaseTimings: null,
        applyStartMs: service.timeSource.now()}));
}

/**
 * Refuse a QUERY carrying a transactionId whose transaction is not staging on
 * this replica now (PREPARING, PREPARED, decided, or unknown here), so it is
 * never run as a sessionless write; null for every other QUERY.
 * @param {Object} service - The partition.
 * @param {Object} payload - The QUERY request.
 * @return {Object|null} The acknowledged refusal, or null.
 */
function refuseParticipantSessionQuery(service, payload) {
  if (!isParticipantTransactionRequest(payload)) {
    return null;
  }
  const refused = sessionQueryRefusalOf(service, payload);
  return refused === null ? null : {acknowledged: true, ...refused};
}

export {
  enableParticipantTransactionAdmission,
  refuseParticipantSessionQuery,
  routeParticipantTransactionRequest,
};
