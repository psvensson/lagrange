# Solve report: schema-provisioning-inline-execute-owner-redrive

**Goal:** Initial table provisioning retains each planned replica-operation execution command until that exact command either owns one serialized operation-lane turn or observes durable forward/terminal progress, so a concurrent CDC/bootstrap wake cannot coalesce the inline command away, no planned row times out in PENDING, and three consecutive fresh MovieLens runs report priority metric 0.

**Class:** product · **Closure:** MEASURED

**Outcome:** EXHAUSTED — 1 frontier(s) parked; human decision needed

**Attempts:** 1

## Links
- spec: solve/epics/service-data-affinity-placement.md
- parent quest: runtime-service-creating-owner-wake-progress-admission
- plan: solve/epics/topology-convergence-hardening.md

## Scope Pressure
- Changed files: 7
- Change bytes: 19205
- Owner areas: src/query, src/rebalancer, test/query, test/rebalancer
- Categories: runtime
- Action: land or separate 4 owner areas: src/query, src/rebalancer, test/query, test/rebalancer
- Split plan:
  - src/rebalancer: 4 file(s)
  - src/query: 1 file(s)
  - test/query: 1 file(s)
  - test/rebalancer: 1 file(s)
- Signal: broad-source-scope severity=medium

## Frontiers
- **schema-provisioning-inline-execute-owner-redrive-main** [parked {exhausted}] rung 0, attempts 1, metric 1 -> 1 — Current HEAD no longer reproduces the inline execute-owner loss and the only current-fingerprint red occurs after its operations drain, at the separately sealed cache-observation boundary; no honest remaining move exists inside this Quest.

## Findings
- **schema-provisioning-inline-execute-owner-redrive-main**: DT red-on-revert proven for test/rebalancer/replica-operation-retained-owner-turn.test.js [dt:solve/changes/dt-prove/replica-operation-retained-owner-turn.test.js-2026-07-20T03-34-20-898Z.json]
- **schema-provisioning-inline-execute-owner-redrive-main**: Independent verifier APPROVE: the exact retained owner-turn patch limits RETAIN to initial provisioning, preserves generic operation_already_executing coalescing, attributes holder rejection separately, reuses the canonical DurableWorkflowCoordinator owner key without new timers or queues, passes focused/static/model gates, and honestly proves green/red/green at the production seam. (rules out: Do not treat the patch as broad executeOperation de-coalescing or as introducing an alternate workflow owner.) [subagent:verify_schema_owner_redrive]
- **schema-provisioning-inline-execute-owner-redrive-main**: Post-attempt binding of the independent APPROVE verdict to the unchanged exact retained owner-turn artifact; no source or test bytes changed after verification. (rules out: Do not checkpoint a later aggregate or infer approval for bytes outside attempt-1.diff.) [subagent:verify_schema_owner_redrive]
- **schema-provisioning-inline-execute-owner-redrive-main**: The sealed lost-inline-schema-operation symptom does not reproduce at checkpoint 97afef2e: 5/5 ordered probes passed, MovieLens provisioned both child tables, loaded 100000 ratings, and executed distributed SQL; the live boundary advanced to runtime placement terminal handoff. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-20T04-04-28-891Z.report.json]
- **schema-provisioning-inline-execute-owner-redrive-main**: The sealed inline execution-loss symptom does not reproduce on current HEAD: the fresh current-fingerprint demo drains replica operations from 5 to 0 and reaches zero total/priority spread before a distinct fail-closed control-snapshot cache_stale_watermark boundary prevents schema admission. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-20T17-07-46-984Z.report.json]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-20T03:41:22.505Z | schema-provisioning-inline-execute-owner-redrive-main | observe | 1 -> 1 | flat | no_evidence |  | diff:solve/changes/schema-provisioning-inline-execute-owner-redrive/attempt-1.diff |
