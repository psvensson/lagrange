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

---

# Revision 1 (2026-10-17, after the independent vet: REVISE, B1-B9, R1-R24)

Vet report: `evidence/design-vets-20261017/design-vet-activation-discovery-20261017.md`.
Every finding is resolved below by id or routed to a named owner. Where this
revision and the draft disagree, this revision wins; the draft stands as the
record of what was proposed (R09). The lead's reading of the vet's evidence
is recorded, not re-verified line by line; the next vet attacks this text.

## RV1.0 Scope split (B2, B1, B5, B8, B9; R16, CONTRACT-R2 :217-220)

CONTRACT-R2 fixes this quest's consumer: "direct consensus-WASM lifecycle
composition with its real dependencies ... Node startup lacking module
mirror/port allocator keeps its typed refusal; test embedding supplies those
actual existing owners and does not claim a new catalog/deployed activation
product", and the quest statement forbids widening catalog activation. The
draft's frozen claim "formed in production" widened both. The claim is
therefore split:

- **Stage 1c (this quest, embedding scope, the C6 handler integration of
  HANDOFF-INTERFACES):** the node-side bound CREATE and REMOVE routes through
  the real `RuntimeServiceHandler`, manager, runtime, driver and lifecycle;
  the discovery rows (endpoint and services) for PUBLISHED bound replicas
  through the real writers under the instance-qualified identity; role and
  leader publication for bound replicas; the node-local wake consumer. The
  embedding (fixture) supplies the owners CONTRACT-R2 names: port allocator,
  module mirror, `serviceDefinitionsOwner`, time source, data directory, the
  manager's journal writer and readers, a `ServiceEndpointsOwner` and a
  services projection target over component SQLite.
- **Production activation (new quest, charter
  `solve/epics/raft-rs-full-cutover/activation-quest-charter-2026-10-17.md`,
  owner ruling D0 as its mandate):** everything the vet found production never
  wires: the manager's `wasm_operations` journal and metadata owner on seed and
  joiner startup (B1), node owners for port allocation and module mirror (B2,
  supersedes CONTRACT-R2 :217-220 only there), the planner's cohort decision
  with its discriminator (B5), the slot-table owner read (B3), the held-CREATE
  time budget (B9), the leader-side cross-node wake (R14), the id carrier and
  K constructor (R1, R3), the two-record interaction (R6), partial cohorts
  (R7), leader change (R8), count/nodes/node-gone/definition-deleted edges
  (R17-R19), the `calculateMoves` bypass (R24), and the alpha deletion unit of
  the unbound `WasmServiceReplica` shape (B8). D0's sentence "the unbound WASM
  branch ... is deleted in this stage" is superseded: the vet measured that the
  production unbound formation is already dead at prepare (`REPLICA_SET_REQUIRED`;
  no coordinator bootstrap topology for runtime services exists), its live
  users are tests and the dead `meta-service-lifecycle.js`; the deletion is an
  independently reviewable unit after activation proves the bound path end to
  end, as the alpha decision requires.

## RV1.1 Claim, frozen (stage 1c)

Given an embedding that supplies the owners above, a bound CREATE delivered to
a node's `RuntimeServiceHandler` whose operation row is a consensus creation
row is routed to `recoverConsensusCreation(operationId)` and
`bootstrapConsensusCreation(retained.intent)`; HELD leaves the operation
IN_PROGRESS with a typed executor outcome and a HELD local status; PUBLISHED
projects the replica's services row and endpoint row through the existing
projection owner and endpoint writer under the identity of RV1.3, then
enables role/leader publication once the row is PRESENT, and emits
CREATE_ACTIVE. A bound REMOVE is routed to `retireConsensusCreation` with the
creation recovered by operation id; `closed === true` emits REMOVE_COMPLETED
after the endpoint row is removed and the services row deleted;
`closed === false` emits a typed non-terminal outcome and keeps custody. A
wake delivered to the node's handler re-enters the retained operation it
names; a wake naming no local operation is a typed outcome. A CREATE for a
bound-class definition without a consensus creation row is refused typed; an
operation id with no retained row answers INTENT_NOT_FOUND only on a
definitive authoritative read. Nothing in this stage plans cohorts, selects
instances or deletes the unbound shape.

## RV1.2 Resolutions, node side

- **B4 REMOVE route.** `handleRemoveReplica`/`removeReplicaAsync`
  (`runtime-service-handler.js:515-698`) gain the bound branch: the local
  memo or the services row (RV1.3: `create_attempt_token` carries the
  creation's operation id) yields the operation id ->
  `manager.recoverConsensusCreation(operationId)` -> retained `{intent, token}`
  -> `manager.retireConsensusCreation({definition: consensusBootstrapDescriptor(retained),
  consensusCreation: retained, consensusOpeningOwner: manager})`
  (`service-consensus-bootstrap.js:85-103`, today without a production caller).
  `recoverLocalReplicaForRemoval` (`:484-508`) looks the row up by `replica_id`
  (canonical `S-rN`) as well as by `service_id`. Outcomes: `closed === true`
  -> `RUNTIME_SERVICE_REMOVE_COMPLETED` after `_removeEndpoint` and the STOPPED
  projection (RV1.3) run under the bound STOP branch of the runtime
  (`retireConsensusBootstrap`); `closed === false` -> new typed non-terminal
  `RUNTIME_SERVICE_REMOVE_HELD` (owner `executor-outcome-constants.js`,
  action UPDATE_STEP) carrying `retirement.outcome`; the operation stays
  IN_PROGRESS; the re-driver is the activation quest's planner row "slot
  RELEASING + no live REMOVE -> re-dispatch REMOVE" and, in embedding, an
  explicit re-REMOVE (P5b class). NOT_FOUND after a restart is answered only
  when neither the memo nor the row nor the journal names a creation.
- **R15 CREATE route and HELD.** `handleCreateReplica` keeps its identity and
  idempotency checks; before the generic create it asks the manager
  `recoverConsensusCreation(operationId)`: `ADMISSION_RETAINED` ->
  `bootstrapConsensusCreation(retained.intent)` (the INTENT, not the result
  object); `INTENT_NOT_FOUND` on a definitive read -> for a bound-class
  definition (RV1.4) refused typed `BOUND_ROUTE_REQUIRED` (owner
  `RUNTIME_SERVICE_HANDLER_ERROR_MSG`), for any other definition the existing
  generic path; UNAVAILABLE -> typed deferral (`deferRetry: true`), never
  FAILED. `ReplicaStatus` (`replica-operation-progress.js:12-27`) gains HELD;
  `existing.status === HELD` re-enters bootstrap and answers IN_PROGRESS;
  PUBLISHED -> ACTIVE + CREATE_ACTIVE; HELD -> new typed
  `RUNTIME_SERVICE_CREATE_HELD` (UPDATE_STEP, carries `genesis.outcome` and
  `grant.outcome`); refusal -> FAILED as today. The step time budget of a
  HELD operation is the activation quest's (B9); in embedding no reaper runs.
- **R4/R1 wake consumer.** `createWasmServiceNodeDependencies` adds a lazy
  getter `creationWake` over `node.runtimeServiceHandler.onCreationWake`
  (built after the handler exists, as the other getters resolve lazily).
  The handler maps `wake.token.operationId` to its `inProgressOperations` /
  `localReplicas` entries, which record the creation's operation id at CREATE;
  one id: the replica operation id equals the slot request's operation id
  (activation quest R1 fixes the producer; the embedding fixture dispatches
  CREATE with that id). OBSERVED / GRANT_HELD -> re-enter bootstrap for the
  entry (explicit START; PUBLISHED -> CREATE_ACTIVE); RESOURCE_CLOSED -> no
  local action; no entry -> `{outcome: NO_LOCAL_OPERATION}` (typed, warn).
  After a handler restart the memo is empty: wakes answer NO_LOCAL_OPERATION
  and the coordinator's dispatch retry re-enters through recovery (R21).

## RV1.3 Resolutions, discovery rows and identity (B6, B7, R9, R10, R11, R12, R13)

- **Services row (B6, B7).** Projected by `_projectReplicaState` through
  `projectRuntimeReplicaServicesRow` with EXISTING columns only
  (`system-table-core-schema-definitions.js:229-260`): `service_id` =
  physical `wasm-instance-<digest>-rN`; `service_type = runtime_service`
  (the inventory readers' filter); `replica_id` = canonical `S-rN`;
  `group_id` = `wasm-instance-<digest>`; `create_attempt_token` = the
  creation's operation id (recorded meaning for bound rows: "the retained
  creation this row serves"); `node_id`; `address` (R10 below); `status`
  ACTIVE/STOPPED. No `metadata` column, no schema change. The role and
  leader writers' production predicate (`wasm-service-replica.js:645-657,
  691-704`, `service_type = 'wasm_service'`) is made to consume the row's
  `service_type` through one owner: the replica's `writeRoleUpdate` /
  `writeLeaderNodeUpdate` take the projected `service_type` from the
  serving-state module's PRESENT record (RV1.3 PRESENT) instead of the
  constant; the witness asserts an APPLIED role write (one row changed), not
  a queued one.
- **Endpoint row (R9).** `endpoint_id = ${physical}-ep-${nodeId}`,
  `service_id = S`, `metadata.service_name = S` (discovery groups by
  `service_name` + protocol: `endpoint-sync-planner.js:46-63`), new EP_META
  keys `binding_digest` and `resource_token` (owner `service-endpoint-builder.js:31-41`),
  incarnation CAS unchanged. `wireRuntimeEndpointPublication` resolves S from
  `endpointIntent.consensusBinding.serviceDefinitionId` when present
  (binding-first), else parses as today; the row id uses the physical id for
  bound intents. The witness asserts ONE catalog group for S with
  `observedReplicaCount === 3`.
- **Address (R10).** Both rows take the advertised node address from the
  same owner the unbound driver uses (`replicaContext.endpointHost ?? address`,
  `wasm-component-driver.js:69-72, 499-507`); the bound start result carries
  `port` and the runtime composes the intent with that host resolution; the
  embedding supplies `endpointHost`.
- **PRESENT (R12, R13).** A named record in `wasm-service-serving-state.js`:
  `servicesRow: {state: ABSENT|PRESENT, serviceType}` set by the runtime after
  `_projectReplicaState(ACTIVE)` answered applied or observed-by-readback
  (`insertRuntimeReplicaServicesRow :156-162`); `publishesServicesRow` =
  unbound OR PRESENT; on the ABSENT -> PRESENT edge the lifecycle replays
  `queueRoleUpdate(replica.role)` and, if leader, `queueLeaderNodeUpdate(nodeId)`
  once; a re-drive that finds PRESENT replays nothing. `PUBLISHED_UNPROJECTED`
  is a `CONSENSUS_BOOTSTRAP` member (owner `service-consensus-bootstrap.js:12-19`);
  `confirmConsensusBootstrapResult` accepts it with the PUBLISHED equality
  checks; the manager keeps `_replicaStateById` STARTING and never retires on
  it (`publishedAuthority` CONTRADICTED is the only retiring branch); the
  handler maps it to CREATE_HELD; serving stays enabled (N3).
- **Identities (R11).** Added to section 5: `activeReplicas` and the port
  allocation keyed by S (one founder per S per node, guaranteed by distinct
  founding node ids); the handler's `localReplicas` and the manager's
  `_replicaStateById` keyed by `S-rN`; the translation `S-rN` <-> physical id
  is `runtimeServiceConsensusIdentity(binding, slotRequest)` and the services
  row's `replica_id`/`service_id` pair.

## RV1.4 Bound-class discriminator (B5), node side

The handler never keys on `runtime_kind`. A CREATE is bound when its
operation row is a consensus creation row (`isConsensusCreationRow`,
`service-consensus-creation-intent.js:218-221`). "Bound-class definition" for
the `BOUND_ROUTE_REQUIRED` refusal = installed-package `wasm_component` with a
creation revision (`getCreationRevision`) and NOT a request Cell
(`isRequestCellDefinition` false) and NOT a built-in meta service; request
Cells and `sys-wasm-meta` keep their existing paths untouched. The planner's
use of the same discriminator is the activation quest's.

## RV1.5 Typed edges added (R16-R20, node side)

| Edge | Typed outcome |
| --- | --- |
| CREATE for a bound-class definition, operation row not a consensus creation | `BOUND_ROUTE_REQUIRED` -> FAILED |
| operation row definitively absent | `INTENT_NOT_FOUND` -> FAILED; a lagging or unavailable read is UNAVAILABLE -> `deferRetry` (the journal read is an authoritative routed read of `wasm_operations`, CDC policy `CONTROL_NO_INTERNAL_PROPAGATION`) |
| duplicate CREATE while HELD | re-enter bootstrap, answer IN_PROGRESS |
| PUBLISHED but projection failed | `PUBLISHED_UNPROJECTED` -> CREATE_HELD; re-drive is UPDATE-first so a second ACTIVE projection cannot IDENTITY_CONFLICT |
| REMOVE, `closed === false` | `RUNTIME_SERVICE_REMOVE_HELD` (non-terminal), custody kept |
| REMOVE after restart, no memo, row carries the operation id | recover from the row's `create_attempt_token`, then retire |
| REMOVE after restart, no memo, no row, no journal row | NOT_FOUND (definitive reads only) |
| wake with no local operation | `NO_LOCAL_OPERATION` |
| held CREATE step timeout | activation quest (B9); in this stage's embedding no reaper runs and the invariant is stated: a bound CREATE is never FAILED while its slot is ADMITTED or PUBLISHED |

## RV1.6 Proof plan (R22, R23), stage 1c

Component fixture to create: the C6 embedding = real `RuntimeServiceHandler`
+ `ServiceLifecycleManager` (journal writer/readers over component SQLite,
`serviceDefinitionsOwner`) + `ServiceRuntimeLifecycle` with
`wireRuntimeEndpointPublication` (a real `ServiceEndpointsOwner` instance,
non-zero `bootIncarnation`) and a services projection target over SQLite +
`WasmComponentDriver` + `WasmServiceLifecycle` with port allocator, module
mirror, time source and data directory, on three in-process hosts; CREATE
and REMOVE payloads built by the real `replica-dispatch-readiness-capture`
builder (not a coordinator; the coordinator path is the activation quest's).
Witnesses (ids): C6-1 bound CREATE -> HELD outcome + HELD status; C6-2 wake
re-entry -> PUBLISHED -> ACTIVE + services row (all columns of RV1.3) +
endpoint row (one catalog group, 3 replicas) + one APPLIED role write; C6-3
duplicate CREATE while HELD; C6-4 `BOUND_ROUTE_REQUIRED`; C6-5
INTENT_NOT_FOUND vs UNAVAILABLE typing; C6-6 PUBLISHED_UNPROJECTED re-drive
idempotent; C6-7 bound REMOVE -> endpoint gone before admission closes,
services row deleted after CLOSED, REMOVE_COMPLETED; C6-8 REMOVE
`closed:false` -> REMOVE_HELD, re-REMOVE resolves; C6-9 REMOVE after handler
restart via the row's operation id; C6-10 wake with no local operation; C6-11
late I row cannot overwrite J (distinct physical ids, incarnation CAS); C6-12
request Cell and meta definitions untouched (existing paths green).
Mutations by mechanism: HELD mapped to FAIL; REMOVE routed to the generic
stop; `bootstrapConsensusCreation(retained)` instead of `(retained.intent)`;
`service_type 'wasm_service'` in the role CAS; `metadata.service_name` =
physical id; endpoint id by S; projection before PUBLISHED; role publication
enabled before PRESENT; NOT_FOUND on an unavailable read; `create_attempt_token`
omitted (REMOVE after restart cannot recover).

## RV1.7 Recorded, routed (R2, R5, R6, R7, R8, R14, R17-R19, R21, R24, N1)

Inventory readers (all eight classifier consumers and the `LIKE 'S-r%'`
SQL), the `publishesServicesRow`/OPEN alpha consequence, the two-record
interaction, partial cohorts, leader change, the cross-node wake listener,
the count/nodes/node-gone/definition-deleted edges, the planner's cache view
and the `calculateMoves` bypass are the activation quest's and are listed in
its charter with the vet's evidence lines. Line drift (N1) is corrected by
citing the current tree in the next revision after stage 1b's A2 lines.
