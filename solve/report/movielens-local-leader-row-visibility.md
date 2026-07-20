# Solve report: movielens-local-leader-row-visibility

**Goal:** A partition replica's local Raft-leader transition immediately makes its canonical partitions.leader_node_id visible in the node-local authoritative row projection through the existing metadata publication owner, while that owner level-triggers durable convergence; demotion and stale-leader clearing remain conditional and safe, remove safety gains no parallel authority, and the unchanged production five-node MovieLens Wave-4 milestone completes successfully.

**Class:** product · **Closure:** MEASURED

**Outcome:** EXHAUSTED — 1 frontier(s) parked; human decision needed

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
- Mechanism: transition_gap
- Movement: unknown: PASS -> FAIL
- Latest evidence: test-output/reports/movielens-lagrange-service-affinity-live-2026-07-20T17-07-46-984Z.report.json
- Selected theory: demoted-self-replay-clearing (stale: selected theory status is avoided)
- Next move: record or select a fresh frontier theory for movielens-local-leader-row-visibility-main
- No longer current: PASS; Do not repeat a locally minted timestamp, discard demotion replay provenance, or select the missing-row theory without a real-seam head-red reproduction.; Do not spend another disambiguation rung or authorize an unchanged live rerun for this stale seal; let the Solver decide terminal integrity from the fresh HEAD evidence.; Do not record aggregate approval or hand off until a scoped static-owner guard repair removes the seven new violations without changing the EXHAUSTED decision provenance.

## Continuation
- Status: allowed
- Next action: No open frontier remains; inspect solve report.
- Blocker: none

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
- **movielens-local-leader-row-visibility-main** [parked {exhausted}] rung 3, attempts 3, metric 1 -> 1 — Fresh current-HEAD production evidence passes and the sealed MovieLens failure is absent; no honest move remains within this stale seal, so a future recurrence must be a newly evidenced Quest rather than another attempt here.

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
- **movielens-local-leader-row-visibility-main**: Independent verification passed: preserved causal versions, successor LWW, bounded demotion replay clearing, lifecycle reset, pre-submit ownership fence, and unchanged remove-safety/live contracts. [subagent:verify_local_leader_runtime_attempt3]
- **movielens-local-leader-row-visibility-main**: Fresh post-change evidence makes leader-before-local-PARTITIONS-row-hydration a live candidate but not yet the selected cause: seedLocalCanonicalLeaderNodeId returns without retaining replay intent when the canonical row is absent, while response loss and ledger self-persistence remain viable alternatives. The next attempt must first discriminate all three and must subsume or remove the inherited runtime seed path rather than stacking a second projection authority. (rules out: Do not repeat a locally minted timestamp, discard demotion replay provenance, or select the missing-row theory without a real-seam head-red reproduction.) [data/examples/service-data-affinity-demo-archive/wave4-live-nodes-priority-recovery-escape-2026-07-16T16-08-27-003Z.tar.gz]
- **movielens-local-leader-row-visibility-main**: The sealed MovieLens failure symptom does not reproduce on current HEAD: the fresh unchanged July 20 production five-node Lagrange scenario passes its priority gate, with one scenario passed and none failed. (rules out: Do not spend another disambiguation rung or authorize an unchanged live rerun for this stale seal; let the Solver decide terminal integrity from the fresh HEAD evidence.) [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-20T15-41-10-348Z.report.json]
- **movielens-local-leader-row-visibility-main**: Independent aggregate verification REJECTED handoff for sha256:2ce8ad5e430b18eb52f247bc2398e13c663d5683e6291e320f5c4a26f6a7578d: behavioral and model checks are green, but the required literal-guideline owner-boundary audit exits 1 with seven new violations in src/partition/partition-service-metadata-delivery-methods.js. The missing-row path also remains fail-closed/retrying rather than proving that mechanism fixed, consistent only with the EXHAUSTED stale-seal verdict. (rules out: Do not record aggregate approval or hand off until a scoped static-owner guard repair removes the seven new violations without changing the EXHAUSTED decision provenance.) [subagent:verify_local_leader_aggregate]

## Theories
- **demoted-self-replay-clearing** [avoided] frontier, frontier movielens-local-leader-row-visibility-main, layer observation, mechanism partition_metadata_publication_owner drops local projection provenance on demotion, so equal-version delayed durable self-leader CDC can restore stale ownership, owner partition_metadata_publication_owner, boundary raft_local_row_durable_row_replay, modelGate npm run model:contracts

## Selected Theories
- **movielens-local-leader-row-visibility-main**: demoted-self-replay-clearing

## Theory Results
- **demoted-self-replay-clearing**: falsified (scenario=failed, theory=falsified, movement=no_evidence) [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-16T10-00-24-317Z.report.json]
- **demoted-self-replay-clearing**: supported (scenario=done, theory=supported, movement=solved) [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-20T15-41-10-348Z.report.json]
- **demoted-self-replay-clearing**: avoided (scenario=failed, theory=avoided, movement=unknown) [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-20T17-07-46-984Z.report.json]

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-16T10:27:18.625Z | movielens-local-leader-row-visibility-main | observe | 1 -> 1 | flat | no_evidence |  | diff:solve/changes/movielens-local-leader-row-visibility/attempt-1.diff |
| 2026-07-16T10:46:56.813Z | movielens-local-leader-row-visibility-main | local-fix | 1 -> 1 | flat | no_evidence |  | diff:solve/changes/movielens-local-leader-row-visibility/attempt-2.diff |
| 2026-07-16T10:56:05.653Z | movielens-local-leader-row-visibility-main | widen-scope | 1 -> 1 | flat | no_evidence | demoted-self-replay-clearing | diff:solve/changes/movielens-local-leader-row-visibility/attempt-3.diff |
