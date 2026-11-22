/**
 * Owner of per-shard retained read-view custody and local partition page reads
 * for Call-shard paged execution (Q3 / 0.4.1 physical custody repair).
 */

import {
  CUSTODY_STATE,
  POLICY_DOMAIN,
  endStorageIncarnationCustody,
  isIncarnationAdmissible,
  markCustodyCloseFailed,
  registerRetainedReaderCustody,
  resolveStorageIncarnation,
  unregisterRetainedReaderCustody,
} from '../storage/retained-read-view-custody.js';
import {
  buildViewRecord,
  closeReaderHandle,
  queryRowsFromRetainedView,
  recomputeRetainedByteTotals,
  resolvePrevTuple,
  toPagedCellBatch,
} from './call-shard-read-view-accounting.js';
import {
  PAGED_CONSISTENCY_SCOPE,
  PAGED_EXECUTION_ERROR_CODE,
  buildKeysetPageCursor,
  createPagedRoutingError,
  measureAndVerifyPageRows,
  resolveDeterministicKeyColumns,
  sha256Hex,
} from './call-shard-read-view-cursor.js';
import {
  VIEW_ERROR_MSG,
  assertAcquisitionPreconditions,
  assertViewActive,
  isViewTimedOut,
  openSnapshotHandle,
  resolveCheckTargetService,
  resolveEffectiveDeadline,
  resolveManagerLimits,
} from './call-shard-read-view-policies.js';

const DEFAULT_PAGE_ROW_BOUND = 4096;
const DEFAULT_PAGE_BYTE_BOUND = 8388608;
const DEFAULT_ATTEMPT_ID = 'attempt-1';
const INVALIDATED_DEFAULT_REASON = 'invalidated';
const PARTITION_VERSION_CHANGED_REASON = 'partition_version_changed';
const STORAGE_INCARNATION_CHANGED_REASON = 'storage_incarnation_changed';
const VIEW_EXPIRED_REASON = 'view_expired';
const MANAGER_SHUTDOWN_REASON = 'manager_shutdown';
const CLOSE_MODE_RELEASE = 'release';
const CLOSE_MODE_INVALIDATE = 'invalidate';
const DEFAULT_CLOSE_FAILED_REASON = 'close_failed';

function createShardReadViewManager(options = {}) {
  const limits = resolveManagerLimits(options);
  const customCloseReader = options.closeReader ?? null;
  const activeViews = new Map();
  const unclosedViews = new Map();
  let viewCounter = 0;
  let reapedViewCount = 0;
  let closeFailureCount = 0;
  let isShutdown = false;
  let reaperTimer = null;

  function refreshTotals() {
    return recomputeRetainedByteTotals(activeViews, unclosedViews);
  }

  function maybeStopReaper() {
    if (reaperTimer && activeViews.size === 0 && unclosedViews.size === 0) {
      clearInterval(reaperTimer);
      reaperTimer = null;
    }
  }

  function recordCloseFailure(view, closeResult, reason) {
    closeFailureCount += 1;
    view.custodyState = CUSTODY_STATE.CLOSING_FAILED;
    view.closeAttempts += 1;
    view.lastCloseError = closeResult.error ?
      String(closeResult.error.message) :
      DEFAULT_CLOSE_FAILED_REASON;
    view.fenced = true;
    view.invalidated = true;
    view.invalidationReason = reason;
    activeViews.delete(view.readViewId);
    unclosedViews.set(view.readViewId, view);
    markCustodyCloseFailed(view.readViewId, closeResult.error);
    refreshTotals();
    return false;
  }

  function closeAndSettleView(view, mode, reason) {
    const closeResult = closeReaderHandle(view.readerDb, view, customCloseReader);
    if (!closeResult.closed) {
      return recordCloseFailure(view, closeResult, reason);
    }
    view.custodyState = CUSTODY_STATE.CLOSED;
    view.readerDb = null;
    view.fenced = true;
    if (mode === CLOSE_MODE_RELEASE) {
      view.released = true;
    } else {
      view.invalidated = true;
      view.invalidationReason = reason;
    }
    activeViews.delete(view.readViewId);
    unclosedViews.delete(view.readViewId);
    unregisterRetainedReaderCustody(view.readViewId);
    refreshTotals();
    maybeStopReaper();
    return true;
  }

  function releaseReadView(readViewId) {
    const view = activeViews.get(readViewId) ?? unclosedViews.get(readViewId);
    if (!view) return false;
    return closeAndSettleView(view, CLOSE_MODE_RELEASE, INVALIDATED_DEFAULT_REASON);
  }

  function invalidateReadView(readViewId, reason = INVALIDATED_DEFAULT_REASON) {
    const view = activeViews.get(readViewId) ?? unclosedViews.get(readViewId);
    if (!view) return false;
    return closeAndSettleView(view, CLOSE_MODE_INVALIDATE, reason);
  }

  function retryUnclosedViews(closedIds, failedIds) {
    for (const view of [...unclosedViews.values()]) {
      const mode = view.released ? CLOSE_MODE_RELEASE : CLOSE_MODE_INVALIDATE;
      if (closeAndSettleView(view, mode, view.invalidationReason)) {
        closedIds.push(view.readViewId);
      } else {
        failedIds.push(view.readViewId);
      }
    }
  }

  function reapExpiredViews(nowMs = limits.nowProvider()) {
    const closedIds = [];
    const failedIds = [];
    retryUnclosedViews(closedIds, failedIds);
    for (const view of [...activeViews.values()]) {
      const currentIncarnation = resolveStorageIncarnation(view.partitionServiceRef);
      const incarnationGone =
        currentIncarnation.incarnationKey !== view.incarnation.incarnationKey ||
        !isIncarnationAdmissible(currentIncarnation);
      if (isViewTimedOut(view, nowMs, limits) || incarnationGone) {
        const reason = incarnationGone ?
          STORAGE_INCARNATION_CHANGED_REASON :
          VIEW_EXPIRED_REASON;
        reapedViewCount += 1;
        if (closeAndSettleView(view, CLOSE_MODE_INVALIDATE, reason)) {
          closedIds.push(view.readViewId);
        } else {
          failedIds.push(view.readViewId);
        }
      }
    }
    refreshTotals();
    return Object.freeze({closedIds, failedIds});
  }

  function ensureReaperRunning() {
    if (reaperTimer || !Number.isFinite(limits.reapIntervalMs) ||
        limits.reapIntervalMs <= 0) {
      return;
    }
    reaperTimer = setInterval(() => {
      reapExpiredViews(limits.nowProvider());
    }, limits.reapIntervalMs);
    reaperTimer.unref?.();
  }

  function releaseAttemptReadViews(invocationId, attemptId = null) {
    let releasedCount = 0;
    for (const collection of [activeViews, unclosedViews]) {
      for (const [viewId, view] of [...collection.entries()]) {
        if (view.invocationId === invocationId &&
            (attemptId === null || view.attemptId === attemptId) &&
            releaseReadView(viewId)) {
          releasedCount += 1;
        }
      }
    }
    return releasedCount;
  }

  async function acquireReadView({
    invocationId,
    attemptId = DEFAULT_ATTEMPT_ID,
    partitionId,
    partitionVersion = 1,
    bindingVersionId = null,
    hostNodeId = null,
    partitionService,
    deadlineMs,
    statement,
    keyColumns,
    boundParameters = [],
  }) {
    const nowMs = limits.nowProvider();
    reapExpiredViews(nowMs);
    const incarnation = resolveStorageIncarnation(partitionService);
    assertAcquisitionPreconditions({
      deadlineMs, incarnation, isShutdown, maxViews: limits.maxRetainedViews,
      nowMs, partitionService, retainedCount: activeViews.size + unclosedViews.size,
    });
    const opened = await openSnapshotHandle({
      boundParameters, deadlineMs, incarnation, keyColumns, limits, options,
      partitionId, partitionService, statement, totals: refreshTotals(),
    });
    viewCounter += 1;
    const readViewId =
      `rv:${invocationId}:${attemptId}:${partitionId}:${viewCounter}`;
    const viewRecord = buildViewRecord({
      attemptId, bindingVersionId, createdAtMs: nowMs, deadlineMs, hostNodeId,
      incarnation, invocationId, keyColumns,
      nativeHandleBytes: opened.nativeHandleBytes,
      partitionId, partitionService, partitionVersion, readViewId,
      readerDb: opened.readerDb, snapshotBufferBytes: opened.snapshotBufferBytes,
      snapshotMeta: opened.snapshotMeta, snapshotRows: opened.snapshotRows,
    });
    activeViews.set(readViewId, viewRecord);
    registerRetainedReaderCustody({
      closeHandler: (reason) => invalidateReadView(readViewId, reason),
      incarnation, policyDomain: POLICY_DOMAIN.QUERY_READ_VIEW, viewId: readViewId,
    });
    const postTotals = refreshTotals();
    if (postTotals.totalObservedWalBytes > limits.maxRetainedWalBytes ||
        postTotals.totalPinnedBytes > limits.maxRetainedBytes) {
      closeAndSettleView(viewRecord, CLOSE_MODE_INVALIDATE, VIEW_ERROR_MSG.BYTE_LIMIT_REACHED);
      throw createPagedRoutingError(
        PAGED_EXECUTION_ERROR_CODE.READ_VIEW_UNAVAILABLE,
        postTotals.totalObservedWalBytes > limits.maxRetainedWalBytes ?
          VIEW_ERROR_MSG.WAL_BYTE_LIMIT_REACHED :
          VIEW_ERROR_MSG.BYTE_LIMIT_REACHED,
      );
    }
    ensureReaperRunning();
    return viewRecord;
  }

  function assertHealthyReadView(view, request) {
    assertViewActive(view);
    const nowMs = limits.nowProvider();
    if (nowMs >= resolveEffectiveDeadline(request, view) ||
        isViewTimedOut(view, nowMs, limits)) {
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
    const currentIncarnation = resolveStorageIncarnation(
      resolveCheckTargetService(request, view),
    );
    if (currentIncarnation.incarnationKey !== view.incarnation.incarnationKey ||
        !isIncarnationAdmissible(currentIncarnation)) {
      invalidateReadView(view.readViewId, STORAGE_INCARNATION_CHANGED_REASON);
      throw createPagedRoutingError(
        PAGED_EXECUTION_ERROR_CODE.READ_VIEW_LOST,
        VIEW_ERROR_MSG.STORAGE_INCARNATION_CHANGED,
      );
    }
  }

  function readPage(request) {
    reapExpiredViews(limits.nowProvider());
    const {
      readViewId, statement, keyColumns,
      boundParameters = [], pageCursor = null, pageIndex = 0,
      pageRowBound = DEFAULT_PAGE_ROW_BOUND,
      pageByteBound = DEFAULT_PAGE_BYTE_BOUND,
    } = request;
    const view = activeViews.get(readViewId);
    assertHealthyReadView(view, request);
    view.lastReadAtMs = limits.nowProvider();
    refreshTotals();
    const resolvedKeys = Array.isArray(keyColumns) && keyColumns.length > 0 ?
      keyColumns : resolveDeterministicKeyColumns(statement);
    const prevTuple = resolvePrevTuple(
      pageCursor, pageIndex, resolvedKeys, readViewId);
    const {rows, hasMore} = queryRowsFromRetainedView(
      view, statement, resolvedKeys, boundParameters, prevTuple, pageRowBound);
    const {lastTuple, pageBytes} = measureAndVerifyPageRows(
      rows, resolvedKeys, prevTuple, pageByteBound);
    const nextCursor = rows.length > 0 ?
      buildKeysetPageCursor({
        keyColumns: resolvedKeys, lastKeyTuple: lastTuple, pageIndex, readViewId,
      }) : pageCursor;
    const batch = toPagedCellBatch(rows, pageRowBound);
    const inputDigest = sha256Hex(JSON.stringify({
      boundParameters, pageIndex, readViewId, rowCount: rows.length, rows,
    }));
    return Object.freeze({
      batch,
      pageMeta: Object.freeze({
        checkpointGeneration: view.checkpointGeneration,
        consistencyScope: PAGED_CONSISTENCY_SCOPE,
        hasMore,
        inputDigest,
        keyColumns: resolvedKeys,
        nextCursor,
        pageBytes,
        pageIndex,
        readViewId,
        rowCount: rows.length,
        schemaVersion: view.schemaVersion,
        snapshotAppliedIndex: view.snapshotAppliedIndex,
        snapshotTerm: view.snapshotTerm,
        storageIncarnationId: view.storageIncarnationId,
      }),
      rows,
    });
  }

  function stats() {
    reapExpiredViews(limits.nowProvider());
    const totals = refreshTotals();
    return Object.freeze({
      activeViewCount: activeViews.size,
      closeFailureCount,
      reapedViewCount,
      retainedViewCount: activeViews.size + unclosedViews.size,
      totalNativeHandleBytes: totals.totalNativeHandleBytes,
      totalObservedWalBytes: totals.totalObservedWalBytes,
      totalPinnedBytes: totals.totalPinnedBytes,
      totalSnapshotBufferBytes: totals.totalSnapshotBufferBytes,
      unclosedViewCount: unclosedViews.size,
    });
  }

  function shutdown() {
    isShutdown = true;
    if (reaperTimer) {
      clearInterval(reaperTimer);
      reaperTimer = null;
    }
    const closedIds = [];
    const failedIds = [];
    for (const view of [...activeViews.values(), ...unclosedViews.values()]) {
      if (closeAndSettleView(view, CLOSE_MODE_INVALIDATE, MANAGER_SHUTDOWN_REASON)) {
        closedIds.push(view.readViewId);
      } else {
        failedIds.push(view.readViewId);
      }
    }
    return Object.freeze({
      closedIds: Object.freeze(closedIds),
      failedIds: Object.freeze(failedIds),
      ok: failedIds.length === 0,
    });
  }

  return Object.freeze({
    acquireReadView,
    getCustodyRecord: (readViewId) =>
      activeViews.get(readViewId) || unclosedViews.get(readViewId) || null,
    getReadView: (readViewId) => activeViews.get(readViewId) || null,
    invalidateReadView,
    readPage,
    reapExpiredViews,
    releaseAttemptReadViews,
    releaseReadView,
    retireStorageIncarnation: (target, reason) =>
      endStorageIncarnationCustody(target, reason),
    shutdown,
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
  if ((pageRequest.pageIndex ?? 0) > 0) {
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
    payload?.partitionFence?.partitionVersion ?? 1);
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
    pageIndex: pageRequest.pageIndex ?? 0,
    pageRowBound,
    partitionService,
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
};
