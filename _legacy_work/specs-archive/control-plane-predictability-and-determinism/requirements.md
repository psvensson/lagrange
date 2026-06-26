# Requirements Document

## Introduction

This document defines requirements for a control-plane architecture that is
predictable under load and failure, not merely eventually correct in the best
case.

The immediate motivation is repeated harness runs that discover new failure
signatures in areas that should be routine: dispatch retries, operation
progress checks, readiness gating, and timeout handling.

The goal is to make control-plane behavior understandable and testable through
deterministic owner paths, explicit workflow state, and invariants that fail
loudly when violated.

## Problem Statement

Current behavior shows an architecture mismatch:

1. Multiple independent loops act on overlapping state (`event` triggers,
   cache-change triggers, and periodic polling loops).
2. Timeouts often surface as symptom noise instead of a typed root cause.
3. Distributed harness runs act as the primary discovery mechanism for bugs
   that should have deterministic reproductions.
4. Components can be locally correct but globally contradictory due to
   inconsistent readiness/read models.

## Requirements

### Requirement 1: Single Progression Owner Per Control-Plane Concern

**User Story:** As a maintainer, I want one progression owner per concern so
that topology state changes are deterministic and non-competing.

#### Acceptance Criteria

1. THE system SHALL use a single owner-keyed reconcile queue for each
   control-plane concern (dispatch, rebalance progression, split progression).
2. EVENTS SHALL enqueue work; they SHALL NOT directly execute long-running
   progression logic in parallel paths.
3. FOR one owner key, at most one reconcile execution SHALL be in flight.
4. PERIODIC broad polling SHALL be restricted to explicit recovery mode and
   SHALL NOT be the steady-state primary progression path.

### Requirement 2: Durable Monotonic Workflow State for Topology Operations

**User Story:** As an operator, I want every topology operation to progress by
durable monotonic steps so that failure handling is explainable and replayable.

#### Acceptance Criteria

1. THE system SHALL represent each topology-changing operation as a durable
   workflow with explicit step transitions.
2. WORKFLOW step transitions SHALL be monotonic unless an explicit terminal
   recovery transition is defined in the owner contract.
3. EACH persisted transition SHALL include:
   - previousStep
   - nextStep
   - transitionReason
   - transitionTimestamp
   - ownerKey
4. THE system SHALL reuse the shared durable workflow owner path instead of
   introducing a second workflow engine for control-plane operations.

### Requirement 3: Canonical Read-Model Contract for Progression Decisions

**User Story:** As an engineer, I want one read-model contract per decision so
that decisions are not made from competing data sources.

#### Acceptance Criteria

1. FOR CDC-propagated control-plane metadata, steady-state progression
   decisions SHALL read from `SystemTableCache`.
2. SQL reads for control-plane metadata SHALL be limited to:
   - authoritative writes
   - explicit recovery paths
   - diagnostics/reconciliation with typed reason codes
3. A single decision path SHALL NOT mix cache and SQL fallbacks for equivalent
   semantics.
4. IF authoritative-vs-cache visibility diverges, the system SHALL emit
   structured diagnostics with owner attribution.

### Requirement 4: Unified Readiness Contract Across Dispatch, Rebalance, and Admission

**User Story:** As a distributed systems engineer, I want readiness semantics
to be shared across control-plane actors so components cannot disagree
silently.

#### Acceptance Criteria

1. THE system SHALL expose one canonical readiness model consumed by dispatch,
   rebalancer, and admission owners.
2. COMPONENT-local readiness heuristics SHALL be removed when superseded by the
   canonical model.
3. READINESS output SHALL include stable dimensions and reason codes.
4. ADMISSION and progression decisions SHALL record the readiness snapshot used
   at decision time.

### Requirement 5: Fencing Tokens for Claims and Readiness-Dependent Actions

**User Story:** As a maintainer, I want stale actors to self-disqualify so
late events cannot overwrite newer control-plane decisions.

#### Acceptance Criteria

1. CLAIM paths SHALL include fencing metadata (owner epoch and/or lease token).
2. A reconcile executor SHALL reject stale work items when fencing validation
   fails.
3. DISPATCH and operation step transitions SHALL persist the fencing context
   used for the transition.
4. DIAGNOSTICS SHALL surface stale-fence rejections as typed events.

### Requirement 6: Canonical Timeout-Budget Tree and Typed Timeout Outcomes

**User Story:** As an engineer debugging failures, I want one timeout-budget
model so timeout clusters are actionable correctness bugs.

#### Acceptance Criteria

1. EACH top-level control-plane operation SHALL start with one canonical budget.
2. NESTED sub-operations SHALL derive from remaining budget, not fresh defaults.
3. WHEN remaining budget is below minimum threshold, sub-operations SHALL not
   start.
4. TIMEOUT failures SHALL be classified into stable categories, including:
   - local_scheduler_starvation
   - remote_call_timeout
   - publication_wait_timeout
   - cache_visibility_timeout
   - absolute_deadline_exhausted
5. TIMEOUT classifications SHALL be included in failure artifacts.

### Requirement 7: Always-On Invariant Evaluation for Control-Plane Correctness

**User Story:** As an operator, I want the system to detect control-plane
contradictions immediately rather than after long exploratory runs.

#### Acceptance Criteria

1. THE system SHALL evaluate a canonical invariant set continuously or at
   bounded checkpoints.
2. INITIAL invariant set SHALL include:
   - canonical leader uniqueness by partition/message group owner rows
   - workflow step monotonicity
   - no orphan in-flight operations without owner key
   - claim exclusivity by operation id and owner key
3. INVARIANTS SHALL emit typed hard/soft breach reports.
4. HARD invariant breaches SHALL fail deterministic test gates.

### Requirement 8: Deterministic Failure Closure Policy

**User Story:** As a developer, I want harness-discovered failures to be closed
through deterministic tests so regressions are caught quickly.

#### Acceptance Criteria

1. A harness-discovered failure class SHALL NOT be considered closed until a
   deterministic repro exists below full harness scale.
2. EACH closed failure class SHALL include:
   - deterministic reproduction test
   - owner-path regression test
   - invariant assertion covering the same class
3. HARNESS reruns SHALL be confirmation artifacts, not sole closure evidence.
4. IF deterministic reproduction is not yet possible, the issue SHALL remain
   open with the missing layer explicitly documented.

### Requirement 9: Structured Decision and Progress Diagnostics

**User Story:** As an operator, I want run artifacts to explain what the system
decided and why, without log archaeology.

#### Acceptance Criteria

1. DIAGNOSTICS SHALL expose reconcile queue state by owner key.
2. DIAGNOSTICS SHALL expose workflow step history with reasons.
3. DIAGNOSTICS SHALL expose readiness and admission snapshots tied to operation
   ids.
4. FAILURE bundles SHALL contain timeout classifications and invariant breaches.

### Requirement 10: Phased Migration With Explicit Exit Gates

**User Story:** As a release owner, I want migration to be incremental and
auditable so architectural cleanup does not create hidden dual paths.

#### Acceptance Criteria

1. IMPLEMENTATION SHALL define explicit migration phases with one owner path per
   phase.
2. EACH phase SHALL include measurable exit gates and rollback notes.
3. DUAL progression paths SHALL be time-bounded and removed at phase closure.
4. ARCHITECTURE documentation SHALL be updated at each phase completion.
