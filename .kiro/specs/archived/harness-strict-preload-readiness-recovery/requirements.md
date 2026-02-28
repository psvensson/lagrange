# Requirements Document: Harness Strict Preload Readiness Recovery

## Introduction

This spec defines a recovery plan for repeated strict benchmark failures with
`strict_preload_readiness_failed`, dominated by
`schema_version_unknown` and `routing_not_ready`.

The goal is not another local fix. The goal is to improve system behavior and
working conditions so failures become diagnosable, reproducible, and fixable.

## Problem Statement

Recent 3-node and 7-node strict baseline runs show the same pattern:

1. Pre-load gate fails before load starts.
2. Node reasons are dominated by `schema_version_unknown` and
   `routing_not_ready`.
3. Logs show control-plane stress (`CDC forward ... Message timeout`,
   repeated query timeouts on system-table reads).
4. The benchmark scenario path is too large and coupled, making root-cause
   analysis slow and high-friction.

## Goals

1. Prevent control-plane saturation from invalidating strict readiness.
2. Keep one canonical strict readiness path and remove expensive ambiguity.
3. Add actionable observability for direct root-cause attribution.
4. Simplify benchmark code structure to improve iteration speed and safety.
5. Achieve strict 3-node and 7-node preload pass with full required fanout.

## Non-Goals

1. Replacing Raft or message-group architecture.
2. Redesigning SQL semantics or transaction model.
3. Introducing alternate query/data-plane transport paths.

## Requirements

### Requirement 1: Benchmark Quiet-Mode Contract

**User Story:** As an operator, I need strict benchmarks to run in a stable
control-plane window so readiness reflects real state, not churn.

#### Acceptance Criteria

1. Strict benchmark profiles SHALL enable a benchmark quiet mode during
   preflight, warmup, and load phases.
2. Quiet mode SHALL suppress non-critical background control-plane activity
   that is not required for safety.
3. Safety-critical bypass operations SHALL remain allowed and SHALL emit a
   machine-readable bypass reason.
4. Quiet-mode lifecycle transitions SHALL be emitted in benchmark details and
   playback events.

### Requirement 2: Bounded Control-Plane Write Pressure

**User Story:** As a reliability engineer, I need to limit avoidable
system-table churn so CDC and readiness traffic stays healthy.

#### Acceptance Criteria

1. Periodic node/heartbeat writes SHALL be coalesced and rate-limited by policy.
2. Control-plane periodic writers SHALL avoid emitting unchanged writes.
3. Benchmark details SHALL include per-class control-plane write pressure
   counters.
4. Strict mode SHALL fail with a dedicated reason when write pressure exceeds
   configured thresholds.

### Requirement 3: Lightweight Canonical Readiness Snapshot

**User Story:** As a maintainer, I need strict gating to use one cheap and
deterministic snapshot so timeout noise does not hide root causes.

#### Acceptance Criteria

1. Strict pre-load gating SHALL evaluate one canonical per-node readiness
   snapshot.
2. Snapshot fields SHALL include routing status, schema status, topology
   status, and schema-version watermark values.
3. Snapshot collection SHALL avoid heavyweight fallback queries in strict mode.
4. Missing or invalid snapshot fields SHALL fail closed with stable reason
   codes.

### Requirement 4: Strict Gate Root-Cause Determinism

**User Story:** As a diagnostician, I need strict failures to point to one
dominant cause rather than mixed downstream symptoms.

#### Acceptance Criteria

1. Strict pre-load gate SHALL classify unmet reasons with a stable precedence
   model.
2. Failure payload SHALL include dominant reason class and per-node reason map.
3. Gate timeout output SHALL include required versus observed schema watermark
   snapshots for all required nodes.
4. Strict mode SHALL not run alternate fallback gate logic after canonical
   gate evaluation starts.

### Requirement 5: Saturation-Focused Diagnostics

**User Story:** As a performance engineer, I need first-class visibility into
control-plane saturation indicators during strict readiness checks.

#### Acceptance Criteria

1. Diagnostics SHALL include counts for CDC forward timeout, system-table query
   timeout, and readiness snapshot collection errors.
2. Timeline artifacts SHALL include per-poll readiness snapshots and reason
   transitions.
3. Compare tooling SHALL print control-plane saturation deltas for latest vs
   prior runs.
4. Failure envelopes SHALL include saturation counters when non-zero.

### Requirement 6: Codebase Working-Condition Improvements

**User Story:** As an engineer, I need a smaller and clearer benchmark code
surface so changes are easier to reason about and test.

#### Acceptance Criteria

1. `postgres-baseline-comparison` scenario logic SHALL be split into focused
   modules with single responsibility.
2. Readiness reason codes and snapshot contracts SHALL have one constants owner.
3. Strict gate logic SHALL have one owning module with unit tests.
4. Large mixed-purpose functions in the benchmark scenario path SHALL be
   reduced into composable units.

### Requirement 7: Reproducers and Regression Coverage

**User Story:** As a maintainer, I need tests that reproduce current failures
without running full long benchmark loops each time.

#### Acceptance Criteria

1. Add integration tests that reproduce strict pre-load failure under induced
   control-plane pressure.
2. Add integration tests that validate quiet mode reduces pressure and allows
   strict preload pass.
3. Add unit tests for write-coalescing and strict readiness precedence logic.
4. New tests SHALL enforce stable reason-code expectations.

### Requirement 8: Recovery Completion Gates

**User Story:** As a release owner, I need objective criteria for exiting the
current failure loop.

#### Acceptance Criteria

1. Strict 3-node baseline SHALL pass pre-load and start load with full required
   fanout.
2. Strict 7-node baseline SHALL pass pre-load and start load with full required
   fanout.
3. Strict runs SHALL not be dominated by `schema_version_unknown` and
   `routing_not_ready`.
4. Compare output SHALL include throughput/p99 parity metrics and saturation
   deltas against prior runs and available Postgres baseline data.

### Requirement 9: Atomic MOVE_REPLICA Assignment Reservations

**User Story:** As a cluster operator, I need concurrent joins to produce
unique message-group replica assignments so ownership cannot split.

#### Acceptance Criteria

1. `MOVE_REPLICA` assignment selection SHALL be backed by an atomic reservation
   record before bootstrap response is returned.
2. Reservation records SHALL include `assignmentId`, `replicaId`,
   `targetNodeId`, `status`, and lease expiry.
3. Concurrent bootstrap calls SHALL NOT return the same `replicaId` assignment
   to different target nodes.
4. Expired or failed reservations SHALL be reclaimable without manual cleanup.

### Requirement 10: Assignment Token Handshake and Commit Authorization

**User Story:** As a maintainer, I need handoff commit to be authorized by the
exact bootstrap assignment so stale or forged register-service calls fail
closed.

#### Acceptance Criteria

1. Bootstrap `MOVE_REPLICA` responses SHALL include a required assignment token
   (`assignmentId`) and lease metadata.
2. `register-service` for `MOVE_REPLICA` SHALL include the assignment token.
3. Seed-side commit SHALL fail closed when token is missing, expired, unknown,
   or bound to a different node/replica.
4. Handoff operation telemetry SHALL include assignment token linkage.

### Requirement 11: Single-Owner Message-Group Replica Invariant

**User Story:** As a reliability engineer, I need hard duplicate-ownership
guards so one `replicaId` cannot run on multiple nodes.

#### Acceptance Criteria

1. Service registration SHALL enforce one active owner per message-group
   `replicaId`.
2. Replica startup/reconciliation SHALL fail fast if metadata indicates
   conflicting ownership for the same `replicaId`.
3. Ownership-conflict failures SHALL emit stable machine-readable reason codes
   and diagnostics.

### Requirement 12: Join READY Must Match Canonical Versioned Readiness

**User Story:** As a benchmark owner, I need joiners to become READY only after
the same canonical schema/routing/topology contract used by strict preload has
converged.

#### Acceptance Criteria

1. Joiners SHALL NOT transition to READY until canonical table-scoped
   readiness reports `routingReady=true`, `topologyReady=true`, and
   `appliedSchemaVersion >= requiredSchemaVersion`.
2. Join-time readiness checks SHALL use the same snapshot contract as strict
   preload, without heavyweight fallback probe paths.
3. Join-time timeout failures SHALL preserve deterministic reason classification
   (`schema_version_unknown`, `schema_version_lag`, `routing_not_ready`,
   `topology_not_ready`).
4. Join diagnostics SHALL include required-versus-observed schema versions for
   each required load node.

### Requirement 13: Concurrent-Join Race and Convergence Regression Coverage

**User Story:** As a maintainer, I need integration tests that reproduce
concurrent-join assignment races and verify version convergence so regressions
are caught quickly.

#### Acceptance Criteria

1. Add integration coverage for concurrent joiners requesting bootstrap at the
   same time; assignments SHALL be unique.
2. Add integration coverage that stale/invalid assignment tokens are rejected by
   `register-service`.
3. Add integration coverage that all required load nodes eventually report
   non-null `appliedSchemaVersion` in strict readiness scope.
4. Regression tests SHALL assert stable reason-code output for assignment and
   convergence failures.
