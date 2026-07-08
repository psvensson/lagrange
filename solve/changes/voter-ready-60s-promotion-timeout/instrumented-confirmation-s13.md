# Instrumented confirmation: the planner/guard voter-count read disagreement is real

Session s13. Two temporary diagnostics (`TEMP-VOTER-READ-DIAG`, reverted after)
added to compare the two voter-count reads on control-plane priority partitions,
then fresh affinity-demo runs. Goal (user-directed): confirm the read
disagreement is durable and NOT a per-node cache artifact before designing a fix.

## Instrumentation

- **Planner side** (`move-planner-move-calculation-methods.js`, right after the
  `computeInFlightAwareReplicaAccounting` call): for control-plane priority
  partitions, log every current replica row's `{status, raft_role}`, the
  planner's `activeCount` (status==ACTIVE), and a `raft_role`-based live-voter
  count — whenever the two disagree.
- **Guard side** (`partition-service-learner-promotion-methods.js`, at the
  over-target promotion defer): enumerate the voter rows the guard counts, with
  `{replicaId, nodeId, raftRole, status}`.

## Result

| run | outcome | planner divergences | guard over-target defers | voter-ready-60s timeouts |
|---|---|---|---|---|
| 1 | converged | **50** | 0 | 0 |
| 2 | converged | 0 | 0 | 0 |
| 3 | converged (w/ churn) | **291** | **258** | **16** |

Run 1 confirms the disagreement; run 2 was a fully-clean convergence (trap-6 "N
runs = N modes"); **run 3 captured the failing mode** (guard-side over-target
defers + timeouts) and, decisively, the two-defect structure below. (Run 3
converged to [4/4] eventually despite 16 timeouts — the timeouts do not always
abort; the REPLACE retries can succeed once the surplus finally drains.)

### The disagreement is real, durable, and cross-node (run 1)

- **50 divergence events**, emitted by **3 independent nodes** (node-2: 19,
  node-3: 2, node-4: 29) → NOT a per-node cache artifact; multiple independent
  rebalancer owners observe it.
- **Uniform +1**: in every single event `liveVoterByRole = activeByStatus + 1`.
  Distribution of `(activeByStatus → liveVoterByRole)` at target 3:
  `2→3` (16), `3→4` (23), `4→5` (5), `5→6` (4), `1→2` (2). The by-role count
  reaches 4/5/6 against target 3 — the same over-target overshoot the s13 run3
  guard saw as `activeVoterCount=4`.

### The exact mechanism — a `status` vs `raft_role` column mismatch

The single divergent row, every time, on `sql_write_operations-p1`:

```
replicaId: sql_write_operations-p1-r6   status: creating   raftRole: follower
```

A replica that has **already been promoted to a raft voter** (`raft_role =
follower`, a member of `ACTIVE_VOTER_ROLES`) but whose SERVICES-row **`status`
column still lags at `creating`** (not yet flipped to `active`).

- The **planner** counts active replicas by **`status === ACTIVE`**
  (`in-flight-aware-replica-count.js:116`) → **misses r6** → reads 3.
- The **guard** counts active voters by **`raft_role ∈ voter roles` ∧ live
  status** (`partition-service-learner-promotion-methods.js:267`,
  `isActiveVoterServiceRowForPromotion`; `creating` is a live status, not
  removing/failed/removed) → **counts r6** → reads 4.

The two reads key on **different columns of the same row**, and during the
promotion/creation window the `raft_role` advances to a voter before the
`status` column catches up to `active`. That one row is the persistent "4th
voter": the guard enforces the over-target promotion block against it (4→5
exceeds the ceiling) while the planner's over-creation cap
(`move-planner-move-calculation-methods.js:333`, `activeCount > target`) never
fires (its count is 3) — so the planner neither stops minting replacements nor
plans the surplus drain.

### Why run 1 converged despite the divergence

The +1 by-role overshoot was present but **transient** — it cleared (r6's status
caught up to `active` and/or an old voter drained) before a NEW learner was
waiting to promote against it. The binding failure (s13 run3: 383 over-target
defers + 13 timeouts) is the SAME mechanism when the overshoot instead
**coincides** with a waiting REPLACE learner AND the surplus does not drain
inside the 60s budget.

## Run 3 — the failing mode, and a TWO-DEFECT structure

Run 3 produced 258 guard over-target defers (229 on `replica_operations-p1`, 29
on `sql_transaction_participants-p1`) + 16 voter-ready-60s timeouts + 291 planner
divergences. Two facts sharpen the root into two distinct defects:

**(1) Stacking cause — the planner under-counts DURING the promotion window.**
The 291 planner divergences are driven by rows with `status` ∈
{`creating`(374), `syncing`(113)} but `raft_role = follower` — promoted voters
whose status column lags. The under-count is up to **2** (distribution
`(byStatus→byRole)`: `2→4` ×196, `3→4` ×92, `2→3` ×3). While the followers are
status-lagged, the over-creation cap (`activeCount = status==ACTIVE` count) reads
2–3, stays below target, and **keeps admitting replacements** → the group
over-creates.

**(2) No self-heal — the fully-materialized surplus never drains.** Every one of
the 258 guard over-target defers shows **4 voter rows ALL `status=active`**
(`replica_operations-p1`: on 4 distinct nodes; `sql_transaction_participants-p1`:
4 rows across 3 nodes = a co-located pair). So by the time the guard blocks the
paired learner, the status-lag has RESOLVED and the overshoot is a real,
fully-active 4-voter group. At this point the planner's over-creation cap DOES
see `activeCount=4 > target 3` — but it only **zeroes `addMoves`** (stops
adding); it **never emits a REMOVE** to drain 4→3. So the overshoot is durable →
the guard refuses the learner for the full 60s → timeout.

## Verdict — empirically confirmed, and refined to two defects

The root named in `alternatives-synthesis.md` is **confirmed**: a planner/guard
voter-count read disagreement, mechanically a **`status`-column (planner) vs
`raft_role`-column (guard) mismatch**, with a promoted-but-status-lagged voter as
the divergent row. Confirmed durable (50 + 291 events over 2 runs), **cross-node**
(3 independent nodes in run 1), and **not a cache artifact** (run 3's 4 counted
voters are distinct fully-active replicas on distinct nodes). The binding failure
mode (defers + timeouts) is now captured live under instrumentation, not just
inferred from s13 run3.

**The fix has two parts** (both point at the same accounting site):
1. **Count voters by authoritative `raft_role`, not `status===ACTIVE`**, in the
   over-creation cap (`move-planner-move-calculation-methods.js:333`,
   `in-flight-aware-replica-count.js:116`). `raft_role` is already carried on the
   rebalancer rows (`:238`). This makes the cap fire DURING the promotion window
   → stops the over-admission that stacks the group (defect 1).
2. **On `voters > target`, PLAN a surplus-voter drain REMOVE**, not merely defer
   adds. Today the cap only zeroes `addMoves`; nothing emits the 4→3 shrink, so a
   fully-active overshoot is durable (defect 2). The drain must be planned (and
   then must actually dispatch — the earlier Alt analyses showed the only REMOVEs
   in-flight target the failed learner, and the self-move interlock is NOT the
   blocker because no voter-drain REMOVE is ever created).

Both are read-path / planning changes on the move-planner (fails safe by
deferring), LOWER blast radius than touching the interlock/remove-safety seam.
Constraints unchanged: NOT a count heuristic (voter-visibility read class;
count-based fixes refuted 3×), DT red-on-revert, and mandatory 2-pre/2-post live
A/B (hot path).

Instrumentation was temporary (`TEMP-VOTER-READ-DIAG`) and has been reverted; raw
evidence preserved under `instrumented-run-evidence/`.
