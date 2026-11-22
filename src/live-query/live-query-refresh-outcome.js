/**
 * Explicit refresh outcome owner for QueryGroup snapshot re-execution.
 *
 * Replaces nullable refresh completion with named owner outcomes so recovery
 * callers distinguish authoritative completion from failure, staleness,
 * coalescing onto an earlier in-flight snapshot, or group closure.
 */

import {normalizePositiveRetryAfterMs} from '../transport/transport-semantic-outcome.js';
import {
  LIVE_QUERY_GROUP_STATE,
  LIVE_QUERY_LOG_MSG,
  LIVE_QUERY_REFRESH_STATUS,
} from './live-query-constants.js';
import {
  buildResetNotification,
  executeSnapshotQuery,
  storeSnapshotRows,
} from './live-query-group-helpers.js';

function buildRefreshOutcome(status, generation, extra = {}) {
  return Object.freeze({
    status,
    generation,
    retryAfterMs: null,
    error: null,
    notification: null,
    ...extra,
  });
}

function isRefreshOutcomeCompleted(outcome) {
  return outcome?.status === LIVE_QUERY_REFRESH_STATUS.COMPLETED;
}

function isRefreshOutcomeSettled(group, outcome) {
  if (!group?.sqlQueryEngine) {
    return outcome?.status === LIVE_QUERY_REFRESH_STATUS.NO_ENGINE;
  }
  return isRefreshOutcomeCompleted(outcome);
}

function applySuccessfulRefresh(group, result, currentGeneration) {
  const rawRows = result.rows ?? result.results ?? [];
  const newRows = rawRows.map((row) => group.projectRow(row));
  group.lastResultSet = newRows;
  group.resultSet.clear();
  storeSnapshotRows(group.resultSet, (row) => group.getRowPrimaryKey(row), rawRows);

  const count = Number.isFinite(result.count) ? result.count : newRows.length;
  const resetNotification = buildResetNotification({
    queryId: group.queryId,
    newRows,
    count,
    generation: currentGeneration,
  });
  group._broadcastReset(resetNotification);
  return buildRefreshOutcome(
    LIVE_QUERY_REFRESH_STATUS.COMPLETED,
    currentGeneration,
    {notification: resetNotification},
  );
}

function scheduleFollowupRefreshIfNeeded(group) {
  group.refreshInFlight = false;
  if (!group.refreshPending) return;
  group.refreshPending = false;
  if (group.lifecycleState !== LIVE_QUERY_GROUP_STATE.CLOSED) {
    queueMicrotask(() => group.refreshQueryResult());
  }
}

/**
 * Execute one serialized QueryGroup snapshot refresh and return a named outcome.
 * @param {Object} group - QueryGroup instance.
 * @return {Promise<Object>} Explicit refresh outcome record.
 */
async function executeGroupRefreshOutcome(group) {
  if (group.lifecycleState === LIVE_QUERY_GROUP_STATE.CLOSED) {
    return buildRefreshOutcome(LIVE_QUERY_REFRESH_STATUS.CLOSED, group.refreshGeneration);
  }
  if (!group.sqlQueryEngine) {
    return buildRefreshOutcome(LIVE_QUERY_REFRESH_STATUS.NO_ENGINE, group.refreshGeneration);
  }
  if (group.refreshInFlight) {
    group.refreshPending = true;
    return buildRefreshOutcome(LIVE_QUERY_REFRESH_STATUS.COALESCED, group.refreshGeneration);
  }

  group.refreshInFlight = true;
  const currentGeneration = ++group.refreshGeneration;
  try {
    const sql = group._resolveExecutionSQL();
    const result = await executeSnapshotQuery(group.sqlQueryEngine, sql, group.params);
    if (group.lifecycleState === LIVE_QUERY_GROUP_STATE.CLOSED) {
      return buildRefreshOutcome(LIVE_QUERY_REFRESH_STATUS.CLOSED, currentGeneration);
    }
    if (currentGeneration < group.refreshGeneration) {
      return buildRefreshOutcome(LIVE_QUERY_REFRESH_STATUS.STALE, currentGeneration);
    }
    return applySuccessfulRefresh(group, result, currentGeneration);
  } catch (error) {
    group.logger.error(LIVE_QUERY_LOG_MSG.REEXECUTION_FAILED, {
      queryId: group.queryId,
      error: error.message,
    });
    return buildRefreshOutcome(LIVE_QUERY_REFRESH_STATUS.FAILED, currentGeneration, {
      error: error.message,
      retryAfterMs: normalizePositiveRetryAfterMs(error?.retryAfterMs, null),
    });
  } finally {
    scheduleFollowupRefreshIfNeeded(group);
  }
}

export {
  executeGroupRefreshOutcome,
  isRefreshOutcomeCompleted,
  isRefreshOutcomeSettled,
};
