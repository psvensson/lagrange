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
- Mechanism: topology_gap
- Movement: first blocker observed: FAIL
- Latest evidence: test-output/reports/movielens-lagrange-service-affinity-live-2026-07-16T10-00-24-317Z.report.json
- Selected theory: none
- Next move: continue supervised step for movielens-exact-election-evidence-same-turn-owner-main

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
