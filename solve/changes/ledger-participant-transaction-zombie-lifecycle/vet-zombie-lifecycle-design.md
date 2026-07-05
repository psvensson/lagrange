# Adversarial vet: zombie-lifecycle fix design (quest ledger-participant-transaction-zombie-lifecycle)

Status: IN PROGRESS 2026-07-05. Inputs: quest JSON, research-ledger-leader-freeze-mechanism.md,
vet-leadership-fitness-design.md (binding physics), verify-durability-fitness-implementation.md,
commit 9234e904 (landed durability-fitness), live source.

## Line-number currency (post-9234e904 shifts)

- partition-service-transaction-base.js: enforcePreparedStateHoldTimeouts :272-313 (CURRENT);
  bare `db.exec(ROLLBACK)` prepared-path :291-298 (CURRENT); sweep timer :332-341 now ALSO calls
  `this.enforceLeaderDurabilityFitness?.(nowMs)` at :339; BEGIN_IMMEDIATE now :404 (was 398);
  single-active-session invariant :391-395; state.startTime stamped :408; rollbackTransaction
  try :622-627 (replicateTransactionRollback THEN db.exec ROLLBACK), catch now :644-656 (was
  638-651) — deletes bookkeeping :653-655, NO ROLLBACK exec. Leadership check idiom
  `this.raft && this.raft.state === LifeRaft.LEADER` at :690, :724, :756.
- partition-service-transaction-session-methods.js: resolveActiveTransactionSessionId :26-37
  (CURRENT). NOTE: the foreign-adoption fallback is ONLY :33-35 (`size === 1` → adopt any named
  session); :30-32 is the DEFAULT-session path (designed sessionless convenience). SAME pattern
  exists in resolvePreparedTransactionSessionId :96-98 and syncLegacyTransactionAliases :46-49
  (legacy alias `this.activeTransaction` fallback) — absorption has THREE doors, not one.

## Running findings

### Z1 (CRITICAL, gap in part 1): follower rollback is NOT crash-equivalent for JS memory — VERIFIED
DB rollback discards durable rows 150..155 but JS-side derived state survives (a real crash
clears both). Three concrete, code-verified poisons:
1. Apply dedup: applyCommittedEntry SKIPS re-execution when the entry key is in
   recentlyAppliedEntryKeys (partition-service-entry-apply-base.js:607-623 — resolves the write
   and emits ENTRY_COMMITTED WITHOUT running the SQL). The set survives rollback (Set on
   core-base :149; bounded eviction cdc-stream-base :380-388; cleared only in lifecycle shutdown
   :158). Post-heal catch-up re-commits 150..155 → dedup-skip → table rows durably MISSING
   forever on this replica — the heal silently loses exactly the entries it exists to save.
2. Adapter committedIndex cache + monotonic clamp: getCommittedIndex serves
   _committedIndexCache (sqlite-log-adapter.js:561-568); setCommittedIndex CLAMPS index <=
   current (:594-597, CL-018) — after rollback durable=149 but cache=155, so catch-up commits
   150..155 are ALL clamped and the durable watermark stays 149 until the log passes 155
   (indefinitely on an idle partition; meanwhile fitness signal (b) declared-155-vs-durable-149
   keeps the node unfit/deferring — livelock-ish residue on idle partitions).
3. rowCommitEpoch / committedWriteLog retain epochs from rolled-back writes (conflict-check
   staleness; self-correcting, minor).
⇒ The heal MUST, immediately after db.exec(ROLLBACK): clear recentlyAppliedEntryKeys, reset
_committedIndexCache (null → re-read from db), and the DT repro must assert POST-HEAL DURABLE
CONVERGENCE (rows re-applied durably via catch-up), not just inTransaction=false.

### Z2 (CRITICAL, part 1 role-gate too weak): gate must be state === FOLLOWER, not !== LEADER
CANDIDATE rollback is unsafe: a follower with the zombie tx acked entries 150-155 (phantom — its
durable copies live inside the open tx); if it campaigns, its requestVote packets claim
last.index=155 (in-memory view). Sequence: votes granted on the 155 claim → sweep tick rolls back
(state was CANDIDATE, passes a !==LEADER gate) → election completes → new leader getLastInfo=149
→ heartbeat/append with last.index=149 → followers holding 149 removeEntriesAfter(149) → cluster
truncates COMMITTED 150-155 (liferaft index.js:312-315 + adapter removeEntriesAfter, no
committedIndex guard). JS single-threadedness makes check→exec atomic WITHIN a tick, so a strict
FOLLOWER-only gate is sound (a follower never advertises its log; post-rollback candidacy claims
are honest). Demoted-then-re-elected case is safe: committed entries survive durably on the other
followers; a demoted node's rollback never re-mints while leader.

### Z3 (part 1a ruling): prepared-path bare ROLLBACK :291-298 IS in scope
The quest statement seals "healing it never destroys committed raft entries" — the prepared
branch of the SAME sweep function being extended is a heal path and bare-ROLLBACKs on leaders
TODAY (vet F5). Leaving it ungated while gating the ACTIVE branch is incoherent and trips
constraint c-order's stop-and-verify ("any interim leader-rollback path found during
implementation"). Same FOLLOWER-only gate; leader skips + loud log; fitness signal (a)
(db.inTransaction, registry-independent) covers a held PREPARED tx too (prepare does not COMMIT
the sqlite tx), so the leader path demotes → next tick heals. Cost ~5 lines.

### Z4 (part 5 blast radius): unconditional catch-ROLLBACK WIDENS leader destruction — role-gate it,
and on skip/failure KEEP the session registered
Adding db.exec(ROLLBACK) to the catch :644-656 unconditionally creates a NEW leader bare-rollback
path (quest: narrow, never widen). Also: today's catch deletes bookkeeping → activeTransactions
empty → the NEW ACTIVE sweep (iterates the map) is BLIND to the stranded tx; fitness is
leader-only, so a stranded tx on a FOLLOWER would never heal (permanent wedge, F7 shape).
Fix shape: catch = if FOLLOWER attempt ROLLBACK (then delete bookkeeping); if LEADER (or exec
fails) do NOT delete bookkeeping — leave the session registered so the role-gated sweep owns it
(demote-then-heal loop closes it). Registered-retention also keeps rollbackTransaction retryable
(idempotent path). Main-path propose-then-exec ordering on a leader (:622-627 destroys its own
just-replicated marker) = pre-existing F3/F5 legitimate-rollback destruction — record, do not
widen; full fix is the connection-split direction (out of scope).

### Z5 (part 1c): absorbed-write evaporation verdict — bounded-loud post-fix, NOT silent
(to verify below: terminal-repair re-drive actually re-persists after heal)
- New absorption cannot occur once part 4 lands (fallback removed).
- The 2PC session's OWN staged ops evaporate on sweep rollback: coordinator either (post part
  2/3) fails the commit → typed error to caller (loud), or has already timed out
  (TRANSACTION_BUDGET_MS = the same 60s) → abort path. A late COMMIT/PREPARE after sweep hits
  NO_ACTIVE_TRANSACTION / prepare-lost → loud failure, not silent loss.
- Ledger transitions specifically: level-triggered re-drive + terminal repair loop (run-23
  node-1 was already looping "Committed terminal transition not authoritatively visible") retries
  until authoritatively visible → re-persists after heal.
- Non-ledger user partitions: client sees an error instead of silent loss — acceptable and
  honest; silent loss required the empty-set commit + absorption combination, both closed.
- CAVEAT (doneWhen risk, not design defect): priority-op transitions can remain doomed by the
  out-of-scope 1ms budget loop (budget anchored at operation.createdAt) — heal restores the
  partition but the SAME op's retries may still 1ms-fail. Live-demo doneWhen may need the P2
  budget quest if a demo op trips it. Record as risk.

### Z6 (part 2): the guard as stated is unimplementable without part 3; minimal form is local
Run-23's commit fell into the participantKeys-empty fallback (durable-workflow-coordinator
~:402-405 → workflow.participants.keys() = ∅ → loop body never ran) — the :409-413 silent
`continue` never even fired. So a "skip → fail" change alone would NOT have stopped run-23.
And "previously enlisted" cannot be derived from the durable participant row at commit time
without hitting the SAME CDC lag that caused the clobber (or an expensive authoritative read).
⇒ Part 3 is the load-bearing fix (the live in-memory Map IS the enlistment record once it can't
be clobbered). Part 2 minimal sufficient form, all in-memory: (a) executeParticipantStage: a key
requested (participantKeys) but missing from the Map = invariant violation → abort, never skip;
(b) refuse COMMIT when the workflow's monotonic enlistment count > 0 but participants Map is
empty (count lives on the live record; part 3 preserves it). No durable read needed. Zero-
participant commits stay legal (the "~20 tx, 2PC-as-theater" norm — blanket refusal would break
current traffic).

(verify below: exact executeParticipantStage code, participantKeys producer, createWorkflowRecord)

### Z7 (part 3): skip-live (adopt-only-when-absent), not merge
Recovery's legitimate job = coordinator RESTART (in-memory state lost). "Live" = txId present in
the in-memory workflow map and non-terminal. The owner process's memory is by construction ≥ the
cache view (the cache rows were written BY this state); union-merge can resurrect participants a
live tx legitimately dropped and adds a second writer to live state. Skip-live preserves restart
recovery exactly (post-restart nothing is live). Open check: does the periodic recovery sweep
(recovery.js ~:209) double as the driver that RESOLVES stuck live txs — if yes, skipping live
records must not starve that driver (resolution should key off durable status, not clobber).

(verify below with recovery.js code)

## Verified loop trace (part 1b) — NO deadlock; role plumbing verified

- Fitness tick runs REGARDLESS of role (enforceLeaderDurabilityFitness, durability-fitness.js
  :181-217, called from the sweep timer transaction-base.js:339). While the condition persists
  post-demotion, resolveLeaderDurabilityUnfitConsequence still runs and RE-ASSERTS deferCandidacy
  every 1s tick (:311) — 10s window >> 1s gap to the heal tick. Fitness does NOT need the tx gone
  to demote (demotion at :312-317 is unconditional on heal); recovery path (:184-200) clears
  unfit+logs LEADER_DURABILITY_RECOVERED on the first tick after rollback. Loop:
  detect(~63s) → demote → next sweep tick sees role=FOLLOWER → rollback → signal clears →
  recovered. END-TO-END SOUND, with the Z1 cache caveat and one hole:
- HOLE (small): deferCandidacy re-assertion sits AFTER the successorViable early-return
  (:303-307). A demoted-but-still-wedged follower whose follower-ack actuals go stale (>10s,
  hasViableLeaderDurabilitySuccessor :89-103) stops re-asserting deferral. Only matters if the
  heal tick FAILS repeatedly (e.g. ROLLBACK throws) — then the zombie is fully electable at its
  phantom in-memory log. Cheap hardening: re-assert deferCandidacy while unfit BEFORE the
  successor gate (deferral is non-destructive). Flag to implementation.
- Elected mid-window: deferCandidacy prevents CANDIDACY, not voting; a node cannot be elected
  without campaigning, and requestElectionNow-driven promotions (REPLACE target election) that
  bypass reluctance would put it back to LEADER where the sweep SKIPS and fitness re-demotes
  (strikes already sustained; handoffRequestedWhileLeader reset on the not-leader tick :280-282)
  → bounded churn, no rollback-while-leader possible. OK.
- this.role plumbing: updated synchronously via raft state events
  (wireReplicaLifecycleEvents, replica-leadership-state.js:118-143 — LEADER/FOLLOWER/CANDIDATE
  all set this.role; single-replica FOLLOWER/CANDIDATE events ignored via
  shouldIgnoreDemotionEvent so a single-replica wedged leader keeps role=LEADER). RAFT_ROLE has
  FOUR values incl. LEARNER (raft/constants.js:29-34).

## Verified: single-replica ruling (part 1 + DT) — REVISED after test-pin discovery

The precise safety condition for a bare ROLLBACK on a raft-carrying connection is:
"no OTHER replica may hold entries this rollback destroys" (re-mint→truncation needs a follower
holding the old suffix; liferaft index.js:312-315 + adapter removeEntriesAfter). Therefore:
- FOLLOWER / LEARNER: safe (crash-equivalent; never advertises its log; catch-up repairs).
- Multi-replica LEADER: unsafe (F2/F5 re-mint) → skip + rely on landed fitness demotion.
- Multi-replica CANDIDATE: unsafe (Z2 — vote claims already sent at the phantom index) → skip.
- SOLO group (no other members): leader rollback is raft-SAFE (no follower can truncate; loss is
  crash-equivalent given zero redundancy) and it is the ONLY heal available there — fitness
  cannot demote a solo leader (shouldIgnoreDemotionEvent, raft-init-base ~:400-403) and is
  surface-only (successorViable false).
- BINDING TEST PIN: test/partition/partition-transaction.property.test.js:521,550-570 drives
  enforcePreparedStateHoldTimeouts on a SOLO fixture (replicaIds:['tx-partition-r1']) and asserts
  releasedCount=1, PREPARE_LOST on late commit, AND the row physically rolled back. A strict
  FOLLOWER-only gate with no solo carve-out breaks this shipped test and leaves solo groups
  permanently wedged.
⇒ GATE RULING: rollback allowed iff role ∈ {FOLLOWER, LEARNER} OR the group is solo (use the
same predicate family as shouldIgnoreDemotionEvent for coherence). Multi-replica LEADER and
CANDIDATE skip + loud log. JS single-threadedness makes the check→exec atomic per tick.

## Verified: part 2/3 coordinator physics

- transactionsBySession IS workflowsByOwnerKey (distributed-transaction-coordinator.js:168) —
  the clobber (setWorkflowState, durable-workflow-coordinator.js:601-605) swaps the object in the
  very registry the protocol reads; getCommitParticipantKeys/getPrepare/getRollback all walk
  tx.participants (distributed-transaction-protocol.js:37-78). After a clobber the commit stage
  iterates ZERO keys (protocol.js:263-270 → executeParticipantStage with empty keys) → zero
  failures → COMMITTED (:290-297). Run-23 path confirmed end-to-end at code level.
- A protocol invocation holding `tx` across an await while recover() swaps the record ALSO
  splits brains (setTransactionStatus mutates the orphaned old object and persists it while the
  registry holds the clobbered new one). Skip-live kills this whole class.
- enlistParticipants (distributed-transaction-coordinator.js:242-281): begins the participant
  BEFORE recording it (:258 await beginParticipant → :260 upsertParticipant) — the enlist/rollback
  asymmetry stands; the ACTIVE-hold sweep (part 1) is what bounds a delivered-but-unrecorded
  participant BEGIN. No change needed here for THIS quest (record).
- Part 3 implementation surface: the skip must live in durable-workflow-coordinator recover()
  (:459-471 — skip setWorkflowState when a LIVE non-terminal in-memory workflow exists) AND the
  participant-row loop (:473-490 — else stale cache rows OVERWRITE live participant statuses via
  workflow.participants.set) AND recoverFromSystemTables' two follow-up loops
  (distributed-transaction-recovery.js:498-508 recoveredTransactionIds enrollment — else
  resumeRecoveredTransactions ROLLS BACK live ACTIVE txs, :72-167; and :510-533 writeOperations
  push — else cache rows DUPLICATE ops onto the live array). Four seams, one liveness predicate.
- Restart recovery is untouched by skip-live: post-restart memory is empty, nothing is live.
- The recovery sweep's stuck-tx driver (recovery.js:213-241) reads live in-memory records and is
  NOT starved by skip-live.

## Verified: part 4 (absorption)

- Doors: resolveActiveTransactionSessionId :33-35 (write absorption via executeQuery fork,
  write-metrics-base.js:77-90; also lifecycle adoption for commit/rollback/prepare with null
  sessionId) + resolvePreparedTransactionSessionId :96-98 + syncLegacyTransactionAliases :46-49.
- The DEFAULT-session branch (:30-32) is the designed sessionless single-session convenience —
  pinned by test/transaction/single-partition-acid.property.test.js:72-95 (beginTransaction() →
  sessionless writes → commitTransaction()) and transaction-durability-raft.property.test.js.
  KEEP it. Only the size===1 FOREIGN-adoption arm is the black hole.
- Post-removal semantics for a sessionless write while a foreign named tx is open: it routes to
  proposeWrite — EXACTLY the semantics already pinned for foreign-SESSION-ID writes by
  test/partition/partition-service-transactions-query-routing.test.js:1127-1170 ("keeps
  non-transactional writes out of unrelated active transactions"). No rejection needed; no
  availability regression (reject-with-typed-error would make every legit 2PC session a ≤60s
  write outage on the busy ledger — worse systemically).
- Physics note: the routed write still PHYSICALLY joins the open sqlite tx (single connection),
  so it is locally non-durable until heal — but it is raft-proposed and durable on followers
  (run-23's INSERT lane behavior), and the role-gated sweep + Z1 cache-clear make the local copy
  repairable. Marginal widening of the F3/F5 legit-leader-rollback exposure (more interleaved
  raft rows) — pre-existing class, record, connection-split is the real fix (out of scope).
- Known dependent to fix up: dt6-ledger-leader-durability-fitness.test.js:157,240,358 cleanup
  uses sessionless rollbackTransaction() after beginTransaction('tx-zombie') — relies on the
  foreign-adoption arm. With removal it becomes a no-op idempotent success (still green since
  errors are caught and shutdown closes the db), but the cleanup should pass the session id
  explicitly. LIFECYCLE adoption (commit/rollback) via the same arm is ALSO dangerous in prod (a
  stray sessionless COMMIT would commit a foreign 2PC participant's staged writes out-of-band) —
  remove the arm wholesale from resolveActiveTransactionSessionId AND
  resolvePreparedTransactionSessionId; keep syncLegacyTransactionAliases untouched
  (this.activeTransaction/transactionOperations have no PartitionService consumers — grep clean;
  flag as remove-dead-code-on-contact candidate, verify before deleting).

## Verified: part 1c (absorbed-write evaporation)

- Terminal transitions: operation-workflow-terminal-transition-repair.js re-persists the retained
  terminal projection with capped backoff (0.5s→30s, :23-30) "until the authoritative row
  reflects it, abandoning only when a DIFFERENT durable terminal state won" — post-heal the
  re-persist lands durably and confirmation closes. Non-terminal transitions: level-triggered
  re-drive lanes (run-21 quest machinery). Run-23's absorbed class (transition UPDATEs) is
  covered end-to-end.
- Non-ledger user partitions: with parts 2/3 landed the coordinator can no longer report
  COMMITTED over a vanished participant — callers get a typed failure (loud), and a late
  PREPARE/COMMIT after the sweep gets prepare-lost/NO_ACTIVE_TRANSACTION. Not silent. VERDICT:
  bounded-loud, no silent-loss channel remains through the swept-participant path.
- Residual risk to the DEMO doneWhen (not to correctness): priority-op transitions can still be
  doomed by the out-of-scope 1ms budget anchor (resolveOperationMutationQueryTimeoutMs returns 1
  on exhausted budget; anchored at operation.createdAt) — the heal restores the partition, not a
  doomed op's budget. If the live-demo gate trips on this, it is the P2 quest, not this one.

## Sweep-implementation gaps to bake in (found while attacking)

- G1: swept ACTIVE sessions should be added to preparedStateLostSessions so a late COMMIT /
  ROLLBACK gets the typed prepare-lost response (commit/rollback check it :507/:596). AND
  prepareTransaction does NOT check preparedStateLostSessions today (:436-496) — a prepare
  arriving after the sweep would find no session and return NO_ACTIVE_TRANSACTION_PREPARE
  (:443-450, already loud/safe) — acceptable, but adding the lost-session check there makes the
  response typed. Optional but cheap.
- G2: in-flight prepareTransaction race: prepare removes from activeTransactions only AFTER the
  replicate await (:472-476). A sweep tick firing mid-await rolls back under the prepare; the
  prepare then registers a preparedTransactions entry whose sqlite tx is GONE. Later COMMIT
  db.exec(COMMIT) throws (no open tx) → loud failure → coordinator abort. Bounded/loud, but the
  implementation should prefer marking the session lost so the prepare completion can detect it
  (check preparedStateLostSessions after the await) rather than leaving a phantom prepared entry.
- G3: the ACTIVE sweep and prepared sweep share ONE physical sqlite tx (single-active-session
  invariant, :391-395): one db.exec(ROLLBACK) heals both; implement as one role-gated rollback
  covering both expiry lists, not two.
- G4: fitness hardening (1-line): re-assert deferCandidacy while unfit BEFORE the
  successorViable early-return (durability-fitness.js:303-311) so a wedged demoted follower
  with stale ack actuals stays reluctant if the heal tick keeps failing.

## DT / test-shape ruling

- Follower-sweep repro (honest, no stubbing): PartitionService with replicaIds length 2 and no
  peer running — never elected, this.role stays FOLLOWER (core-base:121) genuinely. Drive
  beginTransaction('tx-zombie') at the exact participant seam, sessionless write, then
  enforcePreparedStateHoldTimeouts(nowMs) past 60s → assert rollback ran (db.inTransaction
  false), registries cleared, session in preparedStateLostSessions, loud WARN, AND Z1 assertions:
  recentlyAppliedEntryKeys cleared, adapter _committedIndexCache invalidated (getCommittedIndex
  re-reads durable), and a re-delivered committed command actually re-executes its SQL
  (applyCommittedEntry does NOT dedup-skip) — the post-heal durable-convergence invariant at
  unit level, no cluster needed.
- Leader-skip repro: the multi-replica-config fixture forced leader via
  raft.change({state: LifeRaft.LEADER}) (the same call production uses,
  raft-init-base:519) → sweep past bound → assert NO rollback, db.inTransaction still true, loud
  skip log. This is the honest role-gate proof the prompt asked for: the solo fixture CANNOT
  prove it (solo now legitimately rolls back under the carve-out — assert THAT on the solo
  fixture instead, which also keeps partition-transaction.property.test.js:550 green).
- Demote→heal composition: same multi-replica-config fixture — leader + wedge → fitness ticks
  (driveFitnessTicks pattern, dt6-ledger-leader-durability-fitness.test.js:93-104) →
  performTrackedLeaderDemotion fires through the REAL landed sequence (raft.change FOLLOWER event
  is NOT ignored on multi-replica config → this.role flips via the real
  wireReplicaLifecycleEvents plumbing) → next sweep tick heals → fitness recovery tick logs
  RECOVERED. Fully composable with the durability-fitness DT harness (same fixture family, same
  nowMs-override discipline, no timer patching).
- Coordinator-level (parts 2/3): test/query/distributed-transaction-coordinator.test.js is the
  exact harness (DistributedTransactionCoordinator with injected participant callbacks;
  recoverFromSystemTables driven directly at :302-581). Run-23 repro: begin('s1') →
  enlistParticipants('s1',['p1']) → recoverFromSystemTables({transactions:[ACTIVE row],
  participants:[]}) (CDC-lag simulation) → commit('s1') → RED on HEAD (COMMITTED, zero
  participant calls), GREEN post-fix (live record preserved; commit contacts p1 / or aborts
  loudly). Red-on-revert-able per file via dt:prove.

## FINAL VERDICTS (per part)

1. ACTIVE-hold sweep: GO with amendments — gate = FOLLOWER/LEARNER-or-solo (NOT merely
   "not leader": CANDIDATE unsafe Z2, solo carve-out required by shipped test + only-heal), Z1
   cache invalidation is MANDATORY (else the heal silently loses the entries it saves), G1-G3.
   (a) prepared-path :291-298 role-gating: IN SCOPE (Z3). (b) loop: no deadlock, verified
   end-to-end incl. re-election-mid-window (bounded churn, no unsafe rollback); G4 hardening.
   (c) evaporation: bounded-loud, re-drive verified (terminal repair + level-triggered lanes);
   demo-doneWhen residual risk from the out-of-scope 1ms budget recorded.
2. Empty-set commit guard: AMEND — as stated it is unimplementable without part 3 (durable
   read-back hits the same CDC lag; run-23 took the empty-fallback branch :402-405, not the skip
   :410-413). Minimal sufficient: (a) skip→abort on requested-but-missing key; (b) refuse COMMIT
   when monotonic in-memory enlistment count > 0 and participants Map is empty. Both in-memory,
   both depend on part 3 preserving the live record. Zero-participant commits stay legal.
3. Recovery clobber guard: GO as SKIP-LIVE (adopt-only-when-absent), NOT merge — with the four
   seams covered (workflow replace, participant-row overwrite, recoveredTransactionIds
   enrollment, writeOperations duplication). "Live" = in-memory present AND non-terminal.
4. Absorption: GO as REMOVE the size===1 foreign-adoption arm (both active :33-35 and prepared
   :96-98 resolvers); keep DEFAULT-session branch; sessionless writes get proposeWrite semantics
   already pinned by the routing test; fix dt6 test cleanup to pass explicit session ids.
   Reject-with-typed-error REJECTED (availability regression on every legit session).
5. Rollback catch fix: AMEND — unconditional exec WIDENS leader destruction. Role-gate with the
   SAME predicate as the sweep; when skipped-or-failed, KEEP the session registered (do not
   delete bookkeeping) so the sweep owns the stranded tx post-demotion — otherwise the F7
   stranding is unreachable by the ACTIVE sweep (map iteration) forever on a follower.
   Main-path propose-then-exec ordering (:622-627) stays out of scope (pre-existing F5; record).
6. Out-of-scope check: PASS — nothing in the fix set reads the 1ms budget machinery or the
   phantom-ack quorum accounting; only the doneWhen-demo residual (above) touches them.

OVERALL: AMEND (direction GO). Mandatory amendments: Z1 cache invalidation, Z2/solo gate
predicate, Z3 prepared-path in scope, Z4 catch-path role-gate + keep-registration, part-2
reduction to in-memory guards riding on part 3, part-3 four-seam coverage, G1-G4, DT fixture
shapes as ruled.
