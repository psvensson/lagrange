---
audience: development
documentClass: evidence
---

# Ratchet reds on the rs-raft lineage: investigation (2026-10-24)

Read-only. (While this ran, the branch advanced to 8c51246e2 with four docs-only commits; src/, test/ and scripts/ are unchanged, so these results hold there too.) Tree: `/mnt/data/peter/projects/.worktrees/mg-delivery-resume-r2-20261023` at ade2c356f. Its JS under src/ and test/ is byte-equal to bed8c6354; the only src/test difference is four test/shards/*.json files. Every checker ran from a `git archive` copy under `trees/` in this directory, with the node_modules symlink pointing at the primary checkout's node_modules, the same target the worktree uses. Nothing was written to the worktree. Each run was gated on the thermal check.

## 0. Results and method

| Ratchet | HEAD | Baseline (where it was set) | Baseline tree measures | Excess |
|---|---|---|---|---|
| complexity (src+test, threshold 12) | **1805** | 1755 (scripts/check-complexity.js:108, set at 04d49d61f, 2026-10-07) | 1755 at 04d49d61f (exact) | +50 = 73 new - 23 gone |
| unused exports (knip) | **1448** | 1416 (scripts/check-unused-exports.js:52, set at 135279070, 2026-10-07) | 1416 at 135279070 (exact) | +32 = 44 new - 12 gone |
| duplication [test] | **701 / 26618** | 697 / 26369 (scripts/check-duplication.js:232-233, lines set at bb3ed72d0, groups at bb3758f7b) | 697 / 26385 at bb3758f7b | +4 groups = 9 new - 5 gone; +249 lines |
| duplication [src+scripts] | 46/1439 OK | 47/1462 | - | the checker prints a tighten hint, 47/1462 -> 46/1439 |
| **cognitive complexity (not on the lead's list)** | **153 > 152 RED** | 152 (scripts/check-cognitive-complexity.js:43, set at 9ae792405) | 152 at 9ae792405; already **153 at 04d49d61f** | +1 (see section 5) |

The cognitive checker runs inside `test:metrics`, which `test:static` calls, so it is a fourth landing blocker.

Every baseline is a count with no allowlist, so "not in the baseline" here means "present at HEAD and absent from the tree where the baseline was set". Matching rules:
- Complexity: matched by (file, function name).
- Unused exports: matched by (file, symbol).
- Duplication: matched by file pair.

Introducing commits were found as follows:
- Complexity: each touching commit in BASE..HEAD was re-linted in topo order with the same ESLint config. The commit named is the first one where that function crossed the threshold (tools/cx-attrib.mjs).
- Exports: the first commit where the symbol is exported (tools/ux-attrib.sh).
- Clones: the add commit plus blame of the cloned ranges.

Two complexity pairs are renames, not new debt:
- `executeSelect` (35) became `executeSelectOwned` (34) in sql-query-engine-select-execution.js.
- `initialize` (28) became `initializeUnserialized` (31, 1952cd4b2) in partition-service-raft-init-base.js.

Raw outputs are in this directory: head-*.txt, cxbase-*.txt, duptestbase-dup.txt, cx-diff.txt, cx-attrib.txt, ux-attrib.tsv, ux-importers.tsv, dup-diff.txt.

**The dominant source is a single commit: 4151a3ab4** (2026-10-12, "Ephemeral exact-byte proof snapshot only; not reviewed or landed"). It touches 1338 files with +341,908 lines and sits on the lineage's first-parent chain. It accounts for 25 of the 73 new complexity violations and 17 of the 44 new unused exports. By file domain and by the quest-log references, its src content belongs to the TX1 / participant-release work: replicated-transaction-decision-and-apply and participant-release-owner-cycle-removal. That quest attribution is inferred, not stated in the commit.

Most of the rest are WIP commits made with pre-commit skipped (`wip(...)`, `WIP ...`). This explains how three of the ratchets drifted unseen.

**None of the excess sits in the C1 or C2 files.**
- None of these appears in any complexity or unused-export delta: message-group-service-cdc-propagation-runtime-methods.js, message-group-cdc-committed-acceptance.js, message-group-service-cdc-replication-runtime-methods.js, message-group-forwarding-owner-native-delivery-methods.js, message-group-forwarding-owner-delivery-methods.js, transport-semantic-outcome.js.
- transport-semantic-outcome.js actually improved: `ROUTER_CONNECTION_CLOSED_ERROR_CODE` gained an importer.
- The only contact with the delivery stream is 681da1dc1 ("wip: preserve rs-raft delivery draft at user stop", 2026-10-23). It adds one cognitive violation in src/message-group/message-group-forwarding-owner.js:258 and one unused test export, `delayedTimerClock`.
- scripts/checks/git-invocation.js (tooling branch) does not exist at HEAD.
- scripts/solve/evidence-store.js (relocation quest) contributes nothing.
- scripts/ is outside the complexity and cognitive targets. It is inside knip and the src+scripts duplication target, which has headroom.

## 1. Complexity: the 73 new over-threshold functions (net +50)

Columns: location at HEAD, score, function, first commit in 04d49d61f..HEAD where it went over 12.

| file:line | score | function | introducing commit |
|---|---|---|---|
| src/bootstrap/rejoin-hints.js:438 | 14 | Function 'resolveAutoRejoinDecisionState' | e167780c3  |
| src/bootstrap/seed-original-allocation-declaration.js:90 | 18 | Function 'assertPlainDeclarationData' | 65f4b0b6a  |
| src/bootstrap/seed-original-allocation-declaration.js:112 | 21 | Function 'validateOriginalSeedDeclaration' | 8b3638233  |
| src/bootstrap/seed-original-allocation-declaration.js:140 | 13 | Function 'validateMember' | 65f4b0b6a  |
| src/control-plane/replica-dispatch-service.js:47 | 18 | Async method 'authorizeLegacyRuntimeRemoval' | 78b0364e6  |
| src/node/replica-handler-participant-release.js:272 | 28 | Function 'observationStatusDisposition' | 686878db6  |
| src/node/replica-runtime-cleanup-custody.js:71 | 14 | Async function 'fenceFailedReplicaCreateRuntime' | 48f15d953  |
| src/node/runtime-service-bound-creation-route.js:122 | 14 | Function 'writesMemo' | 9514ba8bf  |
| src/node/runtime-service-bound-creation-route.js:267 | 19 | Async function 'routeRuntimeServiceCreate' | 9514ba8bf  |
| src/node/runtime-service-bound-creation-route.js:416 | 16 | Function 'creationWakeAction' | 9514ba8bf  |
| src/node/runtime-service-bound-creation-route.js:465 | 14 | Function 'resumeHeldMemoWake' | 9514ba8bf  |
| src/node/runtime-service-bound-creation-route.js:481 | 17 | Function 'decideRetirement' | 9514ba8bf  |
| src/node/runtime-service-bound-creation-route.js:571 | 15 | Function 'settleRemoval' | 9514ba8bf  |
| src/node/runtime-service-handler.js:74 | 13 | Constructor | 78b0364e6  |
| src/node/runtime-service-handler.js:189 | 19 | Async method 'handleCreateReplica' | 9514ba8bf  |
| src/node/runtime-service-handler.js:413 | 15 | Method 'recoverLocalReplicaForRemoval' | 5ce738450  |
| src/partition/partition-coordinator-settlement-command.js:18 | 13 | Function 'isPinnedCoordinatorSettlementCommand' | 4151a3ab4  |
| src/partition/partition-participant-release-contract.js:38 | 19 | Function 'transactionReleaseProofValid' | 4151a3ab4  |
| src/partition/partition-participant-release-contract.js:122 | 33 | Function 'releaseFactsDefect' | 4151a3ab4  |
| src/partition/partition-participant-release-contract.js:158 | 35 | Function 'releaseCensusDefect' | 4151a3ab4  |
| src/partition/partition-participant-transaction-pause.js:131 | 15 | Async function 'readParticipantReleaseFactsAssessment' | 65530bf83  |
| src/partition/partition-participant-transaction-topology-fence.js:70 | 16 | Function 'topologyTransitionOf' | 4151a3ab4  |
| src/partition/partition-service-raft-init-base.js:305 | 31 | Async method 'initializeUnserialized' | 1952cd4b2  |
| src/query/distributed/distributed-transaction-coordinator.js:283 | 19 | Async method 'registerUniqueTransaction' | 4151a3ab4  |
| src/query/distributed/distributed-transaction-recovery-authority.js:31 | 14 | Arrow function | 4151a3ab4  |
| src/query/distributed/distributed-transaction-recovery-authority.js:52 | 28 | Function 'authorityCandidate' | 4151a3ab4  |
| src/query/distributed/distributed-transaction-recovery-authority.js:80 | 13 | Async function 'refreshRecoveryAuthority' | 4151a3ab4  |
| src/query/distributed/distributed-transaction-recovery-authority.js:102 | 15 | Async function 'redriveAuthoritativeRecovery' | 4151a3ab4  |
| src/query/distributed/distributed-transaction-recovery.js:143 | 13 | Async method 'resumeRecoveredTransactions' | 4151a3ab4  |
| src/query/distributed/distributed-transaction-recovery.js:492 | 13 | Method 'loadWorkflow' | 4151a3ab4  |
| src/query/distributed/distributed-transaction-release-census.js:29 | 13 | Function 'readTransactionReleaseCensus' | 4151a3ab4  |
| src/query/distributed/distributed-transaction-release-settlement.js:52 | 30 | Function 'releaseRowOf' | 4151a3ab4  |
| src/query/distributed/distributed-transaction-release-settlement.js:206 | 14 | Async function 'settleTransactionReleaseRows' | 4151a3ab4  |
| src/query/distributed/distributed-transaction-release-settlement.js:222 | 14 | Function 'transactionReleaseProofOf' | 4151a3ab4  |
| src/query/distributed/distributed-transaction-settlement.js:52 | 14 | Function 'canonicalRecordedResult' | 4151a3ab4  |
| src/query/distributed/distributed-transaction-settlement.js:75 | 20 | Function 'canonicalTransactionSettlementResult' | 4151a3ab4  |
| src/query/distributed/distributed-transaction-settlement.js:98 | 19 | Function 'canonicalTransactionSettlement' | 4151a3ab4  |
| src/query/distributed/distributed-transaction-settlement.js:143 | 28 | Function 'validateTransactionSettlement' | 4151a3ab4  |
| src/query/sql-query-engine-participant-wire.js:264 | 19 | Function 'rolledBackAnswerOf' | 4151a3ab4  |
| src/query/sql-query-engine-select-execution.js:275 | 34 | Async method 'executeSelectOwned' | 4151a3ab4  |
| src/raft/raft-rs-operation-port.js:182 | 13 | Function 'createRaftRsOperationPort' | 7766ccafb  |
| src/raft/raft-rs-original-allocation-preparation.js:410 | 28 | Private method #validateMemberOpening | 4512b564c  |
| src/raft/raft-rs-replica-lifecycle-owner.js:390 | 15 | Function 'snapshotReceiverRow' | 7d91de9ff  |
| src/raft/raft-rs-runtime-owner.js:342 | 14 | Function 'invokeCore' | dca0d4f2f  |
| src/raft/raft-rs-runtime-owner.js:726 | 30 | Function 'replaceRuntime' | dca0d4f2f  |
| src/rebalancer/replica-operation-message-group-membership-owner-claim.js:161 | 17 | Async function 'claimMessageGroupMembershipOwner' | 91ed3358f  |
| src/rebalancer/replica-operation-message-group-membership-owner-claim.js:215 | 18 | Async function 'settleMessageGroupMembershipNonAdmission' | 8d57e4093  |
| src/service/service-lifecycle-manager.js:532 | 19 | Async method '_readRecoverableOperations' | ed6b3c5a3  |
| src/wasm-service/wasm-service-lifecycle.js:220 | 16 | Method 'createReplica' | 9514ba8bf  |
| src/wasm-service/wasm-service-lifecycle.js:341 | 13 | Async method 'startReplica' | 9514ba8bf  |
| src/wasm-service/wasm-writer-client.js:20 | 20 | Function 'validateCallerRecord' | 9b53962f2  |
| src/wasm-service/wasm-writer-completion.js:20 | 19 | Method 'submit' | 9b53962f2  |
| src/wasm-service/wasm-writer-state.js:51 | 18 | Function 'validateSlot' | 9b53962f2  |
| src/wasm-service/wasm-writer-state.js:141 | 13 | Method 'classify' | c090b63b2  |
| test/integration/message-group-membership-claim-cache.integration.test.js:98 | 15 | Function 'membershipTraceOf' | 77e091f64  |
| test/integration/message-group-membership-claim-cache.integration.test.js:145 | 17 | Function 'requestTraceOf' | 77e091f64  |
| test/integration/message-group-membership-claim-cache.integration.test.js:160 | 17 | Function 'releaseAnswerTraceOf' | 77e091f64  |
| test/integration/message-group-membership-claim-cache.integration.test.js:220 | 13 | Arrow function | 77e091f64  |
| test/integration/message-group-membership-claim-cache.integration.test.js:530 | 24 | Async arrow function | 77e091f64  |
| test/integration/seed-migration-cutover-persisted.integration.test.js:105 | 31 | Async arrow function | 4151a3ab4  |
| test/integration/transaction-coordinator-restart.integration.test.js:117 | 14 | Async arrow function | 4151a3ab4  |
| test/message-group/message-group-native-custody-fixture.js:37 | 13 | Async function 'pump' | 5a3cdc718  |
| test/model/participant-release-disposition/model.js:358 | 24 | Method 'applyReleaseDecision' | bde70cec7  |
| test/model/participant-release-disposition/model.js:459 | 13 | Method 'applyReleaseHold' | bde70cec7  |
| test/model/participant-release-disposition/model.js:523 | 13 | Method 'applyOtherRev2' | bde70cec7  |
| test/model/participant-release-disposition/model.js:585 | 22 | Method 'applyOtherRev3' | bde70cec7  |
| test/node/replica-handler-release-recovery.test.js:78 | 14 | Async function 'withActualHandler' | ffbf422aa  |
| test/partition/participant-origin-retained-history.integration.test.js:245 | 17 | Function | cb822d6fc  |
| test/partition/participant-release-native-exit-diagnostic.js:20 | 14 | Arrow function | 04ec9517c  |
| test/partition/partition-tx1-single-path-alpha.test.js:350 | 13 | Async arrow function | d35d8828c  |
| test/partition/partition-tx1-single-path-alpha.test.js:409 | 15 | Async arrow function | d35d8828c  |
| test/raft/raft-rs-backend/lifecycle-retirement-census.js:79 | 15 | Arrow function | 8e2013c27  |
| test/raft/raft-rs-backend/transaction-leg-a-three-replica.test.js:82 | 14 | Arrow function | 4151a3ab4  |

Commit subjects, with the quest inferred from quest-log references:

| commit | quest | subject |
|---|---|---|
| 4151a3ab4 | TX1 (replicated-transaction-decision-and-apply / participant-release-*) | Ephemeral exact-byte proof snapshot only; not reviewed or landed |
| 9514ba8bf, 78b0364e6, 5ce738450, ed6b3c5a3, e167780c3, 1952cd4b2, 48f15d953 | wasm-creation-genesis (U1) | wip(rs-raft[ U1]): ... / WIP ... |
| 9b53962f2, c090b63b2 | wasm-writer-slots-v1 / wasm-creation-genesis | wip(wasm): freeze incomplete v1 source at creation-origin HOLD / WIP: connect bound INIT ... |
| 65f4b0b6a, 8b3638233, 4512b564c, 7766ccafb, cb822d6fc | retained-seed-original-handoff | WIP: preserve ... / feat(raft): preserve original-allocation native-opening boundary / fix(raft): revalidate original authority ... |
| dca0d4f2f, 7d91de9ff | replicated-transaction-decision-and-apply (shared-runtime repair) / snapshot-receiver-admission | WIP rs-raft: fence complete shared replacement ... / WIP snapshot receiver ... |
| 686878db6, 65530bf83, ffbf422aa, 04ec9517c | participant-release / OBS work (no quest log names 686878db6, 65530bf83 or ffbf422aa: unknown) | WIP rs-raft: ... |
| 91ed3358f, 8d57e4093 | message-group-fresh-identity-membership | WIP FreshMG: ... |
| 77e091f64 | seed-participant-release-native-startup-census / participant-release-owner-cycle-removal | WIP: preserve native startup census ... |
| bde70cec7 | seed-control-current-proof-amortization (design model) | design: release-linearization transition-model addendum ... |
| d35d8828c | TX1 deletion | WIP: remove legacy transaction engine; retain rs-raft recovery HOLD |
| 5a3cdc718, 8e2013c27 | runtime-ordering-completion-consumer-proof / unknown | test(raft): ... |

Count by commit: 4151a3ab4 25, 9514ba8bf 9, 77e091f64 5, bde70cec7 4, 9b53962f2 3, and 1 or 2 for each of the rest.

Split: src has 54 new and 20 gone (net +34). test has 19 new and 3 gone (net +16).

## 2. Unused exports: the 44 new (net +32)

Importers were checked by searching for imports that name both the symbol and the module basename (ux-importers.tsv). Every hit that search returned was a local identifier with the same name, not an import. Tests are knip entries (knip.json), so any test import would already count as a use.

| file | symbol | introducing commit | importer |
|---|---|---|---|
| src/bootstrap/replica-operation-message-group-membership-schema-constants.js | `REPLICA_OPERATION_MESSAGE_GROUP_MEMBERSHIP_COLUMN` | 0b205d0d2 | no importer |
| src/cdc/cdc-source-scope-evidence.js | `sourceScopeMatchesService` | 4151a3ab4 | no importer |
| src/node/participant-release-authorization-owner.js | `PARTICIPANT_RELEASE_AUTHORIZATION_KIND` | 4151a3ab4 | no importer |
| src/node/replica-create-process-owner.js | `claimReplicaCreatePhysicalWorker` | 00de0443e | no importer |
| src/node/replica-create-process-owner.js | `replicaCreatePhysicalWorkerEvidence` | d7e9ab0ef | no importer |
| src/node/replica-create-process-owner.js | `runReplicaCreatePhysicalCommit` | d7e9ab0ef | no importer |
| src/node/runtime-service-bound-creation-route.js | `BOUND_DECISION` | a251ce4fd | no importer |
| src/node/runtime-service-bound-creation-route.js | `decideBoundRemoval` | a251ce4fd | no importer |
| src/node/runtime-service-bound-creation-route.js | `refuseForeignCreation` | 381750de2 | no importer |
| src/node/runtime-service-bound-creation-route.js | `replyToRetainedMemo` | 381750de2 | no importer |
| src/partition/managed-source-replication-start-delivery.js | `requireProcessedSourceReplicationStart` | c280049f7 | no importer |
| src/partition/partition-cdc-obligation.js | `proposeCdcAcknowledgement` | 4151a3ab4 | no importer |
| src/partition/partition-cdc-obligation-ledger.js | `acknowledgementEntryIdOf` | 4151a3ab4 | no importer |
| src/partition/partition-consensus-port-opening.js | `consensusInitRefusedError` | exported at base; importer removed (see note) | no importer |
| src/partition/partition-participant-release-contract.js | `releaseFactsDefect` | 4151a3ab4 | no importer |
| src/query/distributed/distributed-transaction-coordinator-constants.js | `RECOVERY_ROLLBACK_TRANSACTION_STATUS` | exported at base; importer removed (see note) | no importer |
| src/query/distributed/distributed-transaction-participant-admission.js | `COORDINATOR_PARTICIPANT_REFUSAL_CODE` | 4151a3ab4 | no importer |
| src/query/distributed/distributed-transaction-participant-set.js | `participantSetTextOf` | 4151a3ab4 | re-export; importers use the manifest module |
| src/query/distributed/distributed-transaction-prepare-evidence.js | `isPositiveSafeInteger` | 4151a3ab4 | no importer |
| src/query/distributed/distributed-transaction-recovery-validation.js | `validateRecoveredTransactionDecision` | 4151a3ab4 | no import; a source-text regex test names it (see 4) |
| src/query/distributed/distributed-transaction-recovery-validation.js | `validateRecoveryRowsBeforeMutation` | 4151a3ab4 | no importer |
| src/query/distributed/distributed-transaction-release-census.js | `TRANSACTION_RELEASE_SCHEMA_VERSION` | 4151a3ab4 | no importer |
| src/query/distributed/distributed-transaction-release-census.js | `TRANSACTION_RELEASE_SEMANTIC_VERSION` | 4151a3ab4 | no importer |
| src/query/distributed/distributed-transaction-schema-enforcement.js | `TRANSACTION_SCHEMA_ENFORCEMENT_VERSION` | 4151a3ab4 | no importer |
| src/query/distributed/distributed-transaction-settlement.js | `TRANSACTION_SETTLEMENT_REASON` | 4151a3ab4 | no importer |
| src/query/distributed/distributed-transaction-settlement.js | `validateTransactionSettlement` | 4151a3ab4 | no importer |
| src/raft/raft-rs-committed-membership-context.js | `COMMITTED_MEMBERSHIP_CONTEXT_ERROR` | d22c39192 | no importer |
| src/raft/raft-rs-committed-membership-context.js | `promotionAdmissionMatchesReservation` | 4151a3ab4 | no importer |
| src/raft/raft-rs-original-allocation-preparation.js | `verifyMemberBinding` | 8b3638233 | no importer |
| src/raft/raft-rs-original-allocation-store.js | `exactLifecycleRow` | 8b3638233 | no importer |
| src/rebalancer/replica-operation-message-group-membership-permit.js | `MEMBERSHIP_BRANCH` | 4151a3ab4 | no importer |
| src/wasm-service/wasm-writer-state.js | `recorded` | 9b53962f2 | no importer |
| test/model/participant-release-disposition/model.js | `identityValid` | bde70cec7 | no importer |
| test/model/participant-release-disposition/model.js | `INVARIANT_IDS` | bde70cec7 | no importer |
| test/model/participant-release-disposition/model.js | `Replica` | bde70cec7 | no importer |
| test/model/participant-release-disposition/model.js | `RETENTION_BOUND` | bde70cec7 | no importer |
| test/raft/raft-rs-backend/opening-history-native-fixture.js | `historyRequest` | 7e2c3e851 | no importer |
| test/test-helpers/message-router-cdc-fixture.js | `delayedTimerClock` | 681da1dc1 | no importer |
| test/test-helpers/participant-release-protocol-fixture.js | `CONTROL_NODE` | 0e9ff4fdc | no importer |
| test/test-helpers/participant-release-protocol-fixture.js | `TABLE` | 0e9ff4fdc | no importer |
| test/test-helpers/participant-transaction-fixture.js | `ROWID_CEILING` | 4119114d7 | no importer |
| test/test-helpers/participant-transaction-fixture.js | `SESSION` | f9bcfe493 | no importer |
| test/wasm-service/bound-remove-physical-operation-fixture.js | `physical` | 32dfdc388 | no importer |
| test/wasm-service/wasm-creation-bound-native-fixture.js | `views` | 45293b471 | no importer |

Two items were exported at the baseline and lost their last importer on the lineage:
- `consensusInitRefusedError` (src/partition/partition-consensus-port-opening.js:25,78). The wasm and message-group ports stopped importing it in e2c7435b7 and 48f15d953 (2026-10-12, "WIP startup cleanup" / "WIP cleanup: reconcile exact service releases"). Each now defines a private copy: src/wasm-service/wasm-service-consensus-port.js:99 and src/message-group/message-group-consensus-port.js:47. That is three implementations of one refusal error, which is systemic duplication.
- `RECOVERY_ROLLBACK_TRANSACTION_STATUS` (src/query/distributed/distributed-transaction-coordinator-constants.js:32,113). Its consumer was removed by 4151a3ab4, and the constant now has no use at all.

Commits in this table dated before 2026-10-07 (00de0443e, d7e9ab0ef, c280049f7, 0b205d0d2, d22c39192) came in on side branches merged after 135279070. For them, "introducing commit" means where the export first appears. When it became unused, if that happened later, was not traced, so it is unknown.

The 12 that went away are seven `TRANSACTION_*` constants in src/transaction/transaction-constants.js (legacy engine deleted), plus `cdcSqlBuilder`, `createMigrationWorkflowOwners`, `InProcWebSocket`, `ROUTER_CONNECTION_CLOSED_ERROR_CODE` and `releaseWasmServiceReplicaConsensus`.

Split: src net +20 (32 new, 12 gone). test net +12, all new test-fixture or model exports.

## 3. Duplication [test]: the 9 new clone groups (net +4 groups / +249 lines)

All 9 groups are between file pairs that had no clone at bb3758f7b. The 5 groups that went away were in test/transaction/*.property.test.js (legacy engine deletion), message-group-service-handler.test.js vs runtime-service-handler.test.js, and coordinator-created-user-partition-remote-outcome vs replica-operation-retained-owner-turn.

| clone pair (HEAD lines) | lines | introducing commit(s) |
|---|---|---|
| test/integration/message-group-membership-claim-cache.integration.test.js:40-104 <-> test/test-helpers/participant-release-delivery-trace.js:23-87 | 65 | 77e091f64 (test file, 264 blamed lines) + 650970eed 2026-10-20 "diagnostic: preserve reviewed seed control-authority trace input" (the helper was copied from the test) |
| same pair :119-147 <-> :97-125 | 29 | same |
| same pair :185-206 <-> :161-182 | 22 | same |
| same pair :232-305 <-> :204-277 | 74 | same |
| test/raft/raft-rs-backend/runtime-opening-refusal.integration.test.js:41-66 <-> startup-cleanup-native-fixture.js:29-54 | 26 | 91409d048 (2026-10-12 WIP ten native startup refusal witnesses) + 48f15d953 (fixture) |
| same pair :74-136 <-> :82-145 | 63 | same |
| test/entrypoint/creation-recovery-process-custody.test.js:16-59 <-> startup-failed-cleanup-process-custody.test.js:15-59 | 44 | 688c75e0a + 45293b471 (2026-10-16 WIP creation-genesis) |
| test/query/unknown-outcome-same-entry.test.js:92-137 <-> write-exactly-once-schedules.test.js:42-86 | 46 | ranges blame to cb17bd44d (zero-liferaft-active-runtime W2 schedule repair) and f8a5ca8b1 (test: drive native raft elections through owner paths); both 2026-10-07, merged after the baseline |
| test/raft/raft-rs-backend/participation-gate.test.js:182-202 <-> stampless-opening-refusal.test.js:66-86 | 21 | mostly pre-base 1aea11baf; 3 lines from 0d60f1ac4 (2026-10-07, "Advance raft-rs membership generation slice") made the pair cross the 20-line threshold |

## 4. Generated, test-only, and other-owner notes

- **Generated code: none.** No file in the complexity or export delta carries a generated or do-not-edit header.
- **Test-only, where the test or fixture owner applies rather than a production owner:**
  - 19 of the 73 new complexity violations (test/integration, test/model, test/partition, test/raft fixtures).
  - 12 of the 44 new unused exports.
  - All 9 new clone groups.
- test/model/participant-release-disposition/model.js has 4 complexity violations and 4 unused exports. It is a design transition model, committed as `design:` in bde70cec7. Its owner is the model or design author, not runtime.
- Under the owner rule, src/ changes land only via `solve land` with independent verification. Test-only fixes still need the usual Quest scope, but no production-owner review.
- Two incidental findings, read statically and not run:
  - test/query/transaction-owned-commit-mode-guard.test.js:62 asserts that `src/query/distributed/distributed-transaction-recovery.js` contains the text `validateRecoveredTransactionDecision`. At HEAD that name appears only in distributed-transaction-recovery-validation.js; recovery.js imports other helpers from it. The guard therefore looks red at HEAD. **Unverified: no test was run.**
  - src/partition/partition-participant-release-contract.js:127-128,145 call `sameReplicaGeneration(facts.generation, facts.generation)` and `originEqual(facts.origin, facts.origin)`. These self-comparisons work as shape checks (non-null fields). Naming them `generationComplete` / `originComplete` would both lower the complexity score and remove the apparent bug.
- origin/main (40795f7d2) has looser baselines: complexity 1795, cognitive 155, unused 1433, test duplication 765/29385. The lineage's lower values are the binding ones, because merges keep the lower value per the comments in the checkers. Raising a baseline is forbidden (rules.md).

## 5. Cognitive complexity (+1, red since before the delivery work)

- 9ae792405 measures 152/152.
- 04d49d61f measures 153, the extra violation being src/node/replica-handler-remove-request-methods.js. That one is gone at HEAD, but other changes keep the count at 153.

Delta, HEAD against 9ae792405:
- New:
  - raft-rs-runtime-owner.js:726 `replaceRuntime` (30)
  - distributed-transaction-settlement.js:143 `validateTransactionSettlement` (26)
  - runtime-service-handler.js:448 `handleRemoveReplica` (22, 9514ba8bf)
  - message-group-forwarding-owner.js:258 `resolveCdcIngressDecision` (21, 681da1dc1, the delivery draft)
  - distributed-transaction-protocol.js:428 (23)
- Gone: distributed-transaction-protocol.js:206 and :512, partition-service-transaction-base.js:67, distributed-transaction-recovery.js:365.

The cheapest -1 is `replaceRuntime` or `validateTransactionSettlement`. Either fix also clears a cyclomatic violation.

## 6. Proposed fixes, grouped by owner, with risk and estimate

Targets: complexity needs -50 net, unused exports -32, test duplication -4 groups and -249 lines, cognitive -1.

### G1. TX1 distributed-transaction and participant-release owner (src/query/distributed/*, src/partition/partition-participant-*, partition-coordinator-settlement-command.js, sql-query-engine-participant-wire.js, src/node/replica-handler-participant-release.js, participant-release-authorization-owner.js)
- **Complexity: about 27 functions**, all from 4151a3ab4, 686878db6 or 65530bf83, plus the select rename.
  - Almost all are guard-chain validators: `releaseFactsDefect` 33, `releaseCensusDefect` 35, `releaseRowOf` 30, `validateTransactionSettlement` 28, `authorityCandidate` 28, `canonicalTransactionSettlement*`, `rolledBackAnswerOf`.
  - Fix: split each into named predicates in the same owner module, then an ordered `[predicate, OUTCOME]` table.
  - Examples: `factsObservedComplete`, `factsMatchRelease`, `queryCensusSettled`, `sameQueryCensus` (lines 167-175), `validTransactionRowShape`, `participantRowsOf`, `frozenShapeValid`, and per-kind FREEZE/DECIDE validators in settlement.js.
  - Leave `executeSelectOwned` (a rename) and `registerUniqueTransaction` for last.
- **Unused exports: 16.** De-export: release-census and settlement version/reason constants, `validateTransactionSettlement`, `validateRecoveryRowsBeforeMutation`, `validateRecoveredTransactionDecision`, `isPositiveSafeInteger`, `COORDINATOR_PARTICIPANT_REFUSAL_CODE`, `releaseFactsDefect`, `PARTICIPANT_RELEASE_AUTHORIZATION_KIND`. Then:
  - Drop the `participantSetTextOf` re-export (participant-set.js:91).
  - Delete `RECOVERY_ROLLBACK_TRANSACTION_STATUS`, which is dead.
- Risk: medium. These are pure functions with dense unit coverage (test/query/transaction-*.test.js), so behaviour risk is low; the cost is that the refactor is wide. Each owner is production code and needs a src land with verifier.
- Watch the source-text guard tests (transaction-owned-commit-mode-guard) that regex-match names. Keep the names in the expected files, and repair the :62 assertion if it is really red.
- **Estimate: 1-1.5 days.** De-exports: 1 hour.

### G2. wasm-creation-genesis U1 (src/node/runtime-service-bound-creation-route.js, runtime-service-handler.js, src/wasm-service/wasm-service-lifecycle.js, control-plane/replica-dispatch-service.js, service-lifecycle-manager.js, bootstrap/rejoin-hints.js, node/replica-runtime-cleanup-custody.js, partition-service-raft-init-base.js)
- **Complexity: 15**, of which 13 are new and the init-base one is a rename.
  - Fix: extract decision tables, for example `creationWakeAction`, `decideRetirement` and `settleRemoval` as discriminated-outcome maps, and split the create/remove request validation out of `handleCreateReplica` and `routeRuntimeServiceCreate`.
- **Unused exports: 4.** De-export `BOUND_DECISION`, `decideBoundRemoval`, `refuseForeignCreation`, `replyToRetainedMemo` in bound-creation-route.js.
- Risk: **high in practice.** 9514ba8bf says "reconstructed U1 source, explicitly unverified", and this stream has open lane regressions (solve/quests/wasm-creation-genesis/evidence/lane-regressions-2026-10-24). Schedule with the wasm-creation-genesis owner after their fixes, or as part of them.
- Join-core coupling applies: create/remove routing.
- **Estimate: 0.5-1 day**, plus coordination.

### G3. wasm-writer-slots-v1 (src/wasm-service/wasm-writer-*.js)
- Complexity 4: `validateCallerRecord` 20, `submit` 19, `validateSlot` 18, `classify` 13. Unused export 1: `recorded`.
- Fix: field-validator tables, then de-export.
- Risk: low to medium. The source is "frozen incomplete v1 at HOLD", so the quest owner should decide whether to fix it or delete it.
- **Estimate: 2-3 hours.**

### G4. retained-seed-original-handoff (src/bootstrap/seed-original-allocation-declaration.js, src/raft/raft-rs-original-allocation-preparation.js, -store.js, raft-rs-operation-port.js)
- Complexity 5. Unused exports 2: `verifyMemberBinding`, `exactLifecycleRow`.
- Fix: split the declaration validators into per-field predicates, and extract the `#validateMemberOpening` checks.
- Risk: medium. This is the native opening authority, the current R2 stream.
- **Estimate: 3-4 hours.**

### G5. raft-rs runtime owner (src/raft/raft-rs-runtime-owner.js, raft-rs-replica-lifecycle-owner.js, raft-rs-committed-membership-context.js)
- Complexity 3: `replaceRuntime` 30, `invokeCore` 14, `snapshotReceiverRow` 15.
- Fix: extract the restore-groups loop out of `replaceRuntime` (lines 740-764) into `restoreGroupsIntoNewCore()`, and the finally-cleanup into its own function. This also clears the cognitive red.
- Unused exports 2: `COMMITTED_MEMBERSHIP_CONTEXT_ERROR`, `promotionAdmissionMatchesReservation`. De-export.
- Risk: medium. Runtime replacement is safety-critical, and the change is a pure extraction.
- **Estimate: 2-3 hours.**

### G6. Message-group FreshMG membership (src/rebalancer/replica-operation-message-group-membership-owner-claim.js, -permit.js, bootstrap schema-constants)
- Complexity 2. Unused exports 2: `MEMBERSHIP_BRANCH`, `REPLICA_OPERATION_MESSAGE_GROUP_MEMBERSHIP_COLUMN`.
- Not C1 or C2 files. **Estimate: 1-2 hours.**

### G7. Remaining single src exports
- Items:
  - `claimReplicaCreatePhysicalWorker`, `replicaCreatePhysicalWorkerEvidence`, `runReplicaCreatePhysicalCommit` (node/replica-create-process-owner.js)
  - `requireProcessedSourceReplicationStart` (partition/managed-source-replication-start-delivery.js)
  - `proposeCdcAcknowledgement`, `acknowledgementEntryIdOf` (partition/partition-cdc-obligation*.js)
  - `sourceScopeMatchesService` (cdc/cdc-source-scope-evidence.js)
  - `consensusInitRefusedError`
- Fix: de-export, except `consensusInitRefusedError`. The owner-level fix for that one is to fold the three refusal-error builders into the partition opening owner and have the wasm and message-group ports import it. That is the systemic fix, and it makes the export live.
- The cdc-obligation files are adjacent to the delivery work; check with C1 before touching them.
- **Estimate: 1-2 hours.** The `consensusInitRefusedError` fold is about 1 hour more and needs the opening-path tests.

### G8. Test and fixture owners (test-only)
- Complexity 19, by fixing each function's owner file:
  - The message-group-membership-claim-cache test's trace functions (5): import from test/test-helpers/participant-release-delivery-trace.js instead of keeping its own copy. This fixes 4 clone groups (190 lines) and likely 2-5 complexity violations at once. `membershipTraceOf`@98 and `requestTraceOf`@145 are confirmed to lie inside cloned ranges.
  - The model.js apply* methods (4).
  - The arrow-function test bodies (seed-migration-cutover 31, tx1-alpha, leg-a, transaction-coordinator-restart).
- Unused exports 12: de-export the test fixture and model constants. `delayedTimerClock` comes from 681da1dc1, the delivery draft; coordinate with C1 or C2.
- Duplication:
  - runtime-opening-refusal: import from startup-cleanup-native-fixture.js (-2 groups, about 89 lines).
  - The two process-custody entrypoint tests share a custody harness (-1 group, 44 lines).
  - unknown-outcome / write-exactly-once share a schedule helper (-1 group, 46 lines).
  - participation-gate / stampless share an opening helper (-1 group, 21 lines).
- Removing all 9 new groups gives about -9 groups and roughly -390 pair lines. The ratchet needs -4 and -249. Line arithmetic under jscpd is approximate; re-measure.
- Risk: low.
- **Estimate: 0.5-1 day.**

### Minimum path to green, for scheduling
- **Unused exports (-32):** G1, G2, G3, G4, G5, G6, G7 and G8 de-exports total 44, which is enough. About half a day, low risk, mechanical.
- **Duplication (-4 / -249):** G8 duplication only. About 3-4 hours.
- **Cognitive (-1):** the G5 `replaceRuntime` extraction. About 1 hour.
- **Complexity (-50):**
  - Test-side (G8) offers 19; together with the 3 removed, test reaches net 0.
  - src then needs a further 34, out of 54 new src violations.
  - Achievable with G1 (about 27) + G3 (4) + G4 (5) + G5 (3) + G6 (2) = 41, leaving G2 (U1, unverified and in flux) untouched.
  - About 2 days.
- After each fix, tighten the baseline to the measured value when the checker prints the hint. Do the same now for src+scripts duplication (47/1462 -> 46/1439).

## Unknowns
- The exact quest for 4151a3ab4 is inferred from file domain and quest-log references; the commit message names none.
- No quest log references 686878db6, 65530bf83, ffbf422aa, 91ed3358f, 65f4b0b6a or 8e2013c27.
- For exports first introduced on pre-2026-10-07 side branches, the commit where each became unused (if different from the export commit) was not traced.
- Whether test/query/transaction-owned-commit-mode-guard.test.js:62 is actually red: no tests were run.
