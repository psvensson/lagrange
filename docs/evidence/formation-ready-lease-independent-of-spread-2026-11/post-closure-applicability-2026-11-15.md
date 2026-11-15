# Post-Closure Applicability Record -- `#217` (`formation-ready-lease-independent-of-spread`)

- **Date**: 2026-11-15
- **Component Branch**: `origin/wip/order2-formation-ready-lease-20261115`
- **Integrated Candidate Branch**: `origin/wip/integrated-candidate-20261115`
- **Prior Landed PR**: `#217` (`c4f1cd0a00383cb6499d4330c9d17b8a8cfde331`)

---

## 1. Post-Closure Defects Found After `#217` Landed

Although `#217` separated initial joiner `READY` lease admission from priority-partition spread (`admittedByEpoch <= 1`), subsequent physical and controller-convergence qualification uncovered four post-closure gaps that prevented formation and recovery from satisfying the full release-liveness and voter-floor invariants:

1. **`evaluateRemoveSafety` Early-`SAFE` Bypass of `READY` Voter Floor and Peer Liveness (`src/rebalancer/operation-workflow-remove-safety-evaluator.js`)**:
   - When `hasRecentCommittedMembershipProof(snapshot, targetReplica)` returned `true` alongside `voterCount > minVoters`, `evaluateRemoveSafety` returned `SAFE` at line 631 before reaching `evaluateRemainingVoterReadiness` (`minReadyVoters`) or `evaluateRemainingPeerConnectivity`.
   - Furthermore, `isRemainingVoterReadyForRemoval` treated `SYNCING` voters with a `READY` node lease as satisfying `minReadyVoters`, allowing `seed` removal while a joiner voter was still `SYNCING` (`test/rebalancer/operation-workflow-remove-safety-evaluator.test.js`).

2. **`MovePlanner` Voter-Completion Floor Bypass for `REMOVE` (`src/rebalancer/move-planner-move-calculation-methods.js`)**:
   - `enforcePriorityPartitionVoterCompletionFloor` skipped `REMOVE` evaluation whenever `activeVoters.length > desiredReplicas`, allowing `REMOVE` planning on a `4`-voter (`seed + 3 joiners`) priority partition while one of the remaining joiners was still `SYNCING` or lacked a `READY` lease (`test/rebalancer/move-planner-voter-floor-enforcement.test.js`).

3. **Consensus Recovery Membership Included Lease-Expired Nodes (`src/partition/consensus-recovery-membership-methods.js`)**:
   - `resolveClusterActiveNodeIds` filtered `TABLES.NODES` only by `status === ACTIVE`, admitting nodes whose `ready_lease_expires_at` had already expired (`test/partition/consensus-recovery-service.test.js`).

4. **Rebalancer Terminal-Create Projection Resurrected Pre-Wipe Operations (`src/rebalancer/unified-rebalancer-replica-state.js`)**:
   - When a node restarted over a wiped data directory (`durableStateDetected: false`, fresh `NODES.created_at`) while cluster `REPLICA_OPERATIONS` retained prior completed `ADD`/`REPLACE` rows (`completed_at < NODES.created_at`), `projectPriorityTerminalCreateTargets` projected a phantom `ACTIVE` `FOLLOWER` replica from the pre-wipe operation whenever the `SERVICES` row was absent.
   - `isTerminalCreateSupersededByNodeRegistration` now checks `nodeCreatedAt > operationCompletedAt` so pre-wipe terminal operations cannot mask missing replicas on a freshly registered node incarnation.

---

## 2. Corrections to Evidence Claims (`formation-b-analysis.md`)

- **Retracted operation-ID attribution**: Earlier revisions of `formation-b-analysis.md` (§4 and §8) claimed that `c3ec15e6b` (`9e8a8950`) failed `g-projection-agrees-with-authority` (`2,817 ms > 2,500 ms` on `control_plane_publications-p1`) because `ledger_in_flight` changed operation IDs (`44fbdbf0` -> `4017bc26`) across rounds without resetting the disagreement timer.
- **Actual code behavior**: `checkProjectionAgreement` (`test/distributed/scenarios/fresh-formation-invariants.js`) keys `state.projectionDisagreementSince` solely by `partitionId` (`Set([partitionId])`) and never inspects `operation_id`. In `9e8a8950`, `control_plane_publications-p1` remained continuously in `ledger_in_flight` across 7 rounds (`t = 32,021 ms` to `t = 34,838 ms`).
- **Disposition**: `9e8a8950` (`c3ec15e6b`, composed on `527527c80`) remains an **unresolved failure of that earlier composition**. Service acceptance requires direct physical qualification of the integrated candidate (`origin/wip/integrated-candidate-20261115`) against the unchanged `g-projection-agrees-with-authority` predicate (`2,500 ms` bound).

---

## 3. Simulation Boundary for Controller-Convergence Recovery Proofs

In `test/convergence/formation-joint-admission-world.js`, `test/convergence/formation-joint-admission-rounds.js`, and `test/convergence/dt-formation-joint-admission-release-liveness.test.js`:
- **What is real**: `ControlPlaneReadinessService`, `NodeJoiningService`, `NodeLifecyclePublication`, `HeartbeatService`, `MembershipPublicationCoordinator`, `UnifiedRebalancer` (`MovePlanner`), `RebalanceCoordinator`, and `ReplicaDispatchService` all execute real production code against virtual time (`createWorldClock`) with zero timer/timeout expirations (`spentBounds = []`).
- **What is doubled**:
  1. **Consensus / Raft**: Simulated by `PARTITIONS.leader_node_id` and `SERVICES.raft_role` in the shared `SystemTableCache` (`reassignStoppedNodeLeadership` transfers non-seed partition leadership when a node stops).
  2. **Wiped-data-dir restart (`stopNode({wipeDataDir: true})`)**:
     - Cluster `REPLICA_OPERATIONS` rows are **never deleted** by `stopNode`; the real `RebalanceCoordinator` and `UnifiedRebalancer` (`isTerminalCreateSupersededByNodeRegistration`) reconcile prior operations.
     - Two explicit witnesses are verified in `joiner-restart-wiped-data-dir`:
       1. **External `SERVICES` cleanup witness (`markWipedReplicasFailed: false`)**: local replica state (`replicaRuntime.wipeNode`) and the wiped node's `SERVICES` rows are removed while `REPLICA_OPERATIONS` remains intact; `MovePlanner` plans fresh `ADD` operations (`addCompleted >= 6`) once the re-registered joiner (`durableStateDetected: false`, fresh `created_at` and rotated `boot_incarnation`) acquires its `READY` lease.
       2. **Local-disk-only wipe witness (`markWipedReplicasFailed: true`)**: neither `SERVICES` nor `REPLICA_OPERATIONS` rows are deleted from the cluster store; the wiped node's `SERVICES` rows remain in the store with `status = FAILED`, and the real `MovePlanner` + `RebalanceCoordinator` execute `REMOVE (reason: replica_failed)` followed by `ADD` (`removeCompleted >= 6`, `addCompleted >= 6`).
