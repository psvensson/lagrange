/**
 * Admission preconditions, WAL/byte budget enforcement, snapshot opening,
 * and age/deadline policy helpers for Call-shard retained read views.
 */

import {
  CUSTODY_STATE,
  isIncarnationAdmissible,
} from '../storage/retained-read-view-custody.js';
import {
  DEFAULT_NATIVE_HANDLE_OVERHEAD_BYTES,
  openPinnedWalReader,
  readWalFileSizeBytes,
} from './call-shard-read-view-accounting.js';
import {
  PAGED_EXECUTION_ERROR_CODE,
  buildKeysetPageQuery,
  createPagedRoutingError,
} from './call-shard-read-view-cursor.js';

const UTF8_ENCODING = 'utf8';
const DEFAULT_MAX_SHARD_ROWS = 262144;
const DEFAULT_MAX_RETAINED_VIEWS = 64;
const DEFAULT_MAX_RETAINED_BYTES = 67108864;
const DEFAULT_MAX_VIEW_AGE_MS = 30000;
const DEFAULT_REAP_INTERVAL_MS = 500;

const VIEW_ERROR_MSG = Object.freeze({
  BACKEND_NO_SNAPSHOT: 'Partition has no readable snapshot capability',
  BACKEND_NO_VIEW: 'Partition backend cannot supply a stable retained read view',
  BYTE_LIMIT_REACHED: 'Retained read-view byte limit exceeded',
  COUNT_LIMIT_REACHED: 'Retained read-view count limit reached',
  DEADLINE_BEFORE_VIEW: 'Invocation deadline expired before read-view acquisition',
  INCARNATION_ENDED:
    'Partition storage incarnation is ended or shut down for read-view acquisition',
  MANAGER_SHUTDOWN: 'Shard read-view manager is shut down',
  MISSING_READ_VIEW_ID: 'Page index > 0 arrived without an admitted readViewId',
  PARTITION_GEN_CHANGED: 'Partition generation changed for retained read view',
  STORAGE_INCARNATION_CHANGED:
    'Partition storage incarnation changed for retained read view',
  VIEW_EXPIRED: 'Retained read view expired at deadline or max age',
  VIEW_LOST: 'Retained read view is unavailable or invalidated',
  WAL_BYTE_LIMIT_REACHED: 'Retained read-view WAL byte limit exceeded',
});

function assertAcquisitionPreconditions({
  isShutdown, partitionService, incarnation, deadlineMs, nowMs, retainedCount, maxViews,
}) {
  if (isShutdown) {
    throw createPagedRoutingError(
      PAGED_EXECUTION_ERROR_CODE.READ_VIEW_UNAVAILABLE,
      VIEW_ERROR_MSG.MANAGER_SHUTDOWN,
    );
  }
  if (!partitionService || partitionService.supportsRetainedReadView === false) {
    throw createPagedRoutingError(
      PAGED_EXECUTION_ERROR_CODE.READ_VIEW_UNAVAILABLE,
      VIEW_ERROR_MSG.BACKEND_NO_VIEW,
    );
  }
  if (!isIncarnationAdmissible(incarnation)) {
    throw createPagedRoutingError(
      PAGED_EXECUTION_ERROR_CODE.READ_VIEW_UNAVAILABLE,
      VIEW_ERROR_MSG.INCARNATION_ENDED,
    );
  }
  if (Number.isFinite(deadlineMs) && nowMs >= deadlineMs) {
    throw createPagedRoutingError(
      PAGED_EXECUTION_ERROR_CODE.READ_VIEW_EXPIRED,
      VIEW_ERROR_MSG.DEADLINE_BEFORE_VIEW,
    );
  }
  if (retainedCount >= maxViews) {
    throw createPagedRoutingError(
      PAGED_EXECUTION_ERROR_CODE.READ_VIEW_UNAVAILABLE,
      VIEW_ERROR_MSG.COUNT_LIMIT_REACHED,
    );
  }
}

function resolveManagerLimits(options) {
  const maxRetainedBytes = options.maxRetainedBytes ?? DEFAULT_MAX_RETAINED_BYTES;
  const maxViewAgeMs = options.maxViewAgeMs === undefined ?
    DEFAULT_MAX_VIEW_AGE_MS :
    options.maxViewAgeMs;
  const maxIdleMs = options.maxIdleMs === undefined ?
    maxViewAgeMs :
    options.maxIdleMs;
  const reapIntervalMs = options.reapIntervalMs ?? DEFAULT_REAP_INTERVAL_MS;
  return {
    maxIdleMs,
    maxRetainedBytes,
    maxRetainedViews: options.maxRetainedViews ?? DEFAULT_MAX_RETAINED_VIEWS,
    maxRetainedWalBytes: options.maxRetainedWalBytes ?? maxRetainedBytes,
    maxViewAgeMs,
    nativeHandleOverheadBytes:
      options.nativeHandleOverheadBytes ?? DEFAULT_NATIVE_HANDLE_OVERHEAD_BYTES,
    nowProvider: options.nowProvider ?? (() => Date.now()),
    reapIntervalMs,
  };
}

function isViewTimedOut(view, nowMs, limits) {
  if (Number.isFinite(view.deadlineMs) && nowMs >= view.deadlineMs) {
    return true;
  }
  if (Number.isFinite(limits.maxViewAgeMs) &&
      nowMs - view.createdAtMs >= limits.maxViewAgeMs) {
    return true;
  }
  return Number.isFinite(limits.maxIdleMs) &&
    nowMs - view.lastReadAtMs >= limits.maxIdleMs;
}

function assertViewActive(view) {
  if (!view || view.invalidated || view.released || view.fenced ||
      view.custodyState !== CUSTODY_STATE.ACTIVE) {
    throw createPagedRoutingError(
      PAGED_EXECUTION_ERROR_CODE.READ_VIEW_LOST,
      VIEW_ERROR_MSG.VIEW_LOST,
    );
  }
}

function resolveEffectiveDeadline(request, view) {
  const reqDeadline = Number.isFinite(request.deadlineMs) ?
    request.deadlineMs :
    Number.POSITIVE_INFINITY;
  const viewDeadline = Number.isFinite(view.deadlineMs) ?
    view.deadlineMs :
    Number.POSITIVE_INFINITY;
  return Math.min(reqDeadline, viewDeadline);
}

function resolveCheckTargetService(request, view) {
  if (request.partitionService) {
    return request.partitionService;
  }
  return view.partitionServiceRef;
}

function assertFileWalBudgets(dbPath, totals, limits) {
  const additionalWal = totals.walBytesByDbPath.has(dbPath) ?
    0 :
    readWalFileSizeBytes(dbPath);
  if (totals.totalObservedWalBytes + additionalWal > limits.maxRetainedWalBytes) {
    throw createPagedRoutingError(
      PAGED_EXECUTION_ERROR_CODE.READ_VIEW_UNAVAILABLE,
      VIEW_ERROR_MSG.WAL_BYTE_LIMIT_REACHED,
    );
  }
  const projectedTotal =
    totals.totalPinnedBytes + additionalWal + limits.nativeHandleOverheadBytes;
  if (projectedTotal > limits.maxRetainedBytes) {
    throw createPagedRoutingError(
      PAGED_EXECUTION_ERROR_CODE.READ_VIEW_UNAVAILABLE,
      VIEW_ERROR_MSG.BYTE_LIMIT_REACHED,
    );
  }
}

async function openSnapshotHandle({
  incarnation, partitionId, partitionService, statement,
  keyColumns, boundParameters, deadlineMs, totals, limits, options,
}) {
  if (incarnation.dbPath) {
    assertFileWalBudgets(incarnation.dbPath, totals, limits);
    const {readerDb, snapshotMeta} = openPinnedWalReader(
      incarnation.dbPath,
      partitionId,
      options,
    );
    return {
      nativeHandleBytes: limits.nativeHandleOverheadBytes,
      readerDb,
      snapshotBufferBytes: 0,
      snapshotMeta,
      snapshotRows: null,
    };
  }
  if (partitionService.executeQuery) {
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
        resultMaxBytes: limits.maxRetainedBytes,
        resultMaxRows: DEFAULT_MAX_SHARD_ROWS,
      },
    );
    const snapshotRows = Object.freeze([...(res?.rows || [])]);
    const snapshotBufferBytes = Buffer.byteLength(
      JSON.stringify(snapshotRows), UTF8_ENCODING);
    if (totals.totalPinnedBytes + snapshotBufferBytes > limits.maxRetainedBytes) {
      throw createPagedRoutingError(
        PAGED_EXECUTION_ERROR_CODE.READ_VIEW_UNAVAILABLE,
        VIEW_ERROR_MSG.BYTE_LIMIT_REACHED,
      );
    }
    return {
      nativeHandleBytes: 0,
      readerDb: null,
      snapshotBufferBytes,
      snapshotMeta: null,
      snapshotRows,
    };
  }
  throw createPagedRoutingError(
    PAGED_EXECUTION_ERROR_CODE.READ_VIEW_UNAVAILABLE,
    VIEW_ERROR_MSG.BACKEND_NO_SNAPSHOT,
  );
}

export {
  VIEW_ERROR_MSG,
  assertAcquisitionPreconditions,
  assertViewActive,
  isViewTimedOut,
  openSnapshotHandle,
  resolveCheckTargetService,
  resolveEffectiveDeadline,
  resolveManagerLimits,
};
