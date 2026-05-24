import {CDC_INTEGRATION_SERVICE_SHARED} from './cdc-integration-service-shared.js';

const {
  AUTHORITATIVE_FALLBACK_OUTCOME,
  AUTHORITATIVE_FALLBACK_PHASE,
  AUTHORITATIVE_FALLBACK_RECENT_LIMIT,
  CDC_INTEGRATION_SERVICE_LITERAL,
  NUM,
  normalizeAuthoritativeFallbackOutcome,
} = CDC_INTEGRATION_SERVICE_SHARED;

/**
 * Remove authoritative fallback samples that are older than the active window.
 * @param {Array} history
 * @param {number} windowMs
 * @param {number} nowMs
 * @return {Array} Bounded history array.
 */
export function pruneAuthoritativeFallbackHistory(history, windowMs, nowMs) {
  const threshold = nowMs - windowMs;
  return history.filter((entry) => entry.recordedAt >= threshold);
}

/**
 * Record one authoritative fallback signal for diagnostics and strict gating.
 * @param {Object} context
 * @param {Object} options
 * @return {Object} Record signal result.
 */
export function recordAuthoritativeFallbackSignal(context, options = {}) {
  const nowMs = Date.now();
  const tableName = String(options.tableName || '');
  const rowKey = String(options.key || '');
  const phase = context.resolveAuthoritativeFallbackPhase(options.phase);
  const outcome = normalizeAuthoritativeFallbackOutcome(options.outcome);
  const identity = `${tableName}:${rowKey}:${phase}:${outcome}`;

  const totalEntry = context.authoritativeFallbackTotals.get(identity) || {
    tableName,
    rowKey,
    phase,
    outcome,
    totalCount: NUM.ZERO,
    lastRecordedAt: NUM.ZERO,
  };
  totalEntry.totalCount += NUM.ONE;
  totalEntry.lastRecordedAt = nowMs;
  context.authoritativeFallbackTotals.set(identity, totalEntry);

  context.authoritativeFallbackHistory.push({
    tableName,
    rowKey,
    nodeId: context.nodeId,
    expectPresent: options.expectPresent === true,
    phase,
    outcome,
    recordedAt: nowMs,
  });

  context.authoritativeFallbackHistory = pruneAuthoritativeFallbackHistory(
    context.authoritativeFallbackHistory,
    context.authoritativeFallbackWindowMs,
    nowMs,
  );

  let windowCount = NUM.ZERO;
  for (const entry of context.authoritativeFallbackHistory) {
    if (
      entry.tableName === tableName &&
      entry.rowKey === rowKey &&
      entry.phase === phase &&
      entry.outcome === outcome
    ) {
      windowCount += NUM.ONE;
    }
  }

  return {
    tableName,
    rowKey,
    nodeId: context.nodeId,
    expectPresent: options.expectPresent === true,
    phase,
    outcome,
    windowCount,
    windowRatePerMinute:
      (windowCount / context.authoritativeFallbackWindowMs) *
      CDC_INTEGRATION_SERVICE_LITERAL.VALUE_60 *
      CDC_INTEGRATION_SERVICE_LITERAL.VALUE_1000,
    recordedAt: nowMs,
  };
}

/**
 * Summarize authoritative fallback diagnostics for local runtime export.
 * @param {Object} context
 * @return {Object} Diagnostics summary.
 */
export function getAuthoritativeFallbackDiagnostics(context) {
  const nowMs = Date.now();
  context.authoritativeFallbackHistory = pruneAuthoritativeFallbackHistory(
    context.authoritativeFallbackHistory,
    context.authoritativeFallbackWindowMs,
    nowMs,
  );

  const phases = {
    [AUTHORITATIVE_FALLBACK_PHASE.BOOTSTRAP]: {
      windowCount: NUM.ZERO,
      totalCount: NUM.ZERO,
    },
    [AUTHORITATIVE_FALLBACK_PHASE.RECOVERY]: {
      windowCount: NUM.ZERO,
      totalCount: NUM.ZERO,
    },
    [AUTHORITATIVE_FALLBACK_PHASE.STEADY_STATE]: {
      windowCount: NUM.ZERO,
      totalCount: NUM.ZERO,
    },
  };

  const outcomes = {
    [AUTHORITATIVE_FALLBACK_OUTCOME.RECOVERED]: {
      windowCount: NUM.ZERO,
      totalCount: NUM.ZERO,
    },
    [AUTHORITATIVE_FALLBACK_OUTCOME.DIAGNOSED]: {
      windowCount: NUM.ZERO,
      totalCount: NUM.ZERO,
    },
    [AUTHORITATIVE_FALLBACK_OUTCOME.FAILED]: {
      windowCount: NUM.ZERO,
      totalCount: NUM.ZERO,
    },
  };

  const byTable = {};
  let totalCount = NUM.ZERO;

  for (const totalEntry of context.authoritativeFallbackTotals.values()) {
    totalCount += totalEntry.totalCount;
    phases[totalEntry.phase].totalCount += totalEntry.totalCount;
    outcomes[totalEntry.outcome].totalCount += totalEntry.totalCount;
    const tableEntry = byTable[totalEntry.tableName] || {
      totalCount: NUM.ZERO,
      windowCount: NUM.ZERO,
      lastRecordedAt: NUM.ZERO,
    };
    tableEntry.totalCount += totalEntry.totalCount;
    tableEntry.lastRecordedAt = Math.max(
      tableEntry.lastRecordedAt,
      totalEntry.lastRecordedAt,
    );
    byTable[totalEntry.tableName] = tableEntry;
  }

  for (const entry of context.authoritativeFallbackHistory) {
    phases[entry.phase].windowCount += NUM.ONE;
    outcomes[entry.outcome].windowCount += NUM.ONE;
    const tableEntry = byTable[entry.tableName] || {
      totalCount: NUM.ZERO,
      windowCount: NUM.ZERO,
      lastRecordedAt: NUM.ZERO,
    };
    tableEntry.windowCount += NUM.ONE;
    tableEntry.lastRecordedAt = Math.max(
      tableEntry.lastRecordedAt,
      entry.recordedAt,
    );
    byTable[entry.tableName] = tableEntry;
  }

  const recentEvents = context.authoritativeFallbackHistory
    .slice(-AUTHORITATIVE_FALLBACK_RECENT_LIMIT)
    .map((entry) => ({
      ...entry,
    }));

  return {
    schemaVersion: NUM.ONE,
    nodeId: context.nodeId,
    windowMs: context.authoritativeFallbackWindowMs,
    totalCount,
    windowCount: context.authoritativeFallbackHistory.length,
    phases,
    outcomes,
    byTable,
    recentEvents,
  };
}
