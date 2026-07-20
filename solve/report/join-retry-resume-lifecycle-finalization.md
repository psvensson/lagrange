# Solve report: join-retry-resume-lifecycle-finalization

**Goal:** A preserved in-process retry that resumes a join session after a readiness-phase failure reconstructs the local lifecycle through CONNECTING, DISCOVERING, and JOINING before readiness publication, reaches READY before FINALIZED or steady-state background-writer activation, retains the same durable join session without replaying completed membership side effects, and the unchanged movielens-lagrange-service-affinity-live scenario reports priority metric 0 on three consecutive fresh runs.

**Class:** product · **Closure:** MEASURED

**Outcome:** IN PROGRESS (no terminal recorded)

**Attempts:** 1

## Links
- spec: solve/epics/service-data-affinity-placement.md
- parent quest: schema-provisioning-not-null-intent-recovery-roundtrip
- plan: solve/epics/service-data-affinity-placement.md

## Current Blocker
- Frontier: join-retry-resume-lifecycle-finalization-main
- Owner: unknown
- Boundary: unknown
- Dominant reason: unknown
- Mechanism: transition_gap
- Movement: solved: unknown -> unknown
- Latest evidence: test-output/reports/join-retry-resume-lifecycle-finalization-2026-07-20T02-55-23-031Z.report.json
- Selected theory: none
- Next move: continue supervised step for join-retry-resume-lifecycle-finalization-main
- No longer current: unknown; Do not treat this as only an AdminWsClient timeout or widen the 180000ms formation budget: seed admin polls repeatedly completed, durable rows and cache watermarks moved, and the canonical heartbeat fence directly derives JOINING publication from the non-READY local lifecycle.

## Continuation
- Status: allowed
- Next action: No open frontier remains; inspect solve report.
- Blocker: none

## Scope Pressure
- Changed files: 6
- Change bytes: 19577
- Owner areas: src/bootstrap, src/node, test/bootstrap, test/node
- Categories: runtime
- Action: land or separate 4 owner areas: src/bootstrap, src/node, test/bootstrap, test/node
- Split plan:
  - src/bootstrap: 2 file(s)
  - test/bootstrap: 2 file(s)
  - src/node: 1 file(s)
  - test/node: 1 file(s)
- Signal: broad-source-scope severity=medium

## Frontiers
- **join-retry-resume-lifecycle-finalization-main** [solved] rung 1, attempts 1, metric 0 -> 0

## Findings
- **join-retry-resume-lifecycle-finalization-main**: Fresh live stopped-state evidence shows all four joiners completed the same durable join session on attempt two and wrote ready leases, but each logged successful completion with lifecycleState=connecting; because the completed membership checkpoint was skipped, its resumed-infrastructure lifecycle catch-up never ran, FINALIZED ignored the failed CONNECTING-to-READY transition, and activated heartbeats reasserted status=joining, leaving the seed projection below five active nodes until timeout. (rules out: Do not treat this as only an AdminWsClient timeout or widen the 180000ms formation budget: seed admin polls repeatedly completed, durable rows and cache watermarks moved, and the canonical heartbeat fence directly derives JOINING publication from the non-READY local lifecycle.) [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-20T02-22-27-350Z.report.json]
- **join-retry-resume-lifecycle-finalization-main**: DT red-on-revert proven for test/bootstrap/node-joining-service-join-lifecycle-resume.test.js [dt:solve/changes/dt-prove/node-joining-service-join-lifecycle-resume.test.js-2026-07-20T02-42-38-578Z.json]
- **join-retry-resume-lifecycle-finalization-main**: Independent verification approved exact runtime attempt: durable checkpoint resume, lifecycle owner CAS/rebind, fail-closed READY finalization, heartbeat fence, listener ownership, red-on-revert, and focused/static guards passed; full static residuals are unchanged dirty-worktree baseline debt. [subagent:verify_runtime_context_coalescing]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-20T02:49:17.172Z | join-retry-resume-lifecycle-finalization-main | observe | 0 -> 0 | flat | solved |  | diff:solve/changes/join-retry-resume-lifecycle-finalization/attempt-1.diff |
