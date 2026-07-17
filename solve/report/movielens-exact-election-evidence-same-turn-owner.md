# Solve report: movielens-exact-election-evidence-same-turn-owner

**Goal:** When a priority REPLACE target-election handoff returns COMPLETED for the exact replacement, the operation workflow immediately routes the recorded evidence back through the canonical remove-safety owner in the same turn, before retry expiry can retarget it, while all voter, quorum, membership, leadership, and serialized-ledger guards remain unchanged and the production MovieLens Wave-4 milestone completes.

**Class:** product · **Closure:** MEASURED

**Outcome:** IN PROGRESS (no terminal recorded)

**Attempts:** 2

## Links
- spec: solve/epics/service-data-affinity-placement.md
- parent quest: movielens-incremental-replace-spread-nonregression
- plan: solve/epics/self-hosting-circularity-generic-treatment.md

## Current Blocker
- Frontier: movielens-exact-election-evidence-same-turn-owner-main
- Owner: unknown
- Boundary: unknown
- Dominant reason: unknown
- Mechanism: transition_gap
- Movement: narrowed: FAIL -> FAIL
- Latest evidence: test-output/reports/movielens-lagrange-service-affinity-live-2026-07-16T12-23-19-124Z.report.json
- Selected theory: none
- Next move: continue supervised step for movielens-exact-election-evidence-same-turn-owner-main
- No longer current: FAIL

## Continuation
- Status: blocked-theory
- Next action: record and select frontier theory for movielens-exact-election-evidence-same-turn-owner-main with npm run model:contracts as discriminator
- Blocker: frontier theory required for movielens-exact-election-evidence-same-turn-owner-main

## Scope Pressure
- Changed files: 4
- Change bytes: 19728
- Owner areas: src/rebalancer, test/rebalancer
- Categories: runtime
- Split plan:
  - src/rebalancer: 2 file(s)
  - test/rebalancer: 2 file(s)
- Signals: none

## Frontiers
- **movielens-exact-election-evidence-same-turn-owner-main** [open] rung 2, attempts 2, metric 1 -> 1

## Findings
- **movielens-exact-election-evidence-same-turn-owner-main**: On current HEAD aead52ac the archived live failure still binds: exact replacement election COMPLETED evidence is recorded, but continuation waits when the target is routing-ready and another retarget voter exists; after the 5s suppression window candidate retargeting prevents the remove-safety owner from consuming the exact ACK in time. [data/examples/service-data-affinity-demo-archive/wave4-live-incremental-replace-spread-nonregression-2026-07-16T10-00-24-317Z.tar.gz]
- **movielens-exact-election-evidence-same-turn-owner-main**: Ingested evidence from movielens-lagrange-service-affinity-live-2026-07-16T10-00-24-317Z.report.json. Metric: unknown -> 1. Verdict: FAIL. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-16T10-00-24-317Z.report.json]
- **movielens-exact-election-evidence-same-turn-owner-main**: Ingested evidence from movielens-lagrange-service-affinity-live-2026-07-16T10-00-24-317Z.report.json. Metric: unknown -> 1. Verdict: FAIL. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-16T10-00-24-317Z.report.json]
- **movielens-exact-election-evidence-same-turn-owner-main**: DT red-on-revert proven for test/rebalancer/quorum-conditioned-remove-safety.test.js [dt:solve/changes/dt-prove/quorum-conditioned-remove-safety.test.js-2026-07-16T11-17-52-139Z.json]
- **movielens-exact-election-evidence-same-turn-owner-main**: Independent verification rejected attempt 1 solely because the newly edited test title used the forbidden word terminalizes instead of terminates under STYLE-0012; functional owner-boundary, transport, focused-suite, DT red-on-revert, lint, and unchanged-contract checks otherwise passed. [subagent:verify_exact_election_same_turn_attempt1]
- **movielens-exact-election-evidence-same-turn-owner-main**: Independent exact-source verification passed: the four-path delta records exact COMPLETED evidence before data-driven same-turn continuation, re-enters canonical remove safety without authorizing removal, preserves every safety/interlock guard and NOT_FOUND retargeting, passes 211 focused assertions plus 16 transport assertions, ESLint, diff integrity, and the green/red-on-revert/green DT proof. [subagent:verify_exact_election_same_turn_attempt1]
- **movielens-exact-election-evidence-same-turn-owner-main**: Ingested evidence from movielens-lagrange-service-affinity-live-2026-07-16T11-45-37-305Z.report.json. Metric: 1 -> 1. Verdict: FAIL. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-16T11-45-37-305Z.report.json]
- **movielens-exact-election-evidence-same-turn-owner-main**: Ingested evidence from movielens-lagrange-service-affinity-live-2026-07-16T11-45-37-305Z.report.json. Metric: 1 -> 1. Verdict: FAIL. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-16T11-45-37-305Z.report.json]
- **movielens-exact-election-evidence-same-turn-owner-main**: Changed live run 2026-07-16T11:41Z engaged the exact-election same-turn fix: replace-op-b0b98821c956268ed7774ca615a1662a recorded the target leader-election ACK at 11:44:37.620 and dispatched/completed source REMOVE by 11:44:41.948, before evidence expiry. Wave4 still failed later on stale_replica_operations_in_flight after five other partitions created replacement operations without workflow dispatch. Immutable archive data/examples/service-data-affinity-demo-archive/wave4-live-exact-election-same-turn-2026-07-16T11-45-37-305Z.tar.gz sha256 65b98a3f92c3216a7f782b09acc7ff1e0eb060408facc31bec307b7a9f03c3e5; report sha256 bd79ff4228a9a15214631966b3d38cd909e7e404cbf87adc708960385e24c4fe.
- **movielens-exact-election-evidence-same-turn-owner-main**: Correction after immutable full-log inspection: the five post-hold operations did dispatch between 11:44:48 and 11:44:57 and all created target replicas by 11:45:20. The earlier no-dispatch summary was based on creator-side lines only. The stronger root is premature self-move serialization release: dependent creation began 11:44:43 while replica_operations self-move b0b... remained nonterminal until 11:44:51, then every dependent workflow-step write failed against replica_operations. Treat the preceding no-dispatch wording as superseded.
- **movielens-exact-election-evidence-same-turn-owner-main**: Ingested evidence from movielens-lagrange-service-affinity-live-2026-07-16T12-23-19-124Z.report.json. Metric: 1 -> 1. Verdict: FAIL. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-16T12-23-19-124Z.report.json]
- **movielens-exact-election-evidence-same-turn-owner-main**: Ingested evidence from movielens-lagrange-service-affinity-live-2026-07-16T12-23-19-124Z.report.json. Metric: 1 -> 1. Verdict: FAIL. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-16T12-23-19-124Z.report.json]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-16T11:18:59.575Z | movielens-exact-election-evidence-same-turn-owner-main | observe | 1 -> 1 | flat | no_previous |  | diff:solve/changes/movielens-exact-election-evidence-same-turn-owner/attempt-1.diff |
| 2026-07-16T11:25:45.890Z | movielens-exact-election-evidence-same-turn-owner-main | local-fix | 1 -> 1 | flat | no_previous |  | diff:solve/changes/movielens-exact-election-evidence-same-turn-owner/attempt-2.diff |
