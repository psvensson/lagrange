# Solve report: operation-workflow-drain-redrive

**Goal:** Operation workflow owner deterministically re-drives surplus-drain rows with durable stuck evidence, including REMOVE+ACTIVE and REPLACE+SENDING with target-active visibility, so source-removal drain cannot leave a partition over target without an enabled owner action; proven by focused virtual-clock rebalancer tests before any rolling-restart statistical gate.

**Class:** product · **Closure:** DECISION

**Outcome:** IN PROGRESS (no terminal recorded)

**Attempts:** 0

## Links
- roadmap row: RM-0.1-fs-rolling-restart
- spec: membership-lifecycle-placement-hard-cutover
- parent quest: rolling-restart-run4-drain-residual
- plan: solve/epics/topology-convergence-hardening.md

## Current Blocker
- Frontier: operation-workflow-drain-redrive-main
- Owner: unknown
- Boundary: unknown
- Dominant reason: unknown
- Mechanism: transition_gap
- Movement: first blocker observed: unknown
- Latest evidence: solve/oracle/operation-workflow-drain-redrive.json
- Selected theory: none
- Next move: continue supervised step for operation-workflow-drain-redrive-main

## Continuation
- Status: allowed
- Next action: continue supervised step for operation-workflow-drain-redrive-main
- Blocker: none

## Scope Pressure
- Changed files: 0
- Owner areas: none
- Categories: none
- Signals: none

## Frontiers
- **operation-workflow-drain-redrive-main** [open] rung 0, attempts 0, metric ? -> 1

## Findings
- **operation-workflow-drain-redrive-main**: Ingested evidence from operation-workflow-drain-redrive.json. Metric: unknown -> 1. Verdict: unknown. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [solve/oracle/operation-workflow-drain-redrive.json]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
