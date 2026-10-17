# Activation and discovery of bound WASM service groups through the existing owners: design (stage 1c, DRAFT)

Quest `wasm-creation-genesis`, stage after serving/publication/retirement
(89e70949f) and amendment A2 (in verification). Base for this stage: the lane
tip after stage 1b lands. Every `file:line` below is from 89e70949f unless
marked "cite before vet". Structured by
`docs/development/verification-templates/design-note-template.md`; proposed,
not implemented; the design vet attacks each section separately.

## 0. Claim, frozen as behaviour

A `wasm_component` runtime service S is formed in production through the bound
creation route and nothing else: the leader's runtime-service reconcile owner
plans ONE founding cohort for S (N distinct nodes, replica ids `S-r1..S-rN`),
selects the instance K on the metadata owner (`selectConsensusInstance`),
retains one creation intent per founder with its reserved slot
(`prepareConsensusCreation`, producer side, before dispatch), and dispatches
one CREATE_REPLICA per founder carrying the retained operation id. The founder's
node handler routes a bound CREATE to `ServiceLifecycleManager.recoverConsensusCreation`
+ `bootstrapConsensusCreation`, never to the generic create/start. A PUBLISHED
answer is projected by the runtime through the EXISTING endpoint writer and
services-row projection under the instance-qualified physical identity
(`wasm-instance-<digest>-rN` as the row key; logical S resolved from the
binding, never parsed from the id; binding digest, token and node boot
incarnation carried in the row), so discovery aggregates N healthy endpoints
under S while a late I row can never overwrite a J row. A HELD answer projects
nothing and keeps the operation IN_PROGRESS with a typed held outcome. The
replica's role/leader services-row publication is enabled only after its
services row exists. Retirement removes exactly this replica's endpoint (by
incarnation predicate) before the local stop and deletes its services row
after CLOSED. Wakes reach the owners that already exist: in-process the node's
handler re-enters the retained operation; cross-node the `service_instances`
row change reaches the leader's reconcile owner through the system-table cache
notification (a wake only), which re-dispatches idempotently. Externally
relevant outputs: the `service_instances` row, the `wasm_operations` rows, the
`services` and `service_endpoints` rows, the discovery catalog for S, the
replica-operation workflow state, and the typed outcome at each boundary.

Allowed nondeterminism: which founder leads; order of founders' publication;
loopback interleaving. Excluded: scaling or redefinition of S after formation
(a new incarnation: selection RETIRE+CREATE, next stage), request Cells, OCI,
process-loss recovery (recovery stage), physical multi-host metadata quorum.

### D0 (OWNER RULED 2026-10-17: confirmed): one path for WASM service formation

Today a `wasm_component` runtime service forms a raft group through the
UNBOUND route: the coordinator builds each ADD's bootstrap membership from the
services rows it observes plus the target
(`src/service/replicated-service-topology.js:66-125`,
`rebalance-coordinator-shared.js:119`), the driver passes `replicaIds` from
the definition (`wasm-component-driver.js:352`), and the lifecycle opens the
replica with group id = S (`wasm-service-lifecycle.js:94-96`). This is the
identity-reuse shape R2 replaces (CONTRACT-R2, old-instance exclusion). The
alpha single-path decision (2026-10-13: "exactly one Raft backend and one
active execution path, including startup, restore, membership") forbids
keeping it beside the bound route. Proposed: the bound route is THE formation
path for every `wasm_component` runtime service; the unbound WASM branch of
`createReplica`/`startReplica` and the runtime-service case of
`buildReplicatedServiceBootstrapTopology` are deleted in this stage, with
their witnesses superseded by appending. No marker column is introduced
(`service_profile` has only `default`/`sql_engine`, `src/constants/service.js:39-42`).
Owner ruling 2026-10-17: "absolutely go for the bound version for wasm". Confirmed; the quest log carries the decision entry.

## 1. Consumed surfaces (cite or it does not exist)

Leader side (planning and dispatch):
- `RuntimeServiceRebalancerOwner` (`src/bootstrap/shared/runtime-service-rebalancer-setup.js:85-160`):
  one `UnifiedRebalancer` per active runtime service while leader
  (`:355-376`), holds `serviceDefinitionsOwner` (`:112`), level-triggers on
  `SERVICE_DEFINITIONS`/`SERVICE_BINDINGS`/`SERVICES`/`REPLICA_OPERATIONS`
  cache changes (`:133-145`), `_wakeRebalancer` ->
  `enqueueRebalanceCheck(RECONCILE_REASON.RUNTIME_SERVICE_DESIRED_STATE)` (`:383-387`).
  Surface to change: add `SERVICE_INSTANCES` to the cache-change trigger
  (the cross-node wake).
- Planner: runtime-service target count (`move-planner-state-methods.js:131-187`),
  spread policy `PLACEMENT_OWNER_POLICY.RUNTIME_SERVICE_SPREAD`
  (`move-planner.js:690-691`, `move-planner-placement-tail-methods.js:175-176`).
  Surface to create: the cohort decision for a bound service (section 2).
- Coordinator operation creation: canonical target identity
  `buildRuntimeServiceTargetClaimKey` (`rebalance-coordinator-operation-creation.js:114-137`,
  `:706-716`), cohort deferral flag `deferDispatchUntilBootstrapTopology`
  (`:176-178`, `:719-735`). Surface to change: a bound cohort move carries the
  retained operation ids; no `replicaIds` topology is built for it.
- Metadata owner: `selectConsensusInstance` (`service-instance-metadata.js:76-104`),
  request shape (`service-instance-contract.js:11-12, 91-99`; `foundingPeers`
  distinct replica and node ids `:100-105`), `getCurrentInstance` (`:105-118`).
- Producer-side retention: `ServiceLifecycleManager.prepareConsensusCreation`
  (`service-lifecycle-manager.js:553-554` -> `service-consensus-creation-intent.js:175-193`):
  journal row + reserve + admission retained before any dispatch (CONTRACT-R2
  "persists the returned admission token before CREATE delivery").

Node side (execution):
- `RuntimeServiceHandler.handleCreateReplica` (`src/node/runtime-service-handler.js:224-367`):
  requires canonical `S-rN` (`:250-269`), idempotency on `localReplicas`
  (`:272-310`) and `inProgressOperations` (`:313-325`), async create
  (`:369-445`) -> `serviceLifecycleManager.createReplica` + `startReplica`
  (`:396-401`), emits `RUNTIME_SERVICE_CREATE_ACTIVE`/`FAILED` (`:411-416, :427-432`).
  Surface to change: a bound CREATE (operation row is a consensus creation,
  `isConsensusCreationRow` `service-consensus-creation-intent.js:218-221`) routes
  to `recoverConsensusCreation(operationId)` (`:194-217`) then
  `bootstrapConsensusCreation` (`service-consensus-bootstrap.js:127-152`).
- Runtime bound START/STOP branches: `startConsensusBootstrap`
  (`service-runtime-consensus-bootstrap.js:14-26`), `retireConsensusBootstrap`
  (`:36-41`); the unbound endpoint/projection path they must now reuse:
  `_endpointWriter(serviceId, runtimeKind, endpointIntent, {causeId})`
  (`service-runtime-lifecycle-operation-methods.js:387`),
  `_projectReplicaState(serviceId, definition, status, extras, context)`
  (`service-runtime-lifecycle.js:473-500`; ACTIVE failure throws `:496-498`),
  `_removeEndpoint` (`:519-540`).
- Endpoint writer wiring: `wireRuntimeEndpointPublication`
  (`runtime-endpoint-publication-wiring.js:97-168`): resolves logical S by
  parsing `S-rN` (`:57-80`, LOGICAL_SERVICE_NOT_FOUND for any other id),
  row id `${S}-ep-${nodeId}` (`runtime-endpoint-writer.js:41-70, 78-80`),
  incarnation CAS (`endpoint-incarnation-authority.js:1-66, 265-334`).
  Surface to change: the intent carries `consensusBinding`/`consensusResourceToken`;
  resolution from the binding when present; row id from the physical replica
  id; metadata carries binding digest and token digest.
- Services row projection: `projectRuntimeReplicaServicesRow`
  (`runtime-replica-state-projection.js:221-252`, delete on STOPPED,
  expected identity = service_type + node_id); role/leader helpers CAS
  `service_id = replica.replicaId` (`wasm-service-metadata-mutation-helpers.js:28-50`),
  write-ready `isServicesLeaderAvailable` (`wasm-service-replica.js:712`),
  `publishesServicesRow` (`wasm-service-serving-state.js:60-62`, bound = false).
- Discovery consumers: `buildServiceDiscoveryCatalog` groups endpoint rows by
  `service_id` (`service-discovery-catalog.js:175-252`); the CLI remote-cache
  view keys by `endpoint_id` for display only (`cli/core/remote-cache-service-rows.js`);
  `endpoint-service.js`, `admin-service-discovery-readiness-methods.js`,
  `priority-recovery-visibility-decision.js` and `endpoint-incarnation-currentness.js`
  read rows by node/incarnation, not by id shape. No consumer parses the
  endpoint id, so an instance-qualified id is safe for them.
- Wake surface: `WasmServiceLifecycle.creationWake` dependency
  (`wasm-service-lifecycle.js:185-187`), `deliverWasmCreationWake`
  (`wasm-creation-wake.js`), production dependency builder
  `createWasmServiceNodeDependencies` (`runtime-startup-wiring.js:37-49`;
  callers `bootstrap-service.js:291`, `node-joining-owner-construction.js:216`).
  Surface to create: `creationWake` wired to the node handler.
- Inventory readers the planner uses for runtime services:
  `entity-service-row-read.js:27-48` (services rows SQL for RUNTIME_SERVICE) and
  `:69-70`, `replica-operation-repository-entity-read-methods.js:288-289`, both
  classifying rows by `runtimeServiceReplicaBelongsToEntity`
  (`runtime-service-replica-identity.js:49-52`), which is FALSE for the physical
  id `wasm-instance-<digest>-rN`; `priority-publication-safety-rows.js:147-148`
  (runtime-service minimum from policy). Surface to change: for a bound S the
  inventory is the selected instance's founders and slot phases (section 2,
  decision 3); the row classifier gains the binding-qualified kind so the two
  readers recognise a physical id that the selected binding names.

## 2. Mechanism and decisions

1. Cohort planning (leader). For a `wasm_component` definition S the planner
   asks the metadata owner first: `getCurrentInstance(S)`. NEVER_CREATED, or a
   selected instance whose nine slots are all CLOSED and no retiring instance
   is outstanding -> plan ONE cohort move; otherwise plan nothing new for S
   (held founders are re-driven by wakes, not by new operations). Founders:
   N = target replica count (section 1 policy; a bound service must be odd and
   >= 3: `validateReplicaCount` currently exempts runtime services, the bound
   branch applies the raft rule), nodes chosen by the existing spread policy,
   ids `S-r1..S-rN` (canonical, `buildRuntimeServiceTargetClaimKey` non-null).
2. Selection then retention, producer side, before dispatch. The coordinator
   builds K (`format 1`, `requestId {serviceDefinitionId: S, ...}`, tenant,
   `expectedIncarnation` = current or null, `action CREATE`, `revisionId` from
   the definition's install-catalog lineage, `definition`, `profile`,
   `foundingPeers`), calls `selectConsensusInstance(K)`; SELECTED -> B. For
   each founder it calls the leader node's manager
   `prepareConsensusCreation(intent)` with `intent = {format, descriptor
   (serviceId S, replicaId S-rN, runtimeKind wasm_component, runtimeConfig),
   consensusBinding B, consensusSlotRequest {slot i, expectedOrdinal 0,
   operationId, replicaId, nodeId}}`; ADMISSION_RETAINED -> the operation id
   is the slot request's. Then `createOperation(ADD, S, S-rN, nodeId, {
   consensusOperationId })`, one per founder, all dispatchable at once (no
   bootstrap-topology deferral: membership is B's founding peers).
   Typed non-ADMITTED prepare answers (section 3) leave no operation.
3. Inventory for a bound S = the selected instance's founders and their slot
   phases (metadata owner) joined with `services` rows keyed by the physical
   id; the `S-rN` parse is not used for bound inventory. Decision table rows:
   slot ADMITTED + no live operation -> re-dispatch CREATE (idempotent);
   slot PUBLISHED + services row present -> satisfied; slot PUBLISHED + row
   absent -> re-dispatch (re-entry re-projects); RELEASING/CLOSED -> no
   action for I (retirement owns it); selected J + retiring I outstanding ->
   J founders stay held (PREDECESSOR_OUTSTANDING is the owner's answer).
4. Node handler routing. `handleCreateReplica` keeps its identity and
   idempotency checks; before the async generic create it reads the operation
   row through the manager (`recoverConsensusCreation(operationId)`): a
   consensus creation row -> `bootstrapConsensusCreation(retained)`; result
   PUBLISHED -> `localReplicas` ACTIVE + emit CREATE_ACTIVE; HELD -> a new
   typed local status HELD (owner: the handler's `ReplicaStatus` vocabulary
   gains HELD) + emit a typed executor outcome `RUNTIME_SERVICE_CREATE_HELD`
   (workflow stays IN_PROGRESS, observed progress); a refusal -> FAILED as
   today. An operation row that is not a consensus creation for a
   `wasm_component` definition is refused typed (D0: no unbound fallback).
5. Publication on PUBLISHED (runtime). `startConsensusBootstrap` after
   `confirmPublishedAuthority`: `_projectReplicaState(physicalReplicaId,
   descriptor, ACTIVE, {node_id, address, metadata: binding digest, token})`
   then `_endpointWriter(physicalReplicaId, wasm_component, {host, port,
   protocol, consensusBinding: B, consensusResourceToken: token}, {causeId})`.
   The wiring resolves S from `consensusBinding.serviceDefinitionId` when
   present (binding-first, parse only for unbound ids), row id
   `${physicalReplicaId}-ep-${nodeId}`, `service_id = S`, metadata adds
   `bindingDigest`, `resourceToken`. Then the lifecycle enables role/leader
   publication for the replica: `enableServicesRowPublication(replica)` in
   `wasm-service-serving-state.js` (named state `servicesRow: ABSENT|PRESENT`;
   `publishesServicesRow` = unbound OR PRESENT) and replays the current role
   and leader once through the existing helpers (idempotent CAS on the fresh
   row). Projection failure after PUBLISHED: serving stays enabled (the grant
   is the metadata owner's, not the projection's); the START answers a typed
   `PUBLISHED_UNPROJECTED` and the handler emits CREATE_HELD so the reconcile
   owner re-drives projection; never FAILED (would retire a granted resource).
6. Retirement. `retireConsensusBootstrap`: `_removeEndpoint(physicalReplicaId,
   descriptor)` first (best-effort, incarnation predicate; typed outcome
   recorded), then `driver.stop` -> `retireReplica(creation)`; on
   `closed === true` -> `_projectReplicaState(physicalReplicaId, STOPPED)`
   (row delete by identity). CLOSE_UNRESOLVED -> rows stay, custody stays,
   typed result; the reconcile owner re-stops.
7. Wakes. `createWasmServiceNodeDependencies` adds `creationWake(S, wake)` ->
   the node's handler: `CREATION_GENESIS_OBSERVED` / `CREATION_GRANT_HELD`
   with a retained operation on this node -> re-enter
   `bootstrapConsensusCreation` for that operation (explicit START; PUBLISHED
   -> emit CREATE_ACTIVE); `CREATION_RESOURCE_CLOSED` -> nothing local (the
   REMOVE workflow already completed on the typed retirement result).
   Cross-node: the `service_instances` row CAS is a system-table change; the
   rebalancer owner's cache listener gains `SERVICE_INSTANCES` -> refresh +
   wake -> planner decision table (item 3) re-dispatches J's held founders.
   No new timer, poll, daemon or queue.

## 3. Typed failure edges

| Edge | Typed outcome | Fails closed? | Caller observes |
| --- | --- | --- | --- |
| selection refused (CONFLICT, TRANSITION_HELD, INVALID_LINEAGE, INVALID_EXPECTED_STATE, CAPACITY_EXHAUSTED, STATE_CHANGED, UNKNOWN) | planner records `{cohort: REFUSED, outcome}` | yes, no operations | rebalancer diagnostics; next desired-state cycle re-plans |
| prepare non-ADMITTED (UNKNOWN, RESOURCE_CLOSED, TERMINAL_OPERATION, STALE_BINDING) | no operation for that founder; typed per founder | yes | cohort partially dispatched is NOT allowed: all-or-none before dispatch (founders already retained stay rows; re-plan re-uses them via recover) |
| CREATE for an unknown operation id | handler `INTENT_NOT_FOUND` -> FAILED outcome | yes | coordinator FAILED step |
| CREATE for a wasm_component definition with a generic (non-consensus) row | refused typed `BOUND_ROUTE_REQUIRED` (D0) | yes | FAILED |
| bootstrap HELD | `RUNTIME_SERVICE_CREATE_HELD`, handler status HELD | yes | workflow IN_PROGRESS |
| PUBLISHED but ACTIVE projection fails | `PUBLISHED_UNPROJECTED` -> CREATE_HELD | serving open, discovery closed | re-drive re-projects |
| PUBLISHED but endpoint write refused stale incarnation | typed `REFUSED_STALE_INCARNATION` recorded; CREATE_HELD | discovery closed | re-drive after node incarnation settles |
| endpoint removal fails at retirement | typed, retirement continues | routing only | remover re-run by reconcile |
| services row delete fails after CLOSED | typed, custody of the row stays with reconcile | presentation only | re-stop deletes |
| wake with no retained operation on this node | `CONSUMER_ABSENT`-class typed `NO_LOCAL_OPERATION` | yes | logged warn + result |
| cache notification lost | leader's periodic desired-state cycle (existing cadence) | n/a | latency only |

## 4. Cached-view audit

- `resolveLogicalServiceId` over the service_definitions cache: bound route
  bypasses it (binding-first). Stale cache cannot mis-key a bound row.
- Handler `localReplicas`/`inProgressOperations` memo: HELD entries are
  re-enterable; a restart loses them (recovery stage: restart scan of
  `wasm_operations` consensus rows, `recoverConsensusCreationRow :222-226`).
- Planner inventory from services rows: for bound S the authority is the
  metadata owner's selected instance (fresh read per decision), services rows
  are presentation; a stale services row cannot create or retire a slot.
- `systemTableCache` services row read by the role/leader helpers
  (`cachedServiceRow`): CAS guard only; a missing row before projection is
  avoided by the PRESENT gate (decision 5).
- Discovery catalog: a late I endpoint row is keyed by I's physical id and I's
  incarnation; J's rows differ in id; the remover deletes I's by exact id.

## 5. Identity anchoring

S (`serviceDefinitionId`), tenant, incarnation and binding digest (B, from
`selectInstanceState`), token (slot, ordinal, operationId, bodyDigest), physical
replica id (`runtimeServiceConsensusIdentity`), founder canonical id `S-rN`,
node id, node boot incarnation (endpoint rows), `service_instances.version`,
`wasm_operations.operation_id`. Anchor moves: selection of J during a cohort's
dispatch -> founders' grants answer STALE_BINDING (sealed), rows never written;
node incarnation change -> endpoint CAS refuses stale; replica id collision
across incarnations impossible (digest includes incarnation).

## 6. Proof plan (lab-first)

Component: planner cohort decision table (every row of item 3; refusals of
section 3); handler routing table (consensus row -> bootstrap; generic row for
wasm_component -> refused; unknown id -> INTENT_NOT_FOUND; HELD/PUBLISHED/
FAILED outcomes); endpoint wiring identity (binding-first resolution, row id,
metadata, stale incarnation); services-row projection and the PRESENT gate
(role replay once; no silent retry before the row exists: R7 witness).
Native RF3 (publication fixture extended with the REAL writers over component
SQLite: `wireRuntimeEndpointPublication` with a `ServiceEndpointsOwner`,
`projectRuntimeReplicaServicesRow` with a `ServicesOwner`): three founders
publish -> three endpoint rows under S with distinct physical ids, catalog
reports 3 healthy; retire one -> its endpoint gone before its admission
closes, services row gone after CLOSED, catalog 2; J after I -> no I row
survives, J rows distinct. C6 handler integration: real `RuntimeServiceHandler`
+ manager + runtime on three in-process hosts, CREATE_REPLICA messages built
by the real coordinator path, HELD outcome then wake re-entry -> ACTIVE.
Mutations by mechanism: parse-based resolution restored (LOGICAL_SERVICE_NOT_FOUND
or wrong S); endpoint id by S (two founders collide); projection before
PUBLISHED (row for a held replica); role publication enabled before the row
(silent retry); unbound fallback for a wasm_component row; cohort dispatched
before retention (CREATE for a row without admission); wake consumer ignoring
the operation id.

## 7. Out of scope, recorded

Scaling/redefinition of a formed S (new incarnation), request-Cell routing to
bound replicas, OCI, recovery-stage items (restart scan, intact restart), the
alpha deletion inventory beyond the WASM unbound branch, cross-node wake
beyond the cache notification.
