// Authoritative retention custody, leader barrier stamping, and retirement of
// committed statement mirror effects (_partition_statement_outcome_effects).

import {TABLES} from '../constants/tables.js';
import {materializeTypedRowSetObjects} from '../query/sql-value-codec.js';
import {readSnapshotIndexIn} from '../raft/raft-rs-snapshot-witness.js';
import {sqliteConnectionState} from '../storage/sqlite-connection-state.js';
import {
  MIRROR_RETENTION_BARRIER_ENTRY_KEY,
  MIRROR_RETENTION_BARRIER_KIND,
  MIRROR_RETENTION_CUSTODY_ACTION,
  MIRROR_RETENTION_CUSTODY_COMMAND_ERROR,
  STEADY_STATE_MIRROR_EFFECT_RETENTION_WINDOW,
} from './partition-committed-statement-outcome-constants.js';
import {
  PARTITION_TRANSITION_METADATA_FIELD,
  PARTITION_TRANSITION_STATE,
  workflowAttemptOf,
} from './partition-constants.js';
import {
  PARTITION_COMMITTED_COMMAND_OUTCOME,
  PARTITION_SERVICE_EVENT,
  PARTITION_SERVICE_OPERATION,
} from './partition-service-constants.js';
import {parseTablePartitionTransition} from './partition-transition-row.js';

const mirrorRetentionRaftHooks = {
  partitionWriteLeadershipRefusalOf: null,
  startPartitionRaftWriteCommit: null,
};

function registerMirrorRetentionRaftHooks(hooks = {}) {
  Object.assign(mirrorRetentionRaftHooks, hooks);
}

const SYSTEM_TABLE_NAMES_SET = Object.freeze(new Set(Object.values(TABLES)));
const ACTIVE_MIRROR_TRANSITION_STATES = Object.freeze(new Set([
  PARTITION_TRANSITION_STATE.SPLIT_BACKFILLING,
  PARTITION_TRANSITION_STATE.SPLIT_CATCHUP,
  PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE,
  PARTITION_TRANSITION_STATE.MERGE_BACKFILLING,
  PARTITION_TRANSITION_STATE.MERGE_CATCHUP,
  PARTITION_TRANSITION_STATE.MERGE_CUTOVER_ACTIVE,
]));
const CANCELLED_TRANSITION_STATE = 'cancelled';
const ABORTED_TRANSITION_STATE = 'aborted';
const TERMINATED_TRANSITION_STATES = Object.freeze(new Set([
  PARTITION_TRANSITION_STATE.FAILED,
  CANCELLED_TRANSITION_STATE,
  ABORTED_TRANSITION_STATE,
]));
const STATEMENT_OUTCOME_EFFECTS_TABLE = '_partition_statement_outcome_effects';
const SPLIT_CUSTODY_FAMILY = 'split';
const MERGE_CUSTODY_FAMILY = 'merge';
const MERGE_STATE_PREFIX = 'merge_';
const LOCAL_WORKFLOW_KEY = 'local';
const JSON_OBJECT_PREFIX = '{';
const CUSTODY_ENTRY_ID_PREFIX = 'mirror-retention';
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

function normalizeSafeNonNegativeInt(value, unparseableValue = null) {
  const num = Number(value);
  return Number.isSafeInteger(num) && num >= 0 ? num : unparseableValue;
}

function normalizeOptionalString(value) {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function resolveRawBarrierValue(source) {
  return source.barrierIndex ?? source.replayWatermarkIndex ?? source.snapshotBarrierIndex;
}

function buildMirrorRetentionCustodyRecord(raw, initialBarrier = 0) {
  const source = raw || {};
  const barrierIndex = normalizeSafeNonNegativeInt(
    resolveRawBarrierValue(source),
    normalizeSafeNonNegativeInt(initialBarrier, 0),
  );
  return Object.freeze({
    barrierIndex,
    workflowId: normalizeOptionalString(source.workflowId),
    workflowAttempt: normalizeSafeNonNegativeInt(source.workflowAttempt, null),
    workflowFenceToken: normalizeSafeNonNegativeInt(source.workflowFenceToken, null),
    targetPartitionVersion: normalizeSafeNonNegativeInt(source.targetPartitionVersion, null),
    family: normalizeOptionalString(source.family),
  });
}

function parseDurableCustodyJson(rawText) {
  if (typeof rawText !== 'string' || rawText.length === 0) return null;
  const plainNumber = Number(rawText);
  if (Number.isSafeInteger(plainNumber) && plainNumber >= 0) {
    return buildMirrorRetentionCustodyRecord({barrierIndex: plainNumber}, plainNumber);
  }
  if (!rawText.startsWith(JSON_OBJECT_PREFIX)) return null;
  const parsed = JSON.parse(rawText);
  if (!parsed || typeof parsed !== 'object') return null;
  return buildMirrorRetentionCustodyRecord(parsed, 0);
}

function hasActiveAuthorizedVolatileMirrorHandle(service) {
  const split = service?.splitReplication;
  const merge = service?.mergeReplication;
  const hasSplit = Boolean(split && split.authorized !== false && split.terminal !== true);
  const hasMerge = Boolean(merge && merge.authorized !== false && merge.terminal !== true);
  return hasSplit || hasMerge || service?.captureDurableMirrorEffects === true;
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
  return {
    state,
    metadata: parsed?.metadata || null,
  };
}

function extractTransitionCheckpointBarrier(parsedTransition) {
  const checkpoint =
    parsedTransition?.metadata?.[PARTITION_TRANSITION_METADATA_FIELD.SOURCE_CHECKPOINT];
  const replayWatermark = normalizeSafeNonNegativeInt(
    checkpoint?.replayWatermarkIndex,
    null,
  );
  if (replayWatermark !== null) return replayWatermark;
  return normalizeSafeNonNegativeInt(checkpoint?.snapshotBarrierIndex, 0);
}

function buildCustodyFromMetadata(metadata, barrierIndex, family = null) {
  const meta = metadata || {};
  return buildMirrorRetentionCustodyRecord({
    barrierIndex,
    workflowId: meta[PARTITION_TRANSITION_METADATA_FIELD.WORKFLOW_ID] ?? null,
    workflowAttempt: workflowAttemptOf(meta),
    workflowFenceToken:
      meta[PARTITION_TRANSITION_METADATA_FIELD.WORKFLOW_FENCE_TOKEN] ?? null,
    targetPartitionVersion:
      meta[PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_VERSION] ?? null,
    family,
  }, barrierIndex);
}

function resolveHandleWatermarkBarrier(handle) {
  const durable = normalizeSafeNonNegativeInt(handle?.durableWatermarkIndex, null);
  const snapshot = normalizeSafeNonNegativeInt(handle?.snapshotBarrierIndex, null);
  if (durable !== null && snapshot !== null) return Math.max(durable, snapshot);
  return durable ?? snapshot ?? 0;
}

function resolveLocalActiveMirrorCustody(service) {
  if (!service) return null;
  if (service.captureDurableMirrorEffects === true) {
    return buildMirrorRetentionCustodyRecord({barrierIndex: 0}, 0);
  }
  const splitHandle = service.splitReplication;
  if (splitHandle && splitHandle.authorized !== false && splitHandle.terminal !== true) {
    return buildCustodyFromMetadata(
      splitHandle.metadata,
      resolveHandleWatermarkBarrier(splitHandle),
      SPLIT_CUSTODY_FAMILY,
    );
  }
  const mergeHandle = service.mergeReplication;
  if (mergeHandle && mergeHandle.authorized !== false && mergeHandle.terminal !== true) {
    return buildCustodyFromMetadata(
      mergeHandle.metadata,
      resolveHandleWatermarkBarrier(mergeHandle),
      MERGE_CUSTODY_FAMILY,
    );
  }
  const tableRow = resolveTableRowForMirrorEffects(service);
  const activeTransition = parseActiveSourceTransition(service, tableRow);
  if (activeTransition !== null) {
    const family = activeTransition.state.startsWith(MERGE_STATE_PREFIX) ?
      MERGE_CUSTODY_FAMILY :
      SPLIT_CUSTODY_FAMILY;
    return buildCustodyFromMetadata(
      activeTransition.metadata,
      extractTransitionCheckpointBarrier(activeTransition),
      family,
    );
  }
  return null;
}

function extractTableRowTransitionIdentity(tableRow) {
  const row = tableRow || {};
  const meta = parseTablePartitionTransition(row)?.metadata || {};
  return {
    state: String(row.partition_transition_state ?? '').toLowerCase(),
    workflowId: normalizeOptionalString(
      meta[PARTITION_TRANSITION_METADATA_FIELD.WORKFLOW_ID],
    ),
    workflowFenceToken: normalizeSafeNonNegativeInt(
      meta[PARTITION_TRANSITION_METADATA_FIELD.WORKFLOW_FENCE_TOKEN],
      null,
    ),
    targetPartitionVersion: normalizeSafeNonNegativeInt(
      meta[PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_VERSION],
      null,
    ),
    pendingPartitionVersion: normalizeSafeNonNegativeInt(
      row.pending_partition_version,
      null,
    ),
    activePartitionVersion: normalizeSafeNonNegativeInt(
      row.active_partition_version,
      null,
    ),
  };
}

function isTerminatedRowSupersedingCustody(durableCustody, rowIdentity) {
  if (!TERMINATED_TRANSITION_STATES.has(rowIdentity.state)) return false;
  if (!durableCustody.workflowId) return true;
  if (rowIdentity.workflowId === durableCustody.workflowId) return true;
  if (durableCustody.workflowFenceToken !== null &&
      rowIdentity.workflowFenceToken !== null &&
      rowIdentity.workflowFenceToken >= durableCustody.workflowFenceToken) {
    return true;
  }
  const rowTargetVersion =
    rowIdentity.targetPartitionVersion ?? rowIdentity.pendingPartitionVersion;
  return durableCustody.targetPartitionVersion !== null &&
    rowTargetVersion !== null &&
    rowTargetVersion >= durableCustody.targetPartitionVersion;
}

function isDurableCustodyTerminatedByTableState(durableCustody, tableRow) {
  if (!durableCustody || !tableRow) return false;
  const rowIdentity = extractTableRowTransitionIdentity(tableRow);
  if (ACTIVE_MIRROR_TRANSITION_STATES.has(rowIdentity.state)) return false;
  if (durableCustody.targetPartitionVersion !== null &&
      durableCustody.targetPartitionVersion > 0 &&
      rowIdentity.activePartitionVersion !== null &&
      rowIdentity.activePartitionVersion >= durableCustody.targetPartitionVersion) {
    return true;
  }
  return isTerminatedRowSupersedingCustody(durableCustody, rowIdentity);
}

function partitionOwesDurableMirrorEffects(service, tableName = service?.tableName) {
  if (!service) return false;
  if (hasActiveAuthorizedVolatileMirrorHandle(service)) return true;
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

function ensureCapturedRowEffectsTableIn(db, state) {
  if (capturedRowEffectsTableExistsIn(db)) return;
  db.exec(STATEMENT_OUTCOME_EFFECTS_SQL.CREATE_TABLE);
  db.exec(STATEMENT_OUTCOME_EFFECTS_SQL.CREATE_LOG_INDEX_IDX);
  state.forgetFact(STATEMENT_OUTCOME_EFFECTS_TABLE, STATEMENT_OUTCOME_EFFECTS_TABLE);
}

function persistCapturedRowEffectsIn(
  service, state, entryKey, logIndex, mutationKind, typedEffects,
) {
  ensureCapturedRowEffectsTableIn(service.db, state);
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

function readDurableMirrorRetentionCustodyIn(db) {
  if (!db?.open || !capturedRowEffectsTableExistsIn(db)) return null;
  const row = sqliteConnectionState(db)
    .statement(STATEMENT_OUTCOME_EFFECTS_SQL.SELECT_BY_ENTRY_KEY)
    .get(MIRROR_RETENTION_BARRIER_ENTRY_KEY);
  if (row?.mutation_kind !== MIRROR_RETENTION_BARRIER_KIND) return null;
  return parseDurableCustodyJson(row.typed_effects_json);
}

function readDurableMirrorRetentionBarrierIn(db) {
  return readDurableMirrorRetentionCustodyIn(db)?.barrierIndex ?? null;
}

function writeDurableMirrorRetentionCustodyIn(service, state, custodyInput, initialBarrier = 0) {
  ensureCapturedRowEffectsTableIn(service.db, state);
  const existing = readDurableMirrorRetentionCustodyIn(service.db);
  const normalized = typeof custodyInput === 'number' ?
    buildMirrorRetentionCustodyRecord({
      ...(existing || {}),
      barrierIndex: custodyInput,
    }, custodyInput) :
    buildMirrorRetentionCustodyRecord({
      ...(existing?.workflowId && !custodyInput?.workflowId ? existing : {}),
      ...(custodyInput || {}),
    }, initialBarrier);
  state.runNonApplication(
    STATEMENT_OUTCOME_EFFECTS_SQL.UPSERT_RETENTION_BARRIER,
    MIRROR_RETENTION_BARRIER_ENTRY_KEY,
    MIRROR_RETENTION_BARRIER_KIND,
    JSON.stringify(normalized),
  );
  return normalized;
}

function deleteDurableMirrorRetentionCustodyIn(service, state) {
  if (!service?.db?.open || !capturedRowEffectsTableExistsIn(service.db)) return;
  state.runNonApplication(
    STATEMENT_OUTCOME_EFFECTS_SQL.DELETE_BY_ENTRY_KEY,
    MIRROR_RETENTION_BARRIER_ENTRY_KEY,
  );
}

function resolveActiveMirrorRetentionCustody(service) {
  const localCustody = resolveLocalActiveMirrorCustody(service);
  if (localCustody !== null) return localCustody;
  if (!service?.db?.open) return null;
  const durableCustody = readDurableMirrorRetentionCustodyIn(service.db);
  if (durableCustody === null) return null;
  const tableRow = resolveTableRowForMirrorEffects(service);
  if (isDurableCustodyTerminatedByTableState(durableCustody, tableRow)) {
    return null;
  }
  return durableCustody;
}

function resolveActiveMirrorRetentionBarrierIndex(service) {
  return resolveActiveMirrorRetentionCustody(service)?.barrierIndex ?? null;
}

function resolveLeaderMirrorRetentionStamp(service) {
  if (!partitionOwesDurableMirrorEffects(service)) return {};
  const activeCustody = resolveActiveMirrorRetentionCustody(service);
  if (activeCustody !== null) {
    return {
      mirrorRetentionBarrierIndex: activeCustody.barrierIndex,
      mirrorRetentionCustody: activeCustody,
    };
  }
  if (service?.db?.open && readDurableMirrorRetentionCustodyIn(service.db) !== null) {
    return {mirrorRetentionRelease: true};
  }
  return {};
}

function canMutateMirrorOutcomeEffectsIn(service) {
  const db = service?.db;
  return Boolean(db?.open && db.inTransaction !== true);
}

function advanceMirrorHandleDurableWatermark(service, settledThroughLogIndex) {
  const handle = service.splitReplication || service.mergeReplication;
  if (!handle) return;
  const previousWatermark = normalizeSafeNonNegativeInt(handle.durableWatermarkIndex, 0);
  handle.durableWatermarkIndex = Math.max(previousWatermark, settledThroughLogIndex);
}

function resolvePruneCustodyMetadata(service, settledThroughLogIndex, options) {
  if (options?.custody) {
    return buildMirrorRetentionCustodyRecord(options.custody, settledThroughLogIndex);
  }
  if (options?.metadata) {
    return buildCustodyFromMetadata(
      options.metadata,
      settledThroughLogIndex,
      options?.family ?? null,
    );
  }
  const localCustody = resolveLocalActiveMirrorCustody(service);
  if (localCustody !== null) {
    return buildMirrorRetentionCustodyRecord({
      ...localCustody,
      barrierIndex: Math.max(localCustody.barrierIndex, settledThroughLogIndex),
    }, settledThroughLogIndex);
  }
  return null;
}

function reconcileDurableBarrierAfterPrune(service, state, settledThroughLogIndex, options) {
  if (options?.releaseObligation === true) {
    deleteDurableMirrorRetentionCustodyIn(service, state);
    return;
  }
  const custodyFromContext = resolvePruneCustodyMetadata(
    service, settledThroughLogIndex, options,
  );
  if (custodyFromContext !== null) {
    writeDurableMirrorRetentionCustodyIn(
      service, state, custodyFromContext, settledThroughLogIndex,
    );
    return;
  }
  const existing = readDurableMirrorRetentionCustodyIn(service.db);
  if (existing !== null && settledThroughLogIndex > existing.barrierIndex) {
    writeDurableMirrorRetentionCustodyIn(
      service,
      state,
      {...existing, barrierIndex: settledThroughLogIndex},
      settledThroughLogIndex,
    );
  }
}

function deleteCapturedEffectsUpToFloorIn(service, state, normalizedFloor) {
  if (normalizedFloor <= 0 || !capturedRowEffectsTableExistsIn(service.db)) {
    return 0;
  }
  const info = state.runNonApplication(
    STATEMENT_OUTCOME_EFFECTS_SQL.DELETE_THROUGH_LOG_INDEX,
    normalizedFloor,
  );
  return normalizeSafeNonNegativeInt(info?.changes, 0);
}

function pruneSettledMirrorOutcomeEffects(service, settledThroughLogIndex, options = {}) {
  if (!canMutateMirrorOutcomeEffectsIn(service)) return 0;
  const state = sqliteConnectionState(service.db);
  const normalizedFloor = normalizeSafeNonNegativeInt(settledThroughLogIndex, 0);
  if (options?.releaseObligation === true) {
    const changes = deleteCapturedEffectsUpToFloorIn(service, state, normalizedFloor);
    deleteDurableMirrorRetentionCustodyIn(service, state);
    return changes;
  }
  const establishPin = options?.establishObligation === true;
  if (normalizedFloor <= 0 && !establishPin) return 0;
  const changes = deleteCapturedEffectsUpToFloorIn(service, state, normalizedFloor);
  if (normalizedFloor > 0) {
    advanceMirrorHandleDurableWatermark(service, normalizedFloor);
  }
  if (capturedRowEffectsTableExistsIn(service.db) || establishPin) {
    reconcileDurableBarrierAfterPrune(service, state, normalizedFloor, options);
  }
  return changes;
}

function resolveCommittedMirrorRetentionCustody(service, command) {
  if (command?.mirrorRetentionRelease === true) return null;
  if (command?.mirrorRetentionCustody && typeof command.mirrorRetentionCustody === 'object') {
    return buildMirrorRetentionCustodyRecord(command.mirrorRetentionCustody, 0);
  }
  const commandBarrier = normalizeSafeNonNegativeInt(command?.mirrorRetentionBarrierIndex, null);
  if (commandBarrier !== null) {
    return buildMirrorRetentionCustodyRecord({barrierIndex: commandBarrier}, commandBarrier);
  }
  return resolveActiveMirrorRetentionCustody(service);
}

function pruneEffectsThroughFloorIn(state, floorIndex) {
  if (Number.isSafeInteger(floorIndex) && floorIndex > 0) {
    state.runNonApplication(
      STATEMENT_OUTCOME_EFFECTS_SQL.DELETE_THROUGH_LOG_INDEX,
      floorIndex,
    );
  }
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
  const activeCustody = resolveCommittedMirrorRetentionCustody(service, command);
  if (activeCustody !== null) {
    writeDurableMirrorRetentionCustodyIn(
      service, state, activeCustody, activeCustody.barrierIndex,
    );
    pruneEffectsThroughFloorIn(state, Math.max(compactedIndex, activeCustody.barrierIndex));
    return;
  }
  deleteDurableMirrorRetentionCustodyIn(service, state);
  const steadyStateFloor = Math.max(
    compactedIndex,
    Number(index) - STEADY_STATE_MIRROR_EFFECT_RETENTION_WINDOW,
  );
  pruneEffectsThroughFloorIn(state, steadyStateFloor);
}

function isPinnedMirrorRetentionCustodyCommand(command) {
  if (!command || command.type !== PARTITION_SERVICE_OPERATION.MIRROR_RETENTION_CUSTODY) {
    return false;
  }
  if (typeof command.entryId !== 'string' || command.entryId.length === 0) return false;
  if (typeof command.partitionId !== 'string' || command.partitionId.length === 0) return false;
  if (command.action !== MIRROR_RETENTION_CUSTODY_ACTION.PIN &&
      command.action !== MIRROR_RETENTION_CUSTODY_ACTION.RELEASE) {
    return false;
  }
  return Boolean(command.custody && typeof command.custody === 'object' &&
    normalizeSafeNonNegativeInt(command.custody.barrierIndex, null) !== null);
}

function isOrdinalSuperseded(existingValue, targetValue) {
  return existingValue !== null && targetValue !== null && existingValue > targetValue;
}

function canReleaseSameWorkflowCustody(existingCustody, targetCustody) {
  return !isOrdinalSuperseded(existingCustody.workflowAttempt, targetCustody.workflowAttempt) &&
    !isOrdinalSuperseded(existingCustody.workflowFenceToken, targetCustody.workflowFenceToken);
}

function canReleaseCustodyForTarget(existingCustody, targetCustody) {
  if (!existingCustody || !targetCustody?.workflowId || !existingCustody.workflowId) {
    return true;
  }
  if (existingCustody.workflowId === targetCustody.workflowId) {
    return canReleaseSameWorkflowCustody(existingCustody, targetCustody);
  }
  return existingCustody.targetPartitionVersion !== null &&
    targetCustody.targetPartitionVersion !== null &&
    targetCustody.targetPartitionVersion >= existingCustody.targetPartitionVersion;
}

function applyMirrorRetentionCustodyCommand(service, committed) {
  const {command, index} = committed;
  committed.afterCommit(() =>
    service.emit(PARTITION_SERVICE_EVENT.ENTRY_COMMITTED, {
      partitionId: service.partitionId,
      command,
    }),
  );
  if (!isPinnedMirrorRetentionCustodyCommand(command) ||
      command.partitionId !== service.partitionId ||
      !service.db?.open) {
    committed.afterCommit(() => {
      if (command.proposedBy === service.replicaId) {
        service.resolveCommittedWrite(command.entryId, {
          success: false,
          partitionId: service.partitionId,
          logIndex: index,
        });
      }
    });
    return PARTITION_COMMITTED_COMMAND_OUTCOME.RECORDED_ONLY;
  }
  const state = sqliteConnectionState(service.db);
  const custody = buildMirrorRetentionCustodyRecord(command.custody, 0);
  const compactedIndex = service.partitionId ?
    Number(readSnapshotIndexIn(service.db, service.partitionId)) : 0;
  if (command.action === MIRROR_RETENTION_CUSTODY_ACTION.PIN) {
    writeDurableMirrorRetentionCustodyIn(service, state, custody, custody.barrierIndex);
    if (capturedRowEffectsTableExistsIn(service.db)) {
      pruneEffectsThroughFloorIn(state, Math.max(compactedIndex, custody.barrierIndex));
    }
  } else {
    const existing = readDurableMirrorRetentionCustodyIn(service.db);
    if (canReleaseCustodyForTarget(existing, custody)) {
      deleteDurableMirrorRetentionCustodyIn(service, state);
      if (capturedRowEffectsTableExistsIn(service.db)) {
        const floor = Math.max(
          compactedIndex,
          custody.barrierIndex,
          Number(index) - STEADY_STATE_MIRROR_EFFECT_RETENTION_WINDOW,
        );
        pruneEffectsThroughFloorIn(state, floor);
      }
    }
  }
  committed.afterCommit(() => {
    if (command.proposedBy === service.replicaId) {
      service.resolveCommittedWrite(command.entryId, {
        success: true,
        partitionId: service.partitionId,
        logIndex: index,
      });
    }
  });
  return PARTITION_COMMITTED_COMMAND_OUTCOME.APPLIED;
}

function extractHandleOrMetadata(handleOrMetadata) {
  if (!handleOrMetadata || typeof handleOrMetadata !== 'object') {
    return {handle: null, metadata: null};
  }
  if (handleOrMetadata.metadata && typeof handleOrMetadata.metadata === 'object') {
    return {handle: handleOrMetadata, metadata: handleOrMetadata.metadata};
  }
  return {handle: null, metadata: handleOrMetadata};
}

let custodySequenceCounter = 0;

function canProposeReplicatedCustody(service) {
  const checkRefusal = mirrorRetentionRaftHooks.partitionWriteLeadershipRefusalOf;
  const startCommit = mirrorRetentionRaftHooks.startPartitionRaftWriteCommit;
  return Boolean(
    service?.raft &&
    Array.isArray(service.replicaIds) &&
    service.replicaIds.length > 1 &&
    typeof service.partitionId === 'string' &&
    service.partitionId.length > 0 &&
    checkRefusal &&
    startCommit &&
    checkRefusal(service) === null,
  );
}

function applyLocalMirrorRetentionCustody(service, action, custody) {
  const {barrierIndex} = custody;
  if (action === MIRROR_RETENTION_CUSTODY_ACTION.PIN) {
    pruneSettledMirrorOutcomeEffects(service, barrierIndex, {
      establishObligation: true,
      custody,
    });
    return;
  }
  if (!canMutateMirrorOutcomeEffectsIn(service)) return;
  const existing = readDurableMirrorRetentionCustodyIn(service.db);
  if (canReleaseCustodyForTarget(existing, custody)) {
    pruneSettledMirrorOutcomeEffects(service, barrierIndex, {
      releaseObligation: true,
      custody,
    });
  }
}

function buildMirrorRetentionCustodyCommand(service, action, custody, nowMs) {
  custodySequenceCounter += 1;
  const workflowKey = custody.workflowId || LOCAL_WORKFLOW_KEY;
  const attemptKey = custody.workflowAttempt ?? 0;
  const fenceKey = custody.workflowFenceToken ?? 0;
  return Object.freeze({
    type: PARTITION_SERVICE_OPERATION.MIRROR_RETENTION_CUSTODY,
    entryId: `${CUSTODY_ENTRY_ID_PREFIX}:${service.partitionId}:${action}:` +
      `${workflowKey}:${attemptKey}:${fenceKey}:${custody.barrierIndex}:` +
      `${nowMs}:${custodySequenceCounter}`,
    partitionId: service.partitionId,
    action,
    custody,
    timestamp: service.hlcClock?.now?.()?.toString?.() ?? String(nowMs),
    proposedBy: service.replicaId ?? null,
    proposedAt: nowMs,
  });
}

function resolveCustodyReplicationRequest(handleOrMetadata, options = {}) {
  const {handle, metadata} = extractHandleOrMetadata(handleOrMetadata);
  const action = options.action === MIRROR_RETENTION_CUSTODY_ACTION.RELEASE ?
    MIRROR_RETENTION_CUSTODY_ACTION.RELEASE :
    MIRROR_RETENTION_CUSTODY_ACTION.PIN;
  const rawBarrier = options.barrierIndex ??
    (handle ? resolveHandleWatermarkBarrier(handle) : 0);
  const barrierIndex = normalizeSafeNonNegativeInt(rawBarrier, 0);
  const custody = buildCustodyFromMetadata(metadata, barrierIndex, options.family ?? null);
  return {action, custody};
}

async function replicateSourceMirrorRetentionCustody(
  service,
  handleOrMetadata,
  options,
) {
  if (!service) return {replicated: false};
  const {action, custody} = resolveCustodyReplicationRequest(handleOrMetadata, options);
  applyLocalMirrorRetentionCustody(service, action, custody);
  if (!canProposeReplicatedCustody(service)) {
    return {replicated: false, custody};
  }
  const nowMs = service.timeSource?.now?.() ?? Date.now();
  const command = buildMirrorRetentionCustodyCommand(service, action, custody, nowMs);
  const result = await mirrorRetentionRaftHooks.startPartitionRaftWriteCommit(
    service,
    {entry: command, phaseTimings: null, applyStartMs: nowMs},
  );
  return {replicated: result?.success === true, custody, result};
}

function releaseSourceMirrorRetentionCustody(service, handleOrMetadata, options = {}) {
  return replicateSourceMirrorRetentionCustody(service, handleOrMetadata, {
    ...options,
    action: MIRROR_RETENTION_CUSTODY_ACTION.RELEASE,
  });
}

export {
  MIRROR_RETENTION_BARRIER_ENTRY_KEY,
  MIRROR_RETENTION_BARRIER_KIND,
  MIRROR_RETENTION_CUSTODY_ACTION,
  MIRROR_RETENTION_CUSTODY_COMMAND_ERROR,
  STEADY_STATE_MIRROR_EFFECT_RETENTION_WINDOW,
  applyMirrorRetentionCustodyCommand,
  isPinnedMirrorRetentionCustodyCommand,
  partitionOwesDurableMirrorEffects,
  pruneSettledMirrorOutcomeEffects,
  readCapturedRowEffectsIn,
  readDurableMirrorRetentionBarrierIn,
  readDurableMirrorRetentionCustodyIn,
  reconcileCommittedStatementMirrorEffects,
  registerMirrorRetentionRaftHooks,
  releaseSourceMirrorRetentionCustody,
  replicateSourceMirrorRetentionCustody,
  resolveActiveMirrorRetentionBarrierIndex,
  resolveActiveMirrorRetentionCustody,
  resolveLeaderMirrorRetentionStamp,
};
