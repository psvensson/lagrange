# Solve report: rolling-restart-liveness-emulation

**Goal:** Rolling-restart failed samples can be classified without timeout hand-waving by deterministic replay/emulation of owner wake, queue drain, publication visibility, and operation workflow progress; the classifier distinguishes observed progress before budget exhaustion from stuck and insufficient-evidence states, with fixtures covering the latest publication_missing_active_node stall and at least one known drain/in-flight stall.

**Class:** process · **Closure:** DECISION

**Outcome:** IN PROGRESS (no terminal recorded)

**Attempts:** 0

## Links
- roadmap row: RM-0.1-fs-rolling-restart
- spec: membership-lifecycle-placement-hard-cutover
- parent quest: rolling-restart-run4-drain-residual
- plan: solve/epics/rolling-restart-liveness-observatory.md

## Current Blocker
- Frontier: publication-liveness-emulation
- Owner: unknown
- Boundary: unknown
- Dominant reason: unknown
- Mechanism: unknown
- Movement: no evidence recorded
- Latest evidence: none
- Selected theory: none
- Next move: continue supervised step for publication-liveness-emulation

## Continuation
- Status: allowed
- Next action: continue supervised step for drain-in-flight-progress-emulation
- Blocker: none

## Scope Pressure
- Changed files: 0
- Owner areas: none
- Categories: none
- Signals: none

## Frontiers
- **publication-liveness-emulation** [open] rung 0, attempts 0, metric ? -> ?
- **drain-in-flight-progress-emulation** [open] rung 0, attempts 0, metric ? -> ?

## Findings
- **publication-liveness-emulation**: Ingested evidence from rolling-restart-liveness-emulation.json. Metric: unknown -> 6. Verdict: unknown. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [solve/oracle/rolling-restart-liveness-emulation.json]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
