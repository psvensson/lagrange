# Solve report: movielens-admin-event-loop-isolation-discriminator

**Goal:** A deterministic production-seam timing discriminator distinguishes pre-dispatch main-loop starvation from post-dispatch asynchronous snapshot-contributor delay using external client-send and JavaScript callback milestones, and emits whether the existing control-snapshot fallback has actual resource isolation, while runtime policy, repair authority, readiness, leases, and snapshot ownership remain unchanged.

**Class:** process · **Closure:** MEASURED

**Outcome:** SOLVED (MEASURED) — evidence: test-output/reports/movielens-admin-event-loop-isolation-discriminator-2026-07-17T10-23-03-729Z.report.json

**Attempts:** 1

## Links
- spec: solve/epics/service-data-affinity-placement.md
- parent quest: movielens-nodes-priority-recovery-escape
- plan: solve/epics/self-hosting-circularity-generic-treatment.md

## Scope Pressure
- Changed files: 1
- Change bytes: 10899
- Owner areas: test/convergence
- Categories: test
- Split plan:
  - test/convergence: 1 file(s)
- Signals: none

## Frontiers
- **movielens-admin-event-loop-isolation-discriminator-main** [solved] rung 1, attempts 1, metric 0 -> 0

## Findings
- **movielens-admin-event-loop-isolation-discriminator-main**: Head-freshness check on current HEAD (0d46d934 plus the in-flight watermark working tree): the fresh five-node live run did NOT exhibit the admin-response-timeout / control_plane_pressure signature this quest targets; it failed later at replica_operations_in_flight=1. One run's absence proves nothing (the 12.8s seed event-loop gaps were observed under the earlier failure mode), so this quest is not exhausted, but the ledger-completion discriminator is the currently-reproducing sibling and should run first. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-16T21-56-33-815Z.report.json]
- **movielens-admin-event-loop-isolation-discriminator-main**: Sealed symptom reproduces on final tenure-bound bytes (HEAD b81d4eac, clean tree): the 2026-07-17T10:17 live run failed schema admission with control_plane_pressure and snapshot_query_error both reading Timed out waiting for admin response, stableElapsedMs 0 - the admin snapshot lane never answered within budget. The blocker mix on current bytes rotates run-to-run between this admin-response timeout, the observation-wedge extra-key class, and operation-drain tail stragglers; with ledger-completion continuity solved (cc9c5684) and the self-move taxes collapsed, this quest's discriminator (pre-dispatch main-loop starvation versus post-dispatch snapshot-contributor delay) is the ready next rung for the admin-timeout class. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-17T10-17-32-374Z.report.json]
- **movielens-admin-event-loop-isolation-discriminator-main**: Ingested evidence from movielens-admin-event-loop-isolation-discriminator-2026-07-17T10-23-03-729Z.report.json. Metric: unknown -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-admin-event-loop-isolation-discriminator-2026-07-17T10-23-03-729Z.report.json]
- **movielens-admin-event-loop-isolation-discriminator-main**: Ingested evidence from movielens-admin-event-loop-isolation-discriminator-2026-07-17T10-23-03-729Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-admin-event-loop-isolation-discriminator-2026-07-17T10-23-03-729Z.report.json]
- **movielens-admin-event-loop-isolation-discriminator-main**: Independent verification APPROVED attempt-1: five consecutive runs at 8/8 with enormous margins (queue-wait 401ms vs 240 floor, handler 22ms vs 200 ceiling, separability shares 0.99-1.00 vs 0.00); the honest-receipt scheme satisfies the sealed constraint exactly (client JS send before the stall, server JS dispatch after; the stalled loop never claims a receipt time - the counterfactual buffered-write case keeps the measured delay 100 percent pre-dispatch by construction, though the comment's kernel-handoff wording overstates what net.Socket.write guarantees); the handler wrapper is measurement-only on the genuinely-served path; the build-boundary injection is materially equivalent to a deeper contributor injection for these milestones; snapshot authority untouched; three PASS reports honest with the 11-vs-8 count being tap-line granularity. DECISION BOUNDARY RECORDED per the verifier's item-7 ruling: family A plus the live gap logs make PRE_DISPATCH_STARVATION the strongly presumptive family for the live admin-response timeouts and prove same-loop serving has no resource isolation under starvation (the decision-scope-permitted conclusion), but the production diagnosis remains PRESUMPTIVE until a live application step attaches the same two milestones during a real failing run and confirms the queue-wait versus handler split - a follow-up quest must not treat the family assignment as settled fact before that measurement. [subagent:a33d1de8531ed9019]
- **movielens-admin-event-loop-isolation-discriminator-main**: Independent aggregate verification APPROVED: the aggregate delta from the pinned base over the quest's single path hashes byte-identically to the approved fingerprint (full-index comparison, same blob); the three consecutive PASS reports postdate the current bytes with a sixth independent green run; the scenario runner is committed in history (6618383a) and nothing else uncommitted belongs to this aggregate. The attempt-scope caveats carry forward: the kernel-handoff comment overstatement (non-material) and the live-application measurement step required before the production family assignment is treated as settled. [subagent:a33d1de8531ed9019]
- **movielens-admin-event-loop-isolation-discriminator-main**: Ingested evidence from movielens-admin-event-loop-isolation-discriminator-2026-07-17T10-31-44-548Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-admin-event-loop-isolation-discriminator-2026-07-17T10-31-44-548Z.report.json]
- **movielens-admin-event-loop-isolation-discriminator-main**: Ingested evidence from movielens-admin-event-loop-isolation-discriminator-2026-07-17T10-31-44-548Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-admin-event-loop-isolation-discriminator-2026-07-17T10-31-44-548Z.report.json]
- **movielens-admin-event-loop-isolation-discriminator-main**: Independent aggregate verification APPROVED the lint-superseded fingerprint: the delta from the previously-approved bytes is exactly two quote-style formatting hunks in non-interpolated assertion-message fragments (runtime-byte-identical messages, semantically a no-op); the canonical delta from the pinned base hashes to the new fingerprint and matches the saved supersession diff; a seventh consecutive 8/8 run and three fresh PASS reports postdate the fixed bytes. All prior findings carry forward including the two standing non-material caveats (kernel-handoff comment wording; the live production-family assignment stays presumptive until a live-run milestone measurement). [subagent:a33d1de8531ed9019]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-17T10:23:22.971Z | movielens-admin-event-loop-isolation-discriminator-main | observe | 0 -> 0 | flat | solved |  | diff:solve/changes/movielens-admin-event-loop-isolation-discriminator/attempt-1.diff |
