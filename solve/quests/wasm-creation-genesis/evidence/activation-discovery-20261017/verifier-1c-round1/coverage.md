# Coverage model (verifier, stage 1c) - decisions x state x events x temporal

Legend: U = test/node/runtime-service-bound-route.test.js; P = test/runtime/service-runtime-consensus-publication.test.js;
Q = test/runtime/request-cell-definition-classification.test.js; N = test/wasm-service/bound-creation-handler-embedding.integration.test.js (native C6);
S1 = stage-1 natives (publication/genesis/reconciliation/retained); TRACED = no witness, mechanism read end to end; PROBE = verifier probe.

## CREATE route (RV2.2 order, RV3.3 resume table)

| # | Cell | Witness |
|---|---|---|
| 1 | retained creation answers HELD -> memo HELD, CREATE_HELD at CREATING, INITIATED reply, generic never ran | U C6-1; N C6-1 |
| 2 | retained PUBLISHED -> memo ACTIVE, CREATE_ACTIVE, manager RUNNING | U (second half of PUBLISHED_UNPROJECTED test); N C6-2 |
| 3 | PUBLISHED_UNPROJECTED confirmed by authority (slot PUBLISHED) -> memo HELD, CREATE_HELD, manager STARTING (RV4.1 CONFIRMED) | U |
| 4 | PUBLISHED_UNPROJECTED contradicted (slot not PUBLISHED) -> retire by creation, CREATE_FAILED CONTENT_CONFLICT (RV4.1) | U "Revision 4"; S1 P11 (forged PUBLISHED) |
| 5 | PUBLISHED_UNPROJECTED with authority UNRESOLVED (owner unreachable) -> UNKNOWN{reason} -> deferral | TRACED (`confirmPublishedAuthority` default -> `RESUME_OUTCOME.get(UNKNOWN)` DEFERRED) |
| 6 | UNKNOWN after retention (driver FAILED start) -> CREATE_FAILED + deferRetry + code, memo FAILED (RV3.2) | U |
| 7 | TERMINAL_OPERATION -> permanent CREATE_FAILED, no deferRetry | U |
| 8 | RESOURCE_CLOSED / CORRUPT_STATE / INVALID_REQUEST / recover-phase CONTENT_CONFLICT -> CREATE_FAILED with code | TRACED (`decideResume` default FAILED; `resumeCode` = outcome) |
| 9 | INTENT_NOT_FOUND x bound-class (real serialized row, binding_* null) -> BOUND_ROUTE_REQUIRED, no deferRetry, no generic | U C6-4 |
| 10 | INTENT_NOT_FOUND x native_js (journal present) -> generic path | U "native_js ... journal or not" |
| 11 | UNAVAILABLE (no journal) x native_js / x Cell -> generic path; x bound-class -> CREATE_FAILED + deferRetry UNAVAILABLE | U cell (a); U C6-5 (journal read fault) |
| 12 | INTENT_NOT_FOUND/UNAVAILABLE x built-in meta (sys-wasm-meta) -> generic path | TRACED (`BUILT_IN_META_SERVICE_IDS` = Object.values(META_SERVICE_ID)); implementer cites meta-service-lifecycle green (not the handler path) |
| 13 | duplicate CREATE while HELD, same operation id -> re-enter once, IN_PROGRESS | U (C6-3 in test 2); N C6-3; U F9 (in-flight guard) |
| 14 | duplicate CREATE while HELD, DIFFERENT operation id | UNCOVERED; PROBE P1 (finding V-F1) |
| 15 | CREATE while memo ACTIVE -> ALREADY_EXISTS + CREATE_ACTIVE | pre-existing handler test (unchanged body) |
| 16 | CREATE while memo FAILED (after a deferral) -> proceeds (re-enterable) | TRACED (`replyToExistingReplica` null for FAILED); not directly witnessed |
| 17 | definition row absent (cache lag) x no retained creation -> `isBoundClassDefinition(null)` false -> generic -> DEFINITION_NOT_FOUND FAILED (as today) | TRACED |

## Wake consumer (RV2.4, RV3.5)

| # | Cell | Witness |
|---|---|---|
| 18 | OBSERVED wake naming a HELD memo -> QUEUED, one re-entry | U |
| 19 | wake while a re-entry is in flight -> RECORDED, consumed by exactly one further re-entry if still HELD | U (starts === 3) |
| 20 | wake naming no local operation -> NO_LOCAL_OPERATION, nothing runs | U C6-10 |
| 21 | wake for an ACTIVE/FAILED memo -> SETTLED/RECORDED, no re-entry | TRACED |
| 22 | RESOURCE_CLOSED wake for a HELD/REMOVING memo -> RECORDED, no re-entry | TRACED (`findWakeTarget` row 3) |
| 23 | RESOURCE_CLOSED wake recorded on an in-flight CREATE -> re-entry if HELD | PROBE P3 (deviation from "CLOSED -> nothing local"; convergent) |
| 24 | GRANT_HELD wake -> same as OBSERVED | TRACED (reason not inspected except CLOSED) |
| 25 | wake without token (operationId undefined) | PROBE P2 (finding V-N2) |
| 26 | handler restart: memo empty -> NO_LOCAL_OPERATION | by construction of C6-10 (no memo); N C6-9 restarts the handler before REMOVE |
| 27 | enqueue-only: no await inside onCreationWake; setImmediate re-entry | READ (`consumeCreationWake` synchronous; `scheduleBoundReentry` setImmediate); N C6-2 exercises wake -> re-entry through the real continuation |

## REMOVE route (RV2.1, RV3.3 REMOVE table)

| # | Cell | Witness |
|---|---|---|
| 28 | memo names a creation; readRetainedCreation ADMISSION_RETAINED; retire closed:true -> endpoint removed, STOPPED projected, REMOVE_COMPLETED, memo REMOVED; never recoverConsensusCreation | U; N C6-7 (order endpoint-delete < CLOSED < row-delete read from the SQLite write log) |
| 29 | CLOSE_UNRESOLVED retired:true close HISTORY_UNAVAILABLE -> REMOVE_COMPLETED | U |
| 30 | INVALID_REQUEST/CONTENT_CONFLICT/INVALID_LINEAGE -> REMOVE_FAILED + code | U (INVALID_LINEAGE) |
| 31 | closed:false (other) -> REMOVE_HELD at STOPPING, memo REMOVING; next REMOVE re-drives through the journal-only read; recovers===0 | U C6-8/(b); N C6-8 (faulted close, then re-REMOVE) |
| 32 | NOT_ADMITTED (PENDING row) -> REMOVE_COMPLETED, no reserve, no physical effect | U cell (c) |
| 33 | readRetainedCreation UNAVAILABLE on REMOVE -> REMOVE_FAILED + deferRetry (memo FAILED, operationId kept) | TRACED (`READ_DECISION` UNAVAILABLE -> DEFERRED -> else branch of settleRemoval) |
| 34 | readRetainedCreation TERMINAL/CORRUPT/INTENT_NOT_FOUND on REMOVE -> REMOVE_FAILED + code | TRACED (F-5) |
| 35 | throw inside the bound REMOVE route -> REMOVE_HELD | TRACED (F-5) |
| 36 | REMOVE after handler restart: services row hint (replica_id, create_attempt_token) recovers the creation | U C6-9 (cache row authored); N C6-9 (row read through SQLite after a real restart) |
| 37 | REMOVE, no memo, no row -> NOT_FOUND | pre-existing handler test (body unchanged) |
| 38 | REMOVE while REMOVING with removal in flight -> IN_PROGRESS, no second start | pre-existing (unchanged) |
| 39 | unbound runtime_service row never carries create_attempt_token -> hint empty -> generic REMOVE unchanged | READ (projection handoff writes none; partition rows filtered by service_type) |

## Publication (RV1.3, RV2.3, RV3.1, RV3.3, RV3.4)

| # | Cell | Witness |
|---|---|---|
| 40 | PUBLISHED -> services row (service_id physical, service_type runtime_service, replica_id S-rN, group_id, create_attempt_token = creation op id, node_id, address = derived host, status active, cleanup_token null) | P (deep-equal); N (every host) |
| 41 | PUBLISHED -> endpoint row (id physical-ep-node, service_id S, metadata.service_name S, binding_digest, resource_token digest, boot_incarnation) | P; N (id, service_id, service_name, address, port) |
| 42 | one mark, keyed by the exact token, carrying the projected service_type | P; N (token mismatch -> NOT_REGISTERED, record ABSENT) |
| 43 | HELD projects nothing, marks nothing | P; N C6-1 (`NO_ROW_FOR_A_HELD_REPLICA`) |
| 44 | absent endpoint writer / absent projection writer -> PUBLISHED_UNPROJECTED PROJECTION_WRITER_ABSENT, no mark | P cell (i) |
| 45 | host unavailable -> PUBLISHED_UNPROJECTED ENDPOINT_HOST_UNAVAILABLE, no row | P |
| 46 | endpoint writer refused_incarnation_required -> PUBLISHED_UNPROJECTED | P |
| 47 | endpoint writer refused_stale_incarnation | P C6-11 (writer called directly, not through the bound START); TRACED through `writeEndpoint` same branch |
| 48 | endpoint writer authority_unavailable / not_applied | TRACED (`written.success === false` -> outcome) |
| 49 | endpoint writer throws -> PUBLISHED_UNPROJECTED ENDPOINT_WRITE_FAILED; services row already applied; re-drive UPDATE-first, one mark | P C6-6 |
| 50 | services-row projection throws -> SERVICES_ROW_PROJECTION_FAILED | TRACED (`_projectReplicaState` rethrows ACTIVE; `projectServicesRow` catch) |
| 51 | services-row projection retained:true -> SERVICES_ROW_PROJECTION_RETAINED (F-4 production owner) | TRACED; recorded RV4.5 |
| 52 | mark NOT_REGISTERED -> PUBLISHED_UNPROJECTED SERVICES_ROW_NOT_MARKED | P |
| 53 | PRESENT edge replays role (and leader node when leading) once; CAS APPLIED through the production predicate, read from the row | N (f): raft_role per host incl. leader; (h): first role write after the row INSERT |
| 54 | re-drive that finds PRESENT replays nothing | N (h) |
| 55 | leader change after PRESENT re-publishes | N (g) |
| 56 | one catalog group for S, observedReplicaCount 3, healthy 3 | N |
| 57 | late I endpoint write never touches J's row; stale incarnation refused | P C6-11 |
| 58 | unbound replica id still parses; no binding_digest; remover works | P |
| 59 | retirement: endpoint deleted by physical id with no logical resolution BEFORE driver stop; row deleted after CLOSED | P cell (d); N C6-7 |
| 60 | closed:false keeps the services row, endpoint already withdrawn | P; N C6-8 |
| 61 | STOPPED projection failing (best-effort, swallowed) | TRACED (`_projectReplicaState` non-ACTIVE catch) |
| 62 | endpoint removal failing / remover absent -> `endpointRemoval` {success:false} / null in the result | TRACED (`_removeEndpoint` catch returns {success:false}) |
| 63 | I retired then J created under S before I's PRESENT mark -> J never marked by I's token | N (mismatched token marks nothing: static form); the live interleaving itself UNCOVERED (traced: digest compare) |

## Address, dependencies, predicate, vocabulary

| # | Cell | Witness |
|---|---|---|
| 64 | endpointHost derived: host:port -> host; advertised WS wins; URL -> hostname; none -> null | P cell (e) |
| 65 | both rows carry the derived host on every host (incl. advertised-WS host 3) | N (e) |
| 66 | systemTableCache / creationWake lazy getters; no handler -> null (CONSUMER_ABSENT) | P |
| 67 | isRequestCellDefinition: serialized row (keys present, null) not a Cell; keys absent not a Cell; compiled Cell is; each lineage field alone is | Q |
| 68 | ReplicaStatus.HELD valid, peer-excluded, non-terminal; HELD outcomes UPDATE_STEP | U vocabulary; replica-status-completeness (superseded by appending) |
| 69 | readRetainedCreation table: INTENT_NOT_FOUND, ADMISSION_RETAINED (token/intent equal), TERMINAL before token, CONTENT_CONFLICT, UNAVAILABLE (fault), NOT_ADMITTED (PENDING), unwired manager UNAVAILABLE for read and resume | U |

## Stage-1 supersessions (F-2 / RV4.3) - what each `publications === []` still pins

- retained fixture sinks: nested journal always refused+recorded; ACTIVE projection or endpoint write for a replica NOT serving under the physical id refused+recorded; applied for the serving replica (new, this stage's claim); STOPPED projections accepted for any replica (needed by retirement; not named in RV4.3's sentence - recorded N).
- genesis `assertHeld` / reconciliation `assertServed`: "no leader publication queued" for non-PRESENT replicas; PRESENT leader pins its nodeId (a positive assertion of the replay).
- conformance allowlist: `markServicesRowPresent` appended (prototype surface pinned otherwise).
- mock managers: `resumeConsensusCreation` -> UNAVAILABLE (production shape; generic path).
