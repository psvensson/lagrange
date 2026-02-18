# Requirements Document

## Introduction

This spec defines a production-safe migration plan from liferaft to
`raft-logic`, based on the current spike outcome (`go_candidate`) in
`.kiro/specs/archived/raft-logic-investigation/reports/final-spike-report.json`.

Goal: move from spike viability to controlled production cutover with explicit
safety gates.

## Scope and Constraints

- Scope: phase-2 hardening and migration execution plan.
- Estimated effort: 6-10 weeks (phased).
- Existing liferaft path remains default until cutover gate approval.
- No mixed-provider consensus inside one replica process.
- No runtime fallback path from raft-logic to liferaft inside the same process.

## Requirements

### Requirement 1: Migration Guardrails and Single-Provider Runtime

**User Story:** As a maintainer, I want one active raft provider per process so
runtime behavior stays deterministic and debuggable.

#### Acceptance Criteria

1. Process startup SHALL select exactly one provider (`liferaft` or
   `raft_logic`) for the process lifetime.
2. The runtime SHALL NOT switch providers dynamically after startup.
3. The runtime SHALL NOT include fallback chaining (`raft_logic -> liferaft`)
   for the same operation.
4. Liferaft SHALL remain the default provider until final cutover approval.

### Requirement 2: Stable Provider Contract at Integration Boundaries

**User Story:** As an engineer, I want a stable internal contract so service
code is not tightly coupled to a specific raft library.

#### Acceptance Criteria

1. A single provider contract SHALL define lifecycle, proposal, leader/status,
   membership, and timing update operations.
2. Partition and message-group raft call sites SHALL consume this contract
   rather than library-specific APIs directly.
3. Contract behavior SHALL be covered by provider-agnostic tests.

### Requirement 3: Canonical ID Mapping and Validation

**User Story:** As a maintainer, I want deterministic ID translation so UUID
runtime IDs map safely to raft-logic numeric-string IDs.

#### Acceptance Criteria

1. One shared mapping component SHALL own external<->internal raft ID
   translation.
2. Mapping SHALL be deterministic, bijective within a replica group, and
   validated on startup.
3. Invalid or non-mappable IDs SHALL fail fast with explicit error messages.
4. No second ID mapping implementation SHALL exist in parallel modules.

### Requirement 4: MessageRouter-Based Transport Parity

**User Story:** As an operator, I want raft transport behavior to remain aligned
with current routing and failure semantics.

#### Acceptance Criteria

1. Production raft packets SHALL flow through `MessageRouter`.
2. Transport retry and timeout behavior SHALL be explicitly defined and tested
   for follower/leader/network-partition scenarios.
3. Harness and production paths SHALL avoid raw in-memory transport outside
   local tests.
4. Transport failure artifacts SHALL include per-partition operation history and
   replica membership snapshot.

### Requirement 5: Membership and Leadership Semantics Parity

**User Story:** As an engineer, I want leader election/failover and membership
changes to preserve current system invariants.

#### Acceptance Criteria

1. Leader election, failover, and leader-loss handling SHALL match existing
   service expectations.
2. Membership changes (join/remove/replace) SHALL keep quorum safety and clear
   convergence diagnostics.
3. Convergence counting SHALL use authoritative membership sources and avoid
   syntax-dependent live-query fragility.

### Requirement 6: Timing and Dynamic Configuration Support

**User Story:** As an operator, I want raft timing behavior tunable through
configuration with predictable propagation semantics.

#### Acceptance Criteria

1. Timing parameters (election, heartbeat, tick interval) SHALL have one
   canonical config source.
2. Dynamic timing updates SHALL define whether changes apply immediately,
   on restart, or on new replicas only.
3. Update semantics SHALL be documented and verified by tests.
4. Adaptive timing mode (if enabled) SHALL include hysteresis/guardrails and
   explicit rollback controls.

### Requirement 7: Durability and Restart Safety

**User Story:** As an operator, I want restart and crash recovery to be
predictable before production cutover.

#### Acceptance Criteria

1. SQLite-backed restart recovery SHALL pass for single-node, rolling, and
   leader-restart scenarios.
2. Restarted replicas SHALL recover non-zero term and valid leader status.
3. Post-restart proposal and commit apply behavior SHALL be verified.
4. Crash-recovery tests SHALL be included in migration gating.

### Requirement 8: Observability Defaults and Log Discipline

**User Story:** As an operator, I want idle clusters to remain mostly quiet and
avoid self-inflicted IO/CPU load from instrumentation.

#### Acceptance Criteria

1. Detailed instrumentation metrics SHALL be disabled by default.
2. Default metric resolution SHALL be low-overhead and sufficient for health,
   saturation, and error diagnosis.
3. Per-commit debug logs SHALL be disabled by default and controlled via
   explicit debug toggles.
4. Logging/metrics pipelines SHALL NOT recursively produce additional logging
   from their own emission path.

### Requirement 9: Benchmark and Regression Gates

**User Story:** As a decision-maker, I want objective pass/fail gates against
both prior runs and the Postgres baseline.

#### Acceptance Criteria

1. Benchmark runs SHALL include 3-node and 5-node system scenarios plus
   replicated Postgres baseline reference.
2. Each report SHALL include comparison vs previous similar run and vs Postgres
   baseline.
3. Migration candidate SHALL fail gate if it regresses >10% vs liferaft baseline
   on equivalent workload without justified mitigation.
4. Idle-resource gate SHALL include CPU, RSS trend, and disk-write rate checks.

### Requirement 10: Rollout, Rollback, and Cutover Policy

**User Story:** As an operator, I want staged rollout and fast rollback without
ambiguous mixed-state behavior.

#### Acceptance Criteria

1. Rollout SHALL proceed in stages: dev, canary, limited production, full
   production.
2. Each stage SHALL have explicit promotion and abort criteria.
3. Rollback SHALL be defined as controlled redeploy/restart to prior provider
   configuration, not runtime fallback in-process.
4. Cutover completion SHALL include removal or archival of superseded
   migration-only code.

### Requirement 11: Documentation and Runbooks

**User Story:** As a maintainer, I want clear runbooks and architecture records
so migration operations are repeatable.

#### Acceptance Criteria

1. Internal migration specs and reports SHALL be stored under `.kiro/specs/`.
2. End-user behavior changes SHALL be documented in `docs/` and updated examples
   under `examples/` where relevant.
3. Runbooks SHALL include preflight, rollout, rollback, and incident triage
   procedures.

### Requirement 12: Final Go-Live Decision Gate

**User Story:** As a decision-maker, I want one auditable go-live checkpoint
before making raft-logic the default.

#### Acceptance Criteria

1. Go-live approval SHALL require all requirements 1-11 to pass.
2. A final report SHALL summarize risks, mitigations, benchmark deltas,
   and rollback readiness.
3. If any blocker remains unresolved, liferaft SHALL remain default.
