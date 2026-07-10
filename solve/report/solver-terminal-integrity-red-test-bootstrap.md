# Solve report: solver-terminal-integrity-red-test-bootstrap

**Goal:** Fresh Quest-specific evidence executes the future Solver terminal-integrity guards against pre-fix code, records every required guard ID and the exact invalid-attempt/SOLVED failure signature with tested HEAD and artifact identity, and establishes a valid failing scenario baseline before the terminal-integrity cutover is sealed.

**Class:** process · **Closure:** DECISION

**Outcome:** SOLVED (DECISION) — evidence: solve/oracle/solver-terminal-integrity-red-test-bootstrap.json

**Attempts:** 1

## Links
- spec: solve/specs/owner-boundary-hardening-and-unification/implementation-plan.md#W0
- plan: solve/epics/owner-boundary-hardening-and-unification.md

## Current Blocker
- Frontier: solver-terminal-integrity-red-test-bootstrap-main
- Owner: unknown
- Boundary: unknown
- Dominant reason: unknown
- Mechanism: unknown
- Movement: no evidence recorded
- Latest evidence: none
- Selected theory: none
- Next move: continue supervised step for solver-terminal-integrity-red-test-bootstrap-main

## Continuation
- Status: allowed
- Next action: No open frontier remains; inspect solve report.
- Blocker: none

## Scope Pressure
- Changed files: 5
- Owner areas: scripts/run-solver-terminal-integrity-cutover-scenarios.js, solve, test/solve
- Categories: other, workflow
- Action: land or separate 3 owner areas: scripts/run-solver-terminal-integrity-cutover-scenarios.js, solve, test/solve
- Split plan:
  - solve: 2 file(s)
  - test/solve: 2 file(s)
  - scripts/run-solver-terminal-integrity-cutover-scenarios.js: 1 file(s)
- Signal: broad-source-scope severity=medium

## Frontiers
- **solver-terminal-integrity-red-test-bootstrap-main** [solved] rung 0, attempts 1, metric 1 -> 0

## Findings
- **solver-terminal-integrity-red-test-bootstrap-main**: Independent final-diff verifier approved the corrected W0 bootstrap: fresh runner-emitted report binding, exact dual failure IDs, separate hashes, and ten-guard coverage; evidence artifact SHA-256 f44360d1d4a5926b5da7874a907f08a3537a53de86790c85e6995fb325f325b3 [subagent:/root/w0_bootstrap_verify]
- **solver-terminal-integrity-red-test-bootstrap-main**: Ingested evidence from solver-terminal-integrity-red-test-bootstrap.json. Metric: 0 -> 0. Verdict: unknown. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [solve/oracle/solver-terminal-integrity-red-test-bootstrap.json]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-10T12:42:07.859Z | solver-terminal-integrity-red-test-bootstrap-main | observe | 1 -> 0 | progress | no_evidence |  | diff:solve/changes/solver-terminal-integrity-red-test-bootstrap/attempt-1.diff |
