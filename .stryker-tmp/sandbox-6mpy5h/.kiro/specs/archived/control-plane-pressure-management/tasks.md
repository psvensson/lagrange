# Tasks

## Phase 1: Router Priority Capacity

- [x] 1. Add failing regressions for reserved outbound capacity and producer priority
  - Extend router coverage to prove background deliveries are rejected once the
    non-reserved limit is full while critical deliveries still enqueue.
  - Prove queued critical deliveries drain ahead of background backlog.
  - Prove the message-group and rebalance-coordinator owner paths pass the
    expected delivery priorities into the canonical router API.
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 5.1, 5.2_

- [x] 2. Implement router reserved capacity and producer priority wiring
  - Add critical/background queue lanes and reserved pending capacity in
    `MessageRouter`.
  - Wire `MessageGroupService` CDC forwarding to critical priority.
  - Wire `RebalanceCoordinator` dispatch sends to background priority.
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 2.4_

## Phase 2: Authoritative Read Coalescing

- [x] 3. Add failing regressions for authoritative read single-flight
  - Extend authoritative control-plane view coverage to prove concurrent
    identical reads share one in-flight request and clear after settle.
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 5.3_

- [x] 4. Implement authoritative control-plane read single-flight
  - Add canonical in-flight dedupe to `AuthoritativeControlPlaneView.readRows`.
  - Keep `readNodeSnapshot()` on the same owner path.
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

## Phase 3: Hot-Router Rebalance Deferral

- [x] 5. Add failing regressions for periodic rebalance deferral under local router pressure
  - Extend unified-rebalancer coverage to prove periodic checks skip evaluation
    and schedule a delayed retry while the router reports outbound pressure.
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 5.4_

- [x] 6. Implement hot-router rebalance deferral
  - Add a router pressure summary owner API.
  - Make `UnifiedRebalancer` defer periodic work when the local router is hot.
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

## Phase 4: Verification

- [x] 7. Run targeted unit suites
  - Run the focused transport, message-group, control-plane, and rebalancer
    tests covering the owner paths changed in this tranche.
  - _Requirements: 5.5_

- [x] 8. Rerun focused distributed scenarios
  - Rerun `node-join-under-load`, `rolling-restart`, and
    `seven-node-table-partition-distribution`.
  - _Requirements: 5.5_
