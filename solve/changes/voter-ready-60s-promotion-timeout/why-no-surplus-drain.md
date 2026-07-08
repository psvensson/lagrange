# Why a fully-active 4-voter control-plane partition never gets a surplus REMOVE

Read-only investigation (s13). HEAD `f83032da`. Answers: is fix part (2) a
count/gate tweak to an existing surplus-removal path (A), or a new planning
branch (B)?

## Verdict up front: **(B) a new planning branch**

There is **no** "authoritative voter count > target → remove the surplus voter"
path in the move planner. The site that already *detects* the condition
(`move-planner-move-calculation-methods.js:329-347`, the over-creation cap) is
**suppress-only** — it zeroes `addMoves` and emits nothing. The only actual
REMOVE-emitting paths key on a *different* trigger (per-node over-representation)
and a *status-lagged* input set, so neither fires for the failing case.

## Every REMOVE-emit site in `calculateMoves`, classified

1. **Failed/inactive cleanup** (`:194-222`), `reason=REPLICA_FAILED`. Removes
   `status===FAILED` or `terminalFailedReplaceTargetReplicaIds` rows. This is the
   path that produces the only REMOVEs forensics saw — targeting **r7, the failed
   learner**. Not a surplus drain.

2. **Per-node over-representation loop** (`:356-467`) — the ONLY
   relocation/surplus path. `reason = NODE_NOT_IN_TARGET` when a node's
   `targetCounts` slot is 0, else `SPREAD_REPLICAS`. Trigger is
   `excess = currentCount(node) - targetCount(node)` where:
   - `currentCount` is derived from **`activePlacementReplicas`** =
     `status === ReplicaStatus.ACTIVE` rows only (`:134-137`), grouped per node
     (`:253-261`);
   - `targetCount` comes from `targetCounts`, built from `targetState.targetNodes`
     (`:174-180`), which is capped at `min(targetReplicaCount, sortedNodes.length)`
     = **3 entries** (`move-planner.js:698-701`).
   This is a **per-node spread/relocation** trigger, NOT a global voter-count
   drain. It never compares an authoritative voter count to `targetReplicaCount`.

3. **Over-creation cap** (`:329-347`), the detection site. Condition
   `inFlightAccounting.activeCount > targetReplicaCount` is exactly the
   "voters > target" test — but the body only does `addMoves.length = 0`. **No
   REMOVE is ever emitted here.** There is no other branch keyed on count>target.

**Conclusion for task 3:** for the "already at the target node-set but over-count"
case there is **no** surplus-removal path at all.

## Why the per-node loop (path 2) does not rescue the case

Two independent structural reasons, both confirmed against the run3 evidence:

- **(status-lag window)** The promoted-but-status-lagged 4th voter has
  `raft_role ∈ voter roles` but its services-row `status` still reads
  `creating`/`syncing` (instrumented-confirmation defect 1). Because
  `activePlacementReplicas` filters `status===ACTIVE` (`:134`), that row is
  **excluded** → not grouped into `replicasByNode` → generates **no per-node
  excess** → no REMOVE candidate. The over-creation cap reads the same
  status-based count (`in-flight-aware-replica-count.js:116`, `status===ACTIVE`),
  reads 3, and does not fire → keeps admitting → stacking.

- **(fully-active snapshot)** When status catches up (all 4 `active` on 4 distinct
  nodes / a co-located pair), the per-node loop *could* in principle emit
  `NODE_NOT_IN_TARGET`/`SPREAD_REPLICAS` — but forensics show it does not
  (`target_replica_count_already_satisfied ×12`; no REMOVE on r1-r4). The surplus
  voter is a drain-phase REPLACE **source** that is either (a) still carrying an
  in-flight REPLACE remove-leg → `hasPendingMove` skip (`:368`), or (b) retained
  as an incumbent in the 3-node `targetNodes` set the placement owner chose — so
  it yields **zero per-node excess**. The loop's decision is keyed on
  node-vs-targetNodes, which the drain-phase source does not violate.

So path 2 is a spread path fed a status-lagged set; it is not a count-surplus
drain and cannot be made into one by a gate tweak.

## What a correct drain must do (task 4)

- **Which voter:** the surplus voter NOT in `targetNodes` (the drained REPLACE
  source whose replacement already promoted), or one of a co-located pair on an
  over-represented node. Prefer a **non-leader**
  (`resolveRemovalSourcePartitionLeaderNodeId`, `:232`; `isLeaderRemovalCandidate`,
  `:233-250`) so the drain does not force a leadership move / CL-043 wedge.
- **Safety gate:** the priority-spread standalone check already in-file
  (`buildPriorityStandaloneRemoveSafety` / `analyzePrioritySpread`, `:88-113`),
  PLUS the dispatch-time quorum floor `projectQuorumAfterRemoval`
  (`operation-workflow-remove-safety-evaluator.js:47-102`,
  `projectedVoterReadyCount >= minReplicaCount` and `PUBLISHED_SPREAD`).
- **Odd-count preservation:** the guard *re-promotes* to restore an odd count
  (`checkLearnerPromotion`, `partition-service-learner-promotion-methods.js:456-564`;
  it defers on `wouldExceedTargetReplicaCount` and prefers odd). Draining 4→3
  yields an odd, at-target group and clears the over-target defer — safe, and it
  is exactly the corrective the guard is waiting for. Must never drop below the
  `minReplicaCount` quorum floor.

## Prior-attempt guardrails (task 5)

Memory (`service-data-affinity-placement.md:234-247`) records **3 adversarial
refutations of count-based move-planner fixes** on the sibling mint-side quest
(occupiedCount, deficit+all-phase-replace double-credit, min(occupiedSurplus,
drainPhaseReplace) degenerating). The surviving class is **row-op-linked /
authoritative-visibility read** (`c78833f0` deficit credit; `c7a3bf19`
cache-bypassing owner-RPC; `136aebbc` `services.raft_role`). The same memory line
called the 4th voter a "formation TRANSIENT" the cap+drain clear on its own —
**that framing is now INVALIDATED** by the s13 instrumented run (the 4th voter is
durable/fully-materialized, does not self-clear). So: do not re-chase a count
heuristic; the drain trigger must read the authoritative raft-voter count (the
same source the guard's `countActiveVoters` uses,
`partition-service-learner-promotion-methods.js:644-653` /
`isActiveVoterServiceRowForPromotion:267-274`).

## Narrowest correct shape

Graft the new branch at the **existing detection site** (`:329-347`): read the
voter count **authoritatively by raft_role** (fixing defect 1's cap blindness in
the same stroke) and, when `voterCount > targetReplicaCount`, in addition to
zeroing surplus-driven adds, **emit one surplus-voter drain REMOVE** selected +
gated as above. This is a new planning branch (new emit) attached to a condition
that is already computed but currently only suppresses.

**Single biggest risk:** a standalone surplus REMOVE racing the guard's
re-promotion and/or the stuck REPLACE remove-leg → double-drain below quorum, or
hot-path churn amplification (s9 `692c9dbb` precedent). Must gate on
`hasPendingMove` + `replicasInRemoving` + the remove-safety quorum floor, cap it
to one drain per tick (mirror the REPLACE serialization at `:523-540`), and prove
via DT red-on-revert + mandatory 2-pre/2-post live A/B on the observables
(`would_exceed_target_replica_count`→0, voter-ready-60s timeouts→0, a surplus
REMOVE actually planned+executed).
