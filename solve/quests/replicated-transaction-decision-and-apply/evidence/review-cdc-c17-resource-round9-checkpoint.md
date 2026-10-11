# C17 whole resource handoff: round-nine design review

Date: 2026-10-11. Independent reviewer:
`subagent:/root/review_checkpoint_composition`.

## Scoped verdict

**APPROVE DESIGN ONLY** at
`0c44f474493dc001385fe623eb7fb8eeed4d445fb84f075fa498887f2da2a130`.

The operative D:1536–2179 contract is coherent across initial admission,
complete-pair acquisition, bootstrap custody, ACK/result settlement, binary
receive, valid continuation, uncertain-result recovery and final release.
**No additional blocking design finding was established in this complete
63-item round.** D18–D20 are closed at this design scope:

- **D18:** the real ACK-then-result interaction and its two ledgers are retained.
  Local semantic permission advances independently of old send callbacks.
  Uncertain settlement initiates lane retirement/close, then the existing
  reconcile owner redrives the same identity after old-lane drain within the
  original deadline.
- **D19:** emitter dispatch is correctly downstream of assembly. Old retained
  payload custody moves to preowned downstream credit before the next native
  assembly. The current/next emitter, unexpected complete input and close-fed
  bytes have explicit phase ownership. Bootstrap has its own alternate I phase
  and must leave it before the first probe.
- **D20:** the last occupied A claim synchronously sets public maxConnections
  to zero. Only actual A release can reopen it. Retired claims remain counted,
  so native `_connections` decrement cannot create the prior admission gap.

**Resource SOURCE remains HOLD.** This approval is not proof that the current
code implements the contract or that the selected numerical/native coefficients
fit. The runtime/deployment policy decision, production artifact identity,
native lifetime certification, complete fixed 8 MiB accounting, and integrated
refusal/progress witnesses below remain required source gates. A coefficient or
native phase which cannot meet the contract requires an owner decision; it
cannot be concealed by a typical-memory measurement or an always-refusing
implementation.

The approved caller source at
`2de419483c9b4ce9e3fabc87bb54d93e4afb8817` remains closed and unchanged.
Prior bounded component approvals remain accepted inputs. No caller or
transaction semantics, production listener/source, image policy, deployment,
metadata, whole startup, durable CDC delivery/lost-ACK acceptance or merge to
main is approved here.

Only this report and diagnostic copies were written. No product/source/test,
design document, metadata, Quest, index, commit or remote was changed. No
implementation or cluster test was required or run for this design verdict.

## Exact subjects and evidence

`C` = `/mnt/data/peter/projects/.worktrees/tx1-cdc-20261011`.

`E` = `/mnt/data/peter/projects/.worktrees/rs-raft-candidate-20261011/test-output/continuation-20261011`.

`I` = `E/cdc-c17-round9-review`.

`D` = `C/solve/quests/replicated-transaction-decision-and-apply/cdc-coverage-response-resource-handoff-amendment-20261011.md`.

`Research` = `E/cdc-native-allocation-research-20261011T1950`.

| Artifact | Verified identity |
| --- | --- |
| D, 2179 lines; exact copy `I/subject-0c44f474.md` | SHA-256 `0c44f474493dc001385fe623eb7fb8eeed4d445fb84f075fa498887f2da2a130` |
| Previous subject, retained as `E/cdc-c17-round8-review/subject-997318ab.md` | SHA-256 `997318ab70d6ce4c8409e20e5d7b2f1ea307f364a530ac875775c85c6cad5590` |
| Prior complete round-eight report | SHA-256 `0833f5d03a7373d370a75780f663557c9ad49550e50c9b5957a98c6e9ead0098` |
| Application navigation commit | `0e9a07604b5e29f0f686db3e567333c7775934df` |
| Previous navigation manifest | SHA-256 `1143aa130b672354b6ad39bf6575319d4e70b164033cda1f8a2534cd1c941bca` |
| Native research manifest | SHA-256 `9e7db3759806da245390d3a887f32a0f27fe42f54daf910554e078265fe9b730` |
| Current `I/navigation.json` | SHA-256 `7324bd963d9aeb80d427993d14ca33b18e58aa5d65efd6dd121b8fb7035b7219` |
| Observed Linux x64 Node executable | SHA-256 `3517c2df0b2f8cd7f422b4b8450ef81c6889f08eb03e281d6de9079b15e6a327`; Node v22.23.2 / libuv 1.51.0 |

The 100170-byte prefix before the replaced effective section is byte-identical
to the predecessor. The full new operative section was read, and its diff and
cumulative earlier guarantees were examined. D:1544–1546 expressly makes the
old contradictory A/I/turn/receive clauses historical; they are not competing
requirements. The caller clause is unchanged.

All **34/34** application/package/deployment navigation files still match their
pinned source. All **5/5** installed ws package/source files still match the
ws 8.21.0 copies, and all six retained official native research files match
their manifest. These are source observations, not executed aggregate memory
or supported-runtime proof. Root's newer preservation commit is not used as a
substitute for this exact documentation scope.

### Reference key

Application paths below are relative to C and refer to pinned navigation copies
enumerated in `I/navigation.json`. Node JavaScript remains in
`E/cdc-c17-round7-review/node-v22.23.2/`; installed ws is in
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

Rules/router and the same ten verification templates govern the 63-item union.
The existing strict-data and trusted-private-network boundary is retained.
D:1866–1873 states the finite trusted producer discipline explicitly; this
approval does not claim a bound on arbitrary hostile TCP traffic or a mutated
trusted host.

## Combined trace and resolution of the prior schedules

### 1. Receiver admission remains conserved through retirement

NodeNet:2247–2269 checks maxConnections before constructing a Socket, but
NodeNet:809–860 decreases the native live count before later close completion.
D:1604–1623 now separates these facts: the eighth A claim sets maxConnections
to zero synchronously, and actual A release is the only reopening event.
Thus an old destroyed socket which still owns A leaves the admission gate shut
even if native count falls. With a free A cell, maxConnections eight remains
an additional live ceiling. The prepended claim precedes HTTP parser/read work;
all shutdown paths keep admission zero. The prior D20 schedule no longer gains
an uncredited Socket merely by decrementing `_connections`.

D:1644–1660 also withdraws the old twelve-live-Socket projection as the total
custody proof. Eight A plus four Iout plus four Iin identities, including
retired identities, are the sixteen preowned Wbase cells. A-to-I transfer is
atomic and adopts or retains each actual reference before releasing A. There
is no gap in which the same bytes become unowned.

Adrop is separately restricted to the pre-Socket branch. UV:508–532 establishes
one accept in a listener callback; D:1635–1642 explicitly requires the pinned
close-phase ordering and refuses certification if two dropped handles can
overlap. That is a concrete native-profile proof obligation, not permission to
store arbitrary rejected Socket/parser populations in Adrop. Its coefficient
and complete native-loop proof remain source HOLD.

### 2. Both remote orders complete their unit before the single probe

D:1671–1700 defines local-lower and remote-lower acquisition through the same
preadmitted lane. Lower E precedes upper E; colocation takes the union without
opening a lane. The four Iout/four Iin partition leaves inbound capacity when
both peers have four outbound connections pending. This removes that specified
opposing-connect cycle without a new fairness or retry owner. Available E
credit, current authority and eventual external drain remain prerequisites;
no progress is promised while all physical capacity is permanently retained.

The pre-E request/ACK/result now has its own Ibootstrap phase. Its two endpoint
maxima are explicitly distinct (D:1875–1899): requester 1392 KiB + 195 bytes,
responder 1264 KiB + 195 bytes. Both fit the existing I cell conditionally on
their certified coefficients. Grant transfers surviving bootstrap references
into the complete E unit's **1400 KiB earmark inside the existing 8 MiB term**.
The granting endpoint transfers before sending the grant result; a local-upper
requester transfers after it acquires its upper unit. The first probe cannot
start while bootstrap remains in I. Refusal/cancel reuses the fixed bootstrap
window only after its previous population drains. This provides completion
capacity before the later native data peak without borrowing I twice.

### 3. The actual router contract now has an executable continuation

RI:435–439 sends ACK before invoking the handler. Success/noHandler/error uses
SERVICE_RESPONSE at RI:449–494. RD:347 registers the result waiter before
delivery; RD:471–503 still requires delivery ACK before returning the result.
PL:530–559 settles pendingMessages, while PL:419–435 settles pendingResponses.
D:1743–1788 retains that separation. The proposed binary CHUNK_RESULT is a
bounded encoding of the result and enters the same disposition owner; it does
not enter SERVICE_MESSAGE or trigger another ACK. An early result cannot
bypass the ACK branch. The result is validated against the expected live or
retired request before settlement.

D:1790–1812 records EXPECT_REQUEST(N+1), or the exact terminal disposition,
before sending the result. N+1 may therefore arrive while older callbacks
remain held. Those callbacks still own their original H/Wr/Wo copies; they
neither grant permission nor veto a valid next request. If source H still owns
ordinal N, the retained D:553–614 HELD_ORDINAL_DEFERRED contract keeps the
consumer at the same next ordinal under the existing cadence. Physical
backpressure retains the same operation and obligations.

Lost ACK/result no longer needs an absent reply to return a fictional turn.
D:1814–1834 transitions the exact lane to RETIRING, initiates public close,
retires its existing ledgers, and lets RO redrive the same identity after old I
drain within the remaining original deadline. Expiry/shutdown uses the same
retirement path and does not free physical custody early. Existing
RO:354–421 remains the owner of generation wait/backoff/cooldown.

The existing late-response route is real: PL:184–224 resolves live versus
retired disposition and RI:516–529 exposes an opaque late-response context.
That current event indicates handled delivery, not arbitrary semantic success.
The proposed coverage adapter must consume the exact validated coverage result
and current reconcile identity as D:1761–1788 requires; it cannot use a generic
non-error late notification to erase HELD/noHandler/unavailable debt. This is
part of the specified canonical source integration/witness, not a second
predicate or a new design finding.

### 4. Native receive no longer relies on an after-assembly precheck

WSSocket:347–357/428–437 provides the public pause/resume seam. It does not
stop WSReceiver:627–631/654–658 from continuing over already delivered bytes;
the revised contract acknowledges that fact. D:1841–1864 pauses at emitter
entry and moves the entire expected raw backing, including emitter/consumer
aliases, into an already owned downstream claim before parsing/async dispatch.
An old contiguous L may therefore remain in WiPending while the next I phase
owns roots L plus concat L. The old payload is not called free or charged to
two independently reusable accounts.

D:1904–1944 accounts current-plus-next deferred closures, an unexpected complete
message assembled before dispatch, more native reads, and the close path which
can write remaining readable bytes into Receiver (WSSocket:1329–1363).
Receiver DEFER_EVENT prevents assembling a third deferred message at that
instant. The finite versioned producer contract allows ACK plus one result in
the reply direction and a bounded current/stale-successor request population
in the other direction; terminal CLOSE is separately included. This bounds the
input population before send within the declared trust model. It is not an
unbounded extra stream relabeled as one 64 KiB read.

The governing arithmetic is correct: 2*640 + 64 + 64 + 64 + 48 KiB + 195 bytes
= **1520 KiB + 195 bytes**, below 1536 KiB by **15 KiB + 829 bytes**. The
bootstrap earmark exceeds its requester maximum by **7 KiB + 829 bytes**.
These sums have explicit phase/custody premises. They are not native execution
proof. In particular, D:1930–1937 requires the production V8/receiver witness
that old fragment roots are gone when the old contiguous payload is moved.
Pinned WSReceiver:601–631 replaces the fragment array and the deferred callback
references `data`, so this is a concrete certifiable premise; if the artifact
retains the old fragments, the documented STOP applies. No extra backing may
be called free to make the equation pass.

### 5. Listener ownership and publication remain ordered

D:2001–2073 retains the existing Ports/Config/Helm/headless and MessageRouter
ownership for REST+3/override, four-way collision validation, the transport
bind host, stable advertised address, bind-before-capability and withdrawal/
drain on shutdown. The endpoint can be reached during recovery before its
readiness consequence; it does not depend on already-complete hydration.
The runtime decision is explicit and still open: current package engines
`>=22.12.0`, CI Node `22`, and the actual distroless production stage are not
silently narrowed by a locally observed Linux x64 executable. Pinning only the
builder would be insufficient, as D:2038–2044 now states.

## Remaining source gates — material limits of this approval

These are already specified implementation/certification obligations, not new
blocking design findings or requests for preimplementation tests:

1. **Existing runtime/deployment owner decision:** certify the actual immutable
   distroless image/executable and ws/Node/libuv/platform behavior, or another
   profile with the same bounds. Enforce mismatch before binding/publishing.
   No support-policy narrowing or production artifact is approved here.
2. **Native admission and lifetime:** implement A live/retired claim/release and
   8/0 maxConnections transitions, accepted/dialed construction, Adrop close
   ordering, actual HTTP/fragment/backing/concat/deferred/close phases, and the
   old-fragment release premise. Source must stop if a required native premise
   is false; it cannot be treated as a favorable average measurement.
3. **Whole operation arithmetic:** certify Mlane, Gc, Bsend, Aactive, Adrop and
   S/H/C/K with actual simultaneous copies and counts. Fit the 1400 KiB retained
   bootstrap, raw old WiPending payload and all later control/send obligations
   inside the **same fixed 8 MiB** term before admission. Admission which always
   refuses the supported case is not the requested progress proof.
4. **Actual owner composition:** implement JSON and binary result mapping,
   current/retired evidence validation, noHandler/error/early/late outcomes,
   old-callback N+1, same-identity uncertain redrive, canonical FC decoding and
   preallocated P copying through RI/RD/PL/RO/PO/FC/CO. The currently pinned FC
   still uses base64/chunk accumulation at FC:85–105/131–164; this approved
   proposal has not changed those bytes or proven their replacement.
5. **Cumulative paired witnesses and metadata:** real accepted/dialed sockets,
   both remote orders, opposing four-out/four-in, fan-in above eight, refusal/
   destroy/close/replacement, exact/below capacity, interruption/replay/conflict,
   ordinary SERVICE_RESPONSE isolation, supported 8 MiB colocation and one
   16 MiB+1 event versus a many-page backlog above 16 MiB. Preserve NUL and
   newer suffix UPSERT/DELETE controls. Register the source witnesses through
   the existing impact/test-metadata owner.

The whole-operation <126 MiB sum remains conditional on all component ceilings.
Neither it nor this design approval establishes actual bounded RSS, normal
startup, original-event delivery after restart or delivery-followed-by-lost-ACK
recovery. Those broader proofs remain open against the eventual exact source.

## Cumulative dispositions

| Item | Current disposition |
| --- | --- |
| N1/N2 | Caller source 2de remains approved and closed; original caller/shared-generation budgets unchanged. |
| D1 | Captured full-envelope preflight retained; binary result encoding has an explicit canonical router consumer. |
| D2/D7 | Exact H custody and same-ordinal HELD continuation retained; semantic N+1 no longer waits for or misclassifies old callbacks. |
| D3/D4/D6 | Exact pair/adoption CAS, disjoint source/recipient credits, fresh K and Knotify through actual terminal retained. No postpublication rollback. |
| D5/D8 | Nonallocating existing-cache comparison, NUL control and byte-identical canonical incremental digest retained. |
| D9/D10 | Lower/upper ordering, atomic colocation, exact Ps/Pr and one probe retained; both endpoint orders and bootstrap transfer now explicit. |
| D11/D12/D13 | Old WiPending, complete units before probe, Wr/Wo control overlap and fixed cadence retained inside unchanged budgets. |
| D14/D15 | Dedicated purpose, ordinary/snapshot isolation and receiver-owned first contact remain supported. No shared-primary admission claim remains. |
| D16 | Audited native-profile approach and phase arithmetic supported as design; runtime/native coefficient source HOLD remains. |
| D17 | Existing listener/config/Helm/startup/shutdown ownership remains design-approved; no source or runtime-policy approval. |
| D18 | Design closed by real ACK/result ledgers, local next-request state before result send, independent callback custody, and explicit retire/drain/redrive. |
| D19 | Design closed by full successive-assembly/downstream/close custody, two-emitter phase handling and finite producer population. Native premises remain source gates. |
| D20 | Design closed by A-owned live-plus-retired count and synchronous 8/0 admission tied only to actual A claim/release. |
| R3-4/5/6/7 | Prior bounded publication fence, recovery routing priority, actual pool census and strict applied-index text approvals retained. |
| R3-1/R3-2 | Resource/colocation source remains held pending the exact implementation and cumulative witnesses. |

## Category-complete 63-item review

All 63 instantiated items apply and have evidence. “Supported” below is this
design verdict, never a claim that a future source test already passed. No
unrelated manifest, activation or trusted-host requirement is added.

### A — admission and current authority

| ID | Evidence and disposition |
| --- | --- |
| A1 | PO:32–49/117–146 and D:1558–1623/1671–1700 admit from the same node pool before A/I/E materialization. The last A claim closes native admission even after `_connections` falls. Supported; native enforcement remains source gate. |
| A2 | D:1756–1788/1814–1834 retains ACK versus success/noHandler/error, uncertain grant and typed retry/retire. Missing evidence is never empty success; retained debt remains owned. Supported. |
| A3 | D:89–153/1816–1831 and RO:258–277/354–421 retain caller and fixed generation deadlines across discovery, queue, decode, close and redrive. Replacement uses remaining time, not a renewed budget. Supported. |
| A4 | RI:435–494, RD:347/471–503 and PL:419–435/530–559 match D:1743–1784. Binary result enters the canonical response disposition; ACK and result are terminal non-ACKing branches. Supported design adaptation. |
| A5 | D:1594–1618/1844–1864/2064–2073 names exact A release, downstream/emitter terminal, close drain and Knotify release. PO:62–81 supplies the existing release wake. Supported; no diagnostic release substitute. |
| A6 | D:1676–1700/1761–1788 and D:439–445/655–658 preserve current source/request/incarnation and final cache fences. Transport credit does not authorize stale coverage; installed fact is retained. Supported. |
| A7 | D:774–784/1644–1660/2077–2090 and PO:228–245 identify actual live/retired owner, copies and generation. Native count is explicitly a projection. Supported; implementation diagnostics must expose these actual holds. |

### Y — retry and progress

| ID | Evidence and disposition |
| --- | --- |
| Y1 | D:1814–1834 initiates close on uncertain ACK/result and returns typed retry to RO after old-lane drain. D:1662–1669 uses existing cadence after capacity release. The previous lost-turn cycle is removed. Supported. |
| Y2 | D:1692–1697/1816–1831 preserves uncertain remote grant and externally retained copies despite deadline. A missing result cannot be inferred to be refusal. Caller/attempt waiting remains bounded. Supported. |
| Y3 | D:1758–1788/1814–1834/1861–1864/2064–2073 explicitly covers noHandler, error, orphan, timeout, retire, cancel, close and shutdown. Each retains physical ownership until its terminal. Supported. |
| Y4 | D:1662–1700 reserves inbound separately from outbound and complete E in lower/upper order; colocation is atomic. D:1814–1834 avoids waiting for a missing reply to permit retry. No new retry/capacity cycle found. |
| Y5 | D:889–914/1580–1588/1802–1812/1866–1873 bounds count, bytes, cadence and retained control populations. Fixed 8 MiB fit is a mandatory aggregate source gate; excess accepted work waits under owned backpressure. Supported contract. |
| Y6 | D:1698–1700/1814–1831 preserves exact grant/request/attempt identity through late response and replacement. Same-N replay and exactly-once release remain D:553–614. Supported; no duplicate E or SQL rerun. |
| Y7 | D:1550–1552/1816–1831 keeps original deadline and cadence. ACK, result, capacity release or a refreshed table cannot renew them. Existing RO cooldown remains its separate established debt owner. Supported. |

### T — transport

| ID | Evidence and disposition |
| --- | --- |
| T1 | RI:435–457/RC:54–59 and D:1771–1784 distinguish delivery ACK from handler result. ACK neither advances the next request nor releases custody. Binary CHUNK_RESULT cannot recurse through SERVICE_MESSAGE. Supported. |
| T2 | D:1785–1812/1827–1829 preserves old-context late input and permits valid N+1 before old send callbacks. Old H/Wr/Wo releases only its identity; successor lane cannot be released by stale evidence. Supported. |
| T3 | D:1756–1788 routes success/noHandler/error/control as JSON result and validated CHUNK as binary result through PL. Retryable uncertainty uses the same owner at D:1819–1826. Supported canonical classification. |
| T4 | D:1814–1834/2060–2062 makes unavailable or lost settlement bounded semantically while external custody may remain pressure. Explicit close/drain is reachable; no indefinite implicit turn wait remains. Supported. |
| T5 | D:2131–2151 requires real accepted/dialed/native/callback/close witnesses and ordinary traffic controls. WS/Node source was independently checked; no stub, native run or source result is misrepresented here. Source proof remains open. |

### S — clocks and lifecycle

| ID | Evidence and disposition |
| --- | --- |
| S1 | RO:60–75/258–277 retains injected clock, positive delay and unref. D:1819–1831 adds no timer/queue and uses the remaining generation budget. Supported. |
| S2 | SC:263–271/371–422 and D:1676–1679 retain source leader/scope and boot-incarnation gates; D:778–784 retains payload priority. Native profile/capacity is not authority. Supported. |
| S3 | D:1644–1660/1816–1831/2064–2073 distinguishes live, retired and restarted identities. Router shutdown drains old custody before Wbase; new generation cannot adopt old callbacks. Supported design, restart source witness open. |
| S4 | D:1802–1812/1844–1854 keeps send, consumer, emitter and notification custody through legal lag/expiry. TTL is not a free operation; N+1 is semantically permitted while old physical copies remain. Supported. |
| S5 | AR:511–516/SC:263–271 and D:2027–2029/2049–2059 make recovery route/listener available before recovery-dependent readiness. No force-open mutation gate or extra global readiness barrier appears. Supported; actual startup remains unproved. |

### R — recovery and publication

| ID | Evidence and disposition |
| --- | --- |
| R1 | CO:395–445/494–545 and D:618–708 retain staged rows, suffix, tombstones, revisions and final current fence. D:2089 keeps publication distinct from callback release. Commit/ACK convergence is unchanged in design. |
| R2 | D:1594–1618/1644–1660/1785–1788/2071–2073 binds exact A/I/lane/source/generation identities across live replacement and restart. Retired ownership remains separate. Supported. |
| R3 | D:216–225/774–795/1698–1700 retains complete coverage, final/next boundaries and pair proof before probe. Neither socket admission nor reserved bytes can convert partial/malformed input into empty success. Supported. |
| R4 | D:553–614/677–708/1814–1831 retains original page/event identity, same-N replay/conflict and uncertain same-identity recovery. No SQL reexecution or event recreation. Supported. |
| R5 | D:1816–1831/2060–2062 keeps unavailable/noHandler/unknown input as owed debt. RI:516–529's generic handled-delivery event alone is not semantic completion; exact validated coverage result is required by D:1761–1788. Supported boundary. |

### C — concurrency and custody

| ID | Evidence and disposition |
| --- | --- |
| C1 | D:1604–1618/1673–1691/1841–1854 provides synchronous A/I/E claim and downstream transfer before resume/parse/async handler. Native assembly is already preowned by I, not retrospectively admitted at emitter. Supported. |
| C2 | D:935–938/1428–1436/1761–1788 and CO:535–545 retain revalidation at request, result, handoff and publication. Original caller/shared clock remains current; no credit or stale route replaces it. Supported. |
| C3 | D:1594–1618/1698–1700/1790–1812 gives one exact claim/grant/result transition winner. Next-request permission is installed before the peer can receive the result; callbacks cannot roll it back. Supported. |
| C4 | D:490–503/1609–1618/1814–1831/1904–1944 accounts synchronous release wake, timeout, close and two deferred emitters. Retired A cannot reopen on native count drop; publication cannot be retracted. Supported. |
| C5 | D:1558–1660 scopes A to receiver, I to direction/generation and E to the node-shared pool. All sixteen Wbase identities include retired custody; no sender-local balance stands in for receiver credit. Supported. |

### F — production flow

| ID | Evidence and disposition |
| --- | --- |
| F1 | CT→RO/RC→AR→PE/SC/ST→RI/RD/PL→FC→CO remains the owner chain. D:1743–1788 defines binary result adaptation and D:2001–2073 includes Ports/Config/Helm/Server/Shutdown. No local raw bypass. Supported design inventory. |
| F2 | RO:354–421/522–544 remains recovery/debt retry owner; D:1814–1834 supplies lane retirement/redrive without requiring another user write or hydrated cache. Actual wake/source composition remains a required source witness. |
| F3 | D:89–153/1553–1554 leaves source 2de caller cancellation/deadline and longer shared work untouched. No new caller-source behavior is inferred or reopened. Retained approval. |
| F4 | D:1875–1899/1952–1984/2102–2118 accounts bootstrap, native phases, old WiPending and whole S/H/C/K totals. Arithmetic is coherent; actual fixed 8 MiB/coefficients and supported large-event/backlog progress remain source gates. |
| F5 | D:1708–1712/2153–2160 prohibits raw parser, private bridge, extra retry/ledger, limit increase, borrowed ordinary/snapshot capacity and smaller supported rows. No readiness force-open or SQL rerun. Supported. |

### H — evidence quality

| ID | Evidence and disposition |
| --- | --- |
| H1 | Prior exact 0833f5 report and 997318 subject preserve D18–D20 schedules. Current 0c44 supplies concrete state/custody corrections; no missing future test is treated as a new design red. Supported scope. |
| H2 | RI/RD/PL, current FC and pinned ws/Node/libuv are actual source seams. New adapters and phase accounting are proposals. D:2131–2151 requires real production-owner/native evidence rather than helper-only proof. Source remains held. |
| H3 | D:1802–1831/1904–1944/2139–2145 independently orders peer receipt, old send callback, old handler/emitter, next assembly and close. No remote callback oracle or compressed deadline is used. Supported. |
| H4 | D:1676–1700/1761–1788 retains complete request/node/role/boot/admission/generation/ordinal/length/digest identity. Live/retired binary results must bind before canonical settlement. Supported. |
| H5 | D:2133–2151 requires nonempty useful completion, refusal, nine-peer fan-in, retired replacement and ordinary response control; old NUL/suffix/replay witnesses remain. An always-refused supported case cannot satisfy this approval. |
| H6 | Exact design/prior/report/navigation/native hashes and 34+5 source checks recorded. Docs-only approval is separate from runtime policy, source memory, full startup and original CDC delivery/ACK acceptance. Explicit ceiling. |

### O — owner interactions

| ID | Evidence and disposition |
| --- | --- |
| O1 | D:1548–1552/1743–1769/2001–2073 retains PO resource, RO retry, MessageRouter delivery, Ports deployment and cache/source authority. No new coordinator or second settlement owner. Supported. |
| O2 | D:1569–1588/1743–1788/1844–1854 supplies typed bootstrap, ACK/result and downstream custody through real consumers. Binary encoding adapts into PL instead of bypassing it. Supported interaction, source absent. |
| O3 | D:2131–2151 retains invalid/refusal and supported recovery in one eventual candidate, including all old counterexamples. Current design closes prior schedules without removing legitimate recovery controls. Supported. |
| O4 | D:1814–1831/2071–2073 permits stale-to-fresh same-identity reentry after exact drain and retains old custody independently. There is no permanent strict-turn veto or callback authorization of a successor. Supported. |
| O5 | D:1580–1588/1802–1812/2128–2160 requires full admission before work and backpressure under unchanged limits. No after-allocation forgiveness. Count/byte aggregate and supported progress are mandatory source gates. |
| O6 | PO:62–81, RO:522–544 and D:1615–1618/1665–1669/1819–1826 connect actual local release and typed remote outcome to the existing retry owner. No competing wake timer/queue is proposed. Supported. |
| O7 | D:1597–1599/1773–1776/1849–1854 separates projections, ACK, capacity and actual reference release. Native count, result receipt or capability cannot prove storage/callback authority. Supported. |
| O8 | 0c44/997318/0833f5 and native research 9e7db exact chain retained in I. Conditional arithmetic and unresolved certification are not mixed with positive executed source evidence. Supported provenance. |
| O9 | Checked canonical RI/RD/PL, raw payload/FC boundary, PO/RO wake and admission, native Receiver/close/count transitions and deployment consumers. No additional reachable blocking design finding found in this bounded complete round. |
| O10 | Registry:894–942/1797–1860 and D:2131–2151 keep the existing transport/cache/reconcile interaction and named listener/runtime endpoints. Source tests and generated metadata must land together; no metadata approval is implied now. |

### J — JavaScript and byte domains

| ID | Evidence and disposition |
| --- | --- |
| J1 | D:228–275/1875–1899/1946–1968 and Ports retain safe integer length/count/port arithmetic and canonical domains. Bootstrap/native margins were independently recalculated; no unsafe numerical coercion is authorized. |
| J2 | JSON:109–174 and D:228–250/1761–1788 retain own canonical primitive wire fields and request-bound result validation. Capacity/correlation never grants inherited evidence authority. Supported. |
| J3 | D:228–250/929–933/1844–1854/1922–1937 captures measured values once and charges exact backing aliases through both emitter and consumer terminals. Real copies remain separate. Supported; production old-fragment proof is explicit HOLD. |
| J4 | Domain/JSON prototype defenses and trusted-host scope are unchanged. D:1866–1873 explicitly bounds the versioned producer; arbitrary hostile TCP or monkey-patched runtime immunity is not silently claimed. Supported scope. |
| J5 | D:1263–1278/1336–1345/1756–1788 bounds primitive control/error/header fields and distinct result enums. ACK/noHandler/control cannot become truthy processing success. Supported. |
| J6 | Existing JSON intrinsic contract retained. D:1714–1739/2031–2044 explicitly limits native premises to a future certified artifact; unsupported-runtime policy is not implicitly approved. Supported distinction. |
| J7 | D:618–633/677–708/1336–1345 retains nonallocating cache comparison, NUL/escaping accounting and exact semantic digest bytes. Binary result changes transport encoding, not canonical page/digest authority. Supported. |
| J8 | D:1569–1588/1866–1899/1946–1999/2153–2160 bounds individual and aggregate row/page/control/native populations. No all-dataset materialization is hidden behind page size. Source must enforce the fixed totals and retain obligations under pressure. |

## Completion

All 63 obligations have concrete evidence-backed dispositions. The complete
operative resource design is approved at the exact 0c44 subject; no new design
finding is open in this round. Keep SOURCE HOLD and its explicit native,
runtime, aggregate-memory, progress and metadata gates. Preserve 2de caller
approval and the earlier scoped components. The next meaningful acceptance is
the coherent source interaction and its cumulative production-path witnesses,
followed by the separate startup/recovery and merge gates.
