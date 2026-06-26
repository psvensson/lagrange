# Design Document

## Overview

This design reduces restart/join brittleness by breaking the circular
dependency between:

1. node join progression
2. control-plane publication
3. message-group routing/leadership convergence

The work is intentionally phased.

Phase 1 reuses the existing `JoinCoordinator` and `JoinSessionStore` to make
join progression checkpointed and resumable through the real startup pipeline.

Later phases establish a smaller control-plane kernel boundary and demote
projection-driven routing decisions out of the admission path.

## Architecture

### 1. Real Join Checkpoints

`JoinSessionStore` already exists, but its checkpoint names are not aligned with
the actual startup pipeline in `NodeJoiningService`.

The checkpoint sequence should represent real owner boundaries:

1. seed contact completed
2. websocket/control-plane handshake completed
3. membership/discovery-critical state written
4. ready lease assigned
5. join finalized

`NodeJoiningService` should own the mapping from its startup phases to those
checkpoints, and `JoinCoordinator` should own replay/resume semantics.

### 2. JoinCoordinator Becomes The Startup Owner

`NodeJoiningService.join()` currently executes the startup pipeline directly.
That means a retry after a mid-join failure replays early phases even when they
already succeeded.

The service should instead:

1. create or load a join session ID
2. build checkpointed steps for startup
3. run them through `JoinCoordinator`
4. perform only the not-yet-satisfied steps

This does not yet solve the kernel-boundary problem, but it gives the join
path a single resumable owner rather than ad hoc re-entry.

### 3. Future Kernel Boundary

The later cutover should consolidate admission logic around control-plane
owners already present in:

- `heartbeat-service.js`
- `lease-service.js`
- `endpoint-service.js`
- `authoritative-control-plane-view.js`
- `control-plane-readiness-service.js`

These should become one explicit kernel-facing interface for:

1. node admission
2. endpoint publication
3. ready-lease renewal
4. leader/ingress lease lookup

### 4. Activation Contract

Service publication must follow local service readiness, not race ahead of it.

The activation contract should be enforced across:

- lifecycle controller
- message-group service handler setup
- service-row owner publication

The key invariant is:

`ACTIVE` means handler registered + endpoint published + owner acknowledged.

### 5. Recovery Split

`QuerySystemStatePhase` and join readiness evaluation should eventually be split
into:

1. join-blocking discovery repair
2. post-join opportunistic repair

This keeps restart viable when non-critical propagated tables lag.

## Testing Strategy

1. Extend existing `join-session-store` and `join-coordinator` tests only if
   checkpoint semantics change.
2. Add `NodeJoiningService` regression coverage proving resume semantics skip
   completed checkpoints on retry.
3. Keep the first implementation slice focused on unit tests.
4. After checkpoint integration is stable, re-run the individual
   `rolling-restart` harness scenario.
