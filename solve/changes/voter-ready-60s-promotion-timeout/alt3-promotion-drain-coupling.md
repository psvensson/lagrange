# Alt-3 analysis: promotion-block ↔ drain coupling (add→promote→remove)

READ-ONLY analysis. HEAD `33e0026d`. Builds on and does not restate
`diagnosis-s13-run3.md` (verified root: control-plane partition stuck at 4 active
voters vs target 3; the replacement learner defers 383× on
`would_exceed_target_replica_count` and times out at 60s).

**Verdict: DEAD-END** for run3's binding blocker. The wall that actually skips the
run3 drain is the **self-move interlock (Alt-1)** at operation *creation*, not the
remove-safety voter-ready gate (Alt-3) at operation *dispatch*. Alt-3 attacks a
real but *downstream* coupling that the run3 drain never reaches; even a correct
Alt-3 fix is neither necessary nor sufficient to green run3.

---

## 1. Does the promotion path signal, or only wait? — ONLY WAITS (confirmed)

`checkLearnerPromotion`
(`src/partition/partition-service-learner-promotion-methods.js:456-564`) on the
over-target branch does exactly one thing: logs `LEARNER_PROMOTION_DEFERRED` and
calls `scheduleLearnerPromotion(DEFERRED_RECHECK)` (`:558-560`), which arms a
single `setTimeout` at `learnerCatchUpCheckIntervalMs` (~1s;
`resolveLearnerPromotionDelayMs` `:100`) that just re-invokes `checkLearnerPromotion`
(`:63-65`). There is **no** call into the owner/ledger/rebalancer to reap the
stacked 4th voter, no counter, no event. It is a purely passive ~1s re-poll of a
condition only an external drain can change. So Alt-3 option (iii) — "have the
defer emit a level-triggered signal to reap the 4th voter" — is a genuine gap:
the promotion path is a pure consumer of the voter count, never a driver of the
drain.

## 2. The REPLACE ordering is add→promote→remove; the transient 4 is BY DESIGN

The remove-safety evaluator gates the source-removal leg of a REPLACE on the
replacement being voter-ready:
`operation-workflow-remove-safety-evaluator.js:501-531` — when
`isReplaceRemoveInitialDispatch` and `!replacementReplicaVoterReady`, it returns
`buildDeferredRemoveSafetyEvaluationForOperation(... IS_NOT_VOTER_DASH_READY)`.
`replacementReplicaVoterReady` (`:511-521`) is `isVoterReadyRoutableReplica(...)`
(or a priority-topology evidence variant) on the *replacement* row. So the source
voter is not removed until the replacement has promoted — this is **promote-before-
remove**. The promotion guard's ceiling `maxAllowedVotersAfterPromotion =
targetReplicaCount + 1` (`:525-530`) is sized exactly to admit that one transient
overflow voter. A **single** REPLACE therefore runs cleanly: 3 voters → add
learner → promote (transient 4, allowed by the +1 credit) → remove source → 3.

The run3 failure is not a single REPLACE — it is **stacking**. The group already
sits at 4 voters (a prior REPLACE promoted its target but never drained its
source), so r7's new learner would be the 5th: `votersAfterPromotion = 4+1 = 5 >
maxAllowed 4` → permanent defer. The +1 credit is already spent by the prior,
un-drained replacement (matches the diagnosis §7 correction: `maxAllowed=4` in
every deferral, so no per-replacement credit can ever admit a 5th voter).

## 3. Circular-wait hypothesis: TRUE locally, but not the run3 root

There **is** a genuine circular wait, and it is exactly the coupling Alt-3 names —
but only for r7's *own* remove leg, and it is a *symptom*, not the root:

- r7's source-removal is deferred because r7's replacement (its learner) is not
  voter-ready (`remove-safety-evaluator.js:522-531`).
- r7's learner cannot become voter-ready because promotion is over-target
  (`learner-promotion-methods.js:532-561`), and the over-target condition is the
  **pre-existing** 4th voter, not r7's own transient.

Trace it with voters {A,B,C,D} (D = un-drained prior overflow, target 3) + r7
learner T7 replacing source A:

- **Break Alt-3 only** (let r7 remove A on a caught-up *learner* instead of
  voter-ready): {B,C,D}+T7 → T7 promotes 3+1=4 → {B,C,D,T7} = **still 4**. D was
  never drained. Does not green, and it dropped a voter before its replacement
  was a voter (a raft-safety regression) for no gain.
- **Break Alt-1** (admit the separate drain REMOVE of D despite a live sibling):
  remove D → {A,B,C} = 3 → T7 promotes 3+1=4 (transient, allowed) → r7 removes A
  (T7 now voter-ready) → {B,C,T7} = 3. **Healthy.**

So the necessary break is the drain of the **pre-existing** 4th voter (D), which
is a *separate* ledger self-move REMOVE — not r7's remove leg. Alt-3 changes only
r7's remove leg and cannot clear D.

## 4. Which wall fires for the run3 drain — Alt-1, at a DIFFERENT stage than Alt-3

The two levers are **different walls at different pipeline stages**, not two sides
of one wall:

| Lever | Wall | Stage | Call site |
|---|---|---|---|
| **Alt-1** | `self_move_waiting_for_idle_ledger` interlock | operation **creation** | `rebalance-coordinator-ledger-interlock-admission.js:160-174` via `rebalance-coordinator-operation-creation.js:133,180` |
| **Alt-3** | replacement-not-voter-ready remove-safety gate | operation **dispatch** | `operation-workflow-remove-safety-evaluator.js:522-531` via `operation-workflow-dispatch-response-reconcile.js:257` |

A REMOVE (or count-neutral REPLACE) of a `replica_operations` partition is a
`OPERATION_LEDGER_DISRUPTIVE_SELF_MOVE_TYPES` member
(`ledger-interlock-admission.js:25-27`). `ensureOperationLedgerSelfMoveSerialized`
admits it only into an idle ledger; with any other live operation present it throws
`OPERATION_LEDGER_SELF_MOVE_WAITING_REASON_CODE` (`:160-174`) and the move is
**never created**. Remove-safety (`evaluateRemoveSafety`) only runs on the dispatch
of an operation that already exists. The diagnosis §4/§7 forensics show the
`replica_operations-p1` drain moves skipped with `self_move_waiting_for_idle_ledger`
and only 1 REMOVE ever running — i.e. the drain is stopped at **creation
(Alt-1)**, so remove-safety (Alt-3) is never reached for it.

**Alt-1 and Alt-3 are genuinely different walls.** They only look like "two sides
of one wall" because r7's own remove leg *does* stall on the Alt-3 gate — but that
stall is downstream noise caused by the Alt-1-blocked drain of D. Fix Alt-1 and
r7's Alt-3 stall dissolves on its own (T7 promotes, then r7 removes normally). The
converse is false.

Note Alt-3 option (i)/(iii) — "actively drive the paired REMOVE from the promotion
defer" — does not escape this: the REMOVE it would drive is itself a disruptive
ledger self-move, so it lands right back on the Alt-1 interlock at creation.

## 5. Safety + proof

- **Raft safety.** Removing a voter before its replacement is voter-ready drops
  voter quorum / risks a durability window; this is precisely why remove-safety
  gates on `replacementReplicaVoterReady` (`:511-531`). An Alt-3 remove-side
  relaxation (accept a caught-up *learner*) weakens that invariant and, per §3,
  buys nothing here. Memory flags the adjacent interlock seam as the
  "most-dangerous seam" (runs 20/22); any real fix must be carved to the drain leg
  of an owned in-flight replacement only, DT red-on-revert, plus aggregate
  2-pre/2-post live A/B (s9 `692c9dbb` load-amplification lesson).
- **Proof shape (if Alt-3 were pursued).** A DT on
  `operation-workflow-remove-safety-evaluator` asserting a source-remove proceeds
  on a caught-up learner would go red-on-revert, but it would prove a lever that
  does **not** move the binding observable (`would_exceed_target_replica_count`
  deferrals / voter-ready timeouts stay > 0 because D is never drained) — a
  "DT-must-move-the-binding-observable" violation. That is the tell that Alt-3 is
  the wrong lever.

## 6. Recommendation

Route to **Alt-1**: unblock the drain leg of an owned in-flight replacement past
the `self_move_waiting_for_idle_ledger` interlock at
`rebalance-coordinator-ledger-interlock-admission.js:160-174` (the same
`formation-ledger-self-move-blocks-cluster-ops` /
`formation-control-plane-move-interlock` seam the diagnosis already implicated).
Alt-3's only durable contribution is diagnostic: the promotion defer's lack of any
reap signal (§1) is a real gap, but wiring that signal only helps once the drain it
would trigger can actually be created — i.e. after Alt-1 is fixed. Do **not** ship
an Alt-3 remove-safety relaxation as the run3 root fix.
