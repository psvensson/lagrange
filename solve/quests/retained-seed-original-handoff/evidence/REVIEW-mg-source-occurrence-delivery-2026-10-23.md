---
audience: development
documentClass: evidence
---

# Independent review: MG source occurrence and committed delivery

Date: 2026-10-23. Reviewer: `subagent:/root/retained_effects_tests`.
Verdict: **REVISE before implementation**, for the four finite corrections
below. The proposed source-occurrence, native afterCommit and durable source-debt
boundaries are appropriate. The remaining defects concern how their deadlines,
pressure, provisional release and semantic outcome validation compose.

This review covers only
`CONTRACT-mg-source-occurrence-delivery-2026-10-23.md`, SHA-256
`1e08165f6263df6712cb96dbd7d8edd5e7ff47efab4c976c0b06a9e38cea02eb`.
The worktree HEAD is `f5fb317bebc3dc074f3d8d4102122ba4ddb94ecc`; continuation
steering is the root-reconciled `240dfaaac22402f5ba8f80dbe5df520e8a450644`.
The reviewer did not author the proposed MG design or MG implementation. No MG
implementation exists in this candidate. Current observer source/test edits are
a different review scope; this reviewer authored its tests and does not approve
that source package. This review edits only this evidence file. No runtime test,
lab launch, registry generation, receipt, seal, Quest-log update or commit was
performed for this review.

`D` below means the reviewed design dossier. Source paths are relative to the
repository root. Line anchors identify inspected current bytes; the relevant MG
runtime, topology, envelope, outcome and source-delivery paths still match HEAD.
The separately modified MG committed-command admission reader belongs to the
observer and is not approval evidence for the future completion mechanism.

## Material corrections

### F1 — Name the delivery-attempt deadline owner and its clock contract

D:111-124 requires an original absolute expiry and an encompassing original
delivery deadline. There is no such end-to-end deadline in the current durable
source driver. `src/partition/partition-cdc-obligation-delivery.js:492-496`
captures a finite scan tail, `:508-520` schedules an owned retry, and `:548-562`
reschedules provisional debt. These are bounded attempts over persistent debt,
not a lifetime expiry of an accepted occurrence.

At the recipient, `src/message-group/message-group-service-cdc-replication-runtime-methods.js:446-464`
computes a relative proposal timeout from the service delivery timeout and retry
count. `src/message-group/message-group-proposal-routing.js:135-152` arms a
relative timer without checking the clock again on fulfillment; `:163-179`
treats local and forwarded attempts differently; `:195-223` has another bounded
retry owner. Topology also owns batching, retry sleeps and background retry
(`src/topology/cdc-group-propagation-delivery-methods.js:58-135,201-235,510-589`).
Topology injects `nowFn` at `cdc-group-propagation-service.js:57`; MG routing and
ProposalQueue use their own injected time source. A foreign absolute timestamp
is not automatically comparable in another injected clock domain.

Required correction: name the existing caller that creates each bounded
delivery-attempt budget, its relationship to the unchanged public operation
budget, and the exact propagation rule through subscriber readiness, source MG,
topology queueing, each retry/backoff, target transport and recipient wait. State
the clock-domain rule and which owner enforces the original caller's expiry.
Do not copy a relative duration at each hop or compare unrelated absolute clocks.
Specify that expiry retires response custody and forbids that invocation's new
submissions; already admitted native work can still commit. A later durable
source retry may create another bounded attempt for the same occurrence without
extending an old caller or expiring the durable debt. Keep existing counts,
cadence and budget values. ProposalQueue clears timers but does not itself arm or
check this deadline (`src/partition/proposal-queue.js:96-108,135-148`).

Decisive proof: distinct injected sender/recipient clock origins; time consumed
before admission, in batching and in backoff; delayed timer callbacks; late native
commit after response expiry; and a later owned retry that completes the exact
same debt. No old waiter succeeds after its own expiry, and debt survives every
response timeout. The prior retry correction explicitly preserves indefinite
debt across bounded transient attempts
(`solve/quests/replicated-transaction-decision-and-apply/evidence/review-checkpoint-cdc-retry-correction.md:135-137`).

### F2 — Bound topology custody before the recipient ProposalQueue

D:168-182 correctly forbids coalescing distinct occurrences, but the proposed
queue bound is only the recipient's ProposalQueue (D:97-104). Topology currently
coalesces repeated writes to a hot row (`src/topology/cdc-group-propagation-delivery-methods.js:479-500`).
Changing that key to source occurrence makes every write distinct. Existing
background entries accept an unbounded pending map (`:346-390`), and a traffic
gate can rearm without increasing the attempt count (`:529-532`). The immediate
path has an unbounded resolver list (`:208-235`) and removes its registry entry
before awaiting delivery (`:287-321`), permitting overlapping in-flight waves.
The 64-event flush trigger (`src/topology/cdc-group-propagation-service.js:40-42`)
is not a bound on retained bytes, all waves or waiting callers.

Required correction: define admission and accounting in the existing topology
owner for pending occurrences, attached callers, in-flight waves and retained
payload bytes, using an existing applicable bound or a justified composition of
existing capacity/payload bounds. No admission may silently evict, replace or
declare success for another occurrence. A bounded initial policy may refuse
sharing and/or decline background custody of durable events, returning the typed
retaining outcome so the existing source ledger retries. Do not add a durable
topology ledger or a second eventual-delivery controller. Specify when charges
are acquired and released on every normal, stopped, expired and exceptional path.

Decisive proof: sustained distinct occurrences for one row while traffic remains
deferred; many duplicate callers; overlapping immediate flushes; one slow target;
shutdown during a wave. The measured retained population and payload charge must
stay within the selected limits, all refused source occurrences remain owed, and
the retained ones can later complete through the canonical route. A recipient
queue-only capacity test is insufficient.

### F3 — Give provisional strict ingress a reachable committed release path

D:125-129 preserves useful local hydration while withholding a committed
receipt. D:194-197 and :270-273 then rely on later retries reaching real native
completion. Existing strict ingress does not guarantee that transition.
`src/message-group/message-group-forwarding-owner-routing-methods.js:434-448`
chooses local ingress for any relayed or explicitly addressed strict event,
even when the selected targets include a healthy remote leader.
`src/message-group/message-group-forwarding-owner.js:331-356` takes that branch
before normal forwarding. `src/message-group/message-group-service-cdc-replication-runtime-methods.js:165-187`
excludes local ingress from native proposal. Retrying the same addressed follower
can therefore return PROVISIONAL forever without entering the committed route.
This is an interaction defect, not evidence that provisional hydration itself
should be removed.

Required correction: name the canonical owner predicate, observable transition
and wake that let an occurrence which used provisional ingress obtain committed
completion once native delivery is possible. Define the healthy, still-follower
case explicitly; requiring the addressed replica to become leader is not a
release path. Preserve the existing reason for avoiding stale relay loops, the
captured target group, formation hydration and all existing budgets/backpressure.
A provisional cache hit or processed-event identity cannot stand in for native
completion, and a permanently remembered provisional decision cannot veto fresh
authoritative routing evidence.

Decisive proof: one engaged witness first needs provisional metadata to progress,
then makes authoritative native routing available while the addressed service
remains a follower. It must subsequently record an exact native occurrence,
return the committed receipt and permit source ACK through the same production
subscriber path. Include stale competing target hints, safe fanout and pressure;
show the old always-local decision makes this behavioral assertion red.

### F4 — Canonical local outcomes must reject conflicting failure semantics

D:184-202 requires exact canonical committed outcomes and preserves errors, but
directly selects `isCommittedCdcOutcome` for the local source answer. That current
predicate checks success, receipt cardinality/bindings and position/group only
(`src/cdc/cdc-delivery-outcome.js:89-96`). It accepts an otherwise valid committed
receipt accompanied by `error`, `deferRetry` or `noHandler`. The stronger
transport composition is only at `:109-118`; `completeCdcPropagation` calls the
weaker local predicate at `:123-125` and can produce success from that conflict.
The same local predicate is proposed for the source subscriber/ACK gates.

Required correction: explicitly tighten the existing canonical CDC semantic
owner's local-result contract to reject conflicting failure, provisional or
deferral claims, with the allowed result metadata named. Keep the local contract
independent of a transport ACK requirement. Transport callers must still compose
the same semantic predicate with the existing transport classifier
(`src/transport/transport-semantic-outcome.js:97-121`); do not introduce a second
caller-local interpretation or hide conflicts while wrapping the result.

Decisive proof: a valid exact receipt plus each conflicting semantic field must
remain owed through direct source propagation, the shared subscriber, sliding
handshake and obligation driver, as well as real transport. An ordinary valid
local committed receipt without transport fields remains accepted. A zero-target
wave is included, so target failure handling cannot mask this local defect.

## Identity and authority disposition

The following boundaries are sound as design requirements; none is an executed
implementation proof in this review.

| Boundary | Required identity/authority and inspected evidence |
| --- | --- |
| Source occurrence | Reuse `[durable-tag, sourcePartition, eventKey]`, not row value, HLC alone, sequence number or diagnostic cause. `src/partition/cdc-event-buffer.js:38-46,62-65`; actual source reconstruction `src/partition/partition-cdc-obligation-delivery.js:170-180`; D:70-93. |
| Envelope | Preserve timestamp, source partition/replica, entry key, native source index/ordinal and scope at every listed branch. Validate supplied safe numeric positions before digesting; current helper silently omits unsafe positions (`src/cdc/cdc-delivery-outcome.js:28-34`). Capture immutable data, not only a shallow outer object (`src/cdc/cdc-event-envelope.js:26-32`; D:106-110). |
| ProposalQueue | Existing count admission is synchronous; vector key is semantic event digest, while exact waiter identity/lifetime/expiry is additional MG policy. Register before synchronous RF1 application, refuse active duplicates rather than renewing them, and do not resolve by reused key alone. `src/partition/proposal-queue.js:96-108,135-148`; D:111-116,136-148; F1/F2 remain. |
| Native completion | Native application plus durable applied advancement in the same SQLite transaction is the cut. Its isolated afterCommit effects run only after success; afterRollback cannot mint a receipt. `src/raft/raft-rs-application-transaction-owner.js:23-32,60-99`; D:130-140. |
| Receipt | Bind the exact source occurrence and semantic digest to actual recipient group/index/term; validate exactly one receipt for each distinct expected durable binding. `src/cdc/cdc-delivery-outcome.js:38-96`; D:77-93. F4 covers conflicting status. Native append and diagnostic operationLedger remain insufficient. |
| Transport | Preserve arbitrary service-result fields through the real router, then require both transport processing and exact semantic result. `src/transport/message-router-pending-response-ledger.js:508-523`; `src/transport/message-router-delivery-behaviors.js:216-265`; D:184-192. `buildLatencyCdcPropagationResult` currently omits receipt fields (`src/message-group/message-group-service-runtime-support.js:348-389`) and must be corrected at its actual boundary. |
| Topology | Source group comes from the actual selected service; each target group is captured for that wave, survives rerouting and safe fallback, and must return its own matching result. Current source-answer discard at `src/topology/cdc-group-propagation-service.js:237,405-454` must be removed. D:159-192 correctly makes a zero-target wave require source native completion. F1-F3 remain. |
| Subscriber | The shared bootstrap factory must return propagation's result and run completion-only hooks only on committed success; current `src/bootstrap/shared/partition-cdc-propagation-subscriber.js:184-228` ignores table mismatches and discards the propagated answer. Source wrapper/handshake and driver each retain the same canonical gate. D:194-202 requires selecting responsible subscribers or refusing mismatches; do not turn diagnostic observers into implicit ACK owners. |
| Source ACK | Delivery success only authorizes the existing pinned `CDC_DELIVERED` command; actual ACK application changes delivered state. Preserve source tenure/subscriber-set checks and identical pending ACK retry. `src/partition/partition-cdc-obligation-delivery.js:289-426,457-475`; `src/partition/partition-cdc-obligation.js:206-224`; D:218-225. |
| Lost replies/restart | Same source occurrence may receive another real recipient native occurrence. Volatile cache dedup may suppress projection work but cannot answer commitment; absent waiters or replies do not discharge debt. D:150-155. Cache mutation before SQLite rollback requires the explicit rollback/replay witness, not an assumption of memory rollback. |
| Historical delivered rows | This package cannot retroactively certify an old delivered flag. Later cross-member classification must match source native statement, outcome, obligation, recipient command and exact declared cohort across applied, committed-pending and local suffix ranges. Missing/compacted provenance stays unavailable; contrary readable provenance stays contrary. D:349-355; no new receipt, SQL replay or delivered-flag rewind. |
| Original-mode authority | Correct CDC completion does not grant serving, activation, transfer, role-publication, transition-worker or source-retirement ACK authority. Approved R1/R2 remains separate: `pre-source-r1-r2-correction-2026-10-21.md:26-92,111-121,140-190`; its independent approval is design-only (`independent-r1-r2-correction-review-2026-10-21.md:10-12`). D:356-366 preserves those boundaries. |

## Nine-category audit

The rows below apply every item of the nine requested templates. **Specified**
means the design names a valid requirement and its real owner. **Open F#** means
the finite correction above is required before source. **Unmeasured** means a
future implementation or native witness is required; it is not a failed runtime
test or an approval inferred from existing test names.

### Admission / gating / hold predicates (7)

| Item | Disposition and concrete evidence |
| --- | --- |
| A1 Precheck predicts enforcement | Specified: readiness must not itself imply durable success; the actual recipient afterCommit result and source canonical gate enforce it (D:106-148,194-202). Unmeasured: production subscriber selection and MG admission must inspect the captured current service/group, not a cached precheck. |
| A2 Transient versus terminal | D:210-220 names INVALID, PROVISIONAL, BACKPRESSURE and UNKNOWN; debt survives all. Unmeasured: each error's real consumer mapping and retryability, including unavailable native participation, must be exercised. F3 prevents permanent provisional hold. |
| A3 Governing budget | Open F1: current proposal timeout `message-group-service-cdc-replication-runtime-methods.js:446-464` and durable retry do not constitute the specified encompassing deadline. No timeout/cadence increase is authorized (D:270-273). |
| A4 Reason shape | Specified canonical helpers use string `error`, booleans and retry hint (`src/cdc/cdc-delivery-outcome.js:64-70,105-118`), while ProposalQueue throws `{code,retryAfterMs}` (`src/partition/proposal-queue.js:100-104`). Unmeasured translation must preserve these owned shapes; F4 forbids conflicting success. |
| A5 Hold release | Open F3: source retry can revisit debt but current addressed strict ingress can always choose local hydration. Required native-route observable/wake and release-latency witness are missing. |
| A6 Freshness | D:136-148,199-201 requires current lifetime/deadline and source lane/subscriber-set checks. Existing `partition-cdc-obligation-delivery.js:462-467` demonstrates the current source guard; recipient checks after every await remain unimplemented. |
| A7 Message honesty | D:159-166,210-220 binds errors to the actual service, target group and occurrence. Unmeasured diagnostics must report the captured blocking group/event, not replace it with a newer routing projection; error retention is required at D:186-192. |

### Recovery / replay / reconciliation (5)

| Item | Disposition and concrete evidence |
| --- | --- |
| Rv1 Never clobber live state | Specified: no durable MG result store/rebuild; new waiters are exact service-lifetime response custody (D:145-155,234-238). Unmeasured: late old effects must not settle/delete a replacement waiter with the same vector key. |
| Rv2 Restart versus live | Source durable debt is reread by its owner; recipient restart loses transient waiters and may repropose (D:150-155,224-225). Existing source current-lane guard is `partition-cdc-obligation-delivery.js:462-467,478-489`. No process-local reset authorizes fresh native storage. |
| Rv3 Lost enlistment | D:162-166 preserves every failed captured target group through safe fanout; D:194-202 retains responsible subscriber checks. Unmeasured: neither an emptied target projection nor a missing/mismatched subscriber may turn prior required work into success. Legitimate zero-target waves still require source completion (D:190-191). |
| Rv4 Replay idempotence | D:150-155 permits new real native recipient occurrences; source ACK idempotence remains `partition-cdc-obligation.js:206-224`. Unmeasured rollback control must reconcile in-memory `CDCHandler.processedEventIds` (`src/message-group/cdc-handler.js:310-342,448-531`) without using dedup as commit proof. |
| Rv5 Absence proves nothing | D:218-225,349-355 explicitly retains lost-answer debt and classifies missing historical provenance unavailable. No cache absence, compacted prefix, no waiter or unknown source ACK may become completion. |

### Owner interaction (10)

| Item | Disposition and concrete evidence |
| --- | --- |
| O1 One semantic owner | CDC outcome owner interprets exact committed acceptance; source ACK owner alone records delivered. Native transaction owner supplies commit evidence; topology supplies current target obligations. D:77-83,130-144,184-220 and source anchors in the identity table. F4 repairs the existing semantic owner rather than duplicating it. |
| O2 Typed boundary | Existing envelope/outcome helpers, ProposalQueue and router service-result contract are reused (D:70-104,141-148,184-208). F1 must type deadline custody; F2 must type topology refusal; both remain inside existing owners. |
| O3 Paired invariant | Native durability must withhold ACK before committed apply while provisional hydration allows formation to progress. D:252-277 requires both, but F3 leaves their common release route incomplete. One same-source witness, including old-shortcut negative, is required. |
| O4 Stale then fresh | Open F3: older strict-local/addressed decision must yield to newly valid native delivery without becoming a permanent veto. D:162-166 separately preserves group identity during address refresh. |
| O5 Pressure/backoff | Recipient capacity contract is specified at D:97-104,214; topology and pre-queue custody are open F2. Existing retry-after must survive all result wrappers, not be converted into immediate force retry. |
| O6 Wake/release | Source owns retry, subscription and tenure re-entry; `partition-cdc-obligation-delivery.js:548-562` preserves provisional redrive. Open F3 names the missing receiver transition/wake; a timer that repeatedly chooses the same local branch is insufficient. |
| O7 Projection authority | D:222-238 expressly rejects cache, processed IDs, operationLedger, grouped routing and waiter absence as receipt/debt authorities. Cross-member classification remains separately bound to source native/outcome/debt (D:349-355). |
| O8 Controlled negative | D:242-277 requires an engaged paired witness. Historical first MG result failed before proposal, not at custody loss (`MG-FIRST-RESULT-CLASSIFICATION.md:5-11,30-54,68-87`, full path below). Future A/B must freeze candidate and old-shortcut fingerprints and preserve the actual failed assertion. |
| O9 No escape hatch | Actual current bypasses include RF1/local native omission, truthy subscriber return, source result discard, ACK-only transport and row replacement; D:45-59,168-202 enumerates them. F3 and F4 show two still-unresolved compositions. Cache-only behavior is explicit and cannot satisfy durable debt (D:109-110). |
| O10 Contract/registry/proof | D:242-245,292-295 requires interaction registration and generated metadata with the source/witness candidate. Existing `test/shards/impact-contracts.json` entries are not proof that this absent mechanism is covered. No registry update or closure is claimed here. |

### Harness / fixture fidelity (6)

| Item | Disposition and concrete evidence |
| --- | --- |
| H1 Right red | Prior native test recorded 0 passing / 1 failing before recipient proposal, because structured INSERT omitted data/HLC (`MG-FIRST-RESULT-CLASSIFICATION.md:5-11,30-54`). D:247-256 requires actual producer and observed retained bytes at the held native carrier before claiming custody red. |
| H2 Binding seam honesty | D:248-265 requires real RF1/RF3 MG services, native ports, production subscriber and real router result boundary. Contract-suite-backed router stubs may support unit edges, never replace this decisive witness. |
| H3 Time fidelity | Open F1; D:274-277 additionally requires delayed timers. Distinct clock origins, ordering of queue/proposal/transport/public expiries and unchanged retry cadence must be explicit in the fixture. No compressed constant may erase the hold. |
| H4 Field fidelity | D:247-269 requires actual QUERY/write producer, HLC, event key/index/ordinal and full envelope. Hand-constructed INSERT without data or an owner stamp repeats the historical wrong mechanism. |
| H5 Vacuity | D:252-269 excludes empty debt, no proposal and fabricated receipts; zero-target source commit is a separate positive. F3 requires a still-follower addressed service, so a convenient leader flip cannot satisfy the release assertion. |
| H6 Live binding | D:292-295 requires exact frozen bytes, locked lab worker/job/counts and same-host predecessor comparison. None was executed by this review; existing green owner files and historical retry approval do not prove this interaction. |

### Transport / delivery / wake semantics (5)

| Item | Disposition and concrete evidence |
| --- | --- |
| T1 ACK is not processed | D:184-192 selects `isCommittedCdcDelivery`; current transport classifier rejects noHandler/error/defer conflicts (`src/transport/transport-semantic-outcome.js:97-121`). F4 requires corresponding local semantic rejection without inventing a local transport ACK. |
| T2 Late responses | D:136-155,218 requires exact waiter lifetime and no successor settlement. Unmeasured: delayed SERVICE_RESPONSE/native afterCommit after timeout, shutdown, replacement and source tenure change must preserve the sole remaining source redrive. |
| T3 Outcome classification | Existing transport and CDC predicates compose at `src/cdc/cdc-delivery-outcome.js:109-118`; D:206-220 names typed outcomes. Unmeasured all wrappers must preserve receipts and failure hints; current latency result builder drops receipts (`message-group-service-runtime-support.js:348-389`). |
| T4 Undeliverable bounded | D:215-218 retains disconnect/refusal/lost result as unknown and owned retry. Open F1 supplies the end-to-end bound; native append success cannot mask a missing handler or blocked completion. |
| T5 Stub fidelity | D:261-265 requires real router result transmission for decisive controls; `test/contract/message-router-contract.test.js` is the required behavior reference for any smaller router stub. No synthetic acknowledged-only stub proves delivery. |

### Concurrency / serialization (5)

| Item | Disposition and concrete evidence |
| --- | --- |
| C1 Synchronous gate | ProposalQueue checks duplicate/capacity before inserting (`src/partition/proposal-queue.js:96-108`); D:111-116 registers before RF1 can apply synchronously. Unmeasured actual MG use; F2 supplies upstream admission accounting. |
| C2 TOCTOU after awaits | Source rechecks lane and subscriber set (`partition-cdc-obligation-delivery.js:462-467`); D:136-148 requires recipient expiry/lifetime at settlement. F1 defines clock comparison; F3 requires fresh canonical routing after stale provisional observation. |
| C3 Single winner | Existing source ACK lane and exact command remain sole delivered writer (`partition-cdc-obligation-delivery.js:289-426`; D:219-225). Duplicate recipient native occurrences are legal, not competing source effects. No new global exactly-once claim or durable claim table is justified. |
| C4 Timer reentrancy | ProposalQueue removes maps before callback (`src/partition/proposal-queue.js:135-148`). D:145-148 must synchronously revoke MG admission before asynchronous shutdown. F2 covers overlapping immediate/background waves; all old timer callbacks must check exact entry/lifetime before touching new work. |
| C5 Key honesty | Vector wait identity hashes semantic events (`src/cdc/cdc-delivery-outcome.js:51-52`); durable replacement uses occurrence identity, not PK (D:168-182). Expected group/service/lifetime belong to captured waiter custody, not an unscoped global digest map. F2 accounts attached callers independently. |

### Formation versus steady-state circularity (5)

| Item | Disposition and concrete evidence |
| --- | --- |
| Fm1 Self-dependency | MG leadership/target readiness uses system cache that CDC itself hydrates (`src/message-group/message-group-forwarding-owner-routing-methods.js:434-480`). D:125-129 preserves provisional projection; F3 must connect it to later native acceptance. |
| Fm2 Redrive starvation | Durable source scan advances past provisional items and revisits (`partition-cdc-obligation-delivery.js:539-559`), so later metadata can arrive. Open F3: this does not itself change the receiver's always-local decision. Required wake must re-enter its canonical owner. |
| Fm3 Formation clients | D:270-273 forbids larger public 30000ms budget, retry count or cadence; provisional must remain typed and retained, not immediate terminal public success. End-to-end wait attribution is open F1. Original startup holds remain unchanged (D:15-19,340-366). |
| Fm4 Window arithmetic | Unmeasured. D:292-295 requires locked-lab proof; F1 must account queueing, attempts/backoff, source/targets and visibility under the tightest caller budget. No margin is established by this design-only review. |
| Fm5 No bypass | Native afterCommit and source ACK remain mandatory for durable success (D:125-155,184-220). Provisional local cache is permitted only as projection. Approved original R2 owner exclusions still apply to workers triggered by that cache (D:356-362). |

### Retry / redrive / follow-up (7)

| Item | Disposition and concrete evidence |
| --- | --- |
| Y1 Retry fires or stops | Existing source retry path `partition-cdc-obligation-delivery.js:508-520,548-562` retains debt. Background topology has bounded-attempt reporting (`cdc-group-propagation-delivery-methods.js:574-589`), but traffic deferral bypasses attempt increment (`:529-532`); F1/F2 must define bounded custody and caller outcome there. |
| Y2 Frozen-evidence bound | D:111-124 freezes waiter expiry/vector; F1 names its missing owner/clock rule. Unreadable source ledger cannot expire durable debt; historical F6 correction preserves and retries it (`review-checkpoint-cdc-retry-correction.md:77-137`, full path below). |
| Y3 Loud stops | D:210-220 enumerates malformed, provisional, pressure, deadline, rollback, wrong result, lifetime change and uncertain ACK exits. Unmeasured: each must retain typed causal detail through result wrappers and log actual event/group without accidental success. |
| Y4 Mutual suppression | Open F3: repeatedly provisional addressed follower can consume retry while never reaching remote native completion. F2 must also avoid topology pressure suppressing source retry after topology relinquishes custody. |
| Y5 Storm ceiling | Source page size/ACK outstanding bounds exist (`partition-cdc-obligation-delivery.js:492-501`). MG wait capacity does not bound topology cardinality/in-flight waves (F2). Required proof must state attempts per active instance and retained payload ceiling under existing cadence; no numeric global bound is currently established. |
| Y6 Duplicate safety | D:150-155 permits duplicate recipient native occurrence after lost answer; existing exact source ACK retry remains authoritative (D:220,237-238). D:257-260 requires independent lost-recipient-answer and lost-source-ACK controls, with no new source SQL event. |
| Y7 Reset semantics | Current source resets retry delay on drained scan (`partition-cdc-obligation-delivery.js:561-562`); new canonical gates must prevent undefined/ordinary/ACK-only/conflicting replies from reaching that success. F4 and D:184-202 supply the required refusal; exact native success permits normal reset. |

### Sweep / timer / periodic enforcement (5)

| Item | Disposition and concrete evidence |
| --- | --- |
| S1 Clock injection | ProposalQueue clears using its creating time source (`src/partition/proposal-queue.js:140-141,165-166`); D:274-277 requires timer cleanup. F1 must define injected now and cross-clock handling; actual timers must retain existing unref policy. No new periodic poll is authorized (D:121-124). |
| S2 Role/authority | Source delivery is current-tenure gated (`partition-cdc-obligation-delivery.js:478-489`); D:125-144 requires real native completion even for RF1 and exact remote receipts for followers. Timeout may retire a wait, never truncate/cancel native history or authorize original activation. |
| S3 Memory crash equivalence | Actual cache apply precedes afterCommit and may update processed IDs (`message-group-service-raft-timing.js:35-81`; `cdc-handler.js:310-342,448-531`). D:274-277 explicitly requires rollback followed by replay without a forged receipt or stranded dedup. Unmeasured; no implicit JS-memory transaction is claimed. |
| S4 Detection windows | Response expiry is not evidence native work failed or source debt expired (D:215-220); F1 distinguishes those lifetimes. Legal long native work may commit after unknown response but cannot settle an expired waiter. |
| S5 Sweep starvation | No new sweep is proposed. Existing source ledger retry survives temporary unreadability and lacks dependence on recipient cache completion (`partition-cdc-obligation-delivery.js:492-520`). F2 must ensure topology's deferred timers cannot retain unbounded custody; F3 must ensure they are not the only supposed release mechanism. |

## Historical evidence and next review boundary

The full historical paths abbreviated above are:

- `solve/quests/runtime-ordering-completion-consumer-proof/evidence/closeout/MG-FIRST-RESULT-CLASSIFICATION.md`.
  Its failed fixture did not engage recipient proposal/application or loss/replay;
  it is a fixture/input boundary failure, not demonstrated CDC custody loss.
- `solve/quests/replicated-transaction-decision-and-apply/evidence/review-checkpoint-cdc-retry-correction.md`.
  Its F6/F7 correction covers transient ledger-read retry, rejecting Promise-tail
  ownership and unreferenced timers for its exact historical candidate. Its
  reported tests are historical evidence, not results for this future package.

D:321-336 identifies primary-source comparisons as design inspiration only.
Their presence supplies no current-source, native, lab or release evidence. This
review's findings are derived from the local owner paths above, not an imported
algorithm or an assumption that another system's guarantee already holds here.

Re-review a concrete contract correction for F1-F4 before MG source work. It can
remain bounded to the named existing owners. Then one production author can
implement the interaction while a separate test author prepares the reviewed
native fixtures, with independent source review and history/static work in
parallel. Freeze the integrated bytes before the locked-lab proof. Keep each
failed attempt and same-host predecessor comparison; do not weaken the witness
to fit an unengaged mechanism.

After this package, cross-member original classification, protected activation,
R2 effect exclusions, durable transfer, exact cleanup and the composed two-start
public acceptance remain separate work. This REVISE record grants no original
opening/continuation authority, delivered-row repair, receipt, Quest completion,
merge, certification or publication approval.
