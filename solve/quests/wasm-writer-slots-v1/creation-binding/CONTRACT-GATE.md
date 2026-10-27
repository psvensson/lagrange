# Creation to WASM INIT: current owner gap

Source reviewed: c968fc6ec5c88424342e306ae66b619c06e564eb. Date: 2026-10-16.
The 21 inspected source identities and fresh checkout observations are in
`source-manifest.json`. This is a read-only contract audit, not another executed
counterexample or a source correction. The source and all existing tests remain
frozen. Independent review is required before implementation.

## Selected semantics, now fixed

The user accepts the original recreation RED and selects a creation-owner-bound
incarnation. Reuse of the logical service ID remains supported in direction.
INIT confirms an already authoritative incarnation; empty storage cannot confer
creation authority. Retained restart and a replacement replica of the same
instance preserve the incarnation. Explicit fresh recreation obtains a new one.
Writer slots, sequences, acknowledgments, bounded outcomes and ASYNC separation
remain as selected. This decision qualifies the original DESIGN.md INIT section;
the historical document and counterexample are not rewritten.

The creator must fence old CREATE as well as old INIT. Historical completion
may be returned without granting current activation. Replicas must persist the
same admitted binding before writer INIT; deterministic apply reads that stored
binding, never a live cache or RPC. A retained file/image mismatch refuses
opening and never overwrites the old binding. Old commands retain their bytes.
An old object callback and a new delivery selecting the current object are
separate lifecycle cases. No source edit is authorized by this audit alone.

## Source map: the missing fact is current service-instance authority

| Existing owner and source | Observed contract | Missing handoff |
| --- | --- | --- |
| `ServiceLifecycleCommandOwner.buildIntentIdentity`, `src/service/service-lifecycle-command-owner.js:199` | Definition ID derives from tenant/name; operation and installation IDs derive from retained command identity. | Operation identity is not a per-service current-incarnation decision. |
| `ServiceInstallCatalogOwner.requestInstallation`, `src/control-plane/owners/service-install-catalog-owner.js:449` | Persists installation/revision/definition/operation IDs and desired/rollout state. Serializes installation, operation and revision keys; exact installation replay is checked. | No durable compare-and-set choosing one current creation generation for the reusable definition ID, nor a retained supersession fence consumed by replica CREATE. |
| `ServiceInstallationReconciler._reconcileUnsupportedActivation`, `src/service/service-installation-reconciler.js:242` | The catalog-installation route records `ACTIVATION_UNSUPPORTED`, then `RECORDED_NOT_RUNNING`. | This route cannot currently issue an authoritative running consensus-service incarnation. This does not mean all WASI Cell execution is unsupported. |
| `ServiceDefinitionsOwner.reconcileRequestBinding`, `src/control-plane/owners/service-definitions-owner.js:198` | Compiles immutable Binding lineage into desired service rows; existing planning owner consumes them. | This is a Cell desired-state path, not a common durable incarnation transition for the consensus-backed WASM writer service. No incarnation appears in `SD_COL`/the canonical service-definition schema. |
| `RuntimeServiceHandler.handleCreateReplica/createReplicaAsync/resolveServiceDefinition`, `src/node/runtime-service-handler.js:224/369/739` | Accepts operation/entity/replica IDs, tracks local in-progress/active entries, then resolves the definition from the system table cache. Calls lifecycle create/start. | Does not carry or authoritatively validate the original service creation generation. Cache currentness or an empty local map cannot fence an old CREATE after process loss. |
| `ServiceLifecycleManager._journalCreate`, `src/service/service-lifecycle-manager.js:412`; `createReplica`, `src/service/service-lifecycle-operations.js:185` | Optional `wasm_operations` CREATE journal and tenant/idempotency lookup; adapter receives definition/context, not a common creation record. An exact idempotency hit returns recorded status. | Returning old completion is legitimate; it does not authorize reinstalling it. The generic journal is not a per-service current-instance register. |
| `recoverOperationRow`, `src/service/service-lifecycle-recovery.js:94` | Resolves context for recoverable operation, then calls adapter CREATE. | Recovery must bind the original creation to its permission; service-ID lookup cannot silently substitute today's definition or authorize yesterday's instance. This is a source-derived risk, not a newly executed recovery failure. |
| `RuntimeServiceAdapter.createReplica:84` → runtime lifecycle `prepare` → `WasmComponentDriver.#prepareConsensusReplica:396` | Passes definition/context, then replicaId/replicaIds to WASM lifecycle. | No established service-level creation result is carried. A constructor option would be an assertion without this provenance. |
| `WasmServiceLifecycle.createReplica/administerWriter`, `src/wasm-service/wasm-service-lifecycle.js:183/236` | Maps active objects by service ID, checks local lifecycle/founding set; admin selects current hosted object. | Must consume creation authority before opening, then preserve it through immutable writer admission. Local object fencing alone cannot reject newly delivered old bytes. |
| `WasmWriterState` constructor/classify, `src/wasm-service/wasm-writer-state.js:76/125` | Fresh metadata is uninitialized; first valid same-service INIT chooses incarnation. | Replace this premise only once creator-bound metadata is available; do not inject an unproven expected incarnation. |

`RuntimeServiceRebalancerOwner` remains the existing placement/planning owner
for active `service_definitions`; it is not a new incarnation authority. Its
cache-driven planning must consume the durable instance decision, not mint it.
The architecture's legacy-scaffold paragraph is stale about startup construction:
`runtime-startup-wiring.js:76` does construct `WasmServiceLifecycle`. The same
source explicitly lacks module-mirror/port-allocator dependencies. Neither
startup wiring nor this audit proves successful production consensus-WASM
activation; native fixtures are a separate evidence surface.

## Consensus, storage and routing are part of the handoff

`wasmServiceConsensusRequest` currently supplies `GROUP_ID = serviceDefinitionId`
(`wasm-service-consensus-port.js:141`). The peer is replicaId; routing uses
node/type/replicaId. Storage is `wasm-services/serviceId/replicaId.db`
(`data-directory-manager.js:181`). Raft ingress checks group ID and recipient
(`raft-rs-ingress.js:95`); durable peer/consensus identity remains with its
existing owners. These are existing checks, not proof of cross-incarnation
isolation when the logical name is reused.

The creation handoff must establish which existing group, founding peers and
storage generation belong to J, and how they differ from or exclude I. A new
file does not itself prove fresh authority. A database INIT check alone does
not exclude old consensus history, ASYNC entries or timer entries. Conversely,
this audit has not executed old-message admission and makes no Raft safety or
data-loss claim. No parallel transport filter or new consensus protocol is
proposed. Any group/peer mapping must use the existing identity owners.

## Concrete upstream schedules to close

1. Installation A for logical S is recorded; a later installation B for S is
   recorded. The catalog can answer both historical intents. No current-instance
   CAS in this path distinguishes which may initialize fresh replica storage.
   Using A's exact replay as activation permission would reintroduce the bug.
2. CREATE(A,S,R) is delayed. Local process/maps disappear; S now denotes B.
   The handler accepts the old tuple and reads the current cached definition.
   No original-incarnation check reaches adapter creation. Depending on the
   context, it may retarget old intent to B or reconstruct A. Neither inference
   is a permitted substitute for an exact creation decision.
3. A recoverable historical CREATE journal row resolves a service context by
   logical S. A present-day context cannot prove that the historical operation
   owns that instance. Recorded historical success must remain separate from
   permission for new effects.

These are source-backed missing-precondition schedules, not additional measured
native REDs. The only measured recreation RED remains the earlier 2-pass/1-fail
SQLite component file at 9b53962f2e7b8402b2a6a02a4a24b45985cd3563.

## Required existing-owner interface and commit point

The next upstream unit belongs to the existing service creation/catalog and
service-definition owners, with runtime CREATE as a consumer. It must establish
one authority for the fact `(logical service S -> current durable incarnation)`.
Installation records already own immutable intent/history; a current-instance
transition should extend the existing durable service-definition/creation
record, rather than introduce a generic incarnation registry.

Proposed interface obligations, not implemented APIs:

- `establishInstance(intent, exactExpectedCurrent)` orders an immutable creation
  operation and incarnation against the current durable creation version. The
  actual application transaction is the decision point. Competing creators
  cannot both win. Missing storage does not reset this version. Existing
  installation IDs may identify the request but cannot alone grant currentness.
- `resolveCreation(originalOperation)` returns its immutable historical result
  separately from `admitReplicaForInstance(originalBinding, replicaIntent)`.
  Superseded operations do not republish the old instance. Missing historical
  detail is unavailable, not a fresh create. Durable retirement must retain the
  necessary fence rather than delete the name and let an old insert win again.
- Replica admission/recovery carries the original binding, common group and
  founding identity through descriptor, adapter and WASM lifecycle. The precise
  fence against a create already in flight during supersession, and the
  authoritative publication/retirement ordering, must be owned here. A read of
  currentness followed by an unfenced async create is insufficient.
- The existing application opening/genesis transaction persists that binding
  before writer INIT or transport participation; retained mismatch refuses
  without modifying data. The precise ordering with peer-identity persistence
  and recovery remains to be established by those owners.
- Deterministic writer application compares all v1 intents with the stored
  binding; INIT(J) creates writer state only within J. Snapshot admission uses
  the shared application-image owner and rejects I-as-J before serving.

No current inspected record supplies this full transition or handoff. Selecting
new columns now would not prove upstream retry, asynchronous create, publication
and recovery fencing. The catalog activation route deliberately does not perform
this transition; the direct desired-state route does not provide it either.
That is the specific owner incompatibility at this gate, not a request to
reconsider reusable names, caller identity, sequence or retirement policy.

**STOP before source:** return the missing common creation-currentness and
activation-to-genesis contract. The user explicitly requires this stop when the
existing creator cannot supply a common durable binding. Do not unblock by
passing `expectedIncarnation`, repurposing a per-replica journal ID, assuming
unavailable activation succeeded, or implementing an independent registry.

## Resume acceptance and unchanged obligations

Once the upstream contract is independently accepted: freeze a new fixture
profile using its real creation result. Establish I; establish J before INIT(J);
reject old INIT itself plus ENROLL/WRITE without effects; then prove J works.
Retained I separately reopens and returns exact replay without repeating effect.
Cover lost creation response, competing creations, delayed old CREATE, current
retirement during an admitted asynchronous create, missing/conflicting binding,
restart after binding persistence before INIT, old object callback, new routed
retry and I snapshot presented to J. A minimal binding-check mutation must fail
the same final test bytes semantically, not fail setup. Native RF3/lifecycle
evidence is required before integrated claims. The prepared completion tests,
resource/replay tests, completion mutation, process-loss/snapshot proof and
affected cone still need execution after source approval. Prototype static debt
remains unchanged. No new lab run or lease was needed for this read-only gate.

## External reference, not implementation authority

Kubernetes distinguishes reusable object names from system-generated UIDs for
historical object instances. This supports the selected name/instance distinction;
it does not supply Lagrange's missing creation transaction or recovery fence.
Primary source consulted 2026-10-16:
https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#uids

## Preservation

No source, original witness, fixture, sealed contract or earlier result changes
in this packet. Shared checkout remains HEAD0996d7576516af24f5f4d3e1e9aee37c775aabae
with 18 staged paths and staged binary diff SHA256
0b2ea79142a13f4dcada523f01108fbd8a4809492838e23f7a0246a7159953fc.
No live process matching this lane/executor was observed beyond the inspection
command itself. Lab inventory is not a reservation; fresh locking is required
before any later execution. Full release, F1 supersession and runtime increment
remain HOLD; successor unsealed/unactivated; shared-control-wave HELD; Runner/TAP
PARKED; PR122 rejected.
