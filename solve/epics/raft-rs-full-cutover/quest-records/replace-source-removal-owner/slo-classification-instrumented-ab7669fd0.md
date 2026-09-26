# Causal classification of the join-SLO stall at ab7669fd0 (instrumented, tv-dator, 2026-09-26)

Owner directive 2026-09-25 point 1: classify causally, stop once two or more instrumented slow cases show the SAME sequence with the alternative mechanisms absent. Three instrumented reds (runs 2, 4, 5) show the same sequence; the two greens (runs 1, 3) show the same sequence up to the one step that differs, and that step is the discriminator. Times are ms relative to the REPLACE's ACTIVE write in the seed cache (t0), as `run-N.timeline.txt` prints them. Recordings: `host-output-inst/out-ab7669fd0/` (rec-N.ndjson, run-N.timeline.txt, run-N.tap, summary.txt, batch.out).

- Candidate SHA: `ab7669fd091c856e6eadce68fd55ff5679bcbd7e` (branch `quest/o1-committed-read-gate`, O1 I4 gate; production fixes under test: BR2/BR10/BR11/BR12, the replace-owner wake, S9 diagnostic). Host tv-dator (12 cores, lab speed x1.38, thermal ok 56-63C), MODE=`observe` (scratch observer: subtest 1 only, samples until the REPLACE is terminal), recorder v4, poll 200 ms, level poll off.
- Batch: `out-ab7669fd0/summary.txt` (N=10, KEEP_GOING=1, stopped by STOP file after run 5 once three reds existed: runs=5, reds=3). Machine lock held 13:00:24Z-13:03:07Z (holder `claude:slo-probe-instrumented`, waited ~6 min behind `claude:tx-apply`). No `WRAP_MISSING`/`WRAP_ERRORS` in any run.
- Ruling hypotheses from `classification-prep.md`: H1 (post-handoff voter-floor deferral chain never SAFE), H2 (BR11 lead===t never satisfied), H3 (accepted but ineffective handoff, transfer-window re-issue), H4 (BR12 deferred-visibility snapshot), H5 (stuck lane), H6 (leaderless/churning partition).

## Per-run episode table (every run measured the episode; the REPLACE is always `replica_operations-p1` r2 on node ...201 -> `replace-replica-804a...` on the joiner ...202, owner node 202)

| run | verdict | test ot ms (<=2000) | 4-voter window opens (target row active/follower) | ACTIVE->STOPPING | ACTIVE->terminal | episode over-target (window open -> STOPPING) | evals (safe/leader/floor) | reads of 201 deferred `rp` | reads of 202 deferred | wakes / fallback fires | leader on target at |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | ok | 0 | -108 | +472 | +783 | 580 ms | 6 (3/2/1) | 12/12 (`[rp]` only, evidence-absent) | 1/4 | 3 / 0 | +278 |
| 2 | RED | 14706 | -223 | never (window end +14276, last eval +14836) | never | >= 14.5 s | 132 (1/1/130) | 387/393 (`[PCPRP,rp]`) | 22/135 | 116 / 13 | +283 |
| 3 | ok | 0 | -102 | +346 | +1357 | 448 ms | 7 (3/2/2) | 12/15 (`[rp]` only) | 3/5 | 6 / 0 | +158 |
| 4 | RED | 6034 | -227 | +5577 | +5937 | 5804 ms | 46 (3/1/42) | 126/132 (`[PCPRP,rp]`) | 12/44 | 40 / 4 | +343 |
| 5 | RED | 14609 | -242 | never (window end +14105) | never | >= 14.3 s | 130 (1/1/128) | 387/387 (`[PCPRP,rp]`, never eligible) | 19/129 | 114 / 12 | +236 |

The greens' test `ot=0` is a sampling artefact (the observer's first sample came after STOPPING); the recorder's episode is 448-580 ms. Per-episode rate at this SHA on this host: 3 of 5 episodes over target, and in every episode the same sequence ran; the greens were short because one input differed (below).

## Case tv-dator#2 (RED, ot 14706, leaderChanges 0 by the test's tracked services, stepAtEnd ACTIVE/open)

| t (ms) | event | source (record kind / code path) | reading |
|---|---|---|---|
| -1416 | seed replicas r1/r2/r3 ConfState voters=4, learners=0, commit=applied=10 | `consensus` (TrackedServiceRegistry relay) | target admitted directly as a voter |
| -1387 | target replica tracked: follower t1, leader r1, gateOpen false | `role`, `consensus` | |
| -1323 | target participation gate opens (applied 10 >= admission 10) | `gate-opened` (`raft-rs-participation-gate.js`) | gate open 1.55 s BEFORE the attempt (refutes H3(i)) |
| -223 | target row active/follower in the seed cache: 4 voter-ready rows | `cache-svc` | over-target window opens |
| 0 | REPLACE SYNCING->ACTIVE CAS, ok, lease stamped | `op-write` (node 202, update where workflow_step=SYNCING) | |
| 67..227 | EVAL#1 in the `execute_reconcile` turn: DEFER "source leader r2 replacement leader ownership pending"; witness read state voter, leader r1, t1, gateOpen true; 201 x3 and 202 read `[PCPRP,rp]` | `remove-safety`, `witness-read`, `named-handoff` (`handoff-attempt.js:199-228` -> ISSUE) | leader gate, first evaluation |
| 229 | attempt 1 dispatched to 202's handler: STEP_DOWN reason replace_target_leader_election, trackedRole follower, branch transfer_forwarded, port CORE_OK transfer-forwarded | `attempt-dispatch`, `step-down`, `transfer` (`leader-handoff-methods.js:84-98`, `raft-rs-leadership-transfer.js`) | accepted (refutes H2a no-effect) |
| 266-270 | target term 2, candidate (41 ms after the transfer) | `consensus`, `role-after-transfer` | |
| 275-277 | r1/r2/r3 term 2, leader null | `consensus` | the one election of the run (7 ms leaderless) |
| 283-289 | target leader t2; r1/r2/r3 report leader = target | `consensus`, `role-after-transfer` (56 ms) | handoff landed (refutes H3, H6) |
| 321 | attempt record: seq 1 issued .316 answered .317 answerClass accepted | `attempt` (`readReplaceHandoffAttempt`) | resolved by the fresh lead===t read |
| 229..410 | EVAL#2 (same reconcile turn): witness leader = target -> `named-handoff` classification safe (leadership_safe); then DEFER "would drop voter-ready replicas below minimum (2/3)"; reads 201 x3 `eligible:false [PCPRP, rp]` failed [processAlive, clusterMemberHealthy, routingReady, loadReady]; 202 `[PCPRP, rp]` | `remove-safety` + `participation` calls (`getControlPlaneParticipationSync`, kind replica_operation_owner_read, by 202) | BR11 satisfied from here to the end (refutes H2); the floor becomes the only gate |
| 460..537 | EVAL#3 (boundary replace_owner_wake): 201 `eligible:true [PCPRP]` x3, 202 `[PCPRP, rp]` -> FLOOR (2/3) | `owner-action`, `remove-safety` | one node deferred suffices |
| 531 | S9 diagnostic: reason replace_remove_safety_blocked, ownerPhase active_attempt_unresolved, lastAttemptSeq null, waited 0 | `diag` (`replace-owner-state.js:100-130`) | phase label stale: the attempt is resolved and the named handoff safe (secondary finding) |
| 588..14836 | 128 more evaluations, every one FLOOR (2/3): 201 deferred `[PCPRP,rp]` in 127 of them (eligible only at 460 and 4803, both times with 202 deferred); 202 eligible `[PCPRP]` in 113 | `remove-safety` | never both nodes served non-deferred in one evaluation |
| 1424, 2510, 3604, 4689, 5790, 6896, 8021, 9247, 10374, 11475, 12553, 13645, 14761 | fallback fires (13, ~1.1 s cadence, timer reused per chain: 130 arm calls); each followed within ~100 ms by a `safety_retry` evaluation | `safety-retry-fired`, `owner-action` boundary safety_retry (`dispatch-rearm-evidence.js:594-637`) | liveness intact, no lost fire |
| continuous | readiness publications by node 202 for node 201: 312 in the run (~12/s), ALL `rp:false`, `controlPlaneRecoveryEligible:true`, reason codes `[PCPRP]` (since -4776); 116 `replace_owner_wake` turns admitted (retained waits 0-209 ms) | `pub`, `readiness-pub`, `owner-action`, `retained-admitted` (`replace-owner-wake.js:231-238, 399-419`) | the level DOES change and the wake DOES reach the owner; the read answer does not follow the publication |
| per read | deferred reads of 201 came 2-465 ms (p50 44 ms) after 202's own current, eligible publication of 201; the publication token had not rotated for up to 4.5 s | `participation` vs `pub` timing | the owner-read variant is served the STALE deferred snapshot regardless of a fresh publication |
| - | no intent CAS, no REMOVE_REPLICA effect, no STOPPING, no completeOperation | `intent`/`effect`/`cache-op` absent | |
| 14276 | last test sample (76): inFlight REPLACE ACTIVE -> over-target 14706 ms -> RED | `test-sample` | |

Alternatives that must be ABSENT (run 2):
- [x] no owner-unavailable release / early close / planner REMOVE: `drain-state` (node 201's ledger drain view) stays completion converged / source removal_required / releaseEligibleReplace false; no REMOVE `cache-op`; no `completeOperation`
- [x] no SQL-fallback op write: 5 `op-write`s, all CAS updates with where-clause, `ok:true`, `hasLease:true`
- [x] no handoff refusal with a retry: exactly one attempt, accepted, resolved at +321; `named-handoff` safe from +410 on (131 witness reads, leader = target in 130)
- [x] no deferred-visibility snapshot: `visibility:null` on all 132 evaluations, `handoff-not-owned` 0
- [x] no lost fallback fire: every armed chain fired ~1.1 s later and every fire produced a `retained-admitted` (waits <= 209 ms) and an evaluation
- [x] recorder perturbation acknowledged (200 ms role/diag poll, 25 ms cache poll, level poll off); the deferred/eligible ratio does not depend on it

## Case tv-dator#4 (RED, ot 6034, STOPPING at +5577, terminal +5937)

Identical sequence to #2 up to the idle; the idle ends when one evaluation is served both nodes non-deferred.

| t (ms) | event | source | reading |
|---|---|---|---|
| -227 | target row active/follower (4 voter-ready rows) | `cache-svc` | window opens |
| 0 | ACTIVE CAS ok, lease | `op-write` | |
| ~60..250 | EVAL#1 LEADER defer, witness leader r1; attempt 1 issued: transfer_forwarded / trackedRole follower / CORE_OK | `remove-safety`, `named-handoff`, `step-down` | |
| 295 / 343 | target candidate t2 / leader t2; seeds follow (351-354) | `role-after-transfer`, `consensus` | landed in 130 ms |
| ~500..5090 | 42 evaluations FLOOR (2/3): of the 44 evaluations that read participation, 201 is deferred `[PCPRP,rp]` in 42 and eligible in 2 (at +557..669, with 202 deferred -> still FLOOR, and at +5334); 202 eligible in 32 | `remove-safety` | wake evals ~100 ms apart, fallback fires at 1514, 2530, 3547, 4717 |
| 5334..5504 | EVAL (replace_owner_wake): 201 `eligible:true [PCPRP]` x3 AND 202 `eligible:true [PCPRP]` -> SAFE (the 201 read came 50 ms after a 202>201 publication, token 50 ms old: served from the completed record) | `remove-safety` + `participation` | the only evaluation in the run with both nodes non-deferred |
| 5538 | STOPPING CAS (intent, witness = target, commit index) persisted | `intent`, `updateStep` (`replace-owner.js:654-662`) | |
| 5558..5703 | one more ACTIVE-copy evaluation FLOOR (both deferred) - stale re-entry, harmless | `remove-safety` | |
| 5736 | STOPPING evaluation SAFE; 5812 REMOVE_REPLICA effect ok; 5981 completeOperation REMOVED | `effect`, `completeOperation` | |

Alternatives absent: same six checks, all true (7 op-writes ok/lease; 1 attempt accepted; visibility null; 4 fires, 4 admitted; no release/REMOVE).

## Case tv-dator#5 (RED, ot 14609, stepAtEnd ACTIVE/open)

Same as #2: attempt 1 transfer_forwarded/follower at ~+200, target leader t2 at +236, seeds follow at +243-244, `named-handoff` safe from +390; 128 FLOOR (2/3) evaluations; 201 deferred `[PCPRP,rp]` in 387/387 reads (never once eligible), 202 eligible in 110/129; 114 wakes, 12 fallback fires at ~1.1 s, retained waits <= 260 ms; publications 202>201 307, all rp:false/cpre:true `[PCPRP]` (since -5006); no intent/effect/STOPPING; last sample +14105. All six alternative checks absent.

## The greens, for contrast (runs 1 and 3)

Same sequence: LEADER defer -> attempt 1 transfer_forwarded/follower -> target leads t2 at +278 / +158 -> `named-handoff` safe -> floor evaluations. The reads of 201 by the owner 202 are deferred in the greens too (12/12 and 12/15, `nodeReadyForRouting r:false`), but the deferred snapshot's reason set is `[planning_snapshot_refresh_pending]` ONLY, because 202's completed snapshot of 201 carried no reason code at that time (`readiness-pub 202>201 cpre=true (none)` at -5153 / -5220; `PRIORITY_CONTROL_PLANE_RECOVERY_PENDING` first appears on 201's snapshot AFTER the episode: +1880 / +954). A `[rp]`-only denial is evidence-absent, so `isVoterReadyFloorCountableReplica` counts the three 201 rows through its carve-out and the floor is 3/3: run 1 SAFE at +366..433 with 201 deferred; run 3 SAFE at +257..304 with 201 deferred. STOPPING at +472 / +346.

In the reds, 202's completed snapshot of 201 had gained `PRIORITY_CONTROL_PLANE_RECOVERY_PENDING` before ACTIVE (published at -4776 / -3932 / -5006, still `controlPlaneRecoveryEligible:true`, i.e. an informational lifecycle reason on an ELIGIBLE snapshot), so every deferred read of 201 carries `[PCPRP, rp]`, is not evidence-absent, and the 201 rows are not countable. The reds are the runs where the joiner's lifecycle reached the DEGRADED/PCPRP stage before the REPLACE went ACTIVE (its seed rows had been visible 12-15 s vs 7 s in the greens).

## Cross-case sequence

| step | case #2 | case #4 | case #5 | greens #1/#3 | same? |
|---|---|---|---|---|---|
| first EVAL verdict | LEADER defer (ownership pending), ISSUE | same | same | same | yes |
| attempt 1: answer class, trackedRole, port answer | accepted, follower, transfer_forwarded/CORE_OK | same | same | same | yes |
| gate open relative to attempt 1 | open 1.55 s before | open 1.17 s before | open 1.54 s before | open 0.6-0.7 s before | yes |
| leadership landed on t? at | +283 (term 2, seeds agree +289) | +343 (+354) | +236 (+244) | +278 / +158 | yes |
| named-handoff (BR11) | safe from +410 to the end | safe from +506 | safe from +390 | safe | yes |
| dominant DEFER reason during the idle | floor "(2/3)" from the completion-safe projection (130/130) | floor "(2/3)" (42/42) | floor "(2/3)" (128/128) | floor "(2/3)" once/twice | yes |
| rp nodes during the idle | 201 in 127/130 evals (codes `[PCPRP, rp]`), 202 in 22 | 201 in 41/42, 202 in 12 | 201 in 128/128, 202 in 19 | 201 in all, codes `[rp]` ONLY -> countable | reds yes; greens differ in the reason set |
| both nodes non-deferred in one eval | never | once (+5334) -> SAFE | never | n/a (SAFE with 201 deferred) | |
| wakes reaching the owner during the idle | 116 (all admitted) | 40 | 114 | 3 / 6 | yes |
| fallback fires (lane free?) | 13, each admitted <= 209 ms | 4 | 12 | 0 | yes |
| publications of 201 by 202 during the idle | ~170, all rp:false, cpre:true | ~85 | ~170 | ~10 | yes |
| what finally progressed | nothing | the one both-eligible read | nothing | carve-out counts 201's rows | |
| S9 reason at window end | replace_remove_safety_blocked / active_attempt_unresolved / attempt null | cleared at STOPPING | same as #2 | - | yes (label stale) |

## Verdict

Mechanism = **H1 in its extended form, with the prep's H1 publication prediction refuted**: the post-handoff voter-floor chain never answers SAFE, but not because the readiness owner "never published a current, eligible snapshot" (it published node 201's eligible snapshot ~12 times per second, `rp:false`). Two facts compose the stall, both on the readiness-publication side:

1. **Owner-read currency.** The REPLACE owner's floor reads (`getControlPlaneParticipationSync(nodeId, {participationKind: replica_operation_owner_read, decisionDimension: controlPlaneRecoveryEligible})`, `priority-publication-safety-topology.js:193-207` via `isVoterReadyRoutableReplica`) go through `getNodeReadinessSync` -> `ReadinessPlanningSnapshotOwner.readSync` (`src/control-plane/readiness-planning-snapshot-owner.js:515-606`). For the remote node 201 that read is served the memoized STALE deferred snapshot in 387/393, 126/132 and 387/387 reads, typically 44 ms after the same owner's own current publication of 201 and with the publication token unchanged for seconds: either the LIVE_VETO branch (`:578-606`, `canReuseCompletedSnapshot` failing on planning identity/freshness, then `buildMemoizedDeferredSnapshot`) or the unclassified-source barrier (`:546-556`, `serveBarrierBlockedRead`). The owner-read kind has no CL-012 bridge (`readiness-planning-completion-admission-methods.js:246-253` admits `ROUTED_READ` only), so both branches fail closed for it. The recording cannot separate the two branches (no readSync probe); that is the one open observable.
2. **The deferred denial is made substantive.** `buildDeferredSnapshot` (`src/control-plane/readiness-planning-publication-contract.js:354-395`) copies the source snapshot's reason codes into the deferred snapshot through `collectDeferredReasonCodeSet` (`:336-352`) and adds `planning_snapshot_refresh_pending`. When 201's completed snapshot carries `PRIORITY_CONTROL_PLANE_RECOVERY_PENDING` (a lifecycle DEGRADED reason attached to an eligible snapshot, `bootstrap/node-joining-ready-signal-readiness.js:329-333`), the deferred denial reads `[PCPRP, rp]`, `isEvidenceAbsentReadinessDenialSnapshot` (`src/control-plane/readiness-denial-classification.js:17-20, 41-45`) answers false, the floor carve-out at `src/rebalancer/priority-publication-safety-topology.js:183-190` does not count 201's rows, and the completion-safe floor (`src/rebalancer/operation-workflow-remove-safety-evaluator.js:716-728`: effective = max(projected rows, recovery-projection node ids = 2)) prints "(2/3)". With two nodes in the cluster the node-id union can never reach the 3-replica floor; only the rows can, and that needs BOTH nodes served non-deferred in the same evaluation, which fact 1 makes rare (0-1 per 130 evaluations). PCPRP means "priority control-plane recovery pending", i.e. the spread this very REPLACE performs: the deferral inherits the reason the REPLACE would clear.

The greens prove the composition: with the same deferred reads but a `[rp]`-only reason set the carve-out counts the rows and the episode closes in 350-470 ms.

Alternatives absent = yes in all three reds (H2 refuted by `named-handoff` safe from +390..+506 with a single accepted attempt; H3 refuted by the gate open 1.2-1.6 s before the attempt and the transfer landing in 41-130 ms; H4 refuted by `visibility:null` and 0 not-owned; H5 refuted by 130 evaluations at ~100 ms cadence with every fire and wake admitted; H6 refuted by one term change and a stable target leader from +240..+350; owner release / planner REMOVE / SQL fallback / lost fire all absent).

Semantic owner of the repair = **readiness publication** (the planning snapshot owner and its deferred-snapshot contract), not the remove-safety evaluator, the handoff attempt, the participation gate, the wake or the lane:
- `src/control-plane/readiness-planning-publication-contract.js:336-352` (`collectDeferredReasonCodeSet`: an informational reason of an eligible snapshot must not become a substantive denial of the deferred copy; the deferred reason set should be the evidence-absent codes only, or PCPRP must join `EVIDENCE_ABSENT_READINESS_REASON_CODES` in `readiness-denial-classification.js:17-20`), and
- `src/control-plane/readiness-planning-snapshot-owner.js:578-606` (the owner-read variant served STALE within ~44 ms of its own current publication of the same node; the memo-currency / P1 class).
Consumers that would change behaviour: `src/rebalancer/priority-publication-safety-topology.js:183-190` (carve-out) and `src/rebalancer/operation-workflow-remove-safety-evaluator.js:716-728` (floor message).

Witness to write first (red on the candidate): a deferred snapshot built from an eligible completed snapshot whose reasons contain `PRIORITY_CONTROL_PLANE_RECOVERY_PENDING` must still classify as evidence-absent (`isEvidenceAbsentReadinessDenialSnapshot(buildDeferredSnapshot(eligibleWithPcprp, token))` === true), and the critical floor must count a voter-ready row whose node answers that deferred snapshot. A second witness for fact 1: a `readSync` for `participationKind: replica_operation_owner_read` immediately after `notifySnapshotPublished` for the same owner key and unchanged token must serve the completed snapshot, not `TOKEN_STATUS.STALE` (probe `readReadinessAdmissionEvaluatedTerms` to name the failing term).

Secondary finding: the S9 diagnostic reports `ownerPhase active_attempt_unresolved` with `lastAttemptSeq null` for the whole idle although the handoff attempt record is seq 1 accepted and `named-handoff` is safe (`replace-owner-state.js:100-130`, `retirementAttemptSummaryOf` reads the retirement-attempt map, not the handoff-attempt state); the reason `replace_remove_safety_blocked` is right, the phase label is not.

Host state after the batch: worktree `.lab-worktrees/slo-inst-ab7669fd0` removed, `~/slo-probe-inst` removed, holder record cleared, `refs/lagrange-slo-probe/ab7669fd0` kept, host checkout untouched at 4b6229d01.
