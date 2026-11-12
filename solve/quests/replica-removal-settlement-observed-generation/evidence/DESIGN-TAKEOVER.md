# Settlement observation provenance: takeover design

Status: revision 2 for independent parent review. Parent approved the canonical
generation cutover and the single-lane/status/debt direction. Canonical cutover
is authored in `df61447d3f7cea53db77ff8be299c1ff2e9d852d`, unvalidated. The
runtime producer binding revision below is required and awaits disposition;
no broader settlement implementation has begun.
Source: `7a1d2f4e82efe1e04aefac26292205debe86c328`, whose `src` tree is
identical to integration `fa70987b2833031ffe6054a9b12ee86bbb71d52c`.
The earlier external r2 design is not available in this checkout. This is a
new reconstruction from current owners and preserved findings, not a claim to
have recovered or approved that document.

## Claim and current evidence

A removal settlement carries the exact runtime object, lifecycle owner and
full lifecycle source generation observed before the native membership await.
Its queued work, retries, status effect, local publication and late failure
cannot acquire a successor's authority. The same current generation still
reaches FAILED through the existing lifecycle CAS and leader-clear owner when
its native applied membership proves removal. An unavailable observation keeps
owned retry debt; a changed generation retires the obsolete observation.

The preserved native tests have not yet been executed for this takeover. The
lab coordinator has the exact baseline SHA and the existing classified command
`npm run test:file -- test/node/replica-removal-settlement.test.js`.
Source confirms these related gaps:

1. `settleRemovedOutsideRemoval` captures a service before membership await,
   but subsequently writes status by replica ID without source evidence.
2. `updateReplicaStatus` publishes a speculative local status and restores an
   old copy after any late error, including replacement during the await.
3. `transitionAuthoritativeReplicaGeneration` installs an admission/readback
   snapshot after awaiting authority. `registerReplicaSnapshot` captures its
   admission at installation, so the caller's earlier source revision is lost.
4. The durable lifecycle CAS already checks full identity and source generation.
   Fixing only that predicate cannot protect the preceding runtime fence, local
   snapshot installation, optimistic publication or rollback.

The claim includes the runtime producer association required by the
settlement/status/authoritative-transition interaction. Dynamic CREATE,
durable rejoin, original seed and snapshot replacement must preserve their
original admission through transport and runtime publication. It does not
certify checkpoint physical custody/inspection, CREATE operation continuation,
formation, native-role repair or complete service recovery. Those remain
required at composition, and no success here closes their obligations.

## History and comparison

The September `replica-lifecycle-durable-generation` work (merged in
`1aea11baf`, with authoritative-transition work present in `54dd2d7ce`) already
introduced full lifecycle predicates, per-replica serialization, monotonic
local revision admission, lost-answer resolution and successor/ABA controls.
The current defect is an observation that escapes those mechanisms before
re-entering them under a logical ID. Existing owner mechanisms should therefore
be extended, not replaced by another status algorithm.

Kubernetes' official API documentation describes conditional updates using the
version of the object originally read and conflict rejection when it changes:
<https://kubernetes.io/docs/reference/using-api/api-concepts/#updates-to-existing-resources>.
The applicable comparison is retaining the original observation through the
effect. Kubernetes semantics are not imported as a Lagrange contract.

## Existing surfaces and proposed wiring

| Surface | Current owner | Change |
| --- | --- | --- |
| Tracked runtime and local replica record | ReplicaHandler | Retain the producer's original immutable runtime binding; capture exact objects before queuing/awaiting and compare identity before acting or publishing. |
| Full lifecycle predicate | `replica-state-machine-lifecycle-observation.js` | Consume the existing predicate of authoritative tracked state. No cache-derived replacement or minted generation. |
| Local source revision | `captureReplicaAdmission` / `isReplicaAdmissionCurrent` | Retain original admission across authoritative observation and queued work. |
| Native membership | `readPartitionReplicaMembership` | Retain existing applied-membership/gate semantics and the exact runtime/port used for the read. |
| Status retries | `persistReplicaStatusWithRetry` | Every attempt receives the same captured observation. No reread-by-ID that changes the intended generation. |
| Durable transition | ReplicaStateMachine transition/CAS owner | Run the authoritative observation and transition through the existing per-replica lane and transition kernel. |
| Runtime retirement/effect ordering | Existing activation effect section and handler retirement lane | Extend the existing effect section to an explicitly runtime-bound FAILED transition; do not add another lock/registry. |
| Settlement retry debt | Existing `removalSettlementRereads` | Retain the observation with the debt, rather than an ID-only set that a successor inherits. |

### 1. One captured observation

Add a private helper under the ReplicaHandler status owner that captures:

- handler, exact tracked service and exact native port;
- exact lifecycle owner and its local admission revision;
- the lifecycle owner's immutable full source predicate;
- the current local replica record object.

The observation is a borrowed view of existing owners, not new durable
authority. Its predicate includes service/replica/partition/node/group identity,
birth, CREATE attempt, cleanup token, source status and lifecycle generation.
ACTIVE local status alone is insufficient. Missing canonical lifecycle evidence
is typed unavailable and keeps the existing observation-triggered continuation.

Every currentness check requires the same handler lifetime, lifecycle owner,
runtime and port, and current lifecycle admission. It also honors a real
concurrent removal. The fence runs only after these checks, immediately before
entering the bound status path. A replacement made synchronously by the fence
callback is caught by the status owner before it does any work.

### 1a. Runtime-to-row binding is produced before publication

Independent source review proved that transport identity and current logical-ID
maps do not establish runtime-to-row association. Dynamic factories register
transport and publish their bootstrap/join map before returning to the caller
that stamps CREATE admission. Snapshot replacement is an unconditional map
swap. Bootstrap registration accepts the caller's ACTIVE string. The explicit
legacy-test fallback in `getLocalReplica` can synthesize a service while
placement is absent or cleanup-owned. These are required producer repairs.

Extend the existing `localReplicas` publication record with one immutable
`runtimeBinding` value containing exact runtime, exact lifecycle owner/lifetime,
and the producer's canonical stable incarnation: `service_id`, `replica_id`,
`partition_id`, `node_id`, `group_id`, `created_at`, `create_attempt_token`.
Source status, cleanup token and `state_entered_at` remain the separately
captured lifecycle observation; they are not immutable runtime identity.
Settlement compares this retained binding with the full lifecycle predicate
before membership. It cannot create the association from a current map plus
a newly read row.

The only production `new PartitionService` constructors are in bootstrap
registration, joining publication and seed partitions. Each receives a
mandatory synchronous publication assertion from its existing producer owner.
`PartitionService.initializeUnserialized` calls it immediately before
`transport.register`; there is no current pre-registration hook to reuse.
The assertion must retain original source admission and the exact newly
constructed service, and the same association is checked before each
`partitionServices`/`localServices` publication. There is no optional unguarded
production path. If initialization fails, the factory retains custody of the
exact partially initialized runtime through its existing cleanup owner.

| Producer | Original evidence and preservation | Publication closure |
| --- | --- | --- |
| Dynamic CREATE | Before factory await, capture the full admitted lifecycle identity, CREATE admission/attempt and local revision. Pass that retained authority into the factory before initialization; stamp the exact service's admission before it can publish. | Check the same producer assertion at transport registration, bootstrap/join map write and canonical handler publication. A late factory cannot acquire a successor row by ID. |
| Durable rejoin | Restore plan carries the full canonical lifecycle predicate. `assertDurableRejoinStorageAdmission` observes and returns the exact matching row, with original local admission retained across its await. | Use that original observation and admission for initialization and `registerExistingReplica`; `trackJoinPartitionReplica` calls the same publisher instead of writing both maps. |
| Original seed | `admitReplica` already validates the original preparation/member/opening token. Extend its owned immutable output with the declared member birth, retaining preparation currentness. `serviceBirth` is not callable before opening: it requires ESTABLISHED and must keep that phase rule. | Initial transport publication is asserted by the original preparation/opening owner. Later original registration confirms the same declared birth and exact service; ACTIVE handler registration consumes that retained association, avoiding a services-row-before-formation cycle. |
| Snapshot replacement | Capture the exact predecessor, its retained binding, original lifecycle observation/admission and install operation before transfer. Carry them through the factory. An ID-only ACTIVE reread cannot authorize a replacement. | Before transport/map effects compare the expected predecessor and retained admission in the existing lifecycle/effect owner. Replacement creates a new exact-runtime binding for the same admitted incarnation and uses `replaceLocalReplicaService` with expected predecessor/binding. |

`PartitionServiceRowOwner` already brands frozen INSERT evidence with a private
WeakSet. Extend that existing brand to a WeakMap keyed by the same frozen
evidence object and carrying the exact service and lifecycle owner captured
before the first await. Its applied INSERT, original-registration publication,
and authoritative confirmation branches preserve that association. Validation
requires exact evidence/service/owner; authoritative reads may confirm the
original association but never create one for a different service. This is
evidence provenance inside the existing owner, not another ID registry.

`registerExistingReplica`, `replaceLocalReplicaService`, and `setLocalReplica`
remain the canonical handler publication surface. Idempotent registration must
mean the same binding, not merely the same ID. Status updates preserve an
existing binding only for the same exact runtime. Remove `getLocalReplica`'s
legacy-test synthesis and `getTrackedService`'s nested/runtime-shaped stand-ins;
fixtures use canonical records and actual evidence. Missing producer binding
is typed unavailable/refused with the caller's owned continuation, never a
current-row or status-string fallback.

### 2. Preserve provenance through the authoritative transition

Refactor the existing authoritative transition to enter the current per-replica
mutation lane with an admission captured before its first authoritative await.
Inside that lane:

1. Check the originally captured local admission.
2. Read through `observeAuthoritativeReplicaLifecycle`.
3. After the read, check original admission and exact supplied source evidence.
4. Install only this accepted observation through the existing in-lane recovery
   registration function. It may advance admission only for its own accepted
   installation.
5. Invoke the same transition kernel used by ordinary transitions, directly in
   the held lane. Do not nest `_applyTransition`/serialization and deadlock.
6. Resolve an unapplied/unknown result through the same authoritative readback
   rules, preserving the operation's local admission. Every post-read install
   checks it before replacing state. A changed source returns refusal and
   leaves existing owner debt intact.

The implementation exposes the already-existing transition attempt as a
private in-lane kernel consumed by both entry paths; it must not copy its CAS,
validation, leader-clear, uncertainty or timeout logic. The public ordinary
transition remains serialized once. Snapshot registration stays synchronous.

Readback of the intended destination can confirm the same operation. Foreign
incarnation, changed source, malformed/unavailable authority or loss of local
admission cannot install a newer local snapshot on the old operation's behalf.
Tests must cover ordinary REMOVING unknown-outcome handling as well as FAILED,
because the shared owner already records a revision change for uncertain
REMOVING. Any adjustment for that self-issued uncertainty must be returned by
the existing owner, never inferred by recapturing current state after a read.

### 3. Order runtime effects with retirement

A runtime-bound status effect checks the exact runtime binding in the lifecycle
lane and opens the existing effect section synchronously with that check. The
section remains held through the CAS/readback. The existing exact-handler
retirement waits for that same section. A later queued effect sees retirement
and refuses. This prevents a same-logical-generation replacement from racing a
CAS already admitted for its predecessor.

The status owner supplies the exact-runtime predicate; lifecycle serialization
owns its consumption. Ordinary lifecycle intents without a runtime observation
continue to use their declared durable source authority, not an invented
runtime requirement. ACTIVE still requires its existing exact handler binding.
No second runtime registry, scheduler, poller or retry budget is introduced.

### 4. Publish local state after durable acceptance

Remove optimistic `localReplicas` status writes and unconditional rollback from
`updateReplicaStatus`. Publish only after the lifecycle owner confirms the
transition, and only if the exact local record/runtime/lifecycle owner still
belong to that operation. This applies to the shared status writer rather than
adding a settlement-only rollback exception. A late error leaves the current
local record untouched; it cannot overwrite or delete a successor.

A source-changed settlement returns a named obsolete outcome, not SETTLED and
not a generic retryable failure. The retry wrapper does not renew its source
observation. Unavailable authority or an unapplied write for a still-current
generation retains the existing typed retry behavior and unchanged deadline.

### 5. Debt, queueing and lifetime

Replace the existing reread set with an observation-valued map. Keep one debt
per replica in the same owner. A completion may remove/replace only its own map
value. A late stale completion cannot clear a newer observation's debt. A
consensus announcement resumes a current pending observation or captures a new
current observation when none exists. The event is a wake, not membership or
generation authority. Handler shutdown releases only volatile continuation;
the durable ACTIVE/FAILED/removal owners retain their own obligations.

## Canonical generation cutover

The existing `durableRowVersion` falls back from `state_entered_at` to
`updated_at`; the historical September seal and current runtime contract
explicitly permit it. The user's current instruction forbids retained legacy
paths. The approved canonical cutover removes that fallback and accepts only
the lifecycle owner's `state_entered_at`. Missing canonical evidence returns
the existing unavailable/refused outcome, with no timestamp mint or migration
at read time. Historical evidence remains immutable; record an explicit current
supersession and update the active contract/checker expectations and relevant
fixtures. Tests-only baseline `7d2ac25fad03564c97552d8b3bb479547a749305` retains
the exact integration source tree; candidate `df61447d3f7cea53db77ff8be299c1ff2e9d852d`
uses the same test tree. Execution and independent source disposition remain
pending. Cleanup-owned receipt timestamps remain their separate canonical fact.

## Writable scope proposed

Production: `replica-removal-settlement.js`, the handler constructor's existing
reread collection initialization, `replica-handler-status-methods.js`, one
private status-observation helper, `replica-state-machine-authoritative-transition.js`,
`replica-state-machine-transition.js`, `replica-state-machine-recovery.js`,
`replica-state-machine-serialization.js`, and their public delegation in
`replica-state-machine.js` only as needed for the single lane/kernel contract.
The canonical generation cutover additionally owns
`replica-state-machine-lifecycle-observation.js`,
`src/cache/system-table-cache-authoritative-reconciliation.js`'s version
resolver, and the durable-rejoin restore planner and their direct tests.
Update the coupled runtime contract and canonical generated metadata.

The required producer counterpart expands scope to runtime publication methods,
dynamic CREATE, the three production factories, durable-rejoin storage admission,
snapshot wiring, the original preparation's admitted output, the partition row
owner's existing evidence brand, and the pre-transport assertion in partition
initialization. This agent is sole writer of the changing interaction. Parent
and checkpoint agent independently review it; checkpoint physical-custody and
inspector source remain outside this change. Before broader implementation,
parent must dispose this revision; no separate publication lock or registry is
permitted.

## Lab proof plan

All execution goes through the coordinator's lab machines. Preserve first
failures and bind receipts to the exact candidate and test bytes.

1. Execute the preserved native file on unchanged `7a1d2f4e`; distinguish the
   intended membership successor red from fixture/load failures.
2. Same native source still fences/FAILED; same-ID same/different durable
   generation successors survive; fence-boundary replacement survives; actual
   concurrent REMOVE owns its transition. Retain native lifecycle oracles.
3. Deterministic production-owner schedules: authoritative admission/readback
   paused around successor installation; queued transition and local ABA;
   unavailable then restored authority; CAS nonapply and ambiguous acknowledgement;
   late status rejection after successor publication; old/new retry debt ordering.
4. Exercise real status and CAS owners throughout. A spy that merely sees a
   requested FAILED write does not prove successor safety. Metadata transport
   substitutes are explicitly declared; native membership is real in item 2.
5. Prove the runtime effect section/retirement ordering through the existing
   real retirement owner and unchanged ACTIVE controls; verify ordinary
   authoritative transitions and uncertain REMOVING still resume.
6. Canonical-only generation controls: absent state-entry version is refused
   even when updated_at exists; valid state-entry version retains ordinary
   status/heartbeat independence. No legacy fixture path remains intentional.
7. Producer controls: stale dynamic factory before initialization and after
   CDC attachment cannot publish; durable rejoin same-ID/new-birth and changed
   attempt refuse; seed starts without a services-row dependency and binds its
   original declared birth; forged/cross-runtime registration evidence refuses;
   snapshot expected predecessor replacement survives a competing successor.
   Read-only lookup cannot synthesize ACTIVE from an unbound runtime.
8. Run the affected canonical cone, scoped guards, and independent source
   review. Broader checkpoint/F/SQLite/role/formation composition remains open
   until its own exact-source lab evidence is complete.

## Native seed physical-hosting continuation (2026-11-12)

Qualified constructor job 2826 at the frozen 597 source exposed an actual
bootstrap dependency cycle. `seed-startup-plan` acquires the handler and
releases the original participant cohorts before registering service rows.
Commit 7a49ad6b removed the former raw host-map hydration while introducing
canonical lifecycle publication. Release then had no entry in the handler's
physical registry, so the real seed repeatedly refused `hosted_partition`
without reaching registration. The native root and its original first failure
remain unchanged; this is a product producer-ordering defect, not fixture or
timeout evidence.

The independent parent review approves this bounded interaction design,
subject to independent controls/source review and exact-source lab evidence:

1. Each existing original-opening record retains one preparation-issued
   runtime publication. Queue and construction admission reuse that exact
   value. The preparation retains the original bootstrap host map, lifecycle
   holder, boot and preparation identity before construction. Only the exact
   constructed service bound to its admitted opening, consumed native SQLite
   handle and established lineage may enter physical hosting. No lookup of an
   object by ID, structurally similar capability, or new handler grants it.
2. The existing publication cell transitions ADMITTED -> HOSTING -> HOSTED.
   This synchronous commit writes only the handler's existing `localServices`
   physical registry. It creates no local replica record, SERVICES row, ACTIVE
   status, or lifecycle snapshot. HOSTING cannot answer reentrant observers;
   a failed commit becomes REFUSED even if a map write already occurred.
3. HOSTED retains exact service, bootstrap host map, handler registry, handler,
   lifecycle owner and lifetimes, plus the original preparation's currentness
   assertion. Same-capability/same-runtime hosting can be idempotent. Failed
   physical publication retains the exact object in existing resource custody;
   an ensuing failed shutdown retains that object in the existing shutdown
   debt map. No speculative rollback deletes a successor.
4. Canonical row registration must match the retained birth and consume only
   that exact hosted self-predecessor through the existing PUBLISHING ->
   PUBLISHED transition. After the transition, currentness comes from the
   canonical lifecycle binding; startup cannot renew preparation authority
   over a PUBLISHED runtime. Another owner, object, row birth or handler is
   refused. Original service rights retain their existing durable phases.
5. One shared capture/assert seam reads this same publication record and exact
   registry. It serves leader selection, INSPECT, facts, resume, recovery and
   applied-position observations. Each awaited read retains its first claim
   and port, checking after build measurement and membership observation and
   before any effect. A phase transition may make old work stale; the existing
   retry owner starts a new observation. It cannot silently adopt the new
   claim or search another startup registry.
6. The applied-position record captures its original registry, publication
   claim and port before acquiring listeners. Every listener attaches and
   detaches through that original resource owner; a reentrant replacement
   stops installation. Existing exact-slot cleanup, timer, deadline and
   single-observation cadence remain unchanged.

The tests-only extension of `seed-original-attempt-lifetime.test.js` uses its
actual preparation/catalog/native opening fixture. A timing membrane returns
the native membership owner's unchanged result after a controlled hold. The
passive observer controls isolate listener ownership and explicitly do not
claim wire authorization. The canonical handoff control uses an actual
original right, row-owner INSERT/seal, SQLite confirming read, and an explicitly
declared CREATING metadata transport seam into the existing lifecycle lane;
it proves exact runtime handoff, not replicated fresh-CREATE authorization.
Deliberate raw-map writes are hostile controls, never fixture authority or a
candidate alternative path. The unchanged single-path native seed root must
again construct, register, CREATE a useful table, INSERT and read it back.

Production scope is the existing preparation/startup publication interaction,
its handler publisher, and release consumers listed above. Shared factory
capture and generic STOP completion remain separately held pending their own
controls/source review. There is no new registry, lock, poller or timeout.

### Hosting implementation freeze and evidence ceiling (2026-11-12)

The first hosting candidate implements the ten-file boundary above after the
coordinator verified original job 2938: 131150 bytes, SHA256
`2d1e182380ebbfec754e3b14b8cd48cc1a2f4debf6b415d870dc9f919b7cb028`.
Its first divergences include duplicate preparation capabilities, missing
physical custody before registration, changed original host provenance, raw
map authority, held-read adoption, partial hosting, and canonical transfer.
The listener controls first returned UNAVAILABLE instead of STALE; their later
resource-release assertions were not measured on that original source.

The original opening record now retains one private publication/hosting
bundle. Native opening receives `PartitionService.db` as `DURABLE_STORAGE`,
and hosting requires the very handle consumed by that original opening.
`bindPartitionRuntimeLifecycle` requires the publication's exact lifecycle
owner before defining the immutable binding. `publishReplicaRuntime` requires
the exact destination before either map changes. The additional first-binding
control is frozen separately at `03643a6c02554709d42fe689c874e2d4fd041355`;
its original physical result remains owed. Generic construction fixtures have
no binding or publication authority unless they declare their exact owner and
handler before constructing the real service. This declaration is used only
by the already approved row-owner and teardown composition fixtures.

The candidate is not complete producer acceptance. These distinct findings
remain open and require their own controls and owner review:

- Existing applied-position promise reuse can return a previously OBSERVED
  answer retained by failed listener cleanup without checking the new caller's
  runtime and hosting phase. Fresh acquisition fencing does not prove reuse.
- During HOSTED-to-PUBLISHED map callbacks, the final canonical assertion
  checks exact handler, lifecycle owner, maps and stable row identity. A
  reentrant change to the original preparation or Bootstrap holder needs a
  transfer-specific retained-source control; the old HOSTED assertion also
  requires absent metadata and cannot be called unchanged after our own write.
- `distributed-transaction-release-settlement.js` performs awaited authority
  reads, native settlement and participant delivery below the outer cutover.
  The outer claim checks do not establish the lower effect's permission. Its
  retained transaction CAS/native authority and participant identity are being
  traced before proposing a required retained-claim interaction.
- Factory capture/partial-publication continuation, generic STOP/restart
  completion, seed STOP successor survival, full constructor caller closure,
  generated impact/static gates and the unchanged useful native seed journey
  remain distinct obligations. No timeout or retry policy was increased.

All execution remains on qualified lab machines. No local tests, checkers or
validators were run, and this WIP freeze grants no landing or solved claim.
