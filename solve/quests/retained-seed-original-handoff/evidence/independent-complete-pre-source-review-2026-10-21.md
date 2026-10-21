# Independent complete pre-source correspondence review

Reviewer: `subagent:/root/control_source_review`. Date: 2026-10-21.

**Verdict: REVISE at the two finite boundaries R1 and R2 below.** The remaining
contract choices are supportable as a bounded implementation design, subject to
their stated discriminators. Missing future green source/tests is not the reason
for this verdict. The unresolved issue is which existing owner excludes or
serializes actual effects already reached by the proposed operation. No source,
test, seal, receipt or log was changed. No tests were run by this reviewer.

This review addresses all nine sealed categories, all six harness items, all ten
interaction items, and the requested bounded adversarial-input applicability
pass. It does not introduce a new general trusted-JavaScript threat model or
require full serving/cross-host certification for this nonserving unit.

## Frozen inputs

Product is `393f411ca09449898465cc3cb7320c03fba2aba8`, source tree
`ddf32b08e93c0b617f6ec24d0d70596e2888eec5`. Evidence checkpoint is
`e69db481f37ab5633d64de7b6e7345426d9286b3`.

| Input | SHA256 |
| --- | --- |
| `pre-source-owner-correspondence-2026-10-21.md` (C) | `2136902dd5418ba26b7735219ef0dd6942a0fb27f40835ca1f12d9c829459d17` |
| `pre-source-owner-correspondence-inputs-2026-10-21.json` | `a71c000294ba7fac6bbfde909d2466c9662480ad6ff4bf8cba5ecfed25722c4c` |
| `pre-source-original-read-route-addendum-2026-10-21.md` (R) | `6b363f0764b50516b091d87f037911c91f1686341d9cc4546336e12ee4d33928` |
| `pre-source-preparation-custody-addendum-2026-10-21.md` (P) | `7b2302a7fde3134cd5be01a87657cfe168c9a6bdc9fadf96156cea010821d145` |
| `pre-source-addendum-inputs-2026-10-21.json` | `0359c4de29ff8e02fef44d3cebf0b687b71b2b40970e777ef9882884d5fff35c` |

I independently verified sizes/SHA256 for all 41 source and six support records
in the first manifest, and all 17 source and eight support records in the
additive manifest. Every source entry also matches its actual product Git blob
and byte content. Overlapping records are not counted as independent evidence.
The source notes about early routing, MG readback and raw acquisition are
correspondence inputs, not executed native witnesses.

The sealed `quest.json` at `5a04a798fee867c582a7a8c20e2eed8442baff2c`
continues to require eight predicates. Literal ACTIVE completion, complete
ESTABLISHED/all-UNUSED cold admission, no legacy grant backfill, and unchanged
v2/opening-history gates are retained. The metadata foundation refinement is
explicit, necessary to the same original allocation/activation interaction,
and potentially in scope. It is not permission for general catalog repair.
Existing builders remain the template owners: SeedRegistrationPhase's
MESSAGE_GROUPS row at `src/bootstrap/phases/seed-registration-phase.js:174-201`,
TABLES/PARTITIONS rows at `:408-478`, and built-in definition/endpoint builders
at `src/bootstrap/shared/meta-service-definition-registration.js:86-153`.
Implementation must preserve the exact admitted immutable templates, use reserved
identity/timestamps, classify contrary mutable transition state, and separate
the excluded PG-wire definition/placement path explicitly. No caller-written
approximation of these shapes is authorized by this review.

## All requested corrections in this round

### R1 — activation, leader publication and transfer need one stated exclusion span

Categories: concurrency, admission, recovery, owner interaction.

C:182 and R:164-175 require exact ACTIVE plus canonical leader publication before
TRANSFERRED. This is stronger than the current helper's returned success, and
the addendum correctly excludes diagnostic routing repair. But the actual
publication is outside the serialized ACTIVE operation:

* `src/partition/partition-service-row-owner.js:352-365` awaits
  `activateRegisteredReplica`, then separately awaits
  `publishCanonicalLeaderNodeId`.
* `src/node/replica-state-machine-registered-activation.js:281-315` finishes the
  handler-bound effect section and serialized lane before that second call.
* `src/partition/partition-service-row-owner.js:259-277` currently updates the
  PARTITIONS row by `partition_id`, without an original foundation-generation
  condition, and does not classify its affected-row result there.

An exact final read is necessary, but by itself cannot prevent an obsolete
publication from having acted after its original handler/generation was retired.
The private allocation remaining live is not automatically proof that every
member's handler and publication tenure remained current through this gap.
The proposal already requests post-await checks; it must now name the existing
owner span/claim that makes those checks effective for these two separate effects
and the subsequent durable transfer.

Finite correction: either prove the actual original-operation exclusion prevents
member retirement/replacement across this entire interval, including shutdown,
or define the bounded existing lifecycle/row-owner operation that joins ACTIVE,
exact foundation/tenure-checked publication, uncertainty readback and transfer
authorization. Do not nest-acquire the same serialized lane and deadlock it.
State which accepted in-flight effects remain obligations when shutdown closes
the operation. Freeze a paired control with retirement/closure between ACTIVE
and publication, and a late publication answer; neither may publish for a
successor or transfer the obsolete right. Ordinary callers and their convergence
work must retain their existing behavior. This is an interaction specification
request, not an instruction to redesign ordinary leader publication broadly.

### R2 — classify the finite native leader callback effects before admitting them

Categories: sweep/timer, formation, retry, recovery, owner interaction.

C:198-208 excludes ordinary writers but leaves the possible effects of retained
native role/replay work to later measurement. There is a concrete callback cut:

* `src/partition/partition-service-leader-activation-methods.js:91-110` queues
  durable leader publication, attempts rebalancer leadership, and invokes
  durable mirror resumers after becoming leader.
* `src/partition/partition-service-split-mirror-queue-methods.js:116-135` schedules
  split and merge resumers as asynchronous work, logging their failures rather
  than failing the leader activation path.
* The role/leader mutation helpers perform their own authoritative reads and
  scheduled publication retries
  (`src/partition/partition-service-metadata-mutation-helpers.js:28-34,66-127`).
* A useful existing exclusion is already present: the rebalancer dependency
  bundle requires a coordinator
  (`src/partition/partition-service-rebalancer-methods.js:23-40`), and first
  construction requires a complete bundle at `:158-166`. Avoiding
  ControlPlaneSetup can therefore prevent this construction if no other owner
  supplies that dependency.

Cold validation currently enumerates format, opening history, identities and
rights; contrary metadata transitions are described in later registration
reconciliation. A role callback can run before that later phase. The design
cannot defer discovering which of those callbacks are allowed until after they
have already acted. This does not assert a reproduced corrupt-store escape or
that a valid prospective original allocation necessarily contains mirror debt.

Finite correction: enumerate these specific callbacks and their typed original
operation admission. Prove coordinator absence for the excluded rebalancer;
bind permitted role/leader publications to the exact original identities and
their current native role; and establish why unexpected durable split/merge
transition work cannot act before the original operation rejects it. This may
be an existing-owner cold validation/exclusion invariant, rather than a new
worker policy. State its witness. Keep genuine native consensus, permitted
replay and participant release operational. Do not suppress all callbacks,
invent another scheduler, or count a logged asynchronous failure as handoff
completion. Include a deferred callback arriving after operation closure.

These are the complete blocking findings from this round. The following
checklists distinguish supporting contract correspondence from future proof.

## Admission/gating — seven items

1. Same owner state: C's complete-cohort issue, queue and native-open checks
   share a live attempt; R:112-117 carries association through gateway,
   selection, router and sink. C:223-228 separately gates real public effects.
   R1/R2 specify the remaining activation/autonomous gaps; no cache precheck
   substitutes for enforcement.
2. Outcome classes: malformed/foreign/retired/missing grant or incomplete cold
   history is ineligible HOLD; cold spent rights require independent current
   authority; unavailable current leader/read is bounded same-live deferral;
   original request deadline exhaustion stops that request while retaining
   debt; preparation close failure retains custody and may require process
   termination because the public ledger has no retry handle. Only completed
   transfer plus successful cleanup yields typed serving-deferred rejection.
   These classes must be distinct in owner constants and consumers; naming a
   generic HOLD cannot justify automatically retrying a cold spent right.
3. Budgets: preserve the actual public 30,000 ms release issuance, existing
   query attempt/result deadlines and startup cancellation. R:112,144-149
   forbids renewing permission from a read deadline. No new TTL reclamation or
   timeout increase is implied. Actual complete-operation performance remains
   a measurement, not proven by the baseline's first ENABLE.
4. Shape: C's owned Error plus immutable observation must survive
   BootstrapService failure result into startSeedNode; current
   `src/lagrange-runtime-startup.js:469-474` flattens errors and must be changed
   within this boundary. `src/entrypoint-startup-acquisition-ledger.js:57-73`
   preserves the primary or aggregates it with cleanup. A successful-looking
   union must never reach runtime binding.
5. Release: same-live missing leader/control/read facts can improve through
   current consensus/recovery owner observations within existing bounds;
   exact row/value readback resolves uncertainty without another INSERT.
   Cold spent/incomplete cohorts have no automatic continuation in this unit.
   Failed public cleanup has no claimed second unwind. These are explicit
   excluded progress cases, not silently dead registered retries.
6. Freshness: R requires selection, post-await delivery, sink and response
   lifetime/generation/leader checks. C closes the attempt synchronously before
   cleanup. R1 is the remaining publication span to specify.
7. Diagnostics: C's final observation names allocation, exact births, reserved
   ID and missing serving proof; failures must name examined member/right and
   generation. The preserved baseline distinguishes selected attempt expiry
   from the later flattened public timeout.

## Retry/re-drive — seven items

1. Existing participant recovery remains the owner; the original read uses
   QueryExecutor's existing bounded attempt owner, not a new loop. R2 must
   classify native metadata retry callbacks rather than assume they are inert.
2. Unreadable state cannot reset rights; C's SUBMITTED and R's expired-read
   rules retain debt. Source `query-executor-partition-delivery.js:171-184`
   already checks remaining attempt budget before delivery.
3. Terminal, ineligible, deadline and malformed exits require the typed classes
   in admission item 2; no silent release of native permission or resource debt.
4. The concrete SERVICES-readback cycle is addressed by R's original typed
   candidate and exact local delivery. It does not wait for public admission,
   synthetic ACTIVE, broad hydration or a membership driver. R1/R2 must keep
   activation/callback completion from becoming a new mutual dependency.
5. The finite declared cohort bounds caller work; existing query attempts and
   participant cadence bound individual retries. Before source acceptance,
   record the actual catalog size, maximum row/read/CAS calls and existing
   retry/cadence ceilings from the produced input. Do not claim a total numeric
   latency bound absent that calculation or a measured full handoff. C/R add
   no unbounded loop or replacement timer; R2 governs the existing callbacks.
6. C consumes each SERVICES/CONFIG right before its single INSERT. Exact
   same-live readback, immutable templates and CAS handle late success; another
   registration invocation cannot remint a birth. R1 covers late ACTIVE/leader
   completion and transfer.
7. ACK, noHandler, empty read or lost response cannot reset the spent right or
   deadline. R:115-117 requires actual processed read plus exact leader/generation
   and row-owner matching.

## Transport — five items

1. R converges on genuine registered local QUERY and existing owner-RPC answer
   validation. `src/transport/message-router-delivery-behaviors.js:106-155`
   wraps a real handler answer; current inbound dispatch ACKs before lookup
   (`message-router-inbound-dispatch.js:426-457`). ACK alone is not completion.
2. R:70-85,112-117 revalidates operation and exact endpoint on response. Late
   read/INSERT/activation answers retain debt rather than confer authority on
   a current-name successor; R1 completes the publication span.
3. Keep gateway/CDC/query typed success/refusal and retry-after classification;
   the context is private local metadata, not a new wire response protocol.
   Actual source review must follow the existing normalizers, including thrown
   lost INSERT answers in both row owners.
4. R explicitly forbids network, MG, redirect and overlay-reseed fallback for
   this associated local read. Missing exact handler must be unavailable within
   the existing deadline; ordinary `deliverLocal`'s remote fallback at
   `:115-123` cannot run for it.
5. Future proof must use actual registered callbacks, captureLocalDelivery,
   native SELECT and returned witness. The current baseline proves native
   release/public restart only, not this unimplemented private route.

## Sweep/timer — five items

1. C keeps API sweep and participant timers with their existing owners; R2
   accounts for the native callbacks. Baseline fault changes only the shared
   handler clock after actual ENABLE; it does not change native/node clocks.
2. Current role is independently required for reads and admitted metadata
   effects. No guessed leader, highest-term selection or new SOLO exception is
   allowed. R2 specifies role callback permission before actuation.
3. Cold child processes discard live capabilities, association maps and timers;
   durable issue/rights remain. C distinguishes the uninterrupted virgin
   issuer's first-open observation from cold identityExisted=true.
4. Expiry stops requests, not committed facts or native cleanup. C's resource
   collection and public ledger limits are explicit. Numeric total window is
   future measured evidence, with existing per-operation bounds preserved.
5. C:225 denies API sweep mutation while closed, and R breaks the readback
   dependency without starting heartbeat/CDC/dispatch. R2 is the missing finite
   autonomous callback inventory. Final callback admission must use the same
   current operation, not the readiness snapshot that scheduled it.

## Recovery/replay — five items

1. Recovered-state writers are issue/member slots, service desired/options and
   registries, private route associations, row registration evidence and
   right transitions. C/P require exact captured identities; no snapshot may
   replace a live owner. R's coalescing key includes operation/generation.
2. Explicit cases remain: uninterrupted virgin issuer, cold complete all-UNUSED,
   same-live SUBMITTED reconciliation, cold spent HOLD, ordinary serving under
   current/v2 authority. Historical no-grant directories remain ineligible.
3. Complete cohort validation precedes writable/native construction; omissions,
   duplicates, mixed history or missing members cannot become an empty success.
   Full activation counts and all rights must match the declaration, not just
   the number of loop entries that happened to be available.
4. Per-DB durable member/anchor ISSUE and monotonic rights are not cross-DB
   atomicity. Unknown commits require exact readback. Prefix adoption must
   compare original identities and refuse contrary transitions; R2 addresses
   when transition facts must be considered before autonomous work.
5. Missing/unreadable/ambiguous rows never prove completion or revive a spent
   INSERT. PREPARING, ISSUE+NEVER_OPENED and cold partial/spent cases remain
   explicit lost-progress obligations. Cleanup success requires actual close.

## Concurrency — five items

1. C's synchronous non-reentrant preparation plus P's retained slot before raw
   open is a concrete exclusion, with per-member/anchor durable backstop.
   Current lifecycle active counts are not a cohort mutex.
2. R names checks at selection/delivery/sink/response; C names abort/native/
   INSERT/activation effect checks. R1 must state the publication/transfer
   exclusion across its two actual awaits, rather than presume the ACTIVE
   lane already covers them.
3. One original issuer and monotonic submission right must govern all fresh,
   retained and retry drivers. R2 classifies role-driven work and its separate
   publication claims before it can contend with original registration.
4. P pre-mints immutable input, excludes observer/verbose/mint callbacks during
   preparation, assigns returned DB directly into a pre-owned slot and retains
   formatter/close failures. Raw constructor failure has no application handle;
   local dependency source inspection is not lab-native attestation.
5. Keys are allocation/directory, member/physical incarnation and exact handler/
   DB, not logical name. Failed exact close retains the captured object; a later
   same-name replacement cannot satisfy it. R1 must preserve this at publication.

## Formation circularity — five items

1. C's effect table enumerates MESSAGE_GROUPS, TABLES/PARTITIONS, SERVICES,
   NODES/endpoints/definitions, CONFIG and leader publication; participant
   release precedes them. Existing builders own the templates. The explicit
   reordered foundation can remain in this allocation unit; it must not import
   general defaults/epoch/size/PG-wire work. R2 accounts for effects from native
   leadership before the table-driven sequence.
2. R resolves a real absent-candidate dependency: source
   `query-executor-partition-routing-snapshot.js:171-215` uses published rows,
   and `partition-service-resolution.js:126-147` requires ACTIVE/address. The
   proposed typed original candidate, exact local transport and real leader
   answer are a bounded new input to those existing owners, not fake SERVICES
   authority or an alternate SQL reader.
3. C requires valid public bootstrap/register-service/RequestCell/admin/external
   requests to receive owned nonserving refusal, including races after awaits.
   Auth failure, no binding, 404 and unsupported APIs are excluded controls.
4. The baseline reaches ENABLE with 27,905 ms real budget remaining, then
   forces the handler clock to the issued deadline. It gives no natural
   whole-operation margin. Whole-cohort mutation/read/visibility/cleanup
   accounting must be measured separately without raising any bound.
5. R keeps native consistency and required-leader checks; row identity remains
   the handoff owner's judgment. The existing witness validator does not prove
   term/quorum/incarnation by itself. R adds exact current term/generation
   checks for its local extent and expressly makes no v2/read-index claim.

## Harness fidelity — all six items

1. Existing public baseline c6 is engaged RED at the final future handoff
   assertion, not an import/setup failure. Future controls must likewise reach
   named semantic assertions; the new private route is not already proven.
2. Baseline uses actual public startup, native origin and cold process/cleanup.
   C/R/P require actual owner seams for native INSERT/read, exact close and
   captured local delivery. Any future doubles must be separately disclosed.
3. The public issued budget is 30,000 ms; actual selected commit occurred before
   expiry and only the shared handler clock was forced afterward. No natural
   30-second expiry or caller-fixture 3-second proof is claimed. New read waits
   preserve their own existing budgets and cancellation ordering.
4. Real producers must issue grant/birth/token/boot/term and exact row values;
   mutation treatments may corrupt those facts only after positive engagement.
   No test creates a privileged object or fake ACTIVE routing row to get green.
5. The baseline positive preconditions exclude empty native DB inventory and
   zero ENABLE. Future proof must additionally exclude missing declared members,
   unpublished-route setup failures, synthetic rows and transiently skipped
   activations; strict all-member counts remain mandatory.
6. Verified current witness hashes are test
   `8647322c9fc96716abccff6bc3d272d55d1caa3770fe8dd711e6cc12470b3ab1`,
   observer `7c8adf440a7c77b5cd79d03146705223e7fdc35ac7bdcbc73061c716fbedda1c`,
   child `cfbbc9022f63e7b46ff3521ecfc49894fed4c2c1a800eabe2950b350c4993b45`.
   Baseline manifest remains
   `bef1c64489b6711b0ac43fe0d2f2542ca5a2a9d84a6640622fafe91424cd02a4`.
   Preserve the prior independent result review: locked adam-laptop/retry0,
   selected native origin 2/1, cold CREATE_OWNER_DEFERRED before flattened
   leader timeout, and 369,850 elided TAP bytes/unverified remote artifacts.
   No abstract checker or source note substitutes for candidate measurement.

## Owner interaction — all ten items

1. Allocation/lifecycle owns original permission; native history owns opening;
   retained resource slots own preparation handles; row owners own birth and
   activation; query routing selects contact; startup owns public admission;
   participant release owns OPEN. C/R/P do not let diagnostics decide these.
2. R:112-117 defines the private association, ordinary gateway token and actual
   local sink duties; C names monotonic right meanings and typed final error.
   These are supportable APIs for implementation, not already implemented
   source. R1/R2 finish the actual effect ownership boundaries.
3. Required paired witnesses combine safe public refusal with internal handoff,
   original-row uncertainty with one submission, cleanup with exact-object
   custody, and ACTIVE with preserved retirement identity. R1/R2 need their
   concrete paired schedules included before freezing treatments.
4. Same-live degraded leader/read facts may improve and re-enter existing
   owners. Old context/term must not persist as a veto or migrate to a successor.
   Cold spent rights intentionally do not gain this same-live path.
5. Existing backpressure, query attempts, handler serialization and budgets
   remain. Original contact is not a force flag, public readiness or permission
   to bypass native admission. R2 handles preexisting metadata retry pressure.
6. Real consensus/control recovery and exact authoritative readback are progress
   sources; public admission is not an internal wake. Failed cleanup/cold spent
   cases have explicitly limited progress, not an invented public retry API.
7. Handoff observations, cached projections, snapshots and overlays remain
   evidence only. R forbids copied-token authority and connected-peer synthetic
   reseeding; endpoint/NODES projection follows actual commits.
8. C's planned source-only negatives must use frozen oracles, exact candidates,
   locked same-host retry0 and positive engagement. Expected-red samples never
   enter positive certification. No such new implementation treatment is yet
   approved or measured by this design review.
9. The inspected call paths contain the documented adapter/readAuthority gap,
   remote fallback, synthetic overlay reseed and effectful broad setup. R/C
   explicitly exclude them from original operation while retaining ordinary
   behavior. R1/R2 are the remaining concrete gaps, not permission for a local
   SQL/read/retry bypass.
10. Final changed endpoints, selected witnesses and coupled impact contract
   must ship in the same product Quest with generated metadata. The current
   baseline registry cannot stand in for future route/lifecycle/sink/activation
   coverage. This is a required implementation record, not a new Quest demand.

## Bounded adversarial-input applicability

Durable grant/record and service/network input validation remains in scope.
Implementation must reject unknown schema/build, malformed/duplicate/missing
members, wrong kind/IDs/key shape, and mismatched path/peer/incarnation/boot.
Validate types before digest/string coercion. Finite bounded authentic arrays
must match the complete owner catalog; holes, duplicate aliases and extra
members cannot satisfy its cardinality. Preserve native term/index owner
representations without unsafe Number conversion; deadlines/counts/timestamps
require the existing finite/integer/sign domain, including absent, NaN/infinite,
negative, zero and unsafe numeric cases as appropriate to each owner.

Private read association cannot be obtained through a copied/prototype/wire
options object. Accepted externally supplied structures must not change meaning
between validation and use through inherited keys, boxed values or accessors;
durable JSON decoding is not permission to accept arbitrary trusted objects.
Constructed owner data should be immutable plain snapshots with exact bounded
keys/parameters; the actual token identity remains privately associated.
The proposed new route does not claim arbitrary in-process hostile JavaScript,
prototype or captured-intrinsic replacement resistance. Existing protections
and tests remain unchanged; no new global adversarial framework is required.

## Next decision

Resolve R1/R2 additively with exact owner/effect and witness correspondence.
No new research program or broad redesign is requested. Once those finite
boundaries are independently accepted, the reviewed contract can authorize
bounded implementation; the new source and next frozen witnesses will still
require their own independent review and actual positive/negative measurements.
Until then this is **REVISE**, with seals and all eight receipts unchanged.
