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
 * authoritative read flow (explicit local bootstrap or owner RPC, pressure deferral) and
 * applyAuthoritativeCacheRepair (canonicalization + stale-merge guards in
 * the cache itself).
 */

import {CDC_PROPAGATED_TABLES} from '../cache/cdc-table-policy.js';
import {resolveTimeSource} from '../time/time-source.js';
import {getControlPlaneRetryAfterMs} from
  '../control-plane/control-plane-error-classification.js';
import {AUTHORITATIVE_READ_SOURCE} from './cdc-integration-service-shared-constants.js';
import {CDC_ERROR_CODE, CDC_TERMINAL_STAGE} from './cdc-constants.js';
import {
  captureAuthoritativeCacheSweepSnapshot,
  requireCacheMutationTarget,
} from './cdc-integration-service-cache-visibility-authority.js';
import {
  assertControlPlaneOwnerReadAuthority,
  buildControlPlaneReadAuthority,
  isCompleteAuthoritativeReadResult,
} from
  '../control-plane/control-plane-system-table-gateway-read-contracts.js';
import {CONTROL_PLANE_AUTHORITATIVE_READ_MODE, CONTROL_PLANE_READ_LEADER_MODE} from
  '../control-plane/control-plane-system-table-gateway-constants.js';
import {INITIAL_PARTITION_IDS} from
  '../bootstrap/system-table-schemas-constants.js';
import {isValidLeaderReadAuthorityWitness} from
  '../control-plane/control-plane-authoritative-read-witness.js';
import {SYSTEM_TABLE_CACHE_MUTATION_MODE} from
  '../cache/cache-constants.js';
import {captureSystemTableRows} from '../cache/system-cache-key-descriptor.js';
import {CanonicalJsonDataError, captureJsonData, isRecord} from
  '../utils/canonical-json-data.js';
import {reportWaitBoundSpent} from '../logging/wait-bound-spent.js';

const CATCHUP_DEFAULT = Object.freeze({
  MAX_ATTEMPTS_PER_TABLE: 3,
  RETRY_FALLBACK_DELAY_MS: 500,
  UPSERT_OPERATION: 'UPSERT',
});

const CATCHUP_TABLE_RETRY_WAIT = Object.freeze({
  wait: 'CATCHUP_DEFAULT.MAX_ATTEMPTS_PER_TABLE',
  awaited: 'authoritative catch-up read of one system table hydrated',
});

// Every deferred retry of one table's catch-up read is spent: the table is
// left un-hydrated (the caller's summary lists it failed). Catch-up re-runs
// per join and per publication, so the report folds per table and partition.
function reportCatchupTableRetriesSpent(service, spent) {
  const partitionId = INITIAL_PARTITION_IDS[spent.tableName] ?? null;
  reportWaitBoundSpent(service.logger, {
    ...CATCHUP_TABLE_RETRY_WAIT,
    subject: `${spent.tableName}@${partitionId}`,
    boundMs: null,
    elapsedMs: spent.elapsedMs,
    lastObserved: {
      attempts: spent.attempts,
      lastFailure: spent.lastFailure,
      retryAfterMs: spent.retryAfterMs,
    },
    scope: {nodeId: service.nodeId, tableName: spent.tableName, partitionId},
  });
}

// Which timed or one-shot compensation ran this catch-up (CDC Stage 3
// deletion evidence, design note S3.5): each run that actually changed cache
// rows is counted and logged, so a formation can show these compensations
// repair nothing before they are deleted.
const CDC_CATCHUP_TRIGGER = Object.freeze({
  JOIN_CATCHUP: 'join_catchup',
  PUBLICATIONS_SWEEP: 'publications_sweep',
  PROPAGATED_SWEEP_FAST: 'propagated_sweep_fast',
  PROPAGATED_SWEEP: 'propagated_sweep',
});
const CATCHUP_TRIGGERS = new Set(Object.values(CDC_CATCHUP_TRIGGER));

// A catch-up names the compensation that ran it: an unnamed run would be
// counted under no trigger, so it is refused before any read is issued.
const CDC_CATCHUP_REFUSAL = Object.freeze({
  TRIGGER_REQUIRED: 'cdc_catchup_trigger_required',
});

function refuseUnnamedCatchup(trigger) {
  if (CATCHUP_TRIGGERS.has(trigger)) return;
  throw Object.assign(new Error(CDC_CATCHUP_REFUSAL.TRIGGER_REQUIRED),
    {code: CDC_CATCHUP_REFUSAL.TRIGGER_REQUIRED, trigger});
}

const CATCHUP_LOG_MSG = Object.freeze({
  REPAIRED: 'CDC catch-up repaired cache rows (a compensation found a difference)',
  SUMMARY: 'CDC catch-up hydration completed',
  TABLE_FAILED: 'CDC catch-up hydration table read failed',
});
const CATCHUP_FAILURE_MSG = Object.freeze({
  INVALID_ROW_SET: 'complete authoritative read returned an invalid row set',
  MALFORMED_ROW_SET: 'authoritative read returned a malformed row set',
  INCOMPLETE_ROW_SET: 'authoritative read did not prove a complete leader row set',
  OBSERVATION_NOT_ADVANCED:
    'complete authoritative observation did not advance cache truth',
  UNAVAILABLE: 'authoritative read unavailable',
});

function captureCatchupReadWitness(readResult) {
  const witness = readResult?.readAuthorityWitness;
  if (!isRecord(witness)) return null;
  try {
    return captureJsonData(witness);
  } catch (error) {
    if (error instanceof CanonicalJsonDataError) return null;
    throw error;
  }
}

function readIsFromWitnessedLeader(tableName, readResult, witness) {
  return readResult?.source === AUTHORITATIVE_READ_SOURCE.OWNER_RPC_LANE &&
    isValidLeaderReadAuthorityWitness(
      witness,
      INITIAL_PARTITION_IDS[tableName],
    );
}

function completeObservationAdvances(service, tableName, witness, readFromLeader) {
  if (!readFromLeader) {
    return true;
  }
  const currentObservedAtMs = requireCacheMutationTarget(service)
    .getLastAuthoritativeObservedAtMs(tableName);
  const incomingObservedAtMs = Math.floor(
    Number(witness.observedAtMs),
  );
  return !Number.isFinite(currentObservedAtMs) ||
    incomingObservedAtMs > currentObservedAtMs;
}

function authoritativeReadFailure(readResult) {
  return readResult?.success === true ?
    CATCHUP_FAILURE_MSG.MALFORMED_ROW_SET :
    readResult?.error || CATCHUP_FAILURE_MSG.UNAVAILABLE;
}

function catchupTablesOf(options) {
  return Array.isArray(options.tables) && options.tables.length > 0 ?
    options.tables : CDC_PROPAGATED_TABLES;
}

function catchupAttemptsOf(options) {
  return Number.isFinite(options.maxAttemptsPerTable) && options.maxAttemptsPerTable > 0 ?
    Math.floor(options.maxAttemptsPerTable) : CATCHUP_DEFAULT.MAX_ATTEMPTS_PER_TABLE;
}

function catchupReadOptionsOf(service, options) {
  const readAuthority = options.readAuthority;
  if (readAuthority !== undefined) {
    return {readAuthority: assertControlPlaneOwnerReadAuthority(readAuthority)};
  }
  // Bootstrap can use its declared local owner before remote formation. A
  // supplied token, including a malformed one, is never replaced by this draft.
  return {readAuthority: buildControlPlaneReadAuthority({
    authoritativeReadMode: service.bootstrapMode === true ?
      CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_LOCAL_ONLY :
      CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
    leaderMode: service.bootstrapMode === true ?
      CONTROL_PLANE_READ_LEADER_MODE.ANY : CONTROL_PLANE_READ_LEADER_MODE.REQUIRED,
  })};
}

function classifyCatchupRead(run, tableName, readResult) {
  const capturedRows = captureSystemTableRows(tableName, readResult?.rows);
  const witness = captureCatchupReadWitness(readResult);
  const readFromLeader = readIsFromWitnessedLeader(tableName, readResult, witness);
  const observationAdvances = completeObservationAdvances(
    run.service, tableName, witness, readFromLeader,
  );
  const localBootstrapRead = run.readOptions.readAuthority.authoritativeReadMode ===
    CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_LOCAL_ONLY;
  const completeRowsValid = capturedRows !== null;
  // Complete effects require the original owner's whole result, not only its
  // positive rows and witness. A selected local read remains provisional even
  // if a returned answer claims a different source lane.
  const completeOwnerRead = !localBootstrapRead && readFromLeader &&
    isCompleteAuthoritativeReadResult(readResult);
  const rowCapture = observationAdvances && completeRowsValid &&
    readResult?.success === true && (localBootstrapRead || completeOwnerRead) ? capturedRows : null;
  return {observationAdvances, completeRowsValid, completeOwnerRead,
    localBootstrapRead, rowCapture, witness};
}

function catchupReadFailure(admission, readResult) {
  if (!admission.observationAdvances) {
    return CATCHUP_FAILURE_MSG.OBSERVATION_NOT_ADVANCED;
  }
  if (!admission.completeRowsValid) {
    return CATCHUP_FAILURE_MSG.INVALID_ROW_SET;
  }
  if (readResult?.success === true && !admission.localBootstrapRead &&
      !admission.completeOwnerRead) {
    return CATCHUP_FAILURE_MSG.INCOMPLETE_ROW_SET;
  }
  return authoritativeReadFailure(readResult);
}

function catchupRepairOptions(observationReceipt, readStartedAtMs) {
  if (observationReceipt === null) {
    return undefined;
  }
  return {
    mutationMode: SYSTEM_TABLE_CACHE_MUTATION_MODE.AUTHORITATIVE_OBSERVATION_RECONCILIATION,
    authoritativeObservedAtMs: observationReceipt.observedAtMs,
    authoritativeReadStartedAtMs: readStartedAtMs,
    sourceGeneration: observationReceipt.sourceGeneration,
  };
}

function applyCatchupRows(run, tableName, rowCapture, repairOptions) {
  for (let index = 0; index < rowCapture.rows.length; index += 1) {
    const applied = run.service.applyAuthoritativeCacheRepair(
      tableName, CATCHUP_DEFAULT.UPSERT_OPERATION,
      rowCapture.rows[index], rowCapture.keys[index], repairOptions,
    );
    if (applied) {
      run.summary.rowsApplied += 1;
    }
  }
}

function captureCatchupObservationReceipt(admission, mutationSnapshot) {
  if (!admission.completeOwnerRead) return null;
  const witness = admission.witness;
  return Object.freeze({
    sourceGeneration: mutationSnapshot.sourceGeneration,
    observedAtMs: witness.observedAtMs,
    term: witness.term ?? null,
    appliedIndex: witness.appliedIndex ?? null,
    commitIndex: witness.commitIndex ?? null,
    servingNodeId: witness.servingNodeId ?? null,
    partitionId: witness.partitionId ?? null,
    causeId: 'cdc-authoritative-catchup',
  });
}

function publishCatchupObservation(service, tableName, observationReceipt) {
  return Number.isFinite(requireCacheMutationTarget(service).recordAuthoritativeObservation(
    tableName, observationReceipt,
  ));
}

function applyCatchupEvidence(run, tableName, admission,
  mutationSnapshot, readStartedAtMs) {
  let observationPublished = admission.localBootstrapRead;
  const observationReceipt = captureCatchupObservationReceipt(admission, mutationSnapshot);
  const repairOptions = catchupRepairOptions(
    observationReceipt, readStartedAtMs,
  );
  applyCatchupRows(run, tableName, admission.rowCapture, repairOptions);
  // Only a complete witnessed leader response can remove cache-only rows. The
  // original pre-read snapshot guards both that absence and complete freshness
  // against image replacement or overlapping cache effects while the read waits.
  if (observationReceipt !== null) {
    run.summary.rowsSwept += run.service.applyAuthoritativeCacheSweep(
      tableName, admission.rowCapture.rows, {
        readStartedAtMs,
        mutationSnapshot,
        authoritativeObservedAtMs: observationReceipt.observedAtMs,
      },
    );
  }
  if (observationReceipt !== null && !run.isTerminal()) {
    observationPublished = publishCatchupObservation(
      run.service, tableName, observationReceipt,
    );
  }
  // The canonical apply gate refuses effects if the owner becomes terminal
  // during the read; such a table cannot be reported hydrated.
  return !run.isTerminal() && observationPublished;
}

function catchupRetryDecision(run, tableName, attempt, readResult, admission,
  firstReadStartedAtMs) {
  const retryAfterMs = getControlPlaneRetryAfterMs(readResult);
  const deferred = retryAfterMs > 0 || readResult?.deferRetry === true;
  const lastFailure = catchupReadFailure(admission, readResult);
  if (!deferred || attempt >= run.maxAttemptsPerTable) {
    if (deferred) {
      reportCatchupTableRetriesSpent(run.service, {
        tableName,
        attempts: attempt,
        lastFailure,
        retryAfterMs,
        elapsedMs: run.now() - firstReadStartedAtMs,
      });
    }
    return {delayMs: null, lastFailure};
  }
  return {
    delayMs: retryAfterMs > 0 ? retryAfterMs : CATCHUP_DEFAULT.RETRY_FALLBACK_DELAY_MS,
    lastFailure,
  };
}

function recordFailedCatchupTable(run, tableName, lastFailure) {
  const failure = run.isTerminal() ? CDC_ERROR_CODE.SHUT_DOWN : lastFailure;
  const deferredEntry = `${tableName}: ${failure}`;
  run.summary.tablesFailed.push(tableName);
  run.service.logger?.warn?.(CATCHUP_LOG_MSG.TABLE_FAILED, {
    tableName,
    error: failure,
    attempts: run.maxAttemptsPerTable,
    detail: deferredEntry,
  });
}

async function hydrateCatchupTable(run, tableName) {
  let hydrated = false;
  let lastFailure = null;
  let firstReadStartedAtMs = null;
  for (let attempt = 1; attempt <= run.maxAttemptsPerTable; attempt += 1) {
    let readResult = null;
    const mutationSnapshot = captureAuthoritativeCacheSweepSnapshot(run.service, tableName);
    const readStartedAtMs = run.now();
    firstReadStartedAtMs ??= readStartedAtMs;
    try {
      readResult = await run.service.executeAuthoritativeSystemTableRead(
        tableName, `SELECT * FROM ${tableName}`, [], run.readOptions,
      );
    } catch (error) {
      lastFailure = error?.message || String(error);
      break;
    }
    const admission = classifyCatchupRead(run, tableName, readResult);
    if (admission.rowCapture !== null) {
      hydrated = applyCatchupEvidence(
        run, tableName, admission, mutationSnapshot, readStartedAtMs,
      );
      if (!hydrated) {
        lastFailure = CATCHUP_FAILURE_MSG.OBSERVATION_NOT_ADVANCED;
      }
      run.summary.tablesHydrated += hydrated ? 1 : 0;
      break;
    }
    const retry = catchupRetryDecision(
      run, tableName, attempt, readResult, admission, firstReadStartedAtMs,
    );
    lastFailure = retry.lastFailure;
    if (retry.delayMs === null) {
      break;
    }
    await run.service.delayUntilShutdown(retry.delayMs);
    if (run.isTerminal()) {
      break;
    }
  }
  if (!hydrated) {
    recordFailedCatchupTable(run, tableName, lastFailure);
  }
}

/**
 * Count one catch-up run per trigger, and the runs that changed cache rows.
 * @param {Object} service - The CDC integration service.
 * @param {string} trigger - A CDC_CATCHUP_TRIGGER.
 * @param {Object} summary - The run's summary.
 */
function recordCatchupRepairs(service, trigger, summary) {
  service.catchupRepairCounts ??= new Map();
  const counts = service.catchupRepairCounts.get(trigger) ??
    {runs: 0, repairingRuns: 0, rowsApplied: 0, rowsSwept: 0};
  counts.runs += 1;
  if (summary.rowsApplied + summary.rowsSwept > 0) {
    counts.repairingRuns += 1;
    counts.rowsApplied += summary.rowsApplied;
    counts.rowsSwept += summary.rowsSwept;
    service.logger?.warn?.(CATCHUP_LOG_MSG.REPAIRED, {nodeId: service.nodeId, trigger,
      rowsApplied: summary.rowsApplied, rowsSwept: summary.rowsSwept, ...counts});
  }
  service.catchupRepairCounts.set(trigger, counts);
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
 *   logger, delayUntilShutdown, isShuttingDown).
 * @param {Object} options
 * @param {string} options.trigger - The CDC_CATCHUP_TRIGGER that runs this
 *   catch-up; a missing or unknown one throws CDC_CATCHUP_REFUSAL.
 * @param {string[]} [options.tables] - Override the table set (tests).
 * @param {number} [options.maxAttemptsPerTable]
 * @return {Promise<{tablesAttempted: number, tablesHydrated: number,
 *   rowsApplied: number, tablesFailed: string[], code?: string}>} `code` is
 *   CDC_ERROR_CODE.SHUT_DOWN when the owner was terminal: the tables not
 *   caught up are in tablesFailed and none was read after terminal.
 */
async function hydrateCdcPropagatedTablesFromAuthority(service, options) {
  refuseUnnamedCatchup(options?.trigger);
  // Select authority before consulting optional work or clock dependencies.
  // This exact request is retained for every table and retry.
  const readOptions = catchupReadOptionsOf(service, options);
  const tables = catchupTablesOf(options);
  const maxAttemptsPerTable = catchupAttemptsOf(options);
  // Retry uses the owner's clock and shutdown-aware delay. The data stamp is
  // also in the owner-clock domain used by row/tombstone and observation
  // producers; an explicit projection of the caller's owner clock still wins.
  const clock = resolveTimeSource(service);
  const isTerminal = () =>
    Boolean(service.refuseIfTerminal?.(CDC_TERMINAL_STAGE.CACHE_REPAIR));
  const now = typeof options.now === 'function' ? options.now : () => clock.now();
  const summary = {
    tablesAttempted: 0,
    tablesHydrated: 0,
    rowsApplied: 0,
    rowsSwept: 0,
    tablesFailed: [],
  };
  const run = {service, summary, maxAttemptsPerTable, readOptions, now, isTerminal};
  for (const tableName of tables) {
    // Each unattempted table is reported failed after the terminal boundary.
    if (isTerminal()) {
      summary.tablesFailed.push(tableName);
      continue;
    }
    summary.tablesAttempted += 1;
    await hydrateCatchupTable(run, tableName);
  }
  if (isTerminal()) {
    summary.code = CDC_ERROR_CODE.SHUT_DOWN;
  }
  recordCatchupRepairs(service, options.trigger, summary);
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
  CDC_CATCHUP_REFUSAL,
  CDC_CATCHUP_TRIGGER,
  hydrateCdcPropagatedTablesFromAuthority,
};
