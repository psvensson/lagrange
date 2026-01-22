# SQLite Schema Migration Tasks

## Implementation Tasks

- [x] 1. Update `initializeTables()` in `src/raft/sqlite-log-adapter.js`
  - Add detection for legacy `data` column
  - Add migration logic to copy `data` → `command`
  - Handle case where both columns exist
  - Ensure NOT NULL constraint is satisfied

- [x] 2. Test the migration
  - Run with fresh database (no existing partitions)
  - Verify schema is correct after startup
  - Verify Raft operations work correctly
