# Diagnose: gap v — routed-mutation silent ledger write-loss (run 10:28Z)

Read-only disk-state diagnosis of `replica_operations-p1` ledger durability for the
service-data-affinity demo run spanning `2026-07-07T10:28:30Z → 10:31:27Z`
(the `10:31Z` tail is shutdown teardown and is excluded from steady-state).

**Evidence provenance / integrity note (READ FIRST):** while this diagnosis was in
progress a PARALLEL session launched a fresh demo (`node examples/service-data-affinity/run-affinity-demo.js`,
pid 2862994, "postfix run A") that **overwrote the log files and reset the on-disk
replica DBs at ~17:00–17:01 local**. The new run has a *different* virtual span
(`15:00:53Z → 15:02:10Z`), a different CDC-no-row count (41 vs the original 29 on
node-0), and does NOT contain op `dd327544` — so it is a distinct run, not a re-emit.
All log greps and the cross-replica DB query used below were captured *before* that
overwrite and are internally coherent for the ORIGINAL run: every operation_id, every
`updated_at` epoch, and every CDC-fetch timestamp cross-correlate. The only casualty is
that I could no longer re-query the DBs to recover `partition_id`/`replica_id` for the
three earliest ops (`5f8638b8`, `228c62d8`, `782b7025`) — stated as an honest gap in
task 1/5. The original on-disk DBs (mtime 12:31, ~4.5 MB) are gone; do not attempt to
re-derive from the current data dir.

Replica → node map (original run): `r4`=node-1, `r5`=node-4, `r7`=node-2, `r8`=node-0.
(node-3 held no `replica_operations-p1` replica in the original run.)

---

## Task 1 — Binding stuck op(s)

The literal `blockerReason:"topology_operations_in_flight" / inFlightReplicaOperations:1`
settle signal on `entityId:"replica_operations-p1"` is an **early-window** phenomenon:
it runs `10:27:57.001Z → 10:28:23.072Z` (node-0 rebalancer) and then **stops**. It
clears exactly when op `228c62d8` terminalizes on quorum (`updated_at` 10:28:23.382Z,
`removed/REMOVED` on all 4 replicas). So the `replica_operations-p1` *topology* settle
is NOT the immortal blocker — it healed.

The **immortal** signature is the `No row found for CDC update` re-drive loop against
`tableName:replica_operations`, which continues to the end of steady-state:

| last no-row (Z) | operationId | type | ledger partition (row's `partition_id`) | on-disk final state (r4) |
|---|---|---|---|---|
| 10:30:59.166 | `dd327544-6b75-44a8-8dc8-ad3339b1f538` | REPLACE | `control_plane_publications-p1` (replica -r5, tgt node-3) | active / ACTIVE / completed_at=NULL |
| 10:30:23.951 | `76156345-092e-4dde-952c-af0dff5bf9cd` | REPLACE | `control_plane_publications-p1` (replica -r6, tgt node-4) | pending / SENDING / NULL |
| 10:30:13.932 | `d4e261da-2385-4bc4-ba00-cff829bc5ce3` | REPLACE | (r4-only) | pending / SENDING / NULL |
| 10:29:54.605 | `fdb5eeaf-f1bd-438e-9e87-9120ef164fa8` | REPLACE | (r4-only) | pending / SENDING / NULL |
| 10:29:24 / 10:30:59 | `dd327544` (above) | | | |
| 10:29:11.013 | `332c6904-ed0f-4799-8aa2-042c11b356c7` | REPLACE | `sql_transaction_participants-p1` (replica -r4, tgt node-2) | pending / SENDING / NULL |

**Binding stuck op at end of steady-state = `dd327544-6b75-44a8-8dc8-ad3339b1f538`** — a
REPLACE for `control_plane_publications-p1-r5` (target node-3). Its final on-disk row on
r4 is `active/ACTIVE` with `completed_at=NULL`; its CDC re-drive fires last at
`10:30:59.166Z`, ~1 s after the row's `updated_at` (10:30:58.161Z). Every one of the
late immortal-loop ops is a **REPLACE of a SYSTEM partition** (`control_plane_publications-p1`
or `sql_transaction_participants-p1`), NOT the `replica_operations-p1` self-move the
early blocker referenced.

---

## Task 2 — Disk vs log contradiction (the decisive test)

Two on-disk patterns prove the durability lie. `226…`/`3b8…` are healthy controls.

### Pattern B — diverged terminal (the durability lie is explicit)
`updated_at`/`completed_at` are the leader's; other replicas frozen at a prior step:

- **`5f8638b8-b332-4b7a-8d0a-d66a5c561ba3` (REPLACE):**
  - r4 = `removed / REMOVED`, completed_at=1783420086458 (10:28:06.458Z) — **terminal**
  - r5 = `active / ACTIVE`, completed_at=NULL, updated_at 10:28:05.062Z — **non-terminal**
  - r7 = ABSENT, r8 = ABSENT
  - → leader r4 says the REPLACE is REMOVED/complete; r5 still says ACTIVE; 2 replicas never got the row at all. **Diverged, not agreeing.**
- **`782b7025-b3b8-4770-aa10-d9a541a2053c` (REPLACE):**
  - r4 = `removed / REMOVED`, completed_at=1783420121426 (10:28:41.426Z) — **terminal**
  - r5 = r7 = r8 = `removing / STOPPING`, completed_at=NULL, updated_at 10:28:41.164Z — **non-terminal, and they AGREE with each other**
  - → the terminal transition landed on the leader r4 only; the other 3 replicas are frozen one step behind (STOPPING). 3 stale replicas, mutually identical, 1 diverged terminal leader.

### Pattern A — leader-only rows, never reached quorum (write never replicated)
Row present on r4 only, ABSENT on r5/r7/r8, non-terminal, `completed_at=NULL`:

- `332c6904` (REPLACE, sql_transaction_participants-p1) — r4 pending/SENDING; r5/r7/r8 ABSENT
- `fdb5eeaf` (REPLACE) — r4 pending/SENDING; r5/r7/r8 ABSENT
- `d4e261da` (REPLACE) — r4 pending/SENDING; r5/r7/r8 ABSENT
- `76156345` (REPLACE, control_plane_publications-p1) — r4 pending/SENDING; r5/r7/r8 ABSENT
- `dd327544` (REPLACE, control_plane_publications-p1) — r4 active/ACTIVE; r5/r7/r8 ABSENT

### Healthy controls (quorum-replicated, all 4 identical)
- `228c62d8` (REPLACE): all 4 = `removed/REMOVED`, completed 10:28:23.382Z — clears the early blocker.
- `3b8f1f79` (ADD): all 4 = `active/ACTIVE`, completed 10:28:12.956Z.

**Quantified:** of the stuck ops, Pattern A = 5 ops each present on **1/4 replicas** (leader
r4 only); Pattern B = 2 ops with a **diverged terminal** — 1 leader-terminal vs 1–3
non-terminal replicas. In Pattern B the stale replicas AGREE with each other (r5/r7/r8 all
STOPPING for `782b7025`); they DIVERGE from the leader. The durability lie: the leader row
is terminal/advanced while the quorum either lacks the row entirely (A) or is frozen one
step behind (B). No log emitted a matching terminal/progress replication to the other
replicas for any of these ops.

---

## Task 3 — Classify the "No row found for CDC update" loop

- **Target of the failing fetch:** `tableName:replica_operations`, `keyColumn:operation_id`,
  `cdcPartitionId:replica_operations-p1`, **`cdcReplicaId:replica_operations-p1-r4`** for all
  the operation-id-keyed no-rows in the steady window (25 of them; a handful early ones target
  `-r1`). Source: `src/partition/partition-cdc-generator.js:672` binds `db = this.db` (=the r4
  replica), `src/partition/partition-cdc-parameterized-sql.js:337` emits the warn, doing
  `SELECT * FROM replica_operations WHERE <whereClause>`.
- **This is NOT a lagging-replica read race in the trivial sense:** the CDC fetch is bound to
  **r4**, and r4 is precisely the replica that DOES hold the row (leader-only writes). So the
  loop is not "fetch hit a replica that hadn't replicated yet" for the r4-targeted fetches.
- **It splits by op class:**
  - For the **Pattern-A / early ops** where the fetch's target replica is one that lacks the row
    (e.g. the early `-r1`-targeted fetches for `5f8638b8`, and any quorum-read landing on
    r5/r7/r8 which are ABSENT), it is a **true write-loss**: the row is genuinely absent on that
    replica's db on disk. Disk confirms r5/r7/r8 = ABSENT for all Pattern-A ops.
  - For the **r4-targeted late fetches** (`dd327544` no-row at 10:30:59.166Z, ~1 s AFTER the r4
    row's `updated_at` 10:30:58.161Z, and the first `dd327544` no-row at 10:29:24 which is already
    37 s AFTER the row was created on r4 at 10:28:47.557Z), the row IS present on the target r4 —
    so a pure `WHERE operation_id=?` fetch could not miss it. The fetch's `whereClause` is built
    from the routed UPDATE's *conjunctive WHERE columns*
    (`partition-cdc-parameterized-sql.js:146-151` → `whereClause[whereColumns[i]] = params[...]`),
    so the replayed fetch is a **compare-and-set guarded on prior column values** (e.g. the
    expected `status`/`workflow_step`/`updated_at` at emit time). When the row has already moved
    past that expected prior value the guarded `SELECT` matches 0 rows and logs "No row found"
    even though the row exists. This is a **guarded-CAS miss**, distinct from absence.

**Verdict:** the loop is a *mixture*. The binding durable defect is the true write-loss —
Pattern A rows never replicate off the leader r4 (5 ops, 1/4 replicas) and Pattern B terminal
transitions never replicate (2 ops diverged). The r4-targeted "No row found" re-drives layered
on top are, for at least `dd327544`, a **guarded-CAS mismatch on a row that is present**, not a
plain absence — the CDC replay's expected-prior no longer matches because the row's terminal
transition either never applied (completed_at=NULL on r4) or applied out of band. Either way the
op never terminalizes on quorum, so the re-drive is immortal.

---

## Task 4 — Same mechanism as the design (op 26c60ea9)?

**Same CLASS, different op type/partition.** The design's `26c60ea9` was a routed
`ratings`-partition **ADD** terminal UPDATE lost below persistence — a *data* partition, ADD.
This run's binding stuck ops are all **REPLACE** ops on **system** partitions
(`control_plane_publications-p1`, `sql_transaction_participants-p1`), whose ledger rows in
`replica_operations-p1` are written to the leader r4 and never reach the r5/r7/r8 quorum (Pattern
A), or whose terminal transition lands on r4 only (Pattern B). The underlying mechanism is
identical — **a `writeMode=sql-routed` single-write to the `replica_operations` ledger that
"succeeds" on the leader but is never durably replicated to a quorum, so downstream CDC re-drives
forever** — but the manifesting op here is a system-partition REPLACE, not a ratings ADD. Notably
these are also self-referential system-partition moves (control-plane/txn-participant replicas),
which is why the leader-only write is especially prone to never converging.

---

## Task 5 — Honest uncertainty (what disk alone cannot resolve)

1. **CAS-miss vs stale-read, precisely, for the r4-targeted late fetches.** Disk proves the row
   is *present* on r4 at the fetch instant (`dd327544`), which rules out plain absence there; and
   the code shows the fetch WHERE is conjunctive (guarded). But to prove the guard *column* that
   mismatched (status vs workflow_step vs updated_at) I need the exact routed `UPDATE … WHERE …`
   SQL + bound params from the original logs — those logs are now **overwritten** by the parallel
   run, so this is stated, not proven from this snapshot.
2. **Partition/replica identity of the three earliest ops** (`5f8638b8`, `228c62d8`, `782b7025`).
   I captured their type/status/step across replicas before the overwrite, but not their
   `partition_id`/`replica_id`. Log breadcrumbs (a paired `res-5f8638b8` on
   `storage_reservations-p1`, initial CDC target `replica_operations-p1-r1`) suggest `5f8638b8`
   is a reservation-backed replica move, but I cannot confirm it is/ isn't a `replica_operations-p1`
   self-move from disk now.
3. **Whether Pattern A's leader-only rows would EVENTUALLY replicate.** The snapshot is a single
   instant (post-steady, pre-shutdown). Disk shows 1/4 at that instant; it cannot by itself
   distinguish "permanent write-loss" from "in-flight replication that shutdown truncated." The
   fact they sat leader-only across 30–90 s of re-drive (created 10:28:47 → still 1/4 at 10:30:59
   for `dd327544`) is strong evidence of permanence, but is inference, not a disk invariant.
4. **Causal direction of divergence in Pattern B** — whether the leader advanced illegitimately
   or the followers stalled — needs the raft/apply logs (overwritten), not just the row snapshot.

---

## One-line diagnosis

`replica_operations-p1` ledger writes for system-partition **REPLACE** ops land on the leader
replica **r4 only** and never replicate to the r5/r7/r8 quorum — 5 ops present 1/4 (Pattern A,
non-terminal) and 2 ops with a leader-only diverged **terminal** transition (Pattern B) — so the
downstream CDC re-drive against r4 loops forever (for `dd327544` a **guarded-CAS miss on a
present-but-stuck row**, elsewhere a true **absence** on non-leader replicas). Same durability-lie
mechanism as design op `26c60ea9`, but manifesting on a system-partition REPLACE rather than a
ratings ADD.
