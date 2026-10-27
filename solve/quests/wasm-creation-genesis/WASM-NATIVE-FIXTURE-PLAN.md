# Creation-bound WASM native companion: fixture inputs and proof limits

Read-only source inspection at 688c75e0a5db943985f8ff2a93e5355560ac1aa1,
with proposed CONTRACT-R2.md and proposed-interfaces.md. No fixture execution,
no source edits, and no claim of approved interfaces. Historical fixtures and
witnesses remain unchanged. This plan identifies the inputs needed before test
code can faithfully call the selected interaction.

## Exact owner chain and required fixture composition

1. Reuse the metadata test author's real `ServiceInstallCatalogOwner`,
   `ServiceDefinitionsOwner({controlPlaneSystemTableGateway,catalogOwner})`,
   and production request constructor. The first fixture uses actual gateway,
   CDC SQL generation and SQLite conditional updates. Its selection authority
   is explicitly a component proof; it is not native distributed metadata CAS.
   The integrated claim requires replacing only that backing fixture with the
   existing real QueryEngine/partition RF3 fixture while keeping canonical
   request bytes and downstream calls identical.
2. Retain the complete canonical CREATE K/request in an actual caller file
   before invoking `selectConsensusInstance(request)`. Consume returned B;
   never calculate or supply an expected incarnation independently. Reserve
   three resources by calling the real metadata owner with B and exact
   `{slot,expectedOrdinal,operationId,replicaId,nodeId}`. Retain original
   returned tokens before dispatch. Metadata-selected peers are inputs;
   instance-qualified physical identities must come from their existing owner.
3. Exercise the actual normalized descriptor, `RuntimeServiceAdapter` /
   `ServiceRuntimeLifecycle` / `WasmComponentDriver` / `WasmServiceLifecycle`
   route selected for this direct consensus consumer. Do not send an arbitrary
   extra field directly to WasmWriterState or instantiate a replacement genesis
   authority in the fixture. The API selecting which of these layers owns
   metadata resolution/serving grant remains a source contract decision.
4. Each of the three hosted replicas needs an actual `DataDirectoryManager`,
   `PortAllocator`, `ModuleMirror`, transport and clock. Construct real node
   dependencies, initialize directory ownership normally, and load one real
   bounded module through `ModuleMirror.setModule` with its normal validator.
   A `hasModule:()=>true` substitute is not acceptable. This test exercises the
   consensus application; it does not claim guest execution.
5. Existing loopback transport can own finite queued *core-emitted* envelopes,
   preserving receiver/options/bytes. Reuse the frozen scheduled-delivery
   algorithm, not its opening fixture: that fixture constructs replicas
   directly and writes fabricated ACTIVE routing rows. New routing must be
   produced from actual admitted metadata placements or consume canonical B
   through the existing routing owner. ADMITTED bootstrap routing cannot imply
   PUBLISHED user serving.
6. Drive only setup with the existing RF3 formation/tick seams. During measured
   cuts use the predeclared finite delivery schedule and zero-delay owned
   wakes. Observation reads durable SQLite, KV and event logs without status,
   settle, deliverAll or tick rescue. Metadata and WASM native positions are
   separate observations with their own group identity.
7. Actual lifecycle shutdown must close local admission, retire the exact
   transport/port/storage owner, write local RETIRED and obtain/resolve CLOSED.
   The native fixture may not call metadata close directly to manufacture its
   prerequisite. All cleanup failures retain evidence and aggregate errors.

## Proposed dependency arguments requiring owner approval

The existing lifecycle constructor has nodeId, messageRouter,
dataDirectoryManager, portAllocator, moduleMirror, cdcIntegrationService,
roleUpdateWriter and leaderNodeUpdateWriter. To consume current selection it
needs the actual `ServiceDefinitionsOwner` (proposed dependency name
`serviceDefinitionsOwner`, not a boolean or supplied success callback).

The existing driver constructor already accepts `wasmServiceLifecycle` and must
continue using it. The descriptor must carry exact B and resource token across
normalization/journal/recovery. Proposed names are `consensusBinding` and
`consensusResourceToken`, but no test should freeze these until the contract
owner selects them. Physical peer/set and storage/group identity must be
resolved by production owners from that binding rather than guessed by tests.

The native fixture additionally needs a production way to provide each
replica's owned TimeSource before opening. Today createReplica does not forward
one, although the consensus substrate consumes `providedTimeSource` on its
replica. The fixture can set that existing hosted seam on the real object
returned by createReplica *before start*, as the historical native fixture did;
this is observation/scheduling setup, not a serving-authority injection. If
create/start becomes one awaited operation, select an existing clock dependency
handoff rather than silently setting the clock after native timers exist.

A callable bootstrap result is required: admitted opening must permit native
transport and matching INIT while user serving remains closed. Clarify whether
`startReplica` returns after bootstrap and a later existing continuation grants
serving, or awaits an automatically owned INIT/grant path. The fixture must not
mark READY/PUBLISHED or manually install a grant to resolve this ordering.

A retained-recovery call must consume the original directory/token and local
grant rather than re-reserve an ordinal. Select its exact production entrypoint;
ordinary stop followed by create with a CLOSED token is not intact recovery.

## Source-grounded blockers (not semantic REDs)

- `service-definitions-owner.js` currently only reconciles request binding;
  select/reserve/grant/resolve/close are not implemented. No missing-symbol test
  will be run or counted as a failing protocol witness.
- `service-descriptor.js:68-100` retains neither B/token nor replicaId/replicaIds.
  `RuntimeServiceHandler.createReplicaAsync:369-396` resolves today's definition
  and builds a new descriptor; its current receipt is not immutable origin.
- `wasm-component-driver.js:339-417` ignores prepare context for consensus and
  calls synchronous createReplica with definition.replicaId/replicaIds only.
- `wasm-service-lifecycle.js:183-229` opens from logical serviceId and supplied
  replica set, with no metadata owner or resource token. `startReplica:272-344`
  considers native initialize sufficient for started/endpoint output.
- `wasm-service-consensus-port.js:112-130` obtains peer routes from SERVICES
  cache. The old fixture creates ACTIVE rows before any lifecycle admission.
  Their use here would bypass the very obligation under test.
- `wasm-service-consensus-port.js:139-145` uses bare serviceDefinitionId as
  consensus group identity. The new instance-qualified owner output must be
  used both by operation ports and durable observation, not hardcoded in tests.
- `wasm-service-replica-lifecycle.js:82-91` writes writer metadata before any
  selected common B/local grant exists. There is no common-root schema/read
  contract yet against which to assert persisted origin without guessing.
- New physical learner admission / image import is not a callable WASM
  lifecycle API here. C12 retained same-peer restart can be proved separately;
  fresh-peer membership or snapshot catch-up must remain an explicit gap until
  their existing owners expose a supported route. Do not use a founding peer
  list to pretend that retained membership accepted a new peer.

## Exact schedules to encode after inputs are selected

| Case | Schedule and passive facts | Limit |
| --- | --- | --- |
| C1 | Real select/reserve I, bootstrap INIT/enroll/write, actual lifecycle retire+metadata CLOSED; real select/reserve J; before J INIT deliver exact old I INIT, ENROLL and strong WRITE to J's real ingress. Emit J common root, local token/phase, writer rows, native positions and KV before/after. Old INIT itself must refuse; valid J INIT/enroll/write succeeds. | Old bytes are retained actual I requests, not generated with a guessed incarnation. Metadata component setup is separately labelled. |
| C2 | Close native runtime without issuing semantic retirement, then reopen the same intact directory under its exact retained grant; replay exact recorded write. Emit same common root, writer outcome/position and no new KV effect. | Ordinary lifecycle stop is semantic retirement and cannot be used as this recovery seam. Same process is not C9. |
| C9 | Child acquires actual data-directory process owner; actual opening persists B/local admitted state before matching INIT. Terminate process at declared owner cut; successor acquires real lock and uses retained recovery. Also PUBLISHED intact restart with metadata unavailable, local RETIRED refusal, crash before/after local RETIRED and metadata CLOSED. | Needs child-process entrypoint, durable caller request/token and real process exit; no in-memory assertion or same-process close suffices. Shared snapshot import remains HOLD. |
| C11 | Retain actual core-emitted I envelope, then deliver unchanged to J through real transport; attempt retained I directory under J through actual opening. Emit typed rejection and unchanged J root/writer/KV/positions. | Retargeting address is an explicit adversarial delivery act; do not edit inner native bytes into a purported core emission. Application-image install unavailable remains separate. |
| C12 | Replace a local replica object/process using the same retained I directory, peer/log identity and grant while other native peers persist. Preserve exact outcomes and native progress. | This proves retained replacement only. New-peer membership/learner promotion requires existing consensus admission, not fresh genesis. |
| Completion | Real creation-bound INIT+ENROLL; actual strong request; permit proposal and withhold two nonreject APPEND_RESPONSEs for that exact position. Emit caller/commit/applied/KV before heal. Release original frames and verify the same caller's exact applied receipt plus KV on RF3; independent healthy control. | Reuse final v1 command matcher and original named STRONG_WRITE_SUCCESS_BEFORE_COMMIT discriminator. Do not edit historical files. |

The exact source-correction mutations must preserve these test inputs and all
new APIs/codecs. Bypass common-root/INIT binding only for C1, and return proposal
acceptance only for completion. Missing initialization, changed profile or
missing command does not count. Each first result and full diagnostic vector
will be retained before any assertion terminates.

## Explicit nonclaims

This direct composition does not activate the generic catalog reconciler,
which retains ACTIVATION_UNSUPPORTED; Request Cells and OCI remain separate.
It is not the complete release protocol, shared snapshot installer, cross-host
certification, or evidence to seal/merge. No execution or production change is
authorized by this fixture plan.

## Selected handoff and first prospective files (not executed)

HANDOFF-INTERFACES.md now selects consensusBinding/consensusSlotRequest and
consensusResourceToken on the canonical descriptor; lifecycle/manager consume
serviceDefinitionsOwner. The manager owns one CREATE row and immutable
intent_json={format:1,descriptor}; admission_json separately holds exact token.
START continues the same row, and lower runtime receives creationOperation
rather than writing another journal. New native fixture asserts journal-before-
reserve, token-before-dispatch, exact operation identity, one row per creation,
BOOTSTRAPPED_HELD with in_progress retained, and no serving/endpoint publication.

The first prospective files are wasm-creation-bound-native-fixture.js and
wasm-creation-bound-native.test.js. They use actual component metadata owner
outputs and real manager/adapter/runtime/driver/lifecycle to open native RF3,
then actual INIT/enroll, lifecycle publish and strong writer application.
They cover C1 and the two completion controls. Positive publication stops at
local lifecycle grant/serving; projection sinks deliberately fail if asked to
publish while held. CREATED projection is outside this native proof and returns
an explicit sink failure, never fabricated projection success.

The original plans for C2/C9/C11/C12 remain unexecuted coverage obligations.
Retained-recovery input format, supported common-root/local-grant observation
schema, and fresh-peer admission/recovery must be selected before those tests
can truthfully claim their boundaries. Missing symbols are setup gaps, not REDs.
