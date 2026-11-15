# Post-Closure Applicability Record -- `formation-ready-lease-independent-of-spread`

- **Date**: 2026-11-15
- **Component Branch**: `origin/wip/order2-formation-ready-lease-20261115`
- **Integrated Candidate Branch**: `origin/wip/integrated-candidate-20261115`
- **Foundation Repairs Branch**: `origin/wip/order5b-foundation-repairs-rebased-20261115` (note: PR `#217` at `c4f1cd0a00383cb6499d4330c9d17b8a8cfde331` remains an **open draft PR (not landed)**; the foundation repairs are composed into the candidate branch via `wip/order5b-foundation-repairs-rebased-20261115`)

---

## 1. Post-Closure Defects Found During Physical & Controller-Convergence Qualification

Although separating initial joiner `READY` lease admission from priority-partition spread (`admittedByEpoch <= 1`) resolved the cold-formation joiner barrier deadlock, subsequent physical and controller-convergence qualification uncovered four post-closure gaps that prevented formation and recovery from satisfying the full release-liveness, voter-floor, and storage-continuity invariants:

1. **`evaluateRemoveSafety` Early-`SAFE` Bypass of `READY` Voter Floor and Peer Liveness (`src/rebalancer/operation-workflow-remove-safety-evaluator.js`)**:
   - When `hasRecentCommittedMembershipProof(snapshot, targetReplica)` returned `true` alongside `voterCount > minVoters`, `evaluateRemoveSafety` returned `SAFE` at line 631 before reaching `evaluateRemainingVoterReadiness` (`minReadyVoters`) or `evaluateRemainingPeerConnectivity`.
   - Furthermore, `isRemainingVoterReadyForRemoval` treated `SYNCING` voters with a `READY` node lease as satisfying `minReadyVoters`, allowing `seed` removal while a joiner voter was still `SYNCING` (`test/rebalancer/formation-ledger-spread-voter-ready-readiness.test.js`).

2. **`MovePlanner` Voter-Completion Floor Bypass for `REMOVE` (`src/rebalancer/move-planner-move-calculation-methods.js`)**:
   - `enforcePriorityPartitionVoterCompletionFloor` skipped `REMOVE` evaluation whenever `activeVoters.length > desiredReplicas`, allowing `REMOVE` planning on a `4`-voter (`seed + 3 joiners`) priority partition while one of the remaining joiners was still `SYNCING` or lacked a `READY` lease (`test/rebalancer/formation-ledger-spread-voter-ready-readiness.test.js`).

3. **Consensus Recovery Membership Included Lease-Expired Nodes (`src/partition/consensus-recovery-membership-methods.js`)**:
   - `resolveClusterActiveNodeIds` filtered `TABLES.NODES` only by `status === ACTIVE`, admitting nodes whose `ready_lease_expires_at` had already expired (`test/convergence/dt-formation-joint-admission-release-liveness.test.js`).

4. **Registration-to-Recovery Storage Continuity Contract & Production Lost-Disk Discovery (`src/bootstrap/shared/node-registration-owner-durable-rejoin-methods.js`, `src/bootstrap/shared/node-registration-owner-publication-methods.js`, `src/rebalancer/replica-operation-progress.js`, `src/rebalancer/unified-rebalancer-replica-state.js`)**:
   - **Blocking cross-boot membership reuse when `durableStateDetected === false`**: `hasDurableRejoinStorageContinuity()` and `resolveExistingJoinAdmissionProgress()` now require `fence.allowed === true`, `fence.durableMembershipState !== 'absent'`, and durable reentry continuity before reusing a prior boot's `NODES` row. A node restarting over a wiped data directory (`durableStateDetected === false`, `fence.durableMembershipState === 'absent'`) never reuses its prior `ACTIVE`/`CONNECTED` `NODES` row.
   - **Clock-independent `storageIncarnation` contract**:
     - On a fresh-storage registration (`durableStateDetected === false`), `storageIncarnation = bootIncarnation` is persisted in `NODE_ENDPOINTS.metadata` (`storageIncarnation`) and carried on `NODES` (`storage_incarnation`).
     - On a durable rejoin (`durableStateDetected === true`), `boot_incarnation` advances while `storageIncarnation` is preserved from the observed node/endpoint row.
     - `createOperation` and `buildOperationTransitionStepEntry` stamp `targetNodeBootIncarnation` and `targetNodeStorageIncarnation` into `REPLICA_OPERATIONS.steps_history` (and onto the operation record).
     - `isTerminalCreateSupersededByNodeRegistration` checks `hasActiveServiceTombstone(targetReplicaId)` OR `currentStorageIncarnation > operationStorageIncarnation`, remaining independent of wall-clock skew/rollback (`NODES.created_at <= operation.completed_at`) and independent of process-local 30s cache tombstones.
   - **Production lost-disk replica discovery (`reconcileLostStoragePartitionReplicas`)**:
     - When `NodeRegistrationOwner.registerNodeInCluster()` executes a fresh-storage registration (`!(await this.hasDurableRejoinStorageContinuity())`), `reconcileLostStoragePartitionReplicas(now)` reads existing partition `SERVICES` rows assigned to `this.nodeId` and transitions every non-`FAILED` replica row to `status = 'failed'`, `raft_role = 'learner'`, `trigger_reason = 'node_storage_lost_on_fresh_registration'`, so `MovePlanner` and `RebalanceCoordinator` drive `REMOVE` (`replica_failed`) + `ADD` re-replication without external `SERVICES` deletion.

---

## 2. Corrections to Evidence Claims (`formation-b-analysis.md`)

- **Retracted operation-ID attribution**: Earlier revisions of `formation-b-analysis.md` (§4 and §8) claimed that `c3ec15e6b` (`9e8a8950`) failed `g-projection-agrees-with-authority` (`2,817 ms > 2,500 ms` on `control_plane_publications-p1`) because `ledger_in_flight` changed operation IDs (`44fbdbf0` -> `4017bc26`) across rounds without resetting the disagreement timer.
- **Actual code behavior**: In `test/distributed/harness/fresh-formation-routability-predicate.js`, `evaluateFormationObservation` -> `evaluateLedgerQuiet` -> `compareProjectedInFlight` (lines 454-506) emits ledger disagreement entries keyed solely by observer node (`key: \`ledger_in_flight:${observerNodeId}\`` at line 497), and `evaluateProjectionAgreement` / `advanceDisagreementEpisode` (lines 655-701) track episode continuity in `episodes` (`Map<key, episode>`) by `entry.key` without inspecting `operation_id` or `partition_id`. In `9e8a8950`, `ledger_in_flight:node-1` remained continuously present across 7 consecutive observations (`t = 32,021 ms` to `t = 34,838 ms`) while `control_plane_publications-p1` had in-flight ledger rows.
- **Disposition**: `9e8a8950` (`c3ec15e6b`, composed on `527527c80`) remains an **unresolved failure of that earlier composition**. Service acceptance requires direct physical qualification of the integrated candidate (`origin/wip/integrated-candidate-20261115`) against the unchanged `g-projection-agrees-with-authority` predicate (`2,500 ms` bound).

---

## 3. Simulation Boundary for Controller-Convergence Recovery Proofs

In `test/convergence/formation-joint-admission-world.js`, `test/convergence/formation-joint-admission-rounds.js`, and `test/convergence/dt-formation-joint-admission-release-liveness.test.js`:
- **What is real**: `NodeRegistrationOwner`, `ControlPlaneReadinessService`, `NodeJoiningService`, `NodeLifecyclePublication`, `HeartbeatService`, `MembershipPublicationCoordinator`, `UnifiedRebalancer` (`MovePlanner`), `RebalanceCoordinator`, and `ReplicaDispatchService` all execute real production code against virtual time (`createWorldClock`) with zero timer/timeout expirations (`spentBounds = []`).
- **What is doubled**:
  1. **Consensus / Raft**: Simulated by `PARTITIONS.leader_node_id` and `SERVICES.raft_role` in the shared `SystemTableCache` (`reassignStoppedNodeLeadership` transfers non-seed partition leadership when a node stops).
  2. **Wiped-data-dir restart (`stopNode({wipeDataDir: true})`)**:
     - Cluster `REPLICA_OPERATIONS` rows are **never deleted** by `stopNode`.
     - Two explicit witnesses are verified in `joiner-restart-wiped-data-dir`:
       1. **Default local-disk-only wipe witness (`externalServicesCleanup: false`)**: `stopNode` clears only the wiped node's local in-memory replica runtime (`replicaRuntime.wipeNode`) and leaves committed `SERVICES` and `REPLICA_OPERATIONS` rows in `cache` completely untouched. When the restarted node registers through the real `NodeRegistrationOwner.registerNodeInCluster()` with `durableStateDetected: false`, `NodeRegistrationOwner` refuses to reuse the old `ACTIVE`/`CONNECTED` `NODES` row, advances `storageIncarnation` (`1 -> 2`), and `reconcileLostStoragePartitionReplicas` transitions the untouched `SERVICES` rows on that node to `FAILED`/`LEARNER` (`trigger_reason: 'node_storage_lost_on_fresh_registration'`), after which `MovePlanner` and `RebalanceCoordinator` drive `REMOVE` (`replica_failed`) + `ADD` recovery.
       2. **Absent-`SERVICES` + cleared-tombstones + clock-rollback witness (`externalServicesCleanup: true, registrationNowMs: 1000`)**: `SERVICES` rows are removed, `systemTableCache.tombstoneStore` is cleared, and the registering node's clock is rolled back behind `operation.completed_at` (`created_at = 1000 < completed_at`). `isTerminalCreateSupersededByNodeRegistration` detects supersession via `storageIncarnation` (`2 > 1`) and prevents terminal `ADD`/`REPLACE` rows from projecting ghost replicas.
