# Alt-1 analysis: exempt the DRAIN leg of an owned in-flight replacement from the self-move idle-ledger interlock

READ-ONLY analysis. HEAD `33e0026d`. Ground truth:
`solve/changes/voter-ready-60s-promotion-timeout/diagnosis-s13-run3.md`.

## VERDICT: DEAD-END (as specified)

The lever hooks at the wrong layer. On-disk run3 evidence shows the corrective
drain that Alt-1 wants to exempt — **a pure REMOVE of a stacked over-target voter
(r1-r4) that would return `replica_operations-p1` from 4 voters to 3** — is
**never planned**. The interlock is not skipping it; the planner never produces
it. Every REMOVE the interlock *does* skip targets the **failed learner r7**
(post-timeout cleanup), which is a non-voter and whose removal does not change
`activeVoterCount`. Exempting the drain leg therefore cannot green the 60s
timeout. The binding cause is upstream (planner over-target accounting), not the
interlock seam.

---

## 1. The interlock code and what it blocks (task 1)

File: `src/rebalancer/rebalance-coordinator-ledger-interlock-admission.js`.

- `isDisruptiveOperationLedgerSelfMove(type, partitionId)` (:64-69) returns true
  for `{REPLACE, REMOVE}` of any operation-ledger partition. The predicate keys
  on **op TYPE + partition-is-ledger only** — it has **no notion of count-delta**.
  A count-neutral or count-decreasing drain REMOVE of `replica_operations-p1` is
  caught identically to an expanding REPLACE.
- `ensureOperationLedgerSelfMoveSerialized` (:129-223): a disruptive self-move
  admits only when `resolveDisruptiveSelfMoveConflict` finds **no other live
  operation** (:160-174). During cold formation `replica_operations-p1` always
  has other live ops → the REMOVE/REPLACE defers with
  `operation_ledger_self_move_waiting_for_idle_ledger` (:171). The reverse
  direction (:192-222) defers every *other* op while a live ledger self-move
  exists. ADD is exempt (:116-117); emergency-priority control-plane ADD is
  exempt (:136-141, `isEmergencyPriorityControlPlanePartition`,
  `concurrent-add-budget.js:164`).
- Synchronous twin `runOperationLedgerInterlockAccountedCreate` (:437-535) is the
  single-coordinator gate; same type-based classification (:441-444).

**Why a count-neutral drain leg is caught:** the interlock's rationale (:18-27,
:99-122) is that *any* REPLACE/REMOVE of a ledger partition disrupts every other
in-flight op's progress writes against the mid-move ledger raft group (run-20
storm). It deliberately does not exempt by count-delta, because the disruption is
the raft config change itself, not the voter arithmetic.

## 2. Is the drain PLANNED then skipped, or never scheduled? (task 2) — THE decisive finding

Per-line extraction of every `Rebalancing move` for `entityId=replica_operations-p1`
across all five node logs (run3):

| moveType | replicaId | admissionReason | count |
|---|---|---|---|
| remove | **r7** (failed learner) | self_move_waiting_for_idle_ledger | 9 |
| replace | r6 | self_move_waiting_for_idle_ledger | 4 |
| replace | r5 | self_move_waiting_for_idle_ledger | 2 |
| replace | r2 | self_move_waiting_for_idle_ledger | 1 |
| replace | (n/a) | self_move_in_flight | 3 |
| replace | (n/a) | quorum_concentrated | 3 |
| add | (n/a) | quorum_concentrated | 14 |
| add | (n/a) | target_replica_count_already_satisfied | 12 |

Facts:

- **The only REMOVE moves target r7.** r7 is the LEARNER that timed out at
  11:49:12 (never promoted — LEARNER the whole 60s per diagnosis §1). The 9
  skipped REMOVEs span **11:49:14-11:49:23**, i.e. *after* the timeout → they are
  the **op-failure cleanup** of the failed learner, not a voter drain. r7 is not
  counted in `activeVoterCount` (`learnerCount:1`), so removing it does **not**
  reduce the group from 4 voters to 3.
- **No REMOVE of any of the four over-target voters (r1-r4) is ever planned** —
  skipped *or* executed. The stale 4th voter is never targeted for a shrink.
- The skipped REPLACEs (r6/r5/r2) are 1-for-1 relocations (add-new + remove-old);
  admitting them keeps the group at 4 voters, never 3.
- `target_replica_count_already_satisfied` (12×) on ADD confirms the planner's
  accounting reads the group as *satisfied* — it does not classify the 4-voter
  group as over-target-needing-shrink, so it plans relocations/spread REPLACEs,
  not a corrective REMOVE.

**Conclusion:** Alt-1's stated premise ("the corrective DRAIN … is SKIPPED by the
self-move interlock") is **not supported by run3**. The interlock skips (a)
failed-learner cleanup REMOVEs and (b) count-neutral REPLACEs. Neither reduces
the overflow. The move that would cure it does not exist in the planner's output.

## 3. Narrowest carve — and why it still would not fire (task 3)

The intended predicate: exempt a REMOVE of a ledger partition when it is the
**source-removal leg paired with an owned in-flight REPLACE whose replacement
learner is currently deferred** (i.e. `move.type==REMOVE` ∧ ledger partition ∧
the removed replica is a *voter* ∧ there exists an owned non-terminal REPLACE on
the same partition whose add-leg learner is deferred on
`would_exceed_target_replica_count`). Hook point: an early-return in
`ensureOperationLedgerSelfMoveSerialized` (:160) and its sync twin (:446),
mirroring the existing `isEmergencyQuorumRestoreAdd` exemption shape.

Even correctly implemented, **this predicate does not match any move in run3**:
the REMOVEs target r7 (a learner, not a voter), and no voter-drain REMOVE is
planned to match on. The exemption would fire on nothing that clears the
overflow. To make it fire, the **planner** would first have to emit a pure REMOVE
of an over-target voter — which is precisely the missing piece and lives in the
sibling `formation-ledger-over-target-accounting-drain-phase-replace-blind-spot`
domain, not in the interlock.

## 4. Safety — the most-dangerous seam (task 4)

Memory (`self-move-cdc-nontermination-research.md:176`) and the file header
(:18-27, :99-122) record that widening/narrowing this interlock is **ruled unsafe
(run-20/22) and ineffective**:

- **run-20** — co-admitting two ledger config changes makes all ops' progress
  writes fail against the mid-move ledger raft group → zero completions, client
  DDL starves. A drain-leg exemption *re-permits a second concurrent ledger
  membership change* (the drain REMOVE running alongside another live self-move),
  reintroducing exactly this storm during cold formation, when
  `replica_operations-p1` is churning hardest (r1→r7 here).
- **run-22** — release-too-early leaves the ledger quorum concentrated on the hot
  node (:201-213). A drain that removes the *wrong* voter (concentration-blind)
  can deepen concentration → the `operation_ledger_quorum_concentrated` cascade
  that already aborts this demo (diagnosis §4, ratings CREATE TABLE rejected
  `provisionable=0`).
- The narrow carve does **not** avoid these: a REMOVE is still a raft
  reconfiguration on the ledger group; "count-decreasing" does not make it
  progress-write-safe while a sibling self-move is live. Industry corroboration
  (memory :176): the safe pattern is reap-on-timeout + level-triggered
  re-derivation and **atomic count-neutral joint-consensus swaps**, *not*
  interlock-bypass widening.

**c7a3bf19 hook?** `resolveDisruptiveSelfMoveConflict` / `isStaleTerminalLedger
SelfMoveGhost` (:248-302) provide only a cache-bypassing owner-RPC *ghost-
terminality* re-verify — it lets an *authoritatively terminal* stale row stop
blocking. It does **not** classify a drain leg and does **not** help here: the
conflicting ops are genuinely live, not ghosts. No reusable drain-exemption hook
exists.

## 5. Proof strategy (task 5) — and why it can't be satisfied here

- **DT red-on-revert:** would assert a drain REMOVE admits while a sibling
  self-move is live (extend `test/convergence/dt6-rebalancer-formation-self-move-
  interlock.test.js`). This proves the *exemption* mechanically, but **cannot
  prove the binding observable moves**, violating the memory directive
  "DT must move the BINDING OBSERVABLE." The binding observable
  (`would_exceed_target_replica_count` deferrals → 0; voter-ready-60s timeouts →
  0) depends on a planner-emitted voter-drain that does not exist.
- **Live A/B (2-pre/2-post):** mandatory per the s9 `692c9dbb` load-amplification
  lesson. Predicted result: `would_exceed_target_replica_count` deferrals stay
  **non-zero** and timeouts stay **non-zero**, because the exemption fires on the
  r7-cleanup REMOVE (irrelevant to voter count) — i.e. the A/B would *refute*
  Alt-1, at real risk of *regressing* via the run-20 storm the exemption reopens.

## Where the real lever is

1. **Planner over-target accounting** (sibling `formation-ledger-over-target-
   accounting-drain-phase-replace-blind-spot`, prior fix `c78833f0`): make the
   rebalancer *plan a pure REMOVE that shrinks the 4-voter group to 3* instead of
   reading it `target_replica_count_already_satisfied` and re-issuing
   count-neutral REPLACEs. This produces the move Alt-1 assumes already exists.
2. **Overflow-model / promotion-guard change** (diagnosis Alt-2,
   `partition-service-learner-promotion-methods.js:525-533`): tolerate the owned
   replacement's own +1 without requiring a prior drain — but diagnosis §7
   already flags this cannot admit a *5th* voter into a group stacked at 4.

Alt-1's interlock exemption is neither necessary nor sufficient for either.

## Single biggest risk

Shipping Alt-1 spends the "most-dangerous seam" risk budget (run-20 storm
re-opened) on an exemption that fires only on failed-learner cleanup and
count-neutral relocations — **zero effect on the 4-voter overflow**, with live
A/B poised to both refute the fix and expose the storm. The narrow carve does not
mitigate this because the mitigation it needs (a planned voter-drain to exempt)
lives upstream, not at the interlock.
