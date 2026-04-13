# Rollout and Rollback Notes

## Cutover Sequence

1. Land harness modules (`node-client`, `phase-orchestrator`, `gate-engine`,
   `consistency-evaluator`, `assertion-policy`) with unit tests.
2. Cut `postgres-baseline-comparison` to orchestrator phase composition and
   NodeClient-only node I/O routing.
3. Enable additive observability fields in scenario details:
   `phaseTimeline`, `phaseArtifacts`, `phaseReasonSummary`, `phaseDecisions`,
   `channelMetrics`.
4. Enable report-reader compatibility shim for nested and flat benchmark detail
   payloads.
5. Update local benchmark profiles with explicit channel policy fields
   (`loadQueryTimeoutMs`, `controlQueryTimeoutMs`, `loadNodeMaxInFlight`) and
   assertion policy (`insufficientEvidencePolicy`).
6. Run checkpoint test suites and then run distributed pg baseline scenario.

## Safe Rollback Points

1. **Scenario-only rollback**
   - Revert `test/distributed/scenarios/postgres-baseline-comparison.js` to the
     prior non-orchestrator implementation.
   - Keep new harness modules in-tree (unused) to minimize revert surface.

2. **Reader compatibility rollback**
   - Revert `resolveBenchmarkDetails()` compatibility branch in
     `test/distributed/harness/report-writer.js` if unexpected downstream
     parsing behavior appears.

3. **Policy rollback**
   - Restore benchmark config fields in
     `test/distributed/config/local-benchmark-3node*.json` to previous values
     if load-channel policy changes cause regressions.

4. **Full architectural rollback**
   - Revert files introduced/changed by this spec and return to last known
     passing report baseline.

## Acceptance Thresholds

Use these thresholds to accept rollout in local distributed benchmarking:

1. Scenario pass state: `passed: true` for `postgres-baseline-comparison`.
2. Verification confidence: `verification.confidence` is `high` or `medium`
   (low is reject unless explicitly waived).
3. Throughput ratio: `comparison.throughputRatioSutToBaseline >= 0.80`.
4. Tail latency ratio: `comparison.p99LatencyRatioSutToBaselineAvg <= 1000`
   (temporary bound while queueing path is still under investigation).
5. Error accountability: load errors/failures must be explicitly tracked and
   reviewed against prior run before accepting performance regressions.

## Latest Validation Snapshot

- Run date: 2026-02-22
- Report: `test-output/reports/postgres-baseline-comparison-orchestrator-latest.report.json`
- Key values:
  - `passed: true`
  - `verification.verdict: consistent`
  - `verification.confidence: high`
  - `comparison.throughputRatioSutToBaseline: 1.0000333333333333`
  - `comparison.p99LatencyRatioSutToBaselineAvg: 691.8103448275863`

