# Tasks

## Phase 1: Critical Replacement Progression

- [x] 1. Add a failing regression for critical replacement learner promotion
  - Extend the existing rebalance/partition safety tests to prove a critical
    `REPLACE` can promote one temporary replacement voter above target.
  - _Requirements: 1.1, 1.2, 1.5, 5.1, 5.2_

- [x] 2. Allow the bounded replacement window for critical partitions
  - Update the learner-promotion owner path so critical partitions can use the
    same single replacement-voter window as non-critical partitions.
  - Keep the odd-voter and coordinator quorum guards intact.
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

## Phase 2: Joining Learner Lifecycle

- [x] 3. Add a failing regression for joining-learner campaign suppression
  - Prove a joining learner ignores raw candidate/follower demotion events
    until explicit promotion.
  - _Requirements: 2.1, 2.2, 2.5, 5.1, 5.2_

- [x] 4. Keep joining learners non-campaigning until promotion
  - Suppress premature candidate/follower persistence and keep election timers
    disabled while the replica remains a learner.
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

## Phase 3: Raft Durability Hardening

- [x] 5. Add failing regressions for canonical SQLite entry persistence and
  append-fail null safety
  - Extend the SQLite adapter suite to prove one persisted entry shape across
    write paths.
  - Add coverage for append-fail recovery when `log.get(index)` returns null or
    a malformed entry.
  - _Requirements: 3.1, 3.2, 3.3, 4.1, 4.2, 5.1_

- [x] 6. Unify SQLite log entry persistence and harden append-fail retry
  - Normalize all adapter writes to the full entry shape and guard append-fail
    retry against missing or malformed entries.
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 4.1, 4.2, 4.3_

## Phase 4: Verification

- [x] 7. Run targeted raft and rebalance suites
  - Run the affected rebalance and raft unit/property suites before distributed
    reruns.
  - _Requirements: 5.2, 5.3_

- [x] 8. Rerun the failing distributed harness scenarios
  - Rerun the latest failing rolling restart, join-under-load, sustained
    throughput, and related scenarios after the targeted fixes land.
  - _Requirements: 5.4_
