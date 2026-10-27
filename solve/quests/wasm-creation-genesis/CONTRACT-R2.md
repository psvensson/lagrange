# Creation to genesis: revised exact owner contract

Revision of c633673f6acad0fb72364cca98507e7d19c823c6541308fdd897114f03c17a63.
The original draft/review remain in commit 688c75e0a5db943985f8ff2a93e5355560ac1aa1.
This revision answers B1–B4; it is proposed, not approved implementation.

## Identity, request construction and arbitration

ServiceDefinitionsOwner owns `service_instances(service_id TEXT PRIMARY KEY,
format INTEGER NOT NULL, state TEXT NOT NULL)`. One canonical JSON row per
tenant-scoped logical definition S; no delete/upsert. It contains a monotonic
selection version V, selected and retiring bindings, nine resource slots for
each of these at most two instances, and a ring of sixteen selection decisions.
An authoritative absent row means never-created. Retired means a retained row
with selected=null and nonzero V; it is never converted to absence.

The creation command is a NEW explicit direct-consensus operation. Its full
identity K is `{serviceDefinitionId:S, expectedVersion:V, nonce:N}`. N is a
256-bit caller-generated nonce retained before delivery; it is not a replica,
transport or connection ID. Expected V is intrinsic to K, not mutable retry
context. The canonical request is `{format, requestId:K, tenantId,
expectedIncarnation, action:CREATE|RETIRE, revisionId, definition, profile,
foundingPeers}`. Fields not applicable to RETIRE are null. Its hash binds every
field. Owner validates S using the existing tenant/name identity derivation and
immutable revision/definition lineage. K must match its semantic subject.

The caller-facing constructor in ServiceLifecycleCommandOwner captures the
complete request BEFORE calling ServiceDefinitionsOwner. Redelivery accepts the
already constructed request, never rebuilds it from today's metadata. Existing
installation/operation IDs are optional lineage references, not the whole K.
Ordinary installation replay does not invoke this operation. A deliberate new
creation obtains a new full K; UNKNOWN retains the old K and contents. No new
catalog row is allocated per creation, conflict or retry. This replaces the R1
`creation_intent` catalog extension entirely. Existing installation history and
its retention are neither altered nor required to remember losing K identities.

Durable caller custody is an explicit API precondition: persist the complete K
and canonical request before first delivery, and retain it across UNKNOWN. The
construction helper returns those bytes; it cannot certify an external caller's
storage. Internal workflow producers use their existing durable operation intent.
The native lost-response/process test uses an actual retained caller request,
not a new nonce generated after losing the answer. No restart-safe retry claim
is made for an external caller that discards its own request.

`selectConsensusInstance(request)` reads authoritative currentness and performs
one INSERT or conditional UPDATE through SystemMetadataOwnerBase → system-table
gateway → CDC → QueryEngine/partition application. UPDATE compares S and exact
canonical prior state. It never uses local runSerialized as arbitration. Only
affectedRows=1 or exact authoritative outcome resolution proves success;
success:true with zero changes does not. Existing transport retry may replay
identical mutation bytes; it cannot recompute a new expected state. After an
unknown result, one authoritative resolution returns recorded/UNKNOWN; no fresh
identity or speculative second selection.

Each successful selection closes expected V and advances to V+1, recording
{expectedV, winnerK, requestDigest, originalResult, binding}. Binding B contains
format, tenant, S, K, selectionVersion, incarnation, revision/definition/profile
digests and common founding identities. Incarnation is the domain-separated
digest of K and canonical CREATE contents, generated once, committed as B.

| Request at a decided V | Answer |
| --- | --- |
| Exact winning K and contents | Original SELECTED/RETIRED result |
| Winning K with different contents | CONTENT_CONFLICT, preserve original |
| Any other K for that V | CONFLICT referencing that V's original winner; no borrowed SELECTED |
| Repeat losing K, including altered contents | Same CONFLICT; no original successful content binding exists for that loser |
| V below retained decision frontier | HISTORY_UNAVAILABLE; never execute, never NOT_COMMITTED |
| Future/gapped V | pre-admission INVALID_EXPECTED_STATE; not a durable request outcome |

All nonwinner contents for a closed V are refused, so exact loser replay needs
no per-loser allocation. The current selected decision is always retained.
Ring eviction retires detailed answers, not the monotonic exclusion fence.
Read responses report historical outcome and fresh permission separately.
Unsupported identity-less requests fail before selection. Counters are safe
integers and exhaust closed rather than wrap. A different expected V changes K;
no receiver or retry helper is allowed to perform that change on an old request.

## Serving and the single resource inventory

Selection J freezes new I admissions/grants and retains I as predecessor until
all its resources are CLOSED. Already granted I may serve until its exact local
closure; this is why selecting J is not instantaneous revocation. No J serving
grant occurs while I has ADMITTED/PUBLISHED/RELEASING resources. A third selection
while a predecessor remains outstanding is pre-admission TRANSITION_HELD.
No assumed quorum loss, timeout or missing map can discharge I.

Each instance has nine fixed resource slots initialized to ordinal zero/CLOSED.
A slot retains its monotonic ordinal after closure; it is never deleted/reset.
One slot record includes ordinal, immutable attempt identity/body digest,
physical replica/node/directory identity and phase. New attempts may replace only
an exact CLOSED slot at ordinal g with ordinal g+1. Exact current attempt returns
its recorded state; changed body conflicts; a lower ordinal is unavailable and
cannot be readmitted. Competing different attempts for g+1 yield one winner and
a stable conflict against its retained identity. No unbounded closed list.

Within an instance, one physical replica/storage/route identity may occupy at
most one non-CLOSED slot. Reservation CAS checks all nine slots atomically and
refuses cross-slot duplication. Canonical identity comparison uses the existing
peer, route and storage owners, not caller-selected path spellings. Slot reuse
cannot reset a physical peer's committed history; changing physical membership
still requires its existing consensus admission. Add a cross-slot same-target
reservation race to the oracle; two local locks are not its proof.

The existing operation producer records original B and slot/expected ordinal in
the immutable replica-operation intent BEFORE dispatch. It calls
`reserveInstanceResource(B, slotRequest)` and persists the returned admission
token before CREATE delivery. Token = (B identity, slot, ordinal, operationId,
bodyDigest). Unknown reservation preserves this original request. Receiver
RuntimeServiceHandler only resolves/consumes it; it cannot mint an ordinal from
an old delivered CREATE. Missing token fails closed. Existing op-ledger storage
retains its existing costs, but replay safety derives from fixed slot fences,
not indefinitely retaining operation rows. Each new explicit operation uses a
new ordinal; stop/start/recovery does not silently reinterpret old CREATE.

ADMITTED is durable custody before artifact, storage, port, create or start
effects. It permits bootstrap only. After common genesis is admitted, the same
owner CAS grants PUBLISHED only while B remains selected, predecessor is closed
and exact slot remains ADMITTED. This is serving permission for that resource,
not a completion receipt for a future ACTIVE projection. The local lifecycle
durably records the grant before enabling user dispatch or publishing ACTIVE.
If selection overtakes grant, grant is refused and exact cleanup remains owed.
If grant overtakes selection, its already granted effect remains counted; J is
held until actual retirement. This explicit order also covers lost grant replies.

Services/endpoints carry B and attempt identity. Physical replica IDs/routes
are instance-qualified through runtime-service-replica-identity, so late I
publication cannot overwrite J's row. Authoritative current-serving discovery
uses PUBLISHED resource identity, not a cached selected pointer. The planner,
executor outcome consumer and service endpoint owner must consume this identity;
an unqualified ACTIVE result is insufficient. Cache is routing/projection only.

Local stop first closes new user admission synchronously. It retains and joins
all captured create/start/publication continuations, retires the exact handler,
closes native port and local handles, then durably marks its local resource
RETIRED before acknowledging CLOSED by metadata CAS. Unknown CLOSED response
keeps that same local tombstone and retries/resolves the same token. A local
failure retains RELEASING and the existing reconciliation owner; no successor
map lookup or compensating undo. CLOSED never authorizes old callbacks.

Successful CLOSED CAS and authoritative observation that it already applied
enqueue the existing runtime-service reconcile owner for the selected binding.
The services/currentness cache notification is a wake only. Startup scans the
same outstanding records. No new timer or daemon is introduced. Thus J is not
left dependent on an unrelated arrival after the last I resource closes.

## Recovery, local permission and process custody (B1/B4)

Common replicated root and receiver-local lifecycle permission are different.
The existing application opening transaction persists common B before writer
metadata/transport, plus a LOCAL lifecycle row binding this directory/replica
to its exact admitted resource token. A serving grant is durably copied into
that local row only after its authoritative PUBLISHED CAS. Local RETIRED is
durable before metadata CLOSED. These local fields are not replicated commands
or snapshot payload; writer apply cannot read them to choose its effect.

An intact retained voter with a recorded PUBLISHED local grant may restart the
SAME outstanding resource under exclusive ownership of the SAME retained
directory without a live metadata quorum. It preserves B, peer/log identity,
writer history and original resource ordinal. A new boot counter is diagnostic
runtime identity, not a new grant. If I had been selected for retirement while
offline, its outstanding grant still holds J. Reconciliation later closes I.
Once J is allowed to serve, I's prior local RETIRED record must already exist;
an intact I restart therefore cannot revive. New CREATE is not this recovery
path and must resolve current B/token. Prior ADMITTED-only local state permits
bootstrap recovery but no protected serving until the grant is resolved.

No local tombstone/root is inferred after storage loss. Copy/image admission
cannot import source-local permission, even if all application tables match.
Known wipe, contradictory file, missing original binding, and read unavailability
remain distinct typed refusals. A moved/replaced peer consumes existing identity
and membership owners; this unit cannot fabricate a membership grant or image.

The current process-lock wrapper releases in finally on failed shutdown; the
startup ledger releases the lock despite an earlier failed cleanup. Neither is
valid evidence of excluded old effects. Bounded prerequisite correction:
`bindDataDirectoryProcessOwner` releases only after successful shutdown; on a
failure the OS lock stays held until process death (failure is reported, not
hidden). Startup cleanup distinguishes its final exclusive-owner release from
ordinary cleanup and withholds that release if any acquired resource cleanup
failed. All ordinary cleanups are still attempted. No timeout releases it.
Failed startup/shutdown cannot be advertised as permitting another open; its
owned recovery is explicit process termination followed by ordinary retained
restart. This is not a general shutdown retry/scheduler redesign.
`awaitStartupAcquisition` awaits acquisition before checking abort, and
`acquireStartupOwner` registers before its abort assertion; preserve those
orderings so startup unwind cannot overtake an unregistered acquisition.

## Genesis, owners and selected route

Existing command identity → ServiceDefinitionsOwner selection → existing
replica-operation producer/planner → RuntimeServiceHandler → lifecycle journal
and adapter → runtime lifecycle/driver → WasmServiceLifecycle → opening is one
interaction. Every descriptor/journal retains original B/token and definition
digest. Recovery resolving today's different definition refuses; it cannot
substitute it. Historical CREATE success is not permission for new effects.

Fresh opening resolves the real production selection/resource owner, then the
existing SQLite opening transaction writes common B. WasmWriterState reads that
stored root. INIT confirms its incarnation and materializes slots only. Apply
validates committed bytes and stored root again, never a live cache or RPC.
The existing consensus group identity is domain-separated by S/incarnation;
physical peer/router/storage identity uses the same binding through existing
owners. This excludes I log/envelopes/ASYNC/TIMER from J, not just writer payloads.
Bootstrap transport/consensus and matching INIT may proceed while user serving
is closed; no requirement to serve in order to initialize.

Retained same-instance replacement keeps common root/history; new physical
membership uses the existing admission protocol. Old/nonempty unbound format
refuses opening without migration/deletion. Root/log/peer mismatch refuses
before normal service. Supported current-format restart is required. Shared
application-image/native-import remains HOLD: refs 9554f689ef1fd4560e23ed8ca4f386266539f83f
and 458076e64b4e36ac1525f93f6daa41bbf3fadc5c are historical dependencies, not a
lease or approved installer. Peer-only checkpoint scrub stays unchanged.

The selected consumer is direct consensus-WASM lifecycle composition with its
real dependencies. Generic catalog reconciler retains ACTIVATION_UNSUPPORTED.
Node startup lacking module mirror/port allocator keeps its typed refusal;
test embedding supplies those actual existing owners and does not claim a new
catalog/deployed activation product. Request Cells and OCI are excluded.

## Bounds, source scope and proof

Common deterministic profile: 9 slots/instance, 2 retained instance bodies,
16 selection decisions, request <=8192 bytes, binding <=4096, slot <=1024,
decision <=4608, total canonical state <=131072. Structural encoding is checked
against total cap in addition to field caps. Constituents =100352 bytes, leaving
30720 for fixed structure. Refusals do not allocate. Slot closure shrinks or
replaces reserved-size fields, cannot require creator history capacity. Local
grant/retirement record <=8192 per physical replica. These are logical encoded
bounds, not catalog/log/WAL/snapshot/database/memory bounds. Versions never wrap.

Source scope is R1's exact existing owner chain, plus the necessary process-lock
wrapper and startup cleanup release handoff (`data-directory-process-owner.js`,
`entrypoint-startup-acquisition-ledger.js`, corresponding registration in
`lagrange-runtime-startup.js`). No generic propose/runtime-drain edit, new
permit service, snapshot installer, cross-product completion or scheduler.
The creation-intent catalog schema extension from R1 is REMOVED.

TEST-PLAN.md C1–C13 remains required, with these corrections: C3/C4 call explicit
K-bearing selection (no per-request installation insertion); C6 distinguishes
selection-before-grant from granted-and-still-owed I; C9 adds isolated intact
PUBLISHED restart versus durable RETIRED restart, crash on either side of local
retirement/CLOSED; C12 distinguishes retained physical replacement from new-peer
membership. Add fixed slot reuse/delayed old token, ring retirement, last-CLOSED
wake, startup cleanup failure and intact restart with metadata unavailable.
The frozen process-custody falsifier measures the existing premise; a future
conformance control must allow safe cleanup-before-release as well as held lock.
Original witness bytes remain historical. Same-profile binding and completion
mutations must fail semantically. Component SQLite, native RF3 and actual child
process evidence remain separately labelled. No source acceptance before review.
