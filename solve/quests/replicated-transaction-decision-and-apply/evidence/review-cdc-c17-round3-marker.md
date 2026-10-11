# C17 independent source review — round 3

Reviewer: `subagent:review_marker_correction` · 2026-10-11

## Verdict: REJECT the exact 48-path C17 subject

The revision repairs several demonstrated refusal, replay, lifetime, and wake defects. It still does not enforce the claimed whole-operation memory bound or one elapsed deadline. Seven findings below are the complete round: four correctness/resource blockers, one recovery-priority contract mismatch, one diagnostic defect, and one retained wire-validation defect. No additional broad tests, source edits, test edits, metadata edits, log edits, commits, publication, or cluster start were performed. This report is the only written file.

Scope is authoritative **cache-state coverage/hydration**, including a supported row larger than 16 MiB. This is not the durable CDC obligation ledger, original-event/lost-ACK recovery, normal `startLagrangeRuntime`/restart acceptance, activation, receipt 8, or approval of adjacent dirty dependencies. Those integration obligations remain open; their absence alone is not the reason for this bounded rejection.

## Exact subject and evidence

`W=/mnt/data/peter/projects/.worktrees/tx1-cdc-20261011`; `E` is this report's directory; `P=E/cdc-c17-round3`. Source/test paths below are relative to W.

- Base `e7c89f4b5114c0238312d3831b65889a4622f4e9`; proof snapshot **`0b2bfb2bcf0cbbc1cef69754baba5bd9db5986e2`**, tree **`a8d298d8070d9b913990b58000024908210de67a`**. Independently compared every manifest entry against both W and `git show` of the snapshot: **48/48, zero mismatches**.
- `P/source-manifest.sha256`: **`04056353c157b98a695b407a085ffa1adcc54838c98326a81b3c07ea7cabd093`**. It now includes the three adjacent authoritative-read owners and generated impact seal missing from the prior packet.
- `P/evidence-manifest.sha256`: **`078cd1dd477dcabed223bef4012535a22dde784635d22121bd6583e2d7c8c341`**; all 14 listed artifacts matched.
- Accepted design `solve/quests/replicated-transaction-decision-and-apply/cdc-continuation-20261011.md`: **`d6a6017acaa0cedfd42a388a4f2e89724291d36c37d5f50c9034038e0d79a3bf`**. Prior round-two report `E/review-cdc-c17-round2-marker.md`: **`37cc3c688fdb1ac477a6a8bef0f6bee43480b39992a66bf3f3610f5bbbcc6d8c`**; rejected source `3edcdbf04b7d5e063a5be53cd14448f030c4b60a`.
- Followed AGENTS → rules → router, relevant runtime/authority-and-recovery owners, applicable verification templates, accepted design, previous B1–B10/D1–D12, scoped diffs, and adjacent consumers.

**Exact locked Lab is green:** actual inventory machine `lenovo-laptop`; 8 files, every attempt 1, no `retriedOnce`, all successful. The ledger sums **435 runner entries = 356 tests + 79 suites**; author log has 356 pass/0 fail. The initial `lenovo` shorthand placement failed before tests; it is neither a semantic red nor a retry of a failed test. No whole-eight-file rerun was performed by this reviewer.

| Retained artifact | SHA256 |
| --- | --- |
| `P/focused-tests.log` | `62480bb5a731ad7df4c19d8cd728db85d62db6fc341cbb5436a7cab906337f7b` |
| `P/semantic-red-correction.md` | `547269cba242ac6baadcc4dc63e9c834a28b05a4832a6f6e98a05c837634efad` |
| `P/verification-summary.md` | `1f73631b7e179833b773b4623f5e34d69312708ba90b7cbc5f7cb4000b84d752` |
| `P/commands.md` | `e8cdbee5ef907fd74aa964bcc4996e1518e4af9efb8c701bc687e5c67d5519b3` |
| `P/lab-result-0b2bfb2-lenovo-laptop.log` | `838079df6e3290ed398325599520bc4db865813899490481251a718d744188df` |
| `P/lab-focused-0b2bfb2.ndjson` | `9aaf13d5c3aa8fe255465b3b2ca5bd4e674cecca14f403e6b5386c0720b6b6db` |
| Initial placement-only `P/lab-result-0b2bfb2.json` | `4493b7ebddc52f3696b600f4075c68b6eff8517a0bfa6e7d09096ef6974c64f9` |

## Findings

### R3-1 — Counters still understate live cursor, serialization, and transport memory

**Blocking; admission/concurrency/lifetime/wire.** Moving `materializeCoverageKey` after reservation fixes the old zero-charge allocation, but its charge is still only raw key bytes. `src/partition/partition-cdc-source-coverage.js:175-187` adds the omitted key to `totalRawBytes`, not the encoded-byte estimate. `sourcePageReservationBytes` (`src/partition/partition-cdc-coverage-transfer.js:230`) charges two raw copies plus two encoded *row* bounds. The cursor appears in both `logicalCoverage.upper` and `nextPageStart` (`source-coverage:431-456`), and both are JSON escaped in the real router response. There is no bounded chunk representation for this potentially large continuation envelope.

Q1 used actual SQLite, the production source owner, one small row followed by a valid TEXT key containing 3 MiB of NUL bytes, and an 8 MiB configured pool. It returned COMPLETE with **7,868,236 charged bytes**, yet **37,750,530 serialized response bytes**. The schema/domain explicitly supports NUL/BINARY keys (`partition` test:653). Scaling the same admitted shape to a 12 MiB NUL cursor gives at least 144 MiB for its two JSON field values alone, while the source reservation is about 25.5 MiB; therefore this also refutes the default aggregate 128 MiB claim, not merely a custom-limit claim.

The large-row branch has the same escape-expansion problem in another allocation: `observationForOffer` (`transfer:287-299`) digests canonical JSON `{key,row}`, although `peakReservation` (`:211-219`) bounds raw/tagged bytes. Q3 admitted a 3 MiB NUL TEXT value as an OFFER: payload 3,145,877 bytes, charge 14,159,288, **one canonical row serialization 18,874,869 bytes**. The tagged codec's lossless support does not remove the JSON serialization used for its observation digest. The recipient repeats that digest and compares serialized rows (`src/cache/system-table-cache-cdc-source-order.js:349-356,445-455`); a `6 * taggedPayload` formula is not a demonstrated bound for all those simultaneously reachable copies.

Lifetime is also only partly repaired. `releaseSession` clears owned chunk arrays/value, which correctly fences late fragment decoding, but source ordinary-page rows/cursors and returned base64 response frames are not owned by that value (`source-coverage:195`, transfer `:399-409`). Q2 retains the actual COMPLETE response, advances its TTL, and observes **zero charge while the response still contains its row and 3,145,729-byte cursor**. This observation by itself is a retained-response diagnostic, not a measured production socket stall. Production reachability is explicit: `message-router-inbound-dispatch.js:471-480` hands the response to `sendRaw`; `message-router-delivery-behaviors.js:698-701` calls `ws.send(JSON.stringify(message))` without a CDC lease/flush completion handoff. A queued frame may outlive the source TTL or authenticated cancel. The new owner-held-reference test does not cover this copy.

Required correction: account actual canonical cursor/observation/frame sizes before allocation, bind each live copy to a lease through its last owning consumer/transport handoff, and validate the ordinary PAGE byte envelope before cache cloning. Do not solve this by increasing limits or by classifying supported control-character TEXT as unsupported. Eight admitted sessions are a count cap, not a proof that aggregate live bytes stay below 128 MiB. These concerns are cache hydration resources; they do not assert anything about the separate durable event backlog reader.

### R3-2 — A colocated source cannot reach an affordable OFFER

**Blocking; progress/admission.** `src/cdc/cdc-complete-coverage-reconcile.js:220-226` reserves a fixed **102,236,160-byte** recipient PAGE lease before asking the source whether this is a large row. It releases that lease only after an OFFER arrives (`:249-252`). A colocated source shares the same pool and must reserve its own complete capture before it can return that OFFER.

Q4 used one real 8 MiB ASCII SQLite row and two endpoints with the same node ID. At the default 134,217,728-byte cap, source PAGE returned `cdc_coverage_capacity_unavailable`. After releasing only the initial recipient PAGE lease, the same source produced a valid OFFER requiring **35,130,808 source bytes**; its actual consumer formula is **51,905,406 bytes**. Their sum **87,036,214** fits the existing cap. Retrying the production order recreates the unnecessarily large initial reservation, so no amount of ordinary release/retry progress fixes that request. The remote-node >16 MiB positive and the small synthetic colocated-counter test do not exercise this schedule.

Required correction: use the existing owner interaction to acquire the information/leases in an order that can admit the actual combined operation, while preserving admission before allocation. Pair a real colocated source/recipient success with capacity refusal; no local full-read fallback or limit increase.

### R3-3 — The normal multi-table caller still creates one window per table

**Blocking; bounded operation/retry.** `src/cdc/cdc-integration-service-authoritative-catchup.js:29-37` now forwards a supplied absolute deadline. It still does not capture one when absent. The normal joining helper calls it without options (`src/bootstrap/node-joining-ready-signal-readiness.js:599-601`); the membership repair caller also supplies no deadline (`src/control-plane/membership-publication-coordinator-reconcile.js:431-439`). `startGeneration` (`src/cdc/cdc-coverage-reconcile-owner.js:324-334`) consequently captures `now + windowMs` separately for each table.

Q6 compared the real hydration owner with two tables and a 100-ms virtual window. Without `deadlineMs`, at t=1100 the first table had spent its t=1000 window, but the second had just issued a new descriptor read with timeout=100; the caller was unfinished. With one explicit deadline=1100, the same caller finished at t=1100 and the second table issued no read. This is the existing API/caller defect, not a demand for future complete runtime-startup proof. The default 22-table invocation can still serialize 22 × 30 seconds while earlier debts retry in the background.

Required correction: capture/inherit the operation deadline at the canonical multi-table call, forward it to all table generations and existing callers, and retain the separately declared bounded background-generation policy after that invocation settles. The current test at hydration:121 proves only the explicitly supplied case.

### R3-4 — Ordinary publication can succeed after its absolute deadline

**Blocking; after-await/expiry.** After the PAGE await, `src/cdc/cdc-complete-coverage-reconcile.js:245` checks only lifecycle. `installPage:176-180` also checks only lifecycle. The lease resize checks session identity, not wall-clock expiry, and `generationIsCurrent` does not test elapsed time (`reconcile-owner:166-170`). Expiration relies on a timer callback getting a turn.

Q7 used real Date.now/setTimeout, actual SQLite and cache owners, a 120-ms absolute invocation, and a synchronous PAGE-boundary stall until deadline+5 ms. This models the ordinary event-loop ordering of synchronous decode/serialization/SQLite work; no timer was disabled or monkey-patched. The source had captured the page while still in time. The resumed microtask installed the row **7 ms after the deadline**, reported `tablesHydrated:1`, and **removed the debt** before the overdue timeout callback ran. The fragment loop's new post-await remaining-time checks do not protect ordinary PAGE publication, and its final concatenate/decode/publication stage also needs a final elapsed fence.

Required correction: consume the same absolute clock at the actual publication/semantic-completion decision, including after synchronous expensive work; an overdue timer is not fresh permission. Keep the debt and refuse late completion. Existing timer-first virtual controls remain valuable but do not cover this schedule.

### R3-5 — Source descriptor recovery still uses BACKGROUND pressure/delivery class

**Recovery contract mismatch; source-grounded, not a claimed measured deadlock.** `src/partition/partition-cdc-source-coverage.js:263-271` now includes the required recovery-routing token, but sets both `workClass` and `deliveryPriority` to BACKGROUND. The accepted design at lines 300-304 explicitly gives A/P/B discovery CRITICAL class under the same deadline; recipient descriptor acquisition does so (`src/cdc/cdc-source-scope-reconciliation.js:81-85`). The routing token is sufficient for the existing query readiness exception (`query-executor-priority-recovery-bootstrap-routing.js:75-90`); it does not itself change pressure class.

The corrected source test (`partition` test:538-579) checks token and timeout, not these two classes. Consume the same canonical discovery class on the source, or obtain an explicit owner-contract amendment with the bounded degraded-pressure witness. Data transfer itself remains under ordinary bulk/background pressure; this finding does not authorize a pressure bypass.

### R3-6 — Shared-pool diagnostics omit the endpoint actually holding capacity

**Diagnostic defect.** `src/cdc/cdc-coverage-transfer-owner.js:231-248` reports pool-wide counts/bytes but builds `held` from only the requesting endpoint's sessions. Q8 reserved 4096 bytes at one source endpoint, created/released the recipient endpoint's own lease, then read recipient diagnostics: `sessions:1`, `retainedBytes:4096`, **`held:[]`**. `reportDebt` forwards precisely this incomplete held list (`reconcile-owner:74-97`). It cannot name the source table/partition/target/generation responsible for a node-wide capacity hold.

The new actual-elapsed and powers-of-two folding fixes are valid. Extend the existing shared owner observation to identify its actual held sessions; do not add a second authority or ledger. The present test uses a fabricated attempt containing transfer/scope IDs and does not exercise a different endpoint's hold.

### R3-7 — Canonical prefix type remains coercive at the accepted wire/cache boundary

**Retained validation defect, already called out as a dependency in round two.** The accepted design says N travels as canonical decimal text (line 386); the durable store produces that type. `src/cache/system-table-cache-cdc-source-order.js:317-337` regex-tests the value without a primitive-string check, then calls BigInt before bounding its decimal length. Q9 supplied a coherent plain-data receipt with numeric `appliedIndex:7` and its matching canonical observation digest: cache install succeeded, just as the canonical string `"7"` control did. This uses ordinary JSON-representable values, not hostile host intrinsics.

Pin and bound this field before regex/BigInt/digest admission using the existing canonical boundary. The broader own-data/accessor protections remain uneven on envelope fields (`complete-reconcile:54-74,104-138`, `fragment-consumer:53-106`), whereas descriptors and rows have strict guards. Those direct helper boundaries must not be advertised as accessor/prototype-independent; transport JSON provenance is an explicit dependency. No arbitrary trusted-host rewrite or new global hardening standard is required here.

## Prior findings and retained negative treatment

`P/semantic-red-correction.md` is accurately a mapping from actual prior reviewer diagnostics to executed correction tests. It is **not** an old-source/new-final-test A/B mutant run. Prior exact-source observations are usable controls with that ceiling; none is counted in the positive Lab population. Current Q diagnostics are on 0b2bfb2, not mislabeled predecessor reds.

| Prior finding / diagnostic | Current disposition and exact discriminator |
| --- | --- |
| B1 / D2,D4 | Partial. Key materialization now follows reserve (partition test:171); source final chunk remains charged (:227); fragment handoff retains charge (`fragment-consumer:171-190`); expiry clears owned chunks (lifecycle test:93); top-up and throw cleanup tests (:111; reconciliation:413). R3-1/R3-2/R3-4 retain whole-lifetime/bound failures. |
| B2 / D9 | Fixed required-owner local full-read bypass. `authoritative-read-flow:510-515`; reconciliation test:119 traverses actual read owner with hosted local seam and sees no local read. |
| B3 / D3 | Fixed open lower-bound replay overlap (`cache-cdc-cover:156-163`). Cache tests:396 exact nonempty same-N replay succeeds without changes; :382 contradictory row/absence fails. |
| B4 / D7,D8 | Fixed non-array/noHandler normalization. Reconciliation test:356 checks both refusals preserve old row; `complete-reconcile:54-74`. Q5 additionally refuses a genuine first-page receipt with only its continuation falsified. |
| B5 / D1 | Fixed foreign retirement. Transfer:385-397 separates failed binding from authenticated stale retirement; partition test:267 proves next exact chunk usable. |
| B6 / D5 | Fixed small ordinary NUL TEXT false rejection (partition test:675; ordinary bound transfer:222-227). Large/cursor serialization accounting remains R3-1. |
| B7 / D10 | Explicit caller deadline and source after-await fences fixed (hydration test:121; partition:582). Normal/default caller, wall-time publication, and source discovery pressure remain R3-3/R3-4/R3-5. |
| B8 / D11,D12 | Cross-endpoint pool wake, replacement rearm, connection event hooks fixed for installed routes. Owner tests:162,207,231; lifecycle:41-80; event-delegates:18-36. Production bootstrap setup calls the route setter (`src/bootstrap/shared/cdc-integration-setup.js:114,201,272`). Constructor-only router injection alone does not install that listener; existing setup is the dependency. |
| B9 | Actual elapsed and power-of-two/ten-minute cadence fixed (`reconcile-owner:74-108`, owner test:254). Pool-wide held identity remains R3-6. |
| B10 | Exact bytes/publication count added to routed integration:192-204; all48 provenance includes seal. Old test deletions now have replacements for malformed/noHandler and same-N replay, alongside preserved suffix, atomicity, stale-scope, and valid-empty tests. Complete startup/original-obligation acceptance remains a named future obligation, not this round's blocker. |

The prior diagnostic sequence has D1–D5 and D7–D12; there was no D6 semantic diagnostic. Its accidental first cursor-fixture unique-address setup failure remains excluded.

## Independent diagnostic record on this exact subject

Read-only inline Node programs; in-memory SQLite/real named owners, with substituted boundaries stated below. No diagnostic files or source mutants were written. These are semantic observations, not extra canonical Lab tests.

| ID | Observation / fidelity |
| --- | --- |
| Q1 | Real source + SQLite small row and 3 MiB NUL next key: COMPLETE/1 row; charged 7,868,236, configured 8,388,608, serialized receipt 37,750,530. |
| Q2 | Same retained actual receipt after virtual source TTL: charge 0, live cursor bytes 3,145,729, row still present. Socket-stall reachability is the separate source trace cited in R3-1; this is not a measured live-network stall. |
| Q3 | Real large-row capture with 3 MiB NUL non-key TEXT: OFFER payload 3,145,877, source charge 14,159,288, canonical row JSON 18,874,869. |
| Q4 | Two actual pool endpoints on one node; 8 MiB ASCII source row. Fixed initial recipient reserve 102,236,160 prevents source OFFER; release yields OFFER/source 35,130,808 and actual consumer 51,905,406, combined 87,036,214 <134,217,728. Production reservation order/formulas, not full router fixture. |
| Q5 | Real SQLite 257 rows, production source PAGE and actual recipient callbacks/cache; metadata A/P/B substituted with complete witnessed records. Wrong `nextPageStart:null` on first partial page: refused, zero installed, debt retained. Unchanged control: 2 PAGE calls, 257 exact rows present, final row present, debt cleared. This falsifies the suspected cursor-completion bug; no such finding is reported. |
| Q6 | Real multi-table hydration with nonsettling descriptor seam + virtual clock: default second table starts at t=1100 with fresh timeout100; explicit-deadline control completes then with no second read. |
| Q7 | Real clock/timers/source/cache with PAGE-boundary synchronous stall; 120-ms request installs at deadline+7ms, reports hydrated, debt empty. No artificial timer cancellation. |
| Q8 | Shared node endpoints: recipient observes one 4096-byte held session, but held identity list empty. |
| Q9 | Canonical-shape cache receipts with complete row/scope/digest: numeric N=7 and text N="7" both install. Direct cache boundary; no claim that the current source producer emits the numeric variant. |

## Evidence key for the 63-item checklist

- SC = `src/partition/partition-cdc-source-coverage.js`; ST = `src/partition/partition-cdc-coverage-transfer.js`.
- PO = `src/cdc/cdc-coverage-transfer-owner.js`; FC = `src/cdc/cdc-coverage-fragment-consumer.js`; RC = `src/cdc/cdc-complete-coverage-reconcile.js`; RO = `src/cdc/cdc-coverage-reconcile-owner.js`.
- CO = `src/cache/system-table-cache-cdc-source-order.js`; CV = `src/cache/system-table-cache-cdc-cover.js`; DOM = `src/cdc/cdc-coverage-domain.js`.
- SS = `src/cdc/cdc-source-scope-reconciliation.js`; AR = `src/cdc/cdc-integration-service-authoritative-read-flow.js`; CT = `src/cdc/cdc-integration-service-authoritative-catchup.js`.
- LC = `src/cdc/cdc-integration-service-lifecycle.js`; EV = `src/cdc/cdc-integration-service-cdc-event-delegates.js`.
- TP = `test/partition/partition-cdc-source-coverage.test.js`; TR = `test/cdc/cdc-authoritative-coverage-reconciliation.test.js`; TO = `test/cdc/cdc-coverage-reconcile-owner.test.js`; TL = `test/cdc/cdc-coverage-lifecycle-owner.test.js`; TC = `test/cache/system-table-cache-cdc-source-order.test.js`; TH = `test/cdc/cdc-authoritative-catchup-hydration.test.js`; TI = `test/integration/cdc-coverage-rejoin-formation.integration.test.js`.

PASS means only the named bounded property. PARTIAL identifies a remaining dependency or finding. No row grants whole-system acceptance.

| Item | Status and concrete evidence |
| --- | --- |
| A1 | PARTIAL. Source descriptor/current-scope gates and cache digest/range/prefix gates agree (SC:279-345, CO:324-357); resource prechecks still fail R3-1/R3-2. TP:538 and TR:93 cover witnessed acquisition. |
| A2 | PASS bounded classification. Capacity/session/no-handler are deferred; identity/chunk/digest/invalid page terminal (`RC:145-174`, `FC:45-51`, `ST:282-284`); failed debt remains visible, spent debt retries. Supported ordinary control TEXT now succeeds TP:675. R3-2 shows a transient class that cannot release under current ordering. |
| A3 | FAIL R3-3/R3-4. Explicit deadline forwarding TH:121 is correct, but CT:29-53/default callers renew per table and actual publication lacks elapsed-time fence. |
| A4 | PASS bounded. REFUSED reason/deferRetry normalized by RC:145-174; query builder preserves operation fields; TR:458 exercises no-handler/timeout. Malformed/noHandler COMPLETE refuses TR:356. |
| A5 | PARTIAL. Pool release wakes all endpoint listeners PO:81, TO:162; route/cache/replacement wakes TO:207,231,291. In-flight backoff can take at most 1000ms; dormant debt starts on the same event/microtask in tests. R3-2 cannot be released by those events. No full formation latency measured. |
| A6 | PARTIAL. Source checks after A/P/B and capture SC:306-341,413; target/lifecycle checks RC:245, FC:148; publication estimate refreshed RC:287-301. Elapsed deadline at mutation is still R3-4. |
| A7 | PARTIAL R3-6. Actual elapsed, attempt/pages/chunks/lifecycle now reported RO:74-108/TO:254; node-wide held identities omit other endpoints PO:236. Counter bytes are not actual whole memory (R3-1). |
| Y1 | PASS bounded event machinery. RO:297-336 arms cooldown; PO:149 registers shared release; EV:18-36 route hooks; LC:41-80 preserves/rearms replacement debt. TO:162,207,231,291 execute them. Normal-runtime entry proof remains future scope. |
| Y2 | PARTIAL. Per-generation frozen deadline races unreadable work RO:181-192,267-286; SS:90-128 checks read budget. Default multi-table renewal and timer-late publication R3-3/R3-4 remain. |
| Y3 | PASS bounded. COMPLETE/FAILED/RETIRED/SPENT explicit RO:14-28; terminal failure retains debt for named event/reinvoke; spent cooldown and shutdown report RO:300-322,124-139. CT:64 emits table failure. It does not silently synthesize empty success. |
| Y4 | FAIL R3-2, PARTIAL R3-5. Source A/P/B routing token now breaks the identified readiness-token dependency SC:263; colocated page/source resource cycle remains. |
| Y5 | PARTIAL. One in-flight per lifecycle/partition/table, 100–1000ms retry, roughly 300 starts per30s, 1–30s cooldown RO:58-66,267-301; power-of-two/10min logs RO:102-108. Normal keys are22; exported/internal arm accepts arbitrary identities without a global queue cap. Detached awaited work and frame lifetime are not bounded merely by eight PO sessions (R3-1). No arbitrary-host caller expansion inferred. |
| Y6 | PASS bounded semantics. Same-N identical/nonempty replay TC:396, contradictory absence TC:382; fragment interruption recaptures TI:166-204; foreign chunk cannot erase live transfer TP:267. No full durable event ACK claim. |
| Y7 | FAIL elapsed completion R3-4. ACK/noHandler/malformed do not reset debt RC:54; only semantic success deletes RO:306-310. Q7 shows overdue valid-shaped success can still delete it. |
| T1 | PASS. Real callback rejects noHandler/non-array/sparse malformed rows RC:54-74/TR:356; router ACK precedes handler and is not coverage (`message-router-inbound-dispatch:435-454`). Q5 partial cursor is refused. |
| T2 | PASS bounded identity, PARTIAL lifetime. Exact binding checks RC:104-138 and FC:53-105; foreign transfer refusal preserves owner ST:385-397/TP:267; lifecycle tests fence old targets. R3-1/R3-4 limit late expiry semantics. |
| T3 | PASS. RC:145-174 consumes canonical transport outcome/error/defer and clamps retry; TR:458. Source REFUSED shapes preserve reason/defer through partition bridge `partition-service-entry-apply-base:72-82,765-769`. |
| T4 | PARTIAL. SS and RO bound caller waits and classify missing route/handler; AR:513 removes preliminary full read. In-flight timeout is not cancellation of frames (R3-1); expired wall-clock completion remains R3-4. |
| T5 | PASS with explicit ceiling. TI:98-132 creates two actual routers; :119-121 substitutes query-message-group send with sourceRouter.deliver; :136-178 uses real gateway/QueryExecutor/PartitionService handler with scripted metadata/leader status. It does not exercise real query-group replication or byte-serialized remote response lifetime. |
| S1 | PASS timer construction. RO:181-200,297-301 uses injected unref timers; PO:143-145 unrefs TTL. Q7 distinguishes correct timer construction from missing clock recheck. No new periodic scheduler. |
| S2 | PARTIAL. Source CORE_OK/role/incarnation, same-view applied N and schema SC:104-118,390-425; cache checks scope/prefix/digest CO:324-357. Timer does not authorize source data, but overdue target publication R3-4 remains. |
| S3 | PARTIAL. PO:62-82,209-224 and LC:41-80 fence/release owned JS references and rearm replacement; TL:71,93 and TO:231. Source session loss recaptures TI. External response copies R3-1 remain; durable event obligations are a separate unchanged owner. |
| S4 | FAIL R3-1. TTL clears owner.value/chunks but not already returned frame/page references; Q2 and actual sendRaw trace. Counter reuse is not proof last live byte disappeared. |
| S5 | PARTIAL. Source uses owner gateway independent of recipient cache authority SC:279-345; SS recovery token; AR skips local full read. Source pressure class mismatch R3-5. ACK/wakes do not become source authority. |
| R1 | PASS semantic writer inventory, PARTIAL resource. Scope initializes in partition-core-base:95-104, monotonic installer coverage-methods:18-32; PO reserve/value/resize/release owns transfers; RO owns debt; CO:261-290 event staging and :397-420 cover/suffix retirement, :511-546 atomic cache/table/tombstone/revision/state swap. TC:76 preserves later UPSERT/DELETE; :155 publishes suffix before listeners; :312 clone failure is atomic. R3-1/R3-4 remain. |
| R2 | PASS bounded. Source scope epoch + runtime lifecycle SC:104-118 and ST:274-280; target private exact cache token in coverage-lifecycle-owner:20-36. TP:472/517 distinguish new runtime and historical workflow provenance; TI recaptures new transfer ID. |
| R3 | PASS semantic completeness. Dense PAGE callback RC:67-74, exact upper/next cursor RC:116-119, cache digest/range/schema CO:303-357; TR:356 and Q5 refuse malformed/partial completion. Valid empty coverage remains TC:209,247. Byte envelope is R3-1. |
| R4 | PASS bounded replay. TC:396 exact same-N succeeds/no new change; TC:382 contradiction refuses; TI:166-204 loses source session, obtains second ID and one exact publication. Authenticated cancel/final retention TP:227. |
| R5 | PASS bounded metadata semantics. Missing/unwitnessed A/P/B defers SS:90-144/TP:582; historical workflow evidence cannot activate TP:517; malformed rows/noHandler preserve existing row TR:356. No missing fact becomes successful empty coverage. |
| C1 | FAIL whole allocation R3-1/R3-2. PO:117-145 synchronously reserves shared pool before source row read, SC:189-213, but serialization/cursor lifetime remains outside full accounting and fixed preclaim prevents affordable colocated progress. |
| C2 | PARTIAL. FC:148 checks current/deadline/exact session after each chunk; RC:287 top-up and :310 finally cleanup correct. Ordinary/final wall-clock gate R3-4. Source capture is synchronous transactional between lifecycle checks; no network await inside SQLite snapshot. |
| C3 | PASS normal ownership. RO:324 coalesces key; PO:160-183 exact-session resize, :203 exact-session release; ST:413-423 exact cancel. TC:396 and TI one publication. R3-4 can retire debt on an overdue result. |
| C4 | PARTIAL. Fenced retirement before wakes LC:43-53,71-80,192; release updates counts/value before callbacks PO:62-81. TO lifecycle/backoff controls pass. Timer-delayed wall-time mutation and external frame lifetime remain R3-4/R3-1. |
| C5 | PASS identity, PARTIAL observability. Node key PO:32-34 merges endpoints; limits min across live owners PO:52-59. Binding ST:252-272 covers request/target/lifecycle/generation/deadline; scope held in session; foreign winner protected TP:267. Shared held list R3-6. |
| F1 | PASS inventory. CT/joining/membership caller → SS TABLES/PARTITIONS/TABLES → owner RPC/query/router → partition handler SC → same-view DB → cache. Remote source SC may repeat gateway A/P/B. AR:510-515 eliminates hosted preliminary `.all()` for required RPC, proved TR:119. Schema PRAGMA and bounded row probes remain legitimate source-owner reads. |
| F2 | PARTIAL. Descriptor routing uses frozen recovery token, source obtains own current scope, never recipient-seeded authority SC:279-345/TP:538. Route/cache/target events reenter existing owner. Actual cold formation with unavailable routes is not measured; R3-5 retains class mismatch. |
| F3 | FAIL R3-3. Normal helper and membership caller omit deadline; existing membership maxAttempts option is still not the new budget authority. Explicit caller control works TH:121. No new readiness bypass. |
| F4 | FAIL R3-3/R3-4. No single default multitable arithmetic; Q6 gives fresh second window. Pages/chunks with supplied deadline share it, but Q7 publishes after elapsed expiry. TI15s is a component bound, not normal startup timing proof. |
| F5 | PASS bounded owner structure. AR required RPC bypasses local read; old parallel catch-up row repair loop remains removed; SC keeps transaction-local authoritative reads; no limit raise, new durable ledger, force flag, or global barrier. R3-2 requires correction through these owners. |
| H1 | PASS with provenance ceiling. Prior actual D controls fingerprint rejected3ed in report37cc; current named discriminators execute in exact0b log. Mapping is not a manufactured mutation run. Q1–Q9 are current-source independent observations; Q5 is a successful refusal/control, not a red. |
| H2 | PARTIAL honest fixture. TI uses real cache/query/gateway/router/partition handler/SQLite, scripted descriptor rows/leader port and direct query-group adapter. TP/TC/TR exercise actual owners; TH's installer double proves wiring only. Source/transport memory lifetime is not measured by the adapter. |
| H3 | PARTIAL. TO/TL virtual clocks preserve timer-first ordering; TP:582 source read after deadline refuses. Q7 adds actual elapsed-before-timer schedule and fails. No lowered geometry claimed equivalent to full startup. |
| H4 | PASS for named wire tests. Source production writers generate binding, scope/domain/prefix/lifecycle/transfer/chunk fields TP:149,352,419; TI actual PAGE/CHUNK. TH synthetic empty pages intentionally omit real cache receipt validation, so not semantic publication proof. R3-7 prefix type remains. |
| H5 | PASS bounded large positive. TI:136-143 writes real >16MiB SQLite value; :192-204 checks exact content and exactly one notification after real source-session interruption. Source nonempty and recipient has no hosted replica. Total backlog, colocated adequate progress (R3-2), and full COMMIT/ACK interleaving remain distinct. |
| H6 | PASS bounded provenance. 48/48 files +14 artifacts independently verified; exact Lab8/8/attempt1,435=356+79. Source frozen. No startup/restart/original-event/lostACK acceptance inferred. |
| O1 | PASS ownership structure. Source descriptor/coverage owner supplies truth; cache cover/floor/suffix consumes; transfer/reconcile state remains volatile. SC/CO/PO/RO writer inventory in R1; no new durable authority. |
| O2 | PASS vocabulary/bridge. `cdc-coverage-protocol.js:1-31`, partition bridge :731-769, query builder :79-129, RC/FC exact producer-consumer binding. Envelope type closure remains R3-7; no alternate validator owner introduced. |
| O3 | PARTIAL. Real >16MiB interrupted same path succeeds TI; refusal tests TP:297/TH:105. R3-2 demonstrates supported affordable first-large-row progress still loops under colocated reservation order; R3-1 undercuts resource proof. |
| O4 | PASS bounded recapture/wakes. Foreign refusal followed by exact chunk TP:267; new source transfer after loss TI; target replacement TO:231; fresh descriptor test TP:538. No permanent semantic veto from same-N replay after CV fix. |
| O5 | FAIL R3-1/R3-2. Eight sessions/shared pressure/single-flight are real PO:104-145, RO:324, but cursor/JSON/frame copies and live lifetime exceed counter model; supported colocated operation cannot get affordable leases. Does not prove arbitrary durable event backlog bound. |
| O6 | PASS installed event paths. PO shared release TO:162; EV connection events TO:207; cache notification TO:291; LC replacement TO:231. Bootstrap setup setters register listeners. Missing handler itself has no registry emission (`message-router-handler-registry:27-39`); periodic bounded retry remains its actual fallback, not an invented handler event. |
| O7 | PASS authority distinction. Cached routes/revisions only wake/hint; source activates from witnessed gateway A/P/B and current runtime, SC:279-345; workflow provenance refused TP:517. Hashes/reports are evidence, not grants. |
| O8 | PASS provenance honesty. Exact prior3ed/report37cc negatives and current0b/source48/log hashes kept distinct; no source mutant run claimed. Lab excludes placement refusal/current diagnostic counterexamples. |
| O9 | PASS scoped census with ceiling. Required owner path no preliminary local full read AR:513; fallback result cannot satisfy RC owner_rpc_lane; old separate hydration loop removed. Exported complete-scope acquisition has no separate production hydration caller; source recovery remains gateway-owned. Unchanged durable obligation drain is not reviewed as C17 hydration. |
| O10 | PASS registration/provenance. `impact-contracts.json:894-943,1797-1855` lists live query/gateway/router/partition/cache/caller pair and8 witnesses; five generated/classification artifacts included in48. Retained audits report59contracts/30pairs/2349classified. Registry description is a claim to test, not proof normal startup ran. |
| J1 | PARTIAL R3-7/R3-4. Safe-size sums ST:73-80,211-249, positive integer request deadlines ST:252-264 and RO:338; source/current prefix string not pinned CO:317. Chunk ordinal/source ordinal accept -0 as equivalent0; no authority-distinct zero demonstrated. Generation increments lack explicit overflow stop; no reachable 2^53-run claim. |
| J2 | PARTIAL existing boundary. Strict own-data descriptor authority (`cdc-source-scope-evidence.js:20-63`, TP:614) and rows DOM:127-139. PAGE row array own indices RC:67-74. Envelope direct fields rely on actual transport plain JSON; standalone inherited-field refusal is not proved. R3-7 is a plain-wire numeric counterexample. |
| J3 | PARTIAL dependency. DOM reads data descriptors without invoking row getters; envelope direct reads RC:54-138/FC:53-106 are not capture-once accessor-safe APIs. Production wire JSON is the stated provenance; no arbitrary trusted-host accessor rewrite was used to create a blocker. |
| J4 | PARTIAL dependency. Row proxies/custom prototypes refused DOM:127-132; scope fields strict; canonical digest owner pins intrinsics. Envelope guards do not independently establish prototype-pollution invariance. Existing protection is retained; no expanded host threat model. |
| J5 | PARTIAL R3-7. Primitive IDs/digest/chunk text and row types pinned FC:62-99, DOM:116-139; safe numeric N is incorrectly accepted where canonical text is required CO:317-337/Q9. Boxes/exotic rows otherwise refuse or fail canonical digest; no successful exotic grant claimed. |
| J6 | N/A to arbitrary host-global mutation. Existing canonical-json-data owner is reused for digests; real plain-data/SQLite and clock counterexamples suffice. This review does not require redesigning all trusted-host intrinsics. Direct envelope-helper independence remains an explicit dependency, not a PASS claim. |
| J7 | FAIL R3-1/R3-7. Base64 length checked before decode FC:92-105 is correct; N needs primitive/length pin before BigInt; canonical NUL cursor/observation serialization expansion is not covered by reservation. Small-NUL positive TP:675 is preserved. |
| J8 | PARTIAL/FAIL resource. Dense own max256 PAGE check RC:67-74 and strict schema rows DOM:127; sequential one-chunk bounded encoded length FC:92-105. Ordinary PAGE/cursor byte bound before clone/materialization is incomplete R3-1. Custom iterator/prototype behavior is a direct-helper dependency outside genuine JSON-wire shape; no new transaction participant cap imposed. |

## Landing and proof limits

This report requires correction of the named bounded defects; it does not authorize source implementation or waive an independent follow-up. Preserve the now-correct refusal/recovery pairs, existing suffix UPSERT/DELETE and atomic cache swap controls, the exact metadata/seal registration, and the separate canonical positive/negative populations.

No mandatory inspection capability was unavailable. No full-startup, durable event backlog, original-event/lost-ACK, physical restart, or whole-TX/Fresh acceptance is implied by the green component/routed tests or this review.
