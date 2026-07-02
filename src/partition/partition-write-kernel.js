import {randomUUID} from 'node:crypto';


const PARTITION_WRITE_COMMIT_MODE = Object.freeze({
  DIRECT: 'direct',
  RAFT: 'raft',
  REJECTED: 'rejected',
});

const PARTITION_WRITE_KERNEL_LITERAL = Object.freeze({
  EMPTY_STRING: '',
});

function normalizeInteger(value, fallback = null) {
  return Number.isFinite(value) ? Math.floor(value) : fallback;
}

function normalizeWriteParams(params) {
  return Array.isArray(params) ? params : [];
}

function buildPartitionWriteEntry(operation, options = {}) {
  const timestamp = options.timestamp;

  return {
    ...operation,
    entryId:
      typeof operation?.entryId === 'string' &&
        operation.entryId.length > 0 ?
        operation.entryId :
        randomUUID(),
    timestamp: timestamp === undefined ? '' : String(timestamp),
    proposedBy:
      typeof options.proposedBy === 'string' ?
        options.proposedBy :
        PARTITION_WRITE_KERNEL_LITERAL.EMPTY_STRING,
    proposedAt:
      normalizeInteger(options.proposedAt, Date.now()),
  };
}

function resolvePartitionWriteCommitMode(options = {}) {
  const replicaIds = Array.isArray(options.replicaIds) ? options.replicaIds : [];
  if (replicaIds.length <= 1) {
    return PARTITION_WRITE_COMMIT_MODE.DIRECT;
  }

  return options.raftState === options.raftLeaderState ?
    PARTITION_WRITE_COMMIT_MODE.RAFT :
    PARTITION_WRITE_COMMIT_MODE.REJECTED;
}

function executePartitionWriteStatement(db, entry, partitionId, logIndex) {
  const statement = db.prepare(entry.sql);
  const info = statement.run(...normalizeWriteParams(entry.params));

  return {
    success: true,
    changes: info.changes,
    lastInsertRowid: info.lastInsertRowid,
    partitionId,
    logIndex,
  };
}

function buildPartitionWriteFailureResult(error, partitionId, logIndex = null) {
  const result = {
    success: false,
    error: error?.message || String(error),
    partitionId,
  };
  if (Number.isFinite(logIndex)) {
    result.logIndex = Math.floor(logIndex);
  }
  return result;
}

function buildPartitionWriteSideEffectPlan(entry, executionResult) {
  if (executionResult?.success !== true) {
    return Object.freeze({
      emitCdcEntry: null,
      splitReplicationEntry: null,
      scheduleSizeUpdate: false,
      requestManagedSplitEvaluation: false,
    });
  }

  const executedEntry = {
    ...entry,
    changes: executionResult.changes,
  };

  return Object.freeze({
    emitCdcEntry: executedEntry,
    splitReplicationEntry: executedEntry,
    scheduleSizeUpdate: true,
    requestManagedSplitEvaluation: true,
  });
}

export {
  PARTITION_WRITE_COMMIT_MODE,
  buildPartitionWriteEntry,
  buildPartitionWriteFailureResult,
  buildPartitionWriteSideEffectPlan,
  executePartitionWriteStatement,
  resolvePartitionWriteCommitMode,
};
