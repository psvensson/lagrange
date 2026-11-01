/**
 * Owner of per-shard retained read-view custody and local partition page reads
 * for Call-shard paged execution (Q3).
 */

import Database from 'better-sqlite3';
import {
  CallCellValueError,
  toCellBatch,
} from '../runtime/call-cell-value-mapping.js';
import {
  PAGED_CONSISTENCY_SCOPE,
  PAGED_EXECUTION_ERROR_CODE,
  buildKeysetPageCursor,
  buildKeysetPageQuery,
  compareKeyTuples,
  createPagedRoutingError,
  extractKeyTupleFromRow,
  measureAndVerifyPageRows,
  resolveDeterministicKeyColumns,
  sha256Hex,
  validateKeysetPageCursor,
} from './call-shard-read-view-cursor.js';

const UTF8_ENCODING = 'utf8';
const MEMORY_DB_PATH = ':memory:';
const BEGIN_DEFERRED_SQL = 'BEGIN DEFERRED';
const ROLLBACK_SQL = 'ROLLBACK';
const PIN_WAL_SNAPSHOT_SQL = 'SELECT count(*) AS c FROM sqlite_master';
const DEFAULT_PAGE_ROW_BOUND = 4096;
const DEFAULT_PAGE_BYTE_BOUND = 8388608;
const DEFAULT_MAX_SHARD_ROWS = 262144;
const DEFAULT_MAX_RETAINED_VIEWS = 64;
const DEFAULT_MAX_RETAINED_BYTES = 67108864;
const DEFAULT_WAL_PIN_BYTES = 4096;
const ZERO_NUMBER = 0;
const ONE_NUMBER = 1;
const DEFAULT_ATTEMPT_ID = 'attempt-1';
const INVALIDATED_DEFAULT_REASON = 'invalidated';
const PARTITION_VERSION_CHANGED_REASON = 'partition_version_changed';

const VIEW_ERROR_MSG = Object.freeze({
  BACKEND_NO_SNAPSHOT: 'Partition has no readable snapshot capability',
  BACKEND_NO_VIEW: 'Partition backend cannot supply a stable retained read view',
  BYTE_LIMIT_REACHED: 'Retained read-view byte limit exceeded',
  COUNT_LIMIT_REACHED: 'Retained read-view count limit reached',
  CURSOR_MISSING_ON_SUBSEQUENT: 'Subsequent page reads (pageIndex > 0) require a valid pageCursor',
  DEADLINE_BEFORE_VIEW: 'Invocation deadline expired before read-view acquisition',
  MISSING_READ_VIEW_ID: 'Page index > 0 arrived without an admitted readViewId',
  PARTITION_GEN_CHANGED: 'Partition generation changed for retained read view',
  VIEW_EXPIRED: 'Retained read view expired at deadline',
  VIEW_LOST: 'Retained read view is unavailable or invalidated',
});

function resolvePartitionDbPath(partitionService) {
  const candidate = partitionService?.store?.dbPath || partitionService?.dbPath;
  return typeof candidate === 'string' &&
    candidate.length > ZERO_NUMBER &&
    candidate !== MEMORY_DB_PATH ?
    candidate :
    null;
}

function openPinnedWalReader(dbPath) {
  const readerDb = new Database(dbPath, {readonly: true});
  readerDb.exec(BEGIN_DEFERRED_SQL);
  readerDb.prepare(PIN_WAL_SNAPSHOT_SQL).get();
  return readerDb;
}

function closePinnedWalReader(readerDb) {
  if (!readerDb) return false;
  try {
    if (readerDb.open) {
      readerDb.exec(ROLLBACK_SQL);
      readerDb.close();
    }
    return true;
  } catch {
    return false;
  }
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
        rows[rows.length - ONE_NUMBER], query.keyColumns);
      const peekQuery = buildKeysetPageQuery({
        boundParameters,
        keyColumns: query.keyColumns,
        lastKeyTuple: lastRowTuple,
        pageRowBound: ONE_NUMBER,
        statement,
      });
      const peekRows = view.readerDb
        .prepare(peekQuery.sql)
        .all(...peekQuery.parameters);
      hasMore = peekRows.length > ZERO_NUMBER;
    }
    return {hasMore, keyColumns: query.keyColumns, rows};
  }
  const filtered = lastKeyTuple === null ?
    view.snapshotRows :
    view.snapshotRows.filter((row) =>
      compareKeyTuples(
        extractKeyTupleFromRow(row, query.keyColumns), lastKeyTuple) > ZERO_NUMBER);
  const rows = filtered.slice(ZERO_NUMBER, pageRowBound);
  return {hasMore: filtered.length > pageRowBound, keyColumns: query.keyColumns, rows};
}

function assertViewAcquisitionAllowed(partitionService, deadlineMs, count, maxViews) {
  if (!partitionService || partitionService.supportsRetainedReadView === false) {
    throw createPagedRoutingError(
      PAGED_EXECUTION_ERROR_CODE.READ_VIEW_UNAVAILABLE,
      VIEW_ERROR_MSG.BACKEND_NO_VIEW,
    );
  }
  if (Number.isFinite(deadlineMs) && Date.now() >= deadlineMs) {
    throw createPagedRoutingError(
      PAGED_EXECUTION_ERROR_CODE.READ_VIEW_EXPIRED,
      VIEW_ERROR_MSG.DEADLINE_BEFORE_VIEW,
    );
  }
  if (count >= maxViews) {
    throw createPagedRoutingError(
      PAGED_EXECUTION_ERROR_CODE.READ_VIEW_UNAVAILABLE,
      VIEW_ERROR_MSG.COUNT_LIMIT_REACHED,
    );
  }
}

function createShardReadViewManager(options = {}) {
  const maxRetainedViews = options.maxRetainedViews ?? DEFAULT_MAX_RETAINED_VIEWS;
  const maxRetainedBytes = options.maxRetainedBytes ?? DEFAULT_MAX_RETAINED_BYTES;
  const activeViews = new Map();
  let viewCounter = ZERO_NUMBER;
  let totalPinnedBytes = ZERO_NUMBER;

  function releaseReadView(readViewId) {
    const view = activeViews.get(readViewId);
    if (!view) return false;
    closePinnedWalReader(view.readerDb);
    totalPinnedBytes = Math.max(
      ZERO_NUMBER, totalPinnedBytes - (view.pinnedBytes || ZERO_NUMBER));
    view.released = true;
    activeViews.delete(readViewId);
    return true;
  }

  function invalidateReadView(readViewId, reason = INVALIDATED_DEFAULT_REASON) {
    const view = activeViews.get(readViewId);
    if (!view) return false;
    closePinnedWalReader(view.readerDb);
    totalPinnedBytes = Math.max(
      ZERO_NUMBER, totalPinnedBytes - (view.pinnedBytes || ZERO_NUMBER));
    view.invalidated = true;
    view.invalidationReason = reason;
    view.readerDb = null;
    return true;
  }

  function releaseAttemptReadViews(invocationId, attemptId = null) {
    let releasedCount = ZERO_NUMBER;
    for (const [viewId, view] of activeViews.entries()) {
      if (view.invocationId === invocationId &&
          (attemptId === null || view.attemptId === attemptId)) {
        releaseReadView(viewId);
        releasedCount += ONE_NUMBER;
      }
    }
    return releasedCount;
  }

  async function openSnapshotHandle(
    partitionService, statement, keyColumns, boundParameters, deadlineMs,
  ) {
    const dbPath = resolvePartitionDbPath(partitionService);
    if (dbPath) {
      return {
        pinnedBytes: DEFAULT_WAL_PIN_BYTES,
        readerDb: openPinnedWalReader(dbPath),
        snapshotRows: null,
      };
    }
    if (typeof partitionService.executeQuery === 'function') {
      const fullQuery = buildKeysetPageQuery({
        boundParameters,
        keyColumns,
        lastKeyTuple: null,
        pageRowBound: DEFAULT_MAX_SHARD_ROWS,
        statement,
      });
      const res = await partitionService.executeQuery(
        fullQuery.sql,
        fullQuery.parameters,
        {
          resultDeadlineMs: deadlineMs,
          resultMaxBytes: maxRetainedBytes,
          resultMaxRows: DEFAULT_MAX_SHARD_ROWS,
        },
      );
      const snapshotRows = Object.freeze([...(res?.rows || [])]);
      const pinnedBytes = Buffer.byteLength(
        JSON.stringify(snapshotRows), UTF8_ENCODING);
      return {pinnedBytes, readerDb: null, snapshotRows};
    }
    throw createPagedRoutingError(
      PAGED_EXECUTION_ERROR_CODE.READ_VIEW_UNAVAILABLE,
      VIEW_ERROR_MSG.BACKEND_NO_SNAPSHOT,
    );
  }

  async function acquireReadView({
    invocationId,
    attemptId = DEFAULT_ATTEMPT_ID,
    partitionId,
    partitionVersion = ONE_NUMBER,
    bindingVersionId = null,
    hostNodeId = null,
    partitionService,
    deadlineMs,
    statement,
    keyColumns,
    boundParameters = [],
  }) {
    assertViewAcquisitionAllowed(
      partitionService, deadlineMs, activeViews.size, maxRetainedViews);
    const {pinnedBytes, readerDb, snapshotRows} = await openSnapshotHandle(
      partitionService, statement, keyColumns, boundParameters, deadlineMs);
    if (totalPinnedBytes + pinnedBytes > maxRetainedBytes) {
      closePinnedWalReader(readerDb);
      throw createPagedRoutingError(
        PAGED_EXECUTION_ERROR_CODE.READ_VIEW_UNAVAILABLE,
        VIEW_ERROR_MSG.BYTE_LIMIT_REACHED,
      );
    }
    viewCounter += ONE_NUMBER;
    totalPinnedBytes += pinnedBytes;
    const readViewId =
      `rv:${invocationId}:${attemptId}:${partitionId}:${viewCounter}`;
    const viewRecord = {
      attemptId,
      bindingVersionId,
      consistencyScope: PAGED_CONSISTENCY_SCOPE,
      createdAtMs: Date.now(),
      deadlineMs,
      hostNodeId,
      invalidated: false,
      invocationId,
      keyColumns,
      partitionId,
      partitionVersion,
      pinnedBytes,
      readViewId,
      readerDb,
      snapshotRows,
    };
    activeViews.set(readViewId, viewRecord);
    return viewRecord;
  }

  function assertHealthyReadView(view, request) {
    if (!view || view.invalidated || view.released) {
      throw createPagedRoutingError(
        PAGED_EXECUTION_ERROR_CODE.READ_VIEW_LOST,
        VIEW_ERROR_MSG.VIEW_LOST,
      );
    }
    const reqDeadline = Number.isFinite(request.deadlineMs) ?
      request.deadlineMs : Number.POSITIVE_INFINITY;
    const viewDeadline = Number.isFinite(view.deadlineMs) ?
      view.deadlineMs : Number.POSITIVE_INFINITY;
    if (Date.now() >= Math.min(reqDeadline, viewDeadline)) {
      releaseReadView(view.readViewId);
      throw createPagedRoutingError(
        PAGED_EXECUTION_ERROR_CODE.READ_VIEW_EXPIRED,
        VIEW_ERROR_MSG.VIEW_EXPIRED,
      );
    }
    if (request.partitionVersion !== undefined &&
        Number(request.partitionVersion) !== Number(view.partitionVersion)) {
      invalidateReadView(view.readViewId, PARTITION_VERSION_CHANGED_REASON);
      throw createPagedRoutingError(
        PAGED_EXECUTION_ERROR_CODE.READ_VIEW_LOST,
        VIEW_ERROR_MSG.PARTITION_GEN_CHANGED,
      );
    }
  }

  function resolvePrevTuple(pageCursor, pageIndex, resolvedKeys, readViewId) {
    if (pageCursor !== null && pageCursor !== undefined) {
      validateKeysetPageCursor(pageCursor, {
        keyColumns: resolvedKeys, readViewId,
      });
      return pageCursor.lastKeyTuple;
    }
    if (pageIndex > ZERO_NUMBER) {
      throw createPagedRoutingError(
        PAGED_EXECUTION_ERROR_CODE.CURSOR_INVALID,
        VIEW_ERROR_MSG.CURSOR_MISSING_ON_SUBSEQUENT,
      );
    }
    return null;
  }

  function readPage(request) {
    const {
      readViewId,
      statement,
      keyColumns,
      boundParameters = [],
      pageCursor = null,
      pageIndex = ZERO_NUMBER,
      pageRowBound = DEFAULT_PAGE_ROW_BOUND,
      pageByteBound = DEFAULT_PAGE_BYTE_BOUND,
    } = request;
    const view = activeViews.get(readViewId);
    assertHealthyReadView(view, request);
    const resolvedKeys = Array.isArray(keyColumns) && keyColumns.length > ZERO_NUMBER ?
      keyColumns : resolveDeterministicKeyColumns(statement);
    const prevTuple = resolvePrevTuple(
      pageCursor, pageIndex, resolvedKeys, readViewId);
    const {rows, hasMore} = queryRowsFromRetainedView(
      view, statement, resolvedKeys, boundParameters, prevTuple, pageRowBound);
    const {lastTuple, pageBytes} = measureAndVerifyPageRows(
      rows, resolvedKeys, prevTuple, pageByteBound);
    const nextCursor = rows.length > ZERO_NUMBER ?
      buildKeysetPageCursor({
        keyColumns: resolvedKeys,
        lastKeyTuple: lastTuple,
        pageIndex,
        readViewId,
      }) : pageCursor;
    let batch;
    try {
      batch = toCellBatch(rows, pageRowBound);
    } catch (err) {
      if (err instanceof CallCellValueError) {
        throw createPagedRoutingError(
          PAGED_EXECUTION_ERROR_CODE.PAGE_BUDGET_EXCEEDED,
          err.message, {cause: err});
      }
      throw err;
    }
    const inputDigest = sha256Hex(JSON.stringify({
      boundParameters, pageIndex, readViewId, rowCount: rows.length, rows,
    }));
    return Object.freeze({
      batch,
      pageMeta: Object.freeze({
        consistencyScope: PAGED_CONSISTENCY_SCOPE,
        hasMore,
        inputDigest,
        keyColumns: resolvedKeys,
        nextCursor,
        pageBytes,
        pageIndex,
        readViewId,
        rowCount: rows.length,
      }),
      rows,
    });
  }

  function stats() {
    return Object.freeze({
      activeViewCount: activeViews.size,
      totalPinnedBytes,
    });
  }

  return Object.freeze({
    acquireReadView,
    getReadView: (readViewId) => activeViews.get(readViewId) || null,
    invalidateReadView,
    readPage,
    releaseAttemptReadViews,
    releaseReadView,
    stats,
  });
}

const HANDLER_READ_VIEW_MANAGERS = new WeakMap();

function getHandlerReadViewManager(handler) {
  if (handler?.readViewManager) return handler.readViewManager;
  let mgr = HANDLER_READ_VIEW_MANAGERS.get(handler);
  if (!mgr) {
    mgr = createShardReadViewManager();
    HANDLER_READ_VIEW_MANAGERS.set(handler, mgr);
  }
  return mgr;
}

function resolvePageReadBounds(pageRequest, invocation) {
  return {
    pageByteBound: pageRequest.pageByteBound ??
      invocation?.callCell?.batchByteBound ?? DEFAULT_PAGE_BYTE_BOUND,
    pageRowBound: pageRequest.pageRowBound ??
      invocation?.callCell?.batchRowBound ?? DEFAULT_PAGE_ROW_BOUND,
  };
}

async function ensureHandlerReadViewId({
  mgr, pageRequest, keyColumns, route, boundParameters,
  invocation, handler, payload, partitionService, partitionVersion,
}) {
  if (pageRequest.readViewId) return pageRequest.readViewId;
  if ((pageRequest.pageIndex ?? ZERO_NUMBER) > ZERO_NUMBER) {
    throw createPagedRoutingError(
      PAGED_EXECUTION_ERROR_CODE.READ_VIEW_LOST,
      VIEW_ERROR_MSG.MISSING_READ_VIEW_ID,
    );
  }
  const view = await mgr.acquireReadView({
    attemptId: pageRequest.attemptId || DEFAULT_ATTEMPT_ID,
    bindingVersionId: route.bindingVersionId ?? null,
    boundParameters,
    deadlineMs: invocation.deadlineMs,
    hostNodeId: handler.nodeId ?? null,
    invocationId: invocation.id,
    keyColumns,
    partitionId: payload.partitionId,
    partitionService,
    partitionVersion,
    statement: route.statement,
  });
  return view.readViewId;
}

async function executeLocalShardPageRead({
  handler, partitionService, payload, route, invocation, boundParameters,
}) {
  const pageRequest = payload.pageRequest;
  const mgr = getHandlerReadViewManager(handler);
  const keyColumns = resolveDeterministicKeyColumns(route.statement, {
    pageKey: pageRequest.pageKey ?? route.pageKey,
  });
  const partitionVersion = Number(
    payload?.partitionFence?.partitionVersion ?? ONE_NUMBER);
  const readViewId = await ensureHandlerReadViewId({
    boundParameters, handler, invocation, keyColumns,
    mgr, pageRequest, partitionService, partitionVersion, payload, route,
  });
  const {pageByteBound, pageRowBound} = resolvePageReadBounds(
    pageRequest, invocation);
  const pageResult = mgr.readPage({
    boundParameters,
    deadlineMs: invocation.deadlineMs,
    keyColumns,
    pageByteBound,
    pageCursor: pageRequest.pageCursor ?? null,
    pageIndex: pageRequest.pageIndex ?? ZERO_NUMBER,
    pageRowBound,
    partitionVersion,
    readViewId,
    statement: route.statement,
  });
  if (!pageResult.pageMeta.hasMore && pageRequest.releaseOnFinalPage !== false) {
    mgr.releaseReadView(readViewId);
  }
  return pageResult;
}

export {
  createShardReadViewManager,
  executeLocalShardPageRead,
  getHandlerReadViewManager,
};
