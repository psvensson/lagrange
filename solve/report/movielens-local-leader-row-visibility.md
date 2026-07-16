# Solve report: movielens-local-leader-row-visibility

**Goal:** A partition replica's local Raft-leader transition immediately makes its canonical partitions.leader_node_id visible in the node-local authoritative row projection through the existing metadata publication owner, while that owner level-triggers durable convergence; demotion and stale-leader clearing remain conditional and safe, remove safety gains no parallel authority, and the unchanged production five-node MovieLens Wave-4 milestone completes successfully.

**Class:** product · **Closure:** MEASURED

**Outcome:** IN PROGRESS (no terminal recorded)

**Attempts:** 3

## Links
- spec: solve/epics/service-data-affinity-placement.md
- parent quest: movielens-incremental-replace-spread-nonregression
- plan: solve/epics/self-hosting-circularity-generic-treatment.md

## Current Blocker
- Frontier: movielens-local-leader-row-visibility-main
- Owner: unknown
- Boundary: unknown
- Dominant reason: unknown
- Mechanism: unknown
- Movement: no evidence recorded
- Latest evidence: none
- Selected theory: demoted-self-replay-clearing (stale: selected theory status is falsified)
- Next move: record or select a fresh frontier theory for movielens-local-leader-row-visibility-main

## Continuation
- Status: blocked-theory
- Next action: record system theory before the next movielens-local-leader-row-visibility-main attempt using npm run model:contracts as model discriminator
- Blocker: system theory required for movielens-local-leader-row-visibility-main
- Blocker: frontier theory required for movielens-local-leader-row-visibility-main
- Blocker: selected theory stale: selected theory status is falsified

## Scope Pressure
- Changed files: 8
- Change bytes: 34836
- Owner areas: src/partition, src/raft, test/config, test/control-plane
- Categories: runtime, test
- Action: land or separate 4 owner areas: src/partition, src/raft, test/config, test/control-plane
- Split plan:
  - src/partition: 4 file(s)
  - src/raft: 2 file(s)
  - test/config: 1 file(s)
  - test/control-plane: 1 file(s)
- Signal: broad-source-scope severity=medium

## Frontiers
- **movielens-local-leader-row-visibility-main** [open] rung 3, attempts 3, metric 1 -> 1

## Findings
- **movielens-local-leader-row-visibility-main**: DT red-on-revert proven for test/control-plane/cl-036-local-leader-row-seed.test.js [dt:solve/changes/dt-prove/cl-036-local-leader-row-seed.test.js-2026-07-16T10-23-55-118Z.json]
- **movielens-local-leader-row-visibility-main**: Three consecutive deterministic guard runs pass 5/5 files and 319/319 assertions per run: the actual shared Raft transition seeds the existing local PARTITIONS row, stable activation level-triggers durable reassertion, demotion conditionally clears only self-owned evidence, a newer successor survives, authoritative CAS uses the durable row rather than the local seed, and demotion during the point read prevents a stale submit. [test-output/reports/movielens-local-leader-row-visibility-2026-07-16T10-23-42-147Z.report.json]
- **movielens-local-leader-row-visibility-main**: Focused TLC composition passes for atomic Raft-to-local-row visibility plus eventual durable convergence or ownership loss and demotion safety. [test-output/reports/local-leader-row-visibility-fixed.model.report.json]
- **movielens-local-leader-row-visibility-main**: TLC exhibits the original cross-layer gap when local seed is disabled: LocalLeaderHasImmediateEvidence is violated at the replacement election edge. [test-output/reports/local-leader-row-visibility-missing-seed.model.report.json]
- **movielens-local-leader-row-visibility-main**: TLC rejects local clearing without a pre-submit owner fence: an authoritative read started before demotion can republish stale replacement ownership and violate DemotedLeaderCannotAuthorizeRemoval. [test-output/reports/local-leader-row-visibility-stale-publish.model.report.json]
- **movielens-local-leader-row-visibility-main**: Latest-live binding correction: this local leader-row fix closes the independently proven 2026-07-13 case where a replacement actually logged Became leader but leader_node_id lagged. It is not sufficient for the 2026-07-16 run: neither replacement logged partition leadership. The exact first target-election ACK occurred at 09:58:17.858, then the next safety evaluation at 09:58:25.949 was beyond the 5s election-evidence retry-suppression window. At that point the candidate resolver's RETARGET_AFTER_COMPLETED_WITHOUT_OWNERSHIP policy can replace the exact ACKed candidate, while the remove-safety owner separately declares that exact completed ACK sufficient under voter proof. Same-turn continuation did not run because its separate gate requires priorityRecoveryCompletionSafe/no retarget. This adjacent-owner contradiction is the next Wave-4 rung; do not spend a live run on the row fix alone. [data/examples/service-data-affinity-demo-archive/wave4-live-incremental-replace-spread-nonregression-2026-07-16T10-00-24-317Z.tar.gz]
- **movielens-local-leader-row-visibility-main**: Independent verification rejected exact attempt: local seed mints an updated_at that can fence a legitimate successor CDC row under wall-clock skew; successor test/model omit the counterexample. [subagent:verify_local_leader_runtime_attempt1]
- **movielens-local-leader-row-visibility-main**: Ingested evidence from movielens-lagrange-service-affinity-live-2026-07-16T10-00-24-317Z.report.json. Metric: 1 -> 1. Verdict: FAIL. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-16T10-00-24-317Z.report.json]
- **movielens-local-leader-row-visibility-main**: DT red-on-revert proven for test/control-plane/cl-036-local-leader-row-seed.test.js [dt:solve/changes/dt-prove/cl-036-local-leader-row-seed.test.js-2026-07-16T10-43-37-420Z.json]
- **movielens-local-leader-row-visibility-main**: Independent verification rejected exact attempt: demotion drops local projection provenance, so an equal-version delayed durable self-leader replay can restore stale ownership while isLeader is false; the focused tests omit this replay-after-demotion counterexample. [subagent:verify_local_leader_runtime_attempt2]
- **movielens-local-leader-row-visibility-main**: DT red-on-revert proven for test/control-plane/cl-036-local-leader-row-seed.test.js [dt:solve/changes/dt-prove/cl-036-local-leader-row-seed.test.js-2026-07-16T10-54-29-914Z.json]

## Theories
- **demoted-self-replay-clearing** [falsified] frontier, frontier movielens-local-leader-row-visibility-main, layer observation, mechanism partition_metadata_publication_owner drops local projection provenance on demotion, so equal-version delayed durable self-leader CDC can restore stale ownership, owner partition_metadata_publication_owner, boundary raft_local_row_durable_row_replay, modelGate npm run model:contracts

## Selected Theories
- **movielens-local-leader-row-visibility-main**: demoted-self-replay-clearing

## Theory Results
- **demoted-self-replay-clearing**: falsified (scenario=failed, theory=falsified, movement=no_evidence) [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-16T10-00-24-317Z.report.json]

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-16T10:27:18.625Z | movielens-local-leader-row-visibility-main | observe | 1 -> 1 | flat | no_evidence |  | diff:solve/changes/movielens-local-leader-row-visibility/attempt-1.diff |
| 2026-07-16T10:46:56.813Z | movielens-local-leader-row-visibility-main | local-fix | 1 -> 1 | flat | no_evidence |  | diff:solve/changes/movielens-local-leader-row-visibility/attempt-2.diff |
| 2026-07-16T10:56:05.653Z | movielens-local-leader-row-visibility-main | widen-scope | 1 -> 1 | flat | no_evidence | demoted-self-replay-clearing | diff:solve/changes/movielens-local-leader-row-visibility/attempt-3.diff |
