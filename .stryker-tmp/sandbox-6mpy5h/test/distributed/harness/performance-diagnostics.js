/**
 * Performance diagnostics extraction from structured metrics logs.
 *
 * Consumes buffered logs-table entries captured by the harness and
 * computes write-path phase attribution plus transport/sqlite summaries.
 */
// @ts-nocheck


const ZERO = 0;
const ONE = 1;
const HUNDRED = 100;
const PERCENTILE_P50 = 50;
const PERCENTILE_P95 = 95;
const PERCENTILE_P99 = 99;
const METRIC_TAG_PARTITION_RAFT_PROPOSE = 'metrics.partition.raft_propose';
const METRIC_TAG_TRANSPORT_DELIVER = 'metrics.transport.deliver';
const METRIC_TAG_PARTITION_SQLITE = 'metrics.partition.sqlite';

const WRITE_PHASE_FIELD_ENTRY_BUILD_MS = 'entryBuildMs';
const WRITE_PHASE_FIELD_FORWARD_DELIVER_MS = 'forwardDeliverMs';
const WRITE_PHASE_FIELD_LOG_APPEND_MS = 'logAppendMs';
const WRITE_PHASE_FIELD_SQLITE_RUN_MS = 'sqliteRunMs';
const WRITE_PHASE_FIELD_RAFT_COMMAND_DISPATCH_MS = 'raftCommandDispatchMs';
const WRITE_PHASE_FIELD_APPLY_WRITE_MS = 'applyWriteMs';
const WRITE_PHASE_FIELD_TOTAL_MS = 'totalMs';

const WRITE_PHASE_FIELDS = Object.freeze([
  WRITE_PHASE_FIELD_ENTRY_BUILD_MS,
  WRITE_PHASE_FIELD_FORWARD_DELIVER_MS,
  WRITE_PHASE_FIELD_LOG_APPEND_MS,
  WRITE_PHASE_FIELD_SQLITE_RUN_MS,
  WRITE_PHASE_FIELD_RAFT_COMMAND_DISPATCH_MS,
  WRITE_PHASE_FIELD_APPLY_WRITE_MS,
]);

function normalizeFiniteNumber(value) {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : null;
}

function normalizeNonNegativeNumber(value) {
  const normalized = normalizeFiniteNumber(value);
  if (normalized === null) {
    return null;
  }
  return Math.max(ZERO, normalized);
}

function parseMetadataValue(rawMetadata) {
  if (!rawMetadata) {
    return null;
  }
  if (typeof rawMetadata === 'object' && !Array.isArray(rawMetadata)) {
    return rawMetadata;
  }
  if (typeof rawMetadata !== 'string') {
    return null;
  }
  try {
    const parsed = JSON.parse(rawMetadata);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    return parsed;
  } catch (_err) {
    return null;
  }
}

function resolveEntryMetadata(entry) {
  if (!entry || typeof entry !== 'object') {
    return null;
  }
  const metadata = parseMetadataValue(entry.metadata);
  if (metadata) {
    return metadata;
  }
  return entry;
}

function collectMetricMetadata(logEntries, metricTag) {
  if (!Array.isArray(logEntries)) {
    return [];
  }
  const metricRows = [];
  for (const entry of logEntries) {
    const message = String(entry?.message || '').trim();
    if (message !== metricTag) {
      continue;
    }
    const metadata = resolveEntryMetadata(entry);
    if (!metadata) {
      continue;
    }
    metricRows.push(metadata);
  }
  return metricRows;
}

function computePercentile(values, percentile) {
  if (!Array.isArray(values) || values.length === ZERO) {
    return null;
  }
  const sorted = [...values]
    .map((value) => normalizeNonNegativeNumber(value))
    .filter((value) => value !== null)
    .sort((left, right) => left - right);
  if (sorted.length === ZERO) {
    return null;
  }
  if (sorted.length === ONE) {
    return sorted[ZERO];
  }

  const rank = (percentile / HUNDRED) * (sorted.length - ONE);
  const lowerIndex = Math.floor(rank);
  const upperIndex = Math.ceil(rank);
  if (lowerIndex === upperIndex) {
    return sorted[lowerIndex];
  }
  const weight = rank - lowerIndex;
  return sorted[lowerIndex] +
    ((sorted[upperIndex] - sorted[lowerIndex]) * weight);
}

function summarizeNumberSeries(values) {
  const normalized = Array.isArray(values) ?
    values
      .map((value) => normalizeNonNegativeNumber(value))
      .filter((value) => value !== null) :
    [];
  if (normalized.length === ZERO) {
    return null;
  }
  const total = normalized.reduce((sum, value) => sum + value, ZERO);
  const min = normalized.reduce((best, value) => Math.min(best, value), normalized[ZERO]);
  const max = normalized.reduce((best, value) => Math.max(best, value), normalized[ZERO]);
  return {
    count: normalized.length,
    total,
    min,
    max,
    avg: total / normalized.length,
    p50: computePercentile(normalized, PERCENTILE_P50),
    p95: computePercentile(normalized, PERCENTILE_P95),
    p99: computePercentile(normalized, PERCENTILE_P99),
  };
}

function buildWritePhaseBreakdown(raftProposeRows) {
  const phaseDurationByField = new Map();
  let aggregateTotalMs = ZERO;

  for (const field of WRITE_PHASE_FIELDS) {
    phaseDurationByField.set(field, []);
  }

  for (const row of raftProposeRows) {
    const phaseTiming = row?.writePhaseTimingMs;
    const timing = phaseTiming && typeof phaseTiming === 'object' ?
      phaseTiming :
      null;
    if (!timing) {
      continue;
    }

    const rowTotalMs = normalizeNonNegativeNumber(
      timing[WRITE_PHASE_FIELD_TOTAL_MS],
    ) ??
      normalizeNonNegativeNumber(row?.durationMs) ??
      ZERO;
    aggregateTotalMs += rowTotalMs;

    for (const field of WRITE_PHASE_FIELDS) {
      const value = normalizeNonNegativeNumber(timing[field]);
      if (value === null) {
        continue;
      }
      phaseDurationByField.get(field).push(value);
    }
  }

  const breakdown = [];
  for (const field of WRITE_PHASE_FIELDS) {
    const values = phaseDurationByField.get(field) || [];
    const series = summarizeNumberSeries(values);
    if (!series) {
      continue;
    }
    breakdown.push({
      phase: field,
      ...series,
      shareOfTotalMs: aggregateTotalMs > ZERO ?
        series.total / aggregateTotalMs :
        null,
    });
  }

  breakdown.sort((left, right) => {
    const leftTotal = normalizeNonNegativeNumber(left?.total) || ZERO;
    const rightTotal = normalizeNonNegativeNumber(right?.total) || ZERO;
    if (leftTotal !== rightTotal) {
      return rightTotal - leftTotal;
    }
    return String(left?.phase || '').localeCompare(String(right?.phase || ''));
  });

  return {
    aggregateTotalMs,
    phases: breakdown,
  };
}

function summarizeWritePath(raftProposeRows) {
  if (!Array.isArray(raftProposeRows) || raftProposeRows.length === ZERO) {
    return null;
  }

  const durations = [];
  let leaderSamples = ZERO;
  let forwardedSamples = ZERO;
  let acknowledgedSamples = ZERO;

  for (const row of raftProposeRows) {
    const duration = normalizeNonNegativeNumber(row?.durationMs);
    if (duration !== null) {
      durations.push(duration);
    }
    if (row?.isLeader === true) {
      leaderSamples += ONE;
    }
    if (row?.forwarded === true) {
      forwardedSamples += ONE;
    }
    if (row?.acknowledged === true) {
      acknowledgedSamples += ONE;
    }
  }

  const phaseBreakdown = buildWritePhaseBreakdown(raftProposeRows);
  return {
    sampleCount: raftProposeRows.length,
    leaderSamples,
    forwardedSamples,
    acknowledgedSamples,
    acknowledgedRate: raftProposeRows.length > ZERO ?
      acknowledgedSamples / raftProposeRows.length :
      null,
    durationMs: summarizeNumberSeries(durations),
    phaseBreakdown: phaseBreakdown.phases,
    phaseTotalReferenceMs: phaseBreakdown.aggregateTotalMs,
  };
}

function summarizeTransportDeliver(transportRows) {
  if (!Array.isArray(transportRows) || transportRows.length === ZERO) {
    return null;
  }

  const durationValues = [];
  const queueWaitValues = [];
  const queueDepthValues = [];
  let acknowledgedSamples = ZERO;

  for (const row of transportRows) {
    const duration = normalizeNonNegativeNumber(row?.durationMs);
    const queueWait = normalizeNonNegativeNumber(row?.queueWaitMs);
    const queueDepth = normalizeNonNegativeNumber(row?.queueDepth);
    if (duration !== null) {
      durationValues.push(duration);
    }
    if (queueWait !== null) {
      queueWaitValues.push(queueWait);
    }
    if (queueDepth !== null) {
      queueDepthValues.push(queueDepth);
    }
    if (row?.acknowledged === true) {
      acknowledgedSamples += ONE;
    }
  }

  return {
    sampleCount: transportRows.length,
    acknowledgedSamples,
    acknowledgedRate: transportRows.length > ZERO ?
      acknowledgedSamples / transportRows.length :
      null,
    durationMs: summarizeNumberSeries(durationValues),
    queueWaitMs: summarizeNumberSeries(queueWaitValues),
    queueDepth: summarizeNumberSeries(queueDepthValues),
  };
}

function summarizeSqlite(sqliteRows) {
  if (!Array.isArray(sqliteRows) || sqliteRows.length === ZERO) {
    return null;
  }
  const durations = [];
  const rowCounts = [];

  for (const row of sqliteRows) {
    const duration = normalizeNonNegativeNumber(row?.durationMs);
    const rowCount = normalizeNonNegativeNumber(row?.rowCount);
    if (duration !== null) {
      durations.push(duration);
    }
    if (rowCount !== null) {
      rowCounts.push(rowCount);
    }
  }

  return {
    sampleCount: sqliteRows.length,
    durationMs: summarizeNumberSeries(durations),
    rowCount: summarizeNumberSeries(rowCounts),
  };
}

/**
 * Build harness performance diagnostics from logs-table metric rows.
 * @param {Array<Object>} logEntries
 * @return {Object|null}
 */
function buildPerformanceDiagnostics(logEntries) {
  const raftProposeRows = collectMetricMetadata(
    logEntries,
    METRIC_TAG_PARTITION_RAFT_PROPOSE,
  );
  const transportDeliverRows = collectMetricMetadata(
    logEntries,
    METRIC_TAG_TRANSPORT_DELIVER,
  );
  const sqliteRows = collectMetricMetadata(
    logEntries,
    METRIC_TAG_PARTITION_SQLITE,
  );

  const writePath = summarizeWritePath(raftProposeRows);
  const transport = summarizeTransportDeliver(transportDeliverRows);
  const sqlite = summarizeSqlite(sqliteRows);
  if (!writePath && !transport && !sqlite) {
    return null;
  }

  return {
    sampleCounts: {
      raftPropose: raftProposeRows.length,
      transportDeliver: transportDeliverRows.length,
      partitionSqlite: sqliteRows.length,
    },
    writePath,
    transport,
    sqlite,
  };
}

export {buildPerformanceDiagnostics};
