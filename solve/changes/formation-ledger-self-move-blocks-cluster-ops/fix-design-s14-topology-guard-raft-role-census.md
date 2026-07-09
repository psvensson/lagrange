# Fix design (s14) — make the topology-guard target-count census raft_role-aware

> **VET: SOUND-WITH-CHANGES (not a kill). Corrections folded in below.**
> - **(REQUIRED, regression the first draft missed)** `observedDistinctNodeIds`
>   feeds BOTH decision-table predicates: `TARGET_NODE_OCCUPIED` (`:195`) and
>   `TARGET_REPLICA_COUNT_SATISFIED` (`:203`). Narrowing the shared array would
>   weaken the one-node-per-replica check → double-placement on the orphan's node.
>   FIX: keep `:195` on the FULL occupancy set; apply the voter∪in-flight narrowing
>   ONLY to the count comparison at `:203`.
> - **(REQUIRED, conservative discriminator)** the "non-voter ∧ no-live-op" drop
>   also matches the brief tail of EVERY REPLACE (op terminal, promotion write-back
>   lagging). Bias conservative: exclude a node ONLY when its rows are the full
>   orphan signature — `raft_role` non-voter ∧ `status==ACTIVE` ∧ no live in-flight
>   ADD-like op. A pre-active transitional row (PENDING/CREATING/SYNCING) or a live
>   in-flight op keeps the node counted (catching-up learner). The already-shipped
>   planner-side raft_role cap (`move-planner-move-calculation-methods.js:312`,
>   `activeVoterCount`) independently bounds durable over-creation, so a transient
>   over-drop can at worst yield a redundant, separately-deduped ADD move.
> - **(REQUIRED, reuse is not turnkey)** `computeInFlightAwareReplicaAccounting`
>   returns COUNTS (`activeVoterCount`, `inFlightAddCount` Set sizes), not node
>   sets. The count-census node-set is derived guard-locally from the rows +
>   `getEntityInFlightOperationRows` (which the guard's `this` already has,
>   `:275-302`) — real new code, not a call-through.
> - **(CONFIRMED)** attack #3 refuted: the interlock does NOT self-defer this ADD —
>   `replica_operations` ∈ `PRIORITY_RECOVERY_EMERGENCY_PARTITION_TABLE_IDS`
>   (`priority-recovery-admission-constants.js:43-46`), so `isEmergencyQuorumRestoreAdd`
>   early-returns at `ledger-interlock-admission.js:139`, exempting it from both
>   self-move blocking and quorum-spread-first. No new exemption needed.
> - **(CONFIRMED)** sufficiency past the guard is NOT log-provable — a downstream
>   `runConcurrentCreateBudgetGate` (`rebalance-coordinator-operation-creation.js:335`)
>   runs after the guard; emergency-priority reserves ADD slots so it will likely
>   admit, but the live re-run is MANDATORY, not optional.
> - **(MINOR, add a test)** guard merges cache+authoritative (last-write-wins) while
>   the interlock is cache-only; they agree for r5, but a raft_role cache/auth
>   disagreement on some other row could re-diverge — cover with a test.
>
> Corrected mechanism (authoritative): at `:203` compute a SEPARATE
> `countedNodeIds` = distinct nodes that have ≥1 row which is NOT an orphan
> (orphan = non-voter `raft_role` ∧ `status==ACTIVE` ∧ no live in-flight ADD-like
> op). `:195` `TARGET_NODE_OCCUPIED` stays on the full `observedDistinctNodeIds`.

---


Pinned root (`next-gate-topology-guard-vs-quorum-voter-disagreement-s14.md` +
orphan-phantom diagnosis). The control-plane settle stall is a single C1↔D1
count disagreement over ONE orphaned row:

- `replica_operations-p1-r5` (node-1) is a REPLACE that COMPLETED (source removal
  confirmed, storage reservation released) and reached local `status=active`, but
  its promotion-to-voter write-back was lost to a transient `No row found for CDC
  update` storm (09:52:05→09:53:27, never after). r5 is `status=active` in
  placement but NOT a raft voter — a durable orphan.
- Interlock `isQuorumVoterRow` (`operation-ledger-quorum-concentration.js:49-56`)
  requires status ∧ voter raft_role → excludes r5 → `totalVoters:2` →
  concentrated, `spreadActionable:true`, `feasibleTargetNodeId:node-3` every cycle
  for 13 min. CORRECT.
- Topology guard `isTopologyGuardBlockingServiceRow`
  (`rebalance-coordinator-topology-guard-methods.js:33-35,102-107`) counts any row
  with `status !== REMOVED`, NEVER inspects raft_role → counts r5's node →
  `observedDistinctNodeIds = 3 ≥ target 3` → `TARGET_REPLICA_COUNT_ALREADY_SATISFIED`
  → blocks every spread ADD to node-3/node-4 (406×). The SOLE barrier to dispatch.

Refuted: churn (only 2 creates all run; ADDs blocked pre-dispatch) and
promotion-defer (0 voter-ready-60s on this partition).

## The fix — count voters OR genuinely-in-flight replicas, exclude orphans

The guard's target-count decision (`:199-207`) exists to prevent over-creation:
do not ADD when the partition already has `targetReplicaCount` distinct nodes
*covered or being covered toward a voter*. Today it counts any live-ish row,
which wrongly includes the orphan. Make the census node-set =
distinct nodes of rows that are EITHER:
1. a **quorum voter** (reuse `isQuorumVoterRow` / `VOTER_RAFT_ROLES` — the now-unified
   authoritative predicate), OR
2. a **genuine in-flight promotable** replica — a non-voter row that has a LIVE
   in-flight ADD-like operation targeting it (a learner mid-catch-up).

An ORPHAN (non-voter raft_role AND no live in-flight operation — r5's exact
marks: op completed, reservation released) is counted by NEITHER clause → dropped
→ census = 2 < 3 → the spread ADD is admitted.

**Why not pure voter-only** (the memory's over-creation tension): a legitimately
catching-up learner has raft_role=learner too; counting only voters would stop
counting it and admit a redundant 4th ADD (the over-creation the guard exists to
prevent). Clause 2 keeps catching-up learners counted; the discriminator between
"catching-up learner" and "orphan" is the LIVE IN-FLIGHT OPERATION, not the
status or raft_role (both can read active/learner).

### Reuse / combine-logic

This is census recommendation #1. Preferred implementation reuses the single
authoritative accounting the over-creation cap already uses —
`computeInFlightAwareReplicaAccounting` joins committed rows with in-flight ops
and already knows voters-by-raft_role AND in-flight ADDs per node. If the guard
can obtain that join for the partition, the "voter ∪ in-flight-ADD node" set
falls straight out and the guard and cap share ONE author. If wiring the full
accounting into the guard is too invasive, the minimal version adds a raft_role
check to `isTopologyGuardBlockingServiceRow` plus an in-flight-op lookup the guard
already has access to under `enforceConcurrentOperationBudget`.

## Sufficiency — necessary, very likely sufficient, NOT log-provable

The guard block is the sole barrier; the interlock itself says spread is
actionable with a concrete target. Excluding the orphan → 2 → ADD admitted →
(creation+promotion demonstrably works: r4/r5 both voter-ready in ~5s) → a real
3rd voter → `totalVoters` 2→3 → interlock releases → dependent spread proceeds.
NOT provable from the stall logs (no ADD was ever admitted, so downstream
promotion is unobserved; r5 proves a replica CAN reach active yet fail to
register). Therefore a live re-run is MANDATORY to confirm sufficiency.

## Independent mechanism (created the orphan; out of scope, low re-trip)

The orphan came from a premature REPLACE priority-recovery drain-settle + a lost
CDC write-back (`formation-reservation-reconcile-premature-orphan-release` /
`routed-mutation-silent-ledger-write-loss` family). It needs a REPLACE drain leg
AND the transient CDC-miss window — both ABSENT for a pure spread ADD and after
formation quiesces — so it does not defeat this fix. It is the one thing that
could re-orphan a new replica if the CDC-miss window recurred; leave it as a
separate follow-on, do not scope-creep.

## Validation

1. **DT red-on-revert**: topology-guard test where the partition has 2 voters on 2
   nodes + 1 orphan (status=active, non-voter raft_role, no in-flight op) on a 3rd
   node, and a spread ADD to a 4th node. Assert: with the fix the ADD is ALLOWED
   (census=2<3); a genuine in-flight learner on the 3rd node instead → ADD BLOCKED
   (census counts it, over-creation prevented); revert → orphan case wrongly
   BLOCKED = red. Reuse `test/rebalancer/rebalance-coordinator-topology-guard.test.js`
   fixtures.
2. **Anti-regression**: topology-guard suite (18/18) + the census-consolidation
   suites stay green.
3. **Decisive live experiment (MANDATORY, proves sufficiency)**: re-run the
   affinity demo; confirm the chain — ADD to `2a7a9b1a`/`9ca597ad` ADMITTED → new
   `replica_operations-p1` replica reaches voter-ready → quorum `totalVoters` 2→3
   → interlock hold releases → control plane settles (no 120s stall). If the new
   replica reaches active but `totalVoters` stays 2, the orphaning mechanism is a
   live independent blocker and must also be fixed — that is the falsification
   signal.
