# Solve report: movielens-raft-peer-cohort-pruning-election-liveness

**Goal:** After ADD, REMOVE, and REPLACE converge a partition from its bootstrap replicas through a transient voter to a final three-voter cohort, every live PartitionService reconciles Liferaft membership to exactly that authoritative final cohort so departed replicas cannot inflate quorum, and a leader demotion elects exactly one final-cohort successor within the existing election bound; the unchanged five-node MovieLens service-affinity scenario then completes initial runtime-service placement.

**Class:** product · **Closure:** MEASURED

**Outcome:** IN PROGRESS (no terminal recorded)

**Attempts:** 1

## Links
- spec: solve/epics/service-data-affinity-placement.md
- parent quest: runtime-service-handoff-budget-rearm-reentry
- plan: solve/epics/topology-convergence-hardening.md

## Current Blocker
- Frontier: movielens-raft-peer-cohort-pruning-election-liveness-main
- Owner: unknown
- Boundary: unknown
- Dominant reason: unknown
- Mechanism: unknown
- Movement: no evidence recorded
- Latest evidence: none
- Selected theory: none
- Next move: continue supervised step for movielens-raft-peer-cohort-pruning-election-liveness-main

## Continuation
- Status: allowed
- Next action: continue supervised step for movielens-raft-peer-cohort-pruning-election-liveness-main
- Blocker: none

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
- **movielens-raft-peer-cohort-pruning-election-liveness-main** [open] rung 0, attempts 1, metric 1 -> 1

## Findings
- **movielens-raft-peer-cohort-pruning-election-liveness-main**: Sealed symptom reproduces on current HEAD: accepted SystemTableCache DELETE events leave r2/r3/r4 in r1 Liferaft nodes and replicaIds, majority remains 4 instead of 2, and a real promotion remains CANDIDATE rather than electing the final-cohort leader; row absence without an accepted delete correctly remains conservative. The post-TAP delayed-reconcile teardown exception is a separate test-lifecycle issue to settle before verification. [test/convergence/dt-movielens-raft-peer-cohort-pruning-election.test.js]
- **movielens-raft-peer-cohort-pruning-election-liveness-main**: DT red-on-revert proven for test/convergence/dt-movielens-raft-peer-cohort-pruning-election.test.js [dt:solve/changes/dt-prove/dt-movielens-raft-peer-cohort-pruning-election.test.js-2026-07-21T10-52-39-775Z.json]
- **movielens-raft-peer-cohort-pruning-election-liveness-main**: Deterministic production-seam proof now replays bootstrap r1/r2/r3 through authoritative ADD+REMOVE to r1/r4/r5, then REPLACE+terminal REMOVED to r1/r5/replacement; final majority is two and real vote/append traffic elects r1. A stale rejected delete and cache row absence do not prune. dt:prove is GREEN with fix, RED on source revert for retained peer/quorum assertions, GREEN after restore. [solve/changes/dt-prove/dt-movielens-raft-peer-cohort-pruning-election.test.js-2026-07-21T10-52-39-775Z.json]
- **movielens-raft-peer-cohort-pruning-election-liveness-main**: DT red-on-revert proven for test/convergence/dt-movielens-raft-peer-cohort-pruning-election.test.js [dt:solve/changes/dt-prove/dt-movielens-raft-peer-cohort-pruning-election.test.js-2026-07-21T10-55-36-895Z.json]
- **movielens-raft-peer-cohort-pruning-election-liveness-main**: The final deterministic falsifier additionally rejects cross-replica retirement: an accepted REMOVED row whose address belongs to r5 retires neither r4 nor r5; only a later exact r4 identity/address terminal row prunes r4. Current exact proof remains GREEN/fix, RED/revert, GREEN/restore with 14 assertions. [solve/changes/dt-prove/dt-movielens-raft-peer-cohort-pruning-election.test.js-2026-07-21T10-55-36-895Z.json]

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
