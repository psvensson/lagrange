# Solve report: operation-ledger-quorum-authoritative-release

**Goal:** When a dependent operation's coordinator-local services cache still describes replica_operations quorum as concentrated after physical spread, the quorum-spread admission hold releases only after a cache-bypassing authoritative services-owner observation is complete and proves the ledger spread; genuinely concentrated, incomplete, or unavailable authoritative evidence remains deferred, and the unchanged MovieLens scenario admits the final sql_write_operations replica.

**Class:** product · **Closure:** MEASURED

**Outcome:** EXHAUSTED — 1 frontier(s) parked; human decision needed

**Attempts:** 3

## Links
- spec: solve/epics/formation-complexity-consolidation.md
- parent quest: formation-ledger-self-move-blocks-cluster-ops
- plan: solve/epics/topology-convergence-hardening.md

## Current Blocker
- Frontier: operation-ledger-quorum-authoritative-release-main
- Owner: unknown
- Boundary: unknown
- Dominant reason: unknown
- Mechanism: topology_gap
- Movement: narrowed: FAIL -> FAIL
- Latest evidence: test-output/reports/movielens-lagrange-service-affinity-live-2026-07-21T12-36-14-313Z.report.json
- Selected theory: none
- Next move: continue supervised step for operation-ledger-quorum-authoritative-release-main
- No longer current: FAIL; Do not reopen operation-ledger owner-release logic, widen admission timeouts, blame host CPU, or treat the final admin timeout as first cause. The next lever is generic destructive priority-REMOVE authority/fencing across leader handoff: cache unions that are conservative for ADD are unsafe for DELETE.

## Continuation
- Status: allowed
- Next action: No open frontier remains; inspect solve report.
- Blocker: none

## Scope Pressure
- Changed files: 8
- Change bytes: 28465
- Owner areas: architecture, docs, src/bootstrap, src/rebalancer, test/convergence
- Categories: docs, runtime, test
- Action: land or separate 5 owner areas: architecture, docs, src/bootstrap, src/rebalancer, test/convergence
- Split plan:
  - src/rebalancer: 3 file(s)
  - test/convergence: 2 file(s)
  - architecture: 1 file(s)
  - docs: 1 file(s)
  - src/bootstrap: 1 file(s)
- Signal: broad-source-scope severity=medium

## Frontiers
- **operation-ledger-quorum-authoritative-release-main** [parked {exhausted}] rung 0, attempts 3, metric 1 -> 1 — The scoped cache-local hold release is complete and verified, while the only measuring full-run residual is a distinct stale-leader surplus-REMOVE defect whose repair is forbidden by this Quest's authoritative-release-only constraint; no honest in-scope move remains.

## Findings
- **operation-ledger-quorum-authoritative-release-main**: The real RebalanceCoordinator admission path deterministically reproduces the systemic stale-read-model lock: cache-local services rows engage operation_ledger_quorum_concentrated and current source never consults the services owner, so a complete owner observation proving three voters on three nodes cannot release the final dependent sql_write_operations ADD. The discriminator also pins the required consistency contract: owner-local or owner-RPC complete spread may release; concentrated, incomplete, unavailable, malformed, SQL-projection, or any second-ledger unspread evidence must hold; a local no-hold path performs no authority read. (rules out: quorum arithmetic, cure typing, self-move serialization, operation budgets, host scheduling, and a missing physical ledger spread) [test/convergence/dt6-operation-ledger-quorum-authoritative-release.test.js]
- **operation-ledger-quorum-authoritative-release-main**: DT red-on-revert proven for test/convergence/dt6-operation-ledger-quorum-authoritative-release.test.js [dt:solve/changes/dt-prove/dt6-operation-ledger-quorum-authoritative-release.test.js-2026-07-21T12-09-23-015Z.json]
- **operation-ledger-quorum-authoritative-release-main**: DT red-on-revert proven for test/convergence/dt6-operation-ledger-quorum-authoritative-release.test.js [dt:solve/changes/dt-prove/dt6-operation-ledger-quorum-authoritative-release.test.js-2026-07-21T12-12-18-793Z.json]
- **operation-ledger-quorum-authoritative-release-main**: Exact attempt sha256:e4a79ca5ed1c3a28ca4d5cbbd064788e492a24a6be2c0233131bf504daa3ff34 fails closed-authority review: OWNER_RPC_PREFERRED may fall back to any local replica, while local_partition_replica was accepted without proving coordinator ownership; the artifact also omitted the new decision table and deterministic test. [subagent:verify_ledger_authoritative_release]
- **operation-ledger-quorum-authoritative-release-main**: DT red-on-revert proven for test/convergence/dt6-operation-ledger-quorum-authoritative-release.test.js [dt:solve/changes/dt-prove/dt6-operation-ledger-quorum-authoritative-release.test.js-2026-07-21T12-22-24-007Z.json]
- **operation-ledger-quorum-authoritative-release-main**: Independent verification passed: strict leader-pinned OWNER_RPC_REQUIRED evidence closes the prior follower-fallback defect; all seven artifact blobs including the decision table and deterministic test match; fail-closed matrix, no-read fast path, serialization safety, and red-on-revert proof are valid. [subagent:verify_ledger_authoritative_release]
- **operation-ledger-quorum-authoritative-release-main**: Fresh full contract/model verification passed after the runtime fix: the active-gate TLC route converges with expectationMet=true, temporalViolated=false, exitCode=0, and the decision-table model includes the owner-RPC-only ledger placement observation contract. [contract:architecture/contracts/evidence/active-gate-tlc-route.model.report.json]
- **operation-ledger-quorum-authoritative-release-main**: Independent verification passed for the complete superseding path union: all eight blobs match, the seven runtime/docs/test blobs are identical to approved attempt 2, and the sole additional model report is freshly green and correctly referenced. [subagent:verify_ledger_authoritative_release]
- **operation-ledger-quorum-authoritative-release-main**: The one permitted post-fix full run is measuring red on a distinct owner boundary. control_plane_publications-p1 first reached the intended three-replica spread (ADD r4/r5; REMOVE r2/r3 complete by 12:31:20). After leadership moved to r5/node-1 at 12:31:22, that new leader planned a standalone REMOVE of r1 from a stale local superset (activeCount=4, distinct=2, spread gap open) even though canonical physical placement was already r1/r4/r5 at target and spread. The remove completed at 12:31:30, regressing actual placement to two ready replicas; meanwhile the leader's stale cache later claimed five replicas/distinct three and kept proposing removal of the already-removed r1, so no deficit ADD repaired the canonical gap. Schema admission observed priority gap 1 for 87 samples and finally lost the snapshot request. Host scheduling stayed within budget and no node exited. (rules out: Do not reopen operation-ledger owner-release logic, widen admission timeouts, blame host CPU, or treat the final admin timeout as first cause. The next lever is generic destructive priority-REMOVE authority/fencing across leader handoff: cache unions that are conservative for ADD are unsafe for DELETE.) [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-21T12-36-14-313Z.report.json]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-21T12:12:29.569Z | operation-ledger-quorum-authoritative-release-main | observe | 1 -> 1 | flat | no_evidence |  | diff:solve/changes/operation-ledger-quorum-authoritative-release/attempt-1.diff |
| 2026-07-21T12:23:02.862Z | operation-ledger-quorum-authoritative-release-main | observe | 1 -> 1 | flat | no_previous |  | diff:solve/changes/operation-ledger-quorum-authoritative-release/attempt-2.diff |
| 2026-07-21T12:27:58.070Z | operation-ledger-quorum-authoritative-release-main | observe | 1 -> 1 | flat | no_previous |  | diff:solve/changes/operation-ledger-quorum-authoritative-release/attempt-3.diff |
