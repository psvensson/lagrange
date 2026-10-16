# R2 implementation interfaces: original intent and incomplete bootstrap

This is a callable mapping of approved R2, submitted for exact local review.
No new activation product, permission service or independent chooser is added.

## Durable intent before resource admission

For the direct consensus route, the canonical descriptor retains
`consensusBinding`, `consensusSlotRequest`, and, after reservation,
`consensusResourceToken`. It also retains the original replica identity and
founding set. Request Cells retain their existing path and do not acquire these
fields by inference. The canonical definition digest must match B before any
consensus resource effect; a current cache row cannot replace this definition.

The existing ServiceLifecycleManager creation operation requires its durable
operation writer/reader for this route. Add `intent_json` and
`admission_json` columns to its existing wasm_operations record. intent_json
is immutable canonical descriptor + original slot request; admission_json is
null before admission and then the exact returned token. The supplied resource
operationId is captured before delivery and is the journal operation identity;
no new generated ID on retry. Missing durable journal capability refuses this
route before reservation. No independent operation ledger is created.

Order: persist immutable intent -> reserve original B/slot request through
ServiceDefinitionsOwner -> persist returned exact token -> adapter CREATE.
Unknown at any step retains the same identity. A lost reservation response is
resolved with the same request. A different intent under the same operation ID
conflicts. A retained completed creation result is historical; it does not skip
current resource permission checks or republish a retired instance. Recovery
consumes retained intent/admission, and compares rather than substitutes a
resolver's current definition. A missing original intent cannot recover this
new route from today's cache. Legacy unbound consensus CREATE fails closed;
request-Cell and other runtime operations keep their existing semantics.

### One authoritative creation operation, not nested origin journals

ServiceLifecycleManager owns the bound CREATE origin/admission row, keyed by
consensusSlotRequest.operationId. For this v1 route CREATE preparation leaves
that row IN_PROGRESS; START/publish continues that same row and completes it
only after the publication path completes. The manager does not create a new
START authority row for the same resource. Re-entry reads original intent and
admission and resumes the phase; a historical COMPLETED row still requires
current resource permission before any new effect.

The adapter passes that retained creation-operation context into
ServiceRuntimeLifecycle. Its nested prepare/start journaling is not a second
creation origin: for this explicitly bound route it consumes the supplied
manager-owned operation and performs no independent authoritative journal
creation/transition. Existing unbound/request-Cell/OCI lifecycle journaling is
unchanged. No generated nested operation ID can replace the resource token's
operationId. Runtime events remain diagnostics. Recovery resumes the manager
origin row and lower layers consume its exact B/token; a lower-layer diagnostic
completion cannot make CREATE/activation complete. This removes duplicate origin
decisions for this route rather than introducing a new journal authority.

## Bootstrap is not lifecycle completion

The selected mapping is an explicit `BOOTSTRAPPED_HELD` result, propagated
through existing owners. It is not a new scheduler or a generic status accepted
as success. WasmServiceLifecycle.startReplica opens the admitted common root
and native transport; it may return `{started:false, bootstrapped:true,
status:'BOOTSTRAPPED_HELD', consensusBinding, consensusResourceToken}`. It does
not register a serving endpoint or enable user work. Existing initialized/native
state can be observed passively while serving remains closed.

WasmComponentDriver maps that result to BOOTSTRAPPED_HELD, not FAILED/STARTED.
ServiceRuntimeLifecycle returns it before endpoint/state publication, before
journal COMPLETED and before START_SUCCESS. ServiceLifecycleManager retains
STARTING/IN_PROGRESS rather than completing RUNNING. RuntimeServiceHandler
retains original CREATING work and reports held custody, never ACTIVE. Every
one of these consumers needs an explicit branch; accepting every nonFAILED
result would violate the contract.

The existing runtime-service reconcile owner resumes the same original
operation/token. A held result never creates a fresh resource ordinal or
idempotency key. Matching INIT is materialization within the common B; old INIT
is refused. `WasmServiceLifecycle.publishReplica(serviceId, exactToken)` requires
matching durable INIT, obtains/resolves the real PUBLISHED metadata result,
persists the local grant, and only then enables protected serving and returns
the endpoint intent. A repeated start of the original operation can perform
this continuation after matching INIT. An INIT completion and the final old
CLOSED observation wake this existing continuation; no polling daemon or
separate driver is introduced. Generic operation-port proposal remains
acceptance-only.

For genuinely pending INIT submission, the original bytes are retained;
leadership/refusal/UNKNOWN does not manufacture completion. The direct trusted
creation owner constructs INIT from B; tests may deliver retained real I bytes
as adversarial input. No arbitrary writer INIT can select B. Serving grant is
per exact admitted resource, not a blanket service-name flag.

## Effect and routing boundaries

The existing WASM lifecycle receives `serviceDefinitionsOwner`; it resolves
original B/token before new CREATE. The existing peer-address resolver uses the
stored common B's founding placement through the existing physical identity
mapping, so bootstrap does not depend on fabricated ACTIVE cache rows.
Group/physical replica/route/storage identities all include the selected
incarnation. A retained restart consumes the original journal and local grant;
ordinary semantic stop is not a crash-recovery seam.

All post-await continuations carry the captured instance object and token.
Retirement synchronously closes user admission and joins the owned outstanding
start/publication work. Endpoint/state writers receive binding/token as part of
the exact effect, not a precheck of today's cache. A selected J cannot serve
until old granted I resources close; delayed I effects may not target J's
instance-qualified identity. Final CLOSED wakes the same reconcile owner.

## Proof boundaries

The component CAS fixture injects the gateway's authoritative read adapter into
real SQLite, with real gateway/CDC SQL mutation and full WHERE evaluation. It
is not native metadata proof. Lost-response tests must observe the already
applied state before retry, not allow retry to perform the first mutation.

The first native lifecycle fixture may prove local durable grant/serving and
writer completion with real metadata owner outputs, while separately exercising
negative publication sinks during held bootstrap. It cannot claim successful
endpoint/ACTIVE projection if those actual writers were not exercised. The
C6/handler integration must use actual publication owners for that claim.

Source acceptance requires the whole mapped interaction and its evidence;
this addendum does not authorize certifying an isolated metadata or WASM fragment.
