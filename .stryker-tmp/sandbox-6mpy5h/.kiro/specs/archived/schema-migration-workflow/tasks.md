# Implementation Plan: Schema Migration Workflow

## Overview

Implement a coordinated, distributed schema migration pipeline for user tables.
The pipeline orchestrates ALTER TABLE through dual-write, backfill, and cutover
stages using existing workflow building blocks (DurableWorkflowCoordinator,
OperationLane, TimeoutPolicy, WorkflowStepRunner, DistributedTransactionCoordinator).
Each task builds incrementally — constants and system tables first, then the
coordinator core, then SqlCore/PartitionService integration, then cancellation,
and finally end-to-end wiring.

## Tasks

- [x] 1. Define migration constants and register system tables
  - [x] 1.1 Create `src/migration/migration-constants.js` with all migration constants
    - Define `MIGRATION_STATUS` enum (pending, dual_write, dual_write_complete, backfill, backfill_complete, cutover_pending, completed, cancelling, cancelled, failed)
    - Define `MIGRATION_TYPE` enum (add_column, drop_column, rename_column, alter_column_type)
    - Define `MIGRATION_STAGE_ORDER` array for monotonic transition enforcement
    - Define `MIGRATION_CANCELLABLE_STAGES` set
    - Define `MIGRATION_TERMINAL_STATUSES` set (completed, cancelled, failed)
    - Define `MIGRATION_DEFAULT` object (BACKFILL_BATCH_SIZE, MAX_RETRY_COUNT, RETRY_BASE_DELAY_MS, RETRY_MAX_DELAY_MS, TIMEOUT_BUDGET_MS)
    - Define `MIGRATION_LOG_MSG` and `MIGRATION_ERROR_MSG` constants for structured logging and error messages
    - Define `MIGRATION_COLUMN` constants for column name references
    - _Requirements: 1.5, 5.3, 8.1_

  - [x] 1.2 Add `SCHEMA_MIGRATIONS` and `SCHEMA_MIGRATION_PARTITIONS` to `src/constants/tables.js` TABLES constant
    - Add entries: `SCHEMA_MIGRATIONS: 'schema_migrations'`, `SCHEMA_MIGRATION_PARTITIONS: 'schema_migration_partitions'`
    - _Requirements: 7.1, 7.2_

  - [x] 1.3 Add system table schema definitions in `src/bootstrap/system-table-schemas-constants.js`
    - Add `SYSTEM_TABLE_NAME.SCHEMA_MIGRATIONS` and `SYSTEM_TABLE_NAME.SCHEMA_MIGRATION_PARTITIONS`
    - Define `SCHEMA_MIGRATIONS_SCHEMA` with columns: migration_id (TEXT PK), table_id (TEXT NOT NULL), table_name (TEXT NOT NULL), migration_type (TEXT NOT NULL), source_schema (TEXT NOT NULL), target_schema (TEXT NOT NULL), status (TEXT NOT NULL), current_stage (TEXT NOT NULL), error_message (TEXT), created_at (INTEGER NOT NULL), updated_at (INTEGER NOT NULL), completed_at (INTEGER)
    - Define indices: `idx_schema_migrations_table` on table_id, `idx_schema_migrations_status` on status
    - Define `SCHEMA_MIGRATION_PARTITIONS_SCHEMA` with columns: migration_id (TEXT NOT NULL), partition_id (TEXT NOT NULL), status (TEXT NOT NULL), backfill_cursor (TEXT), retry_count (INTEGER NOT NULL DEFAULT 0), error_message (TEXT), updated_at (INTEGER NOT NULL), with composite PK (migration_id, partition_id)
    - Define index: `idx_schema_migration_partitions_status` on (migration_id, status)
    - Add both schemas to `SYSTEM_TABLE_SCHEMAS` array
    - _Requirements: 7.1, 7.2_

  - [x] 1.4 Register CDC policies in `src/cache/cdc-table-policy.js`
    - Add `schema_migrations` entry to `SYSTEM_TABLE_CDC_POLICIES` with `internalCachePropagation: true`
    - Add `schema_migration_partitions` entry to `SYSTEM_TABLE_CDC_POLICIES` with `internalCachePropagation: false`
    - _Requirements: 7.3, 7.4_

  - [x] 1.5 Add `ALTER_TABLE` to `QUERY_AST_TYPE` in `src/query/query-constants.js`
    - Add `ALTER_TABLE: 'ALTER_TABLE'` entry
    - _Requirements: 1.1_

  - [x]* 1.6 Write unit tests for migration constants and system table registration
    - Verify `MIGRATION_STAGE_ORDER` contains all forward stages in correct order
    - Verify `MIGRATION_CANCELLABLE_STAGES` excludes cutover_pending and completed
    - Verify `schema_migrations` appears in `CDC_PROPAGATED_TABLES`
    - Verify `schema_migration_partitions` appears in `CDC_NON_PROPAGATED_TABLES`
    - Verify system table schemas match requirements column definitions
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [x] 2. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Implement MigrationCoordinator core lifecycle
  - [x] 3.1 Create `src/migration/migration-coordinator.js` with constructor and dependency wiring
    - Accept injected dependencies: sqlCore, systemTableCache, transactionCoordinator, workflowCoordinator, logger, now
    - Compose OperationLane (name: 'schema-migration', ownerKeyFactory from migrationId)
    - Compose TimeoutPolicy (operationName: 'schema_migration', configuredBudgetMs from MIGRATION_DEFAULT.TIMEOUT_BUDGET_MS)
    - Compose WorkflowStepRunner from workflowCoordinator, operationLane, timeoutPolicy
    - _Requirements: 5.1, 5.5_

  - [x] 3.2 Implement `initiateMigration(tableId, alterSpec)` in MigrationCoordinator
    - Check for active (non-terminal) migration on same table via SQL query on schema_migrations (primary-key-addressed reads)
    - Reject with conflict error if active migration exists (reference conflicting migration_id)
    - Create Migration_Record with status pending via INSERT into schema_migrations
    - Enumerate partitions for table from SystemTableCache
    - Create one Partition_Migration_Record per partition via INSERT into schema_migration_partitions
    - Register workflow with DurableWorkflowCoordinator
    - Return migration_id
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [x] 3.3 Implement monotonic stage transition enforcement
    - Validate transitions against MIGRATION_STAGE_ORDER — only forward transitions allowed
    - Allow transitions to `failed` and `cancelling` from any non-terminal stage
    - Persist transitions via DurableWorkflowCoordinator.transitionStep() with previous stage, next stage, reason, timestamp
    - Update Migration_Record status and current_stage via primary-key-addressed UPDATE
    - _Requirements: 5.1, 5.3_

  - [x] 3.4 Implement `advanceMigration(migrationId)` — dual-write stage
    - Transition migration to dual_write stage
    - For each partition: send ALTER TABLE statement via Raft log to PartitionService
    - On partition success: update Partition_Migration_Record status to dual_write (primary-key-addressed)
    - On partition failure: retry with exponential backoff, record failure in Partition_Migration_Record (retry_count, error_message)
    - When all partitions reach dual_write: transition Migration_Record to dual_write_complete
    - Derive timeout budget from remaining parent budget via TimeoutPolicy
    - _Requirements: 2.1, 2.5, 2.6, 5.5_

  - [x] 3.5 Implement `advanceMigration(migrationId)` — backfill stage
    - Transition migration to backfill stage
    - For each partition: issue batched UPDATE statements through SqlCore
    - Enforce batch size from MIGRATION_DEFAULT.BACKFILL_BATCH_SIZE
    - Track cursor position in Partition_Migration_Record.backfill_cursor (primary-key-addressed UPDATE)
    - On batch failure: retry with exponential backoff, increment retry_count
    - When partition fully backfilled (no more rows beyond cursor): transition Partition_Migration_Record to backfill_complete
    - When all partitions reach backfill_complete: transition Migration_Record to backfill_complete
    - Derive timeout budget from remaining parent budget
    - _Requirements: 3.1, 3.2, 3.4, 3.5, 3.6, 3.7, 5.5_

  - [x] 3.6 Implement `advanceMigration(migrationId)` — cutover stage
    - Transition migration to cutover_pending stage
    - Use DistributedTransactionCoordinator to atomically: UPDATE tables.schema_definition to new version AND UPDATE all Partition_Migration_Records to completed
    - On commit success: transition Migration_Record to completed, set completed_at timestamp
    - On commit failure: rollback, stay in cutover_pending, retry
    - On retry exhaustion: transition to failed with error message
    - _Requirements: 4.1, 4.2, 4.3, 5.4_

  - [x] 3.7 Implement `recoverMigrations()` for restart recovery
    - Query schema_migrations for non-terminal Migration_Records
    - For each: load current stage, resume advanceMigration from that stage
    - Use OperationLane to ensure single-flight per migration
    - Do not re-execute completed stages
    - _Requirements: 5.2_

  - [x]* 3.8 Write property test: Migration record creation completeness (Property 1)
    - **Property 1: Migration record creation completeness**
    - Generate random valid ALTER specs, verify record contains table_id, schema version, target schema, valid migration type, status pending, creation timestamp
    - **Validates: Requirements 1.1, 1.2**

  - [x]* 3.9 Write property test: Active migration exclusion (Property 2)
    - **Property 2: Active migration exclusion**
    - Generate random table IDs with pre-existing active migration, verify rejection with conflicting migration_id
    - **Validates: Requirements 1.3**

  - [x]* 3.10 Write property test: Partition migration record enumeration (Property 3)
    - **Property 3: Partition migration record enumeration**
    - Generate random partition counts (1-20), verify exactly N Partition_Migration_Records created
    - **Validates: Requirements 1.4**

  - [x]* 3.11 Write property test: Monotonic stage transitions (Property 18)
    - **Property 18: Monotonic stage transitions**
    - Generate random transition sequences from MIGRATION_STATUS values, verify only forward transitions accepted and backward transitions rejected (except to failed/cancelling)
    - **Validates: Requirements 5.3**

  - [x]* 3.12 Write property test: Timeout budget derivation (Property 20)
    - **Property 20: Timeout budget derivation**
    - Generate random budget and elapsed time, verify child budget ≤ remaining parent budget, never fresh default
    - **Validates: Requirements 5.5**

  - [x]* 3.13 Write unit tests for MigrationCoordinator core
    - Test initiation with each supported migration type (add_column, drop_column, rename_column, alter_column_type)
    - Test rejection of duplicate active migration on same table
    - Test correct Partition_Migration_Record count for tables with 1, 3, and 5 partitions
    - Test recovery loads correct stage after simulated restart
    - Test retry exhaustion transitions to failed with error message
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 5.2, 5.4_

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement dual-write compatibility and backfill execution
  - [x] 5.1 Implement PartitionService handler for migration ALTER TABLE Raft log entries
    - Add handler in PartitionService for migration-related Raft log entries
    - Apply ALTER TABLE to local SQLite when receiving migration ALTER command via Raft log
    - Register column defaults in SQLite so new writes during dual-write auto-populate new columns
    - Return acknowledgement to MigrationCoordinator
    - _Requirements: 2.1, 2.3_

  - [x] 5.2 Implement dual-write schema shape acceptance in SqlCore
    - During dual_write stage: accept writes using old schema shape (without new columns) and new schema shape (with new columns)
    - Query results during dual_write include new columns with default or null values for non-backfilled rows
    - Check migration status from SystemTableCache (schema_migrations is CDC-propagated) to determine if dual-write mode is active for a table
    - _Requirements: 2.2, 2.4_

  - [x]* 5.3 Write property test: Dual-write schema shape acceptance (Property 4)
    - **Property 4: Dual-write schema shape acceptance**
    - Generate writes with/without new columns during dual_write stage, verify both accepted
    - **Validates: Requirements 2.2**

  - [x]* 5.4 Write property test: Dual-write default application (Property 5)
    - **Property 5: Dual-write default application and query inclusion**
    - Generate writes without new column values, verify defaults stored and queryable
    - **Validates: Requirements 2.3, 2.4**

  - [x]* 5.5 Write property test: Partition operation retry with backoff (Property 7)
    - **Property 7: Partition operation retry with backoff and recording**
    - Generate random failure sequences, verify retry count and backoff recording in Partition_Migration_Record
    - **Validates: Requirements 2.5, 3.5**

  - [x]* 5.6 Write property test: Aggregate partition completion triggers parent transition (Property 8)
    - **Property 8: Aggregate partition completion triggers parent transition**
    - Generate random partition counts, complete all, verify parent Migration_Record transitions to aggregate complete status
    - **Validates: Requirements 2.6, 3.7**

  - [x]* 5.7 Write property test: Backfill batch size enforcement (Property 9)
    - **Property 9: Backfill batch size enforcement**
    - Generate random row counts and batch sizes, verify each batch ≤ configured size
    - **Validates: Requirements 3.2**

  - [x]* 5.8 Write property test: Backfill cursor resumption round trip (Property 10)
    - **Property 10: Backfill cursor resumption round trip**
    - Generate random interruption points, verify cursor resumption produces same final result as uninterrupted backfill
    - **Validates: Requirements 3.4**

- [x] 6. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Implement cutover, cancellation, and SqlCore entry point
  - [x] 7.1 Create `src/migration/migration-pipeline.js` as thin entry-point adapter
    - Parse ALTER TABLE AST to extract migration type and target schema
    - Validate migration type is one of MIGRATION_TYPE values, reject unsupported types
    - Check schema_migrations via MigrationCoordinator for active migration on same table
    - Delegate to MigrationCoordinator.initiateMigration()
    - Expose handleAlterTable(ast, sessionId) method for SqlCore integration
    - _Requirements: 1.1, 1.3, 1.5_

  - [x] 7.2 Integrate MigrationPipeline into SqlCore executeQuery()
    - Add `case QUERY_AST_TYPE.ALTER_TABLE:` in SqlCore.executeQuery() switch
    - Delegate to `this.migrationPipeline.handleAlterTable(ast, sessionId)`
    - Wire MigrationPipeline as a dependency of SqlCore (inject in constructor or composition root)
    - _Requirements: 1.1_

  - [x] 7.3 Implement `cancelMigration(migrationId)` in MigrationCoordinator
    - Reject cancel if migration is in cutover_pending or completed stage (use MIGRATION_CANCELLABLE_STAGES)
    - Transition Migration_Record to cancelling
    - Stop issuing new backfill batches (check cancelling status before each batch)
    - Wait for in-flight operations to complete
    - Execute rollback: reverse ALTER TABLE on all partitions via Raft log
    - Transition Migration_Record to cancelled
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

  - [x]* 7.4 Write property test: Atomic cutover via distributed transaction (Property 12)
    - **Property 12: Atomic cutover via distributed transaction**
    - Generate random partition counts (1-10), verify cutover transaction atomically updates tables.schema_definition and all Partition_Migration_Records
    - **Validates: Requirements 4.1**

  - [x]* 7.5 Write property test: Cancellation transitions and stops new work (Property 21)
    - **Property 21: Cancellation transitions and stops new work**
    - Generate random cancellable stages, verify transition to cancelling and no new batches issued
    - **Validates: Requirements 8.1, 8.2**

  - [x]* 7.6 Write property test: Cancel rejection for post-cutover migrations (Property 23)
    - **Property 23: Cancel rejection for post-cutover migrations**
    - Generate cancel attempts on cutover_pending and completed, verify rejection with descriptive error
    - **Validates: Requirements 8.4**

  - [x]* 7.7 Write unit tests for MigrationPipeline and cancellation
    - Test rejection of unsupported ALTER TABLE types
    - Test cancel acceptance for each cancellable stage
    - Test cancel rejection for cutover_pending and completed stages
    - Test cutover failure keeps migration in cutover_pending (Property 14)
    - Test post-cutover schema version usage in SqlCore (Property 15)
    - Test durable transition persistence records previous/next stage, reason, timestamp (Property 16)
    - Test recovery resumes from last persisted stage without re-executing completed stages (Property 17)
    - _Requirements: 1.5, 4.3, 4.5, 5.1, 5.2, 8.1, 8.4_

- [x] 8. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Wire composition root and observability
  - [x] 9.1 Wire MigrationCoordinator and MigrationPipeline in the composition root
    - Instantiate MigrationCoordinator with injected dependencies (sqlCore, systemTableCache, transactionCoordinator, workflowCoordinator, logger, now)
    - Instantiate MigrationPipeline with MigrationCoordinator
    - Inject MigrationPipeline into SqlCore
    - Wire recoverMigrations() call on leader election / node restart
    - _Requirements: 5.2_

  - [x] 9.2 Add structured logging for migration stage transitions
    - Emit structured log entry on each stage transition with migration_id, previous_stage, next_stage, reason
    - Use existing logger patterns — no new logging infrastructure
    - _Requirements: 6.3_

  - [x] 9.3 Verify migration observability via system table queries
    - Ensure schema_migrations is queryable via SELECT through SqlCore (migration_id, table_name, current_stage, created_at, updated_at)
    - Ensure schema_migration_partitions is queryable via SELECT (partition_id, status, backfill_cursor, retry_count, error_message)
    - _Requirements: 6.1, 6.2_

  - [x] 9.4 Update `architecture.md` with migration component ownership
    - Document MigrationCoordinator as sole owner of schema_migrations and schema_migration_partitions lifecycle
    - Document ownership boundaries: MigrationCoordinator owns workflow state, PartitionService owns local ALTER execution, SqlCore owns SQL routing
    - Document the two new system tables and their CDC classification
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [x]* 9.5 Write integration tests for end-to-end migration flow
    - Test single-partition table migration through all stages (pending → completed)
    - Test concurrent migration attempt on same table (conflict rejection)
    - Test migration cancellation during backfill stage
    - Test cutover transaction failure and retry
    - _Requirements: 1.1, 1.3, 3.1, 4.1, 4.3, 8.1_

- [x] 10. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Property tests use fast-check with `{numRuns: 10}` per project testing guidelines
- All system table mutations are primary-key-addressed per system guidelines §1.4.13
- MigrationCoordinator composes existing building blocks (DurableWorkflowCoordinator, OperationLane, TimeoutPolicy, WorkflowStepRunner) — no workflow mechanics are reimplemented
- All SQL execution routes through SqlCore — no direct SQLite calls from migration code
- Checkpoints ensure incremental validation at each major milestone
