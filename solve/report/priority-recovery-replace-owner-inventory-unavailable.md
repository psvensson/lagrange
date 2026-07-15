# Solve report: priority-recovery-replace-owner-inventory-unavailable

**Goal:** A priority-recovery follow-up count-neutral REPLACE reaches operation creation when the authoritative SERVICES owner is transiently unavailable only under a typed recovery-cure contract: the priority-recovery owner declares the relocation cure, the actual cache contains the named live voter source, authoritative operation visibility is usable with no conflicting in-flight operation, the target node is vacant, and replica inventory has no anomaly. Generic ADDs, ordinary REPLACEs, unavailable operation visibility, missing or non-live sources, occupied targets, and anomalous inventories remain fail-closed. This closes the fresh managed-merge live first invariant where the owner reported needs_operation/create_recovery_operation but priority control-plane REPLACEs were repeatedly rejected as replica_inventory_unusable. Prove the real planner-to-coordinator seam red on current head and green on the fix for three consecutive deterministic runs, without timeout increases, ledger-interlock weakening, managed-merge changes, or cache-as-authority fallback.

**Class:** product · **Closure:** MEASURED

**Outcome:** SOLVED (MEASURED) — evidence: test-output/reports/priority-recovery-replace-owner-inventory-unavailable-2026-07-15T11-56-10-714Z.report.json

**Attempts:** 5

## Links
- spec: solve/quests/managed-partition-merge-live-validation.json
- parent quest: managed-partition-merge-live-validation

## Current Blocker
- Frontier: priority-recovery-replace-owner-inventory-unavailable-main
- Owner: unknown
- Boundary: unknown
- Dominant reason: unknown
- Mechanism: transition_gap
- Movement: solved: PASS -> PASS
- Latest evidence: test-output/reports/priority-recovery-replace-owner-inventory-unavailable-2026-07-15T11-55-40-703Z.report.json
- Selected theory: theory-20260715-validation-generated-one-unrelated-timestamp-only (stale: selected theory status is falsified)
- Next move: record or select a fresh frontier theory for priority-recovery-replace-owner-inventory-unavailable-main
- No longer current: PASS; Do not ship or re-derive the owner-inventory-unavailable exception from the deterministic predicate alone; require a fresh live blocker that remains at this exact owner/boundary under unchanged source before revisiting it.

## Continuation
- Status: blocked-theory
- Next action: record and select frontier theory for priority-recovery-replace-owner-inventory-unavailable-main with npm run model:contracts as discriminator
- Blocker: frontier theory required for priority-recovery-replace-owner-inventory-unavailable-main
- Blocker: selected theory stale: selected theory status is falsified

## Scope Pressure
- Changed files: 11
- Change bytes: 71487
- Owner areas: architecture, scripts/run-priority-recovery-replace-owner-inventory-unavailable-scenarios.js, src/rebalancer, test/rebalancer
- Categories: docs, other, runtime
- Action: split by owner area before the next attempt (11 files)
- Action: land or separate 4 owner areas: architecture, scripts/run-priority-recovery-replace-owner-inventory-unavailable-scenarios.js, src/rebalancer, test/rebalancer
- Split plan:
  - src/rebalancer: 6 file(s)
  - test/rebalancer: 3 file(s)
  - architecture: 1 file(s)
  - scripts/run-priority-recovery-replace-owner-inventory-unavailable-scenarios.js: 1 file(s)
- Signal: broad-source-scope severity=medium
- Signal: large-diff-stack severity=medium

## Frontiers
- **priority-recovery-replace-owner-inventory-unavailable-main** [open] rung 5, attempts 5, metric 0 -> 0 — exact terminal source attempt was rejected

## Findings
- **priority-recovery-replace-owner-inventory-unavailable-main**: DT red-on-revert proven for test/rebalancer/unified-rebalancer.test.js [dt:solve/changes/dt-prove/unified-rebalancer.test.js-2026-07-15T11-41-26-557Z.json]
- **priority-recovery-replace-owner-inventory-unavailable-main**: DT red-on-revert proven for test/rebalancer/rebalance-coordinator-topology-guard.test.js [dt:solve/changes/dt-prove/rebalance-coordinator-topology-guard.test.js-2026-07-15T11-41-37-094Z.json]
- **priority-recovery-replace-owner-inventory-unavailable-main**: Ingested evidence from priority-recovery-replace-owner-inventory-unavailable-2026-07-15T11-43-32-266Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/priority-recovery-replace-owner-inventory-unavailable-2026-07-15T11-43-32-266Z.report.json]
- **priority-recovery-replace-owner-inventory-unavailable-main**: Ingested evidence from priority-recovery-replace-owner-inventory-unavailable-2026-07-15T11-43-32-266Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/priority-recovery-replace-owner-inventory-unavailable-2026-07-15T11-43-32-266Z.report.json]
- **priority-recovery-replace-owner-inventory-unavailable-main**: Independent exact verification rejected attempt 2: the touched topology-guard owner exceeded the 800-line cap and the sealed negative matrix lacked non-priority, non-voter, deferred-visibility, and operation-conflict assertions. [subagent:priority-inventory-verifier]
- **priority-recovery-replace-owner-inventory-unavailable-main**: Fresh five-node managed-merge live attribution retained immutably: analyzer first edge rebalancer_leader/operation_scheduling/needs_operation/create_recovery_operation; full logs show priority control-plane REPLACEs rejected as replica_inventory_unusable while SERVICES authority is unavailable. [artifact:/media/peter/4509da27-4751-4dee-b366-f3983d077725/peter/projects/something/.claude/worktrees/codex-wave0-managed-merge-live/solve/changes/managed-partition-merge-live-validation/run7-2026-07-15T10-24-head-0da03c6d/repro-summary.json]
- **priority-recovery-replace-owner-inventory-unavailable-main**: Independent replacement verification rejected attempt 3 because its auto-diff omitted the three untracked source/test modules that the tracked patch imports, so the exact artifact was not standalone or appliable. [subagent:priority-inventory-verifier]
- **priority-recovery-replace-owner-inventory-unavailable-main**: Ingested evidence from priority-recovery-replace-owner-inventory-unavailable-2026-07-15T11-55-40-703Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/priority-recovery-replace-owner-inventory-unavailable-2026-07-15T11-55-40-703Z.report.json]
- **priority-recovery-replace-owner-inventory-unavailable-main**: Ingested evidence from priority-recovery-replace-owner-inventory-unavailable-2026-07-15T11-55-40-703Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/priority-recovery-replace-owner-inventory-unavailable-2026-07-15T11-55-40-703Z.report.json]
- **priority-recovery-replace-owner-inventory-unavailable-main**: Independent exact verification rejected attempt 4 because the new replica-id allocation owner introduced retired LOCAL_STR_STRING aliases forbidden by STYLE-0011; inline the JavaScript typeof primitive in all four sites. [subagent:priority-inventory-verifier]
- **priority-recovery-replace-owner-inventory-unavailable-main**: Independent exact verification rejected attempt 5 because npm run model:contracts added an unrelated timestamp-only active-gate TLC report path to the standalone payload; remove that generated validation delta and snapshot only the same-base runner, source, and test replacement. [subagent:priority-inventory-verifier]
- **priority-recovery-replace-owner-inventory-unavailable-main**: DT red-on-revert proven for test/rebalancer/unified-rebalancer.test.js [dt:solve/changes/dt-prove/unified-rebalancer.test.js-2026-07-15T12-07-21-233Z.json]
- **priority-recovery-replace-owner-inventory-unavailable-main**: DT red-on-revert proven for test/rebalancer/rebalance-coordinator-topology-guard.test.js [dt:solve/changes/dt-prove/rebalance-coordinator-topology-guard.test.js-2026-07-15T12-07-33-269Z.json]
- **priority-recovery-replace-owner-inventory-unavailable-main**: Independent exact verification passed: standalone ten-path payload is clean, STYLE-0011-correct, deterministic safety matrix and allocator adjacency pass, fresh directed tests are red on exact source reversion, and ledger/timeouts/managed merge remain untouched. [subagent:priority-inventory-verifier]
- **priority-recovery-replace-owner-inventory-unavailable-main**: Controlled source-fingerprinted live A/B falsified attempt 6 as the operative seam: fixed-1 moved to workflow progress, but reverted-1 also moved to workflow progress and valid reverted-2-retry-1 had priority recovery satisfied with zero residual witnesses; therefore the required 2/2 reverted retention of the old rebalancer scheduling blocker is impossible. [test-output/reports/priority-recovery-live-ab/reverted-2-retry-1.report.json]
- **priority-recovery-replace-owner-inventory-unavailable-main**: Dead-lever record from the controlled live A/B: unchanged source produced workflow-progress or fully satisfied priority-recovery outcomes in both valid controls, so attempt 6 did not uniquely cause departure from the historical inventory-unusable scheduling residual. (rules out: Do not ship or re-derive the owner-inventory-unavailable exception from the deterministic predicate alone; require a fresh live blocker that remains at this exact owner/boundary under unchanged source before revisiting it.) [test-output/reports/priority-recovery-live-ab/reverted-1.report.json;test-output/reports/priority-recovery-live-ab/reverted-2-retry-1.report.json]
- **priority-recovery-replace-owner-inventory-unavailable-main**: Independent live-gate verification rejected exact attempt 6: 0/2 valid reverted controls retained the required old first scheduling blocker, so the fixed movement is non-discriminating and fixed-2 cannot satisfy the pre-sealed criterion. [subagent:priority_live_rejection_verifier]

## Theories
- **theory-20260715-the-extraction-preserved-behavior-but-introduced** [active] system, mechanism The extraction preserved behavior but introduced a retired LOCAL_STR_STRING alias; replacing only that alias with direct typeof primitive literals changes the exact fingerprint without changing topology admission semantics., owner src/rebalancer/rebalance-coordinator-replica-id-allocation.js, modelGate npm run model:contracts
- **theory-20260715-priority-recovery-follow-up-classifies-a** [falsified] frontier, frontier priority-recovery-replace-owner-inventory-unavailable-main, layer ownership, mechanism Priority-recovery follow-up classifies a count-neutral relocation, but move execution drops that cure identity and the coordinator therefore treats transient SERVICES-owner unavailability as generic unusable inventory even when cache source actuals and operation visibility are safe., modelGate npm run model:contracts
- **theory-20260715-the-typed-priority-recovery-replace-admission** [falsified] frontier, frontier priority-recovery-replace-owner-inventory-unavailable-main, layer ownership, mechanism The typed priority-recovery REPLACE admission is the operative managed-merge seam; attempt 4's rejection is isolated to a retired primitive alias in the extracted allocation owner, not to the cure propagation or safety predicate., modelGate npm run model:contracts
- **theory-20260715-validation-generated-one-unrelated-timestamp-only** [falsified] frontier, frontier priority-recovery-replace-owner-inventory-unavailable-main, layer ownership, mechanism Validation generated one unrelated timestamp-only model report after source/model proof; a clean same-base exact replacement can exclude that report while leaving the validated priority-recovery admission and STYLE-0011-correct runner/source/test bytes unchanged., modelGate npm run model:contracts

## Selected Theories
- **priority-recovery-replace-owner-inventory-unavailable-main**: theory-20260715-validation-generated-one-unrelated-timestamp-only

## Theory Results
- **theory-20260715-priority-recovery-follow-up-classifies-a**: supported (scenario=done, theory=supported, movement=solved) [test-output/reports/priority-recovery-replace-owner-inventory-unavailable-2026-07-15T11-55-40-703Z.report.json]
- **theory-20260715-priority-recovery-follow-up-classifies-a**: falsified (scenario=done, theory=falsified, movement=solved) [test-output/reports/priority-recovery-replace-owner-inventory-unavailable-2026-07-15T11-56-10-714Z.report.json]
- **theory-20260715-the-typed-priority-recovery-replace-admission**: falsified (scenario=done, theory=falsified, movement=solved) [test-output/reports/priority-recovery-replace-owner-inventory-unavailable-2026-07-15T11-56-10-714Z.report.json]
- **theory-20260715-validation-generated-one-unrelated-timestamp-only**: falsified (scenario=done, theory=falsified, movement=solved) [test-output/reports/priority-recovery-replace-owner-inventory-unavailable-2026-07-15T11-56-10-714Z.report.json]

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-15T11:39:13.206Z | priority-recovery-replace-owner-inventory-unavailable-main | observe | 0 -> 0 | flat | no_evidence |  | diff:solve/changes/priority-recovery-replace-owner-inventory-unavailable/attempt-2.diff |
| 2026-07-15T11:53:15.641Z | priority-recovery-replace-owner-inventory-unavailable-main | local-fix | 0 -> 0 | flat | solved |  | diff:solve/changes/priority-recovery-replace-owner-inventory-unavailable/attempt-3.diff |
| 2026-07-15T11:56:10.782Z | priority-recovery-replace-owner-inventory-unavailable-main | widen-scope | 0 -> 0 | flat | solved | theory-20260715-priority-recovery-follow-up-classifies-a | diff:solve/changes/priority-recovery-replace-owner-inventory-unavailable/attempt-4.diff.json |
| 2026-07-15T12:01:47.824Z | priority-recovery-replace-owner-inventory-unavailable-main | model | 0 -> 0 | flat | solved | theory-20260715-the-typed-priority-recovery-replace-admission | diff:solve/changes/priority-recovery-replace-owner-inventory-unavailable/attempt-5.diff.json |
| 2026-07-15T12:06:37.338Z | priority-recovery-replace-owner-inventory-unavailable-main | change-approach | 0 -> 0 | flat | solved | theory-20260715-validation-generated-one-unrelated-timestamp-only | diff:solve/changes/priority-recovery-replace-owner-inventory-unavailable/attempt-6.diff.json |
