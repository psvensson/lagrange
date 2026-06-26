# Requirements Document

## Introduction

This spec defines how the distributed test harness must evolve to make
system-under-test (SUT) throughput optimization measurable, fair against
Postgres, and repeatable across runs.

The benchmark goal is to close the throughput gap to Postgres while preserving
system correctness and the system guidelines. To achieve that, the harness must
ensure load parity between SUT and baseline, and each run must emit the same
optimization-focused metrics.

## Problem Statement

Evidence from the latest benchmark runs on February 24, 2026 shows that current
harness behavior limits comparability and hides bottlenecks:

1. `postgres-baseline-7node-acceptance-phase6b.report.json`
   - SUT ops/sec: `11.737`
   - Baseline ops/sec: `120`
   - Throughput ratio: `0.0978`
   - SUT completion ratio vs target (`354/3600`): `9.83%`
   - Queue delay avg: `12322ms`, p99: `25486ms`
2. Same run reports `sutLoadNodeCount=1`, while baseline uses
   `loadNodeCount=8` and `poolMaxConnections=128`.
3. `postgres-baseline-7node-rerun-20260224T054003Z.report.json` shows
   `budgetDenials=3194`, indicating admission throttling dominates behavior.
4. `standardSummary.scaleEfficiencySummary` reports throughput scale efficiency
   `0.177` for 3->7 nodes under comparable workload.
5. `performanceDiagnostics` is `null` in these latest runs, so write-path phase
   attribution data is missing.

## Glossary

- **Load parity**: SUT and baseline runs use the same effective load model
  (workload mix, target rate, clients, concurrency semantics, and duration).
- **Effective load topology**: number of reachable load endpoints actually used.
- **Admission throttling**: requests denied by per-node in-flight budgets.
- **Dispatch backlog**: scheduled operations that miss their planned dispatch
  time, visible as queue delay.
- **Optimization signal**: metric that directly points to a speed or throughput
  bottleneck.

## Requirements

### Requirement 1: Enforced Load Parity Contract

**User Story:** As a benchmark consumer, I want SUT and Postgres load to be
comparable in every relevant dimension so throughput comparisons are valid.

#### Acceptance Criteria

1. The harness SHALL compute and publish a machine-readable load parity record
   per run.
2. The parity record SHALL include configured and effective values for workload,
   operation mix, duration, target ops/sec, logical clients, and concurrency
   caps.
3. The harness SHALL classify parity as `matched` or `mismatched`.
4. A mismatch SHALL include explicit reason codes and values.
5. Benchmark profiles SHALL support policy to fail on parity mismatch.

### Requirement 2: Aggregated SUT Load Node Discovery

**User Story:** As an engineer, I want SUT load node discovery to aggregate all
valid discovery sources so load fanout is not under-selected.

#### Acceptance Criteria

1. SUT load node resolution SHALL aggregate discovered candidates across all
   configured discovery sources.
2. Discovery SHALL not stop at the first non-empty source result.
3. Diagnostics SHALL include per-source discovered node ids and unioned result.
4. Diagnostics SHALL include exclusion reasons for non-ready nodes.
5. Effective load nodes SHALL be reachable and readiness-validated.

### Requirement 3: Single-Owner Admission Policy Configuration

**User Story:** As a harness maintainer, I want one owner for load admission
limits so hidden caps do not distort throughput.

#### Acceptance Criteria

1. Per-node load in-flight limits SHALL be controlled by one policy source.
2. Scenario-level load settings and NodeClient channel settings SHALL be
   resolved into one effective load budget.
3. Effective admission settings SHALL be recorded in report details.
4. Budget denial counts SHALL be treated as first-class optimization signals.
5. Conflicting admission settings SHALL be rejected or explicitly resolved with
   traceable diagnostics.

### Requirement 4: Complete Dispatch Accounting Metrics

**User Story:** As a performance engineer, I want full load-generator accounting
so queueing and non-completion are measurable.

#### Acceptance Criteria

1. Load metrics SHALL include target operation count and dispatched operation
   count.
2. Metrics SHALL include completed, failed, and undispatched counts.
3. Undispatched counts SHALL include reason classes (capacity, admission,
   duration timeout).
4. Queue delay statistics SHALL remain present and stable across runs.
5. Per-node dispatch and completion counters SHALL be emitted.

### Requirement 5: Stable Metrics Schema Across Runs

**User Story:** As an optimizer, I want every run to emit the same key metrics
so before/after comparisons are reliable.

#### Acceptance Criteria

1. Benchmark scenario reports SHALL always include benchmark, baseline,
   comparison, phase timeline, and channel metrics sections.
2. Required optimization metrics SHALL be present even when value is zero.
3. Missing optional diagnostics SHALL include explicit reason fields, not null
   without context.
4. Schema version SHALL be incremented for breaking report changes.
5. Historical comparison logic SHALL preserve compatibility.

### Requirement 6: Write-Path Diagnostics Coverage

**User Story:** As a system engineer, I want write-path attribution data in each
run so internal bottlenecks can be prioritized.

#### Acceptance Criteria

1. Benchmark runs SHALL attempt to collect write-path diagnostics.
2. Reports SHALL include sample counts for raft propose, transport deliver, and
   sqlite metrics.
3. If diagnostics are unavailable, report SHALL include explicit unavailability
   reasons.
4. Optimization prioritization SHALL distinguish external load mismatch from
   internal write-path cost.
5. Standard summary SHALL reflect diagnostics coverage quality.

### Requirement 7: Baseline Cache Reuse Across Report Names

**User Story:** As a benchmark operator, I want baseline cache reuse across
repeated runs with equivalent profiles so setup overhead is reduced.

#### Acceptance Criteria

1. Baseline cache identity SHALL remain profile and machine specific.
2. Cache storage path SHALL be stable across report output filenames.
3. Cache metadata SHALL remain fully traceable in reports.
4. Cache freshness and invalidation semantics SHALL be unchanged unless
   explicitly configured.
5. Repeated equivalent runs SHALL produce cache hits when TTL and refresh policy
   allow.

### Requirement 8: Optimization Priority Signals for Queueing and Admission

**User Story:** As a user, I want optimization priorities to highlight the
actual dominant bottleneck class.

#### Acceptance Criteria

1. Priority generation SHALL include queue-delay pressure indicators.
2. Priority generation SHALL include admission denial pressure indicators.
3. Priority evidence SHALL include numeric values and threshold context.
4. Priorities SHALL remain deduplicated and ranked.
5. Top components in optimization summary SHALL reflect these added signals.

### Requirement 9: Throughput Regression and Improvement Gates

**User Story:** As a release owner, I want clear gates so throughput changes are
safe and improvements are measurable.

#### Acceptance Criteria

1. Benchmark gate policy SHALL support minimum required
   `throughputRatioSutToBaseline`.
2. Gate evaluation SHALL include parity status as a prerequisite.
3. Gate results SHALL be reported with pass/fail and mitigation metadata.
4. Gate logic SHALL be configurable per benchmark profile.
5. Gate failures SHALL include actionable diagnostics.

### Requirement 10: Test Coverage for Harness Throughput Semantics

**User Story:** As a maintainer, I want tests to lock in parity and metrics
contracts so future refactors do not regress benchmark validity.

#### Acceptance Criteria

1. Scenario tests SHALL cover aggregated discovery and effective load node
   counting.
2. Scenario tests SHALL cover parity mismatch classification and policy behavior.
3. Unit tests SHALL cover dispatch accounting fields and reason classes.
4. Tests SHALL cover stable baseline cache location behavior.
5. Tests SHALL validate required report fields for optimization metrics.
