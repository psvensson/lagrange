# Participant release continuation: independent implementation and evidence review V3

Reviewed 2026-10-13 at 15:32 UTC by `subagent:tx1_deletion_design_vet`, after canonical attempt 15:15:04.160 and final paired archive 15:23:25.613. This is an additive report. No source, test, metadata or Git changes, tests, labs, landing or receipt edits were performed by this reviewer.

**Scoped verdict: APPROVE the current source/test/interaction content and the bounded V3 behavioral evidence. R1–R4 from the preceding implementation review are resolved. Whole Quest, main, corpus, integrated startup and publication approval remain HOLD.** Coherent non-main WIP preservation may retain this exact input and its honest HOLD; this verdict is not a terminal Quest verification or permission to land.

## Immutable authority and input

The complete 50-item preceding review is incorporated by exact durable file `solve/quests/participant-release-held-recovery-continuation/evidence/implementation-review-v2.md`, SHA256 `65320f1f34b7aa6dfe6597c194b3f4a19366c594be848fb78b8480fc286c8e08`. Its historical REVISE verdict and input remain unchanged. The current dispositions of all 50 items appear below; no applicable category is deferred.

Approved design SHA256 `880dc634dcffe4b7944b68fb15c38e9c7a4d0c605fb4fd56505d0497f04469ed` is applied with explicit constraint supersession `evidence/constraint-supersession-v1.json`, SHA256 `ca71a62b63fc3c515ec5d5b2da3c14525621e9adb1c98da72e73c3542f4c1881`, and interaction representation correction `evidence/impact-contract-design-correction-v1.json`, SHA256 `9d1d431b6d76265922aa15920433c40a6058c54bf7a0654c8423b472f7191d52`. The original duration-validation wording is superseded, not silently satisfied: the release owner never consumes status.retryAfterMs, and runtime alone owns reconstruction not-before. The original four-endpoint design instruction is likewise superseded by the existing canonical two-endpoint representation; the checker and semantic acceptance were not weakened.

| Input | Commit | Tree |
| --- | --- | --- |
| Candidate | `cd589405e6febadf7dbef339b6806e15426e837f` | `11f617117cc648f22cc8ba34d8364773a22c9914` |
| Source-only control | `c2307d3dc827d8c1293ad3a87ed8f3753f324b8b` | `6c1f12c96538b2f54320bd523f01ace0583adea5` |

Both parent `d35d8828c630d1b9675b47f511c477b3cc9ee991`. Immutable locations are `/tmp/session-worktree-dR6S70/tree` and `/tmp/session-worktree-Hwd7nI/tree`. Actual HEAD, tree, parent, all manifest file hashes and actual Git difference were independently verified with zero mismatches. The pair differs exactly at the two source paths below; every other tracked byte, including tests, authority prose, registry, generated metadata and Quest material, is identical.

Pair manifest `evidence/source-revert-pair-v3.json`: SHA256 `bdc878af0451923fdfbd717169ade773ee33a1de9d4e63f8f1d87a8067d7dc01`.
Paired result `evidence/paired-result-v3.json`: SHA256 `a09c2b0a9973597fbdb485ea0fff61331da5c6cc1c938ec9d7b31a7355fb2f01`. All **64** named archived raw artifacts independently match both their recorded SHA256 and byte count.

| Candidate path | SHA256 |
| --- | --- |
| `src/node/replica-handler-release-recovery.js` | `1e35f7fff07e87ec0da7ebe0c14e23ffedc9bb83a650b559bc1b4d5b0965ee23` |
| `src/partition/partition-participant-transaction-pause.js` | `0ce1938d2fb1ac20d6f96e64fa39e29dec64e4c44dbc242238067d8c1a1737be` |
| `test/node/replica-handler-release-recovery.test.js` | `979653087fdee7931ac1d9caaab57dd18685153296ed271a851210fdf0435f76` |
| `test/partition/partition-runtime-reconstruction-leadership.test.js` | `9ece45774ac62fad32e965f227b9e886140e21b5c8bdcd8a0fb6f7c12bd7d2e7` |
| `architecture/contracts/authority-and-recovery.md` | `128538d75429c1d31b9cb7aa245eef9392ef14f7ee948c925086582a972a1ae5` |
| `test/shards/impact-contracts.json` | `63f610be8f25c15fbd981e04bb631c8dc7419087356e2dc84d008812d18bea33` |
| `test/shards/impact-graph-seal.json` | `035ef0575ed357ef2e20fec9aeeae0f156c8ff240dadfcd2a39edb3feaa09196` |
| `test/shards/primary-classes.json` | `e8cc7f82909c4cbaae58882354f761f92350bdba5546df386e30df3ed753dbee` |
| `test/shards/resource-classes.json` | `d32ef500be06912bd32434990a77f01bf6426b32c9cd67bcbd245bb1aa2bc7ed` |
| `test/shards/subsystem-classes.json` | `d2beddc9ae0a7af15a826b72bdf1f58d55c899b08b5b6587a2a80a2fd58a5087` |

Current AGENTS → rules → router and routed verification/authority owners were read. Prior review supplies unchanged-owner analysis; actual correction source, focused tests, lifecycle races, registered interaction and raw final evidence were read again.

## Correction batch disposition

- **R1 recovery/sweep/retry lifetime — APPROVE.** `Recovery:145-152` now has one discharge owner for the selected partition's pending/report state and cancels the shared timer only when no pending keys remain. Both no-current-host settling (`176-177`) and last-registry departure (`239-244`) call it; departure cleanup precedes re-enqueue. Other hosted partitions retain their work. A retained stopped object is filtered out by the existing hosted owner, and a later current registration reports afresh. `Focused:562-619` measures immediate last-delete timer cancellation and stopped-in-registry report reentry.
- **R2 duplicated fixture seam — APPROVE.** The single `deferCommittedMembership` helper (`Focused:132-142`) delegates the existing owner method after a controlled await. Handler shutdown, service shutdown and replacement use this seam, retain actual owner lifecycle calls, release their gates in finally and preserve primary plus cleanup failures. It neither builds release facts nor grants authority. Raw clone reports have zero groups touching either changed test.
- **R3 boundary/rate/exit evidence — APPROVE.** `Focused:288-374` measures 999/1000ms, one retained timer, unchanged 30000ms reporting boundary, full-span reads = floor(now/1000)+1 and retryFieldReads = 0 through rollover. Real event bursts coalesce. `446-504` independently measures healthy follower/candidate, malformed, null and uninitialized exits with exact typed diagnostics; `506-529` measures max-four background attempts and fifth admission after a slot settles. Lifetime and timer-failure cases preserve genuine resource observables.
- **R4 interaction representation — APPROVE.** Exactly the two original endpoint IDs remain under `raft-rs-runtime-application-transaction`. Held-observation owners are folded into `ready-persistence-and-reconstruction`; canonical resume/cutover/custody owners into `application-and-progress-transaction`. The owner union, decision table and primary/regression witnesses are preserved. Actual JSON comparison finds only this coupled-pair representation changed from V2; primary/resource/subsystem generated bytes are unchanged, the seal is regenerated. Final registry audit passes 62 contracts/33 pairs without checker relaxation.

The two lifetime-only behavioral negatives remain separately attributable to unchanged V2 production at `cee78b3a92fc942fb9214e61cf6a5c96f2b3c567`, focused test `d55f6f15b31ae57645ec40deaca181e665b7f934220be008e442357c8b96100f`: 13/15 pass, expected timer 0 versus 1 and fresh reports 2 versus 1 (`evidence/lifetime-baseline-v3-carinas-windows.log:76-113`, SHA256 `fd9a791bd30703ce4af5400f77d9c30eccfaf723ab683d5a6ca86fc0ee68362c`). Final 979653 adds two assertions (five lines) to the long-span cadence case; these lifetime bodies are unchanged and pass at V3. Full d35 source control fails their earlier held-observation premise, so it is **not** claimed as a direct isolated lifetime-discharge falsifier.

## Source aliases for the 50-item review

Each `Alias:line` below names the following exact repository path at candidate cd589405:

- Recovery: `src/node/replica-handler-release-recovery.js`.
- Pause: `src/partition/partition-participant-transaction-pause.js`.
- Runtime: `src/raft/raft-rs-runtime-owner.js`.
- Kernel: `src/partition/partition-write-kernel.js`.
- Facts: `src/partition/partition-participant-release-facts.js`.
- Census: `src/partition/partition-participant-release-contract.js`.
- Cutover: `src/node/replica-handler-participant-cutover.js`.
- Relay: `src/node/replica-handler-membership-relay.js`.
- Cleanup: `src/node/replica-runtime-cleanup-custody.js`.
- Focused: `test/node/replica-handler-release-recovery.test.js`.
- Physical: `test/partition/partition-runtime-reconstruction-leadership.test.js`.

All evidence names below without another prefix are within `solve/quests/participant-release-held-recovery-continuation/evidence/`.

### Admission/gating — 7

| Item | Current disposition and evidence |
| --- | --- |
| A1 Observed leader and final enforcement | APPROVE. Ordered current observation selects the first leader (`Recovery:58-74,185-212`); a wake grants nothing. Actual Facts/Census and final generation/term/configuration/lifecycle fences remain mandatory (`Facts:85-115`, `Pause:75-104`). |
| A2 Transient/terminal classification | APPROVE. Imported canonical held classifier is the only held predicate; ordinary CORE_OK follower/candidate stays event-driven, held retains debt, malformed/null is typed unavailable (`Recovery:34-36,58-84,170-183`; `Focused:415-504`). Origin/build absence remains operator-required. |
| A3 Existing budgets and safe clock | APPROVE corrected constraint. Existing 1000ms observation cadence, 10000ms healthy witness, 30000ms drain/report and fresh/operator budgets are unchanged. Host retry field is inert, so huge or hostile durations cannot affect timers (`Recovery:99,116-143,173`; `Focused:288-374`; explicit supersession). |
| A4 Exact reason/status shapes | APPROVE. Semantic HOST_FAILURE/recoveryRequired/null-role is consumed through Kernel; report retains actual cause and IDs (`Recovery:39-84`; `Runtime:785-802`). CUTOVER_PAUSED/deferRetry and release outcomes retain canonical shapes (`Pause:107-112`; `Physical:408-440`). |
| A5 Hold release observable | APPROVE bounded physical proof. Heal → runtime reconstruction/replay → leader/canonical release → pause-null is observed without manual actuation (`Physical:442-464`). Exact candidate deferred case passes 1170.220289ms; control fails named bound at 10181.186015ms. |
| A6 Per-attempt freshness | APPROVE. Every attempt obtains current hosted objects/status; post-build and final-resume checks reject replacement/shutdown after awaits (`Recovery:111-114,185-212`; `Pause:75-104`; `Focused:215-286,531-619,668`). No cached report authorizes admission. |
| A7 Honest blocked entity | APPROVE, R1 resolved. Reports preserve actual group/replica/phase/outcome/failure (`Recovery:76-84,154-167`), expire with hosted custody (`145-152,176-177,239-244`); new current lifetime reports afresh (`Focused:562-619`). |

### Recovery/replay — 5

| Item | Current disposition and evidence |
| --- | --- |
| RY1 No stale recovered-state overwrite | APPROVE. New writes are only pending/running/reported/timer/stopped and Pause's CLOSED/OPEN WeakMap. No durable row or registry reconstruction is added (`Recovery:92-99,135-167,215-244,295-303`; `Pause:63-66,98-103`). Runtime alone reads/replays durable history (`Runtime:846-875`). |
| RY2 Restart/live discriminator | APPROVE. Actual registry and consensus wakes rebuild volatile work (`Relay:44-85`, `Recovery:239-249`); only current canonical held status retains background debt. No restart ledger or cached healthy substitute. Healthy/malformed matrix is explicit (`Focused:446-504`). |
| RY3 Missing enlistment and empty case | APPROVE. Missing origin stops operator-required (`Recovery:195-198`); Facts/Census/Cutover refuse missing/unavailable membership or incomplete cohort (`Facts:94-101`, `Census:140-174`, `Cutover:240-255`). Empty hosted work discharges debt, never grants release. |
| RY4 Replay/idempotence/rollback | APPROVE preservation. Cutover keeps exact handler/partition single-flight/build claim (`Cutover:302-320`). Unchanged `src/raft/raft-rs-application-transaction-owner.js:51-99` atomically applies effects/membership/progress and rollback callbacks. Same-ID OPEN and wrong-ID/no-revoke are paired (`Pause:79-85`; `Focused:179-192`). |
| RY5 Absence/unreadable never terminal | APPROVE. Unavailable facts/status stay typed; origin/build absence is explicit (`Recovery:170-212,226-229`, `Facts:85-115`). No missing map becomes a successful census. Unreadable-durable regression is green on both inputs; snapshot/FreshMG terminal authority is outside this proof. |

### Sweep/timer — 5

| Item | Current disposition and evidence |
| --- | --- |
| S1 Injected time/unref/boundary | APPROVE, R3 resolved. Scheduling uses handler.timeSource and unref, with visible registration failure (`Recovery:99,116-143`); deterministic 999/1000ms and report rollover are measured (`Focused:288-374,621-643`). |
| S2 Role/authority/SOLO | APPROVE. Only observed leader enters unchanged cutover (`Recovery:185-212`). Runtime alone owns sole-voter campaigning after reconstruction (`Runtime:521-540`); no new SOLO shortcut, rollback or election timer. |
| S3 Memory/crash-equivalence | APPROVE, R1 resolved. No synthetic crash/reconstruct path. Runtime retains durable reconstruction/drain (`Runtime:846-875`); discharge/shutdown release volatile obligations (`Recovery:145-152,295-303`; `Focused:562-619,645-667`). |
| S4 Legal holds/rate/thresholds | APPROVE. Cadence is observation, never hold expiry or a grant; runtime not-before remains unchanged (`Runtime:847-852`). Host retry field reads remain zero through >=30000ms (`Focused:292-362`). Native healthy deadline is unchanged and genuinely red on control. |
| S5 Starvation/circular waiting | APPROVE bounded mechanism/evidence. CLOSED admission's no-read branch cannot suppress retained owner observation (`Pause:49-51`, `Recovery:170-173,215-236`). Runtime queues recovery without nested core entry (`Runtime:1369-1378`). Physical source control has zero post-heal core turns/consensus; candidate progresses. |

### Concurrency/serialization — 5

| Item | Current disposition and evidence |
| --- | --- |
| C1 Existing gate and backstop | APPROVE. Per-partition running claim and max-four background lanes remain (`Recovery:215-237`); canonical Cutover RUNS is unchanged (`Cutover:302-320`). Fifth starts only after a lane settles (`Focused:506-529`). |
| C2 Revalidation after awaits | APPROVE. Recovery revalidates after build; Pause checks real handler/service/exact registry before idempotence, after awaited facts and after final status (`Recovery:206-207`; `Pause:75-104`). Actual shutdown starts while service custody remains (`Cleanup:84-100`; `Focused:194-286,668`). |
| C3 Single-winner wake/replay paths | APPROVE. Events/timer/restart registration all enqueue one existing owner; fresh/operator paths retain canonical release (`Recovery:135-143,215-249,252-293`). No additional driver/claim algorithm. |
| C4 Timer reentrancy and pressure | APPROVE, R3 resolved. Running keys postpone instead of overlapping; event nudges coalesce (`Recovery:138,221-234`). Focused synchronous reentry, burst and max-four tests are green (`Focused:300-373,506-529`). Deterministic self-read count excludes extra real event nudges; runtime still bounds actual reconstruction. |
| C5 Resource identity and siblings | APPROVE. Keys are partition IDs scoped to actual handler; registry fence uses exact replica object (`Recovery:111-114,135-138`; `Pause:58-60`). Physical sibling hard state/log/data/runtime is preserved in the same witness (`Physical:400-404,462-464`). |

### Owner interaction — 10

| Item | Current disposition and evidence |
| --- | --- |
| O1 Sole semantic owners | APPROVE. Runtime owns reconstruction/role, Kernel held classification, Recovery scheduling/report lifetime, Cutover/Census full release, Pause final OPEN (`Recovery:4-16,58-84,185-212`; `Pause:75-104`; `architecture/contracts/authority-and-recovery.md:53-78`). |
| O2 Typed seams and authority | APPROVE. Current status is evidence, scheduled debt intent, cutover/resume actuation (`Recovery:58-84,170-212`; `Facts:85-115`; `Census:140-179`). No duration decoder, status alias or alternate completion verdict. |
| O3 Paired invariant | APPROVE evidence. One Physical witness retains actual failure/unconsumed cursor, paused/no-log, healed exact rows/leader/runtime and sibling (`Physical:406-464`). Focused pairs live resume/wrong-ID with real shutdown refusals (`179-286`). Same-test controls fail their intended assertions. |
| O4 Stale then fresh | APPROVE, R1 resolved. Fresh objects/status are re-read, stale objects cannot open, and report state does not suppress a new hosted lifetime (`Recovery:145-152,185-212,239-244`; `Pause:88-103`; `Focused:531-619,668`). |
| O5 Pressure/backoff/singleflight | APPROVE scoped content, inherited static HOLD. One timer/per-key debt, max-four lanes, 1000ms observation and 30000ms signature throttle retain runtime not-before (`Recovery:116-167,215-236`; `Focused:288-374,506-529`). Fresh-create retry extraction preserves its existing policy; its inherited local_retry_loop is not waived. |
| O6 Wake/release ownership | APPROVE, R1/R3 resolved. Registered registry/consensus events remain primary; healed external SQLite pressure need not emit an event, so retained background debt supplies a bounded status observation (`Relay:44-85`; `Recovery:170-173,239-249`). Runtime reconstructs/announces, canonical cutover decides. The template timer restriction (`verification-templates/owner-interaction.md:59-60`) is assessed against the authority owner's one algorithm/multiple triggers (`authority-and-recovery.md:36-42,53-78`): timer is a recovery wake, not a second progression/admission algorithm. |
| O7 Projections cannot authorize | APPROVE. Report cache only throttles logs (`Recovery:154-167`); passive native trace callbacks only observe/detach (`Physical:258-297`). No trace/private-map value grants admission. |
| O8 Exact A/B fingerprints | APPROVE bounded proof. Independently verified pair hashes/HEAD/tree/Git difference and all 64 archived artifacts. Source-only control shares every non-source tracked byte; expected negatives are excluded from green proof. Measured source build digests naturally differ across treatments, not asserted equal. |
| O9 No raw read/force/fallback/duplication | APPROVE. Only owned origin store, status port and canonical cutover are consumed; no tick/raw core/proposal/manual release/reset. Fixed cadence copies no retry-duration policy (`Recovery:58-90,185-212`). Single deferral helper avoids repeated fixture logic (`Focused:132-142`); raw clone reports have no changed-path hits. |
| O10 Registry/endpoints/witnesses | APPROVE, R4 resolved. Actual corrected named contract/coupled pair remains exactly two original endpoints (`test/shards/impact-contracts.json:599,1522`) with current owner union and primary witnesses. Final impact 62/33 and shard 2367 audits pass; explicit correction preserves failed historical representation. |

### Harness fidelity — 6

| Item | Current disposition and evidence |
| --- | --- |
| H1 Right-reason behavioral negatives | APPROVE. Native control reaches APPLICATION/SQLITE_FULL, hold, heal and named unchanged 10000ms assertion (`source-revert-v3-tv-dator.tap:9-31`). Focused control has 12 actual assertion reds (`source-revert-v3-carinas-windows.tap:9-302`), no setup/import/absent-method failure, cancellation or skipped case. Lifetime isolated red is separately attributed above. |
| H2 Binding seam/fixture ceiling | APPROVE with scope. Actual ReplicaHandler/registry/clock and actual PartitionService/Facts/Pause lifecycle are engaged (`Focused:95-177,215-286`). Cadence EventEmitter/status projections (`57-85`) are explicitly simplified semantic ports. Physical registered/native/store fixture supplies physical proof; shared deferral helper delegates the true membership await. |
| H3 Time/order/budget fidelity | APPROVE, R3 resolved. VirtualTimeSource measures existing cadence, not a larger production budget; microtask turns are explicit (`Focused:53-55,288-374`). Passive Physical removes post-heal actuation and retains original 10000ms/case bounds, fault sequencing, heal-before-disposal and no cleanup-only OPEN wait. |
| H4 Complete fields/hostile delay | APPROVE scoped proof. Resume request comes from actual OBSERVED Facts/release/Census (`Focused:123-129`), not planted build/origin/generation. Held envelope includes consumed typed identity/cause fields (`66-76`); throwing retry accessor proves zero consumption. Ordinary fixture status is classification/pre-origin only. No claim of general hostile-port JS hardening. |
| H5 Nonvacuity/cleanup | APPROVE. Physical victim and sibling have nonempty committed data and exact rows/cursor/log effects (`Physical:398-440,459-464`). Actual lifecycle gate retains registered service during shutdown and always releases pending work (`Focused:215-286`); last-host/null/uninitialized cases measure real timer/diagnostic observables. No fake OPEN or second release. |
| H6 Physical scope | APPROVE bounded evidence; whole HOLD. Four locked same-host paired lanes measure 17 files/219 runner assertions, including native three-replica LegA. Focused semantic fixtures are not native certification, and this cohort is not full corpus/main/startup/snapshot/FreshMG/TX1-crash proof. |

### Retry loops — 7

| Item | Current disposition and evidence |
| --- | --- |
| T1 Retained debt actually fires | APPROVE. Canonical held state enqueues existing timer at 1000ms (`Recovery:116-143,170-173`); no later event is needed (`Focused:288-362`; native paired deferred case). Timer registration failure is visible, not claimed scheduled (`Focused:621-643`). |
| T2 Unreadable/lifetime bounds | APPROVE, R1 resolved. Background debt is bounded by hosted service/handler lifetime, not an invented operation deadline (`Recovery:111-114,145-152,176-177,295-303`). Failed status attempts report/retry; missing origin/build stops operator-required (`195-204,226-229`). No absence grants release. |
| T3 Complete exit/observability | APPROVE, R1/R3 resolved. Held retains typed debt; healthy nonleader no timer; malformed/null/uninitialized unavailable event-driven; no-host discharges; origin/build operator-required; cutover exact answer; timer failure visible unscheduled stop; shutdown clears/joins (`Recovery:116-183,195-212,295-303`; `Focused:376-504,562-667`). No fabricated failure for normal no-service discharge. |
| T4 Circular suppression resolved | APPROVE bounded proof. CLOSED Pause refuses without read while Recovery independently reads held port (`Pause:49-51`, `Recovery:170-173,215-236`). Runtime group queue/not-before owns core entry (`Runtime:907-955,1369-1378`). Native source-only negative has 0 reconstructions/0 consensus after heal; candidate progresses. |
| T5 Rate/concurrency/map/report ceilings | APPROVE, R1/R3 resolved. Continuous held self-observations <=floor(T/1000)+1 plus coalesced real events; max-four background lanes, one partition pending key, one shared timer; unchanged signature reports <=floor(T/30000)+1. Full deterministic 30s count, zero retry reads, event burst, max-four and departure/reentry are green (`Focused:288-374,506-619`). This cap does not invent a new global cap on explicit fresh/operator APIs. |
| T6 Late success/re-observation | APPROVE preservation. Every attempt gets fresh current objects/status; canonical Cutover RUNS/census and Pause exact generation/proof/lifecycle remain (`Recovery:185-212`, `Cutover:302-320`, `Pause:75-104`). Retries cannot duplicate durable application or synthesize origin. |
| T7 Progress completion/ACK honesty | APPROVE. No ACK/counter reset fiction. Exact CUT_OVER comes only from aggregate current RESUMED release (`Recovery:208-212`, `Cutover:295-299`); runtime owns real attempts/replay/applied progress. Report/timer activity is not completion. |

### Formation circularity — 5

| Item | Current disposition and evidence |
| --- | --- |
| F1 Own-subsystem reads and degradation | APPROVE. Status port, durable origin and measured build precede canonical actual membership/control-owner/query/census reads and RPC (`Recovery:185-212`, `Facts:85-115`, `Cutover:138-168,200-299`). Missing dependencies remain typed/paused; no cache/raw alternative. |
| F2 Independent wake | APPROVE. Registry/consensus plus retained held fallback are independent of paused requests/CDC (`Recovery:116-143,170-173,239-249`). Passive native witness has no post-heal manual status read, typed sleep or external release call before canonical progress (`Physical:442-446`). |
| F3 Arriving writes remain gated | APPROVE. Existing CUTOVER_PAUSED/deferRetry/no-log assertions are preserved (`Pause:107-112`; `Physical:429-440`). Observation alone cannot widen current admission or retry policy. |
| F4 Total healthy progress budget | APPROVE bounded native pair; broader HOLD. Existing 10000ms assertion measures full heal/reconstruct/elect/replay/drain/resume. Candidate deferred case 1170.220289ms; control 10181.186015ms is real healthy exhaustion, not tuning noise. Wider startup/release failures and inherited fresh-create local retry remain unresolved outside this claim. |
| F5 No consistency bypass | APPROVE. Only canonical status/classification/scheduling/report and final pause lifecycle guard change. No tick, election, core access, proposal, forced origin, pause reset or second release path (`Recovery` and `Pause` source diff); native owner still performs sole-voter campaign/replay. |

All 50 current content dispositions are addressed. No extra adversarial-input category is silently claimed: hostile retry-field values are observationally inert, and no ingress decoder is changed. Existing trusted semantic-port/intrinsic assumptions and authentic current fact decoders are preserved, not certified afresh by these fixtures.

## Final measured treatment and falsifiers

| Locked host | Candidate | Identical-test source-only control |
| --- | --- | --- |
| tv-dator, native/runtime file | 1/1 file, 20/20 runner assertions | 0/1 file, 19/20; named deferred release bound red |
| carinas-windows, focused owner file | 1/1 file, 15/15 | 0/1 file, 3/15; 12 behavioral assertion reds |
| adam-laptop, runtime/open/replay/LegA cohort | 8/8 files, 101 | 8/8 files, 101 |
| lenovo-laptop, current apply/staging/admission/release cohort | 7/7 files, 83 | 7/7 files, 83 |
| Total | **17/17 files, 219** | **15/17 files, 219 total; two red files** |

Each measured file was attempt 1; the source-control adam thermal gate preceded execution and was not bypassed. Candidate scheduled-clock control passes 2455.165129ms; source control 2492.355897ms. Deferred native candidate passes 1170.220289ms, while control fails at 10181.186015ms with passive `{reconstructions:0,consensus:[]}`. Native source negative is a completed TAP assertion failure at the unchanged healthy bound, not a runner kill or cleanup mask.

Focused negatives are current lifecycle/outcome, cadence, debt, typed reporting and timer failure assertions. Raw case 13 explicitly detects an unwanted timer-registration exception at the owner seam, not a setup failure. Cases 11/12 under full source revert fail the earlier held premise; direct R1 cleanup negatives are the separately measured cee78b3 pair, not relabeled as final-test isolated proof. Both raw native and focused runs have zero cancelled/skipped/todo.

| Archived raw TAP | SHA256 |
| --- | --- |
| `candidate-v3-tv-dator.tap` | `cf14625f55392cecafe82252440be7a6323bad3a785a68e558b3487cda4613f2` |
| `source-revert-v3-tv-dator.tap` | `4ba3c4ba6d94f9f2d9bf7899fabe293c96eca19e8a193588c9331f180bdb413b` |
| `candidate-v3-carinas-windows.tap` | `a5cd1df62b79a18bd45abe3fbc51bb8ed8801d3c6df70d0f3711f6fd2b8c6a82` |
| `source-revert-v3-carinas-windows.tap` | `f18f2a648666ee006ffbf56373d56742ec0aba8973af0a9cd7e05094a27d09ee` |

## Static/duplication limits and remaining findings

The frozen-source syntax, four-file ESLint, strict source complexity/cognitive, file-size and six other scoped guideline checks pass (`candidate-v3-static-scoped-static.json`). The final impact/shard producer checks pass (`candidate-v3-static-impact-contracts.log`, `candidate-v3-static-shards.log`). These green checks do not clear the following reds:

1. **Admission/retry/owner interaction: inherited fresh-create local_retry_loop remains red.** Candidate `Recovery:269` is the unchanged pre-existing fresh-create do/while policy, not the new held-observation path. Source control reports the same rule; candidate's mechanical delay extraction does not change it. Scoped decision-boundary audit is still status 1 and is not waived.
2. **Owner interaction/recovery: whole dependency audit remains red with the same three findings on both inputs.** Missing orphan learner-ack import plus the two existing Facts/Pause/Census cycles are shown in candidate/control dependency logs. Separate C2 work can remove the orphan only when integrated and measured; it is not present in this input. No cycle or static gate is suppressed.
3. **Owner interaction/static closure: unused checks remain red.** Both inputs have 1463 unused exports against baseline 1416. General unused also names four unused files and four unlisted binary references; production unused check passes. No baseline is raised.
4. **Harness/duplication: full test ratchet remains red at 697 groups/26415 duplicated lines versus baseline 697/26369.** Production is 47/1462, equal to its baseline. I independently read both raw jscpd reports at the immutable candidate, verified report SHA256 `42b9c4e2f589430df133d8a6d1933e0938c57bcb589c9f6fecb6f9f92544094d` and `8ac8de45c6a0165f65bf288abd11ab8c68cb89b38ce792f3c954878552dc6170`, and inspected duplicate endpoints: **zero clone groups touch any of the four changed JS paths**. This resolves the changed-fixture duplication concern but does not turn the whole test ratchet green.
5. **Formation/harness proof ceiling: corpus/integrated startup/main evidence is still incomplete.** These 17 files prove the bounded recovery/lifecycle change. They do not close FreshMG, TX1 full crash/application snapshot custody, prior wider startup/release reds or full corpus acceptance. Whole-file elapsed duration alone is not evidence of a spent internal wait; the explicitly failed healthy native assertion is.

There are no remaining correction defects found within the reviewed recovery source/test scope. All inherited red findings remain owned and visible; none is an exemption. Content suitability for honest non-main WIP preservation is APPROVE, while Quest and main closure are HOLD.

The measured evidence supports behavioral receipt IDs 1–4: `deferred-healed-group-recovers-without-external-actuation`, `typed-held-status-retains-one-bounded-owner-wake`, `healthy-nonheld-service-remains-event-driven`, and `canonical-release-authority-and-durable-replay-preserved`, within the bounded claim above. Receipt 5's behavioral single-flight/replacement/shutdown/regression portion is measured, but its required static gate completion is false; retaining `single-flight-replacement-shutdown-and-regression-cone-preserved` as false is appropriate. Only the Solver may update receipts, remeasure the probe, decide Quest disposition or preserve/publish a checkpoint. This reviewer has done none of those actions.

