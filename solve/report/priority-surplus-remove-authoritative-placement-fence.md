# Solve report: priority-surplus-remove-authoritative-placement-fence

**Goal:** For every priority control-plane partition, a non-failed standalone REMOVE is persisted only when strict services-owner evidence proves the exact source is a current active voter, voter count exceeds the policy target, and post-remove count and diversity are monotonic-safe. Unavailable or mismatched evidence defers, so leader handoff cannot turn stale superset rows into over-removal and MovieLens retains three spread control_plane_publications voters.

**Class:** product · **Closure:** MEASURED

**Outcome:** IN PROGRESS (no terminal recorded)

**Attempts:** 5

## Links
- spec: solve/epics/formation-complexity-consolidation.md
- parent quest: operation-ledger-quorum-authoritative-release
- plan: solve/epics/convergence-loop-and-workflow-overhead.md

## Current Blocker
- Frontier: priority-surplus-remove-authoritative-placement-fence-main
- Owner: unknown
- Boundary: unknown
- Dominant reason: unknown
- Mechanism: unknown
- Movement: no evidence recorded
- Latest evidence: none
- Selected theory: none
- Next move: continue supervised step for priority-surplus-remove-authoritative-placement-fence-main

## Continuation
- Status: blocked-unrecorded-evidence
- Next action: continue supervised step for priority-surplus-remove-authoritative-placement-fence-main
- Blocker: fresh frontier evidence is not recorded; run node scripts/solve.js ingest-evidence --id priority-surplus-remove-authoritative-placement-fence --frontier priority-surplus-remove-authoritative-placement-fence-main --evidence test-output/reports/movielens-lagrange-service-affinity-live-2026-07-21T13-35-45-939Z.report.json

## Scope Pressure
- Changed files: 7
- Change bytes: 64912
- Owner areas: docs, src/rebalancer, test/convergence, test/rebalancer
- Categories: docs, runtime, test
- Action: land or separate 4 owner areas: docs, src/rebalancer, test/convergence, test/rebalancer
- Split plan:
  - src/rebalancer: 3 file(s)
  - test/rebalancer: 2 file(s)
  - docs: 1 file(s)
  - test/convergence: 1 file(s)
- Signal: broad-source-scope severity=medium

## Frontiers
- **priority-surplus-remove-authoritative-placement-fence-main** [open] rung 0, attempts 5, metric 1 -> 1

## Findings
- **priority-surplus-remove-authoritative-placement-fence-main**: inherited from operation-ledger-quorum-authoritative-release: The real RebalanceCoordinator admission path deterministically reproduces the systemic stale-read-model lock: cache-local services rows engage operation_ledger_quorum_concentrated and current source never consults the services owner, so a complete owner observation proving three voters on three nodes cannot release the final dependent sql_write_operations ADD. The discriminator also pins the required consistency contract: owner-local or owner-RPC complete spread may release; concentrated, incomplete, unavailable, malformed, SQL-projection, or any second-ledger unspread evidence must hold; a local no-hold path performs no authority read. (rules out: quorum arithmetic, cure typing, self-move serialization, operation budgets, host scheduling, and a missing physical ledger spread) [test/convergence/dt6-operation-ledger-quorum-authoritative-release.test.js]
- **priority-surplus-remove-authoritative-placement-fence-main**: inherited from operation-ledger-quorum-authoritative-release: The one permitted post-fix full run is measuring red on a distinct owner boundary. control_plane_publications-p1 first reached the intended three-replica spread (ADD r4/r5; REMOVE r2/r3 complete by 12:31:20). After leadership moved to r5/node-1 at 12:31:22, that new leader planned a standalone REMOVE of r1 from a stale local superset (activeCount=4, distinct=2, spread gap open) even though canonical physical placement was already r1/r4/r5 at target and spread. The remove completed at 12:31:30, regressing actual placement to two ready replicas; meanwhile the leader's stale cache later claimed five replicas/distinct three and kept proposing removal of the already-removed r1, so no deficit ADD repaired the canonical gap. Schema admission observed priority gap 1 for 87 samples and finally lost the snapshot request. Host scheduling stayed within budget and no node exited. (rules out: Do not reopen operation-ledger owner-release logic, widen admission timeouts, blame host CPU, or treat the final admin timeout as first cause. The next lever is generic destructive priority-REMOVE authority/fencing across leader handoff: cache unions that are conservative for ADD are unsafe for DELETE.) [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-21T12-36-14-313Z.report.json]
- **priority-surplus-remove-authoritative-placement-fence-main**: DT red-on-revert proven for test/convergence/dt6-priority-surplus-remove-authoritative-placement-fence.test.js [dt:solve/changes/dt-prove/dt6-priority-surplus-remove-authoritative-placement-fence.test.js-2026-07-21T12-56-41-939Z.json]
- **priority-surplus-remove-authoritative-placement-fence-main**: DT red-on-revert proven for test/convergence/dt6-priority-surplus-remove-authoritative-placement-fence.test.js [dt:solve/changes/dt-prove/dt6-priority-surplus-remove-authoritative-placement-fence.test.js-2026-07-21T12-56-54-197Z.json]
- **priority-surplus-remove-authoritative-placement-fence-main**: The real createOperation admission path reproduces the post-handoff destructive stale-cache class: coordinator-local rows propose REMOVE r1 from a four-row/two-node superset while the services owner already holds exactly r1/r4/r5 at target three and spread three; unfixed creation reaches the persistence seam without any services-owner read. The same production path distinguishes a genuine four-voter monotonic drain and fails closed for owner unavailability, fallback source, changed identity, malformed/conflicting rows, and diversity loss while preserving failed-cleanup and non-priority lanes. (rules out: planner ordering, membership epoch, remove-lane serialization, quorum minimum, host scheduling, scenario timeout, and the prior operation-ledger release defect) [test/convergence/dt6-priority-surplus-remove-authoritative-placement-fence.test.js]
- **priority-surplus-remove-authoritative-placement-fence-main**: Independent verification rejected the exact attempt because byte-identical duplicate owner rows are silently deduplicated by replica inventory and can authorize deletion; explicit duplicate-ID evidence must defer. [subagent:verify_priority_remove_fence]
- **priority-surplus-remove-authoritative-placement-fence-main**: DT red-on-revert proven for test/convergence/dt6-priority-surplus-remove-authoritative-placement-fence.test.js [dt:solve/changes/dt-prove/dt6-priority-surplus-remove-authoritative-placement-fence.test.js-2026-07-21T13-09-47-946Z.json]
- **priority-surplus-remove-authoritative-placement-fence-main**: Independent verification passed: identical duplicates now fail closed, strict owner/policy/source/count/diversity fencing holds at the real persistence boundary, scoped lanes remain unchanged, and red-on-revert is proven. [subagent:verify_priority_remove_fence]
- **priority-surplus-remove-authoritative-placement-fence-main**: Independent exact-byte verification passed; the named partition constant is semantically equivalent and strict owner, duplicate, identity, target, count, diversity, fail-closed, bounded-read, and scope behavior remain intact. [subagent:verify_priority_remove_fence]
- **priority-surplus-remove-authoritative-placement-fence-main**: DT red-on-revert proven for test/convergence/dt6-priority-surplus-remove-authoritative-placement-fence.test.js [dt:solve/changes/dt-prove/dt6-priority-surplus-remove-authoritative-placement-fence.test.js-2026-07-21T13-15-08-889Z.json]
- **priority-surplus-remove-authoritative-placement-fence-main**: Independent exact-byte verification passed: a thrown owner read remains authority_unavailable with zero persistence, captured error text cannot authorize deletion, excluded paths retain zero new reads, and focused/static/preflight checks pass. [subagent:verify_priority_remove_fence]
- **priority-surplus-remove-authoritative-placement-fence-main**: Independent re-verification rejected attempt-2: it violates named-scalar and silent-catch static contracts and lacks throwing-owner-read production coverage; later bytes contain required corrections. [subagent:verify_priority_remove_fence]
- **priority-surplus-remove-authoritative-placement-fence-main**: Independent verification passed for the same-base replacement; artifact bytes exactly match the final approved strict owner fence and all destructive-safety and scoped-read criteria remain satisfied. [subagent:verify_priority_remove_fence]
- **priority-surplus-remove-authoritative-placement-fence-main**: The one permitted final-byte MovieLens run did not reproduce the stale destructive priority REMOVE: schema admission reached quiescent with prioritySpreadGap=0, ratings loaded and spread across five nodes, distributed SQL completed, and no priority_surplus_remove_authority_unproven event appeared. It failed later on a distinct pre-existing runtime-service ADD liveness path: ADD bd00c558 created svc-movielens-topn-r1 remotely, remained CREATING after replica success and missing local operation-row visibility, exhausted its remote-handoff budget, blocked the second ADD by budget, and was never rearmed before initial-placement timeout. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-21T13-35-45-939Z.report.json]

## Theories
- **theory-20260721-the-cache-union-is-conservative-for** [active] system, mechanism The cache union is conservative for additive planning but non-monotonic for deletion: ghost replicas inflate voter count and make diversity-reducing removal appear safe., owner RebalanceCoordinator createOperation destructive priority REMOVE admission boundary, modelGate npm run model:contracts

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-21T13:04:25.791Z | priority-surplus-remove-authoritative-placement-fence-main | observe | 1 -> 1 | flat | no_evidence |  | diff:solve/changes/priority-surplus-remove-authoritative-placement-fence/attempt-1.diff |
| 2026-07-21T13:10:00.472Z | priority-surplus-remove-authoritative-placement-fence-main | observe | 1 -> 1 | flat | no_evidence |  | diff:solve/changes/priority-surplus-remove-authoritative-placement-fence/attempt-2.diff |
| 2026-07-21T13:13:25.365Z | priority-surplus-remove-authoritative-placement-fence-main | observe | 1 -> 1 | flat | no_evidence |  | diff:solve/changes/priority-surplus-remove-authoritative-placement-fence/attempt-3.diff |
| 2026-07-21T13:15:45.584Z | priority-surplus-remove-authoritative-placement-fence-main | observe | 1 -> 1 | flat | no_evidence |  | diff:solve/changes/priority-surplus-remove-authoritative-placement-fence/attempt-4.diff |
| 2026-07-21T13:20:32.232Z | priority-surplus-remove-authoritative-placement-fence-main | observe | 1 -> 1 | flat | no_evidence |  | diff:solve/changes/priority-surplus-remove-authoritative-placement-fence/attempt-4.diff |
