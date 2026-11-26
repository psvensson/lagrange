// Authoritative retention, leader barrier stamping, and retirement of
// committed statement mirror effects (_partition_statement_outcome_effects).

import {TABLES} from '../constants/tables.js';
import {materializeTypedRowSetObjects} from '../query/sql-value-codec.js';
import {readSnapshotIndexIn} from '../raft/raft-rs-snapshot-witness.js';
import {sqliteConnectionState} from '../storage/sqlite-connection-state.js';
import {
  PARTITION_TRANSITION_METADATA_FIELD,
  PARTITION_TRANSITION_STATE,
} from './partition-constants.js';
import {parseTablePartitionTransition} from './partition-transition-row.js';

const SYSTEM_TABLE_NAMES_SET = Object.freeze(new Set(Object.values(TABLES)));
const ACTIVE_MIRROR_TRANSITION_STATES = Object.freeze(new Set([
  PARTITION_TRANSITION_STATE.SPLIT_BACKFILLING,
  PARTITION_TRANSITION_STATE.SPLIT_CATCHUP,
  PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE,
  PARTITION_TRANSITION_STATE.MERGE_BACKFILLING,
  PARTITION_TRANSITION_STATE.MERGE_CATCHUP,
  PARTITION_TRANSITION_STATE.MERGE_CUTOVER_ACTIVE,
]));
const STATEMENT_OUTCOME_EFFECTS_TABLE = '_partition_statement_outcome_effects';
const MIRROR_RETENTION_BARRIER_ENTRY_KEY = '__mirror_retention_barrier__';
const MIRROR_RETENTION_BARRIER_KIND = 'PINNED';
const STEADY_STATE_MIRROR_EFFECT_RETENTION_WINDOW = 256;
const STATEMENT_OUTCOME_EFFECTS_SQL = Object.freeze({
  CREATE_TABLE:
    'CREATE TABLE IF NOT EXISTS _partition_statement_outcome_effects (' +
    'entry_key TEXT PRIMARY KEY, log_index INTEGER NOT NULL, ' +
    'mutation_kind TEXT, typed_effects_json TEXT NOT NULL)',
  CREATE_LOG_INDEX_IDX:
    'CREATE INDEX IF NOT EXISTS idx_partition_statement_outcome_effects_log_index ' +
    'ON _partition_statement_outcome_effects (log_index)',
  TABLE_EXISTS: 'SELECT 1 AS present FROM sqlite_master WHERE type = \'table\' AND name = ?',
  INSERT:
    'INSERT INTO _partition_statement_outcome_effects ' +
    '(entry_key, log_index, mutation_kind, typed_effects_json) VALUES (?, ?, ?, ?)',
  SELECT_BY_ENTRY_KEY:
    'SELECT mutation_kind, typed_effects_json ' +
    'FROM _partition_statement_outcome_effects WHERE entry_key = ?',
  DELETE_THROUGH_LOG_INDEX:
    'DELETE FROM _partition_statement_outcome_effects WHERE log_index > 0 AND log_index <= ?',
  DELETE_BY_ENTRY_KEY:
    'DELETE FROM _partition_statement_outcome_effects WHERE entry_key = ?',
  UPSERT_RETENTION_BARRIER:
    'INSERT INTO _partition_statement_outcome_effects ' +
    '(entry_key, log_index, mutation_kind, typed_effects_json) VALUES (?, 0, ?, ?) ' +
    'ON CONFLICT (entry_key) DO UPDATE SET ' +
    'mutation_kind = excluded.mutation_kind, ' +
    'typed_effects_json = excluded.typed_effects_json',
});

function hasActiveVolatileMirrorHandle(service) {
  return Boolean(
    service.splitReplication || service.mergeReplication || service.captureDurableMirrorEffects,
  );
}

function isUserTableNameEligibleForMirror(tableName) {
  return typeof tableName === 'string' && tableName.length > 0 &&
    !SYSTEM_TABLE_NAMES_SET.has(tableName);
}

function resolveTableRowForMirrorEffects(service, tableName = service?.tableName) {
  const cache = service?.systemTableCache;
  if (!cache) return null;
  const tableKey = service.tableId || tableName;
  return (tableKey ? cache.get(TABLES.TABLES, tableKey) : null) ?? null;
}

function extractTransitionSourceIds(metadata) {
  if (!metadata) return null;
  const single = metadata[PARTITION_TRANSITION_METADATA_FIELD.SOURCE_PARTITION_ID];
  if (typeof single === 'string' && single.length > 0) return [single];
  const list = metadata[PARTITION_TRANSITION_METADATA_FIELD.SOURCE_PARTITION_IDS];
  return Array.isArray(list) && list.length > 0 ? list : null;
}

function isPartitionNamedAsTransitionTargetOnly(partitionId, parsedTransition) {
  if (typeof partitionId !== 'string' || partitionId.length === 0) return false;
  const sourceIds = extractTransitionSourceIds(parsedTransition?.metadata);
  return sourceIds !== null && !sourceIds.includes(partitionId);
}

function parseActiveSourceTransition(service, tableRow) {
  if (!tableRow) return null;
  const parsed = parseTablePartitionTransition(tableRow);
  const state = String(tableRow.partition_transition_state ?? '').toLowerCase();
  if (!ACTIVE_MIRROR_TRANSITION_STATES.has(state)) return null;
  if (isPartitionNamedAsTransitionTargetOnly(service?.partitionId, parsed)) return null;
  return parsed ?? {state, metadata: null};
}

function extractTransitionCheckpointBarrier(parsedTransition) {
  const checkpoint =
    parsedTransition?.metadata?.[PARTITION_TRANSITION_METADATA_FIELD.SOURCE_CHECKPOINT];
  const watermark = Number(checkpoint?.snapshotBarrierIndex);
  return Number.isSafeInteger(watermark) && watermark >= 0 ? watermark : 0;
}

function resolveLocalActiveMirrorObligationBarrier(service) {
  if (!service) return null;
  if (service.captureDurableMirrorEffects === true) return 0;
  const handle = service.splitReplication || service.mergeReplication || null;
  if (handle && handle.terminal !== true) {
    const barrier = Number(handle.snapshotBarrierIndex);
    return Number.isSafeInteger(barrier) && barrier >= 0 ? barrier : 0;
  }
  const tableRow = resolveTableRowForMirrorEffects(service);
  const activeTransition = parseActiveSourceTransition(service, tableRow);
  if (activeTransition !== null) {
    return extractTransitionCheckpointBarrier(activeTransition);
  }
  return null;
}

function partitionOwesDurableMirrorEffects(service, tableName = service?.tableName) {
  if (!service) return false;
  if (hasActiveVolatileMirrorHandle(service)) return true;
  return isUserTableNameEligibleForMirror(tableName);
}

function capturedRowEffectsTableExistsIn(db) {
  const state = sqliteConnectionState(db);
  return state.committedFact(
    STATEMENT_OUTCOME_EFFECTS_TABLE,
    STATEMENT_OUTCOME_EFFECTS_TABLE,
    () => state
      .statement(STATEMENT_OUTCOME_EFFECTS_SQL.TABLE_EXISTS)
      .get(STATEMENT_OUTCOME_EFFECTS_TABLE) !== undefined,
  );
}

function persistCapturedRowEffectsIn(
  service, state, entryKey, logIndex, mutationKind, typedEffects,
) {
  if (!capturedRowEffectsTableExistsIn(service.db)) {
    service.db.exec(STATEMENT_OUTCOME_EFFECTS_SQL.CREATE_TABLE);
    service.db.exec(STATEMENT_OUTCOME_EFFECTS_SQL.CREATE_LOG_INDEX_IDX);
    state.forgetFact(STATEMENT_OUTCOME_EFFECTS_TABLE, STATEMENT_OUTCOME_EFFECTS_TABLE);
  }
  state.runNonApplication(
    STATEMENT_OUTCOME_EFFECTS_SQL.INSERT,
    entryKey,
    logIndex,
    typeof mutationKind === 'string' ? mutationKind : null,
    JSON.stringify(typedEffects),
  );
}

function readCapturedRowEffectsIn(db, entryKey) {
  if (!capturedRowEffectsTableExistsIn(db)) return null;
  const row = sqliteConnectionState(db)
    .statement(STATEMENT_OUTCOME_EFFECTS_SQL.SELECT_BY_ENTRY_KEY)
    .get(entryKey);
  if (typeof row?.typed_effects_json !== 'string') return null;
  return {
    mutationKind: typeof row.mutation_kind === 'string' ? row.mutation_kind : null,
    affectedRows: materializeTypedRowSetObjects(JSON.parse(row.typed_effects_json)),
  };
}

function readDurableMirrorRetentionBarrierIn(db) {
  if (!db?.open || !capturedRowEffectsTableExistsIn(db)) return null;
  const row = sqliteConnectionState(db)
    .statement(STATEMENT_OUTCOME_EFFECTS_SQL.SELECT_BY_ENTRY_KEY)
    .get(MIRROR_RETENTION_BARRIER_ENTRY_KEY);
  if (row?.mutation_kind !== MIRROR_RETENTION_BARRIER_KIND) return null;
  const barrier = Number(row.typed_effects_json);
  return Number.isSafeInteger(barrier) && barrier >= 0 ? barrier : 0;
}

function writeDurableMirrorRetentionBarrierIn(service, state, barrierIndex) {
  if (!capturedRowEffectsTableExistsIn(service.db)) {
    service.db.exec(STATEMENT_OUTCOME_EFFECTS_SQL.CREATE_TABLE);
    service.db.exec(STATEMENT_OUTCOME_EFFECTS_SQL.CREATE_LOG_INDEX_IDX);
    state.forgetFact(STATEMENT_OUTCOME_EFFECTS_TABLE, STATEMENT_OUTCOME_EFFECTS_TABLE);
  }
  const normalizedBarrier = Number.isSafeInteger(barrierIndex) && barrierIndex >= 0 ?
    barrierIndex : 0;
  state.runNonApplication(
    STATEMENT_OUTCOME_EFFECTS_SQL.UPSERT_RETENTION_BARRIER,
    MIRROR_RETENTION_BARRIER_ENTRY_KEY,
    MIRROR_RETENTION_BARRIER_KIND,
    String(normalizedBarrier),
  );
}

function resolveActiveMirrorRetentionBarrierIndex(service) {
  const localBarrier = resolveLocalActiveMirrorObligationBarrier(service);
  if (localBarrier !== null) return localBarrier;
  return service?.db?.open ? readDurableMirrorRetentionBarrierIn(service.db) : null;
}

function resolveLeaderMirrorRetentionStamp(service) {
  if (!partitionOwesDurableMirrorEffects(service)) return {};
  const activeBarrier = resolveActiveMirrorRetentionBarrierIndex(service);
  return activeBarrier !== null ? {mirrorRetentionBarrierIndex: activeBarrier} : {};
}

function canPruneSettledMirrorOutcomeEffects(service, settledThroughLogIndex) {
  const db = service?.db;
  if (!db?.open || db.inTransaction === true) return false;
  if (!Number.isSafeInteger(settledThroughLogIndex) || settledThroughLogIndex <= 0) return false;
  return capturedRowEffectsTableExistsIn(db);
}

function advanceMirrorHandleDurableWatermark(service, settledThroughLogIndex) {
  const handle = service.splitReplication || service.mergeReplication;
  if (!handle) return;
  const previousWatermark = Number.isSafeInteger(handle.durableWatermarkIndex) ?
    handle.durableWatermarkIndex : 0;
  handle.durableWatermarkIndex = Math.max(previousWatermark, settledThroughLogIndex);
}

function reconcileDurableBarrierAfterPrune(service, state, settledThroughLogIndex, options) {
  if (options?.releaseObligation === true) {
    state.runNonApplication(
      STATEMENT_OUTCOME_EFFECTS_SQL.DELETE_BY_ENTRY_KEY,
      MIRROR_RETENTION_BARRIER_ENTRY_KEY,
    );
    return;
  }
  const existingBarrier = readDurableMirrorRetentionBarrierIn(service.db);
  if (existingBarrier !== null && settledThroughLogIndex > existingBarrier) {
    writeDurableMirrorRetentionBarrierIn(service, state, settledThroughLogIndex);
  }
}

function pruneSettledMirrorOutcomeEffects(service, settledThroughLogIndex, options = {}) {
  if (!canPruneSettledMirrorOutcomeEffects(service, settledThroughLogIndex)) return 0;
  const state = sqliteConnectionState(service.db);
  const info = state.runNonApplication(
    STATEMENT_OUTCOME_EFFECTS_SQL.DELETE_THROUGH_LOG_INDEX,
    settledThroughLogIndex,
  );
  advanceMirrorHandleDurableWatermark(service, settledThroughLogIndex);
  reconcileDurableBarrierAfterPrune(service, state, settledThroughLogIndex, options);
  return Number.isSafeInteger(info?.changes) ? info.changes : 0;
}

function resolveCommittedMirrorRetentionBarrier(service, command) {
  const commandBarrier = Number(command?.mirrorRetentionBarrierIndex);
  if (Number.isSafeInteger(commandBarrier) && commandBarrier >= 0) return commandBarrier;
  return resolveActiveMirrorRetentionBarrierIndex(service);
}

function reconcileCommittedStatementMirrorEffects(
  service, state, entryKey, index, result, command = null,
) {
  if (!result?.typedEffects || !partitionOwesDurableMirrorEffects(service)) return;
  persistCapturedRowEffectsIn(
    service, state, entryKey, index, result.mutationKind, result.typedEffects,
  );
  const compactedIndex = service?.partitionId ?
    Number(readSnapshotIndexIn(service.db, service.partitionId)) : 0;
  const activeBarrier = resolveCommittedMirrorRetentionBarrier(service, command);
  if (activeBarrier !== null) {
    writeDurableMirrorRetentionBarrierIn(service, state, activeBarrier);
    const settledFloor = Math.max(compactedIndex, activeBarrier);
    if (Number.isSafeInteger(settledFloor) && settledFloor > 0) {
      state.runNonApplication(
        STATEMENT_OUTCOME_EFFECTS_SQL.DELETE_THROUGH_LOG_INDEX,
        settledFloor,
      );
    }
    return;
  }
  const steadyStateFloor = Math.max(
    compactedIndex,
    Number(index) - STEADY_STATE_MIRROR_EFFECT_RETENTION_WINDOW,
  );
  if (Number.isSafeInteger(steadyStateFloor) && steadyStateFloor > 0) {
    state.runNonApplication(
      STATEMENT_OUTCOME_EFFECTS_SQL.DELETE_THROUGH_LOG_INDEX,
      steadyStateFloor,
    );
  }
}

export {
  STEADY_STATE_MIRROR_EFFECT_RETENTION_WINDOW,
  partitionOwesDurableMirrorEffects,
  pruneSettledMirrorOutcomeEffects,
  readCapturedRowEffectsIn,
  reconcileCommittedStatementMirrorEffects,
  resolveActiveMirrorRetentionBarrierIndex,
  resolveLeaderMirrorRetentionStamp,
};
