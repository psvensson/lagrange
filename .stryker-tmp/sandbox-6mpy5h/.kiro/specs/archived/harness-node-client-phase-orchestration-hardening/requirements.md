# Requirements Document

## Introduction

This document defines requirements for hardening the distributed test harness and
related system interfaces so benchmark and multi-node scenarios are modular,
understandable, and resilient under timing variance.

The core issue is architectural coupling:

1. workload traffic and control-plane diagnostics share the same query path,
2. phase progression logic is spread across scenario files,
3. final correctness checks depend on transient distributed queryability,
4. similar gating behavior is reimplemented in multiple places.

The objective is to establish single owners, explicit contracts, and deterministic
phase behavior.

## Problem Statement

Current behavior indicates structural fragility:

1. transient control-plane query failures can fail an otherwise useful benchmark run,
2. scenario logic mixes orchestration, probing, and policy decisions,
3. timeout and retry policies are not channel-specific,
4. consistency checks require distributed participant success when local evidence
   would be sufficient,
5. difficult-to-read code paths increase regression risk when adding new scenarios.

## Glossary

- **NodeClient**: single harness abstraction that owns all per-node I/O calls.
- **Channel**: traffic class for node operations (`load`, `control`, `probe`,
  `snapshot`).
- **ChannelPolicy**: timeout, retry, breaker, and in-flight budget for one channel.
- **PhaseOrchestrator**: state-machine runner for scenario phases.
- **GateEngine**: reusable polling/hysteresis engine for readiness and drain gates.
- **ControlSnapshot**: local-only, non-fanout state snapshot used for consistency
  validation.
- **ConsistencyEvaluatorV2**: verifier that compares snapshots and returns graded
  verdicts.
- **Hard Assertion**: correctness requirement that must fail the run.
- **Soft Assertion**: diagnostic/availability signal that may downgrade confidence
  without invalidating measured workload metrics.

## Requirements

### Requirement 1: Single Node Client Ownership

**User Story:** As a harness maintainer, I want one owner for node operations so
policies and behavior are consistent across scenarios.

#### Acceptance Criteria

1. THE harness SHALL provide one `NodeClient` module as the only public owner of
   node query/probe/snapshot operations.
2. `NodeClient` SHALL expose channel-specific methods for `load`, `control`,
   `probe`, and `snapshot` operations.
3. Direct `NodeHandle.query(...)` usage in scenario and assertion modules SHALL be
   removed.
4. `NodeClient` errors SHALL include node id, channel, operation name, and timeout
   class.
5. Policy constants used by `NodeClient` SHALL be centralized in harness constants.

### Requirement 2: Channel-Specific Timeout and Bulkhead Policies

**User Story:** As an operator, I want slow control-plane calls to not stall load
traffic and vice versa.

#### Acceptance Criteria

1. THE harness SHALL maintain independent timeout policies per channel.
2. `load` channel default timeout SHALL be significantly lower than `control`
   timeout and configurable from benchmark settings.
3. THE harness SHALL enforce per-node in-flight limits for `load` channel.
4. Per-channel circuit breaker state SHALL be isolated; failures in one channel
   SHALL NOT trip breakers in other channels.
5. Per-node budget exhaustion SHALL degrade to other available nodes without global
   dispatch collapse.

### Requirement 3: Explicit Scenario Phase State Machine

**User Story:** As a scenario author, I want deterministic phase sequencing with
clear transition rules so behavior is easy to reason about.

#### Acceptance Criteria

1. THE harness SHALL execute benchmark scenarios through a `PhaseOrchestrator`
   state machine.
2. The canonical phase order SHALL be:
   `preflight -> converge -> pre_load_gate -> load -> post_load_drain -> verify -> teardown`.
3. Illegal phase transitions SHALL fail with explicit transition diagnostics.
4. Each phase SHALL return a structured result (`status`, `duration`, `artifacts`,
   `warnings`, `errors`).
5. Phase start/end events SHALL be emitted to playback artifacts.

### Requirement 4: Unified Gate Engine for Pre-Load and Post-Load Conditions

**User Story:** As an engineer, I want one gating implementation so readiness and
stabilization behavior is consistent and testable.

#### Acceptance Criteria

1. THE harness SHALL implement one reusable `GateEngine` for polling and
   stability-window evaluation.
2. Both pre-load quiescence and post-load drain checks SHALL use `GateEngine`.
3. `GateEngine` SHALL support all-ready success and timeout fallback to last
   known-good subset when policy allows.
4. `GateEngine` SHALL return included/excluded node sets plus reason histograms.
5. Scenario code SHALL NOT implement bespoke polling loops for gate behavior.

### Requirement 5: Local Snapshot Contract for Consistency Evidence

**User Story:** As a reliability engineer, I want consistency checks based on local
node state snapshots so distributed participant failures do not mask evidence.

#### Acceptance Criteria

1. THE system SHALL expose a local-only control snapshot contract used by harness
   verification.
2. Control snapshot acquisition SHALL NOT trigger distributed fanout.
3. Snapshot schema SHALL be versioned and include timestamp, node status summary,
   partition set, leader map, and replica-operation summary.
4. Snapshot endpoint/query SHALL be lightweight and non-mutating.
5. Harness consumers SHALL validate snapshot schema version compatibility.

### Requirement 6: Consistency Evaluator V2 with Graded Verdicts

**User Story:** As on-call, I want verification output that distinguishes data
mismatch from temporary evidence unavailability.

#### Acceptance Criteria

1. THE harness SHALL implement `ConsistencyEvaluatorV2` over local snapshots.
2. Evaluator SHALL classify outcomes into at least:
   `consistent`, `inconsistent`, and `insufficient_evidence`.
3. Invariant mismatches (e.g., partition/leader disagreement) SHALL be hard
   failures.
4. `insufficient_evidence` SHALL include node-level causes and coverage metrics.
5. Evaluator outputs SHALL include machine-readable mismatch diffs.

### Requirement 7: Hard vs Soft Assertion Policy

**User Story:** As a benchmark consumer, I want meaningful workload metrics even
when non-critical post-run checks are temporarily degraded.

#### Acceptance Criteria

1. THE harness SHALL define explicit hard/soft assertion classes.
2. Load correctness invariants (invalid metrics, zero successful operations,
   data-integrity failures) SHALL remain hard failures.
3. Post-load control-plane evidence shortages MAY be soft assertions depending on
   configured policy.
4. Final report SHALL include both scenario pass/fail and verification confidence
   level.
5. Policy for soft assertion escalation SHALL be configurable per run profile.

### Requirement 8: Post-Load Drain Gate

**User Story:** As an operator, I want verification to run after the cluster has
had a bounded chance to settle so checks are less timing-sensitive.

#### Acceptance Criteria

1. THE harness SHALL run a post-load drain phase before final verification.
2. Drain gate SHALL require no in-flight replica operations and stable local
   snapshot evidence over a configured window.
3. Drain gate timeout SHALL emit structured reasons and sampled node evidence.
4. Drain gate behavior SHALL be implemented through `GateEngine`.
5. Drain failure handling SHALL follow hard/soft assertion policy.

### Requirement 9: Observability and Traceability of Phase Decisions

**User Story:** As a maintainer, I want to quickly identify where and why a
scenario degraded.

#### Acceptance Criteria

1. Each phase SHALL emit structured events including policy values and decision
   reasons.
2. Report details SHALL include selected/excluded nodes for load and verification.
3. NodeClient SHALL expose per-channel counters (timeouts, retries, breaker
   opens, budget denials).
4. Reports SHALL include phase durations and dominant warning/error reasons.
5. Playback artifacts SHALL include a compact phase timeline for quick diagnosis.

### Requirement 10: Modular Boundaries and Readability

**User Story:** As a contributor, I want clear module boundaries so changes are
localized and safe.

#### Acceptance Criteria

1. Harness orchestration logic SHALL be separated into dedicated modules:
   `node-client`, `phase-orchestrator`, `gate-engine`, and `consistency-evaluator`.
2. Scenario files SHALL primarily declare phase composition and policy values,
   not low-level operation logic.
3. Constants SHALL be centralized and imported; no duplicated scalar literals for
   policies.
4. New modules SHALL include focused unit tests and documented contracts.
5. Ownership map SHALL identify one module per concern with no parallel
   implementations.

### Requirement 11: Test Strategy Parity with Real Failure Modes

**User Story:** As a test owner, I want CI to reproduce distributed harness
failure classes before they reach manual benchmark runs.

#### Acceptance Criteria

1. Unit tests SHALL cover channel-specific timeouts, breaker isolation,
   per-node bulkheads, and phase transition legality.
2. Integration tests SHALL cover snapshot-based consistency under partial node
   queryability.
3. Scenario tests SHALL cover all-ready success and subset fallback behavior for
   both pre-load and post-load gates.
4. Regression tests SHALL assert stable report contract fields for graded
   verification outcomes.
5. Harness test suites SHALL remain deterministic with bounded runtime.

### Requirement 12: Cutover and Compatibility

**User Story:** As a release owner, I want predictable rollout with minimal
long-lived dual-path logic.

#### Acceptance Criteria

1. Migration SHALL cut over harness scenario code to new modules in one coherent
   path per concern.
2. Temporary adapters MAY exist during implementation but SHALL be removed before
   final completion.
3. Existing report consumers SHALL retain compatibility through additive fields
   and documented semantics.
4. Rollout notes SHALL define default policies for local benchmark profiles.
5. Rollback guidance SHALL identify safe reversion points if new modules regress.
