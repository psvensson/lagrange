# Census — divergent replica/voter-count predicates across the system (s14)

User steer: "see where you can combine logic" + "know if there are other points
in the system where decisions are made differently about the same things." This
is the system-wide map. It is the basis for deciding what to unify BEFORE
touching the hard, multi-session-refuted `formation-ledger-self-move-blocks-cluster-ops`
core — do not patch site-by-site.

Statuses = ReplicaStatus {PENDING, CREATING, SYNCING, ACTIVE, REMOVING, REMOVED,
FAILED}; roles = {LEADER, FOLLOWER, CANDIDATE, LEARNER}.

## Decision-point clusters (who counts "the same thing")

**A — "how many replicas/voters fill the target?" (the count invariant)**
- A1 `in-flight-aware-replica-count.js:131` `computeInFlightAwareReplicaAccounting` — the single join; every rebalancer count should derive here.
  - A1a `activeCount` (:157): status==ACTIVE, ANY role (incl LEARNER).
  - A1b `activeVoterCount`/`isLiveVoterRow` (:62,265): NOT {FAILED,REMOVING,REMOVED} ∧ role∈{leader,follower,candidate}. (Part 1 surplus read.)
  - A1c `occupiedCount`/`OCCUPIED_STATUSES` (:23): {PENDING,CREATING,SYNCING,ACTIVE}.
  - A1d `deficitEffectiveCount` (:275): ACTIVE + inFlightADD + drain-phase REPLACE credit.
- A2 `move-planner-move-calculation-methods.js:341-349` over-creation cap: `MAX(activeCount,activeVoterCount) > target`.
- A3 same `:587,652`: `deficitEffectiveCount >= target` (deficit-fill / follow-up ADD). **Still uses the activeCount base (A1a).**
- A4 same `:127-137` `placementReplicas` vs `activePlacementReplicas` (`PLACEMENT_OCCUPIED_STATUSES :39`).
- A5 `unified-rebalancer-follow-up-move.js:158,468` occupancy + inFlightAdd >= target.

**B — "which replicas are healthy / occupy a slot?"**
- B1 `unified-rebalancer-budget-planning.js:325` `getHealthyReplicas`: ACTIVE (critical: also non-LEARNER ∧ ready-node ∧ has address).
- B2 same `:376` `getReadyNodeOccupiedReplicas`: ACTIVE incl LEARNER on ready/alive node.
- B3 `move-planner-state-methods.js:446+` `analyzePrioritySpread`/`isCriticalState`.

**C — quorum concentration (voter)**
- C1 `operation-ledger-quorum-concentration.js:48` `isQuorumVoterRow`: status∈{ACTIVE,REMOVING} ∧ role∈{leader,follower,candidate}. Drives the interlock hold (`:130`), `overTarget`, `spreadActionable`. Consumers at `rebalance-coordinator-ledger-interlock-admission.js:315,351,373`.

**D — topology guard (distinct nodes)**
- D1 `rebalance-coordinator-topology-guard-methods.js:102` `isTopologyGuardBlockingServiceRow`: status NOT in {REMOVED} (counts PENDING/CREATING/SYNCING/LEARNER/ACTIVE/REMOVING/FAILED), ANY role. Decision `:193-207`: distinctNodes ≥ target → `TARGET_REPLICA_COUNT_ALREADY_SATISFIED` (blocks spread ADD).

**E — learner promotion guard**
- E1 `partition-service-learner-promotion-methods.js:267` `isActiveVoterServiceRowForPromotion` / `countActiveVoters:644`: live ∧ non-LEARNER voter role. E4 `:456` drives the voter-ready-60s defer.

**F — load / serve readiness (narrower, INTENTIONAL)**
- F1 `admin-service-discovery.js:233`: ACTIVE ∧ {leader,follower} (NO candidate) ∧ address.
- F2 `replica-state-machine-constants.js:168`: {leader,follower} only.

**G — node-level (adjacent, not a voter count)**: `control-plane-readiness-node-service-rows.js:465` `isClusterMemberHealthy`; provisioning node eligibility.

## Concrete disagreements + the bug each can cause

1. **DIVERGENCE 1 — LIVE DEADLOCK (C1 vs D1).** Ledger with 2 voters + a
   learner/creating 3rd-node row: C1 = 2 voters → concentrated → defer all deps;
   D1 = 3 distinct nodes → target satisfied → block the spread ADD. Self-referential
   formation deadlock (the current settle stall). Deficit-side twin of A2's surplus fix.
2. **DIVERGENCE 2 — REMOVING (C1 vs A1b/E2).** C1 counts a REMOVING draining
   source as a voter; A1b/E2 exclude it → concentration can read 3 voters (release
   one tick early) while cap/promotion read 2. Documented-intentional
   (`operation-ledger-quorum-concentration.js:21-23`, run-22 ack) — co-locate, don't collapse.
3. **DIVERGENCE 3 — ACTIVE learner (A1a/A1d/A3 vs E1).** A status==ACTIVE LEARNER
   counts as a filled slot in the deficit gate (A3) but not as a voter in E1 →
   premature-satisfied / under-provisioned voters. A2 fixed this on the SURPLUS
   side (MAX with activeVoterCount); the DEFICIT side A3 still uses activeCount.
4. **DIVERGENCE 4 — three occupancy notions (B1 vs B2 vs A4).** Health vs occupancy
   vs placement-exclusion. Largely intentional; standing misuse/drift risk.
5. **DIVERGENCE 5 — candidate role (A1b/C1/E1 include vs F1/F2 exclude).**
   INTENTIONAL + correct (candidate is a quorum voter, not serve-ready). Keep F narrower.
6. **DIVERGENCE 6 — triplicated role-set constants.** `VOTER_RAFT_ROLES`
   (`in-flight-aware-replica-count.js:49`), `QUORUM_VOTER_RAFT_ROLES`
   (`operation-ledger-quorum-concentration.js:27`), `ACTIVE_VOTER_ROLES`
   (`partition-service-shared.js:201`) — three independent Sets, all
   {leader,follower,candidate} today. Silent drift risk. (Load-ready
   {leader,follower} subset should derive from it.)

## Consolidation, ranked

**(a) Fixes a live bug**
1. **D1 counts quorum-voter rows** (reuse C1's `isQuorumVoterRow`) so the guard and
   interlock share ONE "voter occupies this node" predicate → breaks Divergence 1.
   **Mandatory caveat:** naive voter-only count = a heuristic refuted 3× here; the
   shared predicate must be *voter OR promotable-catching-up learner* (the E4
   promotion boundary) so a syncing 3rd learner still blocks a redundant 4th ADD
   while a STUCK non-voter does not block the spread. Promotable-vs-stuck signal is required.
2. **Deficit gate A3 aligns its ACTIVE term with `activeVoterCount`** (as A2 did on
   the surplus side) → closes Divergence 3.

**(b) Drift prevention (no live bug, low risk)**
3. **Collapse the three identical voter raft-role Sets (Divergence 6) into one
   exported constant** consumed by A1b/C1/E1; derive F's {leader,follower} subset
   from it. Zero behavior change today; provable no-op; do first, mechanically.
4. **Co-locate the REMOVING-is-a-quorum-voter decision (Divergence 2)** behind one
   documented boundary.

**Intentional — do NOT collapse:** Divergence 5 (candidate vs serve-ready),
Divergence 4 (placement-occupancy vs voter), Divergence 2's REMOVING intent,
node-level G.

## Prior work on this theme

`voter-ready-60s-promotion-timeout` (Part 1 surplus read-disagreement),
`formation-ledger-over-target-accounting-drain-phase-replace-blind-spot`
(`c78833f0` drain-phase credit), `formation-ledger-post-spread-voter-visibility-latency`
(durable role-write). All attack pieces of the "one authoritative count" theme;
**none has unified C1↔D1**, which is the open live deadlock.
