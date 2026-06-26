# Tasks

## Phase 1: Join Backfill Pressure Control

- [x] 1. Add failing regressions for join backfill coalescing and blocking-path priority
  - Prove concurrent identical join backfill requests share one in-flight owner path.
  - Prove blocking backfill replica queries use critical delivery priority.
  - Prove pressure-degraded backfill avoids full replica fanout.
  - _Requirements: 1.1, 1.3, 1.4, 5.1, 5.3_

- [x] 2. Implement join backfill pressure-aware coalescing and priority wiring
  - Add normalized in-flight backfill dedupe in `NodeJoiningService`.
  - Add pressure-aware replica fanout control for authoritative join backfill.
  - Plumb delivery priority through the routed query owner path for blocking backfill and join-critical writes.
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 3.1, 3.2, 3.3_

## Phase 2: Join Readiness Repair Pacing

- [x] 3. Add failing regressions for canonical join-readiness repair defer
  - Prove readiness repair does not launch another backfill wave while local router pressure is active.
  - Prove readiness repair respects the owner-defined cooldown between attempts.
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 5.2_

- [x] 4. Implement readiness repair cooldown and pressure defer
  - Increase canonical repair pacing to a less aggressive interval.
  - Make `JoinReadinessEvaluator` defer repair when the local router is hot.
  - Keep repair on the existing backfill owner path.
  - _Requirements: 2.1, 2.2, 2.3, 2.4_

## Phase 3: CDC Retry Pressure Shedding

- [x] 5. Add failing regressions for CDC background retry coalescing under pressure
  - Prove duplicate retry waves for the same failed delivery set collapse to one scheduled retry.
  - Prove background retry defers while the local router reports pressure.
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 5.4_

- [x] 6. Implement CDC background retry coalescing and pressure defer
  - Add canonical retry-key tracking in `CDCGroupPropagationService`.
  - Defer background retry scheduling when local router pressure is active.
  - Preserve bounded eventual retry once pressure clears.
  - _Requirements: 4.1, 4.2, 4.3, 4.4_

## Phase 4: Verification

- [x] 7. Run targeted unit suites
  - Run the focused bootstrap, topology, query, and transport tests that cover the changed owner paths.
  - _Requirements: 5.5_

- [ ] 8. Rerun focused distributed scenarios
  - Rerun `node-join-under-load`, `rolling-restart`, and `seven-node-table-partition-distribution`.
  - _Requirements: 5.5_
