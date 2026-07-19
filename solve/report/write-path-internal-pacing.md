# Solve report: write-path-internal-pacing

**Goal:** An internal pacing problem never relies on client fidelity (user directive 2026-07-04): a well-formed client write that hits transient participant timeouts while the cluster digests its own control-plane settling is absorbed INTERNALLY — via coordinator-internal bounded retry/wait within derived timeout budgets (ARCH-0013/0016/0017), optionally informed by the ingress pressure governor's signals, noting that a client-returned DEFER does not count as internal absorption — instead of surfacing 'Distributed operation failed due to participant failures' to the client. Proven by a deterministic red-on-revert reproduction of the observed failure class (participant timeout during settling -> client-visible failure on current code; absorbed internally with the fix), with the chosen internal-absorption mechanism's engagement asserted and no unbounded retry (budget-derived cutoff still fails loudly when genuinely stuck).

**Class:** product · **Closure:** MEASURED

**Outcome:** SOLVED (MEASURED) — evidence: test-output/reports/write-path-internal-pacing-2026-07-19T21-05-12-822Z.report.json

**Attempts:** 4

## Links
- parent quest: movielens-affinity-placement-demo

## Scope Pressure
- Changed files: 20
- Change bytes: 63422
- Owner areas: scripts/run-placement-affinity-scenarios.js, src/partition, src/query, test/partition, test/query
- Categories: other, runtime, test
- Action: split by owner area before the next attempt (20 files)
- Action: land or separate 5 owner areas: scripts/run-placement-affinity-scenarios.js, src/partition, src/query, test/partition, test/query
- Split plan:
  - src/partition: 10 file(s)
  - src/query: 6 file(s)
  - test/partition: 2 file(s)
  - scripts/run-placement-affinity-scenarios.js: 1 file(s)
  - test/query: 1 file(s)
- Signal: broad-source-scope severity=medium
- Signal: large-diff-stack severity=medium

## Frontiers
- **write-path-internal-pacing-main** [solved] rung 4, attempts 4, metric 0 -> 0 — exact terminal source attempt was rejected

## Findings
- **write-path-internal-pacing-main**: Additional live evidence (affinity demo run 11): the failure class also hits the CONTROL PLANE'S OWN writes — the rebalance coordinator's operation-persist to replica_operations-p1 failed with DISTRIBUTED_PARTICIPANT_FAILURE while that partition was itself being REPLACE-moved (post-join redistribution), 4 consecutive rebalance checks in a row. This is ARCH-0037 verbatim ('during moves... queries may be slower but must not fail because topology is transient') in addition to ARCH-0016/0017. The pacing fix must cover coordinator-internal writes, not just client statements.
- **write-path-internal-pacing-main**: Current HEAD reproduces internal write pacing failure under formation-adjacent topology work: a single-send 500-row MovieLens load stream committed 67 complete batches, then one well-formed load-lane request exhausted its original 15000ms budget while ratings split children were provisioned and split replication began; the source remained atomically at 33500 rows. The fixed sample was cool/source-stable, and the immutable archive binds sustained near-1.0 event-loop utilization and 1-5s gaps to the failure window. (rules out: Do not add loader retries, shrink the demo batch, raise timeouts, or weaken split fidelity; discriminate participant retry versus foreground admission versus split/provisioning pacing deterministically inside the original budget.) [solve/changes/write-path-internal-pacing/live-2026-07-19-ratings-split-load-timeout.md]
- **write-path-internal-pacing-main**: DT red-on-revert proven for test/partition/split-backfill-internal-pacing.test.js [dt:solve/changes/dt-prove/split-backfill-internal-pacing.test.js-2026-07-19T13-37-04-993Z.json]
- **write-path-internal-pacing-main**: DT red-on-revert proven for test/partition/split-backfill-internal-pacing.test.js [dt:solve/changes/dt-prove/split-backfill-internal-pacing.test.js-2026-07-19T13-40-55-938Z.json]
- **write-path-internal-pacing-main**: Independent verification rejected the split-backfill batching attempt for this sealed Quest: the guard did not compose the Quest's required participant-timeout/client-write boundary, and multi-row snapshot upserts collapsed per-row CDC into one malformed event. The pending attempt was aborted; split snapshot pacing must move to its own owner-boundary Quest and either preserve CDC or explicitly prove a physical-snapshot/no-logical-CDC contract. (rules out: Do not claim split batching closes write-path-internal-pacing; do not batch snapshot SQL through the current single-row CDC parser without an explicit snapshot-transfer CDC contract.) [subagent:/root/verify_split_backfill_pacing]
- **write-path-internal-pacing-main**: A second source-stable measuring MovieLens witness on checkpoint c48d5724 reproduces the open write-path boundary after the bounded split snapshot-transfer fix: 66 complete 500-row batches committed, the managed split changed original and right-child leaders, the seed reached utilization 1.0 with 68 percent blocked wall time and saturated per-source critical delivery, and the next single-submit load-lane write exhausted the unchanged 15000ms query budget without a partial source commit. (rules out: Do not add client/loader retry, shrink the demo batch, raise query/load-lane budgets, change split fidelity, or rerun unchanged bytes; compose remaining-budget owner retry with leader and participant movement deterministically.) [file:solve/changes/runtime-service-creating-owner-wake-progress-admission/post-live-ordered-gate-boundary-move-2026-07-19.md]
- **write-path-internal-pacing-main**: The current write-path-internal-pacing scenario oracle is insufficient: it aliases only split snapshot-transfer guards and returns metric 0 on checkpoint c48d5724 even though the fresh live single-submit foreground write still times out. The Quest cannot close until its guard composes the query owner/participant retry and original remaining-budget boundary required by the sealed statement. (rules out: Do not treat the green split-backfill batching oracle as proof of query-owner internal absorption, and do not commit the pinned zero sample without adding the missing seam.) [file:solve/changes/runtime-service-creating-owner-wake-progress-admission/post-live-ordered-gate-boundary-move-2026-07-19.md]
- **write-path-internal-pacing-main**: Fresh deterministic reproduction localizes the live timeout below the SQL coordinator: a multi-replica PartitionService mutates SQLite before its Raft proposal commits, and a Raft demotion neither rejects the pending write nor removes the uncommitted local row. The guard is red on checkpoint c48d5724 with pre-commit visibility=1, post-demotion visibility=1, and no owner release within 50ms versus the fixed 30000ms pending-commit timer. (rules out: Do not treat client retry, timeout widening, or coordinator-only delay as the root fix; the stale leader must apply only after quorum commit and demotion must release the in-flight owner so existing bounded routing can move.) [test/partition/partition-service-write-commit.test.js]
- **write-path-internal-pacing-main**: Independent verification rejected this exact attempt because deterministic content-derived participant identities conflate separate byte-identical client submissions in one session [subagent:root/verify_write_pacing_attempt]
- **write-path-internal-pacing-main**: Independent verification rejected this exact attempt because ProposalQueue releases same-entry single-flight ownership before awaited split and merge side effects finish [subagent:root/verify_write_pacing_attempt]
- **write-path-internal-pacing-main**: Independent verification rejected this exact attempt because the edited Raft initialization owner remained 820 lines, above the 800-line source cap [subagent:root/verify_write_pacing_attempt]
- **write-path-internal-pacing-main**: independent verification passed: exact artifact matches canonical 20-path delta; retry identity, pending-owner lifetime, commit visibility, demotion release, parent deadline, and source-size cap all verified; 807 targeted assertions and analyzers green [subagent:root/verify_write_pacing_attempt]

## Theories
- **theory-20260719-oversized-raft-initialization-embeds-lifecycle-event** [active] system, mechanism oversized_raft_initialization_embeds_lifecycle_event_wiring, owner partition_raft_lifecycle_wiring_owner, modelGate npm run model:contracts
- **theory-20260719-proposal-queue-commit-resolution-releases-full** [falsified] frontier, frontier write-path-internal-pacing-main, layer ownership, mechanism proposal_queue_commit_resolution_releases_full_outcome_single_flight_before_awaited_split_merge_side_effects_finish, modelGate npm run model:contracts
- **theory-20260719-oversized-raft-initialization-embeds-lifecycle-event-2** [falsified] frontier, frontier write-path-internal-pacing-main, layer ownership, mechanism oversized_raft_initialization_embeds_lifecycle_event_wiring, owner partition_raft_lifecycle_wiring_owner, boundary raft_lifecycle_event_callbacks, modelGate npm run model:contracts

## Selected Theories
- **write-path-internal-pacing-main**: theory-20260719-oversized-raft-initialization-embeds-lifecycle-event-2

## Theory Results
- **theory-20260719-proposal-queue-commit-resolution-releases-full**: falsified (scenario=done, theory=falsified, movement=no_evidence) [test-output/reports/write-path-internal-pacing-2026-07-19T20-58-22-853Z.report.json]
- **theory-20260719-oversized-raft-initialization-embeds-lifecycle-event-2**: supported (scenario=done, theory=supported, movement=solved) [test-output/reports/write-path-internal-pacing-2026-07-19T21-05-12-822Z.report.json]
- **theory-20260719-oversized-raft-initialization-embeds-lifecycle-event-2**: falsified (scenario=done, theory=falsified, movement=solved) [test-output/reports/write-path-internal-pacing-2026-07-19T21-05-12-822Z.report.json]

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-19T20:43:32.563Z | write-path-internal-pacing-main | observe | 0 -> 0 | flat | no_evidence |  | diff:solve/changes/write-path-internal-pacing/attempt-1.diff |
| 2026-07-19T20:53:08.440Z | write-path-internal-pacing-main | local-fix | 0 -> 0 | flat | no_evidence |  | diff:solve/changes/write-path-internal-pacing/attempt-2.diff |
| 2026-07-19T20:58:45.361Z | write-path-internal-pacing-main | widen-scope | 0 -> 0 | flat | no_evidence | theory-20260719-proposal-queue-commit-resolution-releases-full | diff:solve/changes/write-path-internal-pacing/attempt-3.diff |
| 2026-07-19T21:07:14.475Z | write-path-internal-pacing-main | model | 0 -> 0 | flat | solved | theory-20260719-oversized-raft-initialization-embeds-lifecycle-event-2 | diff:solve/changes/write-path-internal-pacing/attempt-4.diff |
