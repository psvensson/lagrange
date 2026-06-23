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

> **FRESH-AGENT START HERE.** This epic is self-contained. Read
> [`.kiro/steering/operational-ground-truth.md`](../steering/operational-ground-truth.md)
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

### Head A — `leadership_unstable`: the rebalancer-leadership LOCKSTEP flap (mechanism C)
Node-wide bootstrap readiness oscillates `join_ready↔degraded` on `PRIORITY_CONTROL_PLANE_RECOVERY_PENDING`
and is ANDed into **every** partition's rebalancer leadership through one shared resolver:
- `src/partition/partition-service-rebalancer-methods.js:158,238` →
  `this.rebalancer.setLeader(this.resolveRebalancerLeadership())`.
- `src/partition/partition-service-core-base.js:454-468` `resolveRebalancerLeadership()`:
  returns `false` unless `isLeader`, `true` when `isBackgroundWorkReady()`, else a traffic-readiness
  fallback. So when `isBackgroundWorkReady()` flips, ALL ~28 partitions' rebalancer leadership flips
  in lockstep (the "187 LEADER_START/STOP on the rejoiner" symptom).
- Classified by the harness oracle at
  `test/distributed/harness/control-plane-quiescence-snapshot.js:30,599` (`LEADERSHIP_CHURN`→
  `leadership_unstable`) — sustained LEADER_START/STOP churn never settles → quiescence never reached.
This is exactly [[post-swim-quiescence-heads-unified-root]]'s lever 1 ("rebalancer re-introduction
suppression") and mechanism **C** of the slow-rejoiner epic — which R1/R3 did NOT touch.

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

1. **Lever C-1 — debounce/hysteresis the readiness→rebalancer-leadership AND (Head A, smallest).**
   `partition-service-core-base.js:454-468` + `partition-service-rebalancer-methods.js:158,238`.
   Stop a transient `isBackgroundWorkReady()` dip from instantly demoting all ~28 partitions'
   rebalancer leadership — add hysteresis (require N consecutive not-ready samples / a settle window)
   or decouple per-partition rebalancer leadership from the node-wide readiness flag. Falsifier: a
   DT repro that flips `isBackgroundWorkReady()` once briefly and asserts rebalancer leadership does
   NOT flip (flag-on) vs flips (flag-off). Addresses the churn directly; does not touch raft.

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

Recommended sequencing: **B-1 first** (cheap — separate calibration from real wedge), then **C-1**
(smallest real lever, kills the leadership flap), then **W-1** (the establishment-write root). They
compose; C-1 + W-1 break the A↔B coupling from both ends.

## Existing work to build ON (don't rebuild)

- **Umbrella**: [`topology-convergence-hardening.md`](topology-convergence-hardening.md) (status
  sharpening) — the direction surface; this epic is its current live frontier.
- **Head B root + 6 building-block levers**: [`control-plane-write-wedge-leader-local-establishment.md`](control-plane-write-wedge-leader-local-establishment.md)
  (exhausted-pivoted) + [[convergence-time-regression-and-next-steps]] + [[mgmjf-formation-rebalancer-churn]].
- **Head A root + ranked levers**: [[post-swim-quiescence-heads-unified-root]] (lever 1 =
  rebalancer re-introduction suppression) + [[circular-dependency-class-formation-vs-steady-state]].
- **Owner home**: [[membership-single-owner-cutover-plan]] / spec
  `.kiro/specs/membership-lifecycle-placement-hard-cutover/` (active-set authority still the 7-source
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

- 2026-06-23 — Opened as the SUCCESSOR frontier after `slow-rejoiner-progress-or-evict` resolved
  (R1+R3 landed + promoted default-ON; gate `stat-gate-20260623T164130Z` SAFE 3/3, remove-safety
  residual witnesses 3→0). PASS peeled to two coupled sub-heads: `leadership_unstable` (rebalancer-
  leadership lockstep flap, Head A) + `convergence_timeout` (control-plane write/establishment
  readiness-budget burn, Head B). Levers C-1/W-1/B-1 scoped with file:line. Recommend B-1
  (calibration) → C-1 (leadership debounce) → W-1 (leader-local establishment write).
