# S10 dependents census (amendment-1 step 4), 2026-09-26

Subject: the two planner compensators the lead decision S10 names for deletion
"if the census confirms no other dependent":

1. `restoreLedgerSurplusDrainActiveVoters`
   (`src/rebalancer/unified-rebalancer-ledger-surplus-drain-replica-state.js`,
   mixed into `UnifiedRebalancerReplicaState`), called once from
   `UnifiedRebalancerRebalanceLoop.rebalance`.
2. The "completed REPLACE can leave a 3-1" branch of
   `resolveLedgerSurplusDrainTargetState`
   (`src/rebalancer/unified-rebalancer-rebalance-loop.js`), reached through
   `readyNodeLedgerSurplusDrainPlanning` (ledger concentration over target, no
   surplus-drain capability, at least one READY node).

Both were introduced together by a8f546c34 (quest
red-main-multi-join-formation-convergence, 2026-09-10) against a live trace in
which an early-closed REPLACE (REMOVED with its source still an ACTIVE voter)
hid that source from the planner's retirement projection.

## Code dependents (static)

`git grep` over src, test, scripts and docs (solve excluded) at a023223ba:

| Reference | Kind |
|---|---|
| `unified-rebalancer-replica-state.js` import + mixin of the helper module | wiring only |
| `unified-rebalancer-rebalance-loop.js` the single call site and the branch | the subject |
| `readyNodeLedgerSurplusDrainPlanning` | used only by the call site and the branch in the rebalance loop |

`rebalancer-evaluation-methods.js:74` reads `ledgerConcentrationOverTarget`
independently (it lets an evaluation proceed); it does not use either
compensator and is kept unchanged.

## Test dependents (dynamic)

Deleted both, then ran every test file that references the ledger-surplus
capability, the concentration gate or completed-REPLACE visibility:
`ledger-quorum-spread-hold-cure-drain-admission`,
`priority-recovery-planning-gate-diagnostic`,
`priority-recovery-stale-planning-visibility`,
`recent-completed-replace-target-visibility`,
`formation-placement-target-evidence-absent`,
`cl-043-surplus-drain-completed-election-terminates`.

Result: 5/6 files green; the only reds were two tests in
`ledger-quorum-spread-hold-cure-drain-admission.test.js`:
- "REGRESSION: a completed REPLACE claim cannot hide its still-ACTIVE source
  from an authorized operation-ledger surplus drain" (asserts 4 and 5:
  `no_changes_needed`);
- "REGRESSION: with two READY nodes, a 3-1 ledger surplus drains one duplicate
  before a third spread target exists" (asserts 4 and 5:
  `no_changes_needed`).

Both construct their shape from `createCompletedReplaceOperationRow` - a
REMOVED REPLACE whose source is still an ACTIVE voter, the pre-repair ghost.
In the second test the 3-1 shape exists only because of that ghost: without
the restore the planner sees three replicas and the branch condition
`currentReplicas.length > targetReplicaCount` is false. Neither test has a
non-ghost input. Both are superseded under R09 (comment in the test file);
their corrected contract is P1/R-1a (no REPLACE completes while its source is
a committed voter), witnessed in `replace-source-removal-owner.test.js`.

## What the census cannot rule out

The census is over code and tests. It cannot prove that no live path other
than a ghost REPLACE produces a ledger at 4 voters over 2 nodes (for example an
ADD overshoot during serial formation). If one exists, that partition now
stays degraded without a count-decreasing drain until a third node is READY
(the capability path, which is kept, then drains it). The formation lanes of
the change-cone run (T5) are the evidence for that; no such shape is known.
Recorded, not assumed away.
