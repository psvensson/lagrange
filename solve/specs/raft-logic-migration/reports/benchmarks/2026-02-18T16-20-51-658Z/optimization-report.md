# Optimization Report (Shared Load Generator + benchmark_events)

## Scope
- Enforced shared harness `LoadGenerator` for both SUT and Postgres baseline paths.
- Enforced strict dispatch pacing to prevent target overshoot.
- Switched benchmark workload target to `benchmark_events`.

## Benchmark Runs

### Run A (completed, but invalid for SUT throughput)
- Run dir: `.kiro/specs/raft-logic-migration/reports/benchmarks/2026-02-18T16-13-25-382Z`
- 3-node report: `.kiro/specs/raft-logic-migration/reports/benchmarks/2026-02-18T16-13-25-382Z/benchmark-3node.report.json`
- 5-node report: `.kiro/specs/raft-logic-migration/reports/benchmarks/2026-02-18T16-13-25-382Z/benchmark-5node.report.json`

Observed:
- SUT load metrics:
  - 3-node: total 3600, success 0, failed 3600, errors 14400
  - 5-node: total 3600, success 0, failed 3600, errors 21600
- Baseline load metrics:
  - 3-node: success 3600/3600, ~120 ops/s
  - 5-node: success 3600/3600, ~120 ops/s

Conclusion:
- Reported throughput parity in this run is not trustworthy because SUT had 100% failed operations.
- Root signal from logs: repeated `No partitions available for table` and routing failures for `benchmark_events`.

### Run B (strict readiness gate, failed fast)
- Run dir: `.kiro/specs/raft-logic-migration/reports/benchmarks/2026-02-18T16-20-51-658Z`
- 3-node report: `.kiro/specs/raft-logic-migration/reports/benchmarks/2026-02-18T16-20-51-658Z/benchmark-3node.report.json`
- 5-node report: `.kiro/specs/raft-logic-migration/reports/benchmarks/2026-02-18T16-20-51-658Z/benchmark-5node.report.json`

Observed:
- Both profiles failed before load completion.
- Common error:
  - `Benchmark table "benchmark_events" was not ready within 30000ms... Table not found: benchmark_events`
  - and/or partition metadata never visible.

Conclusion:
- `benchmark_events` provisioning/readiness is the current hard blocker.
- Throughput optimization cannot be measured accurately until table provisioning is reliable.

## Top Optimization Priorities (Current)
1. **Fix benchmark table provisioning path first**
   - Ensure `CREATE TABLE benchmark_events` leads to visible partition metadata before load starts.
   - Current blocker dominates all throughput numbers.
2. **Guard throughput metrics against failed operations**
   - Current `opsPerSec` reflects dispatched operations, not successful operations.
   - Add/emit effective throughput based on successful operations.
3. **Stabilize cluster control-plane before benchmark start**
   - Repeated warnings (`bootstrap peer hint`, `critical rebalancing state`) correlate with table readiness failure.

## Recommended Next Steps
1. Add a deterministic post-create validation path using system tables (`tables`, `partitions`, `services`) and surface their snapshots in benchmark artifacts on timeout.
2. Capture and persist the direct `CREATE TABLE` result payload in benchmark details for root-cause attribution.
3. Add a benchmark assertion requiring `loadMetrics.success > 0` (or fail run as invalid).
4. Update comparison math to include `successfulOpsPerSec` for SUT and baseline.
