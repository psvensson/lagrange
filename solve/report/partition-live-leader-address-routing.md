# Solve report: partition-live-leader-address-routing

**Goal:** An established multi-replica partition follower forwards writes to a newly elected peer while its SERVICES cache is lagging; routing uses only a validated live Raft address for the matching partition replica, never a stale bootstrap hint or a second topology authority, and one unchanged fresh MovieLens live run completes ratings split provisioning without peer-address-resolution participant failures and reports priority metric 0.

**Class:** product · **Closure:** MEASURED

**Outcome:** IN PROGRESS (no terminal recorded)

**Attempts:** 3

## Links
- spec: solve/epics/service-data-affinity-placement.md
- parent quest: formation-joining-ready-phase-fence-live
- plan: solve/epics/formation-complexity-consolidation.md

## Current Blocker
- Frontier: partition-live-leader-address-routing-main
- Owner: unknown
- Boundary: unknown
- Dominant reason: unknown
- Mechanism: transition_gap
- Movement: first blocker observed: FAIL
- Latest evidence: test-output/reports/movielens-lagrange-service-affinity-live-2026-07-19T09-57-45-554Z.report.json
- Selected theory: none
- Next move: continue supervised step for partition-live-leader-address-routing-main
- No longer current: routing fix regression; replacement creation failure; durable SERVICES ACTIVE failure; timeout increase; blind unchanged rerun

## Continuation
- Status: blocked-theory
- Next action: record system theory before the next partition-live-leader-address-routing-main attempt using npm run model:contracts as model discriminator
- Blocker: system theory required for partition-live-leader-address-routing-main
- Blocker: frontier theory required for partition-live-leader-address-routing-main

## Scope Pressure
- Changed files: 4
- Change bytes: 8338
- Owner areas: src/partition, test/partition
- Categories: runtime, test
- Split plan:
  - src/partition: 3 file(s)
  - test/partition: 1 file(s)
- Signals: none

## Frontiers
- **partition-live-leader-address-routing-main** [open] rung 3, attempts 3, metric 1 -> 1

## Findings
- **partition-live-leader-address-routing-main**: Current HEAD reproduces the live mechanism through the real PartitionService leader-change and routed-write path: the Raft transition normalizes a newly elected unified leader to a bare replica ID, then handleRemoteQuery fails in buildPeerAddress when that replica is absent from SERVICES and bootstrap peers; the focused test is red at the exact resolution error while 96 pre-existing assertions remain green. (rules out: replica creation failure; canonical SERVICES persistence failure; raising the live wait; adding a generic bootstrap-hint fallback) [test/partition/partition-service.test.js]
- **partition-live-leader-address-routing-main**: Ingested evidence from movielens-lagrange-service-affinity-live-2026-07-19T08-49-05-180Z.report.json. Metric: 1 -> 1. Verdict: FAIL. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-19T08-49-05-180Z.report.json]
- **partition-live-leader-address-routing-main**: Independent verification rejected attempt 1: routed leader resolution can fall through to a stale matching bootstrap peer hint after a malformed, stale, or mismatched live Raft leader is rejected; the mismatch test omitted that hint and was vacuous for the sealed fail-closed contract. [subagent:verify_live_leader_routing]
- **partition-live-leader-address-routing-main**: Independent verification rejected attempt 2 solely because the new live Raft resolver used the retired TYPEOF.STRING alias contrary to STYLE-0011; behavioral stale-hint, malformed, mismatched, cache-precedence, production-path, and bounded-failure attacks otherwise passed. [subagent:verify_live_leader_routing_attempt2]
- **partition-live-leader-address-routing-main**: Independent verification passed attempt 3: exact artifact/source identity, STYLE-0011 compliance, real routed-write fidelity, canonical cache precedence, matching live Raft bridge, and stale-hint/malformed/non-partition/mismatched fail-closed attacks all passed with no blocking findings. [subagent:verify_live_leader_routing_attempt3]
- **partition-live-leader-address-routing-main**: Ingested evidence from movielens-lagrange-service-affinity-live-2026-07-19T09-57-45-554Z.report.json. Metric: 1 -> 1. Verdict: FAIL. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-19T09-57-45-554Z.report.json]
- **partition-live-leader-address-routing-main**: Ingested evidence from movielens-lagrange-service-affinity-live-2026-07-19T09-57-45-554Z.report.json. Metric: 1 -> 1. Verdict: FAIL. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-19T09-57-45-554Z.report.json]
- **partition-live-leader-address-routing-main**: Fresh post-fix live evidence did not reach ratings routing: schema admission timed out on replica_operations-p1 spread gap 1. Canonical SERVICES held three ACTIVE rows on three distinct nodes (r1, r4, and replace-replica-4d14...), and the replacement plus ADD operations terminalized, but priority diagnostics remained ready=2 with status_syncing=1 and operationCreationRequired=false. The normal executor-outcome ACTIVE branch calls reconcileReplaceActualActive/completeOperation without the confirmActiveReplicaTerminalHandoff guard used by recovery reconciliation, allowing source retirement and ledger release before the target SERVICES cache projection is aligned. (rules out: routing fix regression; replacement creation failure; durable SERVICES ACTIVE failure; timeout increase; blind unchanged rerun) [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-19T09-57-45-554Z.report.json]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-19T09:28:47.614Z | partition-live-leader-address-routing-main | observe | 1 -> 1 | flat | no_evidence |  | diff:solve/changes/partition-live-leader-address-routing/attempt-1.diff |
| 2026-07-19T09:38:06.197Z | partition-live-leader-address-routing-main | local-fix | 1 -> 1 | flat | no_evidence |  | diff:solve/changes/partition-live-leader-address-routing/attempt-2.diff |
| 2026-07-19T09:45:36.057Z | partition-live-leader-address-routing-main | widen-scope | 1 -> 1 | flat | no_evidence |  | diff:solve/changes/partition-live-leader-address-routing/attempt-3.diff |
