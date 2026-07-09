# Fix design s14 — extend Part 1's authoritative-voter cap to the REPLACE-mint path

> **VERDICT: REFUTED at design (adversarial vet, 2 independent kills). DO NOT BUILD.**
> - **KILL #1 (dead code):** the proposed gate lives in the REPLACE block guarded
>   by `addMoves.length > 0` (`move-calc:507`). Part 1's cap (`:345-370`) empties
>   `addMoves` whenever `surplusVoterCount = max(activeCount, activeVoterCount) >
>   target`. The gate's condition (`activeVoterCount > target`) STRICTLY IMPLIES
>   Part 1's, same `isControlPlanePriorityPartition` guard, and `addMoves` is
>   never repopulated between `:370` and `:507`. So the gate is unreachable in the
>   exact state it targets. **Corollary: the planner does NOT mint REPLACEs while
>   over-target at all** — Part 1 already prevents that. The 462 replace events are
>   not fresh over-target mints from this site.
> - **KILL #2 (hypothesis unsupported):** the surplus-drain REMOVE is
>   NEVER-GENERATED (structural: per-node `excess=0` when voters are on distinct
>   in-target nodes `:384`; or `hasPendingMove` source-skip `:392` →
>   `unified-rebalancer-move-execution.js:142`; or spread-floor `:466`), NOT
>   attempted-and-blocked-by-churn. Silencing mint churn drains nothing.
> - **Second untouched mint site**: priority-recovery follow-up REPLACE at
>   `unified-rebalancer-follow-up-move.js:527-544`, outside `calculateMoves` and
>   outside this serialization — a source of REPLACEs this fix can't see.
> - **The real lever** is the one this design deferred: generate / re-drive the
>   surplus-drain REMOVE (Alt-3 remove-leg re-drive) — higher blast, separate
>   quest. Before ANY gate, instrument (info-level, not `logger.debug`) WHY the
>   REMOVE is never emitted for the 4th voter (node-in-target-excess=0 vs
>   source-pending-skip). Full vet reasoning in session log; this doc kept as a
>   recorded negative result to stop re-treading.

---
_Original design below (refuted — preserved for the record)._


Session s14, after the instrumented reproduction
(`instrumented-reproduction-s14.md`, commit `fc2f16ca`) resolved the fork to the
**upstream over-creation** branch. This designs that fix. It is a HYPOTHESIS to
be live-A/B-validated, not a proven fix — the two refutations this session
(CL-045, wrong-gate drain) both came from building on an under-confirmed seam, so
this doc is explicit about what it assumes and how the A/B falsifies it.

## Evidence-grounded root (from the s14 repro)

On the failing partition `sql_transaction_participants-p1` (run 2):
- **Durable 4-voter overshoot by authoritative raft_role** (`activeVoterCount=4`,
  target 3), all four `status=active` at the guard (`lag=0` ×59). Not transient,
  not a status illusion.
- **The paired source-drain REMOVE is never generated** (`candidateRemoveCount=0`,
  `drainRemovePlanned=false` on 50/58 over-target planner lines). Part 1's cap
  fires (zeroes adds) but emits no REMOVE.
- **Heavy REPLACE re-mint churn**: 462 `replace` + 197 `replace_replica` + 58
  `self_move_in_flight` events on the partition. This is the "mutual-defer
  standoff" the existing serialization comment (move-calc :531-546) already
  names.
- The deferred learner (`…-r6`) is a *further* replacement that cannot promote
  (4→5 > maxAllowed 4) → 60s timeout ×4.

## Why the obvious fixes are dead (do not rebuild)

- **Standalone drain / plan-the-REMOVE**: KILL1 (REMOVE ∈ disruptive self-move
  types → interlock admits only into idle ledger, blocked in the stuck window) +
  KILL2 (`hasPendingMove` matches a REPLACE's SOURCE id → skips exactly the
  un-drained source). Re-confirmed live this session (drain never generated).
- **Stranded-credit-timing** (grant +1 only after syncing voter resolves): the
  repro shows NO late-resolving syncing voter — the 4 voters are already active.
  There is no timing window to wait on. Refuted by evidence.
- **Ordering inversion** (promote replacement only after source drains):
  min-floor + leader-handoff dead-end (drops below fault tolerance; source may be
  leader).
- **Joint consensus / atomic ConfChangeV2**: liferaft has no joint consensus
  (add-then-remove legs, verified). Large separate quest, not this fix.

## The fix — gate the REPLACE-mint path on authoritative voter surplus

**Hypothesis**: the durable 4-voter state persists not because a single drain is
blocked once, but because continuous REPLACE re-mint churn (462 replace events)
keeps the partition's ledger/interlock busy, wedging the *existing* REPLACE's
own remove-leg so it never drains 4→3. Part 1 stopped the count-increasing ADD
path from re-creating surplus, but the **REPLACE-mint path is still gated only by
the in-flight-REPLACE-*operation* count** (`inFlightReplaceCount`, move-calc
:548-558), NOT by the authoritative voter count. When a prior REPLACE's operation
terminalizes but its source row lingers as an undrained 4th voter,
`inFlightReplaceCount` reads 0 and the serialization mints a fresh REPLACE into an
already-over-target group — re-arming the churn.

**Change** (single site, extends Part 1's read, LOW blast radius): in the REPLACE
serialization block (move-calc :559-564), gate `replaceCount` additionally on the
authoritative voter surplus. Concretely, when
`this.isControlPlanePriorityPartition()` AND
`inFlightAccounting.activeVoterCount > targetReplicaCount` (the SAME authoritative
read Part 1 put in the over-creation cap, `surplusVoterCount`), force
`replaceCount = 0` — do not mint a new REPLACE into a group already over target by
raft_role. The unpaired spread ADDs are already deferred by the existing
`replaceCount < naturalReplaceCount` guard (:584-606). Genuine deficit fill
(`activeVoterCount < target`) is untouched — the gate is strictly "already over
target," so it can never block recovery.

This is mint-PREVENTION, not drain. It touches neither the interlock (KILL1) nor
`hasPendingMove` (KILL2) — no new REMOVE is generated. It relies on the existing
REPLACE's own remove-leg draining once the competing churn stops.

## What this fix does NOT do (honesty)

It does not itself drain the existing 4th voter. Its efficacy rests entirely on
the hypothesis that **stopping re-mint churn lets the already-in-flight remove-leg
complete**. If the remove-leg is wedged for a reason INDEPENDENT of churn (e.g. a
genuine interlock deadlock that never clears even when idle), this fix will
green nothing and the A/B will show a persistent 4-voter overshoot with churn
reduced but timeouts unchanged. That is the falsification signal, and it is
cheap to read.

## Validation protocol (mandatory — hot REPLACE-mint path)

1. **DT red-on-revert**: a directed test that drives a critical partition to a
   4-raft_role-voter state with a terminalized prior REPLACE + lingering
   undrained source, asserts the serialization mints NO new REPLACE while
   `activeVoterCount > target`, and goes red when the gate is reverted. Plus an
   accounting unit that the gate reads `activeVoterCount` (raft_role), not
   `activeCount` (status).
2. **Anti-regression**: full rebalancer suite (was 162/162) + the dt6 sweep +
   the Part 1 falsifier must stay green (the gate must not fire under target).
3. **Live 2-pre / 2-post A/B** on the affinity demo, with a folded-in
   info-level diag on: (a) REPLACE mint count per partition, (b) the surplus
   remove-leg's drain progress (does 4→3 happen post-fix?), (c)
   voter-ready-60s timeout count. KEEP only if: churn materially down AND the
   4-voter overshoot drains AND timeouts → 0, with no new failure mode. This is
   the exact protocol that caught the CL-045 refutation.
4. **New counter**: `replace_mint_blocked_over_target` so the gate's firing is
   observable in production.

## Necessary-not-sufficient caveat (carried forward)

All 3 s14 runs abort at the same downstream gate
(`operation_ledger_quorum_concentrated → provisionable=0` at [2/4]); runs 1&3
reach it with zero voter timeouts. Even a fully successful voter fix is unlikely
to green the demo alone — the ledger-concentration blocker (scoped separately) is
the co-binding root. Success criterion for THIS fix is the run-2 mode
(voter-surplus deadlock resolved + churn down), NOT demo-green.

## Open seam (fold into the A/B run, do not block design on it)

The *specific* reason the surplus remove-leg is never generated
(`hasPendingMove`-skip vs. node-excess=0) was not decisively captured — the
REMOVE-skip debug lines are `logger.debug` (filtered) and run 2's full node logs
were cap-evicted. The A/B run's folded-in diag (item 3b) resolves it live: if
post-fix the remove-leg drains once churn stops, the churn-wedge hypothesis
holds; if it stays stuck at 4 with churn gone, the wedge is independent and the
fix is refuted — pivot to re-driving the wedged remove-leg (Alt-3) as a separate,
higher-blast quest.
