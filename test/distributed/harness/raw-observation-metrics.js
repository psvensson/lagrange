// Derived metrics of one v2 run record, computed from its retained observations
// only (design note: "Derived metrics are computed by the store from
// observations only"). `latencyMs` summarises committed requests; `attemptLatencyMs`
// summarises every issued request. Throughput uses max(scheduledMs, drainMs) as the
// window. A statistic without samples is null, never 0.
import {
  ATTEMPT_FIELD,
  OBSERVATIONS_FIELD,
  OPERATION_OUTCOME,
  REQUEST_FIELD,
  WINDOW_FIELD,
} from './raw-observation-record.js';

const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayMap = Function.call.bind(Array.prototype.map);
const numberToFixed = Function.call.bind(Number.prototype.toFixed);

const MS_PER_SEC = 1000;
const METRIC_DIGITS = 3;
const QUANTILES = Object.freeze([['p50', 0.5], ['p95', 0.95], ['p99', 0.99]]);

function round(value) {
  return Number(numberToFixed(value, METRIC_DIGITS));
}

// Nearest-rank quantile over a sorted sample.
function quantile(sorted, q) {
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return round(sorted[idx]);
}

function summarize(latencies) {
  if (latencies.length === 0) return null;
  const sorted = [...latencies].sort((a, b) => a - b);
  const out = {samples: sorted.length};
  for (const [name, q] of QUANTILES) out[name] = quantile(sorted, q);
  return out;
}

// Open-loop latency runs from the intended issue time to the last attempt's end,
// so queueing and scheduler lag are included.
function requestLatencyMs(request) {
  const attempts = request[REQUEST_FIELD.ATTEMPTS];
  const last = attempts[attempts.length - 1];
  return last[ATTEMPT_FIELD.ENDED_MS] - request[REQUEST_FIELD.INTENDED_START_MS];
}

function maxOf(values) {
  return values.length === 0 ? null : round(Math.max(...values));
}

function deriveRunMetrics(run) {
  const observations = run.observations;
  const requests = observations[OBSERVATIONS_FIELD.REQUESTS];
  const accounting = observations[OBSERVATIONS_FIELD.ACCOUNTING];
  const window = observations[OBSERVATIONS_FIELD.WINDOW];
  const issued = arrayFilter(requests,
    (r) => r[REQUEST_FIELD.OUTCOME] !== OPERATION_OUTCOME.UNISSUED);
  const committed = arrayFilter(issued,
    (r) => r[REQUEST_FIELD.OUTCOME] === OPERATION_OUTCOME.COMMITTED);
  const windowMs = Math.max(window[WINDOW_FIELD.SCHEDULED_MS], window[WINDOW_FIELD.DRAIN_MS]);
  const issuedLatencies = arrayMap(issued, requestLatencyMs);
  return {
    runId: run.runId,
    offeredRatePerSec: run.plan.offeredRatePerSec,
    repetition: run.plan.repetition,
    windowMs: round(windowMs),
    committedPerSec: windowMs > 0 ?
      round(accounting.committed / (windowMs / MS_PER_SEC)) : null,
    latencyMs: summarize(arrayMap(committed, requestLatencyMs)),
    attemptLatencyMs: summarize(issuedLatencies),
    maxLatencyMs: maxOf(issuedLatencies),
    drainOverrunMs: round(window[WINDOW_FIELD.DRAIN_OVERRUN_MS]),
    accounting,
  };
}

export {deriveRunMetrics};
