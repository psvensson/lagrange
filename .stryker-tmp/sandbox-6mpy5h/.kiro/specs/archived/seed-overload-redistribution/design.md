# Design Document: Seed Overload Redistribution

## Overview

This design fixes the remaining topology-stability blockers that still keep
critical system partitions concentrated on the seed after rolling restart and
join stress.

The main rule is to preserve one owner path:

1. `PartitionService` owns learner lifecycle and promotion.
2. `RebalanceCoordinator` owns operation safety and progression.
3. `SQLiteLogAdapter` owns durable Raft entry persistence.
4. Append-fail retry remains on the existing Raft path and is hardened in
   place instead of adding a second recovery mechanism.

## Current Failure Mechanism

### 1. Critical `REPLACE` Deadlock

Critical partitions currently stall because two otherwise reasonable safety
rules conflict:

1. `PartitionService.checkLearnerPromotion()` allows one temporary replacement
   voter above target only for non-critical partitions.
2. `RebalanceCoordinator.getSafetyError()` blocks the remove phase of a
   critical `REPLACE` until the replacement replica is already voter-ready.

For a critical partition at target replica count, the replacement learner can
never become voter-ready because promotion is deferred for exceeding target,
while the old voter can never be removed because the replacement is not yet
voter-ready.

### 2. Joining Learner Campaign Leakage

Replicas started with `isJoiningExistingGroup = true` are intended to remain
learners until explicit promotion. In practice, liferaft candidate/follower
events can still flow through shared lifecycle wiring and persist
`raft_role = candidate`. That makes critical replacement safety nondeterministic
and can strand replicas in non-canonical roles.

### 3. Inconsistent SQLite Entry Persistence

`SQLiteLogAdapter.put()` stores only `entry.command`, while `saveCommand()`
stores the full entry object. Later reads and acknowledgement updates operate on
whatever shape happens to be in `_raft_log.command`. Append-fail retry assumes
`log.get(index)` returns a valid entry object, which is not guaranteed with the
current mixed format.

## Design Goals

1. Let critical `REPLACE` use the same single temporary replacement-voter window
   already used for non-critical partitions.
2. Keep joining learners inert until explicit promotion.
3. Make `_raft_log.command` canonical and self-consistent.
4. Harden append-fail retry against missing or malformed persisted entries.
5. Add deterministic regressions for the exact owner paths involved.

## Non-Goals

1. Reworking the bootstrap topology to seed only one system replica.
2. Rewriting control-plane readiness/discovery policy in this phase.
3. Replacing the Raft library.

## Architecture Changes

### 1. Critical Replacement Promotion Window

`PartitionService.checkLearnerPromotion()` will treat critical partitions the
same as non-critical partitions for the narrow case of a single in-flight
replacement learner above target replica count.

Constraints:

1. Only one temporary extra voter is allowed.
2. The existing odd-voter safeguards remain intact.
3. The existing coordinator-side quorum guard remains intact.

This unblocks promotion without weakening the later remove-phase safety check.

### 2. Joining Learner Campaign Suppression

While `isJoiningExistingGroup` is true and `role === LEARNER`:

1. candidate/follower demotion events from liferaft are ignored for persistence,
2. election timers remain cleared,
3. promotion stays owned by `checkLearnerPromotion()`.

After promotion:

1. role becomes `FOLLOWER`,
2. normal role persistence resumes,
3. election timing starts once through the existing path.

### 3. Canonical SQLite Entry Shape

The canonical persisted payload for `_raft_log.command` is the full entry
object:

```json
{
  "index": 4,
  "term": 2,
  "committed": false,
  "responses": [],
  "command": { "...": "..." }
}
```

Rules:

1. `put(entry)` persists the full normalized entry.
2. `saveCommand()` creates and persists the same shape.
3. `get()` and `getRange()` return normalized full entries.
4. `commandAck()` loads and updates the full entry in place.

This removes the adapter’s format ambiguity and matches what liferaft append
retry expects.

### 4. Append-Fail Retry Hardening

The local liferaft dependency currently assumes `log.get(index)` returns a
usable entry before retrying append. The fix is to harden the existing retry
branch so that:

1. missing entries are ignored safely,
2. malformed entries are ignored safely,
3. the node does not crash because of `null.command`.

This is an in-place hardening of the existing owner path, not a fallback.

## Testing Strategy

1. Add a rebalance regression proving a critical replacement learner may promote
   through the bounded replacement window.
2. Add a learner-lifecycle regression proving joining learners ignore candidate
   persistence before promotion.
3. Extend SQLite log adapter tests to assert one entry shape across `put()`,
   `saveCommand()`, `get()`, and `commandAck()`.
4. Add append-fail retry regression coverage for null or malformed recovered
   entries.
5. Run focused raft/rebalance suites before rerunning the failing distributed
   scenarios.
