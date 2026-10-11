// The participant's volatile staging sessions (TX1 design revision 10,
// section 3.1, F6 c'; table 4's volatile column): the one owner of which
// transaction stages on this leader, what it staged and in which phase it is.
// A session opens no SQLite transaction: it is {identity, operations,
// generationBase, originIndex, bytes, startedAt, phase} in memory, on the
// leader only, and every request replays its operations inside one
// synchronous transaction that rolls back (partition-participant-transaction-
// staging.js). Leg A admits one non-terminal transaction per partition.
//
// A session ends when its transaction is decided or discarded: a PREPARE
// that the apply answers PREPARED (the durable row is then the authority), a
// terminal refusal, a ROLLBACK, the hold sweep (past the hold window, on any
// role, with no SQL), or demotion (this replica stops leading). A PREPARE
// that the apply consumed without settling (the reservation's non-settling
// refusal) or whose outcome is unknown keeps the session PREPARING with its
// sealed command, so the coordinator's retry re-proposes the same bytes.
import {
  PARTICIPANT_TRANSACTION_LOG_MSG as LOG_MSG,
  PARTICIPANT_TRANSACTION_SESSION_PHASE as PHASE,
} from './partition-participant-transaction-constants.js';
import {readPreparedParticipantIds} from './partition-participant-transaction-store.js';

// Per partition service: participantId -> session.
const SESSIONS = new WeakMap();
// Per partition service: participantId -> when the hold sweep first saw it
// PREPARED, and whether that hold was reported.
const PREPARED_HOLDS = new WeakMap();

function sessionsOf(service) {
  let sessions = SESSIONS.get(service);
  if (sessions === undefined) {
    sessions = new Map();
    SESSIONS.set(service, sessions);
  }
  return sessions;
}

/**
 * Open a staging session for a BEGIN the request owner admitted.
 * @param {Object} service - The partition (its leader).
 * @param {Object} identity - {sessionId, transactionId, participantId,
 *   commitMode, transactionEpoch} of the BEGIN.
 * @param {Object} base - {generationBase, originIndex}: the write generation
 *   read at BEGIN and the origin it counts from (design 3.2, 0.0.13).
 * @return {Object} The session.
 */
function openParticipantSession(service, identity, base) {
  const session = {
    identity: Object.freeze({...identity}),
    // Each staged operation as its PREPARE will carry it (decoded from its
    // JSON text), and the encoded bytes of the operations text.
    operations: [],
    bytes: 0,
    generationBase: base.generationBase,
    originIndex: base.originIndex,
    startedAt: service.timeSource.now(),
    phase: PHASE.ACTIVE,
    sealed: null,
    inFlight: false,
    doomCode: null,
  };
  sessionsOf(service).set(identity.participantId, session);
  return session;
}

/**
 * The session staging this request's transaction here: the one its
 * participantId keys, begun by the same transactionId; null otherwise.
 * @param {Object} service - The partition.
 * @param {{transactionId: string, participantId: string}} request - Identity.
 * @return {Object|null} The session.
 */
function findParticipantSession(service, {transactionId, participantId}) {
  const session = SESSIONS.get(service)?.get(participantId) ?? null;
  return session?.identity.transactionId === transactionId ? session : null;
}

/**
 * The session a routing sessionId names, if a participant transaction holds
 * it (the L6 fences between the two protocols ask this).
 * @param {Object} service - The partition.
 * @param {string} sessionId - A routing sessionId.
 * @return {Object|null} The session.
 */
function participantSessionNamed(service, sessionId) {
  for (const session of SESSIONS.get(service)?.values() ?? []) {
    if (session.identity.sessionId === sessionId) {
      return session;
    }
  }
  return null;
}

/**
 * Whether any staging session exists here (one non-terminal transaction per
 * partition).
 * @param {Object} service - The partition.
 * @return {boolean} Whether a session stages, prepares or is doomed here.
 */
function hasParticipantSession(service) {
  return (SESSIONS.get(service)?.size ?? 0) > 0;
}

/**
 * End one session (its transaction was decided, refused or discarded).
 * @param {Object} service - The partition.
 * @param {Object} session - The session.
 */
function endParticipantSession(service, session) {
  const sessions = SESSIONS.get(service);
  if (sessions?.get(session.identity.participantId) === session) {
    sessions.delete(session.identity.participantId);
  }
}

/**
 * Discard every session: this replica stopped leading (the demotion hook;
 * nothing durable or connection-bound is held, so nothing is healed).
 * @param {Object} service - The partition.
 */
function discardParticipantSessions(service) {
  const sessions = SESSIONS.get(service);
  if (sessions === undefined || sessions.size === 0) {
    return;
  }
  service.logger.info(LOG_MSG.SESSIONS_DISCARDED, {
    partitionId: service.partitionId, sessionCount: sessions.size});
  sessions.clear();
}

// Discard the sessions held past the hold window (design 4, hold sweep): an
// ACTIVE, DOOMED or sealed session whose PREPARE is not in flight, on any
// role, with no SQL; a PREPARE in flight owns its own commit deadline.
function sweepExpiredParticipantSessions(service, nowMs, holdTimeoutMs) {
  const sessions = SESSIONS.get(service);
  let discarded = 0;
  for (const session of [...(sessions?.values() ?? [])]) {
    if (!session.inFlight && nowMs - session.startedAt >= holdTimeoutMs) {
      sessions.delete(session.identity.participantId);
      discarded += 1;
      service.logger.info(LOG_MSG.SESSION_EXPIRED, {
        partitionId: service.partitionId,
        transactionId: session.identity.transactionId,
        phase: session.phase, heldMs: nowMs - session.startedAt});
    }
  }
  return discarded;
}

// Report a PREPARED row held past the hold window, once: a PREPARED row is an
// obligation, released by its decision alone, never by time (design 8.4).
function reportHeldPreparedRows(service, nowMs, holdTimeoutMs) {
  const prepared = new Set(readPreparedParticipantIds(service.db));
  let holds = PREPARED_HOLDS.get(service);
  if (holds === undefined) {
    holds = new Map();
    PREPARED_HOLDS.set(service, holds);
  }
  for (const participantId of [...holds.keys()]) {
    if (!prepared.has(participantId)) {
      holds.delete(participantId);
    }
  }
  for (const participantId of prepared) {
    const hold = holds.get(participantId) ?? {firstSeenMs: nowMs, reported: false};
    holds.set(participantId, hold);
    if (!hold.reported && nowMs - hold.firstSeenMs >= holdTimeoutMs) {
      hold.reported = true;
      service.logger.warn(LOG_MSG.PREPARED_HELD, {partitionId: service.partitionId,
        participantId, heldMs: nowMs - hold.firstSeenMs});
    }
  }
}

/**
 * The participant half of the hold sweep (design 4): discard every staging
 * session held past the hold window and report every PREPARED row held past
 * it; a PREPARED row is never brought to a terminal state here.
 * @param {Object} service - The partition (its hold window,
 *   preparedStateHoldTimeoutMs).
 * @param {number} nowMs - The sweep's time, on the service's clock.
 * @return {number} How many staging sessions were discarded.
 */
function sweepParticipantTransactionHolds(service, nowMs) {
  if (service.db?.open !== true) {
    return 0;
  }
  const holdTimeoutMs = service.preparedStateHoldTimeoutMs;
  try {
    reportHeldPreparedRows(service, nowMs, holdTimeoutMs);
  } catch (holdReadError) {
    // The sweep runs on a timer: a failed report is logged, never thrown.
    service.logger.warn(LOG_MSG.PREPARED_HOLD_READ_FAILED, {
      partitionId: service.partitionId, error: holdReadError?.message});
  }
  return sweepExpiredParticipantSessions(service, nowMs, holdTimeoutMs);
}

export {
  discardParticipantSessions,
  endParticipantSession,
  findParticipantSession,
  hasParticipantSession,
  openParticipantSession,
  participantSessionNamed,
  sweepParticipantTransactionHolds,
};
