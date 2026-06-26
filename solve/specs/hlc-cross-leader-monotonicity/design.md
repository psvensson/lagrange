# HLC Cross-Leader / Cross-Restart Monotonicity — Design & Implementation Plan

**Quest:** `hlc-cross-leader-monotonicity` (solve/quests/) — `class: product`,
oracle-backed (`solve/oracle/hlc-cross-leader-monotonicity.json`), closed on
deterministic tests verified by a subagent.
**Blocks:** Quest `cdc-cache-delete-resurrection` (HLC-LWW + tombstones needs a
monotonic HLC fence). Discovered via
`solve/specs/proximity-spray-cdc-propagation-overlay/ws0.5-reliability-substrate.md`.

## Problem (verified 2026-06-15)

The HLC *type and comparison are correct* (`src/hlc/hlc-timestamp.js`: physical /
logical / nodeId; total-order `compare`), but the clock is **not monotonic across
nodes or restarts**, because the merge primitive is never wired into the partition
write path:

- The receive/merge `update(remote)` (`src/hlc/hlc-clock-service.js:79-131`,
  `Math.max` of physical + logical bump) is called in **exactly one place — the
  message-group messaging path**
  (`src/message-group/message-group-service-inbound-ingress-runtime-methods.js:164`,
  a *different* `HLCClockService` instance).
- The **partition** clock (`src/partition/partition-service-core-base.js:155`,
  `new HLCClockService(this.replicaId)`) stamps every write from a private local
  `now()` at propose time (`src/partition/partition-replication-handler.js:179`),
  and `applyCommittedEntry`
  (`src/partition/partition-service-entry-apply-base.js:553-672`) **never** calls
  `hlcClock.update(command.timestamp)` — it runs `command.sql` but ignores the
  entry's HLC.
- The constructor seeds from `Date.now()` with **no persisted high-water mark**
  (`hlc-clock-service.js:25-28`); restart can regress.

**Consequence:** a new leader B whose wall clock lags old leader A (skew up to
`MAX_DRIFT_MS = 500` ms, only logged — `hlc-constants.js:12`,
`hlc-clock-service.js:84-103`) can stamp a DELETE with a **lower** HLC than A's
earlier INSERT for the same key → an HLC-LWW tombstone fence would wrongly reject
the DELETE → resurrection. Today this also means causal ordering silently depends
on wall-clock sync, defeating the HLC.

## Goal (sealed by the Quest statement)

Applying any committed Raft entry advances the applying replica's HLC to ≥ that
entry's HLC (so a new leader's `now()` exceeds the last applied entry's HLC), and
a restarted node never emits an HLC below one it previously committed. Net: a
causally-later write for any key always receives a strictly higher HLC than an
earlier write, even across leader handoff and restart.

## Fix 1 — Merge-on-apply (cross-leader monotonicity)

In `applyCommittedEntry` (`partition-service-entry-apply-base.js:553-672`), for
**every committed entry on every replica** (leader and follower), if
`command.timestamp` parses as an HLC, advance the partition clock:

```
const remote = HLCTimestamp.fromString(command.timestamp);
if (remote) this.hlcClock.update(remote);
```

- The clock is reachable as `this.hlcClock` (set at
  `partition-service-core-base.js:155`; also threaded to the replication handler
  at `partition-replication-handler.js:110`).
- **Idempotent for self-proposed entries:** `update` takes the max, so re-witnessing
  the leader's own already-advanced HLC is a no-op. Calling it unconditionally on
  apply is therefore correct and simplest.
- **Guard non-HLC commands:** some committed entries may lack a parseable
  `timestamp` (system/non-write commands) — skip the update when absent.
- O(1), off no hot loop concern.

This guarantees that any node that *was a follower* has witnessed every entry it
applied, so when it becomes leader its `now()` is strictly greater than the last
applied entry's HLC.

## Fix 2 — Restart high-water-mark (cross-restart monotonicity) — REQUIRED (T1 confirmed)

**T1 verdict: Fix 2 is required, not redundant.** On restart a replica reloads its
committed state from the **durable file-backed SQLite DB** (`{dataDir}/partitions/
{partitionId}/{replicaId}.db`, reopened at `partition-service-raft-init-base.js:244`)
and does **NOT** re-apply committed entries through `applyCommittedEntry`. liferaft
emits `commit` only from live `append` handling, never on construction
(`@markwylde/liferaft/index.js:946, 333-343, 384`); `loadPersistedState` sets
`commitIndex`/`lastApplied` but never re-applies
(`partition-raft-storage.js:111-114`). So the fresh in-memory `HLCClockService`
(`hlc-clock-service.js:27`) never re-witnesses committed HLCs after restart →
Fix 1 alone does not cover restart.

**Source of the watermark (T1):** the committed HLC is durably persisted **inside
the serialized `_raft_log.command` JSON** (`timestamp` field, written by
`sqlite-log-adapter.js:133-148`). Note: the `_raft_log.timestamp` **column** is
wall-clock `Date.now()`, NOT the HLC; and system-table rows carry only wall-clock
`updated_at`. There is no existing HLC watermark in `_raft_state`.

**Plan — warm from MAX committed HLC on init (preferred: boot-time scan):**
- On partition init, scan the committed prefix of `_raft_log`
  (`log_index <= committedIndex`, `committedIndex` durable in `_raft_state`),
  JSON-parse each `command`, take the max `timestamp` as an `HLCTimestamp`, and
  `hlcClock.update(maxHlc)`. One-time, bounded by log length (log compaction bounds
  it; per-heartbeat full-log parsing was flagged hot in CL-018, but a one-time boot
  scan is acceptable).
- **Optimization (optional):** maintain a persisted `_raft_state.maxHlc` key updated
  in `applyCommittedEntry` at the same seam as Fix 1, giving O(1) init at the cost
  of one small `_raft_state` write per committed entry. Choose the boot-scan first;
  add the watermark only if boot-scan latency on large logs proves to matter.

## Open questions — RESOLVED by T1 (2026-06-15)

1. ~~Restart replay through `applyCommittedEntry`?~~ **NO** — reloads from durable
   SQLite, no re-apply. → Fix 2 required (above).
2. ~~Durable max-HLC source?~~ Max over parsed committed `_raft_log.command.timestamp`
   (the column `timestamp` is wall-clock, unusable). Optional maintained
   `_raft_state.maxHlc`.
3. ~~Command types without HLC?~~ **Guard is SAFE.** Every write-bearing command the
   apply path executes (WRITE/INSERT/UPDATE/DELETE/UPSERT, `MIGRATION_ALTER_TABLE`,
   `TRANSACTION_COMMIT`) carries an HLC `timestamp` (`buildPartitionWriteEntry`
   always sets it, `partition-write-kernel.js:34`). `PREPARE_TRANSACTION`/`ROLLBACK`
   fall through unacted (and carry timestamps anyway). No no-op/barrier/config/
   snapshot entry reaches `applyCommittedEntry`. So "skip update when `timestamp`
   absent" is correct defensive code, not masking a missing stamp.
4. Out of scope but note: `MAX_DRIFT_MS` exceedance is only logged, never
   corrected. With Fix 1 the logical-counter bump bounds the damage; a defensive
   drift policy could be a follow-up Quest.

**Note (T1):** a replica recovering as a LEARNER that catches up *new* commits via
live `append` messages WOULD witness them through `applyCommittedEntry` + Fix 1;
Fix 2 specifically covers the restart-from-own-durable-state case.

## Test plan (the oracle's backing artifact)

Deterministic, no distributed harness (the distributed consequence is the
dependent Quest's job):

- **Unit (clock):** `update(T)` then `now() > T`; logical bump on equal physical.
  (May partly exist — extend.)
- **Unit (partition apply):** applying a committed entry carrying HLC `T` advances
  `this.hlcClock` so a subsequent `now() > T`. Asserts Fix 1 at the apply seam.
- **Integration (leader handoff):** replica A stamps an INSERT at `T1`; B's clock
  starts behind; B applies A's committed entries, becomes leader, stamps a DELETE;
  assert `deleteHLC > T1`. This is the exact resurrection-precursor scenario.
- **Restart:** commit at `T1`; restart the partition service; assert `now() >= T1`
  (warm-from-MAX or replay-covered).

## doneWhen

Flip `solve/oracle/hlc-cross-leader-monotonicity.json` `done:true` only when BOTH
invariants (Fix 1, Fix 2) are proven by passing, subagent-verified tests with a
green suite (`metric` = count of unproven invariants → 0). Per the Quest's
`source-change-subagent-verification` constraint, spawn a verifier before audit /
git handoff and record a finding `subagent:<id>`.

## Risks

| Risk | Mitigation |
|---|---|
| `update` on a non-HLC command throws | parse-guard; skip when `fromString` returns null |
| Double-advance on self-proposed entries | `update` is max-based → idempotent |
| Restart replay already covers Fix 2 → redundant write | cheap; warm-from-MAX is harmless even if redundant |
| Performance on apply | O(1) max/compare; negligible |
| Two HLC instances (partition vs message-group) drift | out of scope here; this Quest fixes the partition instance — the one on the CDC write path |
| `partition-replication-handler.js` has a parallel `applyCommittedEntry` that does NOT witness | production-DEAD (instantiated nowhere in `src/`, only test-used) so no live bypass; if ever revived it reintroduces the bug — deletion-on-contact candidate (verify call paths first; tests reference it) |
