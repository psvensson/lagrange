# Solve report: solver-verifier-rejection-supersession-core

**Goal:** Bounded successor for verifier-rejection supersession: an exact rejected source attempt cannot be approved or repeated-byte laundered; only a later contracted same-frontier, same-base, changed-fingerprint replacement covering the rejected source paths and receiving its own exact approval resolves it, while malformed, unbound, wrong-frontier, wrong-base, partial-path, or unapproved findings remain fail-closed and an exact terminal rejection reopens executable work.

**Class:** process · **Closure:** DECISION

**Outcome:** SOLVED (DECISION) — evidence: solve/oracle/solver-verifier-rejection-supersession.json

**Attempts:** 2

## Links
- spec: docs/steering/workflow-guidelines/solver-quests.md
- parent quest: solver-verifier-rejection-supersession

## Scope Pressure
- Changed files: 7
- Change bytes: 33744
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
- **solver-verifier-rejection-supersession-core-main** [solved] rung 1, attempts 2, metric 2 -> 0

## Findings
- **solver-verifier-rejection-supersession-core-main**: Independent verification passed: successor payload is byte-identical to the reviewed seven-path fix; 213 focused assertions and ESLint are green. [subagent:verify_rejection_supersession]
- **solver-verifier-rejection-supersession-core-main**: The sealed symptom does not reproduce on HEAD 883eef72: rejected source attempts remain fail-closed (movielens-three-way-affinity-demo audit still refuses attempts 5-7 pending a contracted replacement) and the seven-path supersession fix from checkpoint b559dfdb is present; focused solver verification-handoff and cli suites pass 123/123 tests, lint:scripts and steering:check pass, and the previously red unused-export (1628/1628) and duplication (65/73 groups, 2070/2239 lines) ratchets are green on HEAD [solve/oracle/solver-verifier-rejection-supersession.json]
- **solver-verifier-rejection-supersession-core-main**: independent verification passed [subagent:acbd6e528cd3afe26]

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
| 2026-07-21T06:25:36.100Z | solver-verifier-rejection-supersession-core-main | local-fix | 0 -> 0 | flat | solved |  | diff:solve/changes/solver-verifier-rejection-supersession-core/attempt-2.diff |
