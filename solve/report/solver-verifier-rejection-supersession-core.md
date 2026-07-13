# Solve report: solver-verifier-rejection-supersession-core

**Goal:** Bounded successor for verifier-rejection supersession: an exact rejected source attempt cannot be approved or repeated-byte laundered; only a later contracted same-frontier, same-base, changed-fingerprint replacement covering the rejected source paths and receiving its own exact approval resolves it, while malformed, unbound, wrong-frontier, wrong-base, partial-path, or unapproved findings remain fail-closed and an exact terminal rejection reopens executable work.

**Class:** process · **Closure:** DECISION

**Outcome:** IN PROGRESS (no terminal recorded)

**Attempts:** 1

## Links
- spec: docs/steering/workflow-guidelines/solver-quests.md
- parent quest: solver-verifier-rejection-supersession

## Current Blocker
- Frontier: solver-verifier-rejection-supersession-core-main
- Owner: unknown
- Boundary: unknown
- Dominant reason: unknown
- Mechanism: unknown
- Movement: no evidence recorded
- Latest evidence: none
- Selected theory: none
- Next move: continue supervised step for solver-verifier-rejection-supersession-core-main

## Continuation
- Status: allowed
- Next action: continue supervised step for solver-verifier-rejection-supersession-core-main
- Blocker: none

## Scope Pressure
- Changed files: 7
- Change bytes: 31084
- Owner areas: scripts/solve, scripts/solve.js, solve, test/solve
- Categories: workflow
- Action: land or separate 4 owner areas: scripts/solve, scripts/solve.js, solve, test/solve
- Split plan:
  - scripts/solve: 3 file(s)
  - test/solve: 2 file(s)
  - scripts/solve.js: 1 file(s)
  - solve: 1 file(s)
- Signal: broad-source-scope severity=medium

## Frontiers
- **solver-verifier-rejection-supersession-core-main** [open] rung 1, attempts 1, metric 2 -> 2

## Findings
_(none recorded)_

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-13T16:37:12.248Z | solver-verifier-rejection-supersession-core-main | observe | 2 -> 2 | flat | no_evidence |  | diff:solve/changes/solver-verifier-rejection-supersession-core/attempt-1.diff |
