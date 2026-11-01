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

const numberToFixed = Function.call.bind(Number.prototype.toFixed);

const METRIC_DIGITS = 3;
const QUANTILES = Object.freeze(['p50', 'p95', 'p99']);

function round(value) {
  return value === null ? null : Number(numberToFixed(value, METRIC_DIGITS));
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
    accounting,
  };
}

export {deriveRunMetrics};
