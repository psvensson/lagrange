# Requirements Document

## Introduction

This document specifies the requirements for the user-facing schema migration
pipeline in Lagrange. The system already supports system table schema
definitions, schema version tracking, bootstrap schema migration, and internal
ALTER TABLE. This spec covers the remaining work: a user-facing migration
pipeline that safely evolves user table schemas across distributed partitions
using a dual-write, backfill, and cutover strategy.

Schema changes on user tables are distributed operations — every partition
replica hosting the table must apply the change. The pipeline must coordinate
ALTER TABLE execution across all partition replicas, maintain read/write
availability during migration, backfill existing data to conform to the new
schema, and atomically cut over to the new schema version once all partitions
are consistent.

## Glossary

- **Migration_Pipeline**: The end-to-end orchestration component that drives a
  user table schema change through planning, dual-write, backfill, and cutover
  stages.
- **Migration_Coordinator**: The single owner component that persists migration
  workflow state, advances stage transitions, and coordinates partition-level
  migration operations. Composes `DurableWorkflowCoordinator` for durable
  monotonic step transitions.
- **Migration_Record**: A durable row in the `schema_migrations` system table
  that tracks the lifecycle of one schema migration from creation to terminal
  state.
- **Partition_Migration_Record**: A durable row in the
  `schema_migration_partitions` system table that tracks per-partition
  migration progress within a migration.
- **Schema_Version**: An HLC-stamped identifier that uniquely identifies a
  table schema revision. Tracked in the `tables` system table
  `schema_definition` field.
- **Dual_Write_Stage**: The migration stage where writes are applied to both
  old and new schema columns so that new columns receive data from new writes
  while the backfill populates historical rows.
- **Backfill_Stage**: The migration stage where existing rows are scanned and
  updated to conform to the new schema (populating defaults, transforming
  data).
- **Cutover_Stage**: The migration stage where the table schema version is
  atomically advanced to the new version across all partitions via
  `DistributedTransactionCoordinator`.
- **SqlCore**: `SQLQueryEngine`, the single SQL planner and executor. All
  schema migration SQL flows through SqlCore.
- **CDC_Pipeline**: The Change Data Capture pipeline that propagates system
  table mutations to `SystemTableCache` on all nodes.
- **Partition_Service**: The Raft-backed partition replica that owns local
  SQLite storage and executes ALTER TABLE statements.
- **SystemTableCache**: The single read-only cache of CDC-propagated system
  metadata on each node.

## Requirements

### Requirement 1: Migration Pipeline Initiation

**User Story:** As a developer, I want to issue an ALTER TABLE statement on a
user table so that the system initiates a coordinated schema migration across
all partitions.

#### Acceptance Criteria

1. WHEN a user submits an ALTER TABLE statement through SqlCore, THE
   Migration_Pipeline SHALL parse the statement and create a Migration_Record
   with status `pending`.
2. WHEN a Migration_Record is created, THE Migration_Pipeline SHALL record the
   table identifier, the current schema version, the target schema definition,
   the migration type (add column, drop column, rename column, alter column
   type), and a creation timestamp.
3. IF a migration is already active for the same table, THEN THE
   Migration_Pipeline SHALL reject the new ALTER TABLE statement with a
   descriptive error indicating the conflicting migration identifier.
4. WHEN a Migration_Record reaches `pending` status, THE Migration_Coordinator
   SHALL enumerate all partition identifiers for the target table from
   SystemTableCache and create one Partition_Migration_Record per partition
   with status `pending`.
5. THE Migration_Pipeline SHALL support ADD COLUMN, DROP COLUMN, RENAME COLUMN,
   and ALTER COLUMN TYPE as migration types.

### Requirement 2: Dual-Write Compatibility

**User Story:** As a developer, I want the system to maintain write
availability during schema migration so that applications do not experience
downtime.

#### Acceptance Criteria

1. WHEN the Migration_Coordinator transitions a migration to the
   `dual_write` stage, THE Partition_Service SHALL execute the ALTER TABLE
   statement on each partition replica through the Raft log so that the new
   schema columns exist on all replicas.
2. WHILE a migration is in the `dual_write` stage, THE SqlCore SHALL accept
   writes using both the old schema shape (without new columns) and the new
   schema shape (with new columns).
3. WHILE a migration is in the `dual_write` stage, WHEN a write arrives
   without values for new columns that have defaults, THE Partition_Service
   SHALL apply the column default values defined in the migration.
4. WHILE a migration is in the `dual_write` stage, THE SqlCore SHALL return
   query results that include new columns with their default or null values
   for rows not yet backfilled.
5. IF a partition replica fails to apply the ALTER TABLE statement, THEN THE
   Migration_Coordinator SHALL retry the operation with exponential backoff
   and record the failure in the Partition_Migration_Record.
6. WHEN all Partition_Migration_Records for a migration reach `dual_write`
   status, THE Migration_Coordinator SHALL transition the Migration_Record
   to `dual_write_complete`.

### Requirement 3: Backfill Stage

**User Story:** As a developer, I want existing data to be automatically
updated to conform to the new schema so that queries return consistent results
after migration.

#### Acceptance Criteria

1. WHEN the Migration_Coordinator transitions a migration to the `backfill`
   stage, THE Migration_Coordinator SHALL issue backfill operations to each
   partition through SqlCore.
2. THE Migration_Coordinator SHALL execute backfill operations in batches of
   configurable size to limit resource consumption on each partition.
3. WHILE a backfill operation is in progress on a partition, THE
   Partition_Service SHALL continue serving reads and writes without blocking.
4. THE Migration_Coordinator SHALL track backfill progress per partition in
   the Partition_Migration_Record using a cursor position so that backfill
   can resume after interruption.
5. IF a backfill batch fails on a partition, THEN THE Migration_Coordinator
   SHALL retry the failed batch with exponential backoff and record the
   failure count in the Partition_Migration_Record.
6. WHEN all rows in a partition have been backfilled, THE
   Migration_Coordinator SHALL transition that Partition_Migration_Record to
   `backfill_complete`.
7. WHEN all Partition_Migration_Records for a migration reach
   `backfill_complete` status, THE Migration_Coordinator SHALL transition the
   Migration_Record to `backfill_complete`.

### Requirement 4: Cutover Stage

**User Story:** As a developer, I want the schema migration to complete
atomically so that all partitions serve the new schema version consistently.

#### Acceptance Criteria

1. WHEN the Migration_Coordinator transitions a migration to the `cutover`
   stage, THE Migration_Coordinator SHALL use
   DistributedTransactionCoordinator to atomically update the table schema
   version in the `tables` system table and transition all
   Partition_Migration_Records to `completed`.
2. WHEN the cutover transaction commits, THE Migration_Coordinator SHALL
   update the Migration_Record status to `completed` and record a completion
   timestamp.
3. IF the cutover transaction fails, THEN THE Migration_Coordinator SHALL
   roll back the transaction and keep the migration in `cutover_pending`
   status for retry.
4. WHEN a migration reaches `completed` status, THE CDC_Pipeline SHALL
   propagate the updated schema version to SystemTableCache on all nodes.
5. WHEN a migration reaches `completed` status, THE SqlCore SHALL use the
   new schema version for all subsequent query planning and execution on the
   migrated table.

### Requirement 5: Migration Lifecycle and Recovery

**User Story:** As an operator, I want schema migrations to be durable and
recoverable so that node failures do not leave the system in an inconsistent
state.

#### Acceptance Criteria

1. THE Migration_Coordinator SHALL persist all stage transitions through
   DurableWorkflowCoordinator with previous stage, next stage, reason, and
   timestamp.
2. WHEN a node hosting the Migration_Coordinator restarts, THE
   Migration_Coordinator SHALL recover in-progress migrations from
   Migration_Records and resume from the last persisted stage.
3. THE Migration_Coordinator SHALL enforce monotonic stage transitions:
   `pending` → `dual_write` → `dual_write_complete` → `backfill` →
   `backfill_complete` → `cutover_pending` → `completed`. No backward
   transitions are permitted except to `failed`.
4. IF a migration cannot make progress after a configurable retry limit, THEN
   THE Migration_Coordinator SHALL transition the Migration_Record to `failed`
   with a descriptive error message.
5. THE Migration_Coordinator SHALL use a timeout budget derived from the
   top-level operation budget for the entire migration lifecycle. Nested
   stage operations SHALL derive from remaining budget.

### Requirement 6: Migration Observability

**User Story:** As an operator, I want to monitor schema migration progress so
that I can diagnose issues and track completion.

#### Acceptance Criteria

1. THE Migration_Pipeline SHALL expose migration status through a SQL query
   on the `schema_migrations` system table, returning migration identifier,
   table name, current stage, creation timestamp, and last updated timestamp.
2. THE Migration_Pipeline SHALL expose per-partition migration progress
   through a SQL query on the `schema_migration_partitions` system table,
   returning partition identifier, current stage, backfill cursor position,
   retry count, and last error message.
3. WHEN a migration stage transition occurs, THE Migration_Coordinator SHALL
   emit a structured log entry with migration identifier, previous stage,
   next stage, and reason.

### Requirement 7: Migration System Tables

**User Story:** As a developer, I want migration state persisted in system
tables so that migration progress survives node restarts and is observable
through SQL.

#### Acceptance Criteria

1. THE Migration_Pipeline SHALL define a `schema_migrations` system table
   with columns: `migration_id` (TEXT, PRIMARY KEY), `table_id` (TEXT),
   `table_name` (TEXT), `migration_type` (TEXT), `source_schema` (TEXT),
   `target_schema` (TEXT), `status` (TEXT), `current_stage` (TEXT),
   `error_message` (TEXT), `created_at` (INTEGER), `updated_at` (INTEGER),
   `completed_at` (INTEGER).
2. THE Migration_Pipeline SHALL define a `schema_migration_partitions` system
   table with columns: `migration_id` (TEXT), `partition_id` (TEXT), `status`
   (TEXT), `backfill_cursor` (TEXT), `retry_count` (INTEGER),
   `error_message` (TEXT), `updated_at` (INTEGER), with composite primary
   key (`migration_id`, `partition_id`).
3. THE `schema_migrations` system table SHALL be classified as
   CDC-propagated so that migration status is visible on all nodes through
   SystemTableCache.
4. THE `schema_migration_partitions` system table SHALL be classified as
   CDC-non-propagated since per-partition progress is only needed by the
   Migration_Coordinator on the owning partition leader.

### Requirement 8: Migration Cancellation

**User Story:** As an operator, I want to cancel an in-progress schema
migration so that I can abort a migration that is causing issues.

#### Acceptance Criteria

1. WHEN an operator issues a cancel command for an active migration, THE
   Migration_Coordinator SHALL transition the Migration_Record to
   `cancelling`.
2. WHILE a migration is in `cancelling` status, THE Migration_Coordinator
   SHALL stop issuing new backfill batches and wait for in-flight operations
   to complete.
3. WHEN all in-flight operations for a cancelled migration have completed,
   THE Migration_Coordinator SHALL execute a rollback that reverses the
   schema change on all partitions and transition the Migration_Record to
   `cancelled`.
4. IF a migration is in the `cutover_pending` or `completed` stage, THEN THE
   Migration_Pipeline SHALL reject the cancel command because the migration
   has passed the point of safe rollback.
