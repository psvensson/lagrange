# Solve report: solver-workflow-draft-receipt-signal-quality

**Goal:** The Solver distinguishes undeclared Quest drafts from active open work in portfolio projections; a flat attempt that reuses the exact same non-empty evidence fingerprint is recorded as a receipt-only source revision that holds its rung and does not advance supervisor durable progress, while fresh flat evidence still climbs; and evidence ingestion records one structured evidence event without a mirrored synthetic finding, preserving terminal projection, blocker movement, and explicit findings.

**Class:** process · **Closure:** DECISION

**Outcome:** SOLVED (DECISION) — evidence: solve/oracle/solver-workflow-draft-receipt-signal-quality.json

**Attempts:** 1

## Links
- spec: docs/steering/workflow-guidelines/solver-quests.md

## Scope Pressure
- Changed files: 19
- Change bytes: 201267
- Owner areas: docs, scripts/solve, solve, test/solve
- Categories: workflow
- Action: split by owner area before the next attempt (19 files)
- Action: land or separate 4 owner areas: docs, scripts/solve, solve, test/solve
- Split plan:
  - test/solve: 7 file(s)
  - docs: 5 file(s)
  - scripts/solve: 5 file(s)
  - solve: 2 file(s)
- Signal: broad-source-scope severity=medium
- Signal: large-diff-stack severity=medium

## Frontiers
- **solver-workflow-draft-receipt-signal-quality-main** [solved] rung 0, attempts 1, metric 1 -> 0

## Findings
- **solver-workflow-draft-receipt-signal-quality-main**: Independent implementation verification passed with no blocking findings [subagent:verify_workflow_implementation]
- **solver-workflow-draft-receipt-signal-quality-main**: The sealed workflow signal-quality behaviors reproduce on current HEAD: focused lifecycle, receipt-only, and evidence-ingestion tests pass after the intervening unrelated source commit [tests:workflow-focused-7-files-327-assertions]
- **solver-workflow-draft-receipt-signal-quality-main**: Independent aggregate verification passed with no blocking findings [subagent:verify_workflow_implementation]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-19T10:24:05.930Z | solver-workflow-draft-receipt-signal-quality-main | observe | 1 -> 0 | progress | no_evidence |  | diff:solve/changes/solver-workflow-draft-receipt-signal-quality/attempt-1.diff |
