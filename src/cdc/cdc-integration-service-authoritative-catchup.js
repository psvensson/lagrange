/**
 * Production arming owner for complete CDC coverage.
 *
 * Startup invokes this after strict CDC ingress is armed. Each table is
 * handed to the lifecycle bound reconcile owner; that owner retains debt,
 * retries under one absolute generation deadline, and keeps one cooldown
 * backstop after this startup call returns.
 */

import {CDC_PROPAGATED_TABLES} from '../cache/cdc-table-policy.js';
import {INITIAL_PARTITION_IDS} from
  '../bootstrap/system-table-schemas-constants.js';
import {CDC_ERROR_CODE, CDC_TERMINAL_STAGE} from './cdc-constants.js';
import {CDC_PIPELINE_READINESS_TIMEOUT_MS} from
  '../constants/cdc-lifecycle-constants.js';
import {reconcileCompleteCdcCoverage} from
  './cdc-complete-coverage-reconcile.js';

const CATCHUP_LOG_MSG = Object.freeze({
  SUMMARY: 'CDC catch-up hydration completed',
  TABLE_FAILED: 'CDC catch-up hydration table read failed',
});
const CATCHUP_FAILURE_REASON = Object.freeze({
  RECONCILE_UNAVAILABLE: 'cdc_coverage_reconcile_unavailable',
});

function terminal(service) {
  return Boolean(service.refuseIfTerminal?.(CDC_TERMINAL_STAGE.CACHE_REPAIR));
}

function requestFor(tableName, options) {
  return {tableName, partitionId: INITIAL_PARTITION_IDS[tableName],
    windowMs: options.windowMs, deadlineMs: options.deadlineMs};
}

function captureCatchupBudget(service, options) {
  const windowMs = Number.isSafeInteger(options.windowMs) &&
    options.windowMs > 0 ? options.windowMs : CDC_PIPELINE_READINESS_TIMEOUT_MS;
  if (options.deadlineMs !== undefined) {
    return Number.isSafeInteger(options.deadlineMs) && options.deadlineMs > 0 ?
      {windowMs, deadlineMs: options.deadlineMs} : null;
  }
  const now = service.timeSource?.now?.();
  if (!Number.isSafeInteger(now) || now < 0 ||
      now > Number.MAX_SAFE_INTEGER - windowMs) return null;
  return {windowMs, deadlineMs: now + windowMs};
}

async function hydrateCdcPropagatedTablesFromAuthority(service, options = {}) {
  const tables = Array.isArray(options.tables) && options.tables.length > 0 ?
    options.tables : CDC_PROPAGATED_TABLES;
  const summary = {tablesAttempted: 0, tablesHydrated: 0, rowsApplied: 0,
    rowsSwept: 0, tablesFailed: []};
  const budget = captureCatchupBudget(service, options);
  for (const tableName of tables) {
    if (terminal(service) || budget === null) {
      summary.tablesFailed.push(tableName);
      continue;
    }
    summary.tablesAttempted += 1;
    const partitionId = INITIAL_PARTITION_IDS[tableName];
    const outcome = typeof partitionId === 'string' ?
      await reconcileCompleteCdcCoverage(
        service, requestFor(tableName, budget)) : null;
    if (outcome?.success === true && outcome.value?.success === true) {
      summary.tablesHydrated += 1;
      summary.rowsApplied += Number.isSafeInteger(outcome.value.changes) ?
        outcome.value.changes : 0;
      continue;
    }
    summary.tablesFailed.push(tableName);
    service.logger?.warn?.(CATCHUP_LOG_MSG.TABLE_FAILED, {
      tableName, partitionId,
      error: outcome?.reasonCode ?? outcome?.value?.reasonCode ??
        CATCHUP_FAILURE_REASON.RECONCILE_UNAVAILABLE,
      generationId: outcome?.generationId ?? null,
    });
  }
  if (terminal(service)) summary.code = CDC_ERROR_CODE.SHUT_DOWN;
  service.logger?.info?.(CATCHUP_LOG_MSG.SUMMARY, summary);
  return summary;
}

export {hydrateCdcPropagatedTablesFromAuthority};
