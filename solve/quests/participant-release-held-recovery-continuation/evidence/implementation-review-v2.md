# Participant release continuation: independent implementation review V2

Reviewed 2026-10-13, after canonical attempt 14:46:29, by `subagent:tx1_deletion_design_vet`. Read-only source/test/metadata/Git review; I ran no tests or labs. This is a new report, not a rewrite of design or baseline evidence.

**Verdict: REVISE the frozen candidate's report-lifetime cleanup, duplicated test seam, required focused clock/lifetime evidence, and interaction-registry representation.** The canonical held classifier, fixed scheduling cadence, unchanged runtime reconstruction/cutover algorithms, and final resume lifecycle fence are otherwise coherent. Whole-Quest approval and landing remain withheld. All findings are consolidated below; no new category is introduced.

## Exact reviewed input

Candidate `0b7147e5096c926450c61be101f42a17dc68f46a`, tree `7585ccb5a90607f0841736df3099e0266c87811d`; source-only control `6a6a67b440bf7dc9e2d38bad6764adda171a1846`, tree `6974b59ff57774fb0850a22e96c8d913cfe12611`; both parent `d35d8828c630d1b9675b47f511c477b3cc9ee991`. I independently verified actual immutable HEAD/tree/parent and every listed hash in `source-revert-pair-v2.json`; zero mismatches. Actual Git difference is exactly the two production paths below; all other tracked bytes, including all tests, contract prose, registry, generated metadata and Quest material, are identical.

Pair manifest `test-output/release-continuation-20261013/source-revert-pair-v2.json` SHA256: `280c82846e7fddddb0dc4998b0eddb70f1740ee650ab5aa9a93705962df24f38`.

| Reviewed path | SHA256 |
| --- | --- |
| `src/node/replica-handler-release-recovery.js` | `eee652ff8432d03fde329d89e05586a3a41ead1e5040e0598c6337984add06c5` |
| `src/partition/partition-participant-transaction-pause.js` | `0ce1938d2fb1ac20d6f96e64fa39e29dec64e4c44dbc242238067d8c1a1737be` |
| `test/node/replica-handler-release-recovery.test.js` | `47dc220e8d4125c83ce68f246cc91c1f18c55d57a0bcdd6518049dbeb63569dd` |
| `test/partition/partition-runtime-reconstruction-leadership.test.js` | `9ece45774ac62fad32e965f227b9e886140e21b5c8bdcd8a0fb6f7c12bd7d2e7` |
| `architecture/contracts/authority-and-recovery.md` | `128538d75429c1d31b9cb7aa245eef9392ef14f7ee948c925086582a972a1ae5` |
| `test/shards/impact-contracts.json` | `e00896adddb2631b700b96d47397d3220091d49adb72daace44f5b2e23dcdf75` |
| `test/shards/impact-graph-seal.json` | `7281aa3dacc7e7ff4e23da222b1fda386604182f5de841d52704e52043dbfc5f` |
| `test/shards/primary-classes.json` | `e8cc7f82909c4cbaae58882354f761f92350bdba5546df386e30df3ed753dbee` |
| `test/shards/resource-classes.json` | `d32ef500be06912bd32434990a77f01bf6426b32c9cd67bcbd245bb1aa2bc7ed` |
| `test/shards/subsystem-classes.json` | `d2beddc9ae0a7af15a826b72bdf1f58d55c899b08b5b6587a2a80a2fd58a5087` |

Approved design SHA256 `880dc634dcffe4b7944b68fb15c38e9c7a4d0c605fb4fd56505d0497f04469ed`, with prior complete design review SHA256 `8679fe824dd9ddfacc6400a4527e10f6f27970f84f6c7e9a795153929f92b2fa`. I read current AGENTS → rules → router and routed authority/recovery and verification owners.

The original `existing-runtime-budgets` constraint is **explicitly superseded**, not silently treated as satisfied. `evidence/constraint-supersession-v1.json` SHA256 `ca71a62b63fc3c515ec5d5b2da3c14525621e9adb1c98da72e73c3542f4c1881` retains the original wording, replaces duration consumption with fixed-cadence/inert-field behavior, and corrects the old “satisfied” interpretation. The sealed statement/epic/probe/five receipts and budgets remain unchanged. The old wording remains historical in the sealed artifact and design; this review applies the explicit replacement.

## Complete correction batch

### R1 — recovery/sweep/retry: no-current-host observation leaves stale report state

`hosted()` excludes `isShutdown` services (`Recovery:111-114`). A due item is deleted before reconciliation (`204-215`). If the last service stops while its object remains registered, `settleNoLeader` has no branch for `services.length === 0` and does not clear `reported` (`161-171`); the only normal cleanup is a later registry-change callback (`228-235`). This contradicts the approved no-current-host/service-lifetime row and diagnostic-map claim.

The state is reachable through existing owners: actual `PartitionService.shutdown()` marks `isShutdown=true` synchronously (`src/partition/partition-service-lifecycle-methods.js:159-164`), and removal can retain the registered service when cleanup fails (`src/node/replica-handler-remove-execution-methods.js:329-346`). There is no service-SHUTDOWN subscription in the tracked registry; it relays consensus and set/delete/clear (`Relay:44-85`). Whole-handler shutdown eventually clears the queue, but does not establish individual-service cleanup. A held report can remain after the due wake finds no hosted service, then suppress an otherwise identical report from a newly registered current object inside the 30-second signature window.

Correct this in the existing recovery owner using its same hosted-service observation; do not add a lifecycle driver or second registry. First add a test-only falsifier: establish a held report, stop the last service while verifying its object remains registered, let the due turn discharge, then register current same-identity held service and require a fresh report/no old-object read. Verify ordinary last-service delete separately and retain zero periodic debt after departure. Do not expose private maps merely for the assertion. No admission or durable data corruption is demonstrated here; this is a real lifetime/diagnostic-cache contract deviation, not a full release-root-cause claim.

### R2 — harness/owner: three copies of one membership-deferral fixture

The same existing-owner deferral is copied at `Focused:204-212`, `252-260`, and `564-572`: save `committedMembershipHandler`, create two promise resolvers, replace the handler, announce the read, wait, and delegate to the original. Extract one test-only seam helper that returns the existing observation/release handles and preserves exact delegation and cleanup. Keep actual handler/service shutdown and replacement effects in their respective test bodies. This removes duplicate fixture logic; it must not create another membership or release decision algorithm.

### R3 — harness/retry/sweep: required boundary and lifetime proof is incomplete

The held witness observes only eight turns / seven seconds (`Focused:289-349`). It proves repeated cadence, zero hostile-field reads, one timer and short-window throttling, but not no wake before 1000 ms, the 30000 ms report rollover, or the approved last-service departure/reentry invariant. Extend that existing virtual-clock witness with the before-due and exact-due assertions, a span crossing the existing report throttle, and bounded observation/report counts. Add the R1 departure/reentry falsifier; keep production budgets unchanged. The current nonleader matrix tests malformed status and mixed null+held, but not a null-alone or uninitialized current service's distinct unavailable/event-driven exit (`Focused:390-457`; `Recovery:161-171`); add those to the existing matrix rather than a second fixture policy.

This does not demand implementation-mirroring tests for unchanged build, cutover, transport or replay algorithms. Existing source checks and regression owners are appropriate evidence for those unchanged branches. Do not use private queue counts or fixture ceilings as native-runtime certification.

### R4 — owner interaction: four endpoints violate the canonical coupled-pair schema

The frozen registry adds two endpoint objects to the two existing ones, producing four (`test/shards/impact-contracts.json`, `coupledPairs.raft-rs-runtime-application-transaction.endpoints`). The canonical validator requires exactly two (`scripts/checks/impact-contract-registry.js:408-410`); `candidate-v2-impact-contracts.log` is genuinely red. The prior design approval failed to identify this representation conflict; it does not waive the schema.

Approve the integrating owner's proposed correction in the same contract: retain the two existing endpoint IDs; include the host-held scheduling/runtime/classifier/relay owners in `ready-persistence-and-reconstruction`, and lifecycle/cutover/facts/pause/shutdown owners in `application-and-progress-transaction`. Preserve the same semantic decision table, current/new owner union, both primary witnesses and regression witnesses. Record the design representation correction explicitly, regenerate canonical metadata and satisfy the existing audit. Do not relax the checker or create a parallel contract.

## All 50 checklist dispositions

Evidence aliases are exact paths: **Recovery**=`src/node/replica-handler-release-recovery.js`; **Pause**=`src/partition/partition-participant-transaction-pause.js`; **Runtime**=`src/raft/raft-rs-runtime-owner.js`; **Facts**=`src/partition/partition-participant-release-facts.js`; **Census**=`src/partition/partition-participant-release-contract.js`; **Cutover**=`src/node/replica-handler-participant-cutover.js`; **Relay**=`src/node/replica-handler-membership-relay.js`; **Cleanup**=`src/node/replica-runtime-cleanup-custody.js`; **Focused**=`test/node/replica-handler-release-recovery.test.js`; **Physical**=`test/partition/partition-runtime-reconstruction-leadership.test.js`.

APPROVE below is a scoped content disposition; it does not replace exact measured acceptance, static gates or final fingerprints. REVISE identifies the complete R1-R4 batch. Physical evidence already inspected is described after the table; pending final negative/static evidence remains HOLD.

### Admission — 7 items

| Item | Verdict and concrete evidence |
| --- | --- |
| A1 Current leader and unchanged final authority | APPROVE. `Recovery:58-74,174-201` observes and selects; only `Cutover:200-299` decides release. `Pause:87-104` revalidates actual facts/generation/term/config plus lifecycle with no await before OPEN. A role observation cannot grant admission. |
| A2 Canonical transient versus ordinary/malformed status | APPROVE. `Recovery:16,34-45,65-70,161-171` reuses `isHeldByHostFailure` at `partition-write-kernel.js:357-359`, keeps ordinary CORE_OK follower/candidate distinct from unavailable, and introduces no English failure predicate. Null-alone/uninitialized measurement belongs to R3. |
| A3 Existing budgets and safe clock | REVISE proof R3; source APPROVE. `Recovery:99,119-142,164,199-201`; constants `partition-participant-transaction-cutover-constants.js:31-33` retain recovery1000/drain30000/pause100. `Physical` retains group10000 and case bounds. Runtime retryAfter is not consumed in the held scheduling path; huge/hostile durations cannot enter platform timers or now+delay arithmetic there. The separate unchanged fresh-create policy still consumes its own answer (`258-271`). |
| A4 Typed reason/envelope contracts | APPROVE. `Recovery:47-55,76-85,145-158` produces diagnostic fields, not a competing wire answer. HOST_FAILURE/null-role/recoveryRequired is produced by `Runtime:785-802`. `Pause:107-112` retains CUTOVER_PAUSED/deferRetry/current pause cadence. `Census:176-179` remains the canonical release answer. |
| A5 Exact release observable/latency | APPROVE content; final proof HOLD. Chain: scheduled status read → `Runtime:846-875,1369-1388` reconstruction/replay → real consensus wake `Relay:80-85` → `Recovery:174-201` → `Cutover:245-299` → `Pause:98-104`. `Physical:406-464` pairs outage/no-log and healed release/data/sibling assertions under unchanged10000. |
| A6 Freshness across attempts/awaits | APPROVE. `Recovery:111-114,174-176,189-197` rereads live registry each turn and checks after build await. `Pause:76-97` checks before idempotent OPEN, after a reentrant port read, after facts await and immediately before mutation. `Focused:181-287,562-599` engages real shutdown/replacement races. |
| A7 Honest blocked identity | APPROVE field construction; REVISE lifetime R1. `Recovery:76-84,145-158` records actual port group/replica/failure or actual service IDs for missing status. `Focused:327-337,417-418,453-456` measures exact fields. Report-cache lifetime currently exceeds the last live service in R1. |

### Recovery/replay — 5 items

| Item | Verdict and concrete evidence |
| --- | --- |
| RY1 No stale recovered-state overwrite | APPROVE. New writes are only pending/running/reported/timer/stopped (`Recovery:94-98,123-142,157,214-223,285-293`) and lifecycle-refused CLOSED/current-facts OPEN (`Pause:63-66,98-103`). No durable or registry reconstruction writes were added. Durable reads/replay stay `Runtime:863-875`; the actual handler owns registry lifecycle. |
| RY2 Restart versus live discrimination | APPROVE. Registry/consensus triggers (`Recovery:228-239`; `Relay:44-85`) rebuild volatile work; only live canonical held status retains observation debt. No ledger/restart-marker inference is introduced. Runtime durable-opening/recovery discriminators are unchanged. Ordinary false-positive status classification is tested `Focused:421-457`. |
| RY3 Empty membership/origin/census cannot release | APPROVE. Missing origin returns OPERATOR_REQUIRED (`Recovery:184-187`); `Facts:94-101`, `Census:140-174`, and `Cutover:240-255` refuse absent/unavailable membership/cohort. An empty hosted list only discharges observation debt, never returns success; its report cleanup needs R1. |
| RY4 Replay/CAS/idempotence/rollback | APPROVE. `Cutover:302-320` retains one handler/partition attempt and exact target-build binding. `src/raft/raft-rs-application-transaction-owner.js:51-99` atomically applies effect, membership/applied state and rollback callbacks, unchanged. `Pause:79-85` preserves same-ID idempotence and wrong-ID STALE/no-revoke; `Focused:166-179` pairs those outcomes. No replay counter or rollback policy is added. |
| RY5 Missing/unreadable is never terminal | APPROVE. Held/unavailable status remains diagnostic/debt or event-driven (`Recovery:161-171`), missing build/origin is operator-required (`184-193`), read/fact failure is typed (`Facts:85-115`, `Recovery:215-218`). Missing maps are not defaulted into a release census. Physical/snapshot/FreshMG authority is not claimed. |

### Sweep/timer — 5 items

| Item | Verdict and concrete evidence |
| --- | --- |
| S1 Injected clock, unref, deterministic boundary | REVISE exact-boundary proof R3; source APPROVE. `Recovery:99,116-142,289-293` uses only handler clock for scheduling and unrefs the timer. `Focused:95-120,289-349` drives actual owner with `VirtualTimeSource`; registration failure is visible at `515-537`. No separate sweep clock exists. |
| S2 Role authority/SOLO | APPROVE. `Recovery:66,174-201` only enters existing cutover on an observed leader. HOST_FAILURE role null is runtime-owned. Sole-voter campaigning remains the runtime's `resumeAfterReconstruction` (`Runtime:521-540`); no new SOLO shortcut, election scheduler or rollback is added. |
| S3 Crash-equivalent memory cleanup | APPROVE. No new code simulates a crash or reconstructs the runtime. `Runtime:846-875` remains owner of handle replacement/durable read/drain; application rollback owner is unchanged. Volatile debt is removed on owner shutdown (`Recovery:285-293`). Individual no-host diagnostic cleanup requires R1. |
| S4 Legal hold windows versus thresholds | APPROVE source; R3 measures rate. Fixed1000 is an observation cadence, not hold expiry or a grant. `Runtime:847-852` alone gates core reconstruction by not-before/persistence. `Focused:293-324` proves retry field reads are zero for huge/unsafe/negative/fractional/nonfinite/boxed/proxy/throwing values. No timeout is made green by increasing it. |
| S5 Self-read starvation/circularity | APPROVE mechanism, final physical proof HOLD. `Recovery:164,204-225` supplies a status turn while admission is CLOSED; `Runtime:1369-1378` queues actual work without nested reconstruction. This removes pause-no-read/deferred-no-tick starvation without a raw-core or serving-readiness prerequisite. Current cutover/control-owner dependencies remain intact, not force-bypassed. |

### Concurrency/serialization — 5 items

| Item | Verdict and concrete evidence |
| --- | --- |
| C1 Per-partition gate plus canonical backstop | APPROVE. `Recovery:207-223` single-flights one partition and max4; `Cutover:302-320` remains the canonical attempt backstop. `Focused:459-482` proves four synchronous starts and fifth only after settling a slot. |
| C2 Check/await/use lifecycle revalidation | APPROVE. `Recovery:189-197` post-build check and `Pause:75-104` repeated lifecycle/current-generation checks close the real shutdown/replacement gap. `Cleanup:84-100` actually sets shuttingDown before waiting while registry remains live; tests at `Focused:202-287,562-599` use that lifecycle, not a fabricated flag for the handler race. |
| C3 Single-winner wakes/restart/operator | APPROVE. Registry, consensus and self timer all call one enqueue/dispatch/reconcile (`Recovery:135-143,204-239`). Fresh/operator APIs retain existing canonical request owner (`242-283`). No second release driver or claim algorithm is added. |
| C4 Timer/event reentrancy and max4 | APPROVE source; R3 extends pressure proof. Reentrant events coalesce by key, running keys postpone rather than overlap (`Recovery:138,210-223`); runtime read reentry stays in its group queue (`Runtime:907-955,1369-1378`). `Focused:299-322,339-348,459-482` exercises reentry/burst/max4. Virtual advance drains timer callbacks before ordinary microtasks, so its exact one-read claim is scoped to that deterministic schedule; real events may add coalesced observations but cannot bypass runtime not-before. |
| C5 Correct identity and independence | APPROVE. Maps use partitionId within the actual handler (`Recovery:135-138,207-223`), hosted selection is exact partition equality, and registry checks use exact service object/replica ID (`Pause:58-60`). Physical sibling hard state/log/data/runtime-generation is preserved in the same witness (`Physical:400-404,462-464`). |

### Owner interaction — 10 items

| Item | Verdict and concrete evidence |
| --- | --- |
| O1 Sole semantic owners | APPROVE. Runtime owns reconstruct/role; write kernel owns held classification; Recovery owns observation scheduling/report lifetime; Cutover/Census own complete release; Pause alone owns final OPEN. `Recovery:4-16,174-201`, `Pause:75-104`, `authority-and-recovery.md` new participant-release subsection encode that split. R1 belongs to Recovery, not caller repair. |
| O2 Typed seams/intent-evidence-actuation | APPROVE. `Recovery:65-70,76-85` consumes semantic status, preserves typed unavailable diagnostic, and submits intent only at `197-199`. `Facts:85-115` and `Census:140-179` remain the exact release fact/answer shape. No status alias or duration decoder is added. |
| O3 Paired invariant in one witness | APPROVE content. `Physical:406-464` proves committed failure/unconsumed cursor, paused/no-log and later exact rows/leader/current runtime/sibling in the same owner fixture. `Focused:166-248` pairs live success, wrong-ID preservation and actual async shutdown refusal. Exact source-only controls remain final evidence gates, not separate green-component inference. |
| O4 Stale then fresh reevaluation | APPROVE release behavior; REVISE report lifetime R1. `Recovery:174-201` always reads current services; `Pause:88-103` blocks stale identity but live positive resumes. `Focused:484-513,562-599` exercises replacement. No cached status grants or permanently vetoes admission; cached diagnostic suppression after individual shutdown is the remaining R1 issue. |
| O5 Pressure/backoff/singleflight | APPROVE source, R3 proof pending. Fixed cadence does not reinterpret port retryAfter, and `Runtime:847-852` retains actual not-before. Existing max4, one timer, per-key maps, report throttle remain. Fresh-create retry extraction `87-90,258-271` is behavior-preserving; the reported inherited fresh-create `local_retry_loop` remains open, not waived or repaired by this unit. |
| O6 Owned wake/release; timer prohibition assessed | APPROVE mechanism. Real registry/consensus events remain primary wakes (`Recovery:228-239`, `Relay:44-85`). A healed external storage limit need not itself emit consensus; the retained background recovery debt supplies a bounded status observation, after which Runtime reconstructs/announces and canonical cutover decides. The timer is not an alternate progression/admission algorithm. `verification-templates/owner-interaction.md:59-60` is assessed against the authority owner's “one decision algorithm, multiple legitimate triggers” and explicit held-continuation contract: do not invent a heal event or second driver merely to avoid the necessary recovery wake. R1/R3 must still prove its lifetime/firing. |
| O7 Diagnostics never authority | APPROVE. `Recovery:145-158` reports only; no caller reads reported to grant release. `Physical:280-297` observes actual core/event activity only; callback/facts/stop have no port/tick/release/pause calls. Assertions do not read private scheduling state or use trace counts as permission. |
| O8 Treatment/source fingerprint binding | APPROVE binding, final evidence HOLD. Actual pair has exactly2src differences with unchanged tests/prose/metadata; all manifest hashes checked. The unchanged passive test reaches its intended behavioral red under source revert (raw evidence below), not absent imports/methods. Source-mode measured build content naturally differs across treatments; no equality claim is made. |
| O9 No raw/force/fallback/duplicate decision | APPROVE production algorithm. Source reads origin through existing store, status through existing port, and canonical release; no tick/core/manual release/pause reset is added. No new held predicate or delay normalization policy. R2 is duplicated fixture setup, not a new production verdict, and must still be removed. |
| O10 Registry/endpoints/exact witness alignment | REVISE R4. Semantic owner/witness union is correct and retains existing contract; 4 endpoints violate canonical2-endpoint grammar. The proposed fold preserves original IDs, complete owner union and Focused/Physical primaries plus release regression. Generated metadata is content-bound but cannot authorize an invalid registry. |

### Harness fidelity — 6 items

| Item | Verdict and concrete evidence |
| --- | --- |
| H1 Behavioral red/right reason | APPROVE inspected native negative. Original passive d35 red and same-test source-only negative reach the actual APPLICATION/SQLITE_FULL, hold, heal and named release assertion, with passive0core/0consensus and unchanged10000. New lifecycle source-control final output still pending; tests import only pre-existing owner APIs, so no intentional missing-method red. |
| H2 Actual owners versus fixture ceiling | APPROVE with scope. `Focused:95-164` assembles actual ReplicaHandler/registry/clock; lifecycle uses actual PartitionService plus its existing controllable membership port and real Facts/Pause. Cadence services are explicit EventEmitter/status projections (`57-85`), not native consensus. Physical companion uses real registered handlers/native store and durable SQLite fault; focused green alone cannot certify physical recovery. R2 must share the repeated delegation seam. |
| H3 Preserved time geometry/budgets | REVISE R3 boundary/long-span evidence. Virtual clock advancement drives the existing1000ms cadence without production budget changes; four microtask turns settle synchronous fixture tasks (`53-55`). Physical removes post-heal readStatus/sleep and retains existing healthy/case bounds, fault injection and disposal. No new cleanup-only OPEN wait masks a primary liveness failure. |
| H4 Complete relevant identity/facts and hostile field fidelity | APPROVE with fixture scope. CurrentResumeRequest derives full actual Facts/release/Census (`Focused:123-129`) rather than planting generations/build/origin. Held projections carry the exact classifier and diagnostic fields consumed here (`66-76`); ordinary status projection is used only for classification/pre-origin boundary, not full membership/release. Physical proves the actual richer port envelope. Throwing retry accessor/counter demonstrates non-consumption; it is not arbitrary trusted-host JS hardening. |
| H5 Nonvacuity/no fake admission | APPROVE. `Physical:398-421,429-440,459-464` uses nonempty victim/sibling writes and durable cursor/log/row assertions. Real lifecycle tests first obtain OBSERVED facts/valid release, then gate the actual owner await; handler shutdown retains the real service via operationTasks (`Focused:214-244`). No manually OPEN or fabricated legacy transaction is used. Null/noninitialized and departure observables require R3/R1. |
| H6 Physical locked lab claim ceiling | APPROVE bounded claim, whole acceptance HOLD. Current logs show exact candidate17/17 files and217 runner assertions, including real three-replica LegA control. They do not constitute a corpus/fresh-identity/snapshot/TX1-crash certification, nor waive inherited fresh-create/release issues. Source/final negative/static gates and correction fingerprints remain necessary. |

### Retry loops — 7 items

| Item | Verdict and concrete evidence |
| --- | --- |
| T1 Held retry must fire without future event | APPROVE source; R3 extends proof. `Recovery:164,116-142,204-225` retains/fires fixed debt through the existing timer; timer registration failure reports loudly (`123-131`; Focused515-537). It does not depend on a serving query or manual post-heal status read. Native positive/negative inspected below engage that missing-event case. |
| T2 Bound when facts unreadable | REVISE R1 lifetime cleanup, source rationale otherwise APPROVE. Background debt has the actual hosted service/handler lifetime, no invented operation deadline. Failed status/reconcile reports unavailable and retries (`215-218`); origin/build absence stops typed operator-required (`184-193`). No unreadable fact becomes success. Old report state must not outlive the last eligible hosted object. |
| T3 All exits and typed visibility | REVISE R1/R3. Held→unavailable report+retry; ordinary follower/candidate→no timed debt; malformed/null→unavailable event-driven; no initialized→unavailable; pre-origin/build→operator; cutover non-success→exact answer/retry; timer failure→visible degraded unscheduled stop; stopping→clear/join. Evidence `Recovery:123-131,145-201,204-239,285-293`. Normal healthy/no-service discharge is not an acknowledged operation failure needing a fabricated error; no-service report cleanup is still missing. Add standalone null/uninitialized matrix observations, not local status interpretations. |
| T4 Mutual suppression/circularity | APPROVE mechanism. CLOSED Pause returns without a port read (`Pause:49-51`), and refused write does not tick; Recovery's independent due item still reads port. Runtime group queue refuses nested actuation (`907-955,1369-1378`) and not-before postpones safely rather than abandoning the continuation. No A-waits-B/B-waits-A application-readiness cycle is added. |
| T5 Rate/concurrency/map/log ceiling | REVISE R1/R3. Source ceiling is <=floor(T/1000)+1 self observations per continuous held partition plus real event nudges, max4 running, one pending partition key and one shared timer; unchanged signature <=floor(T/30000)+1 reports. Existing eight-turn test only proves a short prefix and one burst/max4. Extend span/boundaries and prove last-host cleanup/reentry; no deadline/budget inflation. |
| T6 Late success is authoritative reread/idempotent | APPROVE. `Recovery:174-201` fresh observations before each attempt; Cutover RUNS and census are unchanged; same release ID resumes only after current lifecycle/proof checks (`Pause:79-85`). Non-CUT_OVER/lost answers keep existing retry ownership; no duplicate application mutation or origin record is synthesized. |
| T7 Actual completion/counter reset | APPROVE. Recovery has no success counter to reset on ACK. Only exact CUT_OVER discharges that result (`Recovery:200-201`), aggregate canonical RESUMED evidence supplies it (`Cutover:295-299`). Runtime owns actual attempts/retry windows and durable applied progress. Host retry fields are observations, never a transport completion shortcut. |

### Formation circularity — 5 items

| Item | Verdict and concrete evidence |
| --- | --- |
| F1 Enumerated own-subsystem reads/degraded behavior | APPROVE. Recovery reads port status, existing origin and measured build; canonical Cutover reads actual membership/routes/participant census/control-owner/query drain and invokes owned release RPC. `Recovery:175-199`; `Facts:85-115`; `Cutover:138-168,200-299`. Missing facts stay typed/paused, no cache/raw-read alternate authority. |
| F2 Wake independent of paused admission/CDC | APPROVE source. Registry+consensus+held timer remains node-local owner work (`Recovery:116-142,228-239`), not a CDC/request-readiness dependency. Actual deferred singleton diagnostic is specifically free of post-heal external actuation. Runtime not-before remains independent scheduling permission. |
| F3 Arriving requests remain gated | APPROVE. `Pause:107-112` keeps CUTOVER_PAUSED/deferRetry; `Physical:429-440` checks rejected write and unchanged log during outage. The wake does not alter caller retry policy or widen admission before full release. |
| F4 Total heal/reconstruct/elect/replay/drain/resume budget | APPROVE bounded native positive, final closure HOLD. Existing10000 assertion and physical paired data/cursor controls remain; candidate passes the exact passive witness, source-only control spends that bound at the named assertion. No elapsed red is tuning noise; inherited fresh-create local_retry_loop and wider startup release reds remain unresolved separately. |
| F5 No consistency/core/election bypass | APPROVE. Source diff adds only canonical held classification, scheduling/report projection and pause lifecycle checks. No tick, campaign, proposal, raw-core, forceNewCluster, pause reset or alternate origin/census path. Sole-voter leadership after reconstruction remains Runtime-owned and tested through the actual physical witness. |

## Lab evidence inspected at this frozen input

I read placement HEAD lines and per-file outcomes from all four completed candidate logs: tv-dator1/1,20 runner assertions; carinas-windows1/1,13; adam-laptop8/8,101; lenovo-laptop7/7,83. Total **17/17 files,217 runner assertions**. These are runner counts, not an invented count of every nested assert call. No test rerun was used to convert a red into green in these logs.

Same-host native source-only control is a real negative: `source-revert-v2-tv-dator.log:16,33` reports the identical Physical test failing the original named release assertion with `{reconstructions:0,consensus:[]}`; its deferred case spends the unchanged10000, not an import/setup/signature failure. This negative is excluded from green proof. Adam8/8 and lenovo7/7 controls preserve the unchanged recovery/application/release regression cone. Final focused source-control was not yet present at this review read; its actual behavioral failures remain a required bound.

| Raw log under `test-output/release-continuation-20261013/` | SHA256 |
| --- | --- |
| `candidate-v2-tv-dator.log` | `c5ef5935666e451f58206fa56b4917b2946ee1fdadbf1c00c3b5a210fc1fc9b7` |
| `candidate-v2-carinas-windows.log` | `9ca4da6ed780463df4d4715ac600abd9ae5f591bc75938732c3bbb7652ebc925` |
| `candidate-v2-adam-laptop.log` | `804b3d495f1eeb6a6b7f741e5fe7e7650e3602c41f99ae747001aca3c650058f` |
| `candidate-v2-lenovo-laptop.log` | `fa521974e8ccd8359d6500c1a6c851ad5e095aef9d387be0501d1f91b9d122bb` |
| `source-revert-v2-tv-dator.log` | `cc667305dbc8028b3b779dda0187a44c55f8ab0086d73a245cc636608c60a4cb` |
| `source-revert-v2-adam-laptop.log` | `5aa92e3f69143c84cb6fc0434dd0b18a6a64d787c6ec1809b2026bc8439d7d00` |
| `source-revert-v2-lenovo-laptop.log` | `0c1aa556f15f9cfb25b7fcf0b2482dd58854b09b8127fc644722a6a98c04e9dd` |

The stronger physical progress evidence is useful but does not erase R1-R4. Fixes invalidate the appropriate frozen input; retain these outcomes historically and rebind the final correction tests/source/control/static proof. This report does not claim current full-corpus certification, TX1 crash/application-snapshot custody, FreshMG closure, or a main merge. Inherited fresh-create retry/startup failures must remain separately red and owned.
