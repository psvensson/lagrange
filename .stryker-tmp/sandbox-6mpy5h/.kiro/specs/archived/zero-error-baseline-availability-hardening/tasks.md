# Consolidated Implementation Plan: Zero-Error Baseline Availability Hardening

## Overview

This is the single canonical task list for this spec package.

It consolidates and de-duplicates:

1. original baseline hardening tasks,
2. architecture sequencing tasks from `architecture-phased-plan.md`,
3. startup/join/readiness stabilization work required for 7-node reliability.

Execution order is by phase to reduce risk and keep one code path per concern.

## Phase 0: Baseline Corpus and Observability Foundation

- [x] 1. Capture reproducible failure corpus and seed matrix
  - Record latest failing/passing report IDs for 3-node and 7-node profiles.
  - Persist failure-class summary artifact under `test-output/reports/`.
  - _Requirements: 10.1, 10.2, 11.1_

- [x] 2. Introduce canonical startup/readiness decision record
  - Add machine-readable reason classes for startup/discovery/topology/load.
  - Include reason histogram and phase classification in scenario details.
  - _Requirements: 7.2, 10.1, 10.4_

- [x] 3. Add probe-budget and overlap instrumentation
  - Track timeout budget mismatch (outer vs inner probe timeouts).
  - Track timed-out-but-still-in-flight probe/query count.
  - Track in-flight membership operations by partition group.
  - _Requirements: 7.2, 9.3, 10.2, 10.5_

## Phase 1: Startup Probe Decoupling and ACTIVE Gate Stability

- [x] 4. Add failing regression tests for 7-node ACTIVE timeout class
  - Reproduce startup failure shape from report corpus.
  - Assert deterministic failure categories in diagnostics.
  - _Requirements: 7.1, 7.2, 11.3_

- [x] 5. Harden startup probe path to prefer lightweight readiness
  - Use `/bootstrap/ready` as primary ACTIVE probe signal per node.
  - Keep control snapshot coverage as barrier, with bounded probing.
  - _Requirements: 7.1, 7.2, 7.3_

- [x] 6. Enforce probe timeout propagation and cancellation semantics
  - Ensure per-request timeout is consistent end-to-end.
  - Prevent abandoned probe operations from accumulating in-flight pressure.
  - _Requirements: 4.2, 7.2, 9.2_

- [x] 7. Strengthen startup gate contract and diagnostics
  - Require `all nodes startup-ready` + `snapshot coverage` before preflight.
  - Emit structured startup reason histogram and per-node state summary.
  - _Requirements: 7.1, 7.2, 7.3, 10.1_

## Phase 2: Load-Path Failure Handling and Channel Isolation

- [x] 8. Add failing integration test for breaker-cascade reproduction
  - Simulate small timeout burst on load channel.
  - Assert operation failures are amplified in old behavior.
  - _Requirements: 3.5, 11.1_

- [x] 9. Make NodeClient the single breaker owner on load path
  - Remove/disable duplicate breaker behavior in LoadGenerator.
  - Preserve scheduler and metrics responsibilities in LoadGenerator.
  - _Requirements: 2.1, 2.2, 2.3, 14.2_

- [x] 10. Add single-owner invariant tests
  - Assert only NodeClient breaker state controls load rejection.
  - Assert no dual breaker/fallback transition path remains.
  - _Requirements: 2.1, 2.4, 14.2_

- [x] 11. Tune burst-tolerant breaker and timeout defaults
  - Centralize policy in constants/config resolution.
  - Replace fragile single-failure settings with safe defaults.
  - _Requirements: 3.1, 3.2, 13.1, 13.2, 13.4_

- [x] 12. Introduce/complete channel-isolated transport lanes
  - Isolate load/control/probe/snapshot traffic lanes.
  - Keep NodeClient API surface stable.
  - _Requirements: 4.1, 4.2, 4.3_

- [x] 13. Add channel-isolation and burst-recovery tests
  - Validate no starvation across lanes under saturation.
  - Validate half-open recovery and burst tolerance behavior.
  - _Requirements: 3.5, 4.4, 11.1, 12.4_

- [x] 14. Implement bounded admission control + queue-delay observability
  - Prefer paced dispatch/backpressure over guaranteed-failure dispatch.
  - Emit queue-delay and dispatch-defer diagnostics.
  - _Requirements: 9.1, 9.2, 9.3_

## Phase 3: Discovery Canonicalization and Topology Lock

- [x] 15. Add failing tests for discovery-ready vs schema-ready mismatch
  - Reproduce `healthy endpoint` with `table not found` at load start.
  - Assert canonical readiness excludes non-workload-ready replicas.
  - _Requirements: 5.3, 6.1, 11.2_

- [x] 16. Complete additive discovery readiness schema
  - Ensure per-replica readiness includes routing/schema/topology reasons.
  - Ensure table-scoped readiness (`benchmark_events`) is supported.
  - _Requirements: 5.1, 5.2, 5.3, 6.1, 6.2, 10.4_

- [x] 17. Wire all benchmark node selection to canonical readiness fields
  - Remove bespoke readiness interpretation in selection path.
  - Fail closed when required readiness data is absent.
  - _Requirements: 5.4, 6.3, 14.1_

- [x] 18. Add and enforce topology-lock pre-load gate
  - Require zero in-flight replica operations.
  - Require leadership stability window and stable discovered ready set.
  - Fail fast with reason-coded diagnostics on timeout.
  - _Requirements: 8.1, 8.2, 8.3, 8.4_

- [x] 19. Add topology-lock regression tests
  - Reproduce in-flight operation churn during pre-load.
  - Assert load phase does not start until lock conditions hold.
  - _Requirements: 8.1, 8.2, 8.3, 11.3_

## Phase 4: Membership Architecture Hardening (Learner/Promotion)

- [x] 20. Introduce learner-first replica lifecycle
  - New replicas join as learner before voter promotion.
  - Define promotable criteria explicitly (catch-up + stability).
  - _Requirements: 7.1, 8.2, 12.2_

- [x] 21. Serialize membership changes per partition group
  - Enforce single promotion/demotion operation in flight per group.
  - Add bounded retry/backoff for promotion attempts.
  - _Requirements: 7.1, 8.1, 8.2, 12.2_

- [x] 22. Add membership serialization and promotion safety tests
  - Verify no concurrent promotion races in integration tests.
  - Verify churn reduction and deterministic startup convergence.
  - _Requirements: 7.4, 11.3, 12.2_

## Phase 5: Control-Plane Write Isolation and Readiness Degradation Policy

- [x] 23. Decouple liveness from distributed control-plane write success
  - Keep process liveness independent of transient distributed write failures.
  - Convert repeated write faults into degraded readiness reasons.
  - _Requirements: 5.2, 7.2, 10.1_

- [x] 24. Add startup freeze for non-critical background control writes
  - Delay non-critical control-plane writers until cluster-active barrier.
  - Prevent startup self-interference from background control churn.
  - _Requirements: 7.1, 7.2, 8.2_

- [x] 25. Add readiness degradation policy tests
  - Assert liveness remains true under isolated control write failures.
  - Assert traffic/workload readiness degrades with structured reason codes.
  - _Requirements: 5.2, 10.4, 11.3_

## Phase 6: Reporting, Invariants, and Acceptance Gates

- [x] 26. Expand observability/report schema (additive) and compatibility tests
  - Add `attemptErrors`, breaker metrics, readiness exclusion reasons.
  - Ensure existing report consumers remain compatible.
  - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

- [x] 27. Enforce hard benchmark invariants
  - Hard-fail on operation-level `failed > 0` or `errors > 0`.
  - Preserve attempt-level diagnostics as non-hard by default.
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 28. Remove temporary adapters/fallback code paths
  - Eliminate migration-only compatibility layers for breaker/discovery/gating.
  - Verify one canonical code path per concern.
  - _Requirements: 14.1, 14.2, 14.3, 14.4_

- [x] 29. Checkpoint: targeted unit/integration suites
  - `npm test -- test/distributed/harness/__tests__/load-generator.test.js`
  - `npm test -- test/distributed/harness/__tests__/node-client.test.js`
  - `npm test -- test/distributed/harness/__tests__/cluster.test.js`
  - `npm test -- test/distributed/harness/__tests__/postgres-baseline-comparison-scenario.test.js`
  - Include new integration tests introduced by this consolidated plan.
  - _Requirements: 1-11_

- [x] 30. Acceptance checkpoint: 3-node baseline
  - Run with `test/distributed/config/local-benchmark-3node.json`.
  - Require `failed=0` and `errors=0` across repeated runs.
  - _Requirements: 12.1, 12.4_

- [x] 31. Acceptance checkpoint: 7-node baseline
  - Run with the canonical 7-node harness profile.
  - Require startup/preflight stability and zero load operation errors.
  - _Requirements: 12.2, 12.3, 12.4_

- [x] 32. Finalize rollout defaults and documentation
  - Update default profile values to safe operational settings.
  - Finalize rollout/rollback triggers and migration notes.
  - _Requirements: 13.1, 13.2, 13.3, 13.4_

## Consolidation Notes

This file supersedes the prior ungrouped task list and merges overlapping work:

1. startup gate hardening + diagnostics + probe behavior are combined in
   Phase 1 tasks,
2. breaker ownership + transport isolation + admission control are combined in
   Phase 2 tasks,
3. discovery readiness + schema readiness + topology lock are combined in
   Phase 3 tasks,
4. architecture tasks from `architecture-phased-plan.md` are integrated in
   Phases 4 and 5.
