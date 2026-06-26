# Implementation Plan: Harness Benchmark Mode Simplification and Unification

## Overview

This plan executes in strict order. Do not start a task before the previous
task is complete and marked done.

## P0 - Collapse To One Canonical Benchmark Path

- [x] 1. Add failing tests for canonical benchmark readiness payload
  - [x] Add unit tests for readiness payload shape and fail-closed behavior.
  - [x] Add tests for missing/partial readiness fields in strict mode.
  - _Requirements: 1.1, 1.3, 2.1, 2.2_

- [x] 2. Implement canonical benchmark readiness API
  - [x] Add canonical readiness payload fields in admin API output.
  - [x] Keep readiness reason codes stable and machine-readable.
  - _Requirements: 1.1, 2.1, 2.2, 2.3_

- [x] 3. Add failing harness scenario tests for single-path pre-load gating
  - [x] Reproduce cases where legacy probe/fallback path disagrees with canonical
    readiness.
  - [x] Assert strict mode uses canonical readiness only.
  - _Requirements: 1.2, 1.3, 2.3, 7.1_

- [x] 4. Implement strict pre-load gating on canonical readiness only
  - [x] Remove strict-mode dependence on duplicate probe/fallback branches.
  - [x] Require all required load nodes ready for stable window.
  - _Requirements: 1.2, 2.3, 2.4_

- [x] 5. Add failing tests for unified failure artifact schema
  - [x] Validate `rootCauseClass`, `phase`, `affectedNodeIds`, `reasonCounts`.
  - [x] Validate compare script prints root-cause summary.
  - _Requirements: 6.1, 6.2, 6.3_

- [x] 6. Implement unified failure artifact and compare-script reporting
  - [x] Emit one strict failure envelope from benchmark scenario.
  - [x] Extend compare script to print root-cause class/count deltas.
  - _Requirements: 6.1, 6.2, 6.3, 6.4_

## P1 - Canonical Routing and Partition Visibility

- [x] 7. Add failing tests for nodes without local table-partition replicas
  - [x] Integration test: query path from non-owner node must still route.
  - [x] Unit test: partition resolution must not require local-only metadata.
  - _Requirements: 3.1, 3.2, 7.3_

- [x] 8. Implement canonical partition/routing lookup path
  - [x] Remove benchmark-mode local-only shortcut behavior.
  - [x] Ensure canonical metadata lookup drives partition routing.
  - _Requirements: 3.1, 3.2, 3.4_

- [x] 9. Add and enforce tests for message-group-only query/data-plane transport
  - [x] Verify no alternate transport path is used for query/data-plane traffic.
  - [x] Verify failures are explicit when message-group transport is unavailable.
  - _Requirements: 1.1, 3.4, 7.1_

## P2 - Topology Stability During Benchmark Windows

- [x] 10. Add failing tests for benchmark rebalancing freeze policy
  - [x] Assert non-critical rebalancing is blocked during warmup/load.
  - [x] Assert safety-critical bypass path is allowed and recorded.
  - _Requirements: 4.1, 4.2, 4.3, 7.1_

- [x] 11. Implement benchmark rebalancing freeze and bypass metrics
  - [x] Add benchmark-window freeze control in rebalancer flow.
  - [x] Emit freeze/bypass decisions in scenario details.
  - _Requirements: 4.1, 4.2, 4.3_

- [x] 12. Add strict failure policy for sustained critical rebalancing
  - [x] Threshold sustained critical states in strict benchmark mode.
  - [x] Include reason counts in unified failure artifact.
  - _Requirements: 4.4, 6.1, 6.2_

## P3 - Strict Profile Contract Unification

- [x] 13. Unify strict benchmark defaults across 3-node and 7-node profiles
  - [x] Default `requiredSutLoadNodeCount` to cluster size.
  - [x] Keep explicit non-strict opt-out but mark it in report details.
  - _Requirements: 5.1, 5.2, 5.3_

- [x] 14. Update local README and operator workflow docs
  - [x] Document canonical benchmark mode semantics.
  - [x] Document root-cause output and strict/non-strict indicators.
  - _Requirements: 5.4, 6.4_

## Validation And Completion Gates

- [x] 15. Run targeted tests for canonical readiness and failure artifact
  - [x] `npx tap --disable-coverage test/distributed/harness/__tests__/postgres-baseline-comparison-scenario.test.js`
  - [x] `npx tap --disable-coverage test/distributed/harness/__tests__/report-writer.test.js`
  - _Requirements: 1, 2, 6, 7_

- [x] 16. Run focused integration tests for routing and topology freeze
  - [x] Run multi-node routing integration tests.
  - [x] Run CDC and topology stability integration tests affected by freeze.
  - _Requirements: 3, 4, 7_

- [ ] 17. Run strict 3-node baseline and verify full required fanout
  - [ ] Confirm load starts and uses full required SUT node fanout.
  - [ ] Confirm root-cause artifact is empty on pass.
  - _Requirements: 2.4, 5.2, 8.1_

- [ ] 18. Run strict 7-node baseline and verify full required fanout
  - [ ] Confirm load starts and uses full required SUT node fanout.
  - [ ] Confirm topology freeze/bypass telemetry is emitted.
  - _Requirements: 2.4, 4.3, 8.2_

- [x] 19. Compare latest baseline runs with prior runs
  - [x] Run `scripts/compare-latest-baseline-runs.sh --report-dir test-output/reports`.
  - [x] Capture throughput ratio and p99 ratio deltas.
  - _Requirements: 5.4, 6.3, 8.3_

- [x] 20. Record results and close spec
  - [x] Update `results.md` with pass/fail evidence, deltas, and residual risks.
  - [x] Keep spec open if completion gates are unmet.
  - _Requirements: 8.4_
