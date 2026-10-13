# Independent C2 proof-harness design review

Verdict: **REVISE** the addendum in the three bounded respects below. Canonical stamp assignment and transparent handler-identity delegation are acceptable. No test/helper implementation is approved until the revised addendum is bound. No production policy, C2 source verdict, Quest disposition, or FreshMG acceptance is changed by this review.

Reviewed worktree HEAD `d35d8828c630d1b9675b47f511c477b3cc9ee991`; addendum SHA256 `929689031b86ded8e83eac55614783ee38e079f7367b666d8aceaf13d96d1ea8`. C2 production subtraction is frozen separately, diff SHA256 `d982b26235430dfbfa92fa594c5d3b9d0b6d849682de5b02e143818f88b6c603`, independently reviewed by another verifier. This review does not duplicate or certify that implementation. The four proposed test/fixture paths remain byte-identical to their d35 baseline:

| Path | SHA256 |
| --- | --- |
| test/rebalancer/message-group-membership-branch-authorization.test.js | 2e4dd8fd53ffd0da0a9f100c6ed8f795c5f862f5665989adc460dcf7812810f5 |
| test/convergence/dt6-learner-promotion-progress-proof.test.js | 5f2e5fd85f56146cf444447092cda871a79dc5adb7b1420cdb51a3ec0bc9e948 |
| test/integration/helpers/cluster-test-helpers.js | 33b4b1056c7b41d3702fa41a61783d4ad1b64ec4cb3194578d017b9d52999e94 |
| test/bootstrap/node-bootstrap-consistency.property.test.js | accde5b7d288bd70735fdf77e21a04e288d1e3b43074770609da432b1030169c |

Read-only design/source/fixture/evidence review; no tests/labs, test/helper/source/metadata/Git changes or Quest disposition. This new evidence report is the only review artifact. AGENTS/rules/router and the routed source/contract/test owners govern the review. Baseline `evidence/baseline-d35-lab-result.json` binds 11 files / 434 runner assertions, eight green and three red; each ran once on its assigned locked host. Baseline red artifacts are retained, not reclassified as semantic acceptance or deleted.

## Complete correction batch

**H-R1 — snapshot the authorized fixture identity and property choice before await.** The proposed helper invokes a resolver with `options.nodeId`/`options.nodeAddress` then constructs `BootstrapService` by spreading `options` after resolver I/O (addendum:171-188). Mutable options can therefore change the node identity between authorization evidence and constructed service. At helper entry, capture nodeId, nodeAddress, exact own membershipOwnerOutcome presence, and its value when present, once before the first await. Use those same bindings for the resolver and explicitly override the same nodeId/nodeAddress/selected outcome after `...options` in construction. Final dataDir/manager are already captured by helper:260-271 and overridden after spread at :282-284. Do not introduce a validator, alternate outcome or resolver injection. A deterministic direct test may start the actual async helper, mutate the original options immediately after the call returns its promise, and prove construction keeps the captured identity/property decision on the same selected directory. This uses the actual async seam, with no sleeps or fake resolver.

**H-R2 — prove explicit undefined remains refusal, not merely stored selection.** The direct controls at addendum:207-228 omit the expressly promised own `undefined` case. Add it alongside null and the identical frozen invalid object; preserve an explicitly supplied real canonical positive object as the same supplied object. Property-presence semantics must be own-property semantics: inherited membershipOwnerOutcome is absent for this choice. Use the actual existing fresh-seed authorization owner to prove that the derived canonical positive is accepted and explicit null/undefined/invalid remain refused; no test may reproduce `freshSeedOwnerProofValid`. This may be a focused owner-policy assertion, honestly distinguished from full bootstrap. Current `BootstrapService:216` intentionally maps falsy inputs including undefined to null. The helper must forward the captured input unchanged into the constructor, but the direct test should assert the existing constructor's null/refused result for undefined, not demand stored undefined or alter production defaults. The existing claim-cache integration is the live positive proof that actual bootstrap crosses registered fresh release before executing both T1 bodies.

**H-R3 — measure the unique combined cone once.** Replace addendum:244-267's overlapping minimal run followed by re-running the original eleven. Root's explicit plan is the unique union of original11 plus five additional files: node-bootstrap-consistency.property, rejoin-hints, seed-migration-cutover-persisted.integration, participant-release-protocol, and partition-participant-release-admission. Freeze exact source/test bytes and run that 16-file union once on locked hosts with retained placement/status/raw TAP. Repeat or broaden only for a newly changed input, a failure, or another unresolved reason. Original three reds remain baseline evidence; successful setup alone cannot count as branch/retirement/T1 proof. All existing timeouts and assertions remain; any healthy exhausted wait is red.

No further design defect found in the two local fixture refits: calling `committedStampOfAnswer` once and consuming its returned frozen stamp removes a bad test encoding, while the two identity methods delegate to the same underlying transport with its original receiver and exact handler. Neither relaxes production validation or retirement.

## Category-complete dispositions

All requested category items are addressed below: 43 filled items plus the scoped own-property intrinsic item. APPROVE means design/preservation acceptable; all implementation and measured candidate proof remain outstanding. Evidence paths are repository-relative and bind the reviewed d35 source/current unchanged tests. No unrelated production hardening is claimed.

### Harness fidelity — 6

| Item | Disposition and evidence |
| --- | --- |
| H1 Right-reason baseline and refit | **APPROVE** direction. Branch raw stamp seed test:46-50,187,207 is rejected by exact canonical fact `src/rebalancer/replica-operation-message-group-membership-authorization.js:621-629` (current subtraction lines; baseline:642-652). DT6 wrapper test:84-95 hides identity methods. Seed release refusal is actual `src/bootstrap/bootstrap-service-seed-workflow.js:268-275`. Baseline result records all three before source edit; no import/setup red is passed off as branch behavior. |
| H2 Live seams versus fixtures | **APPROVE**. Branch suite uses the real repository/SQL CAS with explicit synthetic prior fact (test:177-218). DT6 real native/replication fixture documents in-process scope and live voters (test:1-32; fixture:350-400). Claim-cache integration actual SQL/Raft/CDC/cache is explicit test:267-295, while membership observation is supplied at :171-183 and reconciliation intentionally quiesced at :285-288. No physical/off-seed claim follows. |
| H3 Time ordering and budgets | **APPROVE**, **REVISE H-R3** measurement plan. DT6 300 ms lag/5000 ms promotion test:76-78 unchanged; cache 5000 ms leader and 30000 ms full body+teardown at test:274-275,303-306 unchanged. No sleep, expiry compression, retry allowance or timeout increase added. |
| H4 Canonical complete fields | **APPROVE** stamp/retirement, **REVISE H-R1/H-R2** identity/explicit fields. Existing `committedStampOfAnswer` at source:559-565 returns the canonical validator stamp, using owner field order :75-90; branch request/prior permit and row facts remain. Resolver and constructor must consume identical captured node/directory/property choice; explicit outcomes are not decoded locally. |
| H5 Nonvacuous intended bodies | **APPROVE** required plan, candidate **HOLD**. Preserve entire branch race/replay/stale-owner/lost-answer matrix at test:258-568, all five DT6 scenarios including :106-398, and both claim-cache FAILED/REMOVED settlement subcases :289-295 with actual initial CAS/CDC visibility :142-170 and branch effect/refusal :198-238. Direct field equality alone cannot replace owner acceptance/refusal (H-R2). |
| H6 Physical scope and exact result | **APPROVE** limits, **REVISE H-R3**. Existing baseline11 bound by exact d35 and locked cohorts. Future16-file union measures this fixture composition and C2 preservation only. Shared helper has43 direct consumer files; this bounded cone is not full43-consumer or full corpus certification. No FreshMG/snapshot/full-cutover closure. |

### Transport and delivery — 5

| Item | Disposition and evidence |
| --- | --- |
| D1 ACK/noHandler semantics | **APPROVE** unchanged. `gatedProofChannel` drops only the same promotion proof by returning undefined test:88-93, then delegates ordinary delivery. No new ACK, success value, noHandler interpretation or grammar. |
| D2 Late response handling | **APPROVE** preservation; no new delivery/retry algorithm. Decorator adds only identity inspection and exact retirement delegates; existing inner delivery and production proof RPC handling remain unchanged (test:84-95; `test/convergence/dt6-learner-promotion-fixture.js:286-301`). |
| D3 Response grammar/classifier | **APPROVE**. Forward the exact return values from inner.getRegisteredHandler and inner.unregisterExact; do not translate booleans, handlers or errors. The actual registered-handler owner `src/transport/message-router-handler-registry.js:112-126` remains the sole identity/mutation decision. |
| D4 Undeliverable bounded | **APPROVE** unchanged. Gate behavior and learner promotion retry/promotion budget stay as test:76-78,80-95,283-353. No new poll or success fallback. Existing failure can still be typed and measured. |
| D5 Transparent retirement | **APPROVE**. Addendum:101-107 is the exact current delegate pattern fixture:290-294. `src/node/replica-transport-handler-identity.js:16-24,40,96` refuses unprovable identity; inner registry:123-126 removes only the exact requested handler. A successor under the same address remains protected. Errors are not swallowed and cleanup must complete. |

### Admission gating — 7

| Item | Disposition and evidence |
| --- | --- |
| A1 Same production startup state | **APPROVE**, **REVISE H-R1** snapshot. Actual resolver `src/bootstrap/rejoin-hints.js:652-655` reads the final directory; actual fresh authorization `src/node/participant-release-authorization-owner.js:16-38` consumes canonical outcome. SERVICES admission stays helper:272-278. Neither fixture invents or infers fresh authority. |
| A2 Absent default versus explicit refusal | **REVISE H-R2** proof; decision direction **APPROVE**. Only Object.hasOwn false derives. Null/undefined/invalid own inputs must not invoke a replacement positive, and actual authorization remains null. Constructor normalization at `src/bootstrap/bootstrap-service.js:216` is unchanged. |
| A3 Existing budgets | **APPROVE**. No new network/timer or deadline; actual seed release uses existing leadershipWaitTimeout and relative pause retry `src/bootstrap/bootstrap-service-seed-workflow.js:265-293`. DT6/current integration timeouts stay unchanged. Healthy exhaustion is a system red. |
| A4 Exact outcome shape | **APPROVE**. Helper uses `decision.membershipOwnerOutcome` returned by owner `src/bootstrap/rejoin-hints.js:478-500,632-655`; authorization checks that same owner vocabulary. No fixture literals for BOOTSTRAP_SEED/FRESH_SEED/boundary, no truthiness/nullish positive fallback. |
| A5 Actual fresh release observable | **APPROVE** proof plan, candidate **HOLD**. Seed workflow passes actual token through requestParticipantRelease at :268-284 before bootstrap returns. Claim-cache test requires bootstrap success and actual leader/owners at :271-281, then both T1 settlements. A constructed service with a stored positive outcome alone is not release proof. |
| A6 Fresh canonical directory/per-call | **APPROVE**, **REVISE H-R1** binding. Directory/manager selection helper:260-271 precedes actual owner reads; resolver context `rejoin-hints:338-354` performs reads each call, no cache. Constructor explicitly overrides directory/manager; add identity/property snapshots to prevent caller mutation during awaits. |
| A7 Honest fixture diagnostics | **APPROVE**. Node IDs/directory/row identity remain caller-owned and actual. Baseline refused seed cannot be called membership-cache success. Branch fixture says prior fact is supplied test:201; cache header test:1-8 and :171-183 says SQL/CDC boundary, not physical learner creation. |

### Recovery and replay — 5

| Item | Disposition and evidence |
| --- | --- |
| R1 No stale/live durable write | **APPROVE**. Resolver only reads hints and read-only SQLite `src/bootstrap/rejoin-hints.js:338-354`; `rejoin-hints-durable-evidence.js:338,413-451`. No row/grant write, live registry overwrite, lifecycle phase or recovered cache introduced. Branch fixture continues to seed only explicit prior setup rows; current mutations remain real CAS. |
| R2 Virgin/durable discriminator | **APPROVE**. Existing SERVICES positive-empty gate helper:272-278 plus actual owner mismatch/conflict/unreadable/durable decisions `rejoin-hints:438-475` govern; helper never constructs a fresh token from a filesystem absence. |
| R3 Missing state is not fabricated authority | **APPROVE**. Missing hints do not erase durable nodes evidence `rejoin-hints:468-473`; corrupt/read errors are retained in current owner context and tests `test/bootstrap/rejoin-hints.test.js:591-656`. Empty peer list is not manually treated as fresh by fixture. Existing storage admission remains independent. |
| R4 Replay/rollback algorithms | **APPROVE** preservation, no new algorithm. Canonical stamp refit changes only setup encoding; branch replay/lost write matrix :258-334 persists. Transport delegate does no recovery. Resolver makes no durable mutation or replay/rollback decision. |
| R5 Unreadable/conflicting/historical evidence | **APPROVE** unchanged owner. `rejoin-hints:438-475,604-644` returns fail/durable outcomes; fixed resolver arguments omit forceNewCluster and probe. Direct production owner tests remain in16-file union. Explicit positive injection remains the caller's pre-existing authority route, not newly derived from bad evidence. |

### Concurrency and serialization — 5

| Item | Disposition and evidence |
| --- | --- |
| C1 Directory uniqueness/manager binding | **APPROVE** unchanged. helper:218-238 chooses distinct mkdtemp path or exact supplied manager; direct property test:372-391 proves concurrent unique implicit directories and cleanup. :447-481 refuses directory mismatch and durable SERVICES. No shared global directory/cache introduced. |
| C2 Await/identity TOCTOU | **REVISE H-R1**. Capture identity and property decision before async admission/resolver; explicitly reuse values after ...options. DataDir already fixed :264-284. Test immediate mutation of original options across actual await; no replacement constructor identity may consume an outcome derived for different input. |
| C3 No alternate winner/decision | **APPROVE**. Default calls actual resolver once and uses returned object; explicit input remains selected by exact property presence. Branch mutation stays canonical repository CAS, and retirement stays inner exact handler owner. No local decision predicate or retrywinner. |
| C4 No timers added | **APPROVE**. Resolver probe early return `rejoin-hints:310-313`; only filesystem/SQLite evidence read when no probe argument is supplied. None of the three corrections registers a new timer, service or repair loop. |
| C5 Cleanup ownership/exact handler | **APPROVE**. helper owns only implicit directory and binds cleanup at :241-249,286-288; explicit caller-owned directory survives service shutdown and is removed by caller. Inner unregisterExact checks address+handler identity registry:123-126, never removing a successor. Existing direct cleanup errors must remain observable. |

### Owner interaction — 10

| Item | Disposition and evidence |
| --- | --- |
| O1 Sole owner of each question | **APPROVE**. Canonical stamp: `raft-committed-membership-stamp:559-565`; branch fact predicate: auth:621-629; handler identity/retirement: `replica-transport-handler-identity` + inner transport registry; startup decision: `rejoin-hints:652-655`; fresh release authority: authorization:16-38. Helper/decorator supplies composition only. |
| O2 Typed objects delegated intact | **APPROVE**, **REVISE H-R1/H-R2** full selection proof. Stamp canonical return is reused; transport replies unchanged; owner membership outcome forwarded without decoding/recreation. Existing constructor normalization stays canonical. No alias or fabricated authority record. |
| O3 Paired invariants same witness | **REVISE H-R2** direct proof, otherwise **APPROVE**. Derived positive and explicit null/undefined/invalid negative must use actual authorization in one focused case. Branch all success/CAS refusal controls retain common canonical setup :258-568; DT6 body+cleanup complete in same file; T1 FAILED/REMOVED share real SQL/CDC lifetime :267-295. |
| O4 Stale/durable remains refused | **APPROVE**. No cached default owner outcome; each absent call rereads its exact directory, while explicit injected outcome follows original policy. `rejoin-hints:438-475` and rejoin tests reject stale/unreadable/conflicting history; branch stale owner/term/case matrix retained. No permanent veto or refresh bypass introduced. |
| O5 Pressure/budgets/retries | **APPROVE** unchanged. Refits do not alter branch lease/timeouts, DT6 proof cadence/gate, startup leadershipWaitTimeout or cache budget. Resolver without peer probe adds read-only work, not retry amplification. Actual budget exhaustion remains red. |
| O6 Registered release path | **APPROVE** required proof. Claim-cache bootstrap must traverse actual registered fresh-seed release at seed workflow:268-293 before test:271-281, then SQL/Raft/CDC/cache body. No second operator release/helper OPEN seed or manually created current token. |
| O7 Projection not authority | **APPROVE**. Canonical returned objects are producer-owned facts, not test-reconstructed projections. Cache integration marks synthetic membership basis only :171-183; setup stamp doesn't claim a native proposal occurred. Assertions cannot grant admission or retire a handler. |
| O8 Treatment fidelity and baseline | **APPROVE** direction, **REVISE H-R3** measurement. Keep original raw3reds and exact d35 source hashes; candidate comparison uses frozen identical current tests where source A/B is used. Fixture refit green must engage intended owners; missing import/method/setup is never behavioral evidence. Root handles immutable input and same-host cohort. |
| O9 No local escape/duplicate helper | **APPROVE** intended scope, implementation audit pending. One shared helper default for100 calls/43consumer files; no callsite fresh-seed object or duplicate serializer/classifier. Two transport methods use existing underlying owner pattern, no compatibility retirement. Keep current explicit real outcome injection `seed-migration-cutover-persisted.integration.test.js:115-123` unchanged. |
| O10 Registry/proof cone alignment | **APPROVE** preservation, final metadata/proof **HOLD**. Existing learner outcome contract/witness registers cache integration at impact-contracts:958,1948. Existing witness paths remain live; helper's generated dependency cone must continue reflecting43consumers. Four changed test/fixture paths and16-file measured union do not prove every helper consumer/full corpus. Canonical final metadata/selection receipts are still required; no production acceptance bar is rewritten. |

### Formation circularity — 5

| Item | Disposition and evidence |
| --- | --- |
| F1 Self-subsystem read inventory | **APPROVE**. Helper reads SERVICES storage through owner :272-275, then resolver reads local hints/nodes SQLite `rejoin-hints:338-354`; durable evidence opens read-only/fileMustExist. Resolver is neither network bootstrap nor query against an unformed cluster. Failure remains current typed decision. |
| F2 No new CDC dependency | **APPROVE**. No probe argument, so `rejoin-hints:310-313` returns before network loop. Resolver registers no subscriber/timer/service or CDC dependency. Actual bootstrap release later uses its established canonical owner path. |
| F3 Initial clients stay owner-gated | **APPROVE**. Actual BootstrapService consumes supplied owner outcome only via fresh authorization/participant release; no first application write may bypass that gate. Integration body begins only after test:273 bootstrap success and :274-281 actual leader/owner checks. |
| F4 Startup window unchanged | **APPROVE** limits, measured candidate pending. Seed release uses existing production leadershipWaitTimeout deadline :265-293; cache entire fixture30s :303-306 unchanged; no attempt retry treats an exhausted healthy wait as green. Added local evidence read time must fit the same budget, measured rather than assumed. |
| F5 No authority synthesis/bypass | **APPROVE**. Pass only final dataDir/captured nodeId/nodeAddress to actual resolver, no spread forceNewCluster/probe/local fresh token. Production defaults and exact durable discriminators unchanged. No raw SQL grant, no compatibility caller classifier. |

### Scoped JS intrinsic/property-presence boundary — 1

| Item | Disposition and evidence |
| --- | --- |
| J1 Exact own presence, no truthiness grant | **REVISE H-R1/H-R2** proof; `Object.hasOwn` choice acceptable. Capture own presence/value once before awaits. Own null/undefined/invalid must not be replaced; inherited outcome is absent. Existing production stamp decoder retains its own-data/proxy/numeric/array checks (`raft-committed-membership-stamp:34-45,123-170,559-565`) and is merely reused. No new hostile production guard is introduced; no unqualified prototype/getter/proxy hardening claim for arbitrary test options is made. |

## Bounded next step

Revise only this addendum's identity binding, direct negative/actual-authority controls, and unique16-file measurement plan. The authorized implementation boundary, once independently approved, is exactly the four test/fixture paths listed above. Do not alter C2 frozen production, current startup/permit/retirement policies, production defaults, explicit real owner injection, assertion meanings, healthy budgets, or Quest acceptance. Whole Quest remains HOLD pending exact bytes, static/selection/impact evidence, current owner engagement and locked-lab preservation.
