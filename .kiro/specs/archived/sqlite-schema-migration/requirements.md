# SQLite Schema Migration Requirements

## Problem Statement

The SQLite Raft log adapter has a schema inconsistency issue. The `_raft_log` table was originally created with a `data` column, but the code now expects a `command` column. This causes two types of errors:

1. **Schema mismatch**: `table _raft_log has no column named command` - when running against old databases
2. **NULL constraint**: `NOT NULL constraint failed: _raft_log.data` - when the migration is incomplete

The current migration code only adds the `command` column if missing, but doesn't handle:
- Renaming `data` to `command`
- Migrating data from `data` to `command`
- Removing the old `data` column

## User Stories

### Story 1: Seamless Schema Migration

**As a** system operator  
**I want** the database schema to migrate automatically on startup  
**So that** I don't have to manually fix database files when upgrading

**Acceptance Criteria:**
- Old databases with `data` column are automatically migrated to use `command`
- Data is preserved during migration
- Migration is idempotent (safe to run multiple times)
- Migration completes before any Raft operations begin

### Story 2: Clean Schema Definition

**As a** system developer  
**I want** a single, consistent schema definition  
**So that** there's no confusion about column names

**Acceptance Criteria:**
- The `_raft_log` table uses `command` column (not `data`)
- Schema is clearly documented in code
- No legacy column names remain in the codebase

### Story 3: Migration Error Handling

**As a** system operator  
**I want** clear error messages if migration fails  
**So that** I can diagnose and fix issues

**Acceptance Criteria:**
- Migration failures are logged with specific details
- Partial migrations are detected and reported
- Recovery instructions are provided in error messages

## Technical Requirements

### Schema Definition

The correct `_raft_log` table schema:
```sql
CREATE TABLE IF NOT EXISTS _raft_log (
  log_index INTEGER PRIMARY KEY,
  term INTEGER NOT NULL,
  command TEXT NOT NULL,
  timestamp INTEGER NOT NULL
)
```

### Migration Logic

1. Check if `data` column exists (old schema)
2. If `data` exists and `command` doesn't:
   - Add `command` column
   - Copy data from `data` to `command`
   - Drop `data` column (or leave it for safety)
3. If both exist, ensure `command` has the data
4. If only `command` exists, schema is correct

### Implementation Location

File: `src/raft/sqlite-log-adapter.js`
Method: `initializeTables()`

## Success Metrics

1. Zero schema-related errors on startup
2. Existing data preserved after migration
3. Clean startup logs showing migration status (if needed)
