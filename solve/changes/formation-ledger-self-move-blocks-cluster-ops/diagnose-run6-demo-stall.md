# Diagnose: run-6 demo stall WITH fix `fba0b477` (fresh-leader authoritative count read)

Read-only diagnostic. Logs: `data/examples/service-data-affinity-demo/node-{0..4}.log`
(run-6, WITH fix; boot 07:00:07→07:06:01Z). Prior run "run-5" from archive
`service-data-affinity-demo-archive/run-2026-07-06T06-59-58-992Z.tar.gz`
(internal logs 2026-07-05T21:00:41→21:16:51Z, ~16 min).

## TL;DR verdict

**The fix targets the WRONG leg, and it made the stall measurably WORSE.**

The `replica_operations-p1` ledger self-move cycle that wedges the control plane is
driven by **count-NEUTRAL `replace_replica` self-moves (34x in run-6)** plus
`node_not_in_target` REMOVEs (11x) — NOT by a phantom count-changing ADD/REMOVE from a
miscounted `activeCount`. The fix (`resolveFreshCurrentReplicasForCountDecision`) only
refreshes the `currentReplicas` input to the **count** decision; it cannot affect a
`replace_replica` (spread-leg) or `node_not_in_target` (target-membership-leg) move.
Worse, run-6's count leg is deferring ADDs because it sees itself **at/over target**
(the opposite of the stale-LOW under-count the fix is built to correct), and the fix's
authoritative-over-cache **UNION** (which never under-counts, only backfills voters)
pushes the count further over target — the "Deferring spread-driven count-increasing
ADD" events jumped **4 → 25** and REPLACE self-move thrash jumped **5 → 34** vs run-5.

Recommendation: **(c) reconsider the approach.** Do not ship/extend this fix as the
self-move-cycle remedy; it is refuted against the live observable. See per-question
detail.

---

## Q1 — Count-changing phantom, or a different mechanism? → DIFFERENT (count-NEUTRAL)

Executed moves whose moved replica belongs to `replica_operations-p1` (the true ledger
self-moves), run-6, all nodes:

| moveType | reason | count |
|---|---|---|
| replace | replace_replica | **34** |
| remove | node_not_in_target | 11 |
| add | increase_replica_count (moving a `replica_operations-p1` replica) | **0** |

The cycle is the **same replica REPLACE'd to the same target over and over without
terminalizing**, e.g. `replica_operations-p1-r4` REPLACE `82b7bf0d→d6507c56` re-minted
at 07:01:18, :21, :28, :32, :34, :37; then `-r2` `f650e4a7→d6507c56` seven times
07:01:44→:51; then `-r5` `4e1551aa→d6507c56` repeatedly 07:01:56→07:02:06. All
`moveType=replace reason=replace_replica` — **count-neutral**.

The one `add reason=increase_replica_count` line logged under
`entityId=replica_operations-p1` (07:01:23.880) has
`movePartitionId=sql_transaction_participants-p1` — it does NOT add a
`replica_operations-p1` voter. No phantom count-increasing ADD of a
`replica_operations-p1` replica was executed anywhere in run-6.

The count leg is present but is *deferring* its ADD, not minting a phantom one. Sample
(node-0, 07:00:37.938):
`"Deferring spread-driven count-increasing ADD while already at/over target replica
count (no count-neutral REPLACE pairing)"` with
`targetReplicaCount:3, deferredAddCount:2, replaceSerializationCap:true`. This is the
**over-target** deferral path, i.e. the count leg believes it has ENOUGH voters — the
inverse of the stale-LOW under-count the fix corrects.

**Conclusion:** the binding driver is a count-NEUTRAL `replace_replica` self-move thrash
(+ `node_not_in_target` REMOVE thrash). The fix patches the count-decision input, a leg
that produces neither of these moves. Wrong target.

## Q2 — Did the fresh-leader authoritative read plausibly ENGAGE?

Arming precondition (`setLeader(true)` on a priority partition) **was met** — the fix
has no logging, so engagement is inferred from arming conditions:

- `"Became leader, starting rebalancing scheduler"` for `entityId=replica_operations-p1`
  fires 4x: 07:00:35 (f650e4a7), 07:00:55 (82b7bf0d, term 2), 07:05:35 (82b7bf0d,
  term 21), 07:05:52 (4e1551aa, term 22). The liferaft term jumping **2 → 21 between
  07:00:55 and 07:05:35** implies ~19 elections — a heavy leadership flap. Each
  rebalancer leadership gain re-arms `freshLeaderAuthoritativeCountReadArmed`.
- `replica_operations-p1` is treated as a priority control-plane partition (113
  `"Priority-recovery planning-gate decision diagnostic"` events), so
  `isControlPlanePriorityPartition()` is true.

So the window armed repeatedly. But two properties make engagement irrelevant/inert:

1. **Wrong leg (Q1):** even a perfectly-engaged authoritative count read cannot change a
   `replace_replica` or `node_not_in_target` move.
2. **Self-releasing disarm is a likely no-op:** `resolveFreshCurrentReplicasForCountDecision`
   disarms on the FIRST armed tick where the authoritative ACTIVE-id set equals the cache
   ACTIVE-id set. If the cache is not actually divergent at that first tick (or the owner
   defers → bounded fallback to cache, which trivially "agrees"), it disarms without ever
   correcting anything. The union also *cannot* remove a hard-deleted ghost — the commit
   message documents this residual explicitly.

**Conclusion:** armed, but engagement is unobservable and, by Q1, immaterial to the moves
that actually wedge the cluster.

## Q3 — Regression check: did the fix make formation WORSE? → YES, clearly.

Apples-to-apples, **same first 6 minutes** of each run (run-5 21:00:41–21:06:41 vs run-6
full 07:00:07–07:06:01):

| Signal (first ~6 min) | run-5 (prior) | run-6 (WITH fix) | Δ |
|---|---|---|---|
| `replica_operations-p1` REPLACE self-moves (`replace_replica`) | 5 | **34** | **6.8× worse** |
| `replica_operations-p1` REMOVE (`node_not_in_target`) | 6 | 11 | ~2× worse |
| `"Operation completed"` events | 38 | **17** | **55% fewer** |
| `"Deferring …count-increasing ADD"` for replica_operations-p1 | 4 | **25** | **6.3× worse** |

Full-run totals: run-5 = 61 completions over 16 min (control_plane_publications-p1 got 33
done); run-6 = 17 completions over 6 min then died at [2/4]. Run-6 never gets past the
`replica_operations-p1` wedge to let `control_plane_publications-p1` drain (1 completion
vs run-5's 33).

**Mechanism of the regression (consistent with the data):** the fix's UNION merge is
"authoritative-over-cache, never under-count." Because run-6's count leg is already
*over* target and deferring ADDs, backfilling more voters into `currentReplicas` can only
raise the counted `activeCount`, firing the over-target `"no count-neutral REPLACE
pairing"` deferral MORE (4 → 25). That starves the count-neutral REPLACE pairing and lets
the spread REPLACE re-mint unpaired — exactly the 34-vs-5 thrash explosion.

Secondary load evidence consistent with the added synchronous per-tick owner-RPC await
(`await this.resolveFreshCurrentReplicasForCountDecision()` at rebalance-loop.js:143,
re-armed every leadership flap): run-6 shows 10 `"Event loop gap detected"`, 65
`"Skipping ACK-timeout quarantine: peer demonstrably alive (slow, not dead)"`, 24
`"Excessive clock drift detected"`. Not conclusive on their own, but directionally
consistent with a slowed rebalance loop.

## Q4 — The actual binding stuck op at the plateau

Run-6 has a dead window **07:03:20 → 07:05:52 (~152s, > the 120s cut)**: after
`latency_groups-p1` completes at 07:03:20 nothing completes until
`replica_operations-p1` finally completes 3 ops at 07:05:52/57/59 (right after the
term-22 leadership handoff to 4e1551aa).

During that window the binding wedge is the **`replica_operations-p1` ledger self-move
holding the ledger non-idle**, and the self-move interlock blocking every other
control-plane partition. Admission-blocked moves in the window:

| Blocked entity | admissionReason | count |
|---|---|---|
| sql_transactions-p1 | operation_ledger_self_move_in_flight | 35 |
| sql_transaction_participants-p1 | operation_ledger_self_move_in_flight | 24 |
| control_plane_publications-p1 | operation_ledger_self_move_in_flight | 13 |
| sql_write_operations-p1 | operation_ledger_self_move_in_flight | 12 |
| sql_transaction_participants-p1 | operation_ledger_quorum_concentrated | 11 |
| replica_operations-p1 | operation_ledger_self_move_waiting_for_idle_ledger | 10 |
| (many more) | self_move_in_flight / quorum_concentrated | 3 each |

The in-flight `replica_operations-p1` self-moves during the window: a REMOVE of `-r4`
(07:03:22, `node_not_in_target`) then a REPLACE of `-r4` `82b7bf0d→4e1551aa` (07:03:23),
then a 2-minute freeze (nothing terminalizes; ledger `waiting_for_idle_ledger`), then
after the 07:05:35 flap a REMOVE of `-r2 →f650e4a7` (`node_not_in_target`) **re-minted 11
times in 11s** (07:05:35→07:05:46) — a second limit cycle, this time on REMOVE.

So the wedge is the **same `replica_operations-p1` self-move cycle as run-5**
(self_move_in_flight → waiting_for_idle_ledger → all sibling control-plane partitions
blocked → [2/4] admin timeout), not a different partition. `control_plane_publications`,
`sql_transactions`, `sql_transaction_participants`, `sql_write_operations` are all
victims, not the root.

## Q5 — Net verdict

The count-miscount phantom count-changing move is **NOT the binding driver** of this
stall. The binding driver is a **count-NEUTRAL `replace_replica` self-move thrash** (34x)
plus a `node_not_in_target` REMOVE thrash (11x) on `replica_operations-p1` that never
terminalizes and holds the ledger non-idle, wedging every sibling control-plane partition
through `operation_ledger_self_move_in_flight` / `waiting_for_idle_ledger`.

The fix `fba0b477` operates on the **count-decision `currentReplicas` input** — a leg
that mints neither of the offending move types. Its premise (stale-LOW under-count → a
phantom count-increasing ADD) is not present in run-6: the count leg is *over* target and
*deferring* ADDs. The UNION merge can only raise the count and worsen those deferrals,
and the measured result is a regression (thrash 5→34, deferrals 4→25, completions 38→17
in the same window, demo dead at 6 min vs 16 min).

**Next step: (c) reconsider the whole approach — do not extend the count-path fix.**
The lever must act on the **self-move REPLACE re-mint / REMOVE re-mint limit cycle**
itself:
- Why does the spread `replace_replica` for `-r4`/`-r5`/`-r2` never terminalize and keep
  being re-minted (idempotency / in-flight dedup of a self-move on the ledger partition)?
- Why does the `node_not_in_target` REMOVE re-mint 11×/11s after a leadership flap?
- The leadership flap (term 2→21) is itself a strong candidate root: every flap re-plans
  and re-mints the self-move; taming leadership stability on `replica_operations-p1`, or
  making the self-move interlock release on a re-minted-identical in-flight op, likely
  matters more than any count-input correction.

Consider recommending a **revert of `fba0b477`** from the demo path: it is a proven
same-window regression against the binding observable, and it adds a synchronous
per-tick owner-RPC on the hottest control-plane partition for no benefit.

### Evidence index (representative)
- Move classification: `grep '"msg":"Executing rebalancing move"'` filtered to
  `moveReplicaId` prefix `replica_operations-p1` across `node-*.log`.
- Deferral sample: node-0 07:00:37.938Z `"Deferring spread-driven count-increasing ADD…"`.
- Leadership/flap: `"Became leader"` (rebalancer + liferaft term 1→2→21→22),
  07:00:35 / 07:00:55 / 07:05:35 / 07:05:52.
- Stall window blocks: `"Rebalancing move skipped"` admissionReason tally 07:03:20–07:05:52.
- run-5 baseline: archive `run-2026-07-06T06-59-58-992Z.tar.gz`, same greps, first-6-min slice.
