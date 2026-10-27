---
audience: development
documentClass: planning
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

## Independent F1-F4 delta review, 2026-10-23

Reviewer: `subagent:/root/retained_effects_tests`. Reviewed contract SHA-256:
`f749428c63eecfac2c02ef1546b1627620bb5b83ded9d1e66cc69bcb1a6ef643`.
Its correction begins at D:368 and preserves the original proposal. This append
preserves the earlier review, whose SHA-256 was
`a9ec0ee41b4af3cd78bcc9d287251d20a1a1988623d456e6892d4a055c98dbaf`.

Consolidated verdict: **REVISE for the single residual F2 admission/delivery
domain defect below. F1, F3 and F4 are resolved at the design level.** F2's
concurrent-custody and cleanup corrections are sound; its new hard payload and
total-fanout ceilings are not established as applicable to already accepted
ordinary durable CDC work. This is not approval to implement the coupled
interaction in pieces. The unaffected prior dispositions and all unexecuted
source/native/lab proof requirements remain in force.

The integration owner specifically requested examination of whether the adopted
capacity constants were admission limits or a new post-commit delivery
restriction. That concern is confirmed by the owner paths below. No new runtime
probe was performed, and no source, test, baseline, registry, Quest log or receipt
was changed by this delta review.

### F1 disposition: design correction accepted, enforcement still unproved

D:381-397 now names the source delivery invocation as the budget owner, starts it
before subscriber readiness/selection, shares it across subscribers, and lets an
explicit live caller budget only shorten it. The two selected configuration
limits are real existing 5000ms settings
(`src/config/config-definitions.js:64-66,100-110`); the public bootstrap bound is
separately 30000ms (`:114-116`). Accepted source debt has no new lifetime expiry.

D:399-425 distinguishes each owner's clock domain from the sender's total
response deadline. Same-process calls retain the parent's remaining/currentness
operation; remote handlers receive only a bounded duration and cannot know
transit time. A receiver's permitted late effect remains unknown to an expired
sender. The append no longer claims synchronized distributed cancellation or
that a remote clock can enforce an unknowable foreign expiry. It also forbids
restarting full durations within a hop or extending the old caller on retry.

The selected budget primitives have the needed arithmetic
(`src/control-plane/timeout-budget.js:39-70,122-162`). Their child-budget refusal
must be honored; the query helper at `:73-96` intentionally grants a minimum
after exhaustion and is explicitly excluded by D:401-402. A parent absolute
budget must still be read with its creating clock, not passed to a child helper
using another clock's `now`.

D:429-448 also closes the detached-tail loophole. Response timeout is distinct
from cleanup completion: unresolved local subscriber/selection work continues to
occupy the existing source flight, and a topology wave retains its charges until
its actual child work settles or its owner closes it. The existing source lane
has the appropriate single-flight location
(`src/partition/partition-cdc-obligation-delivery.js:590-610`). An unclosable
dependency becomes explicit retained custody; repeated retries cannot allocate
detached copies or waiting callers behind it. Merely retiring a local response
is insufficient if a local send callback, queued closure or buffer remains.
Conversely, unknown remote effects need no unbounded local receipt map once all
local custody really has closed.

This requires actual owner changes, not just a timeout race in the subscriber.
Current `src/transport/message-router-delivery-behaviors.js:177-225` can await
initialization before passing a relative timeout onward; `:347-426` registers a
response then queues dispatch, without passing its cancellation signal into the
shown queue options. The current pending-response timer begins after ACK
(`src/transport/message-router-pending-response-ledger.js:378-408`) and settlement
does not check absolute expiry (`:419-434`). D:407-415 correctly requires queue
residence/dispatch and fulfillment enforcement in these existing owners. Their
generic non-CDC behavior is not silently redefined by this design approval.

Required implementation proof remains D:450-456 plus actual stalled callback /
queued-send cleanup. Delayed timers, different clock origins and late native
commit must all preserve expired response state, exact source debt and bounded
locally retained work. These cases are specified, not measured here.

### F2 disposition: custody bound accepted; accepted-debt domain still REVISE

The correction at D:460-478,498-542 is a concrete improvement over the old maps:
one active durable wave, no pending durable waves, one caller, no sharing and no
durable background retry. The slot spans source MG, target calls, safe fallback
and child cleanup. Synchronous admission precedes cloning/await/proposal; a new
caller cannot enter while old owned work remains. Exact finalizers cannot clear
a successor's slot. A downstream ProposalQueue is no longer offered as proof of
an upstream bound. These count/custody requirements are accepted as design.

The residual defect is D:479-497 and its use at recipient admission in D:512-515:
the proposal borrows a 64-target transport pending-queue constant and a 1 MiB
participant replay allowance as global hard delivery ceilings, while explicitly
allowing larger source debt to remain committed. D:493-497 postpones broader
capability to a future owner decision. That is a permanent restriction of the
delivery domain, not ordinary transient backpressure.

Concrete owner evidence:

- The 1 MiB constant governs a participant session's encoded staged operations,
  not all committed statements or their CDC envelopes
  (`src/partition/partition-participant-transaction-constants.js:152-159`;
  `src/partition/partition-participant-transaction-staging.js:11-22,183`). Ordinary
  SQL admission checks statement presence and entry identity, with a separate
  branch for participant commands
  (`src/partition/partition-committed-command-admission.js:100-106,130-142,159-172`).
  The native proposal codec performs JSON encoding, not this 1 MiB admission
  (`src/raft/raft-rs-proposal-codec.js:33-45`). These inspected owners do not
  establish the proposed CDC envelope/routing/result bound. Even a bound on
  staged operations alone would not prove the same bound on the generated event
  plus its source envelope, targets and receipt data.
- Ordinary SQL application records the statement outcome and captured CDC debt
  together before advancing the generation and answering the write
  (`src/partition/partition-service-entry-apply-base.js:649-668`). The CDC owner
  serializes the actual event to `eventJson` and inserts its obligation
  (`src/partition/partition-cdc-obligation.js:123-151`). A later topology refusal
  cannot undo that accepted write or turn its notification into optional work.
- The 64 value is actual transport pending capacity
  (`src/constants/transport.js:96-97`). The registry applies configured capacity
  per destination queue, alongside in-flight accounting
  (`src/transport/message-router-outbound-delivery-registry.js:224-248`);
  it is not a limit on the total groups one logical wave may require. Current
  safe routing enumerates all eligible groups
  (`src/topology/cdc-group-propagation-routing.js:95-131`), and grouped routing
  enumerates eligible target order (`:171-236`), without the proposed 64-group
  ceiling. A bounded concurrent window can drain a larger finite fanout; a
  hard refusal on its total cardinality cannot.

For an already accepted occurrence above the new payload ceiling, neither source
retry nor freeing the active wave changes its bytes. For an eligible, stable
fanout above 64, neither frees the supposedly required total-target capacity.
There is therefore no release observable under the proposed rule. Repeated
BACKPRESSURE would leave this debt permanently owed and may hold later events
behind the source's failed-event retry. Calling the condition a named payload or
fanout refusal is more honest than success, but does not make a previously
accepted delivery obligation dischargeable. The same applicability question
must be answered for any new hard vector-size ceiling; an old flush trigger is
not automatically producer admission.

Required finite correction: retain the one-wave/no-sharing/cleanup accounting,
but connect each hard delivery limit to the actual accepted source domain. Either
demonstrate an existing applicable producer/topology contract that bounds the
complete retained work, or revise the existing delivery policy so already
accepted larger occurrences/fanouts can progress with bounded concurrent custody.
If the intended unit is genuinely a narrower original-only operation, specify
and bind that exact scope and the unchanged discharge path for ordinary accepted
debt before implementation; a self-asserted sourceScope or original-seed-size
positive alone is insufficient. Do not add an unrelated global producer
restriction, discard historical debt, split away an event and report vector
success, or add a new recovery architecture in this correction.

The memory claim must follow the chosen applicable domain. D:517-524 correctly
requires counting before unbounded serialization and including envelope,
routing/error data and duplicate encoded copies. The current canonical JSON
serializer does not supply an early byte-limited capture by itself
(`src/utils/canonical-json-data.js:302-329`); implementation must not call it on
unbounded input and then claim that a later byte-length check bounded the copy.
This remains an implementation obligation, not a separate material design
finding. No new fixed-memory guarantee is accepted merely from the borrowed
1 MiB constant or the formula at D:503-506.

Required proof for the corrected domain includes actual ordinary source debt on
both sides of any claimed applicable boundary, a fanout exceeding the concurrent
window, and progress after temporary pressure without changing the event or
deleting required targets. If a proposed bound really rejects input upstream,
the negative must show refusal before SQL/outcome/debt commitment and must account
for previously accepted retained debt. Proving the declared seed vectors fit is
necessary for the seed witness, but cannot certify a smaller global delivery
domain. No greater-than-limit native experiment is claimed by this source review.

### F3 disposition: design correction accepted, native follower proof required

D:556-595 changes the actual forwarding-owner decision order: current admitted
local leader, then coherent owned native leader/peer route, then provisional
hydration only when native delivery cannot be admitted. This resolves the
unconditional addressed/relayed preference identified in the original review.
The observation fields named at D:565-573 exist in the native status owner:
group/replica, configuration/generation/incarnation, resolved leader and peers,
participation/refusal and runtime health
(`src/raft/raft-rs-status-observation.js:101-149`). The existing forwarding
methods currently combine mutable leader hints and a separate peer status read
(`src/message-group/message-group-forwarding-owner-routing-methods.js:26-55,81-92`);
adapting them to one coherent current observation is an explicit required change.

The terminal native-commit request at D:575-586 has a finite response contract:
the receiver is the admitted current leader and proposes, or it refuses. It
cannot restart cache target selection or relay back. The existing depth-two
limit is not increased or reset within an old request. Lifetime/participation
and target binding are rechecked before effects, and a changed leader returns
owned uncertainty rather than a fabricated receipt. These rules avoid repairing
the old local-only stall by reopening an unbounded forwarding loop.

D:597-613 identifies fresh native evidence as the release condition and the
existing source provisional scan/retry as the redrive owner. The source retains
the event while native leader/peer state changes independently; it need not
receive unrelated new traffic. No new cache approval bit or polling controller
is introduced. The same witness must keep the addressed replica FOLLOWER,
require provisional hydration first, expose usable native facts, and then obtain
real recipient/source-ACK commitment. Stale cache hints, suppression, safe
fallback and pressure must remain engaged. Actual release latency and this
same-candidate positive/old-predicate negative are still unmeasured; F2's global
domain issue must not prevent their eventual redrive.

### F4 disposition: design correction accepted, ACK independence preserved

D:617-649 now changes the single canonical semantic owner instead of trusting
its current weak predicate. It requires exact committed bindings and rejects
conflicting error, provisional, deferral, failure-set or status claims, including
wrong-type variants. Allowed metadata is centralized; a wrapper cannot strip
contradictions and reuse the receipts. D:651-657 carries that requirement through
local source composition, the shared subscriber, handshake and source ACK gate.

The local positive still requires no `acknowledged` field. Transport consumers
add the existing processing predicate at the separate seam; they do not fabricate
an ACK for local callers. The real current split remains
`src/cdc/cdc-delivery-outcome.js:89-118`, and the transport conflict classifier is
`src/transport/transport-semantic-outcome.js:97-121`. The proposed semantics repair
that split without creating a second truthiness rule. D:659-665 explicitly
requires local and real-router round-trip positives and every conflicting-field
negative, including zero-target propagation. None has been executed here.

### Delta coverage of the nine-category audit

All 55 earlier audit items retain their original source anchors and proof
obligations. Their affected design dispositions change as follows; unaffected
items are not reclassified as newly verified.

| Category | Delta disposition |
| --- | --- |
| Admission/gating | F1 resolves A3's deadline owner/clock ambiguity; F3 supplies A5's native release route. F2 leaves A1/A2/A5 open for permanently oversized accepted debt: downstream refusal is not predicted by current producer admission and has no temporary release. |
| Recovery/replay | Exact lifetime and raw cleanup custody strengthen Rv1/Rv2. Rv3/Rv5 still forbid deleting target obligations or treating unavailable history as completion. Retaining an oversized row is safe preservation, not proof its delivery is complete or live. |
| Owner interaction | F1/F3/F4 resolve the previously missing typed budget, native route and semantic validator. F2 remains an O3/O5/O6/O9 interaction defect because a borrowed queue/session constant does not own ordinary CDC admission. O10 registry and paired source/native proofs remain future work. |
| Harness fidelity | D:450-456,544-552,605-613,659-665 add the right clock, cleanup, pressure, still-follower and contradictory-result controls. The F2 correction additionally needs ordinary accepted-domain controls; original-seed-only fit cannot substitute for them. |
| Transport/delivery | F1 names real queued-dispatch and delayed-fulfillment enforcement, and F4 preserves ACK-independent local completion plus strict remote composition. Actual pending-response/outbound ownership changes and transport round-trip proof remain unmeasured. |
| Concurrency/serialization | One active exact wave, no pending callers/background entries, register-before-await and release-after-child-cleanup resolve the earlier unbounded-population mechanism at the design level. They must survive source tenure/service replacement and actual raw-send tails; they do not establish applicability of hard per-event/fanout caps. |
| Formation circularity | F3 preserves provisional hydration and later native commitment without requiring follower election. F2 remains a liveness issue for ordinary debt beyond its borrowed caps. The public 30000ms bound and original-mode exclusions remain unchanged; window arithmetic is unmeasured. |
| Retry/redrive | F1 distinguishes each expired invocation from persistent debt; F3 gives the existing retry a fresh canonical route. F2 cannot rely on retries to reduce immutable payload size or a stable required target set. Existing cadence, finite foreground retries and same-event/source-ACK identity remain mandatory. |
| Sweep/timers | Separate injected clocks, synchronous expiry checks and exact creating-clock cleanup are specified. No response timeout is proof of native cancellation or release of unclosed local custody. Rollback/JS-memory crash equivalence and delayed-timer proof remain unexecuted. |

The next review is a bounded F2 correction, not another full design restart.
Keep the accepted F1/F3/F4 wording and original identity/native cuts. Source
implementation, independent source review, exact-candidate locked-lab proof,
cross-member classification and all R1/R2/startup/release gates remain separate.

## Independent residual F2 review, 2026-10-23

Reviewer: `subagent:/root/retained_effects_review`. This is a design-only delta
review of contract SHA256
`8da8cd11afe98640e422dca314cb7d204088dbae488222fd2557db446f73426f`,
whose new correction occupies D:685-931. I independently verified that its
first 683 lines still hash to
`f749428c63eecfac2c02ef1546b1627620bb5b83ded9d1e66cc69bcb1a6ef643`.
The prior review SHA256 is
`76f9e6b1a79af7a8f0727b8b183fcc7c55a21d8f15a73110b24d73fd4af6069e`.
This reviewer authored neither the MG proposal nor MG production/tests and
changed only this review addendum. No runtime, lab, submission or commit was
performed. Source observations below concern the preserved observer candidate
`68633168ef17759fec954e6ef66b4ccb0d671bc7`; they are not evidence that the MG
completion/progress mechanism has been implemented.

Consolidated verdict: **REVISE for one residual F2 provisional-progress
transition.** The withdrawal of the inapplicable payload/vector/total-target
ceilings, parameterized memory claim, bounded dispatch and source-owned native
receipt progress are accepted at the design level. F1, F3 and F4 retain their
previous accepted design dispositions and all outstanding source/native/lab
proof. The finding below is the complete material finding set for this delta,
not a request to restart those reviews or introduce another recovery owner.

### F2-P: partial provisional fanout needs a bounded scan-release transition

D:839-853 supplies fair target dispatch across bounded source invocations, but
the cell at D:813-821 retains validated native receipts and completed subscriber
answers. D:849 explicitly prevents provisional results from completing a
target; D:850-853 makes an exhausted invocation UNKNOWN. D:873-879 correctly
requires canonical provisional release to preserve the formation scan, but
only describes what happens after such a complete outcome already exists.
It does not define how an operation that spans several budgets obtains that
outcome while all its presently reachable effects are provisional.

The concrete missing case is a stable finite captured target/subscriber set
larger than one invocation can visit through its bounded window. Every
individual delivery fits its live invocation and can return a valid canonical
provisional ingress result. Native completion at those recipients requires
later metadata already owed after this occurrence in the same source scan.
Each attempt visits only part of the set before expiry. The proposed cell
retains no specified full-vector provisional coverage evidence for that part;
rotating a cursor is not semantic proof that every required target/subscriber
returned the canonical provisional binding. Each caller therefore remains
UNKNOWN even after repeated fair visits. No source ACK is permitted, but the
source cannot reach the later metadata that would enable F3's native release.

This is grounded in the actual existing scan owner, not a hypothetical new
delivery controller. `partition-cdc-obligation-delivery.js:457-475` produces
DRIVE.PROVISIONAL only from canonical provisional subscriber outcomes;
`:523-545` advances the cursor for that result but holds the scan on a delivery
failure. The existing semantic composition at
`cdc/cdc-delivery-outcome.js:121-131` requires complete source and target
provisional/committed coverage before returning a provisional result. Unknown
or unvisited targets must remain unknown as the contract already requires.
Releasing the topology capacity between attempts does not release this source
ordering dependency. The analogous case spans several responsible subscribers
whose aggregate readiness/delivery exceeds a budget although each individually
fits; retaining only completed native subscriber answers does not address it.

Required finite correction: define the existing source lane's bounded
provisional-coverage transition across invocations separately from native
completion and ACK eligibility. One possible owner-consistent form is typed,
validated, non-ACK coverage metadata in the same one-obligation cell for the
complete source/vector, each captured target and each responsible subscriber.
Its currentness, deadline, invalidation, full-coverage and discard rules must
be explicit; raw responses, payloads, callers, promises and independent timers
still cannot accumulate. Another concrete existing-owner transition is
acceptable if it proves this same case. A fair cursor alone, an unvisited
target, timeout, generic failure or mere transport ACK cannot count as
provisional coverage. A retained provisional observation must never be promoted
to a native receipt or used to complete a target for source ACK.

Specify when a new live invocation can return the canonical PROVISIONAL result
and release the existing scan after complete validated coverage, and how that
scan release discards the optimization while preserving the original ledger
debt and later ordinary native redrive. Expired callers stay UNKNOWN. Bind any
retained weak coverage to the same exact event/vector, captured obligation set,
source tenure and responsible subscriber identities; source/service replacement
or a changed binding/set cannot reuse it as current completion evidence. Retain
F1's exact cleanup custody before any replacement invocation can hydrate again,
including a new tenure; clearing a progress cell alone does not close a child.

The decisive paired witness must compose the already specified controls:
more than one target window and more than one source invocation budget; an
addressed follower needing provisional hydration; later required metadata
behind the first owed event; actual source scan advance without an ACK; F3's
owned native-route transition while still a follower; complete real native
receipts; and finally source CDC_DELIVERED apply. Include a delayed timer/late
provisional answer and a missing or mismatched target as negatives. Removing
the proposed weak-coverage transition must strand the later metadata and make
the same acceptance assertion red. Separate small provisional and large
already-native fanout positives do not prove this composition.

### Accepted portions and remaining implementation proof

- D:698-737 correctly removes the new hard restrictions on already committed
  ordinary SQL debt. I rechecked unrestricted event JSON capture in
  `partition-cdc-obligation.js:123-135`, proposal JSON encoding in
  `raft-rs-proposal-codec.js:33-50`, and finite topology target enumeration in
  `cdc-group-propagation-routing.js:96-139,165-235`. No inspected producer owns
  the withdrawn 1 MiB/64 limits.
- The distinct wire-domain finding is accurately scoped. Current server/dial
  construction omits maxPayload, installed ws defaults to 100*1024*1024 per
  received message, ordinary sending serializes the whole message, and native
  entry data is base64 encoded. These local sources were inspected. The
  proposal no longer claims a 100 MiB row allowance or universal delivery of
  every SQLite-sized accepted event. Retaining an untransportable event with
  an honest outcome is safe preservation; resolving that pre-existing domain
  mismatch remains a separate owner decision, not a new cap in this package.
- D:741-800 preserves synchronous admission for one active topology wave,
  no retained second caller/background wave, a bounded active dispatch window
  and exact release after local children close. Its memory claim now honestly
  includes actual input/codec/transport representations and target metadata;
  it is not a constant-byte claim. Recipient count-only capacity similarly
  does not imply a byte bound. Actual slow-send/raw-callback ownership must
  still be measured before claiming bounded retained copies.
- D:788-795's one-payload-at-a-time hydration fits the existing ledger's
  positional query and finite captured tail. The source implementation must
  preserve the 256-row work quantum with an explicit visit count, including
  pending-ACK skips/provisional rows; calling the old page-finished decision
  with a one-row array would change its scheduling semantics. No SQLite read
  transaction/iterator may span subscriber waits.
- D:802-871's committed progress belongs to the source lane, with private
  operations instead of event/wire properties. Native evidence observed
  before expiry may survive to a new bounded invocation; late results cannot
  update the old cell. Completion still needs the full vector at the selected
  source group, every captured target and every responsible subscriber. Safe
  fallback may change an address, not delete an unresolved group. Validate
  the whole F4 outcome before extracting receipts; a partial receipt vector
  or conflicting failure fields cannot enter this optimization.
- Dropping transient progress on tenure/subscriber/service replacement is
  compatible with ledger redelivery and duplicate real native occurrences.
  It provides no historical target-membership record. The proposal explicitly
  retains that prior exclusion; no new claim about target requirements across
  lost tenures is approved. Same-text subscriber IDs must not substitute for
  the actual current subscriber/lifetime identity during implementation.

### Nine-category delta coverage

| Category | Disposition for this correction |
| --- | --- |
| Admission/gating | Borrowed hard payload/vector/fanout caps are withdrawn. Synchronous one-wave and actual recipient queue admission are coherent; no current invocation may bypass its deadline or claim unavailable work admitted. |
| Recovery/replay | Only the source ledger and committed source ACK remain durable authority. Volatile progress loss permits replay, not debt loss; complete historical topology obligations across tenure loss remain excluded. |
| Owner interaction | Source lane, topology, recipient queue, envelope and semantic result owners have distinct responsibilities. F2-P needs one explicit weak-coverage scan-release transition within those owners. |
| Harness fidelity | Larger-than-withdrawn-cap ordinary SQL, greater-than-window fanout, multi-budget native completion, exact cleanup and one-row hydration controls are appropriate but unexecuted. Add the combined multi-budget provisional/formation witness above. |
| Transport/delivery | Full target/vector receipt validation and no false ACK are preserved in design. The pre-existing full-message wire domain is recorded honestly; bounded sends cannot shrink required target coverage. |
| Concurrency/serialization | One topology wave and one current-obligation cell limit populations; representation costs follow actual accepted input. F1's local cleanup gate must span replacement/tenure changes, not only the old cell's lifetime. |
| Formation circularity | F3 remains accepted, but F2-P blocks approval: an UNKNOWN partial provisional wave cannot reach later required metadata merely because topology capacity was released. |
| Retry/redrive | Fair cursor plus retained native receipts can prevent repeated native-completion prefixes from consuming every budget. Provisional coverage needs the separate finite transition; retry must not renew an expired caller or become a new background owner. |
| Sweep/timers | No new timer, durable receipt store or payload cache is proposed. Old callbacks must be fenced and actual local child custody retained; delayed callbacks cannot retroactively update progress or ACK eligibility. |

Re-review only the finite F2-P transition and its invalidated risks. All prior
identity/native cuts, accepted F1/F3/F4 design dispositions, source-review and
exact-candidate native/lab requirements remain in force. This addendum grants
no permission to treat partial/provisional delivery as native commitment and
no MG implementation, runtime, Quest, R1/R2, startup or release approval.

## Independent final F2-P delta review, 2026-10-23

Reviewer: `subagent:/root/retained_effects_tests`. Reviewed contract SHA256
`474182126c3c985feceadb9a1b72d7de9975e1b4c3280af52be884c6c095f383`,
specifically its final correction at D:933-1163 against the complete residual
F2-P finding above. I independently verified that its first 931 lines still
hash to `8da8cd11afe98640e422dca314cb7d204088dbae488222fd2557db446f73426f`.
This review file before this append hashes to
`dc4d7ce541fd479e37430969ed5cec2129f5f88eb133b99f369e5093ecd31061`.
Source anchors below are relative to `src/` at preserved HEAD
`68633168ef17759fec954e6ef66b4ccb0d671bc7`. No MG implementation exists in
that checkpoint. I authored neither this MG design nor MG production code;
my earlier observer test work is not independent approval of those tests.
This task changed only this review append and ran no runtime or lab proof.

Consolidated verdict: **APPROVE the bounded MG interaction design, including
the F2-P correction.** F2-P's missing transition is now specified. There are
no remaining material design findings in this finite delta. The earlier
accepted F1/F3/F4 provisions, withdrawn hard-cap decision, representation-cost
accounting and all source/native/lab proof requirements remain binding. This
is design approval only; it approves no implementation, source checkpoint,
Quest closure, historical cross-member classification, R1/R2 activation or
transfer, composed startup, release or publication result.

### Why the missing transition is now present

D:953-985 separates UNCOVERED, PROVISIONAL_COVERAGE and NATIVE_COMMITTED
inside the same one-obligation source cell. A missing branch is explicitly
uncovered. Each topology subscriber needs its actual selected source group
and every captured target; every other responsible subscriber needs its own
full-vector result. A validated weak observation cannot authorize ACK, and
only actual native evidence can change it to NATIVE_COMMITTED. There is no
new ledger, event property, persisted continuation token or topology retry
controller.

This matches the actual distinction the existing owners need. The semantic
owner currently composes complete provisional coverage at
`cdc/cdc-delivery-outcome.js:121-131`. The source lane currently advances its
cursor without counting a delivery for DRIVE.PROVISIONAL at
`partition/partition-cdc-obligation-delivery.js:523-541`, then schedules an
owed-debt rescan at `:548-562`; failure instead holds that cursor at
`:508-520`. D:1055-1107 explicitly connects accumulated coverage to those
same transitions. It does not reinterpret UNKNOWN as provisional.

The finite positive trace is now coherent. Let owed occurrence A precede
formation metadata B within the captured source tail. Let A's stable required
population exceed one dispatch window and one response budget, with several
actual responsible subscribers. During successive live attempts, exact valid
provisional observations reduce the set of uncovered leaves. Fairness at
D:1063-1069 includes later subscribers, so restarting a partially covered
first subscriber cannot permanently exclude them. Incomplete attempts still
retire UNKNOWN. If the last valid observation arrives before expiry but final
composition misses that expiry, a later live invocation may compose the
complete weak set; the expired caller remains UNKNOWN (D:1081-1089).

That later invocation releases the existing scan to B with A still owed and
no source ACK. D:1096-1102 then fences and discards the entire cell, including
any native receipts mixed with weak observations. After B makes F3's native
route usable while the addressed recipient remains a follower, a fresh
ledger redrive must collect actual native evidence for every obligation.
Only that complete native result can enter the existing pending ACK owner;
only CDC_DELIVERED application changes the durable delivered flag
(D:1103-1107; `partition/partition-cdc-obligation.js:202-224,227-232`).

This is a conditional progress argument, not a measured latency claim. Its
premises include a stable finite captured population, current source and
subscriber owners, individually completable live invocations, fair dispatch,
and closure of locally owned child work. It promises neither native delivery
to an unavailable recipient nor preservation of an expired caller's budget.
There is no attempt-duration TTL that silently recreates the requirement that
the whole finite population fit one invocation (D:1018-1023).

### Exact binding and adversarial dispositions

| Example or counterexample | Required result and reviewed boundary |
| --- | --- |
| The correct event comes from a different MG, or a result lacks recipient group metadata. | Remains UNCOVERED. D:996-1007 binds the actual result to the outstanding dispatch and expected captured group; the caller cannot fill in the expected identity after receipt. |
| Partial, extra, duplicate or changed event vectors; a valid receipt mixed with error/provisional claims; generic success, ACK-only or noHandler. | No coverage and no ACK. D:967-976,989-994 preserves the exact-vector and F4 whole-result predicates before any tag extraction. |
| Zero captured remote targets, but the selected source or a responsible subscriber has not returned a canonical result. | Still uncovered. D:953-961,1075-1080 requires the source and actual subscribers; an absent branch is not an empty successful set. A genuinely empty remote set does not waive source evidence. |
| One last subscriber or target remains undispatched while all others returned valid provisional ingress. | UNKNOWN; no cursor advance and no ACK. D:1063-1080 requires fair uncovered-first work, not completion inferred from the scheduling cursor. |
| A valid weak observation arrives after actual expiry while the timeout callback is delayed. | It supplies no tag, cannot mutate a successor and cannot revise the old caller's UNKNOWN. D:1009-1016 uses the creating invocation's clock/currentness operation, not timer execution as authority. |
| Every tag was accepted live, but the collecting invocation expires just before aggregation. | Only a new live invocation may compose provisional scan release after the full currentness check. D:1081-1089 neither re-polls every recipient nor renews the old caller. |
| A subscriber or selected source/topology service is replaced with the same textual ID. | Its old weak coverage is invalid. D:1009-1033 requires actual object/wrapper/service lifetime identity, not an ID-only cache. Old private update operations are fenced. |
| A route projection omits an unresolved group, or fallback selects another address. | The captured obligation is not deleted. Address repair retains the group; an observed route/service lifetime replacement invalidates that leaf's weak coverage and requires a fresh result (D:1025-1033). |
| A remote provisional cache is lost in an incarnation change the existing owners cannot observe. | The tag proves only historical ingress, not a cache lease or current liveness. D:1035-1043 makes that limit explicit; scan release discards it and later native redrive still needs actual receipts. It cannot become ACK authority. |
| A tenure changes while selection, a raw send or a subscriber callback remains unclosed. | Cell invalidation does not free child custody. D:1045-1051,1096-1102 forbids replacement hydration or overlapping owned callbacks until actual local cleanup closes. No detached payload/caller tail is admitted. |
| A cell contains both native and provisional leaves when it releases the scan. | The aggregate is only provisional, and all optimization state is discarded. Fresh native redrive cannot reuse old weak tags or promote them by cache contents/time (D:971-976,1075-1107). |
| An event supplies a fake coverage property, or another subscriber returned a matching event vector. | Neither grants coverage to this subscriber. D:953-961,1055-1061 confines updates to private operations bound to the actual source/subscriber context. |

### Concrete source seams still requiring implementation

The design names the correct existing owners but these changes are not already
implemented. `cdc/cdc-delivery-outcome.js:99-102` currently checks provisional
event bindings without an expected recipient group. Its remote composition at
`:114-118` is transport-aware, whereas a local result needs no fabricated ACK.
The same semantic owner must gain the stated strict recipient-group validation
and F4 checks; the source context retains the invocation/currentness gates.
A caller-local predicate or stripped response is not equivalent.

In particular, the present `buildLatencyCdcPropagationResult` at
`message-group/message-group-service-runtime-support.js:348-386` does not yet
retain `groupId` or canonical CDC outcome fields. D:996-1007's group identity
must therefore be supplied from the actual MG service/recipient and preserved
by that builder and forwarding paths. "Existing group metadata" must not be
read as evidence that the current result already carries it. This is an
explicit implementation obligation within the approved builder/validator
change, not permission to annotate a response with the dispatcher's expected
group. The transport response owner at
`transport/message-router-pending-response-ledger.js:508-523` already preserves
handler metadata, so no second transport response protocol is needed.

The production subscriber currently discards propagation's result and runs its
completion hook at
`bootstrap/shared/partition-cdc-propagation-subscriber.js:220-226`.
The source wrapper's delivered tracking is at
`partition/partition-cdc-delivery.js:468-484`. Both must consume the canonical
aggregate while preserving the distinction between partial internal progress,
provisional scan release and full native completion. The proposed context must
reach the actual seed/join bridges and subscriber wrappers; changing only
topology's return value cannot repair this interaction.

The current lane reset at
`partition/partition-cdc-obligation-delivery.js:138-146`
simply replaces its volatile lane, and current single-flight lives
inside that lane at `:590-611`. The newly specified cleanup charge must span
that replacement in the existing delivery owner. A new lane's empty
`inFlight` value is not proof that the previous lane's local children closed.
One-row hydration must also preserve the existing finite tail and explicit
256-row visit quantum; the existing ledger `.all` at
`partition/partition-cdc-obligation-ledger.js:125-138` is not itself that
memory improvement. No SQLite iterator or read transaction may span awaits.

### Nine-category delta coverage

The original 55 audit items and unaffected dispositions retain their earlier
source anchors and required proof. The finite F2-P delta covers every affected
category as follows; none is newly claimed runtime-verified.

| Category | Final design disposition and remaining proof |
| --- | --- |
| Admission/gating | APPROVE. D:967-976,1081-1107 defines separate exact weak/native predicates and the live scan-release cut. No native ACK or startup permission follows from weak coverage. Prove zero-target/nonempty-source, final-missing-leaf and noHandler cases through the same canonical owner. |
| Recovery/replay | APPROVE. D:1025-1051,1096-1107 fences lost tenures, preserves owed ledger identity and discards optimization before fresh replay. Prove same-text replacement, restart and mixed native/weak cell loss; historical topology membership and old delivered-row correspondence remain excluded. |
| Owner interaction | APPROVE. D:989-1007,1055-1061 keeps semantics in cdc-delivery-outcome, custody in the source lane and routing in topology/MG. Implement the builder, subscriber/bridges, source driver and registry/witness updates as one interaction; current source still drops needed results. |
| Harness fidelity | APPROVE design requirements. D:1119-1157 specifies one engaged source-scan/formation/native/ACK witness and removal of only the weak-coverage transition as its negative. The real source SQL path still needs legitimate write admission; import/setup failure, an unhit callback or a native-only fixture cannot prove this end-to-end claim. All of this remains unexecuted. |
| Transport/delivery | APPROVE. D:989-1007 separates local semantic and remote transport validation; D:1013-1016 rejects late answers regardless of delayed timers. Require actual group metadata round-trip, local no-ACK positive, real-router positive and wrong-group/conflicting-field controls. The distinct existing wire-domain limitation stays recorded. |
| Concurrency/serialization | APPROVE. D:978-985,1009-1016,1045-1051 retains one cell and lifetime-bound private operations, with actual cleanup custody across lane resets. Measure topology window/copy counts and prove a blocked old child cannot admit replacement hydration or a second retained caller population. |
| Formation circularity | APPROVE: F2-P is resolved at the design level. D:1063-1115 now gives multi-budget provisional coverage a finite scan-release transition to later metadata, without ACK. Prove the addressed follower remains a follower as F3's actual native route becomes usable, then obtain the native/source-ACK result in the same run. |
| Retry/redrive | APPROVE. D:1063-1089 prioritizes uncovered leaves and later subscribers without resetting the old invocation; D:1100-1107 reuses the existing provisional rescan and ACK owner. `partition-cdc-obligation-delivery.js:441-449,548-562` remains the retry path. Prove no repeated-prefix starvation, topology background work or ACK from partial progress. |
| Sweep/timers | APPROVE. D:1013-1023 requires synchronous creating-clock expiry checks but no TTL that erases valid weak coverage between attempts; D:1045-1051 retains unclosed local custody. No new timer/sweeper is proposed. Exercise differing clock origins, delayed timer callbacks, exact expiry and shutdown cleanup under the existing F1 limits. |

The decisive acceptance still is D:1119-1157's composite paired witness:
multiple target windows and source budgets; multiple responsible subscribers;
real provisional ingress; source scan reaching later metadata with zero ACK;
the still-follower native-route release; complete real afterCommit receipts;
and finally committed CDC_DELIVERED. The negative must engage those same
owners before failing the claimed progress assertion. No small provisional
positive or separate already-native large-fanout positive replaces it.

Proceed to bounded implementation and independent source review under the
existing ownership split. Exact-candidate locked-lab proof remains required
after source approval. This append resolves the design review, not those gates.
