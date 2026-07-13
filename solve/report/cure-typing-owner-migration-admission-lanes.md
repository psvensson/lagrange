# Solve report: cure-typing-owner-migration-admission-lanes

**Goal:** Bounded migration slice of parent cure-typing-single-owner-table (epic self-hosting-circularity-generic-treatment Option 5, rung 4): the eight admission-lane conjunct sites consume the declared cure-by-partition-class lane rows instead of hand-rolling the emergency-partition classifier conjunct. Sites: resolveConcurrentCreateBudgetScope and getPriorityRecoveryAdmissionPlan (src/rebalancer/rebalance-coordinator-concurrent-add-budget.js), buildPriorityDeferredObservationPressureEvidence and buildPriorityAddAdmissionPressureEvidence (src/rebalancer/rebalance-coordinator-pressure-helper.js), buildConcurrentAddCountByPriorityClass (src/rebalancer/rebalance-coordinator-priority-budget-helper.js), getOrdinaryPriorityRecoverySerialGateSnapshot (src/rebalancer/unified-rebalancer-budget-planning.js), getPriorityRecoveryAdmissionPlan plan wiring (src/rebalancer/unified-rebalancer-priority-recovery-coordination.js), and isPriorityRecoveryOrdinarySerialLanePartitionId (src/control-plane/priority-recovery-serial-wait-operation-contexts.js). SEALED RESULT: every site resolves its lane through owner rows/predicates from src/rebalancer/replica-placement-cure-policy.js and the admission-plan owner in src/control-plane (mechanism stays at the sites: numeric budget counting, evidence assembly, snapshot construction). Behavior preserved exactly — each rewritten decision is truth-table identical on its move-type and partition-class domain; any lane GAP is recorded as a finding and fixed only in its own pinned follow-up. doneWhen: the committed census scripts/check-cure-typing-owner.js --oracle --oracle-file solve/oracle/cure-typing-owner-migration-admission-lanes.json --done-at 7 --with-gates reports metric at most 7 (every admission_lane_conjunct site migrated; the 7 cure_move_type_mint sites belong to the sibling slice) with lint + targeted suites green. Checkpoint commit after every attempt.

**Class:** process · **Closure:** DECISION

**Outcome:** SOLVED (DECISION) — evidence: solve/oracle/cure-typing-owner-migration-admission-lanes.json

**Attempts:** 1

## Links
- parent quest: cure-typing-single-owner-table
- plan: solve/epics/self-hosting-circularity-generic-treatment.md

## Scope Pressure
- Changed files: 12
- Change bytes: 32985
- Owner areas: src/control-plane, src/rebalancer, test/rebalancer
- Categories: runtime
- Action: split by owner area before the next attempt (12 files)
- Action: land or separate 3 owner areas: src/control-plane, src/rebalancer, test/rebalancer
- Split plan:
  - src/rebalancer: 8 file(s)
  - src/control-plane: 3 file(s)
  - test/rebalancer: 1 file(s)
- Signal: broad-source-scope severity=medium
- Signal: large-diff-stack severity=medium

## Frontiers
- **cure-typing-owner-migration-admission-lanes-main** [solved] rung 0, attempts 1, metric 8 -> 0

## Findings
- **cure-typing-owner-migration-admission-lanes-main**: sealed symptom reproduces on HEAD: census metric 8 with all 8 admission_lane_conjunct sites intact across 6 files (src changes since draft are the owner module and the sibling minter migration) [solve/oracle/cure-typing-owner-migration-admission-lanes.json]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-13T14:17:22.856Z | cure-typing-owner-migration-admission-lanes-main | observe | 8 -> 0 | progress | no_evidence |  | diff:solve/changes/cure-typing-owner-migration-admission-lanes/attempt-1.diff.json |
