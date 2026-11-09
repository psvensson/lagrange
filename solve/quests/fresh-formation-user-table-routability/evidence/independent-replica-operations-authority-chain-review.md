# Independent Verification Report: `replica_operations` Admission, Learner Promotion, and Terminal-Settlement Authority Chain Repair

- **Verdict**: `approve`
- **Verifier**: `subagent:b53f502d-cb6d-4d3b-b17c-9e51dbbbcf82`
- **Rule-Set Revision**: `5` (`AGENTS.md`, `docs/steering/rules.md`, `docs/steering/router.md`)
- **Worktree**: `/mnt/data/peter/projects/.worktrees/lagrange-composed-05-20261103`
- **Base Commit**: `a6cd65c37ba7fe3af76a8f068fb9f54188ca9fca`
- **Scope**: 23 modified files (`908 insertions(+), 162 deletions(-)`)

## 1. Verification of Claims & Implementation Changes

### A. Diagnostic Evidence Retention & Snapshot Provenance (`test/distributed/`)
- **`test/distributed/scenarios/fresh-formation-user-table-routability.js`**:
  - `scanNodeLogs(nodes, state, collector)` receives `cluster.getLogCollector()` and calls `collector.retainContainerLogLines(node.id, lines)` on the full `node.getLogs({rawBuffer: true})` output before container teardown.
- **`test/distributed/harness/log-collector.js` & `test/distributed/harness/__tests__/log-collector.test.js`**:
  - `retainContainerLogLines(nodeId, lines)` appends the full pre-teardown container logs (extracting embedded JSON `time`/`timestamp` via `resolveContainerLogTimestamp`) and records `nodeId` in `_retainedContainerNodeIds` so `collectContainerFallback` skips overwriting or duplicating retained nodes with a truncated `tail: 100` fallback at teardown.
  - Verified by the unit test `retainContainerLogLines preserves full pre-teardown logs and skips fallback tail truncation` in `test/distributed/harness/__tests__/log-collector.test.js`.
- **`test/distributed/harness/failure-bundle-playback-insights.js`, `test/distributed/harness/failure-bundle-scenario-log-artifacts.js`, `test/distributed/harness/failure-bundle-diagnostics-artifact-builder.js`, `test/distributed/harness/failure-bundle-formatting.js`, `test/distributed/harness/failure-bundle-triage-summary.js`, & `test/distributed/harness/__tests__/failure-bundle-priority-recovery-playback-evidence-test-cases.js`**:
  - `buildPlaybackControlPlaneFallback` computes `activeGateSnapshotStage` and `activeGateSnapshotHistorical` (`true` when `selectedActiveGateStage` is in `PLAYBACK_STARTUP_STAGE_IDS` and `latestEventTimestampMs > selectedActiveGateTimestampMs`), surfacing `Active Gate Snapshot Provenance: historical_startup` in both bundle JSON and Markdown outputs.
  - `collectTerminalPlaybackOperationIds` filters terminal `replica_operations` rows (`cancelled`, `completed`, `failed`, `removed`) from `buildPlaybackPriorityRecoveryDecisionSnapshots`, and `reconcilePlaybackDecisionSnapshotsWithStartupFallback` prunes terminal or superseded startup fallback snapshots so a completed startup `REPLACE` never masks a subsequent in-flight `ADD` or leaks stale cross-operation `admission` fields.
  - Verified by the unit witness `labels historical startup active-gate snapshots and replaces completed startup REPLACE with active ADD from playback snapshots`.

### B. Claim 1: Unify the 3 Copies of the 4-Way Readiness Chain & Remove Inert `ACTIVE` Default
- **`src/control-plane/priority-recovery-planning-answer-origin.js`**:
  - Exports canonical `hasPriorityRecoveryPlanningAnswerSync(readinessService)` and `readPriorityRecoveryPlanningAnswerSync(readinessService, nodeId, observedAt)`.
- **`src/partition/partition-service-learner-promotion-methods.js`, `src/rebalancer/replica-operation-repository-visibility-methods.js`, & `src/rebalancer/unified-rebalancer-available-nodes.js`**:
  - All three consumers now delegate to `readPriorityRecoveryPlanningAnswerSync` / `hasPriorityRecoveryPlanningAnswerSync`, eliminating the three duplicated 4-way method-resolution chains.
- **`src/partition/partition-service-learner-promotion-methods.js`**:
  - `getReplicaServiceStatusForPromotion(serviceRow)` now returns `serviceRow?.[COLUMN.STATUS] ?? null` (removing the inert `|| ReplicaStatus.ACTIVE` default), and `isLiveReplicaServiceRowForPromotion(serviceRow)` requires `status !== null` in compliance with R07.
  - Verified by unit assertions in `test/partition/learner-promotion-count-check-authorization-cases.js` and the updated read-order budget in `test/partition/learner-promotion-count-check-inputs.test.js`.

### C. Claim 2: Leadership-Change Hazard in Replica Admission (Uncommitted `ADMITTED` Latch)
- **`src/partition/partition-replica-admission.js`**:
  - `ADMITTING_ANSWERS` now contains only `REPLICA_ADMISSION_OUTCOME.ALREADY_MEMBER`.
  - Uncommitted outcomes (`UNCOMMITTED_ADMISSION_OUTCOMES`: `IN_FLIGHT`, `PROPOSED`) keep `request.state === 'pending'` until either a leader answers `ALREADY_MEMBER` or `isOwnCommittedVoter(this)` (`status.confState.voters` includes `status.peerId`) confirms local committed voter membership at the start of `driveReplicaAdmission()`.
- **Witnesses**:
  - Updated unit witnesses `(g)` and `(m)` plus new unit witness `(p)` (`leadership change after uncommitted PROPOSED or IN_FLIGHT re-drives to the new leader until ALREADY_MEMBER or local committed ConfState settles it`) in `test/partition/replica-admission-from-committed-operation.test.js`.
  - Updated real-port witnesses `A`, `C`, `D` plus new real-port witness `E` (`old leader accepts proposal (in_flight) while isolated from quorum and disappears before commit; a founder that was never asked becomes leader and the target re-drives admission to become a voter`) in `test/raft/raft-rs-backend/admission-stamp-reread-real-port.test.js`.

### D. Claim 3: Self-`ADD` Cutover & Terminal-Transition Circularity on `replica_operations-p1`
- **`src/partition/partition-service-raft-peer-cache-reconciliation.js`**:
  - `isClaimedFailedCreateServiceRow(serviceRow)` checks `serviceRow?.status === ReplicaStatus.FAILED && isFailedCreateCleanupToken(serviceRow?.cleanup_token)`.
  - `isExplicitPeerRetirement(operation, serviceRow)` includes `isClaimedFailedCreateServiceRow(serviceRow)` (while preserving the `GROUP_RETIREMENT_REASON` exclusion), retiring a claimed failed-create target whose runtime is already fenced and closed from the Raft group immediately rather than wedging `runParticipantCutover` (`WRITE_CUTOVER_PAUSED`) while the terminal `FAILED` transition write targets `replica_operations-p1`.
- **Witnesses**:
  - Positive (`cleanup_token: buildFailedCreateCleanupToken('op-failed-create-claim')`) and negative (`cleanup_token: null` returns `false`) real-port witnesses in `test/raft/raft-rs-backend/admission-redrive-chain.test.js`, plus updated `test/shards/subsystem-classes.json`.

### E. One-Way Ratchet Tightening (`scripts/check-complexity.js` & `scripts/check-duplication.js`)
- `scripts/check-complexity.js`: `BASELINE_COUNT` tightened `1719 -> 1718`.
- `scripts/check-duplication.js`: `test` clone groups / duplicated lines tightened `632 / 23837 -> 630 / 23777`.

## 2. Rule Compliance (R01-R27)

- **R02 / R07 / R09 (Single authoritative path, named state, no silent fallback defaults)**: Malformed/missing service status no longer defaults to `ReplicaStatus.ACTIVE`; uncommitted Raft admission outcomes (`PROPOSED`, `IN_FLIGHT`) no longer latch `ADMITTED` before `ConfChange` commit; peer retirement for claimed failed-create rows requires an operation-bound `isFailedCreateCleanupToken(serviceRow?.cleanup_token)`.
- **R16 / R19 (Positive and negative witnesses, ratchet discipline)**: All three claims and the diagnostic harness changes are covered by unit and real-port positive/negative witnesses, and both complexity and duplication ratchets were tightened downward.
