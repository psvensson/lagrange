# Implementation Plan: Distributed SQL Multi-Partition and Multi-Table Operations

## Overview

This plan upgrades distributed SQL execution to a single canonical path with:

1. full multi-table partition planning
2. parameter-aware pruning and routing
3. global merge semantics
4. distributed write and transaction coordination
5. hard cutover with no legacy distributed SQL path

## Mandatory Delivery Rules

1. Every correctness fix begins with a failing test that reproduces the gap.
2. No skipped tests and no fallback execution branches.
3. Property tests use `{numRuns: 10}`.
4. Unit tests remain under 2 seconds unless explicitly integration scope.

## Tasks

- [x] 1. Establish baseline failing tests for known distributed SQL gaps
  - [x] 1.1 Add failing integration test: multi-table join across partitions
    through `SQLQueryEngine` without external `joinPartitions` wiring.
    - _Requirements: 1.1, 2.1, 4.1, 15.1_
  - [x] 1.2 Add failing test: parameterized partition pruning for SELECT with
    `$1`/`?` key predicates.
    - _Requirements: 3.1, 3.2, 15.3_
  - [x] 1.3 Add failing test: large partition set executes all partitions
    (no truncation at max parallel limit).
    - _Requirements: 13.1, 13.2, 15.3_
  - [x] 1.4 Add failing test: distributed read fails closed on required
    participant failure.
    - _Requirements: 12.1, 15.3_
  - [x] 1.5 Add failing test: multi-partition UPDATE/DELETE failure is surfaced
    in result status.
    - _Requirements: 9.3, 12.4, 15.2_

- [x] 2. Introduce canonical distributed planner contracts
  - [x] 2.1 Add planner constants/types for `DistributedQueryPlan`,
    `TableAccessPlan`, `FragmentPlan`, and `MergePlan`.
    - _Requirements: 1.1, 2.3, 6.1_
  - [x] 2.2 Implement `DistributedQueryPlanner` skeleton with deterministic
    plan IDs and diagnostics envelope.
    - _Requirements: 1.3, 14.1, 14.4_
  - [x] 2.3 Wire `SQLQueryEngine` to call planner for SELECT/INSERT/UPDATE/DELETE.
    - _Requirements: 1.1, 9.1_

- [x] 3. Implement multi-table partition planning
  - [x] 3.1 Build table graph extraction from AST (`from`, joins, derived tables,
    CTE references as applicable).
    - _Requirements: 2.1, 2.2, 8.1_
  - [x] 3.2 Resolve partitions for each table alias into `Table_Access_Plan`.
    - _Requirements: 2.1, 2.3_
  - [x] 3.3 Remove ad-hoc join partition dependency from execution path.
    - _Requirements: 1.2, 4.3, 16.1_
  - [x] 3.4 Add planner unit/property tests for alias correctness and partition
    set completeness.
    - _Requirements: 2.4, 15.3_

- [x] 4. Implement parameter-aware and composite-key partition resolution
  - [x] 4.1 Extend partition resolver to consume bound parameter values.
    - _Requirements: 3.1, 3.2_
  - [x] 4.2 Add composite partition-key predicate support for pruning and write
    routing.
    - _Requirements: 3.3, 9.4_
  - [x] 4.3 Emit predicate-shape diagnostics (`eq`, `range`, `in`, `between`,
    `scatter`).
    - _Requirements: 3.4, 14.1_
  - [x] 4.4 Add resolver tests for literal + parameter + composite-key paths.
    - _Requirements: 3.1, 3.2, 3.3, 15.3_

- [x] 5. Promote `ParallelQueryCoordinator` to canonical fanout owner
  - [x] 5.1 Route distributed read fragment execution through coordinator only.
    - _Requirements: 1.4, 13.1_
  - [x] 5.2 Replace partition list truncation with deterministic chunked
    scheduling.
    - _Requirements: 13.1, 13.2_
  - [x] 5.3 Return per-fragment execution status for merge and error policy.
    - _Requirements: 12.1, 14.2_
  - [x] 5.4 Add coordinator tests for full partition coverage and chunk order.
    - _Requirements: 13.1, 15.3_

- [x] 6. Implement join strategy planning and execution
  - [x] 6.1 Add join strategy selector (`broadcast`, `repartition`,
    `nested_loop`) with documented thresholds.
    - _Requirements: 4.1, 4.2_
  - [x] 6.2 Implement strategy-specific execution plans in coordinator.
    - _Requirements: 4.3, 5.1, 5.2_
  - [x] 6.3 Preserve outer-join NULL semantics and qualified column identity.
    - _Requirements: 4.4, 6.4_
  - [x] 6.4 Add integration/property tests for join correctness under skew.
    - _Requirements: 4.4, 15.1, 15.3_

- [x] 7. Implement pushdown planning
  - [x] 7.1 Add table-local predicate extraction and post-join predicate
    separation.
    - _Requirements: 5.1, 5.3_
  - [x] 7.2 Add projection pushdown per fragment with required key retention.
    - _Requirements: 5.2_
  - [x] 7.3 Add diagnostics for pushdown decisions.
    - _Requirements: 5.4, 14.1_
  - [x] 7.4 Add tests that validate reduced fragment SQL shape and identical
    final semantics.
    - _Requirements: 5.1, 5.2, 6.1_

- [x] 8. Implement canonical global merge engine
  - [x] 8.1 Add `DistributedMergeEngine` wrapper over `StreamingAggregator`.
    - _Requirements: 6.1, 7.1, 13.3_
  - [x] 8.2 Enforce global evaluation order for DISTINCT, GROUP/HAVING,
    ORDER/LIMIT.
    - _Requirements: 6.1, 6.2, 6.3, 7.2_
  - [x] 8.3 Implement global set-operation merge semantics.
    - _Requirements: 8.2_
  - [x] 8.4 Add large-result tests for streaming memory bounds.
    - _Requirements: 13.3, 15.3_

- [x] 9. Implement distributed write coordinator
  - [x] 9.1 Add `DistributedWriteCoordinator` and `DistributedWritePlan`.
    - _Requirements: 9.1, 9.2_
  - [x] 9.2 Route INSERT/UPDATE/DELETE through write coordinator only.
    - _Requirements: 1.1, 9.3_
  - [x] 9.3 Merge per-partition `RETURNING` rows and affected-row counts.
    - _Requirements: 10.1, 10.2, 10.4_
  - [x] 9.4 Add write idempotency keys and retry-safe execution envelope.
    - _Requirements: 12.2, 12.3_
  - [x] 9.5 Add end-to-end distributed write tests with mixed success/failure.
    - _Requirements: 10.4, 12.4, 15.2_

- [x] 10. Implement distributed transaction coordinator
  - [x] 10.1 Add transaction state machine and participant enlistment model.
    - _Requirements: 11.2, 11.3_
  - [x] 10.2 Add system tables: `sql_transactions`,
    `sql_transaction_participants`, `sql_write_operations`.
    - _Requirements: 11.4, 14.2_
  - [x] 10.3 Implement prepare/commit/rollback participant protocol.
    - _Requirements: 11.2, 11.3_
  - [x] 10.4 Add restart recovery for in-flight distributed transactions.
    - _Requirements: 11.4, 12.3_
  - [x] 10.5 Add integration tests for distributed commit and rollback under
    participant failure and leader movement.
    - _Requirements: 11.3, 12.3, 15.2_

- [x] 11. Enforce strict failure and result semantics
  - [x] 11.1 Add canonical read failure policy (fail-closed default).
    - _Requirements: 12.1_
  - [x] 11.2 Ensure write success only when participant policy requirements are
    satisfied.
    - _Requirements: 12.4_
  - [x] 11.3 Include failed partition/service details in user-visible errors.
    - _Requirements: 12.4, 14.2_
  - [x] 11.4 Add tests for partial failure correctness on reads/writes.
    - _Requirements: 12.1, 12.4, 15.2_

- [x] 12. Observability and explainability
  - [x] 12.1 Add structured diagnostics for planner decisions and fragment
    execution outcomes.
    - _Requirements: 14.1, 14.2_
  - [x] 12.2 Add distributed SQL metrics for planning, fanout, merge, and writes.
    - _Requirements: 14.2_
  - [x] 12.3 Add `EXPLAIN DISTRIBUTED` output from canonical plan objects.
    - _Requirements: 14.4_
  - [x] 12.4 Add tests for diagnostics schema stability.
    - _Requirements: 14.1, 14.4, 15.3_

- [x] 13. Integrate split/merge lifecycle with SQL table operations
  - [x] 13.1 Wire partition split/merge manager into SQL table lifecycle path
    (policy-driven).
    - _Requirements: 9.3, 13.1_
  - [x] 13.2 Ensure planner consumes updated partition map after split/merge via
    CDC-driven cache updates.
    - _Requirements: 2.1, 13.1_
  - [x] 13.3 Add integration tests for correctness before/after split events.
    - _Requirements: 15.1, 15.2_

- [x] 14. Hard cutover: remove legacy distributed SQL paths
  - [x] 14.1 Remove deprecated ad-hoc distributed branches in
    `SQLQueryEngine` and `QueryExecutor`.
    - _Requirements: 16.1, 16.2_
  - [x] 14.2 Remove fallback flags and alternate distributed behavior toggles.
    - _Requirements: 16.2_
  - [x] 14.3 Add static checks to prevent reintroduction of banned legacy
    symbols/entrypoints.
    - _Requirements: 16.3_
  - [x] 14.4 Update architecture docs to final single-path ownership.
    - _Requirements: 16.4_

- [x] 15. Final release gates
  - [x] 15.1 Unit and property tests for planner/coordinator/merge/write/tx all
    pass.
    - _Requirements: 15.3_
  - [x] 15.2 Distributed integration suites for multi-table reads, distributed
    writes, and transaction recovery pass.
    - _Requirements: 15.1, 15.2_
  - [x] 15.3 Admin and wire-adapter level tests validate full-stack behavior.
    - _Requirements: 1.1, 15.1_
  - [x] 15.4 Legacy-path negative tests prove hard cutover completion.
    - _Requirements: 16.1, 16.3_
