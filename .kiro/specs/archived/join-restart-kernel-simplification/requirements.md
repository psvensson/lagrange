# Requirements Document

## Introduction

This document specifies the restart/join simplification work needed to make the
cluster less brittle under restart, rolling restart, and node rejoin stress.

The core design intent is to reduce the number of coupled truths required for a
node to become active. Join, readiness, and routing must be driven by a small
control-plane kernel boundary, with broader cache and propagated-table recovery
handled as secondary reconciliation.

## Requirements

### Requirement 1: Durable Join Checkpoints Match Real Startup Ownership

**User Story:** As a maintainer, I want join checkpoints to align with the real
join pipeline so retries resume cleanly instead of replaying already-completed
work.

#### Acceptance Criteria

1. The durable join checkpoint sequence SHALL correspond to actual join owner
   boundaries, not abstract placeholder phases.
2. `NodeJoiningService` SHALL execute checkpointed startup work through
   `JoinCoordinator`.
3. Re-running the same join session after a mid-join failure SHALL skip
   completed checkpoints.
4. Failure metadata for the failed checkpoint SHALL remain persisted in the
   join session state.

### Requirement 2: Control-Plane Admission Uses One Kernel Boundary

**User Story:** As an operator, I want join admission and readiness publication
to use one stable control-plane boundary so restart does not depend on generic
message-group routing heuristics.

#### Acceptance Criteria

1. Join admission SHALL target one control-plane kernel interface.
2. `NodeJoiningService` SHALL not require cache-derived message-group target
   selection to publish control-plane admission state.
3. The control-plane kernel SHALL own admission, endpoint publication, and
   ready-lease visibility.

### Requirement 3: ACTIVE Means Locally Routable

**User Story:** As an operator, I want `ACTIVE` to mean a node can actually
accept routed work, not merely that metadata has been written.

#### Acceptance Criteria

1. A service row SHALL not transition to `ACTIVE` until the local handler is
   registered.
2. A service row SHALL not transition to `ACTIVE` until the service endpoint is
   published through the canonical owner path.
3. Join completion SHALL require local routability before declaring the node
   ready.

### Requirement 4: Non-Critical Recovery Is Deferred

**User Story:** As a maintainer, I want join to block only on discovery-critical
state so non-critical propagated-table lag does not abort restart.

#### Acceptance Criteria

1. Join-blocking recovery SHALL be limited to discovery-critical topology and
   routing state.
2. Non-critical propagated-table repair SHALL run after admission/activation.
3. Join diagnostics SHALL distinguish blocking discovery repair from background
   post-join repair.

### Requirement 5: Leader Routing Uses Kernel Leases, Not Projection Guessing

**User Story:** As an operator, I want control-plane and leader-target routing
to be based on explicit lease/epoch ownership so restart does not collapse into
retry storms when projections lag.

#### Acceptance Criteria

1. Leader/ingress selection for control-plane traffic SHALL use a canonical
   lease/epoch owner path.
2. Projection tables and cache rows SHALL remain read models, not the final
   authority for join admission.
3. Leader uncertainty SHALL degrade locally and recover through one owner path
   rather than cascading through multiple fallback paths.
