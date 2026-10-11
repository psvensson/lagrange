# C17 whole resource handoff: round-ten design review

Date: 2026-10-11. Independent reviewer:
`subagent:/root/review_checkpoint_composition`.

## Scoped verdict

**REVISE DESIGN** at
`0d725dc43b55eaaa4af10fe1b3eae809f96bbfabfeebef0d25e053be5cf06399`.

This complete round identifies two bounded corrections:

1. **D22 — shutdown releases the native reservation too early.** Server `close`
   followed by one public immediate does not necessarily cross a native close
   phase. The exact production executable still has a dropped native TCP
   wrapper at that proposed release point. The corrected standing reservation
   must survive a demonstrable close-phase boundary and its remaining owned
   bookkeeping.
2. **D23 — the distribution policy must preserve existing recovery promises.**
   The proposed required/optional setting has no explicit restriction to modes
   already supported by the product contract. It must not make a currently
   required CDC/cache recovery path optional to qualify a candidate. Concrete
   profiles belong to the existing release/platform owner; `engines >=22.12`
   is not certification of every Node patch or operating system.

The **standing 48-root native batch approach**, **fixed subordinate count banks**,
non-self-referential artifact/profile composition, complete-pair acquisition,
ACK/result interaction, ordinary/snapshot isolation, and previously accepted
caller/source scopes remain supported as described below. There is no newly
established fixed-bank overflow, opposite-direction deadlock or impossible
colocated supported-row equation in this round. Numeric caps requiring the
future adapter remain implementation gates, not demands that unimplemented
tests pass before design approval.

**Resource SOURCE remains HOLD.** No production transport, release/profile
policy, deployment, metadata, whole startup, durable CDC restart/lost-ACK
acceptance or merge to main is approved. The caller source
`2de419483c9b4ce9e3fabc87bb54d93e4afb8817` remains approved and closed. This
amendment does not change its original caller or shared-generation deadlines.

Only this report and diagnostics under `I` were written. No source, test,
design, Quest, metadata, index, commit or remote was changed. One bounded native
phase diagnostic was run; there was no cluster or application acceptance run.

## Exact subjects and reference key

`C` = `/mnt/data/peter/projects/.worktrees/tx1-cdc-20261011`.

`E` = `/mnt/data/peter/projects/.worktrees/rs-raft-candidate-20261011/test-output/continuation-20261011`.

`Q` = `C/solve/quests/replicated-transaction-decision-and-apply`.

`D` = `Q/cdc-coverage-response-resource-handoff-amendment-20261011.md`.

`I` = `E/cdc-c17-round10-review`.

`P` = `Q/evidence/cdc-runtime-allocation-certification-20261011T2100`.

`N` = `P/node-v22.22.0-libuv-v1.51.0`.

| Artifact | Verified identity |
| --- | --- |
| D, 2551 lines; retained `I/subject-0d725dc4.md` | SHA-256 `0d725dc43b55eaaa4af10fe1b3eae809f96bbfabfeebef0d25e053be5cf06399` |
| Complete predecessor, 2179 lines / 144212 bytes | SHA-256 `0c44f474493dc001385fe623eb7fb8eeed4d445fb84f075fa498887f2da2a130`; exact prefix of D |
| Round-nine report | SHA-256 `aa0e355c25522395bacf9123fe7197815918476b40614318fcc4bfd95a577b64` |
| P/certification-report.md | SHA-256 `4af9e5a5325aa76bcb39a0fd10583e902455eb311f6158b8a31ecd270d6c7c56` |
| P/packet-sha256.txt | SHA-256 `f219ab10bc2910a6895086bb1e56c0514b6a2db429a809928f6b2ae543ed7c82`; 46/46 entries verified |
| Q/evidence/cdc-adrop-native-layout-20261011.md | SHA-256 `229cc51ac92c86f9563d52d35cd7b921f04512c64dc434c57d9d74f6b19251dc` |
| I/navigation.json | SHA-256 `94ecff53f842f1c23c994733f078c77d73bd8a4b6eac8ca8e6c2b691b4b397f4` |
| Actual diagnostic executable | SHA-256 `1bec56ef7cfa9a76f3e0b7c0a87f220eb73f23102b9c0b4c7529a3f7c3ce7c31`; Node 22.22.0 / V8 12.4.254.21-node.33 / libuv 1.51.0, Linux x64 |

All 34 application/package/deployment navigation files from round nine still
match their pinned `0e9a07604b5e29f0f686db3e567333c7775934df` source bytes.
New runtime-provenance observations are copied and hashed separately in
`I/source/`; they are not silently assigned that older source approval.
The exact subject, full new section, predecessor preservation, prerequisite
report, layout evidence and relevant real owner/native paths were examined.

The native diagnostic uses the executable copied from the immutable v0.2.5
image. It is a measurement subject, **not the future rs-raft candidate** and
not complete executable-to-upstream-source attestation.

| Key | Concrete path |
| --- | --- |
| RO / CT / RC | `C/src/cdc/cdc-coverage-reconcile-owner.js`; `cdc-integration-service-authoritative-catchup.js`; `cdc-complete-coverage-reconcile.js` |
| PO / FC | `C/src/cdc/cdc-coverage-transfer-owner.js`; `cdc-coverage-fragment-consumer.js` |
| SC / ST / PE | `C/src/partition/partition-cdc-source-coverage.js`; `partition-cdc-coverage-transfer.js`; `partition-service-entry-apply-base.js` |
| CO / CN | `C/src/cache/system-table-cache-cdc-source-order.js`; `system-table-cache-observation-methods.js` |
| Domain / JSON | `C/src/cdc/cdc-coverage-domain.js`; `C/src/utils/canonical-json-data.js` |
| RI / RD / PL | `C/src/transport/message-router-inbound-dispatch.js`; `message-router-delivery-behaviors.js`; `message-router-pending-response-ledger.js` |
| Server / Shutdown / Bulk | `C/src/transport/message-router-server-lifecycle.js`; `message-router-stats-shutdown.js`; `bulk-transfer-channel.js` |
| Ports / Config / Helm / Headless | `C/src/config/listener-port-model.js`; `configuration-manager.js`; `C/charts/lagrange-node/templates/_helpers.tpl`; `service-headless.yaml` |
| AR / Registry | `C/src/cdc/cdc-integration-service-authoritative-read-flow.js`; `C/test/shards/impact-contracts.json` |
| Provenance / Content | `I/source/src/diagnostics/runtime-build-provenance.js`; `runtime-content-fingerprint.js` |
| Release / Package | `C/.github/workflows/release.yml`; `C/package.json` |
| NodeNet / Handle / Connection | `N/node-lib-net.js.txt`; `node-src-handle-wrap.cc.txt`; `node-src-connection-wrap.cc.txt` |
| UVCore / UVLinux / UVStream | `N/libuv-unix-core.c.txt`; `libuv-unix-linux.c.txt`; `libuv-unix-stream.c.txt` |
| Async / Base / BaseInline / Env | `I/native/async_wrap.cc`; `base_object.cc`; `base_object-inl.h`; `env.cc` |
| WS | retained ws 8.21.0 under `E/cdc-c17-round6-review/installed-ws-8.21.0/` |

The four newly consulted native files were downloaded from the official
Node v22.22.0 tag; exact URLs and SHA-256 values are in
`I/native/manifest.json`. Repository rules/router and the same ten verification
templates govern the 63-item union. The existing strict-data and trusted
private-network boundary is unchanged. No arbitrary hostile-host or universal
platform certification requirement was added.

## Complete grouped findings

### D22 — public server close plus one immediate precedes native reclamation

Categories: admission/release, timer/lifecycle, concurrency, native transport,
owner interaction. Design location: **D:2285–2296**, repeated at **2538/2544**.

The clause states that one immediate after the server close terminal is in a
later loop turn with the preceding close phase completed. That premise is false
for the actual public server event:

1. NodeNet:2354–2388 closes the listening handle and clears its JavaScript
   field, then calls `_emitCloseIfDrained` without awaiting the native listener
   callback.
2. NodeNet:2401–2419 schedules the server `close` event with `process.nextTick`
   when the JavaScript handle/count projection is empty. Dropped accepted
   handles never entered `_connections` and are not awaited by that condition.
3. If shutdown runs from a poll callback or its microtask and A/I are already
   drained, that event and the continuation registering `setImmediate` can run
   before the current poll phase finishes.
4. UVCore:474–475 runs the check phase **before** native closing handles.
   Consequently the newly registered immediate may execute in that same
   iteration, while the dropped `TCPWrap` is still native-owned. The standing
   Adrop/Wbase reservation would be returned before its last native consumer.

This is independently reproduced by `I/close-barrier-probe.cjs` on executable
SHA `1bec56ef…`, using a separate client process. The test injects a shutdown
microtask after the native accept/drop callback; it is a phase-order latch,
**not** a proposed production drop observer. The proposed observer's no-enqueue
rule remains valid. Normal shutdown can also be initiated by another callback
in the same poll phase, so that rule does not establish the claimed barrier.
No private Socket property, native close mutation or fake close event is used.

`I/events.json` records:

    drop -> shutdown-request -> server-close -> first-immediate -> second-immediate

`I/close-barrier-result.json`, extracted from the actual V8 heap snapshots:

| Observation | Native dropped Socket wrapper | Native server wrapper |
| --- | ---: | ---: |
| Proposed first-immediate release point | 1 × 432 bytes | 1 × 432 bytes |
| Nested second immediate control | 0 | 0 |

These are native `Node / TCPSocketWrap` / `Node / TCPServerWrap` snapshot nodes,
not merely delayed async-hooks destroy notifications or JavaScript Socket
counts. The diagnostic establishes an early release transition; it does not
claim an observed 512 KiB overflow, a current product resource regression, or
execution of the unimplemented coverage adapter.

**Required correction:** make the existing shutdown owner retain Adrop/Wbase
through a phase boundary that is actually later than the final closing-handle
phase for every supported shutdown entry point. For the examined runtime,
nested public immediates are a viable candidate: an immediate scheduled from
an immediate cannot execute until the next check phase. The first barrier alone
is insufficient. Include pending native destroy bookkeeping and the terminal
barrier's own actual references in final-release ownership; do not equate
server `close`, `_connections == 0` or an async-hooks notification with all
physical custody ending. This is a correction to the existing terminal, not a
new timer framework or per-drop owner.

The future witness must retain the positive first/second-phase distinction,
shutdown while A/I are empty, shutdown while their callbacks drain, and exact
once release with no successor claim against old native custody. It need not
be implemented to correct this design clause.

### D23 — profile policy must not turn required recovery into an optional mode

Categories: formation/recovery, admission, cross-owner contract.
Design locations: **D:2434–2440, 2465–2481, 2485–2494, 2506–2510**.

The document correctly identifies per-distribution certification and typed
`COVERAGE_RUNTIME_UNCERTIFIED` rather than pretending the local developer Node
is the production executable. It also explicitly leaves the required/optional
choice with release/runtime owners. However, the current text permits an
uncertified profile to be labelled coverage-optional and start ordinary/
snapshot surfaces, with only currently coverage-dependent partitions held.
It does not require that optional mode to be one already permitted by the
existing product/deployment contract.

A supported recovery workflow can start without current debt and later restart
with durable CDC/cache coverage work. Reclassifying its distribution as
optional does not preserve its ability to finish that recovery. Keeping the
obligation pending is necessary correctness behavior, but cannot by itself
qualify that workflow as ready or satisfy the user's recovery acceptance.
This is a policy ambiguity, **not** an assertion that every uncertified mode is
invalid, that every future Node patch/OS is currently supported, or that an
executed startup deadlock has been observed in this docs-only round.

Concrete owners are Release:235–267/337–403 (npm, SEA and release receipts),
Package:112–116/242–243 (build/package commands and runtime floor), Ports/Config/
Helm/Headless (deployment listener ownership), Provenance:45–88 (one measured
boot content owner), and the retained recovery chain AR→SC→RO→CO. A version floor
is not a release/platform certification matrix. The existing source-tree boot
measurement currently reads the lock; the retained distroless inventory lacks
it. D:2456–2463 correctly recognizes that packaging composition requirement.

**Required correction:** expressly preserve the currently advertised delivery
forms and supported deployment/recovery workflows. A profile needed by an
existing required CDC/cache path must be certified before that workflow's
readiness/release acceptance; runtime mismatch remains HOLD with its obligation
retained. Ordinary startup without coverage is allowed only where the existing
owner already permits that mode, never as a new default or degradation used to
pass this candidate. The release/platform owner may select and pin concrete
artifact profiles; no claim that `engines >=22.12` certifies arbitrary future
runtimes is required. v0.2.5 remains measurement evidence only. No new global
readiness barrier or MessageRouter policy inference is needed.

Root's explicit support ruling during this review establishes this restriction.
The frozen document should encode it so later source does not have to choose
between preserving recovery promises and the broad optional-profile sentence.

## Supported corrections and whole-interaction trace

### Standing batch and native lifetime, apart from D22

D:2216–2283 preowns a continuous aggregate 512 KiB before listen. It is never
loaned to A/I/E, ordinary traffic or snapshots. This directly fixes the false
one-native-handle premise rather than hiding extra accepts in an uncharged
post-parse rejection path.

UVStream:508–532 accepts at most one descriptor per server callback;
Connection:33–74 constructs the native wrapper before NodeNet:2247–2269 rejects
without a JavaScript Socket. UVLinux:1390/1498–1598 has at most 48 full epoll
batches before returning. UVCore:474–475/368–379 reaches native close processing
before the following poll. For this pinned single-listener Linux trace, the
48 concurrently native-owned accepted wrappers are a sound replacement count.
This is a source reasoning bound; the diagnostic did not construct a 1024-event
batch or measure a 48-root maximum.

Handle:134–158 holds a `BaseObjectPtr`, detaches, completes native close and
removes the wrapper from the environment list. BaseInline:177–186 plus
Base:128–139 delete a detached object when its last strong pointer leaves;
BaseInline:109–111 performs the deletion. Native wrapper lifetime therefore does
not wait for a later V8 collection in this unretained pre-Socket case.
Async:544–587 can defer destroy IDs into a native immediate; Env:1571–1588 runs
native immediates before JavaScript immediate callbacks. Those entries must be
included in the promised per-root/shared bookkeeping cap even after the native
wrapper is deleted. A destroy-hook sample is neither the native population
proof nor an excuse to free references still retained by their owner.

The independent arithmetic is 48×8 +16+64+16 = **480 KiB**, below 512 by 32 KiB.
432-byte native self size already includes the 248-byte uv handle; the 56-byte
V8 object is additional. This is not a proof of the wider 8/16/64/16 KiB caps.
The selected artifact's allocator, graph and bookkeeping attestation remains a
prerequisite as D:2278–2283 explicitly says. No new count finding is established;
D22 concerns final reservation release, not replacing 48 with a sampled number.

### Fixed banks, ACK/result ownership and legitimate continuation

D:2304–2403 now supplies physical populations independent of deadline/cadence:
four source sends, four recipient sends, two receives for each role, one Pr,
and bounded Fmeta. Ps/Wo/Wr retain their semantic custody while using a shared
physical send-credit bank. Real copies are disjoint; aliases share one backing
and wait for all consumers. Binary data sends remain H, copied rows remain C.

RI:435–494 emits ACK before handler result. RD:347/471–503 waits for ACK and then
canonical result; PL:419–435 and530–559 settle the two distinct ledgers.
D:2337–2344 reserves the responder's ACK/result pair (or ACK plus preowned H)
**before** ACK, preserving ability to complete the promised result. A valid
N+1 may arrive while the previous result's send callback still owns its slot.
Its semantic permission is already installed; it waits for physical capacity
rather than becoming a false refusal. Requester raw ACK/result slots unwind
before its next send, and the source's second receive slot covers the scheduled
successor. Unexpected additional assembled input follows the preowned I close
phase rather than gaining a fresh uncharged Frecv slot.

Successful PL settlement removes its waiter rather than accumulating retired
history; uncertain timeout/cancel paths retain a bounded late context. D:2366–
2379 binds release to actual callback, response/close or emitter/consumer
terminal, and old-lane drain precedes replacement. Thus cadence cannot create
300 resident send copies. Held callbacks cause bounded pressure and eventual
lane retirement under the original generation deadline, not SQL reexecution,
event recreation or a new retry owner. Future source must attach these count
claims to the real RI/RD/PL paths; current callback-free JSON/Bulk sends are not
already that implementation.

Remote arithmetic: 1400 +4×320+2×704+192+512 = **4792 KiB**.
Colocated union: 8×320+4×704+192+512 = **6080 KiB**.
Both fit the unchanged 8192 KiB term. Source-role Pr is zero; charging Pr in the
remote maximum is conservative. The colocated union charges no physical
bootstrap and does not invent network allocations to make its balance work;
the deduplicated Fmeta must cover both role records and all actual local
handoff consumers. Local synchronous completion can release a nonexistent
network copy only when it was never allocated; it cannot free real shared row
or cache references.

### Complete units, native receive phases and resource progress

The retained D:1662–1700 lower-then-upper complete-unit order handles either
node order and reserves inbound separately from outbound. Colocation acquires
one atomic union. D:1569–1588/1875–1899 moves surviving bootstrap references
into the E earmark before the single exact probe. D21 does not reintroduce an
unowned credit needed only after source materialization. The complete-pair
allocation and K revalidation obligations stay intact.

D19's old downstream WiPending, next fragments/concat, deferred-emitter and
close-feed phases remain operative (D:1904–1984). The prior exact production
V8/ws old-fragment witness is corroborating evidence for that measured pair,
not certification of the future image. Native receive coefficients and
Ibootstrap/nonbootstrap phase transitions remain source gates. Opposing four
outgoing/four incoming lanes do not consume the same direction credits; lower/
upper refusal drains the claimed unit before existing-owner retry. There is no
new global admission/census dependency or turn/callback oracle in D21.

Including the complete standing 16 MiB and the whole fixed 8 MiB, the 8 MiB row
case remains **85 MiB**; one 16 MiB+1-byte supported row remains **125 MiB+5 bytes**,
with **3145723 bytes** left below 128 MiB. A backlog over16 MiB is still paged,
not one oversized hydrated object. This is feasible admission arithmetic, not
implemented bounded-process or full-cache startup proof. The exact/below-capacity
and interrupted/replay/newer-suffix witnesses remain required together.

### Runtime profile interaction, apart from D23

D:2420–2465 names the existing release receipt and boot-provenance owners.
An in-artifact manifest binds local executable/dependency/profile facts; the
post-build receipt binds final OCI digest to that manifest. It does not try to
embed an image's own final hash inside itself. SEA and source/npm/lab receive
appropriate artifact/executable bindings. MessageRouter consumes one typed
certification result before Wbase/listen rather than measuring a second truth.
The future candidate supplies its own receipt; v0.2.5 is not promoted implicitly.

The provenance owner reads local executable/source/dependency and native-addon
facts (Provenance:26–78; Content:67–86), not the CDC cache or a replica census.
No new startup dependency cycle is established by this proposed profile check.
Its unavailable/mismatched state must remain explicit. D23 limits the policy
choice; it does not reject artifact pinning or require universal platform
coverage. Existing boot-measurement cost is not certified as part of this
transfer-pool review or silently counted as zero in a whole-process claim.

## Cumulative scope dispositions

| Prior scope | Round-ten disposition |
| --- | --- |
| N1/N2 caller 2de | Approved source remains closed; same fixed shared generation and per-caller settlement. |
| D1–D10 | Captured envelope, disjoint Ps/Pr/H/C/K, adoption, nonallocating comparator/canonical digest, lower/upper complete pair and atomic colocation preserved. |
| D11–D13 | WiPending, Wr/Wo overlap and canonical retry retained; D21 replaces cadence-derived population with explicit physical banks. Supported design correction. |
| D14–D17 | Dedicated purpose, receiver admission, native receive phases and existing port/config/Helm ownership retained. Profile policy now has bounded D23 wording correction. |
| D18 | Real ACK/result ledgers, semantic N+1 before old callback and same-identity retire/drain/redrive remain supported at design scope. |
| D19 | Full native assembly/downstream/close phase custody retained; actual implementation coefficients remain HOLD. |
| D20 | A-owned live+retired 8/0 gate remains supported. One-native-Adrop premise is explicitly withdrawn by D21, not grandfathered by round-nine approval. |
| D21 batch/count banks | Standing48-root strategy and fixed 4792/6080 KiB banks supported subject to actual native/coefficient certification; D22 corrects final batch release. |
| D21 profile composition | Existing-owner, noncircular composition supported; D23 must constrain optional policy to existing promises. |
| R3-4/5/6/7 | Prior bounded publication fence, recovery routing, census and strict index approvals retained. |
| R3-1/R3-2 resource source | HOLD; no resource adapter or production progress acceptance inferred. |

## Category-complete 63-item review

All 63 requested obligations apply to this owner interaction. Every item has a
concrete evidence path and disposition. “Supported” denotes design consistency,
not an executed source approval. Findings are listed once above; references
below identify their affected checklist items without inventing new findings.

### A — admission and current authority

| ID | Evidence and disposition |
| --- | --- |
| A1 | PO:32–49/117–146; D:2216–2233/2327–2344 use the same pool before native/listener and send allocation. Supported admission. Final returned capacity is blocked by D22 at D:2290–2295. |
| A2 | D:1756–1788/1814–1834/2465–2481 retains held/refused/unknown/installed distinctions and adds typed uncertified. Supported classifications; optional policy must satisfy D23, never empty completion. |
| A3 | D:89–153/2200–2201/2351–2352 and RO:258–277/354–421 keep caller and original generation deadlines across physical-credit waits, retries and decode. Closed caller approval retained. |
| A4 | RI:435–494, RD:347/471–503, PL:419–435/530–559 and D:1743–1788/2337–2344 preserve ACK/result and typed profile consumption. No alternate settlement shape. Supported. |
| A5 | PO:62–81; D:2366–2374 names real send/receive/late terminals. These remain supported. D:2291's server-close/immediate event does not prove Adrop release: D22. |
| A6 | D:1676–1700/1761–1788/439–445 and CO:535–545 retain request/source/generation and publication fences after awaits. Profile and capacity cannot authorize stale rows. Supported. |
| A7 | PO:228–245; D:2271–2276/2357–2364 uses fixed scalar diagnostics, exact held banks and no per-drop retained address history. D22 requires actual native terminal, not a misleading closed projection. |

### Y — retry and progress

| ID | Evidence and disposition |
| --- | --- |
| Y1 | RO:354–421/522–544; D:1814–1834/2351–2355/2376–2379 connect physical-credit release and old-lane drain to existing redrive. Supported, no second retry owner. |
| Y2 | D:1692–1697/1816–1831/2372–2379 retains unknown grant and unreadable/unanswered debt within fixed semantic waiting. Expiry does not reclaim external copies. Supported. |
| Y3 | D:1861–1864/2366–2379/2465–2471 gives explicit retire, close, uncertainty and uncertified outcomes. Shutdown's final physical stop is incomplete only at D22. |
| Y4 | D:1662–1700/2398–2403 preserves complete lower/upper units, independent inbound credits, atomic colocation and preowned response capacity. No new bank/callback cycle found; startup policy remains D23. |
| Y5 | D:2257–2283/2331–2364 bounds roots, bytes, banks, late contexts and scalar diagnostics.480/4792/6080 KiB arithmetic verified. Actual coefficients and native-bookkeeping caps remain explicit certification gates. |
| Y6 | D:1698–1700/1814–1831/2366–2379 preserves same event/page/request identity and exact release. PL:419–435 successful settlement removes the waiter. No cumulative success-history bank growth required. |
| Y7 | D:2200–2201/2351–2352/2376–2380 separates retry cadence from physical population and leaves fixed generation expiry unchanged. Neither ACK nor freed credit renews it. Supported. |

### T — transport and delivery

| ID | Evidence and disposition |
| --- | --- |
| T1 | RI:435–494; D:1771–1784/2337–2344 reserve completion before ACK; ACK settles delivery only, result settles canonical response. Neither is a send-callback release. Supported. |
| T2 | D:1785–1812/2346–2355/2366–2374 retains exact old-lane response context and valid N+1 before old send callback. Stale result cannot release successor credit. Supported. |
| T3 | D:1756–1788/1819–1826 and PL:184–224 keep noHandler/error/late/orphan outcomes canonical. Fixed banks do not invent fallback success. Supported. |
| T4 | D:1814–1834/2376–2379 uses bounded same-deadline wait and close/drain for missing delivery or credits. Native final listener drain remains D22; no arbitrary queue is approved. |
| T5 | D:2131–2151/2512–2519 retains real WS, accepted/dialed, both-order/colo and callback witnesses. I/close-barrier-probe.cjs uses actual Node/native wrappers with a stated phase latch, not coverage/source acceptance. |

### S — time and lifecycle

| ID | Evidence and disposition |
| --- | --- |
| S1 | RO:60–75/258–277 keeps injected time/unref retry timers. D:2291's refed shutdown immediate is a finite terminal mechanism, but its claimed later phase fails in I/close-barrier-result.json: D22. |
| S2 | SC:263–271/371–422; D:1676–1679/2206–2212 retain leader, scope and payload priority. Runtime certification is not data/leadership authority. Supported. |
| S3 | D:1644–1660/2064–2073/2366–2379 keeps retired generation custody separate from restart. Exact Adrop release before restart is blocked by D22; durable debt otherwise retained. |
| S4 | D:2366–2379 expressly forbids TTL-only release of callback/consumer/late values. Accepted long transfer waits for actual terminals, while original deadline bounds semantic work. Supported. |
| S5 | AR:511–516/SC:263–271; D:2027–2029/2465–2481 permits recovery while ordinary mutation admission remains fenced. Profile reads local facts, not cache. Existing required recovery cannot become optional: D23. |

### R — recovery and publication

| ID | Evidence and disposition |
| --- | --- |
| R1 | CO:395–445/494–545 and D:618–708/2089 retain rows, suffix, tombstones, revisions and publication fences against newer commit/ACK data. D21 changes no publication authority. Supported. |
| R2 | D:1644–1660/1785–1788/2357–2374 binds boot, admission, connection-generation and ordinal through retirement. D22 is the final native-custody release defect, not permission to remint. |
| R3 | D:216–225/774–795/1698–1700 preserves complete coverage and exact final/next bounds. Reserved bank/capability cannot convert partial or malformed input into empty success. Supported. |
| R4 | D:553–614/677–708/1814–1831 retains same-N replay/conflict and same-event recovery without SQL rerun. Bank backpressure does not change identities or durable obligations. Supported. |
| R5 | D:1816–1831/2465–2481 retains absence/unavailable/uncertified as unresolved state. Keeping debt is correct but cannot certify a supported required recovery path as optional: D23. |

### C — concurrency and custody

| ID | Evidence and disposition |
| --- | --- |
| C1 | D:2227–2233/2337–2344/2346–2355 claims before allocation, ACK or observer continuation. NodeNet:2247–2269 retains native pre-Socket rejection. Supported; D22 prevents early claim reuse at shutdown. |
| C2 | D:935–938/1428–1436/1761–1788/2366–2374 requires current identity at handoff/await/result/publication. Native terminal cannot be inferred from a prior close projection: D22. |
| C3 | D:1594–1618/1698–1700/2337–2355 gives one claim and response-pair winner; semantically valid continuation waits for physical credit. No duplicate buffer or credit reuse is allowed. Supported. |
| C4 | D:490–503/2366–2379 handles synchronous release wake and callback/timeout/close ordering. Native check-before-close counterexample is retained in I/events.json: D22. No post-swap rollback added. |
| C5 | D:2216–2233/2327–2335/2398–2403 scopes Wbase to listener/node, I to direction/generation, E to root and colo to one union. Opposite-node claims cannot supply local receive capacity. Supported. |

### F — production flow and compatibility

| ID | Evidence and disposition |
| --- | --- |
| F1 | CT→RO/RC→AR→SC/ST→RI/RD/PL→FC→CO retained. D:2420–2465 adds existing Provenance/Release consumers before Server/Ports bind. Actual source inventory is in I/navigation.json; no raw/local bypass. |
| F2 | RO:354–421/522–544 and D:1814–1834/2376–2379 retain recovery independent of new user writes/cache readiness. Provenance:45–78 reads local bytes. No new wake owner or evidence of profile/cache cycle found. |
| F3 | D:89–153/2211–2212 leaves caller 2de short/long wait semantics and fixed generation closed. Native/profile changes confer no caller-source re-review or broader approval. |
| F4 | D:2384–2416 and I/navigation.json give full bootstrap/fixed/S/H/C/K peaks 85 MiB and 125 MiB+5 B. D19 native phase terms remain; exact/below capacity and real backlog/large event completion source gates retained. |
| F5 | D:2206–2212/2401–2416/2521–2525 preserves no force-open, raw parser, SQL rerun, borrowed ordinary/snapshot budget or pool increase. D23 bars optional policy as a recovery-acceptance shortcut. |

### H — evidence and harness fidelity

| ID | Evidence and disposition |
| --- | --- |
| H1 | P/certification-report.md retains the48-repoll counterexample to the old one-root premise. I/close-barrier-result.json independently demonstrates new D22's actual early-release mechanism, not an import/setup failure. |
| H2 | Exact production executable hash, real native heap nodes and separate client are recorded in I/events.json/navigation.json. The injected shutdown timing is explicit; no claim that the absent coverage adapter passed. |
| H3 | I/close-barrier-probe.cjs independently orders drop, microtask shutdown, server event, first and second check phases. D:2346–2379 independently orders semantic N+1 and physical send/receive custody. No compressed deadline. |
| H4 | D:1761–1788/2357–2364/2444–2463 retains complete endpoint/boot/generation/ordinal/length identity and artifact/profile facts. Scalar projections cannot replace those identities. Supported. |
| H5 | D:2133–2151/2408–2416/2512–2519 keeps nonempty supported 8 MiB/16 MiB+1 and oversized/refusal/replay controls; I native diagnostic has one real dropped root and a zero-root later-phase control. |
| H6 | Exact subject/prefix/prerequisite/navigation hashes recorded;46/46 packet and34/34 source checks pass. Docs-only review, selected-runtime prerequisites and absent source/startup/CDC delivery acceptance are explicitly separate. |

### O — owner interactions

| ID | Evidence and disposition |
| --- | --- |
| O1 | D:2227–2233/2323–2325/2420–2425 keeps PO budget, MessageRouter transport, RO retry, Release profile and Provenance boot measurement as sole owners. No second coordinator proposed. Supported architecture. |
| O2 | D:1743–1788/2337–2374/2465–2471 describes real ACK/result and typed profile consumers. Fixed banks preserve semantic custody. D22 repairs only the final native release interaction. |
| O3 | D:2131–2151/2512–2519 retains same-candidate refusal plus supported recovery and all earlier counterexamples. This design review does not substitute missing future tests for a finding. D22 has an executed mechanism control. |
| O4 | D:1814–1831/2376–2379 allows stale→fresh same-identity reentry after exact old drain. Uncertified→certified profile cannot retroactively free old custody or remove recovery debt. D23 constrains supported readiness. |
| O5 | D:2331–2364/2376–2403 bounds sends/receives/contexts before expansion, preserving backpressure. Physical callback lag cannot multiply cadence into resident copies. Supported; all coefficients remain source gates. |
| O6 | PO:62–81; RO:522–544; D:2351–2352/2366–2379 retains local release wake and existing cadence. D22's early Adrop release must not emit a truthful-looking capacity wake before native custody ends. |
| O7 | NodeNet:2401–2419, D:2291–2296 and I snapshot evidence show server close is insufficient authority for release: D22. D:1771–1784/2465–2471 otherwise keeps ACK/capability/counters separate from processing/coverage authority. |
| O8 | I/navigation.json binds exact 0d725/0c44/aa0e/P/layout/executable artifacts. Native manifest binds fresh official sources; source phases and diagnostic observations are not confused with full memory or future release certification. |
| O9 | RI/RD/PL successful/retired paths, Server/Shutdown, NodeNet/Handle/UV close order, Provenance/Content and Release were examined. All newly established issues are D22/D23; no parallel fallback or alternate ledger was discovered. |
| O10 | Registry:894–942/1797–1860 and D:2131–2151/2512–2519 keep the interaction witnesses and runtime/listener endpoints required with future source metadata. No source/metadata acceptance follows from this docs-only correction. |

### J — JavaScript and byte domains

| ID | Evidence and disposition |
| --- | --- |
| J1 | D:2257–2265/2308–2335/2384–2411 and I/navigation.json recompute safe bounded count/byte sums. Existing canonical length/count/port domains D:228–275 retained. No overflow/nonfinite/-0 shortcut introduced. |
| J2 | JSON:109–174 and D:228–250/1761–1788 retain strict own wire fields and bound result identity before consumption. Profile result comes from its owner, not inherited request/environment authority. Supported. |
| J3 | D:228–250/2318–2325 and D19:1844–1854/1922–1937 retain capture-once measurement and actual backing/alias custody. D22 exposes premature final custody release, not a new getter/canonicalization defect. |
| J4 | Domain/JSON prototype defenses and D:1866–1873 trusted producer boundary unchanged. Native diagnostic uses unmodified public Node APIs. No arbitrary-host mutation or malicious async-hook retention requirement added. |
| J5 | D:2270–2276/2357–2364 bounds drop-data fields, errors, identity and metadata populations. No payload/history in Fmeta and no truthy ACK-to-processing shortcut. Supported coefficient contract; graph sizes remain measured gates. |
| J6 | Existing intrinsic model preserved. D:2425–2440 proposes concrete per-distribution profiles; D23 requires owner-preserved recovery promises without claiming arbitrary future Node/OS support. Runtime mismatch remains explicit HOLD. |
| J7 | D:618–633/677–708 preserves exact canonical digest and nonallocating existing-cache comparison; D:2318–2325 separately charges serialization/concat/copies and aliases. Native source/manifest hashes do not authorize data publication. |
| J8 | D:2216–2283/2331–2364/2408–2416 bounds individual, aggregate, root, callback and native populations. Page limits do not mask all-data materialization. Future adapter and profile coefficient proofs remain HOLD; D22 final release must be repaired. |

## Reproduction and completion

`I/commands-and-results.md` records the native diagnostic command, source URLs,
manifest checks and their scope. `I/diagnostic-sha256.txt` binds the exact script,
result, heap snapshots, navigation and native sources. The retained snapshots
are review diagnostics, not a production allocation benchmark or test-metadata
substitute.

All 63 obligations have evidence-backed dispositions. **D22 and D23 are the
complete findings batch for this exact design subject.** Preserve the accepted
caller and nontransport components and the supported D21 count-bank/profile
structure. Correct the terminal boundary and supported-mode wording before
accepting this supersession. Native artifact/layout certification and later
actual adapter/callback/aggregate/resource/progress witnesses remain separate
source gates; normal startup, durable-event recovery and merge acceptance are
still open.
