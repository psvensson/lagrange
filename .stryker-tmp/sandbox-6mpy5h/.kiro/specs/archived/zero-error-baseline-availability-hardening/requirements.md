# Requirements Document

## Introduction

This specification defines how to eliminate real runtime failures in baseline
harness runs for distributed clusters, with primary focus on 3-node and 7-node
profiles.

The objective is not to hide errors. The objective is to remove the fault
conditions that currently produce:

1. load-operation timeouts,
2. circuit-breaker cascades,
3. startup/discovery instability,
4. readiness mismatches between discovery and true queryability.

## Problem Statement

Recent benchmark reports show a consistent failure shape:

1. a small number of true load-path timeouts,
2. followed by a large volume of fast circuit-open rejections,
3. while pre-load and startup phases still show readiness churn.

This indicates availability-control behavior is amplifying faults faster than
partition/replication state can stabilize.

## Scope

In scope:

1. harness load-path failure handling,
2. NodeClient/LoadGenerator ownership boundaries,
3. node-local discovery-readiness contract,
4. startup/active-state gating,
5. benchmark scenario gating and policy,
6. integration and distributed-harness verification.

Out of scope:

1. redesign of Raft algorithm internals,
2. replacing SQL engine semantics,
3. replacing admin transport protocol.

## Glossary

- **Operation Error**: An operation that fails after all retry/failover attempts.
- **Attempt Error**: A transient failed attempt that is later recovered by retry
  or failover.
- **Breaker Cascade**: A condition where small timeout count opens breaker(s),
  causing many fast rejects.
- **Discovery Ready**: A replica advertised as suitable for new workload traffic.
- **Schema Ready**: Target table metadata is visible and queryable on a node.
- **Topology Lock**: A bounded window where benchmark load is blocked unless
  replica operations and leadership churn are below threshold.

## Requirements

### Requirement 1: Zero Operation Errors Is a Hard Invariant

**User Story:** As a benchmark owner, I need runs to fail on real operation
errors so results remain trustworthy.

#### Acceptance Criteria

1. The benchmark scenario SHALL hard-fail when `loadMetrics.failed > 0`.
2. The benchmark scenario SHALL hard-fail when `loadMetrics.errors > 0`.
3. Attempt-level transient failures SHALL be recorded separately from operation
   errors.
4. Report output SHALL include both operation and attempt-level failure signals.

### Requirement 2: Single Failure-Handling Owner for Load Path

**User Story:** As a maintainer, I need one owner for breaker and retry
behavior to prevent competing failure policies.

#### Acceptance Criteria

1. Load-path circuit-breaker state SHALL have one owning module.
2. LoadGenerator SHALL NOT maintain an independent breaker policy when
   NodeClient already owns load-channel breaker behavior.
3. Load-path retry semantics SHALL be defined in one module and reused.
4. No dual-path fallback implementation SHALL remain for breaker control.

### Requirement 3: Breaker Behavior Must Not Amplify Small Timeout Bursts

**User Story:** As an operator, I need transient timeouts to degrade throughput,
not collapse availability.

#### Acceptance Criteria

1. Load-channel breaker defaults SHALL require more than one consecutive failure
   before opening.
2. Breaker cooldown SHALL be bounded to avoid long blackholes on small clusters.
3. Half-open recovery probing SHALL be explicit and deterministic.
4. Breaker-open events SHALL be measured per node and per channel.
5. A small number of timeouts SHALL NOT produce order-of-magnitude larger
   operation-error volume.

### Requirement 4: Channel Isolation at Transport Level

**User Story:** As a test operator, I need control/snapshot traffic to not
starve load traffic.

#### Acceptance Criteria

1. Node-level transport paths SHALL isolate load traffic from control/snapshot
   traffic.
2. Backpressure in one channel SHALL NOT consume all request budget in other
   channels.
3. Channel metrics SHALL expose queueing delay and timeout sources.
4. Channel isolation behavior SHALL be covered by integration tests.

### Requirement 5: Discovery Must Encode Workload Readiness

**User Story:** As a client of discovery, I need canonical visibility of which
replicas are currently safe for workload routing.

#### Acceptance Criteria

1. Local discovery snapshot SHALL include readiness state per replica.
2. Readiness SHALL include routing health and topology safety indicators.
3. Discovery SHALL expose enough data to distinguish `healthy endpoint` from
   `workload-ready replica`.
4. Harness node selection SHALL consume this canonical readiness contract.
5. No legacy discovery fallback paths SHALL remain.

### Requirement 6: Schema Visibility Must Be First-Class in Readiness

**User Story:** As a benchmark runner, I need table-queryability to be part of
readiness, not a side probe.

#### Acceptance Criteria

1. Readiness evaluation SHALL support table-specific schema visibility checks.
2. Benchmark table visibility (`benchmark_events`) SHALL be represented as an
   explicit readiness signal.
3. Nodes that fail schema visibility SHALL be excluded before load starts.
4. Readiness reasons SHALL be structured and reported.

### Requirement 7: Startup and Active-State Convergence Must Be Stronger

**User Story:** As a cluster operator, I need predictable transition to ACTIVE
for all nodes before benchmark phases begin.

#### Acceptance Criteria

1. Startup gate SHALL require all nodes to satisfy ACTIVE state contract within
   bounded timeout.
2. Startup diagnostics SHALL include per-node status, snapshot coverage, and
   dominant failure reasons.
3. Benchmark phases SHALL NOT start when startup gate is incomplete.
4. 7-node startup gate SHALL be covered by distributed harness tests.

### Requirement 8: Topology Churn Must Be Bounded During Load

**User Story:** As a performance engineer, I need load-stage results isolated
from ongoing replica operation churn.

#### Acceptance Criteria

1. A pre-load topology lock SHALL require no in-flight replica operations.
2. Leadership churn SHALL remain below configured threshold during lock window.
3. If topology lock cannot be established, load phase SHALL fail fast.
4. Post-load drain SHALL verify topology returns to stable state.

### Requirement 9: Admission Control Must Prefer Backpressure Over Timeouts

**User Story:** As a reliability engineer, I need overload to reduce throughput
without generating timeout storms.

#### Acceptance Criteria

1. Load admission SHALL cap effective concurrency per node and globally.
2. Scheduler SHALL defer dispatch when no healthy capacity exists.
3. Queue/dispatch delay SHALL be observable for diagnosis.
4. Admission control behavior SHALL be deterministic in tests.

### Requirement 10: Observability Must Explain Failure Causality

**User Story:** As on-call, I need reports to identify whether failures are
startup, discovery-readiness, topology, or data-path issues.

#### Acceptance Criteria

1. Report SHALL include phase-level decisions and reason histograms.
2. Report SHALL include channel-level metrics by node and channel.
3. Report SHALL distinguish operation errors from attempt errors.
4. Report SHALL include readiness exclusion reasons for each skipped node.
5. Report SHALL include breaker-open root metrics (timeouts, operation errors,
   retries, cooldown windows).

### Requirement 11: Test-First Reproduction of Current Failure Modes

**User Story:** As a maintainer, I need failing tests that reproduce the known
error shapes before implementing fixes.

#### Acceptance Criteria

1. Add integration tests that reproduce breaker cascade from small timeout burst.
2. Add integration tests that reproduce discovery-ready but schema-not-ready
   mismatch.
3. Add distributed-harness tests for 3-node and 7-node baseline profiles.
4. Each bug fix SHALL be preceded by a failing test per testing guidelines.

### Requirement 12: 3-Node and 7-Node Acceptance SLOs

**User Story:** As release owner, I need explicit acceptance gates for cluster
sizes we use regularly.

#### Acceptance Criteria

1. 3-node baseline run SHALL complete with `failed=0` and `errors=0`.
2. 7-node baseline run SHALL complete startup and preflight without readiness
   timeout regression.
3. 7-node baseline run SHALL complete load phase with zero operation errors.
4. Attempt-level transient failures MAY exist but SHALL remain below configured
   threshold and be diagnosable.

### Requirement 13: Config Defaults Must Be Safe, Not Fragile

**User Story:** As a local runner, I need benchmark defaults that do not induce
self-inflicted failure storms.

#### Acceptance Criteria

1. Default load breaker threshold SHALL be conservative for 3-node profiles.
2. Cooldown defaults SHALL avoid long dual-node blackout windows.
3. Timeout defaults SHALL be aligned with realistic distributed query latency.
4. Config policy values SHALL be centralized constants and documented.

### Requirement 14: One Code Path Per Concern

**User Story:** As a reviewer, I need to verify there is one implementation path
for each function to prevent regression and ambiguity.

#### Acceptance Criteria

1. Discovery node selection SHALL use one canonical path.
2. Breaker handling SHALL use one canonical path.
3. Readiness gating SHALL use one canonical gate engine path.
4. Any temporary adapter used during migration SHALL be removed before closure.

