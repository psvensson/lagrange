# Solve report: step-coverage-owner-migration-recovery-lanes

**Goal:** Bounded child of step-coverage-single-owner-table (scope-pressure split; parent keeps the census oracle at 0-with-gates). SEALED RESULT: the batch's censused step-coverage re-derivations consume named rows of src/rebalancer/replica-operation-step-policy.js with byte-identical membership (moved Set/array declarations) or truth-table-identical predicates (rewritten branch piles); the policy module carries a red-on-revert guard test pinning every row's exact membership (test/rebalancer/replica-operation-step-policy.test.js, dt:prove PROVEN). Batch step-coverage-owner-migration-recovery-lanes per the parent's site census; behavior preserved exactly; the census reports 0 counted sites in the batch's files under the committed detector. doneWhen: scripts/check-step-coverage-owner.js --oracle --oracle-file solve/oracle/step-coverage-owner-migration-recovery-lanes.json --done-at 0 --with-gates reports census metric 0 with lint + targeted suites green.

**Class:** process · **Closure:** DECISION

**Outcome:** SOLVED (DECISION) — evidence: solve/oracle/step-coverage-owner-migration-recovery-lanes.json

**Attempts:** 1

## Links
- parent quest: step-coverage-single-owner-table
- plan: solve/epics/self-hosting-circularity-generic-treatment.md

## Scope Pressure
- Changed files: 17
- Change bytes: 23986
- Owner areas: src/control-plane, src/node, src/rebalancer
- Categories: runtime
- Action: split by owner area before the next attempt (17 files)
- Action: land or separate 3 owner areas: src/control-plane, src/node, src/rebalancer
- Split plan:
  - src/control-plane: 8 file(s)
  - src/rebalancer: 5 file(s)
  - src/node: 4 file(s)
- Signal: broad-source-scope severity=medium
- Signal: large-diff-stack severity=medium

## Frontiers
- **step-coverage-owner-migration-recovery-lanes-main** [solved] rung 1, attempts 1, metric 0 -> 0

## Findings
- **step-coverage-owner-migration-recovery-lanes-main**: Independent adversarial verification passed: TRUSTED-WITH-NOTES (subagent a198f544). All 22 set moves membership- and order-identical (incl. the load-bearing SQL bind order: ACTIVE last lands in the type-restricted slot); all 17 pile rewrites truth-table identical (resolveOperationTransitionReason all 8 branches, usesOperationBudget CREATING equivalence, mark-failed = pre-sync union STOPPING exact, ADD-at-ACTIVE exclusion preserved, De Morgan + optional-chaining pass-throughs safe); 7 analyzer exclusions judged legitimate; zero leftover bindings; 33 modules smoke-import clean; diff artifacts byte-match. Notes acted on: transition-orchestration double-import fixed. Recorded residual: COMPLETION_STEPS wrapper objects are pre-existing dead exports (cleanup candidate). [subagent:a198f544b42664307]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-13T11:58:50.142Z | step-coverage-owner-migration-recovery-lanes-main | observe | 0 -> 0 | flat | no_evidence |  | diff:solve/changes/step-coverage-owner-migration-recovery-lanes/attempt-1-recovery-lanes.diff |
