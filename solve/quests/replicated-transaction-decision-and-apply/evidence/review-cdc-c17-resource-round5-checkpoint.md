# C17 resource handoff: independent round-five design review

Date: 2026-10-11. Reviewer: `subagent:/root/review_checkpoint_composition`.
Author-distinct, **DESIGN ONLY**. No source, tests, design documents, metadata,
index or Quest logs were changed. Diagnostics and this report are the only
new artifacts. No implementation or cluster tests were run for this review.

## Verdict and exact scope

**REVISE the complete resource design at
`25f149bdc3b1db073149fe5d73909e27d58c0682502844e679c77c13708195d4`.**

The original D10 omission is addressed for a single probe: Ps and Pr are
separate, charged terms; receipt does not release Ps; ordered admission includes
both live terms; a capacity refusal retains the exact probe and retries without
another probe or a renewed deadline. Those corrections are supported design
directions. Three remaining allocation/lifetime interactions prevent approval
of the complete handoff:

1. **D11: receive credit does not cover the entire authorized response lifetime.**
   Pr ends at generation retirement although a previously authorized response
   can still arrive; the recipient-upper OFFER also precedes its C admission.
2. **D12: retained probes can consume the completion capacity of every attempt.**
   Probe admission precedes endpoint ordering and is not coupled to enough
   remaining credit for one completing unit. A finite probe count alone does
   not establish this property.
3. **D13: required HELD/control responses are an additional live allocation.**
   The six-term boundary does not reserve their separately charged byte/count
   tokens while the data response already occupies H. Suppressing such a reply
   can consume the remaining attempt deadline instead of continuing the row.

These are **design schedules and source-grounded interaction gaps**, not
executed page-v2 failures, new source regressions, or demands that unimplemented
tests pass before design approval. Their complete corrections may use the
existing owners; no new store, generic retry framework, remote coordinator or
activation bypass is requested.

**The five-path N1/N2 source approval at
`2de419483c9b4ce9e3fabc87bb54d93e4afb8817` remains closed and unchanged.**
The caller/shared-attempt clause is byte-identical to the prior reviewed
revision. Its fixed shared-generation deadline is preserved. No concrete
interaction invalidating that source correction was found.

R3-4/R3-5/R3-6/R3-7 and the corrected D1–D9 design directions retain their
previous bounded scopes. R3-1/R3-2 allocation/colocation/transport source,
measured whole-operation bounds, normal startup, committed-event delivery and
lost ACK recovery remain unapproved. No BEGIN, activation, snapshot, replacement,
physical acceptance or main-merge claim is made or reviewed here.

## Provenance and navigation

`W` = `/mnt/data/peter/projects/.worktrees/tx1-cdc-20261011`.

`E` = `/mnt/data/peter/projects/.worktrees/rs-raft-candidate-20261011/test-output/continuation-20261011`.

`I` = `E/cdc-c17-d10-review`.

`D` = `W/solve/quests/replicated-transaction-decision-and-apply/cdc-coverage-response-resource-handoff-amendment-20261011.md`.

| Artifact | Independently checked identity |
| --- | --- |
| Current D, 846 lines | `25f149bdc3b1db073149fe5d73909e27d58c0682502844e679c77c13708195d4` |
| WIP snapshot containing exact D | `0e9a07604b5e29f0f686db3e567333c7775934df` |
| Preserved predecessor, Quest `evidence/cdc-coverage-response-resource-handoff-amendment-round4-35ad2ff5.md` | `35ad2ff5ee9d19467e89b662aa671a2a578d0fca1a38833c1642e99b97b603ea` |
| Prior complete report, `E/review-cdc-c17-caller-source-and-resource-round4-checkpoint.md` | `d11e6b39a80db53171ded41bb63c1370fa300891c00b5af26514c0d6d1c3b306` |
| Pinned source census, `I/navigation.json` | `8d9d33f08be445525cb53b125aeb791d543ce8ea7db33ebc3786342de0f1a486` |
| D12 arithmetic illustration, `I/retained-probe-capacity-schedule.json` | `bdc28c83bc46ae1f8c86fe5f367c8d546f7120fa564e27ab14fd93490bcca6f4` |

The current D matches its git snapshot exactly. The caller text from
`### Caller waiter` through the end of `### Shared table attempt` matches the
35ad predecessor exactly. All **18** navigation paths below were extracted
from immutable 0e9 and independently compared with 2de: **18/18 identical**.
Thus source navigation is pinned despite unrelated ongoing test-only work.
Copies live under `I/navigation-0e9/`; the design copy is
`I/subject-25f149bd.md`. Source line references below mean these pinned files.

| Key | Path relative to W |
| --- | --- |
| RO | `src/cdc/cdc-coverage-reconcile-owner.js` |
| CT | `src/cdc/cdc-integration-service-authoritative-catchup.js` |
| RC | `src/cdc/cdc-complete-coverage-reconcile.js` |
| PO | `src/cdc/cdc-coverage-transfer-owner.js` |
| FC | `src/cdc/cdc-coverage-fragment-consumer.js` |
| SC | `src/partition/partition-cdc-source-coverage.js` |
| ST | `src/partition/partition-cdc-coverage-transfer.js` |
| PE | `src/partition/partition-service-entry-apply-base.js` |
| CO | `src/cache/system-table-cache-cdc-source-order.js` |
| CN | `src/cache/system-table-cache-observation-methods.js` |
| Cache | `src/cache/system-table-cache.js` |
| Domain | `src/cdc/cdc-coverage-domain.js` |
| JSON | `src/utils/canonical-json-data.js` |
| RI | `src/transport/message-router-inbound-dispatch.js` |
| RD | `src/transport/message-router-delivery-behaviors.js` |
| PL | `src/transport/message-router-pending-response-ledger.js` |
| AR | `src/cdc/cdc-integration-service-authoritative-read-flow.js` |
| Registry | `test/shards/impact-contracts.json` |

Repository rules/router, architecture/authority-and-recovery and all ten
applicable verification templates were read. They preserve one semantic owner,
recovery independent of the condition restored, real resource terminals and
current accepted input defenses. Memory supplied routing/scope guidance only.
Manifest resource issues were not imported into this independent review.

## Complete grouped findings

### D11 — authorized incoming bytes outlive, or precede, their recipient credit

**Categories:** admission, transport, lifecycle, concurrency, resource ownership.

The new pre-request Pr reservation is correct as far as it goes:
D:332,348–360,509–517 reserves the fixed probe input/envelope maximum before
sending and validates receipt against that credit. However D:534–551 and
749–753 release Pr after dropping the reconcile reference on expiry,
cancellation or generation retirement. They explicitly permit the old Ps to
remain in MessageRouter after that point. A source callback, even when it has
already run, is not proof the recipient has received and discarded the frame.

The live route makes the missing lifetime material. RI:50–52 constructs a
string and performs `JSON.parse` before RI:84–85 selects SERVICE_RESPONSE or
RI:502–511 classifies its request. PL:358–375 and 387–408 retire a waiter on
abort/timeout, while PL:184–224 explicitly accepts the existence of later
responses. RI:516–538 classifies them only after that allocation. A semantic
late-response rejection therefore cannot establish preallocation safety.

Permitted schedule:

1. Generation g preowns Pr, issues one valid probe, and the source queues its
   admitted response. The response is delayed in transport.
2. g expires or is replaced. It drops its local reference and releases Pr as
   D:534–547 requires. A successor is allowed to reserve that freed capacity.
3. The valid old frame arrives on the still-live connection. RI allocates the
   receive string/result graph before discovering there is no current waiter.
   The old Pr is gone, and a different generation's claim cannot pay for it.

No hostile sender or stale-authority acceptance is needed. The issue exists
even when the old result is correctly discarded and never changes the cache.
The response's source Ps protects a different node and cannot cover these
recipient copies. The `PROBE_RECEIVED` state list also does not explicitly name
the request-sent/response-not-yet-received custody that must survive semantic
retirement.

There is a second entry edge of the same missing receive contract. In the
source-lower direction, D:333,335,393 admits recipient C+K **after receiving
the OFFER**. Pr is expressly scoped to the fixed probe response and its captured
binding (D:163–175,270–275,352–360); it is neither a general second-response
allowance nor C. Therefore the OFFER's input graph/parser copies arrive before
their named recipient allocation. No clause supplies another preowned input
subcredit or explicitly sizes/transfers a retained receive allowance for this
response. A bounded OFFER still requires a real bounded debit.

**Required contract correction:** separate generation-owned captured binding
from transport-owned outstanding receive custody. Name the preowned byte/count
credit for every probe/OFFER/control input before its current receive/parser
allocation, bind it to the exact request/socket/lifecycle, and identify the
actual terminal which releases it after semantic timeout. Alternatives may
discard through a bounded preparse path or retain a bounded router claim until
receive/drop/connection retirement, but must specify the actual owner's path
and count/byte backpressure. Do not silently equate waiter timeout, retired
ledger expiry, send callback, or source CANCEL with absence of future input.
Do not charge another attempt's Pr or exclude the received graph from the pool.

**Future paired witnesses:** delayed probe response after generation expiry
and successor admission; response in flight after a source send callback;
recipient-upper OFFER at the declared boundary; actual parse/drop terminal,
close and shutdown. Assert high-water and exact release as well as stale-result
inertness. These witnesses are implementation obligations, not required runs
for revising the design.

### D12 — finite retained probes can exclude every completing data unit

**Categories:** admission, progress, bounded concurrency, endpoint interaction.

D:348–360 admits Pr before endpoint ordering. D:374–415,528–533 retains it on
data admission failure and retries the same probe. This fixes the former
single-probe churn schedule. But it also makes those retained claims a separate
first acquisition, before the lower/upper ordering at D:386–410. No admission
rule relates their finite count to completion headroom, and no existing-owner
winner sheds/defers other probe acquisitions to let one unit complete.

Counting all current Ps/Pr in the balance prevents over-allocation; it does not
alone establish progress. D:468–488's completing-winner explanation and
D:819–821's affordable-opposite-transfer witness need this qualification.

`I/retained-probe-capacity-schedule.json` records the following **illustrative
design arithmetic**, not measured runtime constants:

| Per-node capacity / term | Units |
| --- | ---: |
| Configured capacity | 100 |
| Ps for one probe | 2 |
| Pr for one probe | 1 |
| S+H for one source unit | 98 |
| C+K for one recipient unit | 99 |

An isolated remote attempt fits the full live-probe boundary: source
`2+98=100`, recipient `1+99=100` (or less with an exact Pr-to-C transfer).
Now admit three probes X→Y and three probes Y→X for distinct legitimate table
debts. A finite probe count permitting those claims is consistent with the
present design; before callbacks, each pool has only six small probe claims.
Let **all Ps callbacks run and drain**. Each node retains three Pr claims.
Source, route and cache facts remain unchanged; no external pressure exists.

For `X < Y`, every X→Y source-first unit requires `98+3=101` at X and is
refused. Every Y→X recipient-first unit requires at least `99+2=101` at X,
even granting the design's best case in which its own Pr is absorbed into C.
No lower endpoint unit can start. No callback or admitted data unit remains
whose release can help. Each refusal keeps its exact Pr, so the same-probe
backoff repeats against the same balance until generation expiry. Subsequent
ordinary generations may repeat the same permitted ordering.

The numbers are algebraic, uniformly scalable and intentionally not proposed
configuration defaults. The defect is the absent relationship between allowed
probe population and a completable unit. A smaller count or reserved completion
credit could exclude this schedule, but that must be part of the contract;
“measure a finite count bound” (D:741–743) does not specify that relationship.
Two opposing probes can have the analogous issue for other permitted relative
Ps/Pr/unit sizes; no unsupported inequality between the unmeasured constants
is assumed here. The six-attempt schedule avoids depending on such an inequality.

**Required contract correction:** add an executable probe-admission invariant
that leaves enough byte **and count** capacity for a completing winner, or a
bounded release/retry selection under the existing pool/reconcile owners.
State how that selection works in both directions and colocation, including
retired outstanding receive claims from D11. It must preserve exact probe
identity and deadlines, avoid a second coordinator/claimant store, and not
merely raise capacity, renew windows, or call every self-created hold unrelated
pressure. Preowning appropriate completion credit or restricting probe
population according to the complete measured unit are possible directions;
this review does not prescribe the implementation.

**Future paired witnesses:** finite concurrent probes reaching the declared
count/byte bound, both node orders and colocation; all probe callbacks already
drained; at least one supported attempt completes and releases the lane for
the others. Include below-capacity truthful refusal with debt retained. The
specific count is selected with the eventual measured constants, while the
invariant must hold before those defaults can be approved.

### D13 — HELD/control response custody is outside the asserted complete peak

**Categories:** transport continuation, allocation accounting, deadline progress.

D:296–311 assigns small replies separately bounded bytes/count slots in the
same pool. D:555–578 allows only one H data-response cell; while HELD(N) is
occupied, an N+1 request emits `HELD_ORDINAL_DEFERRED`. This is a second response
graph, envelope and send token, alive simultaneously with H(N). Its source
debit is not one of S/H/C/K/Ps/Pr: Ps is expressly the probe's own response,
H is already in external custody, and terms may not borrow each other's credit
(D:286–302). The complete union at D:735–740 omits this simultaneous small-reply
term and its count slot.

Consider the mandated N+1-before-callback-N schedule at an exactly admitted
source boundary. Ps is still live, S is materialized, and H(N) is held; their
sum fills the source pool. Pr/C/K are held at the recipient. N+1 arrives before
callback N. The separately allocated HELD response cannot obtain its token.
D:304–309 therefore suppresses the reply and lets the request deadline classify
absence. Callback N and the probe callback may both run later **within the
original generation deadline**, but they cannot send the suppressed response.
Returning H to its root is also a custody return, not general spare pool credit.

The actual caller supplies `context.remainingMs()` as the request timeout
(RC:76–85); the post-ACK response waiter can consume that bound
(PL:387–408). Thus the existing path does not imply another same-ordinal retry
before the original generation ends. This defeats the declared positive
continuation at D:605–610/812–825 at that boundary without a bad row, lost
callback, changing cache or unrelated workload. Using a shorter bounded
request wait would need an explicit existing-owner continuation and accounting;
the current design instead says missing small replies settle at the request
deadline.

Even with spare capacity, several HELD/error/refusal replies can have delayed
callbacks. They need an aggregate bound and actual terminal release, not just
one-message sizing. Incoming control copies also require D11's receive rule.

**Required contract correction:** place all simultaneously possible small
response graphs/tokens in the non-overlapping debit table and acquisition
order. Preown sufficient bounded control credit as part of a completing unit,
or specify an executable no-extra-response continuation that still makes
progress under the original deadline. If H is expanded into disjoint data and
control subcredits, name both byte and count maxima and their actual terminals;
do not reuse externally held H(N). No new timer owner or global limit increase
is necessary or authorized by this finding.

**Future paired witnesses:** exact complete byte/count boundary, delayed probe
callback plus N+1-before-N callback, then delayed HELD reply callbacks; release
all within the original deadline and complete the same transfer. Include
one-byte/count-below refusal, no-response/callback-never-runs, close/shutdown,
and cumulative multi-chunk controls. This is a design correction requirement,
not a claim those future tests currently fail.

## Retained corrections and evidence limits

| Prior item | Current bounded disposition |
| --- | --- |
| N1/N2 | Approved five-path source at 2de unchanged; D:89–153 retains exact caller settlement, independent waiters and fixed shared deadline. No transport finding reopens it. |
| D1 | Captured full-envelope measurement D:228–250 remains the correct source direction. D11 completes recipient admission; D13 completes simultaneous control accounting. |
| D2/D7 | One exact H cell and same-ordinal continuation D:553–614 preserved. Actual send terminal remains required; D13 addresses capacity for the continuation reply. |
| D3 | D:426–435/499–503 source CANCEL cannot release adopted recipient C/K. Preserved. |
| D4 | D:660–675 notification token survives publication until actual queued run/drop. Preserved; installed state is not rolled back. |
| D5 | D:618–633 nonallocating canonical row comparison retains the outside-incoming-page NUL control. Preserved. |
| D6 | D:317–346/437–456 disjoint units and same-turn fresh K comparison preserved. D12 adds the pre-data probe population to completion admission. |
| D8 | D:677–708 bounded incremental canonical encoder preserves exact digest bytes and accepted domains. Preserved, implementation equality proof still required. |
| D9 | No `completionClaimant`; ordered complete data units, immediate refused-unit drain, state-before-release and publication-before-wake remain. D12 concerns the newly retained probe acquisition before that order. |
| D10 | Single probe's Ps/Pr overlap and no-reprobe continuation are explicitly repaired at D:163–176/321–384/505–551. The full interaction still requires D11–D13. |
| R3-4/5/6/7 | Final publication fence, recovery-priority discovery, actual pool census, strict applied-index text retained at D:774–795 and unchanged source. |
| R3-1/R3-2 | Whole allocation bounds, supported colocation and transport source remain pending. The design does not implement or certify them. |

The old 3 MiB NUL expansion, supported 8 MiB colocation, a single supported
row beyond 16 MiB versus a multi-page backlog, interruption/replay/conflict,
incomplete population/absence and newer suffix UPSERT/DELETE witnesses remain
cumulative (D:797–837). Measured coefficients and runtime high-water must
eventually establish the actual supported boundary. None of the illustrative
numbers above is a new performance threshold or proposed pool default.

## Category-complete 63-item disposition

“Covered design” below means an executable bounded direction within the stated
scope, not source acceptance. D11–D13 are enumerated once above; checklist
references identify their effects without creating duplicate findings.

### A — admission and current authority

| ID | Evidence and disposition |
| --- | --- |
| A1 | PO:117–146 enforces the same node balance that D:317–346 proposes to debit before allocation. D11 missing receive lifetime, D12 completion headroom and D13 control overlap prevent full admission approval. |
| A2 | D:304–311/767–772 names capacity DEFERRED versus identity/codec FAILED, never empty success. RO:317–351 remains the typed owner. No false success finding; D13 shows a correct refusal can still prevent required progress. |
| A3 | D:89–153/374–384/588–603 retains caller and generation bounds; RO:258–277/354–421 pins existing clock/backoff. No deadline renewal proposed. D13 needs continuation within that same bound. |
| A4 | PE:72–81/735–769 adds the real coverage result/witness wrapper; RI:476–494 adds SERVICE_RESPONSE. D:228–250/561–570 requires preflight through those consumers. Future typed probe/HELD integration is explicit; D11/D13 remain. |
| A5 | D:381–384/458–466/565–570/660–668 names local pool, send, remote timer and notification terminals. D12's drained-Ps schedule has no effective release until expiry; D13 suppresses the response needed for current reentry. |
| A6 | D:348–363/398–401/437–445/655–658 requires exact probe/current lifecycle, fresh K and final canPublish. RC:176–190/CO:535–545 owns current publication. Preserved; receiving stale bytes still needs D11 custody. |
| A7 | D:68–76/774–784 and PO:228–245 expose actual node/claim/category/binding holds. Proposed Ps/Pr/control diagnostics must name real owners; counters cannot repair D11–D13 or prove release. |

### Y — retries and progress

| ID | Evidence and disposition |
| --- | --- |
| Y1 | D:374–384/528–533 uses retained exact probe, current RO backoff and local wake. Single-probe churn corrected. D12 self-held probe population and D13 missing HELD response leave full progress unproved. |
| Y2 | D:534–551/745–765 bounds semantic work independently of unreadable source. RO:258–267 deadline race survives unavailable replies. External receive custody must survive retirement correctly: D11. |
| Y3 | D:365–372/534–543/745–772 lists volatile probe and typed terminal states. Request-sent/late-input custody is incomplete at D11; other failed/stale/spent exits retain debt rather than reporting hydration. |
| Y4 | D:386–410 orders data units, but D:348–360 first retains probe claims outside that order. D12 supplies the finite both-direction no-winner schedule. D13 adds response-capacity suppression during otherwise valid continuation. |
| Y5 | D:277–302/735–743 requires bytes and counts; RO bounds attempts by time and existing cadence. Finite probe count needs D12's completion relation; small-reply overlap/retention needs D13. No aggregate or RSS proof granted. |
| Y6 | D:365–384/426–435/592–603 preserves exact probe, pair, transfer and ordinal; only successful chunk advances. Same-N replay/conflict and no SQL rerun remain required. D11 must bind retired input to the exact old request. |
| Y7 | D:131–147/374–384/596–603 prohibits deadline renewal by receipt/ACK/table progress. Closed N1/N2 source preserves this. D12 can repeat in later ordinary generations but cannot renew an individual generation. |

### T — transport

| ID | Evidence and disposition |
| --- | --- |
| T1 | RI:435–457 ACK precedes handler lookup; RC:54–59 rejects ACK/noHandler as page completion. D:82–83/565–570 excludes ACK/return from release. D10 correctly distinguishes probe receipt from send terminal. |
| T2 | D:534–551/572–603 binds old callback and N+1-before-callback-N. RI:50–85 and PL:184–224 show late receive allocation still occurs: D11. D13 accounts the simultaneous HELD response required by that ordering. |
| T3 | RC:159–173 canonical transport classification; D:304–311/576–603/767–772 proposes typed capacity/HELD/missing/stale outcomes through PE/RI. Classification direction is coherent; D13's timeout cannot substitute for supported continuation. |
| T4 | Missing handler/route/reply remains bounded by existing request/generation deadlines (RC:76–85, PL:387–408). D11 owns late-input aftermath; D13 covers capacity-created absence at an otherwise supported boundary. No indefinite semantic queue approved. |
| T5 | D:812–826 explicitly requires real WebSocket probe/callback/throw/close/shutdown and local controls. RD:698–701 currently lacks the proposed handoff. No stub-only or new runtime witness is claimed in this design review. |

### S — clock and lifecycle

| ID | Evidence and disposition |
| --- | --- |
| S1 | RO:258–277 injected clock and unref timers retained; D:588–591 reuses that owner. No new timer family proposed. Future D11/D13 witnesses independently order expiry and callbacks rather than compressing the authority deadline. |
| S2 | SC:263–271/371–422 preserves owner-RPC, current source lifecycle and captured applied prefix. D:778–784 retains CRITICAL discovery and BACKGROUND/BULK payload. No resource priority becomes Raft authority. |
| S3 | D:151–153/534–551/761–795 retires volatile work while durable debt survives. D11 is the missing router receive lifetime when JS generation references vanish. Full production restart remains outside approval. |
| S4 | D:430–435/499–503/745–765 correctly distinguishes caller, source, recipient and notification expiry. Ps/H remain externally held after TTL. Pr's pre-receipt retirement needs D11; legitimate row continuation needs D13. |
| S5 | AR:511–516 and SC:263–271 retain recovery reads through the existing owner path without full local materialization. No activation/readiness prerequisite added here. D12 is a resource-cycle issue; normal startup remains a separate gate. |

### R — recovery and publication

| ID | Evidence and disposition |
| --- | --- |
| R1 | CO:395–445 stages coverage/suffix/current rows; CO:494–545 stages tombstones, revisions and final swap. D:618–675 retains those mutations and current fence; no stale result may clobber newer suffix or installed state. |
| R2 | D:348–372/426–435/534–551 binds source, recipient, generation and exact adopted claim. Late release cannot steal a successor; D11 adds the missing input owner even when stale authority is correctly refused. |
| R3 | D:216–225/774–795 preserves final/next boundaries, incomplete partition-set negatives and canonical scope. Missing source never means empty coverage. No vacuous empty positive is relied on here. |
| R4 | D:572–608/677–708/786–789 keeps same-ordinal continuation, exact same-N replay and conflicting-byte refusal under unchanged digest semantics. Source/session loss recaptures durable data; no SQL reexecution is introduced. |
| R5 | D:767–795 preserves DEFERRED/unavailable versus complete, and debt after lost answers. RI late-response diagnostics do not certify coverage. D11–D13 do not justify inventing completion to free capacity. |

### C — concurrency and custody

| ID | Evidence and disposition |
| --- | --- |
| C1 | D:317–346/509–527 orders synchronous token acquisition before source materialization, data handoff and staging. D11 receive admission precedes some claims; D12 precedes data order; D13 requires another owned subcredit. |
| C2 | D:361–363/398–401/439–445/592–603 revalidates exact binding after waits and current K before staging. RC:176–190 supplies final fence. Binding revalidation does not retroactively reserve already parsed input: D11. |
| C3 | D:426–435/555–570 gives single exact pair/adoption/data-send winners. No old claimant marker is restored. D12 requires an executable completing choice for probe population, not another semantic authority. |
| C4 | D:490–503/534–543/660–668 sets fact/outcome before synchronous wakes and releases each exact token once. PO:81 confirms synchronous wake behavior. Late receive/refusal/callback races require D11/D13; post-swap rollback remains forbidden. |
| C5 | PO:32–49 node-shared pool matches D:321–328/386–403 endpoint ordering. Ps and Pr belong to different nodes and cannot pay each other's copies. D12 and D13 apply to this actual shared byte/count balance. |

### F — production flow

| ID | Evidence and disposition |
| --- | --- |
| F1 | Existing chain CT→RC/RO→AR→PE/SC/ST→RI/RD→FC→CO/Cache is identified above. RI parser and PL timeout are part of the resource interaction, not invisible infrastructure: D11/D13. No local raw-read alternative proposed. |
| F2 | RO:354–421/522–544 remains the only retry/cooldown/wake owner; D:374–384/458–466 proposes its in-attempt continuation. D12's self-held probes and D13's missing response need effective release paths within it. |
| F3 | D:89–153 preserves independent caller settlement and longer shared work under the fixed deadline. Prior 2de source approval applies. Receive retirement is a separate transport obligation, not grounds to extend or reopen caller waiting. |
| F4 | D:710–743 names Ps+Pr+S+H+C+K peak, D:808–837 supported 8 MiB colocation, large >16 MiB row and backlog. Arithmetic single-probe fit is coherent; D11–D13 prevent full operation peak/progress approval. Coefficients still require measurement. |
| F5 | D:53–58/397–403/677–708 forbids snapshot-only reuse, new coordinator, SQL rerun or digest compatibility shortcut. AR:511–516 keeps owner-RPC. No force-open, caller urgency or global-limit increase is accepted. |

### H — evidence quality

| ID | Evidence and disposition |
| --- | --- |
| H1 | D11–D13 are explicitly source-grounded design schedules, not new runtime reds. Prior d11 report and D:786–837 retain NUL, colocation, join and temporal controls. No setup/import failure or arithmetic illustration is called a runtime reproduction. |
| H2 | RI/RD/PL pin native route lifetime; SC:398–412 pins real SQLite capture; CO pins actual cache swap. Proposed fault latches/real WebSocket witnesses are distinguished from existing source and future integration acceptance. |
| H3 | D:812–818 controls probe receipt versus callback; D:822–825 controls every N+1 versus callback N. D11 adds expiry-before-input; D13 includes positive callback release inside the original budget. No deadline change makes a schedule pass. |
| H4 | D:348–363/545–551 requires complete scope/N/cell/ordinal/request/node/lifecycle/generation binding. D11 asks that exact identity also bind receive custody; arbitrary counters or messageId alone cannot establish resource/semantic authority. |
| H5 | D:810–837 requires supported and oversized nonempty data, outside-page NUL, same-row continuation and useful publication. D12 arithmetic permits individually full-fitting units; no empty page or permanently lost callback creates its hold. |
| H6 | Exact D, predecessor, prior approval and 18 pinned source paths recorded above. No runtime tests or source approval from this turn. Normal startup/durable event ACK and all unrelated acceptance obligations stay open. |

### O — owners and interactions

| ID | Evidence and disposition |
| --- | --- |
| O1 | D:60–83 keeps reconcile/debt, transfer capacity, source authority, router sends/receives, recipient decode and cache publication distinct. D11–D13 must be corrected in that interaction, without a competing readiness or progress oracle. |
| O2 | D:561–570 proposes a local non-wire `ServiceResponseResourceHandoff`; PE:72–81/RI:476–494 are real wrapper consumers. Pr input custody and HELD/control token propagation remain incomplete (D11/D13). |
| O3 | D:797–837 requires refusal and supported recovery in one candidate, cumulatively. A single-probe accounting positive cannot replace D12 concurrency or D13 same-ordinal completion; future tests are obligations, not current design-approval prerequisites. |
| O4 | D:361–363/413–415/534–551 retires stale binding and permits later ordinary generation recapture. No permanent claimant veto remains. D12 needs a path beyond repeating a finite self-created capacity hold. |
| O5 | D:286–311/374–384 forbids borrowed credit, force and renewal. D12 shows repeated legitimate probes still amplify retained pre-data credit; D13 shows source backpressure must include control replies. Fix owners rather than bypass limits. |
| O6 | PO:62–81 actual release synchronously wakes registered local callbacks; RO:522–544 currently ignores in-flight wake. D:458–466/588–603 explicitly proposes current-owner continuation, with bounded remote timer. D12/D13 identify missing effective progress; no second loop requested. |
| O7 | D:157–176/397–403 treats claims/counters/node ordering as custody/correlation, not source or publication authority. D:655–658 keeps canPublish authoritative. Hashes and source callback cannot prove recipient input gone (D11). |
| O8 | Immutable 0e9/2de navigation, exact design/predecessor and arithmetic-artifact fingerprints above. No source/revert controls were run or mixed into a positive population. Prior d11 source evidence remains independently scoped. |
| O9 | Inspected AR local-read gate, PE wrappers, RI parser/response path, PL late/timeout ledger, RD send, RC/FC retry and finalizers, RO wake/backoff and PO shared pool. The three reachable gaps are reported together; no alternate path is proposed to hide them. |
| O10 | Registry:894–942/1797–1860 owns the existing interaction. D:839–842 requires new live transport/cache/caller endpoints and real local/WebSocket witnesses together with implementation. Metadata/source work remains proposed; not silently certified by this docs-only review. |

### J — JavaScript and exact byte domains

| ID | Evidence and disposition |
| --- | --- |
| J1 | D:228–275 requires safe checked lengths/sums, base64 and UTF-16/envelope arithmetic; ST:73–80 current checked sum. Existing canonical numeric/applied-index domains retained, including nonfinite/-0/overflow exclusion. Missing terms, rather than overflow, are D11/D13. |
| J2 | D:228–250 captures own primitive wire fields and rejects exotics; JSON:109–174 owns strict record/dense-array predicates. Pr and full wrappers must consume those same captures. No inherited identity becomes authority. |
| J3 | D:228–250 measures once and consumes captured values; D:439–445 same-turn K preflight/staging. D11's issue is when custody starts/ends, not a demand for arbitrary trusted-local getter immunity. |
| J4 | Domain/JSON existing prototype and canonical-data defenses remain; D:685–702 preserves them in incremental encoding. No new arbitrary-host threat model or weakened sealed input guard is introduced. |
| J5 | D:245–248/304–311/348–360 bounds primitive identities, reason/error fields and scalar probe before output allocation. A bounded graph still needs its simultaneous debit: D11/D13. No truthy response is treated as installed. |
| J6 | JSON:1–25 pins its declared intrinsics contract; D:685–708 preserves that existing owner in bounded mode. No blanket claim of runtime monkey-patch immunity for unrelated local pool/signal objects is made. |
| J7 | D:618–633/677–708 preserves canonical primitive comparison and byte-identical digest/string escaping without whole expanded NUL serialization. Existing-cache NUL outside the incoming page remains a required control; Ps/Pr wrappers still measured before allocation. |
| J8 | D:252–302/710–743 requires individual/aggregate rows, object metadata and byte/count limits, not page-only materialization. Probe population and simultaneous small replies require D12/D13; no all-data scan or unbounded queue is approved. |

## Completion and next bounded step

All 63 instantiated obligations have concrete dispositions. The complete new
finding batch is D11–D13. Revise the resource interaction for receive lifetime,
probe admission/completion capacity and simultaneous continuation responses;
retain the corrected D10 identity and fixed-deadline continuation. Then the
design can be reviewed for executable consistency before transport source
implementation and its cumulative proofs. The closed caller source scope at
2de remains available now.
