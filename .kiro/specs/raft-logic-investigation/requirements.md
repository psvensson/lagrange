# Requirements Document

## Introduction

This spec defines a contained, time-boxed investigation of `raft-logic` as a
potential future replacement path for the current liferaft-based integration.

This work is a decision-making spike only. It is not a production migration.

## Scope and Constraints

- Type: contained spike
- Duration: 5-10 engineering days
- Output: go/no-go recommendation with measured evidence

## Requirements

### Requirement 1: Spike Guardrails and Isolation

**User Story:** As a maintainer, I want the investigation isolated from the
mainline production path so we can evaluate feasibility without increasing
runtime risk.

#### Acceptance Criteria

1. The spike SHALL NOT perform a production cutover.
2. The spike SHALL NOT introduce long-lived dual-raft runtime behavior in
   mainline defaults.
3. The spike integration path SHALL be activated only by an explicit spike
   control (for example `RAFT_PROVIDER=raft_logic_spike`).
4. Existing liferaft behavior SHALL remain the default path.
5. Spike-only code SHALL be removable without architectural churn to the
   existing default path.

### Requirement 2: Explicit Non-Goals

**User Story:** As a maintainer, I want clear boundaries so the spike stays
time-boxed and avoids accidental scope expansion.

#### Acceptance Criteria

1. The spike SHALL NOT attempt full migration of all service types.
2. The spike SHALL NOT include data migration for existing live clusters.
3. The spike SHALL NOT implement mixed-cluster protocol bridging between
   liferaft and raft-logic.
4. The spike SHALL NOT include broad performance tuning beyond initial
   viability checks.

### Requirement 3: Integration Surface Mapping

**User Story:** As an engineer, I want a complete mapping from current
liferaft touchpoints to raft-logic equivalents so we can quantify migration
complexity and gaps.

#### Acceptance Criteria

1. The spike SHALL produce a current-to-target API capability map that covers:
   - peer join and election start sequencing
   - packet ingress/egress through the message router
   - leader/follower/candidate/commit event handling
   - runtime raft timing update expectations
   - role persistence and leader tracking hooks
2. The mapping SHALL reference current touchpoints:
   - `src/raft/raft-replica-base.js`
   - `src/partition/partition-service.js`
   - `src/message-group/message-group-service.js`
   - `src/raft/raft-timing-utils.js`
   - packet-type usage in `src/raft/constants.js`
3. The mapping output SHALL explicitly identify unsupported or high-friction
   gaps and required adapter responsibilities.

### Requirement 4: Minimal Adapter Prototype

**User Story:** As an engineer, I want a minimal adapter prototype so we can
test feasibility of core raft lifecycle behavior with limited migration cost.

#### Acceptance Criteria

1. The spike adapter SHALL support startup and shutdown lifecycle hooks.
2. The spike adapter SHALL support propose-command submission.
3. The spike adapter SHALL surface role change notifications.
4. The spike adapter SHALL surface commit callback delivery.
5. The spike adapter SHALL track current leader identity.
6. The adapter implementation SHALL remain in a dedicated spike-only module
   path.

### Requirement 5: Narrow Integration Path

**User Story:** As a maintainer, I want a narrow testable integration path so
we can validate behavior without destabilizing unrelated subsystems.

#### Acceptance Criteria

1. The spike SHALL integrate into exactly one narrow path only (for example,
   one service type in harness mode).
2. The selected path SHALL be executable with existing harness workflows.
3. The integration SHALL preserve the default liferaft path when the spike
   control is not enabled.

### Requirement 6: Transport and Storage Validation

**User Story:** As an engineer, I want explicit validation of transport and
storage assumptions so durability and restart risks are known before any
migration planning.

#### Acceptance Criteria

1. The spike SHALL validate message flow semantics end-to-end on the selected
   path.
2. The spike SHALL validate restart behavior for the chosen spike storage mode.
3. The spike SHALL document required storage schema or adapter changes, if any.

### Requirement 7: Correctness Test Coverage

**User Story:** As a maintainer, I want focused correctness checks that prove
basic raft flows are stable in the scoped integration path.

#### Acceptance Criteria

1. The spike SHALL execute and report results for:
   - single-node leadership
   - 3-node leader election
   - follower write forwarding behavior
   - commit delivery and state-machine application
   - leader failover and re-election
2. Correctness results SHALL be included in the spike report with pass/fail
   outcomes and blocking issues.

### Requirement 8: Resource and Performance Viability Check

**User Story:** As an operator, I want resource and basic performance evidence
versus the current baseline so we can avoid pursuing a path that is clearly
worse.

#### Acceptance Criteria

1. The spike SHALL run and report:
   - 15-minute idle soak
   - small write workload
   - failover scenario
2. The spike SHALL collect CPU percent trends, RSS trends, write-bytes/sec,
   and convergence success/failure evidence.
3. The spike SHALL mark the candidate as non-viable if idle resource profile is
   worse than baseline by more than 20% without a justified mitigation path.

### Requirement 9: Decision Gate Criteria

**User Story:** As a decision-maker, I want explicit go/no-go criteria so the
spike ends with a clear recommendation.

#### Acceptance Criteria

1. A go-candidate recommendation SHALL require all of the following:
   - scoped correctness tests pass
   - no critical operational blocker is found
   - idle resource profile is not worse than baseline by >20%
   - migration complexity estimate is acceptable and phased
   - no licensing/dependency blocker exists for intended deployment model
2. A no-go recommendation SHALL be issued immediately when any of the following
   are found:
   - correctness instability in basic raft flows
   - unacceptable operational coupling with current architecture
   - significant unresolved data durability risk
   - licensing/compliance blocker

### Requirement 10: Mandatory Investigation Artifacts

**User Story:** As a maintainer, I want standardized artifacts so future
planning can rely on auditable evidence instead of recollection.

#### Acceptance Criteria

1. The spike SHALL produce:
   - API gap analysis
   - adapter design note
   - measured benchmark table (baseline vs spike)
   - issue list with severity (blocker/high/medium/low)
   - final recommendation (go to phase-2 migration design, or no-go)
2. The final report SHALL include:
   - executive summary (go/no-go)
   - what worked
   - what failed
   - migration complexity estimate (rough weeks and risks)
   - recommended next action
