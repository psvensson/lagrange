# Independent C2 harness implementation review

Verdict: **REVISE the new direct witness in two bounded respects**. The helper, canonical stamp setup and exact transport retirement delegations are content-approved; no production semantic repair is requested. Whole four-path implementation approval and final receipts remain withheld until the two witness gaps below are corrected and bound. Candidate lab evidence is pending and cannot be inferred from content review.

## Exact input

Baseline/worktree HEAD: `d35d8828c630d1b9675b47f511c477b3cc9ee991`. Approved addendum SHA256 `f475f261c45c37c7041d435ad36f248e0738b233194dd0c8cff10d32fdcb7e2d`; approved review `evidence/harness-design-review-revised.md` SHA256 `bcdfc09a0a6f7a2fc2dc4a72d9ca275515d5f5715e2f3835a2af846e92ae931c`. The complete initial43-item plus own-property review is `evidence/harness-design-review.md`, SHA256 `0cac1864e9ba03441d3247691d4bdb73a9f9f6822752bd3af3e362dac15abc4e`.

Independently computed four-path binary diff SHA256: `8c155d25b5baf1351c4dab401b77758a412724a62049df1e1c924822f9c7c442`.

| Path | Reviewed SHA256 |
| --- | --- |
| test/rebalancer/message-group-membership-branch-authorization.test.js | ea98ca5fb883a66ba42595bcb7332b210dc4937031175b40bb5c5c95b30bfcaa |
| test/convergence/dt6-learner-promotion-progress-proof.test.js | d187747cf606f6c79fa6f05286967c9a448a519a3d7697677516d4d03082bfc0 |
| test/integration/helpers/cluster-test-helpers.js | 7c0a270c24c39f67b56bad6707fd9b0fbeb59b10d650c982bc4abb55380fa031 |
| test/bootstrap/node-bootstrap-consistency.property.test.js | 1d7735ac5c00d7dde92fed881929e80830a424c5e045aca1b94f3ae0ebe28f27 |

Independently computed C2 four-production-path binary diff remains `d982b26235430dfbfa92fa594c5d3b9d0b6d849682de5b02e143818f88b6c603`. Its implementation approval belongs to the other independent verifier; no duplicate full source review here. Root is generating metadata and running the frozen16-file union. Neither operation has been performed by this reviewer. No source/test/metadata/Git edits, execution of tests/labs, commit or Quest disposition. This new report is the only reviewer artifact.

## All findings in one batch

**I1 — complete the authorization fixture's build identity.** New direct property test:405-408 supplies `targetBuildDigest: 'fixture-build-digest'`. That is not a current canonical release build digest. The focused authorization owner intentionally treats its partition/build binding as opaque (`src/node/participant-release-authorization-owner.js:26-38,61-64`), so its successful validates assertion at test:446 cannot prove the supplied binding has the shape a real release consumes. Current release identity requires a64-hex digest (`src/partition/partition-participant-release-contract.js:18,54-61`), and actual seed release uses the measured producer digest (`src/bootstrap/bootstrap-service-seed-workflow.js:268-282`). Use the existing `runtimeBuildProvenance` owner as the current protocol witness already does (`test/partition/participant-release-protocol.test.js:94-99`), assert its measured state through its existing vocabulary, and use that returned digest. Do not synthesize fresh membership authority or change any production validator. This is a field-fidelity proof correction, not a discovered production authorization bypass.

**I2 — cover captured own-present value across the actual await.** The helper correctly captures both own-property presence and value before its first await (`cluster-test-helpers.js:264-269`) and uses those bindings at :289-304. The direct async mutation control at property test:499-519 tests only initially absent membershipOwnerOutcome becoming present. It does not exercise the approved addendum:245-250's own-present captured value across the await. Add one actual helper call with an own supplied value (for example the frozen invalid object), immediately replace/remove that property and mutate the original identity after the async helper returns its promise, and prove the original exact supplied object/null/refusal is retained. A bad helper that captured presence but read the value after awaiting must fail this named assertion. Use real filesystem admission/resolver behavior, no sleep or resolver substitute. The original absent control remains. This is a required adversarial proof gap; the source already has the correct implementation.

No other content defect found across the complete category union below. The inherited broad test cleanup conventions and production field validation algorithms are not rewritten in this unit. New direct cleanup calls every constructed service's real shutdown without a catch that converts it to success; caller-owned paths are asserted to survive shutdown before caller removal (property test:520-527). A cleanup rejection remains red, and there is no active injected fault or extra release wait in this new direct case.

## Category-complete review — 43 items plus own-property

Content APPROVE below is bounded to inspected implementation bytes; it does not claim the unmeasured lab assertions passed. All unchanged production owner evidence is incorporated from the exact design reports above. Tests referenced below use the reviewed final file lines.

### Harness fidelity — 6

| Item | Verdict/evidence |
| --- | --- |
| H1 Intended baseline causes | **APPROVE content**, measured candidate **HOLD**. Branch now canonicalizes its raw answer once at test:46-52 and keeps a non-null check at :189, so the seeded JSON uses the actual returned stamp. DT6 identity delegates at :88-90 address the exact retirement refusal. Helper default at :289-295 addresses actual missing seed authority, not branch policy. Original three baseline reds remain in baseline-d35-lab-result.json. |
| H2 Actual seams/stub limits | **APPROVE content**. Real repository/SQL branch matrix remains unchanged; DT6 native replication bodies/gate unchanged; direct policy test uses actual resolver and actual authorization owner :404,431-446. Claim-cache's real bootstrap/SQL/Raft/CDC/cache body is unchanged at test:267-295, with synthetic membership observation explicitly bounded at :171-183. No physical promotion certification from a direct policy test. |
| H3 Time geometry/budgets | **APPROVE content**. Diff adds no wait, timeout, retry budget or compression. Immediate mutation occurs after the actual async helper invocation :506-510. Existing DT6 lag/promotion and cache whole30s budgets unchanged. The16-file frozen lab union and any exhausted healthy waits remain evidence gates. |
| H4 Complete canonical fields | **REVISE I1**. Stamp is actual canonical return and startup outcome is actual producer object; build binding test:407 is not canonical. Real resolver uses captured identity/final directory helper:291-304. No local outcome predicate or stamp field ordering copy. |
| H5 Nonvacuity/required controls | **REVISE I2** for present-value temporal control. Direct positive/null/undefined/invalid/inherited cases :426-497 consume actual authorization; absent mutation :499-519 is engaged. Full existing branch CAS matrix and all DT6 body/retirement assertions remain byte-preserved; both T1 settlements are unmodified and must run after real bootstrap. |
| H6 Physical scope/results | **APPROVE content limits**, lab **HOLD**. No measured candidate result received at this review. Original baseline11 and pending unique16 are separate populations; helper43-consumer/full corpus and FreshMG/full-cutover remain uncertified. |

### Transport — 5

| Item | Verdict/evidence |
| --- | --- |
| D1 ACK/noHandler unchanged | **APPROVE**. DT6 gatedProofChannel:84-98 adds only exact identity APIs; lost proof still returns undefined and normal delivery still calls inner.deliver. No ACK/noHandler change. |
| D2 Late response unchanged | **APPROVE**. No response, clock, request, retry or sequence handling edited. Existing gate closure and later healing/scenario assertions remain. Only inspection/retirement delegates added. |
| D3 Canonical return/classifier | **APPROVE**. :88-90 directly returns the same inner owner value without translation or catching. `src/transport/message-router-handler-registry.js:112-126` remains sole exact-handler decision. |
| D4 Undeliverable bounded | **APPROVE**. Original undefined gate and same typed learner proof budget/cadence remain; the new identity methods do not affect delivery. No invented noHandler or successful loss response. |
| D5 Exact retirement owner | **APPROVE**. Delegates preserve inner receiver/address/handler; `src/node/replica-transport-handler-identity.js:86-105` still controls retirement and refuses missing identity. Actual inner unregisterExact:123-126 removes only the same handler, preserving successor protection. No cleanup refusal swallowed. |

### Admission gating — 7

| Item | Verdict/evidence |
| --- | --- |
| A1 Same production owner | **APPROVE**. Helper:282-287 requires actual SERVICES positive empty, then absent-only resolver:289-295; actual authorization used in direct test:409-446. Seed production code unchanged. |
| A2 Explicit negative selection/refusal | **APPROVE** inspected behavior; **REVISE I2** temporal proof. Own presence captured at helper:264-269. Direct null/undefined/invalid tests:458-481 assert the constructor's current null normalization and actual owner refusal, without deriving a replacement positive. |
| A3 Budgets unchanged | **APPROVE**. No configuration, budget, delay or deadline edited in any of four files. Real seed release still uses existing production deadline and caller retry policy; direct new case does no bootstrap/network. |
| A4 Exact outcome/binding shape | **APPROVE** outcome delegation, **REVISE I1** build field. Helper passes actual owner object or exact supplied captured input. Constructor normalization remains current BootstrapService:216. No fixture fresh-seed object or local classifier. |
| A5 Actual fresh release | **APPROVE proof plan**, measured **HOLD**. Direct auth policy doesn't claim full release. Unchanged claim-cache bootstrap must pass actual registered fresh-seed release before test:271-295 proceeds. Validates token proof alone isn't final census/resume. |
| A6 Fresh canonical identity | **APPROVE**. Captured nodeId/address :262-263 and selected directory/manager :270-281 precede await; resolver :291-295 and constructor overrides :299-304 share them. No cache or reread selection after async work. |
| A7 Honest diagnostics | **APPROVE**. Direct test names focused authority choice/identity proof; existing integration header states its synthetic membership boundary. None of three baseline failures is promoted to semantic success. Build-token claim needs I1 field correction. |

### Recovery — 5

| Item | Verdict/evidence |
| --- | --- |
| R1 No stale durable mutation | **APPROVE**. Changed helper only calls existing read-only startup resolver and constructor; no raw SQL, row recreation, live registry write, phase or replay rewrite. Branch fixture-only prior stamp encoding changed, current CAS unchanged. |
| R2 Virgin/durable discriminator | **APPROVE**. Existing helper mismatch and SERVICES positive-empty checks retained :273-287; canonical resolver rejoin-hints:438-475 still owns durable/history/identity discrimination. Explicit inputs are not force-repaired. |
| R3 Missing state not authority | **APPROVE**. No manual interpretation of empty hints/nodes/peer collections. Actual resolver called with fixed explicit args and no force/probe spread, :291-295. Existing missing/unreadable evidence tests remain selected. |
| R4 Replay/rollback untouched | **APPROVE**. Only canonical setup return replaces raw stamp; whole replay/lost-write/interleaving branch matrix unchanged. No new restart, rollback, transport or release retry algorithm. |
| R5 Unreadable/conflicting/history refusal | **APPROVE**. Owner outcomes delegated even if nonfresh; helper does not inspect/replace a refusal. Explicit null/undefined/invalid stays owner-refused. Existing rejoin-hints refusal algorithms and tests remain unchanged. |

### Concurrency — 5

| Item | Verdict/evidence |
| --- | --- |
| C1 Unique directory and manager | **APPROVE**. Directory selection/manager code unchanged and explicit constructor override :301-302 preserved. Existing concurrent implicit-directory test and mismatch/nonvirgin cases remain. New direct case uses distinct caller-owned temporary paths. |
| C2 Async capture/use | **APPROVE helper**, **REVISE I2** witness completeness. All relevant node/property inputs captured synchronously before :282 await; uses const bindings after resolver await. Current mutation case proves absent choice and node/address retention :499-519; own-present temporal falsifier still required. |
| C3 Sole decision/winner | **APPROVE**. No owner-outcome predicate or branch decision added. Exactly one actual resolver call only on captured absent case, helper:289-295. CAS and inner transport remain sole production winners. |
| C4 No timers | **APPROVE**. Four-path diff introduces no setTimeout/interval/sleep/retry. Resolver called with no probe function; current producer early-return avoids network probing. |
| C5 Cleanup and identity custody | **APPROVE content**. Direct test tracks constructed services and caller directories and calls real shutdown before caller removal :520-527; no error-to-success catch. Existing implicit cleanup ownership unchanged. Transport unregisterExact retains same exact handler/inner identity. |

### Owner interaction — 10

| Item | Verdict/evidence |
| --- | --- |
| O1 Sole semantic owners | **APPROVE**. Actual stamp canonicalizer test:46-52; actual startup resolver helper:291-295; actual auth factory property:404; existing inner transport identity DT6:88-90. No consumer duplicates their decisions. |
| O2 Typed return delegated | **APPROVE**, **REVISE I1** field fidelity only. Canonical stamp and startup owner return retained; explicit supplied object identity asserted :452-454,478-479. Inner handler/boolean returns unchanged. No alias/normalizer adapter. |
| O3 Paired invariants | **REVISE I2** approved temporal pair. Derived/explicit positive and null/undefined/invalid negative share actual direct owner :426-497, and absent mutation is tested. Own-present async mutation still missing. Original branch success/CAS refusals and DT6 body+cleanup remain same file; real T1 matrix must engage. |
| O4 Stale/durable preservation | **APPROVE**. Captured explicit input is not overridden by new default; absent path reads current selected directory once per call. No cached default outcome or stale view is promoted to authority. Existing owner durable refusal stays untouched. |
| O5 Pressure/budgets | **APPROVE**. No force/bypass/retry budget. Local evidence reads are actual owner reads and must fit unchanged test budget. No runtime concurrency/cadence change. |
| O6 Registered release path | **APPROVE proof plan**, actual lab **HOLD**. No second operator release or forced OPEN inserted. Direct owner test is not bootstrap; actual claim-cache positive must still traverse seed authorization/release before T1 body. |
| O7 Projections not authority | **APPROVE**. Test never fabricates fresh outcome: expectedDecision actual resolver :431-435; authorize actual owner :409-412. Stored/test projections do not grant production permission. Synthetic learner basis retains existing explicit limited scope. |
| O8 A/B/input fidelity | **APPROVE binding**, measured proof **HOLD**. Four hashes and binary diff independently matched, production d982 unchanged. Original three baseline raw reds retained. Pending16-file candidate run must bind exact current tests; a later test correction needs new exact input, not reuse old proof. |
| O9 No duplicate escape hatch | **APPROVE**. One shared absent-input default covers43 direct consumer files; no changed callsite owner literal, raw read fallback or duplicate codec. DT6 adds only two transparent delegation methods, not retirement logic. Explicit real owner injection in seed-migration-cutover-persisted remains unchanged. |
| O10 Registry/proof alignment | **APPROVE content boundary**, metadata/evidence **HOLD**. Original witness paths remain; added direct controls live in existing property file. Root is refreshing current generated dependency/classification artifacts, with no source/test edits permitted while frozen. Final impact/shard selection audits and exact43-consumer/full-corpus ceiling must be retained. No Quest or FreshMG bar rewritten. |

### Formation — 5

| Item | Verdict/evidence |
| --- | --- |
| F1 Own-subsystem read census | **APPROVE**. Actual SERVICES storage admission :282-287, then rejoin resolver local hints/read-only nodes data only :291-295. No query against an unformed cluster, raw grant write or boot mutation added. |
| F2 No CDC/probe cycle | **APPROVE**. Only explicit dataDir/nodeId/address passed; no probe/cached view/CDC subscriber/timer added. Producer's absent-probe early return unchanged; real bootstrap owns later release. |
| F3 Initial client gate | **APPROVE** unchanged. Bootstrap seed outcome still consumed by current canonical authorization and release; no user write/T1 case runs before bootstrap success and actual owner/leader checks. Helper only composes dependencies. |
| F4 Window/budget | **APPROVE content**, latency **HOLD**. No startup/test budget change. Local resolver adds real reads under existing bounds, and pending lab must measure actual initial window and full body+cleanup; exhausted healthy waits remain red. |
| F5 No fresh synthesis/force bypass | **APPROVE**. No forceNewCluster or spread options passed to resolver, no synthetic fresh-seed outcome, no consistency bypass; actual current returned object only. I1 corrects nominal token binding, not authority ownership. |

### Scoped property/intrinsic — 1

| Item | Verdict/evidence |
| --- | --- |
| J1 Own input selection before await | **APPROVE helper and explicit negatives**, **REVISE I2** temporal proof. Object.hasOwn and supplied value captured before first await :264-269; inherited invalid object is absent and real owner derives at property:483-497; null/undefined/invalid direct refusal complete. No new hostile production decoder or claim of arbitrary accessor/proxy/prototype hardening. Remaining ...options spread can read ordinary caller fields again, but captured authorization inputs explicitly override it; this review does not claim zero accessor executions. |

## Remaining gates

Root should authorize only the two direct-test proof corrections, preserving the other three reviewed files and production scope. Save revised direct-test and four-path diff hashes for incremental review. Existing frozen lab input remains historical evidence and must not be relabeled to new bytes. No local tests or budget increase. After corrected content approval, exact current16-file union, metadata/selection/static gates and independent measured evidence review remain required. Main/full-cutover and C2 Quest closure remain HOLD.
