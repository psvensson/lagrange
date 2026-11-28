// Public entry: openParticipantSession, checkAndRecordSessionRowKey, classifyPartitionPrepareReservation, canAdvanceCommittedValidationText, inspectRetainedPreparedObligations, stagePreparedParticipantRowKeys, recordCommittedParticipantRowKeys, recordCommittedAutocommitRowKeys, discardParticipantSessions, resetParticipantRowKeyHistory, sweepParticipantTransactionHolds.
// Required collaborators: partition-participant-transaction-store.js and partition-write-footprint-contract.js.
// Durable authority / commit point: _participant_transactions, _partition_write_generation and _partition_write_generation_history in SQLite.
// Permitted post-commit work: volatile staging session lifecycle, hold sweep reporting, and settlement waiter notifications.
// Recovery / wake entry: hydrateDurablePreparedAndCommittedState on reopen and resetParticipantRowKeyHistory on afterRollback.
// Representative production tests: test/query/scenario-a-transaction-coordination-fast-path.test.js, test/partition/partition-participant-transaction-apply.test.js.
import {
  PARTICIPANT_CONCURRENCY_GRANULARITY,
  PARTICIPANT_TRANSACTION_LOG_MSG as LOG_MSG, PARTICIPANT_TRANSACTION_SESSION_PHASE as PHASE,
} from './partition-participant-transaction-constants.js';
import {operationsOf} from './partition-participant-transaction-bytes.js';
import {
  FAIL_CLOSED_READ_DEPENDENCY_SNAPSHOT, areGenerationRowsDisjointFromCandidate,
  attachSessionReadDependencyAccumulator, buildPreparedEntryFromFootprintAndValidation,
  buildStagedPreparedEntry, classifyTransactionFootprintConflict, collectPreparedContradictions,
  decodeParticipantValidationForPartition, doTransactionFootprintsConflict,
  getSessionReadDependencySnapshot, hasScopedCandidateFootprint,
  isEntryDisjointFromCommittedMap, normalizeTransactionFootprint,
} from './partition-participant-read-dependencies.js';
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
import {
  enqueueBoundedRowKeyWaiter, hasRowKeyWaitForCycle, notifyFifoRowKeyWaiters,
} from './partition-row-key-waiters.js';

// Per partition service: participantId -> session.
const SESSIONS = new WeakMap();
// Per partition service: participantId -> when the hold sweep first saw it
// PREPARED, and whether that hold was reported.
const PREPARED_HOLDS = new WeakMap();
const COMMITTED_ROW_KEY_GENERATIONS = new WeakMap();
const PREPARED_PARTICIPANT_ROW_KEYS = new WeakMap();
const SCOPED_COMMIT_GENERATIONS = new WeakMap();

const DEFAULT_CONFLICT_SETTLE_WAIT_MS = 15000; // ends-on: conflicting row-key holder settlement
const MAX_RETAINED_COMMITTED_GENERATIONS = 1024;
const MAX_RETAINED_COMMITTED_ROW_KEYS = 16384;
const UNSCOPED_CONFLICT_SENTINEL = '*';

function perServiceMap(store, service) {
  let map = store.get(service);
  if (map === undefined) store.set(service, map = new Map());
  return map;
}

function perServiceSet(store, service) {
  let set = store.get(service);
  if (set === undefined) store.set(service, set = new Set());
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

function sessionMatchesRowKey(other, rowKey) {
  if (other.phase === PHASE.DOOMED) return false;
  return rowKey === UNSCOPED_CONFLICT_SENTINEL ?
    hasSessionWriteFootprint(other) :
    (other.hasUnscopedWrite === true || other.touchedRowKeys?.has(rowKey));
}

function listActiveRowKeyHolders(service, session, rowKey) {
  const holders = [];
  for (const other of SESSIONS.get(service)?.values() ?? []) {
    if (other !== session && sessionMatchesRowKey(other, rowKey)) holders.push(other);
  }
  return holders;
}

function hasAnyPreparedWriteByOther(service, session) {
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
  if (listActiveRowKeyHolders(service, session, rowKey).length > 0) return true;
  return rowKey === UNSCOPED_CONFLICT_SENTINEL ?
    hasAnyPreparedWriteByOther(service, session) :
    isRowKeyHeldByOtherPreparedParticipant(
      PREPARED_PARTICIPANT_ROW_KEYS.get(service), session?.identity?.participantId, rowKey);
}

function isWaiterSessionClosed(service, session) {
  if (session === null || session === undefined) return false;
  return session.phase === PHASE.DOOMED ||
    sessionsOf(service).get(session.identity?.participantId) !== session;
}

function notifyRowKeySettlementWaiters(service) {
  notifyFifoRowKeyWaiters(service, {
    isSessionClosed: (session) => isWaiterSessionClosed(service, session),
    hasConflict: (session, rowKey) => hasRowKeyConflictWithOtherSession(service, session, rowKey),
    unscopedSentinel: UNSCOPED_CONFLICT_SENTINEL,
  });
}

function releaseEmptyWaiterSessionClaims(service, session) {
  if (!session || (Array.isArray(session.operations) && session.operations.length > 0)) return;
  const hadKeys = session.touchedRowKeys instanceof Set && session.touchedRowKeys.size > 0;
  if (hadKeys) session.touchedRowKeys.clear();
  const hadUnscoped = session.hasUnscopedWrite === true;
  if (hadUnscoped) session.hasUnscopedWrite = false;
  if (hadKeys || hadUnscoped) notifyRowKeySettlementWaiters(service);
}

function resolveBoundedSettleWaitMs(service, timeoutMs) {
  const configured = service?.conflictSettleWaitMs;
  const hasCap = Number.isFinite(configured) && configured > 0;
  const capMs = hasCap ?
    Math.min(Math.floor(configured), DEFAULT_CONFLICT_SETTLE_WAIT_MS) :
    DEFAULT_CONFLICT_SETTLE_WAIT_MS;
  return Math.max(1, Math.min(Math.floor(timeoutMs), capMs));
}

function waitForConflictingRowKeyHolderToSettle(
  service, payload, rowKey, timeoutMs = DEFAULT_CONFLICT_SETTLE_WAIT_MS,
) {
  if (!isRowKeyConcurrencyEnabled(service) || !service.cdcIntegrationService ||
      typeof rowKey !== 'string' || rowKey.length === 0) {
    return Promise.resolve({waited: false, settled: false});
  }
  hydrateDurablePreparedAndCommittedState(service);
  const session = findParticipantSession(service, payload);
  if (!hasRowKeyConflictWithOtherSession(service, session, rowKey)) {
    return Promise.resolve({waited: false, settled: true});
  }
  releaseEmptyWaiterSessionClaims(service, session);
  const cyclePolicy = {
    isSessionClosed: (candidate) => isWaiterSessionClosed(service, candidate),
    listHolderSessions: listActiveRowKeyHolders,
  };
  if (session && hasSessionWriteFootprint(session) &&
      hasRowKeyWaitForCycle(service, session, rowKey, cyclePolicy)) {
    return Promise.resolve({waited: false, settled: false});
  }
  if (session?.phase === PHASE.ACTIVE) {
    const currentGen = readPartitionWriteGeneration(service.db);
    if (currentGen !== session.generationBase &&
        !canSessionTolerateCommittedGenerations(service, session, currentGen)) {
      return Promise.resolve({waited: false, settled: false, rebaseRefused: true});
    }
  }
  return enqueueBoundedRowKeyWaiter(
    service, session, rowKey, resolveBoundedSettleWaitMs(service, timeoutMs));
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

function checkAndRecordSessionRowKey(service, session, params, sql = '', ast = null) {
  if (!isRowKeyConcurrencyEnabled(service)) {
    return {conflict: false, rowKey: null, alreadyTouchedInSession: false,
      scoped: false, addedRowKeys: [], setUnscopedWrite: false};
  }
  hydrateDurablePreparedAndCommittedState(service);
  const {pkCols, allCols, uniqueConstraintCols, hasUnscopedSchemaConstraints} =
    resolveTablePkMetadata(service);
  const footprint = extractStatementWriteFootprint({
    ast, sql, params: Array.isArray(params) ? params : [],
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
      typedParams: op?.typedParams,
      pkCols, allCols, uniqueConstraintCols, hasUnscopedSchemaConstraints,
    });
    if (!fp.scoped || fp.rowKeys.length === 0) {
      return {scoped: false, rowKeys: new Set(), hasUnscopedWrite: true};
    }
    for (let j = 0; j < fp.rowKeys.length; j += 1) rowKeys.add(fp.rowKeys[j]);
  }
  return {scoped: true, rowKeys, hasUnscopedWrite: false};
}

function decodeParticipantValidationForService(service, validationText) {
  if (service?.db?.open !== true) return null;
  return decodeParticipantValidationForPartition({
    validationText,
    currentGeneration: readPartitionWriteGeneration(service.db),
    partitionId: service.partitionId,
    originIndex: readPartitionWriteOrigin(service.db)?.originIndex ?? null,
  });
}

function resolveExactValidationBaseGeneration(service, validationText) {
  return decodeParticipantValidationForService(service, validationText)?.baseGeneration ?? null;
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
  const opsFootprint = extractOperationsRowKeyFootprint(service, operationsOf(row.operationsText));
  const decodedValidation = decodeParticipantValidationForService(service, row.validationText);
  const baseGen = decodedValidation?.baseGeneration ?? 0;
  const prepareGen = Math.max(baseGen, readDurablePrepareGeneration(service.db, row.prepareIndex));
  entry = buildPreparedEntryFromFootprintAndValidation({
    opsFootprint, decodedValidation, baseGen, prepareGen});
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

function classifyPartitionPrepareReservation(
  service, selfParticipantId, rowKeysOrFootprint, hasUnscopedWrite = false, readDependencies = null,
) {
  if (!isPartitionReserved(service.db)) return {reserved: false, readWriteConflict: false};
  if (!isRowKeyConcurrencyEnabled(service)) return {reserved: true, readWriteConflict: false};
  hydrateDurablePreparedAndCommittedState(service);
  const candidate = normalizeTransactionFootprint(
    rowKeysOrFootprint, hasUnscopedWrite, readDependencies);
  const preparedMap = PREPARED_PARTICIPANT_ROW_KEYS.get(service);
  let reserved = false;
  for (const otherId of readPreparedParticipantIds(service.db)) {
    if (otherId === selfParticipantId) continue;
    const res = classifyTransactionFootprintConflict(preparedMap?.get(otherId), candidate);
    if (res.readWriteConflict) return {reserved: true, readWriteConflict: true};
    reserved ||= res.conflict;
  }
  return {reserved, readWriteConflict: false};
}

function findMinActiveGenerationBase(service) {
  let minGen = Infinity;
  for (const s of SESSIONS.get(service)?.values() ?? []) {
    if (typeof s.generationBase === 'number') minGen = Math.min(minGen, s.generationBase);
  }
  for (const e of PREPARED_PARTICIPANT_ROW_KEYS.get(service)?.values() ?? []) {
    minGen = Math.min(minGen, typeof e.generationBase === 'number' ? e.generationBase : 0);
  }
  return minGen;
}

function advancePreparedValidationBeforeEviction(service, maxEvictedGen) {
  const preparedMap = PREPARED_PARTICIPANT_ROW_KEYS.get(service);
  if (!preparedMap || preparedMap.size === 0) return;
  const committedGenMap = COMMITTED_ROW_KEY_GENERATIONS.get(service);
  for (const entry of preparedMap.values()) {
    if (entry.hasUnscopedWrite || entry.hasUnscopedRead) continue;
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
  if (scopedGens) for (const gen of [...scopedGens]) if (gen <= minGen) scopedGens.delete(gen);
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

function resolvePreparedCurrentGeneration(service, baseGen, validationText) {
  return validationText !== null && service.db?.open === true ?
    readPartitionWriteGeneration(service.db) : baseGen;
}

function stagePreparedParticipantRowKeys(
  service, participantId, touchedRowKeys, hasUnscopedWrite = false,
  validationText = null, readDeps = null,
) {
  if (!service || !participantId || !(touchedRowKeys instanceof Set)) return;
  const preparedMap = perServiceMap(PREPARED_PARTICIPANT_ROW_KEYS, service);
  const existing = preparedMap.get(participantId);
  const baseGen = resolvePreparedBaseGeneration(service, participantId, existing, validationText);
  const currentGen = resolvePreparedCurrentGeneration(service, baseGen, validationText);
  const session = SESSIONS.get(service)?.get(participantId);
  preparedMap.set(participantId, buildStagedPreparedEntry({
    touchedRowKeys, hasUnscopedWrite, baseGen, currentGen, existing,
    validationText, readDeps, session}));
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

function recordGenerationFootprintAndNotify(service, generation, scoped, rowKeys) {
  if (service.db?.open === true) {
    const fp = scoped ? {scoped: true, hasUnscopedWrite: false, rowKeys} : null;
    recordPartitionWriteGenerationFootprint(service.db, generation, fp);
  }
  if (scoped) {
    perServiceSet(SCOPED_COMMIT_GENERATIONS, service).add(generation);
    const committedGenMap = perServiceMap(COMMITTED_ROW_KEY_GENERATIONS, service);
    for (const rk of rowKeys) committedGenMap.set(rk, generation);
  }
  pruneRetainedRowKeyHistory(service);
  notifyRowKeySettlementWaiters(service);
}

function recordCommittedParticipantRowKeys(service, participantId, generation) {
  if (!service || !participantId) return;
  const preparedMap = PREPARED_PARTICIPANT_ROW_KEYS.get(service);
  const entry = preparedMap?.get(participantId);
  preparedMap?.delete(participantId);
  recordGenerationFootprintAndNotify(
    service, generation, isScopedPreparedEntry(entry), entry?.rowKeys);
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

function hasUnmodifiedRowKeySet(service, session, rowKeys) {
  const committedGenMap = COMMITTED_ROW_KEY_GENERATIONS.get(service);
  for (const rk of rowKeys ?? []) {
    if ((committedGenMap?.get(rk) ?? 0) > session.generationBase) return false;
  }
  return true;
}

function hasPreparedConflictForSession(service, session) {
  if (!session) return false;
  hydrateDurablePreparedAndCommittedState(service);
  const preparedMap = PREPARED_PARTICIPANT_ROW_KEYS.get(service);
  if (!preparedMap || preparedMap.size === 0) return false;
  const selfId = session.identity?.participantId;
  const candidate = normalizeTransactionFootprint(
    session.touchedRowKeys, session.hasUnscopedWrite, getSessionReadDependencySnapshot(session));
  for (const [otherId, entry] of preparedMap.entries()) {
    if (otherId !== selfId && doTransactionFootprintsConflict(entry, candidate)) return true;
  }
  return false;
}

function isSessionSchemaCurrent(service, session) {
  return typeof session?.schemaVersionBase !== 'number' ||
    resolveTablePkMetadata(service).schemaVersion === session.schemaVersionBase;
}

function canSessionTolerateCommittedGenerations(service, session, targetGeneration) {
  if (!session || session.hasUnscopedRead === true || !isSessionSchemaCurrent(service, session)) {
    return false;
  }
  const hasOps = Array.isArray(session.operations) && session.operations.length > 0;
  if (hasOps && session.hasUnscopedWrite === true) return false;
  const hasTouchedKeys = session.touchedRowKeys instanceof Set && session.touchedRowKeys.size > 0;
  if (!hasOps && !hasTouchedKeys && (session.readKeyCount ?? 0) === 0) return true;
  if (!isRowKeyConcurrencyEnabled(service)) return false;
  hydrateDurablePreparedAndCommittedState(service);
  if (!areIntermediateGenerationsScoped(service, session.generationBase, targetGeneration) ||
      !hasUnmodifiedRowKeySet(service, session, session.readRowKeys)) {
    return false;
  }
  return !hasTouchedKeys || hasUnmodifiedRowKeySet(service, session, session.touchedRowKeys);
}

function canAdvanceRowKeySessionGeneration(service, session, targetGeneration) {
  if (session?.hasUnscopedWrite === true ||
      !(session?.touchedRowKeys instanceof Set) || session.touchedRowKeys.size === 0 ||
      !canSessionTolerateCommittedGenerations(service, session, targetGeneration)) {
    return false;
  }
  return !hasPreparedConflictForSession(service, session);
}

function canRebaseEmptyWaitingSession(service, session, targetGeneration) {
  if (!canSessionTolerateCommittedGenerations(service, session, targetGeneration)) {
    return false;
  }
  hydrateDurablePreparedAndCommittedState(service);
  return !hasPreparedConflictForSession(service, session);
}

function buildDurablePreparedRowFootprint(service, row) {
  const opsFp = extractOperationsRowKeyFootprint(service, operationsOf(row.operationsText));
  const decoded = decodeParticipantValidationForService(service, row.validationText);
  const readDeps = decoded === null ?
    FAIL_CLOSED_READ_DEPENDENCY_SNAPSHOT : decoded.readDependencies;
  return normalizeTransactionFootprint(
    opsFp.rowKeys, Boolean(opsFp.hasUnscopedWrite) || decoded === null, readDeps);
}

function inspectRetainedPreparedObligations(service) {
  if (service?.db?.open !== true) {
    return collectPreparedContradictions([]);
  }
  const durableRows = readPreparedParticipantRows(service.db);
  return collectPreparedContradictions(durableRows.map((row) => ({
    participantId: row.participantId,
    fp: buildDurablePreparedRowFootprint(service, row),
  })));
}

function committedGenerationRows(service, baseGen, currentGen) {
  return readOrReconstructGenerationHistoryRange(service.db, baseGen, currentGen,
    (opsText) => extractOperationsRowKeyFootprint(service, operationsOf(opsText)));
}

function sessionReadDependenciesCurrent(service, session, generation) {
  if (session.generationBase === generation ||
      (!session.hasUnscopedRead && session.readKeyCount === 0)) return true;
  if (session.hasUnscopedRead || !isSessionSchemaCurrent(service, session)) return false;
  const reads = getSessionReadDependencySnapshot(session);
  const rows = committedGenerationRows(service, session.generationBase, generation);
  return rows.length === generation - session.generationBase &&
    areGenerationRowsDisjointFromCandidate(rows, session.generationBase, reads);
}

function canAdvanceCommittedValidationText(service, validationText, operationsFootprint) {
  hydrateDurablePreparedAndCommittedState(service);
  const decoded = decodeParticipantValidationForService(service, validationText);
  if (decoded === null) return false;
  const baseGen = decoded.baseGeneration;
  const currentGen = readPartitionWriteGeneration(service.db);
  if (baseGen < 0 || baseGen > currentGen) return false;
  if (baseGen === currentGen) return true;
  if (!isRowKeyConcurrencyEnabled(service) ||
      !hasScopedCandidateFootprint(operationsFootprint, decoded)) {
    return false;
  }
  const candidate = normalizeTransactionFootprint(
    operationsFootprint.rowKeys, operationsFootprint.hasUnscopedWrite, decoded.readDependencies);
  const rows = committedGenerationRows(service, baseGen, currentGen);
  if (rows.length !== currentGen - baseGen) return false;
  hydrateCommittedHistoryFromStore(service, baseGen, currentGen);
  return areGenerationRowsDisjointFromCandidate(rows, baseGen, candidate);
}

function recordCommittedAutocommitRowKeys(service, command, generation) {
  if (!isRowKeyConcurrencyEnabled(service) || !command?.sql) return;
  const operationsFootprint =
    extractOperationsRowKeyFootprint(service, [command]);
  const scoped = Boolean(operationsFootprint.scoped &&
    !operationsFootprint.hasUnscopedWrite && operationsFootprint.rowKeys.size > 0);
  recordGenerationFootprintAndNotify(
    service, generation, scoped, operationsFootprint.rowKeys);
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
    for (const id of [...preparedMap.keys()]) if (!durablePrepared.has(id)) preparedMap.delete(id);
  }
  hydrateDurablePreparedAndCommittedState(service);
}

function openParticipantSession(service, identity, base) {
  hydrateDurablePreparedAndCommittedState(service);
  const schemaVersionBase = resolveTablePkMetadata(service).schemaVersion;
  const session = {
    identity: Object.freeze({...identity}), operations: [], encodedOperations: [],
    compiledOperations: [], stagedResultsByEntryId: new Map(), touchedRowKeys: new Set(),
    hasUnscopedWrite: false, stagedLockClaims: {rowKeys: new Set(), hasUnscopedWrite: false},
    bytes: 0, generationBase: base.generationBase, lastValidatedGeneration: base.generationBase,
    lastValidatedSchemaVersion: null, schemaVersionBase, originIndex: base.originIndex,
    startedAt: service.timeSource.now(), phase: PHASE.ACTIVE, sealed: null,
    inFlight: false, doomCode: null,
  };
  attachSessionReadDependencyAccumulator(session);
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
const participantTransactionActive = (s) => hasParticipantSession(s) || isPartitionReserved(s.db);

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
  for (const id of [...holds.keys()]) if (!prepared.has(id)) holds.delete(id);
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
  canAdvanceRowKeySessionGeneration, canRebaseEmptyWaitingSession,
  checkAndRecordSessionRowKey, classifyPartitionPrepareReservation, clearPreparedParticipantRowKeys,
  discardParticipantSessions, endParticipantSession, extractOperationsRowKeyFootprint,
  sessionReadDependenciesCurrent, findParticipantSession, getRetainedRowKeyHistoryStats, hasParticipantSession,
  inspectRetainedPreparedObligations, isRowKeyConcurrencyEnabled,
  listActiveParticipantSessions, notifyRowKeySettlementWaiters, openParticipantSession,
  participantRoutingSessionCollision, participantTransactionActive,
  recordCommittedAutocommitRowKeys, recordCommittedParticipantRowKeys,
  resetParticipantRowKeyHistory, revertSessionRowKeyCheck, stagePreparedParticipantRowKeys,
  sweepParticipantTransactionHolds, waitForConflictingRowKeyHolderToSettle,
};
