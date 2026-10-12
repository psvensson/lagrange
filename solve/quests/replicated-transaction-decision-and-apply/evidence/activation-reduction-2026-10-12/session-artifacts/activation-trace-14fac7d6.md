# Activation trace at 14fac7d6: verification of claims C1..C6

Scope: the seed-startup participant release (`releaseSeedParticipantCohorts`) at source snapshot
`14fac7d6ef64881daa7a0d266a272b724dfe640a`, read-only on the lanes, instrumented in the scratch
worktree `/mnt/data/peter/projects/.worktrees/activation-trace-14fac` (HEAD = 14fac7d6e). All source
line numbers below are the PRISTINE 14fac7d6 lines (verified with `git show HEAD:<file>`), not the
instrumented file's lines. Timestamps are seconds relative to the `seed.plan` event of each run.

## 0. Evidence

| Item | Path | sha256 |
| --- | --- | --- |
| Instrumentation diff (runs 1, 2) | `.../scratchpad/activation/instrumentation-trace.diff` | `cf6ffb10a70dc900d02401c6610feadfa9551e8f87decba1a704f720d641dfba` |
| Instrumentation diff (run 3; = runs 1-2 diff + one env-gated pre-sleep, default off) | `.../scratchpad/activation/instrumentation-trace-run3.diff` | `0949f7a1d2c789e84aec072fb1df82b0550275a296825a901fb3b2c44a16bd71` |
| Run 1 runner output / full child stderr (8129 trace lines) | `oracle-run-1.log` / `oracle-run-1.stderr.full.log` | `33bfd929…489a9d` / `5460779c…a19df0a6c2976` |
| Run 2 runner output / full child stderr (8101) | `oracle-run-2.log` / `oracle-run-2.stderr.full.log` | `9798b7af…95ad84` / `e6bfbeef…7ff16af` |
| Run 3 runner output / full child stderr (21358) | `oracle-run-3.log` / `oracle-run-3.stderr.full.log` | `3aa323bb…958260` / `1473f39a…b0a1300` |
| Retained runtime roots (control DBs readable) | `/tmp/lagrange-pgwire-command-tags-{f0jXSU,36tkyU,EY8sRj}/node-data/partitions/sql_transactions-p1/` | - |
| Retained round-11 control DBs (extracted) | `.../scratchpad/activation/retained-r11/sql_transactions-p1-r{1,2,3}.db` | tarball `8a60d29c…` |
| Analysis scripts | `view.mjs`, `stats.mjs`, `tables.mjs`, `lag.mjs`, `readrow.mjs`, `run3.mjs`, `instrument.mjs` (same directory) | - |

(`...` = `/tmp/claude-1000/-mnt-data-peter-projects-lagrange/7d226e8e-2620-4ebc-b06e-31e1a39b76b9`.)

Runs: all three through `npm run -s test:file -- test/integration/pgwire-command-tag-real-engine.integration.test.js`
(runner accepted the file; lane "exclusive", thermal ok, load < 2.3 before each). The runner prints only a
bounded stderr excerpt; the full child stderr was taken from `.tap/test-results/.../*.tap.stderr`.

- Run 1 and run 2: production timing, trace probes only (console.error JSON lines). Both RED in the seed phase.
- Run 3: same probes plus ONE measurement perturbation, clearly labelled and env-gated
  (`DIAG_DEPENDENT_PRE_SLEEP_MS=50`: a 50 ms sleep before each dependent's FIRST seed attempt; the
  variable is unset in runs 1-2, so they are unperturbed). Run 3 is not production timing; it exists to
  make the dependent-success arm and the per-dependent cost measurable. It completed the whole seed loop
  and then went RED later in the test (see section 6).

## 1. Verdicts

### C1 - CONFIRMED (early-returns identified per attempt)

`releaseControlOwnerFirst` (replica-handler-participant-cutover.js:250-291) calls
`observeCurrentControlOwner` (:293-322); a `null` falls through to the nested
`requestParticipantRelease` of the control (:270-275), which is a full `runCutoverAttempt` on the control
(depth 2 in the trace). The early-return that produced `null`, per dependent attempt:

| Run | Dependent | Attempt | Early-return | Evidence (trace) |
| --- | --- | --- | --- | --- |
| 1 | artifact_payload_chunks-p1 | #1 | `:314` `releaseCensusDefect(...) !== null` -> `release_drain_pending` | `42.223 observe.return line=314 members r1:a17/c17/l17, r2:a16/c16/l17, r3:a16/c16/l17` (followers had not applied the control's own CONFIRM idx 17; `isReleaseDrained` facts.js:65-70 requires applied=commit=last) |
| 1 | same | #2..#205 (204x) | `:305` `census.some(facts.paused === true)` | `observe.return line=305 members r1/r2/r3 "observed paused"` - every control member is CLOSED after the first nested cutover (leader: `newPause` gen 124->128 at 42.224 from cutover.js:590; followers: PAUSE action, release.js:406, gens 129/130 at 42.237) and nothing ever reopens them |
| 2 | artifact_payload_chunks-p1 | #1 | `:314` -> `release_drain_pending` | `1.501 observe.return line=314 members r1:a17/c17/l17, r2:a16/c16/l17, r3:a15/c15/l16` |
| 2 | same | #2..#218 (217x) | `:305` paused | as run 1 |
| 3 (perturbed) | all 44 seed dependents | every attempt | none: `:316` CUT_OVER returned | `observe.return line=316 why=ok` 88 times; zero nested cutovers in the seed phase |
| 3 (post-seed, fresh-create) | tbl-c75211…-p1 #3 and tbl-119b90…-p1 | first | `:314` -> `query_transaction_drain_pending` (members fully drained a712/c712/l712; the control's `queryCensus` was not CLEAR and `observeCurrentControlOwner` passes no `queryDrainProof`, contract.js:106-115) | `71.354` and `77.417 observe.return line=314 defect=query_transaction_drain_pending` |
| retained round 11 | artifact_payloads-p1 (dep #2), call_activation_leases-p1 (dep #3) | first | not instrumented; by the same mechanism `:314` (drain) is the only candidate for the first attempt and `:305` (paused) for the rest, consistent with `firstRefusal` in oracle-diagnostic-cohort.log.txt | inferred, not measured |

Other early-returns (`:296` own unavailable/origin null, `:302` cohort null, `:309-311` authorization
mismatch) never fired in any run (0 occurrences each).

Timing of the race (runs 1 and 2): the leader applies the control's CONFIRM (idx 17) and the dependent's
observe reads the cohort 3 ms later; the follower apply lag on the control group is p50 3 ms, max 15-20 ms
(421 and 373 paired apply events). The race was lost in both unperturbed runs; the retained round-11 run
won it once (dep #1 released with no RETIRE before idx 18) and lost it for dep #2 and dep #3.

### C2 - CONFIRMED (source; witnessed live in run 3)

`executeReleaseAction` SHARE (replica-handler-participant-release.js:168-184) calls
`publishParticipantReleaseLocalCurrent(service, request.controlAuthorization.authorizationId, target, controlOwnerOf(request))` (:179-181)
on each CONTROL member service; `controlAuthorization.authorizationId` is the dependent's authorization
id built in `authorizeDependentRelease` (cutover.js:344-345, 362-363 = `releaseAuthorizationId(root, dependent.release.releaseId)`).
Run 3 seed phase: 45 SHARE publishes per control replica; on r1 the CURRENT chain is
`4b9b71ed8b (control's own, 0.218) -> 22010ccbcf (artifact_payload_chunks) at 1.523 -> 11dd69bb0c (artifact_payloads) 1.962 -> 1b5ea4e3a7 (call_activation_leases) 2.407 -> … -> 6b9ec97295 (wasm_operations) 19.593`,
each `local.publish caller=executeReleaseActionInner (release.js SHARE)`, `previous=<prior dependent's id>`.
Runs 1-2 could not witness it (no dependent was ever authorized). Note that the RESUME action
(release.js:307-308) republishes the control's OWN id on the control members at the control's own cycle
(run 1: 42.152-42.177), so the overwrite by SHARE happens only when a dependent is authorized.

### C3 - PARTLY

Confirmed: `runCutoverAttempt` calls `raiseParticipantCutoverPause(service)` (:590) before
`retireParticipantReleaseBeforeReplacement` (:601-602); when the admission is OPEN this is `newPause`
(pause.js:38-41 -> :22-32), which calls `invalidateParticipantReleaseLocalCurrent` (local-current.js:22-32:
CURRENT -> RETIREMENTS obligation, CURRENT deleted) and bumps the admission generation; the retirement
helper then retires what the obligation names (retirement.js:135-145, 168-173).
Live: run 1 `42.224 local.invalidate current=c3f822e1db gen124 -> obligation retained` + `admission.newPause gen 128 previousState=open caller=runCutoverAttemptInner`, then `retire.obligation source=retained` and RETIRE idx 18.
Run 3 post-seed: `71.355 invalidate current=aacf6912a9` -> RETIRE idx 713 (a dependent's id, i.e. the retained run's idx 31/59 shape) and `77.417 invalidate current=f5331500c6` -> RETIRE idx 767.

Not as stated: this happens only on the FIRST attempt after the control was OPEN, not "at the start of
every attempt". `raiseParticipantCutoverPause` is a no-op when the admission is already CLOSED (pause.js:40),
and every service is born CLOSED (pause.js:34-36, 43-48; `attempt.wasClosed=true` on the very first seed
attempt of every partition). Run 1: `control wasClosed=false` exactly once; `admission.newPause previousState=open`
3 times total (r1, r2, r3). On every later attempt the obligation comes from `reconstructDurableRetirement`
(run 1: `retire.obligation source=reconstructed` 204x, `retained` 1x, `none` 2x), which is C4's path, so
"idx 31 and 59" are each the single first-attempt RETIRE of a nested cycle, not a per-attempt event.
The dependent's own `raiseParticipantCutoverPause` (:590) never invalidates anything (dependents are born
CLOSED with CURRENT=null; run 1: 205 `local.invalidate current=null`).

### C4 - CONFIRMED for the retained run (byte-exact), and a sibling arm found live

Retained round 11 (durable rows read from the three control DBs; all three identical):
`controlRevision=54`, control slot = `RETIRED` for `f1aa6015…` (`authorizationRevision 48`, `retirementId 23b33c7c…`, `retirementIndex 59`, dependentRelease `artifact_payloads-p1`),
durable RESUME authorization = `controlAuthorizationId b24ae48e…`, `controlAuthorizationRevision 35`, `authorizationIndex 41`, targets `r1:ag128 r2:ag129 r3:ag130`, `pauseGeneration 1`.
`reconstructDurableRetirement` (retirement.js:58-90) with `retiredTarget` = r1's entry (ag128) and
`sha256(JSON.stringify([b24ae48e…, retiredTarget]))` = `6a3a59c5ba…` = the `decisiveRepeat.retirementId`
of diagnostic.json (219 entries, idx 60-278, `expectedControlRevision 54`). The current target differed
(admissionGeneration moved by the nested `newPause`), so `:76-78` did not return null.
`applyRetire` (partition-participant-release-apply.js:375-473): the replay test `:385-397` fails
(`existing.retirementId 23b33c7c ≠ 6a3a59c5`, no claim/receipt carries it); the branch `:398-404` fires on its
second clause: `existing !== null && existing.authorizationId (f1aa6015) !== command.authorizationId (b24ae48e) && existing.state (RETIRED) !== CONFIRMED`
-> `STALE` with `controlRevision 54` (`before.controlRevision 54 === expected 54`, so not the first clause).
The helper throws `Participant release retirement held replacement` (retirement.js:170-173),
`runParticipantCutover` converts it to UNAVAILABLE (cutover.js:785-786), `releaseControlOwnerFirst`
answers `current_control_owner_fact` (:280-288), the seed loop sleeps `retryAfterMs=100` (seed-workflow.js:305-312).
Witnessed live in run 3 (post-seed): `77.988 reconstruct why=reconstructed authorizationId=06756a4fe4 rev605 retired ag138 current ag142`,
RETIRE idx 768-1427 (660x) `auth=06756a4fe4 exp=622 => STALE`, slot `RETIRED/f5331500c6/rev622` before and after;
each `retire.answer outcome=release_generation_changed missingFact=committed_control_retirement` ->
`attempt.throw "Participant release retirement held replacement"` -> `run.caught` (660x).

Sibling arm (runs 1 and 2, seed phase): when the retired record in the slot names the control's OWN id,
the reconstructed RETIRE replays as RETIRED (`:388-397`, same `retirementId aee430a30e`) and the re-cycle
instead dies one step later at `applyReserve` (`:152-163`, clause `:155-156`
`existing?.state === RETIRED && existing.authorizationId === command.authorizationId`), because the control's
own authorization id is deterministic (`releaseAuthorizationId(root, releaseId)`, cutover.js:342-345) and the
slot is `RETIRED/c3f822e1db/rev14`. Run 1: idx 18 RETIRE -> RETIRED rev14; idx 19 RESERVE c3f822e1db exp14 -> STALE;
then 204 x RETIRE(replayed) + 201 x RESERVE(STALE) until the deadline (last idx 423); run 2: 216 + 141 (last idx 375).
So "219 refused RETIRE entries" is the retained run's shape; the unperturbed live shape is
"RETIRE replayed + RESERVE refused" pairs. Both arms start at the same place: the nested control cutover
retires the live control authorization and then cannot re-grant under the same ids.

### C5 - CONFIRMED (and not benign when it occurs inside `observeCurrentControlOwner`)

Run 1 attempt #1 on the control: `41.841 attempt.stage stage=post_enable_release_census defect=release_drain_pending work r1:a3/c3/l3 r2:a2/c2/l3 r3:a2/c2/l3`
(idx 3 = the ENABLE origin entry; `isReleaseDrained` facts.js:65-70 via `releaseCensusDefect` at cutover.js:734-743).
Identical in run 2 (`1.111`) and run 3, and in every dependent of run 3 (44/44 first attempts refused at this
stage, second attempt cut over). Cost: 33 ms attempt + 100 ms sleep. The same drain rule is what returns
`null` from `observeCurrentControlOwner` at `:314` three milliseconds after the control's CONFIRM (C1), and
that `null` is what starts the nested cutover that retires the live authorization; the transient is cheap
only on the dependent's own path.

### C6 - PARTLY (serial/one-deadline/45 partitions confirmed; "at least one re-cycle per dependent" FALSIFIED; "structurally insufficient" not supported by measurement)

- Serial under one deadline: seed-workflow.js:276-313, one `deadlineAtMs = seedStartupInvocation.deadlineAtMs`;
  `seed.plan remainingMs 29979/29984/29992` at loop start, so the full 30 s (`leadershipWaitTimeoutMs`,
  bootstrap-constants.js:395) is available to the loop. CONFIRMED.
- 45 partitions (`seed.plan count=45`, 135 partition services = 45 x RF3 on the single node; 45 directories
  under `node-data/partitions/`), order: control first, then alphabetical (seed-workflow.js:270-274). CONFIRMED.
- "Each dependent costs at least one full control re-cycle": FALSIFIED. When observe returns at `:316`
  the dependent costs one AUTHORIZE on the control (13 control-log entries: RESERVE, 3 x CLAIM, 3 x SHARE,
  FINALIZE, DISPATCH, 3 x RECEIPT, CONFIRM) and no PAUSE/RETIRE on the control. Run 3: 44/44 dependents,
  0 nested cutovers, control PAUSE/RETIRE cycles per dependent = 0. The retained run's dep #1 (idx 18-30)
  is the same shape.
- Budget: run 3 measured 44 dependents in 19.33 s (378-1288 ms each, median 418 ms, mean 439 ms, 2 attempts
  each; the 1288 ms outlier is artifact_payload_chunks-p1 with 8 `not_leader` answers while its replica
  elected), finishing with 10.2 s of the 30 s left (`wasm_operations-p1 remaining 10181 ms`). With the
  measured 418 ms/dependent, 44 dependents project to 18.4 s. The budget is therefore not structurally
  insufficient on this host without the wedge. It IS exhausted whenever one nested control cutover
  happens, because that path never completes (C4), not because of its cost (a successful re-cycle costs
  ~230-300 ms: run 3 `71.780-72.009` cut_over in 229 ms; retained idx 32-45).
- Caveat: run 3's success is under a 50 ms perturbation; at production timing (runs 1, 2) the first
  dependent's observe lost the 3 ms race both times, so the unperturbed outcome is the wedge at dependent #1.

## 2. Dependent-side timeline (seed phase)

Columns: partition | attempt | start (s, rel. seed.plan) | path (observe early-return or "nested") | nested control answer | dependent answer | time spent (ms).

Run 1 (unperturbed), control first:

| partition | attempt | start | observe | nested control attempt | dependent outcome | ms |
| --- | --- | --- | --- | --- | --- | --- |
| sql_transactions-p1 | #1 | 0.001 | (control) | - | release_drain_pending @post_enable_release_census | 33 |
| sql_transactions-p1 | #2 | 0.136 | (control) | - | cut_over, auth c3f822e1db rev 8 | 277 |
| artifact_payload_chunks-p1 | #1 | 0.413 | L314 census_defect release_drain_pending | release_generation_changed: committed_control_reservation (RETIRE idx18 ok, RESERVE idx19 STALE) | release_fact_unavailable: current_control_owner_fact | 29 |
| artifact_payload_chunks-p1 | #2 | 0.543 | L305 all paused | release_drain_pending @post_pause_drain (r2 a19/c19/l20) | same | 41 |
| artifact_payload_chunks-p1 | #3 | 0.685 | L305 | release_generation_changed: committed_control_reservation | same | 53 |
| artifact_payload_chunks-p1 | #4-#134 (131x) | 0.838..19.748 | L305 | same (RETIRE replayed + RESERVE STALE each) | same | 23-76 |
| artifact_payload_chunks-p1 | #135 | 19.873 | L305 | release_drain_pending @post_pause_drain | same | 37 |
| artifact_payload_chunks-p1 | #136-#168 (33x) | 20.011..24.637 | L305 | committed_control_reservation | same | 24-57 |
| artifact_payload_chunks-p1 | #169 | 24.766 | L305 | release_drain_pending @post_pause_drain | same | 16 |
| artifact_payload_chunks-p1 | #170-#204 (35x) | 24.883..29.828 | L305 | committed_control_reservation | same | 22-60 |
| artifact_payload_chunks-p1 | #205 | 29.969 | L305 | release_fact_unavailable: release_deadline | same | 16 |
| seed.partition.end | | 29.572 s after start | 205 attempts | | `Seed participant release failed` | remaining -6 ms |

Attempt cadence 145 ms mean (117-177): 100 ms sleep + 45 ms attempt (depth-1 mean 45 ms, nested mean 41 ms).

Run 2 (unperturbed): identical shape; control 2 attempts (32 ms drain-pending, then 286 ms cut_over);
artifact_payload_chunks-p1 218 attempts (#1 L314 drain, #2-#218 L305 paused), nested answers 141 x
committed_control_reservation + 76 x post_pause_drain release_drain_pending + 1 release_deadline; cadence
136 ms; `seed.partition.end elapsed 29565 remaining 0`.

Run 3 (perturbed): every seed partition released. Per partition: attempt #1 `release_drain_pending
@post_enable_release_census`, attempt #2 `cut_over`; observe L316 twice per dependent; nested = 0.

| partition | end (s) | ms | partition | end (s) | ms |
| --- | --- | --- | --- | --- | --- |
| sql_transactions-p1 (control) | 0.460 | 460 | package_registry_mappings-p1 | 11.034 | 422 |
| artifact_payload_chunks-p1 (10 attempts: 8 not_leader) | 1.748 | 1288 | package_registry_overrides-p1 | 11.452 | 418 |
| artifact_payloads-p1 | 2.184 | 436 | partitions-p1 | 11.888 | 436 |
| call_activation_leases-p1 | 2.630 | 446 | replica_operations-p1 | 12.318 | 430 |
| call_cell_reduce_results-p1 | 3.036 | 406 | schema_migration_partitions-p1 | 12.740 | 422 |
| call_cell_reduce_slots-p1 | 3.485 | 449 | schema_migrations-p1 | 13.147 | 407 |
| code-p1 | 3.897 | 412 | schema_operations-p1 | 13.562 | 415 |
| config-p1 | 4.296 | 399 | service_bindings-p1 | 13.978 | 416 |
| contexts-p1 | 4.714 | 418 | service_definitions-p1 | 14.375 | 397 |
| control_plane_publications-p1 | 5.131 | 417 | service_endpoints-p1 | 14.783 | 408 |
| debug_breakpoints-p1 | 5.583 | 452 | service_install_failures-p1 | 15.240 | 457 |
| debug_sessions-p1 | 5.997 | 414 | service_installations-p1 | 15.673 | 433 |
| debug_snapshots-p1 | 6.427 | 430 | service_packages-p1 | 16.083 | 410 |
| indices-p1 | 6.864 | 437 | service_partition_access-p1 | 16.498 | 415 |
| inter_group_latencies-p1 | 7.275 | 411 | service_revisions-p1 | 16.918 | 420 |
| latency_groups-p1 | 7.721 | 446 | service_timers-p1 | 17.296 | 378 |
| live_queries-p1 | 8.127 | 406 | services-p1 | 17.719 | 423 |
| logs-p1 | 8.537 | 410 | sql_transaction_participants-p1 | 18.144 | 425 |
| message_groups-p1 | 8.924 | 387 | sql_write_operations-p1 | 18.551 | 407 |
| module_dependency_locks-p1 | 9.313 | 389 | storage_reservations-p1 | 18.951 | 400 |
| module_manifests-p1 | 9.750 | 437 | tables-p1 | 19.369 | 418 |
| node_endpoints-p1 | 10.202 | 452 | wasm_operations-p1 | 19.794 | 425 (remaining 10181) |
| nodes-p1 | 10.612 | 410 | | | |

## 3. Control partition log by index, with attribution and apply outcome

Format: idx | type | authorizationId[:10] | expectedControlRevision | retirementId[:10](retired admissionGeneration) | apply result | control row before -> after (state/auth/revision; `resume=` = durable RESUME authorization text).
`RESUME_AUTHORIZED`/`RESUME_DISPATCHED` are the literal `RELEASE_CONTROL_STATE` values.

Run 1 (leader r1; r2/r3 apply the same entries 0-20 ms later with identical results):

| idx | type | auth | exp | retirement | result | row before -> after | produced by |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2 | PAUSE_PARTICIPANT_ADMISSION | - | - | - | PAUSED (pauseGeneration 1) | empty rev0 | control own attempt #1, `pauseParticipantAdmission` cutover.js:643 |
| 3 | (GENERATION_ORIGIN, not a release command) | | | | origin index 3 | | control own attempt #1, ENABLE |
| 4 | RESERVE | c3f822e1db | 0 | - | RESERVED | empty -> RESERVED/c3f8/rev1 | control own attempt #2, AUTHORIZE (self) |
| 5,7,9 | PUBLISH_CLAIM | c3f822e1db | 1,3,5 | - | RESERVED | rev2, rev4, rev6 | CLAIM r1, r2, r3 |
| 6,8,10 | RECORD_SHARE | c3f822e1db | 2,4,6 | - | RESERVED | rev3, rev5, rev7 | SHARE r1, r2, r3 (publishes CURRENT=c3f8 on each) |
| 11 | FINALIZE | c3f822e1db | 7 | - | AUTHORIZED | -> RESUME_AUTHORIZED/c3f8/rev8 (authorizationRevision 8) | |
| 12 | DISPATCH | c3f822e1db | 8 | - | DISPATCHED | -> RESUME_DISPATCHED rev9 | |
| 13 | RESUME_PARTICIPANT_ADMISSION | - | pauseGen 1 | - | RESUMED | resume=c3f8@8 recorded, authorizationIndex 13 | `resumeParticipantAdmission` cutover.js:409 |
| 14,15,16 | RECORD_RECEIPT | c3f822e1db | 9,10,11 | - | DISPATCHED | rev10..12 | CONFIRM action, receipts r1-r3 |
| 17 | CONFIRM | c3f822e1db | 12 | - | CONFIRMED | -> CONFIRMED/c3f8/rev13 | control cut_over at 0.413 |
| 18 | RETIRE | c3f822e1db | 13 | aee430a30e(ag124) | RETIRED | CONFIRMED -> RETIRED/c3f8/rev14 | dep#1 attempt #1 nested control attempt, obligation `retained` (from CURRENT) |
| 19 | RESERVE | c3f822e1db | 14 | - | STALE (apply.js:155-156) | unchanged | same nested attempt, AUTHORIZE (self) |
| 20 | RETIRE | c3f822e1db | 14 | aee430a30e(ag124) | RETIRED (replayed, :388-397) | unchanged | dep#1 attempt #2, obligation `reconstructed`; attempt then refused at post_pause_drain, no RESERVE |
| 21 | RETIRE | same | 14 | same | RETIRED (replayed) | unchanged | dep#1 attempt #3 |
| 22 | RESERVE | c3f822e1db | 14 | - | STALE | unchanged | dep#1 attempt #3 |
| 23..423 | alternating RETIRE(replayed) / RESERVE(STALE) | | 14 | | | unchanged (rev 14 to the end) | dep#1 attempts #4..#205; only-RETIRE attempts at 285-286 and 352-353 (post_pause_drain refusals) |

Totals run 1: 421 release entries, last index 423, 204 RETIRE replayed + 201 RESERVE STALE after idx 19.
Run 2: same through idx 19; then 216 RETIRE replayed + 141 RESERVE STALE, last index 375 (76 nested
attempts stopped at post_pause_drain, appending only the RETIRE).

Retained round 11 (from diagnostic.json + the durable rows; apply outcomes derived from the apply rules
and the final row, since no trace exists): 

| idx | type | auth | exp | retirement | outcome | produced by |
| --- | --- | --- | --- | --- | --- | --- |
| 2 | PAUSE | - | - | - | PAUSED gen 1 | control own attempt #1 (firstRefusal = post_enable_release_census drain, followers a2/c2/l3) |
| 4-17 | RESERVE..CONFIRM | b24ae48e | 0..12 | - | applied, rev 13 | control own cycle |
| 18-30 | RESERVE..CONFIRM | 075bdebe | 13..25 | - | applied, rev 26 | dep #1 artifact_payload_chunks-p1 via observe `:316` (no RETIRE precedes it) |
| 31 | RETIRE | 075bdebe | 26 | ce7c5ae8 | RETIRED rev 27 (slot CONFIRMED same auth -> `:450-472`) | dep #2 artifact_payloads-p1 attempt #1: nested control attempt, obligation from CURRENT=075bdebe (SHARE) |
| 32-45 | RESERVE..CONFIRM | b24ae48e | 27..39 | - | applied, rev 40 (RESERVE allowed: slot RETIRED but auth differs) | control re-cycle inside the same nested attempt; RESUME at 41 = durable authorization rev 35 |
| 46-58 | RESERVE..CONFIRM | f1aa6015 | 40..52 | - | applied, rev 53 | dep #2 authorized |
| 59 | RETIRE | f1aa6015 | 53 | 23b33c7c | RETIRED rev 54 | dep #3 call_activation_leases-p1 attempt #1: nested, obligation from CURRENT=f1aa6015; the re-cycle then failed before RESERVE (not recorded; run 3's equivalent failed at `committed_dependent_pause` / follower catch-up) |
| 60-278 | RETIRE x219 | b24ae48e | 54 | 6a3a59c5 | STALE (`:398-404` second clause) | dep #3 attempts #2..#220, obligation `reconstructed` from the durable RESUME text (b24ae48e rev 35, target ag128 vs current ag>128) |

Run 3 (post-seed window; the same shape as the retained run, now traced): idx 600 CONFIRM aacf6912a9
(dependent tbl-80cdff…, rev 596); idx 713 RETIRE aacf6912a9 RETIRED rev 597 (nested for tbl-c75211…, obligation retained from CURRENT);
idx 714 PAUSE (new entry, pauseGeneration 2, see 6.e); idx 726-739 control re-cycle 06756a4fe4 RESERVED..CONFIRMED rev 610 (RESUME idx 735 = durable authorization rev 605);
idx 740-750 tbl-c75211… f5331500c6 RESERVED..CONFIRMED rev 621; idx 767 RETIRE f5331500c6 RETIRED rev 622 (nested for tbl-119b90…);
idx 768-1427 RETIRE 06756a4fe4 exp 622 retirement 452168ef6e(ag138) x660 STALE, row unchanged `RETIRED/f5331500c6/rev622` (durable row read after the run agrees: reconstructedRetirementId for r1 = 452168ef6e).

## 4. Local projection timeline on the control services (CURRENT / RETIREMENTS / ADMISSIONS)

Run 1 (callers are the pristine functions; `gen` = admission generation; the counter is process-global):

| t | replica | event | detail | caller |
| --- | --- | --- | --- | --- |
| -41.8 | r1 | ADMISSIONS newPause gen 124 | born CLOSED | participantReleaseAdmissionOf <- invalidateParticipantReleaseAdmission (release recovery consensus subscription) |
| 0.005 | r2, r3 | newPause gen 126, 127 | born CLOSED | participantReleaseAdmissionOf <- replicaGenerationOf (first INSPECT) |
| 0.179 / 0.243 / 0.302 | r1 / r2 / r3 | CURRENT publish c3f822e1db (ag124/126/127, controlOwner r1) | previous null | SHARE action (release.js:179) |
| 0.345 | r1 | ADMISSIONS -> OPEN gen 124 | authorizationId c3f8 | resumeParticipantCutoverAdmission (pause.js:123) |
| 0.345, 0.368 | r1 | CURRENT publish c3f8 (twice; the RESUME action ran twice, first answer lost to the cohort retry) | previous c3f8 | RESUME action (release.js:307) |
| 0.369 / 0.370 | r2 / r3 | ADMISSIONS -> OPEN gen 126 / 127; CURRENT publish c3f8 | | RESUME action |
| 0.417 | r1 | CURRENT invalidate: c3f8 ag124 -> RETIREMENTS set (no prior retained, conflict false); CURRENT deleted; newPause gen 128 (previous OPEN 124) | | newPause <- raiseParticipantCutoverPause <- runCutoverAttemptInner (cutover.js:590), nested attempt for dep#1 |
| 0.426 | r1 | RETIREMENTS clear (matched true) after RETIRE idx 18 RETIRED | | retireParticipantReleaseBeforeReplacement (retirement.js:174) |
| 0.430 / 0.431 | r2 / r3 | CURRENT invalidate c3f8 -> RETIREMENTS set; newPause gen 129 / 130 (previous OPEN) | | raiseParticipantCutoverPause <- receiveParticipantRelease (release.js:406, PAUSE action) |
| 0.570 .. 29.97 | r1 | 204 x RETIREMENTS clear with matched=false (reconstructed obligation is never stored, so nothing to clear) | | retirement.js:174 |
| never | r2, r3 | RETIREMENTS never cleared; ADMISSIONS never reopened | | - |

Run 3 seed phase (the C2 chain): r1/r2/r3 born CLOSED (gens 5/6/7); 0.218-0.367 SHARE publishes 4b9b71ed8b (control's own);
0.401-0.428 OPEN + RESUME publishes 4b9b71ed8b; then 44 SHARE publishes per replica, one per dependent,
each overwriting CURRENT with that dependent's authorization id (list in C2); no invalidation, no newPause,
no RETIREMENTS during the whole seed loop. Post-seed: 71.355 r1 invalidate CURRENT=aacf6912a9 -> RETIREMENTS;
71.413 clear (matched) ; 71.435 r2/r3 invalidate CURRENT=aacf69 -> RETIREMENTS (never cleared); 77.417 r1
invalidate CURRENT=f5331500c6 -> RETIREMENTS, gen 138->142; 77.469 r2/r3 invalidate CURRENT=f533 with
RETIREMENTS=aacf69 -> `conflict:true` -> `receive.throw action=pause "Participant release retirement identity changed"` (local-current.js:28-29, thrown inside release.js:406, caught at :420-421 as INVALID).

## 5. Measurements

| Measure | Value | Source |
| --- | --- | --- |
| Partitions in the seed release loop | 45 (control + 44 dependents); 135 partition services (RF3, one node) | `seed.plan`, `node-data/partitions/` |
| Seed budget available to the loop | 29979-29992 ms of 30000 (`leadershipWaitTimeoutMs`) | `seed.plan remainingMs` |
| Control's own release | 413-460 ms (attempt 1 drain-pending 32-33 ms + 100 ms + attempt 2 277-286 ms); 15 control-log entries (idx 2-17 incl. origin) | runs 1-3 |
| Successful dependent release (observe path) | median 418 ms, mean 439, min 378, max 1288 (n=44; 2 attempts each: ~30 ms refused at post_enable drain + 100 ms sleep + ~280 ms); 13 control-log entries + 3 own (PAUSE, origin, RESUME) | run 3 |
| Control PAUSE/RETIRE cycles per successful dependent | 0 (run 3, 44/44); retained run: 0 for dep #1, 1 for dep #2 (idx 31-45) | |
| Control re-cycle cost when it succeeds | 229 ms (run 3 71.780-72.009, 14 entries idx 726-739) | |
| Projected total, no nested cutovers | 0.45 s + 44 x 0.418 s = 18.8 s (measured 19.8 s incl. the 1.3 s not_leader outlier) vs 30 s | run 3 |
| Wedge cadence | 136-145 ms per seed attempt (100 ms sleep + 36-45 ms); 205-218 attempts in 29.6 s; control log +2 entries per attempt (runs 1-2) or +1 (retained) | runs 1-2 |
| Follower apply lag on the control group | p50 3 ms, max 15-20 ms; the dependent's observe reads 3 ms after the leader's CONFIRM | `lag.mjs` |
| Dependent's first attempt refused at post_enable drain | 44/44 in run 3, 2/2 control in runs 1-2 (followers 1 entry behind on the origin entry) | |

## 6. Observations the lead's reading does not cover

a. Two terminal arms, not one. The retained run wedged at `applyRetire :398-404` (slot RETIRED under a
   dependent's id). Both unperturbed live runs wedged at `applyReserve :152-163` (clause `:155-156`): the
   nested cycle RETIREs the control's OWN authorization (the slot was CONFIRMED under the control's id
   because no dependent had been authorized yet) and the re-cycle's RESERVE carries the same deterministic
   id. Which arm occurs depends only on whose id sits in the slot when the first nested cutover starts.

b. The admission generation is bumped once per OPEN->CLOSED transition, not per attempt (C3). After that
   the control stays CLOSED for the rest of the deadline (`observe.return line=305` 204/217 times) because
   the only path that reopens it is the RESUME of a completed cycle.

c. Follower RETIREMENTS are never cleared. `clearParticipantReleaseLocalRetirement` runs only on the
   leader that drove the RETIRE (retirement.js:174; `local.clear` 205/205 on r1). The followers keep the
   obligation set at their PAUSE. On the next nested cycle, with CURRENT now naming a different id (the
   next SHARE), `invalidateParticipantReleaseLocalCurrent` throws `Participant release retirement identity changed`
   (local-current.js:28-29) inside the PAUSE action; run 3 at 77.469 on r2 and r3 (`receive.throw`),
   answered as INVALID, which fails the nested attempt before any RETIRE/RESERVE. This is a second, independent
   way the re-cycle cannot complete once two nested cycles have happened.

d. `wasClosed` is true from birth for every service (pause.js:34-36 creates the admission CLOSED on first
   touch), so `continueDurableRelease` runs on every control attempt (run 1: 206x, always null) and the
   comment at cutover.js:586-589 ("If a previous OPEN authorization exists") never distinguishes a
   never-opened service from a re-closed one.

e. In the fresh-create path (run 3 post-seed, outside the seed scope) the nested control cutover appended a
   NEW PAUSE entry (idx 714, pauseGeneration 1->2, `attempt.pause replayed=false`), which `applyParticipantAdmissionPause`
   (store.js:143-158) uses to NULL the durable RESUME authorization text; the next attempt's
   `reconstructDurableRetirement` then found `no_durable_authorization`. `authorizeControlFrom`
   (participant-release-authorization-owner.js:60-67) returns null for a FRESH_CREATE parent, so the nested
   request carries `authorization: null`, a different `pauseInvocationId` and a different `requestIdentity`.
   In the seed path the PAUSE always replayed (pauseGeneration stayed 1 in all runs and in the retained DBs).

f. A second trigger for the destructive nested path besides follower lag: `query_transaction_drain_pending`
   at `:314` (run 3 71.354 and 77.417, members fully drained). `observeCurrentControlOwner` passes no
   `queryDrainProof`, so any non-CLEAR `queryCensus` on the control (the test had expired/held transactions
   at that point) makes it return null. Not seen in the seed phase (census CLEAR there), but it is the same
   fall-through.

g. The retry loop grows the control log at ~7-14 entries/s (run 1: idx 19 -> 423 in 29.5 s; the
   reconstructed RETIRE replays as RETIRED and is appended every time; retained: +1/attempt), and three
   of the nested attempts per run were refused at `post_pause_drain` because a follower had not yet
   applied the previous attempt's own RETIRE/RESERVE entry: the loop feeds the drain check it then fails.

h. The release-recovery owner (`replica-handler-release-recovery.js`, trigger `existing-origin`) did not
   start any cutover during the seed loop in any run (0 `attempt.start trigger=existing-origin`); it is not
   a factor here. No `run.inflight` (different_release_request_in_flight) occurred either.

i. After the seed loop completed in run 3, the test failed at assertion 162 (`kind_simple: created`,
   `55P03 Schema provisioning remains active`) because the fresh-create release of the table's single-replica
   partition hit the same two-arm wedge (sections 3, 4, 6.c); so with the seed wedge removed the identical
   mechanism is reached from the fresh-create path on the first table creation whose observe falls through.

## 7. What was not established

- The retained run's exact early-return per attempt for dep #2 and dep #3 is inferred (section 1, C1), not traced.
- Why the retained run's post-idx-59 re-cycle failed before RESERVE is not recorded; run 3's equivalent
  (after idx 713) failed at `committed_dependent_pause` (a follower had not applied the new PAUSE), and the
  first re-cycle attempts in runs 1-2 failed at RESERVE. One of these transients is the likely reason, not proven.
- Run 3's full-loop success is under a 50 ms perturbation; the unperturbed probability of winning the
  3 ms race on this host is 0/2 live and 1/3 dependents in the retained run; no larger sample exists.
- No run observed `observeCurrentControlOwner` returning null at `:296`, `:302` or `:309-311`; those
  branches are unexercised, not shown correct.
