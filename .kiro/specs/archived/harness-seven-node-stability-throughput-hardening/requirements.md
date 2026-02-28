# Requirements Document: Harness Seven-Node Stability and Throughput Hardening

## Introduction

This spec defines the next hardening phase for distributed benchmark reliability
and throughput on seven-node clusters. The immediate goal is to stop accepting
partial or brittle benchmark runs and enforce conditions that make SUT-vs-
Postgres comparisons valid.

The latest seven-node baseline run on February 25, 2026
(`postgres-baseline-7node-20260225T175305Z.report.json`) passed scenario-level
checks but still executed load on only one SUT node and reported severe
throughput and latency gaps.

## Problem Statement

The current benchmark behavior allows runs that are operationally incomplete:

1. Seven-node run still used one SUT load node:
   - `sutLoadNodeCount=1`
   - `baselineLoadNodeCount=8`
   - parity status `mismatched`
2. SUT discovery timed out and returned partial results:
   - `attempts=6`, `timedOut=true`
   - source statuses: `discovered=1`, `error=6`
3. Throughput and latency remained poor despite scenario pass:
   - `sut_ops_per_sec=10.786`
   - `pg_tps=120`
   - `throughput_ratio=0.090`
   - `sut_p99_ms=1087`
4. Playback and logs still showed warning/error signals during run:
   - `Falling back to safe CDC propagation mode`
   - `CDC event buffered while no subscribers registered`
   - `Critical rebalancing state detected`
   - `Operation failed`

These runs are currently marked as passed because preflight accepts any positive
number of load nodes, parity mismatch is configured as non-fatal, and warning/
error thresholds are not enforced as benchmark failures.

## Goals

1. Make seven-node benchmark runs truthful and fail fast on invalid topology.
2. Enforce strict SUT-vs-Postgres load parity for benchmark comparability.
3. Add hard readiness and stability barriers before load starts.
4. Eliminate brittle CDC/subscription behavior under multi-node load.
5. Reduce rebalancing-induced throughput collapse.

## Non-Goals

1. Replacing the harness architecture or scenario framework.
2. Changing core consistency semantics of the distributed system.
3. Introducing dual legacy/new execution paths.

## Requirements

### Requirement 1: Strict Multi-Node Discovery Gate (P0)

**User Story:** As a benchmark operator, I need the run to fail unless the
expected number of SUT load nodes is discovered and reachable.

#### Acceptance Criteria

1. For benchmark profiles, preflight SHALL fail if reachable/discovered SUT load
   nodes are below profile minimum.
2. Seven-node benchmark profile SHALL require at least seven SUT load nodes for
   SUT load fanout.
3. Discovery diagnostics SHALL include full per-source success/error details and
   non-truncated root-cause context.
4. Partial discovery fallback SHALL be disallowed in strict benchmark mode.
5. Report summary SHALL show strict-discovery gate decision and failure reason.

### Requirement 2: Enforced Load Parity Contract (P0)

**User Story:** As a performance engineer, I need exact load-shape parity
between SUT and Postgres baselines.

#### Acceptance Criteria

1. Benchmark runs SHALL compare configured and effective parity dimensions:
   load node count, per-node budget, total in-flight cap, target ops/sec,
   duration, and workload shape.
2. Parity status `mismatched` SHALL fail benchmark profiles in strict mode.
3. Parity mismatch reason codes SHALL remain machine-readable and stable.
4. Effective parity values SHALL be recorded in scenario details and
   benchmark-gate context.
5. Historical comparison tooling SHALL include parity deltas explicitly.

### Requirement 3: Internal Error/Warning Failure Thresholds (P0)

**User Story:** As a maintainer, I need hidden internal failures to fail a run
instead of being silently tolerated.

#### Acceptance Criteria

1. Benchmark profiles SHALL define threshold policies for internal warning/error
   classes observed during scenario execution.
2. Repeated operation failures, repeated CDC buffering-without-subscriber
   warnings, and repeated critical rebalancing warnings SHALL contribute to
   threshold evaluation.
3. Threshold violations SHALL fail the scenario with actionable diagnostics.
4. Threshold counters SHALL be emitted in scenario details for every run.
5. Threshold policy SHALL be configurable but default strict for benchmark
   profiles.

### Requirement 4: Hard Pre-Load Readiness Barrier (P0)

**User Story:** As a reliability engineer, I need load to start only after
cluster-wide readiness is stable.

#### Acceptance Criteria

1. Pre-load gate SHALL require stable readiness across all required load nodes
   for a configured stable window.
2. Readiness SHALL include membership visibility, routing readiness, schema
   readiness for benchmark table, and admin queryability.
3. Load SHALL not start while rebalancing is above configured in-flight
   threshold.
4. Gate timeouts SHALL fail scenario with per-node reason breakdown.
5. Gate artifacts SHALL include node-level readiness snapshots.

### Requirement 5: CDC Subscription Handshake and Catch-Up (P1)

**User Story:** As a system engineer, I need deterministic CDC delivery even
when subscribers connect late or restart.

#### Acceptance Criteria

1. CDC subscription SHALL use explicit handshake acknowledgment with epoch or
   version context.
2. Missing subscriber windows SHALL trigger deterministic catch-up/backfill path.
3. Backfill completion SHALL be observable with explicit metrics.
4. System SHALL avoid indefinite buffering without subscriber progress signal.
5. Subscription and catch-up state SHALL be visible in integration and harness
   diagnostics.

### Requirement 6: CDC and Subscription Telemetry Expansion (P1)

**User Story:** As a diagnostician, I need enough observability to locate CDC
bottlenecks quickly.

#### Acceptance Criteria

1. Per-node metrics SHALL include subscriber count, buffered event count,
   catch-up lag, and catch-up throughput.
2. Telemetry SHALL distinguish steady-state streaming vs catch-up mode.
3. Reports SHALL include CDC pressure summary for benchmark runs.
4. Missing telemetry SHALL fail schema validation for benchmark reports.
5. Compare script SHALL print CDC pressure deltas between latest and prior run.

### Requirement 7: Rebalancing Hysteresis and Benchmark Safety (P1)

**User Story:** As a benchmark operator, I need to prevent rebalancing churn
from dominating benchmark throughput.

#### Acceptance Criteria

1. Ownership movement SHALL include cooldown/hysteresis to reduce thrashing.
2. Benchmark mode SHALL support ownership-move pinning during steady-state load
   windows, except explicit fault-injection scenarios.
3. Rebalancing pressure metrics SHALL be exported per phase.
4. Critical rebalancing state during steady benchmark load SHALL fail strict
   profiles.
5. Integration tests SHALL cover join/rebalance behavior under four-plus nodes.

### Requirement 8: Multi-Node System-Table Read Correctness (P2)

**User Story:** As a correctness engineer, I need to prevent local-replica
shortcuts from masking cross-node system-table visibility issues.

#### Acceptance Criteria

1. Multi-node mode SHALL not rely on local-only shortcuts where global/system
   visibility is required.
2. Code paths for system-table reads SHALL use a single canonical mechanism in
   multi-node benchmark mode.
3. Integration tests SHALL validate four-plus node system-table visibility from
   each node.
4. Violations SHALL surface as test failures, not warning-only diagnostics.
5. Documentation SHALL list the canonical read path ownership.

### Requirement 9: Admission and Queueing Behavior Hardening (P2)

**User Story:** As a performance engineer, I need load admission behavior that
fails fast and avoids deep queue collapse.

#### Acceptance Criteria

1. Admission control SHALL support bounded queue policy and early reject mode
   for overload.
2. Queue delay pressure SHALL be emitted with per-node and global summaries.
3. Undispatched and rejected operations SHALL include stable reason classes.
4. Benchmarks SHALL fail if overload policy contracts are violated.
5. Priority ranking SHALL elevate admission/queue pressure when dominant.

### Requirement 10: Test Coverage and Enforcement (P0-P2)

**User Story:** As a maintainer, I need regression-proof tests for strict
benchmark validity and multi-node stability.

#### Acceptance Criteria

1. Add failing tests first for strict discovery and strict parity failure paths.
2. Add integration coverage for four-plus node admin API accessibility.
3. Add integration/harness tests for CDC handshake, catch-up, and metrics.
4. Add tests for rebalancing hysteresis and benchmark pinning semantics.
5. Add report-schema tests ensuring required strict-mode telemetry is always
   present.
