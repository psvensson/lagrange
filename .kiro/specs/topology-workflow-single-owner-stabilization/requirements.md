# Requirements Document: Topology Workflow Single-Owner Stabilization

## Introduction

This spec is a follow-on stabilization program for the topology-changing parts
of the control plane, especially partition splitting.

Recent seven-node partitioning failures point to a structural problem rather
than a string of isolated bugs:

1. workflow rows can stall while executor-side work already succeeded
2. split execution ownership is divided across multiple components
3. critical split progress still depends on in-memory state
4. readiness for internal repair/provisioning is conflated with client-serving
   readiness
5. atomic multi-row transitions still depend on optional wiring
6. some decisions still treat cache visibility or fallback read models as proof
   of progress

The goal of this spec is to make topology workflows single-owner, durable,
explicitly acknowledged, and fail-closed when required owners or transactional
facilities are missing.

## Problem Statement

The current architecture is still brittle in several connected ways:

1. `replica_operations` is treated as an owner-owned workflow table, but
   executor components still write workflow steps directly.
2. Managed partition split work is initiated by one component, partially
   executed by another, and completed by a third, with no single durable owner
   from admission through cleanup.
3. Split correctness still depends on process-local state for source backfill
   and catch-up progress.
4. Internal topology work can be blocked by "serve traffic" readiness
   requirements even when a node is healthy enough to accept repair or
   provisioning work.
5. Some critical multi-row transitions fall back to sequential writes when the
   transaction facility is absent, so semantics vary by wiring.
6. Some control-plane components still accept owner dependencies but keep local
   fallback logic when those owners are missing.

## Requirements

### Requirement 1: Single Writer for Replica Operation Workflow State

**User Story:** As a maintainer, I want `replica_operations` to have one
workflow owner so operation state cannot disagree with executor-local state.

#### Acceptance Criteria

1. `RebalanceCoordinator` SHALL be the only component allowed to create
   `replica_operations` rows and mutate owner-owned workflow fields such as:
   - `status`
   - `workflow_step`
   - `completed_at`
   - `error_message`
   - `steps_history`
2. Executor-side components such as `ReplicaHandler` SHALL report typed
   outcomes and observations to the workflow owner; they SHALL NOT directly
   transition `replica_operations.workflow_step`.
3. Field ownership for `replica_operations` SHALL be documented and test-covered.
4. Recovery, polling, and event-triggered progression SHALL all feed the same
   workflow owner path; no alternate mutation path SHALL remain.

### Requirement 2: One Durable Owner for the Entire Managed Split Lifecycle

**User Story:** As an operator, I want a split to be one durable workflow so it
can be explained, resumed, and completed without relying on process memory.

#### Acceptance Criteria

1. One declared owner SHALL own the managed split lifecycle from admission
   through cleanup.
2. Split workflow identity, owner key, phase, and resumable checkpoints SHALL
   be durably persisted with the partition transition metadata.
3. Source backfill, catch-up, cutover, and cleanup SHALL be resumable after
   process restart.
4. `SQLQueryEngine` SHALL remain an ingress/orchestration entrypoint only; it
   SHALL NOT become a second split-state owner.
5. `PartitionService` SHALL act as an execution participant for source-side
   work; it SHALL NOT own the durable split workflow state machine.

### Requirement 3: Explicit Participant Acknowledgements and Fence Validation

**User Story:** As a debugger, I want workflow progress to advance from
explicit acknowledgements so success is not inferred from cache timing or
indirect side effects.

#### Acceptance Criteria

1. Child provisioning, source replication start, source catch-up readiness,
   cutover application, and cleanup completion SHALL report typed
   acknowledgements to the workflow owner.
2. Each acknowledgement SHALL carry workflow identity plus fencing context that
   lets the owner reject stale or duplicate reports.
3. Workflow owners SHALL persist participant acknowledgement state through the
   shared durable workflow participant mechanism.
4. Cache visibility, timer age, or incidental replica-row observations SHALL
   NOT substitute for explicit acknowledgement when executor completion is the
   semantic boundary.
5. Stale or duplicate acknowledgements SHALL be surfaced as typed diagnostics.

### Requirement 4: Canonical Readiness Stratification for Repair vs Serving

**User Story:** As a distributed systems engineer, I want one readiness model
that distinguishes repair eligibility from serving eligibility so internal
workflows are not blocked by the wrong gate.

#### Acceptance Criteria

1. `ControlPlaneReadinessService` SHALL expose one canonical readiness snapshot
   containing at least:
   - `repairEligible`
   - `serveEligible`
   - stable reason codes
2. Internal topology work such as dispatch, provisioning, rebalance, and split
   admission SHALL consume `repairEligible`.
3. Client-routing and benchmark admission SHALL consume `serveEligible`.
4. A component SHALL NOT block repair/provisioning solely because
   `serveEligible` is false when `repairEligible` is true.
5. Decisions SHALL record which readiness dimension was used.

### Requirement 5: Mandatory Atomic Cut Points for Topology State Changes

**User Story:** As a reliability engineer, I want topology cut points to be
atomic so semantics do not change when wiring changes.

#### Acceptance Criteria

1. Any workflow step that mutates multiple authoritative rows as one semantic
   cut point SHALL use `DistributedTransactionCoordinator`.
2. A workflow transition SHALL NOT be considered committed until the atomic
   authoritative write set commits successfully.
3. Production paths that require atomic topology transitions SHALL fail closed
   if `DistributedTransactionCoordinator` is unavailable.
4. Sequential fallback writes for atomic topology transitions SHALL be removed.

### Requirement 6: Mandatory Owner Dependency Wiring and Fail-Closed Behavior

**User Story:** As a maintainer, I want components that execute topology
decisions to be fully wired with their canonical owners so they do not rebuild
truth locally when dependencies are missing.

#### Acceptance Criteria

1. Any production component that executes topology decisions using capacity,
   publication, readiness, or other owner-managed state SHALL be constructed
   with the required owner dependencies before start.
2. If a required owner dependency is missing for an active production path, the
   system SHALL fail closed at construction or startup rather than silently
   synthesizing a fallback decision path.
3. Local fallback logic that reconstructs owner-managed semantics from raw row
   fields SHALL be removed from active topology decision paths.
4. Tests SHALL prove injected owners are actually used and not bypassed.
5. Optional dependencies SHALL be allowed only for pure diagnostics or for
   code paths that are explicitly inactive.

### Requirement 7: Cache Is Observational, Not Proof of Workflow Completion

**User Story:** As an operator, I want the cache to remain a read model rather
than a second completion oracle for topology workflows.

#### Acceptance Criteria

1. `SystemTableCache` SHALL remain the steady-state observational read model for
   CDC-propagated metadata.
2. Workflow completion and step advancement SHALL rely on authoritative commit
   plus explicit owner-validated acknowledgement, not cache visibility alone.
3. Cache-vs-authoritative divergence SHALL emit typed diagnostics and invariant
   breaches rather than trigger silent fallback behavior.
4. Recovery from divergence SHALL route through the canonical owner queue, not
   an alternate direct mutation path.
5. A single semantic decision SHALL NOT treat cache observation and
   authoritative owner state as interchangeable truths.

### Requirement 8: Deterministic Closure and Invariant Enforcement

**User Story:** As a test owner, I want topology workflow failures to close
through deterministic regressions so harness reruns stop being the first place
bugs are understood.

#### Acceptance Criteria

1. Each harness-discovered topology failure class SHALL be closed by a smaller
   deterministic reproduction before it is considered fixed.
2. The invariant catalog SHALL include at least:
   - single writer for `replica_operations`
   - no split phase advancement without durable workflow state
   - acknowledgement-before-advance for executor-owned phases
   - readiness dimension correctness (`repairEligible` vs `serveEligible`)
   - transaction-availability enforcement for atomic cut points
3. Hard invariant violations SHALL fail targeted tests before full harness
   confirmation.
4. Harness reruns SHALL be confirmation artifacts only, not sole closure
   evidence.
