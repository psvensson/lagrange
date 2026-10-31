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
import {
  isParticipantSessionPrepared,
  isPartitionReserved,
  readPreparedParticipantIds,
} from './partition-participant-transaction-store.js';
import {hasLockingReadReservations} from './partition-locking-read-reservation.js';

// Per partition service: participantId -> session.
const SESSIONS = new WeakMap();
// Per partition service: participantId -> when the hold sweep first saw it
// PREPARED, and whether that hold was reported.
const PREPARED_HOLDS = new WeakMap();
const TABLE_PK_MEMO = new WeakMap();
const COMMITTED_ROW_KEY_GENERATIONS = new WeakMap();
const PREPARED_PARTICIPANT_ROW_KEYS = new WeakMap();
const SCOPED_COMMIT_GENERATIONS = new WeakMap();
const GRANULARITY_ROW_KEY = 'row-key';
const ROW_KEY_SEPARATOR = '|';
const EMPTY_PK_METADATA = Object.freeze({pkCols: Object.freeze([]), allCols: Object.freeze([])});
const SQL_INSERT_PREFIX = /^\s*INSERT\b/iu;
const SQL_INSERT_COLS_RE = /^\s*INSERT\s+INTO\s+[^\s(]+\s*\(([^)]+)\)/iu;
const SQL_WHERE_SPLIT_RE = /\bWHERE\b/iu;
const SQL_WHERE_TOKEN_RE = /([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(\?|\$\d+)|\?/gu;

function perServiceMap(store, service) {
  let map = store.get(service);
  if (map === undefined) {
    map = new Map();
    store.set(service, map);
  }
  return map;
}

function readTableInfoMetadata(db, tableName) {
  try {
    const info = db.pragma(`table_info(${tableName})`);
    if (!Array.isArray(info) || info.length === 0) {
      return EMPTY_PK_METADATA;
    }
    const allCols = info.map((col) => String(col.name).toLowerCase());
    const pkCols = info
      .filter((col) => Number(col.pk) > 0)
      .sort((a, b) => Number(a.pk) - Number(b.pk))
      .map((col) => String(col.name).toLowerCase());
    return {pkCols, allCols};
  } catch (_err) {
    return EMPTY_PK_METADATA;
  }
}

function resolveTablePkMetadata(service) {
  const db = service?.db;
  const tableName = service?.tableName;
  if (!db || typeof db.pragma !== 'function' || !tableName) {
    return EMPTY_PK_METADATA;
  }
  let byTable = TABLE_PK_MEMO.get(db);
  if (!byTable) {
    byTable = new Map();
    TABLE_PK_MEMO.set(db, byTable);
  }
  let meta = byTable.get(tableName);
  if (!meta) {
    meta = readTableInfoMetadata(db, tableName);
    byTable.set(tableName, meta);
  }
  return meta;
}

function extractInsertRowKey(sql, params, pkCols, allCols) {
  const match = SQL_INSERT_COLS_RE.exec(sql);
  const cols = match ?
    match[1].split(',').map((c) => c.trim().replace(/^["'`]|["'`]$/gu, '').toLowerCase()) :
    allCols;
  const values = [];
  for (const pkCol of pkCols) {
    const idx = cols.indexOf(pkCol);
    if (idx < 0 || idx >= params.length || params[idx] === undefined) {
      return null;
    }
    values.push(String(params[idx]));
  }
  return values.join(ROW_KEY_SEPARATOR);
}

function extractWhereRowKey(sql, params, pkCols) {
  const whereMatch = SQL_WHERE_SPLIT_RE.exec(sql);
  if (!whereMatch) return null;
  const prefix = sql.slice(0, whereMatch.index);
  let qIndex = (prefix.match(/\?/gu) || []).length;
  const whereClause = sql.slice(whereMatch.index + whereMatch[0].length);
  const equalities = new Map();
  for (const match of whereClause.matchAll(SQL_WHERE_TOKEN_RE)) {
    const col = match[1];
    const placeholder = match[2];
    if (!col) {
      qIndex += 1;
      continue;
    }
    const paramIdx = placeholder === '?' ? qIndex++ : Number(placeholder.slice(1)) - 1;
    if (paramIdx >= 0 && paramIdx < params.length && params[paramIdx] !== undefined) {
      equalities.set(col.toLowerCase(), String(params[paramIdx]));
    }
  }
  const values = [];
  for (const pkCol of pkCols) {
    if (!equalities.has(pkCol)) return null;
    values.push(equalities.get(pkCol));
  }
  return values.join(ROW_KEY_SEPARATOR);
}

function extractStatementCanonicalRowKey(service, params, sql) {
  if (typeof sql === 'string' && sql.length > 0) {
    const {pkCols, allCols} = resolveTablePkMetadata(service);
    if (pkCols.length > 0) {
      const extracted = SQL_INSERT_PREFIX.test(sql) ?
        extractInsertRowKey(sql, params, pkCols, allCols) :
        extractWhereRowKey(sql, params, pkCols);
      if (extracted !== null) {
        return {rowKey: extracted, scoped: true};
      }
      return {rowKey: String(params[0]), scoped: false};
    }
  }
  return {rowKey: String(params[0]), scoped: true};
}

function sessionsOf(service) {
  let sessions = SESSIONS.get(service);
  if (sessions === undefined) {
    sessions = new Map();
    SESSIONS.set(service, sessions);
  }
  return sessions;
}

function isRowKeyConcurrencyEnabled(service) {
  return service?.concurrencyGranularity === GRANULARITY_ROW_KEY ||
    service?.allowConcurrentParticipantSessions === true;
}

function hasPreparingParticipantSession(service) {
  for (const session of SESSIONS.get(service)?.values() ?? []) {
    if (session.phase === PHASE.PREPARING || session.inFlight === true) {
      return true;
    }
  }
  return false;
}

function canAdmitConcurrentParticipantSession(service) {
  return isRowKeyConcurrencyEnabled(service) &&
    !isPartitionReserved(service.db) &&
    !hasPreparingParticipantSession(service);
}

function hasRowKeyConflictWithOtherSession(service, session, rowKey) {
  for (const other of SESSIONS.get(service)?.values() ?? []) {
    if (other !== session &&
        other.phase !== PHASE.DOOMED &&
        other.touchedRowKeys?.has(rowKey)) {
      return true;
    }
  }
  return false;
}

function checkAndRecordSessionRowKey(service, session, params, sql = '') {
  if (!isRowKeyConcurrencyEnabled(service) ||
      !Array.isArray(params) ||
      params.length === 0) {
    return {conflict: false, rowKey: null, alreadyTouchedInSession: false, scoped: false};
  }
  const {rowKey, scoped} = extractStatementCanonicalRowKey(service, params, sql);
  session.hasUnscopedWrite = session.hasUnscopedWrite || !scoped;
  const alreadyTouchedInSession = session.touchedRowKeys?.has(rowKey) === true;
  const conflict = hasRowKeyConflictWithOtherSession(service, session, rowKey);
  if (!conflict) {
    session.touchedRowKeys?.add(rowKey);
  }
  return {conflict, rowKey, alreadyTouchedInSession, scoped};
}

function stagePreparedParticipantRowKeys(
  service,
  participantId,
  touchedRowKeys,
  hasUnscopedWrite = false,
) {
  if (!service || !participantId || !(touchedRowKeys instanceof Set)) return;
  perServiceMap(PREPARED_PARTICIPANT_ROW_KEYS, service).set(participantId, {
    rowKeys: new Set(touchedRowKeys),
    hasUnscopedWrite: Boolean(hasUnscopedWrite),
  });
}

function clearPreparedParticipantRowKeys(service, participantId) {
  if (!service || !participantId) return;
  PREPARED_PARTICIPANT_ROW_KEYS.get(service)?.delete(participantId);
}

function perServiceSet(store, service) {
  let set = store.get(service);
  if (set === undefined) {
    set = new Set();
    store.set(service, set);
  }
  return set;
}

function recordCommittedParticipantRowKeys(service, participantId, generation) {
  if (!service || !participantId) return;
  const preparedMap = PREPARED_PARTICIPANT_ROW_KEYS.get(service);
  const entry = preparedMap?.get(participantId);
  preparedMap?.delete(participantId);
  if (!entry || entry.hasUnscopedWrite || entry.rowKeys.size === 0) {
    return;
  }
  perServiceSet(SCOPED_COMMIT_GENERATIONS, service).add(generation);
  const committedGenMap = perServiceMap(COMMITTED_ROW_KEY_GENERATIONS, service);
  for (const rk of entry.rowKeys) {
    committedGenMap.set(rk, generation);
  }
}

function areIntermediateGenerationsScoped(service, fromGen, toGen) {
  if (toGen === undefined || toGen <= fromGen) return true;
  const scopedGens = SCOPED_COMMIT_GENERATIONS.get(service);
  if (!scopedGens) return false;
  for (let gen = fromGen + 1; gen <= toGen; gen += 1) {
    if (!scopedGens.has(gen)) return false;
  }
  return true;
}

function isRowKeyHeldByOtherPreparedParticipant(preparedMap, selfParticipantId, rk) {
  for (const [otherParticipantId, entry] of preparedMap?.entries() ?? []) {
    if (otherParticipantId !== selfParticipantId &&
        (entry?.hasUnscopedWrite === true || entry?.rowKeys?.has(rk))) {
      return true;
    }
  }
  return false;
}

function isRowKeyTouchedAfterGeneration(service, session, rk) {
  const committedGenMap = COMMITTED_ROW_KEY_GENERATIONS.get(service);
  if ((committedGenMap?.get(rk) ?? 0) > session.generationBase) {
    return true;
  }
  const preparedMap = PREPARED_PARTICIPANT_ROW_KEYS.get(service);
  return isRowKeyHeldByOtherPreparedParticipant(
    preparedMap,
    session.identity?.participantId,
    rk,
  );
}

function isScopedRowKeySession(service, session) {
  return isRowKeyConcurrencyEnabled(service) &&
    session?.hasUnscopedWrite !== true &&
    session?.touchedRowKeys instanceof Set &&
    session.touchedRowKeys.size > 0;
}

function canAdvanceRowKeySessionGeneration(service, session, targetGeneration) {
  if (!isScopedRowKeySession(service, session) ||
      !areIntermediateGenerationsScoped(service, session.generationBase, targetGeneration)) {
    return false;
  }
  for (const rk of session.touchedRowKeys) {
    if (isRowKeyTouchedAfterGeneration(service, session, rk)) {
      return false;
    }
  }
  return true;
}

function reconcilePreparedParticipantRowKeys(service) {
  const preparedMap = PREPARED_PARTICIPANT_ROW_KEYS.get(service);
  if (!preparedMap || preparedMap.size === 0 || service?.db?.open !== true) return;
  const durablePrepared = new Set(readPreparedParticipantIds(service.db));
  for (const participantId of [...preparedMap.keys()]) {
    if (!durablePrepared.has(participantId)) {
      preparedMap.delete(participantId);
    }
  }
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
    compiledOperations: [],
    touchedRowKeys: new Set(),
    hasUnscopedWrite: false,
    bytes: 0,
    generationBase: base.generationBase,
    lastValidatedGeneration: base.generationBase,
    lastValidatedSchemaVersion: null,
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
 * it (participantQueryClassification asks through the collision predicate).
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
 * Whether the current participant owner holds this routing session, either in
 * volatile staging or as a durable PREPARED obligation.
 * @param {Object} service - The partition.
 * @param {*} sessionId - Routing context from a QUERY.
 * @return {boolean} Whether ordinary query routing would collide with TX1.
 */
function participantRoutingSessionCollision(service, sessionId) {
  return typeof sessionId === 'string' && sessionId.length > 0 &&
    (participantSessionNamed(service, sessionId) !== null ||
      isParticipantSessionPrepared(service.db, sessionId));
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
 * Whether the current participant owner holds the partition: volatile
 * staging on this leader, or a durable PREPARED reservation.
 * @param {Object} service - The partition.
 * @return {boolean} Whether TX1 has nonterminal work here.
 */
function participantTransactionActive(service) {
  return hasParticipantSession(service) || isPartitionReserved(service.db);
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
    reconcilePreparedParticipantRowKeys(service);
    return;
  }
  service.logger.info(LOG_MSG.SESSIONS_DISCARDED, {
    partitionId: service.partitionId, sessionCount: sessions.size});
  sessions.clear();
  reconcilePreparedParticipantRowKeys(service);
}

// Discard the sessions held past the hold window (design 4, hold sweep): an
// ACTIVE, DOOMED or sealed session whose PREPARE is not in flight, on any
// role, with no SQL; a PREPARE in flight owns its own commit deadline.
function sweepExpiredParticipantSessions(service, nowMs, holdTimeoutMs) {
  const sessions = SESSIONS.get(service);
  let discarded = 0;
  for (const session of [...(sessions?.values() ?? [])]) {
    if (!session.inFlight && nowMs - session.startedAt >= holdTimeoutMs) {
      if (hasLockingReadReservations(session.identity?.transactionId)) {
        continue;
      }
      sessions.delete(session.identity.participantId);
      discarded += 1;
      service.logger.info(LOG_MSG.SESSION_EXPIRED, {
        partitionId: service.partitionId,
        transactionId: session.identity.transactionId,
        phase: session.phase, heldMs: nowMs - session.startedAt});
    }
  }
  if (discarded > 0) {
    reconcilePreparedParticipantRowKeys(service);
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
  canAdmitConcurrentParticipantSession,
  canAdvanceRowKeySessionGeneration,
  checkAndRecordSessionRowKey,
  clearPreparedParticipantRowKeys,
  discardParticipantSessions,
  endParticipantSession,
  findParticipantSession,
  hasParticipantSession,
  openParticipantSession,
  participantRoutingSessionCollision,
  participantTransactionActive,
  recordCommittedParticipantRowKeys,
  stagePreparedParticipantRowKeys,
  sweepParticipantTransactionHolds,
};
