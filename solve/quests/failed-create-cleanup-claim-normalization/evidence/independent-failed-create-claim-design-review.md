# Independent Design Review for `failed-create-cleanup-claim-normalization`

## 1. Review Scope and Metadata

- **Verifier**: `subagent:b53f502d-cb6d-4d3b-b17c-9e51dbbbcf82`
- **Rule-Set Revision**: `5` (`AGENTS.md`, `docs/steering/rules.md`, `docs/steering/router.md`)
- **Worktree**: `/mnt/data/peter/projects/.worktrees/lagrange-composed-05-20261103`
- **Source Commit (`HEAD`)**: `ad0d64de8cfc06b574b0589f33985d4be1f3a4d0`
- **Target Quest**: `failed-create-cleanup-claim-normalization` (`class: "fix"`, `epic: "operation-integrity-and-reliable-formation"`)
- **Verdict**: **APPROVE**

## 2. Verified Input Files and SHA-256 Hashes

| File | SHA-256 | Role Verified |
| --- | --- | --- |
| `src/constants/messages.js` | `5c26e12359b9ca08ff0b72ba33e6144b2aa10aaeb463e36a581234f1c270a80b` | Canonical `MESSAGE_TYPE` registry |
| `src/rebalancer/replica-operation-constants.js` | `bd97f38e67a482ba811f39e42bc64f2518a7738d873ae2c520b391f1e22b7e5b` | `ReplicaOperationMessageType` and `ReplicaOperationField` definitions |
| `src/rebalancer/failed-create-cleanup-token.js` | `f362fdd3c3ada4b916d4205815e3381c01e788c920b049510843a0ddbfa2fb9e` | `buildFailedCreateCleanupToken`, `isFailedCreateCleanupToken`, `isUnclaimedPreRuntimeFailedCreateRow` |
| `src/node/replica-handler-remove-request-methods.js` | `7df0e407042ab133c5bc67da8135d0de73b2691a33f12bd66a77c3e582eda7b4` | `hasValidFailedCreateCleanupPrecondition` (`:35-43`) and `admitFailedCreateTargetCleanup` (`:204-248`) |
| `src/rebalancer/operation-workflow-replace-terminal-admission.js` | `41f92c6043fcb55e0f6118185be6b34e3d92d67f66eeaab8bcf2fe2ec77f4e37` | `matchesFailedCreatePreconditionTokens` (`:75-89`), `matchesDelayedFailedCreateTargetPrecondition` (`:242-263`), `decideFailedCreateTargetCleanup` (`:274-308`), `admitCreateTerminalFailure` (`:318-334`) |
| `src/rebalancer/operation-workflow-terminal-transition-repair.js` | `ebfa7dce27ef2436670a9998d53d7f858611f8db7ec12b5a3dd2294486c63ae5` | `isTerminalFailedCreateCleanupRemove` (`:54-65`) |
| `src/rebalancer/unified-rebalancer-failed-create-cleanup.js` | `f6f57f92196255bf2d25a5285dae5753222551236d5fb925ea62e72c5aaf6528` | `refreshFailedCreateTargetCleanupDecisions` (`:41-83`) |
| `src/node/replica-handler-lifecycle-methods.js` | `05209ca9ae26dd52330961285bc55a1eab0a4f038349624b6691d983d2275d0b` | `dispatchReplicaMessage` (`:52-72`) |
| `src/node/replica-handler-failed-create-publication.js` | `2a78bf77d7d15fe439db4125d8d301de6c69ec70d5af2858e3d6e301ad6219c9` | Authoritative `FAILED` publication helper module |
| `src/node/replica-handler-create-admission-methods.js` | `baaf184c51af1e060aaa6ae7c0fda3202d8658138834e5d21fc1e9a6dd0a7f2f` | `terminalFailedCreateResponse` (`:465-483`) and `reconcileCreateAdmissionLifecycle` (`:252-304`) |
| `src/node/replica-handler-create-status-methods.js` | `7e1daa9de179e8f31fab8da6fe8c83dcb3ae1ff4ea4bec62067f5821bd3650c6` | `persistOrConfirmReplicaCreateFailed` (`:187-239`) |
| `src/node/replica-create-admission-retained-recovery.js` | `07592ce9fb4aaa461f58c5da177ad1c81670b9d8dd33b23f9295b42e07748643` | `recoverRetainedCreateAdmissionRow` (`:201-241`) |
| `src/node/replica-state-machine-failed-create-claim.js` | `c3804ae501b221e7f11891b74ee5dc09cb0f6f8c2dd225200e70749a61ff0a2a` | `claimFailedCreateCleanup` (`:43-123`) |
| `test/node/replica-failed-create-cleanup-generation.test.js` | `f57b1e7b7265c6a2494f630aa7bf1d8b94e94a31af3974d3ed44e4621bee8a1e` | Subtest 3 (`unclaimed FAILED evidence cannot authorize destructive cleanup`, `:199-234`) |
| `test/rebalancer/terminal-failed-add-target-cleanup.test.js` | `0aff1be85e4e587b12f1a7f7009d13cea601e0cd214279d04c4b28d1b46f39b2` | Terminal failed `ADD`/`REPLACE` cleanup and L3 unclaimed/delayed tests (`:1008-1227`) |
| `test/rebalancer/test-helpers.js` | `6cc7add7e91980d84d2268420602a63d93a3efe530e4c3f385dce5bf2e286dad` | `withFixtureReplaceWitness` (`:538-552`) and `createTestCoordinator` (`:669-1112`) |
| `test-output/verification-20261106-partition-target/independent-readiness-cleanup-design-review.md` | `0206272720dacb4325d11efd85bc529d18c380c2607f34290ee8fe0a7116b6ac` | Section 4 failed-create cleanup design hold criteria |

## 3. Verification Against Prior Design Hold Criteria

### 3.1 Strict Non-Null `cleanup_token` for Destructive Cleanup and Release Classification
- `src/node/replica-handler-remove-request-methods.js:35-43`: Restoring `hasValidFailedCreateCleanupPrecondition` to require `isFailedCreateCleanupToken(precondition.cleanup_token)` (and rejecting `precondition.cleanup_token === null`) ensures `ReplicaHandler` refuses any destructive `REMOVE_REPLICA` carrying an unclaimed `FAILED` precondition, restoring `test/node/replica-failed-create-cleanup-generation.test.js:199-234` to green.
- `src/rebalancer/operation-workflow-replace-terminal-admission.js:75-89,242-263`: Restoring `matchesFailedCreatePreconditionTokens` to require `precondition.cleanup_token === cleanupToken` and `matchesDelayedFailedCreateTargetPrecondition` to require `lifecyclePrecondition.cleanup_token === expectedCleanupToken` and `lifecyclePrecondition.create_attempt_token === operation.createAdmissionAttemptToken` (plus `created_at` match when `Number.isSafeInteger(operation.createAdmissionReplicaCreatedAt)`) prevents any unclaimed `FAILED` row from being classified as eligible for destructive `REMOVE` planning.
- `src/rebalancer/operation-workflow-terminal-transition-repair.js:54-65`: Restoring `isTerminalFailedCreateCleanupRemove` to require `isFailedCreateCleanupToken(precondition?.cleanup_token)` ensures terminal cleanup release repair never dispatches a tokenless `FAILED_CREATE_TARGET_LIFECYCLE_PRECONDITION`.

### 3.2 Separation of Live Pre-Runtime Retry, Terminal Settlement, and Claim Normalization
- **Live pre-runtime retry preserved**: `isUnclaimedPreRuntimeFailedCreateRow` (`src/rebalancer/failed-create-cleanup-token.js:39-53`) and its in-flight observation/reconcile callers remain intact so an in-flight `CREATE` can retry pre-sync when an earlier attempt left an unclaimed pre-runtime `FAILED` row (`cleanup_token === null`, `previousState` in `{pending, creating}`).
- **Ordinary terminal settlement preserved**: `admitCreateTerminalFailure` (`src/rebalancer/operation-workflow-replace-terminal-admission.js:318-334`) never blocks `failOperation` on claim availability and only records `FAILED_CREATE_TARGET_LIFECYCLE_PRECONDITION` in `stepMetadata` when `captureFailedCreateTargetCleanupClaim` observes a `FAILED` row already bearing `cleanup_token === buildFailedCreateCleanupToken(operation.operationId)`.
- **Explicit claim normalization before cleanup/release**:
  - When a create operation is durably terminal `FAILED` in `REPLICA_OPERATIONS` (`completed_at != null`, `workflow_step === WORKFLOW_STEP.FAILED`, `status === ReplicaStatus.FAILED`) and its target `SERVICES` row is still unclaimed `FAILED` (`cleanup_token === null`, `previousState !== ReplicaStatus.ACTIVE`) with matching `create_attempt_token` (and `created_at` when finite), the participant (`ReplicaHandler`) normalizes the row through `ReplicaStateMachine.claimFailedCreateCleanup(precondition, buildFailedCreateCleanupToken(operationId))` inside `replicaCreateAdmissionOwner.runExclusive(operationId, ...)`.
  - `ReplicaStateMachine.claimFailedCreateCleanup` (`src/node/replica-state-machine-failed-create-claim.js:43-123`) serializes in the per-replica mutation lane, performs an exact-predicate CAS on `TABLES.SERVICES` setting `cleanup_token = "failed-create:<operationId>"` and advancing `state_entered_at` and `updated_at`, and closes `restartFailedCreate` (`src/node/replica-state-machine.js:351-357`).
  - Only after re-observation confirms `cleanup_token === buildFailedCreateCleanupToken(operation.operationId)` does `decideFailedCreateTargetCleanup` persist and return the claimed 11-field `lifecyclePrecondition` for `MovePlanner` `REMOVE` planning. If normalization or re-observation does not confirm the claim, `decideFailedCreateTargetCleanup` returns `INELIGIBLE` (deferring cleanup without ever emitting a `cleanup_token: null` precondition).
- **Dispatch census invariant preserved**: Using `owner.messageRouter.deliver(`${operation.targetNodeId}/service/${handlerType}`, ...)` for `CLAIM_FAILED_CREATE_CLEANUP` matches `deliverToReplaceWitness` (`src/rebalancer/operation-workflow-replace-witness.js:170`) and preserves the exact 2-call-site census on `deliverReplicaOperationRequest` enforced by `scripts/check-operation-dispatch-completion-owner.js:309-316`.

## 4. Implementation Precision Notes

1. **Message type constant locations**: Add `CLAIM_FAILED_CREATE_CLEANUP: 'CLAIM_FAILED_CREATE_CLEANUP'` to `MESSAGE_TYPE` in `src/constants/messages.js` and `CLAIM_FAILED_CREATE_CLEANUP: MESSAGE_TYPE.CLAIM_FAILED_CREATE_CLEANUP` to `ReplicaOperationMessageType` in `src/rebalancer/replica-operation-constants.js`.
2. **Precondition identity validation in `ReplicaHandler`**: Validate `precondition.service_id === replicaId`, `precondition.replica_id === replicaId`, `precondition.partition_id === partitionId`, `precondition.node_id === this.nodeId`, and `precondition.service_type === REPLICA_HANDLER_SERVICE.TYPE` (`'partition'`), matching `validFailedCreateCleanupRequest` (`src/node/replica-handler-remove-request-methods.js:89-94`).
3. **Same-cycle claim population in `refreshFailedCreateTargetCleanupDecisions` (`src/rebalancer/unified-rebalancer-failed-create-cleanup.js:52-78`)**: Await `decideFailedCreateTargetCleanup` before reading `claimedPrecondition` (or include `decision.lifecyclePrecondition` in `terminalClaims` when `decideFailedCreateTargetCleanup` normalizes an unclaimed row) so `getTerminalFailedCreateTargetClaims(targetReplicaId)` is populated on the same refresh cycle.
4. **R09 update of `test/rebalancer/terminal-failed-add-target-cleanup.test.js:1115-1133`**: Update the assertion added in `74ca864b84e00ac61484dec6e89502444b82cd36` so that `failOperation` on an unclaimed `FAILED` row does not store `cleanup_token: null` in `stepsHistory`, and `refreshFailedCreateTargetCleanupDecisions()` normalizes the row via `CLAIM_FAILED_CREATE_CLEANUP` to `cleanup_token: buildFailedCreateCleanupToken(replaceOp.operationId)` before admitting cleanup.

## 5. Conclusion

The proposed design for `failed-create-cleanup-claim-normalization` satisfies all owner-boundary, fail-closed, serialization, and R09 requirements. **APPROVE**.
