# BINDING ROOT (clean current-HEAD run): replica_operations-p1-r4 durable-index freeze

The settle stall's 5 genuinely-non-terminal ops all trace to ONE root, pinned from the
fresh pre-fix run (`data/examples/service-data-affinity-demo`, archived
`run-2026-07-07T08-52-12-009Z`).

## The chain
1. **Settle count is REAL, not a stale-read artifact.** The seed's in-flight ops are the
   same non-terminal ops on the leader (no divergence). 5 ops genuinely non-terminal.
2. **The 5 ops share one root: control-plane completion/progress writes never become
   durable.** e.g. `ad5709aa`/`b546e25c` log "Operation completed" but stay durably
   PENDING; `c986eaf7`/`4f9f74a9` reach ACTIVE but never complete; `b6f89d11` logs
   "Failed to persist operation" 10×.
3. **Why writes aren't durable = a durability-fitness freeze on `replica_operations-p1-r4`
   (node 5aa160fd).** Reason `leader_durability_unfit_commit_durability_divergence`:
   **`declaredIndex=228` vs `durableIndex=191`** — a 37-entry gap. Byte-IDENTICAL across
   the ENTIRE run (09:00:32 → 09:05:04), strikes climbing **3 → 55 → 105 → 161 → 218 →
   275**, `successorViable:false`. durableIndex NEVER advances past 191.
4. This is a GENUINE freeze (the run-23 "silently-closed-adapter" family, signal (b) in
   `partition-service-durability-fitness.js:26-30`), NOT a transient checkpoint lag and
   NOT the participant-BEGIN zombie (demo issues 0 participant txns). Entries 192-228 are
   declared committed in memory but never persisted durably → the completion writes for
   the stuck ops live in that non-durable window → ops never terminalize.
5. **The C3 bounded demotion does NOT break the deadlock:** the demoted-unfit r4 keeps
   RE-WINNING leadership (strikes climb to 275 after the first demotion) because its
   in-memory log (228) is the most complete, so raft re-elects it; but its durable storage
   is frozen at 191. The "role-gated stuck-transaction heal" the demotion opens cannot
   recover this because there is NO stuck transaction to roll back (silently-frozen
   adapter, transaction-less). Self-sustaining unfit-leader deadlock persists.

## Why this is THE binding root (not gaps ii/iv/v as separate legs)
Gaps (iv) reservation-orphan-release and (v) silent-ack are DOWNSTREAM symptoms of the
same non-durable-write freeze: the completion write lands in the 192-228 non-durable
window, so the op is falsely-acked complete (v) and its reservation reconcile misreads it
(iv). Fix the freeze → the writes become durable → ops terminalize → settle completes.
The prior per-failure repair attempts (gap ii, reverted `692c9dbb`) fought the symptom on
the hot path and stormed; the freeze is the actual cause.

## Open sub-questions for the design (code-level, to gate the fix)
- WHY does durableIndex freeze at 191 on r4? Is the write connection's durable commit
  path stalled, or is the READONLY watermark connection stale/snapshotted (WAL) and
  falsely reporting 191? (`partition-service-durability-fitness.js` readonlyWatermark*
  fields + `sqlite-log-adapter.js` durable committedIndex write/read.) The ops' rows ARE
  durably PENDING everywhere, which argues the freeze is REAL (writes truly not durable),
  not a watermark misread — but confirm.
- WHY does the demoted-unfit r4 re-win leadership? Is deferCandidacy not applied / not
  re-asserted per window while unfit, so the frozen node with the most-complete in-memory
  log keeps winning? (`tracked-leader-demotion.js`, deferCandidacy inflation window
  referenced at durability-fitness.js:51.)
- WHY doesn't the heal recover a transaction-less silently-frozen adapter? Is re-opening /
  re-initializing the log adapter's durable connection the missing recovery?

## Fix direction (to be designed)
Break the self-sustaining unfit-leader deadlock on the ledger partition so a DURABLE
leader emerges and the 37 stuck entries commit. Candidates (design must pick + justify,
reuse-first): (a) make the demoted-unfit node actually stop winning elections while frozen
(deferCandidacy that holds until durability recovers), so a durable follower becomes
leader; (b) recover the frozen adapter (re-open the durable write connection) as the heal
for the transaction-less freeze; (c) both. Must NOT reintroduce the per-failure storm and
must respect raft safety (no bare-rollback re-minting acked indices — the existing
demotion-before-heal invariant).
