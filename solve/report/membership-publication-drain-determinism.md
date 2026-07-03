# Solve report: membership-publication-drain-determinism

**Goal:** A reconciled active node can never remain unpublished without an enabled drain/wake obligation: the membership-publication drain is deterministic and self-rescheduling, proven by a PublicationConvergence model property and a deterministic-drain reschedule regression test for the active-gate reconcile deferral branch.

**Class:** product · **Closure:** DECISION

**Outcome:** SOLVED (DECISION) — evidence: solve/oracle/membership-publication-drain-determinism.json

**Attempts:** 0

## Links
- spec: membership-lifecycle-placement-hard-cutover
- closes: CL-001
- plan: solve/epics/topology-convergence-hardening.md

## Current Blocker
- Frontier: membership-publication-drain-determinism-main
- Owner: unknown
- Boundary: unknown
- Dominant reason: unknown
- Mechanism: unknown
- Movement: no evidence recorded
- Latest evidence: none
- Selected theory: none
- Next move: continue supervised step for membership-publication-drain-determinism-main

## Continuation
- Status: allowed
- Next action: continue supervised step for membership-publication-drain-determinism-main
- Blocker: none

## Scope Pressure
- Changed files: 0
- Owner areas: none
- Categories: none
- Signals: none

## Frontiers
- **membership-publication-drain-determinism-main** [open] rung 0, attempts 0, metric ? -> ?

## Findings
- **membership-publication-drain-determinism-main**: Ingested evidence from membership-publication-drain-determinism.json. Metric: unknown -> 0. Verdict: unknown. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [solve/oracle/membership-publication-drain-determinism.json]
- **membership-publication-drain-determinism-main**: Deterministic membership-publication drain proof is present: oracle probe returns done=true, and focused active-gate owner recovery, queue merge/admission, and owner-path regression tests pass 166/166 assertions. [solve/oracle/membership-publication-drain-determinism.json; npm test -- test/control-plane/membership-publication-active-gate-reconcile-owner-recovery.test.js test/control-plane/membership-publication-coordinator-reconcile-queue-merge.js test/control-plane/failure-class-owner-path-regression.test.js]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
