# Implementation Plan: Node Boot/Join Rebalance Hardening

## Overview

This plan executes architecture hardening in test-first phases:

1. Reproduce high-risk defects with failing tests.
2. Implement transactional handoff + routing correctness.
3. Wire message-group rebalancing end-to-end.
4. Enforce durable epoch and strict readiness/hydration gates.
5. Consolidate runtime lifecycle paths.

## Tasks

- [x] 1. Add failing integration test for MOVE_REPLICA handoff ownership
  - Create `test/integration/move-replica-handoff.integration.test.js`
  - Assert source replica is explicitly removed/stopped before final metadata commit
  - Assert exactly one active `services` owner after handoff
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 1.1 Add failing test for post-handoff peer address convergence
  - Extend `test/integration/move-replica-handoff.integration.test.js`
  - Assert peer resolution routes to the new node after handoff commit
  - _Requirements: 2.1, 2.2, 2.4_

- [x] 2. Implement transactional MOVE_REPLICA Handoff_Operation
  - Add explicit phase orchestration and persistence in handoff flow
  - Integrate source REMOVE_REPLICA call and completion handling
  - Enforce commit ordering and failure-state invariants
  - _Requirements: 1.1, 1.2, 1.4, 1.5_

- [x] 3. Implement topology-accurate peer resolution
  - Limit `peerAddresses` to bootstrap-hint scope
  - Use cache-backed service address resolution for steady state
  - Add refresh/invalidation when service location changes
  - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [x] 4. Add failing unit test for CREATE_SELF_HOSTED registration completeness
  - Create `test/bootstrap/create-self-hosted-registration.test.js`
  - Assert `message_groups` and per-replica `services` rows are created
  - Assert join fails when required upserts fail
  - _Requirements: 3.1, 3.2, 3.3_

- [x] 5. Implement CREATE_SELF_HOSTED metadata registration completion
  - Persist group metadata and all replica service metadata in join path
  - Make registration success mandatory for join success
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 6. Add failing test for message-group rebalancer runtime wiring
  - Create `test/rebalancer/message-group-rebalancer-wiring.test.js`
  - Assert message-group leaders instantiate UnifiedRebalancer
  - Assert replica discovery uses `services` rows for `message_group`
  - _Requirements: 4.1, 4.2_

- [x] 6.1 Add failing integration test for message-group operation routing
  - Create `test/rebalancer/message-group-operation-routing.integration.test.js`
  - Assert coordinator/dispatch sends message-group operations to correct handler
  - _Requirements: 4.3, 4.4_

- [x] 7. Implement message-group rebalancer operation model and wiring
  - Add canonical entity fields to operation flow (`entity_type`, `entity_id`)
  - Update coordinator queries, writes, and dispatch logic
  - Wire message-group rebalancer initialization in runtime startup paths
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [x] 8. Add failing integration test for epoch durability/propagation
  - Create `test/cdc/current-epoch-propagation.integration.test.js`
  - Assert authoritative epoch is persisted at `config.current_epoch`
  - Assert CDC-driven epoch apply on non-origin nodes
  - _Requirements: 5.1, 5.4, 5.5_

- [x] 9. Implement durable epoch CAS + CDC runtime wiring
  - Persist and read epoch via `config.current_epoch`
  - Wire `setEpochManager(...)` in seed and join runtime paths
  - Enforce CAS on proposal and stale-epoch rejection on apply
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [x] 10. Add failing readiness gate test for missing leader addresses
  - Create `test/bootstrap/system-leader-readiness-address-gate.test.js`
  - Assert bootstrap/join waiters remain blocked on missing addresses
  - _Requirements: 6.1, 6.4_

- [x] 10.1 Add failing hydration strictness test
  - Create `test/bootstrap/cache-hydration-strictness.test.js`
  - Assert incomplete required hydration fails hard and blocks mode swap
  - _Requirements: 6.2, 6.3_

- [x] 11. Implement strict readiness/hydration gates
  - Centralize missing-leader counting including address categories
  - Convert warn-only hydration verification to fail-fast for required tables
  - Gate writer/routing mode swap on strict pass
  - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [x] 12. Add failing runtime-consolidation test coverage
  - Extend `test/node/node-lifecycle-state-machine.test.js`
  - Add/extend CDC wiring tests to verify active runtime path is instantiated
  - _Requirements: 7.1, 7.2, 7.3_

- [x] 13. Implement runtime-path consolidation
  - Converge node-state enum usage to one runtime source
  - Remove or integrate dead duplicate phase/event-handler paths
  - Ensure single active CDC node-state trigger path for rebalancing
  - _Requirements: 7.1, 7.2, 7.3_

- [x] 14. Update architecture and spec traceability docs
  - Update `.kiro/steering/architecture.md` with final control-plane flow
  - Add requirement-to-test mapping section in this spec folder
  - _Requirements: 1-7_

- [x] 15. Checkpoint: run targeted tests for changed areas
  - Run bootstrap, rebalancer, cdc, and new integration tests only
  - Ensure no unit test exceeds 2s and no integration test exceeds 30s
  - _Requirements: All_

- [x] 16. Final checkpoint: run full suite
  - Run `npm test`
  - Confirm all new failing tests now pass with fixes
  - _Requirements: All_

## Phase B: Overlap and Contradiction Elimination

- [x] 17. Create architecture overlap matrix and contradiction register
  - Add single-owner concern matrix with explicit remove/merge/guard decisions
  - Add contradiction register linked to observed runtime failures
  - _Requirements: 6.1, 6.2, 7.1, 7.2_

- [x] 18. Add failing test for atomic dispatch claim
  - New test proving repeated CDC/trigger events dispatch one operation once
  - Assert only one successful `PENDING -> SENDING` claim per operation
  - _Requirements: 1.5, 4.4, 7.3_

- [x] 19. Implement atomic dispatch claim in ReplicaDispatchService
  - Gate dispatch on compare-and-set style workflow step claim
  - Ensure non-claiming contenders exit without side effects
  - _Requirements: 1.5, 4.4, 7.3_

- [x] 20. Add failing learner-safety integration test for critical partitions
  - Reproduce source REMOVE occurring before replacement is voter-ready
  - Assert source REMOVE is blocked until replacement is non-learner and routable
  - _Requirements: 1.2, 6.1, 6.3_

- [x] 21. Implement learner-safe ADD completion and REMOVE gating
  - Prevent ADD from completing on learner-only readiness
  - Enforce coordinator safety guard for critical system partition REMOVE
  - _Requirements: 1.2, 6.1, 6.3_

- [x] 22. Add failing test for planner single-path enforcement
  - Assert unified rebalancer planning delegates to one planner implementation
  - Assert target-node wrapping logic is not used in runtime path
  - _Requirements: 4.2, 7.2_

- [x] 23. Remove duplicated planner logic from UnifiedRebalancer
  - Use MovePlanner as the sole planning path
  - Delete or fully retire duplicated placement methods
  - _Requirements: 4.2, 7.2_

- [x] 24. Add failing integration test for leader-routable system writes under rebalance
  - Reproduce no-leader write failures during node join rebalance
  - Assert system writes remain routable across rebalance transitions
  - _Requirements: 6.1, 6.2, 6.3_

- [x] 25. Unify write routing leader source to services table path
  - Restrict write routing to system-table-backed leader resolution
  - Keep node-local leader directory as non-authoritative hint only (if retained)
  - _Requirements: 6.1, 7.1, 7.2_

- [x] 26. Add shared readiness policy and adopt across dispatch/rebalancer
  - Remove drift between multiple node readiness checks
  - Assert consistent readiness decisions in unit/integration coverage
  - _Requirements: 6.1, 6.4, 7.1_

- [x] 27. Consolidate rebalance trigger ownership post-bootstrap
  - Ensure one canonical runtime trigger path after bootstrap window
  - Add dedupe assertions for node-ready transition handling
  - _Requirements: 7.2, 7.3_

- [x] 28. Phase B checkpoint: run targeted tests for contradiction register
  - Run new overlap tests + affected bootstrap/rebalancer/integration suites
  - Verify CR-001..CR-005 have explicit passing coverage
  - _Requirements: All_

## Phase C: Single-Owner Runtime Path Cleanup

- [x] 29. Add failing guard tests for remaining overlap surfaces
  - Add query-routing test proving NodeService leader hints cannot override services table routing
  - Add coordinator readiness test proving non-ACTIVE nodes are not routable
  - Add single-owner test proving duplicate join query-state module path is removed
  - _Requirements: 6.1, 6.4, 7.1, 7.2_

- [x] 30. Remove node-local partition leader hint path from query routing
  - Delete QueryExecutor NodeService leader candidate path
  - Delete NodeService partition leader directory methods/state
  - Remove partition service writes to NodeService leader directory
  - _Requirements: 6.1, 7.1, 7.2_

- [x] 31. Adopt shared readiness policy in RebalanceCoordinator
  - Replace coordinator-local readiness checks with shared readiness predicate
  - Enforce ACTIVE + READY lease policy parity with dispatch/rebalancer
  - _Requirements: 6.1, 6.4, 7.1_

- [x] 32. Remove duplicate join query-state phase path
  - Delete unused legacy `QueryStatePhase` module and exports
  - Remove obsolete tests tied to duplicate runtime ownership
  - Keep join query-state ownership in `NodeJoiningService.phaseQuerySystemState`
  - _Requirements: 7.1, 7.2_

- [x] 33. Phase C checkpoint: run targeted regression suites
  - Query routing + readiness + bootstrap join gate tests
  - Node service + partition service + coordinator dedup regression tests
  - _Requirements: All_
