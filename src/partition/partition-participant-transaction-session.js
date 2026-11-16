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
  PARTICIPANT_CONCURRENCY_GRANULARITY,
  PARTICIPANT_TRANSACTION_LOG_MSG as LOG_MSG,
  PARTICIPANT_TRANSACTION_SESSION_PHASE as PHASE,
} from './partition-participant-transaction-constants.js';
import {
  isParticipantSessionPrepared,
  isPartitionReserved,
  readPreparedParticipantIds,
} from './partition-participant-transaction-store.js';
import {hasLockingReadReservations} from './partition-locking-read-reservation.js';
import {extractStatementWriteFootprint} from './partition-write-footprint-contract.js';

// Per partition service: participantId -> session.
const SESSIONS = new WeakMap();
// Per partition service: participantId -> when the hold sweep first saw it
// PREPARED, and whether that hold was reported.
const PREPARED_HOLDS = new WeakMap();
const TABLE_PK_MEMO = new WeakMap();
const COMMITTED_ROW_KEY_GENERATIONS = new WeakMap();
const PREPARED_PARTICIPANT_ROW_KEYS = new WeakMap();
const SCOPED_COMMIT_GENERATIONS = new WeakMap();

const DEFAULT_CONFLICT_SETTLE_WAIT_MS = 30000;
const MAX_RETAINED_COMMITTED_GENERATIONS = 1024;
const MAX_RETAINED_COMMITTED_ROW_KEYS = 16384;
const UNSCOPED_CONFLICT_SENTINEL = '*';
const EMPTY_PK_METADATA = Object.freeze({
  pkCols: Object.freeze([]),
  allCols: Object.freeze([]),
});

function perServiceMap(store, service) {
  let map = store.get(service);
  if (map === undefined) {
    map = new Map();
    store.set(service, map);
  }
  return map;
}

function perServiceSet(store, service) {
  let set = store.get(service);
  if (set === undefined) {
    set = new Set();
    store.set(service, set);
  }
  return set;
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

function sessionsOf(service) {
  let sessions = SESSIONS.get(service);
  if (sessions === undefined) {
    sessions = new Map();
    SESSIONS.set(service, sessions);
  }
  return sessions;
}

function isRowKeyConcurrencyEnabled(service) {
  return service?.concurrencyGranularity ===
    PARTICIPANT_CONCURRENCY_GRANULARITY.ROW_KEY;
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

function isRowKeyHeldByOtherPreparedParticipant(preparedMap, selfParticipantId, rk) {
  for (const [otherParticipantId, entry] of preparedMap?.entries() ?? []) {
    if (otherParticipantId !== selfParticipantId &&
        (entry?.hasUnscopedWrite === true || entry?.rowKeys?.has(rk))) {
      return true;
    }
  }
  return false;
}

function hasAnyActiveOrPreparedWriteByOther(service, session) {
  for (const other of SESSIONS.get(service)?.values() ?? []) {
    if (other !== session &&
        other.phase !== PHASE.DOOMED &&
        (other.hasUnscopedWrite === true || (other.touchedRowKeys?.size ?? 0) > 0)) {
      return true;
    }
  }
  const preparedMap = PREPARED_PARTICIPANT_ROW_KEYS.get(service);
  const selfParticipantId = session?.identity?.participantId;
  for (const [otherParticipantId, entry] of preparedMap?.entries() ?? []) {
    if (otherParticipantId !== selfParticipantId &&
        (entry?.hasUnscopedWrite === true || (entry?.rowKeys?.size ?? 0) > 0)) {
      return true;
    }
  }
  return false;
}

function hasRowKeyConflictWithOtherSession(service, session, rowKey) {
  if (rowKey === UNSCOPED_CONFLICT_SENTINEL) {
    return hasAnyActiveOrPreparedWriteByOther(service, session);
  }
  for (const other of SESSIONS.get(service)?.values() ?? []) {
    if (other !== session &&
        other.phase !== PHASE.DOOMED &&
        (other.hasUnscopedWrite === true || other.touchedRowKeys?.has(rowKey))) {
      return true;
    }
  }
  const preparedMap = PREPARED_PARTICIPANT_ROW_KEYS.get(service);
  return isRowKeyHeldByOtherPreparedParticipant(
    preparedMap,
    session?.identity?.participantId,
    rowKey,
  );
}

function rowKeySettlementWaitersOf(service) {
  if (!(service._rowKeySettlementWaiters instanceof Set)) {
    service._rowKeySettlementWaiters = new Set();
  }
  return service._rowKeySettlementWaiters;
}

function notifyRowKeySettlementWaiters(service) {
  const waiters = service?._rowKeySettlementWaiters;
  if (!(waiters instanceof Set) || waiters.size === 0) {
    return;
  }
  for (const waiter of [...waiters]) {
    if (!hasRowKeyConflictWithOtherSession(service, waiter.session, waiter.rowKey)) {
      waiters.delete(waiter);
      waiter.resolve();
    }
  }
}

function waitForConflictingRowKeyHolderToSettle(
  service,
  payload,
  rowKey,
  timeoutMs = DEFAULT_CONFLICT_SETTLE_WAIT_MS,
) {
  if (!isRowKeyConcurrencyEnabled(service) ||
      !service?.cdcIntegrationService ||
      typeof rowKey !== 'string' ||
      rowKey.length === 0) {
    return Promise.resolve();
  }
  const session = findParticipantSession(service, {
    transactionId: payload?.transactionId,
    participantId: payload?.participantId,
  });
  if (!hasRowKeyConflictWithOtherSession(service, session, rowKey)) {
    return Promise.resolve();
  }
  if (session?.touchedRowKeys instanceof Set && session.touchedRowKeys.size > 0) {
    session.touchedRowKeys.clear();
    notifyRowKeySettlementWaiters(service);
  }
  if (session && session.operations?.length === 0 && session.hasUnscopedWrite === true) {
    session.hasUnscopedWrite = false;
    notifyRowKeySettlementWaiters(service);
  }
  const boundedWaitMs = Math.max(1, Math.min(timeoutMs, DEFAULT_CONFLICT_SETTLE_WAIT_MS));
  return /** @type {Promise<void>} */ (new Promise((resolve) => {
    const waiters = rowKeySettlementWaitersOf(service);
    /** @type {ReturnType<typeof setTimeout> | null} */
    let timer = null;
    const waiter = {
      session,
      rowKey,
      resolve() {
        if (timer !== null) {
          clearTimeout(timer);
          timer = null;
        }
        waiters.delete(waiter);
        resolve(undefined);
      },
    };
    waiters.add(waiter);
    timer = setTimeout(() => {
      waiter.resolve();
    }, boundedWaitMs);
  }));
}

function findConflictingScopedRowKey(service, session, rowKeys) {
  for (let i = 0; i < rowKeys.length; i += 1) {
    const rk = rowKeys[i];
    if (hasRowKeyConflictWithOtherSession(service, session, rk)) {
      return rk;
    }
  }
  return null;
}

function recordScopedSessionFootprint(service, session, rowKeys) {
  const conflictingRk = findConflictingScopedRowKey(service, session, rowKeys);
  if (conflictingRk !== null) {
    return {
      conflict: true,
      rowKey: conflictingRk,
      alreadyTouchedInSession: false,
      scoped: true,
      addedRowKeys: [],
      setUnscopedWrite: false,
    };
  }
  const alreadyTouchedInSession = rowKeys.some(
    (rk) => session.touchedRowKeys?.has(rk) === true,
  );
  const addedRowKeys = [];
  for (let i = 0; i < rowKeys.length; i += 1) {
    const rk = rowKeys[i];
    if (session.touchedRowKeys && !session.touchedRowKeys.has(rk)) {
      session.touchedRowKeys.add(rk);
      addedRowKeys.push(rk);
    }
  }
  return {
    conflict: false,
    rowKey: rowKeys[0],
    alreadyTouchedInSession,
    scoped: true,
    addedRowKeys,
    setUnscopedWrite: false,
  };
}

function recordUnscopedSessionFootprint(service, session) {
  const conflict = hasRowKeyConflictWithOtherSession(
    service,
    session,
    UNSCOPED_CONFLICT_SENTINEL,
  );
  const priorUnscoped = Boolean(session.hasUnscopedWrite);
  if (!conflict) {
    session.hasUnscopedWrite = true;
  }
  return {
    conflict,
    rowKey: conflict ? UNSCOPED_CONFLICT_SENTINEL : null,
    alreadyTouchedInSession: false,
    scoped: false,
    addedRowKeys: [],
    setUnscopedWrite: !conflict && !priorUnscoped,
  };
}

function revertSessionRowKeyCheck(service, session, rowKeyCheck) {
  if (!session || !rowKeyCheck || rowKeyCheck.conflict) return;
  let changed = false;
  if (rowKeyCheck.setUnscopedWrite === true) {
    session.hasUnscopedWrite = false;
    changed = true;
  }
  if (Array.isArray(rowKeyCheck.addedRowKeys) && session.touchedRowKeys instanceof Set) {
    for (let i = 0; i < rowKeyCheck.addedRowKeys.length; i += 1) {
      if (session.touchedRowKeys.delete(rowKeyCheck.addedRowKeys[i])) {
        changed = true;
      }
    }
  }
  if (changed) {
    notifyRowKeySettlementWaiters(service);
  }
}

function checkAndRecordSessionRowKey(service, session, params, sql = '') {
  if (!isRowKeyConcurrencyEnabled(service)) {
    return {
      conflict: false,
      rowKey: null,
      alreadyTouchedInSession: false,
      scoped: false,
      addedRowKeys: [],
      setUnscopedWrite: false,
    };
  }
  const {pkCols, allCols} = resolveTablePkMetadata(service);
  const footprint = extractStatementWriteFootprint({
    sql,
    params: Array.isArray(params) ? params : [],
    pkCols,
    allCols,
  });
  if (!footprint.scoped || footprint.rowKeys.length === 0) {
    return recordUnscopedSessionFootprint(service, session);
  }
  return recordScopedSessionFootprint(service, session, footprint.rowKeys);
}

function findMinActiveGenerationBase(service) {
  let minGen = Infinity;
  for (const session of SESSIONS.get(service)?.values() ?? []) {
    if (typeof session?.generationBase === 'number' && session.generationBase < minGen) {
      minGen = session.generationBase;
    }
  }
  for (const entry of PREPARED_PARTICIPANT_ROW_KEYS.get(service)?.values() ?? []) {
    const base = typeof entry?.generationBase === 'number' ? entry.generationBase : 0;
    if (base < minGen) {
      minGen = base;
    }
  }
  return minGen;
}

function evictExcessGenerations(scopedGens, committedGenMap) {
  if (!scopedGens || scopedGens.size <= MAX_RETAINED_COMMITTED_GENERATIONS) {
    return;
  }
  const sorted = [...scopedGens].sort((a, b) => a - b);
  const evictCount = scopedGens.size - MAX_RETAINED_COMMITTED_GENERATIONS;
  const highestEvicted = sorted[evictCount - 1];
  for (let i = 0; i < evictCount; i += 1) {
    scopedGens.delete(sorted[i]);
  }
  if (committedGenMap) {
    for (const [rk, gen] of [...committedGenMap.entries()]) {
      if (gen <= highestEvicted) {
        committedGenMap.delete(rk);
      }
    }
  }
}

function evictExcessRowKeys(scopedGens, committedGenMap) {
  if (!committedGenMap || committedGenMap.size <= MAX_RETAINED_COMMITTED_ROW_KEYS) {
    return;
  }
  while (committedGenMap.size > MAX_RETAINED_COMMITTED_ROW_KEYS) {
    let lowestGen = Infinity;
    for (const gen of scopedGens ?? []) {
      if (gen < lowestGen) {
        lowestGen = gen;
      }
    }
    if (lowestGen < Infinity && scopedGens) {
      scopedGens.delete(lowestGen);
      for (const [rk, gen] of [...committedGenMap.entries()]) {
        if (gen <= lowestGen) {
          committedGenMap.delete(rk);
        }
      }
    } else {
      const oldestKey = committedGenMap.keys().next().value;
      if (oldestKey === undefined) break;
      committedGenMap.delete(oldestKey);
    }
  }
}

function pruneRetainedRowKeyHistory(service) {
  if (!service) return;
  const scopedGens = SCOPED_COMMIT_GENERATIONS.get(service);
  const committedGenMap = COMMITTED_ROW_KEY_GENERATIONS.get(service);
  if ((!scopedGens || scopedGens.size === 0) &&
      (!committedGenMap || committedGenMap.size === 0)) {
    return;
  }
  const minGen = findMinActiveGenerationBase(service);
  if (minGen === Infinity) {
    scopedGens?.clear();
    committedGenMap?.clear();
    return;
  }
  if (scopedGens) {
    for (const gen of [...scopedGens]) {
      if (gen <= minGen) {
        scopedGens.delete(gen);
      }
    }
  }
  if (committedGenMap) {
    for (const [rk, gen] of [...committedGenMap.entries()]) {
      if (gen <= minGen) {
        committedGenMap.delete(rk);
      }
    }
  }
  evictExcessGenerations(scopedGens, committedGenMap);
  evictExcessRowKeys(scopedGens, committedGenMap);
}

function getRetainedRowKeyHistoryStats(service) {
  return {
    scopedGenerationCount: SCOPED_COMMIT_GENERATIONS.get(service)?.size ?? 0,
    committedRowKeyCount: COMMITTED_ROW_KEY_GENERATIONS.get(service)?.size ?? 0,
    preparedParticipantCount: PREPARED_PARTICIPANT_ROW_KEYS.get(service)?.size ?? 0,
  };
}

function stagePreparedParticipantRowKeys(
  service,
  participantId,
  touchedRowKeys,
  hasUnscopedWrite = false,
) {
  if (!service || !participantId || !(touchedRowKeys instanceof Set)) return;
  const session = SESSIONS.get(service)?.get(participantId);
  perServiceMap(PREPARED_PARTICIPANT_ROW_KEYS, service).set(participantId, {
    rowKeys: new Set(touchedRowKeys),
    hasUnscopedWrite: Boolean(hasUnscopedWrite),
    generationBase: session?.generationBase ?? 0,
  });
}

function clearPreparedParticipantRowKeys(service, participantId) {
  if (!service || !participantId) return;
  PREPARED_PARTICIPANT_ROW_KEYS.get(service)?.delete(participantId);
  pruneRetainedRowKeyHistory(service);
  notifyRowKeySettlementWaiters(service);
}

function recordCommittedParticipantRowKeys(service, participantId, generation) {
  if (!service || !participantId) return;
  const preparedMap = PREPARED_PARTICIPANT_ROW_KEYS.get(service);
  const entry = preparedMap?.get(participantId);
  preparedMap?.delete(participantId);
  if (!entry || entry.hasUnscopedWrite || entry.rowKeys.size === 0) {
    pruneRetainedRowKeyHistory(service);
    notifyRowKeySettlementWaiters(service);
    return;
  }
  perServiceSet(SCOPED_COMMIT_GENERATIONS, service).add(generation);
  const committedGenMap = perServiceMap(COMMITTED_ROW_KEY_GENERATIONS, service);
  for (const rk of entry.rowKeys) {
    committedGenMap.set(rk, generation);
  }
  pruneRetainedRowKeyHistory(service);
  notifyRowKeySettlementWaiters(service);
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
 * @param {any} service - The partition (its leader).
 * @param {any} identity - {sessionId, transactionId, participantId,
 *   commitMode, transactionEpoch} of the BEGIN.
 * @param {any} base - {generationBase, originIndex}: the write generation
 *   read at BEGIN and the origin it counts from (design 3.2, 0.0.13).
 * @return {any} The session.
 */
function openParticipantSession(service, identity, base) {
  const session = {
    identity: Object.freeze({...identity}),
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
 * @param {any} service - The partition.
 * @param {{transactionId?: string, participantId?: string}} request - Identity.
 * @return {any} The session.
 */
function findParticipantSession(service, {transactionId, participantId}) {
  if (!participantId) return null;
  const session = SESSIONS.get(service)?.get(participantId) ?? null;
  return session?.identity.transactionId === transactionId ? session : null;
}

/**
 * The session a routing sessionId names, if a participant transaction holds
 * it (participantQueryClassification asks through the collision predicate).
 * @param {any} service - The partition.
 * @param {string} sessionId - A routing sessionId.
 * @return {any} The session.
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
 * @param {any} service - The partition.
 * @param {any} sessionId - Routing context from a QUERY.
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
 * @param {any} service - The partition.
 * @return {boolean} Whether a session stages, prepares or is doomed here.
 */
function hasParticipantSession(service) {
  return (SESSIONS.get(service)?.size ?? 0) > 0;
}

/**
 * Whether the current participant owner holds the partition: volatile
 * staging on this leader, or a durable PREPARED reservation.
 * @param {any} service - The partition.
 * @return {boolean} Whether TX1 has nonterminal work here.
 */
function participantTransactionActive(service) {
  return hasParticipantSession(service) || isPartitionReserved(service.db);
}

/**
 * End one session (its transaction was decided, refused or discarded).
 * @param {any} service - The partition.
 * @param {any} session - The session.
 */
function endParticipantSession(service, session) {
  const sessions = SESSIONS.get(service);
  if (sessions?.get(session.identity.participantId) === session) {
    sessions.delete(session.identity.participantId);
    pruneRetainedRowKeyHistory(service);
    notifyRowKeySettlementWaiters(service);
  }
}

/**
 * Discard every session: this replica stopped leading (the demotion hook;
 * nothing durable or connection-bound is held, so nothing is healed).
 * @param {any} service - The partition.
 */
function discardParticipantSessions(service) {
  const sessions = SESSIONS.get(service);
  SCOPED_COMMIT_GENERATIONS.get(service)?.clear();
  COMMITTED_ROW_KEY_GENERATIONS.get(service)?.clear();
  if (sessions === undefined || sessions.size === 0) {
    reconcilePreparedParticipantRowKeys(service);
    pruneRetainedRowKeyHistory(service);
    notifyRowKeySettlementWaiters(service);
    return;
  }
  service.logger.info(LOG_MSG.SESSIONS_DISCARDED, {
    partitionId: service.partitionId, sessionCount: sessions.size});
  sessions.clear();
  reconcilePreparedParticipantRowKeys(service);
  pruneRetainedRowKeyHistory(service);
  notifyRowKeySettlementWaiters(service);
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
      sessions?.delete(session.identity.participantId);
      discarded += 1;
      service.logger.info(LOG_MSG.SESSION_EXPIRED, {
        partitionId: service.partitionId,
        transactionId: session.identity.transactionId,
        phase: session.phase, heldMs: nowMs - session.startedAt});
    }
  }
  if (discarded > 0) {
    reconcilePreparedParticipantRowKeys(service);
    pruneRetainedRowKeyHistory(service);
    notifyRowKeySettlementWaiters(service);
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
 * @param {any} service - The partition (its hold window,
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
  getRetainedRowKeyHistoryStats,
  hasParticipantSession,
  notifyRowKeySettlementWaiters,
  openParticipantSession,
  participantRoutingSessionCollision,
  participantTransactionActive,
  pruneRetainedRowKeyHistory,
  recordCommittedParticipantRowKeys,
  revertSessionRowKeyCheck,
  stagePreparedParticipantRowKeys,
  sweepParticipantTransactionHolds,
  waitForConflictingRowKeyHolderToSettle,
};
