# Solve report: movielens-operation-ledger-terminal-hold

**Goal:** A locally created operation-ledger REPLACE keeps the serialized self-move hold engaged until authoritative terminal or reaper-owned release evidence exists; durable step-age timeout alone cannot release dependent operation creation while the self-move still has active target/source progress, so a post-spread batch cannot overlap the ledger's own surgery, and the unchanged production five-node MovieLens Wave-4 milestone completes successfully.

**Class:** product · **Closure:** MEASURED

**Outcome:** IN PROGRESS (no terminal recorded)

**Attempts:** 1

## Links
- spec: solve/epics/service-data-affinity-placement.md
- parent quest: movielens-incremental-replace-spread-nonregression
- plan: solve/epics/self-hosting-circularity-generic-treatment.md

## Current Blocker
- Frontier: movielens-operation-ledger-terminal-hold-main
- Owner: unknown
- Boundary: unknown
- Dominant reason: unknown
- Mechanism: transition_gap
- Movement: first blocker observed: FAIL
- Latest evidence: test-output/reports/movielens-lagrange-service-affinity-live-2026-07-16T12-23-19-124Z.report.json
- Selected theory: none
- Next move: continue supervised step for movielens-operation-ledger-terminal-hold-main

## Continuation
- Status: allowed
- Next action: continue supervised step for movielens-operation-ledger-terminal-hold-main
- Blocker: none

## Scope Pressure
- Changed files: 10
- Change bytes: 43064
- Owner areas: models, scripts/model-tlc.js, src/rebalancer, test/convergence, test/rebalancer
- Categories: other, runtime, test
- Action: land or separate 5 owner areas: models, scripts/model-tlc.js, src/rebalancer, test/convergence, test/rebalancer
- Split plan:
  - models: 5 file(s)
  - src/rebalancer: 2 file(s)
  - scripts/model-tlc.js: 1 file(s)
  - test/convergence: 1 file(s)
  - test/rebalancer: 1 file(s)
- Signal: broad-source-scope severity=medium

## Frontiers
- **movielens-operation-ledger-terminal-hold-main** [open] rung 1, attempts 1, metric 1 -> 1

## Findings
- **movielens-operation-ledger-terminal-hold-main**: Immutable Wave-4 archive 65b98a3f92c3216a7f782b09acc7ff1e0eb060408facc31bec307b7a9f03c3e5 shows the locally created replica_operations REPLACE replace-op-b0b98821c956268ed7774ca615a1662a still active through source removal at 11:44:41.948, durable STOPPING at 11:44:45.876, drain settle at 11:44:47.265, and terminal completion at 11:44:51.911. Nevertheless five dependent REPLACEs began creation at 11:44:43.043-46.896; all dispatched and created target replicas, then their replica_operations workflow writes failed with distributed participant failures. The run-20 serialization hold therefore released before authoritative terminal completion. The current interlock reclassifies every nonterminal row stale past its step timeout as non-participating, importing the CL-043 remove-safety relief into the stronger self-hosting serialization boundary; durable progress lag can make an actively retried self-move look stale.
- **movielens-operation-ledger-terminal-hold-main**: DT red-on-revert proven for test/convergence/dt6-operation-ledger-terminal-hold.test.js [dt:solve/changes/dt-prove/dt6-operation-ledger-terminal-hold.test.js-2026-07-16T12-06-06-891Z.json]
- **movielens-operation-ledger-terminal-hold-main**: Focused lifecycle/admission TLA+ composition passes with authoritative-terminal release and its timeout-only-release mutant violates SerializationHoldReleaseRequiresAuthoritativeTerminal while physical target progress remains active [model:test-output/reports/operation-ledger-terminal-hold-fixed.model.report.json]
- **movielens-operation-ledger-terminal-hold-main**: Timeout-only hold release is an explicit forbidden formal shape: TLC observes the declared invariant violation in the focused mutant configuration [model:test-output/reports/operation-ledger-terminal-hold-timeout-release.model.report.json]
- **movielens-operation-ledger-terminal-hold-main**: DT red-on-revert proven for test/convergence/dt6-operation-ledger-terminal-hold.test.js [dt:solve/changes/dt-prove/dt6-operation-ledger-terminal-hold.test.js-2026-07-16T12-12-40-329Z.json]
- **movielens-operation-ledger-terminal-hold-main**: Independent source verification passed after rejecting and then closing the delayed-old-terminal-read/new-holder compare-and-clear TOCTOU; timeout release, single lifecycle owner, run-20/run-22/CL-043 preservation, red-on-revert, and focused TLA composition were all verified [subagent:/root/terminal_hold_verifier]
- **movielens-operation-ledger-terminal-hold-main**: Ingested evidence from movielens-lagrange-service-affinity-live-2026-07-16T11-45-37-305Z.report.json. Metric: 1 -> 1. Verdict: FAIL. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-16T11-45-37-305Z.report.json]
- **movielens-operation-ledger-terminal-hold-main**: independent verification passed [subagent:terminal_hold_verifier]
- **movielens-operation-ledger-terminal-hold-main**: sealed premature-release symptom does not reproduce on checkpoint b1a960eb: stale durable timeout with active owner progress remains held, and delayed old terminal evidence cannot clear a newer holder [dt:solve/changes/dt-prove/dt6-operation-ledger-terminal-hold.test.js-2026-07-16T12-12-40-329Z.json]
- **movielens-operation-ledger-terminal-hold-main**: Ingested evidence from movielens-lagrange-service-affinity-live-2026-07-16T12-23-19-124Z.report.json. Metric: 1 -> 1. Verdict: FAIL. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-16T12-23-19-124Z.report.json]
- **movielens-operation-ledger-terminal-hold-main**: Ingested evidence from movielens-lagrange-service-affinity-live-2026-07-16T12-23-19-124Z.report.json. Metric: 1 -> 1. Verdict: FAIL. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-16T12-23-19-124Z.report.json]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-16T12:14:33.922Z | movielens-operation-ledger-terminal-hold-main | observe | 1 -> 1 | flat | no_evidence |  | diff:solve/changes/movielens-operation-ledger-terminal-hold/attempt-1.diff |
