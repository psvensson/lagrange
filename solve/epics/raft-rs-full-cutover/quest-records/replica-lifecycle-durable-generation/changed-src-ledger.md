# Durable replica lifecycle changed-source ledger

Owner-defined invariant keys (verbatim): I1 generation-bound lifecycle; I2 rowless cleanup token; I3 creation/cleanup mutual exclusion; I4 admitted storage access; I5 marker non-replica; I6 classified side effects; I7 generation/token-bound debt; I8 one FS destruction owner.

Added by owner decision 2026-09-29 (round 5, verbatim):

- I9 incarnation-bound node projections: delayed work from node incarnation G1 cannot mutate, withdraw, validate, advertise or provide semantic evidence for NODES/endpoints owned by G2.
- I10 exact runtime projection: delayed runtime work of lifecycle generation G1 can affect only the process-local runtime instance opened for G1; it cannot resolve by logical-name reuse to G2's runtime. (Durable lifecycle generation is the persistent authority; runtime-instance identity is its exact process-local projection.)

## Pre-fingerprint amendment (owner-approved, 2026-09-29)

After snapshot `9a10ee213`, two owner-approved changes landed before the freeze fingerprint:

1. `src/message-group/message-group-forwarding-owner.js` (and its `requiredCompletionKind` test in `test/message-group/message-group-service.test.js`) restored byte-exact to base `6831054b1`. The residue of the rejected READY-through-message-group boundary is gone; the completion contract belongs to quest `message-group-forward-completion-propagation`.
2. D-1 fixed in `src/node/replica-state-machine-authoritative-transition.js`: the lost-ack destination match is identity + status + previous_state + state_entered_at, never updated_at (I1, I6). Witness: "lost lifecycle acknowledgement survives an unrelated role write that advances updated_at" in `test/node/replica-state-machine-authoritative-transition.test.js` (red with updated_at restored).

Amended measures (frozen tree): changed production files **176** = 155 modified + 21 added + 0 deleted, +9,203 / -4,237; mapped to I1-I10: 174; unmapped: 2 (the two storage-reservation files). The per-file rows below are unchanged except that the forwarding-owner row is withdrawn.

## Scope (measured, at snapshot 9a10ee213)

Tree: HEAD `6831054b1` + uncommitted candidate, fingerprinted as snapshot `9a10ee213` (`refs/wip/replica-lifecycle-2026-09-29-r5-final`). Every `src/` byte in the worktree equals `9a10ee213` (per-file `cmp`, 177/177).

| Measure | Value | Command |
| --- | --- | --- |
| Changed production files | **177** = 156 modified + 21 added + 0 deleted | `git diff --name-status 6831054b1 9a10ee213 -- src` |
| of which untracked in the worktree | 21 (the 21 added) | `git status --porcelain -- src` |
| Lines | +9,236 / -4,244 (tracked only: +5,868 / -4,244) | `git diff --shortstat` |
| Mapped to I1-I10 | 174 | this table |
| Unmapped | 3 | "Unmapped" below |

`Since` = the first snapshot in which the file differs from base: `C` handover candidate `d467e0563` (127 files; 98 were mapped by the previous ledger, 29 were not), `R1` `5386c0562` (READY owner, 17 files), `R2` `562474332` (0 new), `R3` `752b17715` (D1-D4, 4 files), `R4` `5d6f58f9b` (endpoint incarnation + runtime registry, 14 files), `R5` `9a10ee213` (endpoint readers, 15 files). Eleven of the previously mapped files changed again after `C`; their rows carry the added invariants.

Files per invariant (a file can carry several): I1 52, I2 15, I3 34, I4 15, I5 31, I6 60, I7 22, I8 6, I9 72, I10 5, unmapped 3.

## Invariant closure

| Invariant | Authoritative owner | Production implementation | Direct witness | Census entry |
| --- | --- | --- | --- | --- |
| I1 | `ReplicaStateMachine` durable-generation owner (`state_entered_at` via `durableRowVersion`) | `replica-state-machine-transition.js`, `-authoritative-transition.js`, `-durability.js`, `-lifecycle-observation.js`, `-recovery.js`, `-registered-activation.js`; `partition-service-incarnation.js` mint; registration rows now born with `state_entered_at` (`partition-service-row-owner.js`, `bootstrap-api-registration-methods.js`); MG activation and MG removal fenced by identity + status + `created_at` + `state_entered_at`, never `updated_at` (`message-group-service-row-owner.js`); cache/CDC delete ordering corrected at its owner so a removed generation cannot resurrect (`system-table-cache.js`, `-row-merge.js`, `-tombstone-store.js`) | `replica-lifecycle-durable-generation.test.js`; `replica-state-machine-authoritative-transition.test.js` (sibling falsifier); `message-group-service-row-owner.test.js` (G/G+1 activation + removal); `system-table-cache-lifecycle-delete-ordering.test.js`; `partition-service-row-owner.test.js`, `replica-state-machine-registered-activation.test.js` | authority-census "SERVICES lifecycle CAS census (12)" |
| I2 | `ReplicaCleanupTombstoneOwner` (`cleanup_token` = cleanup-ownership generation) | `replica-cleanup-tombstone-owner.js` | `replica-lifecycle-durable-generation.test.js`; `replica-cleanup-token-authority.test.js` (P1-P7) | CAS census #8; FS census |
| I3 | Canonical SERVICES primary-key owner (`PartitionServiceRowOwner` / `ReplicaCleanupTombstoneOwner`) | INSERT-only live acquisition; INSERT / conditional-takeover cleanup acquisition; seed via `seed-startup-storage-admission.js` | `replica-lifecycle-durable-generation.test.js` creator/cleaner races; `managed-split-admission-reliability.integration.test.js` | "Other SERVICES mutation sites" |
| I4 | Replica creation/storage-admission owner + data-directory process owner | `replica-handler-create-methods.js`, `durable-rejoin-storage-admission.js`, `snapshot-catchup-wiring.js`, `seed-startup-storage-admission.js`, `data-directory-process-owner.js` | `replica-lifecycle-durable-generation.test.js` (seed admission, second-process refusal) | "PartitionService/storage-open census (11)" |
| I5 | `classifyServiceIdentityRow` (`constants/service.js`) | cache, routing, MG, runtime projection, Raft peer, capacity consumers | `replica-lifecycle-durable-generation.test.js` marker exclusion + focused consumer suites | "Remaining literal cleanup checks" |
| I6 | Classified mutation/effect owners | exact result normalization + owner-required observation in lifecycle, row-owner, bootstrap writer, visibility, cleanup token, storage artifacts; typed terminal distributed failures never retried as transient (`cdc-routed-mutation-readiness.js`); READY/terminal/endpoint outcomes classified by authoritative readback (see I9) | `replica-lifecycle-durable-generation.test.js`; `replica-handler-owner-path-bypass.test.js`; `node-lifecycle-publication.test.js` lost-outcome proofs | CAS census "lost/unknown outcome authority" column |
| I7 | Generation-bound lifecycle debt owner or exact cleanup token | `replica-state-machine-leader-clear.js`, `-serialization.js`, `replica-handler-remove-execution-methods.js`, registered-activation evidence, tombstone token; activation defer rethrown to workflow re-entry | `removed-replica-cleanup-debt-owner.test.js`; `partition-service-activation.test.js`; `seed-registration-phase.test.js`; `node-joining-service.test.js` | CAS census |
| I8 | `ReplicaHandler.cleanupReplicaResources` -> `removeReplicaStorageArtifacts` | `replica-storage-artifacts.js`; exact-token rmdir in `replica-handler-runtime-methods.js`; committed snapshot replacement is the one named exception | `replica-lifecycle-durable-generation.test.js` | "Destructive filesystem census (34)" |
| I9 | NODES: `NodeLifecyclePublication` (single semantic READY/CONNECTED owner) + registration incarnation advance + `node-terminal-transition-fence` + lease authority (`NodeReadyLeaseAuthority`); endpoints: `endpoint-incarnation-authority` (writes) + `endpoint-incarnation-currentness` (reads) | READY: Heartbeat (`heartbeat-service-publication-methods.js`) and ReplicaDispatch (`replica-dispatch-state-publication.js`, `replica-dispatch-service-lifecycle.js`) are ingress adapters into `node-lifecycle-publication.js`, whose CAS carries `node_id + boot_incarnation + status + connection_state + last_heartbeat + created_at`, OWNER_RPC readback classifies zero-row/lost/unknown, no retry queue (the dispatch node-state queue/deferred-retry/watermark machinery is deleted). Registration row requires a positive incarnation; durable rejoin advances by CAS on the observed incarnation. Shutdown/withdraw final mutation `{node_id, boot_incarnation}`. Reaper CAS on observed incarnation + lease pair. Endpoint rows carry `boot_incarnation` (0 = legacy, never current); every writer/destructor goes through the authority; every semantic reader goes through the currentness view | `node-lifecycle-publication.test.js` (18 tests incl. the three READY lost-outcome proofs); leaderless-MG READY witness in `replica-dispatch-node-state-update-payload-wakeup-slow-write.test.js`; `durable-rejoin-incarnation-advance.test.js`; `node-terminal-transition-fence.test.js`; `lease-sweep-stale-row-reaper.test.js`; `endpoint-incarnation-authority.test.js`; `endpoint-reader-currentness.test.js` (E1/E2/E3); `node-lifecycle-writer-census.js` + `endpoint-writer-census.test.js` (structural); `incarnation-reuse-cross-owner-anchor.test.js` | "NODES writer census", "Endpoint writer census", "Endpoint reader census" |
| I10 | Raft runtime-instance registry in `raft-rs-replica-lifecycle-owner.js` (WeakMap keyed by the exact operation port) | `raft-rs-operation-port.js` registers/unregisters by port (compare-and-delete); `raft-rs-lifecycle-administration.js` + `replica-handler-remove-execution-methods.js` retire the captured runtime; `raft-rs-membership-administration.js` reservation unregister compare-and-delete | `lifecycle-registry-runtime-generation.test.js` (5 behavioural + 1 structural); `incarnation-reuse-cross-owner-anchor.test.js` | "Raft registry operation census" |

## Unmapped (not forced)

| File | Since | Why no I1-I10 |
| --- | --- | --- |
| src/rebalancer/rebalance-coordinator-reservation-lifecycle-methods.js | C | Storage-reservation creation is insert-first: INSERT OR IGNORE arbitration, and a zero-row result is accepted only after an authoritative read proves the exact ACTIVE reservation. It follows the I6 pattern, but `storage_reservations` is not a replica lifecycle, node, endpoint or runtime authority. |
| src/rebalancer/rebalance-coordinator-shared.js | C | `INSERT_RESERVATION` becomes `INSERT OR IGNORE`. This is the SQL half of the row above. |

## Per-file map (177)

| Changed source file | A/M | Lines | Since | Invariants | Reason |
| --- | --- | --- | --- | --- | --- |
| src/admin/admin-control-snapshot-coverage-gap-evaluation.js | M | +4/-1 | R5 | I9 | coverage-gap endpoint rows read through selectCurrentEndpointRows (semantic reader) |
| src/admin/admin-control-snapshot-node-view-projection.js | M | +0/-8 | R5 | I9 | dead raw-endpoint helpers removed; coverage passes NODES rows into the filtered consistency check |
| src/admin/admin-preflight-snapshot.js | M | +5/-6 | R5 | I9 | serviceEndpointsCount (feeds discovery repair policy) via readCurrentEndpointRows; nodeEndpointsCount stays raw display |
| src/admin/admin-service-discovery-readiness-methods.js | M | +5/-4 | R5 | I9 | discovery endpoint count via readCurrentEndpointRows |
| src/admin/admin-service-discovery.js | M | +8/-1 | R4 | I9 | catalog advertises only isEndpointCurrentForNode service endpoints |
| src/admin/admin-shared-metadata-consistency.js | M | +3/-1 | R5 | I9 | node coverage counts only current-incarnation endpoints |
| src/bootstrap/bootstrap-api-registration-methods.js | M | +5/-0 | R1 | I1 | registered service row carries finite state_entered_at (lifecycle generation) into activation evidence |
| src/bootstrap/bootstrap-api.js | M | +2/-0 | C | I2, I3 | registration row helpers aware of cleanup-marker PK contention |
| src/bootstrap/bootstrap-constants.js | M | +0/-5 | C | I1, I3 | dead registration/lifecycle constants removed |
| src/bootstrap/bootstrap-service-control-plane-runtime-methods.js | M | +6/-37 | C | I9 | seed NODES row born JOINING with boot_incarnation; runtime handler via guarded initializer at the boot incarnation |
| src/bootstrap/bootstrap-service-replica-registration-methods.js | M | +53/-171 | C | I1 | runtime attachment only after authoritative ACTIVE; no second lifecycle generation |
| src/bootstrap/bootstrap-service-runtime-methods.js | M | +9/-1 | C | I1, I7, I9 | exact branded INSERT result into registered activation; hasPublishedLocalServiceEndpoints counts only current-incarnation rows |
| src/bootstrap/bootstrap-service-seed-delegates.js | M | +9/-2 | C | I3, I4 | seed admission delegates |
| src/bootstrap/bootstrap-service-seed-workflow.js | M | +12/-2 | C | I1 | seed workflow carries registration evidence/readiness into activation |
| src/bootstrap/bootstrap-service.js | M | +1/-0 | C | I2, I4 | seed wiring of cleanup/admission owners |
| src/bootstrap/durable-rejoin-storage-admission.js | A | +44/-0 | C | I1, I4 | OWNER_RPC exact live identity/version proof before rejoin storage open |
| src/bootstrap/join-cleanup-handler.js | M | +3/-3 | C | I2, I7 | join cleanup clears the ReplicaStateMachine (admission closed, revisions advanced) |
| src/bootstrap/join-readiness-snapshot-methods.js | M | +3/-1 | R5 | I9 | join readiness endpoint visibility via readCurrentEndpointRows |
| src/bootstrap/node-joining-message-group-runtime-delegation.js | M | +10/-14 | C | I1, I7, I9 | MG activation evidence; published-local-endpoint check on current incarnation only |
| src/bootstrap/node-joining-owner-construction.js | M | +5/-0 | C | I9 | joiner exposes getBootIncarnation; attachMessageGroupService feeds ReplicaDispatch READY ingress (READY adapter wiring) |
| src/bootstrap/node-joining-publication-activation.js | M | +17/-64 | C | I1, I4, I9 | rejoin storage admission before open; routed reporter maps lifecycle requests (READY wire); runtime handler at boot incarnation |
| src/bootstrap/node-joining-ready-signal-readiness.js | M | +2/-2 | C | I9 | doc only: routed reporter vs local adapter into the READY owner |
| src/bootstrap/owners/bootstrap-cluster-view-owner.js | M | +3/-1 | R5 | I9 | cluster view endpoint rows via readCurrentEndpointRows |
| src/bootstrap/owners/join-message-group-runtime-owner.js | M | +11/-0 | C | I1, I3 | MG runtime owner consumes exact registration evidence |
| src/bootstrap/owners/move-replica-handoff-owner.js | M | +15/-2 | C | I3, I5, I6 | rollback CAS on generation (state_entered_at else updated_at) + exact identity; cleanup rows untouched |
| src/bootstrap/owners/service-registration-handoff-owner.js | M | +77/-20 | C | I3, I5, I6 | INSERT-only registration + exact prior-row CAS; classified nonapply |
| src/bootstrap/owners/service-registration-visibility-owner.js | M | +35/-10 | C | I3, I5, I6 | authoritative visibility read keeps typed retryable 503; no cache authority |
| src/bootstrap/phases/create-message-group-phase.js | M | +7/-2 | C | I1, I3 | MG creation carries exact registration evidence |
| src/bootstrap/phases/create-message-group-replica-lifecycle.js | M | +7/-0 | C | I9 | attachMessageGroupService before publish (READY ingress adapter wiring) |
| src/bootstrap/phases/query-system-state-phase.js | M | +2/-0 | C | I9 | getBootIncarnation threaded to registration |
| src/bootstrap/phases/seed-cleanup-handler.js | M | +2/-2 | C | I2, I7 | seed cleanup clears state machine / token debt |
| src/bootstrap/phases/seed-message-groups-phase.js | M | +4/-0 | C | I9 | seed attachMessageGroupService (READY ingress adapter wiring) |
| src/bootstrap/phases/seed-partitions-phase.js | M | +43/-0 | C | I3, I4, I5 | virgin-genesis or exact-live admission before PartitionService open; cleanup marker typed defer |
| src/bootstrap/phases/seed-registration-phase.js | M | +31/-15 | C | I1, I3, I7, I9 | exact INSERT evidence to activation; seed meta endpoints stamped with boot incarnation |
| src/bootstrap/rejoin-hints-durable-evidence.js | M | +168/-0 | C | I2, I4 | rejoin evidence reads replica artifacts/SERVICES rows as outcomes |
| src/bootstrap/seed-startup-storage-admission.js | A | +24/-0 | C | I3, I4 | frozen authoritative SERVICES evidence for seed storage open |
| src/bootstrap/shared/control-plane-setup.js | M | +15/-0 | C | I9, I6 | one NodeLifecyclePublication + NodeReadyLeaseAuthority wired to Heartbeat, ReplicaDispatch and LeaseService |
| src/bootstrap/shared/durable-rejoin-partition-restore-planner.js | M | +16/-0 | C | I1, I4 | per-candidate exact row admission before construction |
| src/bootstrap/shared/guarded-runtime-service-handler.js | A | +40/-0 | R4 | I9 | single seed/joiner runtime-handler initializer passing bootIncarnation to endpoint publication |
| src/bootstrap/shared/message-group-service-activation.js | M | +6/-0 | C | I1, I3, I6, I7 | carries branded INSERT result; activation debt rethrown |
| src/bootstrap/shared/meta-service-definition-registration.js | M | +7/-1 | R4 | I9 | meta endpoint rows stamped with the caller boot incarnation |
| src/bootstrap/shared/node-registration-owner-constants.js | M | +0/-3 | R1 | I9 | dead durable-rejoin refresh constants removed (replaced by incarnation advance) |
| src/bootstrap/shared/node-registration-owner-durable-rejoin-methods.js | M | +150/-15 | R1 | I9 | advanceNodeBootIncarnation CAS on observed incarnation + advanceReusedEndpointRows |
| src/bootstrap/shared/node-registration-owner-publication-methods.js | M | +170/-78 | C | I3, I5, I6, I9 | INSERT-only join SERVICES identity; failed-join NODES + endpoint withdrawal at exact incarnation; endpoint writes via authority |
| src/bootstrap/shared/node-registration-owner-row-builder.js | M | +8/-0 | C | I9 | registration row requires positive boot incarnation (BOOT_INCARNATION_REQUIRED) |
| src/bootstrap/shared/node-registration-owner.js | M | +4/-0 | C | I9 | registration row built at this boot; resumed join from another boot advanced via advanceStaleJoinAdmissionIncarnation |
| src/bootstrap/shared/node-state-publication-owner.js | M | +51/-3 | C | I9, I6 | routed reporter (transport for the READY owner): completion carries authoritative row/observedAt; target refresh |
| src/bootstrap/shared/partition-service-activation.js | M | +197/-3 | C | I1, I7 | whole activation batch preflighted; typed retry/defer rethrown to workflow re-entry |
| src/bootstrap/shared/replica-handler-setup.js | M | +40/-16 | C | I1 | handler wired to canonical ReplicaStateMachine |
| src/bootstrap/shared/runtime-service-handler-setup.js | M | +4/-0 | R4 | I9 | bootIncarnation threaded to runtime endpoint publication |
| src/bootstrap/shared/snapshot-catchup-wiring.js | M | +7/-2 | C | I1, I4 | exact live-row admission wraps snapshot replacement factory |
| src/bootstrap/system-table-core-schema-definitions.js | M | +1/-0 | C | I2, I5 | SERVICES cleanup_token column |
| src/bootstrap/system-table-runtime-schema-definitions.js | M | +5/-0 | R4 | I9 | node_endpoints/service_endpoints boot_incarnation NOT NULL DEFAULT 0 (0 = never current) |
| src/bootstrap/system-table-writer.js | M | +52/-7 | C | I3, I6 | affected-row normalization; no UPSERT fallback for SERVICES |
| src/cache/cache-constants.js | M | +1/-1 | C | I5 | cache lifecycle column constant |
| src/cache/system-table-cache-authoritative-reconciliation.js | M | +75/-18 | C | I2, I5 | cleanup marker completeness distinct from live lifecycle alignment |
| src/cache/system-table-cache-row-merge.js | M | +63/-0 | R3 | I1 | non-HLC DELETE matching the cached row applies; same-created_at replay of a removed generation fenced |
| src/cache/system-table-cache-tombstone-store.js | M | +18/-0 | R3 | I1 | tombstone keyed on deleted-row version; removed generation cannot resurrect |
| src/cache/system-table-cache.js | M | +4/-2 | R3 | I1 | DELETE applies via isDeleteSupersededByExistingRecord; tombstone sourced from the deleted row version |
| src/cdc/cdc-integration-service-authoritative-read-delegates.js | M | +18/-0 | C | I3, I6 | gateway-shaped alias of the authoritative read |
| src/cdc/cdc-integration-service-mutations.js | M | +11/-0 | C | I3, I6 | SERVICES UPSERT rejected at CDC boundary |
| src/cdc/cdc-integration-service-shared.js | M | +2/-0 | C | I6 | exports isTerminalTypedDistributedFailure |
| src/cdc/cdc-routed-mutation-readiness.js | M | +4/-5 | C | I6 | typed terminal distributed failure is never classified transient/retried |
| src/constants/columns.js | M | +1/-0 | R1 | I1 | COLUMN.STATE_ENTERED_AT |
| src/constants/index.js | M | +1/-0 | C | I5 | re-export of canonical service-row classifier |
| src/constants/service.js | M | +33/-0 | C | I5 | classifyServiceIdentityRow / isPartitionCleanupServiceRow / isLivePartitionServiceRow |
| src/control-plane/active-node-projection.js | M | +11/-11 | R5 | I9 | per-node websocket-endpoint check on the current view; aggregate toggle stays raw (recorded) |
| src/control-plane/control-plane-constants.js | M | +6/-0 | C | I9, I6 | completion fields authoritativeRow / authoritativeObservedAtMs for READY lost-outcome readback |
| src/control-plane/control-plane-error-classification.js | M | +47/-0 | C | I6 | typed committed/terminal distributed failure classifiers |
| src/control-plane/control-plane-readiness-service-node-methods.js | M | +4/-4 | R5 | I9 | readiness endpoint rows via readCurrentEndpointRows (x2) |
| src/control-plane/control-plane-system-table-gateway-constants.js | M | +3/-0 | C | I3, I6 | SERVICES_UPSERT_FORBIDDEN |
| src/control-plane/control-plane-system-table-gateway-mutation-submission.js | M | +1/-0 | C | I3, I6 | assertSystemTableMutationAllowed at mutation ingress |
| src/control-plane/control-plane-system-table-gateway-query-execution.js | M | +13/-0 | C | I3, I6 | SERVICES UPSERT rejected in SQL-plan boundary |
| src/control-plane/heartbeat-service-constants.js | M | +2/-0 | R4 | I9 | ENDPOINT_WRITE_NOT_CURRENT log |
| src/control-plane/heartbeat-service-lifecycle-methods.js | M | +45/-78 | C | I9, I6 | shutdown written at exact boot incarnation via node-terminal-transition-fence; reporter shutdown branch deleted |
| src/control-plane/heartbeat-service-publication-methods.js | M | +234/-117 | C | I9, I6 | Heartbeat adapter -> NodeLifecyclePublication; lease-expiry CAS; node endpoint via writeEndpointAtIncarnation |
| src/control-plane/heartbeat-service-reporter-visibility-methods.js | M | +139/-25 | C | I9, I6 | routed reporter request/telemetry mapping; durable-completion visibility |
| src/control-plane/heartbeat-service-runtime-state.js | M | +3/-2 | C | I9 | NODE_LIFECYCLE_PUBLICATION_REQUIRED; dead shutdown literals removed |
| src/control-plane/heartbeat-service.js | M | +4/-0 | C | I9 | Heartbeat holds nodeLifecyclePublication (local READY/CONNECTED ingress adapter) |
| src/control-plane/lease-service-constants.js | M | +2/-2 | R1 | I9 | READY lease config moved to lease authority; REAPER_SKIPPED_OBSERVATION_SUPERSEDED |
| src/control-plane/lease-service.js | M | +53/-17 | R1 | I9 | stranded-JOINING reap CAS on observed incarnation+lease pair; endpoint reap at observed incarnation; NodeReadyLeaseAuthority |
| src/control-plane/node-lifecycle-publication-wire.js | A | +70/-0 | R1 | I9 | NEW: wire mapping between lifecycle request and routed NODE_STATE_UPDATE |
| src/control-plane/node-lifecycle-publication.js | A | +587/-0 | R1 | I9, I6 | NEW: single semantic READY/CONNECTED owner; exact-incarnation CAS; OWNER_RPC readback classifies zero-row/lost/unknown |
| src/control-plane/node-ready-lease-authority.js | A | +77/-0 | R1 | I9 | NEW: lease term grant/isExpired/holdsLiveLease (canonical lease authority) |
| src/control-plane/node-terminal-transition-fence.js | A | +166/-0 | R3 | I9, I6 | NEW: shutdown/withdraw final mutation {node_id, boot_incarnation}; readback outcomes, no retry |
| src/control-plane/owners/endpoint-incarnation-authority.js | A | +287/-0 | R4 | I9, I6 | NEW: endpoint write/mutate at exact incarnation; lost-result D3 rule |
| src/control-plane/owners/endpoint-incarnation-currentness.js | A | +86/-0 | R5 | I9 | NEW: pure currentness view (isEndpointCurrentForNode, select/readCurrentEndpointRows) |
| src/control-plane/owners/membership-publication-runtime-owner.js | M | +47/-7 | R1 | I9 | advanceJoinNodeBootIncarnation CAS; writeJoinEndpointAtIncarnation replaces raw endpoint upserts |
| src/control-plane/owners/services-owner.js | M | +13/-10 | C | I3, I6 | update/remove require caller-supplied expected identity |
| src/control-plane/owners/system-metadata-owner-base.js | M | +27/-0 | C | I3, I6 | updateWhere/deleteWhere mechanics |
| src/control-plane/readiness-planning-global-projection.js | M | +8/-3 | R5 | I9 | endpoint views judged against NODES rows; NODES read when endpoint view rebuilt |
| src/control-plane/readiness-planning-table-impact-classification.js | M | +8/-1 | R5 | I9 | projection reuse only when NODES boot incarnation unchanged (R5 production gap fix) |
| src/control-plane/replica-dispatch-operation-execution.js | M | +0/-5 | R1 | I9 | node-state budget helper removed (READY moved to owner) |
| src/control-plane/replica-dispatch-readiness-capture.js | M | +2/-123 | C | I9 | node-state deferred-retry machinery deleted |
| src/control-plane/replica-dispatch-reconcile-callbacks.js | M | +0/-43 | C | I9 | node-state reconcile callbacks deleted |
| src/control-plane/replica-dispatch-replay-health-readiness.js | M | +0/-162 | R1 | I9 | node-state replay readiness deleted |
| src/control-plane/replica-dispatch-retry-scheduling.js | M | +0/-286 | C | I9 | node-state retry queue/scheduling deleted (no retry queue) |
| src/control-plane/replica-dispatch-service-constants.js | M | +0/-16 | R1 | I9 | dead node-state retry constants removed |
| src/control-plane/replica-dispatch-service-dispatch-error-helpers.js | M | +0/-37 | R1 | I9 | node-state dispatch error helpers deleted |
| src/control-plane/replica-dispatch-service-dispatch-observation-methods.js | M | +0/-146 | R1 | I9 | node-state observation (getAuthoritativeNodeRow path) deleted |
| src/control-plane/replica-dispatch-service-lifecycle.js | M | +14/-169 | C | I9, I6 | NODE_STATE_UPDATE -> local NodeLifecyclePublication; ack only durable completions; forwardToLeader leader-only |
| src/control-plane/replica-dispatch-service-shared.js | M | +6/-8 | C | I9 | completion field export; NODE_STATE_UPDATE_SOURCE_CHANGED / _INCARNATION_REQUIRED literals |
| src/control-plane/replica-dispatch-service.js | M | +0/-11 | R1 | I9 | node-state queues/watermarks shutdown removed |
| src/control-plane/replica-dispatch-state-publication.js | M | +88/-575 | C | I9, I6 | ReplicaDispatch adapter: publishNodeLifecycleMessage -> NodeLifecyclePublication (575 lines of dispatch-side NODES writing removed) |
| src/lagrange-runtime-startup.js | M | +19/-17 | C | I4 | data-directory process owner acquired before runtime; seed storage admission read |
| src/message-group/message-group-forwarding-owner.js | - | restored to base | C | withdrawn | pre-fingerprint amendment 1 |
| src/message-group/message-group-service-metadata-publication.js | M | +8/-2 | C | I5, I6 | role CAS on exact MG identity (role/updated_at only; never lifecycle generation) |
| src/message-group/message-group-service-peer-resolution.js | M | +2/-1 | C | I5 | cleanup rows are not peers |
| src/message-group/message-group-service-row-owner.js | M | +314/-56 | C | I1, I3, I5, I6 | INSERT-only admission; activation and removal fenced by identity+status+created_at+state_entered_at, never updated_at |
| src/node/failure-detector-control-plane-guards.js | M | +18/-12 | C | I5, I6 | observed-identity where-clause fields |
| src/node/failure-detector-replica-failures.js | M | +12/-13 | C | I1, I6 | MG failure CAS on observed identity/version (dormant debt #9) |
| src/node/failure-detector.js | M | +27/-0 | C | I1, I6 | partition failure submits intent to ReplicaStateMachine (module dormant: not constructed in src) |
| src/node/message-group-service-handler.js | M | +21/-12 | C | I1, I3, I5, I6 | removal passes the staged stoppedRow (generation fence) |
| src/node/replica-cleanup-tombstone-owner.js | A | +337/-0 | C | I2, I3, I6, I7, I8 | acquire/takeover/release exact cleanup token |
| src/node/replica-handler-class.js | M | +4/-0 | C | I2, I3, I7 | tombstone owner wiring |
| src/node/replica-handler-create-methods.js | M | +109/-6 | C | I1, I3, I4, I5, I6 | admission before createPartitionService; owner-RPC lifecycle observation |
| src/node/replica-handler-create-status-methods.js | M | +75/-69 | C | I1, I3, I6 | FAILED -> CREATING redrive from authoritative branded identity |
| src/node/replica-handler-lifecycle-methods.js | M | +7/-1 | C | I1, I7 | lifecycle debt handling |
| src/node/replica-handler-remove-execution-methods.js | M | +410/-210 | C | I1, I2, I6, I7, I8, I10 | REMOVING takeover; retireReplica passes runtime: service.raft (exact runtime) |
| src/node/replica-handler-remove-request-methods.js | M | +1/-0 | C | I1, I6 | removal request through lifecycle owner |
| src/node/replica-handler-removed-cleanup-sweep.js | M | +98/-34 | C | I2, I3, I7, I8 | startup sweep on frozen tokens; OWNED never deletes |
| src/node/replica-handler-runtime-metadata-methods.js | M | +10/-0 | C | I2, I5, I6 | row-owner construction; cleanup-aware metadata |
| src/node/replica-handler-runtime-methods.js | M | +100/-49 | C | I5, I6, I8 | empty-dir rmdir under exact token reread; artifact removal via one primitive |
| src/node/replica-handler-status-methods.js | M | +34/-34 | C | I1, I6 | ACTIVE admission settlement |
| src/node/replica-handler-transition-policy.js | M | +0/-27 | C | I1 | dead transition policy removed |
| src/node/replica-lifecycle-manager.js | M | +8/-101 | C | I1, I8 | legacy unlink path removed |
| src/node/replica-lifecycle-recovery.js | M | +22/-322 | C | I1, I6 | recovery submits intent; no lifecycle SQL |
| src/node/replica-recovery-service-row-admission.js | A | +96/-0 | C | I3, I4, I5, I6 | recovery INSERT with owner-required classification |
| src/node/replica-recovery-service.js | M | +33/-39 | C | I1, I3, I4 | INSERT-only recovery admission before open |
| src/node/replica-state-machine-authoritative-transition.js | A | +252/-0 | C | I1, I6, I7 | owner-RPC admission + exact destination readback (see CAS #2 note) |
| src/node/replica-state-machine-constants.js | M | +6/-1 | C | I1, I7 | outcome constants |
| src/node/replica-state-machine-create-persistence.js | A | +234/-0 | C | I1, I3, I6 | INSERT-only live row; lost-ACK exact observation |
| src/node/replica-state-machine-durability.js | A | +56/-0 | C | I1, I6 | durable outcome classification |
| src/node/replica-state-machine-leader-clear.js | A | +157/-0 | C | I1, I7 | generation-bound leader-clear debt |
| src/node/replica-state-machine-lifecycle-observation.js | A | +256/-0 | C | I1, I5 | durableRowVersion (state_entered_at canonical) + identity predicate |
| src/node/replica-state-machine-metrics.js | M | +42/-5 | C | I1, I7 | revision advance on clear |
| src/node/replica-state-machine-recovery.js | M | +595/-70 | C | I1, I7 | hydration rejects missing version; recovery ABA |
| src/node/replica-state-machine-registered-activation.js | A | +296/-0 | C | I1, I6, I7 | STOPPED->ACTIVE CAS; readback on identity+status+generation (not updated_at) |
| src/node/replica-state-machine-serialization.js | A | +131/-0 | C | I1, I7 | per-replica revision serialization |
| src/node/replica-state-machine-timeouts.js | M | +24/-0 | C | I1, I7 | timeouts revision-checked |
| src/node/replica-state-machine-transition.js | M | +503/-327 | C | I1, I6, I7 | ordinary CAS with full identity + state_entered_at |
| src/node/replica-state-machine.js | M | +214/-132 | C | I1, I7 | durable-generation owner facade |
| src/node/replica-storage-artifacts.js | A | +64/-0 | C | I6, I8 | sole replica artifact unlink primitive |
| src/partition/partition-committed-statement-outcome.js | M | +6/-0 | C | I6 | typed committed outcome |
| src/partition/partition-service-constants.js | M | +3/-3 | C | I1, I2, I5 | SERVICES column constants |
| src/partition/partition-service-core-base.js | M | +3/-3 | C | I4, I5 | live-row predicate |
| src/partition/partition-service-entry-apply-base.js | M | +10/-1 | C | I6, I9 | committed write identity carries origin HLC (consumed by NodeLifecyclePublication applied-row stamp) |
| src/partition/partition-service-incarnation.js | A | +33/-0 | C | I1, I3 | bounded monotonic created_at incarnation mint |
| src/partition/partition-service-metadata-mutation-helpers.js | M | +8/-1 | C | I5, I6 | partition role CAS on exact identity |
| src/partition/partition-service-row-owner.js | M | +167/-90 | C | I1, I3, I6 | INSERT-only live row stamped state_entered_at=created_at; activation delegated to RSM |
| src/partition/partition-service-schema-migration-base.js | M | +25/-0 | C | I2, I5 | SERVICES columns ensured |
| src/partition/partition-service-table-bootstrap.js | M | +32/-0 | C | I2, I5, I9 | ensureEndpointTableColumns adds endpoint boot_incarnation (0 legacy) |
| src/query/distributed/distributed-write-coordinator.js | M | +26/-11 | C | I6 | participant failure disposition |
| src/query/query-execution-budget.js | M | +6/-0 | C | I6 | typed outcome preserved |
| src/query/query-executor-partition-request-builders.js | M | +1/-0 | C | I6, I9 | originHlc passed through partition response |
| src/query/query-executor-shared.js | M | +6/-0 | C | I6 | typed outcome helpers |
| src/query/query-executor-sql-command-rendering.js | M | +103/-102 | C | I6, I9 | distributed mutation result keeps typed disposition and shared originHlc |
| src/query/runtime-replica-state-projection.js | M | +120/-14 | C | I1, I3, I5, I6 | identity-guarded update/delete; INSERT-only repair |
| src/query/sql-query-engine-routing-metadata-methods.js | M | +5/-8 | C | I5 | routing excludes cleanup rows |
| src/raft/peer-address-resolver.js | M | +2/-2 | C | I5 | cleanup rows are not peers |
| src/raft/raft-replica-base-runtime-helpers.js | M | +6/-2 | C | I5 | cleanup-aware runtime helpers |
| src/raft/raft-rs-lifecycle-administration.js | M | +4/-2 | R4 | I10 | retireReplica passes the exact runtime |
| src/raft/raft-rs-membership-administration.js | M | +7/-1 | R4 | I10 | peer-identity reservation unregister is compare-and-delete |
| src/raft/raft-rs-operation-port.js | M | +7/-3 | R4 | I10 | register/unregister runtime lifecycle by exact port |
| src/raft/raft-rs-replica-lifecycle-owner.js | M | +68/-13 | R4 | I10 | WeakMap port->owner; stale runtime terminal, never current-name fallback |
| src/rebalancer/rebalance-coordinator-reservation-lifecycle-methods.js | M | +70/-30 | C | unmapped | see Unmapped |
| src/rebalancer/rebalance-coordinator-shared.js | M | +1/-1 | C | unmapped | see Unmapped |
| src/rebalancer/storage-capacity-accounting-service.js | M | +3/-1 | C | I5 | capacity excludes cleanup rows |
| src/rebalancer/unified-rebalancer-critical-topology-methods.js | M | +7/-2 | R5 | I9 | critical-topology endpoint visibility on the current view |
| src/runtime/endpoint-sync-source-client.js | M | +11/-4 | R5 | I9 | sync source exports only current-incarnation endpoints (E1) |
| src/runtime/endpoint-sync-source-query.js | M | +9/-0 | R5 | I9 | selects boot_incarnation; SOURCE_NODE_INCARNATION_SQL |
| src/runtime/runtime-endpoint-publication-wiring.js | M | +55/-9 | R4 | I9 | runtime endpoint write/remove at node boot incarnation |
| src/storage/data-directory-process-owner.js | A | +75/-0 | C | I4 | BEGIN EXCLUSIVE process owner |
| src/transport/node-address-resolution.js | M | +16/-2 | R4 | I9 | dial address only from current-incarnation endpoints (cache + bootstrap snapshot) |
| src/transport/transport-registry.js | M | +9/-2 | R4 | I9 | delivery candidates only current-incarnation endpoints |
| src/wasm-service/wasm-service-replica.js | M | +10/-2 | C | I1, I5, I6 | WASM role/leader CAS on exact WASM identity |
| src/workflow/reconcile-queue-constants.js | M | +0/-1 | R1 | I9 | NODE_STATE_UPDATE_MESSAGE reconcile reason removed |
