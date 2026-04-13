# Implementation Plan: Harness Versioned CDC Readiness Convergence

## Overview

This plan executes in strict order. Do not start a task before the previous
task is complete and marked done.

## P0 - Versioned Readiness Contract

- [x] 1. Add failing unit tests for applied schema/version tracking
  - [x] Cover monotonic updates and out-of-order CDC handling.
  - [x] Cover no-regression semantics for duplicate/stale events.
  - _Requirements: 2.1, 2.2, 2.3, 6.3_

- [x] 2. Implement applied schema/version tracking in CDC/cache path
  - [x] Add per-table applied-version watermark state.
  - [x] Expose read-only accessor for applied versions.
  - _Requirements: 2.1, 2.2, 2.4_

- [x] 3. Add failing tests for required schema/version watermark capture
  - [x] Assert benchmark table creation records required watermark.
  - [x] Assert strict mode fails when watermark is unavailable.
  - _Requirements: 1.1, 1.2, 1.4_

- [x] 4. Implement required watermark capture in benchmark scenario
  - [x] Persist required schema/version in scenario benchmark context.
  - [x] Emit watermark in report details.
  - _Requirements: 1.1, 1.3, 1.4_

- [x] 5. Add failing tests for canonical versioned readiness predicate
  - [x] Cover pass when `applied >= required`.
  - [x] Cover fail-closed reasons (`schema_version_unknown`, `schema_version_lag`).
  - _Requirements: 3.1, 3.2, 3.3_

- [x] 6. Implement canonical readiness predicate and reason codes
  - [x] Evaluate admin/routing/version criteria through one code path.
  - [x] Remove strict-gate dependence on probe-only fallback heuristics.
  - _Requirements: 3.1, 3.2, 3.4, 8.2, 8.3_

## P1 - Cluster Barrier and Diagnostics

- [x] 7. Add failing scenario tests for cluster-wide versioned convergence barrier
  - [x] Assert load blocked until all required nodes satisfy versioned readiness.
  - [x] Assert timeout failure includes per-node unmet reasons.
  - _Requirements: 4.1, 4.2, 4.3_

- [x] 8. Implement strict pre-load convergence barrier
  - [x] Require stable-window convergence across all required load nodes.
  - [x] Fail with required/observed version map and per-node reasons.
  - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [x] 9. Add failing tests for convergence timeline diagnostics
  - [x] Validate required timeline event types and key fields.
  - [x] Validate failure artifact includes version-lag summary.
  - _Requirements: 5.1, 5.2, 5.3_

- [x] 10. Implement convergence timeline and failure payload extensions
  - [x] Emit causal timeline events and node version snapshots.
  - [x] Wire fields into report writer and scenario details.
  - _Requirements: 5.1, 5.2, 5.3_

- [x] 11. Add failing tests for compare-script convergence output
  - [x] Verify script prints required vs observed version deltas when present.
  - _Requirements: 5.4_

- [x] 12. Implement compare-script convergence delta output
  - [x] Add compact convergence section for latest vs prior runs.
  - _Requirements: 5.4_

## P2 - Reproducers and Benchmark Validation

- [x] 13. Add four-plus node integration test for successful convergence
  - [x] Create benchmark table and assert all nodes converge within SLO.
  - _Requirements: 6.1_

- [x] 14. Add four-plus node negative integration test for lagging node
  - [x] Assert barrier failure classifies `schema_version_lag` correctly.
  - _Requirements: 6.2_

- [x] 15. Run targeted unit and integration tests
  - [x] Run touched unit suites for CDC/cache/readiness components.
  - [x] Run new convergence integration suites.
  - _Requirements: 6.3, 6.4_

- [x] 16. Run strict 3-node baseline benchmark
  - [x] Verify load starts only after full versioned convergence.
  - [x] Verify strict failure artifact is empty on pass.
  - _Requirements: 7.1, 7.4_

- [x] 17. Run strict 7-node baseline benchmark
  - [x] Verify full required fanout starts only after convergence barrier pass.
  - [x] Verify no probe-only false-ready admission.
  - _Requirements: 7.1, 7.4_

- [x] 18. Compare latest baselines with prior runs
  - [x] Run `scripts/compare-latest-baseline-runs.sh --report-dir test-output/reports`.
  - [x] Capture convergence deltas and throughput/latency deltas.
  - _Requirements: 5.4, 7.3_

- [x] 19. Update local harness README
  - [x] Document versioned readiness contract, barrier semantics, and diagnostics.
  - _Requirements: 7.2_

- [x] 20. Record outcomes and close spec
  - [x] Update `results.md` with evidence and residual risks.
  - [x] Keep spec open if strict baseline gates remain unmet.
  - _Requirements: 7.1, 7.2, 7.3, 7.4_
