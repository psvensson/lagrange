# Solve report: solver-workflow-epic-routing-cutover

**Goal:** Epic planning is optional and mechanically projected: bounded work may link directly to its existing authority, epic progress is derived from explicit planning links and linked Quest terminal state while human decisions stay in the decision log, and direct work is promoted to a sealed Quest before a second evidence-bearing intervention.

**Class:** process · **Closure:** DECISION

**Outcome:** SOLVED (DECISION) — evidence: solve/oracle/solver-workflow-epic-routing-cutover.json

**Attempts:** 3

## Links
- plan: solve/epics/convergence-loop-and-workflow-overhead.md

## Scope Pressure
- Changed files: 27
- Change bytes: 398997
- Owner areas: .gitignore, AGENTS.md, docs, scripts/solve, solve, test/solve
- Categories: other, workflow
- Action: split by owner area before the next attempt (27 files)
- Action: land or separate 6 owner areas: .gitignore, AGENTS.md, docs, scripts/solve, solve, test/solve
- Split plan:
  - docs: 13 file(s)
  - scripts/solve: 4 file(s)
  - solve: 4 file(s)
  - test/solve: 4 file(s)
  - .gitignore: 1 file(s)
  - AGENTS.md: 1 file(s)
- Signal: broad-source-scope severity=medium
- Signal: large-diff-stack severity=medium

## Frontiers
- **solver-workflow-epic-routing-cutover-projection** [open] rung 0, attempts 0, metric ? -> 0
- **solver-workflow-epic-routing-cutover-policy** [solved] rung 0, attempts 3, metric 1 -> 0 — exact terminal source attempt was rejected

## Findings
- **solver-workflow-epic-routing-cutover-policy**: generated steering and overview projections are stale relative to the canonical routing contract [subagent:epic_routing_audit]
- **solver-workflow-epic-routing-cutover-policy**: tracked overview self-invalidates when the attempt that generated it changes Quest projection state [subagent:epic_routing_audit]
- **solver-workflow-epic-routing-cutover-policy**: independent verification passed: synchronized packed surfaces and ignored local overview remain exact [subagent:epic_routing_audit]
- **solver-workflow-epic-routing-cutover-policy**: independent aggregate composition verification passed [subagent:epic_routing_audit]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-22T12:13:13.543Z | solver-workflow-epic-routing-cutover-policy | observe | 1 -> 0 | progress | no_evidence |  | diff:solve/changes/solver-workflow-epic-routing-cutover/attempt-1.diff.json |
| 2026-07-22T12:20:30.255Z | solver-workflow-epic-routing-cutover-policy | observe | 0 -> 0 | flat | no_evidence |  | diff:solve/changes/solver-workflow-epic-routing-cutover/attempt-2.diff.json |
| 2026-07-22T12:25:10.379Z | solver-workflow-epic-routing-cutover-policy | observe | 0 -> 0 | flat | no_evidence |  | diff:solve/changes/solver-workflow-epic-routing-cutover/attempt-3.diff.json |
