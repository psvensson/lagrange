# Run-6 stall at ab7669fd0: hypotheses, instrumentation, and the batch to run at the next SHA

Read-only preparation, 2026-09-26. No `src/` or `test/` edits, no git writes, nothing run on a lab host, the SLO test not run on the controller. Line numbers are at ab7669fd0 (worktree `.claude/worktrees/o1-gate`, branch `quest/o1-committed-read-gate`). Inputs: `docs/steering/rules.md`; the A2 lab classification (`a2-slo-classification-lab.md`, on 102e127c4); the owner directive point 1; the design record (`design-replace-source-removal-owner-2026-09-25.md` §2(d), §2(e), §3.3-3.5, §5.1 K7); the T4b and O1 implementer notes; the test; the REPLACE owner modules; the probe artifacts in this directory.

## 0. What run 6 actually shows (and what it cannot)

From `host-output/run-6.tap` and `batch.out`, epoch ms -> UTC:

| t | fact | source |
|---|---|---|
| 12:24:43.231 | seed rows r1, r2, r3 of `replica_operations-p1` created (all on node ...201) | firstObservedRows.createdAt |
| 12:24:48.096 | r1 row last updated (reads `follower`; never touched again) | firstObservedRows.updatedAt |
| 12:24:53.244 | REPLACE `replace-op-b0b9...` created: source node 201, target node 202, replica `replace-replica-804a...`, `sourceReplicaId: null` in the row (the source is resolved from step metadata, `replica-operation-repository-row-methods.js:290-304`) | inFlight |
| 12:24:56.177 | target replica row first created (CREATING/SYNCING) | firstObservedRows[3].createdAt |
| 12:24:57.914 | target row **re-inserted** active/follower: `created_at` moved 56.177 -> 57.914 (a lifecycle UPSERT replaced the coordinator's row; both copies say follower) | first vs last observed rows |
| ~12:24:57.9-58.0 | the test's settle loop starts (deadline arithmetic: last sample 18.020 <= settleStart + 20000) - i.e. the joiner's node row became ready **after** the REPLACE was 4.6 s old | settle loop, test:555-583 |
| 12:24:58.006 | REPLACE `updated_at` = the ACTIVE write; never moves again (no step change; the 30 s lease needs no touch inside the window; a refused CAS would also leave it alone) | inFlight.updatedAt |
| 12:24:58.206 | first sample with 4 voter-ready rows (the over-target window opens) | firstObservedAtMs |
| ~12:24:59.44 | the ONE `LEADER_ELECTED` event of the run (quiet = 18577 ms before the last sample) - +1.4 s after ACTIVE | quiet=18577ms, test:408-438 |
| 12:25:18.020 | last sample: still 4 voter-ready rows, REPLACE still active/ACTIVE, `clearedSampleAtMs: null` | lastObservedAtMs |

Readings the artifacts support:

1. **The five greens measured nothing.** Green runs settled "in the first sample" (results.md): with the joiner's node row ready before any REPLACE existed, `finalInFlightOperations.length === 0` exits the loop at once (finding F-a of the A2 record). Run 6 measured an episode only because the planner created the REPLACE 4.6 s before the node-ready wait finished. So "1 red in 6" is one measured episode and one stall; it is not a rate of the mechanism. Only the observer variant (samples until the REPLACE is terminal) measures every episode - that is why the batch below defaults to it.
2. **"Four followers" is a row projection, not leadership.** `raft_role` in services rows is written by a deferred durable write (`replica-handler-create-status-methods.js:350-411`, `partition-service-constants.js:108-110`), and the seed rows' `updated_at` (43.231 / 48.096) predate the whole episode. Whoever led the partition at any moment is not in the rows. Nothing about an election can be read from them.
3. **The one `LEADER_ELECTED` at +1.4 s is a replica *becoming* leader** (`partition-service-core-base.js:622-626` emits only on this replica's own election), on a service present in `bootstrapResult.partitionServices` or `joinResult.partitionServices` when the subscriptions were registered (test:408-438). Whether the replace target replica (created after join) is in the joiner's map is unknown. Two readings: (i) the F1 named handoff landed on the target (A2: 47-125 ms after STEP_DOWN; here the first evaluation + round trip); (ii) a seed replica was re-elected. Only the recorder's role timeline separates them.
4. **The REPLACE never left ACTIVE** for the whole 20 s: no STOPPING CAS reached the row (`admitReplaceSourceRemovalEffect` writes STOPPING before any effect, `operation-workflow-replace-owner.js:654-662`). So either remove safety never answered SAFE inside the window, or SAFE was answered and the intent CAS / effect boundary refused.
5. `run-6.log` is empty by construction: `test/integration/helpers/cluster-test-helpers.js:170` pins the process logger to `error`, and `LAGRANGE_LOG_FILE` only receives what passes that level (`logging-service.js:109-113, 171`). No env flag raises it (the level comes from `config.get(logging.level)` overridden by the helper's explicit option). The S9 diagnostic lines (`REPLACE source removal waiting`, info) therefore never reach any file; the recorder captures them itself (§2).

What cannot be known without instrumentation: who led and when; whether a handoff attempt was issued, what the target's handler answered (branch, tracked role, port answer), and whether it resolved; the target's participation-gate state over time; every remove-safety verdict and deferral reason; whether the wake or the 1 s fallback fired and whether their turns were admitted; the visibility class of the owner's copy; whether an intent CAS or a REMOVE_REPLICA effect was attempted. All six hypotheses below share this silent surface. Two or more instrumented reds are needed (directive point 1).

## 1. Hypotheses, ranked

Each: the mechanism, the code path, the recorder observable that confirms it, and what refutes it. Record kinds are those of `slo-recorder-v4.mjs`; `run-N.timeline.txt` prints them in one time line.

### H1 (rank 1). Post-handoff voter-floor deferral chain never SAFE: readiness for 201/202 never becomes eligible in the window

The A2 mechanism, extended. After the leader gate is satisfied (`lead === t`, `operation-workflow-replace-handoff-attempt.js:209-214`), every evaluation defers on "would drop voter-ready replicas below minimum" (`operation-workflow-remove-safety-evaluator.js:670, 726`) because a participation read for node 201 and/or 202 answers the refresh-pending placeholder or an ineligible readiness (`getControlPlaneParticipationSync`). At ab7669fd0 the wake exists (`operation-workflow-replace-owner-wake.js:349-368` registers; `:231-238` wakes on a publication for a waited node; `:399-419` re-drives while the level differs), so liveness is not the question: a 20 s stall means the **level never changed** - the readiness owner never published a current, eligible snapshot for the deferring node (the A2 §4(c) "3.1 s publication silence" class, now for 20 s), and each fallback fire (`operation-workflow-dispatch-rearm-evidence.js:594-637`, one timer per deferral chain, reused `:599-601`) re-evaluated and re-deferred.

- Confirms: `remove-safety` records every <= 1 s for the whole window, `error` containing `would drop voter-ready replicas below minimum`, with `participation` calls answering `planning_snapshot_refresh_pending` (or another ineligible code) for the **same** node(s) throughout; `pub` records for that node absent, or always `rp:true`; `named-handoff` = `leadership_safe` from the first post-handoff evaluation; `diag.reason` = the floor text, `ownerPhase active_deferring`, `waitedMs` growing; `owner-action` boundaries alternating `safety_retry` / `replace_owner_wake` (liveness intact, progress none).
- Refutes: any SAFE evaluation inside the window; a floor deferral absent while the leader gate defers (then H2/H3); evaluations stopping (then H5).
- Why first: 11 of 11 A2 reds had the refresh-pending floor deferral as the gate; the leadership change at +1.4 s matches the handoff landing; nothing in run 6 contradicts it. The repair owner would be the readiness planning owner (R-3/F-d), not the REPLACE.

### H2 (rank 2). BR11 `lead === t` never satisfied although the REPLACE keeps issuing named handoffs (no-effect loop) or never issues one (no leader known)

`decideReplaceNamedHandoff` (`handoff-attempt.js:199-228`) authorises removal only when the **witness's own** `leaderReplicaId` equals `targetReplicaId`; otherwise it ISSUEs the one named-target handoff, or WAITs. The witness's leader comes from the target's port status (`partition-service-raft-membership-administration.js:262-282` -> `raft-rs-committed-membership-read.js:106-117` -> `raft-rs-status-observation.js:57-66`, resolved through the registry; self is registered at port creation, `raft-rs-operation-port.js:152`, so a self-leading target does resolve). Sub-cases:

- **H2a no-effect loop.** The STEP_DOWN reaches the target's handler; `transferRequestOf` (`replica-handler-leader-handoff-methods.js:84-98`) forwards a NAMED self transfer **only when the tracked role is FOLLOWER**; any other tracked role (leader already, candidate, or a fresh replica's null) answers COMPLETED with `TARGET_ELECTION_ROLE_NO_OP` (`:100-104`), which the owner classifies `no_effect` (`handoff-attempt.js:92-102`) and treats as **resolved at once** (`:156-158`), so the next evaluation ISSUEs again: a 1 s no-op loop with "replacement leader ownership pending" every turn and nothing ever moving. If the tracked role is stale-LEADER on a target that no longer leads, or the target's status names a leader whose identity the target's registry never reserved (`leaderId: null` -> `WAIT_NO_LEADER`, `:224-226`), the loop is silent.
- **H2b identity.** The witness answers a `leaderReplicaId` that is not the target's identity string while the target leads (a reservation or identity-string mismatch). Unlikely (self is registered), but cheap to see.

- Confirms: `named-handoff` records repeating `deferReason` with `handoff:true` and an `attempt` whose `answerClass` is `no_effect` (H2a) or a `wait_no_leader` state with no attempt; `step-down` records with `branch: target_election_role_no_op` and `trackedRole !== follower`; `attempt` records with `attemptSeq` climbing every ~1 s; `witness-read.membership.leader` vs the target's replica id (H2b); `role`/`consensus` show who actually leads.
- Refutes: a `named-handoff` record with `classification: safe` / state `leadership_safe` inside the window.
- Why second: BR11 landed at e9d55b0fa and was proven with doubles and the P3 harness; no lab run at any head since measured a real REPLACE episode (F-a), so the live named-handoff path is unproven on rs-raft. The +1.4 s leadership change fits H2 only as a seed re-election (H2a with the target never forwarding) or as the target landing and then being misread (H2b).

### H3 (rank 3). B13 class: the handoff is accepted but ineffective (gated or learner target), and the attempt waits its transfer window before a re-issue

The forwarded transfer (`raft-rs-leadership-transfer.js:97-100`, `TRANSFER_FORWARDED`) is COMPLETED/`accepted` for the owner (`handoff-attempt.js:99-101`), so the attempt is **unresolved** until a fresh `lead === t` or until `transferWindowMaxMs` elapses after the answer (`:159-165`; the window = max over the group's replica indices of electionTick x tickMs, `membership-administration.js:206-229`; under the SLO tuning the per-index tiers are 300/2800/5300/7800 ms per design §5.1 K7, so ~5.3-7.8 s). Meanwhile the transfer cannot land if: (i) the target is below its participation gate when MsgTimeoutNow arrives - the runtime refuses the campaign (`raft-rs-runtime-owner.js:1083-1086` -> `raft-rs-participation-gate.js:190-203`; raft-rs's own `hup` refuses with a committed-unapplied conf change too, amendment B1); or (ii) the leader's tracker holds the target as a **learner** (raft-rs ignores a transfer to a learner silently). The leader aborts after its own election timeout; the owner re-ISSUEs only after the window. Two or three cycles fill 20 s. Note: the "5 s retry" wording of the amendment's B13 row is the RF=1 case; for a REPLACE the cadence is the transfer window, not `REQUEST_RETRY_AFTER_MS` (that 5 s suppression is the non-REPLACE legs, `priority-publication-safety-topology.js:590-603`). raft-rs re-sends TimeoutNow on every append response that reaches last index while the transfer is pending, so once the gate opens inside the window the target campaigns and lands - which also produces the one `LEADER_ELECTED` (if the target is a tracked service).

- Confirms: `step-down`/`transfer` records with `transfer_forwarded` and `trackedRole: follower`; the target's `role` records with `gateOpen: false` at attempt time and a `gate-opened` (or `gateOpen: true` flip) later; seed replicas' `role.learners` containing the target's peer id at attempt time (ii); `attempt` records `accepted` with `answeredAtMs` and no resolution for seconds; `diag.ownerPhase active_attempt_unresolved`; then either `leadership_safe` after the gate opens (and H1 takes over) or a second `attemptSeq` ~5-8 s later.
- Refutes: the first attempt lands within ~150 ms (A2's 47-125 ms) with `gateOpen: true` already, or no attempt at all.

### H4 (rank 4). BR12 deferred-visibility snapshot: every re-entry works on a DEFERRED_SNAPSHOT copy, which issues no handoff and admits no effect

The fallback/wake re-entry re-reads the operation with `allowPriorityRecoveryDeferredVisibility` (`dispatch-rearm-evidence.js:515-535`); a deferred observation yields the previous copy stamped `DEFERRED_SNAPSHOT` (`:469-478`). On that copy `isReplaceHandoffStillOwned` is false (`priority-publication-handoff.js:311-315`) - no attempt opens, and the evaluation still defers "ownership pending" - and the effect boundary WAITs `deferred_visibility_snapshot` (`operation-workflow-replace-owner.js:608-610, 637-640`). If the authoritative operation read stays deferred (the readiness barrier's `AUTHORITATIVE_OPERATION_READ_DEFERRED` class) for the window, every turn is a no-op. The first evaluation (from the fresh row on `execute_reconcile`) is not a snapshot, so one attempt and one leadership change still fit.

- Confirms: `remove-safety.visibility: 'deferred_snapshot'` on the re-entries; `handoff-not-owned` records; at most one `attempt-dispatch`; `diag.reason deferred_visibility_snapshot` if SAFE was ever reached.
- Refutes: `visibility` absent/null on the re-entry evaluations.

### H5 (rank 5). The re-entry itself is stuck: a lane held by an evaluation that never returns (a witness read or STEP_DOWN deliver with no timeout), so wakes and fallback fires queue behind it

`deliverToReplaceWitness` awaits `messageRouter.deliver` with no local bound (`operation-workflow-replace-witness.js:87-97`); `dispatchReplaceHandoffAttempt` likewise (`priority-publication-handoff.js:335-357`). An evaluation blocked there holds the REPLACE's single-flight lane; every wake and fallback fire takes a **retained** turn (`dispatch-rearm-evidence.js:552-566`, `runRetainedOperationOwnerAction`) that waits for the holder - forever, if the holder never returns. The fallback is armed once per chain and re-armed only by a later deferral (`:599-601`), so after one lost chain nothing else evaluates; `checkTimeouts` (1 s) also queues behind the holder.

- Confirms: a `remove-safety` (or `named-handoff`/`attempt-dispatch`) record with `at0` but no completion record; a `step-down`/`witness-read` on the owner side with no matching handler-side record; `retained-submit` without `retained-admitted`; `lane` records `held:true` with no `lane-enter`; `diag` frozen at its first reason (no further `diag` records although `waitedMs` would grow); zero `safety-retry-fired` after the first `safety-retry-armed`, or fires without any evaluation after them.
- Refutes: evaluations completing every <= 1 s.

### H6 (rank 6). Leaderless or churning partition at the window end (the "four followers" taken literally), so the REPLACE's own row cannot be written

The partition being replaced **is** the ledger partition `replica_operations-p1`; the REPLACE's STOPPING CAS is a write into it. If the transfer deposed the seed leader (raft-rs steps down on the transferee's higher term) but the target could not win (gated, or not a voter in the seed replicas' committed configuration), the group is leaderless until a seed replica's election timer fires (300-900 ms base, tiers up to 7.8 s), and repeats if the target keeps disrupting. While leaderless, no op write commits: SAFE -> intent CAS refused -> `removal_intent_not_durable`.

- Confirms: `role` records with `leaderId: null` / `role: candidate` for seconds and `term` climbing; `consensus` events with `leader: null`; `op-write` records `ok:false` or `intent.persisted:false`; `diag.reason removal_intent_not_durable`.
- Refutes: a stable leader in `role` records throughout; a single `term` change. Against it already: only one `LEADER_ELECTED` in 20 s (churn would show several, unless every election failed), and the rows are not evidence (§0 point 2).

### Alternatives the A2 record already excluded (must stay absent, cheap to re-check)

Owner-unavailable release / early close / planner REMOVE (`drain-state`, `completeOperation`, no REMOVE `cache-op`); SQL-fallback op writes or unstamped leases (`op-write`); F-b post-terminal handoff.

## 2. The instrumentation (what the earlier classification used, adapted)

The A2 classification instrumented the same test with a scratch **observer variant** (subtest 1 only, sampling until every REPLACE is terminal) and a prototype-wrapping **recorder** loaded with `NODE_OPTIONS=--import=<recorder>` and `SLO_RECORD_FILE=<ndjson> SLO_REPO=<worktree>`; it classified reds by attributing each idle to the wake that ended it (timer fire into a free/held lane, dispatch wake, publication) and by the participation reads inside every evaluation. Its tooling survives at `/tmp/claude-1000/-mnt-data-peter-projects-lagrange/553555be-039d-4cc4-94d1-91c96f39daef/scratchpad/slo-a2-classification/` (recorder v3, `scratch-observe.*`, `driver.sh`, per-host `out-v*`).

Files in this directory (all new, none touch the repository):

| file | role |
|---|---|
| `slo-recorder-v4.mjs` | the recorder for the ab7669fd0+ owner modules. Every v3 probe kept (evaluations + participation reads, safety-retry arm/fire, owner actions with wake boundary, lane, reconcile queue, op writes, lease touches, drain verdicts, readiness publications throttled 25 ms, seed cache op/row poller 25 ms, test-sample hook). Added: the S9 diagnostic (`readReplaceOwnerDiagnostic`, polled, on change; plus the owner's info/warn log calls captured before the level filter); `evaluateReplaceNamedHandoffSafety` decisions with the attempt record (`readReplaceHandoffAttempt`: attemptSeq, answerClass, issued/answered); `dispatchReplaceHandoffAttempt` and `isReplaceHandoffStillOwned`; the target handler's `handleStepDownReplica` (branch, tracked role, port answer), `handleReadReplicaMembership` (state, leader, term, gateOpen, applied, commit, window), `handleRetireReplicaPeer`; `persistReplaceRemovalIntent` and `executeReplaceSourceRemovalEffect`; `runRetainedOperationOwnerAction` submit/admit (BR2 lossless turn); the consensus relay (`TrackedServiceRegistry.subscribeConsensusObservations`: confState/leader/term per replica) and the port's `participation gate opened` event; the **role timeline**: every tracked partition service of the watched partitions polled through `raft.readStatus()` (role, term, leaderId, gateOpen, appliedIndex, commitIndex, voters, learners) on change and at least every 1 s, at `SLO_POLL_MS` (default 200; the brief's 100-250). Optional `SLO_LEVEL_POLL=1` also polls `captureReplaceOwnerLevel` (off by default: its participation reads can enqueue readiness builds). Every wrap is guarded and reports `wrap-missing`/`wrap-error` so a renamed method at the new SHA is visible in the summary line (`WRAP_MISSING=[...]`). All wrapped names were verified to exist at ab7669fd0. |
| `make-observer.mjs` | generates the observer variant from the test **at the checked-out SHA** (one settle-condition hunk + truncation before the second top-level test); verified to reproduce the A2 observer byte-for-byte against ab7669fd0's test. Written only into the throwaway worktree on the host (or an explicit out path). |
| `summarize-run.mjs` | one summary line per run (verdict, ot, leader changes, quiet, REPLACE ACTIVE/STOPPING/terminal times, evaluation classes leader/floor/publication/other/safe, rp evaluations, attempts `[seq:class]`, dispatches, not-owned count, step-down branches, witness reads and the leader identities they named, gate-closed/unavailable counts, wakes, fallback armed/fired, retained-turn waits, intents, effects, last S9 diagnostic, publications (rp), target gate-open time, roles at end, consensus leader events) and `run-N.timeline.txt` (all key records, ms relative to REPLACE ACTIVE). Smoke-tested on an A2 v3 recording. |
| `batch-instrumented.sh` | the host driver (§3). |
| `classify.md` | the sequence-table template (directive point 1). |

Env vars / flags, exactly: `SLO_RECORD_FILE`, `SLO_REPO`, `SLO_POLL_MS`, `SLO_LEVEL_POLL`, `NODE_OPTIONS=--import=<abs path>/slo-recorder-v4.mjs`; the batch mirrors the lab placement env `LAGRANGE_PLACEMENT=local LAGRANGE_TEST_MACHINE_FACTOR=1.3 LAGRANGE_LANE_JOBS_CAP=11 LAGRANGE_LAB_AGENT=claude:slo-probe-instrumented` and sets `LAGRANGE_LOG_FILE` per run (error lines only, as before). No repository code flag exists for the S9 diagnostic; it is in-memory state read through the module's own `readReplaceOwnerDiagnostic` export and the owner's `logger.info` (both consumed read-only). No `src` change is proposed.

Perturbation: the recorder wraps prototypes and polls (25 ms cache, 200 ms roles/diagnostics); absolute milliseconds are recorder-on milliseconds, as in A2. The causal sequence (which wake ended which idle, which verdict each evaluation gave) does not depend on it.

## 3. The batch (`batch-instrumented.sh`)

Same lock recipe as `batch.sh` (four-line `flock -w 600` on `~/.lab/machine.lock`, holder record `claude:slo-probe-instrumented`, removed on exit), plus `scripts/checks/wait-for-thermal-headroom.js` before every run. Works in a detached throwaway worktree `~/projects/lagrange/.lab-worktrees/slo-inst-<short>` at `$SHA` (fetched from `$BASE/$SHA.bundle` when the object is missing), `node_modules` symlinked from the host checkout (lockfile hash compared, warning on mismatch); the host checkout is never modified. Per run: `rec-N.ndjson`, `run-N.out`, `run-N.tap`, `run-N.stderr`, `run-N.log`, `run-N.timeline.txt`, `thermal-N.txt`, one summary line appended to `summary.txt` and echoed to `batch.out`. Stops at the first red; `KEEP_GOING=1` runs to N (a red-rate measurement runs to completion). A `STOP` file in `$BASE` stops it between runs. `MODE=observe` (default) runs the generated observer through `scripts/run-test-files.js --jobs=1` (every run measures the episode; the verdict is the observer's, same 2000 ms assertion); `MODE=plain` runs the unmodified classified test through `scripts/run-classified-test-files.js` (the real verdict; a green run's episode is cut at teardown). Exit 0 iff no red.

## 4. Launch (later, at the new SHA; nothing on the lab hosts now)

Controller, from the worktree that holds the new SHA (call it `$WT_CTRL`), after `node scripts/lab.js fleet` shows tv-dator free and thermally healthy:

```sh
S=/tmp/claude-1000/-mnt-data-peter-projects-lagrange/3bbd58f8-723a-4b06-bc52-98913da49e7b/scratchpad/slo-probe
SHA=$(git -C "$WT_CTRL" rev-parse HEAD)
HOSTBASE=$(ssh peter@192.168.86.32 'git -C ~/projects/lagrange rev-parse HEAD')
git -C "$WT_CTRL" bundle create "$S/$SHA.bundle" HEAD --not "$HOSTBASE"     # HEAD, not a bare sha (a bare sha is refused as an empty bundle)
ssh peter@192.168.86.32 'mkdir -p ~/slo-probe-inst'
scp "$S/batch-instrumented.sh" "$S/slo-recorder-v4.mjs" "$S/make-observer.mjs" "$S/summarize-run.mjs" "$S/$SHA.bundle" peter@192.168.86.32:~/slo-probe-inst/
ssh peter@192.168.86.32 "cd ~/slo-probe-inst && (SHA=$SHA N=10 KEEP_GOING=1 MODE=observe setsid nohup bash batch-instrumented.sh > batch.out 2>&1 < /dev/null & echo \$! > batch.pid); cat batch.pid"
```

Poll (60 s cadence, no on-host loop): `ssh peter@192.168.86.32 'tail -2 ~/slo-probe-inst/batch.out; cat ~/slo-probe-inst/out-'"${SHA:0:9}"'/summary.txt'`.
Stop early once two decisive reds exist: `ssh peter@192.168.86.32 'touch ~/slo-probe-inst/STOP'`.
Collect: `scp -r peter@192.168.86.32:slo-probe-inst/out-${SHA:0:9} "$S/host-output-inst/"`, then fill `classify.md` from the `run-N.timeline.txt` of each red (and of any green >= 1500 ms).
Cleanup (after collecting): `ssh peter@192.168.86.32 'git -C ~/projects/lagrange worktree remove --force ~/projects/lagrange/.lab-worktrees/slo-inst-'"${SHA:0:9}"'; rm -rf ~/slo-probe-inst'` (the fetched commit stays as `refs/lagrange-slo-probe/<short>`; delete with `git update-ref -d` if unwanted).

`KEEP_GOING=1` because the point of this batch is two or more instrumented reds (directive point 1); with `KEEP_GOING=0` it is a stop-at-first-red probe. `MODE=plain KEEP_GOING=1 N=10` afterwards, if the owner also wants the real test's red rate at the SHA.
