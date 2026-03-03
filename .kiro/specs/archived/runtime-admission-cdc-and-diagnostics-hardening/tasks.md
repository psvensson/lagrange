# Implementation Plan: Runtime Admission, CDC Policy, and Diagnostics Hardening

## Overview

This plan starts by making benchmark admission and CDC policy explicit, then
adds degraded-state handling, failure bundles, and no-progress detection.

## A1 - Benchmark Admission Ownership

- [x] 1. Add failing tests for explicit benchmark admission state
  - [x] Reproduce a node that is discovery-ready but not benchmark-load-ready.
  - [x] Assert one canonical admission state with stable reasons is exposed.
  - _Requirements: 1.1, 1.2, 1.3_

- [x] 2. Implement benchmark admission record production
  - [x] Publish per-node, per-table benchmark admission from runtime/admin
    surfaces.
  - [x] Include load-path readiness, local replica state, and degradation
    reasons.
  - _Requirements: 1.1, 1.3, 1.4, 7.1_

- [x] 3. Move harness load selection onto runtime-owned admission state
  - [x] Remove or minimize duplicated harness-side heuristics where admission
    state already answers the question.
  - [x] Preserve stable failure diagnostics in reports.
  - _Requirements: 1.2, 1.5, 7.2, 7.5_

## A2 - CDC Policy Registry

- [x] 4. Add a canonical per-table CDC policy registry
  - [x] Define the policy schema and the four supported table classes.
  - [x] Store one canonical mapping for internal propagation, readiness
    relevance, hydration mode, and external CDC eligibility.
  - _Requirements: 2.1, 2.2, 2.3_

- [x] 5. Route bootstrap, joining, and discovery logic through the CDC policy registry
  - [x] Replace duplicated scattered lists for propagation and readiness logic.
  - [x] Ensure user-table CDC stays available without affecting control-plane
    readiness unless explicitly configured.
  - _Requirements: 2.3, 2.4, 2.5_

- [x] 6. Add regressions for CDC policy drift
  - [x] Reproduce the `benchmark_events` style control/user CDC confusion.
  - [x] Assert user-table CDC does not accidentally enter internal
    cache-propagation readiness paths.
  - _Requirements: 2.4, 2.5_

## A3 - Rebalancer Degradation State

- [x] 7. Add failing tests for replica-move degradation
  - [x] Reproduce failed `replica.moved` and failed promotion outcomes.
  - [x] Assert affected nodes or groups become degraded for benchmark
    admission.
  - _Requirements: 3.1, 3.2, 3.5_

- [x] 8. Implement rebalancer degradation state machine
  - [x] Persist or publish degraded states with stable reason codes and
    operation IDs.
  - [x] Gate benchmark admission on active degraded movement states.
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 9. Add recovery-path tests
  - [x] Verify recovery clears degraded state only after explicit criteria are
    met.
  - [x] Verify stale or unrelated operations do not clear degradation
    incorrectly.
  - _Requirements: 3.3, 3.4_

## A4 - Failure Bundle and No-Progress Protocol

- [x] 10. Add phase progress heartbeat emission
  - [x] Emit progress markers for long-running startup, discovery, preload,
    load, and verify phases.
  - _Requirements: 6.1, 6.2_

- [x] 11. Implement explicit no-progress failure handling
  - [x] Add no-progress budgets distinct from absolute deadlines.
  - [x] Serialize last-known progress details into failure results.
  - _Requirements: 6.2, 6.3, 6.4_

- [x] 12. Implement automatic distributed failure bundles
  - [x] Emit machine-readable and human-readable bundle outputs.
  - [x] Link them from report JSON.
  - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [x] 13. Add verification for bundle schema and no-progress reporting
  - [x] Cover one runtime failure and one no-progress failure.
  - _Requirements: 4.5, 6.5_

## A5 - Deterministic Replica-Instability Coverage

- [x] 14. Add deterministic integration fixtures for replica instability
  - [x] Cover creation, promotion, failed move, and degraded admission.
  - _Requirements: 5.1, 5.2_

- [x] 15. Backfill current 7-node baseline failures into deterministic integration tests
  - [x] Reproduce the `11601fe0...` load-lane instability if still present.
  - [x] Reproduce the failed movement path that degrades benchmark admission.
  - _Requirements: 5.3, 5.4_

- [x] 16. Document and enforce closure policy
  - [x] Require new baseline-discovered correctness bugs to land in this test
    layer before closure.
  - _Requirements: 5.3, 5.5_

## A6 - Runtime-First Stabilization and Fallback Reduction

- [x] 17. Move remaining harness-side heuristics behind runtime-exported state
  - [x] Audit benchmark readiness and degradation decisions that still live only
    in the harness.
  - _Requirements: 7.1, 7.2, 7.3, 7.5_

- [x] 18. Instrument authoritative fallback as structured runtime signals
  - [x] Record table, node, row key, and frequency windows.
  - [x] Distinguish bootstrap-only fallback from steady-state fallback.
  - _Requirements: 8.1, 8.4_

- [x] 19. Gate strict profiles on sustained fallback where appropriate
  - [x] Prevent steady-state fallback storms from being treated as healthy runs.
  - _Requirements: 8.2, 8.3_

## A7 - Checkpoint and Closure

- [x] 20. Run targeted verification
  - [x] Run unit, admin, scenario, and deterministic integration coverage for
    admission, CDC policy, degradation, and failure bundles.
  - _Requirements: 1-8_

- [x] 21. Run strict checkpoint baselines
  - [x] Run strict 3-node baseline.
  - [x] Run strict 7-node baseline only after lower layers pass.
  - _Requirements: 1-8_

- [x] 22. Record residual risks and close the spec
  - [x] Capture remaining fallback hotspots, degraded-state edge cases, and
    follow-on runtime work.
  - _Requirements: 1-8_

## Closure Notes

Closure checkpoint completed with both strict baselines passing.

Successful strict checkpoint:

- `3node` strict baseline already passed earlier in this workstream.
- `7node` strict baseline passed on 2026-03-02 via [test-output/report.json](/media/peter/4509da27-4751-4dee-b366-f3983d077725/peter/projects/something/test-output/report.json).
- Concrete throughput, latency, queue-pressure, and consistency details are
  recorded in [test-output/report.json](/media/peter/4509da27-4751-4dee-b366-f3983d077725/peter/projects/something/test-output/report.json).

Residual risks and follow-on runtime work:

- Authoritative discovery cache repair is still recurring on benchmark nodes
  during table-scoped discovery for `benchmark_events`. The run passed, but
  this remains evidence of cache/readiness drift rather than a fully healthy
  steady state.
- Authoritative cache-gap recovery warnings still occur on control tables such
  as `tables`, `partitions`, `services`, and `message_groups`. These should
  keep shrinking toward exception-only behavior.
- The playback event stream can stop advancing while `snapshots.ndjson` and
  `samples.ndjson` continue to move. This is a diagnostics defect: progress is
  still happening, but the most operator-friendly event feed becomes stale.
- The seed still emits repeated `Skipping node-ready rebalance trigger: already
  scheduled` warnings. This looks like redundant trigger churn and should be
  coalesced or rate-limited.
- Startup still emits repeated direct-fanout CDC strategy fallback warnings
  and bootstrap peer-hint warnings. These do not block correctness now, but
  they indicate topology/readiness initialization is still noisier than it
  should be.
- Queue pressure remains materially high in the passing run. This spec closed
  correctness and admission issues, not the remaining throughput and
  tail-latency optimization work.
