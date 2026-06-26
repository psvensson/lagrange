# Requirements Document: System Stability and Determinism Hardening

## Introduction

This spec defines a stabilization program for a system that currently behaves
correctly often enough to make progress, but not consistently enough to make
debugging cheap or benchmark results trustworthy.

Recent failures showed the same structural pattern:

1. canonical state is inferred from multiple projections
2. background repair paths can race with fresh state
3. readiness gates admit nodes that are only partially converged
4. timeout-heavy tests hide whether the issue is latency or correctness
5. full baseline runs are still discovering bugs that should have been killed
   in smaller deterministic layers

The intent of this spec is to stop treating these issues as unrelated bugs and
instead harden the system so correctness is explicit, time is controllable, and
invariants fail fast.

## Problem Statement

The current runtime and harness still have several properties that make the
system brittle:

1. Multiple tables and services partially describe the same truth.
2. Replica and node lifecycle state is inferred from snapshots instead of being
   modeled as explicit state machines.
3. Reconciliation logic can still mutate canonical rows based on stale reads.
4. Propagation/subscription behavior is centralized in principle but still
   duplicated in practice through parallel lists and ad hoc call sites.
5. Tests and harness phases still spend real wall-clock time waiting for
   progress that should be explicit and observable.
6. Baseline benchmarks still combine correctness detection and performance
   measurement in the same pass.

## Goals

1. Make every important runtime fact have a single canonical owner.
2. Make node and replica lifecycle legality explicit and machine-checkable.
3. Restrict background reconciliation to repair-only behavior.
4. Remove duplicated propagation, mutation, and readiness logic.
5. Treat timeout-driven behavior as a bug signal, not a normal control path.
6. Make invariant violations visible before they turn into distributed harness
   failures.
7. Add a deterministic convergence test layer between unit tests and full
   Docker baselines.
8. Separate benchmark correctness gates from performance measurement.

## Non-Goals

1. Replacing the storage engine or raft library in this workstream.
2. Rewriting the entire distributed harness.
3. Introducing alternate compatibility code paths to preserve old behavior.
4. Declaring throughput parity solved by this spec alone.

## Requirements

### Requirement 1: Canonical Control-Plane Ownership Closure (P0)

**User Story:** As a maintainer, I need a single authoritative source for
leader identity, readiness, and replica state so diagnostics and routing stop
arguing with each other.

#### Acceptance Criteria

1. Canonical leader identity SHALL come from owner rows
   (`partitions.leader_node_id` and `message_groups.leader_node_id`) before any
   derived read model.
2. Benchmark and control-plane readiness SHALL be computed from one shared
   readiness evaluator with stable reason codes.
3. A node hosting a local target replica in `candidate` SHALL NOT be reported
   as benchmark-ready.
4. Read models SHALL surface owner-row vs replica-row disagreement as an
   explicit inconsistency, not as an alternate truth source.
5. `architecture.md` SHALL remain the canonical ownership reference, and this
   spec SHALL link to it rather than duplicating owner matrices elsewhere.

### Requirement 2: Explicit Lifecycle State Machines (P0)

**User Story:** As a reliability engineer, I need node and replica lifecycle
states to be explicit so illegal or partial convergence is detectable without
guessing from snapshots.

#### Acceptance Criteria

1. Node readiness lifecycle SHALL have explicit states and legal transitions.
2. Replica lifecycle SHALL have explicit states for at least bootstrap,
   follower, candidate, leader, learner, draining, and failed conditions as
   applicable to the service type.
3. Readiness decisions SHALL consume explicit lifecycle states, not infer
   stability from timer age or missing warnings alone.
4. Illegal or contradictory transitions SHALL fail fast with stable diagnostic
   codes.
5. Transition coverage SHALL exist in targeted tests without requiring a full
   distributed baseline run.

### Requirement 3: Reconciliation Is Repair-Only (P0)

**User Story:** As an operator, I need background repair loops to heal drift
without being able to overwrite fresher canonical state.

#### Acceptance Criteria

1. Reconciliation and lease/heartbeat sweeps SHALL use guarded mutations based
   on observed state, sequence, or compare-and-swap semantics.
2. A stale background sweep SHALL NOT overwrite a newer heartbeat, lease,
   leader, or readiness update.
3. Reconciliation SHALL NOT become an alternate owner of canonical runtime
   state.
4. Repeated no-progress repair loops SHALL emit explicit diagnostics and fail
   relevant strict benchmark gates.
5. Integration or convergence tests SHALL reproduce stale-write races and prove
   they are rejected.

### Requirement 4: Shared Mutation and Propagation Surfaces (P1)

**User Story:** As a developer, I need one canonical mutation and propagation
path so fixes land once instead of in several near-duplicates.

#### Acceptance Criteria

1. Authoritative row updates with cache-visibility confirmation SHALL flow
   through one shared mutation helper.
2. The canonical propagated-system-table set SHALL be declared in one place and
   reused by bootstrap, joining, CDC subscription, and cache hydration.
3. Runtime code SHALL NOT maintain parallel hard-coded system-table
   subscription lists for the same concern.
4. Direct cache population SHALL remain limited to the documented
   bootstrap/hydration exception and SHALL be unreachable in steady state.
5. Regression tests SHALL cover propagation-list drift and dropped-pending-write
   scenarios.

### Requirement 5: Time and Scheduler Abstraction (P1)

**User Story:** As a test author, I need timeouts, polling, and retry windows
to use injected time so slow tests stop masking correctness bugs.

#### Acceptance Criteria

1. Polling, leases, retries, and gate windows SHALL use injectable clock or
   scheduler dependencies.
2. Scenario and harness tests SHALL use virtual time wherever no external I/O
   boundary requires wall-clock waiting.
3. Timeouts SHALL be classified as either no-progress budget exhaustion or hard
   absolute deadline exhaustion with distinct diagnostics.
4. New test code SHALL NOT introduce multi-second real waits when virtual time
   can express the same behavior.
5. The slowest targeted harness specs involved in readiness and discovery SHALL
   have deterministic sub-second execution once virtualized.

### Requirement 6: Invariant-Driven Observability (P1)

**User Story:** As a diagnostician, I need the system to tell me which
invariant failed instead of making me reconstruct truth from logs and snapshots.

#### Acceptance Criteria

1. The runtime SHALL define a canonical invariant catalog for leadership,
   readiness, lease freshness, propagation progress, and replica-role
   stability.
2. Invariant checks SHALL emit structured machine-readable events with stable
   invariant IDs and reason codes.
3. Harness reports SHALL include invariant breaches as first-class results, not
   just raw logs.
4. Strict benchmark profiles SHALL fail immediately on hard invariant breaches.
5. Tests SHALL verify both invariant detection and report serialization.

### Requirement 7: Deterministic Convergence Test Layer (P2)

**User Story:** As a maintainer, I need a smaller deterministic test layer that
can reproduce convergence bugs without waiting for full Docker harness runs.

#### Acceptance Criteria

1. The test stack SHALL include a convergence layer above unit tests and below
   full distributed baselines.
2. That layer SHALL support deterministic ordering of heartbeats, CDC delivery,
   stale snapshots, and delayed acks.
3. Regressions such as stale sweep overwrites, dropped owner-row updates,
   candidate-readiness admission, and CDC catch-up gaps SHALL be reproducible in
   this layer.
4. Artifacts from convergence tests SHALL be machine-readable and suitable for
   CI failures.
5. New distributed correctness bugs found in baselines SHALL be backfilled into
   this layer before the bug is considered closed.

### Requirement 8: Benchmark Correctness vs Performance Separation (P2)

**User Story:** As a performance engineer, I need to distinguish "system is not
healthy enough to benchmark" from "system is healthy but slower than target."

#### Acceptance Criteria

1. Baseline scenarios SHALL have explicit phases for correctness preflight,
   steady-state admission, performance measurement, and post-load verification.
2. Performance measurement SHALL begin only after correctness gates and
   readiness stability have passed.
3. Reports SHALL separate correctness failure from throughput results so a
   broken run is not presented as a meaningful performance datapoint.
4. Strict profiles SHALL suppress headline throughput comparison when
   correctness gates fail.
5. Baseline runbooks SHALL document the minimal targeted checks to run before a
   full 3-node or 7-node baseline.
