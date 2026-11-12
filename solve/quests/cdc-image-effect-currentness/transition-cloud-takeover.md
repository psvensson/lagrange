# CDC image and retained effect transition

Status: independent source-based design review approved by `/root`; behavioral
implementation in progress, no candidate lab validation or repair acceptance.
Candidate base: `57e396e440a48dce8c17b627514ad951c916c7ee` plus the independently
reviewed maintenance source from `9f6244542272d936da0281d2e00454149c6dd41c`
(local composition `36c8baca4`). The generated import seal requires regeneration
on the lab. This note reconstructs the interaction from preserved source and
tests; it does not claim to recover the unavailable original `/tmp` R2 packet.

## Claim and first divergence

The sealed seven-case predicate remains unchanged. A source image at position P
replaces the actual table state. An occurrence remembered by a handler before
that replacement is not proof that its effect remains in the table. Conversely,
an occurrence covered by P cannot become applicable merely because a handler's
bounded deduplication entry or a tombstone expired. The current implementation
violates both directions. A third demonstrated case advances a range position
after a wall-clock authoritative-absence fence rejected its restoring member.

Preserved evidence: `evidence/observations.json`, `evidence/receipt.json`,
`test/cdc/cdc-image-effect-currentness.test.js`, and the explicitly diagnostic
`test/cdc/cdc-image-effect-design-r2-controls.test.js`. The latter's expected
defects are historical observations, not repair acceptance assertions.

Source inspection establishes an additional participating producer:
`recordCommittedOperationCdc` applies local committed events through
`applyCommittedPartitionCdcEventToCache`, dropping occurrence and source-position
metadata on that route. It must participate in the same change. Otherwise an
image can invalidate local effects with no comparable occurrence at their cache
boundary. This is not a physical reproduction of permanent stranding or SQL loss.

## Existing owners and proposed transition

The existing `SystemTableCacheSourceOrder` owns source incarnation, contiguous
published position, per-key source positions, image admission, and relisting.
It will also own whether an occurrence's effect remains in its current table.
There is no second journal, timer, retry loop, durable receipt store, or fallback.

1. **Producer identity.** The ledger's `readCdcLedgerIncarnation` supplies the
   source incarnation in the existing canonical `sourceRange`. `eventOf`
   supplies the immutable occurrence, source log index, and ordinal. Capture
   the vector and its range in the same source transaction; pass that immutable
   range to every application and buffer. This explicitly supersedes the
   earlier proposal to add an incarnation field to every event. Retained
   canonical event bytes remain unchanged. No incarnation is guessed from an
   event key, replica name, HLC, or current recipient cell. Missing range on a
   durable application is refusal, never an ordinary-event fallback.
2. **Complete-vector admission.** The already canonical `sourceRange` remains
   the admission and contiguity contract. All durable members must belong to
   its partition and incarnation, be ordered inside its bounds, and name its
   final position. Invalid input is refused before cache effects. Validation
   establishes internal consistency, not proof that an omitted position never
   existed: completeness remains the source transaction's ledger obligation.
   An individual buffered delivery still retains its producer metadata; it
   cannot advance the published range position.
3. **Actual effect, one cache owner.** Handler-local `processedEventIds` cannot
   decide a durable occurrence. The cache source-order owner first rejects a
   member covered by the installed/committed prefix of the same incarnation.
   For members above that prefix it consumes the per-key applied source position
   already recorded by the cache. A receipt from another image, another source
   incarnation, or a row changed through a different authority cannot suppress
   application. Bounded per-key retention may lose a performance shortcut; it
   may not turn a covered prefix into an applicable event.
4. **Image replacement.** An admitted complete image replaces the table and
   the source-order basis in one synchronous owner span. Reset only that table's
   per-key effect positions and obsolete absence fences, including absent keys
   and equal rows. Preserve unrelated tables. The new prefix rejects old
   occurrences independently of per-key or handler retention. Stage a whole
   detached table and publish its table map, key/absence basis, and prefix
   before any observer notification. Thus reentrant readers see the complete
   publication. Reentrant writers run after publication; if they replace its
   basis they invalidate the captured effect context. No effect receipt may
   escape a partially installed table.
5. **External reconciliation.** An authoritative row repair or complete absence
   observation without a comparable source position cannot leave the old source
   prefix certified after replacing its effects. The cache owner invalidates
   the affected source basis and schedules the existing relister. Pre-read
   mutation snapshots bind to the current image generation so a read begun
   before replacement cannot reinstall old absence afterwards. Source-image
   observation publication must preserve the exact installed token instead of
   invalidating its own result. This is typed read-model unavailability with an
   owned continuation, not a fabricated current position.
6. **Commit and response.** `applyCommittedCdcRange` advances the contiguous
   position only when every uncovered member has an actual accepted or
   source-position-covered effect in the current image. Typed APPLIED/COVERED
   results must carry the exact cell and effect-generation context throughout
   the vector. A mere callback return,
   handled event, HLC comparison, or remembered delivery is insufficient. A
   rejected/failed application leaves the source GAP and owns a re-list; native
   after-commit group receipt semantics remain distinct from member cache
   currency. A committed group may acknowledge while a member owes an image
   only because that member retains the actual source-cell relist continuation,
   including exceptions and listener failures. Transient wait identity binds
   the complete range to the unchanged canonical event digest, so two ledger
   incarnations cannot share a waiter merely because event bytes match.
7. **Local source application.** Capture the canonical vector and range inside
   the source transaction, then apply it after commit through the same cache
   source-effect boundary. Before a baseline image exists, local/provisional
   row visibility cannot publish a contiguous source position. Owed ledger
   entries and existing relisting retain recovery responsibility.

## Failure, recovery, and resource obligations

| Edge | Owner outcome and continuation |
| --- | --- |
| Durable range/incarnation missing or malformed | Canonical input refusal; no effect, no success receipt |
| Range predecessor missing or incarnation differs | Existing POSITION_GAP, no range advancement, existing relister |
| Duplicate current occurrence | Covered only by current source prefix or current per-key effect evidence |
| Image replaces a provisional effect | Table effect evidence is invalidated; retained committed replay reapplies |
| Buffered occurrence covered by image | Refused by source prefix even after ID eviction and tombstone expiry |
| Authoritative absence rejects a purported new effect | Cannot advance source position; invalidate basis and re-list |
| Mutation/read races image installation | Exact image generation rejects stale continuation; current owner re-drives |
| Mid-vector exception or reentrant write | No successful range position; cache GAP and existing re-list |
| Response lost | Ledger obligation remains; identical occurrence/range retries, no reminting |
| Handler replacement or second group | Same node cache owns applicability; no handler-specific authority |
| Per-key bound reached | Existing bounded map may evict evidence; prefix protection remains permanent until image replacement |

This proposal introduces no durable state or new retry owner. Cache clear and
source replacement clear transient effect evidence with existing source cells.
Finite-failure progress depends on the existing authoritative image producer
becoming available; refusal alone is not completion.

## Scope and proof

Source boundary: cache source-order/image/row-apply/absence/observation owners;
unchanged CDC event envelope; obligation vector and local after-commit capture; gateway
cache reconciliation; handler; committed range and provisional application.
The exact paths will be recorded with the implementation attempt. Independently
approved maintenance is composed before changing the overlapping acceptance
module. The role decoder/proposal-error work is not included.

Independent review approved a narrower authority distinction after the full
caller census: complete-table reconciliation, complete absence sweeps and
catch-up publication retain the original image generation. Generic keyed
repair always invalidates source currency and per-key evidence before any row
or tombstone mutation, and owes the existing relister. It does not mint a new
token protocol across heartbeat, runtime definition or SQL metadata suppliers.
Invalid supplied source contexts (including null, stale, foreign-table and
foreign-cache contexts) refuse before effects and never use the generic path.
The source-order owner holds the generation; no second registry is introduced.

The touched authority closure contains pre-existing local/RPC and SQL fallback
modes. `/root` authorized their canonical migration with one actual read
authority per caller: OWNER_LOCAL_ONLY remains a legitimate bootstrap domain;
OWNER_RPC_REQUIRED serves leader-confirmed repair. Full migration of the
read-contract owner and its rebalancer/query callers is a coupled follow-up
commit, with no compatibility aliases. Formation must show it introduces no
bootstrap authority cycle. It is not silently included in a seven-case claim.

Lab baseline: immutable job 2688 at
https://github.com/psvensson/lagrange-lab/issues/2688, request
`651e6d2564e3456a9d6cf83fe172aa86`, Node 22.23.2 and fresh dependencies, ran the
unchanged-source seven-case witness at `57e396e440a48dce8c17b627514ad951c916c7ee`.
Parent observed the intended P10/E11 divergence: joining/before row with
position 11 CURRENT; no-provisional and after-image controls were correct.
Full stdout SHA256 reported by coordinator:
`563499d03a1edbefc730061d2b770d299642531766a8f01789cc89a2a9af214c`.
This establishes baseline reproduction only.

Before landing, lab evidence must cover the sealed seven scenarios and their
control engagement, plus: old covered buffer after image, expired/evicted
deduplication and tombstones, equal/empty image, other handler, overlapping
ranges, same-entry siblings, delete/recreate, reused positions across source
incarnations, unknown incarnation refusal, local committed producer metadata,
authoritative absence before/after image, stale pre-read continuation,
reentrant listener, partial application failure, and unrelated-table isolation.
Run the current owner interaction cones in parallel on lab machines; regenerate
the import graph and run affected static guards there. No local tests, weakened
baselines, skipped negative controls, timeout changes, or release claim.

## Historical and external comparisons

`230cdd6811e60f798aa063acb4d92014c42fbc6d` repaired event identity so same-entry
siblings no longer collided on timestamp. Preserve that occurrence identity.
`af485777bc4ac19484a4f9b5018e0264512451bb` clarified image SUPERSEDED naming;
it did not bind retained effects to image replacement. The preserved r1
counterfactual proves that simply clearing deduplication reopens covered events.

The official etcd watch guarantees bind ordered, complete revision delivery to
an explicit revision, and progress means all earlier events were delivered.
Kubernetes list/watch starts changes after the collection resource version;
an object's own modification version is not the collection's currency proof.
These support the distinction between occurrence identity, held effects, and
published contiguous position; they are comparisons, not imported Lagrange
contracts or proof of this implementation.

- https://etcd.io/docs/v3.6/learning/api_guarantees/
- https://kubernetes.io/docs/reference/using-api/api-concepts/

## Current verification scope

Early candidate `dd3dd8b04` was transported as the exact tree
`ada08dfb` to remote `d8371e18b2e492808398e678800d5228007452fa`. Lab job 2699
passed the sealed seven-case root: all seven scenario receipts passed, including
the five baseline failures and repeated/lost-receipt stability. Coordinator
verified all custody scopes closed and the emitted artifacts were newly written.
Full log SHA256: `14c31ebe083b3d7b95474c78db3931e60c39e268a55c17d5ed2016a4904e1c6e`.
This is narrow causal evidence. Subsequent context fencing, complete-authority
suppliers, local producer tests, mixed-range refusal, exception recovery and
interaction controls require their own exact candidate lab runs and independent
review. No physical formation, general correctness, or release claim is made.

The actual ledger producer emits ordered durable members only. Mixed
durable/positionless vectors are refused before proposal; ordinary CDC and
ordinary CDC_BATCH remain their explicit separate domain. Old native mixed
fixtures inferred a tail position for their ordinary member; their historical
bytes are preserved at `57e396e4`. Their successor controls require refusal plus
valid ordinary and durable domains, preserving full-vector native membership and
immutable event digest checks.

## Diagnostic observer and waiter boundary refinement

Source review after frozen candidate `194f42d496b18e2e01f275c019f62687f6b3eb4b`
found that LoggingService.log invokes its persistence flushCallback synchronously.
A relist error or completion diagnostic could therefore throw outside the read
catch and strand the existing source gap. Root approved isolating diagnostics
inside the current per-image attempt record: retain latest original cause and
latest diagnostic error/count, use no alternate sink or new state owner, and
return through the same paced relister. The state used to select that pace is
read after the diagnostic callback, so a reentrant authority mutation still owes
a paced image. Image-slot acquire/release contains only internal Promise
resolvers, and record creation precedes acquisition; all acquired slots have
one finally release. A failed scheduling clock is not replaced by another clock.

The additional native receiver control holds actual Raft append envelopes.
It admits identical event bytes under two explicitly different ledger ranges,
releases the first native command independently, and requires that its receipt
leave the replacement ledger waiter pending. Event-only identity would join
the second admission or settle it with the old receipt. This is a custody proof
using synthetic canonical ledger input; the source SQL/ledger producer proof
remains the real native-custody and local-obligation witnesses.

The RF1 mixed refusal control now exercises valid durable receipt before
ordinary ingress because ordinary ingress deliberately invalidates source
currency. This is fixture sequencing, with both positive domains preserved;
it does not restore an ordinary-member tail position in a ranged vector.

Root additionally owns only executeOwnerLocalRead in gateway-read-strategies
for its remaining local SQL fallback deletion. Generation capture and complete
receipt minting remain in the CDC lane. The prior frozen candidate and its lab
requests remain unchanged; these controls require a new exact source transport.

## Generation and retained-evidence boundary closure

Root approved two source-review corrections after `a305c7b5`: a complete read
begun before any source cell must still bind the exact cache lifetime, and the
per-key evidence write itself must validate the original effect context. The
source-order owner now has one unique construction generation, advanced by
clear; tableGeneration uses it only while no source cell binds that table.
There is no new registry or independent token owner. The pre-cell observation
controls wait until the real gateway has issued its controlled read, then keep
the cache unchanged, clear it, or direct reconciliation to a foreign cache.
Only unchanged same-owner empty evidence can publish.

The cache's delete-absent diagnostic occurs between tombstone mutation and
per-key evidence retention. A synchronous diagnostic observer can install an
image or apply generic authority during that span. sourceOrder.record now
refuses to write evidence if the original sourceEffectContext no longer names
the exact current cell and basis. The image control replaces a provisional
E11 deletion with P10's present row; retained committed E11 must delete it
again, rather than skip because an old context wrote proof into the new basis.
The authority control independently demonstrates that invalidation drops that
proof and retains the existing gap.

Source ranges are captured through the existing canonical JSON data predicates
and captured intrinsics. The range owns exactly sourcePartition, incarnation,
after and through; each position owns exactly logIndex and ordinal. Accessors,
proxies, inherited fields and coerced numeric positions refuse before callback
engagement. Actual direct and forward recipient controls preserve malformed
objects and restore a valid ranged native application afterward. This changes
no source event bytes, incarnation representation, ledger completeness authority
or legitimate unpositioned domain.

Caller fixture closure preserves each test's intended boundary. The two
source-side relister map models now consume full vector consistency and capture
the real source cell context before their synchronous model effects/advance;
they remain source-producer models, not real recipient-cache proof. The native
input guard observes applySourceEvent, the current durable application entry.
Complete-observation fixtures provide the actual writable cache source-order
owner at their controlled CDC read port, and direct observation seeds name its
current generation. Missing/lying observation-storage controls still reach
that deliberately failed storage boundary after genuine gateway receipt minting;
they were extracted into a responsibility-named test helper to keep the main
watermark root within its existing size limit. Forged receipts now include the
correct generation so provenance refusal remains discriminating.

All new controls and the later candidate remain unverified until exact-source
lab receipts arrive. The coordinator reported that no immutable 194f42 requests
existed; a305 transports were prepared for the pending lanes. No pending or
transported request is described as an executed test.

## Outer relister continuation and canonical source admission (reviewed design)

The fb369 candidate remains frozen with its own receipts. Root source review
found that requestRelist initialized its outcome to STOPPED and only logged an
escaping exception; finally then released the running slot without re-driving
live GAP debt. listOneImage catches ordinary read/install failures, but initial
clock access, slot acquisition/release, final observation and pacing can escape.
A bounded history search finds this exact default in the source-order extraction
at dd3dd8b04; earlier source-relist work and the shutdown-aware delay owner are
preserved in 2a373dd85 and the lifecycle cutover history. The existing inner
catch is not a proof that every outer failure is terminal.

Root approved a required relister owner record with list(request), isStopped()
and paceAfterFailure(request, cause). Production registration supplies the same
CDC integration service and its existing 500 ms shutdown-aware delay. There is
no old function compatibility path. A failed live attempt retains one latest
original cause and a failure count on the existing cell, then uses that owner's
pace. STOPPED is valid only when the owner reports actual terminal state. A
failed pace retains GAP plus FAULTED and both original/pacing causes; it neither
spins nor invents another clock. Re-registration or a genuine new gap can wake
the healed owner. Owner replacement during RUNNING preserves the registration
wake after the old exact slot releases. Diagnostic property access, callbacks
and error conversion cannot terminate recovery or prevent later observers.

The same clock-failure control exposes a neighboring acquisition obligation:
delayUntilShutdown registers a shutdown release before acquiring its timer. A
throw from setTimeout currently rejects the promise but retains that release.
Root approved removing the exact registration on that exception, preserving its
original cause. Paired normal timer completion and shutdown cancellation remain
required. This adds only cdc-integration-service-lifecycle.js to behavior scope.

Complete source images already replace a whole system table. The canonical
INITIAL_PARTITION_IDS mapping must therefore admit the table/source pair before
cell creation, effect-context capture, range application or image staging. A
second partition cannot share that whole-table basis. Unknown position reads
remain observations and may not bind a cell. The mapping remains the existing
bootstrap owner, with no new registry, guessed names or multi-source algorithm.
A direct/forward native guard and a real local committed producer preserve
valid-but-noncanonical source input and require zero cache effect/cell mutation,
then prove canonical source progress. Generic user-table fixtures are unchanged;
the participant fixture threads its existing custom partitionId into its actual
generation origin command so CDC-specific producers can name canonical sources.

A separate topology-owner gap remains: automatic split/merge criteria prohibit
system tables (947fbe658, partition-split-merge-manager-core-methods.js), but
managed-split-workflow.executeInternal uses criticalSystemPartition only for
work flags, and evaluation admits outstanding split redrives before criteria.
The execution admission checks overlap/transition state rather than the system
table prohibition. Cache refusal does not fix that producer. Root owns its
separate disposition; this repair does not silently add a split implementation.

### Exact first fb369 failures and disposition

Lab 2749 (request d291a14dd9574313b0a2857a2118d585) ran three canonical roots:
29 assertions, sealed seven-case aggregate and reconciliation ingress passed;
R2 had 22 pass and two failures. The clear/foreign pre-cell observations already
refused and retained a null authoritative watermark. Their last assertion
expected CONTRACT_INVALID, while validateObservationRequest deliberately returns
CACHE_NOT_RECONCILED for original-generation mismatch after a valid minted
receipt passes structural/provenance validation. The test now names that exact
category; refusal, watermark and no-invented-cell assertions are retained.
Original 36,495-byte log SHA256:
313bc3a4fef92a13fde302524bca9e14cd27abb8f669b6ffac51f65af97647c0.

Lab 2750 (request 41cf287f115241989c1f8816c4cd94a7) ran four native roots:
33 assertions; three roots passed. The native membership iterator-fault control
observed two iterator calls instead of the deliberate probe's one. Both rows
had applied. Source trace finds the new singleton destructuring in
system-table-cache-source-effect-application.js invokes the public iterator on
captureCdcEvents([input]); indexed vector application itself preserves members.
A repository search finds no other destructured captureCdcEvents result. The
original counter remains unchanged, and a direct singleton throwing-iterator
control is added. The existing range comparison also reads live Math.sign;
a separate captured-intrinsic control is added before its correction.
Original 3,201-byte log SHA256:
7ac167681a028258a9f7fe29f6debbf0f3aaae65fdf0fbfe04f94e1865071d6e.

These tests and fixture corrections are a separate tests-only freeze, not a
claim that the new design is implemented or physically verified. New controls
use real production registration, cache/source-order and CDC lifecycle paths;
query transport and finite clock faults are controlled. Old native receipts
and fb369 source remain immutable. All execution remains on the lab machines.

Correction to a static handoff: system-table-cache-cdc-observation.js was not
deleted. fb369 modifies that tracked file (blob
58c479f5c6e73c88c0fe9bbad133c0b69fa9d621), retaining observation/watermark ownership
while extracting source order. The coordinator confirmed the same blob in the
remote exact tree. No 21-path static request ran. All 22 changed extant paths
belong in the original freeze's scoped metrics selection.

## Remaining fb369 first failures and fixture closure

Lab 2768 on exact fb369 ran five cache roots / 97 assertions: fold (2) and
anti-entropy (67) passed; owner-revision observation, local application g/h and
paged-image d/g failed. Its complete 124,448-byte original log has SHA256
fce74fe9f9198900ac1fc4473b9feb8aa7968fbc4f76afcc967b1a07e9f732e6.
Lab 2769 ran six recovery roots / 144 assertions: DT6 (121), member (1), primary
(1), source (7), reentry (8) passed. Vector-equivalence had five passes and one
failure before the S3-6 same-entry assertion. Its complete 5,840-byte log has
SHA256 844c8de98302ac833cc688c8006bcbef671d547ea5547cebc8943ed1e4550f8b.

The observation and S3-6 fixtures omit sourceRange while supplying durable event
keys/source positions. captureSourceRange refuses them before their intended
assertions. They now carry the original controlled producer range explicitly;
provisional same-entry ordering still must preserve the later sibling and cannot
publish a contiguous position. Watermark metadata expectations remain exact.

The local g/h controls used the participant fixture's documented two-column
id/value model under the latency_groups name. The actual cache correctly rejects
it for missing group_id (the original log says so), before any notification.
Root approved moving only real-cache g/h/new i controls to the production CONFIG
schema, config_key/config_value and actual committed SQL. Ledger-only model
fixtures remain unchanged. The corrected i negative can now discriminate a
valid payload from a noncanonical local source; its first tests-only version at
44708 still has the known schema obstacle and cannot establish that boundary.

The paged-image fixture manually builds its shipping events from committed SQL
changes, but omitted the row's origin HLC. entryPositionOf therefore returns null
and the typed effect refuses before merge; subsequent ranges correctly retain
GAP. The actual partition CDC producer always stamps the command's original HLC.
This fixture now calls its existing stampOriginHlc method with that exact command
stamp. No current-time stamp, invented position, loosened convergence assertion
or change to production admission is introduced. Native images/SQL remain real;
the shipping lane remains a model and is not source-ledger delivery proof.

Canonical table/source caller closure changes synthetic source identities and
actual producer partition identities at their construction sites, consistently
with INITIAL_PARTITION_IDS. Helper positionRecipients now requires an explicit
table. Generic participant defaults and ordinary unpositioned CDC remain intact.
The old W9 vector65 fixture put two independently positioned CONFIG sources into
one recipient table. Root approved moving vector65/truncated64/mutated65 controls
into a separate test world with canonical config-p1. It retains the original
remote-router/native membership assertions. The independent W1/W2/W9 world keeps
its own actual SQL/ledger/incarnation chain; no image reset masks its application.
The synthetic vector's scope is still boundary membership, not delivery of its
invented occurrences from the source ledger.

These are separate fixture changes after tests-only 44708. Production remains
identical to fb369 pending the first outer-owner discriminator receipt. All
assertion changes above have a named original failure and root source approval;
no changed fixture has been executed locally.

## First continuation discriminator evidence and acquisition closure

Lab 2802 measured tests-only 44708 (source identical to fb369), three roots /
59 reported assertions, all three roots failed. The complete 37,333-byte log has
SHA256 523a38e47d1350dd81480c1c966cfd90ed2890b6da82c011c8fefd64e0a8e5ad.
Observed causal failures include escaped attempt IDLE instead of RUNNING,
clock failure IDLE instead of FAULTED, live STOPPED accepted, a replaced-owner
registration wake lost, current-listener diagnostic throws escaping, singleton
iterator and live Math.sign engagement, unknown position query minting a cell,
and noncanonical image/direct/forward source not refusing. The old local tests
still fail at their already recorded schema obstacle; they do not establish
valid local-effect admission. Corrected CONFIG producer proof remains requested.
No new behavior had been written before this original red was preserved.

Further same-owner resource inspection found two coupled boundaries. First,
delayUntilShutdown cancellation called clearTimeout before resolving its delay;
a thrown cancellation escaped markShuttingDown and could prevent the next held
wait from being released. Root approved rejecting that one delay with its exact
cause, no clearTimeout(null), and keeping the real uncleared timer visible until
its original clock fires. Controls distinguish promise rejection from actual
timer release and verify both remaining-wait progress and outer FAULTED custody.

Second, the image slot was acquired outside an internal page-retry loop. Two
unavailable sources could hold both slots during every 500 ms delay and starve
a third available source. Root approved moving slot acquisition/release to each
complete fetch attempt inside that same logical relist, releasing before its
existing retry/hint pace and preserving its record/restart counters. Added real
CDCIntegrationService controls measure two unavailable owners plus one useful
available image, maximum two held slots, and eventual recovery after healing on
the same clock. A queued-acquisition shutdown control requires exact waiter
removal and no terminal query grant. A displaced-cell control releases an old
held image while the replacement's query is held; the old attempt may not fetch
on behalf of the replacement. A live old-owner retry control preserves a newer
registration even when the old service is not terminal.

The minimal request refinement under source review is an internal isCurrent()
closure capturing the existing registered-owner record and original cell. The
production relister checks it before/after acquiring and after awaited pages;
a displaced logical attempt returns RETRY, while only actual terminal state can
return STOPPED. Source-order finally routes the existing registration wake after
releasing the old slot. This introduces no new token owner, registry or timer.

History precision: git blame of fa70987b shows the outer STOPPED default and
log-only catch already existed at system-table-cache-cdc-observation.js:662–678,
introduced in 2a373dd859. dd3dd8b04 extracted that existing behavior; it did not
introduce it. The timer acquisition/cancellation ordering dates to 1aea11baf6.
This corrects any implication in the earlier bounded search that the source
extraction was the cause of the inherited relist hole.

## 2802 causal correction checkpoint (unverified)

After the original tests-only 2802 red was retained, the source-order owner now
requires one relister record with list, isStopped and paceAfterFailure. Each
registration captures its methods and creates an identity, so an old RUNNING
attempt cannot consume the new registration wake in finally. An escaping failure
retains its exact original cause and count on the existing cell and invokes the
same service's existing shutdown-aware 500 ms pace. Invalid/live STOPPED is a
failure. A pacing failure retains GAP plus FAULTED and both raw causes; no second
clock or immediate retry is introduced. Only a new registration or genuine gap
wakes that faulted debt. Observer errors are retained without reading message or
performing conversion. The image attempt record now follows the same rule; its
existing diagnostics controls retain exact cause identity, counts, pace and
recovery, with additional hostile message/toString witnesses.

Canonical source admission now precedes source cell creation, effect capture and
image staging. INITIAL_PARTITION_IDS is frozen at its existing owner definition,
after the caller census found no writes. A retarget-attempt control preserves the
original mapping and refuses foreign effects before canonical progress. Unknown
position reads remain observational and allocate no cell. The source-order
comparison is shared by ranged group acceptance and uses captured comparison
intrinsics; same-entry fold helpers capture their intrinsics too. Singleton
capture uses indexed access, preserving the native iterator-count assertion.
A failed delay timer acquisition removes its exact shutdown registration and
rejects with the original acquisition error.

All function-only relister registrations have been removed. Native leader and
re-entry fixtures use the actual CDCIntegrationService relister over their real
source leader query, preserving held-image schedules and image-count assertions.
Unhosted tables remain explicitly unavailable until shutdown. The two map-row
recipient models and quiet-member recorder supply explicit model effects with
the real service lifecycle/clock for failure pacing; their model proof ceiling
is unchanged. Root approved these exact caller seams.

This checkpoint is an unverified partial implementation, not a green candidate.
Tests-only 95c8 remains source-identical to fb369 and is the pending physical red
for cancellation, slot fairness, queued shutdown and exact request binding. Root
has approved those designs, but their source changes are deliberately not in this
checkpoint until that original measurement is retained. The newly migrated native
fixtures depend on the upcoming slot fairness correction. No tests, syntax
checks, generators or metrics have run locally. Named interaction scope includes
the canonical mapping and lifecycle owners; generated metadata and all exact-head
gates remain owed on the lab machines.

## Target-registration and internal-pace discriminators

Root independently source-reviewed and approved only the eight production files
of a8d7e271 as the bounded 2802 core correction. This is not candidate acceptance.
The original 2834 resource red is now preserved, including the corrected CONFIG
local producer: g/h passed, and i reached a real wrong-source cache effect.
Its case33 stopped at the missing outer pace registration; it does not establish
any later cancellation assertion.

Two further concrete lifecycle interactions require their own controls before
source correction. setCacheMutationTarget previously left the old cache's
registration attached to a service whose mutable target had changed or vanished.
A held old read could then consult that replacement, and repeated retries could
run for a cache that no longer had this owner. The approved design returns an
exact-record, idempotent release from registerRelister and stores the one release
with the CDC service lifecycle. Replacement/removal detaches that exact record
before wiring a new target. RUNNING custody remains until the held attempt
unwinds; then retained GAP becomes NO_RELISTER, or a replacement registration
wakes. A stale release cannot delete a newer record. Shutdown detaches the record
and prohibits new production registrations. Independent STOPPED/isStopped
validation remains a direct required-record control.

The internal image retry also awaits delayUntilShutdown, inside the old generic
read-attempt catch. A failed clock there could be retried again, or a failed
shutdown cancellation could be converted to terminal STOPPED while its original
timer remained live. The approved correction is one pacing-fault representation
owned by source-order, carrying the exact original attempt failure record and
pacing cause. Its receiver retains FAULTED without arming another delay. A
shutdown registration release must not overwrite that fault or its retained
original timer debt. No new clock, scheduler, journal, or compatibility shape is
introduced.

New tests-only controls are frozen on the a8d7e271 production prefix for target
replacement and removal across held reads, stale release after replacement,
later valid registration progress, terminal registration refusal, and normal
internal pacing acquisition/cancellation failures. Both internal controls retain
the typed original attempt reason and raw cause, demand one clock attempt, and
distinguish promise rejection from actual timer cleanup. No local tests or
checkers were run. Resource edits awaiting this new red remain uncommitted and
are not part of that tests-only source identity.
