# Implementation Plan: Harness Seven-Node Stability and Throughput Hardening

## Overview

This plan executes in strict order from benchmark truthfulness (`P0`) to
stability (`P1`) to throughput tuning (`P2`).

## P0 - Benchmark Truthfulness And Hard Failure Gates

- [x] 1. Add failing scenario tests for strict discovery gate
  - [x] Reproduce seven-node preflight where only one node is reachable.
  - [x] Assert strict mode fails with `insufficient_reachable_nodes`.
  - _Requirements: 1.1, 1.2, 1.4, 10.1_

- [x] 2. Implement strict discovery enforcement
  - [x] Add strict mode branch disallowing partial discovery fallback.
  - [x] Emit full per-source diagnostics and gate artifact.
  - _Requirements: 1.1, 1.3, 1.4, 1.5_

- [x] 3. Add failing tests for strict parity failure
  - [x] Reproduce `sutLoadNodeCount != baselineLoadNodeCount` mismatch.
  - [x] Assert strict parity mode fails scenario.
  - _Requirements: 2.1, 2.2, 2.3, 10.1_

- [x] 4. Implement strict parity enforcement
  - [x] Add strict parity config and failure logic.
  - [x] Export parity decision to strict gate summary.
  - _Requirements: 2.1, 2.2, 2.4_

- [x] 5. Add failing tests for internal signal threshold policy
  - [x] Reproduce repeated warning/error classes and assert threshold breach.
  - [x] Assert scenario fails with class-count diagnostics.
  - _Requirements: 3.1, 3.2, 3.3, 10.1_

- [x] 6. Implement internal signal classification and thresholds
  - [x] Add signal class map and counters.
  - [x] Wire threshold evaluation into benchmark scenario pass/fail.
  - _Requirements: 3.1, 3.3, 3.4, 3.5_

- [x] 7. Add failing tests for strict pre-load readiness barrier
  - [x] Reproduce node set where admin health passes but queryability/routing
    not stable.
  - [x] Assert pre-load gate fails with per-node reason map.
  - _Requirements: 4.1, 4.2, 4.4, 10.1_

- [x] 8. Implement strict pre-load readiness barrier
  - [x] Require cluster-wide readiness over stable window.
  - [x] Block load when rebalancing exceeds configured in-flight threshold.
  - _Requirements: 4.1, 4.3, 4.4, 4.5_

- [x] 9. Update benchmark profile defaults for strict mode
  - [x] Set strict discovery/parity/readiness defaults in benchmark configs.
  - [x] Keep exploratory opt-out explicit and non-default.
  - _Requirements: 1.2, 2.2, 4.1_

## P1 - CDC and Rebalancing Stability

- [x] 10. Add failing integration tests for CDC handshake and catch-up
  - [x] Reproduce late-subscriber case with buffered events.
  - [x] Assert deterministic catch-up and steady-state transition.
  - _Requirements: 5.1, 5.2, 5.4, 10.3_

- [x] 11. Implement CDC handshake and catch-up protocol
  - [x] Add subscribe ack with epoch/version context.
  - [x] Add catch-up trigger and completion criteria.
  - _Requirements: 5.1, 5.2, 5.3_

- [x] 12. Add failing tests for CDC telemetry fields
  - [x] Assert metrics include subscriber count, buffered events, and lag.
  - [x] Assert missing fields fail strict report schema checks.
  - _Requirements: 6.1, 6.2, 6.4, 10.5_

- [x] 13. Implement CDC telemetry and report wiring
  - [x] Emit per-node CDC metrics.
  - [x] Surface CDC pressure summary in report and compare script.
  - _Requirements: 6.1, 6.3, 6.5_

- [x] 14. Add failing tests for rebalancing hysteresis and pinning
  - [x] Reproduce benchmark load phase thrash and assert protection behavior.
  - [x] Assert explicit fault scenarios can bypass pinning.
  - _Requirements: 7.1, 7.2, 7.4, 10.4_

- [x] 15. Implement rebalancing hysteresis and benchmark pinning
  - [x] Add cooldown/min-delta controls.
  - [x] Add benchmark-window pinning control path.
  - _Requirements: 7.1, 7.2, 7.3, 7.4_

## P2 - Throughput Path Optimizations

- [x] 16. Add failing integration tests for multi-node system-table visibility
  - [x] Validate four-plus nodes query expected admin/system surfaces.
  - [x] Reproduce and assert failure when local-only shortcut is used.
  - _Requirements: 8.1, 8.3, 8.4, 10.3_

- [x] 17. Implement canonical multi-node system-table read path
  - [x] Remove non-canonical local shortcut path in benchmark context.
  - [x] Document ownership and call sites.
  - _Requirements: 8.1, 8.2, 8.5_

- [x] 18. Add failing tests for bounded queue and early reject overload policy
  - [x] Assert queue depth boundaries and stable reject reason codes.
  - [x] Assert overload violations fail strict benchmark policy.
  - _Requirements: 9.1, 9.3, 9.4, 10.5_

- [x] 19. Implement admission/queue overload hardening
  - [x] Add bounded queue policy with early reject behavior.
  - [x] Export per-node queue pressure and rejection metrics.
  - _Requirements: 9.1, 9.2, 9.3, 9.5_

## Validation And Benchmark Checkpoints

- [x] 20. Run targeted harness tests for strict-gate behavior
  - [x] `npx tap --disable-coverage test/distributed/harness/__tests__/postgres-baseline-comparison-scenario.test.js`
  - [x] `npx tap --disable-coverage test/distributed/harness/__tests__/report-writer.test.js`
  - _Requirements: 1-4, 10_

- [x] 21. Run targeted integration tests for CDC and multi-node admin path
  - [x] `npm test -- test/integration/message-group-multi-join-formation.integration.test.js`
  - [x] `npm test -- test/integration/node-join-convergence-slo.integration.test.js`
  - _Requirements: 5-8, 10_

- [ ] 22. Run strict 3-node and 7-node baseline benchmarks
  - [x] Verify seven-node run fails if discovery/parity are invalid.
  - [ ] Verify successful run uses full required SUT load fanout.
  - _Requirements: 1-4_

- [x] 23. Compare new run vs prior run with enhanced compare script
  - [x] Confirm strict gate, parity, CDC pressure, and queue/admission deltas.
  - _Requirements: 2.5, 6.5, 9.5_

- [ ] 24. Record benchmark deltas and close spec
  - [ ] Capture before/after throughput ratio and p99 ratio.
  - [x] Capture strict-gate pass/fail evidence and residual risks.
  - _Requirements: 1-10_
