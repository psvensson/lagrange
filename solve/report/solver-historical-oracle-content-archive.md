# Solve report: solver-historical-oracle-content-archive

**Goal:** Two solved historical Quests whose sealed oracle targets live under ignored test-output retain their exact original evidence bytes in a versioned content-addressed archive. Ledger Q1 accepts a missing live target only when a canonical manifest entry binds the exact Quest id, sealed path, terminal evidence SHA-256, payload byte count, and verified archive object bytes; a missing, mismatched, or tampered archive remains an error. doneWhen: solve/oracle/solver-historical-oracle-content-archive.json reports done only after deterministic clean-clone and fault regressions, focused tests/static checks, and independent verification are green.

**Class:** process · **Closure:** DECISION

**Outcome:** SOLVED (DECISION) — evidence: solve/oracle/solver-historical-oracle-content-archive.json

**Attempts:** 3

## Links
- plan: solve/epics/roadmap-integrity-wave-0.md

## Scope Pressure
- Changed files: 7
- Change bytes: 117998
- Owner areas: scripts/solve, solve, test/solve
- Categories: workflow
- Action: land or separate 3 owner areas: scripts/solve, solve, test/solve
- Split plan:
  - solve: 4 file(s)
  - scripts/solve: 2 file(s)
  - test/solve: 1 file(s)
- Signal: broad-source-scope severity=medium

## Frontiers
- **solver-historical-oracle-content-archive-main** [solved] rung 1, attempts 3, metric 2 -> 0

## Findings
- **solver-historical-oracle-content-archive-main**: Attempt 1 is mis-scoped: its declaration-base diff absorbs the prerequisite scope-oracle commit and omits the new untracked archive module and retained objects, so it cannot prove this Quest. [subagent:ledger_consistency_fix-scope-audit]
- **solver-historical-oracle-content-archive-main**: Independent attack verification passed: exact six-path scope, exact retained bytes, strict archive binding, and fail-closed clean-clone/fault behavior were confirmed. [subagent:portfolio_projection_fix-archive-review]
- **solver-historical-oracle-content-archive-main**: Ingested evidence from solver-historical-oracle-content-archive.json. Metric: 1 -> 1. Verdict: unknown. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [solve/oracle/solver-historical-oracle-content-archive.json]
- **solver-historical-oracle-content-archive-main**: Independent attack verification passed for these exact six-path bytes: archive identities, strict admission, clean-clone, and tamper behavior are correct. [subagent:portfolio_projection_fix-archive-review]
- **solver-historical-oracle-content-archive-main**: Independent aggregate verification confirmed the unchanged final three-path source/test delta from sealed base. [subagent:portfolio_projection_fix-archive-review]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-15T06:49:01.278Z | solver-historical-oracle-content-archive-main | observe | 2 -> 1 | progress | no_evidence |  | diff:solve/changes/solver-historical-oracle-content-archive/attempt-1.diff |
| 2026-07-15T06:50:58.167Z | solver-historical-oracle-content-archive-main | observe | 1 -> 1 | flat | no_evidence |  | diff:solve/changes/solver-historical-oracle-content-archive/attempt-2.diff.json |
| 2026-07-15T07:01:50.599Z | solver-historical-oracle-content-archive-main | local-fix | 1 -> 0 | progress | no_previous |  | diff:solve/changes/solver-historical-oracle-content-archive/attempt-2.diff.json |
