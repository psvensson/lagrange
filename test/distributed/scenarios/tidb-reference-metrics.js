import {performance} from 'node:perf_hooks';

const MILLISECONDS_PER_SECOND = 1000;
const PERCENTILE_50 = 0.50;
const PERCENTILE_95 = 0.95;
const PERCENTILE_99 = 0.99;

function percentile(sorted, fraction) {
  if (!Array.isArray(sorted) || sorted.length === 0) {
    return null;
  }
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * fraction) - 1),
  );
  return sorted[index];
}

function summarizeLatencies(latencies, elapsedMs, correctOperations) {
  const sorted = [...latencies].sort((left, right) => left - right);
  return {
    correctOperations,
    elapsedMs,
    throughputOpsPerSec:
      elapsedMs > 0 ?
        correctOperations / (elapsedMs / MILLISECONDS_PER_SECOND) :
        null,
    latencyMs: {
      p50: percentile(sorted, PERCENTILE_50),
      p95: percentile(sorted, PERCENTILE_95),
      p99: percentile(sorted, PERCENTILE_99),
      max: sorted.length > 0 ? sorted[sorted.length - 1] : null,
    },
  };
}

async function timedOperation(callback) {
  const startedAt = performance.now();
  const value = await callback();
  return {value, elapsedMs: performance.now() - startedAt};
}

function metricRatio(numerator, denominator) {
  return Number.isFinite(numerator) && Number.isFinite(denominator) &&
    denominator > 0 ? numerator / denominator : null;
}

export {
  metricRatio,
  summarizeLatencies,
  timedOperation,
};
