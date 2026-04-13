# Implementation Plan: Storage Capacity-Aware Placement

## Overview

Implement dedicated node storage budgets, admission-gated placement, reservation
accounting, and capacity-aware split/rebalance behavior.

Execution order:
1. metadata/config/read-side accounting
2. admission + reservation lifecycle
3. planner/split/policy integration
4. observability, docs, and verification

## Tasks

- [x] 1. Define storage capacity constants and config keys
  - Add node budget startup keys and validation constants.
  - Add rebalancer/storage thresholds, TTL, amplification, and overhead keys.
  - Add canonical reason-code constants for admission decisions.
  - _Requirements: 1.1, 1.3, 1.4, 6.2, 6.3, 8.1_

- [x] 2. Add schema support for storage budget and reservations
  - Extend `nodes` schema with storage budget ownership fields.
  - Add `storage_reservations` system table schema and indices.
  - Add partition/bootstrap constants and cache-key descriptors for the new
    table.
  - _Requirements: 1.2, 2.1, 12.1_

- [x] 3. Implement `NodeStorageBudgetService` owner
  - Resolve startup budget from absolute/ratio config deterministically.
  - Persist budget metadata during seed/join registration flow.
  - Enforce non-eligible status when budget is missing/invalid.
  - _Requirements: 1.1, 1.3, 1.4, 1.5, 9.1, 9.3, 9.4_

- [x] 4. Implement `StorageCapacityAccountingService` owner
  - Compute used/reserved/available bytes from metadata.
  - Implement replica size estimation with minimums and overhead constants.
  - Derive pressure state from configurable thresholds.
  - _Requirements: 2.2, 2.3, 2.4, 2.5, 8.1_

- [x] 5. Implement `StorageAdmissionService` owner
  - Add admission APIs for ADD/REPLACE/SPLIT storage-increasing operations.
  - Return structured decisions with reason codes and projected utilization.
  - Enforce emergency-headroom rules for critical replacements.
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 8.4, 11.2_

- [x] 6. Integrate reservation lifecycle with `RebalanceCoordinator`
  - Create reservations atomically with operation creation.
  - Update/release reservations on operation state transitions and terminal
    outcomes.
  - Add startup and periodic reconciliation for stale/orphan reservations.
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 11.4, 12.3_

- [x] 7. Integrate capacity gating into `MovePlanner`
  - Filter infeasible nodes before suitability scoring.
  - Add `insufficient_capacity` target-state degradation reason.
  - Emit capacity filter diagnostics for placement decisions.
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 11.3_

- [x] 8. Extend table/message-group policy model for storage constraints
  - Add storage-related placement constraint keys.
  - Implement centralized policy validation and merge behavior.
  - Expose effective constraints through existing policy read paths.
  - _Requirements: 6.1, 6.3, 6.4, 6.5_

- [x] 9. Add split/merge capacity preflight integration
  - Apply admission preflight for split-derived replica creation.
  - Implement split deferral with capacity reason codes.
  - Ensure merge eligibility remains available under pressure.
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [x] 10. Implement pressure-state behavior hooks
  - Add behavior for `soft`, `hard`, and `exhausted` states in move selection.
  - Gate non-critical storage-increasing operations by pressure state.
  - Emit transition logs/metrics.
  - _Requirements: 8.2, 8.3, 8.5_

- [x] 11. Wire bootstrap/join ownership boundaries
  - Integrate budget resolution into shared startup setup sequence.
  - Preserve existing startup owner boundaries and lifecycle semantics.
  - Add explicit startup diagnostics for budget source and value.
  - _Requirements: 9.1, 9.2, 9.4, 9.5, 11.1_

- [x] 12. Add observability and admin diagnostics
  - Add metrics for budget/used/reserved/available bytes and pressure state.
  - Add structured logs for admission and reservation lifecycle.
  - Add admin/CLI support for reservation and capacity snapshot visibility.
  - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

- [x] 13. Implement migration/backfill rollout behavior
  - Add deterministic backfill for existing node budget rows.
  - Support observe mode and enforce mode transition.
  - Remove legacy non-admission path in enforce mode.
  - _Requirements: 12.2, 12.4, 12.5_

- [x] 14. Add ownership and regression tests
  - Add tests asserting no bypass path for admission or reservation logic.
  - Add tests asserting `MovePlanner` remains single planning owner.
  - Add tests asserting coordinator-owned lifecycle with delegated reservation
    APIs.
  - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 13.5_

- [x] 15. Add functional test coverage
  - Unit tests for estimator/admission/pressure transitions/reservations.
  - Property tests for no-overcommit and accounting invariants (`numRuns: 10`).
  - Integration tests for join/bootstrap, low-space rejection, split deferral,
    critical replacement, and reconciliation.
  - _Requirements: 13.1, 13.2, 13.3, 13.4_

- [x] 16. Update architecture and operator documentation
  - Update `.kiro/steering/architecture.md` with storage-capacity ownership and
    flow.
  - Update relevant operator docs for configuration and diagnostics.
  - Verify traceability between tasks and requirements.
  - _Requirements: 14.1, 14.2, 14.3, 14.4_

- [x] 17. Final verification checkpoint
  - Run targeted policy/rebalancer/bootstrap/join/split integration tests.
  - Confirm admission/reservation no-bypass guarantees via code search + tests.
  - Mark tasks complete only when enforce-mode path is validated end-to-end.
  - _Requirements: 3.5, 11.5, 13.1, 13.2, 13.3, 13.4_

## Notes

- Keep disk usage scoring as a secondary heuristic, not the hard gate.
- Admission and reservation logic must remain single-path and owner-delegated.
- Do not add duplicate capacity caches outside existing SQL/cache ownership.
