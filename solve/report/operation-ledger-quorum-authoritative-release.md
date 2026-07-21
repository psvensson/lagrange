# Solve report: operation-ledger-quorum-authoritative-release

**Goal:** When a dependent operation's coordinator-local services cache still describes replica_operations quorum as concentrated after physical spread, the quorum-spread admission hold releases only after a cache-bypassing authoritative services-owner observation is complete and proves the ledger spread; genuinely concentrated, incomplete, or unavailable authoritative evidence remains deferred, and the unchanged MovieLens scenario admits the final sql_write_operations replica.

**Class:** product · **Closure:** MEASURED

**Outcome:** IN PROGRESS (no terminal recorded)

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
- Mechanism: observation_gap
- Movement: first blocker observed: FAIL
- Latest evidence: test-output/reports/movielens-lagrange-service-affinity-live-2026-07-21T11-50-15-031Z.report.json
- Selected theory: none
- Next move: continue supervised step for operation-ledger-quorum-authoritative-release-main

## Continuation
- Status: blocked-theory
- Next action: record system theory before the next operation-ledger-quorum-authoritative-release-main attempt using npm run model:contracts as model discriminator
- Blocker: system theory required for operation-ledger-quorum-authoritative-release-main

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
- **operation-ledger-quorum-authoritative-release-main** [open] rung 0, attempts 3, metric 1 -> 1

## Findings
- **operation-ledger-quorum-authoritative-release-main**: The real RebalanceCoordinator admission path deterministically reproduces the systemic stale-read-model lock: cache-local services rows engage operation_ledger_quorum_concentrated and current source never consults the services owner, so a complete owner observation proving three voters on three nodes cannot release the final dependent sql_write_operations ADD. The discriminator also pins the required consistency contract: owner-local or owner-RPC complete spread may release; concentrated, incomplete, unavailable, malformed, SQL-projection, or any second-ledger unspread evidence must hold; a local no-hold path performs no authority read. (rules out: quorum arithmetic, cure typing, self-move serialization, operation budgets, host scheduling, and a missing physical ledger spread) [test/convergence/dt6-operation-ledger-quorum-authoritative-release.test.js]
- **operation-ledger-quorum-authoritative-release-main**: DT red-on-revert proven for test/convergence/dt6-operation-ledger-quorum-authoritative-release.test.js [dt:solve/changes/dt-prove/dt6-operation-ledger-quorum-authoritative-release.test.js-2026-07-21T12-09-23-015Z.json]
- **operation-ledger-quorum-authoritative-release-main**: DT red-on-revert proven for test/convergence/dt6-operation-ledger-quorum-authoritative-release.test.js [dt:solve/changes/dt-prove/dt6-operation-ledger-quorum-authoritative-release.test.js-2026-07-21T12-12-18-793Z.json]
- **operation-ledger-quorum-authoritative-release-main**: Exact attempt sha256:e4a79ca5ed1c3a28ca4d5cbbd064788e492a24a6be2c0233131bf504daa3ff34 fails closed-authority review: OWNER_RPC_PREFERRED may fall back to any local replica, while local_partition_replica was accepted without proving coordinator ownership; the artifact also omitted the new decision table and deterministic test. [subagent:verify_ledger_authoritative_release]
- **operation-ledger-quorum-authoritative-release-main**: DT red-on-revert proven for test/convergence/dt6-operation-ledger-quorum-authoritative-release.test.js [dt:solve/changes/dt-prove/dt6-operation-ledger-quorum-authoritative-release.test.js-2026-07-21T12-22-24-007Z.json]
- **operation-ledger-quorum-authoritative-release-main**: Independent verification passed: strict leader-pinned OWNER_RPC_REQUIRED evidence closes the prior follower-fallback defect; all seven artifact blobs including the decision table and deterministic test match; fail-closed matrix, no-read fast path, serialization safety, and red-on-revert proof are valid. [subagent:verify_ledger_authoritative_release]
- **operation-ledger-quorum-authoritative-release-main**: Fresh full contract/model verification passed after the runtime fix: the active-gate TLC route converges with expectationMet=true, temporalViolated=false, exitCode=0, and the decision-table model includes the owner-RPC-only ledger placement observation contract. [contract:architecture/contracts/evidence/active-gate-tlc-route.model.report.json]
- **operation-ledger-quorum-authoritative-release-main**: Independent verification passed for the complete superseding path union: all eight blobs match, the seven runtime/docs/test blobs are identical to approved attempt 2, and the sole additional model report is freshly green and correctly referenced. [subagent:verify_ledger_authoritative_release]

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
