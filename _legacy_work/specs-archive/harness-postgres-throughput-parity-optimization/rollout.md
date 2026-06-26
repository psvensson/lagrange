# Rollout Defaults And Mitigation Policy

## Profile Defaults

The benchmark profiles now carry explicit defaults for parity and gate behavior:

- `benchmark.failOnLoadParityMismatch = false`
  - Default rollout mode is non-blocking parity (`warn` via gate policy).
- `benchmarkGate.enabled = false`
  - Gate remains opt-in until one clean benchmark cycle is established.
- `benchmarkGate.maxThroughputRegressionRatio = 0.1`
  - Existing regression threshold retained.
- `benchmarkGate.minimumThroughputRatioSutToBaseline = 0.1`
  - New minimum absolute throughput-ratio threshold.
- `benchmarkGate.parityMismatchPolicy = "warn"`
  - Parity mismatch is surfaced as actionable warning by default.
- `benchmarkGate.failIfBaselineMissing = false`
  - Existing behavior retained.
- `benchmarkGate.approvedMitigationId = null`
  - Mitigation remains explicit and auditable.

Applied in:

- `test/distributed/config/local-benchmark.json`
- `test/distributed/config/local-benchmark-3node.json`
- `test/distributed/config/local-benchmark-3node-timeout180.json`
- `test/distributed/config/local-benchmark-3node-timeout600.json`
- `test/distributed/config/local-benchmark-5node.json`
- `test/distributed/config/local-benchmark-7node.json`

## Mitigation Policy

When gate status is `failed`:

1. If reason is `parity-mismatch`:
   - Fix fanout/budget parity first.
   - Temporary bypass requires a non-empty `approvedMitigationId`.
2. If reason is `throughput-ratio-below-minimum`:
   - Prioritize queue/admission pressure items before changing thresholds.
3. If reason is `throughput-regression`:
   - Compare against baseline provider report and attach mitigation id only for
     known, tracked regressions.

## Report Consumer Migration Notes

Report consumers should treat the following fields as stable and required:

- `scenarios[].loadMetrics` now always includes:
  - `attemptErrors`
  - `queueDelay` (`avg`, `p50`, `p95`, `p99`, `max`)
  - `targetOperations`, `dispatchedOperations`, `undispatchedOperations`
  - `undispatchedByReason` (`capacity`, `durationTimeout`, `cancelled`)
  - `perNode`
- `standardSummary.scenarios[]` now includes:
  - `parity` (`status`, `reasonCodes`)
- `standardSummary` now includes:
  - `diagnosticsCoverageSummary`
- `benchmarkRegressionGate` now includes:
  - `parityMismatchCount`
  - `lowThroughputRatioCount`
  - `warnings`
  - Per-scenario `failureReasons`, parity context, and throughput-ratio context

Migration guidance:

1. Prefer additive parsing; ignore unknown fields.
2. Do not assume `warnings` is absent when status is `passed`.
3. For dashboards, group gate failures by `reason` first, then by per-scenario
   `failureReasons`.
