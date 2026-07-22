# Solve report: operation-dispatch-completion-owner-cutover

**Goal:** Every successful create-phase replica dispatch, whether initiated by ReplicaDispatchService or directly by the operation workflow coordinator, submits one classified delivered outcome to operation_workflow_owner and creates the same bounded retained target-progress obligation before caller completion; in the exact 2026-07-21T17:59:22 coordinator-first ordering (dispatch-service visibility defer, coordinator CREATE_REPLICA delivery before the deferred retry, target completion, duplicate deferred delivery, missing local operation-row visibility, and lost executor-outcome handoff), the canonical source owner applies exact-target ACTIVE evidence to the durable CREATING runtime-service ADD, reaches durable ACTIVE, and releases the operation-budget slot, while duplicate delivery is idempotent, terminal and shutdown cleanup leave no retained work, system-operation behavior is unchanged, every in-scope delivered-success exit is covered by a structural census, no timeout or budget is widened, and no new timer family, retry registry, cache, queue, workflow engine, or transport bypass is introduced.

**Class:** product · **Closure:** MEASURED

**Outcome:** SOLVED (MEASURED) — evidence: test-output/reports/operation-dispatch-completion-owner-cutover-2026-07-22T01-55-03-335Z.report.json

**Attempts:** 2

## Links
- spec: solve/epics/service-data-affinity-placement.md
- parent quest: runtime-service-add-creating-owner-rearm
- plan: solve/epics/operation-dispatch-completion-continuity.md

## Scope Pressure
- Changed files: 18
- Change bytes: 79540
- Owner areas: src/control-plane, src/rebalancer, test/control-plane, test/rebalancer, test/scripts
- Categories: runtime, test
- Action: split by owner area before the next attempt (18 files)
- Action: land or separate 5 owner areas: src/control-plane, src/rebalancer, test/control-plane, test/rebalancer, test/scripts
- Split plan:
  - src/control-plane: 7 file(s)
  - src/rebalancer: 7 file(s)
  - test/control-plane: 2 file(s)
  - test/rebalancer: 1 file(s)
  - test/scripts: 1 file(s)
- Signal: broad-source-scope severity=medium
- Signal: large-diff-stack severity=medium

## Frontiers
- **operation-dispatch-completion-owner-cutover-main** [solved] rung 1, attempts 2, metric 0 -> 0

## Findings
- **operation-dispatch-completion-owner-cutover-main**: Deterministic coordinator-first production seam reproduces on HEAD: direct workflow-owner CREATE delivery advances the durable runtime-service ADD to CREATING but leaves observedProgressRetryTimerByOperationId empty, so the lost target-outcome ordering has no owner-retained progress turn and remains CREATING. [test/control-plane/replica-dispatch-add-creating-owner-rearm.test.js]
- **operation-dispatch-completion-owner-cutover-main**: DT red-on-revert proven for test/control-plane/replica-dispatch-add-creating-owner-rearm.test.js [dt:solve/changes/dt-prove/replica-dispatch-add-creating-owner-rearm.test.js-2026-07-21T22-09-27-493Z.json]
- **operation-dispatch-completion-owner-cutover-main**: DT red-on-revert proven for test/control-plane/replica-dispatch-add-creating-owner-rearm.test.js [dt:solve/changes/dt-prove/replica-dispatch-add-creating-owner-rearm.test.js-2026-07-22T01-38-42-139Z.json]
- **operation-dispatch-completion-owner-cutover-main**: independent verification passed for the frozen production and test cutover diff [subagent:owner_cutover_verifier]
- **operation-dispatch-completion-owner-cutover-main**: independent verification passed for the unchanged frozen production and test cutover diff [subagent:owner_cutover_verifier]
- **operation-dispatch-completion-owner-cutover-main**: independent aggregate verification passed for the frozen production and test cutover diff [subagent:owner_cutover_verifier]
- **operation-dispatch-completion-owner-cutover-main**: Controlled live A/B bound two fixed and two exact-revert runs to boot, source, archive, and report fingerprints: all four reached terminal durable rows with released reservations and zero lifecycle residue; the fixed owner-retention path engaged in both fixed runs, with one full affinity pass and one downstream learned-affinity stall. [solve/changes/operation-dispatch-completion-owner-cutover/live/lifecycle-evidence.json]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-22T01:53:43.067Z | operation-dispatch-completion-owner-cutover-main | observe | 0 -> 0 | flat | no_evidence |  | diff:solve/changes/operation-dispatch-completion-owner-cutover/attempt-1.diff |
| 2026-07-22T01:55:08.249Z | operation-dispatch-completion-owner-cutover-main | observe | 0 -> 0 | flat | solved |  | diff:solve/changes/operation-dispatch-completion-owner-cutover/attempt-1.diff |
