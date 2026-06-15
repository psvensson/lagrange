/**
 * Authoritative catch-up hydration for CDC-propagated system tables
 * (closure record CL-014).
 *
 * Why: remote CDC fan-out is stateless point-in-time delivery — the
 * partition leader's local subscriber fans each event to the message
 * groups that are ACTIVE in the sender's cache AT EVENT TIME, with no
 * buffer, retry, or replay for groups that become targetable later. A
 * joining node therefore has a window between its one-shot bootstrap
 * snapshot and the moment its message group becomes fan-out-targetable in
 * which every row written is silently lost to it. Witnessed: all four
 * joiners frozen at publication epoch 1 for the rest of a run while the
 * owner committed epochs 2-5 inside that window — and the scenario's
 * historical CONVERGED/SLOW/STALLED non-determinism is exactly this race
 * (a run converges iff the last publication write postdates the last
 * joiner's targetability).
 *
 * The systemic shape is pull-on-arm + push-stream-after: once CDC
 * subscriptions are confirmed, re-read every CDC-propagated table from
 * the authoritative owner path and apply the rows through the canonical
 * merge-safe cache repair. This closes the window for ALL propagated
 * tables, not just the one that happened to bite, and reuses the existing
 * authoritative read flow (owner-RPC fallback, pressure deferral) and
 * applyAuthoritativeCacheRepair (canonicalization + stale-merge guards in
 * the cache itself).
 */

import {CDC_PROPAGATED_TABLES} from '../cache/cdc-table-policy.js';
import {getControlPlaneRetryAfterMs} from
  '../control-plane/control-plane-error-classification.js';
import {AUTHORITATIVE_READ_SOURCE} from './cdc-integration-service-shared-constants.js';

const CATCHUP_DEFAULT = Object.freeze({
  MAX_ATTEMPTS_PER_TABLE: 3,
  RETRY_FALLBACK_DELAY_MS: 500,
  UPSERT_OPERATION: 'UPSERT',
});

const CATCHUP_LOG_MSG = Object.freeze({
  SUMMARY: 'CDC catch-up hydration completed',
  TABLE_FAILED: 'CDC catch-up hydration table read failed',
});

/**
 * Re-read every CDC-propagated system table from the authoritative owner
 * path and apply the rows into the local cache.
 *
 * Failure semantics: best-effort per table with bounded retries on
 * pressure-deferred reads; a table that cannot be read is recorded and
 * skipped — the caller must never block readiness on catch-up, because
 * the steady-state stream and the existing repair paths remain available.
 *
 * @param {Object} service - CDCIntegrationService instance (provides
 *   executeAuthoritativeSystemTableRead, applyAuthoritativeCacheRepair,
 *   getPrimaryKeyField, logger, sleep-capable timers).
 * @param {Object} [options]
 * @param {string[]} [options.tables] - Override the table set (tests).
 * @param {number} [options.maxAttemptsPerTable]
 * @param {Function} [options.sleep] - Injectable delay (tests).
 * @return {Promise<{tablesAttempted: number, tablesHydrated: number,
 *   rowsApplied: number, tablesFailed: string[]}>}
 */
async function hydrateCdcPropagatedTablesFromAuthority(service, options = {}) {
  const tables = Array.isArray(options.tables) && options.tables.length > 0 ?
    options.tables :
    CDC_PROPAGATED_TABLES;
  const maxAttemptsPerTable =
    Number.isFinite(options.maxAttemptsPerTable) &&
    options.maxAttemptsPerTable > 0 ?
      Math.floor(options.maxAttemptsPerTable) :
      CATCHUP_DEFAULT.MAX_ATTEMPTS_PER_TABLE;
  const sleep = typeof options.sleep === 'function' ?
    options.sleep :
    (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs));

  const now = typeof options.now === 'function' ? options.now : Date.now;
  const summary = {
    tablesAttempted: 0,
    tablesHydrated: 0,
    rowsApplied: 0,
    rowsSwept: 0,
    tablesFailed: [],
  };

  for (const tableName of tables) {
    summary.tablesAttempted += 1;
    let hydrated = false;
    let lastFailure = null;

    for (let attempt = 1; attempt <= maxAttemptsPerTable; attempt += 1) {
      let readResult = null;
      const readStartedAtMs = now();
      try {
        readResult = await service.executeAuthoritativeSystemTableRead(
          tableName,
          `SELECT * FROM ${tableName}`,
          [],
        );
      } catch (error) {
        lastFailure = error?.message || String(error);
        break;
      }

      if (readResult?.success === true) {
        const rows = Array.isArray(readResult.rows) ? readResult.rows : [];
        const primaryKeyField = service.getPrimaryKeyField(tableName);
        for (const row of rows) {
          const key = row?.[primaryKeyField];
          if (key === undefined || key === null) {
            continue;
          }
          const applied = service.applyAuthoritativeCacheRepair(
            tableName,
            CATCHUP_DEFAULT.UPSERT_OPERATION,
            row,
            key,
          );
          if (applied) {
            summary.rowsApplied += 1;
          }
        }
        // Anti-entropy backstop: the UPSERT loop above cannot remove a row that a
        // lost DELETE resurrected. Sweep cache-only rows absent from `rows` — but
        // ONLY when the read came from the authoritative OWNER. A local-replica
        // read can be a lagging follower returning a stale/empty set, which would
        // wrongly evict live rows; the owner read is the authoritative complete
        // set. (Race-guarded against writes newer than the read.)
        const readFromOwner =
          readResult.source === AUTHORITATIVE_READ_SOURCE.OWNER_RPC_LANE;
        if (readFromOwner &&
            typeof service.applyAuthoritativeCacheSweep === 'function') {
          summary.rowsSwept += service.applyAuthoritativeCacheSweep(
            tableName,
            rows,
            readStartedAtMs,
          );
        }
        summary.tablesHydrated += 1;
        hydrated = true;
        break;
      }

      const retryAfterMs = getControlPlaneRetryAfterMs(readResult);
      const deferred =
        retryAfterMs > 0 ||
        readResult?.deferRetry === true;
      lastFailure = readResult?.error || 'authoritative read unavailable';
      if (!deferred || attempt >= maxAttemptsPerTable) {
        break;
      }
      await sleep(
        retryAfterMs > 0 ?
          retryAfterMs :
          CATCHUP_DEFAULT.RETRY_FALLBACK_DELAY_MS,
      );
    }

    if (!hydrated) {
      const deferredEntry = `${tableName}: ${lastFailure}`;
      summary.tablesFailed.push(tableName);
      service.logger?.warn?.(CATCHUP_LOG_MSG.TABLE_FAILED, {
        tableName,
        error: lastFailure,
        attempts: maxAttemptsPerTable,
        detail: deferredEntry,
      });
    }
  }

  service.logger?.info?.(CATCHUP_LOG_MSG.SUMMARY, {
    tablesAttempted: summary.tablesAttempted,
    tablesHydrated: summary.tablesHydrated,
    rowsApplied: summary.rowsApplied,
    rowsSwept: summary.rowsSwept,
    tablesFailed: summary.tablesFailed,
  });

  return summary;
}

export {
  CATCHUP_LOG_MSG,
  hydrateCdcPropagatedTablesFromAuthority,
};
