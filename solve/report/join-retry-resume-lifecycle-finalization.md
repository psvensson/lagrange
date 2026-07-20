# Solve report: join-retry-resume-lifecycle-finalization

**Goal:** A preserved in-process retry that resumes a join session after a readiness-phase failure reconstructs the local lifecycle through CONNECTING, DISCOVERING, and JOINING before readiness publication, reaches READY before FINALIZED or steady-state background-writer activation, retains the same durable join session without replaying completed membership side effects, and the unchanged movielens-lagrange-service-affinity-live scenario reports priority metric 0 on three consecutive fresh runs.

**Class:** product · **Closure:** MEASURED

**Outcome:** SOLVED (MEASURED) — evidence: test-output/reports/movielens-lagrange-service-affinity-live-2026-07-20T15-41-10-348Z.report.json

**Attempts:** 1

## Links
- spec: solve/epics/service-data-affinity-placement.md
- parent quest: schema-provisioning-not-null-intent-recovery-roundtrip
- plan: solve/epics/service-data-affinity-placement.md

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
- **join-retry-resume-lifecycle-finalization-main**: The ordered live gate passed 5/5 formation probes and the first MovieLens run reached schema admission, 100000-row load, five-node ratings spread, and distributed SQL before a distinct initial-partition provisioning owner-lane collision: dc99...:operation:ade39472 stayed PENDING while its sibling inline operations dispatched, timed out, and its deterministic retry collided with the retained FAILED row. The repaired join lifecycle was engaged and is not the current boundary. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-20T03-16-02-506Z.report.json]

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
