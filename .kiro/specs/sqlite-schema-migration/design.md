# SQLite Schema Migration Design

## Overview

Fix the schema migration in `SQLiteLogAdapter.initializeTables()` to properly handle the `data` → `command` column rename.

## Current State Analysis

The current `initializeTables()` method:
1. Creates table with `command` column
2. Checks if `command` column exists
3. If missing, adds `command` with default value

**Problem**: This doesn't handle the case where `data` column exists instead of `command`.

## Proposed Solution

Update `initializeTables()` to:

1. Create table with correct schema (if new)
2. Check for legacy `data` column
3. If `data` exists without `command`:
   - Add `command` column
   - Copy `data` → `command`
4. Verify final schema is correct

## Implementation

### Updated `initializeTables()` Method

```javascript
initializeTables() {
  // Create table with correct schema for new databases
  this.db.exec(`
    CREATE TABLE IF NOT EXISTS _raft_log (
      log_index INTEGER PRIMARY KEY,
      term INTEGER NOT NULL,
      command TEXT NOT NULL,
      timestamp INTEGER NOT NULL
    )
  `);

  // Check current schema
  const tableInfo = this.db.prepare('PRAGMA table_info(_raft_log)').all();
  const hasDataColumn = tableInfo.some((col) => col.name === 'data');
  const hasCommandColumn = tableInfo.some((col) => col.name === 'command');

  // Migration: rename data → command
  if (hasDataColumn && !hasCommandColumn) {
    // SQLite doesn't support RENAME COLUMN in older versions,
    // so we add command and copy data
    this.db.exec('ALTER TABLE _raft_log ADD COLUMN command TEXT');
    this.db.exec('UPDATE _raft_log SET command = data WHERE command IS NULL');
    // Note: We can't drop the data column in SQLite without recreating the table
    // Leave it for backward compatibility
  } else if (hasDataColumn && hasCommandColumn) {
    // Both exist - ensure command has data
    this.db.exec('UPDATE _raft_log SET command = data WHERE command IS NULL AND data IS NOT NULL');
  }

  // Create state table
  this.db.exec(`
    CREATE TABLE IF NOT EXISTS _raft_state (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `);
}
```

## Tasks

- [ ] Task 1: Update `initializeTables()` to handle `data` → `command` migration
- [ ] Task 2: Add logging for migration actions
- [ ] Task 3: Test with fresh database
- [ ] Task 4: Test with legacy database (if available)

## Risks

1. **Data loss**: Mitigated by copying data before any destructive operations
2. **SQLite limitations**: Can't drop columns easily, but leaving `data` column is harmless
3. **Concurrent access**: Migration runs at startup before any operations, so no concurrency issues
