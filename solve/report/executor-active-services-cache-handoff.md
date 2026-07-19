# Solve report: executor-active-services-cache-handoff

**Goal:** A locally owned priority REPLACE that receives a direct ACTIVE executor outcome retains its operation and source replica until the target's complete authoritative SERVICES row is ACTIVE and aligned into the planning cache through the same terminal-handoff owner used by recovery; the unchanged fresh MovieLens live run then completes schema admission and ratings split provisioning without peer-address-resolution participant failures and reports priority metric 0.

**Class:** product · **Closure:** MEASURED

**Outcome:** IN PROGRESS (no terminal recorded)

**Attempts:** 1

## Links
- spec: solve/epics/service-data-affinity-placement.md
- parent quest: partition-live-leader-address-routing
- plan: solve/epics/topology-convergence-hardening.md

## Current Blocker
- Frontier: executor-active-services-cache-handoff-main
- Owner: unknown
- Boundary: unknown
- Dominant reason: unknown
- Mechanism: transition_gap
- Movement: first blocker observed: FAIL
- Latest evidence: test-output/reports/movielens-lagrange-service-affinity-live-2026-07-19T10-30-41-823Z.report.json
- Selected theory: none
- Next move: continue supervised step for executor-active-services-cache-handoff-main
- No longer current: Do not debug the established recovery-driven ACTIVE handoff first; the deterministic reproduction isolates the missing decision to the direct executor-outcome COMPLETE branch.; Do not treat attempt 1 as lacking red-on-revert, retry-retention, ADD/REPLACE, remote-owner, or non-partition verification; the verifier reproduced the intended seven-failure old-runtime mechanism and passed 497 focused, adjacent, and safety assertions.

## Continuation
- Status: allowed
- Next action: continue supervised step for executor-active-services-cache-handoff-main
- Blocker: none

## Scope Pressure
- Changed files: 5
- Change bytes: 13335
- Owner areas: src/rebalancer, test/rebalancer
- Categories: runtime
- Split plan:
  - test/rebalancer: 4 file(s)
  - src/rebalancer: 1 file(s)
- Signals: none

## Frontiers
- **executor-active-services-cache-handoff-main** [open] rung 1, attempts 1, metric 1 -> 1

## Findings
- **executor-active-services-cache-handoff-main**: inherited from partition-live-leader-address-routing: Current HEAD reproduces the live mechanism through the real PartitionService leader-change and routed-write path: the Raft transition normalizes a newly elected unified leader to a bare replica ID, then handleRemoteQuery fails in buildPeerAddress when that replica is absent from SERVICES and bootstrap peers; the focused test is red at the exact resolution error while 96 pre-existing assertions remain green. (rules out: replica creation failure; canonical SERVICES persistence failure; raising the live wait; adding a generic bootstrap-hint fallback) [test/partition/partition-service.test.js]
- **executor-active-services-cache-handoff-main**: inherited from partition-live-leader-address-routing: Fresh post-fix live evidence did not reach ratings routing: schema admission timed out on replica_operations-p1 spread gap 1. Canonical SERVICES held three ACTIVE rows on three distinct nodes (r1, r4, and replace-replica-4d14...), and the replacement plus ADD operations terminalized, but priority diagnostics remained ready=2 with status_syncing=1 and operationCreationRequired=false. The normal executor-outcome ACTIVE branch calls reconcileReplaceActualActive/completeOperation without the confirmActiveReplicaTerminalHandoff guard used by recovery reconciliation, allowing source retirement and ledger release before the target SERVICES cache projection is aligned. (rules out: routing fix regression; replacement creation failure; durable SERVICES ACTIVE failure; timeout increase; blind unchanged rerun) [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-19T09-57-45-554Z.report.json]
- **executor-active-services-cache-handoff-main**: On current HEAD, a direct REPLICA_CREATE_ACTIVE outcome for a locally owned priority REPLACE bypasses confirmActiveReplicaTerminalHandoff: it invokes source-retirement continuation while the exact planning-cache SERVICES row remains SYNCING, and retains neither executor-outcome retry evidence nor a cache-handoff wake-up. (rules out: Do not debug the established recovery-driven ACTIVE handoff first; the deterministic reproduction isolates the missing decision to the direct executor-outcome COMPLETE branch.) [solve/changes/executor-active-services-cache-handoff/repro-on-head-2026-07-19.md]
- **executor-active-services-cache-handoff-main**: Ingested evidence from movielens-lagrange-service-affinity-live-2026-07-19T09-57-45-554Z.report.json. Metric: 1 -> 1. Verdict: FAIL. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-19T09-57-45-554Z.report.json]
- **executor-active-services-cache-handoff-main**: Independent verification approved the exact attempt: direct partition ACTIVE ADD/REPLACE completion now shares recovery-owned authoritative SERVICES cache handoff; failed alignment retains both retry owners and cannot retire a REPLACE source, successful alignment consumes the outcome, and remote/non-partition behavior remains unchanged. (rules out: Do not treat attempt 1 as lacking red-on-revert, retry-retention, ADD/REPLACE, remote-owner, or non-partition verification; the verifier reproduced the intended seven-failure old-runtime mechanism and passed 497 focused, adjacent, and safety assertions.) [subagent:verify_active_services_handoff_attempt1]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-19T10:15:16.476Z | executor-active-services-cache-handoff-main | observe | 1 -> 1 | flat | no_evidence |  | diff:solve/changes/executor-active-services-cache-handoff/attempt-1.diff |
