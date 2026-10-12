# C17 dedicated receive lane: round-seven design review

Date: 2026-10-11. Independent reviewer:
`subagent:/root/review_checkpoint_composition`.

## Scoped verdict

**REVISE DESIGN** at
`cb751525eb7772fc36203b6fa6aecea2b895cd1aa5e714437bb2e2db4143bc38`.
The complete grouped findings are:

1. **D15 — Primary admission exchanges have no conserved receiver population.**
   Eight sender-local A slots do not restrict how many compliant peers can
   concurrently consume the recipient's eight A slots before classification.
2. **D16 — The native read-ahead allowance lacks an executable enforcing bound.**
   The proposed high-water marks and deferred callbacks do not alone establish
   the R term used in the 1.5 MiB ingress slot. The maximum allowed burst and
   native queue/backing-buffer/unwind overlap still need a bounded mechanism.
3. **D17 — The dedicated listener has no port/configuration/deployment contract.**
   Advertising an address does not select, validate, bind, publish or retire
   that listener through the existing listener owner.

These are design findings, not executed runtime overflows or new source
regressions. No future implementation test is required to pass to approve a
coherent design. D16 distinguishes a missing allocation-bound mechanism from
the later measurement of constants. D17 is a bounded integration amendment,
not a request to redesign formation or activation.

The dedicated purpose addresses the former ordinary-message demultiplexing
ambiguity at the architectural level: ordinary SERVICE_RESPONSE traffic keeps
its existing primary parser and ledger; variable coverage frames have a
distinct purpose selected before Receiver construction. Exact purpose and
generation retirement, complete-unit acquisition before the probe, and
retention through actual last-consumer release are supported design inputs.
They do not close the three gaps above or approve a dedicated-listener source
change.

**The approved N1/N2 source at
`2de419483c9b4ce9e3fabc87bb54d93e4afb8817` remains closed.** Its caller
deadlines and fixed shared-generation deadline are not reopened. D1–D13's
previously supported clauses and the separate R3 component dispositions remain
scoped as recorded below. Full resource source, startup, original CDC-event
delivery/ACK recovery, activation, BEGIN and merge acceptance remain open.

No source, test, design document, metadata, index, Quest log or remote was
changed. Only this report and diagnostic copies under E were written. No
cluster test, source test or simulated native-allocation test was run.

## Exact subject and navigation

`W` = `/mnt/data/peter/projects/.worktrees/tx1-cdc-20261011`.

`E` = `/mnt/data/peter/projects/.worktrees/rs-raft-candidate-20261011/test-output/continuation-20261011`.

`I` = `E/cdc-c17-round7-review`.

`D` = `W/solve/quests/replicated-transaction-decision-and-apply/cdc-coverage-response-resource-handoff-amendment-20261011.md`.

| Artifact | Verified identity |
| --- | --- |
| D, 1534 lines; diagnostic copy `I/subject-cb751525.md` | SHA-256 `cb751525eb7772fc36203b6fa6aecea2b895cd1aa5e714437bb2e2db4143bc38` |
| Preserved `evidence/cdc-coverage-response-resource-handoff-amendment-round6-ab37ab32.md` | SHA-256 `ab37ab327409e5d173c3be858c26814c6bc94286b48a511d0fa7145798df1dfa` |
| Prior `E/review-cdc-c17-resource-round6-checkpoint.md` | SHA-256 `932be14d42109cc0408671fc52718d91248ee8d8518bbfd431b21c85954e705b` |
| Application navigation commit | `0e9a07604b5e29f0f686db3e567333c7775934df` |
| Previous 20-file/native navigation manifest | SHA-256 `54d4b25e402809084dae173dae70fbc7c22f44822b80631530124b21bd0b6bbe` |
| Current `I/navigation.json` | SHA-256 `2857b5edafcc314fd6a18d1ef9b3c57c51ef104ff9fba0d1fe2ef04e165ee99d` |

The entire 1111-line predecessor is an exact byte prefix of D. That prefix and
its earlier reviews were retained, and the full D:1113–1534 addition was read
against the existing owners. D:1122–1128 explicitly supersedes the conflicting
old WiIngress/shared-primary transport clauses. The caller clause is unchanged.

All 20 previous application navigation files were rehashed against live source:
**20/20 still match** their pinned 0e9 copies. Ten additional listener/config,
chart, bulk and shutdown files were extracted from 0e9 into
`I/navigation-0e9/`; **10/10 match live source**. The five previously pinned ws
package/source files still match: installed **ws 8.21.0**. The current runtime is
**Node v22.23.2**, V8 12.4.254.21-node.56, libuv 1.51.0. Its embedded JavaScript
implementation of HTTP server, net, Readable and Writable was copied read-only
to `I/node-v22.23.2/`; per-file hashes and runtime versions are in navigation.json.
This records observed implementation, not a promise about an unpinned runtime.

### Reference key

Application paths are relative to W and refer to the pinned copies. The 20
original copies remain under `E/cdc-c17-round6-review/navigation-0e9/`.

| Key | Path |
| --- | --- |
| RO / CT / RC | `src/cdc/cdc-coverage-reconcile-owner.js`; `src/cdc/cdc-integration-service-authoritative-catchup.js`; `src/cdc/cdc-complete-coverage-reconcile.js` |
| PO / FC | `src/cdc/cdc-coverage-transfer-owner.js`; `src/cdc/cdc-coverage-fragment-consumer.js` |
| SC / ST / PE | `src/partition/partition-cdc-source-coverage.js`; `src/partition/partition-cdc-coverage-transfer.js`; `src/partition/partition-service-entry-apply-base.js` |
| CO / CN / Cache | `src/cache/system-table-cache-cdc-source-order.js`; `src/cache/system-table-cache-observation-methods.js`; `src/cache/system-table-cache.js` |
| Domain / JSON | `src/cdc/cdc-coverage-domain.js`; `src/utils/canonical-json-data.js` |
| RI / RD / PL | `src/transport/message-router-inbound-dispatch.js`; `src/transport/message-router-delivery-behaviors.js`; `src/transport/message-router-pending-response-ledger.js` |
| Server / Dial / Shutdown | `src/transport/message-router-server-lifecycle.js`; `src/transport/message-router-connection-lifecycle-methods.js`; `src/transport/message-router-stats-shutdown.js` |
| Bulk | `src/transport/bulk-transfer-channel.js` |
| Ports / Config / PortDoc | `src/config/listener-port-model.js`; `src/config/configuration-manager.js`; `docs/listener-port-model.md` |
| Helm / Headless | `charts/lagrange-node/templates/_helpers.tpl`; `charts/lagrange-node/templates/service-headless.yaml` |
| AR / Registry | `src/cdc/cdc-integration-service-authoritative-read-flow.js`; `test/shards/impact-contracts.json` |
| WSReceiver / WSSocket / WSServer / WSBuffer | `E/cdc-c17-round6-review/installed-ws-8.21.0/lib/{receiver,websocket,websocket-server,buffer-util}.js` respectively |
| NodeHTTP / NodeNet / NodeRead / NodeWrite | `I/node-v22.23.2/{_http_server,net,internal/streams/readable,internal/streams/writable}.js` respectively |

Rules/router and the same ten verification templates govern the 63-item union
below. Existing trusted-private-network and strict-data boundaries apply.
Nothing here demands resistance to arbitrary trusted-host mutation or imports
the independent manifest/activation design findings.

## Whole-operation trace and supported portions

1. **Construction and prelane exchange:** D:1211–1261 withholds A/I inside the
   existing node pool, then reserves complete endpoint units before a probe.
   This preserves the D12 correction, but receipt of the primary reservation
   request precedes receiver root admission. D15 applies at that first exchange.
2. **Endpoint and connection selection:** D:1184–1209 defines purpose/version,
   bounded admission identity, incarnation checks and typed incompatibility.
   The current Bulk:341–370 registry is peer-keyed and closes a previous entry;
   D:1194–1202 explicitly proposes purpose/generation separation, so that source
   change is correctly identified rather than assumed present. The added
   address's configuration and production exposure remain D17.
3. **HTTP and upgrade:** D:1263–1299 binds I before dial and A before resuming
   accepted input; upgrade validates before creating a coverage Receiver.
   The stated count is coherent *once those admissions actually hold*: no more
   than eight accepted-plus-dialed I endpoints and eight additional A-bound
   prevalidation endpoints, for a conservative sixteen local sockets. The
   server's eight-connection ceiling may make the actual incoming subset
   smaller; it does not grant eight extra I slots. No accepted/outbound count
   omission was independently established beyond D15's primary exchange.
4. **Native and application receive:** D:1304–1404 uses public per-message,
   fragment and chunk-count options, disabled compression, binary Q, preowned
   P and immutable row transfer. These remove the old variable base64-primary
   ambiguity. Per-message payload length is checked before retaining payload
   by WSReceiver:437–450. Actual native read-ahead and unwind overlap remain D16.
5. **Application dispatch and publication:** D:1406–1459 keeps ordinary
   messages on their existing path, matches exact old WiPending for late input,
   and validates binary identity/length before copying into P. D:618–708 and
   CO's final fence retain suffix/ACK/commit convergence and the installed fact.
   Transport receipt, slot credit and ACK do not grant coverage authority.
6. **Completion and retirement:** external H/Wr/WiPending/Knotify/native holds
   survive semantic completion. D:1440–1459 requires exact drained terminals
   and prevents old callbacks from releasing successor tokens. Existing RO
   remains the retry owner; PO local release is synchronous. No new timer or
   recovery coordinator is proposed.

The D:1470–1478 arithmetic is internally consistent **conditional on its
component ceilings**: 16 + 34 + 2 + 49 + 16 + 8 MiB plus five bytes is below
126 MiB. The 8 MiB substitution reduces S/C further. Remote endpoints hold role
subsets, and colocation reserves the union. These sums are not measurements or
proof that the components fit. In particular D15/D16 prevent treating the
16 MiB Wbase as an established complete bound. The later source coefficients
for strings, maps, SQLite, framing and notification sharing remain ordinary
implementation proof obligations; their lack of current measurements is not a
fourth finding or permission to raise 128 MiB.

## D15 — Sender-local A tokens do not conserve receiver admission capacity

**Categories:** admission, retry pressure, concurrency, transport and resource
ownership. This is one grouped finding including refusal/duplicate custody and
both-node-order bootstrap routing.

D:1215–1223 assigns eight A slots to the node's possible admitted roots.
D:1236–1243 then reasons that a trusted sender's A token and envelope preflight
make the receiver's eight slots cover incoming admission messages before type
is known. The endpoint pools are distinct. No receiver-issued pre-send credit
or existing inbound producer bound maps the sender token to one of those
receiver slots. Upper root admission happens only after native assembly and
RI:50–52's parse.

**Compliant schedule:** choose a node U higher in the stable ordering than nine
other nodes. Each lower node has one affordable, correctly debited complete E
unit and one local A exchange. Each sends its first bounded upper-reservation
request to U over the ordinary primary path. All senders satisfy their own
eight-root limit, fixed deadline and exact envelope contract. U can receive
the requests while earlier request/parser or reply/send-callback custody is
still retained. Its design allocates eight receiver A cells, yet gives no
preclassification admission for the ninth exchange. No Byzantine sender or
unrelated ordinary oversized frame is required.

Rejecting the ninth upper E unit after parsing does not undo the already
retained input or the refusal response. Returning an existing grant for a
duplicate prevents a second *root*, but does not make a second physical request,
reply or lagging callback free. D:1245–1259 keeps those copies live correctly;
the aggregate credit backing them is the missing part. A lost response also
allows same-A redrive while old external references remain; its finite
population must be debited within the actual recipient bound, not just within
the sender's deadline.

D:1228's instruction that the reconcile owner reserves the lower E unit
“locally” additionally leaves the first request unspecified when the recipient
running RC is the upper node and the source is lower. RC/AR issues remote
source requests through PE/SC; no remote pool can literally be locally debited
by that recipient. The existing owner may execute a lower reservation request,
but its input, response and uncertain result need the same prelane conservation
as the upper request. Treat this as the other direction of this finding, not a
request for another coordinator.

**Required design correction:** identify receiver-owned admission before the
corresponding allocation, or an existing transport-owned finite population
which truly covers every compliant incoming attempt. Show how it applies to
both first-contact directions, refusals, duplicate/redriven requests, unknown
grants and callbacks that outlive semantic retirement. The receiver slots and
sender credits must have a non-overlapping conservation mapping. Preserve
ordinary primary dispatch and its supported traffic. A post-parse scalar test,
larger A constant, or maximum-eight-*local*-roots premise does not supply this
mapping.

**Future witness:** fan-in from more than eight compliant peers, delayed reply
callbacks, a refused and duplicate request, both source/recipient node orders,
and an ordinary SERVICE_RESPONSE alongside them. Assert retained A claims at
the target before and after receipt/refusal/drain, bounded producer progress,
unchanged deadline, useful admitted completion and truthful pressure for the
rest. This is a proposed proof, not an executed stress result.

## D16 — R is asserted, but its producer and native overlap bound is not defined

**Categories:** allocation ordering, transport, callback lifetime and byte
accounting. This is one grouped native-bound finding, not a claim that the
installed ws implementation violates its own contract.

D:1304–1333 proposes L/maxFragments/maxBufferedChunks, 64 KiB socket high-water
marks and deferred delivery. It acknowledges that chunk count does not bound
the Writable queue. D:1350–1369 nevertheless uses **R <= 128 KiB** in an exact
1.5 MiB I slot and declares constructor ceilings sufficient for a finite native
term at D:1463–1464. D:1315–1320 allows a “fixed ACK/response/WebSocket-control
burst” without specifying that burst's maximum bytes/count or the control
ordering that prevents it exceeding R. Saying a cadence above R is invalid
before opening the lane does not yet say which existing sender/receiver action
enforces that relation.

The pinned native source establishes the missing distinctions:

- **High-water mark is a threshold, not a hard preallocation cap.**
  NodeRead:512–547 appends a chunk before checking the readable length;
  NodeWrite:548–580 charges/enqueues or starts a write before comparing length
  with the high-water mark. WSSocket:1373–1376 calls Receiver.write and pauses
  after it returns false. Neither 64 KiB constructor value alone bounds the
  incoming chunk, current write, queued write, socket queue and HTTP head sum.
- **A message callback unwind is not an intervening parse barrier.**
  WSReceiver:625–631 and 653–658 emit the deferred message and synchronously
  call `startLoop(cb)` before the queued router microtask runs. Another already
  permitted frame can begin processing while the previous closure/native
  buffer still exists. D:1447–1448 prevents a fresh next-ordinal request, but
  the allowed same-turn ACK/response/control burst must also be counted. This
  does not assert that the proposed microtask necessarily releases early; it
  shows that all overlap up to that microtask must fit the debit.
- **Payload lengths are not always backing-allocation lengths.**
  WSReceiver:126–162 can return Buffer views into a larger input root or
  allocate a destination spanning chunks; WSBuffer:15–25 can allocate a full
  assembled buffer. D:1356–1359's “fragment roots L” must account actual unique
  backing roots and remaining aliases, rather than adding only visible view
  lengths. Whether their excess fits R must be derived with the same queue
  bound, not counted as released metadata.
- **The paused-accept seam must be selected, not assumed from HTTP options.**
  NodeHTTP:576–581 forwards highWaterMark to net.Server but does not forward
  pauseOnConnect. NodeNet:2280–2303 creates the Socket and then emits
  connection. D:1289's acquire-A-before-resume rule is sound as a requirement,
  but the described HTTP constructor options do not establish it. Public
  connection admission may be feasible; this review does not claim otherwise.

These facts do **not** prove an actual candidate exceeds 128 KiB, nor demand
hostile arbitrary bytes on a trusted peer. They show that the proposed
constructor parameters cannot by themselves establish the claimed aggregate
hard bound. An honest allowed ACK/response burst, fragment assembly and delayed
native unwind must fit by an explicit mechanism.

**Required design correction:** name the public construction/read-admission
seam and permitted burst/turn limits that derive a finite R before proportional
allocation. Give one non-overlapping bound for HTTP head, native current and
queued input, actual backing roots, assembled buffers and the old/new deferred
emitter overlap. Bind accepted and dialed sockets to it, including close-time
drain (WSSocket:1329–1363). State how the producer is stopped before it can
exceed the preowned allowance. If that cannot be enforced through the allowed
public seams, the design's explicit STOP is the correct outcome; measurement
of a typical receive chunk is not a replacement.

The exact runtime metadata coefficients can still be measured during source
implementation. This finding requires an executable limit/lifetime relation,
not a completed benchmark or future tests passing now. The existing ban on
private Receiver mutation, shrinking primary limits and adding a raw parser is
retained.

**Future witness:** real accepted/dialed sockets with the selected options;
controlled ACK/control plus maximum binary response ordering; fragmented input
and retained backing roots; unwind microtasks, queued input, close drain and
old-generation custody. Test supported progress and below-bound refusal under
the same whole-operation accounting. A constructor-value assertion alone is
not the native aggregate witness.

## D17 — The dedicated listener is outside the named port and deployment contract

**Categories:** production ownership, formation dependency and lifecycle.

D:1150–1177 proposes a separate CDC listener within MessageRouter and enumerates
transport/source/cache scope. D:1205–1209 advertises its address/version but
does not identify the owner that supplies or validates this fourth endpoint.

Ports:6–42/96–118 is the canonical three-listener owner: REST, admin WS and
transport WS, with derivation, valid range and distinctness. Config:179–198
consumes exactly those three values. PortDoc describes the same runtime and
Helm contract. Helm:71–87 validates the transport offset/collisions;
Helm:128–133/172–192 publishes the existing container/env/address fields.
Headless:12–21 exposes the formation-reachable node ports before readiness.
Server:29–77/104–127 starts and handles failure for the current wsPort;
Shutdown:163–171/223–250 owns existing listener teardown.

None of these owners defines the new listener. A capability string alone does
not decide its configured/derived or dynamically assigned address, collision
behavior, bind host, production exposure, publication-after-bind ordering, or
failure/unbind cleanup. A deployment following the present owner contract can
therefore expose its ordinary transport normally while having no usable
coverage endpoint. After D:1201's no-fallback rule, CDC recovery remains owed
and cannot progress on that deployment. This is a design omission, not a claim
that a fourth-port implementation was already attempted or that a specific
firewall failure was observed.

**Required design correction:** explicitly include the existing listener-port
owner and its runtime/deployment consumers in this bounded interaction. Choose
the endpoint allocation/configuration policy, validation and bind/exposure
rules; define when its capability is published and withdrawn across partial
startup failure and shutdown. Preserve its availability for recovery before
the readiness it helps establish. A particular new port number or static
instead of dynamic allocation is not prescribed by this review. The design
must make that choice through its owner instead of leaving an independent
default in MessageRouter.

**Future witness:** normal production configuration/startup and the repository's
existing deployment render/port tests, with valid endpoint, collision or bind
failure, restart and shutdown. Verify address publication only for the intended
bound listener and unchanged ordinary/snapshot routing. This does not demand a
new activation or global readiness barrier.

## Cumulative dispositions

| Earlier item | Current scoped disposition |
| --- | --- |
| N1/N2 | Source 2de remains approved; unchanged D:89–153, caller exits and fixed shared-generation deadline. |
| D1 | Full captured-envelope preflight retained at D:228–250. D15/D16 concern the remaining receiver aggregate/earlier native boundary. |
| D2/D7 | H custody and same-ordinal continuation at D:553–614 retained; Wr/ACK controls remain separately preowned. |
| D3 | Exact pair/adoption CAS and distinct source/recipient custody at D:426–435/499–503 retained. |
| D4 | Knotify through actual queued run/drop at D:660–675 retained; published cache state is not rolled back by caller exit. |
| D5 | Nonallocating canonical existing-cache comparison and outside-page NUL control at D:618–633 retained. |
| D6 | Disjoint complete S/H/C/K credit and fresh same-turn K comparison at D:923–965 retained; no post-probe cache-growth exemption. |
| D8 | Incremental byte-identical canonical digest at D:677–708 retained; future equality/measurement evidence remains required. |
| D9 | No new claimant coordinator; stable lower/upper order and refused-unit drain retained. D15 clarifies first-contact messages in both directions. |
| D10 | Exact Ps/Pr probe custody and no re-probe admission retry retained; both units precede the single probe. |
| D11 | Old WiPending survives semantic retirement until exact parse/drop/drained close; D:1415–1426 preserves it on the dedicated purpose. |
| D12 | Complete lower/upper units before first probe remain supported, conditional on conserved admission capacity. No probe-only retained claim is reintroduced. |
| D13 | Wr/Wo/Wi control/ACK/refusal overlap and finite original-cadence population retained; native ingress still needs D15/D16. |
| D14 | Dedicated-purpose preassembly selection and ordinary-message isolation supported as design direction. Complete native/admission/production closure remains D15–D17; dedicated-listener source is not approved. |
| R3-4/5/6/7 | Prior bounded publication fence, recovery discovery priority, pool census and strict applied-index text approvals retained. |
| R3-1/R3-2 | Allocation/colocation/resource source still held; no whole-memory, restart, event delivery or full startup approval. |

The 3 MiB NUL case, 8 MiB colocation, a supported row above 16 MiB versus a
multi-page backlog, N+1 before callback N, exact-capacity and below-capacity
cases, interruption, replay/conflict and newer suffix UPSERT/DELETE remain
cumulative at D:786–837/1096–1098/1512–1530. No weakening of those controls,
new global limit, extra timer, raw-read fallback or SQL rerun is approved.

## Category-complete 63-item review

Each item has concrete evidence and a disposition. “Retained” or “supported”
below means the specified design clause within its prior scope, never source
acceptance. All 63 instantiated items apply to this interaction; none is marked
N/A merely because implementation is future work.

### A — admission and current authority

| ID | Evidence and disposition |
| --- | --- |
| A1 | PO:32–49/117–146 and D:1211–1261/1440–1444 use the same node pool and preowned units. Receiver preclassification conservation is D15; native preallocation enforcement is D16. |
| A2 | D:1201–1209/1271–1278/1420–1436 preserves incompatibility, exhausted/stale refusal and debt instead of empty success. D15 must make even refused input affordable. |
| A3 | D:89–153/1245–1252 preserves caller versus shared attempt deadlines through joins, queues, exchanges and decode. RO:258–277/354–421 remains owner; no fresh budget is introduced. |
| A4 | RI:435–494/PL:419–435/PE:735–769 are actual ACK/result consumers. D:1415–1436 adds typed control/binary dispatch through these owners; admitted-resource tokens are not outcome authority. |
| A5 | D:1255–1261/1382–1392/1440–1459 names callback-unwind, drop, exact drained close and Knotify release. PO:62–81 supplies release wake. D16 must make the native terminal's overlap affordable. |
| A6 | D:1187–1192/1428–1436 and D:439–445/655–658 bind current source/recipient/generation and final cache publication. Slot possession never replaces canPublish; installed fact retained. |
| A7 | D:774–784/1440–1459 and PO:228–245 name held owner/category/generation. A/I and external copies must be diagnostic facts, not proof of D15 conservation or D16 release. |

### Y — retry and progress

| ID | Evidence and disposition |
| --- | --- |
| Y1 | D:1245–1252/1455–1459 retains existing retry for lost grant, close and capacity pressure. Useful recovery still depends on D15's receiver admission and D17's reachable listener. No extra loop proposed. |
| Y2 | D:1000–1044/1247–1252 retains unreadable/uncertain grant and externally owed input through semantic expiry. RO fixes wait duration; absence of response cannot free remote capacity. |
| Y3 | D:1271–1299/1415–1459 names invalid, missing, stale, protocol violation, retire and drain exits. No-handler/error must use existing typed path. D15 leaves preclassification exhaustion unowned. |
| Y4 | D:940–980/1228–1252 retains endpoint order and atomic colocation, preventing prior probe-only cycles. D15 covers first lower contact when the reconcile recipient is upper; D17 cannot depend on post-hydration readiness. |
| Y5 | D:889–903/1215–1223/1282–1299 retains finite cadence, root/subordinate counts and bounded logs. Receiver-wide A population is not bounded by sender roots (D15); R's burst population is D16. |
| Y6 | D:1245–1259/1382–1392/1457–1459 retains exact idempotent grant/cancel/retire and native-token release. Duplicate semantic grants do not erase duplicate physical copies (D15). |
| Y7 | D:897–903/1247–1252/1532–1534 preserves original attempt and caller clocks. ACK, table completion, retry or a capacity wake cannot renew or accelerate beyond the cadence used for the count bound. |

### T — transport

| ID | Evidence and disposition |
| --- | --- |
| T1 | RI:435–457 and RC:54–59 separate transport ACK/noHandler from processed evidence; D:1415–1436 retains that path. Callback/close release remains a separate physical fact. |
| T2 | D:1000–1039/1418–1426/1457–1459 preserves old Wi and exact generation after late input. N+1-before-callback-N still charged by H/Wr. D16 includes native old/new overlap before the microtask. |
| T3 | D:1201–1209/1271–1278/1415–1436 specifies incompatibility, refusal and protocol error without fallback. Ordinary RI:59–91/PL dispatch remains unchanged. |
| T4 | D:1247–1252/1293–1299/1455–1459 keeps uncertain remote grants and never-closed lanes as bounded pressure with bounded semantic wait. D15 must fund refused/duplicate physical traffic, not enqueue indefinitely. |
| T5 | D:1512–1530 requires real accepted/dialed ws, fragments, callback/close, both directions and colocation. Pinned ws/Node trace exposes D16; source tests and actual startup are explicitly future evidence. |

### S — time and lifecycle

| ID | Evidence and disposition |
| --- | --- |
| S1 | RO:60–75/258–277 owns injected time, positive cadence and unref; D:1247–1252 keeps its deadline. A/I/native custody adds no autonomous timer or caller budget renewal. |
| S2 | SC:263–271/371–422 and D:1187–1192 preserve leader/source/boot authority; transport purpose is correlation only. Recovery control and payload priority distinction remains D:778–784. |
| S3 | D:1000–1044/1418–1426/1455–1459 keeps router custody after semantic retirement and exact close before reuse. D17 must wire construction/failure/unbind into the existing production lifecycle. |
| S4 | D:1382–1392/1448–1459 retains callback, consumer and notification copies despite TTL/cancel. Legal lag is pressure, not false corruption. D16 must account the entire preterminal native overlap. |
| S5 | AR:511–516 and SC:263–271 keep authoritative recovery independent of an already-hydrated local cache. D17 requires the listener before the readiness recovery establishes; no force-open admission or new barrier is approved. |

### R — recovery and publication

| ID | Evidence and disposition |
| --- | --- |
| R1 | CO:395–445/494–545 and D:618–708 retain stage/suffix rows, tombstones, revisions and final current fence. Native accounting changes no CDC durable event/ACK owner or post-publication fact. |
| R2 | D:1194–1202/1382–1392/1418–1426 gives purpose/socket/admission/receive ordinal identity and exact old Wi custody. Source and live/replaced cache generation distinctions remain unchanged. |
| R3 | D:216–225/774–795/1428–1436 preserves complete coverage, exact final/next and malformed length refusal. Neither fully reserved credit nor an open CDC socket proves a complete population. |
| R4 | D:553–614/677–708/1524–1528 preserves same-N replay/conflict and immutable event/data identity. Lost grant redrive is exact-idempotent; no SQL rerun or manufactured event. |
| R5 | D:1201–1209/1455–1459 retains owed debt for incompatibility, unavailable listener or absent response. Missing output/empty queues never prove completion; D17 makes that hold recoverable in supported deployment. |

### C — concurrency and custody

| ID | Evidence and disposition |
| --- | --- |
| C1 | D:1211–1299 requires synchronous pool/A/I admission before producer or receive allocation. D15 breaks receiver conservation; D16 requires the actual paused-accept/native boundary, not admission after parse. |
| C2 | D:935–938/1187–1192/1428–1436 plus CO:535–545 retains post-await authority and final publication recheck. Full unit or connection identity cannot authorize stale evidence. |
| C3 | D:1245–1259/1293–1299/1382–1392 retains one winner per grant/socket/token and atomic handoff. Duplicate-root refusal is insufficient physical admission (D15). |
| C4 | D:490–503/1382–1392/1440–1459 sets semantic state before synchronous PO wake and forbids post-swap rollback. WSReceiver:625–658 parses before the release microtask: overlap must be charged under D16. |
| C5 | PO:32–49, D:1194–1202/1211–1223/1282–1299 scope pool/node/purpose/endpoint. Eight remote sender balances cannot be substituted for the target node's eight slots (D15). |

### F — production flow

| ID | Evidence and disposition |
| --- | --- |
| F1 | CT→RO/RC→AR→PE/SC/ST→RI/RD/PL→FC→CO remains canonical. D:1150–1177/1406–1436 adds native purpose routing; Ports/Config/Server/Shutdown/Helm are missing deployment consumers (D17). |
| F2 | RO:354–421/522–544 remains the sole retry/debt owner. D:1247–1252/1455–1459 preserves debt through source/socket unavailability. D15/D17 must make eventual production progress possible without another user write. |
| F3 | D:89–153 and unchanged source 2de preserve independent short caller exit and longer valid shared work. No new caller finding; transport-only custody cannot renew clocks or retract cache publication. |
| F4 | D:1350–1369/1470–1504 states Wbase+S+H+C+K+probe/control arithmetic and 8 MiB/greater-than-16-MiB cases. Algebra is consistent conditionally; D15/D16 leave Wbase unestablished, coefficients remain future proof. |
| F5 | D:1163–1180/1201–1209/1497–1504 forbids primary-limit shrink, snapshot semantics reuse, force-open, SQL rerun, extra coordinator and limit raise. D17 uses the existing listener owner, not an independent default. |

### H — evidence fidelity

| ID | Evidence and disposition |
| --- | --- |
| H1 | Exact predecessor/prefix and prior 932be review retain all old negatives. D15 is a compliant contract schedule; D16 is native-source mechanism evidence; D17 is an owner inventory gap. None is mislabeled a new executed regression. |
| H2 | Server/Dial/Bulk/RI/PL and installed ws 8.21.0/Node v22.23.2 are real pinned seams. New A/I/listener are proposals. D:1512–1530 requires actual constructor and production-path evidence at implementation. |
| H3 | D:1255–1261/1382–1392/1515–1528 independently requires recipient settle, send callback, native unwind and generation retirement order. D16 includes ws startLoop-before-microtask; no artificially shortened clock proof used. |
| H4 | D:1187–1202/1382–1392/1428–1436 carries full source/scope/generation/ordinal/length identity. D15 adds receiver credit binding without treating that correlation as source authority. |
| H5 | D:1512–1530 plus D:786–837 retain nonempty large row, outside-page NUL, below-bound refusal and useful recovery. D15 future fan-in must include admitted completion and ordinary waiter settlement, not a trivial all-refused run. |
| H6 | Exact D/prior/report hashes, 20+10 pinned source comparisons and ws/Node fingerprints recorded above. This is docs-only; startup/durable-event ACK/BEGIN/activation/source memory approvals are not claimed. |

### O — owner interactions

| ID | Evidence and disposition |
| --- | --- |
| O1 | D:1132–1140/1169–1180 retains MessageRouter transport, PO capacity, RO retry, source and cache authority. D17 adds the existing listener-port owner to the boundary; no second decision owner requested. |
| O2 | D:1211–1261/1406–1459 gives local A/I and canonical control/binary handoffs through real consumers. D15/D16 must finish preclassification custody; D17 finishes endpoint provision. |
| O3 | D:1512–1530 requires refusal and supported completion in one eventual source candidate, with cumulative D1–D13 witnesses. The three current design gaps must be resolved without deleting earlier progress/refusal obligations. |
| O4 | D:1245–1259/1418–1426/1457–1459 permits stale-to-fresh reentry under exact identity and retirement. No permanent claimant or successor-token release is authorized. |
| O5 | D:1211–1299/1497–1504 keeps unchanged count/byte pool and no force/limit bypass. Repeat compliant callers can exceed the unbound target A population (D15); native burst needs enforcing backpressure (D16). |
| O6 | PO:62–81 and RO:522–544 remain release/wake owners; D:973–980/1247–1252 keeps existing bounded remote retry. New listener availability/retirement must feed this existing lifecycle (D17), not add a second loop. |
| O7 | D:1187–1192/1382–1392/1428–1436 separates correlation, native release and publication authority. Counters, capability, hash or callback registration cannot prove backing storage free. |
| O8 | cb751/ab37/932be exact chain, navigation.json and immutable runtime/source copies retained. No future positive source run or simulated overflow is mixed into the design schedules. |
| O9 | Searched actual primary parser/ACK/PL, Server/Dial/Bulk purpose registry, shutdown, port/config/Helm consumers and native queues. D15–D17 are the complete new batch; no raw CDC SQL/read fallback or alternate retry is proposed. |
| O10 | Registry:894–942/1797–1860 and D:1169–1177/1512–1530 retain the existing coupled interaction. Add its listener/config and true prelane/native endpoints with implementation; generated metadata/test additions remain proposed. |

### J — JavaScript and byte domains

| ID | Evidence and disposition |
| --- | --- |
| J1 | D:228–275/1350–1369 preserves safe lengths/sums, canonical numeric domains and checked UTF-16/encoding arithmetic. D15 is a missing population, D16 a missing native bound, not an asserted numeric overflow. |
| J2 | JSON:109–174 and D:228–250/1415–1436 keep own canonical primitive control/header fields. Primary classification still follows parse, so inherited or parsed identity cannot retroactively reserve A (D15). |
| J3 | D:228–250/929–933/1382–1404 retains captured measurement/alias transfer and fresh K check. D16 requires unique backing allocation and callback custody, not only Buffer view lengths or a second accessor read. |
| J4 | Domain/JSON prototype guards and D:685–708 unchanged. D15 uses trusted compliant peers; D16 uses ordinary native queue semantics. No arbitrary hostile-host scope is added. |
| J5 | D:1184–1209/1263–1278/1336–1345/1432–1436 bounds primitive identity, control and error fields before send and forbids reflecting offending payload. Bounded individual fields do not establish recipient aggregate capacity (D15). |
| J6 | JSON:1–25 and prior canonical intrinsic contract retained. Native Node/ws inspection establishes observed API behavior, not a demand for immunity to runtime monkey-patching or unrelated host changes. |
| J7 | D:618–633/677–708/1336–1345 retains canonical digest bytes, NUL/escaping controls and nonallocating cache comparison. Binary CHUNK changes envelope encoding only; D16 counts raw/assembled/alias backing copies. |
| J8 | D:1215–1223/1282–1299/1395–1404/1470–1504 retains per-row/page/operation bounds and no all-data producer materialization. Whole receive populations still require D15/D16; no silent pool exclusion is accepted. |

## Completion

All 63 obligations have evidence-backed dispositions. D15–D17 are the complete
new grouped findings; repeated checklist references are effects of those
findings, not additional defects. Preserve the accepted caller source and
previously supported semantic/custody corrections while making the primary
admission conservation, native read-ahead mechanism and listener lifecycle
contract executable. No source implementation, new listener, whole startup or
merge-to-main approval follows from this report.
