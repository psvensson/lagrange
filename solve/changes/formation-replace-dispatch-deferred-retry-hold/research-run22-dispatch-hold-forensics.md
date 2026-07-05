# Run-22 dispatch-hold forensics (service-data-affinity demo, 2026-07-04T23:29:50–23:33:33)

Node map: N0=0c0fafa4 (seed; planner/rebalancer leader for the moved partitions; hosts ALL bootstrap
replicas), N1=2886f31e, N2=6106e660, N3=4fd8f904, N4=253e8a5c.
Logs: data/examples/service-data-affinity-demo/node-{0..4}.log (live). Per-op extracts:
scratchpad/op-<id>.ndjson (N-tagged, time-sorted).

## HEADLINE (premise revision)

"Dispatch never happened" is FALSE for 3 of the 4 pinned REPLACEs. CREATE_REPLICA reached the
target node and the target replica was fully created (voter-ready) for 31a46b4d, 5531160f,
f4c7e8fa AND 25c9ce61. What never happened was (a) persisting workflow-step progress into the
operation ledger (`replica_operations`, partition replica_operations-p1) and (b) the owner-side
workflow progression past replica-creation. The final .db snapshot shows the last PERSISTED step,
not execution reality — the run's defining failure is that the ledger itself was un-writable-in-time
for ~3 minutes, so ledger state and execution state diverged permanently.

Root chain (best-evidence):
1. Bootstrap places ALL 3 replicas of every system partition on seed N0 (r1,r2,r3 each partition,
   verified via election-timer lines 23:30:20). Formation = spread via REPLACEs.
2. 23:30:27 the LEDGER self-move 59697071 (REPLACE replica_operations-p1 → N1) runs first
   (run-20 interlock serialized creation correctly: the 4 data REPLACEs were only created at
   23:30:43.8+, 200ms after 59697071 completed 23:30:43.659). It removes ledger leader r1@N0;
   r4@N1 becomes leader (term 2, 23:30:42.988); followers r2,r3 REMAIN both on N0.
3. From 23:30:51 every distributed write to `replica_operations` intermittently fails
   (DISTRIBUTED_PARTICIPANT_FAILURE; participant errors: 'Query timeout after 1000ms' 9x,
   'Message timeout' 6x, 'Pending response timeout' 5x, 'Raft write commit timed out after
   30000ms' 1x — failing participants 2886f31e(N1, the leader itself) and 0c0fafa4(N0)).
   N0 is overloaded: 14 event-loop gaps 1.0–2.5s mid-run (9.4s at startup), HLC 'Excessive clock
   drift' 368x on N0 escalating 15/53/154/146 per minute. Ledger quorum = r4@N1 + (r2|r3)@N0,
   so every commit needs an ack from stalled N0.
4. N1 (new ledger leader + ops workflow owner for coordinator-created ops) processes handoffs
   SERIALLY, each burning ~30s in ledger-write timeouts: dispatch 31a46b4d 23:30:44 (pre-degradation,
   steps persisted to SYNCING), 25c9ce61→N2 23:31:17, 5531160f 23:31:19, f4c7e8fa 23:31:49
   (each 'Failed to persist operation' then CREATE_REPLICA sent anyway).
5. N1's periodic coordinator lane FROZE 23:30:44→23:33:19 (storage-reservation reconciliation: 7 runs,
   last start 23:30:43.957, never again; planning-gate diagnostics on N1: 23:30:44.025 then next
   23:33:19.430). The freeze exactly brackets 'Creating operation 0117dfd8' (23:30:46.592) →
   'Failed to persist operation 0117dfd8' (23:33:19.408, raft commit 30s timeout). The lane that
   produced 59697071's `reconcile_active` SYNCING→ACTIVE transition is this frozen lane — so no
   N1-owned op could advance past replica-created.
6. Executor status writes on N1 deferred as 'Replica create status write deferred after retryable
   control-plane failure' (retryAfterMs: None) and dispatch deferrals are EVENT-GATED
   ('Deferred replica operation dispatch while control-plane path recovers') — the recovery signal
   never came (control-plane readiness stayed degraded: contractState=degraded,
   published_active_coverage_incomplete, fenceState=promotion_denied, snapshot_coverage_unavailable
   missing on ALL 5 nodes through 23:33:24). The pending deferrals flushed only at Router shutdown —
   that is exactly why the ~6 'Deferred replica operation dispatch' lines are all at 23:33:33.
7. N0's planner stopped producing rearm ticks at 23:31:54–58: 18x 'Waiting for local control-plane
   serve readiness before planning critical system rebalancing' (PRIORITY_CONTROL_PLANE_RECOVERY_PENDING,
   delayMs 75000). It resumed ~23:33:13 — immediately drove 25c9ce61's source removal (23:33:17) —
   then the demo's 120s no-completion cut tore everything down at 23:33:29-33.

## Per-op lifecycles (UTC 23:xx, all five logs merged)

### 31a46b4d REPLACE control_plane_publications-p1 → N1 [ledger: SYNCING | truth: target replica ACTIVE+voter-ready, waiting on frozen owner lane]
- 30:43.834 N0 creates; 30:43.949 reservation (11.5MB, N1).
- 30:44.087 N1 PENDING→SENDING (ingress priority_claim_cas — priority control-plane lane, claim persisted while ledger still healthy); CREATE_REPLICA handled.
- 30:44.355 SENDING→CREATING; 30:44.375 CREATING→SYNCING (executor_outcome). Last persisted step.
- 30:44.343 r4 starts as learner (promotionDelayMs 30000); 30:49.345 election timer (peerCount 3); 30:49.512 'Replica reached voter-ready activation state'; 30:49.576 'Replica creation completed' stage=active peers=3/3 ok.
- SILENT from 30:49.576 except N0 planner 'skip_not_pending' x10 (correct — not PENDING).
- Waiting on: SYNCING→ACTIVE `reconcile_active`, produced only by N1's reconciliation lane — frozen 30:44→33:19 (see #5). NOT waiting on actual data sync (replica was voter-ready at 30:49).

### 5531160f REPLACE sql_transactions-p1 → N1 [ledger: SENDING | truth: replica created 31:25.992]
- 30:43.834 N0 creates; 30:43.998 reservation.
- 30:44–31:54 N0 rearm loop: 24x rearm_dispatch, 14x skip_live_deferred_retry.
- 31:19.389 N1 ledger UPDATE fails (participant timeout, the SENDING claim write, ~35s in-flight); 31:19.390 CREATE_REPLICA handled ANYWAY; 31:19.393 create-status write deferred (retryAfterMs None).
- 31:20.429 r4 learner; 31:25.436 election timer; 31:25.992 'Replica creation completed'.
- SILENT after 31:25.992 until teardown flush 33:33.852 ('Router shutdown', boundary coordinator_created_remote_handoff).

### f4c7e8fa REPLACE sql_write_operations-p1 → N1 [ledger: PENDING | truth: replica created 31:55.084]
- 30:44.177 N0 creates; 30:44.843 reservation.
- 30:45–31:54 N0 rearm loop: 39x rearm_dispatch, 15x skip_live_deferred_retry.
- 31:49.398 N1 ledger UPDATE fails; 31:49.403 CREATE_REPLICA handled; 31:49.414 status write deferred.
- 31:49.691 r4 learner; 31:54.809 election timer; 31:55.084 'Replica creation completed'.
- SILENT after 31:55.084. Ledger never even recorded SENDING → stuck PENDING.

### 25c9ce61 REPLACE sql_transaction_participants-p1 → N2 [ledger: SENDING | truth: reached STOPPING, source removed 33:17, wedged mid-run on DUPLICATE-op mutual block]
- 30:45.789 N0 creates. INSERT of its ledger row FAILED FOR GOOD at 31:07.308 (attempt 4, retryAfterMs 0) — op row never authoritative.
- 31:07.706 (400ms later!) N0 creates ccff2762 — a SECOND REPLACE of the SAME partition → N4. Dedupe/interlock blind because the first op's row was invisible.
- 31:17.373 N2 CREATE_REPLICA (r4); 31:23.572 creation completed; r4 voter-ready.
  (ccff2762: N4 CREATE_REPLICA 31:44.197; r5 created 31:51.588 → partition at 5 replicas.)
- 32:19.594 N2: leader handoff completed; r4 'Became leader' 32:19.866 (STEP_DOWN r1, replace_target_leader_election).
- 32:19.605→33:16 N2 defers ~1s cadence: 'replace_remove_safety_blocked' — first 'source leader r1 replacement ownership pending', then 'Quorum check failed: concurrent partition operation ccff2762 is active'; symmetrically N4 defers ccff2762 on '25c9ce61 is active'. MUTUAL LIVELOCK (same class as run-21's voter-surplus promotion⟂drain head).
- 33:17.204 N0 handles REMOVE_REPLICA r1 (replace_source_removal), 33:17.472 completed — unblocked when N0's planner woke from the 75s hold (33:13); one side's safety gate finally passed (CL-043 stale-exclusion aging out the sibling is the likely release).
- 33:25.769 N2 'Operation row missing from authoritative partition after zero-row update; re-inserting owner copy' (STOPPING, expected ACTIVE) → 33:30.43 re-insert FAILS. Ledger forever says SENDING.

### 0117dfd8 ADD replica_operations-p1 → N3 (ledger's own spread ADD; interlock-exempt per CL-013)
- 30:46.592 created by N1 (ledger-partition rebalancer leader), bootstrapReplicaIdCount 4.
- Its ledger INSERT wedged N1's coordinator lane for 2m33s; failed 33:19.407: participant = N1's OWN r4, 'Raft write commit timed out after 30000ms'.
- Never dispatched (no trace on N3 for this id). Teardown flush 33:33.851/.852.
- N3 DID get a ledger replica r6 (learner 32:24.781, voter-ready 32:29.886) — but via ca191926, a SECOND LEDGER SELF-MOVE (REPLACE replica_operations-p1 → N3) created by N0 at 31:52.682, still ACTIVE at teardown. The run-20 interlock did not stop ca191926 because its inputs are COMMITTED ledger rows: the live siblings were persist-failed (invisible) or stale past step-timeout (CL-043 exclusion treats them as reaper candidates, not serialization holders). Self-referential blind spot: the wedge's symptom (unwritable ledger) disables the guard that should prevent worsening it.

## Q2: rearm accounting and what follows rearm_dispatch
Counts ('Reusing in-flight operation', all on N0, window 30:44.19→31:54.36 — the loop STOPS at 31:54):
- 31a46b4d: skip_not_pending x10 (0 rearms — correct, it left PENDING at 30:44).
- 5531160f: rearm_dispatch x24, skip_live_deferred_retry x14.
- f4c7e8fa: rearm_dispatch x39, skip_live_deferred_retry x15.
Mechanism (src/rebalancer/rebalance-coordinator-operation-intent-methods.js:441-470 →
rebalance-coordinator-operation-creation.js:576 → operation-workflow-owner-handoff-state.js:413):
rearm_dispatch = PENDING and no live deferred-retry → armCoordinatorCreatedOperation → op is
REMOTE-owned → WAKE_REMOTE_OWNER (wake sent to ledger-leader N1); on failure
deferCoordinatorCreatedRemoteHandoffRetry arms a retry ⇒ next ticks log skip_live_deferred_retry.
So rearm_dispatch does NOT itself dispatch; it wakes N1, whose claim-write burned ~30s per op in
ledger timeouts before dispatching anyway (5531160f at 31:19, f4c7e8fa at 31:49 — i.e. the rearms
DID eventually work). No mid-run dispatch-error lines exist on N0 because failures were absorbed
into the event-gated deferral lane that only flushed (and logged) at Router shutdown.

## Q3: what 31a46b4d (SYNCING) waits on
Target replica was voter-ready 23:30:49.512, creation complete, peers 3/3 ok. It waits on the
OWNER-side SYNCING→ACTIVE reconcile (`reconcile_active`, cf. 59697071 at 30:42.684) — produced by
N1's reconciliation loop, frozen 30:44→33:19 behind the 0117dfd8 ledger INSERT, and any transition
persist would have hit the same failing ledger writes. No voter/promotion blocker on the partition
itself.

## Q4: dispatched-vs-not difference
All four had the same creator (N0), and three the same target (N1). Differences:
- 31a46b4d is a PRIORITY control-plane partition (priority_claim_cas ingress) AND went first, at
  30:44, in the ~7s window after self-move completion before the ledger write path degraded (first
  failure 30:51). Its claim + step persists landed.
- 5531160f/f4c7e8fa/25c9ce61 hit the degraded window; their claim/step writes timed out; N1's
  serialized handoff lane delayed CREATE_REPLICA by 35s/65s/33s; steps never persisted.
- Not the critical-create serialization lane (different partitions), and NOT the ledger-interlock
  admission blocking them (no interlock log lines fire; creation of all 4 happened AFTER the
  self-move completed). The self-move's causal role is upstream: it moved ledger leadership to N1
  while leaving both followers on overloaded N0, and its completion released the interlock into a
  ledger that was slow-committing from that moment on. Inverse direction (siblings blocking the
  self-move) applies only to the SECOND self-move ca191926 — which should have been blocked but
  admitted through the persist-failure/staleness blind spot.

## Q5: phase-2 admin WS timeout — VERDICT: downstream of the wedged formation, NOT an independent defect
- Admin request id examples-1783207975796-... ⇒ epoch 23:32:55.796.
- N0 'table-creation-service Creating table ratings' 23:32:55.801 — the CREATE TABLE WAS received
  over admin WS (channel healthy; 34 connects/33 disconnects, no WS errors).
- Provisioning op 55aa3055 ADD tbl-9ed2453b...-p1 → N0 created 23:32:55.817; its ledger persist
  failed like everything else; 23:33:27.301 'Initial table partition provisioning failed'
  (error 'Distributed operation failed due to participant failures').
- Client timeout (30s, scripts/examples/admin-ws-client.js:130) fired ~23:33:25.8, just before the
  provisioning failure would have produced an error response. Not budget_exceeded (no
  budget_exceeded on the DDL path; those 144 lines are the planner's replica_operations-p1-r3 move).

## Q6: voter/membership context, activeCount 4
- 'Deferring spread-driven count-increasing ADD ... activeCount:4 target 3 (overCreationCap)':
  control_plane_publications-p1 (33x), sql_transactions-p1 (24x), sql_write_operations-p1 (13x).
- NOT duplicate emergency ADDs this run. Mechanism: bootstrap has r1,r2,r3 all on N0; the REPLACE
  created target r4 (N1) but the wedged workflow never removed the source ⇒ 4 active with target 3;
  spread planner then wants a 5th node but correctly defers (no count-neutral REPLACE pairing since
  the REPLACE is already in flight). 'Critical rebalancing state detected' reason =
  control_plane_replicas_not_spread: 2/5 (all these partitions sat on N0+one other node).
- EXCEPTION: sql_transaction_participants-p1 DID get duplicate REPLACEs (25c9ce61→N2 + ccff2762→N4,
  because 25c9ce61's ledger row never persisted) ⇒ 5 replicas and the mutual removal livelock.
- Ledger partition itself ended r2@N0, r3@N0, r4@N1(leader), r6@N3(learner→voter-ready) on disk.
  The planner tried all run to move r3 off N0 ('Executing rebalancing move replace_replica' →
  'Rebalancing move skipped budget_exceeded' 43x) — budget lane kept the ledger quorum pinned to
  the overloaded seed.

## Complete run-22 operation inventory (created / completed)
10 created, 1 completed:
59697071 REPLACE replica_operations-p1→N1 (COMPLETED 30:43.659) · 31a46b4d cpp-p1→N1 ·
5531160f sqltx-p1→N1 · f4c7e8fa sqlwo-p1→N1 · 25c9ce61 stp-p1→N2 · 0117dfd8 ADD ledger→N3 (by N1) ·
ccff2762 stp-p1→N4 (duplicate) · ca191926 REPLACE ledger→N3 (2nd self-move!) ·
d8e89cd4 REPLACE service_definitions-p1→N4 (32:49) · 55aa3055 ADD ratings-p1→N0 (32:55, DDL).

## Competing hypotheses / open residue
- PRIMARY: seed-overload + ledger-quorum-on-seed. Ledger commits require an N0 ack; N0 event-loop
  stalls (1–2.5s) + 1000ms query timeout budget made ledger writes flaky-to-failing. Everything
  else (step-ghosting, duplicate op, second self-move admission, DDL failure) is downstream.
- SECONDARY (design defects exposed, each independently quest-worthy):
  a) N1 coordinator tick lane is SYNCHRONOUS with op-persist: one slow ledger INSERT (0117dfd8)
     froze reconciliation/planning on the ops-owner node for 2m33s (30:46→33:19).
  b) Event-gated dispatch/status-write deferrals ('while control-plane path recovers') have no
     timer fallback; when readiness never converges they hold forever (flushed only at shutdown).
  c) Ledger-interlock admission reads committed ledger rows — blind exactly when the ledger is
     unwritable; admitted the second self-move ca191926 into a busy ledger (run-20 storm shape).
  d) Persist-failed op rows (give-up after attempt 4, retryAfterMs 0) leave in-flight ops invisible
     ⇒ duplicate REPLACE admission (ccff2762) ⇒ CL-043-class mutual removal block.
  e) Readiness fence 'snapshot_coverage_unavailable' on all 5 nodes for the whole run fed the 75s
     PRIORITY_CONTROL_PLANE_RECOVERY_PENDING planner hold (31:58→33:13) — circular
     formation-vs-steady-state dependency (readiness ⟂ control-plane moves in flight).
- Unproven-but-plausible: the 30s cadence of N1 handoffs = per-op single-flight + one shared
  slow write path; not directly instrumented.
