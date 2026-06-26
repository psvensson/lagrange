# Rollout and Rollback Notes

## Rollout Strategy

### Stage 0: Reproduction Gate

1. Preserve one failing corpus for current known errors.
2. Verify new tests fail against current behavior before each fix cluster.

Exit criteria:

1. breaker cascade reproduction test fails reliably,
2. discovery/schema mismatch test fails reliably,
3. startup ACTIVE instability test fails reliably on stressed profile.

### Stage 1: Failure Amplification Removal

1. Cut over to single load-path breaker owner.
2. Tune breaker defaults to burst-tolerant values.
3. Validate no regression in existing harness tests.

Exit criteria:

1. timeout burst no longer causes large fast-reject avalanche,
2. operation errors track true unrecoverable failures only,
3. attempt-level diagnostics remain visible.

### Stage 2: Discovery and Readiness Contract Hardening

1. Ship additive discovery readiness schema.
2. Wire benchmark selection to canonical readiness.
3. Add table-scoped schema readiness for benchmark table.

Exit criteria:

1. no load start on schema-not-ready nodes,
2. no legacy discovery selection paths,
3. readiness exclusion reasons visible in report.

### Stage 3: Startup and Topology Gate Hardening

1. Strengthen ACTIVE + snapshot coverage barrier.
2. Enforce topology lock before load.
3. Verify post-load drain consistency with new topology diagnostics.

Exit criteria:

1. 7-node startup flake class reduced below target threshold,
2. pre-load fails fast when topology lock not met,
3. load phase starts only from stable topology.

### Stage 4: Final Acceptance

1. Run 3-node baseline acceptance profile.
2. Run 7-node baseline acceptance profile.
3. Archive comparison metrics and diagnostics summary.

## Acceptance Thresholds

### Functional

1. 3-node baseline: `failed=0`, `errors=0`.
2. 7-node baseline: startup/preflight pass with no readiness timeout failure.
3. 7-node baseline load: `failed=0`, `errors=0`.

### Diagnostic

1. `attemptErrors` is present when transient retries occur.
2. report includes channel metrics and readiness exclusion reasons.
3. phase decision summaries include dominant reasons for warnings/errors.

### Stability

1. repeated run consistency: at least 3 consecutive successful runs per profile.
2. no uncontrolled increase in startup timeout frequency vs baseline corpus.

## Config Rollout Defaults

Finalized defaults for local baseline acceptance profiles:

1. `loadQueryTimeoutMs=4000`
2. `loadNodeMaxInFlight=2`
3. `nodeFailureThreshold=3`
4. `nodeFailureCooldownMs=1500`
5. `benchmarkGate.enabled=false` for zero-error acceptance checks where
   throughput regression is non-blocking.
6. `insufficientEvidencePolicy=soft` for post-load evidence degradation while
   preserving hard failure on real operation errors.

Canonical files:

1. `test/distributed/config/local-benchmark-3node.json`
2. `test/distributed/config/local-benchmark-3node-timeout180.json`
3. `test/distributed/config/local-benchmark-3node-timeout600.json`
4. `test/distributed/config/local-benchmark-7node.json`

Migration notes:

1. These values replace fragile single-failure breaker defaults.
2. Existing report schemas remain additive and backward-compatible.
3. Throughput regression analysis remains available in reports even when the
   benchmark gate is disabled.

## Rollback Plan

### Safe Rollback Point A: Policy-only

Revert benchmark config threshold/cooldown/timeout values while keeping
instrumentation and tests.

Use when:

1. behavior improves in tests but regresses on real workload mix.

### Safe Rollback Point B: Discovery Contract

Revert readiness-field consumption in harness scenario while keeping additive
fields in API response.

Use when:

1. downstream consumers need more time to adopt readiness semantics.

### Safe Rollback Point C: Transport Isolation

Revert channel-lane transport split to prior single-lane path, but keep test
coverage and diagnostics for rework.

Use when:

1. transport split introduces unacceptable complexity or regression.

### Safe Rollback Point D: Full Feature Revert

Revert all changes under this spec package to the last known green commit.

Use when:

1. acceptance thresholds cannot be met after staged rollback points.

## Risk Monitoring During Rollout

Track on every benchmark run:

1. load-channel timeouts,
2. breaker-open count,
3. operation vs attempt error ratio,
4. excluded-load-node reasons,
5. startup ACTIVE timeout incidents.

Rollout pauses automatically if any of these trend negatively for two
consecutive runs.

Automatic pause triggers:

1. any acceptance run reports `loadMetrics.failed > 0` or `loadMetrics.errors > 0`,
2. two consecutive 7-node runs fail startup or pre-load gate,
3. two consecutive runs lose readiness exclusion diagnostics in discovery output.
