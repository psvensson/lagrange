# Design vet: activation and discovery of bound WASM service groups (stage 1c, DRAFT)

Subject: `scratchpad/design/ACTIVATION-DISCOVERY-DESIGN-draft.md` as on disk at vet time
(D0 carries the owner ruling of 2026-10-17; everything else as first read). Tree read:
`/mnt/data/peter/projects/.worktrees/rs-raft-event-reconciliation-20261016` at `89e70949f`
plus the lead's uncommitted stage-1b changes (`service-instance-metadata.js` is the A2
implementation, so its line numbers differ from the draft's `:76-104`/`:105-118`; every
`file:line` below is from the tree as read, not from the draft). Read-only: nothing in any
worktree touched, nothing run.

Read in full (R18): CLAUDE.md, rules.md, router.md, authority-and-recovery.md,
CONTRACT-R2.md, HANDOFF-INTERFACES.md, the serving/publication design (original, Revision 2,
Revision 3, A1, A2, A2'), vets A, B, the re-vet R2, the A2 vet, the stage-1 verifier
verdict, the epic, the alpha single-path closeout, the closeout plan, the design-note
template, every source file the brief lists, plus the collaborators the draft's claims
reach: `startup-service-lifecycle-owner.js`, `runtime-service-handler-setup.js`,
`bootstrap-service-control-plane-runtime-methods.js:140-180`, `runtime-service-adapter.js`,
`service-lifecycle-operations.js:200-453`, `service-lifecycle-recovery.js:80-260`,
`unified-rebalancer-replica-state.js:255-330`, `unified-rebalancer-rebalance-loop.js:230-300`,
`unified-rebalancer-policy-scheduler-methods.js:25-120`, `runtime-service-policy.js`,
`rebalance-coordinator-replica-identity-methods.js:434-474`,
`replica-dispatch-readiness-capture.js:170-220`, `replica-dispatch-operation-execution.js:30-120`,
`operation-workflow-executor-outcome-reconcile-methods.js:330-600`,
`operation-workflow-recovery-status-reconcile.js:690-770`,
`operation-workflow-dispatch-rearm-evidence.js:675-700`,
`operation-workflow-dispatch-response-reconcile.js:925-965`, `executor-outcome-constants.js`,
`replica-operation-progress.js:10-45`, `rebalancer-constants.js:61-156`, `timeout-budget.js:10-17`,
`endpoint-sync-planner.js:46-63`, `endpoint-sync-source-query.js:140-230`,
`system-table-core-schema-definitions.js` (SERVICES_SCHEMA), `service-endpoint-builder.js:31-41`,
`service-runtime-state-projection-handoff.js`, `wasm-creation-publication.js`,
`wasm-creation-retirement.js`, `wasm-creation-opening.js:185-240`,
`wasm-component-driver-consensus.js`, `request-cell-runtime-contract.js:220-224`,
`service-lifecycle-command-owner.js:330-400`, `system-table-cache-observation-methods.js:290-360`,
`system-table-schemas-constants.js` (wasm_operations / service_instances partitions).

## Verdict: REVISE (blocking: B1-B9; required: R1-R24; recorded: N1-N6)

What the draft gets right and the vet confirms: the identity-reuse diagnosis (a bound row
under the physical `wasm-instance-<digest>-rN` id, logical S from the binding); the endpoint
incarnation CAS and remover-by-predicate as the right retirement surface; the
`service_instances` CDC policy does propagate to the cache (`cdc-table-policy.js:106-113`),
so a cache-change wake is real; no consumer parses the endpoint id
(`grep EP_ID_SEPARATOR|'-ep-'` over `src/` hits only the writer and the builder;
`endpoint-service.js:77-82` reads by exact id); the owner's own refusal vocabulary already
covers selection and prepare; and `wasm_operations` is a replicated system table
(`system-table-schemas-constants.js:162, 284-286`), so a leader-side retention row is
readable on the founder node in principle.

What it gets wrong: the mechanism is specified against owners that production never wires
(B1, B2), reads a slot table no owner exposes (B3), has no REMOVE path (B4), routes request
Cells and meta services into selection (B5), writes services columns that do not exist and a
`service_type` the role writer will never match (B6, B7), describes a deletion target that
does not exist (B8), and leaves a held CREATE under a 60 s step timeout that FAILs it (B9).
None of these needs a new architecture; each needs the owner named and the mechanism
sentence corrected.

---

## 1. Section 1 completeness (every consumed surface cited from the current tree)

### B1 (BLOCKING, NEW MECHANISM) The production `ServiceLifecycleManager` has no journal and no metadata owner, so `prepareConsensusCreation` and `recoverConsensusCreation` answer UNAVAILABLE everywhere
- Evidence: `src/bootstrap/shared/startup-service-lifecycle-owner.js:27-31` constructs
  `new ServiceLifecycleManager({timeSource})` with no `serviceDefinitionsOwner`; a repo grep
  over `src/` for `setOperationWriter(|setIdempotencyReader(|setRecoveryReader(` finds no
  caller outside the two owner files; `requireDependencies`
  (`service-consensus-creation-intent.js:58-64`) requires `_operationWriter`,
  `_idempotencyReader` and `_serviceDefinitionsOwner.reserveInstanceResource/
  resolveInstanceResource`, else `UNAVAILABLE`; `prepareConsensusCreation :175-193` and
  `recoverConsensusCreation :194-217` both pass through it. The draft's section 1 lists
  "Producer-side retention: `ServiceLifecycleManager.prepareConsensusCreation` ... journal
  row + reserve + admission retained" as an EXISTING surface.
- Scenario -> wrong output: implement as drafted on the production tree; every cohort's
  first `prepareConsensusCreation` answers `{outcome: UNAVAILABLE}`; the planner records
  `{cohort: REFUSED}` every cycle; no `wasm_component` service is ever formed, typed and
  silent at INFO. On the node side every bound CREATE answers UNAVAILABLE -> FAILED.
- Also missing: `wasm_operations` has CDC policy `CONTROL_NO_INTERNAL_PROPAGATION`
  (`cdc-table-policy.js:388-395`), so the node's `readJournal` (`:65-70`) must be an
  authoritative routed read of `wasm_operations-p1`, never a cache read; the draft names no
  reader, no read mode, and no writer owner for that table.
- Required: section 1 "Surfaces to create": (i) the manager's operation writer, idempotency
  reader and recovery reader bound to the system-table gateway for `wasm_operations` with
  `OWNER_RPC_REQUIRED` (cite the gateway owner), on seed and joiner startup; (ii)
  `serviceDefinitionsOwner` injected into the manager (the owner exists:
  `bootstrap-service-control-plane-runtime-methods.js:158`,
  `node-joining-publication-activation.js:527`); (iii) the wiring order relative to
  `RuntimeServiceHandlerSetup.create` (`runtime-service-handler-setup.js:111-197`).

### B2 (BLOCKING, R09/R16) The production WASM dependency owner supplies none of the owners the bound route needs, and CONTRACT-R2 says production node startup keeps that refusal
- Evidence: `runtime-startup-wiring.js:27-49` supplies only `nodeId`, `messageRouter`,
  `cdcIntegrationService` and says so: "No node owns a WASM service port allocator or module
  mirror yet, so neither is supplied: a placed replica's start is the lifecycle's typed
  unavailability". `WasmServiceLifecycle.startReplica` refuses `PORT_ALLOCATOR_UNAVAILABLE`
  (`wasm-service-lifecycle.js:467-472`) before any bound branch; `createReplica` passes
  `this.dependencies.serviceDefinitionsOwner` (`:242`) which is undefined in production, so
  `resolveWasmCreationAdmission` refuses UNAVAILABLE (`wasm-creation-opening.js:216-219`).
  `PortAllocator` has no production import (`grep port-allocator.js src/` ->
  `src/test-helpers/port-allocator.js` only); `ModuleMirror` is constructed only in
  `entrypoint-runtime-admin-composition.js:77`. CONTRACT-R2 `:217-220`: "Node startup lacking
  module mirror/port allocator keeps its typed refusal; test embedding supplies those actual
  existing owners and does not claim a new catalog/deployed activation product."
- Scenario -> wrong output: the draft's section 0 freezes "formed in production through the
  bound creation route"; on the production tree every bound START answers
  `PORT_ALLOCATOR_UNAVAILABLE` -> `BOOTSTRAPPED_HELD`-class refusal -> FAILED outcome. The
  claim is unreachable without node owners the draft never names, and naming them widens the
  sealed contract's scope.
- Required: an owner decision, recorded in D0 or a new D1: either (a) restate the claim as
  "through the existing owners when the node supplies them (embedding), production node
  owners for port allocation and module mirror are a later unit", or (b) widen explicitly:
  name the two production owners as surfaces to create, their dependency injection into
  `createWasmServiceNodeDependencies` (plus `serviceDefinitionsOwner`, `timeSource`,
  `dataDirectoryManager`), and record the supersession of CONTRACT-R2 `:217-220` (R09).

### B3 (BLOCKING, NEW MECHANISM) Decision 3's inventory ("founders and their slot phases") has no read surface on the metadata owner
- Evidence: `getCurrentInstance` (`service-instance-metadata.js:139-152`) returns
  `{outcome, version, selected: binding|null, retiring: binding|null}`: bindings only, no
  `resources`. `resolveInstanceResource` (`:207-217`) needs an exact token. Nothing on
  `ServiceDefinitionsOwner` returns the nine slots. The draft cites `getCurrentInstance` as
  the surface and then consumes slot phases from it.
- Scenario -> wrong output: an implementer either decodes the `service_instances` row in the
  planner (`decodeInstanceState`, R03 copy of the owner's knowledge) or keys the decision
  table on services rows (presentation as authority, R10). Decision 3's rows "slot ADMITTED +
  no live operation -> re-dispatch" and the leader-change re-dispatch (needs
  `resource.token.operationId` to call `recoverConsensusCreation`) are both unimplementable
  as cited.
- Required: a named owner read, e.g. `readInstanceResources(S)` on `ServiceDefinitionsOwner`
  returning `{outcome, version, selected: {binding, resources}, retiring: {...}}` (bounded by
  the sealed caps), listed under "surfaces to create", and the planner cited as its consumer.

### B4 (BLOCKING, NEW MECHANISM) The REMOVE side is entirely uncited and today routes a bound replica through the orderly, unbound stop
- Evidence: `RuntimeServiceHandler.handleRemoveReplica`/`removeReplicaAsync`
  (`runtime-service-handler.js:515-698`) builds a handle without `consensusCreation`
  (`:646-653`) and calls `serviceLifecycleManager.stopReplica(handle)` (`:655`) = the
  generic `runReplicaOperation` (`service-lifecycle-operations.js:333-410`: `_assertTransition`
  from `_replicaStateById`, STOP journal row, COMPLETE on return, FAIL on throw) ->
  `RuntimeServiceAdapter.stopReplica` -> runtime `stop` (`service-runtime-lifecycle-
  operation-methods.js:468-565`): `hasConsensusCreation(definition)` is false -> the UNBOUND
  flow -> `driver.stop` (`wasm-component-driver.js:522-565`): not bound -> `lifecycle.
  stopReplica(serviceId)` = ORDERLY (no RELEASING, no tombstone, no CLOSED) ->
  `_removeEndpoint(S-rN)` parses S -> deletes `${S}-ep-${node}` (absent for bound rows) ->
  STOPPED projection deletes row `S-rN` (absent). `retireConsensusCreation`
  (`service-consensus-bootstrap.js:85-103`), the manager's bound STOP, has NO production
  caller. Before any of that, `recoverLocalReplicaForRemoval` (`:484-508`) reads the
  services row by `S-rN`; a bound row is keyed by the physical id, so after a handler
  restart the REMOVE answers `NOT_FOUND`, which the coordinator treats as stop-phase
  satisfied (`operation-workflow-dispatch-response-reconcile.js:941-949`).
- Scenario -> wrong output: planner issues REMOVE for I's founder (D0's own retirement claim,
  or a node-failure cure); the replica is orderly-stopped: slot stays PUBLISHED, no tombstone,
  J held `PREDECESSOR_OUTSTANDING` forever; or, after a restart, NOT_FOUND completes the
  REMOVE while the replica keeps serving under a PUBLISHED slot (an orphan the planner never
  sees again). Decision 6 ("`retireConsensusBootstrap`: `_removeEndpoint` ... `driver.stop`
  -> `retireReplica(creation)`") assumes a routing that nothing performs.
- Also: a `CLOSE_UNRESOLVED` result has no executor-outcome shape (`EXECUTOR_OUTCOME_TYPE`
  has only `RUNTIME_SERVICE_REMOVE_COMPLETED|FAILED`, `executor-outcome-constants.js:32-35`),
  and decision 3's row "RELEASING/CLOSED -> no action for I (retirement owns it)" names no
  re-driver: a `closed:false` retirement leaves the slot RELEASING with nobody re-stopping
  (authority-and-recovery.md: "fail-closed without an owned continuation is not completion").
- Required: (i) the handler's REMOVE routes a bound replica to
  `manager.retireConsensusCreation({definition, consensusCreation, consensusOpeningOwner})`
  with the retained creation recovered by operation id (B3/R1 give the id); (ii) a typed
  non-terminal outcome for `closed:false` and the decision-table row "slot RELEASING + no live
  REMOVE -> re-dispatch REMOVE" with the planner as the named re-driver; (iii)
  `recoverLocalReplicaForRemoval` keyed by the physical id (or by the retained creation);
  (iv) the services-row STOPPED projection and endpoint removal cited under the bound STOP
  branch, not the unbound one.

### B5 (BLOCKING) "For a `wasm_component` definition S" routes request Cells and meta services into selection; the bound discriminator is not runtime_kind
- Evidence: the planner knows only `entityType === RUNTIME_SERVICE`; `getRuntimeServicePolicy`
  (`unified-rebalancer-policy-scheduler-methods.js:77-120`) reads the definition row for
  `replica_count` only. Binding-derived definitions are `wasm_component`
  (`request-binding-service-definition-contract.js:256-289`), are request Cells
  (`isRequestCellDefinition`, `request-cell-runtime-contract.js:220-224`), and get the policy
  target 3 (`runtime-service-policy.js:19-31`,
  `REBALANCER_DEFAULT_POLICY.RUNTIME_SERVICE.targetReplicaCount` `rebalancer-constants.js:146-147`),
  so they ARE planned today and placed through `#prepareRequestCell`
  (`wasm-component-driver.js:293-294, 300-333`), never through `WasmServiceLifecycle`.
  `sys-wasm-meta` is `wasm_component` with no install lineage
  (`meta-service-factory.js:52-67`). `validCreationLineage` (`service-instance-state.js:167-177`)
  requires an install-catalog revision whose `manifest.name` derives S and whose
  `config.definition` equals the request's. HANDOFF `:11-12`: "Request Cells retain their
  existing path and do not acquire these fields by inference."
- Scenario -> wrong output: an ACTIVE request Binding's cell definition is routed to
  `selectConsensusInstance` -> `INVALID_LINEAGE` every cycle -> `{cohort: REFUSED}` -> the
  Cell is never placed again (regression of a shipped feature); `sys-wasm-meta` scaled up
  would be refused the same way with no exit.
- Required: name the discriminator as "installed-package `wasm_component` service with a
  creation revision (`service-install-catalog-owner.js:394 getCreationRevision`) and NOT a
  request Cell (`isRequestCellDefinition` false)", cite where the planner reads it, and fix
  D0's "every `wasm_component` runtime service" to that class; Cells keep their path.

### B6 (BLOCKING) Decision 5 projects services columns that do not exist
- Evidence: `SERVICES_SCHEMA` (`system-table-core-schema-definitions.js:229-260`) has
  `service_id, service_type, node_id, partition_id, group_id, replica_id, raft_role, status,
  state_entered_at, previous_state, trigger_reason, error_message, cleanup_token,
  create_attempt_token, address, created_at, updated_at`; no `metadata`, no binding digest,
  no token column. `buildReplicaStateProjectionRequest` spreads `extras` into the row
  (`service-runtime-state-projection-handoff.js:20-27`); `writeRuntimeReplicaServicesRow`
  UPDATEs then INSERTs those columns (`runtime-replica-state-projection.js:183-203`).
- Scenario -> wrong output: `_projectReplicaState(physicalReplicaId, descriptor, ACTIVE,
  {metadata: ...})` -> SQL error on an unknown column -> ACTIVE projection throws
  (`service-runtime-lifecycle.js:498-500`) -> `PUBLISHED_UNPROJECTED` on every re-drive;
  discovery closed forever while the replica serves.
- Required: name the columns that carry the binding/token (existing `replica_id` = canonical
  `S-rN`, `group_id` = `wasm-instance-<digest>`, and either `cleanup_token`/`create_attempt_token`
  reuse with a recorded meaning or a schema change with an epic upgrade note), and the owner
  of `EP_META` keys for the endpoint metadata (`service-endpoint-builder.js:31-41`).

### R1 (required) The retained operation id has no named carrier from coordinator to handler
- Evidence: the dispatched operation is rebuilt from the row's `steps_history` metadata keys
  (`replica-dispatch-readiness-capture.js:170-220`: REPLICA_IDS, PEER_ADDRESSES, BOOTSTRAP_*);
  the handler reads only `request[OPERATION_ID]` (the replica_operations id,
  `runtime-service-handler.js:225-228`). `createOperation(... {consensusOperationId})` names
  no `OPERATION_METADATA_KEY`, no `ReplicaOperationField`, no dispatch copy. Alternative that
  needs no carrier: `move.operationIntentId` makes the replica_operations id EQUAL the slot
  request's operationId (`rebalance-coordinator-operation-creation.js:610`), so the handler's
  `operationId` is the journal key and the wake's `token.operationId` maps directly.
- Required: decide one id or two; cite the carrier or the `operationIntentId` path; state how
  the node maps the wake's `token.operationId` to its `localReplicas`/`inProgressOperations`
  entries (decision 7).

### R2 (required) The inventory readers list is incomplete and the SQL projection is missed
- Evidence: besides the two readers the draft names, `runtimeServiceReplicaBelongsToEntity`
  is consumed by `unified-rebalancer-replica-state.js:273-311` (`getCurrentReplicas`, the
  planner's actual inventory), `rebalance-coordinator-replica-identity-methods.js:434-474`
  (`allocateCanonicalReplicaId`), `priority-publication-safety-rows.js:106-136` (REMOVE
  safety, via `readAuthoritativeEntityServiceRows`), `rebalance-replace-intent-identity.js:150-154`,
  `operation-workflow-recovery-status-reconcile.js:141`, `binding-route-actuals.js:51`,
  `runtime-endpoint-publication-wiring.js:65`. The SQL `service_id LIKE '${S}-r%'`
  (`entity-service-row-read.js:27-29, :49`) excludes physical ids before the classifier runs.
- Required: enumerate all consumers and the SQL; decide per consumer whether it sees bound
  rows (inventory yes; `allocateCanonicalReplicaId` must still exclude the founders' canonical
  ids, which the physical row does not carry unless `replica_id = S-rN` is projected, see B6).

### R3 (required, R01/R03) The K constructor and the revision source have owners the draft bypasses
- Evidence: CONTRACT-R2 `:27-28` "The caller-facing constructor in ServiceLifecycleCommandOwner
  captures the complete request BEFORE calling ServiceDefinitionsOwner";
  `ServiceLifecycleCommandOwner.prepareConsensusInstanceRequest`
  (`service-lifecycle-command-owner.js:349-355`) exists; `revisionId` is derived at `:182`;
  `K.definition` must equal `revision.config.definition` (`service-instance-state.js:176`),
  i.e. from `getCreationRevision`, not from the service_definitions cache row. The draft:
  "The coordinator builds K ... `revisionId` from the definition's install-catalog lineage".
- Required: the coordinator consumes the command owner's constructor and the catalog owner's
  revision; cite both; state the `expectedVersion` source (`getCurrentInstance.version`).

### R4 (required) Node-side wake consumer wiring needs the lazy handler getter and the id mapping
- Evidence: `createWasmServiceNodeDependencies(this)` runs in the node constructor
  (`bootstrap-service.js:290-293`, `node-joining-owner-construction.js:215-218`) before
  `RuntimeServiceHandlerSetup.create` builds the handler; the existing getters resolve lazily
  (`runtime-startup-wiring.js:38-48`). Fine as a pattern; the draft must say `creationWake`
  is a getter over `node.runtimeServiceHandler` and that the handler gains a method that maps
  `{binding, token}` -> its retained operation (R1).

### N1 (record) Line drift and small miscites
- `_cacheChangeListener` is `:135-145` (draft `:133-145`); `runtimeServiceReplicaBelongsToEntity`
  is `:52-55` (draft `:49-52`); `startConsensusBootstrap` is `:17-26`; `selectConsensusInstance`
  / `getCurrentInstance` are `:113-138` / `:139-152` in the current (A2) tree. The draft's
  `wasm-service-lifecycle.js:94-96` (`physicalReplicaIdentity`) and `:185-187`
  (`creationWake`) are exact.

---

## 2. D0: one formation path

### B8 (BLOCKING, R19) D0 misdescribes the unbound route and names deletion targets that do not exist; the real inventory is unmeasured
- Evidence: `buildOperationBootstrapTopology` returns null for RUNTIME_SERVICE
  (`rebalance-coordinator-operation-creation.js:338-345`); `buildReplicatedServiceBootstrapTopology`
  has no runtime-service case (`replicated-service-topology.js:16-25, 66-70`: null unless
  partition/message_group). The coordinator never built a WASM bootstrap membership. The
  unbound branch's `replicaIds` come from `definition[FIELD.REPLICA_IDS]` = `replicaIds`
  (`wasm-component-driver.js:349-353`, `fields.js:19`); a `service_definitions` row has only
  `replica_count` (`wasm-service-models.js:26`) and the handler's `replicaHandle`
  (`runtime-service-handler.js:378-394`) carries no `replicaIds`, so
  `assertFoundingReplicaSet` throws `REPLICA_SET_REQUIRED`
  (`wasm-service-consensus-port.js:77-81`, called at `wasm-service-lifecycle.js:230`) for every
  dispatched unbound `wasm_component` CREATE today: the production unbound route is already
  dead at prepare. Its live users are tests and `meta-service-lifecycle.js` (`:53, :77`; no
  production caller of `createMetaServiceReplica`/`startMetaServiceReplica` in `src/`).
- Measured dependents of the unbound shape (what D0 actually deletes): `wasm-component-driver.js:
  349-354` and `#projectConsensusStartResult :479-510` (RUNNING + endpointIntent),
  `wasm-service-lifecycle.js:94-96, 229-234, 370-384` (`physicalReplicaIdentity`,
  `ensureWasmServiceDirExists`, `registerEndpoint`), `meta-service-lifecycle.js` (dead), and
  the unbound `WasmServiceReplica` construction (`servingState OPEN`,
  `publishesServicesRow` unbound branch): `test/wasm-service/wasm-service-lifecycle.test.js`
  (45 `createReplica(` sites), `wasm-service-replica.test.js` (35),
  `meta-service-lifecycle.test.js`, `test/raft/raft-rs-backend/wasm-service-group-on-raft-rs.test.js:121-124,
  204-209`, `durable-commit-replica-kinds.test.js`, `startup-cleanup.integration.test.js`,
  `test/node/replica-runtime-cleanup-custody.integration.test.js`, plus `replicaIds:` in 10
  `test/node`, 2 `test/runtime`, 2 `test/service` files. The alpha rule requires the census
  before deletion (`alpha-single-path-closeout-20261013.md:72-77`).
- Scenario -> wrong output: an implementer deletes the "runtime-service case of
  `buildReplicatedServiceBootstrapTopology`" (nothing to delete), keeps the real dead branch,
  and the lane's red `wasm-service-group-on-raft-rs`/`durable-commit-replica-kinds` witnesses
  (closeout plan 1e) are neither superseded nor owned.
- Required: replace D0's inventory with the measured one; decide (owner) whether the unbound
  `WasmServiceReplica`/`OPEN` serving shape itself is deleted (then the D3' unbound READY fence,
  `publishesServicesRow`, and ~80 unit cases are superseded) or only the lifecycle/driver
  formation branches; list the witnesses to supersede by appending; name
  `meta-service-lifecycle.js` as dead code to delete.

### R5 (required) What else depends on the unbound branch and what the alpha rule requires
- `meta-service-factory.js:33, 61, 85, 112` ships every built-in at `replica_count 0`
  ("ship not-started"); `validateReplicaCount` honours 0 (`move-planner-state-methods.js:137-141`).
  No SQL-engine-profile dependency: `SERVICE_PROFILE.SQL_ENGINE` maps to `native_js`
  (`runtime-legacy-mapping.js:36-41`), untouched. `request-binding-service-definition-contract.js`
  compiles Cells at `REPLICA_COUNT 0` and status INACTIVE (`:285, :296`); activation sets
  ACTIVE (`:302-315`) and the policy target applies (B5). The alpha decision's "no old path
  behind a flag" applies to `publishesServicesRow`'s unbound branch and `servingState OPEN` if
  unbound replicas cease to exist in production: record the decision either way.

---

## 3. Producer-side retention before dispatch

### B9 (BLOCKING, NEW MECHANISM) A held bound CREATE is FAILED by the coordinator's step timeout; a HELD outcome cannot re-anchor it
- Evidence: `CREATING_TIMEOUT_MS: 60000` (`rebalancer-constants.js:89`),
  `REBALANCE_OPERATION_BUDGET_MS: 300000` (`timeout-budget.js:17`); the reaper
  `operation-workflow-recovery-status-reconcile.js:693-770` calls `failOperation` when the
  step or budget is exceeded, exempting only REPLACE at ACTIVE/STOPPING
  (`isReplaceExemptFromTimeBudget :741-747`). `EXECUTOR_OUTCOME_ACTION` is
  `UPDATE_STEP|COMPLETE|FAIL` (`executor-outcome-constants.js:61-65`); a same-step
  `updateStep` appends no history entry, so the step-entry anchor is "immune to same-step
  retry churn" (`operation-workflow-dispatch-rearm-evidence.js:679-683`;
  `resolveOperationStepEnteredAtMs`, `operation-workflow-recovery-timeout.js:623-629`). The
  draft: "HELD -> ... `RUNTIME_SERVICE_CREATE_HELD` (workflow stays IN_PROGRESS, observed
  progress)".
- Scenario -> wrong output: J's three founders are HELD `PREDECESSOR_OUTSTANDING` while I's
  retirement completes (minutes under a slow close, or forever under B4); at 60 s each CREATE
  is FAILED -> the failed-create cleanup REMOVE (`FAILED_CREATE_TARGET_LIFECYCLE_PRECONDITION`
  path, `rebalance-coordinator-operation-creation.js:689-705`) is dispatched -> B4's generic
  stop of a replica whose slot is ADMITTED or PUBLISHED, or (decision 1 "plan nothing new")
  no re-plan at all and the slot leaks. Same for I's own founders when genesis waits on a
  slow third node. The design's own section 3 row "bootstrap HELD ... workflow IN_PROGRESS"
  cannot hold.
- Required: an owner decision on the time budget of a held bound CREATE: an explicit typed
  exemption keyed on the metadata slot being live (ADMITTED/PUBLISHED), or a REAL step
  transition `CREATING -> HELD` that re-anchors (then `WORKFLOW_STEP` gains HELD and the
  reaper's `getTimeoutForStep(HELD)` is an owner constant), or progress evidence consumed by
  `reconcileOperationProgress` (`:531-539`); in every case "never FAILED while the slot is
  live" must be a stated invariant with its witness.

### R6 (required, R02/R09) Two durable records for one CREATE: name the interaction
- Evidence: CONTRACT-R2 `:104-108` "The existing operation producer records original B and
  slot/expected ordinal in the immutable replica-operation intent BEFORE dispatch ... persists
  the returned admission token before CREATE delivery"; HANDOFF `:35-43` "ServiceLifecycleManager
  owns the bound CREATE origin/admission row, keyed by consensusSlotRequest.operationId ...
  No independent operation ledger is created." The draft has the LEADER's manager write the
  `wasm_operations` origin row (including `_enforceRuntimePolicy(CREATE)` on the leader for a
  foreign node's replica, `service-consensus-creation-intent.js:179-180`) and the coordinator
  write a replica_operations row carrying only an id.
- Required: record the interaction as a contract (origin/admission = `wasm_operations` row
  written by whichever node's manager produces; dispatch/workflow = `replica_operations` row
  referencing it), or carry B digest + slot in the replica_operations intent metadata as
  CONTRACT-R2 words it; record which policy check runs where.

### R7 (required) "All-or-none before dispatch" has no mechanism and contradicts "all dispatchable at once"
- Evidence: each `createOperation` emits `OPERATION_CREATED` and arms dispatch
  (`rebalance-coordinator-operation-creation.js:900-906`); the only dispatch deferral is
  `deferDispatchUntilBootstrapTopology`, set only by
  `sql-query-engine-initial-partition-provisioning.js:477`. Partial dispatch (founder 1
  created and sent, founder 2's `createOperation` fails) is tolerated by the raft group
  (HELD until quorum) and converges via decision 3 ("slot ADMITTED + no live operation ->
  dispatch"), which is the right statement. The epic's `single-unresolved-operation-owner`
  follow-up owns "a provisioning cohort is one logical operation" (`raft-rs-full-cutover.md:648-663`).
- Required: reword the section 3 row to "partial dispatch converges by decision 3; no
  deferral is used", and record the overlap with that follow-up quest (R17).

### R8 (required) Leader change between retention and dispatch
- The new leader's planner needs slot -> `token.operationId` (B3) ->
  `recoverConsensusCreation` on its OWN manager (B1) -> `createOperation`. State it, including
  that the new leader's manager re-runs `_enforceRuntimePolicy` and that `readJournal` is an
  authoritative read of the replicated table. Recovery of retained rows with no operation is
  then decision 3's first row, not a recovery-stage item.

---

## 4. Identity

### B7 (BLOCKING) The bound services row's `service_type` and the role/leader writers' CAS predicate disagree; role publication becomes vet B's R7 silent retry
- Evidence: `buildReplicaStateProjectionRequest` projects `service_type = definition.serviceType
  ?? 'runtime_service'` (`service-runtime-state-projection-handoff.js:14-16, 21`); the inventory
  readers filter on `service_type === RUNTIME_SERVICE` (`unified-rebalancer-replica-state.js:297`,
  `entity-service-row-read.js:27-28`). The role/leader writers' production path (no
  `roleUpdateWriter`/`leaderNodeUpdateWriter` in `createWasmServiceNodeDependencies`) CASes
  `WHERE service_id = replicaId AND service_type = 'wasm_service' AND node_id = this.nodeId`
  (`wasm-service-replica.js:645-657, 691-704`; `SERVICE_TYPE.WASM_SERVICE`,
  `constants/service.js:6`), ignoring the helper's where clause. `AuthoritativeRowMutationHelper`
  retries a zero-row CAS at 250 ms x2 to 30 s with no attempt budget (vet B R7 evidence,
  unchanged).
- Scenario -> wrong output: decision 5 enables role/leader publication after PRESENT; the
  CAS never matches the projected row; a silent per-replica retry loop runs for the replica's
  lifetime; `raft_role`/leader `node_id` are never published; the PRESENT gate's "replay once"
  witness passes vacuously because the helper reports nothing.
- Required: one `service_type` for the bound row (RUNTIME_SERVICE, which the inventory needs)
  and the role/leader write predicate made to consume it (or production
  `roleUpdateWriter`/`leaderNodeUpdateWriter` dependencies that write through the projection
  owner with the row's identity); the P-witness must assert the role write APPLIED, not that it
  was queued.

### R9 (required) Discovery groups by `metadata.service_name` + protocol, not by `service_id`
- Evidence: `groupEndpointRows` keys by `buildServiceKey(row.logicalServiceName, row.protocol)`
  (`endpoint-sync-planner.js:46-63`); `logicalServiceName = metadata[EP_META.SERVICE_NAME]`
  else `service_id` (`endpoint-sync-source-query.js:149-156, 208`); `buildRuntimeEndpointRow`
  sets `SERVICE_NAME` to its first argument (`runtime-endpoint-writer.js:48-52`), which the
  draft changes to the physical id for the row id.
- Scenario -> wrong output: three endpoint rows with `service_id = S` but
  `metadata.service_name = wasm-instance-...-rN` -> three catalog groups of one replica each;
  `desiredReplicaCount` resolves (one serviceId per group) and `health` reads HEALTHY per
  group: the "catalog reports 3 healthy" witness is vacuous unless it asserts ONE group.
- Required: pin `endpoint_id = ${physical}-ep-${node}`, `service_id = S`,
  `metadata.service_name = S`, `metadata.bindingDigest`/`resourceToken` (new EP_META keys,
  owner `service-endpoint-builder.js:31-41`); witness asserts one catalog group with
  `observedReplicaCount === 3`.

### R10 (required) Endpoint and services-row `address` have no owner in the bound path
- Evidence: the unbound driver answers `host: replicaContext.endpointHost ?? address ??
  'localhost'` (`wasm-component-driver.js:69-72, 499-507`); the bound start answers `port`
  only (`wasm-component-driver-consensus.js:52-55`); `stateRow.address = definition.address`
  (`service-runtime-state-projection-handoff.js:24`) is null for a bound descriptor.
- Required: name the advertised node address owner consumed for both rows (the NODES row /
  `node_address` the CLI already joins, `remote-cache-service-rows.js:61-66`).

### R11 (required) Section 5 omits two identities the mechanism keys on
- `WasmServiceLifecycle.activeReplicas` and `PortAllocator.allocate` are keyed by the logical
  S (`wasm-service-lifecycle.js:258, :333`): one founder per S per node, guaranteed by
  `validFoundingPeers` distinct nodeIds (`service-instance-contract.js:100-105`); the handler's
  `localReplicas` and the manager's `_replicaStateById` are keyed by `S-rN`
  (`runtime-service-handler.js:323`, `service-consensus-bootstrap.js:137`). Add them, and the
  translation owner per key (vet A section 5 asked for this).

### N2 (record) Verified claims
- No consumer parses the endpoint id (grep over `src/`: only writer/builder use
  `EP_ID_SEPARATOR`). `endpoint-service.js:77-82` reads by exact id;
  `priority-recovery-visibility-decision.js`, `admin-service-discovery-readiness-methods.js`,
  `endpoint-incarnation-currentness.js` do not read `endpoint_id`/`service_id` by shape.
  Physical id collision across incarnations: `runtimeServiceConsensusIdentity` digests
  `{serviceId, incarnation}` (`runtime-service-replica-identity.js:78-80`): holds.

---

## 5. Projection order and the services-row PRESENT gate

### R12 (required) Define PRESENT, its latch across re-drives, and the replay's idempotence
- Evidence: `publishesServicesRow` consumers are `queueRoleUpdate :504`,
  `queueLeaderNodeUpdate :526`, `flushRoleUpdate :606`, `flushLeaderNodeUpdate :616`
  (`wasm-service-replica.js`); `queueRoleUpdate` skips when `role === persistedRole`
  (`:505`); the projection writes with `skipCacheWait: true`
  (`runtime-replica-state-projection.js:31`), so `cachedServiceRow` may lag the write and the
  helper's where clause (`wasm-service-metadata-mutation-helpers.js:40-50`) is built from a
  stale or absent cache row.
- Required: PRESENT = "the ACTIVE projection answered applied or observed-by-readback"
  (`insertRuntimeReplicaServicesRow :156-162`), set on the replica by the runtime after
  `_projectReplicaState` returns; a re-drive that finds PRESENT replays nothing; the replay
  is `queueRoleUpdate(replica.role)` + `queueLeaderNodeUpdate(nodeId)` iff `isLeader`, and the
  witness asserts one APPLIED role write (B7).

### R13 (required) `PUBLISHED_UNPROJECTED` needs a vocabulary owner and a manager branch
- Evidence: `confirmConsensusBootstrapResult` accepts only `HELD|PUBLISHED`
  (`service-consensus-bootstrap.js:52-60`), else `SERVING_UNAVAILABLE`;
  `confirmPublishedAuthority :107-126` runs only for PUBLISHED. A new runtime status would be
  refused by the manager unless `CONSENSUS_BOOTSTRAP` (`:12-19`) gains it and the manager maps
  it (RUNNING state? `_replicaStateById`), and the handler maps it to CREATE_HELD.
- Required: name the owner module, the manager branch, and that serving stays enabled (the
  draft says so; the manager must not retire on it: `publishedAuthority` CONTRADICTED retires,
  `:120-122`).

### N3 (record) Interaction with the serving latch is correct as designed
- `isServing` (`wasm-service-serving-state.js:53-55`) and `enableServing :104-111` are
  untouched by PRESENT; serving never depends on the row (authority-and-recovery.md
  "a projection ... cannot grant permission"). Keep the sentence.

---

## 6. Wakes

### R14 (required) Adding `SERVICE_INSTANCES` to the `refresh()` branch is an inert wake
- Evidence: `_cacheChangeListener` (`runtime-service-rebalancer-setup.js:135-145`) calls
  `refresh()` (reconcile the rebalancer SET, `:177-183`) for SERVICES/REPLICA_OPERATIONS and
  `_wakeOwnedRebalancers()` only for SERVICE_DEFINITIONS; `refresh()` never enqueues a check
  on an owned rebalancer. The listener receives `(tableName, operation, record, metadata)`
  (`system-table-cache-observation-methods.js:355`), so a targeted wake of
  `this._rebalancers.get(record.service_id)` is available. The CDC policy propagates the table
  (`cdc-table-policy.js:106-113`); the 5 s binding timer (`:221-229`) also calls `refresh()`
  only.
- Required: decision 7 and section 1 say `_wakeRebalancer` for the row's `service_id` on a
  SERVICE_INSTANCES change; cite the policy and the periodic fallback
  (`unified-rebalancer-lifecycle-base.js:605` PERIODIC_CHECK).

### R15 (required) Node-local re-entry: the handler's HELD branch and `bootstrapConsensusCreation`'s argument
- Evidence: `handleCreateReplica` branches on `existing.status` ACTIVE/CREATING only
  (`runtime-service-handler.js:271-305`); `ReplicaStatus` (`replica-operation-progress.js:12-27`)
  has no HELD. `bootstrapConsensusCreation(manager, value)` takes the INTENT value
  (`service-consensus-bootstrap.js:130` -> `prepareConsensusCreation(manager, value)` ->
  `captureIntent` with `exactFields(intent, INTENT_FIELDS)` `:42`); the draft's
  "`bootstrapConsensusCreation(retained)`" passes the recover RESULT object and would be
  refused `INVALID_REQUEST`.
- Required: write `bootstrapConsensusCreation(retained.intent)`; add the HELD branch (re-enter
  and answer IN_PROGRESS); name the `ReplicaStatus` owner module for HELD.

### N4 (record) "No new timer" holds; `CONSUMER_ABSENT`/`NO_LOCAL_OPERATION` typed row exists.

---

## 7. Typed failure edges (section 3 completeness)

Missing rows, each with the typed outcome the owner already has or the draft must name:

- R16 (required) step/budget timeout on a held CREATE (B9): `REBALANCE_OPERATION_TIMEOUT`
  -> today FAILED; must become the exemption/HELD step decision.
- R17 (required) replica_count 1 / even / 0 / > 9 / > distinct available nodes:
  `validateReplicaCount` RUNTIME_SERVICE returns the count (min 1, 0 honoured,
  `move-planner-state-methods.js:131-156`); the raft branch clamps UP to odd silently
  (`:149-154`); `validFoundingPeers` caps at 9 and requires distinct nodeIds
  (`service-instance-contract.js:100-105`); `calculatePartitionPlacement` places
  `min(target, nodes)` (`move-planner.js:728`) -> a 2-node cohort on a 2-node cluster. Rows:
  `COHORT_COUNT_INVALID` (even or 1: refused typed, never clamped silently; owner decision
  whether the definition validator `service-descriptor.js:117-134` refuses at write time),
  `COHORT_NODES_INSUFFICIENT` (plan nothing, diagnostic, re-plan on NODES change), 0 (no
  cohort), > 9 (`CAPACITY_EXHAUSTED`).
- R18 (required) founder node gone before/at dispatch: slot ADMITTED on a dead node; only that
  node can retire it (`captureRetirement` INVALID_LINEAGE for another node,
  `wasm-creation-retirement.js:36`); J blocked forever -> owner: recovery stage /
  `group-retirement-operator-retirement-fact` (`raft-rs-full-cutover.md:635-647`). Record as
  a typed edge with its deferred owner, not silence.
- R19 (required) definition deleted/INACTIVE mid-cohort: `_reconcileRebalancerSet` stops the
  rebalancer (`runtime-service-rebalancer-setup.js:185-204`); operations orphaned; the
  metadata row stays SELECTED; `ACTION.RETIRE` exists (`service-instance-state.js:168-170`)
  with no caller. Edge row + owner (next stage).
- R20 (required) duplicate CREATE after HELD (R15), `INTENT_NOT_FOUND` vs read-unavailable
  (`readJournal` throws -> UNAVAILABLE, `service-consensus-creation-intent.js:65-70, 94-98`;
  only a definitive absent answers INTENT_NOT_FOUND: state the read mode so a lagging replica
  cannot answer absent), `PUBLISHED_UNPROJECTED` re-drive is UPDATE-first
  (`runtime-replica-state-projection.js:183-196`) so a second ACTIVE projection cannot
  IDENTITY_CONFLICT: say it.
- N5 (record) endpoint CAS stale, wake with no local operation, cache notification lost: rows
  present and correct.

---

## 8. Cached views and identity anchoring

- R21 (required) Section 4 must add: the planner's N and lineage come from the
  service_definitions CACHE row (`getRuntimeServicePolicy`), K binds `definition` from the
  catalog revision and `foundingPeers` from the placement; a `replica_count` change between
  planning and selection is harmless because K is the authority: state it. The handler's HELD
  memo is volatile (`:323-333`); a restart answers `NO_LOCAL_OPERATION` to wakes and the
  coordinator's dispatch retry re-enters through `recoverConsensusCreation`, only while the
  operation is alive (B9). The `cachedServiceRow` lag under `skipCacheWait` (R12).
- Section 5 additions: R11. Anchor moves are correct as written (STALE_BINDING sealed,
  incarnation CAS).

---

## 9. Proof plan

- R22 (required) Witnesses have no ids and no mutation catch matrix; C6 "CREATE_REPLICA
  messages built by the real coordinator path" needs a `RebalanceCoordinator` +
  `UnifiedRebalancer` + replica_operations gateway in-process, for which no component fixture
  exists (`service-instance-creation-sqlite-fixture` covers `service_instances` only). Either
  name that fixture as a surface to create or scope C6 to "handler + manager + runtime with
  payloads built by the real `replica-dispatch-readiness-capture` builder". The real writers
  are drivable: `wireRuntimeEndpointPublication` needs a `ServiceEndpointsOwner` instance
  (`instanceof`, `runtime-endpoint-publication-wiring.js:45-47`) and a non-zero
  `bootIncarnation` (`endpoint-incarnation-authority.js:298-301`);
  `projectRuntimeReplicaServicesRow` needs `insertService/updateService/removeService` or a
  gateway (`runtime-replica-state-projection.js:32-36, 46-50`).
- R23 (required) Missing cells (decision x state x event x temporal): held CREATE crossing
  60 s/300 s (B9); REMOVE of a bound founder through the handler, `closed:false`, re-stop
  (B4); partial cohort dispatch then convergence (R7); leader change between retention and
  `createOperation` (R8); Cell/meta definition not routed to selection (B5); role CAS
  APPLIED on the bound row (B7); one catalog group (R9); SERVICE_INSTANCES change wakes the
  right rebalancer and only it (R14); replica_count 1/2/0/> nodes (R17); duplicate CREATE
  after HELD; `INTENT_NOT_FOUND` vs UNAVAILABLE typing; `PUBLISHED_UNPROJECTED` re-drive
  idempotence.
- Mutations to add: HELD mapped to FAIL; REMOVE routed to the generic stop; wake wired to
  `refresh()` only; `service_type` 'wasm_service' in the role CAS; `metadata.service_name` =
  physical id; a Cell definition planned as a cohort; `bootstrapConsensusCreation(retained)`
  instead of `(retained.intent)`.

---

## 10. Scope and minimality (R16)

- R24 (required) Name where the generic move calculation is bypassed for a bound S:
  `unified-rebalancer-rebalance-loop.js:243-300` (`calculateTargetState` -> `calculateMoves`
  -> `createOperation` per move). Without that sentence the existing under-replication /
  REPLICA_FAILED cures issue ADDs for `S-r4` (allocated by `allocateCanonicalReplicaId`) that
  the handler refuses `INTENT_NOT_FOUND` -> FAILED -> retry churn: a second path (R11).
- Belongs elsewhere, record (R17): cohort-as-one-logical-operation
  (`single-unresolved-operation-owner`); founder-node-gone retirement (recovery stage /
  operator retirement fact); the D0 deletion inventory as its own independently reviewable
  unit (alpha `:75-77`), not bundled with the mechanism.
- What an implementer would otherwise invent: the journal wiring (B1), the node owners (B2),
  the slot read (B3), the REMOVE routing and `closed:false` outcome (B4), the bound
  discriminator (B5), the services columns (B6), the service_type (B7), the id carrier (R1),
  the K constructor/revision source (R3), the address owner (R10), the PRESENT latch (R12),
  the `PUBLISHED_UNPROJECTED` owner (R13), the handler HELD branch and the
  `bootstrapConsensusCreation` argument (R15), the time budget (B9).
- N6 (record) Section 7 is consistent with section 0 on the cross-node wake (the cache
  notification is in scope; delivery beyond it is out).

---

## Findings summary (one round)

| Id | Class | Category | Required change |
|---|---|---|---|
| B1 | BLOCKING | 1 | Wire the manager's `wasm_operations` journal (writer/readers, OWNER_RPC_REQUIRED) and `serviceDefinitionsOwner` in production; cite as surfaces to create |
| B2 | BLOCKING | 1 | Owner decision: restate the claim to the embedding scope or widen explicitly to production port-allocator/module-mirror owners with a recorded supersession of CONTRACT-R2 :217-220 |
| B3 | BLOCKING | 1/3 | A named owner read of the slot table; decision 3 and leader-change re-dispatch consume it |
| B4 | BLOCKING | 1/4 | Route the bound REMOVE to `retireConsensusCreation`; typed non-terminal `closed:false` outcome; planner re-driver row; physical-id lookup in `recoverLocalReplicaForRemoval` |
| B5 | BLOCKING | 2 | Discriminator = installed-package `wasm_component` with creation revision and not a request Cell; Cells keep their path |
| B6 | BLOCKING | 1/4 | Name the services columns that carry binding/token (or a schema change with upgrade note); EP_META owner |
| B7 | BLOCKING | 4/5 | One `service_type` for the bound row and a role/leader write predicate that matches it; witness asserts an APPLIED role write |
| B8 | BLOCKING | 2 | Replace D0's deletion inventory with the measured one; owner decides the unbound `WasmServiceReplica` shape; list witnesses to supersede |
| B9 | BLOCKING | 3/7 | Owner decision on the held CREATE's time budget (typed exemption, real HELD step, or progress evidence); "never FAILED while the slot is live" |
| R1 | required | 1/6 | One id or two; cite the carrier or `operationIntentId`; wake-id mapping |
| R2 | required | 1 | Enumerate all 8 classifier consumers and the SQL LIKE projection |
| R3 | required | 1 | K via `prepareConsensusInstanceRequest`; revision via `getCreationRevision`; `expectedVersion` source |
| R4 | required | 1/6 | `creationWake` as a lazy handler getter; handler re-entry method |
| R5 | required | 2 | Record the alpha consequence for `publishesServicesRow`/OPEN if unbound replicas vanish |
| R6 | required | 3 | Name the two-record interaction (origin vs workflow) or carry B/slot in the replica_operations intent |
| R7 | required | 3 | Partial dispatch converges by decision 3; record the follow-up overlap |
| R8 | required | 3 | Leader change: slot -> operationId -> new leader's manager recover -> createOperation |
| R9 | required | 4 | `metadata.service_name = S`; one catalog group asserted |
| R10 | required | 4 | Address owner for endpoint and services rows |
| R11 | required | 5 | Add the S-keyed registry/port and `S-rN`-keyed handler/manager identities |
| R12 | required | 5 | Define PRESENT, its latch, idempotent replay |
| R13 | required | 5 | `PUBLISHED_UNPROJECTED` vocabulary owner and manager branch |
| R14 | required | 6 | SERVICE_INSTANCES change -> `_wakeRebalancer(record.service_id)`, not `refresh()` |
| R15 | required | 6/7 | Handler HELD branch; `bootstrapConsensusCreation(retained.intent)`; `ReplicaStatus` owner |
| R16-R20 | required | 7 | Rows: timeout, count/nodes, node gone, definition deleted, duplicate/INTENT_NOT_FOUND/re-drive |
| R21 | required | 8 | Cache audit additions |
| R22-R23 | required | 9 | Witness ids, fixture for C6, missing cells, mutations |
| R24 | required | 10 | Where `calculateMoves` is bypassed for bound S |
| N1-N6 | record | - | Line drift; verified claims; latch interaction; no new timer; present rows; section 7 consistency |

What an implementer must not do from this draft: do not start from "formed in production"
without the owner's scope decision (B2); do not build the planner on `getCurrentInstance`
for slots (B3); do not leave REMOVE on the generic stop (B4); do not key the bound route on
`runtime_kind` alone (B5); do not project a `metadata` column (B6); do not enable role/leader
publication against a `wasm_service` predicate (B7); do not delete a coordinator branch that
does not exist (B8); do not let a HELD founder sit under `CREATING_TIMEOUT_MS` (B9).

## What I did not read or run (bounded, counted)
Not read in full: `authoritative-row-mutation-helper.js` (retry shape taken from vet B's
cited lines, unchanged file), `operation-workflow-transition-persistence.js` beyond the
`stepsHistory.push` site, `service-endpoints-owner.js` (methods used through the wiring's
calls), `system-table-service-instance-schema.js`, `wasm-service-models.js` beyond SD_COL,
`replica-dispatch-service-dispatch-observation-methods.js` beyond :1-31, the 70 test files
counted for `replicaIds:` (counted, not read), `test/shards/impact-contracts.json` beyond the
grep. Not run: anything.
