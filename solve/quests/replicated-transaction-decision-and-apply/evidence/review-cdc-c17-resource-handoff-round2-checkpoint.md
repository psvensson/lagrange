# C17 hydration handoff amendment: independent round-two design review

Date: 2026-10-11. Reviewer: `subagent:/root/review_checkpoint_composition`.
Author-distinct, docs-only review. No source, test, metadata, index or Quest log
was changed. No broad test run was performed to review proposed functionality.

## Separate verdicts

- **Caller clause: REVISE narrowly for N2 below.** The waiter map, fixed caller
  deadline, independent shared generation, cancellation/reference cleanup and
  no-per-join-promise-reaction direction are coherent. Generation completion must
  additionally classify each waiter using its own current deadline/cancellation
  state before resolving it. Pending map membership is insufficient.
- **Full resource/transport handoff: REVISE for D6–D8 below.** The revision closes
  the earlier explicit mistakes in envelope preflight, ordinal custody,
  adopted-claim ownership, queued notification custody and row comparison in
  principle. Completion credit ownership, consumption of held-ordinal deferral,
  and the existing canonical row-digest allocation still prevent approving the
  complete proposed interaction as an executable contract.
- **Source remains rejected at `d23a0746bf5ee6c9b659d43abe27630d86d38397`.** N1 is
  still present in that source. R3-1/R3-2 source work is pending. Previously
  supported R3-4/R3-5/R3-6/R3-7 component dispositions are unchanged. This design
  review adds no source, normal-startup, physical-recovery or durable CDC
  original-event/ACK approval.

These are contract findings, not a demand that future implementation tests
already pass. There is no claim of a newly executed runtime deadlock or a new
source regression. The finding set is complete for this bounded review.

## Exact subject and loaded authority

`W` = `/mnt/data/peter/projects/.worktrees/tx1-cdc-20261011`.
`E` = `/mnt/data/peter/projects/.worktrees/rs-raft-candidate-20261011/test-output/continuation-20261011`.

**D** = `W/solve/quests/replicated-transaction-decision-and-apply/cdc-coverage-response-resource-handoff-amendment-20261011.md`,
SHA-256 **`12824e5047e8000b6eb85aa27c58c557b2683043ea7345d8da837d1d118ab17c`**.
All D line references below refer to these exact 470 lines.

The replaced amendment is preserved at
`E/cdc-coverage-response-resource-handoff-amendment-864abf590b82dbc302cfc721c3c26ed0aa1853048bb4fdf0ff529eb72d262207.md`,
SHA-256 `864abf590b82dbc302cfc721c3c26ed0aa1853048bb4fdf0ff529eb72d262207`.
The preceding complete review is
`E/review-cdc-c17-nontransport-and-resource-amendment-marker.md`, SHA-256
`c4d9d172dd9d69aa87198d29f1ffe1abb61ceb16f9f92fbb3f18020d2a32ecce`.
All three fingerprints were independently verified.

Read AGENTS, rules, router, architecture index, runtime contracts,
authority-and-recovery contract and all ten applicable verification templates.
Read the complete amendment, preceding review/findings, relevant underlying
C17 contract clauses, actual source owners/consumers and registered interaction.
Memory served only as routing/scope guidance; current files decide this review.

The prior `E/cdc-c17-round3-nontransport/source-manifest.sha256` contains 48
source/test/metadata entries plus the old amendment. Independently checked all
**48/48 source/test/metadata entries** against both live W and the exact d23
snapshot: no mismatch. The changed proposed amendment is separately pinned
above. Index observed as `4d45f84daa6d4a2639b4bd3d6ea5e819bf98360d` and left
unchanged. The old source verdict is not superseded by a docs revision.

### Source reference key

All source paths are relative to W.

| Key | Path |
| --- | --- |
| CT | `src/cdc/cdc-integration-service-authoritative-catchup.js` |
| RO | `src/cdc/cdc-coverage-reconcile-owner.js` |
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
| AR | `src/cdc/cdc-integration-service-authoritative-read-flow.js` |
| Registry | `test/shards/impact-contracts.json` |

## Complete findings, grouped by boundary

### N2 — generation completion can resolve an already-expired caller before its timer runs

**Caller deadline contract blocker. A3/A6, Y2/Y7, C2/C4, H3.**

D:60–84 correctly captures the caller deadline, gives each caller its own timer,
and deletes the exact waiter on expiry/cancellation. D:93–96 then says generation
completion settles every still-registered waiter with the exact outcome. That
rule does not check whether a caller's own absolute deadline is already spent.
A registered pending waiter can be expired while its timer callback is queued.
D:333–336 checks the shared generation deadline at publication, which is a
different deadline and does not fix this caller edge.

Permitted schedule:

1. A shared generation/long caller remains valid until t=2000; a joining caller
   is valid until t=1050.
2. At t=1040, synchronous decode/cache staging begins and finishes at t=1060.
   The shared publication is legitimate at t=1060 because its deadline is 2000.
3. Promise completion/microtask processing runs before the queued 1050 timer.
   The short waiter is still in the map and pending. D:93 as written gives it
   COMPLETE, removes it and clears the delayed timer.
4. The short caller's absolute deadline never gets its SPENT classification.
   The installed fact and long caller are valid and must remain so.

This does not require a hostile clock or arbitrary host mutation. The previous
review's real-clock pre-swap stall already demonstrates the relevant production
premise: synchronous cache work can outlast a scheduled timer. Current RO uses
promise completion and timers (RO:173–191,269–289,333–334). The proposed waiter
map does not yet exist, so this is an unclosed design schedule, not a claim that
a future implementation was run and failed.

**Required correction:** one exact waiter-settlement operation must synchronously
check current caller cancellation, captured caller deadline, lifecycle and pending
identity before choosing COMPLETE/FAILED versus SPENT/CANCELLED/RETIRED. Capture
what is needed before clearing references; delete and resolve the waiter once.
Use that operation for generation success, failure, shutdown and timer/cancel
callbacks. At/after the caller bound, return its own spent outcome even when the
shared generation legitimately succeeds. No retraction of the cache, cancellation
of other waiters, or shortening of the generation is permitted.

Add the delayed-timer/synchronous-stall ordering to D:117–142 alongside the two
existing join schedules. This is the only new blocker on the otherwise coherent
N1 caller-clause direction; it can be revised independently of D6–D8.

### D6 — reservation credits and later cache growth have two incompatible readings

**Allocation-order/progress contract blocker. A1/A5, Y4/Y5, C1/C5, F4, O3/O5.**

D:221–229/366 reserves S+C before materialization. D:203–208 separately requires
H bytes and a pending-handoff slot before response allocation. D:315–319 later
resizes the recipient claim for current K. The final peak at D:378–383 is
S+H+C+K. In contrast, D:261–273 calls H an *already charged* source slice that
returns to a live root. Calling C the consumer peak at D:221–223 may also mean
K was included earlier. These readings give different admission decisions.

If H and K are already reserved subcredits of S and C, the contract needs to
say exactly where those credits live while unused, what is debited on handoff,
and what remains unavailable to competing roots. If they are later incremental
reservations, S+C admission can spend the capacity needed to complete every
already-admitted operation.

Illustrative counter-schedule under the separate-reservation reading (not a
measurement of current page-v2 constants): a 128 MiB pool admits two S+C roots
of 63 MiB each. Each operation needs a 4 MiB H slice and 1 MiB later K, so either
operation alone fits comfortably at 68 MiB. Together the roots occupy 126 MiB
and neither can acquire H. Even when initial OFFER construction is synchronous,
the same state is reachable after an OFFER send callback returns H to the pool
and another root is admitted before the first CHUNK. Session/attempt expiry may
release both, but retrying the same admission order is not a completing-winner
rule. It can reproduce bounded refusal repeatedly without useful progress.
Pending-handoff/count credits require the same treatment as bytes.

K has a second time edge: the cache state measured before source materialization
can grow through normal CDC before installation. D:315 correctly demands a fresh
preflight, but says only to DEFER before new staging allocation when resizing
fails. It does not specify whether the old S/C and adopted state are dropped,
which credits remain held, and what winner can progress under repeated competing
resize failures. Current RC:292–313 releases the consumer and cancels the source
on a denied resize; this must be reconciled with the new independent source H,
adopted C and queued K lifetimes, not implicitly copied as “release everything.”

**Required correction:** give one non-overlapping debit/credit table covering
initial reserve, unused completion credit, OFFER/CHUNK transfer, return to a live
root, adoption, fresh cache preflight, denied growth, notification transfer and
last-owner release. Choose pre-owned completion capacity or an explicit bounded
release/retry rule with a completing winner under contention. Either choice must
leave external H/adopted/notification references charged until their owners
actually release them. Make the cache-version/growth case explicit and check
its current estimate in the same synchronous turn as staging admission.

Measured codec constants, concrete count maxima and runtime high-water checks
are later implementation obligations. The present blocker is that an implementer
must choose between inconsistent reservation semantics before those measurements
can prove the design. No new framework, larger global limit, or fairness scheme
outside the existing pool/reconcile owners is requested.

### D7 — held-ordinal DEFERRED has no progress-preserving consumer rule

**Transport/retry interaction blocker. A4/A5, Y1/Y4/Y6, T2/T3, O2/O3/O6.**

D:255–294 now correctly prevents reusing a source response slice until its exact
send terminal event. N+1 and duplicate N get bounded DEFERRED while N's callback
is held. That fixes the sender-side custody error. The actual recipient treats
any non-success chunk response as the end of the transfer (FC:144–147), releases
its chunk session in `finally` (FC:188–191), and RC:271–274 requests source CANCEL.
The reconcile owner then reruns the whole capture after backoff (RO:269–284;
RC:336–364). D specifies a new refusal but does not supersede that consumer rule
or identify a distinct same-transfer continuation result.

Use the document's mandatory legal ordering without any invalid evidence:
receive chunk 0, request chunk 1 before callback 0, get held-ordinal DEFERRED.
Under the current consuming rule, discard the partial recipient and CANCEL the
source. Callback 0 later releases a retiring root; it cannot continue chunk 1.
If this same legal receive-before-callback ordering recurs on each new capture,
a supported multi-chunk transfer continually restarts at 0. A single later fast
callback control could pass while leaving that normal ordering unhandled.

**Required correction:** specify how the real fragment consumer/reconcile owner
consumes a held-current-ordinal result while the transfer is still valid. Define
the exact retained transfer/next ordinal/partial chunks and C charge, unchanged
attempt/caller deadlines, current-lifecycle rechecks, and the event or bounded
retry through the existing owner that resumes that ordinal. Distinguish this
from missing/retired/contradictory sessions that really require recapture. If an
alternative whole-transfer restart policy is chosen, it must state a progression
argument under the repeated legal ordering above. Simply calling both results
DEFERRED does not provide that argument.

The source callback/pool wake and the recipient's receiving retry are not the
same call stack, especially on different nodes. Name how the actual waiting
consumer is reached; do not infer it from source-local diagnostic counters. A
second competing retry owner is not requested. Extend the paired witness to
**complete** a multi-chunk transfer while each N+1 request precedes callback N,
with callbacks eventually released inside the original attempt budget. Include
expiry/cancel controls separately. This is a contract/proof obligation, not a
requirement to execute nonexistent implementation now.

### D8 — the replacement drops the explicit row-digest allocation correction

**Encoding/whole-operation resource contract blocker. A1, Y5, H1/H5, O2/O3, J7/J8.**

The replaced amendment at line 118 explicitly prohibited JSON reconstruction
of `{key,row}` for a digest. D replaces that amendment, introduces the binary
page, removes the two-JSON row comparator (D:298–313), and counts “one digest
result”/“bounded digest work” in its timeline (D:367/372). It does not carry
forward the row/cell/observation digest encoding or its allocation rule. Binary
wire payloads and the new row comparator do not remove those actual call sites:

- SC:435–448 constructs cell/observation digests and `digest({key,row})`.
- ST:288–299 does the same for the large-row OFFER.
- CO:343–361 clones incoming rows and reconstructs each `digest({key,row})`
  before checking the observation and building cache coverage.
- Domain:160–162 hashes raw lower/upper cursor values for a cell.
- JSON's `digest` first builds a complete canonical serialized string;
  string values use the captured JSON serializer. A NUL value expands to
  escape text before the hash consumes it.

This is the retained R3-1 mechanism, not a novel hostile-host requirement. The
prior complete R3 review records a valid 3 MiB NUL-valued row whose tagged payload
was 3,145,877 bytes while one canonical row serialization was 18,874,869 bytes.
Those are retained diagnostics on the earlier source, not fresh executions in
this docs review; the relevant source paths are unchanged in the d23 census.
The new outside-page identity fast path addresses D5's other comparator
allocation and is worth preserving, but does not answer this digest path.

**Required correction:** explicitly name the canonical semantic row, cell and
observation digest producer/consumer rule under page-v2. Either retain the exact
canonical digest bytes using a bounded incremental encoder, or define the
explicit versioned semantic transition and its same-N compatibility; do not
silently change the conflict predicate. If any full serialization remains,
preflight and charge every simultaneously live representation before allocation
on both ends and include it in the S/C/K table. The old “no JSON reconstruction”
clause must not disappear merely because wire rows moved to binary.

Preserve same-N replay/conflict, cursor/absence authority and suffix UPSERT/DELETE
semantics. Pair source and recipient NUL digest controls with the outside-page
NUL comparator control, supported 8 MiB colocation, >16 MiB row, multi-page
backlog and interruption in the same eventual candidate. The measured arithmetic
must correspond to the chosen encoding throughout the actual handoff.

## Disposition of prior findings and accepted components

| Prior item | Disposition on D |
| --- | --- |
| N1 caller join | Direction fixed by waiter map and separate lifetimes at D:53–107; final settlement guard remains N2. No approval of unchanged RO:354–355. |
| D1 full response preflight | Coherent design direction at D:158–217: captured own fields, escaping, router wrapper, base64/string/frame graph and preallocation refusal. D6 still determines where admitted response credits come from; D8 is separate semantic digest work. |
| D2 source response reuse | Custody/gate rule corrected at D:257–290; source callback is distinct from recipient settlement. Whole-operation continuation is incomplete at the recipient: D7. |
| D3 adopted recipient claim | Ownership correction accepted as a design clause at D:231–253: pre-adoption CAS versus post-adoption recipient-only release, exact lifecycle/claim and no post-swap rollback. Actual implementation remains pending. |
| D4 notification custody | Ownership correction accepted as a design clause at D:338–353: queued token survives installation, releases on run/schedule failure/drop, installed fact survives. D6 still needs exact K credit accounting and growth failure. |
| D5 existing-cache comparison | Nonallocating schema/primitive comparator direction accepted at D:298–313, including identity fast path for untouched NUL data. Preserve canonical row defenses. D8 names the separate omitted digest allocation. |
| R3-1/R3-2 source | Still pending; revised design is not source approval or proof of 128 MiB aggregate accounting/colocated progress. |
| R3-4 | Preserve accepted final clock/current-generation fence: RC:176–190, CO:535 immediately before CO:540–545. D:333–336 retains installed facts after later caller exit. |
| R3-5 | Preserve accepted CRITICAL descriptor discovery (SC:263–271); RC:76–80 and D:415–418 keep payload BACKGROUND/BULK. |
| R3-6 | Preserve bounded diagnostic census across the node pool (PO:228–261). Proposed H/claim/notification objects must join that census; diagnostics never prove release alone. |
| R3-7 | Preserve primitive canonical bounded decimal N before regex/BigInt (CO:318–341; D:420–421). |

## Actual owner path and implementation proof boundary

Normal hydration callers in `src/bootstrap/node-joining-ready-signal-readiness.js`
and `src/control-plane/membership-publication-coordinator-reconcile.js` call the
catchup owner. CT captures one outer budget and invokes RC/RO by table. RC uses
witnessed source acquisition and the existing authoritative read gateway, query
executor, query message-group routing and partition handler. AR:511–516 expressly
skips a hosted full-table raw read for required owner RPC. SC obtains current
source scope using the CRITICAL recovery read contract and captures the applied
prefix and rows in one synchronous SQLite transaction (SC:398–412), with no
transaction spanning network waits. FC assembles/validates and CO alone decides
cache coverage/visibility. CDC events continue to retain newer suffix changes.

The proposed local handoff must survive the real handler and router adapters:
PE:72–81 currently adds acknowledged/success/partition/read-authority fields to
the source result, PE:765–769 invokes that wrapper, RI:476–493 adds the outer
SERVICE_RESPONSE, and RD:133–157 spreads local results. Admission/measurement
must cover the final captured result and wrapper; a private handoff or sentinel
must be consumed before generic spreading/stringification/error construction.
RI:435–457's ACK/noHandler and RI:502 onward's late response handling remain
transport evidence, never coverage proof or resource-release authority. The
recipient receive parser is RI:50–52; the eventual measured C must include its
actual input/frame/string lifetime, not only `Buffer.from(base64)` output.
These are named implementation consumption surfaces, not claims they already
implement D.

Current pool release synchronously updates retained state before waking registered
reconcile owners (PO:62–81,149–157; RO:150–151,376–397). Route/connection/cache
changes also wake the same owner through `cdc-integration-service-lifecycle.js`,
`cdc-integration-service-cdc-event-delegates.js` and the service cache listener.
D correctly adds no second semantic recovery ledger. Its new send and notification
release events must join the same chain. Remote held-ordinal continuation still
needs the explicit D7 rule.

No new tests were executed in this docs vet. Existing tests/reports were inspected
as retained controls and to identify actual seams. The earlier local 350-test
population belongs to d23's bounded nontransport review and was not rerun or
converted into transport approval here. The integration test
`test/integration/cdc-coverage-rejoin-formation.integration.test.js` uses actual
SQLite, query/cache/router owners with an in-process query-MG adapter; its >16 MiB
result is not a real WebSocket callback or complete normal-startup proof.
D:434–466 correctly requires future local/real-WS, cancellation, overflow,
notification and interruption witnesses plus registry updates.

## Complete 63-item category census

“Design supported” means the stated clause is coherent subject to the named
findings, not implemented/certified. “Retained” preserves earlier bounded source
approval; it does not broaden it. Each finding appears once above and is referenced
below rather than repeated as a new defect.

### A — admission

| Item | Evidence and disposition |
| --- | --- |
| A1 | REVISE D6/D8. D:158–217 requires reservation before response allocation and D:315 before cache staging; PO:117–145 is the actual shared-pool gate, CO:535 the publication gate. The reservation-credit table and digest allocations are not yet complete. |
| A2 | Design supported. D:71–103,385–409 distinguishes spent/cancel/retired/deferred/failed/installed; RC:159–190 consumes typed transport/install refusals. N2 qualifies caller terminal selection; no empty success is allowed. |
| A3 | REVISE N2. D:60–63/88–103 correctly separates unchanged outer caller and generation deadlines; CT:36–64 owns multi-table capture. Current RO:355 still ignores joins; proposed completion must recheck each caller, not just timers. |
| A4 | REVISE D7. D:263–273 gives a local non-wire handoff and D:404–408 classifications; PE:72–81, RI:476–494, RD:133–167 and RC/FC are real consumers. Held-ordinal DEFERRED needs a progress-preserving recipient consequence. |
| A5 | REVISE D6/D7. Send terminal event returns/frees H at D:269–273; notification token releases at D:338–346; waiter removal does not spuriously wake debt at D:139–142. PO:81→RO:150–151 is the existing local wake. Credit ownership and remote consumer continuation remain unresolved. |
| A6 | Retained/design supported for cache: RC:176–190 and CO:535 recheck clock/current lifecycle just before swap; D:333–336 preserves this. N2 separately requires the same current-clock discipline when settling a caller whose deadline differs. |
| A7 | Design supported. D:34–35/419 retains PO:228–261 actual node-pool holds; H/recipient/K identities must extend this census. D6 must remove ambiguity over which owner actually holds a reserved versus transferred byte. |

### Y — retries and progress

| Item | Evidence and disposition |
| --- | --- |
| Y1 | REVISE D7. RO:269–335 retains bounded attempt/backoff/cooldown and RO:376–397 event reentry. Missing route/read can retry; a held ordinal currently tears down the transfer and can repeatedly lose all progress. |
| Y2 | REVISE N2 only on caller classification. D:88–103 freezes the generation bound through unreadable work; D:60–84 gives the caller its own wait. Timers alone do not enforce that bound at completion. No source fact is required to time out a waiter. |
| Y3 | Design supported. D:385–409 enumerates terminal/retired/failed/deferred paths and separates semantic expiry from resource custody; N2/D6 qualify exact settlement and denied-growth cleanup. RO:223–266 has typed existing owner outcomes. |
| Y4 | REVISE D6/D7. Atomic colocated pair avoids the old fixed-consumer-before-source order, but later H/K acquisition and recipient CANCEL-on-held can still suppress completion under legal schedules. These are interaction rules, not missing benchmark runs. |
| Y5 | Partial. D:65–69 bounds waiter count per debt; D:203–208 bounds H/small replies; D:315/338 reserves notification metadata. Normal catchup uses the finite propagated-table set, RO:31–39 bounds retry/log cadence, PO:8–12 node bytes/sessions. D6/D8 prevent aggregate variable-data proof; no arbitrary-internal-caller global-count guarantee is inferred. |
| Y6 | Partial D7. D:275–282 stops duplicate allocation while HELD; D:245–253/345 identifies exact release tokens. Existing same-N cache replay/conflict controls remain. The recipient's same-ordinal continuation still needs its owned rule. |
| Y7 | Design supported with N2 caveat. D:80–103/387–409 forbids caller/attempt renewal from ACK, completion of another table, or later generation. RC:80/91 carries the original budget; waiter terminal selection must use that caller's deadline. |

### T — transport

| Item | Evidence and disposition |
| --- | --- |
| T1 | Design supported. D:48–49/275–276 explicitly separates ACK, handler return, receipt and actual release. RI:435 ACK precedes handler lookup; RC:54–59 excludes noHandler and requires a recognized semantic response. |
| T2 | Partial D7. D:245–253/267–290 correctly protects successor claims and old send identities; N+1-before-N-callback is explicitly mandatory. The present FC:144–147/RC:271–274 consumer makes that safety refusal abort progress. |
| T3 | Partial D7. Existing RC:148–173 maps noHandler, closed, timeout, queue pressure and malformed outcomes through the canonical classifier. D:210–217's capacity sentinel must be consumed by both real router adapters; absence remains a transport timeout/deferred observation, not proof of capacity or completion. |
| T4 | Design supported for waiting, partial D6 for progress. D:210–217/404–408 bounds even no-response capacity refusal by the existing request deadline and retains debt; no indefinite unbounded response queue is permitted. H custody still lasts until its actual owner releases, independently of caller timeout. |
| T5 | Design supported as future proof obligation. D:447–452 requires real WS callback/throw/close/shutdown and local parity. Existing TI's in-process MG adapter cannot prove socket lifetime. Add D7 repeated legal callback ordering, not merely one withheld callback followed by an easy recapture. |

### S — lifecycle and timers

| Item | Evidence and disposition |
| --- | --- |
| S1 | Design supported subject to N2. RO:65–71/173–191 and PO:23–29/143–145 own injected time/unref behavior. New waiter timers must use them; the current clock must also be read at settlement when callbacks are delayed. |
| S2 | Retained. SC:263–280/371–422 and ST:275–280 gate source role/scope/incarnation; D:415–421 preserves discovery priority without elevating payload. Resource permission is not read or mutation authority. |
| S3 | Design supported. D:105–115/385–402 distinguishes owner retirement, adopted consumer, router and notification lifetime. RO/PO current cleanup needs the proposed handoff extension; dropping JS sessions cannot discharge durable source/CDC debt. |
| S4 | Design supported. D:240–253/284–290/338–353 prevents caller deadline, TTL or cancellation from reclaiming copies owned by transport, recipient or notification queue. D6 must keep their actual credits distinct while held. |
| S5 | Retained dependency. Required owner-RPC recovery discovery uses CRITICAL bootstrap routing (SC:263–271); AR:511–516 avoids the target-cache/local-all-data dependency. Full closed-admission startup reachability is explicitly outside D:19–24/468–470 approval. |

### R — replay and state

| Item | Evidence and disposition |
| --- | --- |
| R1 | Retained semantic ordering. CO:395–420 stages cover/retire suffix; :430–447 combines rows and newer suffix; :494–545 stages then swaps table/tombstone/revision/coverage state; :546 publishes. D:312–313/333–353 preserves those facts under late resource callbacks. No hydration ACK can settle the separate durable event ledger. |
| R2 | Design supported. D:226–253 binds pair/claim to transfer, source/target lifecycle, generation, scope/domain/ordinal/deadline and separates adoption CAS from retirement. FC:139–156 demonstrates existing post-await identity checks to retain. |
| R3 | Retained/design supported. D:146–156 carries lower/exclusive-next/final inside binary payload; D:423–432 preserves incomplete/contradictory absence controls. RC:104–122 requires exact upper/next and authority; CO:305–361 validates coverage. D8 must preserve digest semantics. |
| R4 | Partial D7/D8. D:154–156/423–426 retains recapture and same-N replay/conflict, and D:275–282 limits duplicate custody. New encoding must keep the canonical semantic comparison; valid held ordinal must not endlessly recapture from zero. |
| R5 | Design supported. D:429–432 states unreadable is not empty; RC:159–173 and source-scope acquisition return typed failure/defer. No-response capacity path cannot be used as evidence of absent data or delivered work. |

### C — concurrency

| Item | Evidence and disposition |
| --- | --- |
| C1 | Partial D6. D:55–69 waiter admission, :226–238 pair CAS, :261–269 custody before allocation and :315–319 cache preflight are synchronous gates. Need the single executable debit/credit table before these gates can enforce one budget. |
| C2 | Partial N2/D6/D7. D:245–253 requires exact adoption/current lifecycle; FC:139–156 rechecks after network await; CO:535 final actuation is current. Add per-waiter completion checks, fresh K admission in the staging turn, and current same-ordinal continuation. |
| C3 | Design supported for ownership. D:231–249 provides a single adoption/cancel CAS, :257–282 one data handoff per ordinal/session and exact release. D6 must account its unused capacity so competitors cannot steal completion credit. |
| C4 | Partial N2. D:71–84/245–253/269–290/338–353 defines once-only exact release and no post-swap rollback. Generation completion racing a queued deadline still needs the N2 current-clock choice. |
| C5 | Design supported subject to D6. PO:32–49 uses actual node-shared pools; D:226–229 keys claims by exact recipient/generation, :268–273 keys sends by socket/send. Pair/H/notification count and bytes must debit that same pool rather than an unrelated diagnostic counter. |

### F — formation and end-to-end budget

| Item | Evidence and disposition |
| --- | --- |
| F1 | Retained path inventoried above: normal join/membership → CT/RO/RC → scope/gateway/query/MG/router → PE/SC/ST → FC/CO. AR:511–516 prevents preliminary local full read. New handoff must cross PE/RI/RD without stripping custody or manufacturing success. |
| F2 | Partial D7. Existing RO and service lifecycle/CDC/cache/route wakes reenter independently of complete target cache. New source send release is local; actual waiting remote consumer continuation must be named. No competing recovery engine is justified. |
| F3 | REVISE N2. D:117–142 has ordinary caller default/short/long/cancellation schedules and releases only that caller. Add delayed timer versus completion while longer work is valid. No force-open or READY shortcut is proposed. |
| F4 | REVISE D6/D8. D:182–201/355–383 names the whole peak and admits prior 8 MiB arithmetic is only a control. Require explicit supported 8 MiB colocation, >16 MiB row and multi-page backlog with complete measured copies/credits; inherited foreground budget is unchanged. Concrete coefficients are future implementation proof, ownership arithmetic is a present design choice. |
| F5 | Design supported. D:19–24 retains canonical owners and forbids snapshot transport reuse/new ledger/global limit increase. D:468–470 separates durable event recovery. No local raw bypass, force-open, SQL replay or second authority is proposed. |

### H — evidence fidelity

| Item | Evidence and disposition |
| --- | --- |
| H1 | Retained negatives are distinct: prior report N1 actual-service joins, earlier R3 review NUL serialization/TTL/colocation, previous Q2 real-clock staging. This review supplies source-traced design schedules N2/D6/D7/D8, not fabricated executions or new source failures. |
| H2 | Scope explicit. Actual owners/source were read; no proposed implementation was run. Existing TI is actual SQLite/router/query/cache with controlled in-process MG; future D:451 requires real WS. Failure latches must control actual callback/staging seams. |
| H3 | REVISE N2; retain D:122–132 and :284–290 schedules. Short/long/default deadlines and recipient-settlement/sender-callback ordering must be independently controlled. A delayed timer must not be masked by callback order or elapsed-time sleeps. |
| H4 | Design supported. D:147–156/158–178/226–229 carries canonical scope/domain/prefix/lifecycle/request/ordinal/length and captures preflight fields once. PE:79–81 and RI:476–493 supply additional measured wrapper fields; no hash label substitutes for full authoritative evidence. |
| H5 | Partial D6/D8. D:443–460 requires one-byte-below refusal, adequate completion, outside-page NUL and interruption. Keep original nonempty NUL digest/8 MiB/large-row/backlog controls cumulative; neither empty rows nor counters alone prove an affordable complete handoff. |
| H6 | PASS scope discipline. D:3–24/468–470 and this report separate design from d23 source rejection, normal startup, original durable event/lost ACK and physical/main acceptance. No future green test is required to revise the design findings. |

### O — owners and interactions

| Item | Evidence and disposition |
| --- | --- |
| O1 | Design supported. D:28–49 names reconcile, outer budget, node pool, source capture, fragment consumer, cache visibility/notifications and router custody separately. Resource tokens supply ownership evidence, not coverage or completion verdicts. |
| O2 | Partial D6/D7/D8. D:263–265 defines a local non-wire token; actual PE/RI/RD wrappers and RC/FC consumption are identified above. Reservation transfers, held-ordinal continuation and semantic digest rule require executable agreement across both ends. |
| O3 | REVISE cumulative interaction. D:434–461 asks one candidate to pair refusals and valid progression. N2/D6/D7/D8 specify additional schedules required to avoid shifting failure to the next owner. Earlier source controls stay in that eventual candidate. |
| O4 | Design supported subject to D7. D:98–103/154–156/423–432 keeps debt and canonical recapture after spent/stale sessions; stale callbacks release only exact tokens. Held-current ordinal must have progress without a permanent recapture veto. |
| O5 | Partial D6/D8. Waiter cap, single generation, response custody gate and pressure classes are retained; repeated callers must not create retained reactions or copies. Unused completion capacity and remaining serializer work must be in the same admission rule. |
| O6 | Partial D7. PO release→registered wake→RO is real; D:269–273 extends H release and :338–346 notification release. Name consumer propagation for remote held responses and preserve bounded fallback/backoff in the existing owner. Counters alone are not a wake. |
| O7 | Design supported. D:265 disclaims token semantic authority; :381–383 disclaims RSS equivalence; :429–432 denies absence/completion inference. Existing pool diagnostics and caches remain projections. Source descriptor/prefix and cache publication stay with their owners. |
| O8 | PASS provenance. Exact design/prior/report hashes and 48 frozen source/test/metadata entries were checked. Prior test populations/diagnostics are not relabeled as new results; new findings are explicit unclosed design schedules. |
| O9 | Adjacent callers inspected: AR required-RPC skip, PE wrapper, RI/RD response handling, RC/FC failure/cancel, RO retry and CO canonical hashing. No escape path is proposed; actual adjacent consuming behaviors expose D7/D8 rather than being assumed fixed by the new names. |
| O10 | Design supported as required landing work. Registry:894–942/1797–1860 has actual existing endpoints/eight witnesses. D:463–466 requires transport, waiter and notification additions plus local/WS paired tests. No metadata/source change occurred in this docs vet. |

### J — representation and JavaScript boundaries

| Item | Evidence and disposition |
| --- | --- |
| J1 | Design supported pending measured implementation. D:158–180 demands checked safe sums, UTF-8/UTF-16/base64/length bounds before allocation; D:420–421 preserves canonical N. Existing Domain/CO reject unsupported numeric/row forms. Required tests must cover -0, nonfinite and overflow without widening numeric owners. |
| J2 | Design supported. D:158–178 requires captured own primitive response fields and refuses accessors/exotics. Domain:118–131 checks row prototype/own descriptors. Actual wire values are parsed records; this does not claim every old internal helper is independently hardened. |
| J3 | Design supported. D:160/178 requires one captured shape for measure and consume; local handoff must retain that capture through PE/RI/RD. D6/D8 concern missing credits/representations, not permission to measure one value then serialize another. |
| J4 | Retained. Domain rejects proxies/custom row prototypes and checks own data; proposed comparator D:300–306 must reuse the canonical schema discipline. No existing protection is weakened or arbitrary-host threat scope added. |
| J5 | Design supported. D:163–177 requires bounded primitive identity/error/OFFER/wrapper fields before materialization, with fixed failure responses excluding offending input. Exact constants must be fixed/tested before source adoption; their absence as measurements is not itself a design rejection. |
| J6 | N/A to arbitrary runtime patch immunity. Existing JSON owner pins intrinsics; Domain/real parsed-wire contracts retain their established scope. No new requirement to tolerate arbitrary replacement of Promise/Map/Buffer/timeSource is imposed, and no existing defense may be removed. |
| J7 | REVISE D8. D:175 handles exact JSON escape measurement and D:298 removes row-comparison serialization, but SC/ST/CO/Domain canonical digest construction still needs its own encoding/allocation contract. Preserve exact bytes or explicitly version semantic compatibility. |
| J8 | Partial D6/D8. Existing RC:67–73 bounds dense rows to 256; D:146–156 avoids whole-dataset JSON rows/cursors and D:365 uses scalar probes. Whole row/cursor/digest/cache and aggregate handoff bytes still need complete reservation arithmetic; page count alone does not prove it. |

## Required next revision and checkpoint scope

Revise N2 independently if useful, preserving the proposed waiter map and shared
attempt owner. Revise D6–D8 together as the full source/router/recipient/cache
resource interaction: one charge table, one progress rule for a held valid
ordinal, and one canonical bounded digest path. Keep the new adoption,
notification and comparator clauses and the earlier accepted component corrections.

Then implement and register paired refusal/recovery witnesses through those actual
owners and obtain independent source review. Existing source remains frozen and
rejected; there is no approval to count the design as completed startup, durable
CDC delivery, snapshot recovery, replacement, physical acceptance or merge proof.
