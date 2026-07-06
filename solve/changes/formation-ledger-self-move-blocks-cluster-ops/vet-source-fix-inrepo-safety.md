# Adversarial in-repo safety vet — orphaned 2PC participant BEGIN fix

Read-only. Goal: BREAK the proposed two-leg fix (leg #1 rollback-on-step-down;
leg #2 narrow `shouldTreatParticipantCommitMissAsSuccess`). Source HEAD `dc141f50`.
Cites `file:line`. Verdict at the end.

Fix under test (from `diagnose-orphan-tx-source.md` §5, candidates #1 + #2):
- **#1** On the leadership-loss EDGE, roll back any open ACTIVE (never-prepared)
  participant BEGIN, reusing the zombie-quest crash-equivalent follower heal
  (`enforcePreparedStateHoldTimeouts` / `isStuckTransactionHealPermitted`,
  `partition-service-transaction-base.js:317-401`), instead of waiting for the
  60s sweep.
- **#2** Narrow `shouldTreatParticipantCommitMissAsSuccess`
  (`distributed-transaction-protocol.js:102-112`) so a stranded-hold commit-miss
  is surfaced loudly instead of greened.

---

## 1. COMMIT-MISS MASK NARROWING — **HAZARD FOUND (this is the load-bearing hazard)**

`shouldTreatParticipantCommitMissAsSuccess` (`distributed-transaction-protocol.js:102-112`)
masks green iff `stage === COMMITTING` and the error is `NO_TRANSACTION`
(errorCode) or its message is in `IDEMPOTENT_COMMIT_MISS_ERROR_MESSAGES`
(`distributed-transaction-coordinator-constants.js:55-59` = the string
`'No active transaction to commit'`).

Callers / legit cases it currently masks:
- **executeParticipantOperationWithRetry** (`distributed-transaction-protocol.js:456`)
  — the live, **non-recovery** ACK-loss retry: the participant committed durably
  and cleared its session (`commitTransaction` deletes at
  `partition-service-transaction-base.js:660-662`), the ACK was lost, the
  coordinator retries the same COMMIT, the participant now returns
  `NO_ACTIVE_TRANSACTION_COMMIT` (`:622`). This must stay green.
- **Recovery replay** — `resumeRecoveredTransactions` re-drives COMMIT for
  PREPARED/COMMITTING txns (`distributed-transaction-recovery.js:124-129`) and
  the periodic **recovery sweep** does the same (`:231-236`), both via
  `runCommitProtocol(tx,{allowTimedOutCommitStatuses:true})`. These converge a
  crash-interrupted commit **only because** a participant that already committed
  before the crash now commit-misses and is treated as success. Remove the mask
  and these recover paths mark an already-committed tx FAILED
  (`distributed-transaction-protocol.js:281-287`).

**The break — the stranded-hold miss is INDISTINGUISHABLE from the legit
already-committed miss at the coordinator:**
- Stranded hold (the bug): new leader has no session → throws
  `NO_ACTIVE_TRANSACTION_COMMIT` (`partition-service-transaction-base.js:622`);
  the string equals `PARTITION_SERVICE_ERROR_MSG.NO_ACTIVE_TRANSACTION_COMMIT`
  = `'No active transaction to commit'` (`partition-service-constants.js:396`),
  identical to `QUERY_ERROR_MSG.NO_TRANSACTION_COMMIT`. Coordinator participant
  status = COMMITTING (never observed COMMITTED).
- Legit already-committed (ACK loss / duplicate delivery / post-crash replay):
  participant deleted its session AFTER a durable commit → **same** thrown
  error, **same** coordinator participant status COMMITTING.

Both produce the same errorCode/message AND the same coordinator-local
participant status. The diagnosis's proposed discriminator ("participant
recorded ACTIVE, never observed COMMITTED here", §5 #2) is satisfied by BOTH
cases, so it does not separate them. Gating on
`recoveredTransactionIds.has(tx.workflowId)` also fails, because the ACK-loss
retry at `:456` is a **live, non-recovered** transaction.

**Interleaving that causes a FALSE loud-failure on a tx that actually committed:**
1. Coordinator drives COMMITTING; sends COMMIT to participant p1 (current leader).
2. p1 executes `db.exec(COMMIT)` durably and deletes its session
   (`partition-service-transaction-base.js:637,660`).
3. The ACK is lost (or a duplicate COMMIT is delivered during recovery replay).
4. Coordinator retries COMMIT → p1 returns `NO_ACTIVE_TRANSACTION_COMMIT`.
5. With the mask NARROWED to "surface stranded-hold loud", step 4 is surfaced
   loud → `runCommitProtocol` sets status FAILED and returns a participant
   failure (`:281-287`). The transaction **committed on every participant** but
   the coordinator's durable record says FAILED → torn 2PC outcome, and the
   recovery sweep will keep re-FAILing it forever (never converges).

Leg #2 as described therefore **cannot be shipped on coordinator-local error
alone**. The only sound discriminator is an out-of-band signal that the hold was
lost across leadership (a leadership TERM/epoch fence carried end-to-end —
diagnosis candidate #3), which is NOT part of this fix. Narrowing without it is
UNSAFE.

## 2. ROLLBACK-ON-STEP-DOWN vs A COMMIT THAT LANDED — **SAFE-WITH-CONSTRAINTS**

A committed tx is removed from `activeTransactions` **after** the durable commit:
`commitTransaction` order is `await replicateTransactionCommit` (`:632`) →
`db.exec(COMMIT)` (`:637`) → `activeTransactions.delete` (`:660`). The `await`
at `:632` yields the event loop, and the session stays ACTIVE across that yield.

Race: a FOLLOWER edge firing during that yield sees the session still ACTIVE and
runs `db.exec(ROLLBACK)`; when control returns, `db.exec(COMMIT)` at `:637`
throws ("no transaction is active"), caught at `:675`, tx surfaced as a
COMMIT-failure (a *different* error, not masked) → coordinator marks FAILED.
Data-level this stays crash-consistent: `replicateTransactionCommit` appended the
`TRANSACTION_COMMIT` entry to local storage (`:812`) and proposed only if still
leader (`:813-815`); if it reached quorum the new leader applies it and the
ex-leader re-applies on catch-up (dedup cleared), if not it is truncated — commit
everywhere or abort everywhere. But the coordinator can still record FAILED for a
cluster-committed tx (a torn *record*). Window is one microtask and only when the
committing participant is the node being demoted at that instant — narrow, but
real.
- **Constraint C1:** the edge rollback MUST reuse the full crash-equivalent
  sequence — clear `recentlyAppliedEntryKeys` + `refreshCommittedIndexCacheFromStore`
  (`partition-service-transaction-base.js:356-357`), never a bare `db.exec(ROLLBACK)`;
  otherwise the Z1 durable-watermark clamp / skipped re-apply returns.
- **Constraint C2:** prefer to skip/defer the edge rollback for a session that is
  mid-commit (no such flag exists today), or accept the narrow torn-record window.

The committedIndex guard concern (`:356-357`) is satisfied by reuse; an
already-replicated COMMIT is re-applied, not re-truncated.

## 3. PREPARED / VOTED EXEMPTION — **SAFE-WITH-CONSTRAINTS**

Only ONE tx exists per partition connection: `beginTransaction` throws
`TRANSACTION_ALREADY_ACTIVE` if `activeTransactions.size>0 || preparedTransactions.size>0`
(`:496-501`). A PREPARED tx's SQLite `BEGIN IMMEDIATE` is still open (prepare
replicates a marker and moves state but never commits the connection,
`prepareTransaction:577-591`). So a bare connection-level ROLLBACK on the
step-down edge would revert a PREPARED (in-doubt) participant's writes —
nominally a 2PC violation.

It is nonetheless recoverable because PREPARE is raft-replicated
(`replicatePreparedTransaction:867-891`) and reconstructed on the new leader
(`reconstructPreparedState:21-93`); the operations re-apply from the durable
COMMIT marker. So an over-broad rollback is crash-equivalent, NOT a durability
loss — **provided C1 holds**.
- **Constraint C3:** the edge must target ACTIVE-only, reusing the
  `collectExpiredActiveSessions` prepared-exclusion (`this.preparedTransactions.has(sessionId)` continue,
  `:298`). If it instead fires an unconditional connection ROLLBACK it will also
  roll back a PREPARED hold; safe only because of raft-durable PREPARE + C1, but
  it should still exclude PREPARED to avoid needless in-doubt churn.

`isStuckTransactionHealPermitted` returns true on the edge because
`applyReplicaDemotion` sets `role = FOLLOWER` (`replica-leadership-state.js:130`)
BEFORE the `onFollower` callback (`:131`); this ordering is load-bearing and
correct — do not roll back before the role flips.

## 4. STEP-DOWN EDGE PLUMBING — **SAFE (one reliable edge), with a gap note**

The LEADER→FOLLOWER edge funnels through `onFollower`
(`partition-service-raft-init-base.js:452-456`), reached from BOTH the raft-native
FOLLOWER event (`replica-leadership-state.js:126-135`) and the LEADER_CHANGE
demotion (`:149-170`). The durability-fitness demotion
(`performTrackedLeaderDemotion` → `raft.change({state:FOLLOWER})`,
`tracked-leader-demotion.js:35-38`) and the drain handoff both re-enter this same
FOLLOWER event, so there is a single edge to hang the rollback on.
`shouldIgnoreDemotionEvent` (`partition-service-raft-init-base.js:400-414`)
suppresses it only for a solo leader (orphan-immune; solo carve-out heals anyway)
or a joining learner — neither is the run-6 case.
- **Gap G1 (missed edge, low-prob):** a direct LEADER→CANDIDATE transition fires
  `onCandidate`, not `onFollower` (`:457-461`); the edge rollback is skipped —
  but CANDIDATE is heal-forbidden (`isStuckTransactionHealPermitted` excludes it,
  `:397-400`), so no safe rollback is possible there anyway. The orphan persists
  until the node settles to FOLLOWER or the 60s sweep. Acceptable; keep the 60s
  sweep as backstop.
- No DOUBLE-fire hazard: repeat rollback is idempotent (extra `db.exec(ROLLBACK)`
  throws "no transaction", caught at `:345-350`); the session is deleted so the
  sweep finds nothing.

## 5. FLAP REPEAT (term 2→21) — **SAFE-WITH-CONSTRAINT**

Each FOLLOWER edge that finds an ACTIVE session rolls it back and deletes it;
subsequent edges no-op. Re-acquisition (LEADER edge) creates no session. No
livelock from the rollback. BUT the crash-equivalent sequence clears
`recentlyAppliedEntryKeys` and refreshes the committed-index cache each time it
runs (`:356-357`).
- **Constraint C4:** run the dedup-clear ONLY when a rollback actually occurred
  (mirror the sweep's early-return-when-nothing-expired, `:320-325`). If the edge
  clears the dedup set on EVERY demotion regardless of whether a stuck session
  existed, ~19 flap edges each blow away the apply-dedup set → risk of spurious
  re-application of committed entries. This is a genuine regression vector if the
  edge is coded as "always clear on demote".

## 6. INTERACTION WITH DURABILITY-FITNESS DEMOTION + 60s SWEEP — **SAFE (synergistic)**

`enforceLeaderDurabilityFitness` detects the frozen hold and calls
`performTrackedLeaderDemotion` (`partition-service-durability-fitness.js:320`),
which emits FOLLOWER → the new edge rollback fires as part of that demotion. This
is the intended synergy: fitness deposes, the edge heals immediately instead of
after 60s. The three coexist:
- fitness = detect+demote, edge = immediate heal, 60s sweep = backstop for G1 /
  suppressed edges. No ordering hazard (single-threaded; re-entrant
  `raft.change` → FOLLOWER → rollback is safe). No double-rollback (idempotent).
The fix does NOT make fitness redundant — fitness is still the detector that
triggers the demotion the edge rides on.

---

## OVERALL VERDICT: **SAFE-WITH-CONSTRAINTS** — leg #1 shippable under constraints;
## **leg #2 (mask narrowing) is UNSAFE as described and must be dropped or re-scoped.**

Constraints that must hold:
- **C1** Edge rollback reuses the FULL crash-equivalent sequence
  (`recentlyAppliedEntryKeys.clear` + `refreshCommittedIndexCacheFromStore`,
  `:356-357`), never a bare ROLLBACK.
- **C2** Accept (or guard against) the narrow mid-commit torn-record window (§2).
- **C3** Target ACTIVE-only, reusing the PREPARED exclusion (`:298`); fire only
  after `role === FOLLOWER` (ordering at `replica-leadership-state.js:130-131`).
- **C4** Clear the apply-dedup set ONLY when a rollback actually happened (§5),
  else the flap causes spurious re-application.
- **C5 (blocking for leg #2)** Do NOT narrow
  `shouldTreatParticipantCommitMissAsSuccess` on coordinator-local error alone.

**Single most dangerous interleaving:** the live ACK-loss commit retry
(`distributed-transaction-protocol.js:456`) — the exact reason the mask exists —
is byte-for-byte indistinguishable at the coordinator from the stranded-hold miss
(same `NO_ACTIVE_TRANSACTION_COMMIT` string from
`partition-service-transaction-base.js:622`, same COMMITTING participant status).
Narrowing the mask therefore surfaces a **durably-committed** transaction as
FAILED and breaks recovery convergence (`distributed-transaction-recovery.js:124-129,231-236`).

**The guard that neutralizes it:** ship leg #1 alone (rollback-on-step-down turns
the orphan into ~0s so the coordinator's later commit lands on a leader that
actually has the healed state, or fails distinctly), and DROP leg #2 unless it is
promoted to carry a leadership TERM/epoch fence end-to-end (diagnosis candidate
#3): only a distinct "fenced / stale-term" typed error — never the shared
`NO_TRANSACTION` idempotent code — may be surfaced loud. Absent that fence, the
mask must stay intact.
