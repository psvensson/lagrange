# Solve report: solver-verifier-rejection-supersession

**Goal:** A rejected exact source-attempt fingerprint must not require dishonest approval or permanently poison a Quest. SEALED RESULT: the Solver accepts a structured verifier-rejection finding bound to the exact attempt fingerprint and subagent evidence; that rejection keeps checkpoint and terminal handoff blocked until a later contracted source attempt from the same Git base covers every rejected source path and receives its own later exact approval, after which next, checkpoint verification, and audit advance past the rejected attempt without treating it as approved. Unresolved, malformed, cross-frontier, wrong-base, partial-path, unapproved-replacement, and aggregate cases fail closed. doneWhen: solve/oracle/solver-verifier-rejection-supersession.json is done only when focused verification/handoff, next-projection, audit, lint, and static tests are green.

**Class:** process · **Closure:** DECISION

**Outcome:** SOLVED (DECISION) — evidence: solve/oracle/solver-verifier-rejection-supersession.json

**Attempts:** 3

## Links
- plan: docs/steering/workflow-guidelines/solver-quests.md

## Current Blocker
- Frontier: solver-verifier-rejection-supersession-main
- Owner: unknown
- Boundary: unknown
- Dominant reason: unknown
- Mechanism: transition_gap
- Movement: first blocker observed: unknown
- Latest evidence: solve/oracle/solver-verifier-rejection-supersession.json
- Selected theory: none
- Next move: continue supervised step for solver-verifier-rejection-supersession-main

## Continuation
- Status: allowed
- Next action: continue supervised step for solver-verifier-rejection-supersession-main
- Blocker: none

## Scope Pressure
- Changed files: 16
- Change bytes: 217768
- Owner areas: docs, scripts/solve, scripts/solve.js, solve, test/solve
- Categories: workflow
- Action: split by owner area before the next attempt (16 files)
- Action: land or separate 5 owner areas: docs, scripts/solve, scripts/solve.js, solve, test/solve
- Split plan:
  - docs: 8 file(s)
  - scripts/solve: 3 file(s)
  - solve: 2 file(s)
  - test/solve: 2 file(s)
  - scripts/solve.js: 1 file(s)
- Signal: broad-source-scope severity=medium
- Signal: large-diff-stack severity=medium

## Frontiers
- **solver-verifier-rejection-supersession-main** [open] rung 1, attempts 3, metric 1 -> 2 — exact terminal source attempt was rejected

## Findings
- **solver-verifier-rejection-supersession-main**: Repository-wide unused-export ratchet fails unchanged at the pinned base with 1632 exports against baseline 1628; the rejection-supersession change does not introduce the four inherited exports. (rules out: static-gate-regression-caused-by-rejection-supersession) [command:git-worktree-HEAD+npx-knip--include-exports]
- **solver-verifier-rejection-supersession-main**: Independent verification rejected the exact attempt: terminal next requested aggregate approval before replacement; identical rejected bytes could be laundered through a duplicate attempt; and the Oracle target solved despite its red static gate. [subagent:verify_rejection_supersession]
- **solver-verifier-rejection-supersession-main**: Ingested evidence from solver-verifier-rejection-supersession.json. Metric: 0 -> 3. Verdict: unknown. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [solve/oracle/solver-verifier-rejection-supersession.json]
- **solver-verifier-rejection-supersession-main**: Ingested evidence from solver-verifier-rejection-supersession.json. Metric: 3 -> 3. Verdict: unknown. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [solve/oracle/solver-verifier-rejection-supersession.json]
- **solver-verifier-rejection-supersession-main**: Independent verifier rejected the replacement because unbound, wrong-frontier, and malformed verifier-rejection findings could reopen terminal projected state. [subagent:verify_rejection_supersession]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-13T15:41:11.886Z | solver-verifier-rejection-supersession-main | observe | 1 -> 0 | progress | no_evidence |  | diff:solve/changes/solver-verifier-rejection-supersession/attempt-1.diff.json |
| 2026-07-13T16:10:09.647Z | solver-verifier-rejection-supersession-main | observe | 3 -> 2 | progress | no_previous |  | diff:solve/changes/solver-verifier-rejection-supersession/attempt-2.diff |
| 2026-07-13T16:21:20.818Z | solver-verifier-rejection-supersession-main | observe | 2 -> 2 | flat | no_previous |  | diff:solve/changes/solver-verifier-rejection-supersession/attempt-3.diff |
