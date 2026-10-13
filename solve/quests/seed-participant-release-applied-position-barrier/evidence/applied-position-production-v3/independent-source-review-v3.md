# Applied-position production V3: independent complete content review

Verdict: **REVISE for one remaining S4 cleanup-consumer defect.** S1/S2/S3/S5/S6/S7 are structurally closed; O/R's own S4 iteration correction is sound, but final handler error custody still loses the same guarantees. Source content is not behavioral acceptance. This new ignored report is the only write: no tests/labs/checkers/producers, source/test/metadata/Quest/Git edits or disposition changes.

## Immutable binding and full-scope incorporation

Commit `7a755cf833b342c275ff5138e087a97832e28c2d`, tree `593dce3a455bb05e53e64a17b11282eab7b4c99d`, src tree `f414d6384776c04dfdaf7be70f84ce782bdd796d`, snapshot `/tmp/session-worktree-h7Pimg/tree`. Compared the whole18-path source/registry delta to `9ba9a1941b2326d0d0bcfa49c581cc2fcf74af8d` and corrections to immutable rejected `be8a54cbbd270501c50ac573c54f251dd9e4f35c`/preserved `d3b08b79aa7c09259bdcd9254e1686b65e53d414`. Unrelated uncommitted snapshot evidence is excluded.

Verified all18 committed source/registry hashes against source manifest `c39b4ce4467c1bd7a4a2878e9ac3ce96926808651876e6fa423397acea9ab987`; verified all55 archived artifact hashes and byte counts against root custody `e6ffe521eb61b694e34956192d7b59a853513bfb6f5107119d5108fae19e30bc`. Author report `507c2c5e9e1ff7d8e51e41a5ea4ac2f06ce170c7c97f4793558cb1aee2bb0bc7`, correction patch `81f26a62d6a72d4265afbddcba063ffc2a85627269f31aeb34607786168c4fb8`, whole patch `b73dd509334b9dedd397aa756ca5d49e6e31698c7485765dc6dd065dcdbd188c` are description/provenance, not behavioral proof.

Full48 V2 review `d62b7188e64747f7e9162644620a4eaa7278a5b28de91eba8730ecea3d764ffa` and its exact earlier complete reviews/design `9c35458737d7b4d0499bb26dd06edc0798f241f67de0e35db371609d0bbca36d` remain incorporated. Ten manifest paths are byte-identical to that reviewed V2: diagnostic clock owner; cleanup custody; canonical contract/generation owner; PA facts/admission; service constants/shutdown-entry; operation-port constants/event bridge; runtime constants/publication. I rechecked the relevant complete interactions, not only the patch. Eight changed paths were read against current source: O, CL, replica-handler constants, L, C, R, cutover constants and impact registry. No mutable source or author claim is treated as approval.

Aliases: O=`src/node/participant-release-applied-position-observation.js`; R=`src/node/replica-handler-participant-release.js`; L=`src/node/replica-handler-lifecycle-methods.js`; PA=`src/partition/partition-participant-transaction-pause.js`; K=`src/partition/partition-participant-release-contract.js`; CL=`src/node/participant-release-client.js`; HC=`src/node/replica-runtime-cleanup-custody.js`; C=`src/node/replica-handler-participant-cutover.js`; RT=`src/raft/raft-rs-runtime-owner.js`. Lines below bind7a755c.

## One remaining correction: S4 final consumer custody

HC123 newly appends observation cleanup errors with `failures.push(...cancelParticipantAppliedPositionObservations(handler))`. The new returned array is consumed through ambient Array[Symbol.iterator] and push. A suppressed iterator can omit actual retained observation failures, leave failures empty, and allow shutdown to clear owner state/report success. HC124's existing AggregateError constructor also consumes an iterable: protecting append alone can still reject with an aggregate whose errors omit the exact sentinels. O's captured arrayFlatMap/trusted Map snapshot does not protect this consumer.

Repair the integration at this existing cleanup owner using captured/bounded error append and trustworthy aggregate consumption, retaining exact causes including null. Do not add a parallel lifecycle store, cleanup driver or diagnostic error substitute. Keep current start cancellation before awaits, final cleanup retry, shutdown Promise rejection/reset and resource debt semantics. This is the outstanding portion of the already-reviewed S4 concern, not a new category or broad hardening requirement.

The causal test must pin actual remaining observer debt and exact first-error identity through the final existing handler AggregateError. Scope intrinsic mutation to final observation-error consumption after ordinary service teardown has engaged; otherwise pre-existing service/Map/Set/Array loops could absorb the attack and produce an unrelated teardown failure. Restore before harness flattening/cleanup. Existing unchanged unrelated service loops and global intrinsic resilience are not claimed repaired. No laboratory failure is asserted here: this is the exact source-backed path that can falsify the required custody contract.

## S1–S7 dispositions and sound owner interactions

- **S1 closed structurally:** O197 directly awaits the sole PA assessment. In that same continuation O198/173–184 checks active lifecycle/captured clock, calls synchronous R292–305 canonical adjudication, checks the watermark, and O200 terminalizes. There is no second decision await or consumer-side copied fence. R263–289 consumes the canonical PA generation projection and current status, rechecking lifecycle after the status read. Same-thread queued continuations cannot occupy the removed gap. Relevant reentrant owned reads remain fenced; no extra redundant third read is required.
- **S2 closed structurally:** R279 accepts monotonic applied advancement while preserving exact term/leader/configuration/membership generation/runtime/lifecycle/build/pause/current registry and port. Applied progress is the awaited watermark, not lineage. PA100–113 remains the sole stale-membership assessment: only same-lineage older membership is refreshable. O180–184 rereads on retained dirty only when needed, and an already-satisfying first answer remains one read. No cached status grants OPEN. NativeV10 and the alternate PA/R timing still need exact behavioral proof.
- **S3 closed structurally:** R44–45 and54–73 make missing/own-undefined release, attempt and origin false before dereference; R92–102 uses bounded indexed strict child copies. R137–158 returns safe existing INVALID before effects. Unavailable child identity is honestly null through R76–89. Actual whole unsafe payload/nonprimitive discriminator remains generic UNKNOWN_MESSAGE_TYPE(undefined) in L138–156; valid ordinary captured discriminator dispatches the original payload with existing cleanup barrier and correlation/attempt handling L158–173.
- **S4 partly closed:** R94's indexed internal scan cannot be redirected by Array iterator. O22–25 captures map/flatMap/some/own define; indexed resource acquire/retire and stable trusted Map snapshot O306–320/363–370 protect O's fixed seven slots/error collection. Exact releases retain first errors including null, pending/installing/releasing guards retire late handles, no append-only error history. HC's final new consumer above remains.
- **S5 closed:** CL52 requires both deadlines explicitly; sender81–82 passes its original owned ceiling, receiver O325–326 consumes the carried ceiling. One clock sample and remaining-first arithmetic CL53–68 are reused with5000ms cap; no arrival renewal/default/fallback. Captured scheduler O324/339 is used by all observer clock/timer/clear paths. A fired fixed-duration timer O279–285 always terminalizes with invalid/overall precedence, otherwise existing RPC MESSAGE_TIMEOUT; no early-callback timerless pending branch or rearm.
- **S6 closed for attributable values:** capture kinds live in existing replica-handler constants, missing-fact strings in cutover constants, local resource names/indices/error in O. C's changes are identical-value substitutions only. Frozen literal log retains K's four existing transaction states and R's existing replica-lifecycle label: no attributable new values. Those inherited human-gate reds remain HOLD.
- **S7 closed in authored registry:** actual L/shared constants are present in top contract and application-and-progress endpoint. Pair retains exactly two original endpoint IDs; native primary and three ordinary shared-entry witness families appear once in both test forms. Canonical metadata refresh is generated seal only; final test-scope changes and selection must be refreshed again and measured, not inferred from this registry content.

O350–360 saves the exact stored inner Promise before a matching settled-debt cleanup retry, even if the map is removed in that call; fully discharged later calls may start afresh. Matcher O56–65 consumes already validated immutable canonical intent including both deadlines, attempt, generation and origin. No permanent memo store or caller clock renewal. O249–271 and HC90 cancel exact registry/service/handler lifetime before held-read waits; old asynchronous tails check active identity and cannot remove a successor. Inherited ordinary PA/recipient pre-await-only lifecycle races remain explicitly excluded; current OBS paths are fully fenced at consuming continuation.

PA238–267 remains the final OPEN authority: after fresh facts/full classifier, current lifecycle/generation/status has no await before mutation, and wrong-ID/current OPEN policy is unchanged. C70–78 inserts one bounded observation phase after actual ENABLE. C292–310 then takes a fresh full census, rebuilds final query proof from finalLocal, applies the complete canonical classifier, checks current control owner and sends RESUME. No watermark implies query/drain/topology completion; older origins cannot authorize around later work. Equal proof values alone do not prove fresh construction; source ordering is the structural evidence, final query witness still pending.

RT1230–1270 records actual completed observation then emits payload-free APPLIED_PROGRESS once per advanced applied position or first published runtime generation. It retains a marker separate from status-read cache. Earlier accepted exact runtime application/finishReady/drainReady/announce order and operation-port event wiring stay unchanged. Service shutdown-entry167–171 is inside the owned async release body after flags/settlement installation; a throwing EventEmitter listener rejects/resets custody instead of stranding settlement. No transport ACK, tick/election/proposal behavior, source read repair or universal progress driver changed.

## All48 current dispositions

| Item | Source-content verdict / evidence |
| --- | --- |
| Admission1 same state | APPROVE R105–158 immutable canonical grammar feeds O/R; R292–305 fence now at actual O198 consumption. |
| Admission2 transient/terminal | APPROVE R279 monotonic progress; PA100–113 typed refreshable lag vs terminal unavailability; missing grammar INVALID R54–73/151. |
| Admission3 budgets | APPROVE CL52–68/81–82 and O324–342: explicit original/carried ceilings,5000ms cap, no renewal. |
| Admission4 reason shape | REVISE HC123–124 exact error custody; ordinary typed release/generic envelopes R76–89/L138–173 correct. |
| Admission5 release event | APPROVE O249–271/HC90 cancellation structure; REVISE final debt HC123–124; measured latency pending. |
| Admission6 freshness | APPROVE direct PA await O197 plus sync canonical R current context; no separate decision await or cached grant. |
| Admission7 honest identity | APPROVE safe captured INVALID IDs R76–89 and typed MISSING_FACT strings; no invented child identity. |
| Retry1 wake/fire | APPROVE RT1264–1270/O212–220 and fixed terminal timer279–285; source event wake independent of admission. |
| Retry2 unreadable bound | APPROVE PA144–161 terminal typed absence/unreadable; O159–170/275–303 preserves original cap; REVISE debt error consumer. |
| Retry3 loud exits | REVISE HC hidden/missing actual errors; O68–72/135–141 preserves typed unavailable/cleanup debt otherwise. |
| Retry4 circular waiting | APPROVE Oregistry/service immediate terminal/HC90 before waiting recovery/tasks; no timerless branch. |
| Retry5 pressure ceiling | APPROVE O187–220 single refresh/dirty bit, fixed7 resources, one cap; REVISE HC discharge honesty. Existing recovery max4/cadence unchanged. |
| Retry6 late success | APPROVE inactive result O174 and exact map deletion122–126/settled join350–360; no duplicate mutation. |
| Retry7 reset/ACK | APPROVE RTactual publication marker/operation event; no step/send ACK promoted to applied progress or release. |
| Concurrency1 synchronous claim | APPROVE validated R137–158 before O345 map claim/install; keyed by actual replica, no async-only gate. |
| Concurrency2 await/use | APPROVE O197–200 one await then sync R263–305 canonical adjudication/use; PA final OPEN238–267 retains current fence. |
| Concurrency3 one winner | APPROVE O350–360 stored inner Promise/terminal answer144–149; matching settled debt is not renewed/memoized forever. |
| Concurrency4 reentry/timers | APPROVE slot.pending/releasing/installing100–149/222–320 late-handle rules; REVISE final error aggregation under intrinsic mutation. |
| Concurrency5 identity scope | APPROVE captured handler/service/port/scheduler/request339–345; exact replica map check122–126, not address. |
| Formation1 subsystem reads | APPROVE PA sole build/membership/status/origin/work/query facts131–167; C existing control/RPC reads, no CDC-dependent new owner. |
| Formation2 independent progression | APPROVE RTpublication + Odirty retention/refresh; final native stale/fresh source treatment pending. |
| Formation3 clients gated | APPROVE OBS only watermark O183; C fresh full query/census/control before PA resume; no OPEN from wake or transport success. |
| Formation4 total window | HOLD native/startup latency/full-body evidence; hard RPC/overall budgets unchanged CL/O, no healthy expiry waived. |
| Formation5 no bypass | APPROVE no tick/campaign/sleep/proposal reset/raw-core/cached OPEN; transport/runtime scheduling unchanged exact hashes. |
| Harness1 right red | HOLD final source/test pair; qualified original native negative remains9ba9/c128 only; new controls require retained-feature be8/treatments. |
| Harness2 seam fidelity | HOLD corrected F/P/R content and live candidate; exact source owner/CP/native boundaries remain explicit. |
| Harness3 time geometry | APPROVE safe captured arithmetic/fixed firing/final predicate source; physical clock/queue/lab proof pending. |
| Harness4 complete fields | APPROVE strict release/attempt/target/origin/deadline tuple R54–158, absent-child typed refusal; final control tests must actually cover these. |
| Harness5 nonvacuity | HOLD native same-attempt N/K/dirty treatment, S1/S2 causal schedules, HC final errors and query/work controls. |
| Harness6 live ceiling | HOLD candidate/native/startup/full helper cone/corpus/Quest/main;55 archived static artifacts are not behavior proof. |
| Owner1 sole semantic owners | APPROVE PA facts/K domain/R current fence/CL cap/O observation resources/C full release/PA OPEN; REVISE HC final custody consumer. |
| Owner2 typed boundaries | APPROVE Lcapture/generic vs safe releaseINVALID and R assessment adapter; no alias or alternate verdict. |
| Owner3 paired invariants | HOLD same real witness safety then application/release; structural C final classifier/order and O one-read rule sound. |
| Owner4 stale→fresh | APPROVE R279 + PA109–113 + O180–184; actual source-driven alternate ordering proof pending. |
| Owner5 pressure/backoff | APPROVE original cap/singleflight and current runtime not-before untouched; REVISE HC cannot falsely complete retained debt. |
| Owner6 release/wake custody | REVISE HC123–124; O retains exact resources/causes and actual lifecycle wakes otherwise. |
| Owner7 projections | APPROVE status cache/event/clock/diagnostics supply evidence only; canonical full census/PA OPEN still authority. |
| Owner8 fingerprints/treatment | APPROVE18 committed blob+55 artifact hashes only; behavioral pair/dirty-only treatment exact final bytes HOLD. |
| Owner9 no duplicate/escape | APPROVE shared CL arithmetic explicit args, existing PA projection/R fence, indexed O resources; no fallback grant, extra driver or copied classifier. |
| Owner10 registration | APPROVE both existing forms/two endpoint IDs/L+constants+ordinary witnesses/native primary; final canonical selection/test metadata pending. |
| JS1 numeric lattice | APPROVE captured safe signed diagnostic owner/strict absolute CL and primitive scalar K/R; remaining-first arithmetic cannot overflow, no unsafe timer range. |
| JS2 own properties | APPROVE Ustrict copy before discriminator plus indexed nested R92–102; inherited/proxy/accessor/symbol whole inputs refuse. |
| JS3 traps/TOCTOU | APPROVE frozen captured top/nested intent and canonical sync consuming fence; trusted PA output is not recursively decoded. |
| JS4 prototype mutation | REVISE new HCreturned-error consumer under Array iterator; R/O own bounded/captured Array operations repaired. Unchanged global Map/Set assumptions unclaimed. |
| JS5 boxed/exotic | APPROVE type pins R54–114 before Khash; unsafe whole discriminator generic, trusted generation domain consumed from K by PA148–150. |
| JS6 mutable methods | REVISE HC123 push/spread and HC124 aggregate iterable; O22–25/R94 captured/indexed boundaries correct. |
| JS7 serialization coercion | APPROVE primitive-before-hash R105–114, canonical K identity owner reused; no new caller coercion/fallback serializer. |
| JS8 authentic arrays | Scoped N/A: no new external peer-array decoder; current membership owner preserved. Internal error-array consumption is JS4/6 defect, not waived. |

## Static and proof ceilings

Author retained syntax/ESLint/cycle/JSON/impact/binding/diff commands are hash-bound; the ambient checker scanned zero source files by its configured governed surface and provides no source intrinsic proof. Final scoped literal output has five inherited human-gate findings; strict complexity six inherited findings and cognitive one inherited cutover finding remain red. New O/R/capture-kind code has no new scoped complexity/literal debt, but inherited/global gates are not green. No baseline was increased. New corrected control files, exact canonical metadata, full helper consumers, same-host native positive/source-only/dirty-retention treatments, real startup, dependency/duplication/corpus and exact-main certification are still HOLD. No Quest receipt or landing disposition is approved by this content report.
