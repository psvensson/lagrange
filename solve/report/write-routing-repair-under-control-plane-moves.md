# Solve report: write-routing-repair-under-control-plane-moves

**Goal:** A distributed write to a system partition whose replica was just REPLACE-moved recovers within a bounded window instead of freezing the cluster: when a writer hits NO_HANDLER on a stale placement (the designed handleNoHandlerCandidate -> maybeAwaitRuntimeRoutingRepair path), routing repair restores a writable route even while OTHER control-plane partitions (e.g. control_plane_publications-p1) are themselves mid-move — breaking the observed mutual dependency where repairing replica_operations-p1 routing waited on control-plane state whose publication was blocked on the frozen operations table (live forensics: run-13 finding on movielens-affinity-placement-demo, 5-minute cluster-wide ops freeze, budget pinned 5/5). Proven by a deterministic red-on-revert reproduction of the freeze shape (replica moved + stale route + concurrent second control-plane move -> writes recover on current fix, freeze on revert), with the repair path's engagement asserted and no weakening of readiness gating for genuinely-down nodes.

**Class:** product · **Closure:** MEASURED

**Outcome:** SOLVED (MEASURED) — evidence: test-output/reports/write-routing-repair-under-control-plane-moves-2026-07-04T11-02-20-380Z.report.json

**Attempts:** 1

## Links
- parent quest: movielens-affinity-placement-demo

## Current Blocker
- Frontier: write-routing-repair-under-control-plane-moves-main
- Owner: unknown
- Boundary: unknown
- Dominant reason: unknown
- Mechanism: unknown
- Movement: no evidence recorded
- Latest evidence: none
- Selected theory: none
- Next move: continue supervised step for write-routing-repair-under-control-plane-moves-main

## Continuation
- Status: allowed
- Next action: No open frontier remains; inspect solve report.
- Blocker: none

## Scope Pressure
- Changed files: 13
- Owner areas: scripts/run-write-routing-repair-scenarios.js, src/cdc, src/partition, src/raft, test/cdc, test/integration, test/partition, test/raft
- Categories: other, runtime, test
- Action: split by owner area before the next attempt (13 files)
- Action: land or separate 8 owner areas: scripts/run-write-routing-repair-scenarios.js, src/cdc, src/partition, src/raft, test/cdc, test/integration, test/partition, test/raft
- Split plan:
  - src/partition: 5 file(s)
  - test/partition: 2 file(s)
  - scripts/run-write-routing-repair-scenarios.js: 1 file(s)
  - src/cdc: 1 file(s)
  - src/raft: 1 file(s)
  - test/cdc: 1 file(s)
  - test/integration: 1 file(s)
  - test/raft: 1 file(s)
- Signal: broad-source-scope severity=medium
- Signal: large-diff-stack severity=medium

## Frontiers
- **write-routing-repair-under-control-plane-moves-main** [solved] rung 1, attempts 1, metric ? -> 0

## Findings
- **write-routing-repair-under-control-plane-moves-main**: c-vet SATISFIED + root cause pinned (2 independent subagent investigations + direct artifact/code verification of run-15 SQLite raft logs). Mutual-dependency hypothesis CONFIRMED in corrected two-layer form: (1) TRIGGER = leadership-publication starvation: partitions.leader_node_id publish is a CAS UPDATE guarded by the LOCAL CDC-fed cache row (partition-service-core-base.js:607-673 createLeaderNodeMutationHelper); on OBSERVED_STATE_CHANGED the helper silently retries against the same stale guard (authoritative-row-mutation-helper.js:305-315, zero logging) while the cache cannot converge because the pointer is unpublished — run-15: r4 became leader 09:32:27.996, pointer landed 09:36:44.9 (4.3 min, the whole freeze). (2) POISON = split-brain write acceptance: partition-write-kernel.js:42-51 resolvePartitionWriteCommitMode returns DIRECT whenever replicaIds.length<=1 with NO raft/topology corroboration (CL-017a hardening only exists in the dead partition-replication-handler.js path); REPLACE-added r5@node-1 with stale self-only replicaIds self-committed coordinator writes as leader-format committed:true entries at conflicting indexes 125-132 term 2 (verified in replica_operations-p1-r5.db vs leader r4.db) — fabricating phantom active ops (b78dedef) that the REPLACE safety gate then read, wedging op 3a151ea2 forever, pinning the budget, freezing all ops. Original hypothesis 'repair refreshes readiness but not placement' REFUTED: maybeAwaitRuntimeRoutingRepair does refresh placement via refreshAuthoritativeRoutingOverlay; it faithfully installed leaderless metadata. Roots (b) snapshot-reuse, (c) quarantine-exhaustion, (d) handler-keying RULED OUT with code+artifact evidence.
- **write-routing-repair-under-control-plane-moves-main**: Adversarial verifier round 1 (constraint source-change-subagent-verification, subagent:freeze-fix-verifier-1): UNFAITHFUL verdict caught a P0 in my first fix — the expectedReplicaCount>1 witness conflated TARGET with ACTUAL membership (CREATE TABLE writes replica_count from config default minimum 3 BEFORE placement clamps to visible nodes; nothing writes the placed count back), bricking every user-table write on default-config single-node clusters; worse, a PRE-EXISTING envelope bug (handleRemoteQuery wrapped any non-throw as success:true, entry-apply-base.js) turned those rejections into silently ACKED DROPPED writes — differentially proven vs HEAD. Fixes applied: (1) witness narrowed to actuals only — raft-observed remote leaderId OR published partitions-row leader_node_id on another node; replica_count no longer consulted; (2) handleRemoteQuery envelope threads result.success/error; (3) new unmasked regression test single-node-default-replica-count-writes.integration.test.js (the sibling integration test pins defaultReplicaCount=1 and masked the defect). Verifier also confirmed: append-reorder safe (and fixes phantom rejected-PREPARE resurrection via reconstructPreparedState), helper await bounded ~90s worst case (no deadlock/re-entrancy — authoritative read is local-first synchronous), cache UPSERT race-protected by isStaleForExistingRecord HLC guard, message-group/wasm paths unaffected, quest constraints honored. Durable lesson: replica_count (and any placement TARGET) must never gate liveness decisions — only actuals (observed leaders, active service rows). partition-replication-handler.js is a production-dead unguarded applyWrite twin (test-only importers) — remove-on-contact follow-up.
- **write-routing-repair-under-control-plane-moves-main**: Adversarial verifier round 2 (subagent:freeze-fix-verifier-2): FAITHFUL, clear to commit. (a) verifier's own single-node production-default repro passes at the observable (INSERT acks, SELECTs back, direct SQLite read confirms, attempts:1); replica_count consulted nowhere (grep-confirmed). (b) envelope change: sole production consumer is isSuccessfulResponse (acknowledged && success) so rejections flow into the EXISTING candidate/retry/redirect machinery; REJECTED path touches nothing before returning so retries are safe; WATCH (pre-existing, not new): multi-replica RAFT-mode failures after local SQLite apply now surface as retryable at-least-once instead of being masked as success. (c) stale leader_node_id + legitimate lone survivor is transient — survivor self-elects and republishes the pointer (round-1 refreshObservedRow covers a stale CAS guard), and clearCanonicalPartitionLeaderIfNeeded (replica-state-machine-transition.js:347-382) independently nulls pointers to REMOVED/FAILED nodes. Residual LOW follow-up-quest corner: the partitions system partition ITSELF collapsed to a self-only-constructed lone survivor with a dead-node pointer would witness-reject its own pointer repair (circular); preconditions stacked (CL-013 replicaJoinTopologyMissingError already blocks the REPLACE-join shape); suggested escape = exempt the row-leg witness when the pointed-to node is authoritatively absent from nodes/services actuals.

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-04T11:08:59.493Z | write-routing-repair-under-control-plane-moves-main | observe | ? -> 0 | flat | no_evidence |  | diff:solve/changes/write-routing-repair-under-control-plane-moves/fix.diff |
