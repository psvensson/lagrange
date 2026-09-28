# Durable replica lifecycle destructive/authority census

Snapshot scope: implementation tree over `6831054b1916c9be4db6b13e2b8dec7ba2d03e0c` after the final alternate-writer, shared-fixture, activation-incarnation, activation-debt, row-absence-fixture, full-corpus minimum-fixture, seed-registration-evidence, dead authority-vocabulary removal, full-identity CAS, activation-batch preflight, fabricated-snapshot compatibility removal, canonical local-only identity, exact-authority FAILED redrive, and owner-preserving file-size extraction. The breadth audit contains 242 paths: 98 production `src/`, 124 tests, 6 architecture/docs, 4 scripts/tooling, 6 generated metadata/inventory files, and 4 Quest records. Including untracked candidate files, the tree changes 16,964 lines (13,211 additions, 3,753 deletions). All 98 production files map to I1-I8 in `changed-src-ledger.md`; none introduces a sixth semantic repair owner. The destructive-effect scan still finds exactly 34 filesystem unlink/rm/rmdir/rename effects.

Owner invariant vocabulary is the owner's exact vocabulary: I1 generation-bound lifecycle; I2 rowless cleanup token; I3 creation/cleanup mutual exclusion; I4 admitted storage access; I5 marker non-replica; I6 classified side effects; I7 generation/token-bound debt; I8 one FS destruction owner.

## Five repair semantic owners

1. Lifecycle generation owner: `ReplicaStateMachine` plus its extracted durability/observation/serialization/leader-debt modules and the shared partition-service incarnation mint consumed by both canonical live-row creators (I1, I6, I7).
2. Rowless cleanup-token owner: `ReplicaCleanupTombstoneOwner` on the canonical SERVICES primary key (I2, I3, I6, I7).
3. Live creation/admission owner: `PartitionServiceRowOwner` and the shared INSERT-only lifecycle/recovery admission seams (I3, I4).
4. Storage-access owner: `ReplicaHandler` and bootstrap admission wrappers prove live generation or exact cleanup token before open/effect (I4, I5).
5. Physical destruction owner: `ReplicaHandler.cleanupReplicaResources` -> `removeReplicaStorageArtifacts`, with snapshot install as the sole named live-generation replacement exception (I6, I8).

`partition-service-incarnation.js` is a bounded scalar primitive of the existing canonical SERVICES identity owner, not a sixth semantic owner. `data-directory-process-owner.js` is an enforcement boundary, not a sixth semantic repair owner. Registration, message-group, failure-detector, WASM, cache, routing, and runtime-projection components are existing consumers/delegates of canonical SERVICES identity, not independent repair authorities. The final full-corpus repair added no production owner: its only production amendment preserves authoritative SERVICES-read unavailability as the existing typed retryable 503 outcome, while the shared durable/projection state store and real removal authority are test-fixture implementations of these same five owners. The final seed repair likewise adds no owner: the seed phase retains the exact registration result already minted by the canonical row owner and passes it to the existing registered-activation owner; runtime attachment cannot republish lifecycle state.

## Exact SERVICES mutation census

Every production SERVICES INSERT/UPDATE/UPSERT/DELETE candidate is listed. `SystemMetadataOwnerBase` entries are generic mechanics; the adjacent SERVICES-specific delegate/guard says whether they are reachable for SERVICES.

| File:line | Operation | Authority / classification |
| --- | --- | --- |
| `src/node/replica-state-machine-create-persistence.js:93` | INSERT live partition row | INSERT-only creation; `buildCreateCdcData` consumes the same monotonic partition-service `created_at` incarnation mint as bootstrap registration and preserves the tracked canonical group identity rather than overwriting it with null. Successful local-only reconciliation installs the inserted full identity as authoritative before any later CAS. Nonapply/lost ACK gets OWNER_RPC_REQUIRED + leader REQUIRED exact observation; cleanup marker is typed defer, exact expected row idempotent, conflict/absence unavailable retry. |
| `src/node/replica-state-machine-registered-activation.js:144` | UPDATE registered partition lifecycle | ReplicaStateMachine-serialized exact `STOPPED` status + durable lifecycle generation + immutable identity-owner `created_at` incarnation CAS. Bootstrap may supply immutable evidence branded only by the applied INSERT/exact collision owner; identity, lifecycle-generation, or same-ID incarnation reuse refuses, while callers without that evidence must owner-RPC-read the source. The ACTIVE generation is the strict causal successor of the registration generation, so duplicate evidence remains replay-stable after clock advance. Zero-row/throw rereads classify only the exact intended ACTIVE incarnation as lost-ACK success, the unchanged source incarnation as deferred debt, and newer REMOVING/replacement/recreated incarnation as observed-state-changed refusal. |
| `src/node/replica-state-machine-authoritative-transition.js` + `src/node/replica-state-machine-transition.js` | UPDATE authoritative partition lifecycle | Failure detection and recovery submit intent to one state-machine entry point. It owner-RPC rereads and matches the entire logical identity, source status, and exact durable version before entering the ordinary serialized CAS; zero-row/throw is owner-RPC observed as exact destination success, unchanged-source deferred debt, or changed-source refusal. One shared authoritative predicate carries `service_id`, service type, partition, node, replica, group, immutable `created_at`, source status, and exact durable version into every write attempt and outcome observation. Same-key replacements that reuse status/version but alter any identity field cannot be mutated. The destination generation and leader-clear/removal debt remain bound to that identity. |
| `src/node/replica-handler-create-status-methods.js` | UPDATE FAILED retry lifecycle | Retryable create redrive performs an owner-required authoritative SERVICES read, validates and installs the exact branded full identity, then durably CASes `FAILED -> CREATING`. Priority replay uses the same owner and cannot rehydrate lifecycle authority from cache or publish only a local projection. |
| `src/node/replica-recovery-service-row-admission.js:52` | INSERT recovered live row | INSERT-only admission before storage open; owner-required nonapply classification. |
| `src/node/replica-cleanup-tombstone-owner.js:133` | INSERT cleanup marker | Rowless acquisition; unique token, no coalescing. Only exact proposed-token lost-ACK observation becomes ACQUIRED; other token is OWNED and cannot touch storage. |
| `src/node/replica-cleanup-tombstone-owner.js:245` | UPDATE REMOVING -> cleanup marker | Atomic exact live `REMOVING` status + durable generation takeover; nulls replica/group/role/version/error/address lifecycle fields, preventing an absence gap. |
| `src/node/replica-cleanup-tombstone-owner.js:286` | DELETE cleanup marker | Exact service/kind/status/partition/node/token/version predicate, no coalescing; typed result plus OWNER_RPC_REQUIRED reread classifies absent/same token/different token/live replacement/conflict/unavailable. |
| `src/partition/partition-service-row-owner.js:289` | INSERT live partition row | Shared live-row admission; global PK collision is owner-required classified and seals the currently observed STOPPED row for idempotent workflow re-entry, never UPSERT. Fresh acquisition consumes the shared monotonic `created_at` incarnation mint. Registration evidence is process-local, all canonical partition creators in that owner isolate share the bounded high-water, the data-directory guard excludes another process, and a restart invalidates every old brand; consequently a still-admissible old evidence object cannot meet a recreated row carrying the same incarnation. |
| `src/message-group/message-group-service-row-owner.js:236` | INSERT message-group row | INSERT-only global-PK admission; cleanup marker becomes typed `CLEANUP_IN_PROGRESS`, exact row idempotent, conflict fails closed. |
| `src/message-group/message-group-service-row-owner.js:274` | UPDATE message-group row | Kind/group/node fenced; nonapply re-enters INSERT-only admission. |
| `src/message-group/message-group-service-row-owner.js:317` | DELETE STOPPED message-group row | Exact kind/group/node/status/`updated_at`; destructive coalescing disabled; completion requires owner-required absence. |
| `src/bootstrap/owners/service-registration-handoff-owner.js:364` | UPDATE registered service handoff | Exact prior kind/logical identity/status/version CAS. Cleanup rows use the canonical classifier and remain unchanged with typed defer. |
| `src/bootstrap/owners/service-registration-handoff-owner.js:377` | INSERT registered service | INSERT-only global-PK admission; nonapply owner-required classifies exact/idempotent, cleanup, conflict, or defer. |
| `src/bootstrap/owners/move-replica-handoff-owner.js:537` | UPDATE rollback | Exact requested kind/partition/node/status/version CAS restores prior row; cannot overwrite cleanup or a replacement. |
| `src/bootstrap/shared/node-registration-owner-publication-methods.js:436` | INSERT join-admission service identity | INSERT-only admission through control-plane gateway; collision classification protects global PK. |
| `src/query/runtime-replica-state-projection.js:76` | UPDATE runtime replica row | Expected service kind/node/logical identity predicate through `ServicesOwner` or gateway. |
| `src/query/runtime-replica-state-projection.js:89` | INSERT absent runtime row | INSERT-only repair; cleanup collision classified, no UPSERT. |
| `src/query/runtime-replica-state-projection.js:175` | DELETE runtime row | Expected kind/node/logical identity predicate; result classified. |
| `src/node/failure-detector-replica-failures.js:110` | UPDATE message-group failure status | Message-group lifecycle remains its distinct kind-fenced path; `buildObservedReplicaWhereClause` carries service kind/logical identity/node/status/version from authoritative observation. Partition failure at line 48 is not a writer: it submits exact observed evidence to the canonical ReplicaStateMachine entry above. |
| `src/wasm-service/wasm-service-replica.js:633` | UPDATE WASM role | Exact `service_id` + WASM kind + node identity; cannot mutate cleanup or partition owner. |
| `src/wasm-service/wasm-service-replica.js:679` | UPDATE WASM leader/node | Exact WASM identity predicate; classified gateway mutation. |
| `src/message-group/message-group-service-metadata-publication.js:131` | UPDATE message-group raft role via helper | Exact service id + message-group kind + group + replica + node, then role/version CAS. |
| `src/partition/partition-service-metadata-mutation-helpers.js:200` | UPDATE partition raft role via helper | Exact service id + partition kind + partition + replica + node, then authoritative role/version CAS. |
| `src/control-plane/owners/services-owner.js:32` | INSERT delegate | SERVICES-specific INSERT API delegates to classified gateway. |
| `src/control-plane/owners/services-owner.js:36` | UPDATE delegate | Requires caller-supplied expected identity; projection uses it. |
| `src/control-plane/owners/services-owner.js:44` | DELETE delegate | Requires caller-supplied expected identity; projection uses it. |
| `src/control-plane/owners/system-metadata-owner-base.js:450` | generic INSERT mechanic | Reachable through `ServicesOwner.insertService`; table owner supplies classification. |
| `src/control-plane/owners/system-metadata-owner-base.js:463` | generic UPSERT mechanic | Not exposed by `ServicesOwner`; even direct gateway use is rejected for SERVICES at shared mutation ingress before backend selection. |
| `src/control-plane/owners/system-metadata-owner-base.js:476` and `:490` | generic UPDATE mechanics | SERVICES callers must supply exact expected identity; projection/owner methods do. |
| `src/control-plane/owners/system-metadata-owner-base.js:504` and `:517` | generic DELETE mechanics | SERVICES callers must supply exact expected identity; projection/owner methods do. |
| `src/bootstrap/system-table-writer.js:28` | bootstrap INSERT delegate | Preserves DB-selected atomic shared-PK acquisition and normalizes the actual affected-row count for the canonical row owner; no UPSERT fallback. |
| `src/bootstrap/system-table-writer.js:35` | bootstrap UPSERT delegate | Generic non-SERVICES bootstrap metadata only; SERVICES is rejected at shared gateway ingress and the canonical CDC boundary below. |
| `src/bootstrap/system-table-writer.js:41` | bootstrap UPDATE delegate | Caller supplies exact expected row identity/version; the actual affected-row count is preserved for classification. |
| `src/bootstrap/system-table-writer.js:69` | routed INSERT delegate | Preserves INSERT-only shared-PK acquisition after bootstrap; row owner classifies nonapply/lost ACK. |
| `src/bootstrap/system-table-writer.js:75` | routed UPSERT delegate | Generic non-SERVICES metadata only; SERVICES is rejected at shared gateway ingress and the canonical CDC boundary below. |
| `src/bootstrap/system-table-writer.js:81` | routed UPDATE delegate | Caller-supplied identity/version predicate and raw classified gateway result are preserved. |
| `src/control-plane/control-plane-system-table-gateway-mutation-submission.js:169` | shared mutation-ingress boundary | Rejects SERVICES UPSERT with `SERVICES_UPSERT_FORBIDDEN` before CDC availability, readiness, coalescing, or SQL-fallback selection. |
| `src/control-plane/control-plane-system-table-gateway-query-execution.js:219-227,283` | SQL-plan boundary | The shared policy rejects SERVICES UPSERT again while building fallback SQL, so no caller can obtain `INSERT OR REPLACE INTO services` from the gateway query executor. |
| `src/cdc/cdc-integration-service-mutations.js:164-169` | CDC UPSERT boundary | Explicit shared-code `SERVICES_UPSERT_FORBIDDEN` rejection. Static search finds zero applying SERVICES UPSERT paths across CDC-present and CDC-unavailable gateway execution. |

`src/cdc/cdc-integration-service-authoritative-read-delegates.js:282` adds only a gateway-shaped alias to the existing CDC authoritative-read owner; bootstrap row owners still require OWNER_RPC_REQUIRED plus leader REQUIRED and no new read authority is introduced.

`src/bootstrap/phases/seed-registration-phase.js`, `src/bootstrap/bootstrap-service-runtime-methods.js`, and `src/bootstrap/shared/message-group-service-activation.js` carry the exact branded INSERT result into registered activation. They do not add a mutation authority: activation preflights the complete handler set and then uses the existing kind/identity/status/version-fenced owner. `src/bootstrap/bootstrap-service-replica-registration-methods.js` and `src/bootstrap/node-joining-publication-activation.js` perform runtime attachment only after authoritative ACTIVE installation and cannot create a second lifecycle generation.

`src/partition/partition-committed-statement-outcome.js`, `src/query/distributed/distributed-write-coordinator.js`, `src/query/query-execution-budget.js`, `src/query/query-executor-shared.js`, `src/query/query-executor-sql-command-rendering.js`, and `src/control-plane/control-plane-error-classification.js` preserve the typed committed terminal outcome through distributed aggregation. They are I6 outcome-classification consumers, not SERVICES or storage authorities.

`src/partition/partition-service-row-owner.js:241` is a PARTITIONS leader update, not SERVICES, and is excluded from the SERVICES count. `src/bootstrap/shared/node-registration-owner-publication-methods.js:478` is a generic table update used for non-SERVICES join rows; the SERVICES path above is INSERT-only.

## Exact PartitionService/storage-open census (11/11)

| File:line | Candidate | Authority / classification |
| --- | --- | --- |
| `src/bootstrap/bootstrap-service-replica-registration-methods.js:119` | `new PartitionService` factory body | Mechanical factory installed into ReplicaHandler; no call before handler/live-row admission. |
| `src/bootstrap/node-joining-publication-activation.js:251` | `new PartitionService` | `assertDurableRejoinStorageAdmission` proves exact authoritative live row first. |
| `src/bootstrap/phases/seed-partitions-phase.js:241` | `new PartitionService` | Frozen virgin-empty genesis proof or exact live admission before open. |
| `src/bootstrap/phases/seed-registration-phase.js:198` | `new PartitionServiceRowOwner` | Metadata owner only; opens no DB/WAL/SHM. Applied INSERT evidence is carried directly into the canonical activation owner. |
| `src/bootstrap/shared/partition-service-activation.js:75` | `new PartitionServiceRowOwner` | Metadata owner only; opens no storage. Activation requires the supplied canonical `ReplicaStateMachine`; seed supplies exact INSERT evidence, while join/retry supplies no brand and therefore requires owner observation. The owner first builds and validates the complete activation batch, including every runtime, handler, and authority prerequisite, before any lifecycle mutation. Typed retry/defer remains exact generation-bound workflow debt: the shared activation owner reports it and rethrows to the existing seed/join workflow re-entry boundary, so readiness, restore completion, and elections cannot advance on a swallowed activation. |
| `src/bootstrap/shared/snapshot-catchup-wiring.js:149` | direct partition factory | Wrapper requires exact live-row storage admission. |
| `src/bootstrap/shared/snapshot-catchup-wiring.js:213` | ReplicaHandler factory fallback | Delegates to admitted ReplicaHandler create path. |
| `src/bootstrap/shared/startup-service-lifecycle-owner.js:43` | `new PartitionServiceAdapter` | Adapter only; delegates storage construction to admitted owners. |
| `src/node/replica-handler-create-methods.js:539` | create partition service | Runs after INSERT-only admission, FAILED generation replay, or exact OWNER_RPC live-generation repair proof. |
| `src/node/replica-handler-runtime-metadata-methods.js:485` | `new PartitionServiceRowOwner` | Metadata owner only; opens no storage. |
| `src/raft/snapshot-catchup.js:390` | replacement factory | Named committed-snapshot replacement; production wiring at `snapshot-catchup-wiring.js:146` performs exact live admission. |

Process enforcement precedes every candidate: `src/lagrange-runtime-startup.js:730` acquires canonical dataDir ownership, `src/storage/data-directory-process-owner.js:29` holds `BEGIN EXCLUSIVE`, startup unwind/dry-run/runtime shutdown release at startup lines `732`, `746`, `781`.

### Physical data-directory ownership boundary

**Yes.** Lagrange actively refuses a second process before replica/storage activity. `acquireDataDirectoryProcessOwner()` opens the canonical process-owner database and holds a kernel-backed SQLite `BEGIN EXCLUSIVE` transaction for the runtime lifetime; acquisition failure is fail-closed and there is no timeout-based ownership expiry. `lagrange-runtime-startup.js` acquires it before runtime construction and releases it only on startup unwind, dry-run completion, or runtime shutdown. The direct second-child-process witness is `replica-lifecycle-durable-generation.test.js` (“data-directory ownership fences a second process before replica access”).

## Exact filesystem destructive/move census (34/34)

| File:line | Effect | Authority / classification |
| --- | --- | --- |
| `src/node/replica-storage-artifacts.js:42` | `unlinkSync` DB/WAL/SHM/journal artifact | Sole ordinary replica artifact primitive; callback OWNER_RPC-rereads exact cleanup token immediately before each effect; typed per-artifact outcome. |
| `src/node/replica-handler-runtime-methods.js:44` | `rmdirSync` empty partition dir | Exact cleanup token reread immediately before effect; never live-generation authority. |
| `src/raft/snapshot-install.js:118` | remove snapshot marker | Named committed-snapshot install exception, snapshot identity/integrity owned. |
| `src/raft/snapshot-install.js:123` | remove staged DB | Named snapshot staging cleanup. |
| `src/raft/snapshot-install.js:125` | remove staged sidecars | Named snapshot staging cleanup. |
| `src/raft/snapshot-install.js:212` | remove live DB sidecars before replace | Named same-live-generation snapshot replacement exception after runtime quiescence. |
| `src/raft/snapshot-install.js:215` | rename staged DB to live DB | Named atomic snapshot replacement exception. |
| `src/raft/snapshot-checkpoint-store.js:238` | remove checkpoint staging dir | Generation-addressed checkpoint owner, not canonical live replica storage. |
| `src/raft/snapshot-checkpoint-store.js:300` | remove checkpoint sidecar | Generation-addressed checkpoint owner. |
| `src/raft/snapshot-checkpoint-store.js:322` | rename checkpoint payload | Checkpoint atomic publication owner. |
| `src/raft/snapshot-retention.js:98` | remove retained generation manifest | Retention owner, generation-addressed checkpoint only. |
| `src/raft/snapshot-retention.js:100` | remove retained generation payload | Retention owner, generation-addressed checkpoint only. |
| `src/raft/snapshot-retention.js:102` | remove retained generation dir | Retention owner, generation-addressed checkpoint only. |
| `src/raft/snapshot-transfer-receiver.js:147` | remove stale transfer entry | Transfer-session owner, not live DB. |
| `src/raft/snapshot-transfer-receiver.js:300` | remove transfer session dir | Transfer-session owner. |
| `src/raft/snapshot-transfer-receiver.js:398` | rename received payload | Exact transfer-session/generation publication. |
| `src/service/installable-component-cache.js:89` | rename component temp | Component-cache atomic publication, non-replica. |
| `src/service/installable-component-cache.js:91` | unlink component temp | Component-cache cleanup, non-replica. |
| `src/service/service-local-oci-layout-builder.js:652` | remove OCI temp | OCI layout build owner, non-replica. |
| `src/service/service-local-oci-layout-builder.js:657` | rename OCI temp | OCI atomic publication, non-replica. |
| `src/service/service-local-oci-layout-builder.js:673` | remove OCI temp after failure | OCI build owner, non-replica. |
| `src/service/service-local-oci-layout-builder.js:773` | remove OCI temp cleanup | OCI build owner, non-replica. |
| `src/cli/service-project-build-input.js:346` | remove source snapshot | CLI build temporary owner, non-replica. |
| `src/cli/service-project-build-input.js:405` | remove source snapshot | CLI build temporary owner, non-replica. |
| `src/cli/service-project-build-input.js:443` | deferred source snapshot removal | CLI build temporary owner, non-replica. |
| `src/cli/service-project-build-input.js:449` | remove source snapshot | CLI build temporary owner, non-replica. |
| `src/cli/service-project-build-input.js:563` | unlink output temp | CLI atomic write cleanup, non-replica. |
| `src/cli/service-scaffold-writer.js:75` | remove scaffold target | Explicit CLI scaffold rollback/replace, non-replica. |
| `src/runtime/oci-host-agent-durable-files.js:180` | rename durable temp | OCI host-agent atomic file publication, non-replica. |
| `src/runtime/oci-host-agent-durable-files.js:211` | unlink durable file | OCI host-agent file owner, non-replica. |
| `src/bootstrap/rejoin-hints.js:225` | rename rejoin hints temp | Rejoin-hints atomic metadata publication, not replica artifacts. |
| `src/bootstrap/startup-workflow-store.js:141` | rename workflow temp | Startup-workflow atomic metadata publication, not replica artifacts. |
| `src/storage/data-directory-manager.js:119` | unlink writability probe | Data-directory initialization probe before replica activity. |
| `src/test-helpers/port-allocator.js:206` | remove port lock dir | Test-only port allocator, non-replica. |

No recovery quarantine `rename`, legacy lifecycle-manager unlink, or independent rowless replica delete path remains. Static scan expression was `\b(unlink|unlinkSync|rm|rmSync|rmdir|rmdirSync|rename|renameSync)\s*\(` and all 34 results are above.

## Recovery/rejoin/seed/snapshot/projection/hydration census

| File:line | Operation | Authority / classification |
| --- | --- | --- |
| `src/node/replica-state-machine-recovery.js:320` | durable-version decode/hydration | `hydrateRecoveryState` rejects a missing version at line 327 before state/counters/revision; legacy `updated_at` remains explicitly labeled. |
| `src/node/replica-recovery-service-row-admission.js:46` | recovery INSERT admission | Owner-required classification precedes PartitionService creation/open. |
| `src/node/replica-recovery-service.js:660` | recover local replicas | Positive live partition-replica kind/status filter; marker is never hydrated as replica. |
| `src/bootstrap/durable-rejoin-storage-admission.js:23` | rejoin admission | OWNER_RPC_REQUIRED + leader REQUIRED exact live identity/version proof. |
| `src/bootstrap/shared/durable-rejoin-partition-restore-planner.js:292` | rejoin restore planning | Each candidate receives exact row admission before construction. |
| `src/bootstrap/node-joining-publication-activation.js:233` | join local service creation | Awaits rejoin admission before `new PartitionService`. |
| `src/bootstrap/seed-startup-storage-admission.js:8` | seed snapshot | Frozen authoritative SERVICES evidence; only provably virgin empty genesis or exact live row may open. |
| `src/bootstrap/phases/seed-partitions-phase.js:77` | seed per-partition admission | Cleanup marker typed defer; conflicting/nonempty state fails closed. |
| `src/bootstrap/shared/snapshot-catchup-wiring.js:146` | snapshot replacement wrapper | Exact live-row admission wraps every production replacement factory. |
| `src/node/replica-handler-runtime-methods.js:131` | frozen startup marker snapshot | Awaited before admission; exact local node/partition/token/version candidates only. |
| `src/node/replica-handler-removed-cleanup-sweep.js:155` | startup sweep | Frozen tokens union disk identities; only snapshot token may resume, disk identity must INSERT-acquire; OWNED never deletes. |
| `src/node/replica-handler-remove-execution-methods.js:109` | normal removal takeover | Exact REMOVING generation atomically becomes cleanup marker before physical effect. |
| `src/query/runtime-replica-state-projection.js:221` | runtime projection | Live kind/identity guarded update; absent repair INSERT-only; cleanup marker typed defer and never projected live. |
| `src/cache/system-table-cache-authoritative-reconciliation.js:94` | cache alignment | Cleanup kind/token/version completeness is distinct from live lifecycle alignment. |
| `src/constants/service.js:16` | canonical row classifier | Single classifier yields absent/cleanup ownership/live partition/other service; consumers call predicates rather than literal cleanup exclusions. |

## Remaining literal cleanup checks (deliberate owner-boundary fields)

| File:line | Literal | Reason |
| --- | --- | --- |
| `src/constants/service.js:20` | `service_type === PARTITION_CLEANUP` | The one canonical row classifier definition. |
| `src/cache/system-table-cache-authoritative-reconciliation.js:88` | `status === cleanup_owned` | Exact marker completeness after canonical cleanup-kind classification, not consumer exclusion. |
| `src/node/replica-cleanup-tombstone-owner.js:18-19` | cleanup kind/status constants | Canonical marker writer/owner. |
| `src/node/replica-handler-runtime-methods.js:163,184` | authority `kind === cleanup_owned` | Typed in-memory storage-authority token validation, not SERVICES row classification. |

All consumer-side direct `service_type ===/!== PARTITION_CLEANUP` checks outside `src/constants/service.js` are gone. Positive `service_type === PARTITION` predicates remain deliberately in exact mutation identity guards and legacy consumers; they already fail closed for cleanup markers and are not an exclusion list.

## Static conclusions

- Ordinary canonical replica storage destruction authorities: exactly one chain (`ReplicaCleanupTombstoneOwner` -> `ReplicaHandler.cleanupReplicaResources` -> `removeReplicaStorageArtifacts`).
- Named canonical-storage exception: exactly one (`raft/snapshot-install.js`, committed same-live-generation snapshot replacement).
- Live partition DELETE authorities: zero. Normal removal atomically hands the exact REMOVING row to a cleanup marker; only exact marker DELETE releases the PK.
- SERVICES UPSERT authorities: zero applying paths; the generic CDC boundary rejects it.
- Startup marker snapshot is only a candidate set. Every individual artifact unlink OWNER_RPC-rereads exact token immediately before the effect.
- Process/dataDir guard makes frozen-startup-token resumption enforceable across OS processes without timeout/stale lock breaking; the kernel-backed SQLite transaction releases on crash.

## Inherited seed-bootstrap timeout classification

- Base: `6831054b1916c9be4db6b13e2b8dec7ba2d03e0c`; `seed-node-bootstrap.integration.test.js` reached 100/102 before the unchanged 30-second aggregate parent timeout at 30.015 seconds.
- Frozen implementation tree: the same suite reached 102/103 and 100/102 on separate runs before that same unchanged aggregate timeout.
- Observed mechanism: the candidate completes the repaired seed admission and proceeds into later bootstrap/hydration work; the timeout is the pre-existing suite-level aggregate budget, not a typed admission refusal or cleanup-ownership wedge.
- Classification: inherited behavior, not accepted certification evidence. No timeout, retry, assertion, or test scope was changed. Any changed mechanism or measurable frequency increase in exact-SHA certification reopens the issue.
