# Raft Optimization Spec (No Liferaft Changes)

## 1. Purpose

Define a detailed plan to reduce idle CPU, memory growth risk, and disk-write
pressure in the current system while keeping `@markwylde/liferaft` unchanged.

This spec covers production code and runtime configuration in this repository.
It does not include any fork, patch, or protocol modification in liferaft.

## 2. Hard Constraint

- Liferaft remains a fixed dependency (`@markwylde/liferaft`).
- No edits to liferaft source, no private fork, no packet/protocol divergence.
- Improvements must be implemented around existing liferaft APIs already used:
  - `command`, `join`, `leave`
  - `leader`/`follower`/`candidate`/`commit` events
  - runtime timing updates (`beat`, `election.min/max`, `heartbeat(timeout)`).

## 3. Background

Observed behavior on idle or near-idle nodes:

- CPU is materially higher than expected for idle operation.
- Memory growth concerns exist and need better component attribution.
- Disk writes can become high, with logs/metrics suspected as a major source.

Existing system capabilities we can build on:

- Runtime diagnostics sampler and trend reporting:
  - `src/diagnostics/resource-diagnostics-sampler.js`
- Dynamic config runtime wiring:
  - `src/config/dynamic-config-startup-wiring.js`
- Adaptive raft timing controller:
  - `src/config/raft-adaptive-timing-controller.js`
- Metrics persistence toggle:
  - `logging.persistMetricsLogs` in `src/config/config-constants.js`
- Raft direct-delivery fast path:
  - `src/transport/router-delivery-manager.js`

## 4. Goals

- Reduce idle CPU to a stable low baseline.
- Eliminate unbounded memory growth in idle and low-load steady state.
- Minimize idle disk writes so they scale with workload, not background churn.
- Keep correctness and convergence behavior unchanged.

## 5. Non-Goals

- No liferaft internals changes (batch append, pipeline internals, snapshots,
  membership algorithm changes in liferaft itself).
- No broad architecture rewrite.
- No dual long-term raft paths in production.

## 6. Target Operating Envelope

Targets for a healthy idle 3-replica node (single node process view):

- CPU: <= 3% average over 15 minutes.
- RSS growth: near-flat trend, <= 20 MB/hour after warm-up.
- Disk writes: <= 100 KB/s sustained idle average.
- No sustained increase in pending log-table writes.

These are acceptance targets, not strict hard limits for short transient periods.

## 7. Design Principles

- Single operational path per responsibility.
- Prefer coarse default instrumentation, opt-in fine granularity.
- Background loops must be demand-driven or low-frequency by default.
- Keep data-path metrics useful but cheap.
- Make every tuning point dynamically configurable where practical.

## 8. Workstreams

### WS1: Idle Baseline and Signal Attribution

1. Keep resource diagnostics as the canonical source of process trend data.
2. Extend high-value component stats only where they materially aid attribution.
3. Ensure top-growing signal reporting clearly maps to subsystem owner names.
4. Add one compact admin report payload focused on:
   - cpuPercent, eventLoopUtilizationPercent
   - rssGrowthPerMinBytes
   - writeRateBytesPerSec
   - top 10 growing component signals

Acceptance:

- Operator can identify top 3 growth contributors in one report query.
- No new noisy periodic logs are introduced by diagnostics.

### WS2: Metrics/Logging Default Policy for Idle

1. Keep detailed metrics logging disabled by default for persistence.
2. Preserve existing metrics namespace filtering behavior.
3. Define default metrics resolution tiers:
   - Tier A (default): aggregated counters and sampled latency summaries only.
   - Tier B (debug window): high-cardinality per-operation metrics with TTL.
4. Ensure toggling metrics persistence cannot recursively create new metrics
   writes that themselves increase persistence pressure.

Acceptance:

- Default boot profile does not persist detailed `metrics.*` streams.
- Enabling diagnostics does not create self-amplifying log loops.

### WS3: Background Timer and Loop Hygiene

1. Audit all periodic timers that run regardless of workload.
2. For each timer, pick one of:
   - event-driven trigger
   - lower default cadence
   - conditional execution under activity threshold
3. Apply hysteresis to profile switching loops to avoid flapping.
4. Ensure idle profile defaults favor low-frequency checks.

Acceptance:

- Timer count and wake-up frequency are reduced measurably at idle.
- Idle CPU drops with no regression in failover readiness.

### WS4: Raft Timing Tuning (Runtime, Not Liferaft Changes)

1. Use adaptive timing controller defaults optimized for low-idle overhead.
2. Keep fast profile for active load; keep slow profile for idle.
3. Validate election safety margins remain conservative.
4. Ensure runtime config updates continue to apply to live replicas and future
   replicas through existing dynamic config wiring.

Acceptance:

- No election instability increase after timing tuning.
- Idle CPU/disk improve in steady-state measurements.

### WS5: Write Path Pressure Controls Above Raft

1. Keep bounded proposal queues as hard memory guardrails.
2. Tighten backpressure behavior and telemetry around queue saturation.
3. Reduce unnecessary write amplification in non-user-facing periodic updates.
4. Maintain single SQL execution ownership paths.

Acceptance:

- Pending queue lengths remain bounded under stress.
- No memory growth from pending-commit structures over long idle windows.

### WS6: Convergence and Control-Plane Noise Reduction

1. Remove non-essential periodic informational logs that do not signal changes.
2. Keep table updates needed for state visibility, but avoid duplicate logging.
3. Ensure convergence assertions capture enough artifacts without increasing
   steady-state write volume.

Acceptance:

- Idle log volume is near-zero except meaningful state transitions/warnings.
- Convergence failures still provide actionable artifacts.

## 9. Configuration Plan

Use dynamic config wherever possible. Existing keys are primary controls.

Primary keys already in place:

- `logging.persistMetricsLogs`
- `raft.adaptiveTimingEnabled`
- `raft.adaptiveTiming*`
- `raft.heartbeatIntervalMs`
- `raft.electionTimeoutMinMs`
- `raft.electionTimeoutMaxMs`

Potential additional keys (if needed):

- `metrics.defaultResolutionMs`
- `metrics.detailedWindowEnabled`
- `metrics.detailedWindowTtlMs`
- `runtime.idleLoopMinIntervalMs` (for selected background loops)

Any new key must have:

- clear owner
- sane default
- runtime validation
- no restart requirement unless unavoidable.

## 10. Rollout Phases

### Phase 0: Baseline Capture

- Record 15m idle baseline on current main.
- Capture CPU/RSS/disk trends and top-growing signals.

### Phase 1: Low-Risk Noise and Metrics Defaults

- Apply default metrics/logging policy changes.
- Re-measure idle profile.

### Phase 2: Timer/Loop Cadence and Adaptive Defaults

- Adjust background cadence and adaptive thresholds.
- Validate failover/convergence behavior.

### Phase 3: Queue/Backpressure and Write-Pressure Hardening

- Tighten queue pressure telemetry and controls.
- Validate under load and idle soak.

### Phase 4: Stabilization

- Run full harness scenarios.
- Publish before/after report and recommended defaults.

## 11. Verification Matrix

Mandatory checks:

- Unit tests for new logic.
- Integration tests for failover and convergence.
- 30-minute idle soak for CPU/RSS/write-rate trend.
- Harness runs for 3x and 5x cluster scenarios.

No-go conditions:

- Increased election churn.
- New memory leak trend.
- Significant regression in convergence success rate.

## 12. Risks and Mitigations

- Risk: lower background cadence may delay state freshness.
  - Mitigation: demand-triggered updates + bounded max staleness.
- Risk: excessive metrics suppression may hide regressions.
  - Mitigation: keep Tier A aggregates always on.
- Risk: adaptive timing mis-tuning causes leader churn.
  - Mitigation: conservative thresholds + hysteresis + soak validation.

## 13. Deliverables

- Code/config updates implementing WS1-WS6.
- Updated operator runbook for diagnostics/tuning.
- Before/after benchmark report with:
  - idle CPU/RSS/write-rate
  - convergence success
  - any throughput/latency tradeoffs.

## 14. Closure Status

- Closure artifact: `.kiro/specs/raft-optimization-spec-no-liferaft-changes-closure.md`
  (captured 2026-02-17).
