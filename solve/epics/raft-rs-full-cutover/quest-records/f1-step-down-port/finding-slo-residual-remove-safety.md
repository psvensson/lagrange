# Finding: the SLO residual after F1 is a drain-to-planner handover, not the transfer and not the 1 s safety retry

Recorded 2026-09-25 by a read-only investigator. No `src/` edits and no git writes were made. Subject: `test/integration/node-join-convergence-slo.integration.test.js`, assertion "over-target voter duration should stay bounded (<= 2000 ms)".

**Heads measured**
- F1 head: ad3f57814 (production bc8e1118d). The worktree has since moved to d9fa5284e. `git diff --stat ad3f57814 HEAD -- src` is empty, so every F1 number below also holds for the current head.
- Liferaft comparison: origin/main 3394e6356. The test file is identical on both heads.

**Host**
- All runs were on lab host tv-dator (i5-13420H, 12 threads). `lab fleet` gives it speed x1.38 against the controller's x1.00, so it is slower than this machine.
- Absolute milliseconds are therefore tv-dator milliseconds. The publish gate's lab placement sees this same timing class.
- The recipe from `docs/development/home-lab.md` ("Sharing the lab between agents and projects") was followed:
  - machine-wide `flock -w 600` on `~/.lab/machine.lock`, with a holder record, released on exit;
  - a `git bundle` of ad3f57814 and 3394e6356, fetched into a throwaway `--shared` clone in `~/slo-residual`;
  - `node_modules` linked from the host checkout (same `package-lock.json` hash);
  - `node scripts/checks/wait-for-thermal-headroom.js` before every run (CPU 56-73 C, NVMe 43-48 C, never gated);
  - `node scripts/run-test-files.js --jobs=1 <file>`.
- The lock was released after every batch. The throwaway directory was deleted afterwards.

**This is a red-rate classification.** Every batch ran to completion. It did not stop at the first red.

## 1. Red rate on the F1 head (unmodified test, tv-dator)

| Batch | Instrumentation | Red | Over-target when red | Runs where the test's samples saw the REPLACE at all |
|---|---|---|---|---|
| F1 ad3f57814, batch A | recorder loaded | **1/10** | 2719 ms (run 10) | 1/10 |
| F1 ad3f57814, batch B | none | **0/10** | - | 0/10 (all 10 settled at the first sample with `inFlight=[]`, 0 ms) |
| F1 ad3f57814, diagnostic batch | recorder loaded | 0/8 | - | 0/8 |
| Liferaft 3394e6356, diagnostic batch | recorder loaded | 0/8 | - | 5/8 (1024, 1621, 1603, 1223 ms, plus one 0 ms) |

What the rate means on this host:
- The unmodified test measures the REPLACE only if the REPLACE is in flight at the test's first sample. The loop settles on the first sample that shows no over-target and no coordinator operation (test lines 556-570).
- On tv-dator the F1 REPLACE has usually not started by the first sample. In two diagnostic runs it started about 600 ms after; in one it had already finished. So F1 goes green mostly because the test never sees the REPLACE, not because the REPLACE is fast.
- The red run is the one REPLACE that overlapped the sampling window and took the tail path described below.
- The recorder is described in the Evidence section. It wraps prototypes, polls the seed cache every 20 ms, and, after a transfer, polls the replacement's status every 10 ms for at most 5 s. Its perturbation is small but not zero. Batch B carries no instrumentation at all.

### Per-run detail, batch A (the 10-run instrumented red-rate batch)

Times are milliseconds relative to the REPLACE entering ACTIVE in the seed's cache. The recorder is v1 here: no completion stacks, no rebalancer trace.

| Run | Over-target | REPLACE reached | Handoff (branch) | Leadership moved to the replacement | ACTIVE-phase remove-safety deferrals (end time: reason) | Safety retry armed |
|---|---|---|---|---|---|---|
| 1 | 0 | PENDING only (then teardown) | none | - | - | - |
| 2 | 0 (test settled with `inFlight=[]` before the episode) | REMOVED via STOPPING | STEP_DOWN COMPLETED `transfer_forwarded` @92 | yes, 64 ms after the accepted transfer | +91 ownership pending (handoff); +177 2/3 floor; +294 2/3 floor; +325 SAFE | +177 (timer reused at +294) |
| 3 | 0 | PENDING only | none | - | - | - |
| 4 | 0 | none | none | - | - | - |
| 5 | 0 | CREATING (then teardown) | none | - | - | - |
| 6 | 0 | PENDING only | none | - | - | - |
| 7 | 0 | PENDING only | none | - | - | - |
| 8 | 0 | none | none | - | - | - |
| 9 | 0 | none | none | - | - | - |
| 10 | **2719, red** | REMOVED from ACTIVE (drain) | STEP_DOWN COMPLETED `transfer_forwarded` @259 | yes: candidate at 257 ms, leader at 490 ms | +257 ownership pending (handoff); +1115 2/3 floor (this evaluation took 856 ms); +1230 2/3 floor | +1115 (reused at +1230) |

Run 10 timeline (seed cache clock):
- -77: the replacement row is active, follower, with an address.
- +151: the test first sees 4 voters.
- +259: the transfer is accepted.
- +749: the replacement is leader.
- +1308: the REPLACE is REMOVED **while still at ACTIVE**. Source r2 is still a voter.
- +2331 to +2409: node 202's planner remove-safety for a new REMOVE of r1 returns SAFE.
- +2531: the surplus REMOVE is created.
- +2720: SENDING.
- +2870: the test sees the count cleared.
- +2952: REMOVED.

## 2. Mechanism

### 2a. The replacement is caught up. The readiness evidence is what is stale.

Evidence that the replacement's raft state is not behind:
- **Row topology.** In all 221 ACTIVE-phase remove-safety evaluations recorded (both backends), the merged replacement row was `status=active`, `raft_role=follower`, with an address. `isVoterReadyReplicaTopology` was true every time.
  - Row topology: `src/rebalancer/priority-publication-safety-topology.js:123-133`.
  - Row merge: `src/rebalancer/priority-publication-safety-rows.js:72-97`.
- **Raft.** 39 of 39 F1 transfers made the replacement leader, 47-490 ms after the accepted transfer (median 56 ms). raft-rs sends `MsgTimeoutNow` only to a transferee whose `matched` has reached the leader's last index, so the replacement was a caught-up voter.

Evidence that the readiness answer is what fails:
- The failing input is node participation, not the row. The chain:
  - `isNodeReadyForRouting` (`priority-publication-safety-rows.js:305-342`, participation branch `:318-332`, because remove safety passes `REMOVE_SAFETY_OWNER_PARTICIPATION_KIND` from `operation-workflow-remove-safety-evaluator.js:525-529`);
  - `ControlPlaneReadinessParticipationBase.getControlPlaneParticipationSync` (`src/control-plane/control-plane-readiness-participation-base.js:567-588`);
  - `getNodeReadinessSync` (`control-plane-readiness-service-node-methods.js:581-595`);
  - `ReadinessPlanningSnapshotOwner.readSync` (`src/control-plane/readiness-planning-snapshot-owner.js:515-622`).
- `readSync` answers a memoized **deferred** snapshot and enqueues a rebuild whenever the completed record is not reusable for the current token. The deferred snapshots are built at `:565-572` and `:595-614`, and the barrier path is at `:624-648`.
- The participation answer is then `eligible=false` with codes `[PRIORITY_CONTROL_PLANE_RECOVERY_PENDING, planning_snapshot_refresh_pending]`, and failed dimensions `processAlive, clusterMemberHealthy, routingReady, loadReady`.
- Per-node participation reads inside ACTIVE-phase evaluations:

  | Batch | Refresh-pending denials | Evaluations with both nodes eligible at once |
  |---|---|---|
  | F1 scratch | 48 of 74 | 7/37 |
  | F1 scratch2 | 60 of 94 | 9/47 |
  | F1 scratch3 | 93 of 150 | 17/75 |
  | Liferaft scratch | 38 of 64 | 9/32 |

  The rate is the same on both backends.
- Consequence for the replacement:
  - `isVoterReadyFloorCountableReplica` (`priority-publication-safety-topology.js:175-199`) does not count it.
  - The evidence-absent carve-out does not apply either. `readiness-denial-classification.js:17-45` accepts only a denial made exclusively of evidence-absent codes, and `PRIORITY_CONTROL_PLANE_RECOVERY_PENDING` rides along even on eligible reads.
  - So the floor projection at `operation-workflow-remove-safety-evaluator.js:660-679` answers "would drop voter-ready replicas below minimum (2/3)".
- Tally over all 221 ACTIVE-phase evaluations (both backends):
  - 120 "2/3 floor";
  - 52 "replacement leader ownership pending" (each one issues the handoff);
  - 49 SAFE;
  - **0 "is not voter-ready"**.
- The implementer's single "not voter-ready" (the `stepdown-d2` run on this machine) did not reproduce on tv-dator.
  - That message needs the row topology itself to fail (`operation-workflow-remove-safety-universal-tier.js:56-75`). With the step at ACTIVE on a priority partition, `isPriorityActiveReplaceTopologyVoterEvidenceSufficient` (`priority-recovery-superseded-target.js:480-492`) otherwise passes.
  - A candidate cause is the merge at `priority-publication-safety-rows.js:30-66`, which prefers every non-null authoritative field over the cache. A lagging authoritative row with `raft_role=learner` would do it. This is unverified: that log records no rows.

This is the known readiness-planning currency class: one planning snapshot per node, refreshed one per drain, with all-nodes conjunctions rarely seeing every node current (memory `readiness-planning-liveness-slice1`). It is pre-existing, and identical on Liferaft.

### 2b. Two paths retire the surplus voter, and the red tail is always the second

The over-target window closes when a seed voter leaves. There are two ways that happens.

**Path 1, STOPPING.**
- The REPLACE owner (the target node 202 owns unsettled priority REPLACEs) re-evaluates remove safety.
- SAFE arrives when one evaluation lands while both nodes are current. That evaluation is re-entered by incidental operation-row progress, not by the timer.
- Then STOPPING, then the source removal, then the seed's drain settles the REPLACE at STOPPING.

**Path 2, the drain settles the REPLACE at ACTIVE.**
- The seed's periodic `checkTimeouts` runs `reconcileTimeoutOperation`, then `reconcilePriorityRecoveryOperationDrain`, then `completeOperation` (`src/rebalancer/operation-workflow-recovery-drain.js:595-660`, completion at `:656`; stack recorded in F1 scratch2 #5 and #7 and Liferaft diag #4).
- This runs while remove safety is still deferring. The drain's verdict comes from the *available* planning snapshot (`:500`): the spread is satisfied.
- The REPLACE becomes terminal with its source r2 **still a voter**.
- The surplus must then be rediscovered by the ledger partition's planner, which creates a fresh REMOVE (of r1 in every case).

Over-target by path, from the scratch observer plus the diagnostic batches, in milliseconds:

| Backend | Path 1 (STOPPING) | Path 2 (drain at ACTIVE) | Path 2 share |
|---|---|---|---|
| F1 | 766-1361 (median 1059) | **2353, 2576, 2719 — all red** | 3/39 episodes |
| Liferaft | 787-1529 (median 1134) | 1603, 1621 — green | 2/13 episodes |

First SAFE in Path 1 comes at 202-1097 ms after ACTIVE on F1 (median 596) and 520-1093 ms on Liferaft (median 821).

**The whole regression is the gap from "drain settles at ACTIVE" to "surplus REMOVE planned":**

| Backend | Episode | Drain settles at | Surplus REMOVE planned at | Gap | Planner node |
|---|---|---|---|---|---|
| Liferaft | diag #4 | +1135 | +1175 | 40 ms | 201 |
| Liferaft | diag #6 | +1146 | +1214 | 68 ms | 201 |
| F1 | red-rate #10 | +1308 | +2409 | 1101 ms | 202 |
| F1 | scratch2 #5 | +859 | +1592 | 733 ms | 202 |
| F1 | scratch2 #7 | +768 | +1886 | 1118 ms | 202 |

Why the gap is about 1 s under F1 (scratch2 #7, and the checkRebalance trace in scratch3 #1, #4, #9):

1. F1 makes the target handoff work. The transfer moves `replica_operations-p1` leadership to the replacement on the joiner.
2. Rebalancer leadership for the ledger partition moves with it:
   - the seed's `setLeader(false)` comes about +315 ms after ACTIVE;
   - the joiner's `setLeader(true)` comes about +590 ms after ACTIVE;
   - that leaves about 270 ms with no ledger rebalancer.
3. `setLeader(true)` on a priority partition enqueues an immediate check (`src/rebalancer/unified-rebalancer-lifecycle-base.js:588-607`, enqueue at `:605`). In scratch3 #1, #4 and #9 that check ran at +593 to +607 and was not rate-limited.
4. `checkRebalance` refuses any check less than 1000 ms after the previous one on a priority partition (`src/rebalancer/rebalancer-planning-gate-methods.js:716-734`, min interval at `:722`).
5. It reschedules through `scheduleNextCheck`, which floors every override at 1000 ms (`:42-56`). A rejected wake therefore costs a full 1000 ms or more, not the remaining interval.
6. In scratch2 #7:
   - the joiner's leader-start check ran at +555;
   - the drain settled the REPLACE on the seed at +687;
   - the joiner received its `priority_recovery_progress` wakes at +749 to +777, 194 ms after its check, so they were refused;
   - the next check ran at +1779 (+749 plus the 1000 ms floor, plus the queue);
   - the REMOVE was planned at +1886.
   - The trace's later rate-limited wakes (+1300 and +1473 in scratch3 #1 and #4) show the same refusal.
7. Under Liferaft the handoff answers `armed_directed_election`, and leadership never moves inside the window:
   - across 16 Liferaft runs, the joiner's ledger rebalancer accepted **0** checks, against 2209 and 2368 for the seed;
   - on F1 the joiner's ledger rebalancer accepted 48 and 130.
   - So the seed's rebalancer plans the surplus REMOVE 40-68 ms after the drain's terminal event, because its own last check was more than 1 s earlier.

Scratch2 #5 adds a second way to the same gap:
- The ACTIVE-phase evaluation took 999 ms: the authoritative row read took 275 ms and the priority completion read took 666 ms.
- Meanwhile the drain settled the REPLACE at +859.
- The evaluation's handoff request was still dispatched at +1210, 351 ms after the operation became terminal. Leadership moved for an operation that no longer existed (finding F-b below).
- The seed's own wake at +866 had been rate-limited, and its rescheduled check died with its leadership at +1300. The joiner's leader-start check at +1546 planned the REMOVE.

### 2c. The fixed 1 s safety retry is not the latency

- `SAFETY_DEFERRED_RETRY_DELAY_MS` (`src/rebalancer/operation-workflow-owner-shared.js:339`) is armed by `scheduleDeferredSafetyRetry` (`src/rebalancer/operation-workflow-dispatch-rearm-evidence.js:494-590`, called from `operation-workflow-dispatch-response-reconcile.js:312-331`).
- **It fired in 1 of 52 recorded REPLACE episodes** (F1 scratch2 #3, not a tail).
  - In Path 1, SAFE came first through other re-entries: `execute_reconcile` and dispatch on operation-row progress.
  - In Path 2, the operation was already terminal when the timer would have fired.
- A node's participation read usually turns current again within about 100-300 ms (consecutive evaluations flip per node). The obstacle is the two-node conjunction, not a slow per-node refresh.
- So neither of the brief's two cases fits. The timer is not the latency, and the latency is not raft catch-up or promotion upstream.
- It is still polling where an event belongs:
  - the readiness owner publishes every refreshed snapshot (`readiness-planning-snapshot-owner.js:211-228`, `subscribe` and `notifySnapshotPublished`, exposed as `subscribeReadinessPlanningSnapshots` at `control-plane-readiness-planning-owner-delegate-methods.js:53-56`);
  - the replica dispatch service already re-drives its node-ready deferral from that event (`src/control-plane/replica-dispatch-service-lifecycle.js:244-290`, `READINESS_PLANNING_SNAPSHOT_PUBLISHED`);
  - remove safety has no such wake. It is cleared only on a transition or on SAFE (`operation-workflow-recovery-reconcile.js:379-386`).

### 2d. The coordinator's verifier inputs, checked against the SLO flow

1. **Two transfers per handoff.** Not in this flow.
   - Every F1 handoff was exactly one STEP_DOWN with `replace_target_leader_election` and one named `transferLeadership` (39/39).
   - There was never a `most-caught-up` source handoff, because the leader-safety snapshot escalates straight to `REQUEST_REPLACEMENT_LEADER_ELECTION` (Lever A in `priority-publication-leader-safety.js:136-420`).
   - Leadership always landed on the replacement.
   - The leader-placement cure never called `requestLeadershipTransfer` in these runs. The recorder wraps every caller.
2. **Stale tracked role answers ERROR `not-leader`.** Not reached. All 39 STEP_DOWN answers were COMPLETED `transfer_forwarded`, with tracked role follower.
3. **The transfer-in-progress window.**
   - In the test's configuration (`electionTimeoutMinMs` 300, `heartbeatIntervalMs` 75, test lines 444-449), the leader at transfer time was always `replica_operations-p1-r1`, index 0, term 1 (39/39).
   - The rs-raft tick is 75/3 = 25 ms. `electionTick` is ceil(300/25) = 12 ticks (`raft-rs-runtime-tuning.js:26-37`, `replica-election-timeouts.js:22-49`). The window, and the bound on proposal and conf-change drops, is therefore about 300 ms.
   - Measured landings were 47-490 ms. No transfer was aborted: 0/39 transfer watches ended without a leader.
   - **No retirement step, neither the STOPPING conf change nor the surplus REMOVE, fell inside [accepted, landed] in any of the 39.**
   - One overlap matters. In red-rate #10 the landing took 490 ms, and the ledger was mid-transfer during the 856 ms post-handoff evaluation. Its authoritative reads are ledger reads, so the handoff window lengthened that evaluation.
   - Under production defaults the window would be 1000/3500/6000 ms at leader index 0/1/2. That matters in production, not in this test.
   - The implementer's "no leadership move within 5 s" did not reproduce in 39 transfers.

## 3. Owner

**The residual has one semantic owner: source retirement for a REPLACE.** It currently has two authorities:
- the REPLACE workflow's own retirement step (remove safety, then STOPPING);
- after the priority-recovery drain settles the REPLACE at ACTIVE with its source still a voter (`operation-workflow-recovery-drain.js:595-660`), the ledger planner's surplus detection re-derives the same obligation.

The second authority learns of the obligation only through generic progress wakes, which `checkRebalance`'s cadence contract throttles (`rebalancer-planning-gate-methods.js:42-56`, `:716-734`). That is an R01/R03 defect: the obligation is dropped by one owner and rediscovered by another. It sits at an unnamed owner interaction (R02): the drain terminal meets the planner ingress.

**Regression or pre-existing?** Pre-existing latency that Liferaft happened to avoid.
- Path 2 and its handover exist on Liferaft: 2 of 13 episodes, at 1.6 s.
- Liferaft stays under 2 s only because its handoff never moves ledger leadership. The old leader's rebalancer is warm and outside its min interval.
- F1 is correct to move leadership; it is the property F1 exists to provide. It exposes the handover: the new leader's start check consumes the 1000 ms interval right before the drain's terminal wake arrives.
- The cutover did not create the defect. It made it red.
- The upstream cause of Path 2 is the readiness-currency conjunction (2a). It is pre-existing, rates the same on both backends, and belongs to the readiness planning owner.

## 4. Proposed owner-level repair (not implemented) and red-first witnesses

**R-1 (the owner fix): one owner for REPLACE source retirement.**
- The drain must not settle a REPLACE terminal while the REPLACE's source replica is still a live voter of the partition.
- When it judges the spread goal met, that verdict should authorize the REPLACE's own retirement step. The source then leaves through the REPLACE's STOPPING, under its remove-safety owner, on one path (R11).
- Today the verdict completes the operation and leaves a surplus for the planner to find.
- The alternative (b) keeps two owners and names the handover as a contract. The terminal transition would carry the retirement as a successor obligation, and the planner would take it on an explicit ingress that is not cadence-throttled. (b) makes the handover faster without removing the duplicate authority, so (a) is preferred.
- Whether a REPLACE may be terminal with its source still a voter is a contract semantic. See the stop conditions.

**R-2 (event-driven re-entry, the answer to question 3).**
- A remove-safety deferral whose failing input is a refresh-pending participation read should be re-evaluated when the readiness owner publishes a current snapshot for that node (`subscribeReadinessPlanningSnapshots`), as the replica dispatch service already does.
- The fixed `SAFETY_DEFERRED_RETRY_DELAY_MS` would remain only as the bounded fallback.
- R-2 alone does not fix the red: the timer is off the critical path. It is the right shape, and it would let Path 1 win the race against the drain more often.

**R-3 (upstream, routed, not in F1's scope).**
- The readiness planning currency that makes about 60% of participation reads refresh-pending during a REPLACE.
- Owner: `readiness-planning-snapshot-owner.js`. Lineage: `readiness-planning-snapshot-liveness` and "planning generation granularity".
- Record it for that owner (R17). Do not absorb it here.

**Witnesses, red first on d9fa5284e and green on the repair.** Clocks are injected owner clocks. No sleeps, and no budget changes.

- **W1 (R-1, the owner).** Fixture: a priority REPLACE at ACTIVE on `replica_operations-p1`, source still a voter; remove safety deferring (participation refresh-pending); the drain's available snapshot answering COMPLETE.
  - Assert the operation is not terminal while the source is a voter, and that the source leaves through the REPLACE's own STOPPING. No REMOVE row is created for that surplus.
  - Red today: `completeOperation` at `operation-workflow-recovery-drain.js:656` from ACTIVE, which reproduces the recorded stacks.
- **W2 (R-1, execution).** Fixture: the ledger rebalancer's leader start one owner-clock tick before the drain's verdict.
  - Assert that source retirement starts without any `checkRebalance` admission.
  - Red today: the retirement waits for the next check, at least 1000 ms by the owner clock (`rebalancer-planning-gate-methods.js:52-56`).
- **W3 (R-2).** Fixture: a REPLACE-remove deferral whose only failing term is a participation read carrying `planning_snapshot_refresh_pending`.
  - Publish a current snapshot for that node at owner-clock t0.
  - Assert remove safety re-evaluates at t0, with zero owner-clock time passing.
  - Red today: no re-evaluation until the 1000 ms timer or an unrelated operation-row event.
- **W4 (finding F-b).** Fixture: the drain settles the operation while an ACTIVE-phase evaluation is awaiting its reads.
  - Assert that no STEP_DOWN handoff is dispatched after the operation is terminal: the gate is re-checked at the point of effect, `operation-workflow-dispatch-response-reconcile.js:261-273`.
  - Red today, as recorded in scratch2 #5: the handoff was dispatched 351 ms after REMOVED.
- **E2E (corroborating only).**
  - The unmodified SLO test on a lab host (red-rate batches as above).
  - The scratch observer's per-episode table. Path 2 count and over-target under 2000 ms in every episode on the repair.
  - The scratch observer is a copy of subtest 1 that keeps sampling until the REPLACE is terminal (`scratchpad/slo-residual/scratch-observe...`). It is evidence, not a repository test.

## 5. Findings for other owners (R17; different properties, not in this record's scope)

- **F-a. The test's observation races the REPLACE.**
  - The SLO test measures a REPLACE only if one is in flight at its first sample.
  - On tv-dator: F1 1/28 unmodified runs; Liferaft 5/8.
  - So red-rate differences between heads partly measure whether the test sees the episode. Owner: the test's author and the test guidelines.
  - This is not a proposal to weaken or lengthen the test.
- **F-b. Post-terminal side effect.**
  - The remove-safety handoff dispatch at `operation-workflow-dispatch-response-reconcile.js:261-273` acts on an evaluation that began before the operation became terminal. It does not re-check the operation at the point of effect (protocol item 13).
  - In scratch2 #5 this moved ledger leadership for a terminal operation.
  - Owner: the operation workflow.
- **F-c. Authoritative-over-cache field merge.**
  - `mergeReplicaRowsForSafety` (`priority-publication-safety-rows.js:30-66`) prefers every non-null authoritative field, however old.
  - This is the candidate cause of the implementer's unreproduced "not voter-ready". Unverified.
- **F-d. Readiness currency (R-3).** Pre-existing, same rate on both backends.

## 6. Stop conditions

- **R-1 changes REPLACE completion semantics**, whether a REPLACE may be terminal while its source is still a voter. It also touches why the drain settles REPLACEs at ACTIVE at all (the CL-023/CL-044 liveness history).
  - That is an owner decision under R26/section 9: a contract semantic. Stop for the lead.
  - A census of the drain's ACTIVE-settle callers and their liveness purpose must precede any implementation.
- If the owner chooses (b) instead, the ingress bypasses the planner's cadence contract, which exists for load (R12). The contract change needs its own proof.
- R-3 belongs to the readiness planning owner's lineage. Do not fold it into F1 or the cutover publish.
- Nothing here justifies raising the 2000 ms budget, retrying the test, or adding waits.

## Evidence

Everything is under `/tmp/claude-1000/-mnt-data-peter-projects-lagrange/553555be-039d-4cc4-94d1-91c96f39daef/scratchpad/slo-residual/`.

- `slo-recorder.mjs`: the recorder, loaded with `NODE_OPTIONS=--import` and active only in the test process. `slo-recorder-v1.mjs` is the batch-A version.
  - It wraps `handleStepDownReplica`, `requestLeadershipTransfer`, `evaluateRemoveSafety` with its sub-inputs through AsyncLocalStorage, participation reads, `scheduleDeferredSafetyRetry`, `completeOperation`/`failOperation` stacks, `updateStep`, and `enqueueRebalanceCheck`/`checkRebalance`/`setLeader`/`evaluateState` for `replica_operations-p1`.
  - It also records readiness snapshot publications, a 20 ms seed-cache poller for operations and service rows, and the test's own sampling calls.
- `lab-driver.sh`: lock, holder record, thermal gate, runner.
- `scratch-observe.node-join-convergence-slo.integration.test.js`: the scratch observer.
- `lab-out/<batch>/{rec-N.ndjson,file-N.tap,thermal-N.txt,summary.txt}`. Batches:
  - `f1-redrate` (A), `f1-redrate-plain` (B), `f1-diag`, `lr-diag`;
  - `f1-scratch`, `f1-scratch2`, `f1-scratch3`, `lr-scratch` (scratch observer).
- `episode-table.md` (full) and `episode-table-condensed.md`: one row per REPLACE episode, 39 F1 and 13 Liferaft.
- `table.py`, `tail.py`, `timeline.py`, `episode.py`: the analysis scripts.
