# Creation to genesis, v1 review proposal

Base: f6c3698be77043ddd19e3a2a923a6d0ac6d2a9a9. Author: principal local agent.
Status: proposed; NOT source authorization until independent content review.
This is the new bounded source unit authorized on 2026-10-16. It does not
widen wasm-writer-slots-v1's seal or amend F1. Existing source is unchanged.

## 1. Subject, owner and durable decision

ServiceDefinitionsOwner owns one new `service_instances` row per canonical
tenant-scoped logical definition ID S. The command identity owner already
derives S from tenant/name. Tenant is also checked against immutable package /
installation lineage; an arbitrary serviceId supplied by a replica is not S.
The table is registered through the existing system schema, partition and CDC
policy owners. It is not another service or registry. Installation records
remain immutable intent/history, with no activation permission implied.

Row: `service_id TEXT PRIMARY KEY`, `format INTEGER`, `state TEXT` (canonical
JSON). State comprises selection version V, selected binding or null, retiring
binding or null, resource records, and the last 16 selection decisions. No row
delete is supported. A retired subject retains V and the history frontier.
Never-created means an authoritative absent row, not a cache miss.

Binding B comprises format, tenantId, S, installationId, creationOperationId,
selectionVersion, incarnation, revisionId, definitionDigest, profileDigest,
founding peer identities. Incarnation is creator-derived once from the
immutable creation intent, domain-separated from S, transport and peer IDs.
Creation is an explicit operation, not implicit in deployment, restart or INIT.

The existing catalog request gets an optional immutable `creation_intent`
column, checked in requestInstallation's exact operation/installation replay.
It contains expected selection (V, incarnation or null), complete bounded
creation contents and their digest. Existing installations lacking it remain
non-creation intents. They cannot be retroactively decorated. An exact
operation ID with changed creation contents is an installation conflict.
No additional per-request outcome relation is added. Existing catalog history
remains under its existing retention contract and is NOT claimed bounded by
this unit. Its intent record cannot be removed while used as replay identity.

The direct consensus-WASM owner API is explicit:
`ServiceDefinitionsOwner.selectConsensusInstance(installationId)` reads that
immutable intent and authoritative currentness, then submits exactly one
guarded INSERT or UPDATE. The existing lifecycle/driver route consumes its
returned binding. The catalog installation reconciler does not call it and
keeps ACTIVATION_UNSUPPORTED. Request Cells follow their existing Binding path.
This is a callable owner API, not a claim that the generic catalog deploy CLI
now activates consensus services. Caller retains installationId before delivery.

CAS is the SQL mutation actually applied through SystemMetadataOwnerBase →
control-plane gateway → CDC → QueryEngine/partition application. UPDATE matches
S and the entire original canonical `state` string; INSERT never upserts.
Only affectedRows=1 or an exact authoritative resolution proves a win.
`success:true`, local serial gates and caches do not. One attempt and one
authoritative resolution per invocation; UNKNOWN retains original intent.
Metadata availability is a creation/recovery prerequisite, not a dependency of
deterministic service application.

## 2. Exact decisions and bounded history

V advances only when one explicit CREATE or RETIRE selection wins. Each
decision stores its expected V, winning immutable operation/digest, selected
binding (or retirement), and exact result. At most 16 complete decisions are
retained. A prior V below the frontier is HISTORY_UNAVAILABLE; it cannot create.
The monotonic V never resets even when no instance is serving.

For two valid creators at the same expected V, the single durable winner
defines a closed decision at V. The winner's exact retry returns SELECTED with
its original binding. Any other immutable request against that same decided V
returns CONFLICT with that decision's original winner. This is the losing
request's result, never the winner's SELECTED answer. No per-loser allocation
is required. Once the decision is retired, both get HISTORY_UNAVAILABLE,
separately from an observation of today's selected/serving state. Old history
never means NOT_COMMITTED. A changed intent is rejected by immutable catalog
matching before resolution. Future/gapped expected V is a pre-admission
INVALID_EXPECTED_STATE, never queued to become valid automatically.

At most a selected instance and its retiring predecessor exist in this record.
Another selection while a predecessor's resources remain outstanding returns
TRANSITION_HELD (pre-admission, not a committed creation outcome). This avoids
an unbounded chain of retiring instances. Retry preserves the same intent.
Lost SELECT replies resolve the retained decision; no new incarnation is
generated. A decision can age out only after at least 16 later selections;
outstanding predecessor resources block such advancement, not history erasure.

## 3. Selection, serving and resource custody

Selection is not revocation. On selecting J, I becomes RETIRING, new I resource
admissions and publication grants close, but already granted I serving may
continue until the owning resources actually close. J cannot open protected
serving or be published current until every I obligation is discharged.
An isolated I quorum therefore holds J; no timeout or metadata pointer proves
I stopped. This is deliberately conservative overlap policy, not a lease.

Resource records are owned consequences within this same creation state, not
permits supplied by a new service. Each record binds B, physical replicaId,
nodeId, data-directory identity, boot incarnation, lifecycle attempt ordinal
and phase: ADMITTED, PUBLISHED, RELEASING, CLOSED. Before any artifact/storage/
port/create/start await, RuntimeServiceHandler registers the original attempt
with ServiceDefinitionsOwner by CAS. Repeated delivery joins that record.
Unknown admission never permits an untracked effect. No second live attempt
for one physical replica; no resource admission for a retired binding.

The serving grant is a CAS of that exact ADMITTED record to PUBLISHED while B
is selected and its predecessor is fully CLOSED. It is issued only after
genesis/open checks and before enabling user dispatch or publishing ACTIVE.
PUBLISHED is an obligation and permission for the specified object, not proof
that the subsequent publication already happened. A later selection may put
that object into retirement; it retains its already-granted serving authority
until exact shutdown. Thus a delayed granted effect cannot escape the retirement
inventory. It cannot create new permission for J or override J's publication.
If selection wins before the grant CAS, grant is refused and the object cleans
up without becoming serving. This gives an exact ordering, not check/await/check.

The authoritative active projection includes binding and resource attempt.
Services/endpoint rows and operation outcomes carry that identity. Consumers
resolve publication against the corresponding PUBLISHED resource, not selected
J alone. Physical replica IDs/routes are instance-qualified through the existing
runtime-service identity owner; late I writes cannot target J's row. Cached
discovery can be stale; dispatch still reaches an I object with I's identity,
not J. Local stop closes user admission synchronously and marks RELEASING before
awaiting the existing exact handler retirement and consensus/KV/database close.

Only that local lifecycle owner may acknowledge CLOSED, after all owned create,
start and publication continuations have settled and all acquired resources
are released. It writes the exact resource identity into the same CAS record.
An exception preserves RELEASING and the existing reconcile continuation.
No release on an empty map, expired heartbeat, failed RPC or higher node epoch.
Old cleanup removes only its captured handler/object/route; never serviceId's
newest object. CLOSED cannot become ADMITTED under the same attempt ordinal.

After a process crash, the existing data-directory process owner must first
exclude the previous process on that same retained directory. A higher boot
counter alone is insufficient. Startup reconstructs original resource records
and original definitions before admitting new work. It may close a prior-boot
record only with that exact retained directory ownership and completed local
resource cleanup, or resume the same selected B under a new attempt after that
release. An unavailable/lost directory cannot manufacture retirement proof:
activation stays HELD until its existing lifecycle/storage owner resolves it.
No copied directory or other node may acknowledge another node's live resource.

## 4. Transition table and asynchronous consumers

| Trigger | Authoritative guard | Durable effect / remaining owner |
| --- | --- | --- |
| First CREATE | immutable installation intent; absent S | INSERT V=1 selected B; no serving claim |
| Recreate | exact V/B; no earlier retiring resources | CAS select J, retain I resource obligations; freeze new I grants |
| RETIRE | exact V/B | select null, retain I until CLOSED; never delete name fence |
| Exact creation retry | retained decision and immutable contents | historical result; separately current permission, no activation effect |
| Concurrent loser | closed decision at expected V | own CONFLICT against original winner; no replacement |
| Begin replica | original B selected, fixed peer/placement identity | CAS resource ADMITTED; lifecycle owns all following effects |
| Start/prepare completion | same local object/attempt; genesis matches | no identity choice; publish grant still required |
| Grant serving | B selected, predecessor closed, exact ADMITTED resource | CAS PUBLISHED; existing runtime owner enables/publishes exact object |
| Superseded before grant | B no longer selected | refuse grant, drain exact attempt, retain cleanup obligation |
| Stop/failed create | captured resource and settled continuations | close admission; exact cleanup; CAS CLOSED only after completion |
| Recover CREATE/START | operation's original B/attempt from journal | resolve authority; never substitute current cached definition |
| Restart retained B | directory ownership + original current B | validate file root; preserve outcomes; new local attempt only |

The binding is carried by value through command/installation, currentness,
planner descriptor, runtime CREATE, ServiceLifecycleManager journal/context,
RuntimeServiceAdapter, ServiceRuntimeLifecycle, WasmComponentDriver and
WasmServiceLifecycle. Missing original binding on historical consensus CREATE
is an explicit recovery refusal; no guess from today's cache. Non-consensus
routes do not acquire this protocol accidentally. Every recovery resolver must
return the original definition digest and B; CREATE rejects a different one.

Per await: artifact and port/storage work belong to ADMITTED; create/open/start
remain bootstrap-only; grant is CAS; endpoint/ACTIVE publication belongs to
PUBLISHED; shutdown waits the exact outstanding effect set before CLOSED.
The lifecycle's synchronous retired-object check forbids a stale local callback
after local release. Catalog CAS supplies cross-process custody. Neither check
alone is claimed sufficient. Existing reconciler wakes reconcile original
obligations; no new timer, scheduler or consensus driver is introduced.

## 5. Common genesis and recovery

The existing application opening transaction persists a versioned creation
root before WasmWriterState or transport opening. It contains B's semantic
identity, canonical definition/profile digest and common group/genesis identity.
INIT must match this root and only initializes writer slots; it does not choose
incarnation. All replicas receive B from the same owner result. Deterministic
committed apply checks the stored root and command bytes only.

The existing group owner uses a domain-separated groupId derived from S and
incarnation; founding peer mapping is immutable in B. Storage is scoped by that
instance through DataDirectoryManager, not reused merely by logical name.
Routing/physical replica identity is instance-qualified by the existing identity
owner; ingress's existing group/recipient checks reject old native envelopes.
Same-instance restart/replacement preserves the common group/root and uses the
existing committed membership/peer-identity admission. It does not reset writers.
This unit does not authorize fresh-peer membership or snapshot shortcuts.

Missing creation root in an existing nonempty application database is unsupported
old format, not migration. Contradictory root/log/peer identity refuses opening
without overwriting data. A fresh root is written only under an original
ADMITTED creation obligation. Bootstrap consensus can run to materialize INIT
while protected user serving remains closed; no circular need to serve first.
Writer ADMIN is restricted to matching INIT during bootstrap. ENROLL/WRITE and
ordinary ASYNC/TIMER use their existing semantics only inside the admitted
instance; old history is excluded by common group/root, not writer fields alone.

Current-format same-file and actual process restart must retain root, KV,
writer slots/outcomes and applied state together. The shared application-image/
native-import work remains a dependency. Peer-only checkpoint scrub is unchanged;
it cannot certify this application image. I-as-J must refuse before opening.
No snapshot GREEN is claimed without the existing shared installer proving the
same boundary. Its exact dependency references remain those in the prior packet.

## 6. Profile, scope and simplification

Common profile: max 9 admitted physical resources per instance, max 2 instance
bindings, 16 decision receipts; canonical intent <= 8192 bytes, binding <=4096,
resource <=1024, decision <=4608, full currentness state <=131072 bytes. Each
field has bounded UTF-8 encoding and exact safe-integer versions/ordinals;
overflow refuses new creation, never wraps. Worst constituents:
2*4096 + 18*1024 + 16*4608 = 100352; the remainder covers structural metadata.
Encoder must enforce the final 131072-byte cap as well as individual bounds;
no claim that component arithmetic alone proves it. Fixed-size close/release
updates cannot be starved by creator refusal history (none is allocated).
Catalog intent, native log, WAL, snapshots and physical files retain their owners
and are excluded. No total-database or system-memory bound is asserted.

Removes three independent choices: INIT choosing identity; recovery replacing
original definition with present cache; runtime async CREATE treating current
serviceId map as creation permission. Existing log validation and committed
application checks remain independent. No generic completion abstraction.

Source allowlist, subject to exact source review: service-definition/catalog
owner+contracts and schema registrations; existing command identity producer;
runtime-service descriptor/identity/planning/handler; lifecycle journal/recovery,
runtime adapter/driver and startup dependency wiring; WASM lifecycle/open/codec/
writer-state and DataDirectoryManager. Changes outside these named boundaries
require a documented necessary handoff. Runtime drain/operation semantics,
request Cells, OCI, partition TX1 and snapshot installer are excluded.

Native proof must use actual owner outputs. A fixture calling the new production
selection API is a real owner invocation; it is not proof of generic catalog
activation. Authoritative SQL CAS first gets component coverage, then real
QueryEngine/RF3 metadata coverage plus real WASM lifecycle/RF3 consumer coverage.
See TEST-PLAN.md. Prepared writer completion proof resumes only after genesis
proof; prototype static debt still needs correction, not waiver.

External inspiration: Kubernetes object identity/resourceVersion and finalizers
separate selection/concurrency from outstanding cleanup. This proposal uses
Lagrange's owners and does not claim Kubernetes supplies its fencing proof.
https://kubernetes.io/docs/reference/using-api/api-concepts/
https://kubernetes.io/docs/concepts/overview/working-with-objects/finalizers/
