# Implementation Plan: Harness Throughput Parity Optimization

## Overview

This plan implements throughput optimization infrastructure in a test-first
sequence:

1. lock in parity and accounting contracts,
2. implement discovery, policy, and metrics changes,
3. wire report and prioritization updates,
4. verify with benchmark runs.

## Tasks

- [x] 1. Add failing tests for load parity contract generation
  - [x] Assert parity record includes configured and effective sections.
  - [x] Assert mismatch reason codes are emitted for fanout or budget mismatch.
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 2. Implement parity evaluator in benchmark scenario
  - [x] Add `matched|mismatched` classification and reason code mapping.
  - [x] Add optional fail-on-mismatch policy.
  - _Requirements: 1.1, 1.3, 1.4, 1.5_

- [x] 3. Add failing tests for aggregated SUT discovery
  - [x] Reproduce multi-source case where first source is partial.
  - [x] Assert unioned discovered nodes and complete source diagnostics.
  - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [x] 4. Implement union-based discovery in `resolveSutLoadNodes`
  - [x] Remove first-hit short-circuit behavior.
  - [x] Preserve readiness filtering and exclusion reasons.
  - _Requirements: 2.1, 2.2, 2.4, 2.5_

- [x] 5. Add failing tests for single-owner admission policy resolution
  - [x] Assert one resolved load policy view is emitted in report details.
  - [x] Assert conflicting policy sources are explicitly diagnosed.
  - _Requirements: 3.1, 3.2, 3.3, 3.5_

- [x] 6. Implement effective admission policy export
  - [x] Wire NodeClient policy snapshot and scenario benchmark settings.
  - [x] Emit `effectiveAdmissionPolicy` in scenario details.
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 7. Add failing tests for load dispatch accounting invariants
  - [x] Assert target, dispatched, and undispatched accounting balances.
  - [x] Assert undispatched reason classes are populated.
  - _Requirements: 4.1, 4.2, 4.3_

- [x] 8. Implement dispatch accounting in `LoadRun`
  - [x] Add target/dispatched/undispatched counters.
  - [x] Add per-node counters and reason breakdown fields.
  - _Requirements: 4.1, 4.3, 4.4, 4.5_

- [x] 9. Add failing tests for stable metrics schema
  - [x] Validate required optimization fields exist even when zero.
  - [x] Validate additive schema compatibility in report writer.
  - _Requirements: 5.1, 5.2, 5.4, 5.5_

- [x] 10. Implement schema stabilization fields
  - [x] Add required defaulted fields for parity, accounting, diagnostics coverage.
  - [x] Ensure report compatibility with historical summaries.
  - _Requirements: 5.1, 5.2, 5.3, 5.5_

- [x] 11. Add failing tests for diagnostics coverage contract
  - [x] Assert explicit unavailability reason when diagnostics are absent.
  - [x] Assert sample count propagation when diagnostics are present.
  - _Requirements: 6.1, 6.2, 6.3_

- [x] 12. Implement diagnostics coverage reporting
  - [x] Add `diagnosticsCoverage` block in scenario details.
  - [x] Update standard summary aggregation for coverage visibility.
  - _Requirements: 6.2, 6.3, 6.4, 6.5_

- [x] 13. Add failing tests for baseline cache path stability
  - [x] Assert equivalent runs with different report names reuse cache.
  - [x] Assert identity key remains unchanged.
  - _Requirements: 7.1, 7.2, 7.5_

- [x] 14. Implement stable baseline cache path resolution
  - [x] Move cache path anchor to stable report-directory cache root.
  - [x] Preserve TTL and refresh semantics.
  - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [x] 15. Add failing tests for optimization priority extensions
  - [x] Assert queue pressure can produce optimization priority items.
  - [x] Assert admission throttling can produce priority items.
  - _Requirements: 8.1, 8.2, 8.4_

- [x] 16. Implement new priority signals in report writer
  - [x] Add signal scoring thresholds for queue and admission pressure.
  - [x] Include numeric evidence payload fields.
  - _Requirements: 8.1, 8.2, 8.3, 8.5_

- [x] 17. Add failing tests for throughput gate and parity prerequisites
  - [x] Assert gate can fail for low throughput ratio.
  - [x] Assert gate can fail or warn on parity mismatch per policy.
  - _Requirements: 9.1, 9.2, 9.4_

- [x] 18. Implement gate wiring updates
  - [x] Integrate parity status into gate decision context.
  - [x] Emit actionable gate diagnostics.
  - _Requirements: 9.2, 9.3, 9.5_

- [x] 19. Update benchmark scenario tests for new required fields
  - [x] Extend `postgres-baseline-comparison` tests for parity and accounting.
  - [x] Extend channel metrics assertions with stable field presence.
  - _Requirements: 5.1, 10.1, 10.5_

- [x] 20. Run targeted harness test suites
  - [x] `npx tap --disable-coverage test/distributed/harness/__tests__/load-generator.test.js`
  - [x] `npx tap --disable-coverage test/distributed/harness/__tests__/node-client.test.js`
  - [x] `npx tap --disable-coverage test/distributed/harness/__tests__/report-writer.test.js`
  - [x] `npx tap --disable-coverage test/distributed/harness/__tests__/postgres-baseline-comparison-scenario.test.js`
  - _Requirements: 1-10_

- [x] 21. Benchmark validation checkpoint
  - [x] Re-run 3-node and 7-node benchmark profiles.
  - [x] Confirm parity record correctness and stable metric emission.
  - [x] Compare throughput ratio, queue delay, and budget denials before/after.
  - _Requirements: 1.5, 4.5, 5.5, 9.5_

- [x] 22. Document rollout defaults and mitigation policy
  - [x] Set profile defaults for parity policy and gate thresholds.
  - [x] Record migration notes for report consumers.
  - _Requirements: 1.5, 5.4, 9.4_
