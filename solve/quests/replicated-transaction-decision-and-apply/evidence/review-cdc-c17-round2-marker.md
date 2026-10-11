# C17 source review — round 2

Reviewer: `subagent:review_marker_correction` · 2026-10-11

## Verdict: REJECT the exact C17 snapshot

The revision fixes useful parts of F1–F7, but retained-byte admission still has reachable bypasses, exact nonempty-cell replay is not idempotent, malformed replies can become successful absence, and production callers do not share the promised operation deadline. Replacement and shared-capacity wakes also lose required progress. All applicable categories are covered below; this is one complete rejection round.

This review concerns **cache-state coverage/hydration**, including one supported row larger than 16 MiB. It does not approve the separate durable CDC obligation ledger, original-event delivery/lost-ACK recovery, activation, seed loss, receipt 8, or the broader dirty worktree. A supported oversized row is not proof of a bounded arbitrary backlog or hydration concurrent with real COMMIT/ACK processing.

## Bound subject and evidence

`W=/mnt/data/peter/projects/.worktrees/tx1-cdc-20261011`; source/test paths below are relative to W. `E` is this report's directory; `P=E/cdc-c17-round2`.

- Snapshot `3edcdbf04b7d5e063a5be53cd14448f030c4b60a`, tree `6835b3481fbbeadcd1741984f10c64da31b196fa`; retained proof ref `refs/proofs/rs-raft-20261011/cdc-c17-round2`.
- All **44** `P/source-manifest.sha256` entries match both W and snapshot objects. Manifest SHA256 `5bff3682ffe2a90760712f3f1f9c7a0bfc7dd2935f3f276ce837db88fc3ab5cb`.
- Accepted design `solve/quests/replicated-transaction-decision-and-apply/cdc-continuation-20261011.md`: `d6a6017acaa0cedfd42a388a4f2e89724291d36c37d5f50c9034038e0d79a3bf`.
- Prior rejection `E/review-cdc-c17-source-fresh56.md`: `51194f1886d378c6cda174fda91d47481719fdee83a456566ec435c50cbf57df`; rejected snapshot `642d750b065c7381b46a609a677974444f11954f`.
- Read AGENTS → rules → router, runtime/authority-and-recovery owners, accepted C17 revisions, applicable verification templates, prior F1–F7, changed owners and adjacent query/gateway/local-read/cache/membership consumers. Only read-only inspection and targeted in-memory diagnostics were performed; this report is the only file written. No source, test, log, Quest, commit, publication, or cluster mutation.

Exact Lab: `lenovo-laptop`, **8/8 files, all attempt 1, no retries, exit 0**. Runner total **364** is **300 Node tests plus 64 suites**. The local focused log likewise records tests=300/suites=64/pass=300/fail=0. Lab ran seven files in its ordinary lane and the integration file in its exclusive execution lane; the committed resource manifest labels the integration file `ordinary` (primary `integration`, subsystem `cdc-metadata`). This report preserves those distinct facts without calling the test multi-process formation proof.

## Blocking findings

### B1 — Admission does not cover the full allocation lifetime (F1/F5/F6 remain partial)

1. **Ordinary continuation keys allocate before admission.** `partition-cdc-source-coverage.js:148-174` probes the next omitted row, then calls `materializeCoverageKey` at line 161 before reserving. Its potentially large key is excluded from `totalRawBytes/bytes`, so even an adequately admitted ordinary page has no charge for that cursor. D4 below reads a >16 MiB key while retained bytes are zero, then reports capacity refusal at a one-byte limit. The large-row branch correctly probes next-key bytes; the ordinary branch must use the same discipline.
2. **Successful fragment assembly releases before publication.** `cdc-coverage-fragment-consumer.js:160-172` returns a decoded row, then its `finally` releases the full consumer reservation. The caller only subsequently installs it (`cdc-complete-coverage-reconcile.js:253-277`). D2 observes a live successful decoded page with **zero charged bytes before any cache install**. Cache cloning, old/final maps and notification staging are therefore outside that lease. Source final-chunk release likewise occurs before the returned base64/frame finishes crossing the handler (`partition-cdc-coverage-transfer.js:395-402`).
3. **Expiry decrements accounting without disposing retained references.** `cdc-coverage-transfer-owner.js:58-79,140-143` deletes a session/decrements bytes on TTL, but neither clears `session.value` nor owns cancellation of the awaiting consumer/transport. The fragment coroutine retains `session`, `chunks`, `offer`, and an outstanding `readChunk`; after that await it decodes before rechecking current lifecycle/session (`fragment-consumer:137-153`). Promise racing the request deadline does not cancel those references. A successor can reuse the claimed capacity while old buffers remain live.
4. **The staging estimate is stale and exception cleanup is incomplete.** `complete-coverage-reconcile:194-218` reads publication bytes once before the network await. No top-up/current estimate is checked before cache staging; CDC may grow cover/suffix/maps while waiting. `installPage` throwing skips the releases/cancel below it because there is no enclosing `finally`. The cache's planted-clone-failure test calls the cache directly, so it cannot prove transfer-lease release on that path.

Keep each charge until its last corresponding live copy is retired or handed off under an owned reservation; revalidate/top-up immediately before staging; put releases behind exact-session, exception-safe cleanup. No capacity increase fixes these accounting gaps.

### B2 — The actual authoritative read flow still performs an unbounded local full read

`cdc-integration-service-authoritative-read-flow.js:229-277,458-514` **always** awaits `readLocalAuthoritativeRows()` before honoring `OWNER_RPC_REQUIRED`. The local routing owner selects hosted replicas even when `localReadConsistency` is null (`cdc-integration-service-local-system-table-routing.js:153-181`); `executeLocalQuery` ultimately uses SQLite `.all()` (`partition-service-write-metrics-base.js:169-195`, also `partition-statement-admission.js:420-425`). Coverage query options, chunk ordinal and lease are absent from that local call.

D9 observed **one local full read and one owner-RPC read** for one coverage `OWNER_RPC_REQUIRED` request. On a hosted recipient, every PAGE, CHUNK and CANCEL can re-read/materialize the whole table before the bounded owner route; descriptor reads also traverse this preliminary path. The new integration deliberately has no hosted recipient source, so it cannot expose this bypass. These unchanged adjacent modules are a live dependency of the changed interaction, not a reason to waive the admission contract. Required-owner coverage reads must avoid that preliminary local materialization through the existing read owner.

### B3 — Replaying an identical nonempty cell falsely conflicts

`system-table-cache-cdc-cover.js:153-165` tests an incoming absence atom's overlap by converting it to a closed-lower interval. It drops `lowerOpen`. Thus the absence gap *after* key `a` is considered to overlap the existing key atom `a` at the same N, and different atom kinds produce `CONFLICT`.

D3 uses an actual SQLite source COMPLETE page: first install succeeds, the **identical same object** installed again returns `prefix-conflict`. This makes ordinary same-N recapture/late-answer recovery fail without any contradictory bytes. `test/cache/system-table-cache-cdc-source-order.test.js:298-309` increments N on every iteration and does not assert each result; it is not the required same-N/same-bytes positive. Preserve open endpoints during overlap and pair exact replay with genuine row-vs-absence contradiction.

### B4 — Malformed rows and noHandler can become successful absence

`cdc-complete-coverage-reconcile.js:52-59` accepts ACK plus a recognized state without checking `noHandler`, and `preserveCoverageHandlerResponse` converts **every non-array/missing rows field to `[]`**. The downstream exact COMPLETE check sees an array, and the cache can install its empty observation. The general owner-RPC normalizer's malformed-row rejection cannot help because the coverage callback has already erased the malformed fact.

D7 and D8 use a genuine empty COMPLETE receipt from the production SQLite source, its exact binding/witness/digest, and the actual callbacks supplied by production `readOptions`. Replacing `rows` with `null`, or adding `noHandler:true`, both return `state:complete, success:true` and remove a prior cache row. These are plain malformed response data, with no global-intrinsic or host rewrite. Require canonical transport success and the operation-specific complete shape before normalization; preserve missing/non-array data as refusal. OFFER/CHUNK may need a separate explicit rowless result shape, not fabricated COMPLETE rows.

### B5 — A foreign chunk request deletes the authentic source session

`partition-cdc-coverage-transfer.js:376-384` combines missing session, mismatched binding, stale source and expiry in one condition, then releases any found session. An invalid request containing a live transfer ID but a different request/target tuple destroys the held transfer. D1 creates a real source offer, sends a different `requestId`, and observes sessions **1 → 0** with `session_missing`. A failed exact-identity comparison is not retirement authority. Separate invalid contender refusal from authenticated expiry/owner retirement; retain the legitimate session and prove its next valid chunk succeeds.

### B6 — Valid control-character TEXT is permanently refused by the ordinary-page bound

`peakReservation` uses `rawBytes + fixed framing` (`partition-cdc-coverage-transfer.js:211-219`), while ordinary pages compare **JSON-escaped** row bytes with that bound (`partition-cdc-source-coverage.js:197-200`). D5 sets a valid SQLite TEXT field to 1,000 NUL characters; production returns `cdc_coverage_row_codec_unsupported`, despite adequate capacity. The tagged large-row encoder is not selected because the raw-bound estimate is small. Increasing capacity does not release this false unsupported state. Account the actual ordinary wire codec's worst-case escape expansion, or use the owned lossless codec consistently; retain a valid NUL/control-character positive exceeding fixed framing slack.

### B7 — Callers replenish the operation window; source discovery does not consume the same recovery contract

`cdc-integration-service-authoritative-catchup.js:24-50` drops an absolute caller `deadlineMs` and creates a fresh window for each sequential table. `arm/startGeneration` captures `now + windowMs` (`reconcile-owner:292-332`). D10 shows a caller deadline of 1050 ignored, then the second table starts at 1100 with a fresh window. The default 22-table invocation can serialize **22 × 30 s = 660 s**, with earlier debts already retrying in the background. Existing membership callers await this helper and still supply the now-ignored one-attempt option (`membership-publication-coordinator-reconcile.js:431-439,462-463`); that changes their progression latency materially.

The source-side newly added A/P/B gateway acquisition uses BACKGROUND and no `PRIORITY_RECOVERY_BOOTSTRAP` token (`partition-cdc-source-coverage.js:239-268`), unlike the recipient's canonical CRITICAL recovery descriptor reads (`cdc-source-scope-reconciliation.js:44-52,81-86`). The live query bootstrap exception requires that explicit token (`query-executor-priority-recovery-bootstrap-routing.js:81-89`). Its integration has preinstalled healthy routes; it does not prove cold-source discovery can proceed while those views need repair.

Source A/P/B follow-up reads clamp an already-expired remainder up to 1 ms and do not check deadline after each await. `currentMatches` can bypass reacquisition even with an expired request; ordinary PAGE has no expired-binding rejection before capture (`source-coverage:253-310,337-373`). The recipient fence prevents a normal expired generation from publishing, but cannot bound or authorize this extra source work. Capture/propagate the actual caller window, preserve one bounded background-generation policy after it, and consume canonical recovery authority at both descriptor readers.

### B8 — Replacement loses debt; shared-pool release does not wake its consumers

- `setSystemTableCache` and `setCacheMutationTarget` retire the lifecycle/debts and register only a new token (`cdc-integration-service-lifecycle.js:37-63`). They do not re-arm the replacement's outstanding table work. D12 replaces the mutation target while debt exists, then invokes the production router setter: debt is empty, attempts unchanged and no timer remains. The accepted round-three contract explicitly requires replacement debt to be armed after fencing. The existing lifecycle tests establish old-callback refusal, not replacement progress.
- `releaseSession` invokes only that endpoint owner's `wakeCallbacks` (`transfer-owner:76-79`), although admission counters are node-wide. D11 releases a source endpoint's lease on the same node as a waiting recipient: the recipient stays at one attempt with only its cooldown armed. The retained positive uses the **same service object** for reservation and reconcile (`coverage-reconcile-owner.test.js:137-155`), missing the actual shared-owner case.
- The router setter is a dependency-installation event, not a connection/handler-ready event. No route/handler/partition-status listener is registered by this owner; ordinary recovery relies on cache notifications or cooldown. A guaranteed cooldown is useful, but does not prove the promised canonical release hooks. Wire the actual relevant releases into the existing coalesced owner; retain timer fallback and the same identity/counters.

### B9 — Spent diagnostics and folding do not meet the named owner contract

`reportDebt` (`cdc-coverage-reconcile-owner.js:72-88`) hardcodes `elapsedMs:windowMs`, including early shutdown, and omits target lifecycle, pages/chunks, source/transfer identity and retained bytes. It includes ever-changing attempts/generation in the fold fingerprint; `WaitBoundSpentReporter` folds only unchanged observations (`logging/wait-bound-spent.js:29-37,255-258`). Consequently persistent identical failure logs every generation, not first/powers-of-two/ten-minute folding specified by the accepted design. At capped cooldown this is about one record/minute/table, up to 22/minute, plus shutdown; explicit wakes can shorten the interval. Transfer diagnostics now expose held identities, but retirement removes them before a complete final report. Report actual elapsed/held facts and use the prescribed bounded folding key/counters.

### B10 — The correction evidence does not establish the declared complete workflow

`P/semantic-red-correction.md` is a correspondence table, **not an executed semantic-negative treatment**. The packet has no treatment source fingerprint/patch/run at final witness bodies. Prior F1/F4/F6 have concrete rejected-source diagnostics in the independently retained rejection; F2/F3/F7 were source reachability/fixture findings, and F5 was the observed decoder ordering. Those are useful counterexamples, but do not replace the specified full treatment/correction artifacts.

The new integration uses real recipient QueryExecutor, both routers, gateway and partition handler method, but a hand-built source object with a stub `CORE_OK`/leader port, scripted TABLES/PARTITIONS handlers, one shared/preseeded route cache, and an in-process query-message-group adapter. It directly calls the production hydration method; it does not execute normal seed/join orchestration, durable rejoin/history pruning, source-not-hosted route recovery, consumer restart, real COMMIT/ACK interleaving, or a backlog of retained events. Its row assertion is **length equality**, not byte equality, and it does not count publications (`integration test:171-184`). The separate >16 MiB component test provides stronger single-publication/content checks, but cannot promote this integration to those missing workflows.

The 1,030-line hydration-test rewrite removed both obsolete row-repair mechanics and still-required refusal/recovery checks. In particular the former non-array success refusal (`rejected test:471-504`) is not replaced at the real new callback boundary, and B4 demonstrates why that invariant remains necessary. Former concurrent same-key/delete tests need corresponding provenance/suffix-path coverage, not deletion by test-count comparison. Existing source-order tests do preserve important suffix UPSERT/DELETE, atomic clone-failure, stale/higher-N overlap and valid empty-cell properties. The missing exact same-N positive is B3.

The registry now lists live endpoints and eight witnesses. `test/shards/impact-graph-seal.json` also changed and exists in the proof snapshot, but is absent from the 44-path manifest. Its snapshot and W SHA256 are both `13f1b6ea38768d5f09e7e94969bf106458ec63f58dfd5483606f538d894891d1`. Include this generated artifact in the final review/landing provenance; it is not another production authority. Whole-repository guideline red (294 findings reported outside the targeted set) remains unwaived.

## Targeted diagnostic observations on exact corrected source

These are read-only inline Node diagnostics using in-memory SQLite/real source and cache owners, or the named substituted boundary. No source mutant or diagnostic file was written. The first cursor-probe setup accidentally reused NODES' unique address; that setup failure is excluded. D4 is its successful isolated rerun with a distinct address.

| ID | Construction and exact relevant observation |
| --- | --- |
| D1 | Real `captureLargeCoverageRow`, then same transfer/different request ID through `handleCoverageTransferRequest`: `offer`, sessions `1`, refused `cdc_coverage_transfer_session_missing`, sessions `0`. |
| D2 | Real offer/chunks into `consumeCdcCoverageOffer`; returned `success:true, rows:1`, `retainedBeforeAnyCacheInstall:0`. |
| D3 | Real SQLite NODES page at applied index `7`; first cache install `{installed:true,rows:1,changes:1}`, identical second install `{installed:false,reason:'prefix-conflict'}`. |
| D4 | First row small, omitted next key `z` repeated `16*1024*1024+4096`; instrument only SQLite key-get observation: retained bytes `0` when key materializes, then `cdc_coverage_capacity_unavailable`, configured capacity `1`. |
| D5 | Same supported SQLite schema, `node_address=String.fromCharCode(0).repeat(1000)` (actual NUL bytes): `state:refused`, `reason:cdc_coverage_row_codec_unsupported`, no capacity shortage. |
| D7 | Genuine source empty observation, mutate raw `rows:null`, call the actual success/result callbacks supplied by reconcile readOptions: result `complete,true`; preexisting cache row removed. |
| D8 | Same construction with `noHandler:true`: result `complete,true`; preexisting cache row removed. |
| D9 | Actual `executeAuthoritativeSystemTableRead` with canonical coverage read authority and a hosted provider; local read/owner-RPC seams record `localReads:1, ownerReads:1`. Actual local SQL implementation is `.all()`, cited in B2. |
| D10 | Virtual start `1000`, two tables, caller deadline `1050`, window `100`: at `1050` first debt still in flight; at `1100` second table starts with a new in-flight generation while first is on cooldown. |
| D11 | Two endpoints sharing one node; recipient spent 99-ms window, source releases lease: recipient `attempts:1`, `cooldownArmed:true`, no immediate wake. |
| D12 | Replace that recipient's mutation target, then call `setMessageRouter`: `attempts:1, diagnostics:[], timers:0`. |

## Category-complete checklist (63 items)

PASS is bounded to the stated evidence; PARTIAL records a useful mechanism with a named ceiling. FAIL refers to the findings above. No arbitrary trusted-host intrinsic rewrite is required by this review.

| Item | Status and concrete evidence |
| --- | --- |
| A1 | FAIL B1/B2. Ordinary rows gained a lease (`source-coverage:170-189`), but next key, preliminary local full reads and post-fragment publication escape it; D2/D4/D9. |
| A2 | PARTIAL. Explicit deferred capacity/session and terminal identity/digest shapes exist (`fragment-consumer:45-51`, transfer `:274-276`); B4 fabricates valid empty data and B6 misclassifies supported bytes. |
| A3 | FAIL B7/D10. Per-generation deadline is frozen, but hydration discards caller deadline and replenishes per table; source follow-ups clamp expired remainder to 1. |
| A4 | FAIL B4/B5. Coverage response callback accepts noHandler and normalizes malformed rows; foreign chunk binding incorrectly authorizes release. |
| A5 | FAIL B8. Same-endpoint release/cache setter tests pass; cross-endpoint release D11 and target replacement D12 do not wake/rearm correct debt. |
| A6 | FAIL B1/B7. Target token checks exist (`complete-reconcile:163-168,232-235`), but staging-byte facts are captured before awaits, fragment decode follows await without recheck, source deadline checks are incomplete. |
| A7 | PARTIAL B9. `transfer-owner:199-232` adds held transfer/table/partition/target/generation/bytes; spent/retirement reports omit several of those facts and actual elapsed time. |
| Y1 | FAIL B8. Normal joining path now calls the canonical helper (`joining-readiness:585-623`); replacement drops debt and some real release events never reach it. |
| Y2 | PARTIAL/B7. `runGeneration:237-258` races a frozen deadline; caller propagation and downstream source deadline consumption still fail. |
| Y3 | PARTIAL B9. COMPLETE/FAILED/RETIRED/SPENT are explicit; shutdown/spent report, but FAILED is retained without cooldown and shutdown diagnostics lack exact held bytes. |
| Y4 | FAIL B7/B8. Source gateway omits priority recovery token; route fixture is already hydrated; target replacement has no progress tick. |
| Y5 | PARTIAL. One in-flight/key; retries 100–1000 ms, at most about 300 starts/30-s generation, 1–30-s cooldown; eight pool sessions. B7 serializes table windows, B9 folding differs, and public arming has no 22-key admission bound (`reconcile-owner:304-332`). |
| Y6 | FAIL B3/B5. Exact duplicate nonempty cell falsely conflicts; mismatched chunk can erase live source session. |
| Y7 | PARTIAL. Only semantic COMPLETE resets spent count (`reconcile-owner:205-209`); B4 permits invalid semantic completion. ACK alone without a recognized state does not advance. |
| T1 | FAIL B4/D8. Production callback checks ACK/state, not canonical delivered/noHandler status (`complete-reconcile:52-59`); failure normalizer alone is insufficient. |
| T2 | FAIL B5/B1. Target token fences normal late publication; foreign request releases authentic source state and late chunk resumes allocation after TTL. |
| T3 | PARTIAL. Failure normalizer classifies connection/noHandler/timeout and clamps retry (`complete-reconcile:133-161`; reconciliation test:322); valid-shape success path bypass is B4. |
| T4 | PARTIAL/B7. Recipient generation bounds waiting, but local `.all()` and uncancelled source follow-ups are not bounded by that wait. |
| T5 | PARTIAL. Integration uses two registered routers and real QueryExecutor; query-message-group adapter directly calls source router, metadata/consensus source are scripted; B10. |
| S1 | PASS bounded. Deadline/backoff/cooldown and session timers use injected clocks and `.unref()` (`reconcile-owner:153-172,267-272`, `transfer-owner:140-143`); retained process-exit status 0. |
| S2 | PARTIAL. Source `CORE_OK`, incarnation, leader and same-view applied N are checked (`source-coverage:92-111,351-384`); source current/deadline after-await gaps are B7. No timer itself certifies rows. |
| S3 | FAIL B8, with ceiling. Shutdown clears volatile owners; replacement fails to reconstruct debt. Durable original-event obligations/restart are separate and unproved by C17. |
| S4 | FAIL B1/B7. Legitimate slow transfer is capped by TTL, but expiry drops accounting before work/references end; caller-wide window is not inherited. |
| S5 | PARTIAL/B7. Recipient descriptor authority uses recovery routing; newly remote source reacquisition omits it. Preseeded integration cannot prove recovery while source routing/readiness is degraded. |
| R1 | PARTIAL. Active source writes: core-base `:95-100`, witnessed installer `coverage-methods:18-32`; transfers: reserve/set/release/chunk/cancel/retire owner; cache: record/apply suffix and `installCompleteCdcCoverage:511-537` stage/swap rows/tombstones/revisions/cover. B1/B3/B5/B8 break associated lifetime/replay protections. |
| R2 | PARTIAL. Scope digest/epoch and source incarnation/target token distinguish generations; newly witnessed source scope uses actual gateway. Replacement debt and cold-source reachability remain B8/B7. |
| R3 | FAIL B4. Valid empty-cell coverage exists in cache tests; malformed/non-array PAGE can be rewritten to that empty shape. |
| R4 | FAIL B3/B5. Interrupted large transfer recaptures under a new ID in integration; same-N nonempty replay is a false terminal conflict and a foreign request releases authentic state. |
| R5 | FAIL B4/D7. Missing/unreadable descriptors defer, but malformed rows can become empty successful absence and delete old rows. |
| C1 | FAIL B1/B2. Synchronous shared pool reserve is real; not all allocations traverse it. Source authority is not an allocation backstop for preliminary local SQL. |
| C2 | FAIL B1/B7. Byte estimate and decode freshness are not revalidated after network awaits; source post-deadline work remains possible. |
| C3 | PARTIAL. Debt single-flight and synchronous cache swap provide one normal publisher; B1 releases its reservation before that publication and B3 fails replay. |
| C4 | FAIL B8/B1. Lifecycle retirement fences ordinary callbacks, but replacement has no rearm; endpoint-local release wakes and in-flight expiry leave holes. |
| C5 | PARTIAL. Pool key uses node ID (`transfer-owner:31-34`), endpoint limits share min counters; request tuple/opaque transfer IDs exist. Shared ownership does not imply shared wake (D11), and mismatched tuple retirement is B5. |
| F1 | PARTIAL. Joining/membership → catch-up → recipient TABLES/PARTITIONS/TABLES → page; source may repeat A/P/B through gateway. Hidden preliminary local read is B2; source recovery authority differs in B7. |
| F2 | FAIL B7/B8. No hosted source is supported in routed fixture, but its routes/metadata are preseeded; cold source lacks declared recovery token and replacement loses armed work. |
| F3 | FAIL B7. No caller deadline is forwarded by hydration; membership's awaited bounded attempt becomes fresh 30-s generations. |
| F4 | FAIL B7/B10. No measured discovery+capture+chunks+publish+visibility whole-client window; 22 sequential default windows can reach 660 s. Backlog/COMMIT/ACK interleaving remains unproved. |
| F5 | FAIL B2. Semantic owner-RPC result remains required, but a raw/unbounded local read still executes first. No new durable scope store was added. |
| H1 | FAIL B10. F1/F4/F6 have prior measured counterexamples; correspondence table is not a fingerprinted executed treatment at final bodies. Current D1–D12 are corrected-source diagnostics, not invented old-source mutant runs. |
| H2 | PARTIAL. Real in-memory SQLite, cache, gateway, query and router/handler methods; source port/metadata handlers and message-group transport are doubles. Exact simplifications in integration `:113-164`. |
| H3 | PARTIAL. Virtual owner tests preserve deadline/cooldown order; integration uses a 15-s override and a keepalive. It does not measure normal 30-s startup geometry or uncancelled work memory. |
| H4 | PARTIAL. Production receipts bind request/target/lifecycle/generation/deadline; test helpers sometimes fabricate incomplete coverage and use an always-successful installer (`hydration.test:34-64`), so those assertions prove wiring only. |
| H5 | PARTIAL/B10. Real >16 MiB nonempty source and interrupted session recapture; no hosted recipient. Integration checks length, not exact content or publication count, and lacks consumer restart/backlog/concurrent real ACK work. |
| H6 | PARTIAL. Exact source/log/ledger hashes checked; eight green files are bounded component/routed evidence, not normal startup or receipt 8. |
| O1 | PASS ownership structure. Descriptor/gateway, source prefix capture, volatile transfer, reconcile and cache cover/suffix have named owners. Defects concern their interaction; no new owner is required. |
| O2 | FAIL B4/B5. Canonical PAGE/OFFER/CHUNK/CANCEL vocabulary exists, but malformed success and foreign retirement violate producer/consumer semantics. |
| O3 | FAIL B3/B10. Unsafe-refusal and recovery positives exist, but exact duplicate same-N success is absent/fails; final fingerprinted old-shortcut treatment is absent. |
| O4 | FAIL B3/B8. Same-path fragment recapture succeeds in retained test; identical source evidence after partial publication falsely conflicts, and target replacement has no live debt to release. |
| O5 | FAIL B1/B2. Pool/single-flight checks exist but omit allocation paths and copy lifetimes; repeated urgent callers cannot establish a whole-memory bound from aggregate counters alone. |
| O6 | FAIL B8. Same-service release and cache publication wake tests are valid; cross-endpoint pool release and replacement fail; no real connection/handler status registration identified. |
| O7 | PASS bounded authority distinction. Recipient cache hints do not install source scope; source newly obtains A/P/B through gateway (`source-coverage:253-310`). They remain route hints; B7 limits cold reachability. |
| O8 | PARTIAL/B10. Exact positive 44-file snapshot and Lab fingerprints retained. No final changed-source negative fingerprint/run; diagnostic outputs below are labeled current-source, not canonical positives. |
| O9 | FAIL B2. Old catch-up retry/apply loop was removed, but the live authoritative-read helper still executes preliminary local reads. Remaining public complete-scope-set method has no production caller; no proof of arbitrary split-table hydration inferred. |
| O10 | PARTIAL/B10. Registered pair now includes live startup/query/gateway/router/source/cache endpoints and eight classified witnesses (`impact-contracts:894,1794`); generated impact seal is omitted from the 44-file packet and new live adjacent read-owner dependencies must remain visible. |
| J1 | PARTIAL. Safe positive byte/chunk bounds and overflow sums exist (`transfer:73-80,232-240`); binding deadlines accept any finite number/floor (`:244-254`), generation counters are unchecked increments, and ordinary expired PAGE is B7. No arbitrary participant cap requested. |
| J2 | PARTIAL. Descriptor construction and rows inspect own data descriptors (`scope-evidence:20-63`, `domain:127-139`); coverage envelopes themselves use direct property reads and incomplete shape validation (B4). No standalone own-field envelope guarantee is proved. |
| J3 | PARTIAL. Row data descriptors are validated without invoking getters; complete/offer/chunk envelopes are read repeatedly (`fragment-consumer:53-106`, `complete-reconcile:52-130`). Transport JSON is an existing dependency; these helpers are not independently accessor-safe capture boundaries. |
| J4 | PARTIAL. Row proxies/nonplain prototypes are refused (`domain:127-132`); scope construction captures own authority fields. Receipt validators do not establish the same guarantee. No arbitrary trusted-host prototype rewrite was used as a blocker. |
| J5 | PARTIAL. Primitive row values, string digests/IDs and chunk sizes are checked; `validCoveragePrefix` regex coerces `appliedIndex` before BigInt (`source-order:317-337`) instead of pinning its canonical string type. Receipt boundary remains incompletely validated. |
| J6 | N/A for arbitrary host-intrinsic replacement. Existing canonical JSON digest owner is reused; no new isolation/global-hardening obligation inferred. Real plain-wire counterexamples B4/B5 require no such rewrite. |
| J7 | PARTIAL. Encoded length is now checked before `Buffer.from` (`fragment-consumer:92-107`), payload/observation digests checked. Prefix type coercion and ordinary JSON escape bound B6 remain; giant decimal prefix is parsed with BigInt before safe-index rejection. |
| J8 | FAIL B4/B1. Row schema validation is strict; PAGE container only uses `Array.isArray`, without dense-own/max-row/byte validation before cloning (`source-order:322-352`). Non-array gets synthesized empty; no hostile iterator or oversized container proof exists at that boundary. |

## Evidence fingerprints

All SHA256 below were checked against retained bytes; no supplied red is counted as a positive.

| Artifact | SHA256 |
| --- | --- |
| `P/proof-snapshot.json` | `ff2b2dbfc1219bc41e93ec7d955079d3e28a554e3150a4469b68622243b8a097` |
| `P/evidence-manifest.sha256` | `1101ea729396345c19622be2d3b9786623b9327a1d704cb2f6855c1836324dd2` |
| `P/verification-summary.md` | `125ffe522b9acb574bcd91f03de3dc2ba19f6170e270a9328f63f4fe6ffbeaa5` |
| `P/semantic-red-correction.md` | `4d232dec2589bddabed097327bf4a3e6eae2d1c122ce6ef2a52945b7a0e1363c` |
| `P/focused-tests.log` | `470d805520889db4bdd936bf1d480d204c28fbfbbf9c7d536c336697b49e1e4e` |
| `P/unref-process-exit.log` | `e361f06f54efa5f42842da319068e50416a6ea0831ed2cb9ef18e83d82920f93` |
| `P/impact-contracts.log` | `69f140da391c50161205f4809c1f22673107c38d6e01b4070d7254f4e2727e8a` |
| `P/shard-audit.log` | `f68f74830bd786e9bd1628fde14cb86d772a323ca9d2c676d928e7af32722721` |
| `P/targeted-guidelines.log` | `c80455ebdba978998a355555df85dfeb2dc6a9fd4685dc5f48aefe57e26cc277` |
| `P/repository-guidelines.log` | `a6388c6927f61b08b57909a006c29eee4bcf8e0cbd25f63dae45b47e4867fe1c` |
| `P/lab-receipt-3edcdbf.json` | `ac689f3566f980d6f90decb330b4d9eef361617dd7c2e8e5a9fc8c6889ae8f45` |
| `P/lab-result-3edcdbf.json` | `4e83b832af62d50843e6ac1c0c98ddf9714e26cc770dcc9017fea59397182f21` |
| `P/lab-focused-3edcdbf.log` | `ab1c2d0b38e4875588465ec4ca3dda55be661fe6a47b04b03fd6422d904b0fa6` |
| `P/lab-focused-3edcdbf.ndjson` | `78c7e35e943abd94a8bbe1b2e4100a8019993400fb3b210b2ecd5b37ccaa6322` |

No mandatory inspection capability was unavailable. The requested complete startup/original-obligation acceptance remains unproved, and the measured source defects independently require correction before C17 approval.
