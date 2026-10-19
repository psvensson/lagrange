# U1 nine-path production delta: independent source review

Date: 2026-10-19. Reviewer: subagent:/root/physical_lifecycle_review.

## Disposition and exact subject

**REVISE the composite source at a55ab41296faf30a4c404c56117eacbaa993c903 because its initial generic REMOVE memo guard can abandon a still-current execution entry (G1 below). APPROVE the remaining reviewed production delta in this bounded source review. No additional production repair is requested for journal-row isolation, duplicate scheduled CREATE identity, the final ID-only memo rules, tokenless cancellation, or legacy removal authorization.**

The independent registry finding I1 is **resolved and APPROVED** for the final separately supplied registry bytes at SHA256 71bc3de5e94fc2d7e5835c4e5df88d9d870cf719aef06b78189dcdaa5f857d50. That mapping is a reviewable correction after a55ab412; it was not present in the original source subject.

Root has separately moved the initial generic REMOVE guard into the existing try/finally. The research reviewer owns the source verdict for that additional change, SHA256 a8db277dc5bd861796d870478bd52397984e6e5d444a02000ad3604ff3af7f30. **This report does not certify those additional generic source bytes.** Final source reconciliation must combine this bounded approval, that separate exact correction verdict, the approved registry, and the inherited unchanged source approvals. It must not describe a55ab412 itself as a clean approved composite.

This review ran no behavioral tests, native work, mutation controls, static gate, metadata producer, commit, lab submission, or publication. It read immutable Git objects and current owner contracts, computed hashes, and wrote only this append-only evidence record. A read-only Git diff needed permission to fetch missing historical blobs; the fetch succeeded without changing source files.

### Source range

| Binding | Identity |
| --- | --- |
| Previously approved base | ac092686975dd22b4843be8df8e2e1d3663c0b7f |
| Base production tree | 10a9c9d676d5b71e1b5d522f84882c596440e26a |
| Reviewed immutable subject | a55ab41296faf30a4c404c56117eacbaa993c903 |
| Subject production tree | 3411d771e1b6a16c7ff1e5544f4e3743f18aea2b |
| Complete net production delta | Nine paths; 183 inserted lines and 23 deleted lines |
| Separately reviewed final registry | test/shards/impact-contracts.json, SHA256 71bc3de5e94fc2d7e5835c4e5df88d9d870cf719aef06b78189dcdaa5f857d50 |

The ten production commits in this range are ed6b3c5a3, d04dab162, 39b09b1f4, 588c34990, 7919e405b, 9d658acec, f07ed5311, 78b0364e6, 5ce738450, and 2ab37a85f. The review judges their final net bytes, not the correctness of every superseded intermediate implementation or test expectation.

## Authority, prior approvals, and inherited physical scope

The governing inputs were AGENTS.md, docs/steering/rules.md and router.md; architecture/runtime-contracts.md; architecture/runtime-lifecycle.md; architecture/contracts/authority-and-recovery.md; the sealed wasm-creation-genesis quest; the original U1 category report; v3, its D2/D3 and hydration addenda, the physical-current-state clarification, and their independent design verdicts. The original 55-item checklist is retained below as a source-review checklist. It is not converted into 55 executed proofs.

The relevant historical failures are the original report's F1 cancellation from nonfinal resource refusals, F2 overlapping/stopped inventory, F3 a second retirement scheduler, F4 unjoined physical retirement, F5 journal debt lost behind physical finality, and F6 historical origins discarded by one canonical memo. The later changes were checked against those mechanisms, not only against the most recent failing assertion. The existing project step-policy owner also records the earlier CL-029 and deferred-progress coverage incidents; the new dispatch predicate consumes that owner rather than copying its workflow-step table.

The handler verdict at ac092686 and physical verdict at the equivalent ed9c5ccc source both name production tree 10a9c9d676d5b71e1b5d522f84882c596440e26a. I independently confirmed that this is the actual ac092686 production tree. The unavailable local ed9c5ccc commit is not needed to assume equivalence: its preserved binding hashes all match the available ac092686 blobs.

Rebinding results:

- The physical binding contains 30 production files. All 30 match the approved base. At a55ab412, 28 remain byte-identical; only service-lifecycle-manager.js and service-lifecycle-recovery.js differ, and their complete net changes are reviewed here.
- The handler binding contains 29 production files. All 29 match the approved base. At a55ab412, 23 remain byte-identical; its six changed files are among the nine paths below.
- The physical binding file SHA256 is bb65142f9b34c4ce6ccff4c630d2b2a22ae286d1d9afbd8bfb0a80e951148a79. The handler binding file SHA256 is 32a3a3bc40a0039dd0c9e332162735313d689ae58b8668d5607cbe5b4bbff217.

The physical custody, driver post-return, runtime projection, manager state-record, exact-origin, and original-journal completion algorithms are consequently inherited unchanged. Their earlier source verdicts and evidence ceilings remain attached to them. In particular, the retained physical approval does not become executed coverage for the newly reconstructed five actual-return oracles. F1's accepted reservation-finality unit also retains its exact previous scope; this delta does not modify its resource authority or journal cancellation algorithm.

## Findings

### G1 — The original queued REMOVE guard suppresses the effect but retains the execution

Categories: admission/gating, concurrency, retry, owner interaction.

At immutable generic source lines 104–112, currentRemovalMemo requires both the current exact execution entry and the admitted local memo object. A successor can replace that memo during the queue interval while the original entry remains installed. Line 112 then returns before entering the try/finally at lines 113–170. STOP and its outcome are correctly suppressed, but the original REMOVE entry remains in the sole canonical execution map.

The next otherwise legitimate cleanup is refused or reported in progress by the existing busy gate. Already queued startup plans also lack the required release event. This violates v3 section 6's one-attempt gate lifetime: loss of memo ownership removes permission to act, but does not remove the obligation to release the still-current entry.

The existing releaseExecution function at execution lines 121–125 already checks the exact installed object, deletes only that entry, and then considers retained queued work. No second registry, new generation scalar, physical-permission inference, or retry loop is needed. The narrow approved contract interpretation is to make this current-entry/memo-mismatch exit pass through the existing finally. The new source bytes implementing that interpretation belong to the separate reviewer named above.

The prior u1-superseded-remove-gate-independent-review-20261019.md remains the detailed independent oracle verdict. Its current handler witnesses require both an empty gate after queued supersession and subsequent legitimate successor cleanup. Their direct memo replacement and scripted lifecycle seams prove handler execution custody; they do not prove that a production physical successor may be installed at every such point. The already-started STOP sibling reaches the existing finally, so its empty-gate assertion is a distinct nonregression check.

### I1 — The new legacy authority interaction was absent from the impact registry

Category: owner interaction, checklist item O10.

At a55ab412, the existing runtime-service-bound-creation-route contract contains the handler and generic execution owners but no guarded-runtime-service-handler.js, runtime-service-handler-setup.js, or replica-dispatch-service.js. Its pair consequently does not describe the new dispatch/repository authority read or name the strict-dispatch witness. This is a contract/registry/proof alignment defect even though the source behavior below is sound within its declared seam.

**Resolved: APPROVE the exact final registry at SHA256 71bc3de5e94fc2d7e5835c4e5df88d9d870cf719aef06b78189dcdaa5f857d50.** I read its complete diff and independently rehashed and parsed the final bytes. It retains 67 contracts and has 39 coupled pairs. The existing contract now includes the six actual bootstrap/dispatch/repository producer paths and the strict dispatch test. The existing bound pair keeps its two sides and adds the bootstrap consumers and handler witness. One additional two-sided pair, runtime-service-legacy-removal-authority, references that same contract:

| Side | Actual participants |
| --- | --- |
| Consumer | RuntimeServiceHandler, generic replica execution, creation execution gate, guarded runtime handler setup, runtime handler setup |
| Producer | ReplicaDispatchService, ReplicaOperationRepository, repository read methods, repository visibility methods |

The repository class is material because it defines the strict query options and composes the read/visibility methods. The visibility-methods producer is material because read-methods lines 425–438 delegate failed-read absence classification to its buildUnconfirmedAbsenceVisibilityOutcome at lines 527–551. The bootstrap participants actually forward the constructed dispatch service; they are not documentary aliases.

The final description distinguishes queued STOP admission from late STOP-result memo settlement. It does not claim that a handler check cancels a STOP already admitted to a physical owner. Handler and strict-dispatch witnesses are registered with their scripted repository/consumer ceiling. There is no new semantic authority, new contract, or schema relaxation. Root reported the normal impact audit PASS separately; I did not execute that audit and do not transfer its result into this review.

## Production-family assessment

### Journal recovery: row-local failure and global observation corruption remain distinct

APPROVE manager lines 532–581 and recovery lines 98–110 against v3 section 2 and R2-E. The existing SQL owner still supplies one recoverable PENDING/IN_PROGRESS SELECT. A nonarray observation fails before any row continuation. Each captured row is bounded through captureInstanceJson. A row lacking an operation identity becomes a typed failed row instead of terminating the later row scan. The internal corruption marker returns FAILED/CORRUPT_STATE before the generic command interpreter can act; it performs no journal transition, adapter call, reservation, or physical effect.

Exact duplicate valid rows fold once through the digest owner. A repeated operation ID with divergent content fails the entire observation before any row is recovered. This is the approved distinction: two contenders for one durable primary key cannot be treated as independent failures and ordered into a winner. Timestamp and lexical ordering choose attempt order only. No timestamp authorizes a physical creation or discharges an original journal.

The unchanged restart task at inventory lines 145–179 retains one applied observation and checks handler/task lifetime after the manager and local-inspection awaits. A failed unapplied whole observation can be retried explicitly. A successful observation cannot rescan over later live memos. The handler's generic-row resolver remains the no-effect resolver, while actual generic manager recovery retains its prior interpreter.

The relevant existing witnesses are the real-journal R2-E row-isolation and conflicting-duplicate cases in service-consensus-creation-intent.test.js:341–371, plus the same-source handler duplicate-observation integration cases in bound-creation-restart.integration.test.js:1105–1138. Their executed results are separate evidence. This review does not extend the trusted reader contract to arbitrary hostile JavaScript objects: after failed capture the manager still reads raw identity/timestamp properties, so accessor/proxy safety is not certified here. The architecture threat-model section explicitly separates such trusted-host hardening from genuine SQL/service/network mutation boundaries.

### Duplicate scheduled CREATE: use the retained original, without creating another admission

APPROVE execution lines 74–87. A startup or ordinary retained-memo reentry deliberately has no inbound envelope; comparing its absent envelope to a real duplicate request previously produced a false content conflict. The new branch applies only to the same CREATE effect kind, the original entry rather than its observer, an entry with a retained origin and no captured request, and an incoming captured request.

It calls the existing matchesCreationRequest owner predicate, which checks operation ID, service, canonical replica, handler node, and every supported supplied immutable origin/body/token field. It does not fill an origin from the new request. Existing direct-envelope requests still use the captured request comparison. A mismatching effect kind or a request ID occupied by another execution/observer still conflicts.

No new entry is installed by this comparison. installExecution remains the synchronous canonical admission owner. The original bound route still hydrates/resumes the journal, and the duplicate joins the already admitted attempt through existing handler routing. The change also handles an ordinary HELD memo's scheduled original reentry, not solely startup plans.

### ID-only memo projection: the final net rule still asks the physical owner

APPROVE the final rule at bound-route lines 561–567. Although commit 7919e405b appears in the history, its final missing-origin allowance restores the approved base condition; the net delta does not install a new ID-only permission rule. An ID-only services-row hint must still name the original creation selected for removal. Before physical work, the route reads the original retained journal and matches the incoming service/replica/node and supplied immutable fields at lines 524–545.

If a memo contains a full origin, it must match. If it has only an operation ID, the captured entry origin and the immediate physical CURRENT/ABSENT answer decide whether that memo may be projected. DIFFERENT and UNAVAILABLE do not grant a projection or delete a successor. The row hint is routing evidence, never a reservation token, physical grant, or proof of journal completion.

### Cancellation: a terminal journal fact does not masquerade as retired physical custody

APPROVE bound-route lines 493–501 and 548–588, under the final independently reviewed P-R12 interpretation. The handler carries the journal owner's actual answer. The exception requires an actual CANCELLED result naming the exact original creation, a completed removal decision, null tokens in both captured entry and memo, and full sameRetainedCreation equality. A generic FAILED, UNKNOWN, or absent physical observation cannot satisfy it.

The original journal's reserveForRemoval/cancelPendingCreation path remains unchanged: only the resource owner's SEALED refusal permits the original PENDING-to-CANCELLED CAS and confirming reread. A delayed admission, unresolved resource answer, or unconfirmed write preserves its original debt. The handler cannot reconstruct that finality from outcome names.

For this never-admitted exact memo, settlement retains its creation identity as permanent FAILED and removes deferRetry. It does not label that tokenless memo REMOVED. The coordinator's existing REMOVE completion disposition remains valid for the authoritatively cancelled original. A repeated REMOVE still reads terminal journal history without physical retirement; a terminal CREATE cannot revive retryable custody. Token-bearing physical completion continues to require FINAL plus ROW_COMPLETED, and current physical ownership still guards its memo projection. Startup journal debt is settled by its exact decision, independently of ownership of a current successor memo.

### Legacy authorization: original durable identity precedes speculative memo publication

APPROVE dispatch lines 47–74, handler lines 479–545, and the two bootstrap forwarding additions. The existing runtime-service identity classifier distinguishes canonical dispatched IDs and direct lifecycle IDs. Bound removal still requires a canonical dispatched target. A historical opaque generic target requires the exact original operation authority; a services row supplies only local custody evidence.

ReplicaDispatchService consumes queryAuthoritativeOperationVisibilityObservation with the original operation ID, OWNER_RPC_REQUIRED, and requireAbsenceConfirmation:true. The actual repository maps the strict mode to its existing owner read and returns either an operation with no deferral or no operation with the typed deferral. It does not simultaneously return a stale fallback operation and a deferred answer in this mode. Dispatch checks exact REMOVE type, runtime-service entity type, entity ID, replica ID, target node, and the existing incomplete-step predicate while excluding PENDING. Confirmed absence or conflicting identity refuses; missing dependency, exception, or deferred absence remains UNAVAILABLE. No CREATE permission follows from the answer.

The handler obtains a candidate with publish:false, preserving the original memo reference. A refused wrong-entity opaque request therefore cannot install caller-chosen entity identity and poison a later legitimate cleanup. After the authority await, stopped lifetime or a changed original memo refuses before any memo installation or STOP admission. With no await on the canonical branch, publication and ordinary gate admission remain in one synchronous turn. The final installExecution check still resolves any request/canonical gate contention that arose during the read.

The production binding is real: shared/control-plane-setup.js:540–556 constructs dispatch with the coordinator, seed and join adopt that control-plane service, and guarded-runtime-service-handler.js:20–35 forwards it through the existing setup at lines 178–190. The callback resolves the current service at call time. An unwired service yields the handler's explicit UNAVAILABLE path; there is no local-cache authorization fallback.

The existing repository owns the added wait. Its read-methods lines 139–178 retain the one-second retry bound from repository.js:255, its existing delay, shutdown exit, and query coalescing identity. No duration or polling loop was added. This is source evidence of budget ownership, not an executed formation-window latency claim.

### Queued generic STOP: correct local fence, separate physical lifetime

APPROVE the admitted-memo identity mechanism at generic lines 104–106, 124–130, 148–170, and 186–191, subject to G1's release correction. The existing entry retains the exact memo admitted for removal. The last synchronous check before STOP and the checks after fulfillment/rejection consult both that entry and that memo. A late result cannot overwrite a successor memo or emit the old terminal result. This adds no independent physical registry or durable truth.

Those checks do not make upper manager/runtime/driver asynchronous effects cancellable. The broader generic physical source investigation remains a separate record: some generic paths use service-keyed bookkeeping after awaits, whereas the bound physical owner captures and retires exact objects. Ordinary handler CREATE/REMOVE is serialized; an unsupported direct Map replacement cannot establish a production physical successor race. The generic handler's usual physical key is replicaId, while a retained bound descriptor uses its entity serviceId. Equality of the canonical replica name does not establish equality of those physical keys.

The separate queued Component START shutdown draft and its source proposal remain adjacent generic shutdown work. This review neither implements that repair nor certifies whole-node joining of all admitted generic work. A production same-key successor or shutdown escape requires its composed owner-ingress witness and explicit scope assessment.

## Sibling execution, settlement, and debt census

The changed guard was checked against all sibling route lifetimes, not treated as an isolated line mistake.

| Sibling | Exact settlement discipline and limit |
| --- | --- |
| Generic CREATE | generic:39–96 uses exact current entry and params identity. Its pre-try rejection denotes no admitted capability for that invocation; releasing a different valid entry would be wrong. Every entered attempt has the existing finally. |
| Bound CREATE | bound-route:266–295 checks the exact entry, then runs route/settlement under finally; the generic branch delegates to generic CREATE's own finally. No new current-entry/memo-mismatch exit was added. |
| Bound REMOVE | bound-route:611–638 checks exact lifetime after the owner await; the owning queued invocation catches thrown settlement errors and releases the current entry. An obsolete entry cannot delete a replacement. |
| Startup plans and observers | execution:108–157 and inventory:94–142 preserve one entry, bounded observer/queued markers, same-origin/effect checks, and queued reentry after exact release. A released unresolved attempt retains its original plan/journal debt. |
| Generic REMOVE | The new memo check can be false while the installed entry is still current. Its initial pre-try exit is therefore materially different from sibling obsolete-entry exits: G1. Fulfillment/rejection guards already pass through finally. |
| Shutdown | handler:742–751 closes admission/readiness before clearing maps. currentExecution rejects late handler continuations. Bound physical retirement joining is inherited from the physical owner, not inferred from those cleared maps. |

No new raw journal writer, token-copy path, second scheduler, forced retirement flag, or automatic historical-resource cleanup was introduced by this delta. The deliberate generic compatibility route remains limited by the approved hydration/classification table. Direct lifecycle consumers retain their separate existing physical obligations.

## Category-complete source checklist: all 55 items

Source aliases below name immutable a55ab412 files: manager = src/service/service-lifecycle-manager.js; recovery = src/service/service-lifecycle-recovery.js; handler = src/node/runtime-service-handler.js; execution = src/node/runtime-service-creation-execution.js; generic = src/node/runtime-service-generic-replica.js; bound-route = src/node/runtime-service-bound-creation-route.js; inventory = src/node/runtime-service-restart-inventory.js; dispatch = src/control-plane/replica-dispatch-service.js. Repository references name the files explicitly used above. The seven quest-sealed categories and the existing U1 retry/sweep checklist rows are all retained. Scope determinations and pending measurements below are not behavioral passes.

| Item | Evidence and bounded source disposition |
| --- | --- |
| A1 Precheck/enforcement | dispatch:47–74 consumes the original strict operation owner; bound-route:524–567 consumes exact journal/physical owners. Generic admittedMemo is a local execution fence, not physical authority. APPROVE within these boundaries. |
| A2 Transient/terminal | dispatch:50–74 and handler:518–529 distinguish UNAVAILABLE from CONTENT_CONFLICT; bound-route:480–501,552–588 distinguishes physical FINAL/journal completion from tokenless cancellation. No copied reservation-refusal finality list. |
| A3 Budget | Existing repository read-methods:139–178 and repository.js:255–256 own the new read's retry bound. No timer/budget value changed. Physical collaborator durations remain with their owners. |
| A4 Reason shape | Handler consumes outcome and emits error/errorCode/deferRetry at execution:99–101; recovery marker returns FAILED/CORRUPT_STATE at recovery:99–103. The repository's deferredOutcome is consumed as uncertainty, not stringified. |
| A5 Hold release | Legacy owner recovery permits explicit same-request redelivery; G1 blocks canonical release at original a55. Corrected-release behavior needs its separate source verdict and measured red/green evidence. |
| A6 Freshness | Strict read per opaque decision; handler:531 checks post-await memo/lifetime. bound-route:565 observes immediate physical state. generic:126,130,149 fences local STOP invocation/settlement. |
| A7 Message honesty | Original REMOVE fields are matched at dispatch:65–72; handler refuses before executor admission on authorization failure. Bound creation/removal outcomes preserve creation/coordinator identity at bound-route:136–160,570–608. |
| R1 Retry fires | execution:121–125 is the sole release/reconsideration path; inventory:104–122 considers already owed plans. G1 is the identified missing release, not permission for another scheduler. |
| R2 Unreadable bound | manager:536–568 fails a malformed whole observation or conflicting identity; recovery:99–103 retains row-local failure. inventory:169–179 permits one explicit retry of an unapplied failure. No unbounded inventory loop. |
| R3 Stops loud | Authorization refusal is typed at handler:526–529; bound retirement preserves the owner's reason at bound-route:480–505. Superseded handler settlement emits no obsolete executor result; G1 must still release its attempt. |
| R4 Mutual suppression | Bound wake is enqueue-only at bound-route:436–475; release invokes queued plans after deletion. The known generic leak is a one-sided abandoned gate, not a physical owner's valid long-lived hold. |
| R5 Storm ceiling | installExecution:108–118, observer:147–156, inventory queued/wake fields, and repository query coalescing remain bounded. No additional per-request observer list, timer, or recursive retry was added. |
| R6 Duplicate effects | Scheduled duplicate CREATE checks retained origin at execution:81–85 without installation; journal resolution uses original CAS/reread. Generic STOP has one exact admitted entry; source-only controls remain required. |
| R7 Reset semantics | No attempt counter or transport-ACK reset changes. Permanent tokenless cancellation removes only the original memo's deferRetry at bound-route:582–585; shutdown remains irreversible. |
| T1 ACK versus processed | New legacy authorization reads repository observations, not transport ACKs. Prompt CREATE ACK and deferred hydration remain handler:274–297 and bound-route:208–225. No ACK is used as reservation/finality proof. |
| T2 Late responses | handler:531 protects authority-return settlement; generic:126,130,149 protects local queued/returned STOP; G1 records abandoned execution separately. This is not cancellation of admitted physical work. |
| T3 Outcome classification | Existing ERROR/errorCode/deferRetry shape is used at handler:526–529 via execution:99–101. Permanent conflict lacks retry; unavailable authority retains retry. Actual transport classification execution is outside this review. |
| T4 Undeliverable bounds | Missing dependency and repository throws become UNAVAILABLE at dispatch:49–61. The existing strict read/gateway owns delivery timeout and retry. No new unbounded router waiter was installed. |
| T5 Stub fidelity | Handler legacy witnesses explicitly script authority and lifecycle; strict-dispatch witness scripts the repository and checks exact original ID plus both read options. They are consumer proofs, not a live RPC claim. |
| P1 Live state | Changed writers are handler:535–536, generic:188–190,132–151, and bound-route:578–587. Authorization cannot publish before approval; admitted memo and immediate physical predicates protect settlement. G1 concerns gate release, not an allowed stale write. |
| P2 Restart/live | Unchanged inventory:145–179 applies once under the exact startup task and handler lifetime. Row isolation does not authorize a rescan over an applied live task. |
| P3 Enlistment | This delta adds no participant/founding registry. Duplicate CREATE and ID-only memo paths must recover the existing full intent/token; an empty or missing physical registry does not supply an admission. |
| P4 Replay idempotence | manager:561–568 deduplicates exact rows and refuses conflicting IDs. Original journal CAS/reread and exact physical retirement remain unchanged. Cancellation is a journal terminal fact, not an extra STOP effect. |
| P5 Absence | requireAbsenceConfirmation prevents failed owner read from becoming confirmed absence. Null-token memo projection requires actual original CANCELLED; physical ABSENT alone cannot complete the journal. |
| C1 Synchronous gate | execution:108–118 installs before deferred callbacks. Async legacy read is followed by the same atomic admission; it is not substituted for the gate. |
| C2 Post-await | handler:531, bound-route:214,243,257,535–536,620, and generic:130,149 consume exact lifetime/currentness. Broader generic physical post-await mutation remains outside the handler consumer proof. |
| C3 Single winner | Existing original journal/resource owners still supply CAS winners. execution:81–85 merely recognizes an identical already-admitted CREATE. No read ordering or caller memo chooses a durable winner. |
| C4 Callback reentrancy | handler:401–410 and bound-route:177–195,627–638 queue only installed entries; callbacks recheck exact entry. G1 identifies the remaining current-entry/memo-mismatch exit before finally. |
| C5 Key honesty | operationId owns request identity, canonical replicaId owns handler serialization, full origin owns bound physical effects. Generic serviceId versus bound entity serviceId is explicitly distinguished in the physical reachability ceiling. |
| H1 Correct red | This review executes no negative. The prior gate oracle names the retained-entry and subsequent-cleanup failures; setup/import/timeouts cannot close those controls. Old nineteen-case physical bytes are not claimed recovered. |
| H2 Binding seam | R2-E uses real journal plus malformed observation injection. Legacy handler and strict-dispatch seams are labelled scripts. The physical actual-return draft uses genuine owner return values but has its own review/execution record. |
| H3 Time/order | No fixture timer was changed by this source delta. Named queued and post-await boundaries identify ordering; they do not translate pump rounds into production latency. |
| H4 Fields | Original retained intent/token/body owner validates duplicate/create/removal identity. Strict legacy witness records original ID, strict mode, and absence confirmation. Generic successor memo omits operationId so namesCreation cannot misroute it. |
| H5 Nonvacuity | Existing legacy tests pair refused/unavailable attempts with later actual handler admission; gate witness pairs supersession with successor cleanup. P-R12 keeps admitted and unavailable branches opposite sealed cancellation. Execution remains separate. |
| H6 Live binding | No whole-node, production metadata, real RPC, abrupt-process, or actual generic same-key successor claim is made here. Source hashes and component/native test claims remain distinct. |
| O1 Semantic owner | Original journal owns creation/debt; resource owner owns reservation/finality; physical owner owns CURRENT; handler entry owns one attempt; dispatch consumes operation-repository identity for opaque cleanup. |
| O2 Typed boundary | CANCELLED, UNAVAILABLE, CONTENT_CONFLICT, CURRENT/ABSENT, FINAL, and ROW_COMPLETED are consumed from existing owners. admittedMemo is an exact local reference, not a second physical-origin registry. |
| O3 Paired invariant | Row isolation versus duplicate global refusal, cancellation versus unresolved admission, and stale-removal suppression versus next cleanup are paired witness obligations. Source approval does not replace their execution. |
| O4 Stale then fresh | Legacy wrong-entity/unavailable paths leave no poisoned memo; exact retry rereads authority. Generic successor progress is blocked by G1 at original source and addressed only by the separate correction. |
| O5 Pressure/backoff | Existing canonical gate and bounded observer remain intact; repository owns strict-read coalescing/backoff. No force, copied grant, or local-cache permission bypass was added. |
| O6 Wake/release | execution:121–125 and inventory:104–122 retain exact release/reentry. Tokenless cancellation clears its prior deferral only with confirmed original terminal authority; unknown authority preserves retry. |
| O7 Projection authority | Services-row identity is only a hint; recoverLocalReplicaForRemoval publish:false prevents unauthorized installation. Bound projections still require original origin plus physical observation; journal debt is separate. |
| O8 Treatment fidelity | This record binds the full immutable nine-path delta and excludes the newer one-guard bytes. No test expectation or prior executed receipt is substituted for a source-only control. |
| O9 Escape hatch | Source census found no new raw journal writer, second scheduling map, policy bypass, token adoption, or physical winner heuristic. The authorized generic compatibility route retains its existing hydration table. |
| O10 Registry | I1 is approved at the final exact registry hash above: existing contract, original bound pair preserved, one additional actual two-sided legacy authority pair, actual producer methods, and honest consumer witnesses. |
| Fm1 Self-dependency | The new legacy check reads replica_operations through its existing owner; degraded participation returns typed uncertainty. It does not write around the ledger or alter metadata formation. |
| Fm2 Redrive starvation | An unavailable owner leaves the original caller's explicit retry and durable operation intact. Startup inventory still depends on its approved recovery reader, whose production activation wiring remains outside this unit. |
| Fm3 Formation clients | Pre-ready handler replies retain NOT_READY/deferRetry at inventory:41–44 and handler:449. Opaque cleanup receives retryable authority uncertainty. Production client latency is not measured here. |
| Fm4 Window arithmetic | Existing repository retry bound is one second before returning unresolved owner evidence. This is not a measurement of end-to-end formation/RPC latency or proof of a client-budget margin. |
| Fm5 No bypass | Strict owner reads, original journal CAS, physical CURRENT and FINAL remain canonical. A transient read failure cannot be solved through cache-derived authorization or cancellation. |
| S1 Clock | No periodic sweep/timer is added in the nine-file delta. Existing Date.now timestamps order/diagnose attempts and do not create physical permission or elapsed-time finality. |
| S2 Role authority | No Raft rollback, membership, or index decision changes. Existing journal/operation/resource owners authorize all effects; host/replica identity checks remain exact. |
| S3 Crash equivalence | The unchanged orderly embedding rebuilds all runtime owners; it is not a process-kill proof. The adjacent queued Component START proposal remains a separate generic shutdown obligation. |
| S4 Detection window | No detector threshold or hold timeout changes. A failed/unresolved owner result retains its named debt; time alone cannot turn it into completion. |
| S5 Sweep starvation | No independent timer recovery loop was introduced. Whole journal observation failure remains unapplied/retryable; unavailable legacy operation ownership remains caller retry, not inferred absence. |

## Exact nine-path byte bindings

These are complete-file SHA256 values computed from git show a55ab412:path, not from the mutable checkout. Line references in this record use those immutable bytes.

| Source path | SHA256 | Bytes |
| --- | --- | ---: |
| src/bootstrap/shared/guarded-runtime-service-handler.js | ddec76b0364ee296d759d1e33da47eff899bc29363607f0cd24625535b379d98 | 1905 |
| src/bootstrap/shared/runtime-service-handler-setup.js | 042bbd5141efdeff6a0b203e0840cd55da23d7d504c7ca579920ba94f73d0760 | 7342 |
| src/control-plane/replica-dispatch-service.js | 385217923b84a9981204398d25b434453d01df709aa09daf429f24c378e04352 | 6036 |
| src/node/runtime-service-bound-creation-route.js | 133b5f1e4068aa1b1352f1c6305dc547bced68ef0d3eaa151e11d50634d5b98f | 35748 |
| src/node/runtime-service-creation-execution.js | f7a68bd547d33128e410915ec4bda6c4cb944fa89df444a0a246fdd8fc96988e | 7204 |
| src/node/runtime-service-generic-replica.js | 775850400bb74828f338cc97c9a316d72d7078e13b916a5e1d2fa373d7fa0a77 | 7436 |
| src/node/runtime-service-handler.js | f18d08ab364da40004c5c432aa404bca50d991ad565df7b3f79b8c32426d4f07 | 25465 |
| src/service/service-lifecycle-manager.js | a4c724584dd066346ad58e9625127adb4728d1877726b59d33208eb23c0b6306 | 24248 |
| src/service/service-lifecycle-recovery.js | 0583978e87c2108de121a295157489e97731dea0308a69ad52993a82ee8d655b | 12065 |

## Remaining acceptance boundary

This closes the independent source-review gap for the net production changes outside G1 and approves the exact registry correction. It preserves the original rejected subject and the separate correction's independence. Root must bind the resulting final source tree and run its authorized static/generated and immutable-candidate behavioral gates. The current finite acceptance checklist, including the revised/reconstructed oracles and their intended controls, remains the acceptance authority.

Neither the earlier multi-file green reports nor this review establish the newer complete test tree. A source-reading prediction is not an executed negative control. The original nineteen-case physical checkpoint was not recovered, and its old approval cannot be transferred to new bytes. Generic physical shutdown/late-effect reachability, production A5 retained-to-applied continuation, real process crash cuts, distributed activation, U2, and whole-release certification retain their explicit separate scope. No main merge, U2 implementation, or release approval is granted by this record.
