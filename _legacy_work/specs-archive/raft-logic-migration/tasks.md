# Implementation Plan

## Overview

This plan executes a phased migration from liferaft to raft-logic with strict
safety gates and auditable promotion criteria.

Execution order:
1. Foundation hardening
2. Benchmark parity
3. Canary rollout
4. Limited production rollout
5. Default cutover

## Tasks

- [x] 1. Establish migration guardrails and rollout controls
  - Define provider selection policy (single provider per process lifetime).
  - Enforce no runtime fallback path in provider execution flow.
  - Keep liferaft as default until cutover gate approval.
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 10.1_

- [x] 2. Stabilize provider contract and integration boundaries
  - Finalize provider contract for lifecycle/propose/status/membership/timing.
  - Refactor integration call sites to use the contract only.
  - Add provider-agnostic contract tests.
  - _Requirements: 2.1, 2.2, 2.3_

- [x] 3. Consolidate ID mapping into one canonical module
  - Remove duplicated mapping logic in adapter/harness call paths.
  - Enforce startup validation for external<->internal ID mapping.
  - Add failure tests for invalid/non-bijective mapping.
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 4. Complete MessageRouter transport parity for raft-logic path
  - Ensure production packet flow uses MessageRouter for raft traffic.
  - Demultiplex and normalize transport artifacts for debugging.
  - Add partition and operation-history evidence to failure reports.
  - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [x] 5. Validate membership and convergence semantics
  - Wire authoritative membership-based convergence counting.
  - Add join/remove/replace membership test coverage.
  - Ensure failover diagnostics clearly show quorum and membership state.
  - _Requirements: 5.1, 5.2, 5.3_

- [x] 6. Implement timing and dynamic configuration parity
  - Define canonical timing config keys and propagation behavior.
  - Implement/update tests for runtime vs restart-applied timing changes.
  - Add adaptive timing guardrails, hysteresis, and disable switch.
  - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [x] 7. Harden durability and restart recovery gates
  - Add sqlite restart scenarios (single restart, rolling restart,
    leader restart, crash-recovery).
  - Verify term/leader recovery and post-restart proposal safety.
  - Capture structured artifacts for any restart anomaly.
  - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [x] 8. Enforce observability defaults and log-discipline policy
  - Disable detailed metrics by default.
  - Make per-commit verbose logs opt-in debug only.
  - Add checks that logging/metrics path does not self-generate loops.
  - _Requirements: 8.1, 8.2, 8.3, 8.4_

- [x] 9. Implement benchmark and regression gate pipeline
  - Run standardized 3-node and 5-node scenarios.
  - Include comparison against previous similar run and Postgres baseline.
  - Fail gate on >10% regression vs liferaft baseline without approved
    mitigation.
  - _Requirements: 9.1, 9.2, 9.3, 9.4_

- [x] 10. Execute staged rollout with explicit promotion gates
  - Roll out to dev, canary, and limited production cohorts.
  - Apply phase-specific promotion/abort criteria.
  - Record stage reports and incident summaries.
  - _Requirements: 10.1, 10.2_

- [x] 11. Rehearse rollback and validate operational readiness
  - Execute rollback drills for canary and limited production stages.
  - Verify redeploy/restart rollback procedure and recovery timing.
  - Document operator checklist and required telemetry signals.
  - _Requirements: 10.3, 11.3, 12.2_

- [x] 12. Publish docs/runbooks and finalize go-live decision
  - Update internal migration docs in `.kiro/specs/`.
  - Update end-user docs/examples for externally visible behavior changes.
  - Produce final go-live gate report and default-provider decision record.
  - _Requirements: 11.1, 11.2, 11.3, 12.1, 12.2, 12.3_

## Notes

- Use fast diagnostics (2-minute soak) for development feedback loops.
- Use extended soak profiles for release-gate decisions.
- Keep artifact paths stable so trend comparison remains automatable.
