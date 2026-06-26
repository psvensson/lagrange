# Requirements Document

## Introduction

This document defines requirements to make multi-node startup and join behavior
robust under realistic load and timing variance. The current system can pass
in-process integration tests while failing distributed harness startup gates due
to control-plane and background workload contention.

The objective is to make correctness independent from incidental timing by
introducing explicit lifecycle ownership, workload isolation, and durable join
coordination.

## Problem Statement

Current behavior indicates structural issues:

1. Readiness and join correctness are coupled to non-critical background work.
2. Control-plane and data-plane operations share resources without strict
   prioritization.
3. Join flows are sensitive to transient timing and cannot always resume from
   persisted checkpoints.
4. Probe semantics are not fully separated by responsibility (liveness,
   startup, traffic readiness).
5. Integration coverage does not consistently model startup contention and
   saturation seen in distributed harness runs.

## Glossary

- **Lifecycle_State_Owner**: Single component that persists and serves startup
  lifecycle state.
- **Control_Ready**: Phase where control-plane prerequisites are satisfied.
- **Join_Ready**: Phase where the node can safely accept/execute join actions.
- **Traffic_Ready**: Phase where user/admin traffic can be routed safely.
- **Degraded**: State with explicit non-fatal blockers; service may remain
  partially available.
- **Hard_Dependency**: Dependency that must be healthy to advance lifecycle.
- **Soft_Dependency**: Dependency that may degrade quality but must not block
  critical lifecycle advancement.
- **Work_Class_A**: Critical control-plane work (bootstrap, membership, lease,
  leader metadata).
- **Work_Class_B**: Replication/data maintenance work.
- **Work_Class_C**: Observability and background telemetry work.
- **Join_Session**: Durable idempotent record for a join attempt and its
  checkpoints.

## Requirements

### Requirement 1: Single Lifecycle State Ownership

**User Story:** As an operator, I want one authoritative lifecycle owner so
startup, readiness, and join gates cannot disagree.

#### Acceptance Criteria

1. THE system SHALL have exactly one Lifecycle_State_Owner for phase state and
   transitions.
2. Lifecycle transitions SHALL be validated against an explicit state machine
   and rejected when invalid.
3. Each transition SHALL record previous phase, next phase, timestamp, and
   reason codes.
4. Probe handlers and join gating SHALL read lifecycle state only from the
   Lifecycle_State_Owner.

### Requirement 2: Explicit Probe Responsibility Split

**User Story:** As a platform engineer, I want probes mapped to clear meanings
so Kubernetes/NGINX behavior is predictable.

#### Acceptance Criteria

1. THE runtime SHALL expose `GET /livez` for process liveness only.
2. THE runtime SHALL expose `GET /startupz` for startup completion only.
3. THE runtime SHALL expose `GET /readyz` for traffic safety only.
4. THE runtime SHALL expose `GET /bootstrap/ready` for lightweight join-readiness
   probing with no snapshot assembly or mutating side effects.
5. Probe responses SHALL include machine-readable fields: `ready`, `phase`,
   `reasons`, `timestamp`, and optional `retryAfterMs`.

### Requirement 3: Hard vs Soft Dependency Classification

**User Story:** As a maintainer, I want readiness gates to block only on truly
critical dependencies so non-critical load cannot prevent cluster formation.

#### Acceptance Criteria

1. `Join_Ready` and `Traffic_Ready` SHALL require all Hard_Dependencies to be
   healthy.
2. Soft_Dependencies SHALL surface degraded reasons but SHALL NOT block
   `Control_Ready` or `Join_Ready`.
3. Observability/log-shipping backlog SHALL be classified as soft dependency.
4. Dependency classification SHALL be centrally defined and unit tested.

### Requirement 4: Workload Isolation and Priority Enforcement

**User Story:** As an SRE, I want control-plane work protected from background
load so startup SLOs remain stable under pressure.

#### Acceptance Criteria

1. THE system SHALL enforce Work_Class_A/B/C scheduling with explicit priority
   and fairness rules.
2. Work_Class_A SHALL have reserved execution capacity that cannot be consumed
   by Work_Class_C.
3. Under overload, Work_Class_C SHALL shed or defer work before Work_Class_A is
   impacted.
4. Scheduler behavior SHALL be observable via metrics for queue depth,
   starvation, and drop/defer counts by class.

### Requirement 5: Durable Idempotent Join Sessions

**User Story:** As a node joining the cluster, I want retries and restarts to
resume safely without duplicating side effects.

#### Acceptance Criteria

1. Join coordination SHALL persist session state in a durable `join_sessions`
   store keyed by `nodeId` and `sessionId` (or equivalent stable key).
2. Join steps SHALL be idempotent and replay-safe per checkpoint.
3. Node restart during join SHALL resume from persisted checkpoint instead of
   restarting from scratch when safe.
4. Terminal validation/conflict failures SHALL be recorded and surfaced as
   non-retryable.

### Requirement 6: Retry and Signaling Contract

**User Story:** As a join client, I want consistent retry semantics tied to
server signals so transient startup conditions are handled automatically.

#### Acceptance Criteria

1. Timeout, `503`, and explicit not-ready codes SHALL be treated as retryable
   within configured budget.
2. Join clients SHALL honor `Retry-After` header or `retryAfterMs` body hint
   when present.
3. Validation/conflict errors (`4xx` non-retryable classes) SHALL fail fast.
4. Retry diagnostics SHALL include attempt count, elapsed time, last code, and
   next delay.

### Requirement 7: Deterministic Startup and Drain Sequencing

**User Story:** As a platform operator, I want startup and shutdown state
changes to be explicit so rolling changes do not create timing races.

#### Acceptance Criteria

1. Startup SHALL progress through explicit phases: `INIT`, `CONTROL_READY`,
   `JOIN_READY`, `TRAFFIC_READY`, and `DEGRADED`.
2. HTTP listener availability SHALL NOT imply readiness before lifecycle gates
   are satisfied.
3. Graceful shutdown SHALL transition to a non-ready/draining state before
   process termination.
4. Lease handoff/release and drain deadlines SHALL be explicitly signaled and
   observable.

### Requirement 8: Observability and Failure Diagnostics

**User Story:** As on-call, I want rapid diagnosis of startup failures so I can
identify the blocking subsystem quickly.

#### Acceptance Criteria

1. Lifecycle transitions SHALL emit structured events with reason codes.
2. Metrics SHALL include phase duration, blocked duration by reason, and probe
   status counts by endpoint.
3. Harness timeout reports SHALL include readiness phase history and reason
   histograms.
4. Diagnostics SHALL distinguish liveness failure, startup incomplete, and
   readiness blocked conditions.

### Requirement 9: Test Coverage Parity for Realistic Conditions

**User Story:** As a test maintainer, I want CI to cover startup contention and
saturation so distributed failures are caught before harness runs.

#### Acceptance Criteria

1. Distributed harness startup gating SHALL use lightweight readiness probe,
   not `POST /bootstrap`.
2. Integration tests SHALL include real listener + real HTTP join path (no
   in-process injection) for at least one canonical join scenario.
3. CI SHALL include deterministic fault-injection tests for class-C saturation,
   delayed SQL readiness, and metadata lag.
4. Readiness robustness tests SHALL be required gates for control-plane changes.

### Requirement 10: Backward-Compatible Rollout

**User Story:** As a release owner, I want staged rollout controls so we can
adopt the new lifecycle model safely.

#### Acceptance Criteria

1. New behavior SHALL be guarded by explicit feature flags with independent
   rollout control.
2. Existing `POST /bootstrap` clients SHALL remain compatible during migration.
3. Legacy `/health` behavior MAY remain temporarily but SHALL be documented as
   non-authoritative for readiness.
4. Rollout SHALL define canary, expansion, rollback triggers, and SLO-based
   exit criteria.
