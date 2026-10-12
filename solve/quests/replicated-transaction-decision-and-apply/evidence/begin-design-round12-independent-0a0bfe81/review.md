# BEGIN round 12 — independent bounded design review

## Verdict

**REVISE the complete resource contract; production source remains HOLD.** This is one complete, category-complete review of the frozen round-twelve design. There are two grouped remaining findings:

1. **D12-1 — HIGH: the proposed generic-transport custody relies on limits that do not bound the named aggregate allocations or their physical lifetimes.**
2. **D12-2 — MEDIUM: the recovery-only endpoint slot does not protect access to the shared native lane, so the claimed protection from continuous foreground traffic is not established.**

**Separately APPROVE D11-2's originated-V2/empty-legacy schema transition as design:** DS:2818–2864 identifies the actual predecessor, a deterministic committed upgrade preserving its origin and generation, exact replay, and the legal empty legacy-column installation. This does not approve an unimplemented command, a source change, activation, or a production census.

The fixed node-owned endpoint slots also repair the *private allowance* part of D11-1: a larger supported connection wrapper cannot change a fixed private slot's size. That scoped positive does not establish the aggregate resource/progress claim across MessageRouter and the native lane. Earlier immutable identity, post-expiry reconciliation, caller/result entitlement, COMMIT, page/generation and four-frame protections remain accepted at their prior scopes.

No B5 source, startup, transport resource implementation, main, merge, corpus or physical acceptance is approved. The review changed only this report and D diagnostics; no product/design/test/metadata/Quest/index/commit/remote was changed. No cluster or lab test was run.

## Exact subjects and evidence

- B = `/mnt/data/peter/projects/.worktrees/rs-raft-startup-integration-20261011`
- Q = B/`solve/quests/replicated-transaction-decision-and-apply`
- E = `/mnt/data/peter/projects/.worktrees/rs-raft-candidate-20261011/test-output/continuation-20261011`
- D = E/`begin-design-round12-independent`
- N = D/`navigation`, exact current-source and dependency copies for read-only navigation.

| Alias / artifact | SHA-256 |
| --- | --- |
| DS: Q/design-query-begin-uncertain-insert-resolution-2026-10-11.md | `e7a1a4cf6618f316bdc19337ae8f3d9e88c0f305767cffff25db21c79286af98` |
| P11: Q/evidence/design-query-begin-uncertain-insert-resolution-round11-a43acda0.md | `a43acda04119ee312a9452c38d32fc3a67b33e0cdf7a47193a6fff05be1844d1` |
| PR11: E/review-begin-uncertain-design-round11-independent.md | `8e1143185b267ad74ef384c54392c4d7df88e2d3ac38838787b38dea47fa4bfb` |
| AUTHOR: Q/evidence/begin-round12-capability-schema-feasibility.mjs | `71d7b837616e5432838cb649742b5bcc00e3c291e81e22f50c9414f4078781c5` |
| AF: Q/evidence/begin-round12-capability-schema-feasibility.json | `e0ec8a2c8d9b7593d440c9f0066e964b7605ba13a256f6fb207eaa284d4dbb88` |
| Accepted P7: Q/evidence/design-query-begin-uncertain-insert-resolution-round7-3679b87f.md | `3679b87f4aeb84fd8d9397aac9f73f686e5fcb990c1e61e86df35e9731f91fa5` |
| PR5: E/review-begin-uncertain-source-round5-independent.md, historical held-source evidence only | `b4e08617230af527cbb4c66b7e33eb1b4f0d6f77b78010aa5bc23c7effdd2224` |

DS has 2915 lines / 184457 bytes; the 167759-byte P11 is its exact prefix. The DS Git object in preservation snapshot `f1b6d4de6dde8481b7d34d8519975d1891c9128a` is byte-identical. Preservation is not acceptance. D/provenance.json records those checks, the 34 pinned navigation artifacts, exact diagnostic executable, and a final byte comparison against B. All selected navigation files and DS were unchanged at final capture.

Steering followed AGENTS → rules → router. The authority-and-recovery owner and all ten applicable verification templates were read. Each of their 63 items has a disposition below. The existing trusted-input boundary is retained; this review does not add arbitrary hostile-runtime requirements.

### Executed diagnostics and their ceilings

D/commands.md records commands. The exact author program was copied into an E-only mirrored layout and rerun against the pinned current imports using Node v22.22.0, executable SHA `1bec56ef7cfa9a76f3e0b7c0a87f220eb73f23102b9c0b4c7529a3f7c3ce7c31`. Its generated JSON is **byte-identical to AF**. This executable choice supports these bounded diagnostics; it is not a future distribution certification.

AF contains real current committed-origin application/replay and actual SQLite schema operations. Its new V3 upgrade is a manually instantiated SQLite transaction, not a future production command. The slot arithmetic, successor `enabled` fields, and `genericTransportOwnsRawWrapperAndCallback: true` are design-model assertions, not production transport allocation measurements.

D/independent-adverse-schedules.mjs and .json provide two additional observations:

- **Actual current ordinary router/in-process seam:** real `handleServiceMessage`, `sendRaw` and `InProcWebSocket.send`, with only logging/events stubbed. 128 small requests to an absent route synchronously queue 256 raw ACK/no-handler deliveries; zero ordinary outbound queues are created. Before the microtask checkpoint, none is delivered. Afterwards all 256 arrive, totalling 159908 serialized bytes; the largest frame is 1198 bytes. This is intentionally the ordinary transport path cited as the generic owner. It does not pretend to execute the future private preflight, native ws buffering, or a semantic transaction result. ACK plus noHandler is the expected positive observation, not an import/setup failure.
- **Executable admissible design schedule:** twelve bounded foreground grants each occupy the shared native lane at a recovery turn's arrival, then finish. Recovery has its reserved free endpoint and keeps the same ID/COMMIT debt, but receives PRESSURE twelve times; the same schedule without foreground occupation completes classification. This is a state-machine counterexample to the design guarantee, not a running future endpoint or a measured production deadlock.

No diagnostic rewrites a durable COMMIT or emits production transaction decisions. Existing real coordinator/pgwire/recovery evidence remains historical PR5 scope and must be rerun for future source acceptance.

## Complete grouped findings

### D12-1 — HIGH: naming MessageRouter as owner does not supply its missing aggregate custody bound

**Contract:** DS:2704–2731 moves raw JSON/Buffer, variable node/address strings, generic envelopes and WebSocket callbacks out of the creation total. DS:2718 cites pinned ws maxPayload, existing concurrent/pending counts and committed-membership population as their bound. DS:2803–2810 relies on that owner to pay a successor's actual wrapper independently of full retained records. DS:2885–2888 calls for a root census, but does not supply the missing admission/lifetime rule.

The selected actual owner does not provide the claimed composition:

| Actual seam | What it establishes | What the new claim still needs |
| --- | --- | --- |
| MI:52,88–90 | Buffer/string parsing precedes message-type/private dispatch and captured delivery authority. | Admission/charge for simultaneously retained receive roots, strings and parsed graphs before their allocation; rejecting at private preflight is later. |
| SL:104–112,176–213; CL:314 | Normal ws server/dial and per-accepted-connection records. Server defaults include no node-wide receive or connection budget. | A concrete population bound covering current, unidentified, duplicate and physically retiring connections used by this route. Committed peers are not those physical roots. |
| WS server default `maxPayload` (100 MiB) | Per-message receive size limit. | Aggregate count × copies × overlapping lifetimes; maxPayload does not bound outbound raw frames or how many can coexist. |
| OQ:224–247,266,477–557 | Per-target queued/in-flight delivery counts; completion returns count credit. | A node/physical allocation budget across sender populations and old generations. The delivery result can settle before physical send custody ends. |
| MI:435–455,476–495 → MD:698–701 | ACK, no-handler and response use raw JSON send outside OQ. | Count/byte admission and actual send-callback/error/close release for these frames, including pressure/refusal traffic. |
| IP:266–273; WS sender:505–573 | In-process send retains a queued closure/data; ws dispatch forwards frame data into socket writes. | A bounded population/physical completion debit for these roots. Existing application queue counts do not count them. |

The actual diagnostic confirms the narrow queue-coverage fact: 256 small raw emissions coexist before a checkpoint while the cited ordinary outbound queue population is zero. It does **not** assert that 159908 bytes exceeds a production total, that arbitrary traffic must get private capability, or that production has exhausted memory. The design defect is that no complete aggregate owner/bound has been specified for the allocations explicitly moved there.

Private K admission cannot account retrospectively for generic receive/parse allocations made before it. Restricting capability to the current committed cohort cannot itself bound pre-capability receive roots or retiring physical generations. Conversely, later refusing unsupported frames does not authorize prematurely returning their byte credit. These are the same allocation/custody boundary; they are one finding.

The fixed-slot model succeeds only after assuming the omitted generic term is already paid. With T=1048576, K=4, Cendpoint=11361, Cnative=262144 and Crecords=740988, the *private* equation is exact and the larger wrapper cannot consume an extra private unit. The booleans in AF do not establish a finite corresponding generic bank or the full-cohort replacement handoff. The measured 11361 is illustrative tuple arithmetic, not an approved physical-reference coefficient.

**Required bounded closure:** make the existing MessageRouter/creation-resource interaction executable: name the aggregate count/byte debit for every transferred root and overlapping copy; the actual pre-allocation admission/backpressure point; the exact last-consumer release; and the capacity/retry rule covering a full admitted record cohort, old physical sends and equal/larger successor/new origin. A per-message limit alone is insufficient. Preserve supported traffic and current limits; no arbitrary peer-ID cap, new retry framework or broad generic rewrite is requested. Exact coefficients and future runtime tests remain implementation gates once this contract exists.

### D12-2 — MEDIUM: recovery's reserved endpoint can repeatedly lose the shared completion lane

DS:2753–2759 reserves one endpoint slot for owner-derived SERVER_RECONCILIATION and denies it to foreground work. DS:2788–2790 concludes that continuous fresh traffic therefore cannot starve accepted debt. But unchanged DS:2517–2522 acquires the **single node-wide native lane atomically with any semantic grant**, including foreground grants, and holds it through consumption/expiry. The new reservation covers the endpoint, not that next admission decision.

An allowed periodic schedule is:

1. A valid foreground grant acquires the native lane at time 20, with a bounded future turn deadline.
2. At time 21, the accepted recovery record (immutable original deadline 5) obtains its reserved endpoint under a valid server turn ending at 29. Native admission returns PRESSURE.
3. All recovery pressure frames drain; the foreground classifier finishes and releases native custody at 23. No record is evicted, no callback is lost, and no deadline is renewed.
4. A next foreground grant acquires at 30 before the recovery owner's next bounded retry at 31. Repeat.

D/independent-adverse-schedules.json:nativeLane executes twelve such periods: recovery makes zero classifications despite its reserved endpoint and the native lane being idle for seven of ten time units each period. Each foreground turn is finite. The finite prefix can be extended by the same permitted transitions. A quiet positive control classifies immediately. This is recoverable-work starvation under the new claimed fresh-traffic protection, not a claim of deadlock after all competition ceases.

A rotating sweep selects fairly among the origin's retained records; it does not choose between unrelated foreground grants and recovery at the target. A free endpoint, bounded turn, backoff and no target waiter do not by themselves bridge that gap. Role restriction also means a K=4/four-origin witness must give explicit roles: all four foreground exchanges cannot simultaneously use three shared slots plus a recovery-only slot. A valid role assignment is possible, so this is a witness-fidelity requirement within D12-2, not a third contradiction.

**Required bounded closure:** specify how the existing owner protects actual native completion admission for retained recovery when foreground traffic continues, with no lending of the reserved entitlement, no new semantic owner/queue/framework, and unchanged original/turn deadlines. The same full-cohort schedule must demonstrate useful recovery progress plus bounded accepted/refused foreground work and physical frame custody. Alternatively an explicit existing-owner fairness precondition must actually establish the promised protection; the current endpoint-only inference does not.

## Independently accepted corrections and preserved constraints

### D11-2 schema design — APPROVE, separate from resource rejection

DS:2818–2864 now matches the actual owned predecessor. APPLY:577–602 and STORE:66–79,104–122 create origin and V2 enforcement in the same SQLite application transaction. The independent rerun obtains:

- first application: `applied`, origin={originIndex:7, originTerm:3}, write generation=0, exact V2;
- identical command replay: `replayed`, same origin and generation;
- explicitly modeled fixed trigger upgrade: exact V3 installed in one SQLite transaction, origin=(7,3), generation=0 unchanged;
- modeled exact V3 replay: unchanged;
- real existing empty recognized legacy-column installer: adds the fixed nullable columns and obtains enforcement with zero rows.

The new design assigns the V3 command to that existing committed owner, gated at proposal by the actual paused current-cohort release/census. The command pins origin/generation/schema/enforcer/target/census identity. Deterministic apply consults those committed/durable facts, not a follower's volatile pause/readiness. Upgrade index/term never become replacement origin. The schema admission verifier, apply and census use one state classifier.

The positive branch is accompanied by explicit atomic refusal for originated missing/modified/foreign enforcement, wrong origin/generation, foreign table shape, nonempty missing-column legacy and NULL/malformed/unreconstructible debt. Exact recognized empty legacy first installation remains legal. DS:2892–2900 requires actual future command/replay/stale-census controls. Those future tests need not already pass for this **design** approval. The schema proof does not authorize rewriting durable transaction rows, manufacturing a missing origin, installing on read, or force-opening activation.

### Fixed-slot component and cumulative scope

DS:2733–2816 defines one node-owned fixed K pool before records, unchanged single native reserve, count and byte admission, generation-tagged old/new slots and callback lifetime. Within the private equation, full records cannot consume a successor's slot; equal and one-unit-larger wrappers have the same private charge. Old callbacks cannot release new tokens. This closes the prior variable-private-allowance arithmetic, conditional on the whole-owner corrections above.

The following remain cumulative and are not reopened:

- DS:2341–2366: original deadline never changes; foreground expiry bars INSERT/ACTIVE, while server reconciliation receives a later bounded read-only turn. Later ordinary recovery alone may redrive a durable COMMIT.
- DS:2375–2466: strict complete tuples, phase/offset/length, exact immutable six, both local generation domains and same-response current-leader witness. A preliminary attempt key or digest is never adoption, collision or completion evidence.
- DS:2094–2134: exact identity/classification before adoption; generic constraints/timeouts/missing rows do not remint; advanced rows are handed to ordinary full recovery without whole-row equality or loss of legitimate progress.
- DS:2493–2576, as superseded only for slot ownership: credit ACK/outcome plus classifier ACK/outcome have distinct subclaims; semantic expiry is separate from physical release; exact late refusal does zero SQL; occupied reentry retains no waiter.
- PR11's retained client/result rules and PR5 evidence: caller detachment is not record/consumer retirement; same-session and server retry share exact ownership; post-CommandComplete failure suppresses Ready/destroys the connection; live/advanced result custody remains explicit.
- Recorded COMMIT, its original prepare coordinates and enlisted manifest members remain owed. Missing participant progress cannot become empty or rollback.
- Historical B5/source ratchet and full-source gates remain unresolved. This review neither remeasures nor waives them.

## Pinned owner navigation

Paths are under N, with exact hashes in D/provenance.json.

| Alias | Path |
| --- | --- |
| MI | src/transport/message-router-inbound-dispatch.js |
| MD | src/transport/message-router-delivery-behaviors.js |
| OQ | src/transport/message-router-outbound-delivery-registry.js |
| SL | src/transport/message-router-server-lifecycle.js |
| CL | src/transport/message-router-connection-lifecycle-methods.js |
| CA | src/transport/message-router-connection-authority.js |
| IP | src/transport/message-router-shared-vocabulary.js |
| WS | node_modules/ws/lib/{websocket-server,websocket,sender,receiver}.js |
| EN | src/query/distributed/distributed-transaction-schema-enforcement.js |
| APPLY | src/partition/partition-participant-transaction-apply.js |
| STORE | src/partition/partition-participant-transaction-store.js |
| CENSUS | src/query/distributed/distributed-transaction-release-census.js |
| IMPACT | test/shards/impact-contracts.json |
| FEAS | D/independent-adverse-schedules.json |
| AF | Exact author JSON and independently reproduced E-only copy |

## Complete 63-item disposition

**PASS** means feasible design/preserved scoped contract, not source certification. **FAIL** references the two findings above once, not additional findings. **FUTURE** names required implementation binding. Historical PR5/PR11 evidence retains its original ceiling.

### Admission A1–A7

| Item | Evidence and disposition |
| --- | --- |
| A1 | **PARTIAL / FAIL D12-1.** DS:2764–2771 makes private slot precheck/enforcement one owner; MI:52 and MD:698–701 expose the unaccounted prior generic allocations. DS:2859–2864 unifies schema verification/apply/census. |
| A2 | **PASS.** DS:2752–2754 typed invalid configuration; :2783–2786 transient transport pressure; :2852–2857 incompatible retained schema. No error/pressure becomes empty success. |
| A3 | **PASS.** DS:2347–2366 separates unchanged foreground deadline from bounded server turn, including unreadable/expired outcomes. No transport ACK renews either. |
| A4 | **PASS design; FUTURE actual private consumers.** DS:2375–2466 exact tuple family and :2850–2857 schema result states; MI:435–455 actual ACK/noHandler behavior preserved in FEAS:rawTransport. |
| A5 | **FAIL D12-1/D12-2.** DS:2773–2779 names exact physical slot release, but generic release credit and reserved-endpoint-to-native progression are incomplete; FEAS demonstrates both narrow gaps. |
| A6 | **PASS.** DS:2435–2466 consumes current same-response origin/target/leader witness; :2768–2779 tags exact delivery/resource/slot generations; :2830–2845 binds committed schema upgrade. |
| A7 | **PASS identity; FAIL capacity claim D12-1/D12-2.** DS:2526–2533,2803–2816 retains actual held tokens/debt; the larger-successor and continuous-fresh progress statements exceed the named complete bounds. |

### Retry Y1–Y7

| Item | Evidence and disposition |
| --- | --- |
| Y1 | **PASS retained sweep; FAIL useful admission D12-2.** DS:2350–2359 and :2785–2791 retain canonical bounded retries; FEAS:nativeLane shows repeated firing without completion. |
| Y2 | **PASS.** DS:2108–2118,2365–2366 preserves exact record/charge under missing or unreadable row, bounded by each captured server turn. |
| Y3 | **PASS private typed stops; FUTURE physical binding.** DS:2526–2576 enumerates grant expiry, invalid/occupied/retiring paths; :2783–2786 pressure retains debt. No silent terminal inference. |
| Y4 | **FAIL D12-1/D12-2.** DS:2749–2761 eliminates record-to-private-slot suppression; missing generic capacity and shared-native admission still defeat the complete recovery path. |
| Y5 | **PARTIAL / FAIL D12-1.** DS:2737–2761 bounds K/private bytes and unchanged sweep/backoff; OQ limits per target, not raw send populations. No total retry/copy bound follows from the cited queue constants. |
| Y6 | **PASS.** DS:2439–2466 and :2773–2779 preserve exact-ID late replay and old-token noninterference; schema replay :2845–2855 preserves origin/generation. |
| Y7 | **PASS.** DS:2569–2576 denies ACK authority; :2341–2366 fixes original/turn budgets. FEAS:rawTransport pairs every ACK with noHandler, without classification success. |

### Transport T1–T5

| Item | Evidence and disposition |
| --- | --- |
| T1 | **PASS.** MI:435–455 actual ACK precedes noHandler; DS:2569–2576 and :2094–2106 require processed canonical evidence, not transport acceptance. |
| T2 | **PASS private identity; FAIL generic custody D12-1.** DS:2444–2466,2773–2779 rejects old delivery/page tokens without erasing debt; actual raw frame lifetime remains outside the cited count owner. |
| T3 | **PASS design / FUTURE implementation.** DS:2783–2786 uses existing typed pressure/unavailability and :2375–2466 strict evidence; noHandler/ACK shape is pinned by FEAS. New receiver/classifier mappings must be source-tested. |
| T4 | **PASS bounded attempt; FAIL eventual protected route D12-2.** DS:2350–2359,2783–2791 bound no-route/pressure turns without forgetting; a free endpoint does not guarantee a native grant. |
| T5 | **PASS scope fidelity.** AF.scope distinguishes model versus actual SQLite; FEAS uses real dispatch/raw/in-process send but explicitly excludes future preflight and native memory. No compliant stub is substituted for new endpoint proof. |

### Sweep/time S1–S5

| Item | Evidence and disposition |
| --- | --- |
| S1 | **PASS preserved.** DS:440–446 and :2347–2359 retain injected sweep clock/unref and pre-FIFO captured deadline. PR5:S1 is historical source evidence; this revision adds no timer. |
| S2 | **PASS.** DS:2350,2361–2366,2128–2134 restricts reconciliation to reads/handoff. Ordinary recovery retains existing leader/SOLO/decision authority; no new rollback or voter-role rule. |
| S3 | **PASS design.** DS:2812–2816 reconstructs transient reserves before fresh admission, with durable debt retained. DS:2840–2857 preserves schema/origin after replay; AF executes actual origin/replay. |
| S4 | **PASS.** DS:2341–2366 permits legal post-original-expiry read-only turns while refusing new foreground entitlement; no timeout evicts the creation record. |
| S5 | **FAIL D12-2 and dependent D12-1.** DS:2788's reserved endpoint cannot prevent foreground native-lane occupation at :2517–2522. FEAS:nativeLane uses bounded completed grants and a quiet positive control. |

### Recovery R1–R5

| Item | Evidence and disposition |
| --- | --- |
| R1 | **PASS.** DS:2094–2134,2435–2466 requires exact immutable six and current evidence; legitimate advanced row/progress is handed off, not replaced. DS:2840–2857 preserves origin and all retained transaction rows. |
| R2 | **PASS.** DS:1324–1331,2361–2366 keeps live consumer claims distinct from server-only debt; :2812–2816 reconstructs volatile slots without manufacturing durable authority. |
| R3 | **PASS.** DS:2128–2134,2901–2904 preserves canonical manifest enrollment including absent progress rows; schema :2854–2857 refuses malformed retained debt rather than calling it empty. |
| R4 | **PASS D11-2 closed in design.** DS:2840–2857 specifies exact-origin/generation V2 upgrade and V3 replay; AF.schema uses real (7,3)/0 predecessor and modeled atomic upgrade/replay. BEGIN replay identity remains unchanged. |
| R5 | **PASS.** DS:2108–2118,2365–2366 and :2857 distinguishes unavailable/foreign/missing state from completion, collision or first birth. An empty originated table does not permit trigger repair. |

### Concurrency C1–C5

| Item | Evidence and disposition |
| --- | --- |
| C1 | **PARTIAL / FAIL D12-1.** DS:2764–2771 reserves private slot synchronously before private capture/ACK/Promise; MI:52 already allocated generic parse roots. Accepted pre-INSERT record reservation/durable classifier remains P7/PR11 scope. |
| C2 | **PASS design.** DS:2435–2466 rechecks captured response generations and current authority; :2777–2779 exact token checks prevent late release. Strict input capture still must precede consumption in future source. |
| C3 | **PASS claim shape; FAIL progress D12-2.** DS:2517–2533 uses one native-grant winner and semantic expiry/classifier CAS, :2773–2779 one slot token; fairness of that winner is unestablished. |
| C4 | **PASS preserved safety.** DS:2535–2576 separates timeout/late classifier/callback/shutdown; :2365–2366 keeps debt. FEAS:nativeLane counterexample changes scheduling, not duplicate effects. |
| C5 | **PARTIAL / FAIL D12-1.** DS:2733–2779 node K/native keys match private allocations; OQ:224–247 is per-target semantic delivery, not the actual aggregate generic physical allocation key. |

### Formation F1–F5

| Item | Evidence and disposition |
| --- | --- |
| F1 | **Inventory complete; FAIL D12-1.** Retained owner → current-leader MessageRouter credit/page → SQLite schema/row materialization → immutable classifier → ordinary recovery; schema upgrade separately uses paused census → committed apply → new census (DS:2128–2134,2375–2466,2818–2864). No cache/raw read bypass. |
| F2 | **FAIL D12-1/D12-2.** Withheld K/native terms survive full records (:2749–2761), but generic admission and target native competition can still stop accepted debt; FEAS/AF separate those owners. |
| F3 | **PASS preserved.** DS:2347–2366 and PR11 client scope retain uncertain BEGIN/ROLLBACK disposition, original client budget, later server turn, and no expired ACTIVE publication. |
| F4 | **PARTIAL / FAIL D12-1/D12-2.** AF.capacity computes exact illustrative private sum; DS:2347–2359 names both windows. Neither bounds missing generic copies nor supplies recovery's next native opportunity. |
| F5 | **PASS prohibition.** DS:2910–2915 bars raw DB escape, force reopen, eviction, new store/queue/scheduler or authority. Proposed schema command is within the committed owner and is not a recovery bypass. |

### Harness H1–H6

| Item | Evidence and disposition |
| --- | --- |
| H1 | **PASS mechanism binding.** D12-1 uses actual queue-bypassing raw emissions; D12-2 is expressly a design schedule. AF actual V2+origin reaches the former schema counterexample and new lawful transition. No absent future method is counted red. |
| H2 | **PASS honest seams.** FEAS uses actual MessageRouter dispatch/sendRaw/in-process methods; logging/events alone are stubbed. AF manually models new V3 SQL/slots and says so; neither certifies remote ws or future private receiver. |
| H3 | **PASS.** FEAS observes raw emissions before/after an actual microtask checkpoint. Native-lane schedule keeps valid original expiry=5 and fresh bounded turns at 21+, with physical pressure release and native completion ordered before next round. |
| H4 | **PASS.** DS:2375–2466 full wire identity; AF.schema actual origin=(7,3), generation=0, exact V2/V3 digests. Future command needs census/phase/generation fields, not a simplified no-origin fixture. |
| H5 | **PASS / limited.** AF models a completely full record budget and four slots; FEAS sends 128 nonempty wrapped messages. Schema zero-row control proves installation only; DS:2892–2904 requires retained-row/refusal and all earlier COMMIT controls. |
| H6 | **PASS ceilings explicit.** Exact design/source snapshots and AF/FEAS scope distinguish design arithmetic, current SQLite, ordinary router and future production acceptance. No source, startup or corpus claim is inferred. |

### Ownership O1–O10

| Item | Evidence and disposition |
| --- | --- |
| O1 | **PASS.** DS:2094–2134 immutable classifier alone adjudicates BEGIN; ordinary recovery owns advanced decisions; :2859–2864 one schema state owner; slots/router supply resources only. |
| O2 | **PARTIAL / FAIL D12-1.** DS:2718 names transport custody but its cited OQ/ws bounds do not implement the complete typed allocation handoff. Schema interaction :2818–2864 is coherent. |
| O3 | **FAIL complete paired proof D12-1/D12-2.** AF closes private larger-wrapper arithmetic; FEAS pairs retained debt/pressure with quiet classification but exposes missing protected shared-native progress. End-to-end custody plus progress is still open. |
| O4 | **PASS design.** DS:2773–2779 old generation cannot veto fresh token; :2812–2816 restart reenters canonical owner; :2840–2857 exact schema replay stays valid, incompatible observations retain obligations. |
| O5 | **PARTIAL / FAIL D12-1/D12-2.** DS:2753–2761 forbids lending K/native to records and recovery slot to foreground. Repeated transport emissions are outside OQ, and native scheduling remains shared. |
| O6 | **PARTIAL / FAIL D12-1/D12-2.** DS:2773–2787 names callback/error/close and existing sweep. Actual last-consumer generic credit and native admission after a recovery retry need the same owner correction; no second timer is proposed. |
| O7 | **PASS.** DS:2812–2816 rejects volatile-slot authority; :2094–2106 rejects preliminary-key authority. AF capacity/booleans remain projections and are not used as durable adoption/COMMIT permission. |
| O8 | **PASS.** D/provenance.json exact prefix/Git/source checks, AF exact rerun hash, FEAS raw-seam/model labels. No reversed source variant or expected diagnostic is folded into positive certification counts. |
| O9 | **PASS no requested escape; FAIL inaccurate existing-bound claim D12-1.** MI/MD/OQ/IP inspection exposes the adjacent raw path rather than inventing another classifier. DS:2910–2915 forbids force/eviction/alternate SQL. |
| O10 | **FUTURE, not design rejection.** IMPACT:1079–1131 names creation/persistence/client pair; :906–917 and :1891–1910 cover router lifetime. DS:2880–2904 requires exact interaction witnesses; new source must register private slot/router/schema endpoints and tests together. No metadata approval here. |

### Canonical JavaScript/input J1–J8

| Item | Evidence and disposition |
| --- | --- |
| J1 | **PASS design.** DS:2375–2432 safe integer/no-negative-zero tuple fields; :2733–2754 checked K×Cendpoint/native/record sums and config refusal. AF private sum is exact; no physical coefficient certification inferred. |
| J2 | **PASS preserved.** DS:2375–2378 exact own-data records; current delivery authority and committed schema witness are consumed, not inherited. Generic pre-parse resource gap is D12-1, not authorization by inherited fields. |
| J3 | **PASS preserved / FUTURE binding.** DS:2444–2466 same captured response and connection witness; :2709–2712 immutable borrowed identity/fixed capture. Existing strict capture/recheck requirements remain; no repeated accessor permission is introduced. |
| J4 | **PASS preserved scope.** DS:2375–2378 strict canonical records and PR11:J4 defenses stay required. No arbitrary prototype/host immunity beyond the owner contract is newly asserted or waived. |
| J5 | **PASS.** DS:2375–2432 exact primitive enum/hex/numeric domains exclude boxed/coerced shapes; :2857 foreign schema refusal cannot be bypassed by truthiness. Future source retains sealed adversarial controls. |
| J6 | **N/A new host requirement; preserved existing guarantees.** No new mutable-intrinsic design claim is made. Authority-and-recovery “Threat model and proof claims” and PR11:J6 retain existing strict boundary tests without expanding arbitrary trusted-host scope. |
| J7 | **PASS immutable/schema identity; FAIL resource attribution D12-1.** DS:2435–2466 exact six and page bytes; :2830–2845 exact schema/enforcer/target digests. Raw JSON escaping/encoding copies still need the named generic budget, not identity coercion. |
| J8 | **PASS fixed private domains; FAIL whole allocation D12-1.** DS:2393–2397 fixed 4096-byte page and :2733–2771 bounded slots; :2128–2134 full authoritative manifest handoff unchanged. Generic population/arrays/graphs before preflight are not bounded by private K. |

## Handoff

This report closes **D11-2 as design** and retains the fixed-private-slot correction as scoped positive. Correct D12-1 and D12-2 together at the existing creation-resource/MessageRouter/native-admission interaction. Preserve all existing caller, exact identity, deadline, physical-lifetime and committed-schema protections.

Future implementation must still provide measured aggregate copies/counts and actual callback/close/receive custody, the full-cohort old/successor/new-origin and protected-recovery controls, strict tuples/late replies, actual committed V3/refusal/replay, registered metadata, prior cumulative transaction/pgwire/COMMIT controls, normal source gates and exact-candidate startup/acceptance evidence. These remain implementation obligations; they were not substituted for the two concrete design findings.

