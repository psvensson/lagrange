# Native v1 companion: independent pre-run byte review

Verdict: APPROVE these exact two test/fixture files for their first locked native execution. This is not a source approval, test result, full writer-protocol proof, or release approval. No tests, syntax checks, lint, or native code were executed by this review. Production source is concurrently under construction and is not bound by this verdict.

Worktree: `/mnt/data/peter/projects/.worktrees/wasm-writer-slots-v1-20261016`.

| File under test/wasm-service | SHA256 | Git blob |
|---|---|---|
| wasm-strong-write-v1-native-fixture.js | 5f6abb5fc31b5545040936a5b6488952c132655802328779a2f38d3cfd1de65f | ab07dca92ee7dfeeefd913c0ce42a630cfa8e7f1 |
| wasm-strong-write-v1-native-completion.test.js | 387243f87b87713099863467d1389072f6dd834f416893042dd8b137d9bd71ed | 6da463708ef5de1a16a068c20b5add69ce0cd4ff |

Abbreviations below: F = new v1 fixture; T = new v1 test; H = imported historical `wasm-strong-write-native-fixture.js`. AGENTS -> rules -> router loaded; applicable verification templates and test-guidelines index consulted. Original historical fixture/test remain byte-identical to base cdcb9c95 (empty diff), with SHA256 3a949083e132ac9eba399d82c1df90aba09bda321a959e04a3bdb41623feba34 and 591dd4c77abedd4685cfcdcc563cf2bd04bdd578c73daf8ab8c14d256d14e45f respectively.

## Harness fidelity (all six items)

1. Right reason: T:18-29 requires one exact canonical proposal, two distinct native follower ACK origins for that exact index, leader commit/applied below it, and no applied KV value. T:36-41 then requires the SAME caller to return success after healing before T:45-47 checks STRONG_WRITE_SUCCESS_BEFORE_COMMIT. Missing API, admission refusal, zero exact entries, failure to heal, or fixture setup is not this semantic RED. T:48 detailed receipt checks follow the discriminator, allowing a completion-only early-acceptance treatment to fail for the intended reason.
2. Honest seam: H constructs three actual WasmServiceReplica objects, native ports, SQLite stores and loopback handlers. F:88-95 inserts that actual live leader under its serviceDefinitionId/groupId into the real lifecycle registry. `WasmServiceLifecycle.createReplica` also keys activeReplicas by serviceDefinition.serviceId (183-218), and administerWriter selects that key (236-244). This composes real admin ingress but bypasses guest/module/port deployment; F explicitly says so. No manufactured application or receipt.
3. Time: H:56-75 uses fixed 64 captured transport rounds, 16 microtasks per round and zero elapsed VirtualTimeSource advancement, processing only existing zero-delay wakes. Setup election ticking/status is separated in H:78-97. No measured ticks/status/settle. Important limitation: current WasmWriterCompletion constructor resolves its own clock from constructor options, while H assigns providedTimeSource after replica construction. Thus recorded zero elapsed refers to native/transport fixture clocks, NOT proof of controlled completion-interest deadline time. No deadline behavior is claimed; expiration cannot falsely pass because original-caller success after heal is required. Do not adjust the schedule after the first result.
4. Fields: F:100-110 supplies complete canonical INIT, ENROLL and K+ack-null write inputs selected by DESIGN.md. F:34-38 constructs canonical WRITE independently of writer-codec. Actual encodeProposal is UTF-8 JSON; independent digest therefore matches exact declared bytes, not a candidate-generated expected receipt.
5. Non-vacuity: nonempty exact proposal, two actual ACK origins, positive safe receipt position, exact log/receipt/digest matches, all three applied/commit positions and actual KV assertions exclude rejected/missing writes and submission-only success. F:73-81 requires each real admin caller RECORDED and its exact command applied on all three replicas before measured work.
6. Live binding: H startWrite calls real leader.handleMessage; F admin calls real lifecycle.administerWriter; SQL/KV and actual-core observer establish native binding. No result has yet been executed. Compiled guest invocation, deployment, physical multi-host behavior and power-loss durability remain outside this test.

## Admission/gating (all seven items)

1. Same state: setup assertions inspect actual applied native command positions (F:45-56,73-81), not seeded writer rows or admission booleans. This file does not certify every precheck/application race.
2. Classification: test requires typed RECORDED receipt (F:117-130), and rejects REFUSED/UNKNOWN/forwarded as control success. It does not classify every refusal branch; those remain source/unit obligations.
3. Budget: historical fixed schedule unchanged; no timeout increase. Current local interest deadline is a separate product budget, not proven by this zero-native-time test.
4. Reason shape: no fabricated rejection object. Real failures are captured by H startWrite and F:62-66; final positive requires full typed result. Hostile/retry reason handling remains untested.
5. Hold release: T:31-34 releases retained actual follower ACK envelopes through existing transport; the same caller then must settle at actual applied receipt. No new write/status rescue.
6. Freshness: cut and healed records are new direct durable/KV reads; immutable copied cut is not recomputed from later authority. F:111 captures post-admin initial state.
7. Identity: F:108-110 binds actual group serviceId, fixed fresh incarnation, enrolled slot/generation/seq. F:128 and exact command digest/position check prohibit using an unrelated result. Fixture's service registry key is serviceDefinitionId, not replicaId.

## Transport/delivery (all five items)

1. ACK versus processing: H transport's delivered:true is explicitly finite fixture custody only. T does not treat it as commit; it separately captures core-produced APPEND_RESPONSE envelopes, native commit/applied and KV state.
2. Late responses: actual held ACKs are released once (splice), original caller preserved; no waiter retirement/deadline/retry scenario claimed.
3. Typed outcomes: public write receipt is tested; loopback delivery does not claim full production router classification. No new transport classifier is introduced.
4. Missing recipient: existing loopback deliver throws when no registered handler (`partition-service-test-support.js:86-104`); fixed rounds exclude polling loops. Such failure is setup/transport failure, not semantic completion RED. Network timeout bounds are not proved.
5. Stub fidelity: actual native envelopes/registered replica handlers, full delivery options forwarded by H; loopback simplifies networking and noHandler response shape. This is sufficient to hold native quorum ACK custody, not to certify all router options or failure behavior.

## Owner interaction (all ten items)

1. Sole question owner: production writer application/result owner decides RECORDED; tests only compare that answer with exact durable position and KV. No test-created authoritative receipt.
2. Typed boundary: lifecycle supplies administrative intent; native runtime orders; application records result; local completion returns it. F:59-81 invokes this composition, without an alternate DB mutation path. Source interaction inspected at lifecycle:236 and replica applyCommittedEntry:308-330; final source still requires its own review.
3. Paired invariants: T:18-48 combines no precommit success with actual later same-caller completion in one schedule. Healthy T:51-59 is separate confirmation. No executed RED/GREEN claim yet.
4. Stale then fresh: copied uncommitted cut followed by healed application; same request and Promise remain. Exact replay/old-generation cases are intentionally separate obligations.
5. Pressure: one writer, one slot, no bypass or force flag. Saturation/waiter bounds are not certified by this narrow test.
6. Wake: native ACK delivery progresses Ready/application; caller resolves through production completion owner. No observer-triggered readStatus, repeated proposal or manual tick.
7. Projection: evidence SQL and native event trace are passive diagnostics; no receipt is manufactured from those projections. H evidence snapshots after declared actuation.
8. Treatment fidelity: future source-only negative MUST retain functioning v1 codec/admin/application path and identical tests, altering only write completion behavior. Reverting entire predecessor source would be invalid because v1 setup surface did not exist. No negative yet executed.
9. No escape: direct DB reads observe only; no row insertion/deletion, synthetic CORE_OK, or helper fallback success in F/T. Lifecycle registry population is the explicitly limited composition seam, not a replicated authority write.
10. Registry/proof: new fixture/test are separately identified v1 input profile under the selected Quest, leaving old bytes immutable. Parent still owns impact registration and exact source checkpoint evidence; this review does not approve missing final metadata or Quest closure.

## Additional category coverage and exclusions

Concurrency: synchronous gate, post-await TOCTOU and single-winner tests are not introduced/certified here. The single caller is saved before awaited delivery and asserted identical afterward (T:13,36). Awaited INIT/ENROLL setup requires each applied receipt before next operation. Timer reentry is excluded from the measured scenario; local interest clock caveat above. No new mutex; locked lab execution remains parent responsibility.

Recovery: no reconstruction, restart, lost enlistment, dedup/replay or snapshot claim. The fixture registers one already-live real replica without overwriting an existing lifecycle entry (new lifecycle object). Absence of KV at cut is combined with actual log and positions, never treated as NOT_COMMITTED proof for an unknown request. A/B/A replay, admin lost replies and persisted fences require separate witnesses.

Retry: no new retry owner. Existing original write is issued once; delivery rounds are bounded upfront; fixed-round failures are loud assertions; no mutual suppression/rescue loop. Held envelopes released once; no duplicate-effect or reset-counter certification. Caller durable-before-send persistence is not exercised: this fixture directly invokes the native service route and does not claim WasmWriterClient adapter coverage.

## Decision and remaining limits

No pre-run blocker found in these exact fixture/test bytes. Execute whole file once on a frozen complete candidate through the existing locked executor, preserve first result and classify setup gaps separately. Approval excludes source implementation, complete protocol/capacity/recovery, admin authorization deployment, deadline behavior, source mutation success, merge and release sealing. Do not relabel the historical identityless test as these new v1 inputs.
