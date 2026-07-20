# Solve report: runtime-service-creating-owner-wake-progress-admission

**Goal:** A target-observed ACTIVE outcome for a source-owned remote runtime-service ADD re-enters the canonical source owner while its durable row is CREATING, reconciles the exact target services row to terminal ACTIVE without target-side workflow writes or broad non-system create replay, and three consecutive fresh MovieLens runs report priority metric 0.

**Class:** product · **Closure:** MEASURED

**Outcome:** IN PROGRESS (no terminal recorded)

**Attempts:** 7

## Links
- spec: solve/epics/service-data-affinity-placement.md
- parent quest: runtime-replica-state-projection-retained-reconcile-integrity-reseal
- plan: solve/epics/topology-convergence-hardening.md

## Current Blocker
- Frontier: runtime-service-creating-owner-wake-progress-admission-main
- Owner: unknown
- Boundary: unknown
- Dominant reason: unknown
- Mechanism: transition_gap
- Movement: same blocker remains: FAIL
- Latest evidence: test-output/reports/movielens-lagrange-service-affinity-live-2026-07-20T04-04-28-891Z.report.json
- Selected theory: none
- Next move: continue supervised step for runtime-service-creating-owner-wake-progress-admission-main

## Continuation
- Status: allowed
- Next action: continue supervised step for runtime-service-creating-owner-wake-progress-admission-main
- Blocker: none

## Scope Pressure
- Changed files: 16
- Change bytes: 53812
- Owner areas: src/constants, src/control-plane, src/rebalancer, test/control-plane, test/rebalancer
- Categories: runtime, test
- Action: split by owner area before the next attempt (16 files)
- Action: land or separate 5 owner areas: src/constants, src/control-plane, src/rebalancer, test/control-plane, test/rebalancer
- Split plan:
  - src/rebalancer: 7 file(s)
  - src/control-plane: 6 file(s)
  - src/constants: 1 file(s)
  - test/control-plane: 1 file(s)
  - test/rebalancer: 1 file(s)
- Signal: broad-source-scope severity=medium
- Signal: large-diff-stack severity=medium

## Frontiers
- **runtime-service-creating-owner-wake-progress-admission-main** [open] rung 0, attempts 7, metric 1 -> 1

## Findings
- **runtime-service-creating-owner-wake-progress-admission-main**: DT red-on-revert proven for test/control-plane/replica-dispatch-runtime-target-progress-wake.test.js [dt:solve/changes/dt-prove/replica-dispatch-runtime-target-progress-wake.test.js-2026-07-19T19-39-35-247Z.json]
- **runtime-service-creating-owner-wake-progress-admission-main**: DT red-on-revert proven for test/control-plane/replica-dispatch-runtime-target-progress-wake.test.js [dt:solve/changes/dt-prove/replica-dispatch-runtime-target-progress-wake.test.js-2026-07-19T19-40-44-674Z.json]
- **runtime-service-creating-owner-wake-progress-admission-main**: DT red-on-revert proven for test/control-plane/replica-dispatch-runtime-target-progress-wake.test.js [dt:solve/changes/dt-prove/replica-dispatch-runtime-target-progress-wake.test.js-2026-07-19T19-44-34-019Z.json]
- **runtime-service-creating-owner-wake-progress-admission-main**: Live Demo 2 engaged the exact target-progress seam: target services row r2 was ACTIVE, remote ADD a737532b-b8ad-4e24-801c-135237dcc809 remained CREATING, and the source dispatch gate dropped the canonical wake before owner reconciliation. [file:solve/changes/runtime-replica-state-projection-retained-reconcile-integrity-reseal/post-live-ordered-gate-boundary-move-2026-07-19.md]
- **runtime-service-creating-owner-wake-progress-admission-main**: DT red-on-revert proven for test/control-plane/replica-dispatch-runtime-target-progress-wake.test.js [dt:solve/changes/dt-prove/replica-dispatch-runtime-target-progress-wake.test.js-2026-07-19T19-49-09-984Z.json]
- **runtime-service-creating-owner-wake-progress-admission-main**: Independent verification rejected this exact attempt: six new terminaliz* test strings violate STYLE-0012; functional mechanism review otherwise passed. [subagent:verify_runtime_wake_attempt]
- **runtime-service-creating-owner-wake-progress-admission-main**: DT red-on-revert proven for test/control-plane/replica-dispatch-runtime-target-progress-wake.test.js [dt:solve/changes/dt-prove/replica-dispatch-runtime-target-progress-wake.test.js-2026-07-19T19-56-04-324Z.json]
- **runtime-service-creating-owner-wake-progress-admission-main**: Independent verification passed: replacement covers every rejected path, changes only the six STYLE-0012 strings, and preserves the approved functional bytes. [subagent:verify_runtime_wake_attempt]
- **runtime-service-creating-owner-wake-progress-admission-main**: Excluded boundary: the priority-partition REPLACE source-removal handoff neighbor remains red on both parent HEAD and the exact runtime-service wake patch (isolated 1/1/1 across fix/revert/restore), so it is not caused by this runtime_service target-progress admission and is owned by the existing priority replacement/remove-safety workstream. [subagent:verify_runtime_wake_attempt]
- **runtime-service-creating-owner-wake-progress-admission-main**: On checkpoint c48d5724, the sealed target ACTIVE -> source CREATING wake-drop symptom does not reproduce in the production-seam DT: the exact source owner reaches ACTIVE; reverting the source patch restores the drop. [dt:solve/changes/dt-prove/replica-dispatch-runtime-target-progress-wake.test.js-2026-07-19T19-56-04-324Z.json]
- **runtime-service-creating-owner-wake-progress-admission-main**: The fresh ordered live gate passed formation 5/5 and both schema/load admissions, then stopped on measuring Demo 1 at a split-adjacent ratings Query timeout after 15000ms before runtime-service deployment. The sealed target-ACTIVE wake seam was not reached, so this is a moved earlier boundary rather than a refutation of checkpoint c48d5724; no unchanged rerun was made. (rules out: Do not change the runtime-service wake patch, timeouts, 500-row loader batch, split policy, runner order, scoring, or retry unchanged bytes from this pre-seam witness.) [file:solve/changes/runtime-service-creating-owner-wake-progress-admission/post-live-ordered-gate-boundary-move-2026-07-19.md]
- **runtime-service-creating-owner-wake-progress-admission-main**: Fresh source-stable live witness reproduces the sealed seam: runtime ADD 7bd8c0b7-c43f-4d16-8291-20e237312ffe committed SENDING at 1784509016164; the exact target services row became ACTIVE at 1784509016321; source committed CREATING at 1784509016347; all three durable operation replicas remained CREATING while all three services replicas agreed exact target ACTIVE, and target handoff retries ran to the operation budget. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-20T01-06-07-995Z.report.json]
- **runtime-service-creating-owner-wake-progress-admission-main**: DT red-on-revert proven for test/control-plane/replica-dispatch-runtime-target-progress-wake.test.js [dt:solve/changes/dt-prove/replica-dispatch-runtime-target-progress-wake.test.js-2026-07-20T01-12-23-939Z.json]
- **runtime-service-creating-owner-wake-progress-admission-main**: Independent verification rejected attempt 3: the coalescing DT stopped before durable source ACTIVE, getReconciledReplicaStatus retained a non-exact partition fallback, and the edited dispatch source remained above the 800-line threshold. [subagent:verify_runtime_context_coalescing]
- **runtime-service-creating-owner-wake-progress-admission-main**: DT red-on-revert proven for test/control-plane/replica-dispatch-runtime-target-progress-wake.test.js [dt:solve/changes/dt-prove/replica-dispatch-runtime-target-progress-wake.test.js-2026-07-20T01-23-21-396Z.json]
- **runtime-service-creating-owner-wake-progress-admission-main**: DT red-on-revert proven for test/control-plane/replica-dispatch-runtime-target-progress-wake.test.js [dt:solve/changes/dt-prove/replica-dispatch-runtime-target-progress-wake.test.js-2026-07-20T01-23-32-259Z.json]
- **runtime-service-creating-owner-wake-progress-admission-main**: Attempt sha256:a7cea4f93b2f2dfce31ba52a2ab4da8f698edd0bda7451aa59c1396f0dd805eb is rejected: exact-only status reconciliation was applied globally instead of runtime-service-scoped, and the extracted queue helper duplicated the canonical refreshRowBeforeDispatch vocabulary constant. [subagent:verify_runtime_context_coalescing]
- **runtime-service-creating-owner-wake-progress-admission-main**: DT red-on-revert proven for test/control-plane/replica-dispatch-runtime-target-progress-wake.test.js [dt:solve/changes/dt-prove/replica-dispatch-runtime-target-progress-wake.test.js-2026-07-20T01-32-08-008Z.json]
- **runtime-service-creating-owner-wake-progress-admission-main**: DT red-on-revert proven for test/control-plane/replica-dispatch-runtime-target-progress-wake.test.js [dt:solve/changes/dt-prove/replica-dispatch-runtime-target-progress-wake.test.js-2026-07-20T01-32-19-847Z.json]
- **runtime-service-creating-owner-wake-progress-admission-main**: Replacement-specific gates are green; the broad timeout, REPLACE, and unused-export failures reproduce identically on detached HEAD 0527723b and are excluded as unchanged branch-baseline debt. [file:solve/changes/runtime-service-creating-owner-wake-progress-admission/attempt-5-baseline-comparison.md]
- **runtime-service-creating-owner-wake-progress-admission-main**: Independent verification approved attempt 5 with no blockers: the byte-equal six-path artifact preserves target-progress context through same-owner coalescing, reaches durable source ACTIVE only from exact runtime target proof, retains non-runtime fallback, and passes focused/static contract gates. [subagent:verify_runtime_context_coalescing]
- **runtime-service-creating-owner-wake-progress-admission-main**: Ordered live gate passed five formation probes, schema admission, 100000-row load, five-node data spread, and 1682-row distributed SQL, then stopped before runtime deployment because recovered schema job d91532f0 falsely conflicted with its own deterministic movielens_top10 metadata: normalized_ddl recorded the SQL NOT NULL column as nullable=true while tables stored notNull=true. The repaired runtime target-wake seam was not reached and is neither refuted nor live-validated; no unchanged rerun was made. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-20T01-53-03-265Z.report.json]
- **runtime-service-creating-owner-wake-progress-admission-main**: The source-stable ordered live run reached distributed SQL but stopped before runtime deployment at a distinct schema child owner-lane collision; the runtime target-wake attempt remains deterministically approved but was not engaged and is neither refuted nor live-validated. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-20T03-16-02-506Z.report.json]
- **runtime-service-creating-owner-wake-progress-admission-main**: The sealed runtime CREATING-owner-wake symptom reproduces at checkpoint 97afef2e: target e467dd48 created svc-movielens-topn-r1 ACTIVE for operation ef2a3719, while all replica_operations projections retained status creating/workflow CREATING until the 600s demo timeout; target remote-handoff retry exhausted its operation budget. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-20T04-04-28-891Z.report.json]
- **runtime-service-creating-owner-wake-progress-admission-main**: DT red-on-revert proven for test/control-plane/replica-dispatch-runtime-target-progress-wake.test.js [dt:solve/changes/dt-prove/replica-dispatch-runtime-target-progress-wake.test.js-2026-07-20T04-11-11-665Z.json]
- **runtime-service-creating-owner-wake-progress-admission-main**: Live operation ef2a3719 exposed the same coalescing invariant already solved for schema children: a TARGET_EXECUTOR_OUTCOME wake delivered while the source operation owner lane is held inherits the holder promise and never runs its own ACTIVE reconciliation. The production-seam in-flight-holder test reproduces CREATING before the narrow retained-turn correction and reaches exact-target ACTIVE afterward; DT fix/revert/restore is 0/1/0. [solve/changes/dt-prove/replica-dispatch-runtime-target-progress-wake.test.js-2026-07-20T04-11-11-665Z.json]
- **runtime-service-creating-owner-wake-progress-admission-main**: Attempt 6 is rejected: RETAIN is selected from raw TARGET_EXECUTOR_OUTCOME inside a broader replay branch, so marked ACTIVE REPLACE and system-table CREATING replays also receive retained-turn semantics outside the sealed runtime ADD/REPLACE CREATING boundary. [subagent:verify_runtime_progress_retained_turn]
- **runtime-service-creating-owner-wake-progress-admission-main**: DT red-on-revert proven for test/control-plane/replica-dispatch-runtime-target-progress-wake.test.js [dt:solve/changes/dt-prove/replica-dispatch-runtime-target-progress-wake.test.js-2026-07-20T04-19-46-273Z.json]
- **runtime-service-creating-owner-wake-progress-admission-main**: Independent verification approved replacement attempt 7 and confirmed that retained owner turns are restricted to the canonical runtime target progress wake predicate while broader marked replay shapes retain ordinary owner-turn behavior. [subagent:verify_runtime_progress_attempt7]

## Theories
- **theory-20260720-ownerkeyreconcilequeue-context-is-last-writer-wins** [active] system, mechanism OwnerKeyReconcileQueue context is last-writer-wins. ReplicaDispatchService must merge target_executor_outcome as monotone stronger evidence before enqueue while refreshing the row authoritatively, and runtime completion must use only exact replica_id plus target_node_id observation., owner source replica-dispatch operation owner queue and operation-workflow exact-target observation lane, modelGate npm run model:contracts

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-19T19:49:55.334Z | runtime-service-creating-owner-wake-progress-admission-main | observe | 1 -> 1 | flat | no_evidence |  | diff:solve/changes/runtime-service-creating-owner-wake-progress-admission/attempt-1.diff |
| 2026-07-19T19:56:21.893Z | runtime-service-creating-owner-wake-progress-admission-main | observe | 1 -> 1 | flat | no_evidence |  | diff:solve/changes/runtime-service-creating-owner-wake-progress-admission/attempt-2.diff |
| 2026-07-20T01:13:36.811Z | runtime-service-creating-owner-wake-progress-admission-main | observe | 1 -> 1 | flat | same |  | diff:solve/changes/runtime-service-creating-owner-wake-progress-admission/attempt-3.diff |
| 2026-07-20T01:25:44.205Z | runtime-service-creating-owner-wake-progress-admission-main | observe | 1 -> 1 | flat | same |  | diff:solve/changes/runtime-service-creating-owner-wake-progress-admission/attempt-4.diff |
| 2026-07-20T01:35:49.878Z | runtime-service-creating-owner-wake-progress-admission-main | observe | 1 -> 1 | flat | same |  | diff:solve/changes/runtime-service-creating-owner-wake-progress-admission/attempt-5.diff |
| 2026-07-20T04:14:37.350Z | runtime-service-creating-owner-wake-progress-admission-main | observe | 1 -> 1 | flat | same |  | diff:solve/changes/runtime-service-creating-owner-wake-progress-admission/attempt-6.diff |
| 2026-07-20T04:20:37.000Z | runtime-service-creating-owner-wake-progress-admission-main | observe | 1 -> 1 | flat | same |  | diff:solve/changes/runtime-service-creating-owner-wake-progress-admission/attempt-7.diff |
