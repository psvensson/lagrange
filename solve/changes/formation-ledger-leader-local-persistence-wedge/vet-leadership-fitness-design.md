# Adversarial vet: leadership-fitness design (quest formation-ledger-leader-local-persistence-wedge)

Status: IN PROGRESS 2026-07-05. Reviewer: adversarial design subagent.
Inputs read: research-ledger-leader-freeze-mechanism.md, research-leadership-fitness-reuse-map.md, run23-node3-final-minute.md, quest JSON.

## Verified mechanism facts (file:line, checked this session)

- Partition db: better-sqlite3 ^11.7.0 (package.json:194); opened `new Database(this.dbPath)` + `journal_mode = WAL` at src/partition/partition-service-raft-init-base.js:282-284; pragma constants src/partition/partition-service-constants.js:148 (PRAGMA_SYNCHRONOUS value TBC).
- requestTrackedPartitionLeaderHandoff verified at src/node/replica-handler-leader-handoff-methods.js:62-111: getTrackedService → role check (non-leader returns COMPLETED, except REPLACE_TARGET_LEADER_ELECTION follower path) → cancelLeaderOwnedActivation (92-96) → deferCandidacy (102-104) → raft.change(FOLLOWER, leader:'') (105-108) → startElectionTimer (109). Reason param exists but is only USED for the follower REPLACE_TARGET_LEADER_ELECTION branch — the reason is NOT logged anywhere in this method. Design's "new reason in the handoff log" needs an actual log line added (none exists here).

## Findings ledger (running)

### F1 (CRITICAL, design claim WRONG): "zombie's log is SHORTER (149<155) so vote rules disfavor it"
While the process is ALIVE, the zombie leader's getLastInfo reads through its OWN connection, which SEES the uncommitted rows — its in-memory log is 155, EQUAL to followers. Vote rules do NOT disfavor it pre-restart. Only deferCandidacy (4x/10s, bounded) suppresses re-win; after ~10s the zombie node can re-win election (log up-to-date) and resume zombie leadership → step-down/re-win churn (CL-033/034 shape). Design must keep the node non-candidate WHILE the condition persists (re-assert deferCandidacy per detection tick, or re-fire handoff on re-win-while-unfit). TO VERIFY: liferaft vote log-comparison actually exists in @markwylde/liferaft.

### F2 (CRITICAL, boundary ruling input): rollback-while-leader is raft-UNSAFE
The companion sweep's heal (ROLLBACK the zombie ACTIVE tx) discards raft log rows 150-155 + committedIndex updates that the leader already ACKED. If the node stays leader after rollback, getLastInfo re-reads durable 149 → next command mints index 150 AGAIN (same term, different command) → conflicting entries at same index/term → silent divergence (followers dedupe/keep old, leader believes new committed). So heal-in-place WITHOUT step-down is not safe on a raft-log-carrying connection. Step-down is a SAFETY PREREQUISITE of the heal, not just a backstop. TO VERIFY: getLastInfo re-reads db vs caches in memory.

### F3 (NEW standing hazard, record as finding): session tx scope conflates with raft durability scope
Single connection ⇒ while ANY legitimate participant session is open (held across awaits by design), every concurrent sessionless raft append/apply on that partition joins the session tx: durability deferred to the session's COMMIT, and a LEGITIMATE session ROLLBACK discards acked raft entries. Today mechanism #2 (absorption) hides this by hijacking sessionless writes; killing absorption (companion fix) EXPOSES the interleave. Real fix direction = separate connection for raft log/state vs session staging (companion+ scope). Consequence for THIS quest: durable-watermark divergence has a LEGAL window = max legal session hold; thresholds must exceed it.

### F4: witness signal analysis (see A section below)
better-sqlite3 exposes db.inTransaction (getter over sqlite3_get_autocommit) — TBC in v11 lib. JS single-threadedness: db.transaction() helpers complete synchronously within one tick, so a TIMER-observed inTransaction=true can only be an explicit tx held across awaits = participant session path (registered) or a stranded tx (rollbackTransaction catch bug leaves bookkeeping deleted + tx open — transaction-base.js:617-651). Run-23's zombie WAS a REGISTERED ACTIVE session (sql_transaction_participants row + in-memory session; absorption mechanism relied on it) — so "tx open with NO registered owner" MISSES run-23. Honest condition = "connection continuously in-transaction beyond max legal hold" (registry-independent) OR durable-watermark stall.

### Verified constants (grounding for thresholds — no new timeout scales needed)
- WAL + synchronous=NORMAL: partition-service-constants.js:148-149.
- Sweep interval: PREPARED_STATE_HOLD_SWEEP_INTERVAL_MS = TIME_MS.SECOND (1s), partition-service-constants.js:30; timer started in startPreparedStateHoldTimeoutSweep (transaction-base.js:318-336, unref'd setInterval) — an EXISTING per-partition timer to piggyback on.
- Max legal hold: TIMEOUT_BUDGET_DEFAULT.PREPARED_HOLD_TIMEOUT_MS = 60000 and TRANSACTION_BUDGET_MS = 60000 (src/control-plane/timeout-budget.js:20-21); preparedStateHoldTimeoutMs wired at partition-service-core-base.js:165-169.
- ACTIVE session state already records startTime (transaction-base.js:402) and the partition enforces SINGLE active-or-prepared session (transaction-base.js:385-390 throws TRANSACTION_ALREADY_ACTIVE) — begin-hold age is trivially computable.
- RAFT_COMMIT_TIMEOUT_MS = TIME_MS.DEFAULT_RPC_TIMEOUT (partition-replication-handler-constants.js:59) — value TBC (~30s).
- Demo stall cut = 120s (quest statement).

### F5 (CRITICAL, pre-existing, companion-quest blocker): rollback paths destroy acked raft entries TODAY
- rollbackTransaction (transaction-base.js:616-621): `replicateTransactionRollback` PROPOSES A RAFT ENTRY (joins the still-open tx on the same connection, replicated + acked to followers) and THEN `db.exec(ROLLBACK)` discards the leader's durable copy of that very entry (and any other raft rows interleaved during the session). Leader durable log now diverges from followers permanently; next saveCommand re-mints the same index (getLastInfo re-reads db, sqlite-log-adapter.js:169-171, NO cache).
- enforcePreparedStateHoldTimeouts (transaction-base.js:291-298): bare `db.exec(ROLLBACK)` after 60s prepared-hold — same destruction of interleaved raft appends, in SHIPPED code.
- Downstream catastrophe: liferaft append handler (node_modules/@markwylde/liferaft/index.js:312-315) — follower with packet.last.index in its log calls `removeEntriesAfter(packet.last.index)`; sqlite-log-adapter removeEntriesAfter (512-517) has NO committedIndex guard → a re-minting leader makes FOLLOWERS TRUNCATE DURABLY COMMITTED ENTRIES. Committed-data loss cluster-wide.
- Raft ruling: a FOLLOWER losing its durable suffix = crash-equivalent, safe (append catch-up repairs). A LEADER losing suffix while staying leader = protocol violation. Therefore ANY rollback on a raft-carrying connection requires role==FOLLOWER first (or restart of the raft group). This is the physics that fixes the A-boundary.

### C confirmed: leader self-ack counts toward quorum with zero durable copies required of it
- saveCommand seeds responses with the leader's OWN ack at line 284-287 (sqlite-log-adapter.js) before/regardless of persistence (persistEntry only if isOpen, 291-294).
- majority() = ceil(nodes.length/2)+1 (liferaft index.js:443-445; nodes = OTHER nodes) — 4-replica: 3-of-4. Commit fires on quorum(entry.responses.length) ('append ack' handler, index.js:339-344) — leader self-ack + 2 followers suffices; run-23's third follower converged later. So yes: commit can be declared with only 2 durable copies while the leader's is phantom. Pre-existing hole; step-down SHRINKS the window (does not create or widen it). Restart safety: after restart at 149, the node's vote request carries index 149 < followers' 155 (same term) → liferaft vote check (index.js:228-239) denies; it cannot become leader until caught up. Record as its own finding, does NOT block this design.

### F1 details (vote check verified)
liferaft vote handler index.js:228-239: denies only if voter's log MORE up-to-date. Zombie leader alive: its getLastInfo reads the open tx → index 155 == followers → votes GRANTED. deferCandidacy inflation (4x, 10s window, liferaft.js:73-74/437-445) is the ONLY suppressor and it EXPIRES. Sustained-unfit ⇒ must re-assert deferCandidacy each detection tick (1s sweep < 10s window — safe) and re-fire handoff if leadership re-won while unfit.

### F6: handoff seam has NO log line and reason is unused for the leader branch
requestTrackedPartitionLeaderHandoff (replica-handler-leader-handoff-methods.js:62-111) never logs; reason only routes the follower REPLACE_TARGET_LEADER_ELECTION branch. The caller (replica-handler-remove-request-methods.js:279+) logs around it. Design's "new reason in the handoff log" requires ADDING the ERROR/WARN log at the detection site (fine) — do not claim reuse of a nonexistent handoff log.

### F7: rollbackTransaction catch bug confirmed (transaction-base.js:638-651)
Catch deletes activeTransactions/preparedTransactions bookkeeping but never execs ROLLBACK → tx stays open with NO registered session. THIS stranding path (unlike run-23's) is only catchable by db.inTransaction-vs-registry mismatch.

### More verified facts
- deferCandidacy RE-ARMABLE: `_candidacyReluctantUntilMs = _nowMs() + windowMs` per call (src/raft/liferaft.js:472-475, window 10s, multiplier 4x at 61-74/437-447); uses DT virtual clock via _catchupTimeSource. Re-asserting each 1s sweep tick keeps the node reluctant indefinitely while unfit.
- commitEntries → log.commit(entry.index) per entry (node_modules/@markwylde/liferaft/index.js:943-948) — a `lastDeclaredCommitIndex` stamp at the TOP of sqlite-log-adapter commit(index) (BEFORE the isOpen guard, line 377-380) is an honest local event record (not a cache of another owner's truth).
- setCommittedIndex no-ops when closed INCLUDING the in-memory cache (sqlite-log-adapter.js:555-558) — so "in-memory cache vs durable" comparison is BLIND to the closed-db family; the declared-commit stamp must be taken at commit-DECLARATION time (commitEntries/commit() entry), not from the cache.
- Second-connection precedent EXISTS in production: openSplitSnapshotDatabase (src/partition/partition-service-split-accessor-base.js:271-284) opens `new Database(dbPath, {readonly:true, fileMustExist:true})` against the live partition file; :memory: dbs get a shim proxying this.db (which LIES under the zombie → witness must degrade to inTransaction-only for MEMORY_DB_PATH).
- WAL readonly reader sees only committed frames (uncommitted BEGIN IMMEDIATE pages invisible); readers never block on the writer. Honest under the exact run-23 physics.
- db.inTransaction: better-sqlite3 v11 wrappers.js:42-44 (getter over cppdb.inTransaction / sqlite3_get_autocommit). JS single-threadedness ⇒ db.transaction() helpers are timer-invisible; ONLY sessions held across awaits (participant path) or stranded txs are timer-observable.
- DEFAULT_RPC_TIMEOUT = 30000ms (src/test-helpers/test-timeout-constants.js:56 citing src/constants/time.js) = RAFT_COMMIT_TIMEOUT_MS.
- CLI wiring is BIGGER than 'half-built column': NO producer exists for ANY raft_* CLI fields (raft_term/raft_commit_index/raft_last_log_index/raft_applied_index — grep src/+scripts/ = views only); services-view gates the whole section on `service.raft_term !== undefined` (services-view.js:645) so it NEVER renders. Wiring one field = building the whole status-producer chain. Demote to follow-up.
- Test precedent: test/transaction/single-partition-acid.property.test.js + transaction-durability-raft.property.test.js construct real PartitionService (dbPath ':memory:') and call partition.beginTransaction() DIRECTLY — the participant seam is directly drivable; a file-backed dbPath makes the durability distinction testable. enforcePreparedStateHoldTimeouts(nowMs) already takes a clock override (transaction-base.js:272) — the detector should copy that pattern so DT tests drive it without timer patching. dt6-candidacy-reluctance-drain-stepdown.test.js is the precedent for handoff-side assertions.

## SURFACE VERDICTS

### A. Witness honesty — VERDICT: design's instinct right, but signal ranking amended
- (naive same-connection SELECT) RULED OUT, confirmed: connection sees uncommitted data; getCommittedIndex additionally returns an in-memory cache (sqlite-log-adapter.js:531-533) so it never even hits sqlite.
- Signal (c) db.inTransaction: HONEST and DIRECT for run-23 + the rollbackTransaction-catch stranding (F7). BUT 'tx open with no registered owner' MISSES run-23 (the zombie WAS a registered ACTIVE session, never swept — F4). Honest form: `db.inTransaction === true continuously beyond the max legal hold` (registry-independent). Cost: property read per 1s tick ≈ zero.
- Signal (a) readonly second connection: HONEST (WAL semantics + production precedent) and is the ONLY signal that catches the closed-db/isOpen-no-op family (mechanism #3) — pair it with a lastDeclaredCommitIndex stamp at commit-declaration time. Cost: one SELECT on _raft_state per tick, only needed when leader.
- Signal (b) totalChanges/wal-frame counters: REJECTED — noisy, needs expected-value bookkeeping (a parallel ledger = the cache trap).
- 'Is divergence unnecessary given inTransaction?' NO — inTransaction alone is blind to closed-db and any future non-tx durability lie; divergence alone would also catch run-23 (durable 149 vs declared 155) but is blind for :memory: partitions. KEEP BOTH; same threshold, one condition: UNFIT ⇔ (inTransaction beyond bound) OR (declared − durable > 0 beyond bound).

### A-BOUNDARY RULING (this quest vs companion)
The rollback physics (F2/F5) DECIDES it: rollback on a raft-carrying connection while LEADER destroys acked log suffix → same-index re-mint (getLastInfo re-reads db) → followers truncate COMMITTED entries via unguarded removeEntriesAfter (liferaft index.js:312-315 + adapter 512-517). A follower rolling back = crash-equivalent, safe (append catch-up repairs).
⇒ Step-down is not merely a backstop; it is the SAFETY PREREQUISITE of the companion's heal. Partition of work:
- THIS QUEST: the fitness detector (both signals, on the existing 1s sweep), sustained-condition decision, loud ERROR surfacing, requestTrackedPartitionLeaderHandoff with new reason, sustained deferCandidacy while unfit, loud-mode for sqlite-log-adapter isOpen() no-ops on a leader. NO rollback, NO tx-lifecycle change.
- COMPANION QUEST: ACTIVE-tx sweep + rollback GATED ON role==FOLLOWER (its rollback becomes safe only because this quest demotes first), fix rollbackTransaction ordering (raft-propose-then-rollback destroys the marker entry it just replicated — transaction-base.js:617-621) and its catch (638-651 skips ROLLBACK), fix the shipped prepared-sweep bare ROLLBACK (291-298, same leader hazard TODAY), absorption kill, coordinator empty-set commit, budget anchor.
- 'Sweep heals so no step-down needed' is REFUTED: (1) heal-in-place while leader is raft-unsafe (above); (2) post-step-down the zombie follower STILL phantom-acks (C) — only the companion's follower-rollback + catch-up closes that; (3) step-down alone covers unhealable stalls (disk death, closed db). The two quests compose: demote (here) → heal as follower (companion).

### B. False positives — VERDICT: controllable with existing constants; concrete numbers
- Legal ACTIVE/prepared holds are already bounded 60s by design: TRANSACTION_BUDGET_MS = PREPARED_HOLD_TIMEOUT_MS = 60000 (timeout-budget.js:20-21). Schema migration (MIGRATION_ALTER_TABLE) and bulk INSERT lanes are sessionless/synchronous applies — timer-invisible, no open-tx hold. Checkpoint pauses/slow disk: divergence clears on catch-up; 60s sustained slow-apply on the demo host would already be a real problem worth shedding leadership over.
- NUMBERS (all grounded, no new scales): bound = PREPARED_HOLD_TIMEOUT_MS (60s, reused); cadence = PREPARED_STATE_HOLD_SWEEP_INTERVAL_MS (1s, existing timer); strikes = 3 consecutive ticks past bound (soft-warning two-strikes directive, +1 margin) ⇒ detection at ~63s; handoff immediate; peer election ~O(election timeout, sub-5s). End-to-end ≈ 65-70s from wedge onset — beats the 120s demo cut with ~50s margin (run-23 wedge 08:02:59 ⇒ recovery ~08:04:05).
- Gates: (1) successor viability (CL-039): membership > 1 AND recent follower ack — stamp lastFollowerAckAt in commandAck (sqlite-log-adapter.js:307-342, app-owned) = honest actuals; in run-23 followers were actively committing 150-155 ⇒ trivially viable. (2) single-replica partitions: surface loudly, NO step-down. (3) :memory: dbs: inTransaction signal only. (4) False-fire cost is ONE non-destructive handoff (this quest never rolls back) — acceptable.

### C. Step-down safety under the zombie — VERDICT: does not block; pre-existing hole, record separately
- CONFIRMED: saveCommand self-acks the leader at creation (sqlite-log-adapter.js:284-287) regardless of persistence; majority()=ceil(others/2)+1 (liferaft index.js:443-445); 4-membership commit = self + 2 followers ⇒ commit CAN rest on 2 durable copies + 1 phantom. Pre-existing; the zombie state creates it, step-down only SHRINKS the new-ack window (post-restart the node cannot win election: vote check index.js:228-239 vs its durable 149 — and while alive its phantom 155 makes it electable, see F1).
- Residual: as a demoted FOLLOWER the zombie keeps phantom-acking — closed by companion follower-rollback+catch-up. RECORD as own finding (ack-durability accounting / leader phantom quorum member), not a blocker.

### D. DT reproducibility — VERDICT: composable, two-layer repro
- Layer 1 (invariant layer, red on HEAD): real PartitionService, tmp FILE dbPath (not :memory:), real better-sqlite3. Drive `service.beginTransaction('tx-zombie')` (the exact participant seam beginParticipant executes — transaction-base.js:354/398) and abandon it (run-23 shape). Then sessionless executeQuery writes → absorbed/in-tx (success in-memory). RED asserts: write reports success; readonly second connection shows _raft_log/_raft_state frozen; db.inTransaction true; ZERO warn/error; no handoff. GREEN asserts: detector method (nowMs-override pattern like enforcePreparedStateHoldTimeouts) driven past 60s+3 ticks ⇒ ERROR log + handoff seam invoked with new reason + deferCandidacy asserted. dt:prove red-on-revert on the detector files.
- Layer 2 (leadership consequence): follow test/convergence/dt6-candidacy-reluctance-drain-stepdown.test.js precedent (handoff → FOLLOWER → reluctant timeout draws). Scenario-harness script wraps both for doneWhen (consecutive:3).
- No timer patching needed anywhere (clock-override method + direct sweep invocation).

### E. Blast radius — VERDICT: same as shipped drain step-down, plus three cautions
- requestTrackedPartitionLeaderHandoff callers: exactly ONE (replica-handler-remove-request-methods.js:279) — new reason constant is additive; the reason is not consumed on the leader branch so no behavioral coupling.
- Leadership-change listeners (all already exercised by the drain path): cancelLeaderOwnedActivation (in-seam), durable raft_role write (routes via services partition — DIFFERENT connection/leader, not blocked by the zombie), rebalancer planning gate isLeader, CDC generation isLeader (new leader takes over — identical to drain semantics), OWNER_LOCAL_ONLY reads re-route to new leader (this is the fix's point: confirms stop reading the frozen store).
- Caution 1: in-flight proposalQueue entries on the demoted leader reject via existing RAFT_COMMIT_TIMEOUT (30s) — existing step-down behavior.
- Caution 2 (F1): re-win risk — the alive zombie's log LOOKS up-to-date (155). MUST re-assert deferCandidacy every tick while unfit and re-fire handoff if leadership re-won while unfit; otherwise step-down/re-win churn (CL-033/034 shape).
- Caution 3: detection→handoff plumbing — detector lives in PartitionService, handoff on ReplicaHandler (tracked-services registry). Wire via a PARTITION_SERVICE_EVENT the node's handler subscribes to, or pass a handoff callback at construction; do NOT duplicate the seam's body inside the partition service.
- CLI column consumers: none (fields never produced; section dead) — wiring is net-new plumbing, not a consumer risk; demoted to follow-up.

## FINAL: AMEND (direction GO; six mandatory amendments)
1. Drop the 'shorter log disfavors re-election' claim (FALSE while alive — F1); replace with sustained deferCandidacy re-assertion + re-fire-on-re-win.
2. Adopt the boundary ruling above: step-down here is the safety PREREQUISITE; companion rollback must be role==FOLLOWER-gated; record the F5 pre-existing rollback hazards into the companion quest's scope now.
3. Witness = BOTH signals (inTransaction sustained; declared-commit-stamp vs readonly-connection durable watermark), one 60s bound, on the existing 1s sweep; :memory:/single-replica degradations.
4. Numbers: 60s (PREPARED_HOLD_TIMEOUT_MS reuse) + 3 consecutive 1s ticks; viability gate via lastFollowerAckAt actuals; no new timeout scales.
5. Demote CLI raft_applied_index wiring to optional follow-up (no producer chain exists for ANY raft_* field); primary surfacing = ERROR log at detection + reason on handoff + loud isOpen-no-op-on-leader logs; add the log line AT the detection site (the handoff seam itself has no logger).
6. Record two new findings: (i) leader phantom-ack quorum accounting (C); (ii) session-tx scope conflates with raft-log durability scope — legitimate rollbacks already destroy acked raft entries (F5) — feed the companion quest / a dedicated connection-split direction.

