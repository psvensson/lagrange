// Committed retention custody and retirement of
// committed statement mirror effects (_partition_statement_outcome_effects).

import {TABLES} from '../constants/tables.js';
import {materializeTypedRowSetObjects} from '../query/sql-value-codec.js';
import {sqliteConnectionState} from '../storage/sqlite-connection-state.js';
import {
  PARTITION_COMMITTED_STATEMENT_OUTCOME_SQL,
  MIRROR_RETENTION_BARRIER_ENTRY_KEY,
  MIRROR_RETENTION_BARRIER_KIND,
  MIRROR_RETENTION_CUSTODY_ACTION,
  MIRROR_RETENTION_CUSTODY_COMMAND_ERROR,
  STEADY_STATE_MIRROR_EFFECT_RETENTION_WINDOW,
} from './partition-committed-statement-outcome-constants.js';
import {
  PARTITION_TRANSITION_METADATA_FIELD,
} from './partition-constants.js';
import {
  PARTITION_COMMITTED_COMMAND_OUTCOME,
  PARTITION_SERVICE_EVENT,
  PARTITION_SERVICE_OPERATION,
} from './partition-service-constants.js';
import {MIRROR_CUSTODY_FORMAT, decodeMirrorCustodyRow, decodeMirrorReplayRecord,
  canAssumeMirrorCustody, hasObsoleteMirrorCustodyField, sameMirrorCustody, validMirrorCustody}
  from './partition-mirror-custody-codec.js';

const mirrorRetentionRaftHooks = {
  partitionWriteLeadershipRefusalOf: null,
  startPartitionRaftWriteCommit: null,
};

function registerMirrorRetentionRaftHooks(hooks = {}) {
  Object.assign(mirrorRetentionRaftHooks, hooks);
}

const SYSTEM_TABLE_NAMES_SET = Object.freeze(new Set(Object.values(TABLES)));
const STATEMENT_OUTCOME_EFFECTS_TABLE = '_partition_statement_outcome_effects';
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
    'SELECT entry_key, log_index, mutation_kind, typed_effects_json ' +
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

function isUserTableNameEligibleForMirror(tableName) {
  return typeof tableName === 'string' && tableName.length > 0 &&
    !SYSTEM_TABLE_NAMES_SET.has(tableName);
}

function buildCustodyFromMetadata(metadata, barrierIndex, family = null) {
  const meta = metadata || {};
  return {
    format: MIRROR_CUSTODY_FORMAT,
    barrierIndex,
    workflowId: meta[PARTITION_TRANSITION_METADATA_FIELD.WORKFLOW_ID] ?? null,
    workflowAttempt: meta[PARTITION_TRANSITION_METADATA_FIELD.WORKFLOW_ATTEMPT],
    workflowFenceToken:
      meta[PARTITION_TRANSITION_METADATA_FIELD.WORKFLOW_FENCE_TOKEN] ?? null,
    targetPartitionVersion:
      meta[PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_VERSION] ?? null,
    family,
  };
}

function partitionOwesDurableMirrorEffects(service, tableName = service?.tableName) {
  if (!service) return false;
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
  service, state, entryKey, logIndex, mutationKind, typedEffects, command,
) {
  ensureCapturedRowEffectsTableIn(service.db, state);
  state.runNonApplication(
    STATEMENT_OUTCOME_EFFECTS_SQL.INSERT,
    entryKey,
    logIndex,
    typeof mutationKind === 'string' ? mutationKind : null,
    JSON.stringify({typedEffects, command}),
  );
}

// Outcome rows survive effect pruning. Only the range still owed by this
// checkpoint or replay cursor requires a matching retained effect.
export function assertMirrorReplayCoverageIn(db, watermark) {
  const effectsPresent = capturedRowEffectsTableExistsIn(db);
  const missing = db.prepare(
    `SELECT o.entry_key FROM ${PARTITION_COMMITTED_STATEMENT_OUTCOME_SQL.TABLE} o ` +
    'WHERE o.mirror_effect_required = 1 AND o.log_index > ? ' +
    (effectsPresent ? `AND NOT EXISTS (SELECT 1 FROM ${STATEMENT_OUTCOME_EFFECTS_TABLE} e ` +
      'WHERE e.entry_key = o.entry_key AND e.log_index = o.log_index) ' : '') +
    'LIMIT 1',
  ).get(watermark);
  if (missing) {
    throw Object.assign(new TypeError(`Missing retained mirror effect for ${missing.entry_key}`),
      {code: MIRROR_RETENTION_CUSTODY_COMMAND_ERROR.BYTES});
  }
}

function readMirrorReplayCommandsIn(db, watermark) {
  assertMirrorReplayCoverageIn(db, watermark);
  if (!capturedRowEffectsTableExistsIn(db)) return [];
  return sqliteConnectionState(db).statement(
    'SELECT entry_key, log_index, typed_effects_json FROM _partition_statement_outcome_effects ' +
    'WHERE log_index > ? ORDER BY log_index',
  ).all(watermark).map((row) => ({
    index: row.log_index, command: decodeMirrorReplayRecord(row).command,
  }));
}

function pruneCompactedStatementOutcomeEffectsIn(db, compactedIndex) {
  if (!capturedRowEffectsTableExistsIn(db)) return;
  const custody = readDurableMirrorRetentionCustodyIn(db);
  const floor = custody && BigInt(custody.barrierIndex) < compactedIndex ?
    BigInt(custody.barrierIndex) : compactedIndex;
  pruneEffectsThroughFloorIn(sqliteConnectionState(db), floor);
}

function readCapturedRowEffectsIn(db, entryKey) {
  if (!capturedRowEffectsTableExistsIn(db)) return null;
  const row = sqliteConnectionState(db)
    .statement(STATEMENT_OUTCOME_EFFECTS_SQL.SELECT_BY_ENTRY_KEY)
    .get(entryKey);
  if (typeof row?.typed_effects_json !== 'string') return null;
  return {
    mutationKind: typeof row.mutation_kind === 'string' ? row.mutation_kind : null,
    affectedRows: materializeTypedRowSetObjects(decodeMirrorReplayRecord(row).typedEffects),
  };
}

function readDurableMirrorRetentionCustodyIn(db) {
  if (!db?.open || !capturedRowEffectsTableExistsIn(db)) return null;
  const row = sqliteConnectionState(db)
    .statement(STATEMENT_OUTCOME_EFFECTS_SQL.SELECT_BY_ENTRY_KEY)
    .get(MIRROR_RETENTION_BARRIER_ENTRY_KEY);
  return row ? decodeMirrorCustodyRow(row) : null;
}

function writeDurableMirrorRetentionCustodyIn(service, state, custody) {
  ensureCapturedRowEffectsTableIn(service.db, state);
  state.runNonApplication(
    STATEMENT_OUTCOME_EFFECTS_SQL.UPSERT_RETENTION_BARRIER,
    MIRROR_RETENTION_BARRIER_ENTRY_KEY,
    MIRROR_RETENTION_BARRIER_KIND,
    JSON.stringify(custody),
  );
}

function deleteDurableMirrorRetentionCustodyIn(service, state) {
  if (!service?.db?.open || !capturedRowEffectsTableExistsIn(service.db)) return;
  state.runNonApplication(
    STATEMENT_OUTCOME_EFFECTS_SQL.DELETE_BY_ENTRY_KEY,
    MIRROR_RETENTION_BARRIER_ENTRY_KEY,
  );
}

function resolveActiveMirrorRetentionBarrierIndex(service) {
  return readDurableMirrorRetentionCustodyIn(service.db)?.barrierIndex ?? null;
}

function pruneEffectsThroughFloorIn(state, floorIndex) {
  if (floorIndex > 0) {
    state.runNonApplication(
      STATEMENT_OUTCOME_EFFECTS_SQL.DELETE_THROUGH_LOG_INDEX,
      floorIndex,
    );
  }
}

function reconcileCommittedStatementMirrorEffects(
  service, state, entryKey, index, result, command,
) {
  persistCapturedRowEffectsIn(
    service, state, entryKey, index, result.mutationKind, result.typedEffects, command,
  );
  const custody = readDurableMirrorRetentionCustodyIn(service.db);
  pruneEffectsThroughFloorIn(state,
    custody?.barrierIndex ?? Number(index) - STEADY_STATE_MIRROR_EFFECT_RETENTION_WINDOW);
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
  return !hasObsoleteMirrorCustodyField(command) && validMirrorCustody(command.custody);
}

// One monotonically increasing release acknowledgement per source database.
// It crosses snapshot installation as application state. START may arrive
// after RELEASE when the workflow reply was lost before the source proposed.
function releasedMirrorAttemptIn(db, state) {
  if (!state.statement(STATEMENT_OUTCOME_EFFECTS_SQL.TABLE_EXISTS)
    .get('_partition_mirror_release')) return 0;
  return state.statement('SELECT attempt FROM _partition_mirror_release WHERE singleton = 1').get().attempt;
}

function recordMirrorReleaseIn(db, state, attempt) {
  db.exec('CREATE TABLE IF NOT EXISTS _partition_mirror_release ' +
    '(singleton INTEGER PRIMARY KEY CHECK(singleton = 1), attempt INTEGER NOT NULL)');
  state.runNonApplication('INSERT INTO _partition_mirror_release VALUES (1, ?) ' +
    'ON CONFLICT(singleton) DO UPDATE SET attempt = MAX(attempt, excluded.attempt)', attempt);
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
  const custody = command.custody;
  const existing = readDurableMirrorRetentionCustodyIn(service.db);
  const acquiring = command.action === MIRROR_RETENTION_CUSTODY_ACTION.PIN;
  const released = releasedMirrorAttemptIn(service.db, state);
  const matches = acquiring ?
    custody.workflowAttempt > released && (!existing || canAssumeMirrorCustody(existing, custody)) :
    !existing || sameMirrorCustody(existing, custody) || custody.workflowAttempt <= released;
  if (matches && acquiring) {
    // The first committed acquisition protects every subsequently owed effect.
    const barrierIndex = existing?.barrierIndex ?? custody.barrierIndex;
    writeDurableMirrorRetentionCustodyIn(service, state, {...custody, barrierIndex});
    pruneEffectsThroughFloorIn(state, barrierIndex);
  } else if (matches && !acquiring && custody.workflowAttempt > released) {
    recordMirrorReleaseIn(service.db, state, custody.workflowAttempt);
    if (existing) {
      deleteDurableMirrorRetentionCustodyIn(service, state);
      pruneEffectsThroughFloorIn(state, index);
    }
  }
  committed.afterCommit(() => {
    if (matches && !acquiring) {
      // Every replica consumes the terminal release, including a former
      // leader whose local execution still appears in the topology census.
      void service.retireReleasedMirrorHandle(custody).catch((error) => service.logger.error(
        'Committed mirror release could not retire its local handle', {partitionId: service.partitionId, error},
      ));
    }
    if (command.proposedBy === service.replicaId) {
      service.resolveCommittedWrite(command.entryId, {
        success: matches,
        partitionId: service.partitionId,
        logIndex: index,
      });
    }
  });
  return PARTITION_COMMITTED_COMMAND_OUTCOME.APPLIED;
}

let custodySequenceCounter = 0;

function canProposeReplicatedCustody(service) {
  const checkRefusal = mirrorRetentionRaftHooks.partitionWriteLeadershipRefusalOf;
  const startCommit = mirrorRetentionRaftHooks.startPartitionRaftWriteCommit;
  return Boolean(
    service?.raft &&
    Array.isArray(service.replicaIds) &&
    service.replicaIds.length > 0 &&
    typeof service.partitionId === 'string' &&
    service.partitionId.length > 0 &&
    checkRefusal &&
    startCommit &&
    checkRefusal(service) === null,
  );
}

function buildMirrorRetentionCustodyCommand(service, action, custody, nowMs) {
  custodySequenceCounter += 1;
  const workflowKey = custody.workflowId;
  const attemptKey = custody.workflowAttempt;
  const fenceKey = custody.workflowFenceToken;
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

async function proposeMirrorCustody(service, metadata, {family, barrierIndex}, action) {
  const custody = buildCustodyFromMetadata(metadata, barrierIndex, family);
  if (!validMirrorCustody(custody)) {
    throw Object.assign(new TypeError(MIRROR_RETENTION_CUSTODY_COMMAND_ERROR.BYTES),
      {code: MIRROR_RETENTION_CUSTODY_COMMAND_ERROR.BYTES});
  }
  if (!canProposeReplicatedCustody(service)) {
    throw new Error('Mirror retention custody proposal unavailable');
  }
  const nowMs = service.timeSource?.now?.() ?? Date.now();
  const command = buildMirrorRetentionCustodyCommand(service, action, custody, nowMs);
  const result = await mirrorRetentionRaftHooks.startPartitionRaftWriteCommit(
    service,
    {entry: command, phaseTimings: null, applyStartMs: nowMs},
  );
  if (result?.success !== true) {
    throw new Error('Mirror retention custody commitment unconfirmed', {cause: result});
  }
  return Object.freeze({partitionId: service.partitionId, action, custody,
    logIndex: result.logIndex});
}

function replicateSourceMirrorRetentionCustody(service, metadata, options) {
  return proposeMirrorCustody(service, metadata, options, MIRROR_RETENTION_CUSTODY_ACTION.PIN);
}

function releaseSourceMirrorRetentionCustody(service, metadata, options) {
  return proposeMirrorCustody(service, metadata, options, MIRROR_RETENTION_CUSTODY_ACTION.RELEASE);
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
  readCapturedRowEffectsIn,
  readMirrorReplayCommandsIn,
  pruneCompactedStatementOutcomeEffectsIn,
  readDurableMirrorRetentionCustodyIn,
  reconcileCommittedStatementMirrorEffects,
  registerMirrorRetentionRaftHooks,
  releaseSourceMirrorRetentionCustody,
  replicateSourceMirrorRetentionCustody,
  resolveActiveMirrorRetentionBarrierIndex,
};
