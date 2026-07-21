# Solve report: runtime-service-handoff-budget-rearm-reentry

**Goal:** A coordinator-created remote handoff for a non-system runtime-service ADD that stops at its operation budget — with the target replica creation already completed and the source durable operation row still CREATING after a deferred source dispatch — is not stranded: the planner rearm or ready-node replay path re-enters the exact parked operation through the canonical source owner and drives the exact target services row to terminal ACTIVE, proven by a deterministic production-seam discriminator modeling the exact 2026-07-21T08:13 live ordering (dispatch deferred while control-plane path recovers, target CREATE_REPLICA completed, coordinator-created handoff retry stopped at budget with workflowStep CREATING, retry state cleared) with red-on-revert for any fix, no timeout or budget widening, no broad non-system create replay, byte-identical behavior for system operations, and the unchanged five-node MovieLens live scenario completing initial service placement.

**Class:** product · **Closure:** MEASURED

**Outcome:** IN PROGRESS (no terminal recorded)

**Attempts:** 2

## Links
- spec: solve/epics/service-data-affinity-placement.md
- parent quest: movielens-three-way-affinity-demo
- plan: solve/epics/topology-convergence-hardening.md

## Current Blocker
- Frontier: runtime-service-handoff-budget-rearm-reentry-main
- Owner: unknown
- Boundary: unknown
- Dominant reason: unknown
- Mechanism: observation_gap
- Movement: narrowed: FAIL -> FAIL
- Latest evidence: test-output/reports/movielens-lagrange-service-affinity-live-2026-07-21T09-17-47-855Z.report.json
- Selected theory: none
- Next move: continue supervised step for runtime-service-handoff-budget-rearm-reentry-main
- No longer current: FAIL

## Continuation
- Status: allowed
- Next action: continue supervised step for runtime-service-handoff-budget-rearm-reentry-main
- Blocker: none

## Scope Pressure
- Changed files: 4
- Change bytes: 22490
- Owner areas: src/control-plane, test/control-plane
- Categories: runtime, test
- Split plan:
  - src/control-plane: 3 file(s)
  - test/control-plane: 1 file(s)
- Signals: none

## Frontiers
- **runtime-service-handoff-budget-rearm-reentry-main** [open] rung 1, attempts 2, metric 1 -> 1

## Findings
- **runtime-service-handoff-budget-rearm-reentry-main**: DT red-on-revert proven for test/control-plane/replica-dispatch-runtime-target-progress-retained-verification.test.js [dt:solve/changes/dt-prove/replica-dispatch-runtime-target-progress-retained-verification.test.js-2026-07-21T08-59-41-385Z.json]
- **runtime-service-handoff-budget-rearm-reentry-main**: Two post-fix live samples fail before or beside the sealed seam, not at it: the 09:04 run timed out at schema admission on cache_stale_watermark (authoritative-observation watermark lineage, pre-dispatch), and the 09:17 run never planned any non-system move because the rebalancer logged 'Deferring non-system rebalancing until priority control-plane partitions spread' every ~72s for the whole window (priority-spread lineage) — zero runtime-service dispatches occurred, so the sealed handoff-strand ordering was never exercised live. The sealed seam itself is deterministically proven: the discriminator reproduces the 08:21 strand red on unfixed source and the retained-verification fix is red-on-revert-proven (dt-prove artifact solve/changes/dt-prove/replica-dispatch-runtime-target-progress-retained-verification.test.js-2026-07-21T08-59-41-385Z.json), with 531/531 replica-dispatch family assertions green. Live doneWhen closure waits on those adjacent owner lineages; do not spend further live runs for this quest until they move. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-21T09-17-47-855Z.report.json]
- **runtime-service-handoff-budget-rearm-reentry-main**: independent verification passed: fingerprint exact, red-on-revert independently re-proven, discriminator fidelity strong (real coordinator lane, 2x-budget drain), boundedness and no-broad-replay confirmed, retry-loop and shutdown hazards enumerated clean, 531/531 family green, eslint clean [subagent:a50558d01219a66f7]
- **runtime-service-handoff-budget-rearm-reentry-main**: The sealed strand does not reproduce on HEAD 151a6993 because this quest's own committed fix closes it: the discriminator modeling the exact live ordering is green with the retained-verification re-entry present and red when it is reverted (dt-prove red-on-revert-proven, independently re-proven by the attempt verifier). The src drift flagged by seal-freshness is exactly this quest's own attempt-1 source change, checkpoint-committed at 151a6993. [dt:solve/changes/dt-prove/replica-dispatch-runtime-target-progress-retained-verification.test.js-2026-07-21T08-59-41-385Z.json]
- **runtime-service-handoff-budget-rearm-reentry-main**: independent verification passed: attempt-2 artifact is exactly the reviewed discriminator test as a canonical delta from checkpoint 151a6993, blob-hash-identical to the reviewed content, no riders [subagent:a50558d01219a66f7]
- **runtime-service-handoff-budget-rearm-reentry-main**: The ready-lease chronology witness resolves the 09:04 cache_stale_watermark schema-admission blocker end-to-end and exonerates the observation path: rejected node fb90afc1 (node-3) was active/ready but its last heartbeat was 109745 ms old with the 15 s ready-lease expired 94745 ms before snapshot observation, while owner-write delay was 86 ms and CDC delay 65 ms. Node-3's heartbeat-service failed at stage register ('Distributed operation failed due to participant failures') every 10 s from 09:02:43 because at 09:02:11 the node lost canonical partition-leader metadata for services-p1, logs-p1, and nodes-p1 simultaneously (235 unresolved-leader warnings until shutdown; all four other nodes heartbeated normally; nodes-p1 leadership had moved to node-0 at 09:00:15). The loss follows one second after a 'Metadata publication CAS missed observed state; refreshing guard row from authority' event at 09:02:10.127 coinciding with 'Bootstrap authoritative snapshot was empty; retaining cached system-table rows' and 'Bootstrap snapshot diverged from local authoritative partition state' — the CAS-miss-triggered guard refresh read an empty/diverged authoritative snapshot and left the node-local canonical leader view unpopulated with no recovery for 110 s. Owner: node-local partition metadata delivery/publication-guard refresh (src/partition/partition-service-metadata-delivery-methods.js family), adjacent to the movielens-local-leader-row-visibility lineage. This is not ready-lease-maintenance deferral, so the parked movielens-ready-lease-maintenance-critical-owner-lane reopen condition is NOT met. Evidence archive run-2026-07-21T09-04-49-134Z.tar.gz sha256 fed03102 prefix recorded alongside the witness in the 09:04 report. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-21T09-04-08-984Z.report.json]
- **runtime-service-handoff-budget-rearm-reentry-main**: Correction to the previous witness-attribution finding: the evidence archive run-2026-07-21T09-04-49-134Z.tar.gz sha256 prefix is cb6fc86bbd5ae28b1d69cb2d, not 'fed03102' (that string was an authoring placeholder mistakenly left in; no other content of the finding changes). [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-21T09-04-08-984Z.report.json]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-21T09:18:58.279Z | runtime-service-handoff-budget-rearm-reentry-main | observe | 1 -> 1 | flat | narrowed |  | diff:solve/changes/runtime-service-handoff-budget-rearm-reentry/attempt-1.diff |
| 2026-07-21T09:27:40.240Z | runtime-service-handoff-budget-rearm-reentry-main | local-fix | 1 -> 1 | flat | narrowed |  | diff:solve/changes/runtime-service-handoff-budget-rearm-reentry/attempt-2.diff |
