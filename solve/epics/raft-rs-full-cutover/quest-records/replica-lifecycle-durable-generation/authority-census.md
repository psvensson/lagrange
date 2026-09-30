# Durable replica lifecycle destructive/authority census

## Snapshot scope (measured)

The implementation tree is HEAD `6831054b1916c9be4db6b13e2b8dec7ba2d03e0c` plus the uncommitted candidate, fingerprinted as `9a10ee2130713ca30ebe20563f6d4b8f777f12c3` (`refs/wip/replica-lifecycle-2026-09-29-r5-final`, the end of round 5). All counts come from `git diff 6831054b1 9a10ee213` and include the untracked files.

| Category | Paths | + | - |
| --- | --- | --- | --- |
| production `src/` | 177 (156 M, 21 A, 0 D) | 9,236 | 4,244 |
| tests (`test/`, excluding `test/shards`) | 259 | 11,979 | 3,254 |
| architecture/docs (`architecture/` 4, `docs/` 2) | 6 | 91 | 10 |
| scripts/tooling | 5 | 51 | 8 |
| generated metadata/inventory (`test/shards` 5, owner-debt `inventory.json` 1) | 6 | 1,047 | 254 |
| Quest records | 4 | 372 | 0 |
| **total** | **457** (411 M, 46 A, 0 D) | **22,776** | **7,770** |

Worktree versus snapshot: `src/` is byte-identical (177/177). `test/shards/impact-graph-seal.json` differs by 3/3 lines, from a metadata refresh made after the snapshot. Post-snapshot, pre-fingerprint: the two owner-approved amendments in `changed-src-ledger.md` (forwarding owner restored to base; D-1 fixed) make the frozen `src/` 176 files (155 M, 21 A), +9,203 / -4,237; the destructive-filesystem count is unaffected.

`changed-src-ledger.md` maps all 177 production files: 174 map to I1-I10 and 3 are listed as unmapped. The destructive-filesystem scan finds 34 effects. The earlier census also found 34, and base finds 41.

Invariant vocabulary (owner, verbatim): I1 generation-bound lifecycle; I2 rowless cleanup token; I3 creation/cleanup mutual exclusion; I4 admitted storage access; I5 marker non-replica; I6 classified side effects; I7 generation/token-bound debt; I8 one FS destruction owner; I9 incarnation-bound node projections; I10 exact runtime projection.

## Semantic owners

| # | Owner | Module(s) | Invariants |
| --- | --- | --- | --- |
| 1 | Replica lifecycle generation (`state_entered_at` via `durableRowVersion`; `updated_at` only as legacy fallback) | `ReplicaStateMachine` + `replica-state-machine-*` modules; `partition-service-incarnation.js` created_at mint | I1, I6, I7 |
| 2 | Rowless cleanup token (`cleanup_token` = cleanup-ownership generation on `services.service_id`) | `ReplicaCleanupTombstoneOwner` | I2, I3, I6, I7 |
| 3 | Live creation/admission (canonical SERVICES PK) | `PartitionServiceRowOwner`, `MessageGroupServiceRowOwner`, INSERT-only recovery/registration admission | I3, I4 |
| 4 | Storage access | `ReplicaHandler` admission + bootstrap wrappers; `data-directory-process-owner.js` (enforcement boundary) | I4, I5 |
| 5 | Physical destruction | `ReplicaHandler.cleanupReplicaResources` -> `removeReplicaStorageArtifacts`; the named exception is committed snapshot install | I6, I8 |
| 6 | **NodeLifecyclePublication**: the single semantic READY/CONNECTED owner of the NODES lifecycle columns (`status`, `connection_state`, `ready_lease_expires_at`, `last_heartbeat`, telemetry/budget) | `src/control-plane/node-lifecycle-publication.js`. The ingress adapters are Heartbeat (`heartbeat-service-publication-methods.js`, local) and ReplicaDispatch (`replica-dispatch-state-publication.js` / `-service-lifecycle.js`, routed NODE_STATE_UPDATE). The wire mapping is `node-lifecycle-publication-wire.js` | I9, I6 |
| 7 | **node-ready-lease-authority**: lease term grant / `isExpired` / `holdsLiveLease`. The currentness token is the pair (`ready_lease_expires_at`, `last_heartbeat`) | `src/control-plane/node-ready-lease-authority.js` | I9 |
| 8 | **node-terminal-transition-fence**: shutdown/withdraw final mutation `{node_id, boot_incarnation}`, with readback classification | `src/control-plane/node-terminal-transition-fence.js` | I9, I6 |
| 9 | **endpoint-incarnation-authority** (write/destroy protocol) + **endpoint-incarnation-currentness** (the one validity rule: endpoint `boot_incarnation > 0` and equal to the authoritative NODES incarnation) | `src/control-plane/owners/endpoint-incarnation-authority.js`, `.../endpoint-incarnation-currentness.js` | I9 |
| 10 | **Raft runtime-instance registry**: `WeakMap` from the exact operation port to its lifecycle owner. "Durable lifecycle generation is the persistent authority. Runtime-instance identity is the exact process-local projection of that generation." (module header) | `src/raft/raft-rs-replica-lifecycle-owner.js`, `raft-rs-operation-port.js`, `raft-rs-lifecycle-administration.js`, `raft-rs-membership-administration.js` | I10 |

Not owners:

- `data-directory-process-owner.js` is an enforcement boundary.
- `partition-service-incarnation.js` is a scalar primitive of owner 1/3.
- Registration incarnation advance (`NodeRegistrationOwner` / `MembershipPublicationRuntimeOwner.advanceJoinNodeBootIncarnation`) is the registration transition of the NODES row, not a second lifecycle publisher.
- Cache, routing, message-group, failure-detector, WASM and projection code consume the owners.

## SERVICES lifecycle CAS census (12)

These sites were regenerated from the code. Canonical generation is `durableRowVersion`: `state_entered_at` when finite, otherwise `updated_at` (legacy rows only). The raft-role publishers write only `{raft_role, updated_at}`: MG `message-group-service-metadata-publication.js:147-154`, partition `partition-service-metadata-mutation-helpers.js:218-225`, and WASM `wasm-service-replica.js`.

| # | Site (file:line) | Transition | Owner | Canonical identity | Expected source state | Generation fence | Fields that may change independently | Lost/unknown outcome authority |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `replica-state-machine-transition.js:557-567` (data `:682`) | any X->Y | ReplicaStateMachine | service_id, service_type, partition, node, replica, group, created_at (`buildLifecycleIdentityPredicate`) | tracked prior state | `durableVersionColumn` (`state_entered_at`), writes `state_entered_at` | raft_role, address, updated_at | RSM durable observation; non-authoritative predicate -> `OBSERVED_STATE_CHANGED`, no write |
| 2 | `replica-state-machine-authoritative-transition.js:44-70,178` (writes through #1) | FD/recovery intent X->Y | ReplicaStateMachine authoritative entry | same full identity | evidence status + exact version (owner-RPC reread) | `durableRowVersion`; destination = max(ts, G+1) | raft_role, address | owner-RPC reread: destination -> success; unchanged source -> deferred debt; else install observed, false. D-1 fixed (destination match on state_entered_at) |
| 3 | `replica-state-machine-registered-activation.js:119,147,155` | partition STOPPED->ACTIVE | ReplicaStateMachine (registered activation) | full identity | STOPPED | registration generation (`state_entered_at` = created_at, stamped at `partition-service-row-owner.js:218`); ACTIVE = G+1 | raft_role, updated_at | `matchesActivatedGeneration` = identity + status + generation (not `updated_at`) |
| 4 | `partition-service-row-owner.js:218,296` | partition registration INSERT | PartitionServiceRowOwner | full identity + created_at mint | row absent (PK) | births G (`state_entered_at = created_at`) | n/a | owner-required classification; exact collision seals observed STOPPED row |
| 5 | `message-group-service-row-owner.js:222-240` | MG STOPPED<->ACTIVE | MessageGroupServiceRowOwner | service_id, type, group, node, replica, created_at | expected status | `durableRowVersion(source)`, writes `state_entered_at` | raft_role, updated_at | `resolveActivationObservation` (identity; target status) |
| 6 | `message-group-service-row-owner.js:117,265` | MG registration INSERT lost-ACK readback | MessageGroupServiceRowOwner | service_id, type, group, node, status | n/a | compares created_at + `state_entered_at` (not `updated_at`) | raft_role, updated_at | `resolveMessageGroupRegistration` |
| 7 | `message-group-service-row-owner.js:293-298,458`; caller `message-group-service-handler.js:564-581` passes `stoppedRow` | MG STOPPED->deleted | MessageGroupServiceRowOwner | predicate #5 of the staged row | STOPPED | `durableRowVersion(stoppedRow)` (never `updated_at` unless legacy) | raft_role, updated_at | owner-required absence observation; G+1 present -> `SERVICE_IDENTITY_CONFLICT`. Cache ordering repaired at `system-table-cache-row-merge.js` / `-tombstone-store.js` |
| 8 | `replica-cleanup-tombstone-owner.js:133` / `:218-245` / `:286-296` | cleanup acquire / REMOVING takeover / release | ReplicaCleanupTombstoneOwner | service_id, cleanup type, partition, node | absent / `removing` / `cleanup_owned` | acquire: PK; takeover: REMOVING `durableVersionColumn`; release: `cleanup_token` + `updated_at` | none (no role publisher targets cleanup rows) | `requireCurrent` owner-RPC token observation (different legitimate generation owner: token) |
| 9 | `failure-detector-replica-failures.js:111` | MG replica -> FAILED | FailureDetector | observed identity | any observed | `updated_at` (no `state_entered_at` write) | n/a | none. **DORMANT**: FailureDetector is not constructed in `src` |
| 10 | `move-replica-handoff-owner.js:534-537` | handoff rollback | MoveReplicaHandoffOwner | requested kind/partition/node | requested status | `state_entered_at` if present else `updated_at` | n/a | classified gateway result |
| 11 | `service-registration-handoff-owner.js:360-364,548` | registered service previous-row CAS | ServiceRegistrationHandoffOwner | prior kind/logical identity | status | `state_entered_at` if present else `updated_at` | n/a | owner-required classification |
| 12 | `runtime-replica-state-projection.js:76,89,175` | runtime replica row update/insert/delete | runtime projection | service_id + expected kind/node/logical identity | none | **none** (identity only, last writer wins) | n/a | classified result. Out of class (no lifecycle generation), recorded finding for the runtime-service owner |

Invariant check: role, heartbeat and telemetry writers touch only `raft_role`/`updated_at` (#1-#7 fence on `state_entered_at`), so they cannot stale lifecycle evidence. #8 uses the token. #9 is dormant and #12 is out of class. The `updated_at` fallback survives only for rows without `state_entered_at`, which are legacy.

### Other SERVICES mutation sites (non-lifecycle or mechanics; lines verified)

| File:line | Operation | Classification |
| --- | --- | --- |
| `replica-state-machine-create-persistence.js:108` | INSERT live partition row | INSERT-only; same created_at mint; lost ACK -> owner-RPC exact observation |
| `replica-recovery-service-row-admission.js:52` | INSERT recovered row | INSERT-only before storage open |
| `message-group-service-row-owner.js:387` | INSERT MG row | INSERT-only; cleanup marker -> `CLEANUP_IN_PROGRESS` |
| `service-registration-handoff-owner.js:377` | INSERT registered service | INSERT-only; classified nonapply |
| `node-registration-owner-publication-methods.js:480` | INSERT join-admission service identity | INSERT-only via gateway |
| `wasm-service-replica.js:633,679` | UPDATE WASM role / leader | exact WASM identity |
| `message-group-service-metadata-publication.js:147-154` / `partition-service-metadata-mutation-helpers.js:213-225` | UPDATE raft_role | exact identity + role/`updated_at` CAS; non-lifecycle |
| `services-owner.js:32,36,44` | INSERT / UPDATE / DELETE delegates | UPDATE/DELETE require the caller's expected identity |
| `system-metadata-owner-base.js:445,458,471,485,499,512` | generic mechanics | SERVICES UPSERT unreachable (below) |
| `system-table-writer.js:28,35,41,69,75,81` | bootstrap/routed delegates | affected rows preserved; UPSERT only for non-SERVICES |
| `control-plane-system-table-gateway-mutation-submission.js:169` -> `...-query-execution.js:219-227` | `assertSystemTableMutationAllowed` | SERVICES UPSERT -> `SERVICES_UPSERT_FORBIDDEN` before backend selection |
| `cdc-integration-service-mutations.js:167-168` | CDC UPSERT boundary | same rejection |

Excluded: `partition-service-row-owner.js:267` updates PARTITIONS, and `node-registration-owner-publication-methods.js:522` is a generic non-SERVICES update.

## PartitionService/storage-open census (11)

| File:line | Candidate | Authority |
| --- | --- | --- |
| `bootstrap-service-replica-registration-methods.js:152` | `new PartitionService` factory body | installed into ReplicaHandler; never called before admission |
| `node-joining-publication-activation.js:250` | `new PartitionService` | `assertDurableRejoinStorageAdmission` at `:233` first |
| `seed-partitions-phase.js:241` | `new PartitionService` | virgin-genesis proof or exact live admission |
| `seed-registration-phase.js:199` | `new PartitionServiceRowOwner` | metadata only |
| `partition-service-activation.js:247` | `new PartitionServiceRowOwner` | metadata only; batch preflight before any mutation |
| `snapshot-catchup-wiring.js:149` | direct factory | exact live-row admission wrapper |
| `snapshot-catchup-wiring.js:213` | ReplicaHandler factory fallback | admitted create path |
| `startup-service-lifecycle-owner.js:43` | `new PartitionServiceAdapter` | adapter only |
| `replica-handler-create-methods.js:539` | `createPartitionService` | after INSERT-only admission / FAILED replay / owner-RPC proof |
| `replica-handler-runtime-metadata-methods.js:485` | `new PartitionServiceRowOwner` | metadata only |
| `raft/snapshot-catchup.js:390` | replacement factory | named committed-snapshot replacement; wiring admits |

Process enforcement: `lagrange-runtime-startup.js:730` acquires the data-directory owner, which is released at `:732` (unwind ledger) and `:746`. `data-directory-process-owner.js` holds `BEGIN EXCLUSIVE` for the runtime lifetime. The second-process witness is in `replica-lifecycle-durable-generation.test.js`.

## NODES writer census (by transition class)

Source: `test/control-plane/node-lifecycle-writer-census.js` `collectNodesMutationSites()` run on this tree returns **23 sites**, and every site is classified in `NODES_TRANSITION_OWNERS`. It covers INSERT/UPDATE/REPLACE/DELETE, gateway verbs, owner verbs and raw SQL. The allow-list is a ratchet, not permission. The test asserts:

- no unclassified site;
- no stale entry;
- exactly one LIFECYCLE_PUBLICATION owner;
- DORMANT_DEBT modules are imported only by `src/node/index.js` / `src/rebalancer/index.js`.

| Class | Writer (site) | Transition | Semantic owner | Exact identity | Source-state fence | Generation/currentness fence | Lost-outcome authority | Runtime reachable |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| LIFECYCLE_PUBLICATION | `node-lifecycle-publication.js:527` `applyPublication` (CAS `:232-240`) | CONNECTED liveness / READY promotion + lease grant + telemetry/budget | NodeLifecyclePublication (sole) | node_id + boot_incarnation + created_at | status + connection_state | `last_heartbeat` (strictly advancing watermark) | owner-RPC (`OWNER_RPC_REQUIRED`, leader REQUIRED) readback -> applied / resolved-by-readback / NOT_APPLIED / REFUSED_STALE_INCARNATION / REFUSED_*; no retry queue | yes: Heartbeat (local) + ReplicaDispatch (routed) |
| REGISTRATION | `node-registration-owner.js:84` `registerNodeInCluster`; `node-registration-owner-publication-methods.js:444` `upsertJoinPublicationRow`, `:686` `upsertSystemTableRowWithRetry`; `membership-publication-runtime-owner.js:142` `upsertJoinNode` | joiner row birth JOINING/CONNECTED at this boot | NodeRegistrationOwner | node_id; row stamped with positive boot_incarnation (`node-registration-owner-row-builder.js`) | authoritative absence read first (an existing row takes the advance path) | none in the UPSERT (check-then-act; one process per data directory) | join-admission mutation classifier + membership visibility wait | yes |
| REGISTRATION (seed) | `node-storage-budget-service.js:218` `registerNodeBudget` | seed row birth + budget | seed bootstrap | node_id + incarnation stamped | seed bootstrap only | none (UPSERT) | bootstrap failure fatal | yes (seed) |
| INCARNATION_ADVANCE | `membership-publication-runtime-owner.js:158` `advanceJoinNodeBootIncarnation` | observed older boot -> this boot; reentry JOINING/CONNECTED; lease cleared | NodeRegistrationOwner (durable rejoin / resumed join) | node_id | observed row | CAS on observed `boot_incarnation` | readback: advanced / stale (terminal) / `NODE_BOOT_INCARNATION_ADVANCE_NOT_OBSERVED` (defer) | yes |
| LEASE_EXPIRY | `heartbeat-service-publication-methods.js:535` `disconnectNodeDueToLeaseExpiry` | READY -> DISCONNECTED, lease null | LeaseService sweep via lease authority | node_id | observed lapsed `ready_lease_expires_at` | observed (`ready_lease_expires_at`, `last_heartbeat`) pair | zero rows = superseded; next sweep rereads | yes |
| TERMINAL | `heartbeat-service-lifecycle-methods.js:417` `writeShutdownRowAtIncarnation` | graceful shutdown -> STOPPED/DISCONNECTED, lease null | HeartbeatService shutdown | node_id + boot_incarnation in the final mutation | none beyond incarnation | exact boot_incarnation | node-terminal-transition-fence readback | yes |
| TERMINAL | `node-registration-owner-publication-methods.js:545` `writeNodeWithdrawalAtIncarnation` | failed join -> STOPPED/DISCONNECTED | NodeRegistrationOwner | node_id + boot_incarnation | none beyond incarnation | exact boot_incarnation | fence readback; refused-stale skips endpoint withdrawal | yes |
| TERMINAL | `lease-service.js:507` `reapStrandedJoiningRows` (predicate `:140-148`) | stranded JOINING -> STOPPED | LeaseService reaper | node_id + observed boot_incarnation | status JOINING | observed (`ready_lease_expires_at`, `last_heartbeat`); a renewal fails the CAS | `classifyControlPlaneMutationResult`; not applied -> `REAPER_SKIPPED_OBSERVATION_SUPERSEDED`, no endpoint reap, no event | yes |
| PRIVILEGED_OPERATOR_REPAIR | `cli/admin-cli-action-methods.js:471` `updateNodeStatus` (`UPDATE nodes SET status = ?1 WHERE node_id = ?2`) | operator drain/activate | operator | node_id | none | **none: documented bypass** of incarnation, lease and lost-outcome. READY from draining is still refused by the owner's source policy | operator sees result / not-found | yes (admin query channel) |
| PRIVILEGED_OPERATOR_REPAIR | `cli/admin-cli-action-methods.js:487` `removeNode` (`DELETE FROM nodes WHERE node_id = ?1`) | operator row removal | operator | node_id | none | **none: documented bypass** | operator sees result | yes |
| NON_LIFECYCLE_COLUMNS | `topology/latency-group-manager.js:563` `persistNodeAssignment` | latency topology columns | topology | node_id | n/a | n/a | n/a | yes |
| DORMANT_DEBT (9) | `failure-detector.js` `handleNodeSuspicion` / `handleNodeFailure` / `handleNodeRecovery`; `node-lifecycle-service.js` `registerNode` / `updateHeartbeat` / `removeNode`; `node-reintegration-service.js` `completeReintegration` / `failReintegration`; `storage-capacity-migration.js` `backfillNodeBudgets` | legacy SUSPECTED/FAILED/ACTIVE, register/heartbeat/remove, reintegration, budget backfill | none live | - | - | - | - | **no**: imported only by package indexes (asserted); re-exported by `public-api.js` for library consumers |

No two live writers own the same transition:

- joiner birth and seed birth are distinct;
- the three TERMINAL writers have distinct triggers;
- READY/CONNECTED has exactly one owner (asserted).

## Endpoint writer census

Source: `test/control-plane/endpoint-writer-census.js` `collectEndpointMutationSites()` returns **13 sites**, all classified. Excluded are the authority itself and `endpoint-metadata-owner-base.js` (generic mechanics). An unlisted site fails, and dormant writers must have no caller. Schema: `node_endpoints.boot_incarnation` / `service_endpoints.boot_incarnation` `INTEGER NOT NULL DEFAULT 0` (`system-table-runtime-schema-definitions.js`). Existing tables are migrated by `partition-service-table-bootstrap.js` `ensureEndpointTableColumns`. The value 0 is legacy and never current (fail closed).

| Site | Owner | Operation | Logical identity | Incarnation source | Destructive predicate | Lost-outcome handling | Exception |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `node-registration-owner-publication-methods.js:228` `registerNodeEndpoint` -> `membership-publication-runtime-owner.js:177` `writeJoinEndpointAtIncarnation` (+ its `insert` adapter) | registration | birth / advance node endpoint | `ep-<node>-ws` | registration boot incarnation | n/a: INSERT birth or CAS `{endpoint_id, observed incarnation}` | authoritative reread; an older owner gets one CAS advance; a newer one is refused | none |
| `node-registration-owner-durable-rejoin-methods.js:306` `advanceReusedEndpointRows` (through `upsertSystemTableRowWithRetry` -> `writeJoinEndpointAtIncarnation`) | registration | advance reused node + meta rows with the node | same ids | registration boot incarnation | n/a | as above; not advanced -> `NODE_BOOT_INCARNATION_ADVANCE_NOT_OBSERVED` | none |
| `meta-service-definition-registration.js:117` `registerBuiltInMetaServiceEndpoints` / `stampThisBoot` | registration (joiner) / seed bootstrap | meta endpoint rows | per (meta service, node) | caller boot incarnation | n/a | joiner: through the authority, and failure fails registration | seed callback writes only on a virgin cluster (no prior row can exist) |
| `heartbeat-service-publication-methods.js:279` `writeNodeEndpointAtIncarnation` | heartbeat | birth / refresh node endpoint | `ep-<node>-ws` | process boot incarnation | n/a | cache observation + authoritative readback; stale -> skipped (`ENDPOINT_WRITE_NOT_CURRENT`) | none |
| `runtime-endpoint-publication-wiring.js:105` `writeRuntimeEndpointAtIncarnation` (+ `insert`) | runtime lifecycle | runtime service endpoint birth/refresh | `<service>-ep-<node>` | node boot incarnation (`RuntimeServiceHandlerSetup` via `guarded-runtime-service-handler.js`) | n/a | as above | none |
| `runtime-endpoint-publication-wiring.js:136` `removeRuntimeEndpointAtIncarnation` | runtime lifecycle | DELETE runtime endpoint | `<service>-ep-<node>` | node boot incarnation | `DELETE {endpoint_id, boot_incarnation}` | applied/absent -> done; own row present -> not applied; other incarnation -> stale, never retried | none |
| `node-registration-owner-publication-methods.js:558` `withdrawEndpointAtIncarnation` | failed-join withdrawal | node endpoint INACTIVE / meta endpoints unhealthy | endpoint_id | registration boot incarnation | `UPDATE {endpoint_id, boot_incarnation}` | D3 rule; skipped when the node withdrawal was refused stale | none |
| `lease-service.js:457` `reapStaleRowEndpoints` | lease reaper | node + service endpoints inactive | node_id | observed reaped node incarnation | `UPDATE {node_id, boot_incarnation}` (legacy 0 matches only legacy rows) | best-effort, warn-only; runs only when the node reap applied | none |
| `control-plane/endpoint-service.js:89` `registerEndpoint` / `:156` `removeEndpoint` | EndpointService | upsert/delete service endpoint | endpoint_id | none | by id | n/a | **DORMANT_DEBT**: constructed, no `src` caller (asserted) |

No privileged-repair endpoint writer exists.

## Endpoint reader census (two categories)

The census covers every `src` file naming an endpoint table: **80 files**, plus consumers found by tracing `nodeEndpointRows`/`endpointRows` (32 files). The validity rule has one definition: `endpoint-incarnation-currentness.js` `isEndpointCurrentForNode`. There is no scattered `endpoint.boot_incarnation === node.boot_incarnation` comparison, and 22 non-owner modules import the view or the authority.

### A. Semantic readers -> authority-filtered

| Reader | Decision it feeds | How filtered |
| --- | --- | --- |
| `transport/transport-registry.js` `getEndpointsForNode` | delivery candidates | `isEndpointCurrentForNode` vs cached NODES row |
| `transport/node-address-resolution.js` (cache + bootstrap snapshot); consumed by `cdc-event-handler.js`, `cdc-integration-service-node-join.js` (node-join dial), `snapshot-catchup-wiring.js` (peer dial) | dial address | `isEndpointCurrentForNode` |
| `bootstrap-service-runtime-methods.js`, `node-joining-message-group-runtime-delegation.js` `hasPublishedLocalServiceEndpoints` | publication gating | `isEndpointCurrentForNode` vs own NODES row |
| `admin/admin-service-discovery.js` (feeds `runtime/service-discovery-catalog.js`, the only caller) | service discovery for traffic | `isEndpointCurrentForNode` |
| `admin/admin-service-discovery-readiness-methods.js`, `admin/admin-preflight-snapshot.js` `serviceEndpointsCount` | discovery repair policy | `readCurrentEndpointRows` |
| `control-plane/active-node-projection.js` `hasCanonicalWebSocketEndpoint` (null NODES source -> none); consumers `membership-publication-coordinator-planning.js`, `-planning-evidence.js`, `-coordinator-queue.js`, `-active-gate-reconcile.js`, `admin-control-snapshot-local-build-base.js`, `-repair-orchestration.js`, `-membership-publication-reconcile.js` | active-node / membership publication | `selectCurrentEndpointRows` |
| `control-plane/readiness-planning-global-projection.js` | readiness planning projection | `hasCanonicalWebSocketEndpoint(..., nodeRows)`; NODES read whenever an endpoint view is rebuilt |
| `control-plane/readiness-planning-table-impact-classification.js` `canReuseDirectGlobalProjection` | projection reuse | reuses only if `endpointIncarnationOf` is unchanged (R5 production-gap fix) |
| `control-plane/control-plane-readiness-service-node-methods.js` (x2) | readiness | `readCurrentEndpointRows` |
| `bootstrap/join-readiness-snapshot-methods.js` | join readiness | `readCurrentEndpointRows` |
| `bootstrap/owners/bootstrap-cluster-view-owner.js` | cluster view | `readCurrentEndpointRows` |
| `rebalancer/unified-rebalancer-critical-topology-methods.js`; raw rows from `unified-rebalancer-priority-readiness.js:580-587` | critical-topology visibility | `selectCurrentEndpointRows` |
| `admin/admin-control-snapshot-coverage-gap-evaluation.js`; `admin/admin-shared-metadata-consistency.js` (fed by `admin-control-snapshot-node-view-projection.js:656`) | coverage gap / repair | `selectCurrentEndpointRows` |
| `runtime/endpoint-sync-source-client.js` (E1) | endpoint sync export/advertise | `selectCurrentEndpointRows` vs `SOURCE_NODE_INCARNATION_SQL` |
| `bootstrap/shared/node-registration-owner-durable-rejoin-methods.js:433-438,552-585` (own endpoint rows) | durable-rejoin advance | **authority-mediated through the write protocol**: CAS on the observed incarnation, not the view (see D-4) |

The aggregate toggle `active-node-projection.js:129` `hasCanonicalWebSocketEndpoints` ("any websocket endpoints exist") stays on raw rows deliberately. Filtering it would switch the requirement off and weaken readiness. The per-node check uses the current view.

### B. Observational exceptions (recorded)

| File | Why it cannot affect behaviour | Raw vs current |
| --- | --- | --- |
| `cache/system-table-cache-observation-methods.js:287,299` `getEndpointsForNode` / `filterEndpointsByStatus` | zero `src` callers (E3 structural witness, `endpoint-reader-currentness.test.js`) | raw history |
| `admin/admin-runtime-service-views.js`, `admin/admin-meta-command-handlers.js`, `admin/admin-websocket-api-shared.js` (`ADMIN_CACHE_OBSERVATION_TABLES`) | operator SQL/table listing | raw; no "current" claim |
| `cli/core/remote-cache.js`, `remote-cache-service-rows.js`, `view-manager.js` | operator display | raw |
| `admin/admin-preflight-snapshot.js` `nodeEndpointsCount` | display count only | raw |
| `rebalancer/priority-recovery-visibility-decision.js` | CDC wake trigger; the woken reconcile reads the current view | table name only |
| `readiness-planning-semantic-generation.js`, `readiness-planning-version-contract.js`, `membership-planning-version-key.js`, `control-plane-readiness-node-liveness-methods.js`, `membership-publication-row-contract.js`, `membership-publication-coordinator-reconcile.js`, `admin-authoritative-repair-policy.js`, `admin-control-snapshot-leadership-summary.js`, `service-leader-readiness-owner.js`, `wait-for-leadership-phase.js`, `seed-cache-hydration-phase.js` | change-detection keys / table-name lists; no endpoint values | n/a |
| `cache/cdc-table-policy.js`, `cache/cdc-propagation-delivery-profile.js`, `bootstrap/owners/bootstrap-request-owner.js` (snapshot serving), `bootstrap/node-joining-cdc-subscription-and-backfill.js` (table filter) | row transport; consumers resolve through the view | raw transport |

Not readers:

- writers in the writer census, plus `node-endpoints-owner.js`, `service-endpoints-owner.js`, `runtime-endpoint-writer.js`, `service-endpoint-builder.js`, `query-system-state-phase.js`, and `node-registration-owner.js` (seeds its own rows into the cache);
- schema/constants files, `partition-service-table-bootstrap.js` (migration) and `partition-sql-parser.js`;
- comments and error strings: `connect-websocket-phase.js`, `cdc-integration-service-shared.js`, `transport-provider.js`, `websocket-transport-provider.js`, `runtime-service-handler-setup.js`, `service-runtime-lifecycle.js`;
- `endpoint-sync-source-query.js` (query builder; its client filters);
- `service-install-catalog-contract.js:490` (owner/table reference descriptor, no values).

## Raft registry operation census

| Operation | Site | Exact vs current |
| --- | --- | --- |
| register | `raft-rs-operation-port.js` `registerRuntimeLifecycle(port, lifecycle)` -> `RUNTIME_LIFECYCLE_OWNERS.set` (`raft-rs-replica-lifecycle-owner.js:182`) | exact runtime instance (one port per opened runtime) |
| exact lookup | `retireReplicaLifecycle({runtime, groupId, replicaIdentity})` (`:210`) | exact. Absent -> `NOT_MANAGED` `runtime-generation-not-registered` (terminal stale, no fallback); wrong group/replica -> `CORE_REFUSED` `lifecycle-identity-mismatch` |
| current lookup | **none** in the registry | n/a |
| remove / shutdown | `port.close` -> `unregisterRuntimeLifecycle(port, lifecycle)` (`:192`, compare-and-delete) | exact |
| retire | `replica-handler-remove-execution-methods.js:213` -> `raft-rs-lifecycle-administration.js:7` `retireReplica(id, reason, {groupId, runtime: service.raft})` | exact: the captured G1 service port |
| delayed callback | the removal action runs under the durable removal guard and names its captured runtime | exact |
| peer-identity reservation | `raft-rs-membership-administration.js` `RESERVATION_OWNERS` Map keyed (group, replica): unregister is compare-and-delete; `reservePeerIdentity` (sole caller `partition-service-raft-membership-administration.js:38`) is an **intentionally current, non-destructive** lookup into the append-only identity map | exact removal; current read is non-destructive |
| runtime-owner `groups` Map (`raft-rs-runtime-owner.js:179`) | keyed by a unique per-runtime key | exact |

The code has no destructive current-name operation, and the registry keeps no durable state. The provider request (`RAFT_PARTITION_NODE_REQUEST`) is unchanged: `created_at` is not threaded, per the owner decision of round 5. Witness: `lifecycle-registry-runtime-generation.test.js` (5 behavioural tests, plus structural test #6: no Map in the owner module, WeakMap by runtime, and every `src` retire passes a runtime).

## Destructive filesystem census (34)

The expression `\b(unlink|unlinkSync|rm|rmSync|rmdir|rmdirSync|rename|renameSync)\s*\(` over `src` finds **34** effects. The earlier census found 34 as well, with identical file:line for every entry. Base `6831054b1` finds 41. The repair added no effect.

| File:line | Effect | Authority |
| --- | --- | --- |
| `node/replica-storage-artifacts.js:42` | unlink DB/WAL/SHM/journal | sole replica artifact primitive; exact cleanup token owner-RPC reread before each effect |
| `node/replica-handler-runtime-methods.js:44` | rmdir empty partition dir | exact token reread |
| `raft/snapshot-install.js:118,123,125,212,215` | marker/staging removal; live sidecars; rename staged -> live | named committed-snapshot replacement exception |
| `raft/snapshot-checkpoint-store.js:238,300,322` | staging dir / sidecar / payload rename | generation-addressed checkpoint owner |
| `raft/snapshot-retention.js:98,100,102` | retained generation manifest/payload/dir | retention owner |
| `raft/snapshot-transfer-receiver.js:147,300,398` | stale entry / session dir / payload rename | transfer-session owner |
| `service/installable-component-cache.js:89,91` | temp rename / unlink | component cache, non-replica |
| `service/service-local-oci-layout-builder.js:652,657,673,773` | OCI temp | non-replica |
| `cli/service-project-build-input.js:346,405,443,449,563` | CLI build temp | non-replica |
| `cli/service-scaffold-writer.js:75` | scaffold target | non-replica |
| `runtime/oci-host-agent-durable-files.js:180,211` | durable file rename/unlink | non-replica |
| `bootstrap/rejoin-hints.js:225`, `bootstrap/startup-workflow-store.js:141` | atomic metadata rename | not replica artifacts |
| `storage/data-directory-manager.js:119` | writability probe | pre-replica |
| `test-helpers/port-allocator.js:206` | port lock dir | test-only |

## Recovery/rejoin/seed/snapshot/projection/hydration census

| Site | Authority |
| --- | --- |
| `replica-state-machine-recovery.js` `hydrateRecoveryState` | rejects a missing durable version before state/revision |
| `replica-recovery-service-row-admission.js:52` | INSERT admission precedes PartitionService open |
| `replica-recovery-service.js` local recovery | positive live partition-replica filter; marker never hydrated |
| `durable-rejoin-storage-admission.js:23` (called at `node-joining-publication-activation.js:233`, restore planner) | OWNER_RPC + leader REQUIRED exact live identity/version |
| `seed-startup-storage-admission.js:8` | frozen authoritative SERVICES evidence; virgin empty genesis or exact live row |
| `seed-partitions-phase.js` per-partition admission | marker -> typed defer; conflict fails closed |
| `snapshot-catchup-wiring.js:147-149` | exact live-row admission wraps every replacement factory |
| `replica-handler-runtime-methods.js` startup marker snapshot / `replica-handler-removed-cleanup-sweep.js` | frozen tokens; OWNED never deletes |
| `replica-handler-remove-execution-methods.js` | exact REMOVING generation becomes marker before physical effect; retires the exact runtime |
| `runtime-replica-state-projection.js` | identity-guarded; INSERT-only repair; marker never projected live |
| `system-table-cache-authoritative-reconciliation.js:88` | cleanup completeness separate from live alignment |
| `constants/service.js:16` | the single row classifier |

## Remaining literal cleanup checks

| File:line | Literal | Reason |
| --- | --- | --- |
| `constants/service.js:20` | `service_type === PARTITION_CLEANUP` | the canonical classifier |
| `cache/system-table-cache-authoritative-reconciliation.js:21,88` | `cleanup_owned` | marker completeness after classification |
| `node/replica-cleanup-tombstone-owner.js` | cleanup kind/status constants | canonical marker owner |
| `node/replica-handler-runtime-methods.js:13` | `CLEANUP_STORAGE_AUTHORITY_KIND = 'cleanup_owned'` | in-memory storage-authority token kind |

No other `=== / !== SERVICE_TYPE.PARTITION_CLEANUP` exists in `src` (grep).

## Static conclusions

- There is one ordinary replica-storage destruction chain, and one named canonical-storage exception: committed snapshot install.
- There are zero live partition DELETE authorities and zero applying SERVICES UPSERT paths.
- There is one semantic NODES lifecycle publisher. The other live NODES writers are distinct classified transitions, except the admin CLI, which is an explicit privileged bypass.
- Every endpoint writer and destructor carries the exact incarnation, apart from one dormant writer with no caller. Every semantic endpoint reader goes through the one currentness rule.
- The Raft registry is keyed by the exact runtime instance, and the code has no current-name destructive operation.

## Inherited reds (exact signatures, accepted as inherited per owner decision 2026-09-29 round 5)

| Test | Signature | Base evidence |
| --- | --- | --- |
| `test/rebalancer/dt6-ledger-spread-follow-up-dispatch-arming.test.js` subtest 7 ("part 2: a wake whose transport ACK carries noHandler routes into the WARNING retry lane...") | `not ok 1 "Message not acknowledged"`, returned-promise rejection at `OperationWorkflowOwner.wakeCoordinatorCreatedRemoteOwner`, `src/rebalancer/operation-workflow-owner-handoff-state.js:306` | identical on base and candidate |
| `test/simulation/formation-sim-runner.test.js`, `formation-sim-attribution-isolation.test.js` | process aborts before any TAP result: uncaught `Error: formation_execution_node_unbound` from `FormationTurnAttribution.assertActiveSegmentExecutionNodeBound` (refusedOwner raft_protocol, depth 2, via `LifeRaft.promote` -> heartbeat) | identical on base and candidate |
| `test/scripts/impact-proof-cone-producer.test.js` "producer serializes the exact canonical emitted module closure" | `ENOENT` stat `<tmp>/proof-cone-producer-*/src` | red on base worktree and lab snapshot worktrees, green in o1-gate: environment/checkout-dependent |
| `test/admin/admin-control-snapshot.test.js` | 5 leaf failures in top-level tests 26 ("falls back to durable published membership from ack-pending convergence..."), 30 ("falls back to repaired publication rows when publication services return null..."), 78 ("default snapshots keep published membership recovery local after a cache miss on a pending publication") | identical at base `6831054b1`, `752b17715` and `5d6f58f9b` (see D-6 for the 4-vs-5 count) |
| `test/rebalancer/replace-real-group-completion.test.js` (AN11) / `replace-real-group-scheduling.test.js` (S14) | `not ok 1 - timeout! expired: TAP` at the 30 s tap file budget under CPU contention | isolated paired runs show no systematic slowdown; base reproduced (scheduling 31.8 s) |
| `test/rebalancer/replace-replica-workflow.test.js` subtest 25 assertion 3 ("the owner re-drives REMOVE_PEER through the witness") | 200-`setImmediate`-turn settle versus a timer-scheduled re-drive; bimodal | base 2/20 miss vs candidate 3/20 |

## Open recorded debt

| Item | State |
| --- | --- |
| `classifyNodeFallbackImpact` treats every NODES UPDATE as non-semantic for caches without revision tracking | Pre-existing design. Production `SystemTableCache` is revisioned and takes the shadow path. Not repaired |
| Stranded reaper / failed-join withdraw endpoints | **Closed**: now fenced by incarnation (`lease-service.js:457`, `node-registration-owner-publication-methods.js:558`) |
| Message-group movement class (chooser authority, MOVE_REPLICA handoff, phantom voters, JOINING voting) | handed to quest `message-group-leader-safe-movement` |
| Forwarded-message completion | handed to `message-group-forward-completion-propagation`; transport fix `c3cfd229f` stays out of the candidate |
| "Any websocket endpoints exist" toggle (`active-node-projection.js:129`) on raw rows | deliberate (above) |
| Runtime replica projection (CAS #12) has no lifecycle fence | out of class; runtime-service owner |
| FailureDetector MG failure (CAS #9) and NODES DORMANT_DEBT writers | dormant; asserted unreachable |
| NULL `ready_lease_expires_at` reads as expired in the lease sweep (`Number(null)=0`) | base behaviour, kept |
| `message-group-forwarding-owner.js` `requiredCompletionKind` + returned delivery result | CLOSED: restored to base before the fingerprint (owner decision) |

## Disagreements between code and the implementer's tables

| ID | Implementer record | Code | Effect |
| --- | --- | --- | --- |
| D-1 | CAS #2 "exact destination readback: OK" | `expectedLifecycleDestination` (`replica-state-machine-authoritative-transition.js:44-66`) includes `previous_state` and `updated_at`, and `rowMatchesLifecycleDestination` (`:68`) compares every field. If a raft-role write bumps `updated_at` after a lost-ACK applied transition, the destination no longer matches, so the call installs the observed row and returns false. | FIXED before the fingerprint (owner decision): destination match = identity + status + previous_state + state_entered_at; witness red with updated_at restored. The one remaining updated_at matcher, `replica-cleanup-tombstone-owner.js` `rowMatchesCleanupAuthority` (cleanup_token + updated_at), is the cleanup-token generation domain, not this class |
| D-2 | round 3: "22 live-or-dormant sites" | the collector returns 23, and the census table lists 23 | count only |
| D-3 | NodeLifecyclePublication applied = canonical classifier (implied by the round-4 note about the reaper and D3 fence) | `applyPublication` (`node-lifecycle-publication.js:539`) requires an explicit `affectedRows > 0`. Success without a count goes to readback | fail-safe; different "applied" judgement from the reaper, fence and endpoint authority |
| D-4 | reader census A lists the "durable-rejoin own-endpoint read" as authority-filtered | reads raw rows (`node-registration-owner-durable-rejoin-methods.js:433-438,552-585`) without the currentness view; currentness comes from the write protocol (CAS on the observed incarnation) | classified here as authority-mediated semantic |
| D-5 | reader census does not name `service-install-catalog-contract.js` | names `TABLES.SERVICE_ENDPOINTS` in a state-reference descriptor (`:490`) | not a reader |
| D-6 | round 4 / owner: admin-control-snapshot "x4" subtests | round 5 record: 5 leaf failures across top-level 26/30/78 | count differs; signature base-identical in both |
| D-7 | REGISTRATION writer: absence read first | the UPSERT itself carries no fence (check-then-act); exclusivity rests on one process per data directory | as recorded; the verifier may probe same-node-id processes on different hosts |
