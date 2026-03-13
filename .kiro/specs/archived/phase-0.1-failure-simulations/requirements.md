# Requirements Document

## Introduction

This document specifies the remaining Phase 0.1 failure-simulation work needed
to satisfy the roadmap exit criteria for internal coherence.

Open roadmap items:

1. Disk full simulation
2. Slow follower simulation
3. In-cluster chaos injection

The implementation scope is the existing distributed harness (`test/distributed`)
with deterministic, reproducible scenario behavior and typed observability.

## Glossary

- **Chaos_Primitive**: One fault-injection or recovery operation implemented by
  `ChaosPrimitives`.
- **Scenario**: One executable distributed test script in
  `test/distributed/scenarios`.
- **Playback_Event**: Structured event captured into playback artifacts.
- **Fault_Recovery_Window**: Bounded period after healing where convergence and
  safety invariants must be re-verified.

## Requirements

### Requirement 1: Reversible Fault Primitives

**User Story:** As an engineer, I want every injected fault to have an explicit
recovery path so scenarios can be deterministic and leave the cluster clean.

#### Acceptance Criteria

1. WHEN network delay is injected, THE harness SHALL expose an explicit
   operation to clear delay for the same node.
2. WHEN disk pressure is injected, THE harness SHALL expose an explicit
   operation to release disk pressure for the same node.
3. Recovery operations SHALL be idempotent and safe to call repeatedly.
4. Fault injection and recovery SHALL be available through `Cluster` methods,
   not only internal primitive classes.

### Requirement 2: Typed Chaos Observability

**User Story:** As an operator, I want typed playback events for fault
injection and recovery so I can diagnose scenario timelines reliably.

#### Acceptance Criteria

1. WHEN a chaos action starts, THE harness SHALL emit a `chaos.action.started`
   playback event.
2. WHEN a chaos action completes, THE harness SHALL emit a
   `chaos.action.completed` playback event.
3. WHEN a chaos action injects a fault, THE harness SHALL emit a typed
   `chaos.fault.injected` event.
4. WHEN a chaos action recovers a fault, THE harness SHALL emit a typed
   `chaos.fault.recovered` event.
5. WHEN a chaos action fails, THE harness SHALL emit a typed
   `chaos.fault.failed` event with error details.

### Requirement 3: Disk Full Simulation Scenario

**User Story:** As an operator, I want a deterministic disk-full scenario under
load so we can verify fail-closed behavior and recovery without corruption.

#### Acceptance Criteria

1. THE scenario SHALL run sustained write-heavy load before and during injected
   disk pressure.
2. THE scenario SHALL inject disk pressure on a non-seed node using harness
   primitives.
3. THE scenario SHALL verify no invariant breach during fault window.
4. THE scenario SHALL release disk pressure and assert convergence within a
   bounded timeout.
5. THE scenario SHALL be reproducible with stable thresholds and deterministic
   phase sequencing.

### Requirement 4: Slow Follower Simulation Scenario

**User Story:** As an operator, I want a deterministic slow-follower scenario
so we can validate leader stability and catch-up after degradation.

#### Acceptance Criteria

1. THE scenario SHALL inject network slowdown on one follower-target node.
2. THE scenario SHALL validate availability/throughput thresholds during
   slowdown.
3. THE scenario SHALL clear slowdown and assert follower catch-up and cluster
   convergence in the recovery window.
4. THE scenario SHALL capture typed chaos events for injection and recovery.

### Requirement 5: In-Cluster Chaos Injection Scenario

**User Story:** As an operator, I want bounded in-cluster chaos schedules to
stress control-plane invariants without creating non-reproducible failures.

#### Acceptance Criteria

1. THE scenario SHALL execute a bounded sequence of chaos actions selected from
   kill, pause, partition, and slowdown operations.
2. THE scenario SHALL enforce safety rails: one injected fault class at a time
   and explicit recovery between fault phases.
3. THE scenario SHALL verify convergence and invariants after each recovery
   window.
4. THE scenario SHALL be seedable/deterministic for replay.

### Requirement 6: Phase 0.1 Closure Gate

**User Story:** As a maintainer, I want an objective closure gate before
marking the roadmap items complete.

#### Acceptance Criteria

1. Disk full, slow follower, and in-cluster chaos scenarios SHALL pass in local
   harness runs with default config.
2. The same scenarios SHALL pass in at least one CI-equivalent environment.
3. Roadmap statuses SHALL be set to `✅` only after the gate passes.
