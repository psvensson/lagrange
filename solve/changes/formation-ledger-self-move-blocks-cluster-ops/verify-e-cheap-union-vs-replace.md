# Adversarial verification — E-cheap fresh-leader authoritative count read: UNION vs REPLACE

Scope: independent adversarial review of the UNCOMMITTED E-cheap diff. No code changed.
All claims file:line-cited. This gates a commit.

Diff under review:
- `src/rebalancer/unified-rebalancer-replica-state.js:60-476` (new
  `resolveFreshCurrentReplicasForCountDecision` :339, `mergeAuthoritativeReplicaRowsOverCache`
  :396, `authoritativeReplicaViewAgreesWithCache` :440, `getRawPartitionReplicaCacheRows` :300)
- `src/rebalancer/unified-rebalancer-rebalance-loop.js:143-144` (wiring at the count path)
- `src/rebalancer/unified-rebalancer-lifecycle-base.js:69,481-486` (arm on priority-leader gain)
- `test/convergence/dt6-formation-fresh-leader-stale-view-phantom-count-move.test.js` (new DT)

---

## VERDICT: **SHIP-AS-IS** (confidence ~0.78), with ONE mandatory doc tightening and TWO recommended follow-ups.

Union is the **correct** merge for the run-5 driver leg and is **strictly safer** than the
status quo. Do **NOT** change to replace: pure-replace reintroduces the exact under-count →
phantom-ADD that IS the run-5 failure mode (§3). The stale-HIGH-via-hard-DELETE over-count
leg is a **genuine but out-of-driver residual** that no read-merge can close without
under-count risk; it needs a *complementary* authoritative op-ledger read (§2, §4), not a
merge-semantics change. It is not a commit blocker because the run-5 cycle originates at the
stale-LOW leg (§1) and union cannot regress the status quo (§3).

Mandatory before commit: tighten the "corrects both legs" over-claim in the docstring
(`unified-rebalancer-replica-state.js:317-323`) and eval-path-e Q4 — union corrects the
stale-HIGH leg ONLY while the authoritative row still exists (soft `REMOVING`), NOT after the
authoritative row is hard-deleted (§2). See "Required doc fix" below.

---

## 1. Run-5 driver-leg determination → **ORIGIN = stale-LOW phantom ADD; REMOVE is downstream real cleanup.** Union is sufficient for the observed cycle.

The observed run-5 move oscillation (`research-selfmove-limit-cycle.md:53-63`):
- `21:01:10–12` node-0 ×3 `replace` — legit first spread off the seed (commits 3 voters).
- `21:01:28–59` **node-1 ×`add` (`increase_replica_count`)** — **over-creates voters**. node-1
  became leader from a CDC-lagged view that under-counted the just-committed voters →
  `activeCount` low → phantom count-increasing ADD. **This is stale-LOW.**
- `21:03:55–04:11` node-0 ×6 `remove` — sheds the voters node-1 added.

The epoch-3 REMOVE is **REAL cleanup of a genuine over-count** node-1 created, not a
stale-HIGH miscount: `research-selfmove-limit-cycle.md:58-63` ("sheds the voters node-1
added"; "CREATE_REPLICA handled 5×, REMOVE_REPLICA handled 4× — the cluster created replicas
then removed them"). eval-path-d §1 (`eval-path-d-view-completeness.md:44-69`) independently
confirms the phantom is a `currentReplicas`/`activeCount` miscount and that the surplus/REMOVE
leg "keys 100% on `activeCount`" — i.e. once the phantom ADD is suppressed there is nothing
for epoch-3 to remove.

Conclusion: the cycle **originates at the stale-LOW ADD**; the REMOVE is purely a downstream
consequence of the prior over-creation. Union corrects the stale-LOW leg
(`in-flight-aware-replica-count.js` `activeCount` fed the authoritative-missing voters) →
node-1 reads 3 voters authoritatively → no phantom ADD → no over-creation → no epoch-3 REMOVE.
**Union breaks the observed run-5 cycle. This is the make-or-break answer: union is sufficient
for run-5.**

## 2. Does `filterReplicasRetiredByTerminalReplaceOperations` already retire the stale extra voter? → **NO. It reads the FROZEN cache op-ledger, so it does NOT dissolve the concern.**

`resolveFreshCurrentReplicasForCountDecision` applies the retire-filter to the merged rows
(`unified-rebalancer-replica-state.js:386`). The filter
(`:693-706`) → `getTerminalReplaceSourceReplicaIds` (`:625-651`) reads terminal REPLACE ops
from `this.systemTableCache.filter(SYSTEM_TABLE_NAME.REPLICA_OPERATIONS, …)` (`:627-628`) —
i.e. the **same local CDC cache** that is FROZEN on a fresh leader across a drain handoff. In
exactly the drain-handoff window (the c7a3bf19 ghost:
`rebalance-coordinator-ledger-interlock-admission.js:258-303`, an op frozen at `STOPPING`
though terminalized) the terminal REPLACE op is **not visible as terminal in the cache**, so
the filter does **not** retire the drained source. Therefore the filter does **not** close the
stale-HIGH over-count gap under a frozen op-ledger. The concern is NOT dissolved.

Note the asymmetry that DOES help: for a *soft-delete* window the authoritative SERVICES row
still exists carrying `status='removing'` (`replica-handler-remove-execution-methods.js:190-194`
writes `REMOVING` before the delete). The union then overwrites the cache `active` status with
`removing` on identity collision (merge prefers non-null authoritative fields,
`unified-rebalancer-replica-state.js:420-427`), and
`activeReplicaIds`/`authoritativeReplicaViewAgreesWithCache` count only `active`
(`:446-458`) → the ghost is dropped from `activeCount`. **Union DOES fix the stale-HIGH
soft-`REMOVING` case.** It fails only after the hard DELETE (next paragraph).

## 3. Why UNION and not REPLACE — the under-count trap (make-or-break, resolved in favor of union)

Replica removal is a **two-commit, non-atomic** sequence on services-p1:
1. `persistReplicaStatusWithRetry(replicaId, REMOVING)` — status update
   (`replica-handler-remove-execution-methods.js:190-195`).
2. `getPartitionServiceRowOwner().removeReplica(...)` — **hard DELETE of the authoritative row**
   ("Delete the authoritative row before local shutdown", `:226-233`).

A REPLACE's new-voter INSERT is a *separate* write again. So an authoritative
point-in-time read of services-p1 can legitimately return `target-1` mid-transition
(old deleted, new not yet inserted, or vice-versa).

- **Pure REPLACE (trust authoritative membership only, discard cache):** during that
  non-atomic window the authoritative set is short by one → `activeCount = target-1` →
  the planner mints a **phantom count-increasing ADD** — which is *precisely the run-5
  failure mode* this fix exists to kill. Pure replace re-opens the stale-LOW hazard.
- **UNION (seed cache, overlay authoritative):** a transiently-missing authoritative voter is
  backfilled by the cache row → `activeCount` stays at target → no phantom ADD. Union is
  **monotonically safe vs the status quo**: it can only (a) ADD genuinely-committed voters the
  cache lacks (corrects stale-LOW) or (b) overwrite a colliding row's status to the
  authoritative value (corrects soft stale-HIGH). It can **never** invent a false over-count
  and never under-counts below `getCurrentReplicas()`. Worst case it equals today's behavior
  (a hard-deleted ghost survives). It cannot regress.

Given run-5 is stale-LOW-driven and the REPLACE is non-atomic, **union is the correct choice;
replace would trade a non-driver residual for a real regression.** This is the decisive reason
CHANGE-MERGE-SEMANTICS is rejected.

## 4. The residual: stale-HIGH via hard-DELETE — real, reachable, but not the driver, and not fixable by any merge

After the authoritative row is DELETED (`:226-233`) but before CDC catches up on the fresh
leader, the frozen cache shows the drained voter still `active` while authoritative omits it
entirely → **no identity collision → union keeps the stale active cache row → over-count not
corrected → a phantom over-count REMOVE is possible.** This is the SAME physical drain-handoff
event c7a3bf19 proved is real (it fixed that ghost on the *interlock* path); on the *count*
path it manifests as stale-HIGH. So it is not merely theoretical.

Why it is nonetheless not a blocker:
- It is **not the run-5 origin** (§1). Run-5's REMOVEs are real cleanup, not stale-HIGH
  miscounts.
- **No read-merge can close it without under-count** (§3): dropping the ghost requires trusting
  authoritative membership completeness, which is exactly what the non-atomic REPLACE violates.
- Union does not make it worse than the status quo (§3).

The correct, complementary fix (recommended follow-up, NOT this commit): make the retirement
filter authoritative — read terminal REPLACE ops via the c7a3bf19 owner-RPC pattern
(`queryAuthoritativeOperationVisibilityObservation` / `OWNER_RPC_REQUIRED`) inside
`getTerminalReplaceSourceReplicaIds` so a drained source is retired even against a frozen
op-ledger. That pairs with union (union fixes stale-LOW; authoritative-retire fixes
stale-HIGH-delete) and avoids under-count because retirement is keyed on a *committed terminal
REPLACE*, not on a bare membership snapshot.

---

## Diff correctness review (beyond union/replace)

**Strict owner-RPC actually enforced (not downgraded): CONFIRMED.**
`FRESH_LEADER_COUNT_DECISION_READ_QUERY_OPTIONS` sets
`authoritativeReadMode: OWNER_RPC_REQUIRED` (`unified-rebalancer-replica-state.js:70-76`).
The contract resolver maps `OWNER_RPC_REQUIRED` → `requireOwnerRpcRead: true,
allowSqlFallback: false` (`control-plane-system-table-gateway-read-contracts.js:166-174`), so
the read cannot silently route to the frozen local SQL engine — this is the cache-bypass
c7a3bf19 requires. `readAuthoritativeControlPlaneRows` delegates to
`gateway.readAuthoritativeRows(...)` carrying those options
(`control-plane-system-table-gateway.js:190-191`). Not downgraded.

**Constants resolve (no undefined-option bug): CONFIRMED.** `CONTROL_PLANE_AUTHORITATIVE_READ_MODE`
and `CONTROL_PLANE_READINESS_DIMENSION` are re-exported through `UNIFIED_REBALANCER_SHARED`
(`unified-rebalancer-shared.js:240,242`) and destructured at
`unified-rebalancer-replica-state.js:25-49`; `CONTROL_PLANE_RECOVERY_ELIGIBLE` exists
(`control-plane-readiness-constants.js:15`). So the query options are well-formed, not
`{authoritativeReadMode: undefined}`.

**Empty/failure → cache fallback: CORRECT, bounded, no throw escapes.** `!result.success ||
!Array.isArray(rows) || rows.length===0` → `return this.getCurrentReplicas()` (`:369-374`);
`catch { return this.getCurrentReplicas(); }` (`:377-379`); missing gateway → cache (`:352-354`).
No unbounded stall, no exception leaks into `rebalance()`. On the fallback path the window is
NOT disarmed, so it retries next tick — bounded, acceptable (matches the eval's "rare residual,
never an unbounded stall").

**Disarm signal `authoritativeReplicaViewAgreesWithCache` (active-id set equality): CORRECT for
the count decision, but can leave the window armed indefinitely (COST, not a miss).** It
compares the ACTIVE replica-id SETS (`:440-464`). For the count decision only set SIZE
(`activeCount`) matters, so set-equality is a sound "safe to stop re-reading" signal and cannot
disarm *while still stale-low* (a missing voter → size mismatch → stays armed). Premature
disarm is not possible for the count purpose (node/field drift with equal active-id sets does
not change `activeCount`). The real weakness is the opposite: it compares **raw** cache rows
(`getRawPartitionReplicaCacheRows`, pre-retirement) against authoritative, so a permanently
stale `active` cache ghost (e.g. a hard-deleted voter not yet CDC-reaped, or a
terminal-replaced source the frozen op-ledger hasn't retired) makes the sets never agree → the
window **never disarms → one owner-RPC every rebalance tick** on that priority partition until
CDC reaps the row or leadership changes. This is a bounded cost (priority control-plane
partitions are few; ticks are periodic) and errs toward MORE freshness (never a miss), so it is
not a correctness bug — but it should be noted, and it means the "self-releasing" claim in the
docstring (`:333-336`) is optimistic under exactly the drain-handoff ghost this fix targets.

**Window lifecycle / arming: CORRECT.** Armed only in the `isLeader && !wasLeader` priority
branch of `setLeader` (`unified-rebalancer-lifecycle-base.js:481-486` guarded by
`isControlPlanePriorityPartition()`), consumed on the count path. No path arms a non-priority
or non-leader entity. Re-arms on each leadership gain (intended, given the durability flap
re-elects). The only "armed forever" path is the never-disarm cost above — cost, not miss.

**No regression to non-priority / non-leader / message-group / runtime-service paths:
CONFIRMED.** The guard `entityType !== PARTITION || !armed || !isControlPlanePriorityPartition()`
→ `return this.getCurrentReplicas()` (`:340-346`). MESSAGE_GROUP and RUNTIME_SERVICE branches of
`getCurrentReplicas` are untouched (`:252-286`). DT test 3 asserts a non-priority partition
issues zero owner-RPC and returns the cache view unchanged
(`dt6-…-phantom-count-move.test.js:304-317`). Good.

**Merge helper parity: CONFIRMED.** `mergeAuthoritativeReplicaRowsOverCache` (`:396-438`) is a
faithful clone of the shipped `mergeReplicaRowsForSafety`
(`priority-publication-safety-rows.js:18-57`) — same seed-cache / overlay-authoritative /
skip-null-authoritative-fields / unkeyed-row handling. The union semantics is the *established*
in-repo pattern for authoritative-over-cache replica-row reads, which corroborates union as the
intended (and safe) choice, not an oversight.

---

## DT coverage gap (call-out) → recommend ADD-STALE-HIGH-COVERAGE as follow-up, not a blocker

The new DT exercises **only stale-LOW**: test 1 seeds cache=2 voters / authoritative=3
(`…phantom-count-move.test.js:164-172`) and asserts no ADD **and** no REMOVE (`:198-205`).
The "no REMOVE" assertion is **vacuous** — in a stale-LOW scenario the fresh 3-voter view is
exactly at target, so no REMOVE would be minted regardless of the fix. There is **no test**
where cache shows an EXTRA active voter absent from authoritative (stale-HIGH). Consequently
the DT does not prove the surplus/REMOVE leg at all, and in particular does not exercise the
one case where merge semantics is decisive (stale-HIGH hard-delete, which union does NOT fix).

Recommended (follow-up):
1. Add a stale-HIGH **soft-`REMOVING`** DT (cache shows voter `active`, authoritative returns
   the same voter with `status='removing'`) — union DOES fix this via field-overwrite; the DT
   locks that behavior and is red-on-revert of the merge.
2. Add a stale-HIGH **hard-delete** DT documented as `t.todo`/expected-residual (cache
   `active`, authoritative omits the row) — asserts the *known limitation* so the residual is
   captured in the suite rather than silently assumed fixed.

---

## Required doc fix before commit (mandatory, cheap)

The docstring at `unified-rebalancer-replica-state.js:317-323` ("corrects the single
`currentReplicas` input that feeds both the deficit and surplus legs") and eval-path-e Q4
("Suppresses BOTH legs") over-claim. They are TRUE for the *stale-LOW-driven* both-legs case
(where suppressing the phantom ADD removes the downstream REMOVE), but a reader will
reasonably infer that a **directly-read stale-HIGH** over-count is corrected — it is not, once
the authoritative row is hard-deleted (§2, §4). Tighten to: "corrects the shared `activeCount`
input for the stale-LOW (missing-voter) and soft-`REMOVING` cases; a hard-deleted authoritative
row (drain-completed ghost in a frozen cache) is NOT corrected by the union — that leg requires
an authoritative terminal-REPLACE retirement read (follow-up)."

---

## Summary table

| Question | Answer |
| --- | --- |
| Run-5 driver leg | **stale-LOW phantom ADD** (`research-selfmove-limit-cycle.md:53-63`); REMOVE is downstream real cleanup |
| Union sufficient for run-5? | **YES** — fixes the stale-LOW origin; strictly safe (§3) |
| Does the retire-filter dissolve the stale-HIGH concern? | **NO** — reads the frozen cache op-ledger (`:627-628`) |
| Union fixes stale-HIGH soft-`REMOVING`? | **YES** (field-overwrite, §2) |
| Union fixes stale-HIGH hard-DELETE? | **NO** — ghost survives; real but non-driver residual (§4) |
| Switch to replace? | **NO** — non-atomic REPLACE (`:190-233`) → replace under-counts → re-opens phantom ADD (§3) |
| Correct fix for the hard-delete leg | authoritative terminal-REPLACE retirement read (c7a3bf19 ops-read pattern), COMPLEMENTARY to union (§4) — follow-up |
| OWNER_RPC_REQUIRED enforced? | **YES** (`read-contracts.js:166-174`) |
| Bounded fallback, no throw escape? | **YES** (`:369-379`) |
| Disarm correct? | **YES** for count; may never disarm under the drain-handoff ghost = bounded owner-RPC-per-tick COST, not a miss |
| Non-priority/non-leader/MG/runtime regression? | **NONE** (`:340-346`, DT test 3) |
| DT exercises stale-HIGH? | **NO** — "no REMOVE" assertion is vacuous; coverage gap |
| **VERDICT** | **SHIP-AS-IS** (~0.78) + mandatory doc tightening + recommended stale-HIGH coverage & authoritative-retire follow-up |
