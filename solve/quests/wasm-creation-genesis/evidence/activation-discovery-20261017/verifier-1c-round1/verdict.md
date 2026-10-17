# Verifier verdict, stage 1c (`wasm-creation-genesis`): node-side bound CREATE/REMOVE routes, discovery rows, PRESENT mark, wake consumer

Independent adversarial verifier (Fable). Subject: `git diff b3793c7e5 04f1a9112` minus the lead's documents
(design Revision 4, `closeout-plan-2026-10-17.md`, `composition-report-2026-10-17.md`,
`composition-verifier-verdict-2026-10-17.md`), read in `/mnt/data/peter/projects/.worktrees/verify-1c`
detached at `04f1a91129550c8c0bf54e509faddfda50528c45`. Specification: `ACTIVATION-DISCOVERY-DESIGN-20261017.md`
draft + Revisions 1-4 (latest wins) with the three stage-1c vet reports binding. Nothing committed, staged, pushed or
reset; every mutation restored byte-identically (sha256 before/after); the only worktree delta at hand-back is the
lead's `test/shards/impact-graph-seal.json` (three digest lines: `sourceDigest`, `producerInputDigest`,
`snapshotDigest`; expected). Every run went through `npm run test:file -- <file>` behind
`scripts/checks/wait-for-thermal-headroom.js` and a no-other-runner guard, one file at a time; a push-gate worktree run
belonging to someone else occupied the machine for about forty minutes (CPU up to 92C), during which I only read.

## 0. Frozen claim (RV1.1 as corrected by RV2.1-RV2.6, RV3.1-RV3.8, RV4.1-RV4.6)

Given an embedding supplying the owners CONTRACT-R2 names (port allocator, module mirror, `serviceDefinitionsOwner`,
time source, data directory, the manager's journal writer/readers, a `ServiceEndpointsOwner`, a services projection
target over component SQLite): a bound CREATE delivered to a node's real `RuntimeServiceHandler` resumes its retained
creation first (`resumeConsensusCreation` = recover + continue, one pass); HELD leaves the operation IN_PROGRESS with
`RUNTIME_SERVICE_CREATE_HELD` (UPDATE_STEP at CREATING, observation only) and a HELD memo; PUBLISHED projects the
services row (physical `service_id`, `service_type runtime_service`, `replica_id S-rN`, `group_id`,
`create_attempt_token` = creation operation id, `node_id`, `address` = the host derived by `resolveEndpointAddress`,
no `cleanup_token`) and the endpoint row (`${physical}-ep-${node}`, `service_id S`, `metadata.service_name S`,
`binding_digest`, `resource_token` digest) through the EXISTING projection owner and endpoint writer (binding-first,
one resolution shared with the remover), then marks the replica's services row PRESENT by exact token (one replay of
role, and leader node when leading, through the production CAS predicate reading `service_type` from the PRESENT
record), and emits CREATE_ACTIVE. PUBLISHED_UNPROJECTED (writer absent, host unavailable, projection failed or
retained, writer stale/incarnation-required/unavailable/not-applied, mark not registered) is confirmed against the
metadata owner like PUBLISHED (RV4.1): CONFIRMED keeps STARTING and maps to CREATE_HELD; CONTRADICTED retires by
creation. A bound REMOVE reads the creation journal-only (`readRetainedCreation`: no policy, reserve or metadata read)
and retires through `manager.stopReplica(handle)`; `closed === true` -> endpoint removed before CLOSED, STOPPED row
after CLOSED, REMOVE_COMPLETED; HISTORY_UNAVAILABLE close of a durable tombstone -> COMPLETED; permanent refusals ->
REMOVE_FAILED; every other `closed === false` -> REMOVE_HELD, memo REMOVING, next REMOVE re-drives; NOT_ADMITTED ->
COMPLETED; after a handler restart the services row's `replica_id`/`create_attempt_token` recovers the creation;
NOT_FOUND only when neither memo nor row names one. A CREATE naming no retained creation: bound-class definition
(installed `wasm_component`, not a request Cell by null-safe lineage, not a built-in meta service) -> typed
`BOUND_ROUTE_REQUIRED` (definitive) or the existing CREATE_FAILED + `deferRetry` (unavailable); any other class ->
the generic path byte for byte. The wake consumer is enqueue-only; a wake naming no local operation is
`NO_LOCAL_OPERATION`. Excluded: planner/coordinator and production wiring, deletion of the unbound shape, recovery
stage, request Cells' own path, OCI.

Oracle used: the component SQLite rows (`services`, `service_endpoints`, `wasm_operations`, `service_instances`) read
through a second connection; the real `ExecutorOutcomeEmitter`'s outcomes; the typed results of resume/REMOVE; the
discovery catalog over the endpoint rows.

## 1. Coverage model (decisions x state x events x temporal), every cell mapped

Legend: U = `test/node/runtime-service-bound-route.test.js`; P = `test/runtime/service-runtime-consensus-publication.test.js`;
Q = `test/runtime/request-cell-definition-classification.test.js`; N = `test/wasm-service/bound-creation-handler-embedding.integration.test.js`;
S1 = stage-1 natives; TRACED = no witness, mechanism read end to end; PROBE = verifier probe (`probes/facts.ndjson`).

| # | Cell | Witness |
|---|---|---|
| 1 | retained HELD -> memo HELD, CREATE_HELD@CREATING, INITIATED, generic never ran | U C6-1; N C6-1 |
| 2 | retained PUBLISHED -> memo ACTIVE, CREATE_ACTIVE, manager RUNNING | U; N C6-2 |
| 3 | PUBLISHED_UNPROJECTED confirmed -> memo HELD, CREATE_HELD, manager STARTING (RV4.1) | U |
| 4 | PUBLISHED_UNPROJECTED contradicted -> retire by creation, CREATE_FAILED CONTENT_CONFLICT | U "Revision 4"; S1 P11 |
| 5 | PUBLISHED_UNPROJECTED, authority UNRESOLVED -> deferral | TRACED |
| 6 | UNKNOWN after retention (driver FAILED) -> CREATE_FAILED + deferRetry + code, memo FAILED | U |
| 7 | TERMINAL_OPERATION -> permanent CREATE_FAILED | U |
| 8 | RESOURCE_CLOSED / CORRUPT_STATE / INVALID_REQUEST / recover CONTENT_CONFLICT -> CREATE_FAILED + code | TRACED (`decideResume` default) |
| 9 | INTENT_NOT_FOUND x bound-class (serialized row, binding_* null) -> BOUND_ROUTE_REQUIRED, no deferRetry, no generic | U C6-4 |
| 10 | INTENT_NOT_FOUND x native_js -> generic | U |
| 11 | UNAVAILABLE (no journal) x native_js / Cell -> generic; x bound-class -> deferral | U cell (a); U C6-5 |
| 12 | no retained creation x built-in meta (`sys-wasm-meta`) -> generic | TRACED (`BUILT_IN_META_SERVICE_IDS`) |
| 13 | duplicate CREATE while HELD, same id -> re-enter once, IN_PROGRESS; in-flight guard | U (C6-3), U F9; N C6-3; PROBE P4 |
| 14 | duplicate CREATE while HELD, DIFFERENT operation id | UNCOVERED; PROBE P1 -> finding V-F1 |
| 15 | CREATE while memo ACTIVE -> ALREADY_EXISTS | pre-existing handler test (body unchanged) |
| 16 | CREATE while memo FAILED (after a deferral) -> proceeds | TRACED |
| 17 | definition row absent x no retained creation -> generic -> DEFINITION_NOT_FOUND as today | TRACED |
| 18 | OBSERVED wake for a HELD memo -> QUEUED, one re-entry | U |
| 19 | wake while a re-entry is in flight -> RECORDED, consumed once | U (starts === 3) |
| 20 | wake naming no local operation -> NO_LOCAL_OPERATION | U C6-10 |
| 21 | wake for an ACTIVE/FAILED memo -> RECORDED, no re-entry | TRACED |
| 22 | RESOURCE_CLOSED wake for a HELD/REMOVING memo -> RECORDED, no re-entry | TRACED |
| 23 | RESOURCE_CLOSED wake recorded on an in-flight CREATE -> one re-entry if HELD | PROBE P3 -> V-N3 |
| 24 | GRANT_HELD wake -> as OBSERVED | TRACED |
| 25 | wake without token | PROBE P2 -> V-N2 |
| 26 | handler restart: memo empty -> NO_LOCAL_OPERATION; REMOVE via row hint | C6-10 (by construction); N C6-9 |
| 27 | enqueue-only (no await in `onCreationWake`; setImmediate) | READ; N C6-2 (wake -> re-entry through the real continuation) |
| 28 | REMOVE closed:true -> endpoint removed, STOPPED row, REMOVE_COMPLETED; never `recoverConsensusCreation` | U; N C6-7 (write-log order endpoint-delete < CLOSED < row-delete) |
| 29 | CLOSE_UNRESOLVED retired:true HISTORY_UNAVAILABLE -> COMPLETED | U |
| 30 | INVALID_REQUEST/CONTENT_CONFLICT/INVALID_LINEAGE -> REMOVE_FAILED + code | U |
| 31 | closed:false -> REMOVE_HELD@STOPPING, memo REMOVING, re-REMOVE through journal-only read | U; N C6-8 |
| 32 | NOT_ADMITTED (PENDING row) -> COMPLETED, no reserve, no physical effect | U cell (c) |
| 33 | read UNAVAILABLE on REMOVE -> REMOVE_FAILED + deferRetry (memo FAILED, operationId kept) | TRACED |
| 34 | read TERMINAL/CORRUPT/INTENT_NOT_FOUND on REMOVE -> REMOVE_FAILED + code | TRACED (F-5) |
| 35 | throw inside the bound REMOVE route -> REMOVE_HELD | TRACED (F-5) |
| 36 | REMOVE after restart via `replica_id` + `create_attempt_token` | U C6-9; N C6-9 |
| 37 | REMOVE, no memo, no row -> NOT_FOUND | pre-existing handler test |
| 38 | REMOVE while REMOVING in flight -> IN_PROGRESS | pre-existing |
| 39 | unbound runtime_service rows never carry `create_attempt_token` -> hint empty -> generic unchanged | READ (projection handoff; partition rows filtered by service_type) |
| 40 | PUBLISHED -> services row, all RV1.3/RV3.6 columns, `cleanup_token` null | P (deep-equal); N (3 hosts) |
| 41 | PUBLISHED -> endpoint row (physical id, `service_id S`, `service_name S`, digests, incarnation) | P; N |
| 42 | one mark, exact token, projected `service_type` | P; N (token mismatch -> NOT_REGISTERED) |
| 43 | HELD projects nothing, marks nothing | P; N `NO_ROW_FOR_A_HELD_REPLICA` |
| 44 | absent endpoint/projection writer -> PUBLISHED_UNPROJECTED WRITER_ABSENT, no mark | P cell (i) |
| 45 | host unavailable -> ENDPOINT_HOST_UNAVAILABLE, no row | P |
| 46 | writer refused_incarnation_required -> PUBLISHED_UNPROJECTED | P |
| 47 | writer refused_stale_incarnation | P C6-11 (writer direct); TRACED through `writeEndpoint` |
| 48 | writer authority_unavailable / not_applied | TRACED |
| 49 | endpoint writer throws -> ENDPOINT_WRITE_FAILED; re-drive UPDATE-first, one mark | P C6-6 |
| 50 | services-row projection throws -> SERVICES_ROW_PROJECTION_FAILED | TRACED |
| 51 | projection retained:true -> SERVICES_ROW_PROJECTION_RETAINED (F-4) | TRACED; RV4.5 |
| 52 | mark NOT_REGISTERED -> SERVICES_ROW_NOT_MARKED | P |
| 53 | PRESENT replays role (+ leader) once; CAS APPLIED through the production predicate, read from the row | N (f), (h) |
| 54 | re-drive that finds PRESENT replays nothing | N (h) |
| 55 | leader change after PRESENT re-publishes | N (g) |
| 56 | one catalog group, observed 3, healthy 3 | N |
| 57 | late I write never touches J; stale incarnation refused | P C6-11 |
| 58 | unbound id still parses; no binding metadata; remover works | P |
| 59 | retirement: endpoint by physical id, no logical resolution, BEFORE driver stop; row after CLOSED | P cell (d); N C6-7 |
| 60 | closed:false keeps the row, endpoint already withdrawn | P; N C6-8 |
| 61 | STOPPED projection failing (swallowed, best-effort) | TRACED |
| 62 | endpoint removal failing / remover absent -> `endpointRemoval` {success:false} / null | TRACED |
| 63 | I retired then J created under S before I's mark -> J never marked by I's token | N (static token mismatch); live interleaving TRACED |
| 64 | endpointHost derived (host:port, advertised WS wins, URL, none -> null) | P cell (e) |
| 65 | derived host on both rows, every host incl. advertised-WS host | N (e) |
| 66 | systemTableCache / creationWake lazy; no handler -> null | P |
| 67 | request-Cell predicate null-safe: serialized row not a Cell; keys absent not a Cell; compiled Cell is; each field alone | Q |
| 68 | HELD valid, peer-excluded, non-terminal; HELD outcomes UPDATE_STEP | U; completeness property (superseded by appending) |
| 69 | readRetainedCreation table (NOT_FOUND, RETAINED, TERMINAL before token, CONTENT_CONFLICT, UNAVAILABLE, NOT_ADMITTED, unwired) | U |

Assertion-weakening check (F-2 / RV4.3), judged on the base bytes (`git show b3793c7e5:...`):
- retained fixture sinks: nested journal still always refused and recorded; an ACTIVE projection or an endpoint write
  for a replica NOT serving under the physical id still refused and recorded; the sinks now ANSWER applied for the
  serving replica (the stage's claim) and accept a STOPPED projection for any replica (needed by retirement, not
  named in RV4.3's sentence: V-N6). Every `publications === []` still pins "nothing publishes a non-serving replica
  and nothing mints a nested journal"; it no longer pins "no projection call at all for bound replicas", which was a
  stage-1 limitation D7' stated and 1c supersedes by design. Acceptable.
- genesis `assertHeld` / reconciliation `assertServed`: "no leader publication queued" for non-PRESENT replicas; a
  PRESENT leader now pins its own nodeId (a positive assertion of the replay). Not weaker.
- conformance prototype allowlist +`markServicesRowPresent`; completeness +`'held'` (count derived from the list);
  handler-test and replace-handoff mock managers answer `resumeConsensusCreation` -> UNAVAILABLE (production shape;
  the generic path). None weakens a pinned property.

## 2. Findings by category

### V-F1 (REQUIRED; recovery-replay #1 "never clobber live with stale", owner-interaction #9 "no local escape hatch", concurrency #3) A CREATE for a HELD canonical replica under a different operation id destroys the handler's link to the bound replica; the next REMOVE orderly-stops it and completes while the slot stays ADMITTED

- Mechanism (`src/node/runtime-service-handler.js:361-363, 686-690`; `src/node/runtime-service-bound-creation-route.js:95-116, 158-180, 189-197`):
  `replyToExistingReplica` -> `reenterHeldCreation(this, {operationId: REQUEST id})` -> `scheduleBoundReentry` keyed by
  the request id -> `resumeConsensusCreation(REQUEST id)` -> INTENT_NOT_FOUND -> bound-class -> `settleCreation(...,
  {kind: FAILED, errorCode: BOUND_ROUTE_REQUIRED, names: false})` writes memo `{replicaId, entityId, status: failed}`:
  the HELD memo's `operationId` (the retained creation) is dropped. `removeReplicaAsync` then finds no `operationId`
  and takes `removeGenericReplicaAsync`.
- Scenario -> wrong output (PROBE P1, `probes/facts.ndjson`): HELD replica; CREATE with `another-operation-id` ->
  reply IN_PROGRESS; memo `{status: "failed"}` without `operationId`; CREATE_FAILED `runtime_service_bound_route_required`
  emitted for the new id; REMOVE -> `stop {bound: false}` (generic) -> REMOVE_COMPLETED; `service_instances` slot
  phase ADMITTED. In production this is the orderly `WasmServiceLifecycle.stopReplica` (no RELEASING, no tombstone,
  no CLOSED): the coordinator believes the founder is gone, the metadata owner keeps I's slot live, J is held
  `PREDECESSOR_OUTSTANDING` forever, and an intact restart may reopen the replica HELD. It is the orphan vet B4 named.
  Also: wakes for the creation then answer NO_LOCAL_OPERATION although the replica is local; and because the
  in-flight guard keys by the request id while wakes key by `token.operationId`, a wake during such a re-entry starts
  a second resume (RV3.5's guard bypassed).
- Why it is in scope: RV3.5 "existing.status === HELD re-enters bootstrap" means the HELD creation (the memo carries
  its `operationId` for exactly this); the implementer's F-5 decision "a HELD re-entry uses the request's operation
  id" is unruled by Revision 4 and is the error. RV1.2's "one id" is the producer's promise (fixture / activation
  quest R1); the node must not depend on it to keep custody of a live bound replica.
- Required change (minimal, node side): `reenterHeldCreation` resumes `existing.operationId` and keys the in-flight
  entry by it (the outcome may still be emitted under the request's id); a refusal/deferral for a request that
  names no retained creation never overwrites a memo that names one (leave the HELD memo as it is; or carry its
  `operationId` through). Witness: U "a CREATE under another operation id for a HELD replica keeps the memo's
  creation; the next REMOVE is bound" (red on the current tree by P1). Alternative the lead may rule: route to the
  activation quest with the one-id premise recorded in the design (R09) - then the handler's refusal path still
  needs the "never overwrite a creation-naming memo" half, which is the local hole.

### V-N2 (recorded; transport-delivery #3 / R07) A wake with no token answers RECORDED instead of NO_LOCAL_OPERATION
- `findWakeTarget` scans `entry?.operationId === operationId` with `operationId === undefined`, so memos WITHOUT an
  `operationId` (CREATING or generic ACTIVE) match (`route.js:224-225`). PROBE P2: a token-less wake against a generic
  ACTIVE memo -> `RECORDED`. Typed-outcome honesty; no effect (SETTLED runs nothing). Fix: require a string
  `operationId` or answer NO_LOCAL_OPERATION.

### V-N3 (recorded; design deviation, convergent) A RESOURCE_CLOSED wake recorded on an in-flight CREATE triggers one re-entry
- `WAKE_ACTION[IN_FLIGHT]` sets `wakePending` regardless of reason; `releaseBoundCreation` re-enters when the memo is
  HELD. PROBE P3: CLOSED wake during the first START -> 2 bound starts. Design: "RESOURCE_CLOSED -> nothing local".
  The extra resume answers RESOURCE_CLOSED -> FAILED (converges). Fix: record only OBSERVED/GRANT_HELD wakes.

### V-N4 (recorded; test nit) C6 (h) `born` index: with `born === -1` the "first role write after the INSERT" ordering passes vacuously (`indexOf(roles[0]) > -1`). Assert `born >= 0`.
### V-N5 (recorded; fixture) `bound-creation-handler-embedding-fixture.js` carries `held`, `events`, `phase`, `holdResponses` from the strong-write fixture shape (read by `deliverScheduled`); harmless.
### V-N6 (recorded; design text) RV4.3 should name that the retained fixture's projection sink also accepts STOPPED projections for any replica (the fixture comment does; the design sentence says "only for the serving replica").
### V-N7 (recorded; statics) The repo-wide literals checker reports 320 "new" violations, all in files this diff does not touch (quest-evidence scripts etc.: a stale committed baseline at the lane tip); scoped to the 24 touched src files it reports 0 new. The one silent-catch hit in `service-consensus-creation-intent.js` is the unchanged `writeAndObserve` catch (base :91 -> :93; same six catch sites).
### V-N8 (recorded; route module) The catch path of `routeRuntimeServiceCreate` settles DEFERRED with `names: true`, attaching the REQUEST id to the memo even when no creation was retained (reachable only through an emitter/logger throw); a later REMOVE would then route bound and answer REMOVE_FAILED INTENT_NOT_FOUND for a generic replica. Prefer `names` only for retained-class answers.
### V-N9 (recorded; formation-circularity) A bound REMOVE's recovery of its creation depends on the `wasm_operations` journal read (`readRetainedCreation`); when the journal is unavailable the REMOVE defers typed while the local replica keeps serving (fail-closed, design RV2.1). The local `_wasm_creation_local` record also holds the token; using it is the recovery stage's call. No coupled pair in `test/shards/impact-contracts.json` covers the handler <-> manager <-> runtime bound interaction; the C6 embedding is the de-facto paired witness (HANDOFF C6 is the contract).

Checked and sound (no finding): RV4.1 confirmation for both serving statuses, STARTING kept, retire on CONTRADICTED;
`readRetainedCreation` journal-only (reads only `_idempotencyReader`; TERMINAL before token; CONTENT_CONFLICT beside
CORRUPT_STATE); `resumeConsensusCreation` one pass; `journaledIntent` byte-equivalent (same statements, same order,
same thrown codes, both call sites inside `try`/`instanceFailure`); one `resolveRuntimeEndpointIdentity` for writer
and remover; one PRESENT record; `service_type` flows projection -> `row.serviceType` -> mark -> record -> CAS
predicate; the PRESENT replay goes through `queueRoleUpdate`/`queueLeaderNodeUpdate` (persistedRole null at first,
so not skipped); `_removeEndpoint`'s three unbound callers unchanged (two arguments); the STOPPED projection deletes
by `{service_type, node_id}` identity; the services row INSERT carries `created_at`; `PEER_ROW_EXCLUDED_STATUSES`
gains HELD (fail-closed); HELD outcomes name the current step (CREATING/STOPPING), same-step `updateStep` is a no-op
and a late HELD at ACTIVE is "behind" and skipped; `REBALANCE_ACK_STATUS` is a separate vocabulary (no exhaustive
consumer of the new outcome types); unbound runtime rows never carry `create_attempt_token` (the hint cannot
misroute an unbound REMOVE); `isRequestCellDefinition` callers are exactly the three the implementer censused and
no other `binding_*` presence test exists in `src/`; both node owners carry `nodeAddress`, `advertisedNodeWsAddress`,
`peekSystemTableCache`, `runtimeServiceHandler`; `resolveEndpointAddress` answers null for a missing address (typed
HOST_UNAVAILABLE downstream, never a literal).

## 3. Independent census diff (mine vs the implementer's)

- Handler surfaces: `handleCreateReplica`/`handleRemoveReplica` only from `dispatchRuntimeServiceMessage`;
  `createReplicaAsync` only from the setImmediate in `handleCreateReplica`; `removeReplicaAsync` only from
  `startRemoveReplicaAsync`; `onCreationWake` only through the dependency getter; one production construction
  (`runtime-service-handler-setup.js:177`). Matches.
- `_removeEndpoint`: 3 unbound callers (operation-methods :437, :528, :548) + the bound one. Matches.
- `publishesServicesRow`: 4 consumers (:504, :526, :606, :616). Matches.
- `isRequestCellDefinition`: 3 callers (route :54; driver :286/:294; `requiresRuntimeReconciliation` :214). Matches.
- New: `enableServicesRowPublication` has one caller (driver consensus :129); `markServicesRowPresent` (driver method)
  one caller (publication :72); `boundStartResult` one caller (`continueBoundStart`); `startConsensusBootstrap`/
  `retireConsensusBootstrap` called from operation-methods :312/:486 only. The implementer did not list these; no
  discrepancy.
- `create_attempt_token` writers: partition/replica-handler owners and the new bound projection only; no runtime
  (unbound) projection writes it. Not in the implementer's census; closes cell 39.
- ReplicaStatus exhaustive consumers in tests: completeness, `replica-state-delegation`,
  `terminal-status-sql-clause-consistency` - all three in the lab selection.

## 4. Mutations (verifier, each applied once, catcher run gated, source restored byte-identically; `mutations/*.patch`, `*.result`, `runs/<id>-*.log`)

| Id | Mutation (mechanism) | File | Catcher(s) | First failure |
|---|---|---|---|---|
| VM18 | skip authority confirmation for PUBLISHED_UNPROJECTED (RR5 text restored) | service-consensus-bootstrap.js | publication integration; U | `not ok 13 - P11 a forged PUBLISHED or RUNNING driver answer never becomes serving presentation`; `not ok 3 - Revision 4: ... contradicted and retired` |
| VM19 | request-Cell predicate by key presence (old body) | request-cell-runtime-contract.js | Q; U | `not ok 1 - a serialized installed-package row (binding_* keys present, null) is not a request Cell`; U `not ok 6 - C6-4`, `not ok 7 - C6-5`, `not ok 9 - cell (a)` |
| VM01 | HELD mapped to FAIL | bound-creation-route.js | U | `not ok 1 - C6-1 ... memo HELD + CREATE_HELD` |
| VM03 | resume continues through prepare(result object) instead of the recovered intent | service-consensus-bootstrap.js | U | `not ok 1 - C6-1` |
| VM06 | endpoint row key by S (two founders collide) | runtime-endpoint-publication-wiring.js | P | `not ok 1 - PUBLISHED projects the services row and the endpoint row, then marks PRESENT by token` |
| VM11 | REMOVE recovers through `recoverConsensusCreation` | bound-creation-route.js | U | `not ok 4 - C6-8/cell (b)`, `not ok 5 - cell (c) ... reserves nothing` |
| VM13 | remover ignores the binding (parses S) | runtime-endpoint-publication-wiring.js | P | `not ok 1 - cell (d) endpoint removed by physical id before the stop` |
| VA1 | PRESENT mark keyed by S (token digest ignored) | wasm-service-lifecycle.js | N; P | N `not ok 1 - C6-1 HELD, C6-3 ... (e) (f) (g) (h)` (token-mismatch mark); P green (its driver is scripted: cannot see the lifecycle) |
| VA2 | raw `nodeAddress` as endpointHost | runtime-startup-wiring.js | P; N | P `not ok 1 - cell (e) endpointHost is the DERIVED host`; N `not ok 1 - C6-1 ... (e)` |
| VA4 | absent writers treated as PRESENT (mark instead of WRITER_ABSENT) | service-runtime-consensus-publication.js | P | `not ok 3 - cell (i) an absent endpoint or projection writer is typed PUBLISHED_UNPROJECTED, never PRESENT` |
| VA6 | UNAVAILABLE deferral applied to a non-bound-class CREATE (class check skipped) | bound-creation-route.js | U | `not ok 8 - a native_js definition ... takes the generic path`, `not ok 9 - cell (a)` |
| VA7 | HELD re-entry without the in-progress guard | bound-creation-route.js | U | `not ok 1 - F9 a duplicate CREATE while a HELD re-entry is in flight starts no second resume` |
| VA8 | PRESENT replay twice (ALREADY_PRESENT early return removed) | wasm-service-serving-state.js | N; P | SURVIVED both (rc=0): see V-N10 |

Twelve of thirteen killed by the designed mechanism; every first failure is the named behavioural assertion (none an import or fixture failure). Every `*.sha-before` equals the restored file's sha256; `git status --short` at hand-back = the seal only.

### V-N10 (recorded; witness gap) The PRESENT latch's replay-once property is not what cell (h) measures
- Under VA8 a second mark re-runs `queueRoleUpdate(role)` / `queueLeaderNodeUpdate(nodeId)`, but both return early on `role === persistedRole` / `leaderNodeId === persistedLeaderNodeId` (`wasm-service-replica.js:505, 527`), so no second row write happens and (h) ("a re-drive that finds PRESENT writes nothing") stays green; the only observable is the mark answer (PRESENT instead of ALREADY_PRESENT), which `markPresent` accepts either way. The latch is therefore unwitnessed; the dedupe that (h) actually measures lives in the queue helpers and depends on the first flush having persisted before the re-drive (a lagging CDC would re-flush). Add: after PRESENT, `enableServicesRowPublication(S, type, ownToken)` answers ALREADY_PRESENT and `pendingRoleUpdate` is untouched.

## 5. Statics (all on the clean tree; `statics/*.log`)

| Check | Result | Versus base b3793c7e5 |
|---|---|---|
| `check-fast-static.js --base b3793c7e5` | ok in 11.2 s (proof range b3793c7e5..HEAD, all stages) | - |
| decision boundaries `--json`, 24 touched src | total 0 new, raw 6, inherited 6, baseline 806 | = implementer; no baseline change |
| eslint, 37 touched JS | 0 problems | - |
| literals | scoped to 24 touched src: 0 new; repo-wide 320 "new", every one in a file outside the diff (V-N7) | stale repo baseline at the lane tip, not this change |
| silent-catch | scoped: 1 = `writeAndObserve` (unchanged, base :91 -> :93); repo-wide 4 (3 untouched files + the same) | inherited |
| runtime grammar | 0 violations; state-machine pressure pass | - |
| complexity scoped, 37 files | 5 = the base's five (`resolveEndpointAddress` 14, `handleRemoveReplica` 14, `validateEndpointIntent` 15, `_buildLifecycleLogContext` 16, completeness test arrow 14) | 0 new |
| cognitive scoped | 0 | - |
| `audit:shards` | OK: 2409 tests (unit 2093, integration 104, bootstrap 205, probe 3, packaging 4); digests fnv1a32-8f7e78d2 / fnv1a32-4af5901f | regenerated by their producers (three new entries) |
| `audit:file-size` | source 26/27 over 800, test 21/21 over 1500 | = implementer; the handler (882 -> 934) was already counted: ratchet unchanged |
| `test:unused:ratchet` | 1456 (fails a baseline of 1416) | = implementer's base 1456: 0 new unused exports |
| `test:duplication` | src+scripts OK 47/47, 1462/1462; test FAILED 698 groups / 26458 lines vs baseline 697/26369 | = implementer's base 698/26458: 0 new clone groups (my first measurement, 701/26545, included my probe file, since deleted) |

## 6. Single-file runs (gated, serial; `runs/*.log`)

| Run | File | Result |
|---|---|---|
| r01 | test/node/runtime-service-bound-route.test.js | ok, 26 assertions |
| r02 | test/runtime/service-runtime-consensus-publication.test.js | ok, 16 |
| r03b | verifier probe (deleted afterwards) | ok; facts in `probes/facts.ndjson` |
| r04 | test/wasm-service/bound-creation-handler-embedding.integration.test.js | ok (3 assertions, about 1.3 s) |
| r05 | test/wasm-service/wasm-creation-publication.integration.test.js | ok, 25 (P11 green) |
| r06 | test/wasm-service/wasm-creation-genesis.integration.test.js | ok |
| r07 | test/wasm-service/wasm-creation-reconciliation.integration.test.js | ok |
| r08 | test/wasm-service/wasm-retained-bootstrap.integration.test.js | ok |
| r09 | test/node/runtime-service-handler.test.js | ok |
| r10 | test/rebalancer/replica-status-completeness.property.test.js | ok |
| r11 | test/rebalancer/runtime-service-replace-canonical-target-handoff.test.js | ok |
| r12 | test/runtime/request-cell-definition-classification.test.js | ok |
| r13 | test/runtime/wasm-driver-contract-conformance.test.js | RED: 11 `not ok` lines, 37 assertions - the identical set the implementer recorded at the base (`reports/base-test_runtime_wasm-driver-contract-conformance.test.js.txt`) and at the head (`b-r4-...`); pre-existing lane red |
| r14 | test/wasm-service/wasm-creation-bound-native.test.js | ok |
| r15 | test/runtime/wasm-component-driver.test.js | ok |
| r16 | test/wasm-service/wasm-service-lifecycle.test.js | ok |
| r17 | test/runtime/runtime-startup-wiring.test.js | ok |
| r18 | test/node/replica-state-delegation.test.js | ok |
| r19 | test/rebalancer/terminal-status-sql-clause-consistency.property.test.js | ok |

## 7. Lab - PENDING

Jobs submitted by the lead at 04f1a9112 (85 files): #161 tv-dator `9087364477e64bf489f73a8789e1fb85` (host-0, 28 files),
#162 adam-laptop `7faead8e35274bc59ea54b1bc5534b30` (host-1, 29), #163 adams-gamla `72bc74d0d764489e9b806424b60bc5a2`
(host-2, 28). At hand-back no record exists under `~/.local/state/lagrange-lab/runs/<request_id>/`. What the
classification must do when they land: match `placement-head` to `04f1a9112` in the raw executor logs; the six
files expected red at the base are in the selection (`wasm-driver-contract-conformance` [host-0, set above],
`wasm-service-replica` [host-0], `replica-transport-handler-identity` and `write-identity-instance` [host-1],
`durable-commit-replica-kinds` and `wasm-service-group-on-raft-rs` [host-2]); any other red, or a different failing
set in those six, is unclassified until compared with the base. The three `ReplicaStatus`-enumerating files
(`replica-status-completeness`, `replica-state-delegation`, `terminal-status-sql-clause-consistency`) are green
locally (r10, r18, r19).

## 8. What I did not read or run (counted)

Not read in full: `authoritative-row-mutation-helper.js` (flush/retry sites located by grep only);
`operation-workflow-dispatch-response-reconcile.js` (REMOVE INITIATED -> STOPPING transition taken from grep);
`system-table-cache-observation-methods.js` (`find` existence taken from the re-vet); `service-lifecycle-recovery.js`;
the stage-1 verifier verdict beyond its P11/A-B5 rows; the three stage-1c vet reports' "did not read" tails; the
activation quest charter (not listed by the brief); 13 of the 85 lab files' contents (classification only). Not run:
the base tree (no base checkout; the implementer's base logs for conformance/duplication/unused were read instead);
any lab host; `write-identity-instance` (475 s, in the lab selection); the 70-odd lab files I did not run locally.

## 9. Verdict

**PROVISIONAL (lab PENDING). On the node-side claim: REJECT, narrow - one required change (V-F1); everything else
measured sound.**

What holds, measured: every designed witness (C6-1..C6-12, cells (a)-(i), the RV3.3 tables, RV4.1, RV4.2) is green
on the real handler, manager, runtime, writers and native lifecycle; the frozen rows, identities, address derivation,
PRESENT mark by token, binding-first writer/remover, REMOVE route and journal-only read behave as RV1.1-RV4.6 state;
the stage-1 supersessions narrow no pinned property; twelve of thirteen mutations are killed by the named mechanism;
statics show no new debt against the base; fast-static is ok on the base range.

What does not hold: V-F1. Two accepted messages (a CREATE under a different operation id for a HELD canonical
replica, then a REMOVE) leave a bound replica orderly-stopped, REMOVE_COMPLETED emitted, and its slot ADMITTED
forever - the orphan vet B4 named - because the HELD re-entry resumes the request's id instead of the memo's
creation and the resulting refusal overwrites the creation-naming memo. The frozen claim's REMOVE half ("routed to
`retireConsensusCreation` with the creation recovered by operation id") is violated from a reachable state. The fix
is local to `runtime-service-bound-creation-route.js` (resume `existing.operationId`; never overwrite a memo that
names a creation with a nameless one) plus one unit witness; after it only U, N, the route-module statics and the
duplication/unused ratchets need re-measuring.

Lead decision the verdict leaves open (R09): if the one-id premise (RV1.2 R4/R1) is ruled part of this stage's
sealed producer contract and V-F1 is routed to the activation quest, the design note must say so and the
"never overwrite a creation-naming memo" half still belongs to this stage, since the refusal path is this stage's.
Recorded, non-blocking: V-N2 (token-less wake answers RECORDED), V-N3 (CLOSED wake during an in-flight CREATE
re-enters once), V-N4 (`born >= 0` guard), V-N5 (fixture leftovers), V-N6 (RV4.3 wording on STOPPED sinks),
V-N7 (stale literal baseline outside the diff), V-N8 (catch path names the request id), V-N9 (journal dependency of
REMOVE; no coupled pair registered), V-N10 (the PRESENT latch's replay-once is unwitnessed; VA8 survived).

This is the verifier's record; the lead records the verdict and decides the round. Not reported as done on anyone's
behalf.
