// Derived metrics of one v2 run record, computed from its retained observations
// only (design note: "Derived metrics are computed by the store from
// observations only"). The latency summaries, the quantile method and the
// completion rate are owned by benchmark-operation-outcome.js; the window is
// max(scheduledMs, drainMs). A statistic without samples is null, never 0.
import {
  benchmarkCompletedPerSec,
  summarizeBenchmarkLatencies,
} from './benchmark-operation-outcome.js';
import {OBSERVATIONS_FIELD, WINDOW_FIELD} from './raw-observation-record.js';

const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayMap = Function.call.bind(Array.prototype.map);
const numberIsFinite = Number.isFinite;
const numberToFixed = Function.call.bind(Number.prototype.toFixed);

const METRIC_DIGITS = 3;
const SEC_DIGITS = 2;
const MS_PER_SEC = 1000;
const EXPECTED_RESET_COUNT = 8;
const COMPLETED_STATUS = 'completed';
const DATASET_RESET_KIND = 'dataset-reset';
const QUANTILES = Object.freeze(['p50', 'p95', 'p99']);

function round(value, digits = METRIC_DIGITS) {
  return value === null || !numberIsFinite(value) ? null : Number(numberToFixed(value, digits));
}

function parseIsoMs(iso) {
  if (typeof iso !== 'string' || iso.length === 0) return null;
  const parsed = Date.parse(iso);
  return numberIsFinite(parsed) ? parsed : null;
}

function diffSec(startMs, endMs) {
  if (startMs === null || endMs === null || endMs < startMs) return null;
  return round((endMs - startMs) / MS_PER_SEC, SEC_DIGITS);
}

function deriveWarmupSec(observations) {
  const records = observations?.warmup?.records;
  if (!Array.isArray(records) || records.length === 0) return null;
  let minStart = Number.POSITIVE_INFINITY;
  let maxEnd = Number.NEGATIVE_INFINITY;
  for (const r of records) {
    if (numberIsFinite(r?.issuedAtMs) && r.issuedAtMs < minStart) minStart = r.issuedAtMs;
    if (numberIsFinite(r?.completedAtMs) && r.completedAtMs > maxEnd) maxEnd = r.completedAtMs;
  }
  return minStart <= maxEnd ? round((maxEnd - minStart) / MS_PER_SEC, SEC_DIGITS) : null;
}

function derivePartsSec(run, tReadyMs, tMeasureStartMs, warmupSec) {
  const resets = arrayFilter(run.harnessEvents || [], (e) => e?.kind === DATASET_RESET_KIND);
  if (resets.length !== EXPECTED_RESET_COUNT || tReadyMs === null || tMeasureStartMs === null) {
    return null;
  }
  const times = arrayMap(resets, (e) => parseIsoMs(e.at));
  if (arrayIncludes(times, null)) return null;
  const gateEndMs = tMeasureStartMs - ((warmupSec ?? 0) * MS_PER_SEC);
  return {
    newOrderContentionSec: diffSec(tReadyMs, times[0]),
    visibilitySec: diffSec(times[0], times[1]),
    paymentSec: diffSec(times[1], times[2]),
    orderStatusSec: diffSec(times[2], times[3]),
    deliverySec: diffSec(times[3], times[4]),
    stockLevelSec: diffSec(times[4], times[5]),
    failureAtomicitySec: diffSec(times[5], times[6]),
    retryableConflictSec: diffSec(times[6], times[7]),
    durabilityRestartSec: round(Math.max(0, (gateEndMs - times[7]) / MS_PER_SEC), SEC_DIGITS),
  };
}

function deriveRunTimingsSec(run, latencies) {
  const observations = run.observations;
  if (observations?.[OBSERVATIONS_FIELD.RUN_STATUS] !== COMPLETED_STATUS ||
      (observations?.[OBSERVATIONS_FIELD.ACCOUNTING]?.committed ?? 0) === 0) {
    return null;
  }
  const tStartMs = parseIsoMs(run.execution?.startedAt);
  const tEndMs = parseIsoMs(run.execution?.endedAt);
  const tReadyMs = parseIsoMs(run.deployment?.readiness?.observedAt);
  const window = observations[OBSERVATIONS_FIELD.WINDOW] ?? null;
  const tMeasureStartMs = parseIsoMs(window?.startedAt);
  const tMeasureEndMs = parseIsoMs(window?.endedAt);
  const warmupSec = deriveWarmupSec(observations);
  const rawGateAndWarmupSec = diffSec(tReadyMs, tMeasureStartMs);
  const semanticGateTotalSec = rawGateAndWarmupSec === null ? null :
    round(Math.max(0, rawGateAndWarmupSec - (warmupSec ?? 0)), SEC_DIGITS);
  const drainMs = window?.[WINDOW_FIELD.DRAIN_MS];
  const workloadDrainSec = numberIsFinite(drainMs) && drainMs >= 0 ?
    round(drainMs / MS_PER_SEC, SEC_DIGITS) : null;
  const maxLatencyMs = latencies?.maxLatencyMs;
  const maxSingleRequestSec = numberIsFinite(maxLatencyMs) && maxLatencyMs >= 0 ?
    round(maxLatencyMs / MS_PER_SEC, METRIC_DIGITS) : null;
  return {
    totalScenarioSec: diffSec(tStartMs, tEndMs),
    clusterReadySec: diffSec(tStartMs, tReadyMs),
    semanticGateTotalSec,
    warmupSec,
    workloadDrainSec,
    postVerifySec: diffSec(tMeasureEndMs, tEndMs),
    maxSingleRequestSec,
    partsSec: derivePartsSec(run, tReadyMs, tMeasureStartMs, warmupSec),
  };
}

function quantiles(summary) {
  if (summary.count === 0) return null;
  const out = {samples: summary.count};
  for (const name of QUANTILES) out[name] = round(summary[name]);
  return out;
}

function deriveRunMetrics(run) {
  const observations = run.observations;
  const accounting = observations[OBSERVATIONS_FIELD.ACCOUNTING];
  const window = observations[OBSERVATIONS_FIELD.WINDOW] ?? null;
  const latencies = summarizeBenchmarkLatencies(observations[OBSERVATIONS_FIELD.REQUESTS],
    accounting);
  const windowMs = window ?
    Math.max(window[WINDOW_FIELD.SCHEDULED_MS], window[WINDOW_FIELD.DRAIN_MS]) : null;
  return {
    runId: run.runId,
    runStatus: observations[OBSERVATIONS_FIELD.RUN_STATUS],
    offeredRatePerSec: run.plan.offeredRatePerSec,
    repetition: run.plan.repetition,
    windowMs: round(windowMs),
    committedPerSec: windowMs === null ? null :
      round(benchmarkCompletedPerSec(accounting.committed, windowMs)),
    quantileMethod: latencies.quantileMethod,
    latencyMs: quantiles(latencies.latency),
    attemptLatencyMs: quantiles(latencies.attemptLatency),
    maxLatencyMs: round(latencies.maxLatencyMs),
    drainOverrunMs: window ? round(window[WINDOW_FIELD.DRAIN_OVERRUN_MS]) : null,
    timingsSec: deriveRunTimingsSec(run, latencies),
    accounting,
  };
}

export {deriveRunMetrics};
