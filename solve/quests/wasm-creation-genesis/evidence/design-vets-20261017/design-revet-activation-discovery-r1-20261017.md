# Design re-vet: ACTIVATION-DISCOVERY-DESIGN-20261017.md, Revision 1 (stage 1c, embedding scope)

Subject: `solve/quests/wasm-creation-genesis/ACTIVATION-DISCOVERY-DESIGN-20261017.md`
section "Revision 1" (RV1.0-RV1.7) as committed at `7e184b8aa` in
`/mnt/data/peter/projects/.worktrees/rs-raft-event-reconciliation-20261016`
(the brief named `c6006c745` plus uncommitted docs; the lead committed them as
`7e184b8aa`; the worktree is clean, nothing else differs). Every `file:line`
below is from that tree. Read-only: nothing touched, nothing run.

Read in full (R18): CLAUDE.md, rules.md, router.md, authority-and-recovery.md,
CONTRACT-R2.md, HANDOFF-INTERFACES.md, the whole design note (draft + Revision
1), the first vet report, the activation quest charter, the closeout plan,
quest.json and the log tail, SERVING design D3', D6', D7', 7', N5-N16, A1,
A2'', TEST-PLAN C6, the alpha closeout merge discipline, and every source and
fixture file the brief lists plus the collaborators the Revision's claims
reach: `replica-status.js`, `service-lifecycle-manager.js`,
`service-lifecycle-operations.js`, `service-lifecycle-recovery.js`,
`service-lifecycle-common.js`, `runtime-service-adapter.js`,
`runtime-service-handler-constants.js`, `runtime-service-handler-setup.js`,
`service-instance-metadata.js`, `service-instance-state.js`,
`service-instance-contract.js`, `wasm-creation-retirement.js`,
`wasm-creation-publication.js`, `wasm-creation-wake.js`,
`wasm-creation-reconciliation.js`, `wasm-service-replica-lifecycle.js`,
`replica-leadership-state.js`, `executor-outcome-emitter.js`,
`operation-workflow-executor-outcome-reconcile-methods.js`,
`operation-workflow-transition-orchestration.js`,
`operation-workflow-dispatch-response-reconcile.js`,
`service-discovery-catalog.js`, `leader-readiness-gate.js`,
`control-plane-runtime-bundle.js`, `authoritative-row-mutation-helper.js`
(retry sites), `system-table-cache-observation-methods.js`,
`service-endpoints-owner.js`, `services-owner.js`,
`service-instance-creation-sqlite-fixture.js`, `port-allocator.js`,
`meta-service-factory.js`, `service-install-catalog-owner.js` (method list),
`service-lifecycle-command-owner.js` (revision derivation), the
`create_attempt_token` / `replica_id` / `group_id` consumers found by grep,
`test/node/runtime-service-handler.test.js` and
`test/runtime/minimal-deployment-request-cell-runtime-readiness.test.js`.

## Verdict: REVISE (blocking RB1-RB5; required RR1-RR11; recorded N1-N9)

What Revision 1 gets right and this re-vet confirms: the scope split itself
is supported by CONTRACT-R2 :215-219 and the quest statement, and the C6
handler integration of HANDOFF :119-120 is kept in this quest (RR10 names the
two items that still need a production-shaped owner); the services-row column
reuse (`replica_id = S-rN`, `group_id = wasm-instance-<digest>`,
`create_attempt_token = creation operation id`) collides with no existing
decision path (RR4 has the census); the endpoint row shape yields one catalog
group of three (N3); `bootstrapConsensusCreation(retained.intent)` is the
right argument; the PRESENT latch and replay-once are correct because WASM
role/leader publication IS event-driven and the held replica records no
pending value (N2); `ReplicaStatus` lives where the design says; the
`PUBLISHED_UNPROJECTED` vocabulary owner and manager branch are right; the
wake consumer as a lazy getter is the right shape.

What it gets wrong: the REMOVE route recovers the creation through a method
that reserves slots, enforces CREATE policy, needs the metadata owner and
refuses a RELEASING slot (RB1, so the designed re-REMOVE cannot resolve); the
CREATE route's "ask the manager first, UNAVAILABLE defers" applied to every
definition regresses every production native_js runtime service to permanent
deferral (RB2); the endpoint remover still parses the physical id and would
leak every bound endpoint (RB3); the address owner is a literal `'localhost'`
dressed as an owner (RB4); and the C6 embedding as listed cannot instantiate
the handler nor run the role CAS through the production predicate, so B7's
witness is unprovable as planned (RB5). None needs new architecture; each
needs the owner named and the sentence corrected.

---

## 1. Scope split (RV1.0)

Supported: CONTRACT-R2 `:215-219` ("test embedding supplies those actual
existing owners and does not claim a new catalog/deployed activation product;
Request Cells and OCI are excluded"); quest statement "without widening
catalog activation" (`quest.json` statement); HANDOFF `:119-120` ("The
C6/handler integration must use actual publication owners") is honoured by
RV1.6. B1/B2/B3/B5-planner/B8/B9/R14/R1/R3/R6/R7/R8/R17-R19/R24 are correctly
routed; the charter lists them with the vet's evidence.

### RR10 (required) Two items left in stage 1c still need a production-shaped owner; D0's supersession needs its log entry
- The advertised address of both rows (RB4) and the handler's UNAVAILABLE
  routing (RB2) are stage-1c mechanisms whose correctness is decided on the
  production tree, not in the embedding; both are fixed inside 1c without
  touching production wiring (see those findings).
- D0 as recorded in the quest log (`log.ndjson` line 21, `kind: decision`)
  says "deleted in stage 1c". RV1.0 supersedes that sentence. R09/R21: the
  sealed record is the log entry, not the design note; append a decision
  entry recording the owner's confirmation that the deletion is a separate
  unit (the charter's item 10) before implementation starts.
- Nothing routed out is required by C6: the id equality (R1) is supplied by
  the fixture ("dispatches CREATE with that id"), which is the embedding's
  prerogative.

---

## 2. Resolutions, each judged

| Id | Resolution in RV1 | Judgement |
|---|---|---|
| B1, B2, B3, B5(planner), B8, B9 | routed to the activation quest | sound; B2 supersession of CONTRACT-R2 :217-220 correctly confined to the new quest |
| B4 | REMOVE via `recoverConsensusCreation` + `retireConsensusCreation` | WRONG mechanism (RB1); `manager.retireConsensusCreation` is not a manager method (RR6a) |
| B5(node) | bound = consensus row; class for refusal = installed-package + revision + not Cell + not meta | partially: the row test is unreachable from the handler (N8); "with a creation revision" is unevaluable node-side (RR8) |
| B6 | existing columns only | sound; census complete in RR4 |
| B7 | `service_type` from the PRESENT record; witness APPLIED | sound in mechanism; the witness is unbuildable as planned (RB5); the runtime->driver->lifecycle hop is unnamed (RR4) |
| R1/R4 | lazy getter; id in the memo | sound; enqueue-only not stated (RR7) |
| R9 | `service_name = S`, physical endpoint id, EP_META keys | sound for the writer; the remover is not fixed (RB3) |
| R10 | `replicaContext.endpointHost ?? address` | WRONG owner (RB4) |
| R11 | identities added | sound; add the driver's S-keyed maps (RR11) |
| R12/R13 | PRESENT record; `PUBLISHED_UNPROJECTED` member + manager branch | sound; placement relative to `confirmPublishedAuthority` still impossible as worded (RR5) |
| R15 | recover first; `retained.intent`; HELD status | regression on production (RB2); recover outcomes under-enumerated (RR1); two reads per CREATE (RR1) |
| R16-R20 | table RV1.5 | incomplete (RR11) |
| R21 | restart = NO_LOCAL_OPERATION + dispatch retry | sound (N7) |
| R22/R23 | C6 fixture, witness ids, mutations | fixture prerequisites missing (RB5); payload builder mis-cited (RB5c); cells missing (RR9) |
| N1 | "corrected in the next revision" | the lines RV1 cites were checked and are exact (N9) |

---

## 5. REMOVE route

### RB1 (BLOCKING) `recoverConsensusCreation` is the wrong recovery for a REMOVE: it refuses a RELEASING slot, reserves on a PENDING row, enforces CREATE policy and needs the metadata owner
- Evidence: `service-consensus-creation-intent.js:36` `LIVE_PHASES = {ADMITTED, PUBLISHED}`; `:159` `if (!LIVE_PHASES.has(resource.phase)) return {outcome: RESOURCE_CLOSED}`; `:163-173` `continueIntent` calls `reserveAndRetain` when the row has no admission (`:168-172`); `:211-212` `_enforceRuntimePolicy(CREATE, ...)`; `:148-155` the metadata read failing -> `UNKNOWN`; `service-instance-state.js:240-250` `resolveResourceState` answers ADMITTED for any phase, so the phase gate is the creation-intent module's; `wasm-creation-retirement.js:109-126, 128-137` the first retirement writes RELEASING then attempts CLOSED; `service-instance-state.js:257` RELEASING is a live-from-ADMITTED/PUBLISHED phase; `service-consensus-bootstrap.js:34-35` `captureConsensusBootstrap` requires `consensusCreation.outcome === ADMISSION_RETAINED`, so without a retained result no handle can be built. The fixture already recovers the creation the right way, from the row's `intent_json`/`admission_json` (`test/wasm-service/wasm-retained-bootstrap-fixture.js:211-220`).
- Scenario -> wrong output: C6-8: REMOVE answers `CLOSE_UNRESOLVED` (slot RELEASING, tombstone durable); handler emits REMOVE_HELD; the re-REMOVE recovers -> `RESOURCE_CLOSED` -> no handle -> the handler can only answer FAILED or NOT_FOUND; NOT_FOUND completes the REMOVE as stop-phase satisfied (`operation-workflow-dispatch-response-reconcile.js:941-949`, `handleStopPhaseSatisfiedResponse :42-68`) while the slot stays RELEASING forever and J stays `PREDECESSOR_OUTSTANDING`. Second: a REMOVE for a founder whose row is PENDING (CREATE delivered, reserve never ran) reserves a slot as a side effect of the REMOVE and then retires it: the receiver mints an ordinal, which CONTRACT-R2 `:109-110` forbids. Third: metadata owner unreachable -> recover `UNKNOWN` -> REMOVE blocked, although the local retirement itself needs no metadata precondition (A1).
- Required: a manager read `readRetainedCreation(operationId)` (owner `service-consensus-creation-intent.js`): `readJournal` + `captureIntent(intent_json)` + `retainedToken` only; no policy, no reserve, no metadata read; answers `{outcome: ADMISSION_RETAINED, intent, token, operationId}` for an IN_PROGRESS row with admission, typed `INTENT_NOT_FOUND` / `NOT_ADMITTED` (PENDING) / `TERMINAL_OPERATION` otherwise. The handler builds `{definition: consensusBootstrapDescriptor(retained), consensusCreation: retained, consensusOpeningOwner: manager}` and calls `manager.stopReplica(handle)` (the existing bound branch, RR6a). `NOT_ADMITTED` on REMOVE -> REMOVE_COMPLETED (no slot, no physical effect) with the PENDING row left to the recovery stage: state it. `RESOURCE_CLOSED`/already-CLOSED slots must still run the local retirement by token (RR6e).

### RR6 (required) REMOVE route details
- (a) `manager.retireConsensusCreation` does not exist: `service-lifecycle-manager.js:44-46, 553-559` import only prepare/recover/bootstrap; the manager's public bound STOP is `stopReplica(handle)` -> `isBoundConsensusDescriptor` -> `retireConsensusCreation` (`service-lifecycle-operations.js:423-429`), exactly what the fixture calls (`wasm-retained-bootstrap-fixture.js:221`). Cite that.
- (b) `recoverLocalReplicaForRemoval` by `replica_id`: the cache offers `find(table, predicate)` (`system-table-cache-observation-methods.js:401-408`); the guard `row.service_id !== replicaId` (`runtime-service-handler.js:494`) must accept `row.replica_id === replicaId`. It is a cache read (R10): say the row is a hint that only supplies the operation id; authority is the journal read of RB1.
- (c) "nor the journal names a creation": no read of `wasm_operations` by replica id exists (`operation-lifecycle.js:183-187` is by operation id; `buildListOperationsSQL` is by tenant/state); the only candidate is the manager's recoverable-operations scan (`service-lifecycle-manager.js:519-541`, `_recoveryReader`) filtered on `intent.descriptor.replicaId` and the slot's `nodeId`. Name it as the owner read or drop the clause from the NOT_FOUND condition.
- (d) Memo status after REMOVE_HELD: leave `localReplicas` at `REMOVING` so the existing REMOVING branch re-drives on the next REMOVE (`runtime-service-handler.js:562-580`); today's catch sets FAILED (`:676-678`).
- (e) REMOVE when the slot is already CLOSED (closed by the owner, by a sibling path, or by the restart scan): the local resources may still be live; run the local retirement by token anyway (`retireWasmCreation` tolerates an already-CLOSED slot: `service-instance-state.js:277, 295` answer CLOSED without a mutation) -> REMOVE_COMPLETED.

---

## 6. CREATE route and HELD

### RB2 (BLOCKING, R16/R04) "Ask the manager first; UNAVAILABLE defers" applied to every CREATE regresses every production runtime service to permanent deferral
- Evidence: `recoverConsensusCreation` calls `requireDependencies` before the journal read (`service-consensus-creation-intent.js:196-198`, `:58-64`); on the production tree the manager has no writer, readers or owner (`startup-service-lifecycle-owner.js:27-31`, B1, routed to the activation quest), so EVERY call answers `{outcome: UNAVAILABLE}` for every definition; `instanceFailure` maps a thrown reader to the same UNAVAILABLE (`service-instance-contract.js:107-109`), so "unwired" and "read failed" are indistinguishable. Native_js runtime services are placed through this handler (`runtime-startup-wiring.js:94-110`; the handler suite's canonical case is `sys-postgres-wire`, `test/node/runtime-service-handler.test.js:30-32`). RV1.2 R15: "before the generic create it asks the manager recoverConsensusCreation(operationId) ... UNAVAILABLE -> typed deferral (deferRetry: true), never FAILED"; RV1.4: "The handler never keys on runtime_kind."
- Scenario -> wrong output: land stage 1c; on a production node every CREATE_REPLICA for sys-postgres-wire, the SQL query loop and sys-admin-meta answers UNAVAILABLE -> deferRetry -> no runtime-service replica ever forms; the deferral is typed and silent.
- Required: order the route: (1) recover by operation id; (2) `ADMISSION_RETAINED` -> bound route regardless of the cache row; (3) `INTENT_NOT_FOUND` or `UNAVAILABLE` -> classify the definition row (RV1.4 as corrected by RR8): bound-class -> `BOUND_ROUTE_REQUIRED` / `deferRetry` respectively; any other class -> the existing generic path, untouched. Add the witness RR9(a): a production-shaped manager (no journal) with a native_js definition takes the generic path; with a bound-class definition answers the deferral. C6-12 as written cannot catch this because the embedding's manager has the journal.

### RR1 (required) The recover outcomes the handler must map, and the cost of composing recover + bootstrap
- `recoverConsensusCreation` answers more than three outcomes: `TERMINAL_OPERATION` (`:143, :166`), `RESOURCE_CLOSED` (`:159`), `CONTENT_CONFLICT` (`:76-81, :209-210`), `CORRUPT_STATE` (`:68, :84, :117, :201-207`), `UNKNOWN` (`:120-124, :131-132, :154`). RV1.2/RV1.5 map only ADMISSION_RETAINED / INTENT_NOT_FOUND / UNAVAILABLE. State: `TERMINAL_OPERATION` and `RESOURCE_CLOSED` -> typed FAILED (the slot is not live, so the invariant of RV1.5's last row permits it); `CONTENT_CONFLICT`/`CORRUPT_STATE` -> FAILED with the code; `UNKNOWN` -> deferRetry.
- Composition cost (R03): recover then `bootstrapConsensusCreation(retained.intent)` runs `readJournal`, the policy and `resolveInstanceResource` twice (`:194-213`, then `:175-189` via `service-consensus-bootstrap.js:130`). Either name one manager method `resumeConsensusCreation(operationId, context)` (recover + bootstrap, the manager's own continuation, as `recoverConsensusCreationRow :222-226` already is for the restart scan) or record the doubled authoritative reads as accepted cost.

### RR3 (required) `ReplicaStatus.HELD` joins a shared vocabulary fail-open
- `ReplicaStatus` (`replica-operation-progress.js:7-27`) is consumed by `PEER_ROW_EXCLUDED_STATUSES` (`replica-status.js:232-242`, a row with an unknown status is an admissible peer), `TERMINAL_STATUSES`, `WORKFLOW_STEP_TO_STATUS`, `isValidStatus`. The design never projects HELD to a row (ACTIVE/STOPPED only), so the exposure is latent; still, a new member of the shared enum must be placed in the exclusion set (fail-closed) or the handler keeps a handler-local status owner. Decide and name it.

---

## 7. Wake consumer

### RR7 (required) Enqueue-only, id mapping cost, outcome owner
- The wake is delivered synchronously from inside the continuation run (`wasm-creation-reconciliation.js:88-104` -> `deliverWasmCreationWake`, `wasm-creation-wake.js:27-34`, result not awaited). The handler's `onCreationWake` must schedule the re-entry (as `createReplicaAsync` does with `setImmediate`, `runtime-service-handler.js:336-348`) and never await bootstrap inside the wake: the keyed queue serializes a re-entry through a completion waiter (stage-1 proven), but a blocking consumer would hold the run. Say "enqueue-only" explicitly (D6' wording).
- `wake.token.operationId -> localReplicas` is a scan over entries keyed by replicaId (`:323`); fine, say so. After HELD only `localReplicas` holds the operation id, because `createReplicaAsync`'s `finally` deletes the in-progress entry (`:442-444`) (N6).
- `NO_LOCAL_OPERATION` has no owner named: `CREATION_WAKE_OUTCOME` (`service-consensus-bootstrap.js:21-23`) is the lifecycle's delivery vocabulary; the handler's consumer outcome belongs in `runtime-service-handler-constants.js`.

---

## 3. Services row (RV1.3)

### RR4 (required) Census of the reused columns: no collision; record the two facts that keep it so, and name the PRESENT hop
- `replica_id != service_id` is new for runtime rows (partitions and message groups write equal or group-scoped ids: `message-group-service-row-owner.js:235, 378`; `partition-service-row-owner.js:216`). Consumers that read it resolve `replica_id || service_id` and therefore see `S-rN`: `move-planner-move-calculation-methods.js:108, 304, 377, 623`, `unified-rebalancer-replica-state.js:566-574`, `priority-surplus-remove-placement-fence.js:24`, `operation-workflow-recovery-observation.js:265`, `group-retirement-redrive.js:476`, `operation-workflow-replace-surviving-membership.js:122, 177`; query routing accepts either (`sql-query-engine-routing-metadata-methods.js:82, 116`); `rebalance-coordinator-replica-identity-methods.js:463` reads `service_id || replica_id` (physical) -> the vet's R2 point, correctly routed. No reader treats the pair as a contradiction.
- `group_id`: every consumer filters `service_type = message_group` first (`cdc-group-propagation-routing.js:22-26`, `bootstrap-join-admission-owner.js:668-670`, `entity-service-row-read.js:25-26, 40-45`, `unified-rebalancer-replica-state.js:279-283`, `services-view.js:717`). Safe.
- `create_attempt_token`: every decision consumer also requires `cleanup_token` to be a failed-create cleanup token (`operation-workflow-terminal-transition-repair.js:55-64`, `replica-handler-remove-request-methods.js:36-40, 85-95`, `operation-workflow-replace-terminal-admission.js:78-86`) or compares it only among partition failed-create claims (`move-planner-move-calculation-methods.js:59-70`); the repository observation merely copies it (`replica-operation-repository-observation-methods.js:40-50`). Bound rows carry no `cleanup_token`, so these stay inert. Record in RV1.3: "bound rows never carry `cleanup_token`; `create_attempt_token` = the retained creation's operation id, stable per creation (the partition meaning rotates per attempt, schema comment `system-table-core-schema-definitions.js:246-249`)".
- `service_type = runtime_service` and the predicate: today, with no writers injected, `writeRoleUpdate`/`writeLeaderNodeUpdate` CAS `service_type = 'wasm_service'` (`wasm-service-replica.js:645-657, 691-704`) against rows projected as `runtime_service` (`service-runtime-state-projection-handoff.js:14-16`) -> zero rows -> `AuthoritativeRowMutationHelper` reschedules without a budget (`authoritative-row-mutation-helper.js:261-264, 554-575`); this is also the state of the dead unbound path (record R17 for the deletion unit). The PRESENT record copies the projected `service_type` from the runtime; one value flows projection -> record -> writer, acceptable. Unnamed (R02): the hop runtime -> driver -> `WasmServiceLifecycle` -> `enableServicesRowPublication(replica, serviceType)`; the runtime holds no replica (`service-runtime-consensus-bootstrap.js:17-26` only has the driver). Name the driver method.

---

## 4. Endpoint row

### RB3 (BLOCKING) The remover still resolves S by parsing the physical id; every bound endpoint leaks at retirement
- Evidence: `removeRuntimeEndpointAtIncarnation(replicaId, nodeId)` (`runtime-endpoint-publication-wiring.js:137-160`) calls `resolveLogicalServiceId(systemTableCache, replicaId)` (`:142-145`); for `wasm-instance-<digest>-rN`, `classifyRuntimeServiceIdentity` is INVALID for every definition (`runtime-service-replica-identity.js:13, 24-44`), so it throws `LOGICAL_SERVICE_NOT_FOUND` (`:66-71`); `_removeEndpoint` swallows and emits ENDPOINT_REMOVAL_FAILED (`service-runtime-lifecycle.js:525-534`). Even with resolution the derived id is `${S}-ep-${node}` (`:149`), not the bound row's. RV1.3 makes only the writer binding-first ("incarnation CAS unchanged").
- Scenario -> wrong output: C6-7 "endpoint gone before admission closes" fails; in production a retired I founder's endpoint stays HEALTHY in the catalog and discovery routes to a closed replica.
- Required: the bound STOP branch calls the remover with the physical id and the remover, for a bound removal, derives `${physical}-ep-${node}` without logical resolution (or `_removeEndpoint` gains the binding and the remover resolves binding-first like the writer); predicate unchanged (`mutateEndpointAtIncarnation :195-219`). Add the mutation "remover resolves S by parsing".

### RB4 (BLOCKING, R19) The address owner is a literal default; "the embedding supplies endpointHost" makes the witness measure the fixture
- Evidence: nothing in `src/` sets `endpointHost` or `address` on a WASM replica context (grep: only `native-js-driver.js:253-255` reads it; `wasm-component-driver.js:69-72, 499-507` falls through to `'localhost'`); the bound `owned` context is `{definition, consensusCreation, consensusOpeningOwner}` (`service-consensus-bootstrap.js:135-136`); `stateRow.address = definition.address` is null for a bound descriptor (`service-runtime-state-projection-handoff.js:24`). The production address for the only runtime service that publishes one today comes from its module config (`pgwire-runtime-module.js:423-424`), not from a context field.
- Scenario -> wrong output: every production bound endpoint and services row advertises `localhost`; a client on node A resolves S to `localhost:<port>`; the embedding (loopback, fixture-injected `endpointHost`) is green.
- Required: the node's advertised address owner is the node itself, `nodeAddress` (`node-service.js:81, 149, 539`; `bootstrap-service.js:199`), the value it publishes as `nodes.node_address` (NODES schema). Expose it through the existing dependency owner `createWasmServiceNodeDependencies` (`runtime-startup-wiring.js:37-49`, `get nodeAddress()`), have `boundStartResult` (`wasm-creation-publication.js:104-114`) carry `host`, and have the runtime compose the endpoint intent and the services-row `address` from it; the embedding supplies `nodeAddress` per host in its dependency object (the production owner's shape). Mutation: "address literal".

### RR11 (required) Edges, cached views and identities still missing
- Edges: the endpoint writer returns `{success: false, outcome}` for `REFUSED_STALE_INCARNATION`, `AUTHORITY_UNAVAILABLE`, `NOT_APPLIED` (`runtime-endpoint-publication-wiring.js:85-91`; `endpoint-incarnation-authority.js:35-43`) without throwing; the unbound branch ignores the return (`service-runtime-lifecycle-operation-methods.js:385-395`) - the bound branch must inspect it and map all three to the CREATE_HELD class, not only the stale one in RV1.5. `_projectReplicaState` is a silent no-op without a writer (`service-runtime-lifecycle.js:476-478`) and the endpoint write is skipped without one (`:385`): in the bound branch an absent writer is a typed `PUBLISHED_UNPROJECTED` reason, never PRESENT (R11; production does wire both: `sql-query-engine-lifecycle-and-callback-dispatch.js:388`, `runtime-service-handler-setup.js:55-59`). Recover outcomes (RR1). REMOVE on a CLOSED/PENDING row (RB1, RR6e).
- Cached view: the handler's class check (RB2 step 3) reads the service_definitions cache (`runtime-service-handler.js:739-755`); with `ADMISSION_RETAINED` first, a lagging cache cannot FAIL a bound CREATE; today a missing row throws DEFINITION_NOT_FOUND -> FAILED (`:371-375`). Record it in section 4.
- Identities: add the driver's S-keyed `_prepared`/`_lifecycles`/`_running` (`wasm-component-driver.js:171-186, 362-363`; `wasm-component-driver-consensus.js:82-91` clears them by token).

---

## 8. PRESENT record and PUBLISHED_UNPROJECTED

### RR5 (required) Where the projection runs relative to the manager's authority check is still stated impossibly
- The draft's decision 5 ("startConsensusBootstrap after confirmPublishedAuthority") cannot hold: `confirmPublishedAuthority` runs in the manager after the runtime returned (`service-consensus-bootstrap.js:139-144, 107-126`); the runtime's bound START (`service-runtime-consensus-bootstrap.js:17-26`) is where the writers live. Revision 1 keeps the sentence. State one of: (a) the runtime projects on the lifecycle's PUBLISHED, which already carries the owner's CAS and the durable local grant (`wasm-creation-publication.js:65-94`), and the manager's CONTRADICTED branch (`:120-122`) retires through the bound STOP branch, which removes the endpoint and deletes the row, so a forged PUBLISHED driver result projects rows transiently and withdraws them (record under the trusted-host threat model, authority-and-recovery.md "Threat model"); or (b) the projection moves behind a new adapter call after confirmation. For `PUBLISHED_UNPROJECTED` the manager returns before any re-resolve (`:143`) and stays STARTING: say it.
- The PRESENT latch itself is right: `queueRoleUpdate` returns before recording a pending value while held (`wasm-service-replica.js:504-508`), so the replay from `replica.role` / `isLeader` is both necessary and sufficient, and the steady-state trigger exists (N2). A re-drive that finds PRESENT replays nothing: witness it (RR9h).

### RR2 (required) The HELD outcomes "carry" nothing the emitter keeps, and are coordinator no-ops
- `buildExecutorOutcome` keeps only replicaId, partitionId, errorMessage, errorCode, retryAfterMs, deferRetry (`executor-outcome-emitter.js:41-79`); `genesis.outcome`, `grant.outcome`, `retirement.outcome` are dropped unless `EXECUTOR_OUTCOME_FIELD` (`executor-outcome-constants.js:43-54`) gains them. `updateStep` to the same step returns false (`operation-workflow-transition-orchestration.js:382-386`) and `reconcileExecutorStepUpdateOutcome` acts only for REPLICA_CREATE_SYNCING (`operation-workflow-executor-outcome-reconcile-methods.js:797-814`), so CREATE_HELD/REMOVE_HELD at CREATING/STOPPING change no row. Correct the "carries" claims (name the field owner or drop them) and state that the held outcomes are observation only until B9's owner exists. Both types still need `EXECUTOR_OUTCOME_ACTION_MAP` entries (`:70-115`), as RV1.2 says.

---

## 2 (node side). Bound-class discriminator (RV1.4)

### RR8 (required) "with a creation revision" is unevaluable from the handler; the sentence contradicts itself
- `getCreationRevision(revisionId, tenantId)` (`service-install-catalog-owner.js:394-405`) needs a revision id the command owner derives from the tenant/name identity (`service-lifecycle-command-owner.js:182`); the handler has no catalog owner and `service_definitions` has no revision column (`wasm-service-models.js:18-39`). The catalog owner has no by-service read (method list `:196-704`: `listInstallations` is a scan). Required: the handler-side class = `runtime_kind === wasm_component` AND NOT `isRequestCellDefinition(row)` (`request-cell-runtime-contract.js:220-224`, on `binding_*` columns `wasm-service-models.js:33-35`) AND `service_id` not a built-in (`META_SERVICE_ID`, `constants/wasm-meta.js:54-55`; `meta-service-factory.js:52-118` - sys-wasm-meta is the only wasm_component built-in); installed-package is the complement by construction. Or inject the catalog owner and name its read. RV1.4's "the handler never keys on runtime_kind" must be reworded: routing keys on the journal (RB2), the refusal class keys on the row.

---

## 9. Typed edges, cached view, identity

Covered in RR1, RR6, RR11. Anchors in section 5 hold (STALE_BINDING sealed; incarnation CAS; digest includes incarnation `runtime-service-replica-identity.js:78-80`).

---

## 10. Proof plan (RV1.6)

### RB5 (BLOCKING) The C6 embedding as listed cannot instantiate the handler nor exercise the role CAS through the production predicate; the payload builder is mis-cited
- (a) `RuntimeServiceHandler.initialize()` throws without `cdcIntegrationService` and `systemTableCache` (`runtime-service-handler.js:175-189`); `resolveServiceDefinition` reads SERVICE_DEFINITIONS from the cache (`:739-755`); `recoverLocalReplicaForRemoval` reads SERVICES from the cache (`:484-508`), so C6-9 needs the cache fed from the fixture's SQLite services table. RV1.6 lists neither for the handler.
- (b) The APPLIED role write: without `cdcIntegrationService` on the replica, `writeRoleUpdate` returns `{success: true}` having written nothing (`wasm-service-replica.js:641-643`); with a `roleUpdateWriter` injected it bypasses the predicate under test (`:635-639`), so the mutation "`service_type 'wasm_service'` in the role CAS" is uncatchable. The production path needs `isSystemTableWriteReady(systemTableCache, SERVICES)` true (`:712-716`; `leader-readiness-gate.js:232-252`: a services-p1 partition record and a canonical leader service row in the cache) else the helper retries forever (`authoritative-row-mutation-helper.js:261-264`); the replica's cache comes from the `NodeService` singleton (`wasm-service-replica.js:144-145`), not from the lifecycle (`wasm-service-lifecycle.js:235-253` passes none). Feasible with: the SQLite fixture's CDC (`service-instance-creation-sqlite-fixture.js:106-113`; the replica's gateway bundle consumes `cdcIntegrationService.sqlQueryEngine`, `control-plane-runtime-bundle.js:36-38`) and a replica `systemTableCache` holding the write-ready rows (a labelled fixture seam under the "no fabricated routing rows" rule of `wasm-creation-bound-native-fixture.js:2-4`), which today needs a new `systemTableCache` lifecycle dependency or a fixture reach-in.
- (c) The real CREATE_REPLICA/REMOVE_REPLICA request is the literal at `operation-workflow-dispatch-response-reconcile.js:636-647` (a coordinator method); `replica-dispatch-readiness-capture.js` builds an Operation from a row (`:144-220`) and the reverse (`:228-256`), not the message. RV1.6 names the wrong owner.
- (d) The only existing real-handler + real-manager composition (`test/runtime/minimal-deployment-request-cell-runtime-readiness.test.js:284-302`) stubs cache, CDC and emitter: a shape to copy, not a feed.
- Scenario -> wrong output: the implementer invents the handler's cache/CDC and the role path; if `roleUpdateWriter` is injected, B7's witness passes while the production predicate is never exercised, so B7's resolution is unproven (R19).
- Required: list in RV1.6 the handler's `systemTableCache` (service_definitions + services rows, fed from the fixture's SQLite tables after each projection or reading through) and `cdcIntegrationService`; the replica's `cdcIntegrationService` and `systemTableCache` with the write-ready rows (labelled seam) and the sentence "`roleUpdateWriter`/`leaderNodeUpdateWriter` are not injected"; a real `ExecutorOutcomeEmitter` (constructed already in `test/rebalancer/*`); extract the request literal into an owner function the fixture can call (or record that the fixture authors the payload from `ReplicaOperationField` keys, `replica-operation-constants.js:46-62`); and assert the role write by reading the SQLite row's `raft_role`, not the helper's result.

### RR9 (required) Cells and mutations to add
- (a) production-shaped manager (no journal) x native_js or Cell CREATE -> generic path; x bound-class -> UNAVAILABLE deferral (RB2). (b) REMOVE after `closed:false` recovers from the journal-only read and resolves (RB1). (c) REMOVE on a PENDING row reserves nothing (RB1). (d) the remover deletes the physical-id endpoint without logical resolution (RB3). (e) `address` equals the node owner's value on every host, never `localhost` (RB4). (f) role CAS APPLIED asserted on the row (RB5). (g) a leader change after PRESENT re-publishes through `applyReplicaLeadership` (`replica-leadership-state.js:62-79`). (h) the first role write happens at PRESENT and a re-drive that finds PRESENT writes nothing. (i) absent endpoint/projection writer -> typed `PUBLISHED_UNPROJECTED`, never PRESENT (RR11). Mutations: recover-for-REMOVE; UNAVAILABLE deferral for non-bound-class; remover parses S; address literal; writer absent treated as PRESENT.

---

## Recorded (N)

- N1 `instanceIdentifier` accepts replica_operations UUIDs (`service-instance-contract.js:25-28`); `instanceFailure` maps non-contract errors to UNAVAILABLE (`:107-109`): R20's reading confirmed.
- N2 WASM role/leader publication is event-driven: `wasm-service-replica-lifecycle.js:120-126` -> `replica-leadership-state.js:62-79, 94-100` -> `queueRoleUpdate`/`queueLeaderNodeUpdate`; held replicas record no pending value (`wasm-service-replica.js:504-508`): the PRESENT replay is correct as designed.
- N3 Grouping by `metadata.service_name` + protocol confirmed (`endpoint-sync-planner.js:46-63`, `endpoint-sync-source-query.js:150-157, 208`); the catalog's `serviceIds` are unique per group and `desiredReplicaCount` resolves for one id (`service-discovery-catalog.js:231-252`): RV1.3's row shape gives one group of three.
- N4 `PortAllocator.allocate` is idempotent per serviceId (`port-allocator.js:50-54`): bootstrap re-entry on a READY replica is safe (stage-1 proven).
- N5 `manager.stopReplica` already routes bound handles to `retireConsensusCreation`, which sets `_replicaStateById` STOPPING/STOPPED (`service-lifecycle-operations.js:423-429`; `service-consensus-bootstrap.js:91-96`).
- N6 After HELD only `localReplicas` holds the operation id (`runtime-service-handler.js:442-444`); `existing.status === HELD` before the in-progress check is the right order.
- N7 `recoverPendingOperations` has no production caller (grep): the restart scan is the recovery stage's, consistent with RV1.2's restart sentence.
- N8 `isConsensusCreationRow` (`service-consensus-creation-intent.js:218-221`) is reachable only from the restart scan (`recoverConsensusCreationRow :222-226`); the handler never sees a row, so RV1.4's first sentence should cite the recover outcome (folded into RB2/RR8).
- N9 Lines RV1 cites were checked and are exact at `7e184b8aa`: `runtime-service-handler.js:515-698, 484-508`; `replica-operation-progress.js:12-27`; `service-consensus-bootstrap.js:12-19, 85-103`; `system-table-core-schema-definitions.js:229-260`; `wasm-service-replica.js:645-657, 691-704`; `endpoint-sync-planner.js:46-63`; `service-endpoint-builder.js:31-41`; `wasm-component-driver.js:69-72, 499-507`; `insertRuntimeReplicaServicesRow :156-162`; `service-consensus-creation-intent.js:218-221`.

---

## Findings summary (one round)

| Id | Class | Category | Required change |
|---|---|---|---|
| RB1 | BLOCKING | 5 | REMOVE recovers the creation through a journal-only manager read (no policy, no reserve, no metadata); handle -> `manager.stopReplica`; PENDING -> NOT_ADMITTED; CLOSED slot still retires locally |
| RB2 | BLOCKING | 6/1 | recover first; ADMISSION_RETAINED -> bound; INTENT_NOT_FOUND/UNAVAILABLE -> classify the row; non-bound-class -> generic path untouched; production-shape witness |
| RB3 | BLOCKING | 4 | bound remover derives `${physical}-ep-${node}` without parsing S; mutation added |
| RB4 | BLOCKING | 4 | address from the node's `nodeAddress` through `createWasmServiceNodeDependencies`; never a context literal; mutation added |
| RB5 | BLOCKING | 10 | C6 embedding: handler cache + CDC, replica cache (write-ready rows, labelled) + CDC, no injected role writers, real emitter, real payload owner cited, row readback for APPLIED |
| RR1 | required | 6/9 | map TERMINAL_OPERATION/RESOURCE_CLOSED/CONTENT_CONFLICT/CORRUPT_STATE/UNKNOWN; one manager resume method or record the doubled reads |
| RR2 | required | 8/7 | HELD outcomes carry nothing the emitter keeps; same-step updates are no-ops; name the field owner or drop the claims |
| RR3 | required | 6 | HELD in `PEER_ROW_EXCLUDED_STATUSES` (fail-closed) or a handler-local status owner |
| RR4 | required | 3 | record "no cleanup_token on bound rows" and the stable-token meaning; name the runtime->driver->lifecycle PRESENT hop; R17 for the unbound predicate defect |
| RR5 | required | 8 | fix the projection-vs-`confirmPublishedAuthority` order (a or b); record the forged-result consequence |
| RR6 | required | 5 | `stopReplica(handle)` not `retireConsensusCreation`; `find` by replica_id with the guard fixed; journal scan owner or drop the clause; memo stays REMOVING; CLOSED-slot REMOVE completes |
| RR7 | required | 7 | enqueue-only consumer; scan cost; `NO_LOCAL_OPERATION` owner module |
| RR8 | required | 2 | class = wasm_component AND not Cell AND not META_SERVICE_ID; reword "never keys on runtime_kind" |
| RR9 | required | 10 | cells (a)-(i) and five mutations |
| RR10 | required | 1 | append the D0 supersession decision to the quest log; RB2/RB4 are the two 1c items decided on the production shape |
| RR11 | required | 9/4 | writer return values; absent writer typed; cache-lag note; driver S-keyed maps |
| N1-N9 | record | - | confirmations above |

What an implementer must not do from Revision 1: do not recover a REMOVE's
creation through `recoverConsensusCreation` (RB1); do not defer a native_js or
Cell CREATE on UNAVAILABLE (RB2); do not let the remover resolve S for a
physical id (RB3); do not write `localhost` or a fixture-injected host as the
advertised address (RB4); do not inject `roleUpdateWriter` into the C6
embedding and call the role write proven (RB5).

## What I did not read or run (bounded, counted)

Not read in full: `authoritative-row-mutation-helper.js` beyond the flush and
retry sites listed; `control-plane-system-table-gateway.js` beyond the
constructor and `readAuthoritativeRows` (the SQLite fixture's seam);
`services-owner.js`/`endpoint-metadata-owner-base.js` beyond their method
lists; `service-lifecycle-recovery.js` beyond `:150-232`;
`node-service.js` beyond the address and cache getters; the remaining 60
`replica_id` grep hits outside the services-row consumers named in RR4
(classified by path as partition/message-group/query-routing owners, not
read); `test/rebalancer/*` emitter constructions (located, not read). Not run:
anything.
