# Solve report: movielens-raft-peer-cohort-pruning-election-liveness

**Goal:** After ADD, REMOVE, and REPLACE converge a partition from its bootstrap replicas through a transient voter to a final three-voter cohort, every live PartitionService reconciles Liferaft membership to exactly that authoritative final cohort so departed replicas cannot inflate quorum, and a leader demotion elects exactly one final-cohort successor within the existing election bound; the unchanged five-node MovieLens service-affinity scenario then completes initial runtime-service placement.

**Class:** product · **Closure:** MEASURED

**Outcome:** EXHAUSTED — 1 frontier(s) parked; human decision needed

**Attempts:** 1

## Links
- spec: solve/epics/service-data-affinity-placement.md
- parent quest: runtime-service-handoff-budget-rearm-reentry
- plan: solve/epics/topology-convergence-hardening.md

## Scope Pressure
- Changed files: 4
- Change bytes: 15024
- Owner areas: src/partition, test/convergence
- Categories: runtime, test
- Split plan:
  - src/partition: 3 file(s)
  - test/convergence: 1 file(s)
- Signals: none

## Frontiers
- **movielens-raft-peer-cohort-pruning-election-liveness-main** [parked {exhausted}] rung 0, attempts 1, metric 1 -> 1 — Verified exact peer pruning cannot be live-measured because the unchanged scenario is blocked earlier by the unresolved formation-to-background ordinary-work release owner: priority topology reaches zero gap/no missing leader, then seven genuine REPLACEs preempt schema admission before any terminal peer-retirement event. No honest Raft-scope move remains until formation-priority-spread-authoritative-publication-closure is repaired.

## Findings
- **movielens-raft-peer-cohort-pruning-election-liveness-main**: Sealed symptom reproduces on current HEAD: accepted SystemTableCache DELETE events leave r2/r3/r4 in r1 Liferaft nodes and replicaIds, majority remains 4 instead of 2, and a real promotion remains CANDIDATE rather than electing the final-cohort leader; row absence without an accepted delete correctly remains conservative. The post-TAP delayed-reconcile teardown exception is a separate test-lifecycle issue to settle before verification. [test/convergence/dt-movielens-raft-peer-cohort-pruning-election.test.js]
- **movielens-raft-peer-cohort-pruning-election-liveness-main**: DT red-on-revert proven for test/convergence/dt-movielens-raft-peer-cohort-pruning-election.test.js [dt:solve/changes/dt-prove/dt-movielens-raft-peer-cohort-pruning-election.test.js-2026-07-21T10-52-39-775Z.json]
- **movielens-raft-peer-cohort-pruning-election-liveness-main**: Deterministic production-seam proof now replays bootstrap r1/r2/r3 through authoritative ADD+REMOVE to r1/r4/r5, then REPLACE+terminal REMOVED to r1/r5/replacement; final majority is two and real vote/append traffic elects r1. A stale rejected delete and cache row absence do not prune. dt:prove is GREEN with fix, RED on source revert for retained peer/quorum assertions, GREEN after restore. [solve/changes/dt-prove/dt-movielens-raft-peer-cohort-pruning-election.test.js-2026-07-21T10-52-39-775Z.json]
- **movielens-raft-peer-cohort-pruning-election-liveness-main**: DT red-on-revert proven for test/convergence/dt-movielens-raft-peer-cohort-pruning-election.test.js [dt:solve/changes/dt-prove/dt-movielens-raft-peer-cohort-pruning-election.test.js-2026-07-21T10-55-36-895Z.json]
- **movielens-raft-peer-cohort-pruning-election-liveness-main**: The final deterministic falsifier additionally rejects cross-replica retirement: an accepted REMOVED row whose address belongs to r5 retires neither r4 nor r5; only a later exact r4 identity/address terminal row prunes r4. Current exact proof remains GREEN/fix, RED/revert, GREEN/restore with 14 assertions. [solve/changes/dt-prove/dt-movielens-raft-peer-cohort-pruning-election.test.js-2026-07-21T10-55-36-895Z.json]
- **movielens-raft-peer-cohort-pruning-election-liveness-main**: Independent verification approved exact peer-retirement attempt: accepted exact DELETE/REMOVED only, stale/mismatched/absent/self cases conservative, in-place cohort mutation, real final-cohort election, unchanged Raft policy, red-on-revert and guardrails green. [subagent:verify_raft_peer_pruning_attempt1]
- **movielens-raft-peer-cohort-pruning-election-liveness-main**: Fresh post-fix full MovieLens run does not reach the Raft retirement/election symptom. Priority topology becomes ready with zero total/priority spread gap and zero missing leaders, then a quiescence candidate lasts only 8126ms before ordinary non-priority REPLACEs begin at the background release boundary; in-flight operations grow to seven and the unchanged 180000ms schema admission times out. No peer-retirement diagnostic occurs because the terminal scenario is masked earlier. This matches the unresolved, independently rejected final attempt in exhausted Quest formation-priority-spread-authoritative-publication-closure, not a failure of the deterministic Raft mechanism. (rules out: Do not rerun the Raft attempt unchanged; repair the pre-existing formation-to-background release owner before seeking live Raft binding.) [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-21T11-10-14-468Z.report.json]
- **movielens-raft-peer-cohort-pruning-election-liveness-main**: Independent aggregate verification approved the byte-exact Raft peer-retirement artifact with no post-checkpoint source or DT drift. [subagent:verify_raft_peer_pruning_attempt1]
- **movielens-raft-peer-cohort-pruning-election-liveness-main**: Aggregate disposition review corrects the live chronology: authoritative R2 and R3 removals occurred before the 8126ms quiescence candidate, so the exact-delete production seam was reached; info-level log absence cannot establish whether the debug-level retirement path engaged. The run neither proves nor falsifies live membership convergence, and the later replacement/final-cohort/election stage remains unobserved because seven ordinary replacements preempt schema admission. (rules out: Do not claim the scenario was masked before every terminal peer-retirement event, and do not treat absent debug diagnostics as non-engagement.) [subagent:verify_raft_peer_pruning_attempt1]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-21T10:56:42.611Z | movielens-raft-peer-cohort-pruning-election-liveness-main | observe | 1 -> 1 | flat | no_evidence |  | diff:solve/changes/movielens-raft-peer-cohort-pruning-election-liveness/attempt-1.diff |
