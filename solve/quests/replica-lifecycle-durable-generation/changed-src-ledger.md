# Durable replica lifecycle changed-source ledger

Owner-defined invariant keys (verbatim): I1 generation-bound lifecycle; I2 rowless cleanup token; I3 creation/cleanup mutual exclusion; I4 admitted storage access; I5 marker non-replica; I6 classified side effects; I7 generation/token-bound debt; I8 one FS destruction owner.

Every changed `src/` file is mapped below; no changed source file is outside I1-I8.

## Invariant closure

| Invariant | Authoritative owner | Production implementation | Direct witness | Census entry |
| --- | --- | --- | --- | --- |
| I1 | `ReplicaStateMachine` durable-generation owner | `replica-state-machine-transition.js`, `replica-state-machine-authoritative-transition.js`, `replica-state-machine-durability.js`, `replica-state-machine-lifecycle-observation.js`, `replica-state-machine-recovery.js`, and `replica-state-machine-registered-activation.js`; one authoritative predicate carries every immutable logical-identity field plus source status/version into ordinary, authoritative, registered-activation, removal-debt, and outcome-observation paths; `partition-service-incarnation.js` supplies the shared bounded incarnation mint to both canonical partition SERVICES creators; failure detection and legacy recovery submit intent to that owner and retain no partition lifecycle SQL; `partition-service-row-owner.js` delegates activation | `replica-lifecycle-durable-generation.test.js`: exact-CAS serialization, stale REMOVING vs newer ACTIVE, per-attempt source revalidation, lost/zero-row outcome observation, recovery ABA, and stale debt; `replica-state-machine-authoritative-transition.test.js`: same-key replacements with changed partition/node, replica, or group identity cannot pass the write CAS even when status/version match; `failure-detector.test.js`, `failure-detector-cdc-writes.property.test.js`, and `replica-lifecycle-manager.test.js`: alternate callers delegate without a partition lifecycle writer; `partition-service-row-owner.test.js` and `replica-state-machine-registered-activation.test.js`: both canonical creators share a non-reused durable `created_at` incarnation; applied-INSERT evidence without bootstrap reads; forged/cross-identity/stale-generation refusal; same-ID recreation with a reused lifecycle timestamp but a different incarnation; time-advancing duplicate idempotence; delayed REMOVING; exact zero-row defer; and exact lost-ACK generation | “Exact SERVICES mutation census” |
| I2 | `ReplicaCleanupTombstoneOwner` | `replica-cleanup-tombstone-owner.js` acquires, takes over, observes, and releases the exact cleanup token | `replica-lifecycle-durable-generation.test.js`: shared-key arbitration, partial-sidecar restart, lost unlink observation, stale-token replay | “Exact SERVICES mutation census” and “Exact filesystem destructive/move census” |
| I3 | Canonical SERVICES primary-key owner (`PartitionServiceRowOwner` / `ReplicaCleanupTombstoneOwner`) | INSERT-only live acquisition and INSERT/conditional-takeover cleanup acquisition; seed uses `seed-startup-storage-admission.js` and the same writer boundary | `replica-lifecycle-durable-generation.test.js`: creator-first and cleaner-first races; `managed-split-admission-reliability.integration.test.js`: cleanup/conflict/missing-admission refusal | “Exact SERVICES mutation census” |
| I4 | Replica creation/storage-admission owner | `replica-handler-create-methods.js`, `durable-rejoin-storage-admission.js`, `snapshot-catchup-wiring.js`, `seed-startup-storage-admission.js`, and `data-directory-process-owner.js` | `replica-lifecycle-durable-generation.test.js`: seed admission and second-process refusal; managed-split, snapshot/rejoin, and bootstrap compatibility cones | “Exact PartitionService/storage-open census” and “Recovery/rejoin/seed/snapshot/projection/hydration census” |
| I5 | `classifyServiceRow` canonical SERVICES row classifier | `constants/service.js` plus cache, routing, message-group, runtime-projection, Raft, and capacity consumers | `replica-lifecycle-durable-generation.test.js`: cleanup markers excluded; message-group, runtime projection, cache, routing, and capacity focused suites | “Recovery/rejoin/seed/snapshot/projection/hydration census” and “Remaining literal cleanup checks” |
| I6 | Classified mutation/effect owners | Exact result normalization and owner-required observation in lifecycle, row-owner, bootstrap-writer, registration-visibility, cleanup-token, and storage-artifact owners; authoritative registration reads retain the canonical typed retryable 503 outcome and never fall back to cache authority | `replica-lifecycle-durable-generation.test.js`: zero-row/deferred release, lost DELETE ACK, lost unlink; `replica-handler-owner-path-bypass.test.js` production-sequence witness; MOVE_REPLICA visibility witnesses: authoritative SERVICES read unavailable yields stable `SERVICE_OWNER_READ_DEFERRED`, retry hint, preserved reservation, and no mutation/terminalization | “Exact SERVICES mutation census” and per-artifact entries in “Exact filesystem destructive/move census” |
| I7 | Generation-bound lifecycle debt owner or exact cleanup token | `replica-state-machine-leader-clear.js`, `replica-state-machine-serialization.js`, `replica-handler-remove-execution-methods.js`, exact registered-activation evidence, and the tombstone token; partition activation propagates typed retry/defer to the existing seed/join workflow re-entry owner instead of converting it to success | `replica-lifecycle-durable-generation.test.js`: FAILED debt vs replacement, cleanup takeover non-coalescing, stale-token replay; `removed-replica-cleanup-debt-owner.test.js`; `partition-service-activation.test.js`, `seed-registration-phase.test.js`, and `node-joining-service.test.js`: activation defer remains workflow debt, blocks completion/election, and re-enters idempotently | “Five repair semantic owners” and exact lifecycle/cleanup mutation entries |
| I8 | `ReplicaHandler.cleanupReplicaResources` → `removeReplicaStorageArtifacts` | `replica-storage-artifacts.js` and exact-token checks in `replica-handler-runtime-methods.js`; committed snapshot replacement is the sole named exception | `replica-lifecycle-durable-generation.test.js`: one classifier/destructive owner and partial artifact recovery; owner-path removal/drain fixture | “Exact filesystem destructive/move census (34/34)” |

| Changed source file | Invariants |
| --- | --- |
| src/bootstrap/bootstrap-api.js | I2, I3 |
| src/bootstrap/bootstrap-constants.js | I1, I3 |
| src/bootstrap/bootstrap-service-replica-registration-methods.js | I1 |
| src/bootstrap/bootstrap-service-runtime-methods.js | I1, I7 |
| src/bootstrap/bootstrap-service-seed-delegates.js | I3, I4 |
| src/bootstrap/bootstrap-service-seed-workflow.js | I1 |
| src/bootstrap/bootstrap-service.js | I2, I4 |
| src/bootstrap/durable-rejoin-storage-admission.js | I1, I4 |
| src/bootstrap/join-cleanup-handler.js | I2, I7 |
| src/bootstrap/node-joining-message-group-runtime-delegation.js | I1, I7 |
| src/bootstrap/node-joining-publication-activation.js | I1, I4 |
| src/bootstrap/owners/join-message-group-runtime-owner.js | I1, I3 |
| src/bootstrap/owners/move-replica-handoff-owner.js | I3, I5, I6 |
| src/bootstrap/owners/service-registration-handoff-owner.js | I3, I5, I6 |
| src/bootstrap/owners/service-registration-visibility-owner.js | I3, I5, I6 |
| src/bootstrap/phases/create-message-group-phase.js | I1, I3 |
| src/bootstrap/phases/seed-cleanup-handler.js | I2, I7 |
| src/bootstrap/phases/seed-partitions-phase.js | I3, I4, I5 |
| src/bootstrap/phases/seed-registration-phase.js | I1, I3, I7 |
| src/bootstrap/rejoin-hints-durable-evidence.js | I2, I4 |
| src/bootstrap/seed-startup-storage-admission.js | I3, I4 |
| src/bootstrap/shared/durable-rejoin-partition-restore-planner.js | I1, I4 |
| src/bootstrap/shared/message-group-service-activation.js | I1, I3, I6, I7 |
| src/bootstrap/shared/node-registration-owner-publication-methods.js | I3, I5, I6 |
| src/bootstrap/shared/partition-service-activation.js | I1, I7 |
| src/bootstrap/shared/replica-handler-setup.js | I1 |
| src/bootstrap/shared/snapshot-catchup-wiring.js | I1, I4 |
| src/bootstrap/system-table-core-schema-definitions.js | I2, I5 |
| src/bootstrap/system-table-writer.js | I3, I6 |
| src/cache/cache-constants.js | I5 |
| src/cache/system-table-cache-authoritative-reconciliation.js | I2, I5 |
| src/cdc/cdc-integration-service-authoritative-read-delegates.js | I3, I6 |
| src/cdc/cdc-integration-service-mutations.js | I3, I6 |
| src/constants/index.js | I5 |
| src/constants/service.js | I5 |
| src/control-plane/control-plane-error-classification.js | I6 |
| src/control-plane/control-plane-system-table-gateway-constants.js | I3, I6 |
| src/control-plane/control-plane-system-table-gateway-mutation-submission.js | I3, I6 |
| src/control-plane/control-plane-system-table-gateway-query-execution.js | I3, I6 |
| src/control-plane/owners/services-owner.js | I3, I6 |
| src/control-plane/owners/system-metadata-owner-base.js | I3, I6 |
| src/lagrange-runtime-startup.js | I4 |
| src/message-group/message-group-service-peer-resolution.js | I5 |
| src/message-group/message-group-service-metadata-publication.js | I5, I6 |
| src/message-group/message-group-service-row-owner.js | I3, I5, I6 |
| src/node/failure-detector-control-plane-guards.js | I5, I6 |
| src/node/failure-detector-replica-failures.js | I1, I6 |
| src/node/failure-detector.js | I1, I6 |
| src/node/message-group-service-handler.js | I3, I5, I6 |
| src/node/replica-cleanup-tombstone-owner.js | I2, I3, I6, I7, I8 |
| src/node/replica-handler-class.js | I2, I3, I7 |
| src/node/replica-handler-create-methods.js | I1, I3, I4, I5, I6 |
| src/node/replica-handler-create-status-methods.js | I1, I3, I6 |
| src/node/replica-handler-lifecycle-methods.js | I1, I7 |
| src/node/replica-handler-remove-execution-methods.js | I1, I2, I6, I7, I8 |
| src/node/replica-handler-remove-request-methods.js | I1, I6 |
| src/node/replica-handler-removed-cleanup-sweep.js | I2, I3, I7, I8 |
| src/node/replica-handler-runtime-metadata-methods.js | I2, I5, I6 |
| src/node/replica-handler-runtime-methods.js | I5, I6, I8 |
| src/node/replica-handler-status-methods.js | I1, I6 |
| src/node/replica-handler-transition-policy.js | I1 |
| src/node/replica-lifecycle-manager.js | I1, I8 |
| src/node/replica-lifecycle-recovery.js | I1, I6 |
| src/node/replica-recovery-service-row-admission.js | I3, I4, I5, I6 |
| src/node/replica-recovery-service.js | I1, I3, I4 |
| src/node/replica-state-machine-authoritative-transition.js | I1, I6, I7 |
| src/node/replica-state-machine-constants.js | I1, I7 |
| src/node/replica-state-machine-create-persistence.js | I1, I3, I6 |
| src/node/replica-state-machine-durability.js | I1, I6 |
| src/node/replica-state-machine-leader-clear.js | I1, I7 |
| src/node/replica-state-machine-lifecycle-observation.js | I1, I5 |
| src/node/replica-state-machine-metrics.js | I1, I7 |
| src/node/replica-state-machine-recovery.js | I1, I7 |
| src/node/replica-state-machine-registered-activation.js | I1, I6, I7 |
| src/node/replica-state-machine-serialization.js | I1, I7 |
| src/node/replica-state-machine-timeouts.js | I1, I7 |
| src/node/replica-state-machine-transition.js | I1, I6, I7 |
| src/node/replica-state-machine.js | I1, I7 |
| src/node/replica-storage-artifacts.js | I6, I8 |
| src/partition/partition-committed-statement-outcome.js | I6 |
| src/partition/partition-service-constants.js | I1, I2, I5 |
| src/partition/partition-service-core-base.js | I4, I5 |
| src/partition/partition-service-incarnation.js | I1, I3 |
| src/partition/partition-service-metadata-mutation-helpers.js | I5, I6 |
| src/partition/partition-service-row-owner.js | I1, I3, I6 |
| src/partition/partition-service-schema-migration-base.js | I2, I5 |
| src/partition/partition-service-table-bootstrap.js | I2, I5 |
| src/query/distributed/distributed-write-coordinator.js | I6 |
| src/query/query-execution-budget.js | I6 |
| src/query/query-executor-shared.js | I6 |
| src/query/query-executor-sql-command-rendering.js | I6 |
| src/query/runtime-replica-state-projection.js | I1, I3, I5, I6 |
| src/query/sql-query-engine-routing-metadata-methods.js | I5 |
| src/raft/peer-address-resolver.js | I5 |
| src/raft/raft-replica-base-runtime-helpers.js | I5 |
| src/rebalancer/storage-capacity-accounting-service.js | I5 |
| src/storage/data-directory-process-owner.js | I4 |
| src/wasm-service/wasm-service-replica.js | I1, I5, I6 |
