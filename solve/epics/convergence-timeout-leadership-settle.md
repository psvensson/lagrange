---
id: convergence-timeout-leadership-settle
roadmapRow: RM-0.1-fs-rolling-restart
status: discussing
graduatesTo: null
links:
  quests: [rolling-restart-core-stability]
  upstreamEpic: topology-convergence-hardening
  relatedEpic: control-plane-write-wedge-leader-local-establishment
  relatedSpec: membership-lifecycle-placement-hard-cutover
---

# Convergence-timeout + leadership-settle — the rolling-restart PASS blocker AFTER the slow-rejoiner remove-safety wedge was cleared

> # 🚦 SESSION HANDOFF 2026-06-24 (END-OF-SESSION STATE — read this first)
>
> **LANDED + VALIDATED (default-ON):** (1) early-admin SQL engine (`f68d1625`) — eliminated the 30s
> `QUERY_ENGINE_UNAVAILABLE` that was the ACTUAL scenario-failing assertion; gate `051927Z` produced the
> campaign's **first scenario-PASS**, SAFE 3/3. (2) no-progress fast-fail harness fix (`7d68b9ba`) — frozen
> clusters fail-fast at ~30s instead of polling 120s (leader flaps no longer count as progress); ~90s faster
> failing gates.
>
> **DEFAULT-OFF building blocks (NONE is the PASS lever):** `LAGRANGE_PR_REPLACE_TARGET_FAST_PROMOTION`
> (`1b68c565` — clears spread/drain stall but trades for over-target+leadership churn); `LAGRANGE_PR_DRAIN_LOCAL_PROGRESS`;
> `LAGRANGE_PR_SUPPRESS_OVERTARGET_FOLLOWUP_ADD` (`41aae9fb` — **DID NOT ENGAGE** in gate `134940Z`,
> green-by-construction guard; needs a `currentReplicas.length>=target` guard + engagement log); C-2
> `LAGRANGE_PR_PRIORITY_INCUMBENT_STICKINESS` (bypassed — over-replication comes from the priority-recovery
> FOLLOW-UP, not `calculatePartitionPlacement`).
>
> **RESIDUAL FRONTIER:** `leadership_unstable` from **OVER-REPLICATION** — a returned node ranks top by
> SUITABILITY (`move-planner.js:650`) and the priority-recovery follow-up emits a bare ADD onto it
> (`unified-rebalancer-follow-up-move.js:403`), overshooting critical-system partitions 3→4 → raft leader churn →
> 15s quiet window never closes → `convergence_timeout`. SAFE (pure liveness). **NOT a frame rewrite** (membership
> single-owner cutover already DONE+REFUTED; joint consensus = wrong layer). Best gate PASS = 1/3 (within N=3
> variance). **NEXT:** corrected over-replication suppression (real-state repro + engagement log) and/or
> incumbency in the follow-up target selection. Full file:line trail + discipline lessons:
> external memory `rolling-restart-handoff-20260624` + `gate-walltime-smoothness-audit`.
>
> ---
> # 🚦 LIVE FRONTIER MOVED (2026-06-24) → [`control-plane-write-wedge-leader-local-establishment.md`](control-plane-write-wedge-leader-local-establishment.md)
> Head A (`leadership_unstable`) is worked out here: it is raft leader-map churn from load-driven
> critical-system replica migration; the C-2 lever (`LAGRANGE_PR_PRIORITY_INCUMBENT_STICKINESS`, commit
> 8fa06823) is landed **flag-off but UNVALIDATED** — the N=3 gate `stat-gate-20260623T183833Z` showed C-2
> did NOT mechanistically engage (the `leadership_unstable` absence was variance). C-2 is a **parked
> side-thread** (its salvage next-step is in this epic's decision-log: add a positive engagement log +
> a directed DT repro of a REAL captured over-replication event, since the unit test was green-by-
> construction for a load-only trigger the gate shows isn't the real one). **The dominant blocker peeled
> to Head B = `PRIORITY_CONTROL_PLANE_RECOVERY_PENDING` (the W-1 establishment-write root), which dominates
> regardless of C-2 → that epic is now the live START-HERE.** Read its top banner first.

> **FRESH-AGENT START HERE.** This epic is self-contained. Read
> [`docs/steering/operational-ground-truth.md`](../steering/operational-ground-truth.md)
> first (deterministic-first / gate-last / research-existing / subagent-verify /
> **coupled-invariant: stop single-frontier patching**). All file:line below were verified
> at HEAD `a71e0b32` (2026-06-23) but are POSITIONAL — re-grep before trusting. This epic is
> the SUCCESSOR frontier to [`slow-rejoiner-progress-or-evict.md`](slow-rejoiner-progress-or-evict.md)
> (now resolved: R1+R3 landed + promoted default-ON, gate `stat-gate-20260623T164130Z`).
> It sits under the umbrella [`topology-convergence-hardening.md`](topology-convergence-hardening.md).

## Intent (why this epic exists)

`rolling-restart-core-stability`'s `doneWhen` is **scenario-PASS 3 consecutive** (NOT
convergeRate). After R1+R3 ELIMINATED the priority-recovery remove-safety wedge (the slow
rejoiner `7493b0ab` un-drainable cluster — `analyze:priority-recovery-residuals` witnessCount
3→0; baseline dominant `priority_recovery_workflow_progress_event_driven` gone), the cluster is
still SAFE every run (3/3 CONVERGED, missing=0, 0 corrupt/breach/exit) but scenario-PASS is
**still 0/3**. The dominant blocker PEELED to the **next, previously-masked layer**, which has
**two coupled sub-heads** that both trace to control-plane establishment under restart load —
NOT a rebalancer-op bug.

## The evidence (gate `stat-gate-20260623T164130Z`, R1+R3+un-mask, N=3)

| run | wall | dominant reason | signal |
| --- | --- | --- | --- |
| 1 | 523s | **`leadership_unstable`** | reasons `leadership_churn` / `sustained`; 2 leadership_unstable witnesses |
| 2 | **929s** | **`convergence_timeout`** | dispatch churn storm: `dispatch_sending`×858, `dispatch_creating`×495, `dispatch_stopping`×363, `operation_failed`×297, `process_not_alive`×180 |
| 3 | 633s | `convergence_timeout` | same dispatch-churn shape, lower volume |

`analyze:topology-convergence` on run 2 → `rootCauseClass: startup`, `reason: readiness_retryable`,
`nextAction: wait_for_readiness_support`, `blockingDependency: active_gate_snapshot_coverage`.
These reasons dominate **22 (`convergence_timeout`) / 8 (`leadership_unstable`)** historical gates
(`analyze:latent-blockers`) — long pre-dating R1/R3, so they are the genuine masked tail, not an
R1/R3 artifact (R3 engaged with **no** leadership-churn regression — only 8 `target_leader_election`
events run 3).

## Mechanism — TWO COUPLED SUB-HEADS (file:line, re-grep before trusting)

### Head A — `leadership_unstable`: load-driven critical-system replica MIGRATION churns the raft leader map (REFRAMED 2026-06-23)

> ⚠️ **The original framing below the rule was WRONG and is superseded.** It is kept struck-through
> for provenance. The corrected mechanism (two independent gate-evidence traces + classifier +
> placement-owner code all agree) is above the rule.

**Corrected mechanism.** The classifier keys `leadership_unstable` PURELY on the raft per-partition
`leader_node_id` signature, NOT on rebalancer `setLeader`:
`control-plane-quiescence-snapshot.js:544` `leadershipStable = leaderCount>0 && leaderQuietElapsedMs >= stableWindowMs(15000)`;
`leaderQuietElapsedMs` resets whenever the per-partition `leader_node_id` map changes. The churn that
keeps resetting it: **the move planner MIGRATES critical-system partition replicas (`replica_operations-p1`,
`sql_write_operations-p1`, `sql_transactions-p1`, `sql_transaction_participants-p1`,
`control_plane_publications-p1`) onto freshly-returned nodes ~90–145s after they rejoin**, emitting
`increase_replica_count` ADDs that push the partition to 4–5 members vs target 3, then tearing the
surplus down (`spread_replicas`/`node_not_in_target`/`replica_failed`/`budget_exceeded`). Each
add-then-(throttled-)remove migration round reshuffles the raft leader and resets the 15s quiet window.

**Why the migration happens (root, file:line confirmed):** `calculatePartitionPlacement`
(`move-planner.js:650`) sets `targetNodes = placementOwnerDecision.intent.targetNodeIds`, ranked PURELY
by `SUITABILITY` (CPU/load) at `placement-owner-decision.js:182-190` — the ONLY floors are CL-038
leader-retention + in-flight transition reservations (`placement-owner-decision.js:208-267`). There is
**NO general incumbency bias**: a freshly-returned, now-low-load NON-leader node ranks high → enters the
critical-system cohort → DISPLACES a current incumbent → migration. The slow rejoiner 7493b0ab is a
healthy SURVIVOR throughout (re-introduction-loop framing REFUTED); leadership is raft-role churn on a
near-stable membership set.

**Amplifier (Y, a SEPARATE B-side lever — not Head A):** new replicas on restarted nodes can't establish
their control-plane writes (write-wedge) → `replica_failed` → re-plan loop, converting one migration into
repeated churn. `budget_exceeded` remove-skips (seen at currentCount:4 target:3) let adds outrun the
throttled surplus drain, sustaining over-replication.

**LEVERS REFUTED this session (do NOT retry):**
- **C-1 (`resolveRebalancerLeadership` debounce) is DEAD.** The hysteresis already landed (commit
  e9f1c8bb 2026-06-21, default-ON) and was PRESENT in the 164130Z gate that still churned. It governs
  the rebalancer WORKER, which the classifier never observes. It cannot move this signal.
- **Recency/settle-window ADD-defer (`LAGRANGE_PR_DEFER_REJOIN_RESPREAD_ADD`) is REFUTED.** The
  over-replicating ADD fires ~90–145s post-return; by then lease/heartbeat/`created_at`/readiness have
  ALL healed and are indistinguishable from a stable survivor, and there is NO persisted "returned-at"
  anchor column on the nodes table — a self-lifting window has nothing to fire on. Also: a state-predicate
  "defer add when at/over target" DEADLOCKS the spread-floor remove guard (`move-planner-move-calculation-methods.js:545`)
  → neither add nor remove → `convergence_timeout`.

**Open question RESOLVED 2026-06-23 → verdict (B), lever confirmed.** Trace of the +309s
`sql_write_operations-p1` flip (run1): **7493b0ab KEPT its leader replica (r2 `active` the whole run,
never removed); the flip was a FOLLOWER-add-driven re-election.** The surplus ADDs r7/r8 grew the group
3→5; liferaft applies join/leave incrementally with NO term bump (`@markwylde/liferaft/index.js:824-883`,
via `partition-service-raft-peer-cache-reconciliation.js:141` `joinPeer`), BUT `majority()`
(`liferaft/index.js:443`) rises with peer count and the two fresh followers don't heartbeat reliably, so
the sitting leader loses its hold → heartbeat-timeout election picks 8be8d30f. **Therefore the lever is
NOT leader-retention extension and NOT drain/replace-ordering** (no leader replica was evicted) — it is
**prevent the unnecessary load-driven migration ADD itself** (the 3→5 over-replication). That is
incumbency stickiness (C-2 form (a) below), which also avoids the remove-floor deadlock because retaining
healthy incumbents yields NO adds AND NO removes → a stable cohort.

> ~~Node-wide bootstrap readiness oscillates `join_ready↔degraded` on `PRIORITY_CONTROL_PLANE_RECOVERY_PENDING`~~
> ~~and is ANDed into every partition's rebalancer leadership through `resolveRebalancerLeadership()`~~
> ~~(`partition-service-core-base.js:454`); when `isBackgroundWorkReady()` flips, all ~28 partitions'~~
> ~~rebalancer leadership flips in lockstep.~~ — **SUPERSEDED: classifier keys on raft leader_node_id, not
> rebalancer setLeader; see corrected mechanism above.**

### Head B — `convergence_timeout`: control-plane WRITE/establishment readiness-budget burn
Restarted/rejoined nodes burn the full readiness budget waiting on `active_gate_snapshot_coverage`
/ `topology_not_ready`, with a dispatch-churn storm (operation create/send/stop + `operation_failed`
+ `process_not_alive`). This is the SAME root as the mgmjf 7th-node formation and the
profiled gate-wall regression: the priority-partition control-plane WRITE path funnels to a single
active replica (joiners have no local replica → reads/writes funnel to the seed), so establishment
writes (`replica_operations` / `control_plane_publications`) wedge under load
(`inFlightReplicaOperations:1` + `priority_spread_gap`). See [[convergence-time-regression-and-next-steps]]
(READ its TOP block) and [[mgmjf-formation-rebalancer-churn]]. Owner classifier:
`src/diagnostics/topology-convergence-owner-witness.js` + `budget-timeout-accounting.js`.

### Why coupled
Both heads share the node-wide readiness/establishment substrate: the control-plane write wedge
(B) keeps `PRIORITY_CONTROL_PLANE_RECOVERY_PENDING` set, which drives the `isBackgroundWorkReady()`
oscillation that flaps rebalancer leadership (A), whose churn further delays establishment writes (B).
Single-frontier patches will bounce `leadership_unstable`↔`convergence_timeout`. Prefer an atomic
cross-owner move (per operational-ground-truth coupled-invariant guidance) — likely: make the
control-plane write/establishment path fast/leader-local AND debounce the readiness→leadership AND.

## Candidate levers (ranked; all safety-sensitive — touch leadership + control-plane writes)

> ⚠️ COUPLED invariant. Reproduce BELOW the gate with a directed DT repro before any gate. Each
> lever flag-gated default-off. Subagent-verify safety (never split-brain rebalancer leadership;
> never drop a real raft leader; never relax a write-quorum).

1. **Lever C-2 — incumbency stickiness: stop load-driven critical-system replica MIGRATION (Head A; CONFIRMED form, REPLACES dead C-1).**
   Root: `move-planner.js:650 calculatePartitionPlacement` → `targetNodes = placementOwnerDecision.intent.targetNodeIds`
   ranked by SUITABILITY/load only (`placement-owner-decision.js:182-190`); the ONLY floors are CL-038
   leader-retention + in-flight transition reservations (`:208-267`) — **no incumbency bias**, so returned
   low-load nodes displace healthy incumbents → migration → 3→5 over-replication → quorum-raise re-election
   (verdict B). **Confirmed lever (flag-gated default-off, form (a)):** add an incumbent-retention
   reservation to the placement-owner decision for control-plane-priority partitions — reserve the CURRENT
   healthy+feasible incumbent nodes (those in `currentReplicas` whose node is still feasible) into
   `targetNodes` ahead of marginally-lower-load returned candidates, during the non-quiescent window.
   Reuse the exact reservation seam CL-038 used (`placement-owner-decision.js:208-267`,
   `buildPlacementOwnerReservationResult`); a GONE/infeasible incumbent is NOT floored back (it stays out
   of `rankedNodeIds` → still replaced → recovery never stalls; same safety pattern as CL-038's
   capacity-denied-leader test). SAFE: retaining healthy incumbents yields NO adds AND NO removes → no
   remove-floor deadlock; never drops quorum; only trades marginal load-balance for stability on
   critical-system partitions (the correct trade post-restart). Falsifier (DT repro, clone
   `cl-038-surplus-drain-retains-leader-node.test.js`): 3 healthy incumbents AT target + 2 feasible
   lower-load returned nodes, control-plane-priority partition → assert flag-on retains the 3 incumbents
   in `targetNodes` (no `increase_replica_count` migration ADD) vs flag-off migrates; plus a safety
   sub-test that an INFEASIBLE incumbent is still replaced. Does NOT touch raft.
   ~~C-1 (resolveRebalancerLeadership debounce) — DEAD: already landed e9f1c8bb, wrong signal.~~
   ~~form (b) serialize membership changes — unnecessary; (a) prevents the over-replication at the source.~~

2. **Lever W-1 — leader-local control-plane establishment write (Head B, the architectural lever).**
   Reuse the bootstrap-direct-write analog: let the establishment owner persist its
   `replica_operations`/publication rows leader-locally instead of funneling the priority-partition
   write through the single remote active replica under load. This is the L-write lever from the
   **exhausted-pivoted** [`control-plane-write-wedge-leader-local-establishment.md`](control-plane-write-wedge-leader-local-establishment.md)
   (read its "ROOT CONSOLIDATED" block) — its 6 default-off building blocks (L-write seed,
   zombie-redrive, drain-extension, `LAGRANGE_PR_SPREAD_STALL_GUARD`, `LAGRANGE_PR_REDUNDANT_REPLACE_RETIRE`,
   `LAGRANGE_PR_SPREAD_REQUIRE_VOTER_READY`) compose beneath it. Highest payoff, highest care
   (write-substrate / quorum). See [[membership-single-owner-cutover-plan]] for the owner home.

3. **Lever B-1 — hardware-relative readiness budget (de-risk the metric, not the root).**
   `[hardware-relative-convergence-budget.md]` (OQ1): the 120s readiness budget may be mis-calibrated
   for `cpus=1.0` single-threaded gate hosts (run 2 wall 929s). NOT a real fix, but quantify how much
   of `convergence_timeout` is genuine wedge vs budget-too-tight before spending levers on B — run a
   budget-scaled gate to separate calibration from mechanism. Cheap, do FIRST to avoid chasing a
   calibration artifact.

Recommended sequencing (UPDATED 2026-06-23, open question RESOLVED): **implement C-2 incumbency
stickiness** (confirmed form (a); DT repro red-on-revert + subagent-verify safety, flag default-off),
then **B-1** (cheap calibration probe) before spending the expensive establishment-write **W-1**. C-1 is
dead and the recency-window lever is refuted (see Head A). C-2 + W-1 break the A↔B coupling from both ends.

## Existing work to build ON (don't rebuild)

- **Umbrella**: [`topology-convergence-hardening.md`](topology-convergence-hardening.md) (status
  sharpening) — the direction surface; this epic is its current live frontier.
- **Head B root + 6 building-block levers**: [`control-plane-write-wedge-leader-local-establishment.md`](control-plane-write-wedge-leader-local-establishment.md)
  (exhausted-pivoted) + [[convergence-time-regression-and-next-steps]] + [[mgmjf-formation-rebalancer-churn]].
- **Head A root + ranked levers**: [[post-swim-quiescence-heads-unified-root]] (lever 1 =
  rebalancer re-introduction suppression) + [[circular-dependency-class-formation-vs-steady-state]].
- **Owner home**: [[membership-single-owner-cutover-plan]] / spec
  `solve/specs/membership-lifecycle-placement-hard-cutover/` (active-set authority still the 7-source
  `resolveActiveNodeViews()` merge — the antipattern behind the readiness diffuseness).
- **R1+R3** (now default-ON): the remove-safety wedge is gone; do NOT reopen it. If a lever here
  needs to read the honest blocker, R1/R3 are already on.
- **Don't add new caches** ([[avoid-secondary-tertiary-caches]]).

## Validation plan (deterministic-first, gate-last)

1. **B-1 calibration probe FIRST** — re-gate (or read existing budget-scaled runs) to separate
   `convergence_timeout`-as-budget-artifact from real wedge before spending C-1/W-1.
2. **Reproduce BELOW the gate** — directed DT repro (DT4/5/6 substrate,
   `docs/deterministic-directed-testing-plan.md`): Head A = flip node-wide readiness and assert
   rebalancer-leadership stability under C-1; Head B = a join under write-load and assert the
   establishment write persists leader-locally under W-1. The noisy N=3 gate is NOT the falsifier.
3. **Gate** — `npm run analyze:latent-blockers` first, then `npm run gate -- 3` from
   `/home/peter/projects/something` (shares the same `.git`/worktree as the /media path; `LAGRANGE_*`
   auto-forward). Success = scenario-PASS rises AND `leadership_unstable` + `convergence_timeout`
   drop; **SAFE every run (0 corrupt/breach/exit/oracle-blind) is a hard, never-relaxed invariant.**
4. **Subagent-verify** the safety argument (no split-brain rebalancer leadership; no lost raft
   leader; no relaxed write-quorum).

## Traps (paid for already — don't re-pay)

- **Coupled invariant** — single-frontier defer-relaxations bounce `leadership_unstable`↔
  `convergence_timeout`. Fix both ends (debounce leadership AND + fast leader-local establishment).
- **`convergence_timeout` may be partly a budget artifact** on `cpus=1.0` hosts — run B-1 before
  concluding it's a real wedge (run 2's 929s could be calibration, not mechanism).
- **Active-set truth is diffuse** (7-source `resolveActiveNodeViews()` merge) — the readiness
  oscillation has no single owner; don't bolt per-partition state on without addressing the owner.
- **Don't reopen the remove-safety wedge** — R1+R3 closed it and are promoted; this frontier is a
  DIFFERENT layer (establishment latency + leadership settling), not remove-safety.

## Decision log

- 2026-07-01 (**C-2 NON-ENGAGEMENT MYSTERY RESOLVED + real over-replication trigger found**;
  subagent `a9a7cbbe` + own verification of the two pivotal claims). The over-replication ADD is
  **NOT** the load-rank `calculatePartitionPlacement` path C-2 patched. It is a SECOND, independent
  ADD source: the **priority-recovery FOLLOW-UP path** (`unified-rebalancer-follow-up-move.js:493,521`),
  whose target `selectPriorityRecoveryFollowUpTargetNodeId` (`:252-303`) filters to
  `unusedEligibleNodeIds` that EXCLUDE current healthy+occupied replicas (`:277-284`) — so by
  construction it adds a freshly-returned **NON-incumbent**, growing the cohort past target 3
  (verified own read). Two fatal reasons C-2 left zero trace: (1) **WRONG PATH** — C-2's reservation
  lives only in `calculatePartitionPlacement`'s `buildPlacementOwnerReservationResult`, which the
  follow-up path never consults; (2) **DEAD CODE** — commit `dfde5bf2` (2026-06-25 "retire 12 feature
  flags") deleted `isPriorityIncumbentStickinessEnabled`; `resolveIncumbentRetentionNodeIds`
  (`placement-owner-evidence.js:161-163`) now always returns `[]` and the flag is absent from `src/`
  (verified). So **C-2 is REFUTED-as-built**. FIXABLE-as-idea only at the follow-up path: suppress the
  follow-up deficit ADD when `occupiedAliveReplicas >= targetReplicaCount` with healthy incumbents
  (`unified-rebalancer-follow-up-move.js:471-493`; an in-flight-add suppression seam already exists
  there). **OPEN (next determination, NOT resolved — do not ship a fix first):** is the follow-up
  deficit ADD SPURIOUS (fires with 3 healthy incumbents already at target ⇒ bug) or a TRANSIENT-DEFICIT
  recovery (a partition replica was briefly down during the restart ⇒ intended-but-suboptimal)? Owner:
  `buildPriorityRecoveryClosureWitnessFollowUpEvidence` (`unified-rebalancer-follow-up-decision.js`).
  Caveats: Head B (establishment-write wedge) still dominates PASS regardless; and this is a
  LIVENESS/convergence limit cycle, **not a safety bug** (safety-floor clean throughout) — so it is
  NOT aligned with the DT bug-finding motive, it is a convergence-rate lever.
- 2026-07-01 (later — **bug-vs-intended RESOLVED: it is BOTH — an intended availability-recovery CORE +
  a REAL overshoot BUG (deficit-suppression counting gap)**; subagent `a346c756` + own verification of the
  pivotal cutoffs). (i) INTENDED CORE: the follow-up ADD firing when voter-ready `healthy < target` during
  a restart is deliberate availability-recovery — `getReadyNodeOccupiedReplicas` (budget-planning.js:368-385)
  counts ACTIVE replicas ONLY on nodes in `getAvailableNodes()` (readiness-gated), so replicas on restarting
  nodes don't count → the partition looks under-target → it adds a fresh replica to keep the critical-system
  partition served. (ii) REAL BUG: the deficit-suppression `isPriorityRecoveryFollowUpDeficitSatisfiedByInFlightAdds`
  (defer when `occupied + inFlightAddCount >= target`, `unified-rebalancer-follow-up-move.js:471-483`) has a
  COUNTING GAP: `inFlightAddCount` counts an ADD only while transitional (`ADD_TRANSITIONAL_STATUSES` =
  PENDING/CREATING/SYNCING, `in-flight-aware-replica-count.js:29-33`; `currentReplicas:[]` passed
  intentionally so no ACTIVE-row recovery — both verified own read), and `occupiedReplicaCount` counts only
  ready-node ACTIVE rows. So a just-added replica that TERMINALIZED (ACTIVE) but whose node is not yet in
  `getAvailableNodes()` is counted by NEITHER term → the gate under-counts → re-adds a NEW replica though the
  true member count already meets target → overshoot 3→5(→6). No third guard closes it (pending-target sets
  feed only target selection, not the count). Corpus: `stat-gate-20260630T173805Z-run3` criticalSystemTopology
  shows `readyReplicaCount:12 / totalReplicaCount:15` (+3 surplus = the gap population on not-ready nodes) under
  `operation_drain_progressing`/`replica_operations_in_flight`. **So the flap is NOT a pure inherent tradeoff —
  closing the gap removes the OVERSHOOT while preserving availability-recovery.** FIX SEAM: count
  materialized-but-not-yet-ready members in the suppression (ACTIVE rows on nodes NOT in `getAvailableNodes()`,
  or pass real `currentReplicas` so `computeInFlightAwareReplicaAccounting`'s occupied dedup catches the
  terminalized row). FIX NUANCE (validate blast radius, per the drain-fix precedent): count only
  plausibly-recoverable members — deferring an add for a genuinely-dead node's stale ACTIVE row would regress
  the availability-recovery. This is a real, narrow, one-function convergence bug.
- 2026-06-23 (C-2 GATE VERDICT — UNVALIDATED, did NOT engage) — N=3 flag-on gate
  `stat-gate-20260623T183833Z`: SAFE 3/3 (0 corrupt/stale/oracle-blind/node-exit, missing=0), PASS rose
  0/3→**1/3** (run3 clean; runs 1,2 `passed=false` dominant `PRIORITY_CONTROL_PLANE_RECOVERY_PENDING`),
  and `leadership_unstable`+`convergence_timeout` absent from all 3 runs. **BUT a mechanistic subagent
  trace REFUTES attributing any of this to C-2:** the over-replication signature C-2 targets is UNCHANGED
  — all 5 critical-system priority partitions still over-replicate to 4–6 members vs target 3 in every new
  run, `increase_replica_count` migration ADDs did NOT drop (new runs 16/82/40 vs baseline 75 — run2
  EXCEEDS baseline), and raft leadership churn is flat (50–57 became-leader vs baseline 54). So C-2 left
  NO behavioral trace; the `leadership_unstable` absence is N=3 VARIANCE (it was only 1/3 at baseline), not
  C-2's effect. **Do NOT promote.** C-2 stays flag-off (committed, safe, unit-green) as an unvalidated
  building block. The flag IS forwarded to node containers (`cluster-class-lifecycle-base.js:371`
  `LAGRANGE_*` auto-forward), so the failure is NOT non-forwarding — it is that C-2 either (i) doesn't
  reach/fire in the planner path at runtime, or (ii) fires but doesn't change `targetNodes` because the
  REAL over-replication trigger differs from the load-only model my unit test assumed (likely SPREAD-driven
  / latency-group diversity, or incumbents transiently absent from `currentReplicas` during the restart so
  they aren't reservable). **NEXT for C-2 (before any re-gate):** add a positive engagement log when the
  INCUMBENT_RETENTION reservation fires (it currently leaves no trace), then a directed DT repro that
  models the REAL trigger (capture one over-replication event from 164130Z and reproduce it in-process),
  confirm C-2 changes `targetNodes` there, and only then re-gate. **Head B is now the genuine dominant
  blocker regardless** (`PRIORITY_CONTROL_PLANE_RECOVERY_PENDING` = the W-1/establishment-write root) — and
  it dominates whether or not C-2 ever engages, so W-1 is the higher-value next lever.
- 2026-06-23 (C-2 LANDED, flag-off) — Implemented **C-2 incumbency stickiness** (commit 8fa06823,
  default-off `LAGRANGE_PR_PRIORITY_INCUMBENT_STICKINESS`). Reserves current healthy+feasible incumbents
  into the target cohort for control-plane-priority partitions via the CL-038 placement-owner reservation
  seam (`placement-owner-evidence.js` `resolveIncumbentRetentionNodeIds` + `placement-owner-decision.js`
  reservation; gated at `move-planner-placement-tail-methods.js`). Below-gate DT repro
  `test/rebalancer/c2-priority-incumbent-stickiness.test.js` (14/14, red-on-revert) covers at-target
  retention, infeasible-incumbent replacement, over-target leader retention, under-target recovery. Flag
  byte-identical when off; full rebalancer suite 5079/5079. **Adversarial subagent verification caught a
  real over-target bug** (rank-ordered incumbent slice could evict a high-load leader → re-election,
  breaking CL-038) — FIXED by reserving the leader BEFORE other incumbents in the slice budget, then
  re-verified. Gate-validation (N=3, flag-on) IN PROGRESS; success = `leadership_unstable` drops + PASS
  rises WITHOUT `convergence_timeout` bouncing up, cluster SAFE 3/3. Note the coupled-invariant risk: C-2
  is the Head-A end only; if PASS doesn't rise because `convergence_timeout` (Head B) dominates, that
  confirms W-1 is needed next (not a C-2 failure).
- 2026-06-23 (latest) — **Head-A open question RESOLVED → verdict (B); C-2 lever CONFIRMED.** The +309s
  `sql_write_operations-p1` leader flip is a FOLLOWER-add-driven re-election: 7493b0ab kept its leader
  replica (never evicted); the surplus ADDs grew the raft group 3→5, raising `majority()`
  (`@markwylde/liferaft/index.js:443`) while fresh followers couldn't heartbeat → heartbeat-timeout
  election. So the fix is NOT leader-retention/drain-ordering — it is **incumbency stickiness** preventing
  the load-driven migration ADD (form (a)): reserve healthy+feasible current incumbents into `targetNodes`
  for control-plane-priority partitions via the CL-038 reservation seam (`placement-owner-decision.js:208-267`),
  infeasible incumbents still replaced. SAFE (no adds+no removes when retained → no remove-floor deadlock,
  no quorum drop). Next: implement C-2 flag-off + DT repro (clone `cl-038-surplus-drain-retains-leader-node.test.js`).
- 2026-06-23 (later) — **Head A REFRAMED + two levers REFUTED with evidence** (4 subagent traces +
  classifier + placement-owner code). (1) C-1 (`resolveRebalancerLeadership` debounce) is DEAD: the
  hysteresis already landed e9f1c8bb (default-ON) and was present in the churning 164130Z gate; the
  classifier keys `leadership_unstable` on the raft `leader_node_id` map, not rebalancer `setLeader`.
  (2) The recency/settle-window ADD-defer lever (`LAGRANGE_PR_DEFER_REJOIN_RESPREAD_ADD`) is REFUTED:
  the over-replicating ADD fires ~90–145s post-return when all node-row liveness fields have healed and
  no "returned-at" anchor exists; and a state-predicate variant deadlocks the spread-floor remove guard.
  **Confirmed root:** load-only placement ranking (`placement-owner-decision.js:182-190`, no incumbency
  bias) re-selects returned low-load nodes into the critical-system cohort → replica MIGRATION →
  add-then-throttled-remove churns the raft leader map → resets the 15s quiet window. Replaced lever C-1
  with **C-2** (incumbency stickiness / membership-change serialization). Precise open question pinned
  (leader-replica displacement vs follower-membership-change election) as the next cheap dig that picks
  the C-2 form. No code landed (correct per coupled-invariant discipline — the cleanest lever was
  refuted; do not force a speculative patch).
- 2026-06-23 — Opened as the SUCCESSOR frontier after `slow-rejoiner-progress-or-evict` resolved
  (R1+R3 landed + promoted default-ON; gate `stat-gate-20260623T164130Z` SAFE 3/3, remove-safety
  residual witnesses 3→0). PASS peeled to two coupled sub-heads: `leadership_unstable` (rebalancer-
  leadership lockstep flap, Head A) + `convergence_timeout` (control-plane write/establishment
  readiness-budget burn, Head B). Levers C-1/W-1/B-1 scoped with file:line. Recommend B-1
  (calibration) → C-1 (leadership debounce) → W-1 (leader-local establishment write).
