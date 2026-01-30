# Seed Bootstrap + Join Pipeline Tasks

## Foundation
- [x] Add constants for phase names, error codes, and phase timeouts.
- [x] Add a LeaderReadinessGate utility that returns missing leader lists.

## Bootstrap Pipeline
- [ ] Implement BootstrapStateMachine with explicit phases and gates.
- [x] Add SystemTableWriter interface and two implementations:
      - BootstrapWriter (direct partition writes for SYSTEM_TABLE_SEED).
      - RoutedSqlWriter (SQL routing after CACHE_HYDRATION).
- [x] Swap writer implementation once after cache hydration.

## CDC + Cache
- [x] Implement CDC apply gate (buffer until hydration or subscribe after).
- [ ] Ensure cache hydration produces a complete leader snapshot.

## API + Join Flow
- [x] Update Bootstrap API to block joins until READY and return structured
      errors with missing leader detail.
- [x] Update NodeJoiningService to fail fast on missing leader metadata and
      surface `LEADER_METADATA_INCOMPLETE`.

## Tests
- [ ] Add unit tests for LeaderReadinessGate results.
- [ ] Add integration test that verifies join fails fast when leader metadata
      is incomplete.
- [ ] Update existing bootstrap and join integration tests to use deterministic
      timeouts under 2 seconds.

## Docs
- [ ] Link this spec from relevant existing spec docs if needed.
