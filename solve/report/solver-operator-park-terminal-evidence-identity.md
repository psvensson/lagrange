# Solve report: solver-operator-park-terminal-evidence-identity

**Goal:** Operator park terminals bind --evidence to content-addressed evidenceIdentity and evidenceFingerprint, so a done:false exhausted oracle remains terminal under projection, strict audit, and next. doneWhen: solve/oracle/solver-operator-park-terminal-evidence-identity.json reports done only after red-on-base operator-park regressions, focused Solver tests, lint, scoped metrics, and independent exact plus aggregate verification pass without rewriting event history.

**Class:** process · **Closure:** DECISION

**Outcome:** SOLVED (DECISION) — evidence: solve/oracle/solver-operator-park-terminal-evidence-identity.json

**Attempts:** 1

## Links
- plan: solve/epics/roadmap-integrity-wave-0.md

## Scope Pressure
- Changed files: 2
- Change bytes: 7088
- Owner areas: scripts/solve, test/solve
- Categories: workflow
- Split plan:
  - scripts/solve: 1 file(s)
  - test/solve: 1 file(s)
- Signals: none

## Frontiers
- **solver-operator-park-terminal-evidence-identity-main** [solved] rung 0, attempts 1, metric 2 -> 0

## Findings
- **solver-operator-park-terminal-evidence-identity-main**: Operator park with --evidence writes only the evidence path on the exhausted quest terminal event; the focused regression fails on base because evidenceIdentity is absent, strict audit sees fresh unrecorded done:false oracle evidence, and next cannot reach terminal handoff. (rules out: The failure is not projection of the exhausted event itself and does not require changing projectState or historical log semantics.) [test/solve/park.test.js]
- **solver-operator-park-terminal-evidence-identity-main**: Reuse buildEvidenceIdentity at park time before appending any park event, attach the doneWhen probe metadata plus fingerprint only to the newly appended exhausted quest terminal, and reject missing supplied evidence before partial append. (rules out: No store fold, audit exemption, evidence-detection bypass, or historical event rewrite is needed.) [scripts/solve/park.js]
- **solver-operator-park-terminal-evidence-identity-main**: The five directly relevant Solver suites pass 264 assertions; the broader test/solve census passes 53 of 55 files and 2374 of 2380 assertions, with only inherited integration fixtures failing: a missing generated global-owner-debt import graph and the already-stale checked-in priority-recovery inventory. (rules out: Neither broad-suite failure touches park, evidence identity, audit, next, evidence detection, or store projection; no unrelated inventory regeneration belongs in this Quest.) [test/solve/park.test.js]
- **solver-operator-park-terminal-evidence-identity-main**: independent exact attempt verification passed [subagent:solver_park_identity_review_8a8cae3c_20260715T1142CEST]
- **solver-operator-park-terminal-evidence-identity-main**: independent aggregate verification passed [subagent:solver_park_identity_review_8a8cae3c_20260715T1142CEST]
- **solver-operator-park-terminal-evidence-identity-main**: Ingested evidence from solver-operator-park-terminal-evidence-identity.json. Metric: 0 -> 0. Verdict: unknown. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [solve/oracle/solver-operator-park-terminal-evidence-identity.json]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-15T09:32:31.944Z | solver-operator-park-terminal-evidence-identity-main | observe | 2 -> 0 | progress | no_evidence |  | diff:solve/changes/solver-operator-park-terminal-evidence-identity/attempt-1.diff |
