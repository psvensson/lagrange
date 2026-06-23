---
id: slow-rejoiner-progress-or-evict
roadmapRow: RM-0.1-fs-rolling-restart
status: discussing
graduatesTo: null
links:
  quests: [rolling-restart-core-stability]
  upstreamEpic: control-plane-write-wedge-leader-local-establishment
  relatedSpec: membership-lifecycle-placement-hard-cutover
---

# Slow-rejoiner progress-or-evict — break the coupled remove-safety deadlock that keeps rolling-restart scenario-PASS at 0

> **FRESH-AGENT START HERE.** This epic is self-contained. Read
> [`.kiro/steering/operational-ground-truth.md`](../steering/operational-ground-truth.md)
> first (deterministic-first / gate-last / research-existing / subagent-verify /
> **coupled-invariant: stop single-frontier patching**). All file:line below were
> verified at HEAD `be388072` on 2026-06-23 but are POSITIONAL — re-grep before
> trusting. This epic SUPERSEDES the lever hunt in
> [`control-plane-write-wedge-leader-local-establishment.md`](control-plane-write-wedge-leader-local-establishment.md)
> (read its "ROOT CONSOLIDATED" block); that epic's 6 default-off levers are SAFE
> building blocks but none is the PASS lever.

## Intent (why this epic exists)

`rolling-restart-core-stability`'s `doneWhen` is **scenario-PASS 3 consecutive**
(NOT convergeRate). The cluster is SAFE every run (0 corrupt/breach/exit; missing=0;
CONVERGED) but scenario-PASS has been **0/3 across every recent gate**. The whole
2026-06-23 campaign drilled the residual through four successive reframes — write-wedge
→ redundant-zombie → spread-disagreement → voter-ready-promotion — and they all
converge on **one node**: the slow SWIM-protected rejoiner `7493b0ab`. The PASS bar
requires that node to either **make progress** or be **safely drained**; today it does
neither, and the remove-safety gate (correctly) refuses to drain it. That coupling is
the blocker. It is a membership / recovery-ownership problem, not a rebalancer-op bug.

## The evidence (consolidated, gate `stat-gate-20260623T142955Z` run2)

Drilling the 56 `replace_remove_safety_blocked` witnesses (the dominant
`priority_recovery_progress_blocked` residual): they are a **CLUSTER of distinct
remove-safety defers, ~19/21 of them removals from `7493b0ab`**:

| count | remove-safety defer reason |
| --- | --- |
| 20 | `Quorum check failed: concurrent partition operation <id> is active` |
| 8  | `Quorum check failed: peer node <id> is uncontactable` |
| 6  | `projected voter-ready spread would fall below the published requirement (2/3)` |
| 6  | `recovery projection membership does not include projected voter-ready nodes` |
| 12 | `source leader <part>-rN replacement leader ownership pending before safe removal` |
| 4  | `replacement replica <part>-rN is not voter-ready` |

Partitions: `control_plane_publications-p1`, `replica_operations-p1`,
`sql_transaction_participants-p1`, `sql_transactions-p1`, `sql_write_operations-p1`,
each `readyDistinctNodeCount:1, spreadGap:2` (the ready replicas are co-located; the
3rd distinct node depends on a REPLACE whose source-removal is one of these defers).

This is the same node and regime as [[post-swim-quiescence-heads-unified-root]]
(2026-06-21 N=8): the 3 residual heads (`quiescence_candidate` / `convergence_timeout`
/ `nodeSlotUnavailable`) ALL traced to `7493b0ab` lingering in slow recovery. SWIM
turned "trim slow node → cascade" into "slow node survives but can't progress → settle
never completes."

## Mechanism FULLY PINNED (file:line, subagent-traced 2026-06-23)

Three independent reasons compound; together they make the slow rejoiner un-drainable:

### A. The leadership handoff is a COOPERATIVE, local-timer raft step the saturated source must run itself
- The `replacement leader ownership pending before safe removal` literal:
  `src/rebalancer/operation-workflow-owner-shared.js:177-178`
  (`REPLACEMENT_LEADER_OWNERSHIP_PENDING_BEFORE_SAFE_REMOVAL`).
- Raised in `src/rebalancer/priority-publication-handoff.js:121-148`
  (`REQUEST_REPLACEMENT_LEADER_ELECTION`) and `:168-176`
  (`WAIT_REPLACEMENT_LEADER_OWNERSHIP`).
- Pass condition = `sourceRemovalLeadershipSafe`
  (`src/rebalancer/priority-publication-leader-safety.js:161-166`), a disjunction whose
  live-progress disjuncts (`replacementLeaderOwnershipObserved` `:129-133`,
  `sourceLeadershipReleaseHasCanonicalSuccessor` `:134-136`) are all read from
  **persisted rows** — `replica.raft_role` / `partition.leader_node_id`
  (resolvers `priority-publication-safety-topology.js:190-218,467-492`).
- The transfer is dispatched at
  `operation-workflow-dispatch-response-reconcile.js:224-230`
  (`dispatchRemoveSafetyHandoffRequest`, `priority-publication-handoff.js:196-248`) via
  a `STEP_DOWN_REPLICA` message → handler
  `src/node/replica-handler-leader-handoff-methods.js:62-103`, which only **arms** local
  timers: `raft.change({state: FOLLOWER, leader: ''})` + `raftProvider.startElectionTimer(raft)`
  (`:97-101`) → `liferaft-provider.js:262-269` → `raftNode.heartbeat(raftNode.timeout())`.
  **On a CPU-saturated/quiesced rejoiner these timers don't fire in budget** (the same
  event-loop starvation as the mgmjf seed). Delivery failure is **swallowed to `null`**
  (`priority-publication-handoff.js:245-247`) — no durable escalation.

### B. The success signal LAGS — even a transfer that occurs isn't observed in time
`sourceRemovalLeadershipSafe` reads `raft_role`/`leader_node_id` rows that lag live raft
leadership (write-through family CL-016/CL-035, noted at `leader-safety.js:427-429`), so
the gate re-enters `WAIT_REPLACEMENT_LEADER_OWNERSHIP` and re-defers. A CL-043 fast-path
that accepts a completed replacement-election ACK already exists
(`isCompletedReplacementElectionSafeForPriorityRecovery`, `leader-safety.js:393-460`) but
is scoped narrowly to the priority-recovery-completion case.

### C. There is NO watchdog to force progress, and eviction is DELIBERATELY suppressed
A SWIM-alive but non-progressing rejoiner is gated only through the quiescence oracle
(`replica-operation-liveness.js:545-579`) and recovery timeout
(`operation-workflow-recovery-timeout.js`). Eviction mid-establishment is explicitly
refused: `src/rebalancer/placement-owner-decision.js:212-214` ("never EVICT a node
mid-establishment — would re-introduce the churn"). So the node is neither pushed forward
nor removed. Its "leadership flap" is REBALANCER-leadership, not raft: node-wide
bootstrap readiness oscillates `join_ready↔degraded` on
`PRIORITY_CONTROL_PLANE_RECOVERY_PENDING`, ANDed into every partition's rebalancer
leadership via one shared object (`setLeader(isBackgroundWorkReady() && isLeader)`,
`partition-service-rebalancer-methods.js:158,238`) → all ~28 partitions flip leadership
in lockstep (187 LEADER_START/STOP on the rejoiner) — see
[[post-swim-quiescence-heads-unified-root]] for the full trace.

### Verdict
Leadership doesn't hand off because it's a cooperative local-timer step the saturated
old leader must execute (and can't while starved), the safe-removal proof reads only
lagging rows (so a transfer that does happen isn't observed), and nothing forces the
node to progress or evicts it. The REPLACE source-removal defers forever → topology
never quiesces → scenario never PASSes.

## Candidate levers (ranked; all safety-sensitive — this touches remove-safety/quorum + raft leadership)

> ⚠️ This is a COUPLED invariant. Per operational-ground-truth, prefer an *atomic
> cross-owner reconcile* over single-frontier patches; validate BELOW the gate with a
> directed DT repro before any gate. Each lever is flag-gated default-off. **Subagent-verify
> the safety argument (must never drop voter-ready spread below the published floor / never
> remove a live leader without a real successor).**

1. **Lever R1 — proof-not-rows: broaden the CL-043 election-ack fast-path.**
   `priority-publication-leader-safety.js:393-460` (esp `:446-460` / `:393-418`). Authorize
   source removal on a *live* completed replacement-leader-election ACK for the whole
   priority-partition class, not just priority-recovery-completion — bypassing the
   `leader_node_id`/`raft_role` write-through lag that wedges `WAIT_REPLACEMENT_LEADER_OWNERSHIP`.
   Smallest, addresses mechanism **B**. Falsifier: a two-replica fixture where the
   replacement won the election (ack present) but the row still says source-leader → assert
   flag-on authorizes removal, flag-off defers; and a NO-ack case is NEVER authorized.

2. **Lever R2 — don't drain the leader off a slow node at all.** Strengthen
   `move-planner-move-calculation-methods.js:368-414` (+ `move-planner-state-methods.js:181-192`)
   so the partition's leader is never chosen as a REPLACE *source* when the node is a
   known-slow/quiesced rejoiner — use a LIVE leadership/readiness signal, not the lagging
   `partition.leader_node_id`. If the leader is never the source, the handoff gate is never
   entered. Addresses mechanism **A** by avoidance. Larger planner blast radius.

3. **Lever R3 — actively drive the handoff / wedged-rejoiner progress watchdog (the
   architectural lever).** At `operation-workflow-dispatch-response-reconcile.js:224-245`
   the STEP_DOWN failure swallows to `null` (`priority-publication-handoff.js:245-247`).
   Make a repeatedly-unacked/non-progressing source-leader handoff ESCALATE: re-target the
   election to a healthy replacement that CAN win (reuse `requestTrackedReplacementLeaderElection`,
   `replica-handler-leader-handoff-methods.js:35-54`) instead of perpetually re-asking the
   saturated old leader to step down. This is the "progress-or-evict" core and the
   [[post-swim-quiescence-heads-unified-root]] "rebalancer re-introduction suppression"
   lever; it avoids the suppressed-eviction policy at `placement-owner-decision.js:212-214`.
   Highest payoff, highest care.

Recommended sequencing: **R1 first** (smallest, un-wedges the observe-lag case; may alone
move PASS if the transfers ARE completing but unobserved), then **R3** (drive/escalate the
handoff for the genuinely-stuck case), with **R2** as a planner-side complement. They compose.

## Existing scoped work to build ON (don't rebuild)

- **Membership single-owner cutover** ([[membership-single-owner-cutover-plan]],
  spec `.kiro/specs/membership-lifecycle-placement-hard-cutover/`): the architectural home
  for "who owns driving a rejoiner to progress-or-eviction." TRAP (per memory): tasks 1–26
  marked done but only the DEMOTION half shipped — active-set authority is still the
  7-source `resolveActiveNodeViews()` merge. Freeze gate is SAFETY; `LAGRANGE_MEMBERSHIP_LEADER_DRIVEN`
  default-off; Raft term fence = safety. Don't bypass the fence to chase liveness.
- **post-SWIM unified root** ([[post-swim-quiescence-heads-unified-root]]): 5 candidate
  levers ranked; lever 1 (rebalancer re-introduction suppression) recommended first there.
  The rebalancer-leadership lockstep-flap (mechanism C) is itself worth a lever — stop the
  node-wide readiness oscillation from flapping all ~28 partitions' rebalancer leadership.
- **CL-038/CL-043/CL-044** (`closure-ledger/`): the existing source-removal safety escapes —
  CL-043 (stale-step-timeout) and CL-044 (uncontactable-ping) don't fire here because the
  rejoiner is slow-not-down (ping returns reachable) and the dispatch-retry keeps the staleness
  clock fresh. Extend these, don't duplicate.
- **The 6 default-off levers from the upstream epic** (L-write seed, zombie-redrive,
  drain-extension, census-#4 stall-guard `LAGRANGE_PR_SPREAD_STALL_GUARD`,
  redundant-replace-retire `LAGRANGE_PR_REDUNDANT_REPLACE_RETIRE`, spread-voter-ready un-mask
  `LAGRANGE_PR_SPREAD_REQUIRE_VOTER_READY`) — SAFE building blocks that compose beneath any
  rejoiner-progress lever. The **un-mask** in particular makes the gate's dominant reason
  HONEST (it stops the optimistic spread sign-off), so **turn it on when gate-validating a
  rejoiner-progress lever** to read the true blocker.

## Validation plan (deterministic-first, gate-last)

1. **Reproduce BELOW the gate first.** Build a directed DT repro (DT4/5/6 substrate,
   `docs/deterministic-directed-testing-plan.md`) that forces a priority REPLACE to move a
   partition's raft leader off a node whose event loop is starved (or whose `raft_role`/
   `leader_node_id` rows are held stale), and assert the chosen lever un-wedges source-removal
   while preserving the voter-ready-spread floor. The noisy N=3 gate is NOT the falsifier.
2. **Gate** — `npm run gate -- 3` from `/home/peter/projects/something` (NOT the /media path).
   Enable the un-mask (`LAGRANGE_PR_SPREAD_REQUIRE_VOTER_READY=true`) plus the new lever's flag.
   `LAGRANGE_*` env vars auto-forward to containers
   (`test/distributed/harness/cluster-class-lifecycle-base.js:367-379`). Run
   `npm run analyze:latent-blockers` BEFORE queuing. Success = scenario-PASS rises AND
   `replace_remove_safety_blocked` removals-from-the-rejoiner drop; **SAFE every run
   (0 corrupt/breach/exit/oracle-blind) is a hard, never-relaxed invariant.**
3. **Subagent-verify** the safety argument before reporting (especially: the lever can never
   authorize removing a replica that drops projected voter-ready spread below the published
   floor, and never removes a live leader without a genuine elected successor).

## Traps (paid for already — don't re-pay)

- **This is a coupled invariant.** Single-frontier defer-relaxations bounce the heads
  (`quiescence_candidate`↔`convergence_timeout`↔`nodeSlotUnavailable`). Don't whack-a-mole —
  the fix is "make the rejoiner progress or safely drain," one atomic move.
- **Don't relax remove-safety to force a drain that breaks quorum/spread.** The gate is
  CORRECT to refuse; the fix is to make the *successor* real/observed, not to skip the check.
- **The slow rejoiner is slow-not-down** — `pingNode` returns reachable, dispatch-retry keeps
  the staleness clock fresh, so the CL-043/CL-044 escapes don't fire. A new signal must
  distinguish "slow/quiesced" from "healthy-but-busy."
- **Rows lag live raft** (CL-016/CL-035 write-through): don't trust `raft_role`/`leader_node_id`
  as a liveness signal; prefer a live election-ack / live leadership read.
- **Eviction mid-establishment is deliberately suppressed** (`placement-owner-decision.js:212-214`)
  to avoid re-introduction churn — a progress-or-evict lever must coordinate with that policy,
  not fight it.

## Decision log

- 2026-06-23 — Opened from the `control-plane-write-wedge-leader-local-establishment` ALTITUDE
  checkpoint. Root consolidated: PASS blocker is the slow rejoiner `7493b0ab` un-drainable via
  a coupled remove-safety defer cluster; mechanism pinned (cooperative local-timer handoff +
  lagging-row proof + no progress-or-evict watchdog). Ranked levers R1/R2/R3 scoped with
  file:line. Recommend R1 first (below-gate DT repro), then R3.
