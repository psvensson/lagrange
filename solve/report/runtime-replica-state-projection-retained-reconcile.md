# Solve report: runtime-replica-state-projection-retained-reconcile

**Goal:** Runtime replica lifecycle completion hands desired state to one production-wired retained projection owner without waiting on services-table writes; that owner composes ServicesOwner and the existing owner-key reconcile queue to serialize and coalesce the latest state per replica and retry typed failures, and three consecutive fresh MovieLens runs report priority metric 0.

**Class:** product · **Closure:** MEASURED

**Outcome:** IN PROGRESS (no terminal recorded)

**Attempts:** 5

## Links
- spec: solve/epics/service-data-affinity-placement.md
- parent quest: schema-admission-canonical-drain-handoff
- plan: solve/epics/topology-convergence-hardening.md

## Current Blocker
- Frontier: runtime-replica-state-projection-retained-reconcile-main
- Owner: unknown
- Boundary: unknown
- Dominant reason: unknown
- Mechanism: unknown
- Movement: no evidence recorded
- Latest evidence: none
- Selected theory: none
- Next move: continue supervised step for runtime-replica-state-projection-retained-reconcile-main

## Continuation
- Status: blocked-unrecorded-evidence
- Next action: continue supervised step for runtime-replica-state-projection-retained-reconcile-main
- Blocker: fresh frontier evidence is not recorded; run node scripts/solve.js ingest-evidence --id runtime-replica-state-projection-retained-reconcile --frontier runtime-replica-state-projection-retained-reconcile-main --evidence test-output/reports/movielens-lagrange-service-affinity-live-2026-07-19T21-22-24-859Z.report.json

## Scope Pressure
- Changed files: 10
- Change bytes: 52046
- Owner areas: src/query, src/runtime, src/workflow, test/runtime, test/workflow
- Categories: runtime, test
- Action: land or separate 5 owner areas: src/query, src/runtime, src/workflow, test/runtime, test/workflow
- Split plan:
  - src/query: 4 file(s)
  - src/runtime: 2 file(s)
  - test/runtime: 2 file(s)
  - src/workflow: 1 file(s)
  - test/workflow: 1 file(s)
- Signal: broad-source-scope severity=medium

## Frontiers
- **runtime-replica-state-projection-retained-reconcile-main** [open] rung 0, attempts 5, metric 1 -> 1

## Findings
- **runtime-replica-state-projection-retained-reconcile-main**: Fresh source-stable MovieLens evidence proves local runtime activation completed but services projection consumed the source operation deadline and lost the authoritative r2 row after routed distributed-participant failures. [file:solve/changes/schema-admission-canonical-drain-handoff/post-attempt-2-live-runtime-projection-loss-2026-07-19.md]
- **runtime-replica-state-projection-retained-reconcile-main**: DT red-on-revert proven for test/runtime/runtime-replica-state-projection-retained-reconcile.test.js [dt:solve/changes/dt-prove/runtime-replica-state-projection-retained-reconcile.test.js-2026-07-19T18-00-49-682Z.json]
- **runtime-replica-state-projection-retained-reconcile-main**: DT red-on-revert proven for test/runtime/runtime-replica-state-projection-retained-reconcile.test.js [dt:solve/changes/dt-prove/runtime-replica-state-projection-retained-reconcile.test.js-2026-07-19T18-11-15-742Z.json]
- **runtime-replica-state-projection-retained-reconcile-main**: Independent verification rejected this exact attempt [subagent:verify_runtime_projection_reconcile]
- **runtime-replica-state-projection-retained-reconcile-main**: Independent verification rejected this exact attempt: cross-key writes serialize globally, stale retry can survive newer permanent failure, and in-flight failure can repopulate retry state after shutdown [subagent:verify_runtime_projection_reconcile]
- **runtime-replica-state-projection-retained-reconcile-main**: DT red-on-revert proven for test/runtime/runtime-replica-state-projection-retained-reconcile.test.js [dt:solve/changes/dt-prove/runtime-replica-state-projection-retained-reconcile.test.js-2026-07-19T18-22-34-232Z.json]
- **runtime-replica-state-projection-retained-reconcile-main**: Independent verification rejected this exact attempt: shared keyed reconciliation concurrency was unbounded and could bypass existing shard concurrency caps [subagent:verify_runtime_projection_reconcile]
- **runtime-replica-state-projection-retained-reconcile-main**: DT red-on-revert proven for test/workflow/owner-key-reconcile-queue.test.js [dt:solve/changes/dt-prove/owner-key-reconcile-queue.test.js-2026-07-19T18-28-24-897Z.json]
- **runtime-replica-state-projection-retained-reconcile-main**: Independent verification rejected this exact attempt: touched service-runtime-lifecycle.js exceeded the 800-line source cap [subagent:verify_runtime_projection_reconcile]
- **runtime-replica-state-projection-retained-reconcile-main**: Independent verification passed all sealed constraints, prior race objections, bounded-work checks, production wiring, mutation discipline, and file-size gates [subagent:verify_runtime_projection_reconcile]

## Theories
- **theory-20260719-ownerkeyreconcilequeue-enforces-an-explicit-aggregate-concurrency** [active] system, mechanism OwnerKeyReconcileQueue enforces an explicit aggregate concurrency ceiling that defaults to one for existing consumers; RuntimeReplicaStateProjectionOwner opts into four while retaining same-key serialization, stale-retry supersession, and shutdown sealing, owner OwnerKeyReconcileQueue and RuntimeReplicaStateProjectionOwner, modelGate npm run model:contracts

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-19T18:10:39.282Z | runtime-replica-state-projection-retained-reconcile-main | observe | 1 -> 1 | flat | no_evidence |  | diff:solve/changes/runtime-replica-state-projection-retained-reconcile/attempt-1.diff |
| 2026-07-19T18:15:01.696Z | runtime-replica-state-projection-retained-reconcile-main | observe | 1 -> 1 | flat | no_evidence |  | diff:solve/changes/runtime-replica-state-projection-retained-reconcile/attempt-2.diff |
| 2026-07-19T18:23:04.428Z | runtime-replica-state-projection-retained-reconcile-main | observe | 1 -> 1 | flat | no_evidence |  | diff:solve/changes/runtime-replica-state-projection-retained-reconcile/attempt-3.diff |
| 2026-07-19T18:29:32.483Z | runtime-replica-state-projection-retained-reconcile-main | observe | 1 -> 1 | flat | no_evidence |  | diff:solve/changes/runtime-replica-state-projection-retained-reconcile/attempt-4.diff |
| 2026-07-19T18:34:36.969Z | runtime-replica-state-projection-retained-reconcile-main | observe | 1 -> 1 | flat | no_evidence |  | diff:solve/changes/runtime-replica-state-projection-retained-reconcile/attempt-5.diff |
