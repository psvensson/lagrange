# Requirements Document: Runtime Admission, CDC Policy, and Diagnostics Hardening

## Introduction

This spec defines a focused hardening program for three recurring failure
classes:

1. nodes are admitted to benchmark load based on derived guesses rather than a
   single explicit runtime state
2. CDC policy is still too implicit, which allows control-plane and user-table
   semantics to drift together
3. distributed failures still require manual reconstruction across reports,
   playback, and logs

The goal is to make benchmark admission, CDC policy, rebalancer degradation,
and run-failure evidence explicit enough that the runtime and harness stop
guessing.

This spec complements, but does not replace, the broader stabilization program
in
[../system-stability-and-determinism-hardening/design.md](../system-stability-and-determinism-hardening/design.md).

## Problem Statement

Recent 7-node baseline failures exposed the same structural weaknesses:

1. benchmark load admission is assembled from discovery readiness, replica
   state, lane probes, and table probes instead of one owned runtime decision
2. CDC semantics are not modeled per table class, so user tables can still be
   treated like control-plane propagation tables
3. failed `replica.moved` and related rebalancer outcomes are observable, but
   not yet treated as immediate degradation states for admission
4. failure evidence is fragmented across artifacts, making diagnosis slower and
   more error-prone than it should be
5. quiet phases can look like hangs because no-progress is not yet a
   first-class failure mode
6. authoritative read fallback is still common enough in steady state that
   stale projections are tolerated instead of corrected at the source

## Goals

1. Make benchmark admission a first-class per-node, per-table runtime state.
2. Formalize a single CDC policy matrix that distinguishes control-plane and
   user-table semantics without introducing multiple CDC engines.
3. Treat rebalancer outcomes as explicit state transitions with hard admission
   consequences.
4. Produce one automatic failure bundle per distributed run.
5. Add deterministic reproduction layers for replica creation, promotion, and
   move instability.
6. Make no-progress a machine-detectable harness failure instead of an
   ambiguous timeout symptom.
7. Push more stabilization into runtime ownership and state instead of relying
   on harness-side inference.
8. Reduce authoritative read fallback from a normal steady-state condition to a
   diagnosable exception path.

## Non-Goals

1. Building separate CDC implementations for system tables and user tables.
2. Replacing the current harness or benchmark framework wholesale.
3. Redefining canonical ownership rules already established in
   [../../../architecture.md](../../../architecture.md).
4. Treating temporary diagnostics improvements as a substitute for runtime
   correctness fixes.

## Requirements

### Requirement 1: Benchmark Admission Is an Owned Runtime State (P0)

**User Story:** As a developer and operator, I need each node to expose one
canonical benchmark-admission state per workload table so load selection stops
guessing from several partial signals.

#### Acceptance Criteria

1. The runtime SHALL expose an explicit benchmark admission state for a given
   table and node, including stable reason codes for rejection.
2. Harness and admin discovery SHALL consume that admission state instead of
   reconstructing eligibility from multiple loosely coupled probes.
3. A node SHALL NOT be considered benchmark-load-ready unless its local service,
   local replica role, schema visibility, and workload path are all represented
   in the explicit admission decision.
4. Load-lane benchmark-table readiness SHALL be part of the admission state,
   not an optional afterthought.
5. Reports SHALL serialize benchmark admission reasons directly.

### Requirement 2: CDC Uses One Engine but Explicit Table Policy Classes (P0)

**User Story:** As a maintainer, I need one CDC substrate with explicit
per-table policy so control-plane propagation and user-facing CDC stop drifting
into each other.

#### Acceptance Criteria

1. The system SHALL maintain one canonical table-policy registry for CDC and
   propagation behavior.
2. The registry SHALL support at least these classes:
   - control tables with internal CDC propagation
   - control tables without internal CDC propagation
   - user tables with external CDC enabled
   - user tables without CDC
3. Each table policy SHALL explicitly declare whether it participates in:
   - internal cache propagation
   - bootstrap hydration semantics
   - readiness gating
   - external CDC availability
4. Runtime code SHALL NOT infer these behaviors from scattered hard-coded
   lists.
5. User-table CDC SHALL remain available through the shared CDC engine, but it
   SHALL NOT affect control-plane readiness unless explicitly configured to do
   so.

### Requirement 3: Rebalancer Outcomes Must Drive Degradation State (P0)

**User Story:** As a reliability engineer, I need failed replica-move and
   promotion operations to immediately degrade affected nodes and groups so
   unstable placements cannot continue to receive benchmark traffic.

#### Acceptance Criteria

1. Rebalancer and replica-operation outcomes SHALL be modeled as explicit state
   transitions, not just emitted events.
2. Failed `replica.moved`, replica creation, promotion, or drain operations
   SHALL classify the affected entity into a degraded or blocked state.
3. Benchmark admission SHALL reject nodes or groups whose serving path is
   degraded by active or recently failed movement operations.
4. The degraded state SHALL include stable reasons, timestamps, and owning
   operation identifiers.
5. Tests SHALL reproduce failed movement outcomes and assert admission
   suppression.

### Requirement 4: Distributed Runs Must Emit One Automatic Failure Bundle (P1)

**User Story:** As a developer, I need one artifact bundle per distributed run
so I do not have to manually cross-reference the report, playback, and
container logs to find the failure.

#### Acceptance Criteria

1. Each distributed run SHALL emit one failure bundle when any phase fails.
2. The bundle SHALL include at minimum:
   - final report summary
   - last control snapshot
   - per-node readiness or admission state
   - relevant node logs
   - top failing operations or reason counts
3. The bundle SHALL be machine-readable and human-browsable.
4. The report SHALL point to the bundle directly.
5. Focused tests SHALL verify bundle creation and schema shape.

### Requirement 5: Deterministic Integration Coverage for Replica Instability (P1)

**User Story:** As a maintainer, I need replica creation, promotion, and move
failure modes to be reproducible below the full 7-node harness level.

#### Acceptance Criteria

1. The test suite SHALL provide deterministic integration coverage for:
   - replica creation admission gaps
   - learner or candidate promotion delays
   - failed replica moves
   - degraded-state recovery and non-recovery
2. These tests SHALL not require Docker cluster startup.
3. Bugs first discovered in 7-node baseline runs SHALL be backfilled here
   before closure.
4. Test artifacts SHALL preserve enough state to explain why admission or
   degradation changed.
5. Targeted runtimes SHALL complete fast enough to be practical in normal
   development loops.

### Requirement 6: No-Progress Must Be a First-Class Failure Mode (P1)

**User Story:** As a developer, I need quiet or stalled phases to fail with an
explicit no-progress diagnosis instead of looking like generic long timeouts.

#### Acceptance Criteria

1. The harness SHALL emit explicit phase progress heartbeats for long-running
   phases.
2. Each long-running phase SHALL have a no-progress budget distinct from its
   absolute deadline.
3. When no-progress is detected, the harness SHALL fail with a dedicated
   reason class and last-known-progress details.
4. Playback and reports SHALL show the last meaningful progress event.
5. Tests SHALL verify both progress-heartbeat emission and no-progress failure
   classification.

### Requirement 7: Runtime Stabilization Must Outrank Harness Inference (P1)

**User Story:** As a system maintainer, I need more correctness encoded in the
runtime itself so the harness can observe it instead of trying to infer it.

#### Acceptance Criteria

1. Admission, degradation, and CDC policy decisions SHALL be owned in runtime
   modules rather than assembled only in harness code.
2. Harness code SHALL consume explicit runtime state whenever such state
   exists.
3. Runtime state SHALL use stable reason codes and machine-readable payloads.
4. Architectural direction SHALL remain aligned with explicit ownership,
   explicit lifecycle states, repair-only reconciliation, and invariant-driven
   observability.
5. New harness checks SHALL prefer consuming runtime-exported state over adding
   new inferred heuristics.

### Requirement 8: Authoritative Read Fallback Must Shrink to an Exception Path (P2)

**User Story:** As an operator, I need authoritative read fallback to indicate
an abnormal visibility gap, not a routine steady-state repair mechanism.

#### Acceptance Criteria

1. The system SHALL track authoritative read fallback occurrences as explicit
   structured signals.
2. Repeated fallback in steady state SHALL classify the affected path as
   degraded or suspicious.
3. Admission and strict benchmark profiles SHALL be able to gate on sustained
   fallback frequency.
4. Reports SHALL distinguish isolated fallback recovery from persistent stale
   projection conditions.
5. Follow-on runtime work SHALL prioritize reducing fallback frequency rather
   than normalizing it as steady-state behavior.
