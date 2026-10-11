# C17 receiver admission and strict turn: round-eight design review

Date: 2026-10-11. Independent reviewer:
`subagent:/root/review_checkpoint_composition`.

## Scoped verdict

**REVISE DESIGN** at
`997318ab70d6ce4c8409e20e5d7b2f1ea307f364a530ac875775c85c6cad5590`.
Three complete grouped findings remain in the initial-admission/native-receive/
listener interaction:

1. **D18 — Strict turn ownership is incomplete across lost replies, delayed
   callbacks and the actual ACK/response consumers.**
2. **D19 — The extra-input native allocation bound is not enforced by a message
   listener which runs after assembly.**
3. **D20 — Native connection count is not retained A-custody count during
   destruction and close drain.**

These are source-grounded design counterexamples and missing transition/bound
relations. They are not executed memory overflows, candidate source regressions
or demands that future implementation tests pass before design approval. All
63 instantiated review obligations have a disposition below; no additional
findings are deferred behind these three.

The correction makes substantial contract progress:

- Sender-local primary A claims are removed. Remote contact uses the dedicated
  listener's receiver admission in both endpoint orders. The initial fan-in
  mismatch is corrected for live admitted connections; D20 completes the
  retirement boundary.
- Four nonborrowable outbound and four inbound I cells remove the specified
  opposing-CONNECTING count deadlock. Complete lower/upper E units still precede
  the probe, and colocation still takes the complete union atomically.
- Native backing sizes are now tied to a named audited profile, rather than
  inferred from high-water marks. That improves the valid-turn bound; D19
  addresses the claimed extra-input/refusal bound.
- **D17's listener-port/configuration/Helm/startup/shutdown contract is
  supported at design level.** Runtime artifact certification remains an
  explicit prerequisite, not an approved narrowing of existing support.

**N1/N2 source approval at
`2de419483c9b4ce9e3fabc87bb54d93e4afb8817` remains closed and unchanged.**
The original caller and shared-generation deadlines are preserved. Earlier
semantic/custody approvals retain their precise scope. No dedicated-listener
source, resource source, numerical coefficient, certified image, whole startup,
durable-event delivery/ACK acceptance or merge-to-main approval is given.

Only this report and diagnostic copies were written. No product/source/test,
design, metadata, Quest, index, commit or remote was changed. No implementation
or cluster test was run.

## Exact evidence

`C` = `/mnt/data/peter/projects/.worktrees/tx1-cdc-20261011`.

`E` = `/mnt/data/peter/projects/.worktrees/rs-raft-candidate-20261011/test-output/continuation-20261011`.

`I` = `E/cdc-c17-round8-review`.

`D` = `C/solve/quests/replicated-transaction-decision-and-apply/cdc-coverage-response-resource-handoff-amendment-20261011.md`.

`Research` = `E/cdc-native-allocation-research-20261011T1950`.

| Artifact | Verified identity |
| --- | --- |
| D, 2035 lines; exact diagnostic copy `I/subject-997318ab.md` | SHA-256 `997318ab70d6ce4c8409e20e5d7b2f1ea307f364a530ac875775c85c6cad5590` |
| Preserved Quest `evidence/cdc-coverage-response-resource-handoff-amendment-round7-cb751525.md` | SHA-256 `cb751525eb7772fc36203b6fa6aecea2b895cd1aa5e714437bb2e2db4143bc38`; all **100169 bytes** are an exact prefix of D |
| Prior `E/review-cdc-c17-resource-round7-checkpoint.md` | SHA-256 `467259864cc8627b5dcb4262bb3f0f484671751e2fecdd788533dc35f7943107` |
| Application navigation commit | `0e9a07604b5e29f0f686db3e567333c7775934df` |
| Prior navigation manifest | SHA-256 `2857b5edafcc314fd6a18d1ef9b3c57c51ef104ff9fba0d1fe2ef04e165ee99d` |
| Research manifest | SHA-256 `9e7db3759806da245390d3a887f32a0f27fe42f54daf910554e078265fe9b730` |
| Current `I/navigation.json` | SHA-256 `1143aa130b672354b6ad39bf6575319d4e70b164033cda1f8a2534cd1c941bca` |
| Observed Linux x64 Node executable | SHA-256 `3517c2df0b2f8cd7f422b4b8450ef81c6889f08eb03e281d6de9079b15e6a327`; Node v22.23.2, libuv 1.51.0 |

The full addition D:1536–2035 was read against the exact unchanged prefix and
the cumulative prior reviews. All 30 previous navigation files were rehashed:
**30/30 match their pinned source**. Four additional package/runtime/CI files
were extracted from 0e9: **4/4 match live**. All six retained native research
files, including the license, match their manifest hashes. The research is
official upstream source evidence, not an aggregate memory measurement or an
already authorized supported-runtime policy.

### Reference key

Application paths are relative to C. Pinned copies are in the round-six and
round-seven navigation directories named by `I/navigation.json`; the four new
ones are in `I/navigation-0e9/`. Node JavaScript copies remain in
`E/cdc-c17-round7-review/node-v22.23.2/` and installed ws copies in
`E/cdc-c17-round6-review/installed-ws-8.21.0/`.

| Key | Path |
| --- | --- |
| RO / CT / RC | `src/cdc/cdc-coverage-reconcile-owner.js`; `src/cdc/cdc-integration-service-authoritative-catchup.js`; `src/cdc/cdc-complete-coverage-reconcile.js` |
| PO / FC | `src/cdc/cdc-coverage-transfer-owner.js`; `src/cdc/cdc-coverage-fragment-consumer.js` |
| SC / ST / PE | `src/partition/partition-cdc-source-coverage.js`; `src/partition/partition-cdc-coverage-transfer.js`; `src/partition/partition-service-entry-apply-base.js` |
| CO / CN / Cache | `src/cache/system-table-cache-cdc-source-order.js`; `src/cache/system-table-cache-observation-methods.js`; `src/cache/system-table-cache.js` |
| Domain / JSON | `src/cdc/cdc-coverage-domain.js`; `src/utils/canonical-json-data.js` |
| RI / RD / PL | `src/transport/message-router-inbound-dispatch.js`; `src/transport/message-router-delivery-behaviors.js`; `src/transport/message-router-pending-response-ledger.js` |
| Server / Dial / Shutdown / Bulk | `src/transport/message-router-server-lifecycle.js`; `src/transport/message-router-connection-lifecycle-methods.js`; `src/transport/message-router-stats-shutdown.js`; `src/transport/bulk-transfer-channel.js` |
| Ports / Config / Helm / Headless | `src/config/listener-port-model.js`; `src/config/configuration-manager.js`; `charts/lagrange-node/templates/_helpers.tpl`; `charts/lagrange-node/templates/service-headless.yaml` |
| AR / Registry | `src/cdc/cdc-integration-service-authoritative-read-flow.js`; `test/shards/impact-contracts.json` |
| NodeNet / NodeHTTP / NodeWrite | Pinned Node `net.js`; `_http_server.js`; `internal/streams/writable.js` |
| WSReceiver / WSSocket / WSBuffer | Pinned ws `lib/receiver.js`; `lib/websocket.js`; `lib/buffer-util.js` |
| UV / StreamBase / HTTPParser / Env | Research `libuv-unix-stream.c.txt`; `node-stream-base.cc.txt`; `node-http-parser.cc.txt`; `node-env.cc.txt` |

Rules/router and the same ten verification templates govern the complete
63-item union. The trusted-private-network and existing strict-data threat
boundaries are retained. Extra-input handling is reviewed because this design
explicitly promises it, including stale/late frames; no new arbitrary-host
mutation requirement is introduced.

## Positive contract trace and remaining source gates

### Admission, both endpoint orders and colocation

D:1577–1591 correctly separates local outbound I from receiver A, and prevents
direction borrowing while a connection is unresolved. D:1662–1696 moves the
first lower reservation onto the admitted lane when the source/lower endpoint
is remote. This resolves the prior ambiguous “lower locally” instruction.
The local-lower path takes lower E then requests upper; the remote-lower path
requests lower E then takes local upper. A refused upper retires lower without
probing. A lost grant remains uncertain under the same semantic identity.
Colocation opens no socket and atomically acquires the role union.

Under D:1634–1651's *live* inequalities, four outbound CONNECTING sockets cannot
consume the four inbound I cells. The specified two-node opposing-connect
schedule can therefore reach pair acquisition. This is a count-progress
argument under available complete E bytes, current authority and eventual
drain; it is not fairness or completion under a permanently absent callback.
D18 completes the subsequent turn/retry lifecycle, and D20 covers retained
claims which outlive the native live-connection count.

### Native profile and numerical scope

UV:1034–1052 supplies the 64 KiB ordinary read allocation suggestion.
StreamBase:686–714 and Env:754 onward connect it to backing allocation and
short-read copying. HTTPParser:745–784/808–815 establishes the separate parser
buffer/current-buffer-copy lifetime. These are substantially more precise
than an HWM assumption. The short-read `old_bs` is scoped to the `if` block
before `CallJSOnreadMethod`; charging it through a later boundary is
conservative, not an undercount.

For the stated **compliant** single incoming turn, D:1795–1820 gives a finite
wire population, with headers/CLOSE included. The displayed sum
640 + 640 + 64 + 64 + 64 + 48 KiB + 195 bytes equals **1520 KiB + 195 bytes**,
leaving **15 KiB + 829 bytes** below 1.5 MiB. The arithmetic is correct.
D19 concerns the transition to extra-input assembly/refusal and the claimed
one-emitter/one-read relation, not this addition.

The 48 KiB fixed-graph, 448 KiB Aactive, 0.5 MiB Adrop and S/H/C/K coefficients
are explicitly source certification gates. This review does not reject them
merely because a future graph census or physical test has not run, and it does
not certify them. The older whole-operation sum remains conditional and below
126 MiB if every term is enforced. No pool increase or smaller supported row
is approved.

### Listener and runtime ownership

D:1913–1983 now chooses REST+3/explicit coverage override through Ports, uses
the existing transport bind host, extends Config and shared Helm helpers,
exposes the headless endpoint before readiness, and specifies bind/publication/
failure/shutdown ordering under MessageRouter. This is a coherent bounded
answer to D17. Required production tests remain future source evidence.

D:1713–1746/1895–1910/1937–1947 explicitly makes native certification a runtime
and deployment owner decision. That **HOLD is preserved**. Current
`package.json:242–243` permits `>=22.12.0`; CI uses Node `22`; and the actual
production runtime is **`gcr.io/distroless/nodejs22-debian12` at Dockerfile:19**,
while `node:22-slim` at line 2 is only the builder. Thus pinning the builder
alone would not satisfy the proposed gate. This is a concrete implementation
scope clarification, not another design rejection: the amendment already
requires an immutable production artifact and enforcement before publication.
No Linux-x64-only support policy, package-engine narrowing or image selection
is approved by this review.

## D18 — Strict turn ownership is incomplete across recovery and canonical settlement

**One grouped finding:** transport/request settlement, retry/reentry, callback
custody and valid production progress.

Three cases need one executable state transition contract within the existing
MessageRouter interaction:

1. **A lost answer cannot return the turn used to retry it.** D:1689–1695 says
   a lost answer is redriven on the same connection. D:1769–1772 refuses another
   send while the peer owns the response/receipt turn and returns the token on
   that response/receipt terminal. Lose or indefinitely delay that response:
   the retained same-identity request is precisely what existing recovery must
   redrive, but the new gate has no transition permitting it. The original
   deadline bounds waiting; it does not itself establish a turn return or
   close/drain/replacement action. Unknown grant and live connection must not
   silently become permanent I/E pressure after every attempt.
2. **The two endpoint terminal facts are not jointly observable.**
   D:1763–1765 returns a receipt-only ACK's token after its local send terminal
   and peer receive-callback unwind, without another acknowledgment. Let the
   peer receive and finish processing the ACK before the sender's send callback
   runs. The peer knows its own unwind, not the outstanding remote callback.
   The sender knows its callback, not the peer unwind. Returning immediately
   based on receipt can let a valid next request arrive while the other side
   still considers the old turn owned; waiting for both unnamed facts can
   stall. The same physical order matters for response N followed by request
   N+1. Earlier H/Wr custody deliberately allowed these overlaps; the new turn
   rule must consume that contract rather than classify a legitimate next turn
   as an extra-frame violation or require an ACK-of-ACK loop.
3. **The existing router emits and settles two distinct wire events.**
   RI:435–439 sends ACK immediately before handler invocation; RI:449–457 and
   476–494 later send SERVICE_RESPONSE for missing handler, success or error.
   RD:347 registers the result waiter, awaits the delivery outcome, rejects or
   cancels on missing `acknowledged` at RD:471–479, then arms the result wait at
   RD:491. PL:530–559 settles the ACK ledger; PL:419–435 settles the result
   ledger. D:1760–1763 instead makes the response the receipt, while
   D:1777–1781 still invokes the existing input entry. Passing the current
   handler through a turn-only send wrapper either emits both messages, rejects
   a valid response while the ACK owns the turn, or suppresses the ACK without
   specifying how the existing sender's ACK wait settles. The canonical owner
   adaptation for all success/noHandler/error/late classes is missing.

These are not claims that the current approved caller code changed. They are
contradictions in the proposed transport interaction and its named existing
consumers. A future implementer should not have to choose which accepted
recovery or ACK contract to discard.

**Required correction:** define local send custody separately from the
evidence authorizing the next receive/emit turn. Specify locally observable
state transitions for request, exact response, receipt-only ACK, delayed
callbacks, noHandler/error, lost/uncertain response, timeout and old-generation
close. Make the same existing retry owner able to resume the exact request or
retire/drain the exact lane before redrive under the remaining original
deadline. Specify how the canonical delivery and response ledgers consume the
new receipt shape, without a fake ACK, a second settlement predicate, renewed
budget or new retry/timer owner. Preserve original H/Wr ownership until actual
callback release even if the next semantic turn has begun.

**Future paired evidence:** actual router request/ACK/result consumers with a
valid handler, noHandler and handler error; lost response; delayed send callback
after peer receipt; N+1 before callback N; receipt-only ACK without ACK recursion;
same-identity redrive and exact lane retirement. Include emitted frames, both
pending ledgers, retained H/Wr/I/E claims and successful useful continuation.
These are proposed source witnesses, not tests required to pass for this design
review.

## D19 — The extra-input gate is downstream of native assembly

**One grouped finding:** native allocation/refusal boundary and callback
overlap. The valid-turn profile and arithmetic above remain supported inputs.

D:1777–1790 places the sole admission adapter on ws's `message` event.
D:1826–1843 then charges one extra 64 KiB current input and claims that the
second emitter is rejected before further native reads; it also claims at most
one deferred-emitter closure because Writable is serial. These implications do
not follow from the pinned receiver:

- WSReceiver:480–534 waits for and consumes the complete frame payload before
  `dataMessage`. WSReceiver:601–658 concatenates fragments and schedules or
  emits the message. An unexpected next application message can span several
  <=64 KiB native reads before the sole listener gets any second emitter on
  which to call `terminate()`. Per-message maxPayload and per-buffer count bound
  that later message, but do not turn it into a single current read. Merely
  refusing the second parsed/router input is not preassembly enforcement.
- WSReceiver:627–631/654–658 emits the first message, then invokes
  `startLoop(cb)` while the first deferred callback is still on the stack. A
  second complete frame already in delivered bytes can schedule the next
  deferred closure before the first callback returns. Writable serialization
  therefore does not imply the stated one-closure-at-a-time invariant.
- Calling public terminate at the second emitter destroys the socket
  (WSSocket:492–503); it does not retroactively remove the prior native assembly.
  Close itself may feed remaining readable bytes to Receiver before finish
  (WSSocket:1329–1363). Those phases must be in the same accounting and terminal
  relation.

The design itself includes stale, malformed and extra input in D:1838–1844 and
the future witness. This finding does not extend it to an arbitrary hostile
host. It also does **not** establish an executed 1.5 MiB overflow: some phases
may release an earlier backing before a later one grows, and a correct
phase-by-phase maximum may still fit. The point is that `Xcurrent <= 64 KiB`
and one-emitter serialization are not the enforcement/proof supplied by the
chosen API boundary.

**Required correction:** either name an allowed boundary that really prevents
the unowned second native assembly, or give the complete bound for successive
native assembly, current/queued roots, old and newly scheduled emitter
closures, termination and close drain, using exact phase lifetimes and custody
transfers. Count backing allocations once where aliases share them and count
real copies separately. Do not count old custody as released merely because a
message was semantically refused. The source-measured Mlane coefficient remains
a later gate; it cannot substitute for a missing maximum population or release
transition. No raw parser/private Receiver mutation is requested.

**Future paired evidence:** a valid maximum fragmented turn, a second frame
already in the same native chunk, an unexpected next message split over several
native reads, and termination with remaining readable bytes. Record native
assembly before emitter dispatch and actual drained release, alongside the
supported valid transfer. A message-listener assertion alone does not witness
the pre-listener bound.

## D20 — maxConnections does not count retired A claims through their terminal

**One grouped finding:** receiver conservation across close/replacement.

D:1593–1625 uses `maxConnections = 8` to promise that a ninth population cannot
be constructed. D:1588–1590/1643–1651 correctly retains A and old I claims until
their own HTTP/write/close references drain. These are different count domains.

NodeNet:2247–2269 refuses before Socket construction only when native
`server._connections` has reached maxConnections. NodeNet:809–860 decrements
that count during `Socket._destroy`, after scheduling/initiating handle close
but **before the later close callback has established the design's A terminal**.
An old A-bound refusal or destroyed socket can therefore remain charged after
it no longer contributes to `_connections`. A new accept in that interval
passes the count check and constructs a new Socket at NodeNet:2280–2288.

**Reachable schedule:** hold the eight A cells on preupgrade/refusal lifetimes;
destroy one socket while its close/write/HTTP terminal is still pending; then
let the listener process another accepted handle before that terminal. The
native count has room but there is no free A cell. This is a close/accept
interleaving, not excess remote admission or a ninth active root. In particular
an I/O-triggered destruction and another ready accept can precede the close
phase. The design provides no custody cell/transition for the newly constructed
Socket in this case.

The prepended connection listener cannot retroactively make the Socket
uncreated. Destroying it is not by itself a guarantee that the normal HTTP
connection listener allocates nothing: NodeHTTP:695–723 allocates a parser
without an initial destroyed-socket return. Adrop at D:1608–1613/1891–1892 is
defined for the pre-Socket max-connection branch, not for this admitted
Socket/parser or a population of retired A claims. Expanding its coefficient
afterward would not establish which population it owns.

**Required correction:** conserve capacity across the native live count *and*
all retained preupgrade A claims. Define admission when no A cell is free even
though the native connection count has fallen, and identify the owner/credit
before each Socket/parser population can exist. The corrected gate may use the
existing listener owner and public admission controls; this review does not
prescribe another framework. Its count and release proof must include reject,
destroy, pending native close, callback drain and immediate replacement. Keep
the static 4-out/4-in progress argument and exact old-generation custody.

**Future witness:** normal fan-in above eight plus refusal/destroy/accept churn
with an old A terminal delayed. Show actual native count, occupied A/I/Adrop
claims, Socket/parser construction, unchanged ordinary traffic and a useful
admitted completion. This is separate from measuring the size of a correctly
bounded A cell.

## Cumulative dispositions

| Item | Current scope |
| --- | --- |
| N1/N2 | Five-path 2de source approval unchanged; D:89–153 and fixed shared deadline remain closed. |
| D1/D5/D8 | Captured envelope preflight, NUL-safe/nonallocating canonical comparison and byte-identical digest clauses retained. |
| D2/D7 | H custody and same-ordinal continuation retained. D18 must preserve their legitimate N+1/send-callback ordering through the new turn rule. |
| D3/D4/D6 | Pair CAS, source/consumer custody, Knotify and fresh same-turn K preflight remain supported; no publication retraction. |
| D9/D10 | Stable lower/upper order, atomic colocation, Ps/Pr and single probe retained; remote-lower routing is now explicit at D:1673–1687. |
| D11/D12/D13 | Old WiPending, complete paired units before probe, Wr/Wo control overlap and original cadence retained. D18 integrates the new receipt with these facts. |
| D14 | Dedicated purpose, binary Q and ordinary/snapshot isolation retained. Native/refusal interaction still needs D19. |
| D15 | Sender-local fan-in flaw corrected for live admitted connections, with explicit both-order lane bootstrap. Retained close-time conservation remains D20. |
| D16 | HWM inference withdrawn; audited valid-turn profile and conditional arithmetic supported. Turn/retry integration D18 and extra-input bound D19 remain. Runtime and numerical source certification stays HOLD. |
| D17 | Port/default/override, four-way validation, existing bind host, Helm/headless exposure and startup/shutdown ordering supported as design. No source/deployment policy approval. |
| R3-4/5/6/7 | Prior bounded publication fence, recovery routing priority, actual pool census and strict applied-index text approvals retained. |
| R3-1/R3-2 | Whole allocation/colocation/resource source still held. Full startup and original durable-event delivery/lost-ACK proof remain separate. |

All cumulative controls remain: supported 8 MiB colocation; one supported
16 MiB+1 event versus a backlog over 16 MiB; NUL amplification outside the
incoming page; exact/below capacity; repeated N+1 before callback N;
interruption, same-N replay/conflict, incomplete authority and newer suffix
UPSERT/DELETE. No count/byte limit increase, hidden native exclusion, smaller
supported row, SQL reexecution or fresh retry framework is accepted.

## Category-complete 63-item review

Every item has evidence and a disposition. Retained/supported clauses below
are design scope only. All 63 instantiated items apply; future source
measurement is explicitly distinguished from a design counterexample.

### A — admission and authority

| ID | Evidence and disposition |
| --- | --- |
| A1 | PO:32–49/117–146 and D:1566–1603/1665–1687 use one node pool before E/I allocation. D20 covers retained A versus live native count; D19 covers extra native assembly before emitter admission. |
| A2 | D:1643–1651/1680–1696/1777–1790 preserves refusal, unknown grant and protocol violation rather than empty success. D18 must preserve distinct ACK/result/error semantics through the new turn. |
| A3 | D:89–153/1614–1617/1691–1695 retains caller versus fixed shared deadline across connection/pair/probe/decode. RO:258–277/354–421 remains clock owner; D18 needs a legal retry transition within it. |
| A4 | RI:435–494, RD:471–491 and PL:419–435/530–559 consume separate ACK/result shapes. D:1760–1781 does not yet define their receipt adaptation: D18. |
| A5 | D:1588–1590/1844–1855/1974–1983 names HTTP/native/callback/notification terminals. PO:62–81 wakes on actual release. D18 separates next-turn permission from remote release; D20 keeps A until its actual terminal. |
| A6 | D:1668–1672 and D:1428–1436/439–445/655–658 keep incarnation, exact request/source/generation and final publication authority current. Neither lane credit nor runtime capability grants source authority. |
| A7 | D:774–784/1987–1996 and PO:228–245 retain actual held owner/identity/copies. Diagnostics must distinguish native live count, retired A, I, send and consumer holds (D20), not infer release from count projection. |

### Y — retry and progress

| ID | Evidence and disposition |
| --- | --- |
| Y1 | D:1614–1617/1689–1695 uses existing retry for lost answers, but D:1769–1772 withholds the turn needed for that redrive: D18. Closing/draining or explicit same-turn continuation must be owned and reachable. |
| Y2 | D:1680–1696 retains uncertain lower grant and old transport custody. RO bounds caller/attempt wait. Missing answer cannot erase E/I or establish absence; D18 defines bounded forward recovery. |
| Y3 | D:1643–1651/1680–1696/1844–1855 covers refusal/close/retire. Missing turn timeout/lost-answer transition remains D18, and no-free-A after destruction remains D20. |
| Y4 | D:1577–1582/1634–1660 gives nonborrowable direction cells and excludes the specified opposing-CONNECTING cycle. Complete E order/colocation retained. D18 must avoid a new turn/receipt dependency cycle. |
| Y5 | D:889–903/1570–1582 retains byte/count/cadence/log bounds. Four-out/four-in limits constructible live lanes; retired A custody D20 and extra-input/emitter population D19 still need complete bounds. |
| Y6 | D:1689–1696/1852–1855 preserves same grant/connection/generation identity and exactly-once custody. D18 must permit same-identity recovery without treating a duplicate grant or callback as token renewal. |
| Y7 | D:1556–1562/1691–1695 retains original deadline/cadence. No ACK, refreshed table or reconnection gets a new attempt budget; D18 correction must use remaining time and existing owner only. |

### T — transport

| ID | Evidence and disposition |
| --- | --- |
| T1 | RI:435–457 and RC:54–59 distinguish transport receipt/noHandler from processed evidence. Response-as-receipt in D:1760–1765 needs explicit existing-ledger consumption, not a fake ACK: D18. |
| T2 | D:1691–1696/1852–1855 retains old Wi/I after retirement. Delayed ACK/response send callback versus valid next request is D18; a late extra frame is subject to D19 before application classification. |
| T3 | D:1968–1972 preserves incompatible/unavailable typed debt. Success/noHandler/error/late result mapping through RI/RD/PL is incomplete under strict turns (D18). Ordinary primary dispatch remains independent. |
| T4 | D:1614–1617/1643–1651 bounds dial/refusal wait and retains debt. D18 must provide actual existing-owner turn retirement for a response that never arrives; no infinite implicit pending queue is approved. |
| T5 | D:2021–2035 requires actual accepted/dialed ws, nine-peer fan-in, callbacks, both orders and colocation. Current evidence is pinned owner/native source; future tests and coefficients are not presented as executed. |

### S — time and lifecycle

| ID | Evidence and disposition |
| --- | --- |
| S1 | RO:60–75/258–277 retains injected time, positive retry delay and unref. D:1614–1617/1659–1660 creates no new timer. D18 is a missing state transition, not permission for a second clock/loop. |
| S2 | SC:263–271/371–422 and D:1668–1672 preserve leader, scope and issued incarnation checks. Payload priority is not elevated; transport/runtime evidence remains separate from source authority. |
| S3 | D:1691–1696/1974–1983 owns old callbacks through shutdown and publishes a new generation on restart. D20 prevents native count from prematurely freeing retained A; full restart execution remains future scope. |
| S4 | D:1588–1590/1852–1855 keeps consumer, send and notification copies after TTL/cancel. D18 must allow legal delayed callbacks without corrupting valid next-turn classification or requiring remote callback knowledge. |
| S5 | AR:511–516/SC:263–271 and D:1930–1935/1951–1966 provide recovery RPC/listener before recovery-dependent readiness. No ordinary mutation force-open or new global barrier is introduced. |

### R — recovery and publication

| ID | Evidence and disposition |
| --- | --- |
| R1 | CO:395–445/494–545 and D:618–708 preserve suffix, ACK/commit progress, rows/tombstones/revisions and final cache fence. Native accounting does not change durable event authority or undo installed state. |
| R2 | D:1650–1651/1691–1696/1979–1983 distinguishes exact live, retired and replacement listener/lane generations. D20 adds native-count retirement versus still-owned A, without merging their identities. |
| R3 | D:216–225/774–795 and D:1686–1687 retain complete coverage and pair proof before probe. Missing or malformed evidence cannot become an empty successful hydration. |
| R4 | D:553–614/677–708/2024–2035 retains same-N replay/conflict and exact original event/page identity. D18 must re-drive the same request with legitimate original coordinates; no SQL rerun. |
| R5 | D:1680–1696/1903–1905/1968–1972 keeps unavailable runtime/peer/answer as owed debt. An empty queue/native count never proves semantic completion or actual resource release (D20). |

### C — concurrency and custody

| ID | Evidence and disposition |
| --- | --- |
| C1 | D:1593–1603/1643–1646/1665–1672 requires synchronous A/I/E admission. Native live-count versus A terminal mismatch remains D20; message-listener admission is later than extra native assembly (D19). |
| C2 | D:935–938/1428–1436/1668–1672 plus CO:535–545 retains every authority handoff and final publication recheck. Caller deadlines are unchanged; D18 defines locally observable turn handoffs. |
| C3 | D:1643–1651/1689–1696 preserves atomic A-to-I and exact grant winner. D18 needs one clear local turn winner; duplicate semantic grant cannot imply duplicate physical input is free. |
| C4 | D:490–503/1844–1855 sets state before PO synchronous release wake and forbids post-swap rollback. WSReceiver:627–631 can schedule a successor emitter before prior unwind (D19); close/accept retained A is D20. |
| C5 | D:1570–1591/1634–1640 scopes A to receiving node, I to direction and generation. Native `_connections` and retained A have different lifetimes (D20); separate endpoint credits are no longer conflated. |

### F — production flow

| ID | Evidence and disposition |
| --- | --- |
| F1 | CT→RO/RC→AR→PE/SC/ST→RI/RD/PL→FC→CO remains canonical. D:1913–1983 adds Ports/Config/Helm/Server/Shutdown explicitly. D18 completes the ACK/result interaction on that actual path. |
| F2 | RO:354–421/522–544 remains sole debt retry owner; D:1689–1695 requires lost-answer redrive but strict turn blocks it (D18). No new user write or local raw read may supply the missing wake. |
| F3 | D:89–153/1561–1562/2019 keeps caller 2de closed, including formation-time caller cancellation and longer shared work. Transport-only design findings do not reopen that source. |
| F4 | D:1795–1820/1863–1885 and D:1470–1504 give conditional arithmetic and supported 8 MiB/16 MiB+1 cases. Valid-turn sum is correct; D19/D20 block complete refusal/retirement bounds, while coefficients remain source gates. |
| F5 | D:1704–1711/1907–1911 retains no raw parser/private handle bridge, no limit raise, smaller row, force-open or SQL rerun. Runtime compatibility must be decided by its existing owner, not silently narrowed. |

### H — evidence quality

| ID | Evidence and disposition |
| --- | --- |
| H1 | Exact cb751 prefix and 467259 review preserve cumulative negatives. D18 is an actual-owner transition contradiction; D19/D20 use pinned native sequence. None is an executed overflow/setup red or a missing future test. |
| H2 | RI/RD/PL plus installed ws, Node JavaScript and hashed upstream C/C++ are real seams. Proposed lane adapter/profile are not current source. D:2021–2035 names real network witnesses, with honest implementation ceiling. |
| H3 | D:1763–1765/1844–1850/2025–2032 independently orders receiver settle, sender callback, native unwind and close. D18 identifies unobservable joint terminal; D19/D20 retain late callback/close effects. |
| H4 | D:1668–1672/1689–1696 and D:1428–1436 carry node roles, boot/admission/generation, ordinal/length/digest identity. New turn sequence and its consumed receipt must be equally exact (D18). |
| H5 | D:2024–2035 keeps nonempty supported transfer and below-bound refusal, nine peers and ordinary response control. New witnesses include lost-answer recovery (D18), pre-emitter allocation (D19), and no-free-A replacement (D20). |
| H6 | Exact 2035-line design, 100169-byte prefix, 30+4 source checks, research/native hashes and executable identity retained. No source/runtime policy/whole startup or durable ACK acceptance is claimed. |

### O — owner interactions

| ID | Evidence and disposition |
| --- | --- |
| O1 | D:1556–1562/1662–1687/1913–1983 retains PO resource, RO retry, router transport, Ports deployment and cache/source authority. D18 belongs to existing router settlement; D20 belongs to listener admission. |
| O2 | D:1760–1781 crosses actual RI/RD/PL with a new receipt/turn shape; the consumer transition is incomplete (D18). Typed local A/I custody and full pair handoff otherwise remain explicit. |
| O3 | D:2021–2035 retains refusal and useful recovery on one future candidate. D18–D20 demand the missing interactions, preserving earlier supported allocation steps and cumulative controls. |
| O4 | D:1691–1696/1979–1983 permits exact stale-to-fresh reentry. D18 must define how an uncertain turn retires or redrives rather than permanently vetoing the request; old callback never releases new credit. |
| O5 | D:1577–1582/1643–1651/1881–1911 forbids borrowing, postallocation forgiveness and limit increases. D19/D20 need real preallocation or complete lifetime accounting; typical memory samples do not replace it. |
| O6 | PO:62–81/RO:522–544 and D:1614–1617/1659–1660 retain actual release wake and one retry owner. Lost-turn recovery and terminal emission must propagate through that owner (D18), with no extra timer/store. |
| O7 | D:1668–1672/1852–1855/1951–1966 separates source authority, capability, count and actual reference release. Node's `_connections` is a live projection, not A-release authority (D20). |
| O8 | 997318/cb751/467259 and native research 9e7db hashes recorded; diagnostic copies are exact. Conditional native arithmetic and future measurements are not mixed with positive source execution data. |
| O9 | Inspected initial pair/turn path, real ACK/result consumers, native Receiver/Socket, HTTP accept/parser and count decrement, port/runtime/deployment consumers. D18–D20 are the complete batch; no alternate retry/raw-read repair proposed. |
| O10 | Registry:894–942/1797–1860 and D:2021–2035 require the existing interaction witness to cover listener/turn/native/port/CI consumers. Metadata and tests remain proposed source work, not an approved implementation. |

### J — JavaScript and byte domains

| ID | Evidence and disposition |
| --- | --- |
| J1 | D:228–275/1795–1800/1863–1885 and Ports validate safe lengths/counts/port ranges and exact sums. Displayed native arithmetic passes; D19/D20 concern population/lifetime premises, not arithmetic overflow. |
| J2 | JSON:109–174 and D:228–250/1428–1436 retain own canonical primitive controls/header binding. Receiver/turn correlation cannot trust inherited fields or become source authority. |
| J3 | D:228–250/929–933/1852–1855 retains captured measurement, fresh K and exact alias custody. StreamBase/WSReceiver distinguish true backing roots from views; D19 requires the complete phase relation before reuse. |
| J4 | Domain/JSON defenses remain unchanged. D:1838–1844 explicitly includes stale/malformed extra input; reviewing its native allocation does not add arbitrary hostile-host or intrinsic mutation scope. |
| J5 | D:1263–1278/1336–1345/1668–1672 retains bounded primitive identity/error/control fields before send. D18 must name canonical receipt/result classes rather than truthy ACK success. |
| J6 | Existing JSON intrinsic contract remains. D:1713–1746/1895–1910 explicitly pins proposed native behavior and leaves runtime policy HOLD. No immunity to unsupported runtimes or arbitrary patched hosts is claimed. |
| J7 | D:618–633/677–708/1336–1345 preserves byte-identical digest, escaping/NUL accounting and nonallocating comparison. D19 concerns actual native copies; it does not change semantic encoding. |
| J8 | D:1570–1582/1822–1833/1863–1893 retains finite row/page/array and graph gates. Per-buffer/message limits do not alone prove extra-message/callback population (D19) or retained accept population (D20). No all-dataset materialization authorized. |

## Completion

All 63 instantiated obligations are covered once. D18–D20 are the complete
new grouped findings; their checklist references are not additional findings.
Keep the receiver-owned first contact, both-order acquisition, direction
partition, audited-profile approach and D17 listener contract. Complete the
actual turn/receipt/retry handoff and the native extra-input/retired-admission
bound before implementing this held resource interaction. Caller 2de and prior
bounded component approvals remain accepted inputs. Main and all broader
recovery/merge gates are unaffected by this design verdict.
