// Canonical SQLite-backed Raft state keys shared by storage and snapshot
// owners. These are durable database vocabulary, not a consensus-backend
// compatibility surface.

const SQLITE_RAFT_STATE_UPSERT_SQL =
  'INSERT INTO _raft_state (key, value) VALUES (?, ?) ' +
  'ON CONFLICT(key) DO UPDATE SET value = excluded.value';

const SQLITE_RAFT_STATE_KEY = Object.freeze({
  COMMITTED_INDEX: 'committedIndex',
  CURRENT_TERM: 'currentTerm',
  LEGACY_COMMIT_INDEX: 'commitIndex',
  VOTED_FOR: 'votedFor',
});

export {
  SQLITE_RAFT_STATE_KEY,
  SQLITE_RAFT_STATE_UPSERT_SQL,
};
