# Diagnosis: why `sql_transaction_participants-p1` has no leader for writes (124× "No leader available")

Run under test: fresh post-raft-fix (`3717c518`) service-data-affinity demo.
Logs `data/examples/service-data-affinity-demo/node-*.log` (virtual span
15:00:51 → 15:09:55Z). On-disk replica DBs
`.../node-*/partitions/sql_transaction_participants-p1/*.db`. All evidence below is
from THIS run's logs and THIS run's on-disk DBs.

Node-ID map (from logs): node-0=`1883b65c`, node-1=`7b489405`, node-2=`1d3b24b4`,
node-3=`4c104de3`, node-4=`997fd861`.

---

## One-line verdict

**Verdict (b): a MUTUAL (circular) control-plane deadlock — but NOT a symmetric
2PC-on-2PC wait and NOT a shared durability flap.** `sql_transaction_participants-p1`
is left critically under-replicated (`2 < 3`) and loses its data-bearing leader to
formation REPLACE-churn; its **membership-repair ADD moves are ledger ops that are
DEFERRED 52× by `replica_operations-p1`'s own frozen/quorum-concentrated state**
(`operation_ledger_quorum_concentrated` ×25, `operation_ledger_self_move_in_flight`
×27). So it can never rebuild a data-bearing quorum → no stable leader → the routed
2PC participant write returns "No leader available" ×124 → that orphans the
`replica_operations-p1` self-move 2PC `BEGIN IMMEDIATE` hold → freezes
`replica_operations-p1`'s durable watermark → durability-fitness flap keeps its
ledger quorum-concentrated → the ADD moves stay deferred. The cycle closes. The
trigger is formation churn (c); the reason it never self-heals is the circular
ledger-admission dependency (b). **Fix locus = `replica_operations-p1`'s ledger
admission interlock: it must not defer CRITICAL under-replication recovery moves for
*other* partitions.** Fixing `sql_transaction_participants-p1`'s election directly is
impossible while those ledger writes are blocked; and its detector is NOT the problem
(it never flaps durability — see Task 2).

---

## Task 1 — leadership timeline of `sql_transaction_participants-p1`

The partition churns 10 successful elections across ~23 raft terms in 4.5 min, then
goes **permanently leaderless from 15:05:24 to end of run (15:09:55)** — ~4.4 min with
no leader while writes keep arriving.

`"Became leader (liferaft)"` events (sorted):

```
15:00:51.633  term=1   r1  (node-0)
15:01:49.393  term=2   r2  (node-0)
15:02:03.681  term=3   r4  (node-4)
15:02:41.512  term=5   r3  (node-0)
15:03:00.435  term=7   r3  (node-0)   ← last time node-0/r3 leads; Lost 15:03:14.211
15:03:20.896  term=8   r6  (node-3)
15:03:43.668  term=12  r6  (node-3)
15:04:11.347  term=15  r6  (node-3)
15:04:38.476  term=19  r6  (node-3)
15:05:12.010  term=23  r6  (node-3)   ← LAST "Became leader" anywhere for this partition
15:05:24.504  Lost leadership (r6)    ← NO leader elected after this point
```

Every "Lost leadership" that has a recorded cause is a **`replace_target_leader_election`
STEP_DOWN_REPLICA** (15:01:44.667 on r4, 15:05:24.495 on r8) — i.e. the rebalancer's
REPLACE moves force the leader down. There are **zero** durability-driven step-downs
(Task 2). At 15:05:24.835 the data-bearing leader **r6 is REMOVE_REPLICA'd** (removal
completed 15:05:24.949). New replicas r9 (15:07:03) and r10 (15:07:13) are then created
and reach "voter-ready activation state" but **never produce a `Became leader` event**.

Answer to the 1(a/b/c) sub-question: it is **(a) never stably elects**, compounded by
routing to a stale replica. It elects 10 times but each leadership is torn down by
REPLACE-churn within 10–25 s, and after the data-bearing leader r6 is removed at
15:05:24 the empty replacement replicas never bootstrap an election at all.

The "No leader available for write operation" failures span **15:03:39.370 →
15:09:49.270** (124 total: node-0=16, node-1=26, node-2=38, node-3=17, node-4=27) —
they begin the instant node-0/r3 loses leadership (15:03:14) and continue unbroken
through the whole leaderless tail.

**Stale-routing compounding factor (1c also true):** 107 of the 124 failures route to
**`sql_transaction_participants-p1-r3` on node-0** — the OLD generation that last led at
term 7 (15:03:00). r3 was **never REMOVE_REPLICA'd** (0 removals), stays up the whole
run (its only "Shutting down" is demo teardown at 15:09:55), holds all the data on disk
(Task 3), yet never re-campaigns after losing leadership. The routing/placement layer
keeps directing participant writes at this orphaned data-bearing generation, which has
no local leader knowledge → "No leader available." The remaining 17 failures scatter to
r5/r8/r9/r10 (all empty).

## Task 2 — is it ALSO durability-fitness flapping? NO.

Decisive negative: on `sql_transaction_participants-p1`, across all five node logs:
- `durability unfit` / "unfit for leadership" events: **0**
- `transaction_hold` / `commit_durability_divergence` / "held beyond its legal window":
  **0**

This partition is **not** in the durability-fitness class at all. It therefore is **not**
a symmetric mutual durability deadlock with `replica_operations-p1` (only
`replica_operations-p1` flaps durability). The two are coupled through the **ledger
admission interlock**, not through a shared durability detector. Corollary: weakening
`sql_transaction_participants-p1`'s durability detector would do nothing — it never fires
here.

## Task 3 — on-disk state: only the stale replica has data; the live quorum is EMPTY

On-disk `.db` files present at run end and their raft state:

| node   | replica | committedIndex | log rows | log maxIdx | log maxTerm | participant rows | file size |
|--------|---------|----------------|----------|-----------|-------------|------------------|-----------|
| node-0 | **r3**  | **188**        | **188**  | **188**   | **23**      | **15**           | 147 KB    |
| node-1 | r5      | (none)         | 0        | —         | —           | 0                | 24 KB     |
| node-1 | r8      | (none)         | 0        | —         | —           | 0                | 24 KB     |
| node-2 | r9      | (none)         | 0        | —         | —           | 0                | 24 KB     |
| node-3 | r10     | (none)         | 0        | —         | —           | 0                | 24 KB     |

- **Only r3 (node-0) holds any state**: committedIndex 188, a fully **contiguous** log
  1..188 (no hole — this is NOT the `3717c518` committed-entry-loss class), terms 5→23,
  15 committed participant rows. r3 stayed a caught-up follower of r6 through term 23,
  then froze at index 188 when r6 was removed.
- **Every current-generation replica (r5, r8, r9, r10) is completely empty** — 0 raft-log
  rows, no `committedIndex`, 0 data rows. They were created but **never received a log or
  snapshot transfer** from the data-bearing replica.
- node-4 holds **no** replica of this partition at run end.

So the "live" membership (the newest generations) cannot elect a leader that preserves
committedIndex 188 — none of them has the committed prefix, and the one replica that
does (r3) is an orphaned old generation that no longer campaigns. There is **no stuck
transaction or hole** on this partition (unlike `replica_operations-p1`); the pathology
is empty replicas + an un-promotable data-bearing orphan.

## Task 4 — membership / placement: perpetual under-replication from REPLACE churn

`Critical rebalancing state detected` fires **18×** for this partition, reason
`replica_count_below_minimum` — 16× `2 < 3`, 2× `1 < 3`. The partition is chronically
below its minimum of 3 replicas. CREATE/REMOVE churn (all timestamps):

```
r1 removed 15:01:44 · r2 removed 15:02:25 · r4 create 15:01:39→remove 15:03:01
r7 create 15:02:31→remove 15:02:54 · r6 create 15:02:28→remove 15:05:24 (leader removed)
r8 create 15:04:54 · r9 create 15:07:03 · r10 create 15:07:13 · r5 removed 15:07:15
```

Replica-create diagnostics show tiny peer sets (`peers=2/2`, `peers=3/3`) and
`local_replicas=6..8` — the node accumulates orphaned generations. Placement did NOT keep
data co-located: the ADD churn kept minting empty replicas on nodes that never received
the r6/r3 log, so raising the count never raised the *data-bearing* count. This is a
**formation bootstrap-ordering problem**: membership is reconfigured faster than the new
replicas can hydrate, and the one hydration path that would fix it is blocked (below).

## Task 5 — root verdict and where the fix belongs

**The circular (mutual) dependency, proven on the wire:**

The rebalancer's membership-repair moves for `sql_transaction_participants-p1` are
admitted as **ledger operations on `replica_operations-p1`**. Filtering
`"movePartitionId":"sql_transaction_participants-p1"` with
`"admissionDecisionType":"deferred"`: **52 deferrals**, spanning 15:01:06 → run end,
with admission reasons:

```
25 × operation_ledger_quorum_concentrated
27 × operation_ledger_self_move_in_flight
```

Both reasons are states of **`replica_operations-p1`** — the exact partition whose
durability-fitness flap / self-move interlock this investigation is chasing. So:

1. Formation REPLACE-churn removes `sql_transaction_participants-p1`'s data-bearing
   leader (r6, 15:05:24) and leaves it under-replicated (`2 < 3`).
2. Recovery needs ADD-replica moves → these are ledger writes on `replica_operations-p1`.
3. `replica_operations-p1` **defers** them (`quorum_concentrated` /
   `self_move_in_flight`) → the ADDs never land → the new replicas stay empty → no
   data-bearing quorum → **no stable leader**.
4. Routed 2PC participant writes to `sql_transaction_participants-p1` return **"No leader
   available" ×124**.
5. That **orphans the `replica_operations-p1` self-move 2PC `BEGIN IMMEDIATE` hold** for
   ~60 s (the mechanism proven in `postfix-binding-root-durability-fitness-flap.md`).
6. The orphaned hold **freezes `replica_operations-p1`'s durable watermark** → durability
   flap → leadership churn → keeps its ledger `quorum_concentrated` / self-move in
   flight.
7. → back to step 3. **Closed cycle.**

This is **(b) a mutual deadlock**, realized as a control-plane *circular ledger-admission
dependency* — asymmetric in mechanism (participant-hold orphan on one side, deferred
recovery-op on the other), not a symmetric 2PC-waits-on-2PC and not a shared durability
flap. The formation churn is the trigger that seeds both partitions into the cycle (c),
but the reason it is *stable* rather than transient is the circular dependency (b).

**Fix locus (pin only — do not implement here):** cut the edge at
`replica_operations-p1`'s **ledger admission interlock**, so that a **CRITICAL
under-replication / priority-recovery move for a *different* partition is exempt from the
`self_move_in_flight` / `quorum_concentrated` defer**. Rationale:

- It is the only edge whose removal is *sufficient*: land the ADDs → hydrate a
  data-bearing quorum on `sql_transaction_participants-p1` → it elects a stable leader →
  the routed 2PC completes → the `replica_operations-p1` hold releases → the durable
  watermark unfreezes → the flap stops → nothing left to concentrate the quorum.
- Targeting `sql_transaction_participants-p1`'s *election* directly is impossible while
  its recovery writes are blocked; there is no local move that hydrates an empty replica
  without a ledger write.
- Targeting its *durability detector* is a no-op — Task 2 shows it never fires there.
- The self-move interlock exists for a real reason (run-20/22 safety), so the exemption
  must be **narrow**: only genuinely-critical under-min recovery for a partition *other
  than* the one holding the in-flight self-move, and it must be level-triggered, not a
  per-failure re-drive (avoid the `1ce80391`→`692c9dbb` load-amplification regression).

**Regression / validation note:** this must be validated with the 2-pre/2-post live A/B
(`hotpath-failure-fix-needs-aggregate-live-validation.md`), not a unit DT — a DT that
injects a lone deferred move will not reproduce the circular load, and the interlock
exemption is exactly the kind of admission-path change that can regress live formation.

---

## Evidence index (file:line / query, for reproduction)

- Leadership events: `grep '"Became leader (liferaft)"'` / `'Lost leadership'` /
  `'STEP_DOWN_REPLICA'` on `sql_transaction_participants-p1` in `node-*.log`.
- "No leader available": `grep 'No leader available' node-*.log | grep
  sql_transaction_participants-p1` → 124; participant target
  `sql_transaction_participants-p1-r3` ×107.
- Durability-flap negative: `grep -E 'unfit|transaction_hold|commit_durability_divergence'`
  on the partition → 0.
- On-disk raft state: `sqlite3 .../sql_transaction_participants-p1-r<N>.db "SELECT value
  FROM _raft_state WHERE key='committedIndex'"` and `SELECT COUNT(*),MAX(log_index),
  MAX(term) FROM _raft_log` — r3=188/188/23, r5/r8/r9/r10 empty.
- Circular deferral: `grep '"movePartitionId":"sql_transaction_participants-p1"'
  node-*.log | grep deferred` → 52 (`operation_ledger_quorum_concentrated` ×25,
  `operation_ledger_self_move_in_flight` ×27).
- Under-replication: `grep replica_count_below_minimum` on the partition → 18 (`2<3` ×16,
  `1<3` ×2).
- Cross-reference: the orphaned-2PC-hold half of the cycle is proven in
  `postfix-binding-root-durability-fitness-flap.md` (this run); the `movePartitionId`
  deferrals are logged under `entityId":"replica_operations-p1"` — the two reports meet at
  the same ledger partition.
