# Requirements Document

## Introduction

This spec defines the execution-model upgrade required for proper multi-partition
and multi-table SQL operation in the distributed SQL layer. The parser and
PG-compat translation layer are already in place; this spec focuses on planning,
routing, execution, merge semantics, distributed writes, and transactional
correctness across partitions and tables.

This is a central system capability. The final state must have one canonical
planning and execution path with no legacy fallback branches.

## Glossary

- **SqlCore**: `SQLQueryEngine`, the owning SQL orchestration entrypoint.
- **Planner**: single owner that builds logical and physical distributed plans.
- **Table_Access_Plan**: partition and predicate plan for one table alias.
- **Execution_Coordinator**: owner that executes physical plan fragments across
  partitions and nodes.
- **Merge_Stage**: owner that merges fragment results into SQL-correct final
  result sets.
- **Write_Coordinator**: owner for distributed INSERT/UPDATE/DELETE planning and
  execution.
- **Transaction_Coordinator**: owner for transaction lifecycle and commit
  protocol.
- **Participant_Partition**: partition enlisted in a distributed transaction.
- **Plan_Diagnostics**: structured, query-scoped decision and performance trace.

## Requirements

### Requirement 1: Single Distributed SQL Path

**User Story:** As a maintainer, I want one planning and execution path for
all distributed SQL queries, so correctness and behavior are deterministic.

#### Acceptance Criteria

1. SqlCore SHALL dispatch all SQL statements through one canonical planner and
   execution coordinator.
2. The system SHALL not keep parallel "legacy" execution branches for
   multi-partition or multi-table queries.
3. Query planning ownership SHALL be explicit and singular.
4. Query execution ownership SHALL be explicit and singular.

### Requirement 2: Multi-Table Partition Planning

**User Story:** As a query engine developer, I want partition planning for every
table in a query, so joins and set operations execute on complete input sets.

#### Acceptance Criteria

1. The planner SHALL resolve partition sets for the primary table and all joined
   tables.
2. The planner SHALL support table aliases and derived tables in partition
   planning.
3. The planner SHALL produce a per-table `Table_Access_Plan`.
4. The execution coordinator SHALL consume the multi-table partition plan
   without ad-hoc partition discovery.

### Requirement 3: Parameter-Aware Partition Pruning

**User Story:** As an operator, I want parameterized SQL to prune partitions
correctly, so performance and routing remain accurate under prepared statements.

#### Acceptance Criteria

1. Partition pruning SHALL support bound parameters, not only literals.
2. Pruning SHALL support equality, range, `IN`, and `BETWEEN` predicates over
   partition keys.
3. Composite partition keys SHALL be supported for pruning and write routing.
4. When predicates are not safely prunable, the planner SHALL fall back to
   explicit scatter-gather in the canonical plan, not via alternate code paths.

### Requirement 4: Join Strategy Planning

**User Story:** As a platform engineer, I want explicit join strategy planning,
so cross-partition and cross-table joins are correct and scalable.

#### Acceptance Criteria

1. The planner SHALL select a join strategy per join edge (broadcast, repartition,
   or nested-loop fallback).
2. Strategy selection SHALL use available metadata (partition cardinality,
   estimated row counts, and key distribution hints when present).
3. The execution coordinator SHALL execute the selected strategy without bypassing
   planner decisions.
4. Join semantics SHALL preserve SQL NULL and outer-join behavior.

### Requirement 5: Predicate and Projection Pushdown

**User Story:** As a performance engineer, I want pushdown planning, so remote
fragments transfer only needed rows and columns.

#### Acceptance Criteria

1. The planner SHALL compute table-local predicate pushdown where safe.
2. The planner SHALL compute projection pushdown for each fragment.
3. Table-local filters SHALL be separated from post-join global filters.
4. Pushdown decisions SHALL be visible in plan diagnostics.

### Requirement 6: Global Relational Semantics

**User Story:** As a SQL user, I want distributed queries to preserve SQL
semantics, so results match expected relational behavior.

#### Acceptance Criteria

1. Global `ORDER BY`, `LIMIT`, and `OFFSET` SHALL be applied over merged
   datasets, not per-partition approximations.
2. `DISTINCT` SHALL apply globally across fragment results.
3. `HAVING` SHALL evaluate after global grouping/aggregation steps.
4. Result determinism SHALL be preserved for equivalent input and plan.

### Requirement 7: Aggregate and Group Semantics Across Partitions

**User Story:** As an analytics user, I want aggregates to be correct across all
partitions, so distributed totals and groups are accurate.

#### Acceptance Criteria

1. `COUNT`, `SUM`, `AVG`, `MIN`, and `MAX` SHALL be correct across partition
   boundaries.
2. `GROUP BY` SHALL merge groups globally, not only within local fragments.
3. Aggregate planning SHALL support partial/local and final/global phases.
4. Empty-input aggregate behavior SHALL match SQL semantics.

### Requirement 8: CTE and Set-Operation Execution Semantics

**User Story:** As a SQL user, I want CTEs and set operations to execute
correctly in distributed mode, so complex queries behave as expected.

#### Acceptance Criteria

1. CTE execution SHALL be planned and materialized/reused according to query
   scope in one canonical path.
2. `UNION`, `UNION ALL`, `INTERSECT`, and `EXCEPT` SHALL execute with global
   dedupe/merge semantics where required.
3. Derived-table execution SHALL preserve alias scoping and column identity.
4. These constructs SHALL not route through special-case legacy handlers.

### Requirement 9: Distributed Write Planning

**User Story:** As an application developer, I want writes to target correct
partitions across multi-row and multi-key inputs.

#### Acceptance Criteria

1. INSERT routing SHALL support literal and parameterized partition-key values.
2. Multi-row INSERT SHALL route rows to all applicable partitions in one
   canonical write plan.
3. UPDATE/DELETE planning SHALL resolve all affected partitions from predicates.
4. Write routing SHALL support composite partition keys.

### Requirement 10: RETURNING Semantics for Distributed Writes

**User Story:** As an application developer, I want `RETURNING` to work
correctly for multi-partition writes, so I can consume affected rows directly.

#### Acceptance Criteria

1. INSERT/UPDATE/DELETE with `RETURNING` SHALL merge returned rows from all
   affected partitions.
2. `RETURNING *` and projected `RETURNING` column lists SHALL be supported.
3. Returned row sets SHALL preserve SQL-visible values and column names.
4. Affected row counts SHALL reflect all successful partition participants.

### Requirement 11: Transaction Model for Multi-Partition Writes

**User Story:** As a database operator, I want explicit transaction behavior for
multi-partition writes, so commit semantics are safe and predictable.

#### Acceptance Criteria

1. The system SHALL expose one explicit transaction model for distributed writes:
   full distributed commit protocol support.
2. Participant partitions SHALL be enlisted explicitly and committed atomically.
3. Commit/rollback behavior SHALL be deterministic under retries and leader
   changes.
4. Transaction state SHALL be recoverable after coordinator restart.

### Requirement 12: Failure Semantics, Retry, and Idempotency

**User Story:** As an SRE, I want predictable distributed failure handling, so
partial failures do not silently corrupt query correctness.

#### Acceptance Criteria

1. Read queries SHALL have explicit policy for partial partition failure
   (fail-closed by default unless query policy states otherwise).
2. Distributed writes SHALL be idempotent across retry attempts.
3. Retry behavior SHALL use bounded backoff and preserve operation identity.
4. User-visible error reporting SHALL include failed partition/service context.

### Requirement 13: Scalability and Resource Control

**User Story:** As a platform engineer, I want high-partition queries to scale
without correctness loss.

#### Acceptance Criteria

1. Partition parallelism limits SHALL be enforced without dropping partitions.
2. Coordinator execution SHALL process large partition sets in deterministic
   batches/chunks.
3. Memory-bound queries SHALL use streaming/chunked merge strategies.
4. Resource limit decisions SHALL be visible in diagnostics.

### Requirement 14: Observability and Explainability

**User Story:** As an operator, I want deep visibility into distributed SQL
planning and execution, so production issues are diagnosable.

#### Acceptance Criteria

1. The system SHALL emit plan diagnostics for partition pruning, join strategy,
   pushdown, and merge decisions.
2. Query telemetry SHALL include per-partition execution outcomes and timings.
3. Write telemetry SHALL include participant partition lists and retry events.
4. Explain/diagnostic output SHALL use the canonical planner state, not inferred
   after execution.

### Requirement 15: Distributed SQL Test Coverage

**User Story:** As a maintainer, I want strong test coverage for distributed SQL
semantics, so regressions are caught early.

#### Acceptance Criteria

1. The test harness SHALL include integration scenarios for multi-table joins
   across multiple partitions and nodes.
2. The test harness SHALL include distributed write scenarios with RETURNING and
   retry/idempotency.
3. Property tests SHALL validate key semantic invariants under randomized
   partition layouts.
4. Tests SHALL exercise planner, coordinator, and merge behavior end-to-end.

### Requirement 16: Hard Cutover and Legacy Removal

**User Story:** As an architect, I want a total cutover, so the SQL layer does
not retain conflicting distributed execution semantics.

#### Acceptance Criteria

1. Legacy ad-hoc distributed planning/execution branches SHALL be removed once
   canonical components are in place.
2. Deprecated distributed SQL code paths SHALL not remain behind runtime flags.
3. All distributed SQL tests SHALL run only against the canonical path.
4. Architecture documentation SHALL describe only the final ownership model.
