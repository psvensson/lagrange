import {performance} from 'node:perf_hooks';

const ZERO = 0;
const ONE = 1;
const MILLISECONDS_PER_SECOND = 1000;
const PERCENTILE_50 = 0.50;
const PERCENTILE_95 = 0.95;
const PERCENTILE_99 = 0.99;

function percentile(sorted, fraction) {
  if (!Array.isArray(sorted) || sorted.length === ZERO) {
    return null;
  }
  const index = Math.min(
    sorted.length - ONE,
    Math.max(ZERO, Math.ceil(sorted.length * fraction) - ONE),
  );
  return sorted[index];
}

function summarizeLatencies(latencies, elapsedMs, correctOperations) {
  const sorted = [...latencies].sort((left, right) => left - right);
  return {
    correctOperations,
    elapsedMs,
    throughputOpsPerSec:
      elapsedMs > ZERO ?
        correctOperations / (elapsedMs / MILLISECONDS_PER_SECOND) :
        null,
    latencyMs: {
      p50: percentile(sorted, PERCENTILE_50),
      p95: percentile(sorted, PERCENTILE_95),
      p99: percentile(sorted, PERCENTILE_99),
      max: sorted.length > ZERO ? sorted[sorted.length - ONE] : null,
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
    denominator > ZERO ? numerator / denominator : null;
}

export {
  metricRatio,
  summarizeLatencies,
  timedOperation,
};
