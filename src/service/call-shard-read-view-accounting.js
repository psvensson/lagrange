/**
 * Snapshot-local watermark observation, real `-wal` shared-file byte
 * accounting (without double counting), pinned reader query/lifecycle helpers,
 * and acknowledged reader closure for retained shard read views.
 */

import fs from 'node:fs';
import Database from 'better-sqlite3';
import {RaftRsDurableStore} from '../raft/raft-rs-durable-store.js';
import {
  CallCellValueError,
  toCellBatch,
} from '../runtime/call-cell-value-mapping.js';
import {
  CUSTODY_STATE,
  POLICY_DOMAIN,
} from '../storage/retained-read-view-custody.js';
import {
  PAGED_CONSISTENCY_SCOPE,
  PAGED_EXECUTION_ERROR_CODE,
  buildKeysetPageQuery,
  compareKeyTuples,
  createPagedRoutingError,
  extractKeyTupleFromRow,
  validateKeysetPageCursor,
} from './call-shard-read-view-cursor.js';

const WAL_SUFFIX = '-wal';
const BEGIN_DEFERRED_SQL = 'BEGIN DEFERRED';
const PIN_WAL_SNAPSHOT_SQL = 'SELECT count(*) AS c FROM sqlite_master';
const ROLLBACK_SQL = 'ROLLBACK';
const PRAGMA_SCHEMA_VERSION = 'schema_version';
const SELECT_TABLE_EXISTS_SQL =
  'SELECT 1 FROM sqlite_master WHERE type = \'table\' AND name = ?';
const SELECT_LOG_TERM_SQL =
  'SELECT term FROM _raft_rs_log WHERE group_id = ? AND log_index = ?';
const SELECT_SNAPSHOT_TERM_SQL =
  'SELECT snapshot_index, snapshot_term FROM _raft_rs_snapshot WHERE group_id = ?';
const SELECT_HARD_STATE_TERM_SQL =
  'SELECT term FROM _raft_rs_hard_state WHERE group_id = ?';
const TABLE_RAFT_RS_LOG = '_raft_rs_log';
const TABLE_RAFT_RS_SNAPSHOT = '_raft_rs_snapshot';
const TABLE_RAFT_RS_HARD_STATE = '_raft_rs_hard_state';
const DEFAULT_NATIVE_HANDLE_OVERHEAD_BYTES = 4096;
const NO_INVALIDATION_REASON = 'none';
const STAGE_AFTER_OPEN = 'after_open';
const STAGE_AFTER_PIN = 'after_pin';
const STAGE_AFTER_WATERMARK = 'after_watermark';
const CLOSE_ERR_HANDLE_STILL_OPEN = 'readerDb remained open after close';
const CLOSE_ERR_RETURNED_FALSE = 'closeReader returned false';
const CURSOR_MISSING_MSG =
  'Subsequent page reads (pageIndex > 0) require a valid pageCursor';

function readWalFileSizeBytes(dbPath) {
  if (typeof dbPath !== 'string' || dbPath.length === 0) {
    return 0;
  }
  const walPath = `${dbPath}${WAL_SUFFIX}`;
  if (!fs.existsSync(walPath)) {
    return 0;
  }
  return fs.statSync(walPath).size;
}

function tableExistsInDb(readerDb, tableName) {
  return readerDb.prepare(SELECT_TABLE_EXISTS_SQL).get(tableName) !== undefined;
}

function readLogTerm(readerDb, partitionId, snapshotAppliedIndex) {
  if (snapshotAppliedIndex === null || !tableExistsInDb(readerDb, TABLE_RAFT_RS_LOG)) {
    return null;
  }
  const row = readerDb
    .prepare(SELECT_LOG_TERM_SQL)
    .get(partitionId, BigInt(snapshotAppliedIndex));
  return row && row.term !== undefined && row.term !== null ?
    String(row.term) :
    null;
}

function readSnapshotRowTerm(readerDb, partitionId, snapshotAppliedIndex) {
  if (snapshotAppliedIndex === null || !tableExistsInDb(readerDb, TABLE_RAFT_RS_SNAPSHOT)) {
    return null;
  }
  const row = readerDb.prepare(SELECT_SNAPSHOT_TERM_SQL).get(partitionId);
  return row && String(row.snapshot_index) === String(snapshotAppliedIndex) ?
    String(row.snapshot_term) :
    null;
}

function readHardTerm(readerDb, partitionId) {
  if (!tableExistsInDb(readerDb, TABLE_RAFT_RS_HARD_STATE)) {
    return null;
  }
  const row = readerDb.prepare(SELECT_HARD_STATE_TERM_SQL).get(partitionId);
  return row && row.term !== undefined && row.term !== null ?
    String(row.term) :
    null;
}

function readPinnedSnapshotTerm(readerDb, partitionId, snapshotAppliedIndex) {
  if (typeof partitionId !== 'string' || partitionId.length === 0) {
    return null;
  }
  return readLogTerm(readerDb, partitionId, snapshotAppliedIndex) ??
    readSnapshotRowTerm(readerDb, partitionId, snapshotAppliedIndex) ??
    readHardTerm(readerDb, partitionId);
}

function readPinnedSnapshotMetadata(readerDb, partitionId) {
  const schemaVersion = readerDb.pragma(PRAGMA_SCHEMA_VERSION, {simple: true});
  const snapshotAppliedIndex = typeof partitionId === 'string' && partitionId.length > 0 ?
    RaftRsDurableStore.readAppliedIndexIn(readerDb, partitionId) :
    null;
  const snapshotTerm = readPinnedSnapshotTerm(
    readerDb,
    partitionId,
    snapshotAppliedIndex,
  );
  return Object.freeze({
    schemaVersion: Number.isInteger(schemaVersion) ? schemaVersion : null,
    snapshotAppliedIndex,
    snapshotTerm,
  });
}

function collectViewsByDbPath(activeViews, unclosedViews) {
  const fileViewsByPath = new Map();
  let totalNativeHandleBytes = 0;
  let totalSnapshotBufferBytes = 0;

  for (const collection of [activeViews, unclosedViews]) {
    for (const view of collection.values()) {
      if (view.dbPath) {
        totalNativeHandleBytes += view.nativeHandleBytes;
        let list = fileViewsByPath.get(view.dbPath);
        if (!list) {
          list = [];
          fileViewsByPath.set(view.dbPath, list);
        }
        list.push(view);
      } else {
        totalSnapshotBufferBytes += view.snapshotBufferBytes;
      }
    }
  }
  return {fileViewsByPath, totalNativeHandleBytes, totalSnapshotBufferBytes};
}

function recomputeRetainedByteTotals(activeViews, unclosedViews) {
  const {
    fileViewsByPath,
    totalNativeHandleBytes,
    totalSnapshotBufferBytes,
  } = collectViewsByDbPath(activeViews, unclosedViews);

  let totalObservedWalBytes = 0;
  const walBytesByDbPath = new Map();

  for (const [dbPath, views] of fileViewsByPath.entries()) {
    const walBytes = readWalFileSizeBytes(dbPath);
    walBytesByDbPath.set(dbPath, walBytes);
    totalObservedWalBytes += walBytes;
    const share = Math.floor(walBytes / views.length);
    const remainder = walBytes - share * views.length;
    for (let idx = 0; idx < views.length; idx += 1) {
      const attributed = share + (idx === 0 ? remainder : 0);
      views[idx].attributedWalBytes = attributed;
      views[idx].pinnedBytes = attributed + views[idx].nativeHandleBytes;
    }
  }

  return {
    totalNativeHandleBytes,
    totalObservedWalBytes,
    totalPinnedBytes:
      totalObservedWalBytes + totalNativeHandleBytes + totalSnapshotBufferBytes,
    totalSnapshotBufferBytes,
    walBytesByDbPath,
  };
}

function runCloseSteps(readerDb, view, customCloseReader) {
  if (typeof customCloseReader === 'function') {
    const outcome = customCloseReader(readerDb, view);
    const ok = typeof outcome === 'object' && outcome !== null ?
      Boolean(outcome.closed) :
      Boolean(outcome);
    if (!ok) {
      return new Error(CLOSE_ERR_RETURNED_FALSE);
    }
    return readerDb.open === true ? new Error(CLOSE_ERR_HANDLE_STILL_OPEN) : null;
  }
  if (readerDb.open) {
    if (readerDb.inTransaction) {
      readerDb.exec(ROLLBACK_SQL);
    }
    readerDb.close();
  }
  return readerDb.open === true ? new Error(CLOSE_ERR_HANDLE_STILL_OPEN) : null;
}

function closeReaderHandle(readerDb, view, customCloseReader) {
  if (!readerDb) {
    return {closed: true, error: null};
  }
  let closeError = null;
  try {
    closeError = runCloseSteps(readerDb, view, customCloseReader);
  } catch (error) {
    closeError = error;
  }
  return closeError ?
    {closed: false, error: closeError} :
    {closed: true, error: null};
}

function openPinnedWalReader(dbPath, partitionId, options, onOpenedReader) {
  const readerDb = new Database(dbPath, {readonly: true});
  onOpenedReader(readerDb);
  options.onSnapshotStage?.(STAGE_AFTER_OPEN, {dbPath, partitionId, readerDb});
  readerDb.exec(BEGIN_DEFERRED_SQL);
  readerDb.prepare(PIN_WAL_SNAPSHOT_SQL).get();
  options.onSnapshotStage?.(STAGE_AFTER_PIN, {dbPath, partitionId, readerDb});
  const snapshotMeta = readPinnedSnapshotMetadata(readerDb, partitionId);
  options.onSnapshotStage?.(STAGE_AFTER_WATERMARK, {
    dbPath,
    partitionId,
    readerDb,
    snapshotMeta,
  });
  return {readerDb, snapshotMeta};
}

function queryRowsFromRetainedView(
  view, statement, keyColumns, boundParameters, lastKeyTuple, pageRowBound,
) {
  const query = buildKeysetPageQuery({
    boundParameters, keyColumns, lastKeyTuple, pageRowBound, statement,
  });
  if (view.readerDb) {
    const rows = view.readerDb.prepare(query.sql).all(...query.parameters);
    let hasMore = false;
    if (rows.length === pageRowBound) {
      const lastRowTuple = extractKeyTupleFromRow(
        rows[rows.length - 1], query.keyColumns);
      const peekQuery = buildKeysetPageQuery({
        boundParameters,
        keyColumns: query.keyColumns,
        lastKeyTuple: lastRowTuple,
        pageRowBound: 1,
        statement,
      });
      const peekRows = view.readerDb
        .prepare(peekQuery.sql)
        .all(...peekQuery.parameters);
      hasMore = peekRows.length > 0;
    }
    return {hasMore, keyColumns: query.keyColumns, rows};
  }
  const filtered = lastKeyTuple === null ?
    view.snapshotRows :
    view.snapshotRows.filter((row) =>
      compareKeyTuples(
        extractKeyTupleFromRow(row, query.keyColumns), lastKeyTuple) > 0);
  const rows = filtered.slice(0, pageRowBound);
  return {hasMore: filtered.length > pageRowBound, keyColumns: query.keyColumns, rows};
}

function resolvePrevTuple(pageCursor, pageIndex, resolvedKeys, readViewId) {
  if (pageCursor !== null && pageCursor !== undefined) {
    validateKeysetPageCursor(pageCursor, {
      keyColumns: resolvedKeys, readViewId,
    });
    return pageCursor.lastKeyTuple;
  }
  if (pageIndex > 0) {
    throw createPagedRoutingError(
      PAGED_EXECUTION_ERROR_CODE.CURSOR_INVALID,
      CURSOR_MISSING_MSG,
    );
  }
  return null;
}

function toPagedCellBatch(rows, pageRowBound) {
  try {
    return toCellBatch(rows, pageRowBound);
  } catch (err) {
    if (err instanceof CallCellValueError) {
      throw createPagedRoutingError(
        PAGED_EXECUTION_ERROR_CODE.PAGE_BUDGET_EXCEEDED,
        err.message,
        {cause: err},
      );
    }
    throw err;
  }
}

function buildViewRecord({
  attemptId, bindingVersionId, createdAtMs, deadlineMs, hostNodeId, incarnation,
  invocationId, keyColumns, nativeHandleBytes, partitionId, partitionService,
  partitionVersion, readViewId, readerDb, snapshotBufferBytes, snapshotMeta, snapshotRows,
}) {
  return {
    attemptId,
    attributedWalBytes: 0,
    bindingVersionId,
    checkpointGeneration: incarnation.checkpointGeneration,
    closeAttempts: 0,
    consistencyScope: PAGED_CONSISTENCY_SCOPE,
    createdAtMs,
    custodyState: CUSTODY_STATE.ACTIVE,
    dbPath: incarnation.dbPath,
    deadlineMs,
    fenced: false,
    hostNodeId,
    incarnation,
    invalidated: false,
    invalidationReason: NO_INVALIDATION_REASON,
    invocationId,
    keyColumns,
    lastCloseError: NO_INVALIDATION_REASON,
    lastReadAtMs: createdAtMs,
    nativeHandleBytes,
    partitionId,
    partitionServiceRef: partitionService,
    partitionVersion,
    pinnedBytes: nativeHandleBytes + snapshotBufferBytes,
    policyDomain: POLICY_DOMAIN.QUERY_READ_VIEW,
    readViewId,
    readerDb,
    released: false,
    schemaVersion: snapshotMeta?.schemaVersion ?? null,
    snapshotAppliedIndex: snapshotMeta?.snapshotAppliedIndex ?? null,
    snapshotBufferBytes,
    snapshotRows,
    snapshotTerm: snapshotMeta?.snapshotTerm ?? null,
    storageIncarnationId: incarnation.storageIncarnationId,
  };
}

function applyOpenedSnapshotToView(viewRecord, opened) {
  viewRecord.nativeHandleBytes = opened.nativeHandleBytes;
  viewRecord.readerDb = opened.readerDb;
  viewRecord.snapshotBufferBytes = opened.snapshotBufferBytes;
  viewRecord.snapshotRows = opened.snapshotRows;
  viewRecord.schemaVersion = opened.snapshotMeta?.schemaVersion ?? null;
  viewRecord.snapshotAppliedIndex =
    opened.snapshotMeta?.snapshotAppliedIndex ?? null;
  viewRecord.snapshotTerm = opened.snapshotMeta?.snapshotTerm ?? null;
  viewRecord.pinnedBytes =
    opened.nativeHandleBytes + opened.snapshotBufferBytes;
}

export {
  DEFAULT_NATIVE_HANDLE_OVERHEAD_BYTES,
  NO_INVALIDATION_REASON,
  applyOpenedSnapshotToView,
  buildViewRecord,
  closeReaderHandle,
  openPinnedWalReader,
  queryRowsFromRetainedView,
  readPinnedSnapshotMetadata,
  readWalFileSizeBytes,
  recomputeRetainedByteTotals,
  resolvePrevTuple,
  toPagedCellBatch,
};
