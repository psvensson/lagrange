# Solve report: solver-verifier-rejection-supersession-steering

**Goal:** The canonical Solver steering contract documents exact verifier-rejection supersession and every generated LLM, rule, command, and tool surface is freshly regenerated from it without source-code changes.

**Class:** process · **Closure:** DECISION

**Outcome:** SOLVED (DECISION) — evidence: solve/oracle/solver-verifier-rejection-supersession.json

**Attempts:** 2

## Links
- spec: docs/steering/workflow-guidelines/solver-quests.md
- parent quest: solver-verifier-rejection-supersession

## Scope Pressure
- Changed files: 9
- Change bytes: 142540
- Owner areas: docs, solve
- Categories: workflow
- Split plan:
  - docs: 8 file(s)
  - solve: 1 file(s)
- Signals: none

## Frontiers
- **solver-verifier-rejection-supersession-steering-main** [solved] rung 1, attempts 2, metric 2 -> 0

## Findings
- **solver-verifier-rejection-supersession-steering-main**: The sealed symptom does not reproduce on HEAD: docs/steering/workflow-guidelines/solver-quests.md documents the fail-closed verifier-rejection supersession contract (rejection cannot be reversed by approving the rejected attempt; only a later same-frontier, same-base, changed-fingerprint replacement covering every rejected source path with its own exact approval resolves it), and npm run steering:check regenerates every generated LLM/rule/command/tool surface cleanly with no drift; the shared oracle measures metric 0 with both prior static-ratchet blockers green on HEAD 883eef72 [solve/oracle/solver-verifier-rejection-supersession.json]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-13T16:38:13.945Z | solver-verifier-rejection-supersession-steering-main | observe | 2 -> 2 | flat | no_evidence |  | diff:solve/changes/solver-verifier-rejection-supersession-steering/attempt-1.diff.json |
| 2026-07-21T06:34:36.974Z | solver-verifier-rejection-supersession-steering-main | local-fix | 0 -> 0 | flat | solved |  | diff:solve/changes/solver-verifier-rejection-supersession-steering/attempt-2.diff |
