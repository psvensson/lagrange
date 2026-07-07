# Implementation plan (DRAFT, pre-vet): non-contiguous raft-log freeze on replica_operations-p1

## Corrected binding root (design subagent, verified on-disk)
NOT a closed adapter. A **non-contiguous raft log** on `replica_operations-p1-r4`:
entries `1–191` contiguous, then **HOLE 192–204** (present on NO replica), then uncommitted
islands `205–211`(term2), `262–264`(term8), `398–406`(term20).
- **Freeze:** `commit(192)` short-circuits at `sqlite-log-adapter.js:428-430` (`if(!row) return null`)
  before `setCommittedIndex` (:444/:598-615) → durable `_raft_state.committedIndex` frozen at
  191 (GENUINE, verified in the checkpointed file; readonly witness at
  `partition-service-durability-fitness.js:158-189` reports 191 because 191 is the truth).
- **Deadlock:** `getLastInfo()` (:169-184) / `getLastEntry()` (:455-475) return `MAX(log_index)=406`
  → r4 out-ranks peers (r6/r7 at 191, r3 at 205) in election `(lastLogTerm,lastLogIndex)` ranking
  → r4 wins/vetoes peer votes → the already-wired `deferCandidacy` (4× timer inflation,
  `liferaft.js:472-475`, re-asserted `durability-fitness.js:355-357`) cannot beat a log-length win
  → self-sustaining unfit-leader deadlock (strikes 3→275).
- Heal (`partition-service-transaction-base.js:317-401`) never runs: 0 participant txns, and nothing
  re-contiguates a log hole. Re-opening the connection is a no-op (islands 205-406 prove it writes).

## Proposed fix (reuse-first)
1. **EXTEND `getLastInfo()` + `getLastEntry()`** to advertise the **highest CONTIGUOUS** index
   (first-gap − 1), not MAX(log_index), for election-facing reads. Pure read path → cannot
   re-mint/truncate → raft-safe; strictly safer for Leader-Completeness (node can only lose
   elections it would've won). **This is the load-bearing change** — it makes the existing
   deferCandidacy effective so a durable peer wins.
2. **EXTEND leadership-acquisition** to reconcile the island suffix via existing
   `removeEntriesAfter(highestContiguousIndex)` (:555-560) — islands are all `> committedIndex(191)`
   = uncommitted → raft-legal to truncate; lets `saveCommand` mint 192 cleanly. Guard: never
   truncate at/below `getCommittedIndex()`.
3. **NEW guard in `append()`/`saveCommand`** to refuse a non-contiguous insert (`index >
   highestContiguousIndex()+1`) so the hole is never created; follower drives normal catch-up.
   Must be vetted against the batch-apply loop `liferaft.js:258-272` (the hole's genesis).

## DT plan
Model on `test/convergence/dt6-ledger-leader-durability-fitness.test.js`. Seed a file-backed
adapter with contiguous 1-191 (committed) + island rows 205-211; `commit(228)` → currently
returns null, durable stays 191. Assert: before-fix `getLastInfo().index===406`; after-fix
`===191`, deferCandidacy effective, `removeEntriesAfter(191)` clears islands, `saveCommand` mints
192, `commit(192)` advances durable watermark 191→192. Red-on-revert on the getLastInfo change.
`npm run dt:prove -- --test <dt6> --src src/raft/sqlite-log-adapter.js`.

## Live A/B (2 pre vs 2 post)
Runner: affinity demo + `scripts/run-formation-ledger-leader-local-persistence-wedge-scenarios.js`.
Settle observable: inFlightOperations→0, no 120s no-completion stall, strike counter STOPS
climbing (vs 3→275). Storm guard: participant-failure/persist-throw on replica_operations stay at
pre-fix baseline; demotion rate does NOT spike (should DROP).

## VET VERDICT (2026-07-07): MUST-PIN-GENESIS-FIRST — the genesis is a REAL committed-entry-loss

On-disk proof (every `replica_operations-p1` DB, fresh run): a QUORUM r3/r6/r7 (3/5) persisted
durable `committedIndex=228` while physically holding entries only to 191/205. commitIndex only
advances when a quorum PHYSICALLY holds the entry → 192-228 WERE committed cluster-wide, then
DESTROYED from the logs. **Cardinal Raft safety violation (committed-entry-loss), pinned from
existing artifacts (no new probe needed to prove EXISTENCE).**

Genesis mechanism (code-pinned): `removeEntriesAfter` (`sqlite-log-adapter.js:555-560`) = bare
`DELETE WHERE log_index > ?`, **NO committedIndex guard**; base liferaft calls it unguarded
(`node_modules/@markwylde/liferaft/index.js:315`); `truncateConflictingSameIndexTail`
(`liferaft.js:93-112`) only checks the single boundary entry, not the range. `setCommittedIndex`
(`:598-615`) is monotonic-only and NO code path lowers/reconciles it → the 228 watermark is
permanent. So an unguarded truncation deleted committed entries; the watermark stuck.

Why the genesis DEFEATS the symptom-fix on 3/5 replicas (poisoned committedIndex=228):
- Inbound replication rejected: `if (packet.last.index < getCommittedIndex()) return write()`
  (`liferaft.js:237`) → contiguous-head 191 < 228 → every batch to r3/r6/r7 dropped.
- Commit-emit swallowed: re-driven op minted at 192, `setCommittedIndex(192)` early-returns
  (192 ≤ 228 monotonic clamp) → no 'commit' event → op silently non-terminal.

REVISED FIX (primary → secondary):
1. **PRIMARY (root, safety): add a HARD committedIndex guard to `removeEntriesAfter`
   (`sqlite-log-adapter.js:555`)** — refuse to delete any `index <= getCommittedIndex()`, at the
   adapter level (invariant, not caller convention). This PREVENTS the genesis: with it, committed
   entries can never be truncated → no hole → durable watermark advances → no freeze → no deadlock
   → ops terminalize → settle completes. This is the cardinal fix.
2. **Instrument `removeEntriesAfter` (+ `commit`/`setCommittedIndex`) with logging** (safe
   observability) and run a fresh wedge to PIN the deletion sequence and CONFIRM the guard catches
   the genesis (0 truncation events are logged today).
3. **SECONDARY (defense-in-depth): contiguous-head advertisement** in `getLastInfo`/`getLastEntry`
   — vet-confirmed raft-safe (under-advertising only loses elections it would've won; no-op on
   healthy logs). Extend DT to the replication/packet.last consumers, not just election.
4. **REPAIR (only for already-poisoned replicas): watermark reconciliation** — regress
   committedIndex to the highest physically-provable contiguous index. Sound ONLY because the
   entries are already lost cluster-wide. Needed for THIS run's poisoned replicas; a FRESH run with
   guard #1 never poisons, so may be unnecessary going forward. Design carefully (deliberate
   monotonic-clamp violation).

Ranked (vet): (1) reconcile poisoned watermark [blocking for already-corrupted state], (2) add the
removeEntriesAfter guard [required + closes genesis], (3) pin deletion sequence via probe, (4) ship
contiguous-head (1)+(3) safe, (5) extend DT to replication consumers. Fix does NOT alone move the
settle observable — 192-204 unrecoverable (need re-drive via sibling reap quests) AND re-drive is
swallowed until index passes 228 on poisoned replicas.

## OPEN RISKS (superseded by vet verdict above; kept for history)
1. **Hole genesis UNPINNED = likely upstream raft-safety break.** committedIndex=228 persisted on
   r6/r7 with only 191 physical entries → commitIndex advanced past the contiguous durable log.
   Candidate genesis: `setCommittedIndex` (:598-615) writes the number without verifying the entry
   exists; and/or acks stamped at saveCommand/commandAck (:284,:358 `ack:true`) BEFORE WAL
   durability under `synchronous=NORMAL` (`partition-service-constants.js:149`). The proposed fix
   addresses the leadership SYMPTOM; the genesis (committed-entries-lost) may be the deeper bug.
   Needs a live probe (instrument commit()/setCommittedIndex + interval _raft_log/_raft_state dumps
   on a fresh wedge run) OR a decision to fix the symptom + route the genesis.
2. **Late snapshot** (~2h post-freeze; islands at terms 8/20) may misrepresent the freeze-window
   shape → the truncation leg's design data is suspect.
3. **Truncation races catch-up** (`liferaft.js:160-230` handleLeaderAppendFailBatch) — main
   adversarial target.
4. Lost entries 192-204 are unrecoverable from the log → the ops whose writes lived there must be
   re-driven by the level-triggered reap (sibling quests), not waited on.

Full design: task af43cb5c output. Reports: `binding-root-durable-index-freeze-r4.md`.
