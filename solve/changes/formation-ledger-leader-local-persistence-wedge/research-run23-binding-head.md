# Run-23 binding-head forensics (2026-07-05 08:00–08:05)

Node map:
- node-0 = 72bc1cb5 (started 08:00:07, early coordinator/hot node)
- node-1 = 0eaf1db3 (spread target)
- node-2 = d8695fab (coordinator at stall window)
- node-3 = fe93cde6 (coordinator)
- node-4 = 6a365921

Pinned non-terminal ops (run23-ops.db replica view):
- 303af027 module_manifests-p1 REPLACE STOPPING
- 1e41b13b control_plane_publications-p1 ADD SENDING
- 941c4acd sql_write_operations-p1 REPLACE PENDING
- 6b59b270 + 7aa6f6de sql_transactions-p1 REPLACE both ACTIVE (duplicate)
- bf52cee7 sql_transaction_participants-p1 REPLACE SYNCING
- 4cb4188a + 52303232 mg-* REPLACE CREATING/PENDING

## Findings (write-as-you-go)

### Ledger (replica_operations-p1) topology & health
- Genesis: r1,r2,r3 ALL on 72bc1cb5 (the concentration the hold saw). Spread: r4→fe93cde6 (voter-ready 08:00:57, BECAME LEADER 08:00:57.803 via STEP_DOWN handoff), r5→6a365921 (08:00:59), r6→d8695fab (08:01:30). No ledger leadership change after 08:00:57 (grep across all 5 logs). Hold predicate engaged 08:00:58 and again 08:01:32-33, then released.
- run23-ops.db replica view freezes at 08:02:58 (max updated_at). All 27 ops; last creations 08:02:56-57.
- Node-3 (fe93cde6, ledger leader + cluster leader/rebalancing scheduler) shows NO persist errors, no raft errors 08:02:40-08:04. It keeps serving CDC + planning-gate diagnostics. So ledger raft looks ALIVE.

### Noise eliminated
- 884 WebSocket error / Reconnection failed: ALL on node-0 at 08:05:43+ = cluster shutdown noise. NOT stall-related.
- 214+ clock-drift warns in window: node-3 has 5628 total but 5540 are remoteNodeId=logs-p1-r1, drift up to 106s, bursting 08:01:50-08:02:26 = HLC timestamps from raft log REPLAY while syncing logs-p1 replica (REPLACE aeffc443 completed 08:02:24). Overload indicator for node-3 during that window, but subsides before the stall.
- Event-loop gaps: node-0 (72bc1cb5) had 9.4s/7.8s gaps at 08:00:19-28 (startup); only 1.0-1.4s gaps at 08:03 (node-0, node-4). No severe overload AT the stall.

### Candidate B: duplicate sql_transactions-p1 REPLACEs — TWO DIFFERENT CREATORS
- 6b59b270: "Creating operation" on **6a365921** 08:02:49.649
- 7aa6f6de: "Creating operation" on **fe93cde6** 08:02:49.746 (97ms later)
- fe93cde6 (scheduler) logged "Executing rebalancing move sql_transactions-p1-r2 replace_replica" 08:02:49.697 — ONE move execution, but ops created on two different nodes → cross-node dedupe blindness, NOT the P2 same-coordinator own-create-memory class.
- Both ops dispatched to target d8695fab, both replicas created, both reached status=active (ACTIVE step = remove-source phase) by 08:02:55.98.
- From 08:02:55.869 onward: BOTH loop ~1/s "Deferred retryable replica operation dispatch failure" + "Operation deferred by safety policy reason=replace_remove_safety_blocked" — mutual block: each REPLACE's source-removal is blocked by the other's active op ("Quorum check failed: concurrent partition operation <twin> is active"). Livelock pair.
- BUT the livelock SELF-RESOLVED: loop stops 08:03:25; re-dispatch 08:03:25.9/26.1; 6b59b270 STOPPING 08:03:31 → REMOVED + "Operation completed" 08:03:46; 7aa6f6de STOPPING 08:03:36 → REMOVED + completed 08:03:51. Their still-ACTIVE rows in the ledger are an ARTIFACT of the broken authoritative write path (below), not of the livelock.
- Node-4's creator was rebalancer instance entityId=sql_write_operations-p1 executing moveType=replace movePartitionId=sql_transactions-p1 (08:02:49.603); node-3's scheduler executed the same move 94ms later (08:02:49.697). One logical move, two executor instances → dedupe blindness is CROSS-NODE/CROSS-INSTANCE, not own-create memory.

### THE BINDING MECHANISM (candidate A, new mode): ledger leader local-persistence wedge, silent
Physical facts (from the 4 on-disk replica dbs, copied to run23-ledger/):
- Write path = raft-replicated SQL: `_raft_log` entries are `{"type":"QUERY","sql":"UPDATE replica_operations SET ..."}` / `INSERT OR IGNORE INTO replica_operations ...`.
- r4 (LEADER, node-3/fe93cde6): _raft_log & committedIndex frozen at **149, ts 08:02:58**; table rows frozen (27 rows, max updated_at 08:02:58). ZERO error/warn on node-3 — completely silent. Node-3 logs NOTHING mentioning replica_operations-p1 between 08:02:58.432 and shutdown 08:05:38.
- Followers r2@node-0, r5@node-4, r6@node-2: committedIndex **155**; entries 150-155 all INSERT OR IGNORE (941c4acd re-insert @08:03:11, 25a5abc1 @08:03:16, 502d111a @08:03:26, f900617d/0944c1ce @08:05:08, ef0bd025 @08:05:13-23), all marked committed. NO raft leadership change ever (r4 leader term 2 from 08:00:57 to shutdown; grep all 5 logs).
- Ledger membership after spread: FOUR replicas (leftover r2@72bc1cb5 was never removed; REPLACEs removed r1,r3 only). Quorum=3 ⇒ followers alone (r2+r5+r6) can commit — exactly how inserts committed while the leader persisted nothing.
- NO UPDATE entry entered the raft log ANYWHERE after index 149 (08:02:58). All four replicas agree: twins ACTIVE@08:02:55, bf52cee7 SYNCING@08:02:56, 303af027 STOPPING@08:02:52, 941c4acd PENDING, 1e41b13b SENDING, mg twins CREATING/PENDING. Last applied UPDATEs (146-149 @08:02:58) were the mg-d8695fab-f4db515fc180 REPLACE transitions.
- Meanwhile coordinators locally COMPLETED nearly the whole pinned set ("Operation completed"): 303af027 08:03:05, 4cb4188a 08:03:09, 52303232 08:03:20, 1e41b13b 08:03:23, 6b59b270 08:03:46, 7aa6f6de 08:03:51, f900617d 08:05:29. Every terminal transition logged 40 "Committed replica operation transition not yet authoritatively visible" (error 'Authoritative replica operation not confirmed: <id>') — confirm reads use CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_LOCAL_ONLY (replica-operation-repository-mutation-persistence-methods.js ~line 405, 440-465).

Mechanism: at 08:02:58 the leader's LOCAL SQLite write path for replica_operations-p1-r4.db wedged silently (log append AND apply — same connection — both stop at 149) while its in-memory raft stayed alive and leader (it replicated the later INSERT proposals; quorum met by followers). Transition UPDATEs are sql-routed writes executed against the leader (participant partitionId=replica_operations-p1) — they hang/timeout at the leader's frozen store and are never proposed (0eaf1db3's 941c4acd UPDATE failed 08:03:02 'Distributed operation failed due to participant failures / firstFailedParticipant {partitionId: replica_operations-p1, error: Query timeout after 1ms}' — code DISTRIBUTED_PARTICIPANT_FAILURE, writeMode sql-routed). Creates use a propose-style INSERT OR IGNORE path that commits via follower quorum. Coordinators then run ahead on owner-persisted local state (localProgressCommitted=true; 'owner_persisted_transition_pending_authoritative_confirmation' DEFERRED visibility) but no transition ever becomes authoritative ⇒ the demo driver (reading the authoritative ledger) sees 10 ops in flight forever ⇒ 120s no-completion stall. tx-row upserts into sql_transactions (`tx-<opId>:<STEP>` rows for transition transactions, operation-workflow-transition-orchestration.js) also queued forever, surfacing only at shutdown.
- The run-22 quorum-spread hold is BLIND to this mode by design: its predicate watches replica CONCENTRATION, not leader local-persistence/apply health. This is a DIFFERENT ledger-health mode, not re-concentration (spread stayed spread; no leadership churn; no peer-address noise; no event-loop overload at 08:03 — gaps ≤1.4s).

### Candidate C: voter-surplus / promotion-ceiling deferrals — incidental to THIS stall
- All 114 'would_exceed_target_replica_count' deferrals: sql_transaction_participants-p1 (58) + sql_write_operations-p1 (56), all between 08:01:50 and 08:02:52 (only 2 in 08:02:5x, none after). Genesis: failed 60s voter-ready REPLACE targets (45732090, 802a1a20 FAILED 08:02:48-49) + retry ADD/REPLACE churn → temporary surplus; resolved by REMOVE 9c3ccadb/b51ae5e2 before the stall began. The run-21 duplicate-emergency-ADD class is still unfixed but did NOT bind run-23's stall.

### Candidate D: repair-unconfirmed loop — pure symptom
- operation-workflow-terminal-transition-repair.js: attempt = persistOperationUpdate(terminalTransition) + confirmReplicaOperationPersistence; backoff 0.5s×2^n cap 30s (observed cadence 08:03:26, :32, :39, :48, 08:04:01, 08:04:57 ≈ correct). The persists route through the same broken sql-routed UPDATE path; confirm reads the frozen owner store; rows never got repaired values in ANY replica. Zero 'succeeded'/'abandoned' is the expected outcome of the underlying write-path freeze; repair machinery itself behaved as designed.

### Candidate E: phase-2 admin WS timeout — downstream, new upstream mechanism vs run-22
- CREATE TABLE created ADD ops f900617d/0944c1ce (08:05:08) + ef0bd025 (08:05:13) — INSERTS landed on follower replicas; f900617d even completed locally 08:05:29 but never became authoritative/routable. node-0 08:05:44.700: 'Initial table partition provisioning failed: Timed out waiting for routable partition service for partition tbl-9568db6c-...-p1' → admin response never sent → client 'Timed out waiting for admin response'. Same family as run-22 (provisioning dies on control-plane health) but the run-23 cause is the ledger freeze, not participant failures at dispatch.

### Stall timeline (consolidated)
- 08:00:39 nodes 1-4 join; ledger genesis r1,r2,r3 all on 72bc1cb5; hold engages 08:00:58; spread r4→fe93cde6 (leader), r5→6a365921, r6→d8695fab by 08:01:30; hold releases; formation flows (19 completions by ~08:02:5x).
- 08:01:50-08:02:52: surplus/promotion-deferral churn on sql_write_operations-p1 + sql_transaction_participants-p1 (114 deferrals; 2 REPLACEs FAIL on 60s voter-ready timeout); node-3 does logs-p1 replay (5540 HLC-drift warns, up to 106s).
- 08:02:48-57: burst of new ops (941c4acd, twins, bf52cee7, mg-* 4cb4188a/52303232, 1e41b13b); duplicate twins created by two rebalancer instances 94ms apart.
- **08:02:58: ledger leader r4 local persistence freezes at index 149 (last applied = mg-* transitions). BINDING moment.**
- 08:02:55-08:03:25: twins' mutual replace_remove_safety_blocked livelock (~30s), then self-resolves.
- 08:03:04+: every transition 'not yet authoritatively visible'; repair loops start; coordinators complete ops locally through 08:03:51; ledger authoritative view frozen with 10 in-flight.
- 08:05:0x: driver gives up ('STALLED ... proceeding anyway'), phase 2 CREATE TABLE inserts ops, provisioning can't confirm → 08:05:44 provisioning timeout → admin WS timeout → cluster stopped 08:05:41+ (the 884 node-0 WebSocket errors are shutdown noise).

### Verdicts
- A: **BINDING** — new ledger-health mode: leader local-persistence/apply wedge, silent, invisible to the concentration-hold predicate. Fix this ⇒ run-24 converges (every pinned op demonstrably completed at coordinator level; only authoritativeness was missing).
- B: contributing (30s livelock + double dispatch + ledger noise), self-resolved. NOTE: run-23's duplicate is CROSS-coordinator — the authored P2 'same-coordinator own-create-memory dedupe' quest as framed does NOT cover it; broaden to move-execution idempotency across rebalancer instances (key creation by movePartitionId+moveReplicaId, or single-executor lease per move).
- C: incidental (pre-stall churn; ended before the freeze).
- D: symptom (repair correct; blocked by A).
- E: downstream of A.

### Recommended next quest (head)
Statement: "formation-ledger-leader-local-persistence-wedge: replica_operations-p1's raft leader can silently stop persisting/applying its local store (run-23: r4@fe93cde6 froze at index 149/08:02:58 with zero error logs) while remaining in-memory leader — sql-routed transition UPDATEs then fail cluster-wide and OWNER_LOCAL_ONLY confirms read the frozen store, so no operation ever becomes authoritatively terminal. Done when: (1) a leader whose persisted state lags its in-memory committed frontier beyond a bounded staleness either surfaces the persist failure loudly and steps down (leadership fitness includes local-persistence health), or transition writes/confirms stop depending on the leader's local applied store; (2) DT repro: wedge the leader's local persistence mid-formation → red before fix (transitions freeze, driver stalls) / green after (step-down or rerouted writes let formation complete)."
Root-cause sub-question to answer inside the quest: WHAT wedged node-3's SQLite connection at 08:02:58 (no SQLITE_BUSY/locked/disk errors logged; mg-d8695fab-r3 create at 08:02:57.9 completed fine; swallowed-exception in the persist/apply loop is the prime suspect — find the swallow site and make it loud).
Secondary (author, don't head): cross-instance duplicate move execution (B) — promote the P2 dedupe quest only after broadening its scope to cross-coordinator; and the still-unfixed run-21 duplicate-emergency-ADD surplus genesis (C).
