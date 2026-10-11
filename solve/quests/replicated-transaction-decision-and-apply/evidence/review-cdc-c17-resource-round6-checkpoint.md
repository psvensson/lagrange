# C17 complete reservation and receive custody: round-six design review

Date: 2026-10-11. Independent reviewer:
`subagent:/root/review_checkpoint_composition`.

## Scoped verdict

**REVISE DESIGN** at
`ab37ab327409e5d173c3be858c26814c6bc94286b48a511d0fa7145798df1dfa`
for the single grouped finding **D14: shared native receive admission and
dispatch** below.

The new authoritative section addresses the previous D11–D13 schedules at the
owned-credit contract level:

- **D11 lifetime:** expected input receives its own predebit, including the
  recipient-upper OFFER; semantic retirement transfers outstanding receive
  custody to MessageRouter instead of releasing it with Pr.
- **D12 progress:** complete source and recipient units are acquired before the
  first probe, in the same lower-then-upper order. No probe-only claimant is
  retained after an upper-unit refusal.
- **D13 overlap:** Wr, Wo and matching input credits are separately included for
  HELD/error/refusal/ACK/request traffic while H and Ps remain externally held.
  The count derives from the unchanged deadline and enforced positive cadence.

These are supported **design corrections**, not source approval. Their
composition still needs D14 because the newly specified WiIngress owner starts
at a boundary later than native message assembly and has not specified how CDC
classification coexists with ordinary messages on the same router.

**The approved five-path N1/N2 source at
`2de419483c9b4ce9e3fabc87bb54d93e4afb8817` remains closed and unchanged.**
No caller-source behavior is reopened. Its independently bounded callers and
fixed shared-generation deadline remain acceptance inputs.

No implementation tests are required to pass merely to approve a coherent
revision of this design. This review ran no source or cluster tests. No source,
test, design document, metadata, index, Quest log, commit or remote was changed.
Only this report and its diagnostic copies were written.

## Exact subjects and evidence

`W` = `/mnt/data/peter/projects/.worktrees/tx1-cdc-20261011`.

`E` = `/mnt/data/peter/projects/.worktrees/rs-raft-candidate-20261011/test-output/continuation-20261011`.

`I` = `E/cdc-c17-round6-review`.

`D` = `W/solve/quests/replicated-transaction-decision-and-apply/cdc-coverage-response-resource-handoff-amendment-20261011.md`.

| Artifact | Verified SHA-256 / identity |
| --- | --- |
| Current D, 1111 lines | `ab37ab327409e5d173c3be858c26814c6bc94286b48a511d0fa7145798df1dfa` |
| Preserved Quest `evidence/cdc-coverage-response-resource-handoff-amendment-round5-25f149bd.md` | `25f149bdc3b1db073149fe5d73909e27d58c0682502844e679c77c13708195d4` |
| Prior complete review, `E/review-cdc-c17-resource-round5-checkpoint.md` | `88be444a311b7b7d5d7e985bac9b53599b84b171bd2e8c79f609ea1433dc9ff3` |
| Navigation snapshot | `0e9a07604b5e29f0f686db3e567333c7775934df` |
| Source and installed dependency census, `I/navigation.json` | `54d4b25e402809084dae173dae70fbc7c22f44822b80631530124b21bd0b6bbe` |

The **entire prior 846-line design is an exact byte prefix** of D. It was read
in round five; the full added section D:848–1111 was read in this round and the
interaction traced against that unchanged prefix. The caller/shared-attempt
clause is also independently byte-identical. D:857–861 expressly supersedes
the older acquisition/table/peak where they conflict, so this report uses the
new complete-unit timeline rather than treating preserved historical clauses
as competing requirements.

Twenty navigation source files were extracted from immutable 0e9 into
`I/navigation-0e9/`. **20/20 match the currently observed source bytes.**
The 18 core navigation paths also retain the prior comparison to 2de; the two
additional paths are the existing server and connection constructors. No
unrelated mutable source observation supplies an approval here.

Installed dependency **ws 8.21.0** is pinned separately: its package and four
source files are copied into `I/installed-ws-8.21.0/`, with individual hashes in
`I/navigation.json`. The immutable 0e9 `package-lock.json` also declares ws
8.21.0 and its package integrity, recorded in that manifest. These are actual
installed-source observations, not a claim that the proposed receive adapter
already exists.

### Reference key

All application paths below are relative to W and refer to pinned navigation
copies. WS paths refer to the separately fingerprinted installed dependency.

| Key | Path |
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
| Server | `src/transport/message-router-server-lifecycle.js` |
| Dial | `src/transport/message-router-connection-lifecycle-methods.js` |
| AR | `src/cdc/cdc-integration-service-authoritative-read-flow.js` |
| Registry | `test/shards/impact-contracts.json` |
| WSReceiver | `I/installed-ws-8.21.0/lib/receiver.js` |
| WSBuffer | `I/installed-ws-8.21.0/lib/buffer-util.js` |
| WSServer | `I/installed-ws-8.21.0/lib/websocket-server.js` |
| WSSocket | `I/installed-ws-8.21.0/lib/websocket.js` |

Rules/router, authority-and-recovery and the same ten verification templates
govern this cumulative review. Their current-owner and trusted-host boundaries
are retained. No independent manifest or activation issue is imported here.

## Supported changes and executable scope

### Complete-unit acquisition closes the old probe-only hold

D:905–914 reserves Wbase inside the same configured pool; it cannot be borrowed
by data. D:918–956 defines Esource/Erecipient including all simultaneous probe,
data, control, input and output copies. Lower acquisition precedes upper
acquisition, and an upper refusal releases the lower unit before retry. Only
then can one probe be emitted. Colocation reserves the complete union atomically.

Under that interpretation, the prior six-probe example cannot arise: every
retained Pr has already secured its completing unit at both endpoints. With
two opposite affordable pairs, the same lower pool adjudicates both first
units. If only one fits, its peer owns no upper unit; if both fit, the upper
pool can grant a completing pair while a refused loser drains. Existing exact
token identity, pre-adoption cancellation/TTL and current-source checks remain
applicable (D:398–435,935–980). A lost admission answer must be redriven or
retired under those exact owners and identities, never treated as proof that
the remote grant did not occur. This is an implementation obligation under the
existing idempotent acquisition/retirement contract, not a new coordinator.

The supported arithmetic is conditional on actual available byte/count credit
covering **Wbase plus the complete role units**, including older external holds.
It does not promise completion if a connection permanently retains earlier
tokens or if the cache keeps changing. Under stable prerequisites and available
complete credit, the old first-time allocation of H/K/Pr cannot strand a unit.
D14 remains necessary to make Wbase's native receive term executable.

### Late receive and HELD copies now have explicit owners

D:1007–1039 predebits WiPending before the request, binds it to exact socket and
request generations, and transfers it to router custody after semantic
retirement. Drop or drained exact connection retirement releases it. PL's
retired-waiter expiry alone cannot release that token. This corrects the prior
Pr-on-expiry schedule at the expected-response lifetime level.

D:875–903/1048–1064 separately charges request/ACK output and small responses.
H(N), Ps and multiple Wr callbacks may overlap. The recipient's corresponding
Wi is also preowned. The existing positive retry cadence supplies a finite
bound; no callback or capacity wake may quietly invalidate that assumed cadence
or reset the original deadline. Once a resource count is spent, the typed
outcome stops further emission rather than borrowing another attempt's credit.

No numerical defaults or coefficients are approved. In particular PO:8–13's
current 128 MiB and eight-session settings are observed source values, not
evidence that a proposed complete unit fits. The eventual source must make root
session counts and subordinate wire-token counts explicit, preserve the current
limits' meanings, and show supported 8 MiB colocation and the defined large-row
case within the unchanged pool. A finite algebraic count is not a measured
default and is not permission to raise a limit. These measurement obligations
are not additional design rejections.

## D14 — WiIngress starts after native receive allocation and lacks a shared-router dispatch boundary

**One grouped DESIGN finding. Categories:** admission/allocation, transport,
concurrency/lifetime, production interaction and fidelity of resource evidence.

### Proposed boundary

D:868–874 says Wi includes raw-frame/string/parser custody. D:905–910 puts
WiIngress in a nonborrowable Wbase sized for the maximum admitted coverage
sessions. D:1011–1018 takes WiIngress **on raw-frame delivery**, after checking
the frame's length, then creates a string and parses it before identifying the
message. A match transfers to WiPending; a different message is classified and
dropped inside WiIngress.

There is no executable definition of how that coverage-session bound covers
the preceding native receive buffers, or how a coverage-only ingress claim is
selected while ordinary service traffic uses the same unparsed connection.
This is not resolved merely by measuring the parser's later string size.

### Observed native allocation and dispatch order

The actual existing path is:

1. **Socket construction:** Server:104–110 sets port and optionally host, then
   creates `WebSocketServer`; Dial:314 creates `new WebSocket(address)`. Neither
   sets a coverage-specific receive bound or selects a coverage-only socket.
   WSServer:68–76 and WSSocket:670–681 default to **100 MiB maxPayload**. This is
   an observed native per-message ceiling, not a Lagrange supported-result or
   acceptable-memory claim.
2. **Before application delivery:** WSReceiver:437–450 checks that native
   message ceiling. WSReceiver:509–534 retains incoming fragments.
   WSReceiver:601–607 moves the fragment array to a local variable; for text,
   WSReceiver:634 concatenates it before emitting `message` at 650/655. With
   multiple fragments, WSBuffer:15–25 allocates and fills another full Buffer.
   Thus native fragments and the assembled Buffer can coexist before RI runs.
3. **Inside the router:** RI:50–52 performs `JSON.parse(data.toString())` before
   reading type/messageId. Native Buffer references coexist with the temporary
   string and parsed wrapper/result graph. RI:59–91 then dispatches IDENTIFY,
   PING/PONG, ACK, SERVICE_RESPONSE and SERVICE_MESSAGE through this common
   entry. RI:502–511 and PL:184–224 select the pending/retired response only
   after full parse.

The proposal can preown some fixed reserve before all these steps; the problem
is that it has not bounded the actual producer population/size to that reserve
or specified its integration with ordinary dispatch. Claiming a child ingress
slot after native assembly cannot retrospectively establish those bounds.
The installed dependency source also demonstrates why native buffer references
must not be declared gone merely because the router dropped its parsed result:
the emitter's fragment/Buffer variables or deferred emission closure can still
own them while the consumer callback runs. The correction must identify the
actual last-consumer boundary; this review does not claim a measured GC or RSS
number.

### Reachable interaction choices the design has not resolved

Consider a fragmented coverage response alongside an ordinary noncoverage
SERVICE_RESPONSE on the same router connection. Both are valid classes of the
current wire path. The ordinary message has no coverage WiPending claim and
need not conform to the new coverage envelope maximum. No arbitrary prototype
mutation, hostile process or Byzantine sender is required.

- If Wbase is sized only from coverage session/envelope bounds, ordinary
  accepted router traffic or preclassification fragment accumulation is not
  thereby bounded by Wbase. Checking the final Buffer length happens after
  native proportional allocation. Fully parsing first and only then deciding
  it was not CDC also fails to give a coverage-specific preparse boundary.
- If every frame is fully parsed under Wbase, its budget and concurrency must
  account for the actual shared native receive population/limits and every
  simultaneous fragment/assembled Buffer/string/graph copy. The design does not
  supply this accounting or establish that the resulting reserve leaves a
  supported pair affordable under the unchanged pool.
- If every nonmatching message is dropped as D:1017 says, applying that rule to
  the common entry would discard ordinary pending SERVICE_RESPONSEs and other
  normal router messages. If “different” means only an invalid/foreign CDC
  frame, the preceding bounded classification that establishes that distinction
  must be named. WiPending message correlation is unavailable until the current
  full parse has already occurred.

These are alternatives permitted by the incomplete boundary, not assertions
that an implemented Wi adapter currently drops messages. The adapter is still
proposed. The current source is navigation evidence, not newly rejected source.

### Required bounded correction

Complete the interaction from native receive admission through ordinary/CDC
dispatch and final native-reference disposal, under the existing transport and
transfer owners. Specify:

1. the size/count population admitted **before** native proportional assembly,
   and the producer/backpressure event that enforces that population;
2. where fragments, the assembled Buffer, JS string, parsed wrapper/result and
   deferred delivery closure are debited, including their simultaneous lives;
3. a bounded way to distinguish the CDC-attributed path from ordinary router
   traffic, or an explicitly owned shared receive budget that actually covers
   both without silently changing ordinary supported dispatch;
4. the exhausted-ingress, malformed/oversized, unmatched/late, close and
   shutdown outcomes, with exact once-only release after the relevant producer
   and consumer references are gone;
5. the resulting complete byte/count arithmetic that leaves the supported
   transfer feasible on both nodes and in colocation without a global limit
   increase or a hidden native-buffer exclusion.

This review does not prescribe a new framework, socket family, parser, timer
or global traffic policy. A bounded demultiplex/admission contract or correctly
owned shared input bound may be viable; the design must choose an executable
interaction instead of leaving an implementer to choose between incompatible
scope interpretations. Existing ordinary message semantics cannot be changed
as an incidental CDC capacity repair.

**Required future paired evidence:** real fragmented WebSocket CDC input, late
input after generation retirement, and ordinary SERVICE_RESPONSE traffic
sharing the actual route; below-bound and supported-bound cases; native and
application copies/holds at receipt, parse, dispatch, callback and drained close;
successor admission unable to reuse old input credit; ordinary dispatch still
settles its own waiter. Keep D:1081–1098's both-node-order/colocation and HELD
overlap witnesses in the same eventual candidate. These are future source proof
obligations, not tests that must already pass for design approval.

No other new blocking design finding was established in this complete round.

## Cumulative dispositions

| Earlier item | Current disposition |
| --- | --- |
| N1/N2 | Five-path source approval at 2de unchanged; D:89–153 and its source are not modified by this proposal. |
| D1 | Captured full outgoing envelope preflight retained at D:228–250. D14 completes native/shared incoming ownership. |
| D2/D7 | Exact H cell and same-ordinal continuation retained at D:553–614; separate Wr now funds the prior missing control overlap. |
| D3 | Exact pair/adoption CAS and source/recipient custody separation retained at D:426–435/499–503. |
| D4 | Knotify survives publication until queued run/drop at D:660–675. Installed cache state is never retracted by caller exit. |
| D5 | Canonical nonallocating comparison and outside-page NUL control retained at D:618–633. |
| D6 | Disjoint source/recipient/cache credits and fresh same-turn K preflight retained; new E units preown completion credit at D:923–965. |
| D8 | Canonical incremental digest encoding is byte-identical by contract at D:677–708; measured/equality source proofs remain required. |
| D9 | No completionClaimant; same total endpoint order and refused-unit drain retained. Pre-probe complete units now participate in that order. |
| D10 | Probe Ps/Pr custody remains exact, one probe per admitted unit, no deadline renewal. New section supersedes the earlier probe-first acquisition. |
| D11 | Expected/late response and upper-recipient OFFER Wi are preowned through drop/drained close. Supported at that lifecycle level; native ingress/ordinary dispatch still D14. |
| D12 | Old retained-Pr-only schedules excluded by complete paired admission before probe. Actual defaults/counts remain a measurement gate. |
| D13 | Required HELD/refusal/error/request/ACK simultaneous credit explicitly preowned as Wi/Wo/Wr. Old H-only source schedule excluded at the admitted-unit level. |
| R3-4/5/6/7 | Publication fence, recovery discovery priority, actual pool census and strict applied-index text remain independently approved within their prior component scope. |
| R3-1/R3-2 | Source allocation, supported colocation and complete transport interaction stay held. No complete memory/source/startup acceptance follows from these design corrections. |

The 3 MiB NUL case, supported 8 MiB colocation, one supported row beyond 16 MiB
versus a many-page backlog, repeated N+1-before-callback-N, interruption,
same-N replay/conflict, incomplete authority/absence and newer suffix
UPSERT/DELETE remain cumulative (D:786–837,1096–1098). Full startup and original
durable-event ACK/lost-response acceptance remain separate (D:844–846,1108–1111).

## Category-complete 63-item review

Every item has a concrete evidence path. “Supported design” is not implemented
source acceptance. References to D14 are effects of the one grouped finding.

### A — admission and current authority

| ID | Evidence and disposition |
| --- | --- |
| A1 | D:905–951 uses the same PO node balance and complete units before probe/data allocation. Native receive is earlier than D:1011's child admission: D14. No precheck based on a different pool is accepted. |
| A2 | D:767–772/990–1003/1060–1064 preserves typed FAILED/DEFERRED/spent versus installed. Excess unadmitted work is pressure, not empty success. D14 must preserve those distinctions at ingress without dropping ordinary success. |
| A3 | D:89–153/885–903/940–965 holds caller and generation deadlines fixed across admission, probe, decode and retry. RO:258–277/354–421 owns clock/backoff; no transport outcome grants a fresh budget. |
| A4 | PE:72–81/735–769 and RI:476–494 are real wrapper consumers. D:868–895/990–1003 carries Wi/Wo/Wr and ordinary canonical results through them. D14 names the unresolved shared input consumer boundary. |
| A5 | D:1000–1044 names parse/drop, drained close and queued-notification terminals; PO:81 supplies local release wake, RO remains retry owner. Ingress hold release must include native last references: D14. Permanently absent terminal is honest pressure, not success. |
| A6 | D:935–938/1019–1022 binds routing/resource identity separately from exact probe authority; D:439–445/655–658 keeps fresh cache and publication fences. No full-unit credit alone authorizes publication. |
| A7 | D:68–76/774–784 plus PO:228–245 identifies actual category/node/generation holds. New W terms must report their real native/router owner; diagnostic totals cannot establish D14 release. |

### Y — retries and progress

| ID | Evidence and disposition |
| --- | --- |
| Y1 | D:940–980/1048–1064 preowns completion and controls, then uses existing bounded retry/wake. Old Pr-only and H-only failure schedules are excluded. Complete progress still depends on D14's feasible ingress reserve. |
| Y2 | D:1000–1044 preserves unreadable/lost-response obligations independently of semantic expiry. RO deadline race bounds waiting. Old Wi remains pressure until its actual terminal; no timeout erases it. |
| Y3 | D:990–1003/1024–1044/1060–1064 enumerates semantic and resource exits. Stale route retires units under D:935–938. D14 must define exhausted/native preclassification outcomes and ordinary dispatch. |
| Y4 | D:940–980 places all probe/data acquisition in lower-then-upper order, with atomic colocation and release before upper-refusal retry. Old D12 schedule no longer admitted. Wbase's native producer bound remains D14. |
| Y5 | D:889–903 derives finite messages/controls under positive cadence and fixed deadline, accounting delayed callbacks. D:905–910 counts Wbase in the existing limit. Exact count domains/defaults are source gates; native population bound missing at D14. |
| Y6 | D:398–435/948–965/1019–1038 preserves exact token/request/attempt identity and idempotent release. Lost admission answers must stay within those identities; they are not absence of a grant. Same-N replay remains separate semantic proof. |
| Y7 | D:859–861/897–903/1054–1064 forbids deadline renewal or extra attempts by ACK/probe receipt/control success. RO fixed generation remains approved. Actual capacity wakes must respect the cadence used to derive the finite population. |

### T — transport

| ID | Evidence and disposition |
| --- | --- |
| T1 | RI:435–457 ACK-before-handler and RC:54–59 ACK/noHandler rejection remain. D:991–997 distinguishes ACK input/output from processing and release. A transport token grants no data/cache authority. |
| T2 | D:1000–1039 retains exact old Wi past waiter retirement; PL:184–224 classifies late responses. D:995/1057–1064 charges Wr while H(N) survives N+1. Native/preclassification lifetime and ordinary nonmatches remain D14. |
| T3 | RC:159–173 and D:767–772/990–1003 retain canonical deferred/failed/missing/result shapes. D14 must route noncoverage SERVICE_RESPONSE to its existing PL consumer rather than drop it as an unmatched CDC input. |
| T4 | D:911–914/1041–1044 preserves bounded semantic wait and truthful pressure when no actual transport terminal exists. PL:387–408 bounds request waiting. No silently completed or infinite semantic queue is approved. |
| T5 | D:1078–1098 requires actual local/WebSocket routes and callback/close ordering. Server/Dial/WSReceiver prove why native fragmentation and ordinary traffic must join that witness (D14); no stub or run was misrepresented as runtime proof. |

### S — clocks and lifecycle

| ID | Evidence and disposition |
| --- | --- |
| S1 | RO:60–75/258–277 injects time, clamps positive backoff and unrefs timers. D:885–903/1054–1064 retains that owner. No timer is added to resource custody and no caller budget is extended. |
| S2 | SC:263–271/371–422 preserves owner-RPC, leader/source lifecycle and captured applied prefix. D:935–938 says route/reservation is not coverage authority; discovery/payload priorities remain D:778–784. |
| S3 | D:1000–1044 transfers externally owed input to router after generation retirement. Restart/owner reset cannot report those copies free while the old connection owns them. Full production restart is unapproved. |
| S4 | D:745–765 as superseded by 1000–1044 distinguishes semantic timeout from actual external custody. Legal callback lag is accommodated, not corruption. Native producer references at the chosen release event still need D14. |
| S5 | AR:511–516 keeps required owner-RPC reads independent of eager local hydration; SC recovery route stays CRITICAL. No activation/readiness gate added. A feasible Wbase/complete unit is required for progress while ordinary admission is closed; startup proof remains separate. |

### R — recovery and publication

| ID | Evidence and disposition |
| --- | --- |
| R1 | CO:395–445/494–545 stages coverage/suffix, rows, tombstones and revisions; D:618–675 preserves final current fence and post-swap fact. New W accounting changes no durable CDC ACK or cache authority. |
| R2 | D:935–938/1000–1038 binds exact source/recipient/lifecycle/generation/socket/request. Retired Wi cannot attach to or release successor credit. D14 includes the native frame owner before that typed request match. |
| R3 | D:216–225/774–795 retains final/next, complete population and unreadable-versus-empty boundaries. Nonempty data and complete row controls remain mandatory; full allocation does not authorize missing coverage. |
| R4 | D:572–608/677–708/1096–1098 keeps exact same-ordinal, digest, replay/conflict and suffix behavior. Lost input or source session recaptures under existing durable authority; no SQL reexecution is proposed. |
| R5 | D:767–795/1041–1044 retains debt on absence/unavailable input; PL late diagnostics do not certify coverage. Missing source response/connection terminal may hold credit honestly; no unused count or empty queue proves completion. |

### C — concurrency and custody

| ID | Evidence and disposition |
| --- | --- |
| C1 | D:940–965/990–1003 acquires complete unit and handoff credit before async observers/variable data. D14 identifies the earlier native assembly and unmatched input producer which this admission has not yet bounded. |
| C2 | D:935–938/1019–1038 revalidates probe/lifecycle and exact transport binding; D:439–445/655–658 rechecks cache and time at final swap. Every await remains within original deadline; credit is not a stale authorization substitute. |
| C3 | D:426–435/984–1003 gives exact single-winner custody transfers/releases and complete local atomic debit. Opposite acquisitions use the same node ordering; no claimant ledger appears. D14's ingress slot needs an actual producer-bound winner. |
| C4 | D:490–503/1000–1044 sets semantic state before local releases and retains old external tokens. PO:81 wakes synchronously. WSReceiver:601–655 shows producer callback references can still live when consumer parsing ends: D14. |
| C5 | PO:32–49 and D:905–956 retain node-shared pool, actual endpoint units and nonborrowable Wbase. D14 requires honest scope between this CDC accounting and all traffic sharing the native socket/parser. |

### F — production flow

| ID | Evidence and disposition |
| --- | --- |
| F1 | CT→RC/RO→AR→PE/SC/ST→RI/RD/PL→FC→CO remains canonical. Server/Dial/WSReceiver precede that application chain and allocate input: D14. No raw local read or alternate transfer authority is introduced. |
| F2 | RO:354–421/522–544 remains sole debt retry/cooldown owner; D:967–980/1054–1064 extends its owned bounded continuation. Complete units remove self-created Pr/HELD starvation; native ingress completion budget still D14. |
| F3 | D:89–153 remains byte-identical and prior 2de caller source stays approved. Caller exit does not stop longer shared work or retract cache state. The new receive-owner lifetime cannot renew those semantic deadlines. |
| F4 | D:923–933/1100–1107 includes Wbase and all complete-unit terms. Symbolic feasibility is improved; D14 prevents an exact native/shared ingress peak claim. Supported 8 MiB colocation, >16 MiB row and backlog coefficients remain measured future obligations. |
| F5 | D:53–58/935–938/1108–1111 excludes force-open, snapshot-only transport, SQL rerun, new store/coordinator and limit increase. D14 repair must also preserve normal router dispatch; no CDC-only drop rule can bypass it. |

### H — evidence quality

| ID | Evidence and disposition |
| --- | --- |
| H1 | Prior 88be report and exact prefix preserve cumulative semantic negatives. D14 is a source-grounded design gap with explicit observed native allocations, not an executed new regression or missing-method/setup red. |
| H2 | Server/Dial/RI/PL and installed ws 8.21.0 are exact actual seams; new Wi/Wbase adapters are only proposed. D:1078–1098 requires real transport witnesses. No stub or future implementation is presented as existing proof. |
| H3 | D:1085–1095 independently orders old input, source callback, generation retirement and HELD reply/callback. D14 adds fragmented native assembly/emitter lifetime. The fixed deadline and original cadence are preserved. |
| H4 | D:935–938/1019–1022 retains complete source/recipient/socket/generation/request/kind identity and current probe authority. Ordinary messages have their own legitimate PL binding; lack of CDC WiPending cannot classify them as invalid: D14. |
| H5 | D:1081–1098 keeps exact boundary/below-bound, several attempts, native old-input, nonempty row and useful continuation. D14 requires ordinary SERVICE_RESPONSE settlement alongside CDC, avoiding a trivial all-input-drop green. |
| H6 | Exact current design, whole predecessor prefix, prior report, 20 source fingerprints and installed ws/lock version recorded. No runtime tests or source acceptance this turn; startup/event ACK/activation/BEGIN gates stay outside scope. |

### O — owners and interactions

| ID | Evidence and disposition |
| --- | --- |
| O1 | D:60–83/905–914 preserves existing reconcile, transfer, transport, source and cache owners. D14 is their native receive/dispatch interaction, not permission for a new system or readiness oracle. |
| O2 | D:868–882/990–1003 names typed Wi/Wo/Wr custody through real RI/RD/PL/PE consumers. D14 requires a precise native/ordinary-to-CDC boundary before those consumers can enforce the proposed graph. |
| O3 | D:1081–1098 requires refusal and valid completion with old counterexamples in one candidate. D11–D13 algebraic schedules are corrected; D14 must preserve both normal message delivery and CDC refusal in the same future witness. |
| O4 | D:935–965/1000–1044 permits fresh routing/reconcile after stale evidence with exact unit retirement; no permanent claimant remains. Old transport holds are real pressure and cannot become authority or release a newer claim. |
| O5 | D:905–980 secures all completion resources without borrowing Wbase or extending budgets. Extra probes cannot own only Pr. D14 must enforce actual preparse/native backpressure instead of merely checking length after native allocation. |
| O6 | PO:62–81 and RO:522–544 identify real local wake ownership; D:973–980/1054–1055 retains the bounded remote timer path. Drained native receive/drop must release through that owner: D14. No new competing retry loop is requested. |
| O7 | D:935–938/1019–1022 makes route, correlation and resource tokens non-authoritative. Current source evidence and final canPublish still authorize coverage. Native/pool counters alone do not prove a frame or emitter reference gone. |
| O8 | Exact ab37/25f/88be provenance and copied native dependency hashes retained in I. No expected-negative arithmetic or source traces are mixed with positive execution data; no new execution was claimed. |
| O9 | Inspected request/response wrappers, common RI parser, PL late ledger, Server/Dial constructors, native receiver assembly, pool release and RO retry. D14 is the complete remaining finding; ordinary dispatch and source-owned raw-read exclusion are retained. |
| O10 | Registry:894–942/1797–1860 still owns the interaction; D:839–842/1078–1098 requires live transport/cache witnesses with implementation. D14 adds actual native/shared dispatch to those endpoints. Metadata/source changes remain proposed, not approved by documentation. |

### J — JavaScript and byte domains

| ID | Evidence and disposition |
| --- | --- |
| J1 | D:228–275/887–903 requires safe length/sum/count/base64/UTF-16 arithmetic and rejects unsafe/zero cadence. Current ST:73–80 checked sums and canonical applied-index domains retained. D14 is omitted producer scope, not an arithmetic overflow claim. |
| J2 | D:228–250 captures own primitive wire fields; JSON:109–174 supplies strict canonical record/dense-array guards. Wi binding cannot trust inherited fields. Preparse classification in D14 must retain these guarantees without assuming parsed identity already exists. |
| J3 | D:228–250/929–933 uses captured measurements and exact alias transfer only after old reference drop; fresh K is same-turn. Native Buffer/string/graph references must be included in that capture/lifetime reasoning: D14. |
| J4 | Domain/JSON accepted prototype defenses remain unchanged; D:685–708 retains canonical serialization. D14 concerns ordinary network/native allocations, not a new requirement to withstand arbitrary trusted-host code mutation. |
| J5 | D:245–248/304–311/868–895 bounds primitive identities/error/control fields and no offending variable echo. An ordinary noncoverage message is not invalid merely because it lacks a coverage token (D14). |
| J6 | JSON:1–25 pins the existing intrinsic contract; D:685–708 preserves it. Installed ws sources are inspected for actual allocation/lifetime, not subjected to an invented whole-runtime intrinsic-immunity requirement. |
| J7 | D:618–633/677–708 preserves byte-identical digest/canonical escaping and nonallocating cached-row comparison. NUL amplification controls remain. D14 requires raw fragments/assembled Buffer/string copies alongside those later encoding terms. |
| J8 | D:889–914/923–933/1100–1107 defines finite per-unit count/byte credit and aggregate pool balance. No all-dataset materialization is authorized. Native receive population before classification is not yet tied to those bounds: D14. |

## Completion

All 63 instantiated obligations have evidence-backed dispositions. D14 is the
complete new grouped finding. Preserve the complete-pair, WiPending and Wr
corrections and close the native receive/ordinary-dispatch contract before
implementing the held resource interaction. The existing N1/N2 source approval
and prior bounded component approvals remain unchanged. Nothing here certifies
normal startup, original-event ACK recovery, full source resource bounds or a
merge to main.
