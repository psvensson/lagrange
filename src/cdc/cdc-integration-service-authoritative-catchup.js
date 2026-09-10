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
import {buildControlPlaneReadAuthority} from
  '../control-plane/control-plane-system-table-gateway-read-contracts.js';
import {CONTROL_PLANE_AUTHORITATIVE_READ_MODE} from
  '../control-plane/control-plane-system-table-gateway-constants.js';
import {INITIAL_PARTITION_IDS} from
  '../bootstrap/system-table-schemas-constants.js';
import {isValidLeaderReadAuthorityWitness} from
  '../control-plane/control-plane-authoritative-read-witness.js';
import {SYSTEM_TABLE_CACHE_MUTATION_MODE} from
  '../cache/cache-constants.js';
import {
  isUsableSystemCacheKey,
  resolveSystemCacheRowKey,
} from '../cache/system-cache-key-descriptor.js';

const CATCHUP_DEFAULT = Object.freeze({
  MAX_ATTEMPTS_PER_TABLE: 3,
  RETRY_FALLBACK_DELAY_MS: 500,
  UPSERT_OPERATION: 'UPSERT',
});

const CATCHUP_LOG_MSG = Object.freeze({
  SUMMARY: 'CDC catch-up hydration completed',
  TABLE_FAILED: 'CDC catch-up hydration table read failed',
});
const CATCHUP_FAILURE_MSG = Object.freeze({
  INVALID_ROW_SET: 'complete authoritative read returned an invalid row set',
  MALFORMED_ROW_SET: 'authoritative read returned a malformed row set',
  OBSERVATION_NOT_ADVANCED:
    'complete authoritative observation did not advance cache truth',
  UNAVAILABLE: 'authoritative read unavailable',
});

function successfulAuthoritativeRows(readResult) {
  return readResult?.success === true && Array.isArray(readResult.rows) ?
    readResult.rows :
    null;
}

function readIsFromWitnessedLeader(tableName, readResult) {
  return readResult?.source === AUTHORITATIVE_READ_SOURCE.OWNER_RPC_LANE &&
    isValidLeaderReadAuthorityWitness(
      readResult.readAuthorityWitness,
      INITIAL_PARTITION_IDS[tableName],
    );
}

function completeObservationAdvances(service, tableName, readResult) {
  if (!readIsFromWitnessedLeader(tableName, readResult)) {
    return true;
  }
  const cache =
    typeof service.cacheMutationTarget?.getLastAuthoritativeObservedAtMs ===
      'function' ?
      service.cacheMutationTarget :
      service.systemTableCache;
  if (typeof cache?.getLastAuthoritativeObservedAtMs !== 'function') {
    return true;
  }
  const currentObservedAtMs =
    cache.getLastAuthoritativeObservedAtMs(tableName);
  const incomingObservedAtMs = Math.floor(
    Number(readResult.readAuthorityWitness.observedAtMs),
  );
  return !Number.isFinite(currentObservedAtMs) ||
    incomingObservedAtMs > currentObservedAtMs;
}

function completeAuthoritativeRowsAreValid(tableName, rows) {
  if (!Array.isArray(rows)) {
    return false;
  }
  const keys = new Set();
  return rows.every((row) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      return false;
    }
    const key = resolveSystemCacheRowKey(tableName, row);
    const keyUsable = isUsableSystemCacheKey(key);
    const normalizedKey = String(key);
    if (!keyUsable || keys.has(normalizedKey)) {
      return false;
    }
    keys.add(normalizedKey);
    return true;
  });
}

function authoritativeReadFailure(readResult) {
  return readResult?.success === true ?
    CATCHUP_FAILURE_MSG.MALFORMED_ROW_SET :
    readResult?.error || CATCHUP_FAILURE_MSG.UNAVAILABLE;
}

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
  // The catch-up interaction accepts exactly one authority token. Callers that
  // need leader-pinned owner reads construct that token at their own boundary;
  // the default remains the join-time local-first/owner-fallback policy.
  const suppliedReadAuthority =
    options?.readAuthority && Object.isFrozen(options.readAuthority) === true ?
      options.readAuthority : null;
  const readOptions = {
    readAuthority: suppliedReadAuthority || buildControlPlaneReadAuthority({
      authoritativeReadMode:
        CONTROL_PLANE_AUTHORITATIVE_READ_MODE
          .OWNER_LOCAL_PREFERRED_OWNER_RPC_FALLBACK,
    }),
  };
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
      const mutationSnapshot =
        typeof service.captureAuthoritativeCacheSweepSnapshot === 'function' ?
          service.captureAuthoritativeCacheSweepSnapshot(tableName) :
          null;
      const readStartedAtMs = now();
      try {
        readResult = await service.executeAuthoritativeSystemTableRead(
          tableName,
          `SELECT * FROM ${tableName}`,
          [],
          readOptions,
        );
      } catch (error) {
        lastFailure = error?.message || String(error);
        break;
      }

      const observationAdvances = completeObservationAdvances(
        service,
        tableName,
        readResult,
      );
      const readFromLeader = readIsFromWitnessedLeader(
        tableName,
        readResult,
      );
      const completeRowsValid = !readFromLeader ||
        completeAuthoritativeRowsAreValid(
          tableName,
          readResult?.rows,
        );
      const rows = observationAdvances && completeRowsValid ?
        successfulAuthoritativeRows(readResult) :
        null;
      if (rows) {
        const repairOptions = readFromLeader ?
          {
            mutationMode:
              SYSTEM_TABLE_CACHE_MUTATION_MODE
                .AUTHORITATIVE_OBSERVATION_RECONCILIATION,
            authoritativeObservedAtMs:
              readResult.readAuthorityWitness.observedAtMs,
            authoritativeReadStartedAtMs: readStartedAtMs,
          } :
          undefined;
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
            repairOptions,
          );
          if (applied) {
            summary.rowsApplied += 1;
          }
        }
        // Anti-entropy backstop: the UPSERT loop above cannot remove a row that a
        // lost DELETE resurrected. Sweep cache-only rows absent from `rows` — but
        // ONLY when the read came from the witnessed authoritative LEADER. The
        // owner-RPC lane can also be served by a lagging owner follower, while a
        // local-replica read can be stale or empty; neither may authorize removal
        // of live cache rows. (Race-guarded against writes newer than the read.)
        if (readFromLeader &&
            typeof service.applyAuthoritativeCacheSweep === 'function') {
          summary.rowsSwept += service.applyAuthoritativeCacheSweep(
            tableName,
            rows,
            {
              readStartedAtMs,
              mutationSnapshot,
              authoritativeObservedAtMs:
                readResult.readAuthorityWitness.observedAtMs,
            },
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
      lastFailure = !observationAdvances ?
        CATCHUP_FAILURE_MSG.OBSERVATION_NOT_ADVANCED :
        completeRowsValid ?
          authoritativeReadFailure(readResult) :
          CATCHUP_FAILURE_MSG.INVALID_ROW_SET;
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
  hydrateCdcPropagatedTablesFromAuthority,
};
