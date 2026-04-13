# Implementation Plan: Node Boot/Join/Rebalance Maintainability

## Overview

This plan executes a structural refactor of bootstrap, join, and rebalancer
owners while preserving runtime behavior. Work is sequenced to lock behavior
first, then extract/simplify in low-risk increments.

## Phase 1: Characterization And Guardrails

- [x] 1. Add characterization tests for seed/join phase event ordering
  - Extend or add tests to lock emitted phase start/complete/fail ordering for
    bootstrap and join startup paths.
  - _Requirements: 1.5, 4.3, 9.2_
  - _Design: D2.1, D5.3, D11.1_

- [x] 2. Add failing tests for join startup plan segment contract
  - Add coverage for required named segments and fast-fail behavior when
    segment definitions are missing.
  - _Requirements: 3.1, 3.3, 9.2_
  - _Design: D4.1, D4.3, D11.1_

- [x] 3. Add failing tests for join checkpoint progression using named segments
  - Lock expected checkpoint behavior and resume semantics without positional
    phase slicing.
  - _Requirements: 3.2, 3.4, 9.2_
  - _Design: D4.2, D10, D11.1_

- [x] 4. Add failing lifecycle parity tests for join sub-phase transitions
  - Assert join phase execution updates lifecycle sub-phases and preserves final
    READY transition semantics.
  - _Requirements: 4.1, 4.2, 4.4, 9.2_
  - _Design: D5.1, D5.2, D11.1_

- [x] 5. Add cleanup ownership/order regression tests for seed and join
  - Lock cleanup step ordering, best-effort behavior, and result/error shape.
  - _Requirements: 2.2, 2.4, 2.5, 9.2_
  - _Design: D3.1, D3.3, D11.1_

- [x] 6. Add readiness-policy equivalence tests for rebalancer decisions
  - Prove readiness outcomes remain equivalent after policy-owner adoption,
    including transport queue and ping paths.
  - _Requirements: 5.1, 5.2, 5.3, 9.2_
  - _Design: D6.1, D6.2, D11.1_

- [x] 7. Add dependency wiring regression tests in partition/rebalancer path
  - Lock initialization gates and coordinator rebinding behavior before
    dependency refactor.
  - _Requirements: 7.1, 7.3, 7.4, 9.2_
  - _Design: D8.1, D8.3, D11.1_

- [x] 8. Add entrypoint startup/shutdown parity tests for seed and join
  - Lock ordering and side effects for runtime wiring, admin startup, and
    graceful shutdown choreography.
  - _Requirements: 8.3, 8.4, 9.2_
  - _Design: D9.1, D9.2, D11.1_

## Phase 2: Orchestrator Slimming

- [x] 9. Introduce concern-scoped delegate bundles in `BootstrapService`
  - Split the monolithic seed delegate map into concern bundles consumed by
    phase/readiness/cleanup owners.
  - _Requirements: 1.1, 1.4_
  - _Design: D2.2, D2.3_

- [x] 10. Remove bootstrap wrapper-only forwarding surface
  - Collapse or delete wrapper-only methods that only pass through to extracted
    phase/cleanup owners while preserving public compatibility where required.
  - _Requirements: 1.3, 1.5_
  - _Design: D2.3, D11.2_

- [x] 11. Introduce concern-scoped delegate bundles in `NodeJoiningService`
  - Segment delegate ownership for join phases, readiness, cleanup, and runtime
    wiring.
  - _Requirements: 1.2, 1.4_
  - _Design: D2.2, D2.3_

- [x] 12. Remove join readiness wrapper-only method block
  - Replace large pass-through wrappers with direct owner calls or compact
    compatibility adapters.
  - _Requirements: 1.3, 1.5_
  - _Design: D2.3, D11.2_

## Phase 3: Cleanup Ownership Unification

- [x] 13. Deduplicate cleanup constants and ordering ownership
  - Remove duplicate cleanup-step ordering/index definitions from
    `BootstrapService` and keep one canonical definition in cleanup owner.
  - _Requirements: 2.1, 2.3_
  - _Design: D3.1_

- [x] 14. Enforce one active seed cleanup execution path
  - Choose and implement a single cleanup orchestration contract for seed
    bootstrap flow (handler-owned or pipeline-owned) and retire parallel path.
  - _Requirements: 2.2, 2.5_
  - _Design: D3.2, D10_

- [x] 15. Align seed/join cleanup diagnostics shape
  - Standardize cleanup summary payload fields and logging keys across seed and
    join cleanup owners.
  - _Requirements: 2.4, 9.2_
  - _Design: D3.3, D11.1_

## Phase 4: Join Plan And Lifecycle Parity

- [x] 16. Add named segment support to `createJoinStartupPlan`
  - Introduce explicit segment groups and keep existing phase semantics.
  - _Requirements: 3.1, 3.4_
  - _Design: D4.1, D4.2_

- [x] 17. Replace join checkpoint `slice(...)` usage with named segments
  - Update `runJoinInfrastructurePhases` and `buildJoinCheckpointSteps` to use
    named segments and explicit phase IDs.
  - _Requirements: 3.2, 3.4_
  - _Design: D4.2, D10_

- [x] 18. Add join plan segment validator and fail-fast checks
  - Implement plan validation guard and wire it into join startup.
  - _Requirements: 3.3_
  - _Design: D4.3_

- [x] 19. Add centralized join phase-to-sub-phase mapping
  - Define declarative mapping and apply transitions inside join
    `executePhase`.
  - _Requirements: 4.1, 4.4_
  - _Design: D5.1_

- [x] 20. Normalize lifecycle diagnostics payloads across seed/join
  - Ensure logs/events consistently include state, phase, sub-phase, and
    duration context.
  - _Requirements: 4.3, 9.2_
  - _Design: D5.3, D11.1_

## Phase 5: Readiness And Dependency Wiring Consolidation

- [x] 21. Adopt `node-readiness-policy` in `UnifiedRebalancer`
  - Replace duplicated readiness helpers with policy-owned readiness checks and
    thin adapters for configuration.
  - _Requirements: 5.1, 5.2, 5.4_
  - _Design: D6.1, D6.2_

- [x] 22. Preserve readiness reason observability after policy adoption
  - Map policy decisions to stable skip reasons and regression-proof logs.
  - _Requirements: 5.3, 9.2_
  - _Design: D6.3, D11.1_

- [x] 23. Introduce explicit partition rebalancer dependency bundle
  - Add one dependency bundle/builder for rebalancer/coordinator wiring in
    `PartitionService`.
  - _Requirements: 7.1, 7.4_
  - _Design: D8.1, D8.2_

- [x] 24. Centralize coordinator rebind path for partition/rebalancer
  - Implement one canonical API for coordinator replacement and dependent
    rebinding with diagnostics.
  - _Requirements: 7.2, 7.3_
  - _Design: D8.2, D8.3_

## Phase 6: RebalanceCoordinator Decomposition

- [x] 25. Extract `ReplicaOperationRepository` from coordinator internals
  - Move SQL/cache access and operation row translation to repository owner.
  - _Requirements: 6.1, 6.4_
  - _Design: D7.1, D7.3_

- [x] 26. Extract `OperationWorkflowOwner` from coordinator internals
  - Move single-flight owner-key execution and transition advancement logic to
    dedicated workflow owner.
  - _Requirements: 6.2, 6.4_
  - _Design: D7.1, D7.3_

- [x] 27. Extract admission/readiness synthesis policy
  - Move provisioning admission and readiness gating composition to dedicated
    policy owner used by the coordinator facade.
  - _Requirements: 6.3, 6.4_
  - _Design: D7.1, D7.2_

- [x] 28. Keep `RebalanceCoordinator` as compatibility facade
  - Preserve external method contract while delegating to extracted components.
  - _Requirements: 6.4, 6.5_
  - _Design: D7.2, D11.2_

## Phase 7: Entrypoint Composition Refactor

- [x] 29. Extract shared readiness-listener wiring helpers
  - Deduplicate readiness transition/blocked-duration logging setup for seed
    and join paths.
  - _Requirements: 8.1, 8.2_
  - _Design: D9.1, D9.2_

- [x] 30. Extract shared runtime composition helpers
  - Deduplicate bootstrap API hydration, SQL engine/split-manager setup, admin
    startup, and logs persistence startup logic.
  - _Requirements: 8.1, 8.3_
  - _Design: D9.1, D9.2_

- [x] 31. Extract shared shutdown choreography helper
  - Deduplicate drain/publish-shutdown/logs-stop/dynamic-config-stop/API-stop
    sequence while preserving owner-specific calls.
  - _Requirements: 8.1, 8.3, 8.4_
  - _Design: D9.1, D9.2_

- [x] 32. Refactor `main()` to use seed/join branch composition functions
  - Keep high-level branching in `main` and delegate branch internals to
    explicit helper entrypoints.
  - _Requirements: 8.2, 8.4_
  - _Design: D9.3_

## Phase 8: Verification And Traceability Closure

- [x] 33. Run targeted suites for bootstrap/join/rebalancer/partition/index
  - Execute focused tests for modified boundaries and ensure characterization
    tests pass after refactor.
  - _Requirements: 9.2, 9.3_
  - _Design: D10, D11.3_

- [x] 34. Run full regression suite
  - Executed the repository's staged full non-harness regression workflow and
    confirmed all shards passed: fast non-harness, `test:integration:1`,
    `test:integration:2`, `test:integration:3`, `test:bootstrap:1`, and
    `test:bootstrap:2`.
  - Evidence: `.tmp/nonharness-full-20260321-083131.log` and recorded shard
    results (`fast 24839/24839`, `bootstrap:2 1355/1355`, all staged commands
    exit `0`).
  - _Requirements: 9.3_
  - _Design: D10, D11.3, D12_

- [x] 35. Publish requirement-to-task completion matrix
  - Added `closure-matrix.md` mapping each requirement to design sections,
    completed tasks, implementation evidence, and validating tests.
  - _Requirements: 9.1, 9.4_
  - _Design: D10, D11, D12_
