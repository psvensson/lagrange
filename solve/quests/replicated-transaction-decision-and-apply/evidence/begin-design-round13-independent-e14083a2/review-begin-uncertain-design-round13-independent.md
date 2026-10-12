# BEGIN round13 — independent bounded design review

## Verdict

**REVISE the complete router/native resource supplement; production source remains HOLD.** Two grouped findings remain:

1. **D13-1 — HIGH: the complete physical-custody handoff is not yet an executable supported-memory contract.** The mandatory startup envelope is incompatible with the shipped resource profile; pre-accept/rejected/control roots lack the named admission coverage; stringify can exceed its credit before refusal; and the new owed-expiry rule releases physical credits before their physical terminal.
2. **D13-2 — HIGH: the proposed receive-token and owed-lane progression can still prevent supported work from completing.** An ordinary handler can hold the only receive token while awaiting a response on that connection. At the native lane, clearing all priority when a bounded recovery turn expires permits the same admitted recovery debt to lose every later turn to foreground work.

This is one category-complete design verdict, not a rolling source review. All63 dispositions appear below. Neither finding is based merely on an unimplemented future method or unmeasured coefficient. The concrete contract contradictions and admissible schedules are distinguished from future measurement/source gates.

**Preserved scoped positives:** D11-2 originated-V2 upgrade/empty-legacy schema design remains APPROVED; fixed private endpoint slots remain accepted at their own scope; live owed-token direct handoff closes the specific round12 nonexpired collision schedule; immutable-six/complete classification, original-versus-server-turn deadlines, client entitlement, advanced COMMIT/missing-progress obligations, prior four-frame identity/lifetime protections and caller ownership remain unchanged. No BEGIN B5 source, MessageRouter resource implementation, activation/C3/C17, startup, main, merge or corpus approval follows.

## Exact subjects and read-only evidence

B = `/mnt/data/peter/projects/.worktrees/rs-raft-startup-integration-20261011`.
Q = B/`solve/quests/replicated-transaction-decision-and-apply`.
E = `/mnt/data/peter/projects/.worktrees/rs-raft-candidate-20261011/test-output/continuation-20261011`.
D = E/`begin-design-round13-independent`; N = D/`navigation`.

| Alias / exact artifact | SHA-256 |
| --- | --- |
| **DS** Q/`design-query-begin-uncertain-insert-resolution-2026-10-11.md` | `0e0102dcc105c1cdef66b9a5537cdef2c78b10d04fdec0021736d91422f04265` |
| **P12** Q/`evidence/design-query-begin-uncertain-insert-resolution-round12-e7a1a4cf.md` | `e7a1a4cf6618f316bdc19337ae8f3d9e88c0f305767cffff25db21c79286af98` |
| **PR12** E/`review-begin-uncertain-design-round12-independent.md` | `0a0bfe8195cc47d931f25aa0c94fca74dfce1c2ba3716ce8a3b0577828833c7d` |
| **AUTHOR** Q/`evidence/begin-round13-router-native-feasibility.mjs` | `0845e0d57b2b7de9513eb3a276dff7a6f209ff9c39d20ad89da985c95af4ae86` |
| **AF** Q/`evidence/begin-round13-router-native-feasibility.json` | `e02f13b2369882a46b9122f05975eb41e19bb88f45c6be1b8bb9dee0e6aaaf77` |
| Preserved round12 schema/slot feasibility JSON | `e0ec8a2c8d9b7593d440c9f0066e964b7605ba13a256f6fb207eaa284d4dbb88` |

The DS Git object in preservation snapshot `3afd325191fd37bfa29c7e1e6db665e2d8aa32ff` is byte-identical; all33 tracked navigation files also match that snapshot. Preservation is not source approval.

DS is3117lines/197939bytes. The184457-byte P12 is its exact prefix; the changed supplement begins at2917. Complete PR12 was read first. Architecture authority-and-recovery, repository steering and all ten applicable verification templates govern this pass. Prior approvals retain their original ceilings; no hostile-host threat expansion is added.

D/`provenance.json` records exact subject/prefix hashes,38 copied source/dependency/contract/template/deployment navigation files and final byte checks. These current B bytes are **unapproved navigation**, not a claim that this design is implemented. All selected B navigation files and DS remained byte-identical through final capture. The source-selected Node core net.js was also retained from the diagnostic executable.

### Diagnostics and actual proof ceilings

The exact AUTHOR program was copied into an E-only mirrored Q layout and rerun. Its generated JSON is **byte-identical to AF**. Runtime: Node22.22.0, V8 12.4.254.21-node.33, libuv1.51.0; executable SHA256 `1bec56ef7cfa9a76f3e0b7c0a87f220eb73f23102b9c0b4c7529a3f7c3ce7c31`. This is a diagnostic identity, not every deployment's runtime receipt.

AUTHOR imports actual constants and validates source text, then **reads the prior** raw256/queue0 diagnostic. It does not newly run those raw deliveries. The physical-bank transitions and native progress are its explicit model; its booleans do not certify native allocations. The schema JSON is pinned without rerunning or changing its approved interpretation.

D/`independent-adverse-schedules.mjs`, JSON and text provide:

- **Actual owner/provider seam plus modeled new admission gate:** real `handleServiceMessage`, `sendRaw`, `InProcWebSocket` and pending-response ledger execute a bidirectional nested service call. Without the proposed gate, root and inner response complete. With the new receive-token-through-handler rule, the inner ACK54bytes and SERVICE_RESPONSE119bytes are blocked while A's inner and B's root waiters remain live. Lifting only the diagnostic gate permits those same actual handlers/ledger to complete. This is a contradiction in the proposed gate, not a claim that unchanged production currently contains that gate.
- **Resource arithmetic:** AF's exact equation versus the shipped2GiB Helm profile, plus a one-copy lower bound independent of its unsealed3/4-copy coefficients.
- **Native admission design schedules:** live owed handoff12/12; author-scale repeated expiry0/12; equal full30-second foreground/recovery budgets captured at their lawful pre-FIFO points, with delayed recovery arrival and repeated expiry0/12. A100ms quiet classification fits within the remaining1second in every equal-budget control.
- **Lifetime/serialization design controls:** the literal new owed-expiry action frees credit while a submitted frame is retained; preserving charge until callback prevents reuse. A scaled4096-byte reservation precedes ordinary `JSON.stringify`, which materializes4125bytes before the stated over-size check. No hostile getters or intrinsic replacements are used.

The gate wrapper and native/lifetime schedules are labeled models. No live native heap census, actual new endpoint, production SQLite decision/fanout or cluster was executed. Modeled COMMIT/identity are retained constants, not fresh durable production evidence. D/`commands.md` gives exact commands, import layout, transformations, scope and reproduction constraints. D/`manifest.sha256` binds every retained diagnostic; report hash is supplied separately.

## D13-1 — HIGH: complete physical custody still has gaps before allocation and at release

### 1. Mandatory full-population prepayment is not a supported-memory admission rule

DS:2929–2954 reserves the connection bank at construction/accept; :3005–3028 calls the full sum the conservative startup equation, checked before allocating the listener. The chosen inputs produce:

| Term | Exact result |
| --- | ---: |
| P from committed-membership validator |1024|
| C=3P+P+1 |4097connections|
| queued send slots=3P×(32+64) |294912|
| direct send slots=2C+K, K=4 |8198|
| total send positions |303110|
|100MiB receive roots ×4copies |1718406348800bytes|
|100MiB send roots ×3copies |95350161408000bytes|
| fixed connection roots |16781312bytes|
| **Total** |**97068584538112bytes =88.283TiB**|

N/`charts/lagrange-node/values.yaml`:31–35,50–55 ships V8old-space1536MiB and pod request/limit2GiB; README:52–56 documents that profile. The proposed total is about45201times that pod limit. Even **one100MiB copy per counted receive/send position**, ignoring all fixed roots and real duplicates, requires32212988723200bytes, about29.30TiB. Measuring smaller real object coefficients cannot bridge that gap.

The imported P is also explicitly described by its owner as a **membership-answer validation bound, “not an allocation surface”**, far above supported replica factors (N/`src/raft/raft-committed-membership-constants.js`:115–119); its stamp consumers bound one configuration array/map (stamp:157,193). It does not establish a supported node's simultaneously funded physical peer/queue population.

If these are actual prepaid bytes, the unchanged shipped profile cannot lawfully open the listener or reconstruct this bank at boot, including recovery boot. If they are only virtual counters, granting the modeled full population does not establish that all acknowledged physical liabilities fit available memory. A finite safe integer proves representability, not capacity. The text has no smaller node-memory-backed active subset, exact protected recovery headroom and refusal rule replacing this mandatory all-positions startup equation. DS:3000's per-enqueue pressure is useful only once that actual smaller shared capacity/selection rule is specified.

An operator lowering the100MiB limit is an optional explicit support change, not closure for the existing supported default. This finding uses an existing shipped deployment constraint, not a newly invented performance threshold. Required closure is a realistic existing-owner active admission/custody equation under the supported budget, with backpressure and protected completing recovery; it need not simultaneously materialize every theoretical semantic queue maximum, and must not cap logical IDs or silently narrow supported traffic.

### 2. Application admission is after some named physical roots already exist

DS:2948–2951 reserves before attaching message callbacks and rejects excess/duplicate sockets before the first application frame. That is not by itself pre-allocation custody for every native/HTTP/provider root the equation claims to cover.

Actual pinned order:

- selected Node core `net.onconnection` receives an already-created `clientHandle` at N/`node-core-net.js`:2235; even its maxConnections rejection closes that existing handle at2246–2268; admitted JS Socket allocation occurs2279 before the public connection event2302;
- ws server creates the underlying HTTP listener at WS-server:102–116; `completeUpgrade` allocates WebSocket at398, writes handshake headers428 and constructs receiver/sender via `setSocket`431 before notifying the router at449;
- router admission hook currently starts at SL:176, after those roots, and attaches message callbacks192; outgoing CL:314 likewise constructs WebSocket before later identification;
- self-loopback CL:481–493/SL:219–227 owns client and server endpoints in one process. A one-self term must explicitly pay both endpoint/provider roots if expressed as one logical connection; one-direction coefficients cannot silently certify it.

A bank fully occupied by current/retiring/successor/U tokens still needs an explicit before-accept bound and last-consumer rule for excess accepted native handles/HTTP state being refused or closed. Identified-generation labels do not cover those roots before identification. Exact coefficients can be a future source gate **after** the contract names their admission point and bounded population; attaching a later callback cannot retroactively reserve them.

The same inventory includes provider-generated control traffic: WS-server:71 enables autoPong, websocket:1248–1252 emits `pong` before the application ping event. This bypasses JSON/sendRaw admission; handshake and close frames also do not pass through JSON.stringify. DS:2985–2997 names MessageRouter raw ACK/noHandler/response/pressure but no actual pre-provider rule for these control roots. A complete fixed connection term must say which bounded slots own them and their overlap/close/rejection lifetimes. This is a missing part of the same physical handoff, not a request for a new transport owner or arbitrary hostile-traffic framework.

### 3. Post-stringify rejection cannot bound the allocation it checks

DS:2985–2990 reserves one maximum allowance, calls JSON.stringify and only then refuses serialization exceeding the reservation. Ordinary source objects can serialize larger than that limit, including repeated references to the same child/string. The entire JSON string exists before the length check. The declared maximum therefore is not a pre-allocation bound for that path.

FEAS:`serializedOverflow` uses ordinary repeated primitive values, reserves4096 and materializes4125bytes before rejection; a smaller positive control fits. The diagnostic is deliberately scaled and is not reported as a production100MiB memory measurement. The same ordering holds for the fixed production maximum: reserving its value cannot truncate or bound unrestricted `JSON.stringify` allocation. The contract needs an existing-owner bounded producer/preflight/serialization mechanism and custody for its own scratch before this call, not merely a later size assertion. No mutation or arbitrary getter is needed for the counterexample.

### 4. Owed-turn expiry must not free outstanding physical frames

DS:3066–3068 says turn expiry/connection change/shutdown CAS clears `recoveryOwed` **and releases that endpoint's physical request/reply credits**; :3078 also permits expired physical subclaims to release. That is broader than the prior preserved rule DS:2535–2539/2569–2575 and the new callback lifetime :2990–2994.

A recovery credit ACK may already be in sender custody when its valid semantic turn expires. Expiry can revoke SQL/native entitlement and clear the owed waiter, but cannot return that frame's credit before its actual callback/root release. FEAS:`expiryFrame` records expiry with128bytes still externally held, credit reuse with256physical bytes under128charged, then the old callback. It is a design transition schedule, not a measured future wire bug. The positive control retains charge and refuses physical reuse until callback.

The amendment should state one unambiguous exact-token disposal rule separating unused reservation, semantic/native entitlement and actually retained request/reply roots. Generic `error`/`close` also needs the producer's actual last-reference or charged transfer condition; event observation alone is not universal proof of callback/native-root disposal. No new scheduler, ledger or repair path is necessary.

## D13-2 — HIGH: resource availability and useful progression are not composed

### 1. One receive token held through an ordinary handler can block its own answer

DS:2961–2964 forbids a second application-message parse while the connection's receive token remains held. DS:2974–2977 transfers that token to an ordinary handler and retains it through the handler promise and response envelope. The same physical connection also delivers ACK and SERVICE_RESPONSE to settle requests issued by that handler; actual MI:80–90 uses that route, MI:468–481 runs asynchronous handlers, and PL:419–436 settles the response waiter.

The independent actual-seam witness is:

1. B sends a valid nonempty root request to A.
2. A's registered handler holds the proposed receive token and makes a nested request to B on that same connection.
3. B's actual handler answers; the inner ACK54bytes and SERVICE_RESPONSE119bytes reach A.
4. The proposed receive rule blocks their parse. A waits for inner; B waits for root; release of A's sole receive token requires the blocked inner answer.

The unchanged owner/provider/ledger path completes both requests without the proposed gate. Applying only the described admission wrapper leaves `held=true`, both pending IDs present, and neither result complete after all scheduled deliveries. Allowing those already-arrived frames through in the diagnostic control completes the same path. There is no empty table, missing method, expired deadline or absent handler in this failure.

Closing instead of pausing changes the symptom to a deterministic failure of this legitimate composition; it does not supply a completion path. Repeated ordinary retry encounters the same dependency. The recovery-only subclaim at :3074–3077 also cannot bypass a single shared receive prerequisite held by ordinary work or unavailable before identification. The contract needs complete bounded parse/handler/result ownership allowing required replies and protected recovery to enter, rather than a hidden exception or raw alternate parse path.

### 2. Expiry discards the owed admission protection while the debt remains

The live-token mechanism is a real improvement: :3052–3061 refuses new foreground after a recovery collision and directly hands over at foreground release. With the author schedule, release23 precedes turn deadline29, so the independent model now completes12/12. That scoped correction is preserved.

But :3066–3070 clears the only priority entitlement when that turn expires; the following sweep competes afresh. The author's expiry control chooses a quiet next turn. The same legal expiry ordering can instead recur under continuous bounded foreground. It does not require a server budget too short for a supported classification:

| Event in one independently modeled period | Time relative to recovery pre-FIFO capture |
| --- | ---: |
| Recovery turn captured with full existing30s budget |0ms|
| A foreground origin captures its own full30s turn and obtains target lane |28500ms|
| Recovery request reaches target after ordinary origin/transport delay |29000ms|
| Recovery turn expires; owed field clears |30000ms|
| Foreground releases, still well before its own58500ms deadline |34000ms|
| Next recovery full turn captured |60000ms|

A quiet classification taking100ms completes at29100, leaving900ms margin; both roles have the same full30s budget, and no deadline is renewed. A bounded5500ms foreground grant/native occupancy is legal under its own turn. That occupancy may include waiting for classifier consumption, because accepted DS:2517–2531 reserves the lane with semantic grant creation, not only while executing SQLite. It is not a claim that SQLite requires5.5seconds.

Repeat the period: each foreground completes, the lane has idle intervals, each recovery sweep fires with the same transaction/COMMIT debt, but recovery completes0/12; the finite pattern extends under the stated rules. FEAS:`nativeLane.equalThirtySecondBudget` records every timestamp and paired quiet control. The shorter author-scale expiry model is retained separately, not substituted for this full-budget argument.

The remaining contract obligation is an admission entitlement/event that survives retirement of one foreground waiter/expired recovery turn long enough for the **same retained debt** to obtain a later useful bounded turn, or an explicit existing-owner bound/order proving that such repeated loss cannot happen. It must not authorize SQL on an expired token, extend a deadline, retain a new unbounded waiter list, or prescribe a second scheduler. Preserving only the durable record plus a free endpoint does not establish the stated nonstarvation guarantee.

## Preserved approval and implementation boundaries

- **Schema D11-2 remains approved as design:** DS:2818–2864 exact originated V2/origin/generation committed upgrade and empty recognized legacy install, with incompatible/missing/foreign/nonempty malformed refusal. Subject prefix and pinned schema JSON are exact. No install-on-read or second origin is authorized.
- **Private fixed slot design remains accepted:** DS:2733–2816 reserves fixed K/native terms independent of retained record occupancy; exact slot/resource/connection generations fence late replies. The aggregate transport bank cannot borrow or erase them. Role assignment retains one recovery-only slot, not four foreground slots.
- **Original identity/client/decision contracts preserved:** DS:2094–2134,2341–2466 and prior PR12/PR11 scopes require exact immutable-six and complete same-response evidence; preliminary key/digest/absence is never completion/collision/adoption. Advanced COMMIT and enlisted participants remain owed, including missing progress rows. Foreground expiry never reopens ACTIVE; server turns are bounded read/classification/handoff only.
- **Physical frame protections preserved:** DS:2493–2576 four distinct frame subclaims and exact generation CAS remain the accepted baseline; D13-1.4 points out contradictory new wording rather than waiving that protection.
- **Future source gates remain future:** provider coefficients, actual socket/native/drop/close measurements, canonical metadata and whole coupled tests need not exist to approve a coherent design. The present rejection instead identifies missing allocation mechanisms and counterexamples permitted by the proposed contract.

## Pinned navigation aliases

All paths below are under N and hashed in D/provenance.json.

| Alias | Path |
| --- | --- |
| MI | `src/transport/message-router-inbound-dispatch.js` |
| MD | `src/transport/message-router-delivery-behaviors.js` |
| PL | `src/transport/message-router-pending-response-ledger.js` |
| SL | `src/transport/message-router-server-lifecycle.js` |
| CL | `src/transport/message-router-connection-lifecycle-methods.js` |
| IP | `src/transport/message-router-shared-vocabulary.js` |
| WS-server / WS | `node_modules/ws/lib/websocket-server.js`, `websocket.js` and sender/receiver |
| NET | `node-core-net.js` from selected executable |
| DEPLOY | `charts/lagrange-node/values.yaml`, `README.md` |
| MEMBER | `src/raft/raft-committed-membership-constants.js`, `raft-committed-membership-stamp.js` |
| IMPACT | `test/shards/impact-contracts.json` |
| FEAS | D/`independent-adverse-schedules.json` and its executable script |

## All63 category dispositions

PASS means preserved/feasible design at stated scope. FAIL references the two grouped findings. FUTURE is a source/measurement obligation, not rejection solely because implementation is held. Every item has an evidence path or scoped nonapplicability.

### A — admission and consumption

| Item | Disposition and evidence |
| --- | --- |
| A1 | **FAIL D13-1.** DS:2948–2966 pre-callback admission is after NET:2235/2279 and WS-server:398–449 allocations. Private exact slot/native checks remain DS:2435–2466/2764–2771. |
| A2 | **PASS preserved shapes.** DS:2999–3001/3057–3058 typed pressure; :2094–2118 missing/foreign/unknown outcomes; :2852–2857 schema refusal. No pressure or missing row becomes durable terminal success. |
| A3 | **PASS deadline separation.** DS:2347–2366 fixes original and per-role pre-FIFO budgets; :3063–3069 no renewal. FEAS equal30s schedule uses full valid turns. Progress after expiry fails D13-2, not arithmetic permission. |
| A4 | **PASS design / FUTURE consumers.** DS:2375–2466 complete typed tuple family and :2850–2857 schema states preserved. MI:435–457/502–514 actual ACK/noHandler/response behavior used; future private mapping remains source gate. |
| A5 | **FAIL D13-1/D13-2.** DS:2990–2994 names physical release but :3068 frees on expiry; :2974 holds receive through a promise dependent on another receive. FEAS expiryFrame/handlerDependency. |
| A6 | **PASS identity.** DS:2435–2466 exact original/cohort/leader/current generation consumption; :3054–3067 binds owed token/scan/key/resource/connection and CAS. No transient slot grants durable authority. |
| A7 | **PARTIAL / FAIL D13-1.** DS:3030–3039 names actual physical owner; AF safely represents numbers but `globalLimitRaised:false` is not supported-capacity evidence. FEAS.capacity/DEPLOY identify actual held totals. |

### Y — retry and bounded progress

| Item | Disposition and evidence |
| --- | --- |
| Y1 | **PARTIAL / FAIL D13-2.** DS:3059 directly fires current owed turn; FEAS live12/12. Expired owed turns clear and later sweeps repeatedly lose under equal30s schedule0/12. |
| Y2 | **PASS durable-read bound; FAIL root bound D13-1.** DS:2108–2118/2365 keeps unknown record/debt under bounded turns. DS:2948/2990 does not yet bound pre-accept and over-size serialization roots. |
| Y3 | **FAIL D13-1.4.** DS:3066–3078 keeps semantic debt but ambiguously/unconditionally returns physical subclaims on expiry. Prior DS:2535–2539 requires exact callback custody; FEAS expiryFrame distinguishes. |
| Y4 | **FAIL D13-2.** Actual router/ledger nested dependency under proposed gate blocks the event needed to release its token. Fixed private record/endpoint split is preserved; reserved bytes do not bypass that receive gate. |
| Y5 | **FAIL D13-1.** DS:3008–3014 enumerates theoretical slots but mandatory88.283TiB is not usable aggregate admission in2GiB. Rejected/native-control roots are missing from stated bounded acquisition. No new retry loop itself is added. |
| Y6 | **PASS exact replay safety.** DS:2439–2466/2773–2779/3054–3067 generation-token CAS preserves late-result identity; no unknown reply permits remint. Physical-credit reuse defect separately D13-1. |
| Y7 | **PASS.** DS:2993–2994/3041–3043/2569 denies ACK semantic or byte-release meaning; original deadlines unchanged. Actual nested witness distinguishes ACK from result. |

### T — delivery and wake semantics

| Item | Disposition and evidence |
| --- | --- |
| T1 | **PASS.** MI:435–457 still emits ACK before noHandler; DS:3041–3043 explicitly denies transaction evidence. PR12 raw256 witness remains historical exact scope. |
| T2 | **FAIL physical expiry D13-1.4; PASS identity.** DS:2990–2994 owns late frames but :3068/:3078 erases their credit on semantic expiry; FEAS old callback schedule. Earlier immutable late response fences preserved. |
| T3 | **PASS typed design / FUTURE routing.** DS:2999–3001/3071 pressure through existing transport, :2375–2466 strict result classification. No wire classifier implementation is claimed. |
| T4 | **PARTIAL / FAIL D13-2.** Existing bounded no-route turns preserve debt DS:2350–2366. A shared receive gate can block a valid route's own result; closing makes deterministic refusal, not supported completion. |
| T5 | **PASS scope labeling.** FEAS actual handler/send/provider/response ledger; gate and native allocation state machines expressly modeled. AUTHOR rereads old raw evidence; no fresh physical ws/native proof claimed. |

### S — timers and lifetime

| Item | Disposition and evidence |
| --- | --- |
| S1 | **PASS preserved.** DS:440–446/2347–2359 existing injected clock/unref and pre-FIFO capture; :3059 no added timer between native release/transfer. Future exact callback wiring remains source gate. |
| S2 | **PASS.** DS:3063–3066 read/classification/handoff only; :2361–2364 ordinary recovery alone redrives durable COMMIT. No new decision or rollback authority. |
| S3 | **PARTIAL / FAIL D13-1.** DS:3039 reconstruction before fresh admission preserves authority direction, but requiring the stated88TiB bank prevents supported2GiB restart; unresolved physical old roots cannot be discarded on in-process generation reset. |
| S4 | **PASS debt retention.** DS:3068–3070 retains durable creation/COMMIT after turn expiry; :2341–2366 long uncertainty never renews original mutation permission or evicts record. Credit disposal issue is D13-1.4. |
| S5 | **FAIL D13-2.** FEAS equal30s schedule has bounded foreground completion, valid recovery turns, idle lane periods and0/12 recovery versus12/12 quiet controls. Waiting protection vanishes at expiry. |

### R — recovery and replay

| Item | Disposition and evidence |
| --- | --- |
| R1 | **PASS preserved.** DS:2094–2134/2435–2466 exact-six identity and legitimate advanced handoff; :3114–3116 no schema/data reinterpretation. No stale row can replace live progress under accepted rules. |
| R2 | **PASS preserved.** DS:1324–1331/2361–2366 live consumer versus server debt distinction; :3063–3070 owed turn is read-only and no ACTIVE entitlement is recreated. |
| R3 | **PASS preserved.** DS:2128–2134/2901–2904 full participant obligations and missing-progress COMMIT remain; no model empty census is used as authority. |
| R4 | **PASS schema approval retained.** DS:2818–2864 V2 origin-preserving committed upgrade/V3 replay and recognized empty legacy case; P12 exact prefix/AF pinned prior schema. No new durable replay path proposed. |
| R5 | **PASS.** DS:2108–2118/2365–2366/2857 distinguishes unreadable/absent/foreign from completion/collision/bootstrap birth. Physical bank pressure cannot remint identity. |

### C — concurrency

| Item | Disposition and evidence |
| --- | --- |
| C1 | **FAIL physical preallocation D13-1.** DS:2982–2990 prepays queue credit but stringify still can allocate beyond it; NET/WS roots precede chosen accept hook. Accepted pre-INSERT record reservation remains unchanged P7/PR12 scope. |
| C2 | **PASS authority fences / FUTURE source.** DS:2435–2466 current same-response generation/cohort/origin and :3066–3067 exact owed CAS; strict capture unchanged. Allocation timing defects do not grant stale row authority. |
| C3 | **PASS winner safety; FAIL starvation D13-2.** DS:3052–3061 one lane/current owed token; exact expiry is single-winner but clearing all priority allows repeated loss. FEAS live/expired schedules. |
| C4 | **FAIL custody/progress D13-1.4/D13-2.** Delayed callbacks coexist with expiry and retry; source-independent FEAS event schedules expose early reuse and expired priority. Prior DS:2535–2576 classifier/expiry CAS remains required. |
| C5 | **PARTIAL / FAIL D13-1.** Node/physical-generation key is appropriate DS:2929/2952–2954/3033, but P's per-configuration validation maximum is not a node resource entitlement; rejected/control/self endpoints must join exact root census. |

### F — formation and self-dependency

| Item | Disposition and evidence |
| --- | --- |
| F1 | **Inventory complete; FAIL D13-1/D13-2.** Existing retained record→origin queue→socket/provider→private endpoint/native lane→fixed SQLite classification→ordinary recovery. Generic handler→nested request→same-connection result adds the exposed dependency; MI/PL/FEAS. Schema upgrade chain unchanged PR12. |
| F2 | **FAIL.** DS:3074–3077 reserved recovery bytes do not establish protected connection/parse access; generic hold can block before native owed installation. Full startup equation conflicts with supported budget and native owed can expire repeatedly. |
| F3 | **PASS preserved semantics.** DS:2347–2366/3110 and PR12 retained caller/pgwire controls preserve BEGIN/ROLLBACK and original deadline; this supplement does not alter client claim/CommandComplete rules. Future source must rerun them. |
| F4 | **FAIL D13-1/D13-2.** FEAS.capacity exact88TiB versus DEPLOY2GiB, post-stringify overflow and equal-budget progress counterexample; safe arithmetic alone is not capacity or useful deadline margin. |
| F5 | **PASS prohibition.** DS:2924–2925/3041–3043/3113–3117 adds no semantic owner, raw DB path, force-open or new transaction ledger. Diagnostic gate lift is a control, not a proposed production bypass. |

### H — harness fidelity

| Item | Disposition and evidence |
| --- | --- |
| H1 | **PASS.** PR12 actual raw256/queue0 remains exact; current AUTHOR only references it. New FEAS reaches live registered handlers and real response waiters before model gate blocks exact result. Native starvation is explicitly a permitted design schedule. |
| H2 | **PASS.** Actual generic dispatch/send/inproc/response ledger runs; logging/events/identity setup simplified, future gate modeled. Neither grants future private endpoint or native memory approval. |
| H3 | **PASS.** Equal30s budgets captured pre-FIFO, delayed arrival leaves1s, quiet100ms fits; foreground5.5s occupancy within its30s budget. Expiry precedes physical callback in separate explicit model. No impossible short-budget inference. |
| H4 | **PASS preserved.** DS:2375–2466 complete tuples/immutable6; exact originated V2/origin/generation schema fixture is pinned PR12. New transport witness uses nonempty root/inner messages with actual message IDs/source/target/result shape. |
| H5 | **PARTIAL.** AF all theoretical positions represented but no usable supported-memory full-cohort witness. FEAS has two nonempty live waits and quiet positive control. Future larger-successor/new-origin/full-record schedule must give three shared+one recovery roles DS:2753–2761. |
| H6 | **PASS ceilings.** Provenance/commands label current source, model gate, model arithmetic/native, earlier SQLite schema and future physical proof separately. No source/startup/production-decision acceptance inferred. |

### O — ownership and interaction

| Item | Disposition and evidence |
| --- | --- |
| O1 | **PASS.** DS:2094–2134 immutable classifier is sole creation adjudicator; ordinary recovery owns advanced decisions; transport/native slots only resources DS:3041–3043/3063–3066. |
| O2 | **FAIL D13-1/D13-2.** Names of MessageRouter/creation/native owners are right, but preaccept/serialize/expiry and receive/owed handoffs lack a composed capacity/progress rule. Inventory and exact DS citations above. |
| O3 | **FAIL complete paired claim.** Live native correction12/12 preserves safety and progress only while owed deadline survives. Equal-budget expiry0/12 and nested gate negative break complete paired saturation proof; quiet controls exclude broken fixtures. |
| O4 | **PASS identity; FAIL useful reentry D13-2.** DS:2773–2779 exact old callbacks cannot clear successor; :3069 existing sweep reenters. Reentry can repeat expiry forever without retained admission entitlement. |
| O5 | **PARTIAL / FAIL D13-1/D13-2.** No record eviction or explicit ID cap proposed; yet1024membership validation cannot fund every physical queue at100MiB, and clearing owed protection admits next foreground before debt can use a lane. No new retry storm is required. |
| O6 | **PARTIAL / FAIL.** DS:3059 direct foreground-root-release handoff is coherent for a live owed turn. DS:3068 physical expiry and shared receive dependencies violate actual last-consumer release/progression; provider controls/drop need same owner coverage. |
| O7 | **PASS.** DS:3041–3043/3063–3066 rejects ACK/slot/queue authority. AF safeInteger and capacity booleans are treated as models, not durable freshness or physical capacity. |
| O8 | **PASS.** D/provenance exact prefix/hash/38navigation copies, byte-identical AUTHOR rerun, pinned PR12; independent gate treatment/positive control labeled. No model/expected negative folded into certification. |
| O9 | **PASS prohibited escape; FAIL custody coverage D13-1.** DS:2925 bars new scheduler/ledger/retry; actual WS autoPong/HTTP/native acceptance paths expose missing existing-provider admission, not a requested alternate parse fallback. |
| O10 | **FUTURE, not rejection for missing implementation.** IMPACT:1079–1131 creation/persistence/client and :906–917/:1891–1910 transport lifetimes remain existing coupled owners; DS:3103–3111 requires future real provider/deadline/COMMIT witnesses and registration together. No metadata/source approval now. |

### J — canonical input and arithmetic

| Item | Disposition and evidence |
| --- | --- |
| J1 | **PASS representability; FAIL resource feasibility D13-1.** AUTHOR checked safe additions/products; DS:2931/3024 and :2375–2432 retain numeric domains. FEAS shows safe97068584538112 is still beyond existing deployment capacity. |
| J2 | **PASS preserved.** DS:2931 own-data immutable config and :2375–2378 strict exact input fields; no inherited authority introduced. Future source must enforce producer domains before allocation. |
| J3 | **PASS identity boundary / FUTURE implementation.** DS:2375–2378/2444–2466 captured exact tuples and consumption fence retained. D13-1 serialization witness uses ordinary data, not a new getter threat. |
| J4 | **PASS retained threat scope.** Prior PR12:J4 strict canonical records/pollution tests remain; authority-and-recovery threat model excludes invented arbitrary-host immunity. No changed interaction weakens own-data evidence. |
| J5 | **PASS preserved.** DS:2375–2432 primitive enums/hex/integers exclude boxed/coerced identity; schema incompatibility :2857 stays explicit. No truthy resource flag can adopt a row. |
| J6 | **N/A new intrinsic guarantee.** No new global intrinsic immunity claimed; existing strict boundary source tests remain future gates under authority-and-recovery. Diagnostics change no intrinsic. |
| J7 | **PASS immutable digest identity; FAIL serialization allocation D13-1.3.** DS:2435–2466 exact-six/page bytes unchanged; :2985–2990 post-stringify size test does not bound allocation. FEAS ordinary aliased values4125>4096. |
| J8 | **PASS fixed private domain; FAIL complete physical bound D13-1.** DS:2393–2397 fixed pages and :2733–2771 fixed private K remain. Actual generic arrays/provider fragments/rejected handles/control roots need bounded preallocation and complete charged lifetimes under :2956–2994. |

## Handoff

Correct the **complete physical-custody and progression interaction** as one existing-owner amendment: supported-memory active admission; pre-accept/rejected/control/self and producer/serialization roots; physical credit after semantic expiry; ordinary dependent replies/recovery through the receive boundary; and useful recovery admission after a bounded owed turn retires. Keep schema/private-slot positives and all original identity/client/COMMIT/refusal scopes closed.

Exact provider coefficients and future native/real transport witnesses remain implementation gates after the missing contract is coherent. This report neither prescribes a new scheduler/framework nor authorizes product source changes. No source/design/test/Quest/index/stage/commit/push or cluster action was performed; only this report and D diagnostics were written.
