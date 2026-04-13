# Tasks

## Phase 1: Router Backpressure

- [x] 1. Add failing regressions for bounded outbound queue backpressure
  - Extend router unit coverage to prove one saturated remote queue rejects
    additional deliveries with the canonical failed-delivery shape.
  - Prove the queue owner still preserves one reconnect owner per node.
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 4.1_

- [x] 2. Implement bounded outbound queue rejection in `MessageRouter`
  - Add per-node pending-depth limits and typed failed-delivery results.
  - Keep reconnect ownership in the existing router owner path.
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

## Phase 2: Scoped Discovery Repair

- [x] 3. Add failing regressions for trigger-scoped authoritative repair tables
  - Extend the repair policy and discovery tests to prove stale replica-op
    repair does not read unrelated tables and scoped topology gaps read only
    the implicated tables.
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 4.2_

- [x] 4. Implement trigger-scoped authoritative discovery repair
  - Derive one repair table set from policy trigger codes and use it in the
    discovery repair owner path.
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

## Phase 3: Load-Lane Readiness

- [x] 5. Add failing regressions for cached ineligible background refresh
  - Prove `ControlPlaneReadinessService` can return a cached ineligible
    snapshot immediately while starting the owner-lane refresh in the
    background.
  - Prove `AdminWebSocketAPI` requests that mode for load-lane admission.
  - _Requirements: 3.1, 3.2, 3.4, 4.3, 4.4_

- [x] 6. Implement background-refresh preference for load-lane readiness
  - Add the new readiness option and wire load-lane admission to use it.
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

## Phase 4: Verification

- [x] 7. Run targeted transport/admin/readiness suites
  - Run the router, discovery, and readiness unit suites covering the owner
    paths changed in this tranche.
  - _Requirements: 4.5_

- [x] 8. Rerun focused distributed scenarios
  - Rerun `node-join-under-load`, `rolling-restart`, and
    `seven-node-table-partition-distribution` after the tranche lands.
  - _Requirements: 4.5_
