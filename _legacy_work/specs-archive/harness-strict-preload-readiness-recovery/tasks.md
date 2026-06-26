# Implementation Plan: Harness Strict Preload Readiness Recovery

## Overview

This plan executes in strict order. Do not start a task before the previous
task is complete and marked done.

## P0 - Foundation and Working-Condition Refactor

- [x] 1. Add failing tests for strict benchmark quiet-mode contract
  - [x] Assert strict benchmark phases enter and exit quiet mode.
  - [x] Assert quiet-mode lifecycle is emitted in scenario details.
  - _Requirements: 1.1, 1.4_

- [x] 2. Implement quiet-mode lifecycle scaffolding
  - [x] Add quiet-mode state model and phase hooks in benchmark scenario.
  - [x] Emit quiet-mode transitions to report/playback payloads.
  - _Requirements: 1.1, 1.4_

- [x] 3. Add failing tests for canonical readiness snapshot-only gate inputs
  - [x] Assert strict gate consumes one snapshot contract with fail-closed behavior.
  - [x] Assert no fallback probe path is used in strict mode.
  - _Requirements: 3.1, 3.3, 4.4_

- [x] 4. Implement strict gate snapshot-only contract
  - [x] Route strict pre-load gate through one canonical snapshot evaluator.
  - [x] Remove strict-mode dependence on heavyweight fallback checks.
  - _Requirements: 3.1, 3.3, 4.4_

- [x] 5. Refactor benchmark scenario into focused modules (no behavior change)
  - [x] Extract strict-gate evaluator, quiet-mode controller, and diagnostics collector.
  - [x] Keep existing tests green after module extraction.
  - _Requirements: 6.1, 6.3, 6.4_

## P1 - Control-Plane Pressure Reduction

- [x] 6. Add failing unit tests for periodic write coalescing and unchanged-write skip
  - [x] Cover heartbeat/node metadata update coalescing.
  - [x] Cover max staleness guard to preserve liveness semantics.
  - _Requirements: 2.1, 2.2, 7.3_

- [x] 7. Implement bounded control-plane write policy
  - [x] Add minimum update interval and unchanged-write suppression.
  - [x] Add coalescing path for periodic node/system writes.
  - _Requirements: 2.1, 2.2_

- [x] 8. Add failing tests for quiet-mode non-critical suppression and safety bypass
  - [x] Assert non-critical background loops are suppressed during quiet mode.
  - [x] Assert safety-critical bypass remains allowed and recorded.
  - _Requirements: 1.2, 1.3_

- [x] 9. Implement quiet-mode suppression and bypass telemetry
  - [x] Integrate quiet-mode checks into non-critical control-plane producers.
  - [x] Emit bypass reason histogram.
  - _Requirements: 1.2, 1.3, 1.4_

- [x] 10. Add failing tests for strict write-pressure threshold handling
  - [x] Reproduce sustained pressure and assert strict failure reason class.
  - [x] Assert non-strict mode records but does not hard-fail on threshold.
  - _Requirements: 2.4, 5.4_

- [x] 11. Implement write-pressure counters and strict threshold gate
  - [x] Emit write pressure counters in benchmark details.
  - [x] Classify strict threshold failure with stable reason code.
  - _Requirements: 2.3, 2.4, 5.4_

## P2 - Deterministic Root Cause and Diagnostics

- [x] 12. Add failing tests for strict reason precedence and dominant-cause selection
  - [x] Assert deterministic precedence when multiple reasons are present.
  - [x] Assert failure envelope includes one dominant reason.
  - _Requirements: 4.1, 4.2_

- [x] 13. Implement strict reason precedence model
  - [x] Add precedence ordering in strict gate evaluator.
  - [x] Emit dominant reason plus full per-node reason map.
  - _Requirements: 4.1, 4.2, 4.3_

- [x] 14. Add failing tests for saturation telemetry in failure artifacts
  - [x] Assert CDC forward timeout and query timeout counters are captured.
  - [x] Assert timeline includes per-poll readiness snapshots and reason transitions.
  - _Requirements: 5.1, 5.2, 5.4_

- [x] 15. Implement saturation diagnostics pipeline
  - [x] Wire saturation counters into scenario details and failure envelopes.
  - [x] Extend report writer fields for saturation blocks.
  - _Requirements: 5.1, 5.2, 5.4_

- [x] 16. Add failing tests for compare-script saturation delta output
  - [x] Verify latest-vs-prior output prints saturation deltas and dominant reason.
  - _Requirements: 5.3_

- [x] 17. Implement compare-script saturation and dominant-reason reporting
  - [x] Add compact saturation section for 3-node and 7-node profile comparisons.
  - _Requirements: 5.3_

## P3 - Reproducers and Baseline Recovery

- [x] 18. Add integration reproducer for strict preload failure under pressure
  - [x] Induce CDC forward/query timeout pressure and assert expected strict failure.
  - [x] Assert reason pattern includes schema/routing degradation and saturation counters.
  - _Requirements: 7.1, 7.4_

- [x] 19. Add integration validation for quiet-mode recovery path
  - [x] Validate strict preload passes under equivalent topology with quiet mode enabled.
  - [x] Assert full required node fanout admitted before load start.
  - _Requirements: 1.1, 1.2, 7.2, 8.1, 8.2_

- [x] 20. Run targeted unit suites for touched strict gate and pressure modules
  - [x] Run only directly affected harness/unit tests first.
  - _Requirements: 7.3, 7.4_

- [x] 21. Run targeted integration suites for strict preload and quiet-mode behavior
  - [x] Run new reproducers plus existing versioned readiness integration tests.
  - _Requirements: 7.1, 7.2, 7.4_

## P3b - Assignment Ownership and Join Convergence Hardening

- [x] 22. Add failing integration test for concurrent MOVE_REPLICA bootstrap race
  - [x] Start two joiners concurrently and assert bootstrap assignments are unique.
  - [x] Assert no duplicate `replicaToMove` ownership is handed out.
  - _Requirements: 9.1, 9.3, 13.1_

- [x] 23. Implement atomic MOVE_REPLICA reservation with lease semantics
  - [x] Persist assignment reservation before bootstrap response is returned.
  - [x] Enforce uniqueness and reclaim expired/failed reservations.
  - _Requirements: 9.1, 9.2, 9.4_

- [x] 24. Add failing tests for assignment-token handshake and stale-token rejection
  - [x] Assert `register-service` rejects missing/unknown/expired assignment tokens.
  - [x] Assert token ownership mismatch (node/replica) fails closed.
  - _Requirements: 10.2, 10.3, 13.2_

- [x] 25. Implement assignment-token handshake across bootstrap and register-service
  - [x] Return `assignmentId` + lease metadata in bootstrap MOVE_REPLICA payload.
  - [x] Validate token on register-service and link handoff telemetry to token.
  - _Requirements: 10.1, 10.2, 10.4_

- [x] 26. Add failing tests for single-owner replica invariant
  - [x] Assert duplicate active owner rows for one message-group replica are rejected.
  - [x] Assert ownership conflicts emit stable machine-readable reason codes.
  - _Requirements: 11.1, 11.3, 13.4_

- [x] 27. Implement single-owner registration and startup guards
  - [x] Enforce one active owner per message-group `replicaId` at registration.
  - [x] Fail fast during startup/reconciliation when conflicting ownership exists.
  - _Requirements: 11.1, 11.2, 11.3_

- [x] 28. Add failing tests for join READY convergence alignment
  - [x] Assert joiner does not transition READY while applied schema version is null.
  - [x] Assert deterministic timeout reason classification for schema/routing/topology.
  - _Requirements: 12.1, 12.3_

- [x] 29. Implement join convergence gate aligned with strict canonical readiness
  - [x] Gate READY on canonical snapshot contract (`routing`, `topology`, versioned schema).
  - [x] Emit per-node required-vs-observed schema diagnostics at timeout.
  - _Requirements: 12.1, 12.2, 12.4_

- [x] 30. Add integration regression for strict preload convergence after concurrent joins
  - [x] Assert all required load nodes report non-null `appliedSchemaVersion`.
  - [x] Assert strict pre-load is not dominated by assignment/convergence race reasons.
  - _Requirements: 13.1, 13.3, 13.4_

## P4 - Baseline Recovery and Closeout

- [x] 31. Run strict 3-node baseline benchmark
  - [x] Verify pre-load pass and load start with full required fanout.
  - [x] Verify failure artifact is empty on pass.
  - _Requirements: 8.1, 8.3, 12.1_

- [x] 32. Run strict 7-node baseline benchmark
  - [x] Verify pre-load pass and load start with full required fanout.
  - [x] Verify no dominant schema/routing unknown reasons at gate completion.
  - _Requirements: 8.2, 8.3, 12.1_

- [x] 33. Compare latest baselines with prior runs and Postgres baseline where available
  - [x] Run `scripts/compare-latest-baseline-runs.sh --report-dir test-output/reports`.
  - [x] Capture throughput/p99 and saturation deltas in results.
  - _Requirements: 5.3, 8.4_

- [x] 34. Update local harness README and close-out notes
  - [x] Document quiet mode, saturation fields, dominant-reason output, and assignment-token flow.
  - [x] Record final outcomes and residual risks in `results.md`.
  - _Requirements: 6.2, 8.4_
