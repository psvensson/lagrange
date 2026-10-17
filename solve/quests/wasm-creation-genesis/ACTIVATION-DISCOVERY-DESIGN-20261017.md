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

---

# Revision 2 (2026-10-17, after the re-vet of Revision 1: REVISE, RB1-RB5, RR1-RR11)

Re-vet report: `evidence/design-vets-20261017/design-revet-activation-discovery-r1-20261017.md`.
The re-vet confirmed the scope split (RV1.0), the services-column reuse, the
endpoint row shape, `bootstrapConsensusCreation(retained.intent)`, the PRESENT
latch, the `PUBLISHED_UNPROJECTED` owner and the lazy wake getter. This
revision resolves every RB and RR by id; where it and Revision 1 disagree,
this revision wins. Every `file:line` is from `7e184b8aa`.

## RV2.1 REMOVE route (RB1, RR6)

- A new journal-only manager read, owner `service-consensus-creation-intent.js`:
  `readRetainedCreation(manager, operationId)` = `readJournal` +
  `captureIntent(intent_json)` + `retainedToken`; no `_enforceRuntimePolicy`,
  no reserve, no metadata read. Answers `{outcome: ADMISSION_RETAINED, intent,
  token, operationId}` for an IN_PROGRESS row with an admission; typed
  `INTENT_NOT_FOUND` (definitive absence), `NOT_ADMITTED` (PENDING row, no
  admission), `TERMINAL_OPERATION`, `CORRUPT_STATE`, `UNAVAILABLE`. Exposed on
  `ServiceLifecycleManager` beside `recoverConsensusCreation`.
- The handler's REMOVE for a replica whose memo, or whose services row
  (`replica_id = S-rN`, `create_attempt_token` = the creation's operation id,
  a cache HINT that only supplies the id; authority is the journal read),
  names a creation: `readRetainedCreation(operationId)` -> on
  ADMISSION_RETAINED build `{definition: consensusBootstrapDescriptor(retained),
  consensusCreation: retained, consensusOpeningOwner: manager}` and call
  `manager.stopReplica(handle)`: the EXISTING bound branch
  (`service-lifecycle-operations.js:423-429` -> `retireConsensusCreation`,
  `service-consensus-bootstrap.js:85-103`), exactly as the retained fixture
  does (`wasm-retained-bootstrap-fixture.js:211-221`). `recoverConsensusCreation`
  is never used for a REMOVE (it reserves on a PENDING row, enforces CREATE
  policy, needs the metadata owner and refuses a RELEASING slot).
- Outcomes: `closed === true` -> `_removeEndpoint` by physical id (RV2.3) and
  the STOPPED projection under the bound STOP branch, then
  `RUNTIME_SERVICE_REMOVE_COMPLETED`; `closed === false` ->
  `RUNTIME_SERVICE_REMOVE_HELD` (new `EXECUTOR_OUTCOME_TYPE`, action
  UPDATE_STEP in `EXECUTOR_OUTCOME_ACTION_MAP`), the memo stays `REMOVING` so
  the existing REMOVING branch (`runtime-service-handler.js:562-580`)
  re-drives on the next REMOVE (today's catch sets FAILED at `:676-678`; the
  bound branch does not); `NOT_ADMITTED` -> no slot and no physical effect:
  REMOVE_COMPLETED, the PENDING row left to the recovery stage (recorded);
  a slot already CLOSED (owner, sibling path or restart scan) -> the local
  retirement by token still runs (`retireWasmCreation` answers CLOSED without
  a mutation, `service-instance-state.js:277, 295`) -> REMOVE_COMPLETED;
  `TERMINAL_OPERATION`/`CORRUPT_STATE` -> FAILED with the code; `UNAVAILABLE`
  -> `deferRetry`. NOT_FOUND is answered only when neither the memo nor the
  row names a creation (no journal-by-replica read exists; the clause is
  dropped). `recoverLocalReplicaForRemoval` (`:484-508`) finds the row with
  the cache's `find(table, predicate)` on `replica_id === replicaId` and the
  guard at `:494` accepts `row.replica_id === replicaId`.

## RV2.2 CREATE route (RB2, RR1, RR3, RR8)

- Order: (1) `manager.resumeConsensusCreation(operationId, context)`, one new
  manager method = recover + bootstrap (the manager's own continuation, as
  `recoverConsensusCreationRow` is for the restart scan), so the journal, the
  policy and the metadata resolve run once; (2) `ADMISSION_RETAINED`-class
  result (HELD / PUBLISHED / PUBLISHED_UNPROJECTED) -> the bound route
  regardless of the cache row; (3) `INTENT_NOT_FOUND` or `UNAVAILABLE` ->
  classify the definition row: bound-class -> `BOUND_ROUTE_REQUIRED`
  (not found) or `deferRetry: true` (unavailable); any other class (native_js,
  request Cells, built-in meta services) -> the existing generic path,
  untouched. A production-shaped manager without a journal answers
  UNAVAILABLE for every operation id, which therefore routes every non-bound
  definition to the generic path exactly as today (witness RV2.6 a).
- Bound-class (handler side, RR8): `runtime_kind === wasm_component` AND NOT
  `isRequestCellDefinition(row)` (`request-cell-runtime-contract.js:220-224`
  on the `binding_*` columns) AND `service_id` not a built-in meta service
  (`META_SERVICE_ID`, `constants/wasm-meta.js:54-55`; `sys-wasm-meta` is the
  only `wasm_component` built-in). Installed-package is the complement by
  construction; the handler has no catalog owner and needs none. Routing keys
  on the journal; only the refusal class keys on the row.
- Recover outcomes mapped (RR1): `TERMINAL_OPERATION`, `RESOURCE_CLOSED` ->
  typed FAILED (the slot is not live, so the invariant permits it);
  `CONTENT_CONFLICT`, `CORRUPT_STATE` -> FAILED with the code; `UNKNOWN` ->
  `deferRetry`. HELD -> local status HELD and `RUNTIME_SERVICE_CREATE_HELD`
  (UPDATE_STEP); duplicate CREATE while HELD -> re-enter (resume) and answer
  IN_PROGRESS; PUBLISHED -> ACTIVE + CREATE_ACTIVE.
- `ReplicaStatus.HELD` (RR3) joins the shared vocabulary fail-closed: it is
  added to `PEER_ROW_EXCLUDED_STATUSES` (`replica-status.js:232-242`) and is
  never projected to a row (ACTIVE/STOPPED only).
- HELD outcomes carry nothing beyond what `buildExecutorOutcome` keeps
  (`executor-outcome-emitter.js:41-79`); the "carries genesis/grant/retirement
  outcome" claims of Revision 1 are withdrawn (RR2). Same-step updates change
  no row (`operation-workflow-transition-orchestration.js:382-386`): the held
  outcomes are observation only until the activation quest's B9 owner exists.

## RV2.3 Discovery rows, address, remover (RB3, RB4, RR4, RR5, RR11)

- Endpoint remover (RB3): the bound STOP branch calls the remover with the
  physical id and the binding; for a bound removal the remover derives
  `${physical}-ep-${nodeId}` with NO logical resolution (the writer and the
  remover share one binding-first resolution: binding present -> S from
  `consensusBinding.serviceDefinitionId`, id from the physical replica id;
  binding absent -> today's parse); predicate unchanged
  (`mutateEndpointAtIncarnation :195-219`).
- Address (RB4): the advertised address owner is the node itself,
  `nodeAddress` (`node-service.js:81, 149, 539`; `bootstrap-service.js:199`),
  the value it publishes as `nodes.node_address`. `createWasmServiceNodeDependencies`
  (`runtime-startup-wiring.js:37-49`) gains lazy getters `nodeAddress`,
  `systemTableCache` and keeps `cdcIntegrationService`; `boundStartResult`
  (`wasm-creation-publication.js:104-114`) carries `host` from the lifecycle's
  dependency; the runtime composes the endpoint intent and the services-row
  `address` from it. Never `'localhost'` or a context literal. The embedding
  supplies `nodeAddress` per host in its dependency object (the production
  owner's shape), and the witness asserts the row equals that owner's value.
- Services row (RR4): bound rows never carry `cleanup_token`;
  `create_attempt_token` = the retained creation's operation id, stable per
  creation (the partition meaning rotates per attempt, schema comment
  `system-table-core-schema-definitions.js:246-249`); every decision consumer
  of `create_attempt_token` also requires a failed-create `cleanup_token`, so
  they stay inert; `replica_id != service_id` is read as `replica_id ||
  service_id` by every consumer. The PRESENT hop is named: runtime
  `startConsensusBootstrap` -> driver `markServicesRowPresent(serviceId,
  serviceType)` (new, `wasm-component-driver-consensus.js`) ->
  `lifecycle.enableServicesRowPublication(replica, serviceType)` ->
  serving-state record `servicesRow: {state: PRESENT, serviceType}`; the
  replica's `writeRoleUpdate`/`writeLeaderNodeUpdate` CAS predicate takes
  `service_type` from that record (one value flows projection -> record ->
  writer); the unbound predicate defect (`'wasm_service'` against rows
  projected as `runtime_service`) is recorded for the deletion unit (R17).
- Projection order (RR5, option a): the runtime projects on the lifecycle's
  PUBLISHED, which already carries the owner's CAS and the durable local
  grant; the manager's `confirmPublishedAuthority` runs after the runtime
  returned; its CONTRADICTED branch retires through the bound STOP branch,
  which removes the endpoint and deletes the row, so a forged PUBLISHED driver
  result projects rows transiently and withdraws them (trusted-host threat
  model, `authority-and-recovery.md`). For `PUBLISHED_UNPROJECTED` the manager
  returns before any re-resolve and keeps `_replicaStateById` STARTING.
- Writer answers (RR11): the endpoint writer returns `{success: false,
  outcome}` for `REFUSED_STALE_INCARNATION`, `AUTHORITY_UNAVAILABLE`,
  `NOT_APPLIED` without throwing; the bound branch inspects the return and
  maps all three to `PUBLISHED_UNPROJECTED`; an absent endpoint writer or
  projection writer is a typed `PUBLISHED_UNPROJECTED` reason, never PRESENT.
  Cached view: with ADMISSION_RETAINED first, a lagging service_definitions
  cache cannot FAIL a bound CREATE. Identities: the driver's S-keyed
  `_prepared`/`_lifecycles`/`_running` (`wasm-component-driver.js:171-186,
  362-363`; cleared by token at `wasm-component-driver-consensus.js:82-91`).

## RV2.4 Wake consumer (RR7)

Enqueue-only: `onCreationWake` records the wake and schedules the re-entry
with `setImmediate` (as `createReplicaAsync` does, `runtime-service-handler.js:336-348`);
it never awaits bootstrap inside the wake, since the wake is delivered
synchronously from inside the continuation run. The mapping
`wake.token.operationId` -> entry is a scan over `localReplicas` (keyed by
replica id; after HELD only `localReplicas` holds the operation id, `:442-444`).
`NO_LOCAL_OPERATION` lives in `runtime-service-handler-constants.js`.

## RV2.5 Owner decisions pending (RR10)

The D0 quest-log entry says "deleted in stage 1c"; its supersession (deletion
as a separate unit after activation) is appended to the quest log once the
owner rules decision (c) of the closeout plan; stage-1c implementation does
not start before that entry exists. RB2 and RB4 are the two stage-1c items
decided on the production shape and resolved inside 1c without production
wiring changes beyond the node dependency getters.

## RV2.6 Proof plan additions (RB5, RR9)

C6 embedding prerequisites (listed, not invented): the handler's
`systemTableCache` (service_definitions and services rows, fed from the
fixture's SQLite tables after each projection) and `cdcIntegrationService`
(`RuntimeServiceHandler.initialize :175-189`); the replica's
`cdcIntegrationService` and `systemTableCache` (new lifecycle dependency
`systemTableCache`, production value the node's cache, replacing the
singleton read at `wasm-service-replica.js:144-145`) holding the write-ready
rows (`isSystemTableWriteReady`, `leader-readiness-gate.js:232-252`), a
LABELLED fixture seam under the "no fabricated routing rows" rule; NO
`roleUpdateWriter`/`leaderNodeUpdateWriter` injected, so the production CAS
predicate is exercised and the role write is asserted by reading the SQLite
services row's `raft_role`; a real `ExecutorOutcomeEmitter`; the CREATE_REPLICA
/ REMOVE_REPLICA request literal at
`operation-workflow-dispatch-response-reconcile.js:636-647` extracted into an
owner function the fixture calls (or the fixture authors the payload from
`ReplicaOperationField` keys and says so). Cells added: (a) production-shaped
manager (no journal) x native_js or Cell CREATE -> generic path; x bound-class
-> deferral; (b) REMOVE after `closed:false` recovers through the journal-only
read and resolves; (c) REMOVE on a PENDING row reserves nothing; (d) the
remover deletes the physical-id endpoint without logical resolution; (e)
`address` equals the node owner's value on every host; (f) role CAS APPLIED
read from the row; (g) a leader change after PRESENT re-publishes through
`applyReplicaLeadership`; (h) the first role write happens at PRESENT and a
re-drive that finds PRESENT writes nothing; (i) absent writer -> typed
`PUBLISHED_UNPROJECTED`, never PRESENT. Mutations added: recover-for-REMOVE
(`recoverConsensusCreation` used for a REMOVE); UNAVAILABLE deferral applied to
a non-bound-class CREATE; remover parses S; address literal; absent writer
treated as PRESENT.

---

# Revision 3 (2026-10-17, after the focused re-vet of Revision 2: REVISE, F2 blocking, F1/F3-F10 required, N1-N8)

Re-vet report: `evidence/design-vets-20261017/design-revet-activation-discovery-r2-20261017.md`.
It confirmed RB1 (REMOVE route), RB3 (remover), RB5 (C6 prerequisites), RR2,
RR4-RR11 as resolved and the CREATE order as removing the native_js regression.
This revision resolves F1-F10 and records N1-N8; where it and Revision 2
disagree, this revision wins. Implementation proceeds from Revisions 1-3 with
the three vet reports binding; the independent verifier judges the result.

## RV3.1 Address (F2, F10; blocking)

- `nodeAddress` on both dependency-owner hosts is the entrypoint's
  `host:port` (or URL) string, the same value written to `nodes.node_address`;
  `service_endpoints.address` and the services row `address` are a bare HOST
  paired with `port`. The existing owner that derives that host from the
  node's two address fields is `resolveEndpointAddress({nodeAddress,
  advertisedNodeWsAddress, nodeId})` (`meta-service-definition-registration.js:140-192`,
  advertised WS host first via `resolveAdvertisedEndpointHost`, else the URL
  hostname, else `[v6]`, else the trailing `:port` stripped), the owner that
  already writes the built-ins' endpoint rows.
- `createWasmServiceNodeDependencies` exposes a lazy `endpointHost` =
  `resolveEndpointAddress({nodeAddress: node.nodeAddress,
  advertisedNodeWsAddress: node.advertisedNodeWsAddress, nodeId: node.nodeId})`
  (both fields exist on both hosts: `bootstrap-service.js:199-200`,
  `node-joining-owner-construction.js:83-84`). Never raw `nodeAddress`, never
  `'localhost'`, never a context literal.
- Hops (F10): lifecycle `continueBoundStart` passes
  `this.dependencies.endpointHost` into `boundStartResult(replica, run, host)`;
  `START_RESULT_FIELD.HOST` is owned by the lifecycle's result vocabulary
  (`wasm-service-lifecycle.js:36-42`); the driver's `projectBoundStart`
  forwards `host` beside `port`; the runtime composes the endpoint intent
  `{host, port, protocol, consensusBinding, consensusResourceToken}` and the
  services-row `address` from it. The remover takes a third argument
  `{consensusBinding}` (the bound descriptor's binding) so writer and remover
  share one binding-first resolution.
- The embedding supplies the two node fields per host (or `endpointHost` built
  by the same owner) and cell (e) asserts the DERIVED host for a configured
  `host:port` NODE_ADDRESS and the advertised-WS precedence. Mutation added:
  "raw `nodeAddress` written as host".

## RV3.2 Deferral carrier and the honest statement (F1)

- There is no new deferral outcome type. A handler-typed deferral is the
  existing `RUNTIME_SERVICE_CREATE_FAILED` / `RUNTIME_SERVICE_REMOVE_FAILED`
  with `errorCode` and `deferRetry: true` (the only fields `buildExecutorOutcome`
  keeps, `executor-outcome-emitter.js:59-76`). After a deferral the memo is
  FAILED (re-enterable: `handleCreateReplica` proceeds for any status other
  than ACTIVE/CREATING), never CREATING.
- Honest statement, replacing "never FAILED": the deferral is typed at the
  handler; the coordinator FAILs runtime-service deferrals today, because its
  DEFER_RETRY row and the synchronous deferral channel both require a system
  partition (`operation-workflow-executor-outcome-reconcile-methods.js:36-48`,
  `operation-workflow-dispatch-rearm-evidence.js:394-401`). Honouring a
  deferral for a bound CREATE whose slot is live is the activation quest's,
  folded into B9 (held or deferred bound CREATE budget). For a bound-class
  production CREATE today this yields the same terminal state as before
  (FAILED) with a typed code instead of `REPLICA_SET_REQUIRED`. Cell (a)
  asserts the emitted payload, not a coordinator deferral.
- HELD outcomes (`RUNTIME_SERVICE_CREATE_HELD` / `REMOVE_HELD`, UPDATE_STEP)
  name the operation's CURRENT step (CREATING / STOPPING) so a same-step
  update stays a no-op (N5); they are observation only until B9's owner exists.

## RV3.3 Result shape tables (F4, F5, N2, N7)

`resumeConsensusCreation(operationId, context)` answers, mapped by the handler:

| Answer | Handler |
| --- | --- |
| `status HELD` | memo HELD; CREATE_HELD; INITIATED/IN_PROGRESS reply |
| `status PUBLISHED` | memo ACTIVE; CREATE_ACTIVE |
| `status PUBLISHED_UNPROJECTED` | memo HELD; CREATE_HELD (serving open, discovery closed; re-drive re-projects UPDATE-first) |
| `outcome INTENT_NOT_FOUND` (definitive read) / `UNAVAILABLE` | step 3: classify the row; bound-class -> `BOUND_ROUTE_REQUIRED` -> CREATE_FAILED, or CREATE_FAILED + `deferRetry` (unavailable); other class -> generic path |
| `outcome TERMINAL_OPERATION`, `RESOURCE_CLOSED`, `CONTENT_CONFLICT` (recover phase), `CORRUPT_STATE`, `INVALID_REQUEST` | CREATE_FAILED with the code (slot not live or request invalid) |
| `outcome UNKNOWN {reason}` for any reason: `CONSENSUS_SERVING_NOT_IMPLEMENTED` (a driver FAILED start: port allocator, module mirror, REPLICA_LIVE, consensus refusal), `CONTENT_CONFLICT` with `retirement` (CONTRADICTED authority; the resource already retired), `UNRESOLVED` authority (owner unreachable), reader failure | memo FAILED; CREATE_FAILED + `deferRetry: true` + code (handler-typed deferral, RV3.2); CONTRADICTED's next resume answers RESOURCE_CLOSED -> FAILED: convergence |

`readRetainedCreation(operationId)` (N2): the TERMINAL check (`TERMINAL.has(row.state)`)
runs before `retainedToken`, so a COMPLETED/FAILED row with an admission
answers TERMINAL_OPERATION, not CORRUPT_STATE; the intent/operation-id
mismatch answers CONTENT_CONFLICT beside CORRUPT_STATE.

REMOVE results (`retireWasmCreation`, `wasm-creation-retirement.js:145-159`,
and the manager's `UNKNOWN` on a throw), mapped by the handler (F4):

| Answer | Handler |
| --- | --- |
| `closed === true` | endpoint removed, STOPPED projected, REMOVE_COMPLETED |
| `CLOSE_UNRESOLVED` with `retired: true` and `close.outcome === HISTORY_UNAVAILABLE` | REMOVE_COMPLETED (the slot was reused at a later ordinal; nothing of this creation can be live; recorded) |
| `INVALID_REQUEST`, `CONTENT_CONFLICT`, `INVALID_LINEAGE` (permanent) | REMOVE_FAILED with the code |
| `CLOSE_UNRESOLVED` (other close outcomes), `RETIREMENT_BLOCKED_CLEANUP_REQUIRED`, tombstone refusals, `UNAVAILABLE`, manager `UNKNOWN` | REMOVE_HELD; memo stays REMOVING; the next REMOVE re-drives |
| `readRetainedCreation` -> `NOT_ADMITTED` (PENDING row) | REMOVE_COMPLETED: the handler cannot resolve an ordinal; a PENDING row MAY hide an applied reservation whose reply was lost (F3); the recovery stage's restart scan re-reserves idempotently and the planner's RELEASING row then retires the outstanding slot (owner recorded) |
| `readRetainedCreation` -> `TERMINAL_OPERATION` / `CORRUPT_STATE` | REMOVE_FAILED with the code |
| no memo, no row, no creation | NOT_FOUND (N6: a founder HELD before a handler restart, with no row yet, answers NOT_FOUND and the coordinator treats the stop phase as satisfied while the slot stays ADMITTED until the restart scan; typed edge, recovery-stage owner) |

Writer answers mapped to `PUBLISHED_UNPROJECTED` (N7): `REFUSED_STALE_INCARNATION`,
`REFUSED_INCARNATION_REQUIRED`, `AUTHORITY_UNAVAILABLE`, `NOT_APPLIED`, absent writer.

## RV3.4 PRESENT mark keyed by token (F8)

`markServicesRowPresent(serviceId, serviceType, consensusResourceToken)`; the
lifecycle marks only the registered replica whose `consensusCreation.token`
digest equals the token, else a typed no-op that the runtime maps to
`PUBLISHED_UNPROJECTED` (a successor J under the same S can never be marked
by I's projection). Mutation added: "mark keyed by S".

## RV3.5 HELD re-entry concurrency (F9)

Both the HELD re-entry (`existing.status === HELD`) and the wake re-entry
register an `inProgressOperations` entry for the operation and are skipped
when one exists (the CREATE answers IN_PROGRESS; the wake is recorded). The
memo check order (HELD before in-progress) stands; the guard lives inside the
re-entry.

## RV3.6 Shared vocabulary and the replica's cache (F6, F7, R16)

- `ReplicaStatus.HELD`: the completeness witness
  `test/rebalancer/replica-status-completeness.property.test.js:42-67` (seven
  values, `REQUIRED_STATUS_VALUES`) is superseded by appending: eight values,
  `'held'` required; `isValidStatus('held')` becomes true for every consumer.
- The replica's cache source: the singleton fallback stays
  (`options.systemTableCache ?? NodeService.getInstance().getSystemTableCache()`);
  the lifecycle injects its `systemTableCache` dependency; production is
  unchanged for unbound replicas and for the eight test construction sites.
  The production injected value is the host's `peekSystemTableCache()`; no
  equivalence to the singleton's cache is claimed.
- `recoverLocalReplicaForRemoval` (N3): the `get` by `service_id` stays first;
  `find` by `replica_id` is the miss path; the recovered memo copies
  `create_attempt_token` as `operationId`.

## RV3.7 Production behaviour changes outside the bound route, named (R16)

1. `ReplicaStatus` gains HELD (shared enum; witness superseded, RV3.6).
2. `createWasmServiceNodeDependencies` gains `endpointHost`, `systemTableCache`,
   `creationWake` getters: inert for unbound replicas.
3. `recoverLocalReplicaForRemoval` adds an O(rows) `find` on a `get` miss;
   unbound semantics unchanged.
4. Every CREATE calls `resumeConsensusCreation` first: one synchronous
   UNAVAILABLE today before the generic path; once the activation quest wires
   the journal, one authoritative `wasm_operations` read per native_js/Cell
   CREATE (that quest's accepted cost of the order).
5. Endpoint writer and remover gain a binding-first branch; without a binding
   they parse as today.
6. `confirmConsensusBootstrapResult` admits PUBLISHED_UNPROJECTED (bound only).
7. A bound-class production CREATE answers CREATE_FAILED + `deferRetry` + code
   instead of REPLICA_SET_REQUIRED: same terminal state, typed code.
None alters the unbound route's outputs.

## RV3.8 Owners of the new names (R06/R07)

`servicesRow {state, serviceType}` and the token-keyed mark: serving-state
module; memo HELD + `operationId`: handler; `NOT_ADMITTED`: RESULT in
`service-consensus-creation-intent.js`; `RUNTIME_SERVICE_CREATE_HELD` /
`REMOVE_HELD` + action-map rows: `executor-outcome-constants.js`;
`NO_LOCAL_OPERATION`, `BOUND_ROUTE_REQUIRED`: handler constants;
`PUBLISHED_UNPROJECTED`: `CONSENSUS_BOOTSTRAP`; EP_META `binding_digest` /
`resource_token`: `service-endpoint-builder.js`; `START_RESULT_FIELD.HOST`:
the lifecycle; `endpointHost`: the node dependency owner over
`resolveEndpointAddress`; the deferral: the existing FAILED outcome with
`deferRetry` and `errorCode`.

---

# Revision 4 (2026-10-17, lead decisions on the implementer's findings before verification)

Implementer report: `evidence/serving-publication-20261017/implementer-stage1c-report.md`
(retained at commit). Where this revision and Revisions 2-3 disagree, this
revision wins.

- **RV4.1 PUBLISHED_UNPROJECTED is confirmed against authority (supersedes
  RR5's sentence "the manager returns before any re-resolve").** The stage-1
  witness P11 (A-B5: a PUBLISHED-class driver answer is presentation until the
  metadata owner confirms the exact slot PUBLISHED) went red under Revision 3:
  a forged PUBLISHED answer whose projection failed was never contradicted, so
  the forged resource was never retired and its slot stayed ADMITTED.
  Decision: `bootstrapConsensusCreation` runs `confirmPublishedAuthority` for
  PUBLISHED_UNPROJECTED exactly as for PUBLISHED; CONTRADICTED retires by
  creation and answers `UNKNOWN{CONTENT_CONFLICT, retirement}`; UNRESOLVED
  answers `UNKNOWN{reason}`; CONFIRMED returns the PUBLISHED_UNPROJECTED result
  unchanged with the manager state kept STARTING (never RUNNING, never retire).
  Mutation M18 (skip the confirmation for PUBLISHED_UNPROJECTED) must redden P11.
- **RV4.2 The request-Cell predicate is null-safe at its owner (F-3).**
  `isRequestCellDefinition` tested the `binding_*` keys by presence; a
  serialized `service_definitions` row carries them with null values, so every
  installed `wasm_component` row classified as a request Cell and the
  bound-class refusal of RV2.2 could never fire for real rows. Decision: the
  owner (`request-cell-runtime-contract.js`) treats null/undefined values as
  absent; every caller is censused in the report; an owner witness classifies a
  serialized row (keys present, null) as not a Cell and a compiled Cell row as a
  Cell; the handler witness uses real-shaped rows. Mutation M19 (presence
  test) must redden both. The activation quest's planner discriminator (B5)
  inherits the corrected owner.
- **RV4.3 Supersessions the implementation required beyond Revision 3
  (accepted provisionally; the verifier judges; the quest-log decision entry
  at commit names every line):** the retained fixture's endpoint/state sinks
  record and answer "applied" only for the serving replica's physical id and
  still refuse and record anything else (every `publications === []`
  assertion unchanged); the genesis and reconciliation assertions "no leader
  publication queued" hold only for replicas that are not PRESENT; the driver
  conformance allowlist gains `markServicesRowPresent`; the handler tests'
  mock managers answer `resumeConsensusCreation` -> UNAVAILABLE (the
  production shape).
- **RV4.4 Endpoint metadata carries digests (F-8):** `binding_digest` and
  `resource_token_digest`, never the raw token; recorded at the EP_META owner.
- **RV4.5 Recorded for the activation quest (F-4):** a production projection
  owner that answers `retained: true` makes the bound route answer
  PUBLISHED_UNPROJECTED on every re-drive; the embedding uses the direct
  writer. The activation quest decides how a retained projection becomes
  PRESENT.
- **RV4.6 Accepted refactor (F-7):** `recoverConsensusCreation`'s intent
  decoding moved into a shared helper used by `readRetainedCreation`; behaviour
  byte-equivalent; the verifier checks the call sites.

## Revision 5 (lead, 2026-10-17): the stage-1c verifier's round-1 verdict (REJECT, narrow) ruled

Verifier record: `evidence/activation-discovery-20261017/verifier-1c-round1/verdict.md`
(snapshot `04f1a91129550c8c0bf54e509faddfda50528c45`). One required change
(V-F1) and nine recorded notes (V-N2..V-N10). Rulings, appended, never
rewriting an earlier line:

- **RV5.1 A HELD re-entry resumes the CREATION, never the request (V-F1;
  supersedes the implementer's F-5 line "a HELD re-entry uses the request's
  operation id").** `reenterHeldCreation` resumes `existing.operationId` (the
  HELD memo carries the retained creation's id for exactly this) and keys the
  in-flight guard by that id, the same key wakes use (`token.operationId`), so
  RV3.5 holds across both entry points. Every outcome the re-entry emits names
  the creation's operation id (one owner of the operation row); the request's
  reply stays IN_PROGRESS as today and its own id is a log field
  (`requestOperationId`) of the re-entry. The one-id premise (RV1.2 R4/R1)
  remains the producer's promise; the node never depends on it to keep custody
  of a live bound replica.
- **RV5.2 A nameless settle never overwrites a creation-naming memo (V-F1,
  second half; V-N8).** A refusal or deferral for a request that names no
  retained creation (`BOUND_ROUTE_REQUIRED`, the UNAVAILABLE deferral, or the
  route's catch path before `resumeConsensusCreation` answered a retained
  class) writes the replica's memo only when the current memo names no
  creation (absent, or `operationId` undefined); otherwise the memo is left as
  it is and only the outcome is emitted. The catch path names the request's id
  on the memo only after the resume answered a retained class (the route
  tracks that fact); before it, the settle is nameless under this guard.
  Witnesses (unit, red on the round-2 tree by the verifier's probe P1): a CREATE
  under another operation id for a HELD replica keeps the memo's creation,
  re-enters it once, emits under the creation's id, and the next REMOVE is
  bound; a wake during that re-entry is RECORDED on the creation's in-flight
  entry (no second resume).
- **RV5.3 Wake consumer corrections (V-N2, V-N3).** `findWakeTarget` requires a
  string `token.operationId`; a wake without one is `NO_LOCAL_OPERATION` (never
  matched against memos that carry no `operationId`). A RESOURCE_CLOSED wake
  recorded on an in-flight CREATE sets no `wakePending` (design: "nothing
  local"); only OBSERVED and GRANT_HELD do.
- **RV5.4 The PRESENT latch is witnessed (V-N10, V-N4).** After PRESENT, a
  second `enableServicesRowPublication(S, type, ownToken)` answers
  ALREADY_PRESENT and leaves `pendingRoleUpdate` untouched (lifecycle unit
  witness; mutation VA8 must redden it). C6 (h) asserts `born >= 0` before
  ordering the first role write after the INSERT.
- **RV5.5 RV4.3 wording (V-N6) and fixture leftovers (V-N5).** The retained
  fixture's projection sink also accepts a STOPPED projection for any replica
  (retirement needs it); RV4.3's sentence is read with that addition. The
  embedding fixture drops the fields it inherited from the strong-write fixture
  and does not read (`held`, `events`, `phase`, `holdResponses`).
- **RV5.6 Recorded (V-N7, V-N9).** The repo-wide literals checker's 320 "new"
  hits are all outside this diff (a stale committed baseline at the lane tip):
  lane debt for closeout step 3, not this stage. A bound REMOVE's recovery of
  its creation depends on the `wasm_operations` journal read; when the journal
  is unavailable the REMOVE defers typed while the replica keeps serving
  (RV2.1, fail-closed); whether `_wasm_creation_local` may serve as the
  fallback token source is the recovery stage's decision. This stage registers
  one coupled pair in `test/shards/impact-contracts.json` for the bound
  interaction (route module <-> consensus bootstrap / publication module <->
  the C6 embedding witness) so the cone selects them together.
- **RV5.7 Round-3 proof.** Re-measure U, N, the lifecycle unit test, the
  route-module statics (decision boundaries, complexity, literals, silent
  catch), duplication and unused-export ratchets; the verifier re-runs VM01,
  VM11, VA7, VA8 plus the new mutations "re-entry resumes the request id",
  "nameless settle overwrites the memo", "CLOSED wake sets wakePending",
  "token-less wake matches a nameless memo". Lab: the changed cone of the
  round-3 delta at the new snapshot on one host, beside the round-2 broad run
  at `04f1a9112` (85 files, three hosts) which stands as the base-comparison
  classification of the unchanged files.
