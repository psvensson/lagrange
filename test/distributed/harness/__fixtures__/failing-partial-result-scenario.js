/**
 * Test fixture: a scenario module that computes load-like metrics and then
 * throws with structured diagnostics.partialResult.
 */

async function run(_cluster) {
  const error = new Error('Intentional partial-result scenario failure');
  error.diagnostics = {
    partialResult: {
      loadMetrics: {
        total: 120,
        success: 120,
        failed: 0,
        errors: 0,
        opsPerSec: 24,
        latency: {
          avg: 11,
          p50: 10,
          p95: 40,
          p99: 75,
        },
        attemptErrors: 9,
        queueDelay: {
          avg: 2,
          p50: 0,
          p95: 8,
          p99: 15,
          max: 18,
        },
        targetOperations: 200,
        dispatchedOperations: 120,
        undispatchedOperations: 80,
        undispatchedByReason: {
          capacity: 80,
          durationTimeout: 0,
          cancelled: 0,
        },
        waitReasons: {
          nodeSlotUnavailable: 20,
          nodeAdmissionBlocked: 55,
          retryableControlPlanePressure: 9,
          timeoutWaits: 0,
          queueCapacityRejected: 0,
        },
      },
      convergenceTiming: {
        settledAfterMs: 3210,
      },
      newNodeId: 'joiner-test-node',
      failurePhase: 'verify_load',
      dominantAssertion: 'dispatch_backlog',
    },
  };
  throw error;
}

export {run};
