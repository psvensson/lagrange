# Tasks

## Phase 1: Spec And Regressions

- [x] 1. Add failing unit tests for the node-local pressure governor
  - Cover critical vs background decisions under transport pressure.
  - Cover generic resource-key handling and shared-instance reuse.
  - _Requirements: 1.1, 1.3, 2.1, 2.2, 2.4, 2.5, 5.1_

- [x] 2. Add failing gateway/view regressions for degraded control-plane reads
  - Prove `ControlPlaneSystemTableGateway` disables SQL fallback under pressure.
  - Prove `AuthoritativeControlPlaneView` returns a typed degraded result when
    the local authoritative read cannot complete and pressure blocks SQL
    fallback.
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 5.2_

## Phase 2: Governor Owner Implementation

- [x] 3. Implement shared `PressureGovernor`
  - Add the governor owner and decision contract.
  - Add canonical transport summary reuse through the governor.
  - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 4.2_

- [x] 4. Integrate `ControlPlaneSystemTableGateway` and
  `AuthoritativeControlPlaneView`
  - Route read admission through the governor.
  - Degrade to authoritative-only reads with no routed SQL fallback under
    pressure.
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

## Phase 3: Hot-Path Callsite Consolidation

- [x] 5. Replace ad hoc router-pressure gates in current hot-path owners
  - Switch join readiness, join backfill, CDC retry, rebalance coordinator, and
    unified rebalancer to `PressureGovernor`.
  - _Requirements: 1.2, 4.1, 4.2_

## Phase 4: Verification

- [x] 6. Run focused unit suites for the changed owner paths
  - _Requirements: 5.1, 5.2, 5.3_

- [ ] 7. Rerun focused distributed scenarios
  - Rerun `node-join-under-load`, `rolling-restart`, and
    `seven-node-table-partition-distribution`.
  - _Requirements: 5.3_
