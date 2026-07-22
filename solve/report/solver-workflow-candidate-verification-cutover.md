# Solve report: solver-workflow-candidate-verification-cutover

**Goal:** Source-changing exploratory attempts accumulate into one exact landing candidate; independent review is required once per explicit durability boundary, routine accepted attempts do not prescribe checkpoints, rejections remain fail-closed, legacy receipts remain valid, and terminal handoff still requires exact full-composition approval.

**Class:** process · **Closure:** DECISION

**Outcome:** SOLVED (DECISION) — evidence: solve/oracle/solver-workflow-candidate-verification-cutover.json

**Attempts:** 3

## Links
- parent quest: solver-workflow-epic-routing-cutover
- plan: solve/epics/convergence-loop-and-workflow-overhead.md

## Scope Pressure
- Changed files: 17
- Change bytes: 237010
- Owner areas: docs, scripts/solve, scripts/solve.js, test/solve
- Categories: workflow
- Action: split by owner area before the next attempt (17 files)
- Action: land or separate 4 owner areas: docs, scripts/solve, scripts/solve.js, test/solve
- Split plan:
  - docs: 9 file(s)
  - scripts/solve: 6 file(s)
  - scripts/solve.js: 1 file(s)
  - test/solve: 1 file(s)
- Signal: broad-source-scope severity=medium
- Signal: large-diff-stack severity=medium

## Frontiers
- **solver-workflow-candidate-verification-cutover-main** [solved] rung 0, attempts 3, metric 1 -> 0 — exact terminal source attempt was rejected

## Findings
- **solver-workflow-candidate-verification-cutover-main**: landing candidate omitted its new regression test because the untracked proof file was absent from the candidate path set [subagent:candidate_verification_audit]
- **solver-workflow-candidate-verification-cutover-main**: invalid mixed-base landing candidates could lose their fingerprint and bypass candidate, checkpoint, and terminal fail-closed validation [subagent:candidate_verification_audit]
- **solver-workflow-candidate-verification-cutover-main**: independent aggregate composition verification passed, including fail-closed mixed-base rejection replacement [subagent:candidate_verification_audit]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-22T12:42:09.527Z | solver-workflow-candidate-verification-cutover-main | observe | 1 -> 0 | progress | no_evidence |  | diff:solve/changes/solver-workflow-candidate-verification-cutover/attempt-1.diff.json |
| 2026-07-22T12:46:11.166Z | solver-workflow-candidate-verification-cutover-main | observe | 0 -> 0 | flat | no_evidence |  | diff:solve/changes/solver-workflow-candidate-verification-cutover/attempt-2.diff.json |
| 2026-07-22T12:50:33.701Z | solver-workflow-candidate-verification-cutover-main | observe | 0 -> 0 | flat | no_evidence |  | diff:solve/changes/solver-workflow-candidate-verification-cutover/attempt-3.diff.json |
