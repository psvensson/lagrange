// Public entry: openParticipantSession, checkAndRecordSessionRowKey, isPartitionReservedForPrepare, canAdvanceCommittedValidationText, inspectRetainedPreparedObligations, stagePreparedParticipantRowKeys, recordCommittedParticipantRowKeys, recordCommittedAutocommitRowKeys, discardParticipantSessions, resetParticipantRowKeyHistory, sweepParticipantTransactionHolds.
// Required collaborators: partition-participant-transaction-store.js and partition-write-footprint-contract.js.
// Durable authority / commit point: _participant_transactions, _partition_write_generation and _partition_write_generation_history in SQLite.
// Permitted post-commit work: volatile staging session lifecycle, hold sweep reporting, and settlement waiter notifications.
// Recovery / wake entry: hydrateDurablePreparedAndCommittedState on reopen and resetParticipantRowKeyHistory on afterRollback.
// Representative production tests: test/query/scenario-a-transaction-coordination-fast-path.test.js, test/partition/partition-participant-transaction-apply.test.js.
import {
  PARTICIPANT_CONCURRENCY_GRANULARITY, PARTICIPANT_TRANSACTION_LOG_MSG as LOG_MSG,
  PARTICIPANT_TRANSACTION_SESSION_PHASE as PHASE,
} from './partition-participant-transaction-constants.js';
import {operationsOf, validationTextOf} from './partition-participant-transaction-bytes.js';
import {
  isParticipantSessionPrepared, isPartitionReserved,
  readDurablePrepareGeneration, readOrReconstructGenerationHistoryRange,
  readPartitionWriteGeneration, readPartitionWriteOrigin,
  readPreparedParticipantIds, readPreparedParticipantRows, readTableFootprintMetadata,
  recordPartitionWriteGenerationFootprint,
} from './partition-participant-transaction-store.js';
import {hasLockingReadReservations} from './partition-locking-read-reservation.js';
import {hasDbTransactionReservations} from './partition-locking-read-store.js';
import {extractStatementWriteFootprint} from './partition-write-footprint-contract.js';

// Per partition service: participantId -> session.
const SESSIONS = new WeakMap();
// Per partition service: participantId -> when the hold sweep first saw it
// PREPARED, and whether that hold was reported.
const PREPARED_HOLDS = new WeakMap();
const COMMITTED_ROW_KEY_GENERATIONS = new WeakMap();
const PREPARED_PARTICIPANT_ROW_KEYS = new WeakMap();
const SCOPED_COMMIT_GENERATIONS = new WeakMap();

const DEFAULT_CONFLICT_SETTLE_WAIT_MS = 30000;
const MAX_RETAINED_COMMITTED_GENERATIONS = 1024;
const MAX_RETAINED_COMMITTED_ROW_KEYS = 16384;
const UNSCOPED_CONFLICT_SENTINEL = '*';

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

const resolveTablePkMetadata = (service) =>
  readTableFootprintMetadata(service?.db, service?.tableName);
const sessionsOf = (service) => perServiceMap(SESSIONS, service);
const isRowKeyConcurrencyEnabled = (service) =>
  service?.concurrencyGranularity === PARTICIPANT_CONCURRENCY_GRANULARITY.ROW_KEY;
const canAdmitConcurrentParticipantSession = (service) => isRowKeyConcurrencyEnabled(service);

function isRowKeyHeldByOtherPreparedParticipant(preparedMap, selfParticipantId, rk) {
  for (const [otherParticipantId, entry] of preparedMap?.entries() ?? []) {
    if (otherParticipantId !== selfParticipantId &&
        (entry?.hasUnscopedWrite === true || entry?.rowKeys?.has(rk))) {
      return true;
    }
  }
  return false;
}

function hasSessionWriteFootprint(other) {
  const hasRowKeys = Boolean(other.touchedRowKeys && other.touchedRowKeys.size > 0);
  return other.phase !== PHASE.DOOMED && (other.hasUnscopedWrite === true || hasRowKeys);
}

function hasPreparedEntryWriteFootprint(entry) {
  return Boolean(entry) &&
    (entry.hasUnscopedWrite === true || Boolean(entry.rowKeys && entry.rowKeys.size > 0));
}

function hasAnyActiveOrPreparedWriteByOther(service, session) {
  for (const other of SESSIONS.get(service)?.values() ?? []) {
    if (other !== session && hasSessionWriteFootprint(other)) return true;
  }
  const preparedMap = PREPARED_PARTICIPANT_ROW_KEYS.get(service);
  if (!preparedMap) return false;
  const selfParticipantId = session ? session.identity.participantId : null;
  for (const [otherParticipantId, entry] of preparedMap.entries()) {
    if (otherParticipantId !== selfParticipantId && hasPreparedEntryWriteFootprint(entry)) {
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
    if (other !== session && other.phase !== PHASE.DOOMED &&
        (other.hasUnscopedWrite === true || other.touchedRowKeys?.has(rowKey))) {
      return true;
    }
  }
  return isRowKeyHeldByOtherPreparedParticipant(
    PREPARED_PARTICIPANT_ROW_KEYS.get(service), session?.identity?.participantId, rowKey);
}

function rowKeySettlementWaitersOf(service) {
  if (!(service._rowKeySettlementWaiters instanceof Set)) {
    service._rowKeySettlementWaiters = new Set();
  }
  return service._rowKeySettlementWaiters;
}

function notifyRowKeySettlementWaiters(service) {
  const waiters = service?._rowKeySettlementWaiters;
  if (!(waiters instanceof Set) || waiters.size === 0) return;
  for (const waiter of [...waiters]) {
    if (!hasRowKeyConflictWithOtherSession(service, waiter.session, waiter.rowKey)) {
      waiters.delete(waiter);
      waiter.resolve();
    }
  }
}

function releaseEmptyWaiterSessionClaims(service, session) {
  if (!session || (Array.isArray(session.operations) && session.operations.length > 0)) return;
  let changed = false;
  if (session.touchedRowKeys instanceof Set && session.touchedRowKeys.size > 0) {
    session.touchedRowKeys.clear();
    changed = true;
  }
  if (session.hasUnscopedWrite === true) {
    session.hasUnscopedWrite = false;
    changed = true;
  }
  if (changed) notifyRowKeySettlementWaiters(service);
}

function waitForConflictingRowKeyHolderToSettle(
  service, payload, rowKey, timeoutMs = DEFAULT_CONFLICT_SETTLE_WAIT_MS,
) {
  if (!isRowKeyConcurrencyEnabled(service) || !service.cdcIntegrationService ||
      typeof rowKey !== 'string' || rowKey.length === 0) {
    return Promise.resolve();
  }
  hydrateDurablePreparedAndCommittedState(service);
  const session = findParticipantSession(service, {
    transactionId: payload?.transactionId, participantId: payload?.participantId,
  });
  if (!hasRowKeyConflictWithOtherSession(service, session, rowKey)) return Promise.resolve();
  releaseEmptyWaiterSessionClaims(service, session);
  const boundedWaitMs = Math.max(1, Math.min(timeoutMs, DEFAULT_CONFLICT_SETTLE_WAIT_MS));
  return new Promise((resolve) => {
    const waiters = rowKeySettlementWaitersOf(service);
    let timer = null;
    const waiter = {session, rowKey, resolve() {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      waiters.delete(waiter);
      resolve(undefined);
    }};
    waiters.add(waiter);
    timer = setTimeout(() => waiter.resolve(), boundedWaitMs);
  });
}

function findConflictingScopedRowKey(service, session, rowKeys) {
  for (let i = 0; i < rowKeys.length; i += 1) {
    if (hasRowKeyConflictWithOtherSession(service, session, rowKeys[i])) return rowKeys[i];
  }
  return null;
}

function recordScopedSessionFootprint(service, session, rowKeys) {
  const conflictingRk = findConflictingScopedRowKey(service, session, rowKeys);
  if (conflictingRk !== null) {
    return {conflict: true, rowKey: conflictingRk, alreadyTouchedInSession: false,
      scoped: true, addedRowKeys: [], setUnscopedWrite: false};
  }
  const alreadyTouchedInSession = session.hasUnscopedWrite === true ||
    rowKeys.some((rk) => session.touchedRowKeys?.has(rk) === true);
  const addedRowKeys = [];
  for (let i = 0; i < rowKeys.length; i += 1) {
    const rk = rowKeys[i];
    if (session.touchedRowKeys && !session.touchedRowKeys.has(rk)) {
      session.touchedRowKeys.add(rk);
      addedRowKeys.push(rk);
    }
  }
  return {conflict: false, rowKey: rowKeys[0], alreadyTouchedInSession,
    scoped: true, addedRowKeys, setUnscopedWrite: false};
}

function recordUnscopedSessionFootprint(service, session) {
  const conflict = hasRowKeyConflictWithOtherSession(service, session, UNSCOPED_CONFLICT_SENTINEL);
  const priorUnscoped = Boolean(session.hasUnscopedWrite);
  if (!conflict) session.hasUnscopedWrite = true;
  return {conflict, rowKey: conflict ? UNSCOPED_CONFLICT_SENTINEL : null,
    alreadyTouchedInSession: false, scoped: false, addedRowKeys: [],
    setUnscopedWrite: !conflict && !priorUnscoped};
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
      if (session.touchedRowKeys.delete(rowKeyCheck.addedRowKeys[i])) changed = true;
    }
  }
  if (changed) notifyRowKeySettlementWaiters(service);
}

function checkAndRecordSessionRowKey(service, session, params, sql = '') {
  if (!isRowKeyConcurrencyEnabled(service)) {
    return {conflict: false, rowKey: null, alreadyTouchedInSession: false,
      scoped: false, addedRowKeys: [], setUnscopedWrite: false};
  }
  hydrateDurablePreparedAndCommittedState(service);
  const {pkCols, allCols, uniqueConstraintCols, hasUnscopedSchemaConstraints} =
    resolveTablePkMetadata(service);
  const footprint = extractStatementWriteFootprint({
    sql, params: Array.isArray(params) ? params : [],
    pkCols, allCols, uniqueConstraintCols, hasUnscopedSchemaConstraints,
  });
  if (!footprint.scoped || footprint.rowKeys.length === 0) {
    return recordUnscopedSessionFootprint(service, session);
  }
  return recordScopedSessionFootprint(service, session, footprint.rowKeys);
}

function extractOperationsRowKeyFootprint(service, operations) {
  if (!isRowKeyConcurrencyEnabled(service) || !Array.isArray(operations)) {
    return {scoped: false, rowKeys: new Set(), hasUnscopedWrite: true};
  }
  if (operations.length === 0) return {scoped: true, rowKeys: new Set(), hasUnscopedWrite: false};
  const {pkCols, allCols, uniqueConstraintCols, hasUnscopedSchemaConstraints} =
    resolveTablePkMetadata(service);
  const rowKeys = new Set();
  for (let i = 0; i < operations.length; i += 1) {
    const op = operations[i];
    const fp = extractStatementWriteFootprint({
      sql: op?.sql, params: Array.isArray(op?.params) ? op.params : [],
      pkCols, allCols, uniqueConstraintCols, hasUnscopedSchemaConstraints,
    });
    if (!fp.scoped || fp.rowKeys.length === 0) {
      return {scoped: false, rowKeys: new Set(), hasUnscopedWrite: true};
    }
    for (let j = 0; j < fp.rowKeys.length; j += 1) rowKeys.add(fp.rowKeys[j]);
  }
  return {scoped: true, rowKeys, hasUnscopedWrite: false};
}

function resolveExactValidationBaseGeneration(service, validationText) {
  if (typeof validationText !== 'string' || service?.db?.open !== true) return null;
  const origin = readPartitionWriteOrigin(service.db);
  if (origin === null) return null;
  for (let gen = readPartitionWriteGeneration(service.db); gen >= 0; gen -= 1) {
    if (validationText === validationTextOf(gen, service.partitionId, origin.originIndex)) {
      return gen;
    }
  }
  return null;
}

function applyHydratedGenerationRow(row, expectedGen, scopedGens, committedGenMap) {
  const gen = Number(row.generation);
  if (gen !== expectedGen || Number(row.scoped) !== 1) return false;
  const keys = JSON.parse(row.row_keys_text);
  if (!Array.isArray(keys) || keys.length === 0) return false;
  scopedGens.add(gen);
  for (const rk of keys) {
    if ((committedGenMap.get(rk) ?? 0) < gen) committedGenMap.set(rk, gen);
  }
  return true;
}

function hydrateCommittedHistoryFromStore(service, minGen, currentGen) {
  const delta = currentGen - minGen;
  if (delta <= 0 || service?.db?.open !== true) return false;
  const rows = readOrReconstructGenerationHistoryRange(service.db, minGen, currentGen,
    (opsText) => extractOperationsRowKeyFootprint(service, operationsOf(opsText)));
  if (rows.length !== delta) return false;
  const scopedGens = perServiceSet(SCOPED_COMMIT_GENERATIONS, service);
  const committedGenMap = perServiceMap(COMMITTED_ROW_KEY_GENERATIONS, service);
  for (let idx = 0; idx < rows.length; idx += 1) {
    if (!applyHydratedGenerationRow(rows[idx], minGen + idx + 1, scopedGens, committedGenMap)) {
      return false;
    }
  }
  return true;
}

function getOrBuildPreparedEntry(service, preparedMap, row) {
  let entry = preparedMap.get(row.participantId);
  if (entry) return entry;
  const opsFp = extractOperationsRowKeyFootprint(service, operationsOf(row.operationsText));
  const baseGen = resolveExactValidationBaseGeneration(service, row.validationText) ?? 0;
  const prepareGen = Math.max(
    baseGen,
    readDurablePrepareGeneration(service.db, row.prepareIndex),
  );
  entry = {rowKeys: new Set(opsFp.rowKeys), hasUnscopedWrite: Boolean(opsFp.hasUnscopedWrite),
    generationBase: baseGen, validatedThroughGeneration: prepareGen};
  preparedMap.set(row.participantId, entry);
  return entry;
}

function hydrateDurablePreparedAndCommittedState(service) {
  if (!isRowKeyConcurrencyEnabled(service) || service?.db?.open !== true) return;
  const durableRows = readPreparedParticipantRows(service.db);
  if (durableRows.length === 0) return;
  const preparedMap = perServiceMap(PREPARED_PARTICIPANT_ROW_KEYS, service);
  const currentGen = readPartitionWriteGeneration(service.db);
  let minMissingBase = Infinity;
  for (const row of durableRows) {
    const entry = getOrBuildPreparedEntry(service, preparedMap, row);
    const verifiedFrom = Math.max(entry.generationBase, entry.validatedThroughGeneration);
    if (verifiedFrom < currentGen &&
        !areIntermediateGenerationsScoped(service, verifiedFrom, currentGen)) {
      minMissingBase = Math.min(minMissingBase, verifiedFrom);
    }
  }
  if (minMissingBase < Infinity) {
    hydrateCommittedHistoryFromStore(service, minMissingBase, currentGen);
  }
}

function isPreparedEntryConflicting(entry, rowKeys, hasUnscopedWrite) {
  if (!entry || entry.hasUnscopedWrite === true || hasUnscopedWrite === true) return true;
  for (const rk of rowKeys ?? []) {
    if (entry.rowKeys?.has(rk)) return true;
  }
  return false;
}

function isPartitionReservedForPrepare(
  service, selfParticipantId, rowKeys, hasUnscopedWrite = false,
) {
  if (!isPartitionReserved(service.db)) return false;
  if (!isRowKeyConcurrencyEnabled(service)) return true;
  hydrateDurablePreparedAndCommittedState(service);
  const preparedIds = readPreparedParticipantIds(service.db);
  const preparedMap = PREPARED_PARTICIPANT_ROW_KEYS.get(service);
  return preparedIds.some((otherId) => otherId !== selfParticipantId &&
    isPreparedEntryConflicting(preparedMap?.get(otherId), rowKeys, hasUnscopedWrite));
}

function findMinActiveGenerationBase(service) {
  let minGen = Infinity;
  for (const session of SESSIONS.get(service)?.values() ?? []) {
    if (typeof session.generationBase === 'number' && session.generationBase < minGen) {
      minGen = session.generationBase;
    }
  }
  for (const entry of PREPARED_PARTICIPANT_ROW_KEYS.get(service)?.values() ?? []) {
    const base = typeof entry.generationBase === 'number' ? entry.generationBase : 0;
    if (base < minGen) minGen = base;
  }
  return minGen;
}

function isEntryDisjointFromCommittedMap(entry, committedGenMap) {
  if (!committedGenMap) return true;
  for (const rk of entry.rowKeys ?? []) {
    if ((committedGenMap.get(rk) ?? 0) > entry.generationBase) return false;
  }
  return true;
}

function advancePreparedValidationBeforeEviction(service, maxEvictedGen) {
  const preparedMap = PREPARED_PARTICIPANT_ROW_KEYS.get(service);
  if (!preparedMap || preparedMap.size === 0) return;
  const committedGenMap = COMMITTED_ROW_KEY_GENERATIONS.get(service);
  for (const entry of preparedMap.values()) {
    if (entry.hasUnscopedWrite) continue;
    const fromGen = Math.max(entry.generationBase,
      entry.validatedThroughGeneration ?? entry.generationBase);
    if (maxEvictedGen > fromGen &&
        areIntermediateGenerationsScoped(service, fromGen, maxEvictedGen) &&
        isEntryDisjointFromCommittedMap(entry, committedGenMap)) {
      entry.validatedThroughGeneration = maxEvictedGen;
    }
  }
}

function deleteCommittedRowKeysAtOrBelow(committedGenMap, maxGen) {
  if (!committedGenMap) return;
  for (const [rk, gen] of [...committedGenMap.entries()]) {
    if (gen <= maxGen) committedGenMap.delete(rk);
  }
}

function findLowestGeneration(scopedGens) {
  let lowestGen = Infinity;
  for (const gen of scopedGens ?? []) {
    if (gen < lowestGen) lowestGen = gen;
  }
  return lowestGen;
}

function evictExcessGenerations(service, scopedGens, committedGenMap) {
  if (!scopedGens || scopedGens.size <= MAX_RETAINED_COMMITTED_GENERATIONS) return;
  const sorted = [...scopedGens].sort((a, b) => a - b);
  const evictCount = scopedGens.size - MAX_RETAINED_COMMITTED_GENERATIONS;
  const highestEvicted = sorted[evictCount - 1];
  advancePreparedValidationBeforeEviction(service, highestEvicted);
  for (let i = 0; i < evictCount; i += 1) scopedGens.delete(sorted[i]);
  deleteCommittedRowKeysAtOrBelow(committedGenMap, highestEvicted);
}

function evictExcessRowKeys(service, scopedGens, committedGenMap) {
  if (!committedGenMap || committedGenMap.size <= MAX_RETAINED_COMMITTED_ROW_KEYS) return;
  while (committedGenMap.size > MAX_RETAINED_COMMITTED_ROW_KEYS) {
    const lowestGen = findLowestGeneration(scopedGens);
    if (lowestGen < Infinity && scopedGens) {
      advancePreparedValidationBeforeEviction(service, lowestGen);
      scopedGens.delete(lowestGen);
      deleteCommittedRowKeysAtOrBelow(committedGenMap, lowestGen);
    } else {
      const oldestKey = committedGenMap.keys().next().value;
      if (oldestKey === undefined) break;
      committedGenMap.delete(oldestKey);
    }
  }
}

function pruneEntriesBelowMinGen(scopedGens, committedGenMap, minGen) {
  if (scopedGens) {
    for (const gen of [...scopedGens]) {
      if (gen <= minGen) scopedGens.delete(gen);
    }
  }
  deleteCommittedRowKeysAtOrBelow(committedGenMap, minGen);
}

function pruneRetainedRowKeyHistory(service) {
  if (!service) return;
  hydrateDurablePreparedAndCommittedState(service);
  const scopedGens = SCOPED_COMMIT_GENERATIONS.get(service);
  const committedGenMap = COMMITTED_ROW_KEY_GENERATIONS.get(service);
  const hasScoped = Boolean(scopedGens && scopedGens.size > 0);
  const hasCommitted = Boolean(committedGenMap && committedGenMap.size > 0);
  if (!hasScoped && !hasCommitted) return;
  const minGen = findMinActiveGenerationBase(service);
  if (minGen === Infinity) {
    scopedGens?.clear();
    committedGenMap?.clear();
    return;
  }
  pruneEntriesBelowMinGen(scopedGens, committedGenMap, minGen);
  evictExcessGenerations(service, scopedGens, committedGenMap);
  evictExcessRowKeys(service, scopedGens, committedGenMap);
}

const getRetainedRowKeyHistoryStats = (service) => ({
  scopedGenerationCount: SCOPED_COMMIT_GENERATIONS.get(service)?.size ?? 0,
  committedRowKeyCount: COMMITTED_ROW_KEY_GENERATIONS.get(service)?.size ?? 0,
  preparedParticipantCount: PREPARED_PARTICIPANT_ROW_KEYS.get(service)?.size ?? 0,
});

function resolvePreparedBaseGeneration(service, participantId, existing, validationText) {
  if (typeof existing?.generationBase === 'number') return existing.generationBase;
  const session = SESSIONS.get(service)?.get(participantId);
  return session?.generationBase ??
    resolveExactValidationBaseGeneration(service, validationText) ?? 0;
}

function stagePreparedParticipantRowKeys(
  service, participantId, touchedRowKeys, hasUnscopedWrite = false, validationText = null,
) {
  if (!service || !participantId || !(touchedRowKeys instanceof Set)) return;
  const preparedMap = perServiceMap(PREPARED_PARTICIPANT_ROW_KEYS, service);
  const existing = preparedMap.get(participantId);
  const baseGen = resolvePreparedBaseGeneration(service, participantId, existing, validationText);
  const currentGen = validationText !== null && service.db?.open === true ?
    readPartitionWriteGeneration(service.db) : baseGen;
  const validatedThrough = Math.max(existing?.validatedThroughGeneration ?? baseGen, currentGen);
  preparedMap.set(participantId, {rowKeys: new Set(touchedRowKeys),
    hasUnscopedWrite: Boolean(hasUnscopedWrite), generationBase: baseGen,
    validatedThroughGeneration: validatedThrough});
}

function clearPreparedParticipantRowKeys(service, participantId) {
  if (!service || !participantId) return;
  PREPARED_PARTICIPANT_ROW_KEYS.get(service)?.delete(participantId);
  pruneRetainedRowKeyHistory(service);
  notifyRowKeySettlementWaiters(service);
}

function isScopedPreparedEntry(entry) {
  return Boolean(entry && !entry.hasUnscopedWrite && entry.rowKeys.size > 0);
}

function recordCommittedParticipantRowKeys(service, participantId, generation) {
  if (!service || !participantId) return;
  const preparedMap = PREPARED_PARTICIPANT_ROW_KEYS.get(service);
  const entry = preparedMap?.get(participantId);
  preparedMap?.delete(participantId);
  const scoped = isScopedPreparedEntry(entry);
  if (service.db?.open === true) {
    recordPartitionWriteGenerationFootprint(
      service.db,
      generation,
      scoped ? {scoped: true, hasUnscopedWrite: false, rowKeys: entry.rowKeys} : null,
    );
  }
  if (scoped) {
    perServiceSet(SCOPED_COMMIT_GENERATIONS, service).add(generation);
    const committedGenMap = perServiceMap(COMMITTED_ROW_KEY_GENERATIONS, service);
    for (const rk of entry.rowKeys) committedGenMap.set(rk, generation);
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
  if ((committedGenMap?.get(rk) ?? 0) > session.generationBase) return true;
  return isRowKeyHeldByOtherPreparedParticipant(
    PREPARED_PARTICIPANT_ROW_KEYS.get(service), session.identity?.participantId, rk);
}

function isScopedRowKeySession(service, session) {
  if (!isRowKeyConcurrencyEnabled(service) || session?.hasUnscopedWrite === true ||
      !(session?.touchedRowKeys instanceof Set) || session.touchedRowKeys.size === 0) {
    return false;
  }
  if (typeof session.schemaVersionBase === 'number' &&
      resolveTablePkMetadata(service).schemaVersion !== session.schemaVersionBase) {
    return false;
  }
  return true;
}

function canAdvanceRowKeySessionGeneration(service, session, targetGeneration) {
  hydrateDurablePreparedAndCommittedState(service);
  if (!isScopedRowKeySession(service, session) ||
      !areIntermediateGenerationsScoped(service, session.generationBase, targetGeneration)) {
    return false;
  }
  for (const rk of session.touchedRowKeys) {
    if (isRowKeyTouchedAfterGeneration(service, session, rk)) return false;
  }
  return true;
}

function recordConflictingPair(contradictoryIds, contradictions, left, right) {
  if (!isPreparedEntryConflicting(left.fp, right.fp.rowKeys, right.fp.hasUnscopedWrite)) {
    return;
  }
  contradictoryIds.add(left.participantId);
  contradictoryIds.add(right.participantId);
  contradictions.push(Object.freeze({
    leftParticipantId: left.participantId,
    rightParticipantId: right.participantId,
  }));
}

function inspectRetainedPreparedObligations(service) {
  if (service?.db?.open !== true) {
    return Object.freeze({healthy: true, preparedCount: 0,
      contradictoryParticipantIds: Object.freeze([]), contradictions: Object.freeze([])});
  }
  const durableRows = readPreparedParticipantRows(service.db);
  const footprints = durableRows.map((row) => ({
    participantId: row.participantId,
    fp: extractOperationsRowKeyFootprint(service, operationsOf(row.operationsText)),
  }));
  const contradictoryIds = new Set();
  const contradictions = [];
  for (let i = 0; i < footprints.length; i += 1) {
    for (let j = i + 1; j < footprints.length; j += 1) {
      recordConflictingPair(contradictoryIds, contradictions, footprints[i], footprints[j]);
    }
  }
  return Object.freeze({
    healthy: contradictions.length === 0,
    preparedCount: durableRows.length,
    contradictoryParticipantIds: Object.freeze([...contradictoryIds]),
    contradictions: Object.freeze(contradictions),
  });
}

function isRowTouchedInGeneration(row, expectedGen, operationsFootprint) {
  if (Number(row.generation) !== expectedGen || Number(row.scoped) !== 1) return true;
  const keys = JSON.parse(row.row_keys_text);
  if (!Array.isArray(keys) || keys.length === 0) return true;
  return keys.some((rk) => operationsFootprint.rowKeys.has(rk));
}

function canAdvanceCommittedValidationText(service, validationText, operationsFootprint) {
  if (!isRowKeyConcurrencyEnabled(service) ||
      !operationsFootprint?.scoped || operationsFootprint.hasUnscopedWrite) {
    return false;
  }
  hydrateDurablePreparedAndCommittedState(service);
  const baseGen = resolveExactValidationBaseGeneration(service, validationText);
  const currentGen = readPartitionWriteGeneration(service.db);
  if (baseGen === null || baseGen < 0 || baseGen > currentGen) return false;
  if (baseGen === currentGen) return true;
  const rows = readOrReconstructGenerationHistoryRange(service.db, baseGen, currentGen,
    (opsText) => extractOperationsRowKeyFootprint(service, operationsOf(opsText)));
  if (rows.length !== currentGen - baseGen) return false;
  hydrateCommittedHistoryFromStore(service, baseGen, currentGen);
  for (let idx = 0; idx < rows.length; idx += 1) {
    if (isRowTouchedInGeneration(rows[idx], baseGen + idx + 1, operationsFootprint)) {
      return false;
    }
  }
  return true;
}

function recordCommittedAutocommitRowKeys(service, command, generation) {
  if (!isRowKeyConcurrencyEnabled(service) || !command?.sql) return;
  const operationsFootprint = extractOperationsRowKeyFootprint(service, [
    {sql: command.sql, params: Array.isArray(command.params) ? command.params : []},
  ]);
  if (service.db?.open === true) {
    recordPartitionWriteGenerationFootprint(service.db, generation, operationsFootprint);
  }
  if (!operationsFootprint.scoped || operationsFootprint.hasUnscopedWrite ||
      operationsFootprint.rowKeys.size === 0) {
    pruneRetainedRowKeyHistory(service);
    notifyRowKeySettlementWaiters(service);
    return;
  }
  perServiceSet(SCOPED_COMMIT_GENERATIONS, service).add(generation);
  const committedGenMap = perServiceMap(COMMITTED_ROW_KEY_GENERATIONS, service);
  for (const rk of operationsFootprint.rowKeys) committedGenMap.set(rk, generation);
  pruneRetainedRowKeyHistory(service);
  notifyRowKeySettlementWaiters(service);
}

function resetParticipantRowKeyHistory(service) {
  if (!service) return;
  PREPARED_PARTICIPANT_ROW_KEYS.get(service)?.clear();
  SCOPED_COMMIT_GENERATIONS.get(service)?.clear();
  COMMITTED_ROW_KEY_GENERATIONS.get(service)?.clear();
  hydrateDurablePreparedAndCommittedState(service);
}

function reconcilePreparedParticipantRowKeys(service) {
  if (service?.db?.open !== true) return;
  const preparedMap = PREPARED_PARTICIPANT_ROW_KEYS.get(service);
  const durablePrepared = new Set(readPreparedParticipantIds(service.db));
  if (preparedMap) {
    for (const participantId of [...preparedMap.keys()]) {
      if (!durablePrepared.has(participantId)) preparedMap.delete(participantId);
    }
  }
  hydrateDurablePreparedAndCommittedState(service);
}

function openParticipantSession(service, identity, base) {
  hydrateDurablePreparedAndCommittedState(service);
  const schemaVersionBase = resolveTablePkMetadata(service).schemaVersion;
  const session = {
    identity: Object.freeze({...identity}), operations: [], compiledOperations: [],
    touchedRowKeys: new Set(), hasUnscopedWrite: false,
    stagedLockClaims: {rowKeys: new Set(), hasUnscopedWrite: false}, bytes: 0,
    generationBase: base.generationBase, lastValidatedGeneration: base.generationBase,
    lastValidatedSchemaVersion: null, schemaVersionBase, originIndex: base.originIndex,
    startedAt: service.timeSource.now(), phase: PHASE.ACTIVE, sealed: null,
    inFlight: false, doomCode: null,
  };
  sessionsOf(service).set(identity.participantId, session);
  return session;
}

function findParticipantSession(service, {transactionId, participantId}) {
  if (!participantId) return null;
  const session = SESSIONS.get(service)?.get(participantId) ?? null;
  return session?.identity.transactionId === transactionId ? session : null;
}

function participantSessionNamed(service, sessionId) {
  for (const session of SESSIONS.get(service)?.values() ?? []) {
    if (session.identity.sessionId === sessionId) return session;
  }
  return null;
}

function participantRoutingSessionCollision(service, sessionId) {
  return typeof sessionId === 'string' && sessionId.length > 0 &&
    (participantSessionNamed(service, sessionId) !== null ||
      isParticipantSessionPrepared(service.db, sessionId));
}

const listActiveParticipantSessions = (service) => SESSIONS.get(service)?.values() ?? [];
const hasParticipantSession = (service) => (SESSIONS.get(service)?.size ?? 0) > 0;
const participantTransactionActive = (service) =>
  hasParticipantSession(service) || isPartitionReserved(service.db);

function endParticipantSession(service, session) {
  const sessions = SESSIONS.get(service);
  if (sessions?.get(session.identity.participantId) === session) {
    sessions.delete(session.identity.participantId);
    pruneRetainedRowKeyHistory(service);
    notifyRowKeySettlementWaiters(service);
  }
}

function discardParticipantSessions(service) {
  const sessions = SESSIONS.get(service);
  if (sessions !== undefined && sessions.size > 0) {
    service.logger.info(LOG_MSG.SESSIONS_DISCARDED, {
      partitionId: service.partitionId, sessionCount: sessions.size});
    sessions.clear();
  }
  reconcilePreparedParticipantRowKeys(service);
  pruneRetainedRowKeyHistory(service);
  notifyRowKeySettlementWaiters(service);
}

// Discard sessions held past holdTimeoutMs (design 4, hold sweep); in-flight PREPARE owns its deadline.
function sweepExpiredParticipantSessions(service, nowMs, holdTimeoutMs) {
  const sessions = SESSIONS.get(service);
  let discarded = 0;
  for (const session of [...(sessions?.values() ?? [])]) {
    if (!session.inFlight && nowMs - session.startedAt >= holdTimeoutMs) {
      const txId = session.identity?.transactionId;
      if (hasLockingReadReservations(txId) ||
          hasDbTransactionReservations(service.db, txId, service.partitionId)) continue;
      sessions?.delete(session.identity.participantId);
      discarded += 1;
      service.logger.info(LOG_MSG.SESSION_EXPIRED, {
        partitionId: service.partitionId, transactionId: session.identity.transactionId,
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

// Report a PREPARED row held past the hold window, once (design 8.4).
function reportHeldPreparedRows(service, nowMs, holdTimeoutMs) {
  const prepared = new Set(readPreparedParticipantIds(service.db));
  const holds = perServiceMap(PREPARED_HOLDS, service);
  for (const participantId of [...holds.keys()]) {
    if (!prepared.has(participantId)) holds.delete(participantId);
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

function sweepParticipantTransactionHolds(service, nowMs) {
  if (service.db?.open !== true) return 0;
  const holdTimeoutMs = service.preparedStateHoldTimeoutMs;
  try {
    reportHeldPreparedRows(service, nowMs, holdTimeoutMs);
  } catch (holdReadError) {
    service.logger.warn(LOG_MSG.PREPARED_HOLD_READ_FAILED, {
      partitionId: service.partitionId, error: holdReadError?.message});
  }
  return sweepExpiredParticipantSessions(service, nowMs, holdTimeoutMs);
}

export {
  canAdmitConcurrentParticipantSession, canAdvanceCommittedValidationText,
  canAdvanceRowKeySessionGeneration, checkAndRecordSessionRowKey, clearPreparedParticipantRowKeys,
  discardParticipantSessions, endParticipantSession, extractOperationsRowKeyFootprint,
  findParticipantSession, getRetainedRowKeyHistoryStats, hasParticipantSession,
  inspectRetainedPreparedObligations, isPartitionReservedForPrepare, isRowKeyConcurrencyEnabled,
  listActiveParticipantSessions, openParticipantSession, participantRoutingSessionCollision,
  participantTransactionActive, recordCommittedAutocommitRowKeys,
  recordCommittedParticipantRowKeys, resetParticipantRowKeyHistory, revertSessionRowKeyCheck,
  stagePreparedParticipantRowKeys, sweepParticipantTransactionHolds,
  waitForConflictingRowKeyHolderToSettle,
};
