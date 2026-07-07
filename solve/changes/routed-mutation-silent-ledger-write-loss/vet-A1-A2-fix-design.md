# Adversarial vet — A1/A2 fix design (routed-mutation silent ledger write-loss)

Read-only vet of a proposed COUPLED fix pair BEFORE any code is written. All claims cite
`file:line` at repo state of this vet. No source edited. Verdict leads with Q3+Q4 (they
decide whether this is one fix or two).

---

## TL;DR verdict

- **A1 (stop enlisting single-partition `replica_operations` writes into 2PC): SHIP-WITH-CHANGES.**
  The spurious hold is real and A1 is structurally load-*reducing* (opposite of the arm-2
  regression). BUT **both proposed loci are wrong as written**: the `enlistParticipants`
  short-circuit at `sql-query-engine-write-execution.js:252` keyed on
  `writePartitions.length === 1` **breaks cross-statement atomicity** for any multi-statement
  session that accumulates several single-partition writes (application `BEGIN`, managed-split,
  control-plane-setup all open such sessions); the owner-execution-lane predicate widening is
  **blind to SPLIT_CUTOVER mirror participants** added downstream. Ship a *rebalancer-scoped*
  bypass that is guarded by the real post-mirror partition count (see Q2/Q6).
- **A2 (make the single-write path confirm quorum-durable before ack): DO-NOT-SHIP AS DESIGNED.**
  Its premise — "the bypass path acks on the leader-local apply's `changes>0` instead of a
  quorum commit" — is **inaccurate for RAFT mode**: `applyWrite` already `await`s the raft
  commit (`write-metrics-base.js:744`), which is gated on majority acks. The genuine residual
  durability hole is **(1) DIRECT commit mode** (`partition-write-kernel.js:44-60`,
  no quorum when `replicaIds.length<=1`) and **(2) the leader self-ack-before-durable**
  (`in-memory-log-adapter.js:50-53`) which only bit because the orphaned hold made the
  leader's own SQLite writes non-durable. Narrowing DIRECT for control-plane tables risks
  wedging legitimate single-node/degraded operation (the kernel comment
  `partition-write-kernel.js:45-55` warns of exactly this). A2 is the arm-2-shaped trap.
- **Sequencing: A1-first, then a live A/B, hold A2 as contingency.** The dominant observed
  write-loss is a *consequence* of the orphaned-hold freeze, not an independent phantom-ack;
  removing the hold (A1) plausibly removes the write-loss because the bypass write then
  travels the RAFT path on a 5-replica partition and commits quorum-durably. Whether the
  latent DIRECT/self-ack arm still binds post-A1 can only be settled by the live A/B.
  This is **one fix (A1) with A2 held in reserve**, not a mandatory coupled pair.

---

## Q3 (CRUX) — WHERE the single-write acks, and is it already quorum-durable?

**The bypass `persistFn(null)` write is quorum-durable IN RAFT MODE; it is NON-durable only
in DIRECT mode (`replicaIds.length<=1`).** A2's framing that it acks on leader-local
`changes>0` is wrong for the mode that actually runs on `replica_operations-p1`.

Traced path of the bypass write (session stripped upstream at
`operation-workflow-owner-execution-lane.js:709-718`):
`persistOperationUpdate` → gateway `updateSystemTableRow` (`skipCacheWait:true`) →
`executeSQL` → `executeSQLViaQueryEngine` → `executeUpdate`
(`sql-query-engine-write-execution.js:213`). With `sessionId` stripped,
`getTransaction(sessionId)` at `:246` returns null → `txState` falsy → the whole
`if (txState)` enlist/record block (`:252-285`) is skipped → `executePlan` (`:314`) runs a
plain single write → partition leader `applyWrite` (`partition-service-write-metrics-base.js:598`).

Commit mode is chosen at `write-metrics-base.js:614-619` via
`resolvePartitionWriteCommitMode` (`partition-write-kernel.js:42-65`):

- **RAFT mode** (`replicaIds.length>1` and local raft is LEADER, kernel `:62-63`): `applyWrite`
  computes `commitPromise = waitForCommittedWrite(...)` (`:645`), local-applies to compute
  `changes` (`:664`), `propose`s to raft (`:715`), then **`await commitPromise` and returns
  `committedResult`** (`:743-750`). `commitPromise` resolves only when `applyCommittedEntry`
  fires `resolveCommittedWrite` (`entry-apply-base.js:617/628`). `applyCommittedEntry` for a
  multi-replica group is driven **by the liferaft `'commit'` event**
  (`partition-replication-handler.js:258-261,378`; `raft-group.js:303`), which liferaft emits
  only after a **majority of `responses[].ack`** is reached. So the ack DOES wait for a
  quorum commit. The returned `changes` is the leader-local count
  (`setPendingCommittedWriteResult`, `write-metrics-base.js:781`; skip-replay resolve,
  `entry-apply-base.js:608-617`) — but the *timing of the resolution* is quorum-gated, so a
  correct-quorum RAFT write is NOT a phantom-ack. **A2's premise fails here: the change count
  being leader-local is irrelevant because resolution already awaits the commit event.**

- **DIRECT mode** (`replicaIds.length<=1` and `hasKnownRemoteLeader!==true`, kernel `:44-59`):
  NO `commitPromise`, NO `propose`, NO quorum — `applyWrite` local-applies and returns
  `result` with `changes>0` at `write-metrics-base.js:770`. **This is a genuine
  non-durable ack** (map report Hop 5, arm 1). It fires only when the leader's replica list
  is viability-filtered to `<=1` and no remote leader is witnessed.

**The residual structural hole behind even the RAFT path** is the leader self-ack:
`saveCommand` stamps `responses:[{address:self, ack:true}]` at
`in-memory-log-adapter.js:50-53` — the leader counts its own copy toward the majority
*before* that copy is durably persisted. Under a normal (unblocked) connection the SQLite
append is durable enough; under the orphaned `BEGIN IMMEDIATE` the append lands inside an
uncommitted transaction (flap report Task 3; `sqlite-log-adapter.js:419-455` `commit()`
stamps `lastDeclaredCommitIndex` before the `isOpen`/`setCommittedIndex` guard, so
`setCommittedIndex` executes inside the open txn and never becomes durable), which is
precisely how `declaredIndex >> durableIndex` and the leader-only "phantom-ack ACTIVE" rows
(`c0af37ff`) are produced. **The write-loss is therefore a consequence of the freeze, not an
independent ack bug in the RAFT path.**

**Where A2 must live if it lives at all:** NOT "carry the change count through committedResult"
(already happens). The only real durability gaps are (1) DIRECT mode and (2) self-ack-before-
durable — both high-blast-radius raft-core surgery the durability-fitness sibling quest
deliberately avoided (prior-art report §6). A2 as written targets a non-bug.

---

## Q4 — Is A1-alone regressive, or does removing the hold also remove the write-loss?

**A1-alone is very likely SELF-HEALING, not regressive, for the observed (post-`3717c518`)
write-loss. Cannot be proven sufficient without a live A/B, but the disk + trace evidence
points strongly that way.** Reasoning:

1. The design's regression fear ("A1 moves more ops onto a write-loss-prone path") assumes the
   bypass/single-write path is inherently lossy. Per Q3 it is **only lossy in DIRECT mode**.
   On `replica_operations-p1` the live run has **5 replicas** (flap report §2: r2/r4/r7/r8/r9),
   so absent the freeze the bypass write takes **RAFT mode** and commits quorum-durably.
2. The observed write-loss is a **consequence of the orphaned-hold freeze**: durability
   recovers within **1 ms** of each 60 s rollback and the durable index advances to 761 when
   unheld (flap report Task 3 lines 48-70, Task 4 lines 84-98). The freeze — not a structural
   phantom-ack — is what makes writes non-durable and mints the leader-only ACTIVE rows.
3. A1 **removes the orphaned `BEGIN IMMEDIATE`** (the ledger progress write no longer enlists
   a participant hold on `replica_operations-p1`), so the single connection is no longer stuck
   in an uncommitted transaction → raft appends and `setCommittedIndex` commit durably →
   `declared==durable` → fitness stops flapping → RAFT writes durably replicate. Removing the
   hold removes the mechanism that produced the write-loss.
4. **Residual latent arm that A1 does NOT cover:** DIRECT mode (arm 1). If, even without the
   freeze, `replica_operations-p1` still viability-filters to `<=1` replica during cold
   formation churn, a bypassed single write would DIRECT-commit non-durably. There is **no disk
   evidence this arm bound in the post-fix run** (the flap report attributes the loss to the
   hold, not DIRECT), but it cannot be excluded a priori. **This is the only reason to keep A2
   in reserve.**

**Conclusion for Q4:** this is *one fix* (A1) plus a *contingency* (a DIRECT-mode narrowing,
NOT the A2 as designed), gated on live evidence. The "mandatory coupled pair" claim is not
supported by the code — it rests on the incorrect premise that the RAFT bypass path acks
non-durably.

---

## Q1 — A1 safety: does a single-partition `replica_operations` write ever legitimately need 2PC?

**For the rebalancer transition write: essentially never — with ONE caveat (SPLIT_CUTOVER).**

- The transition session opened at `operation-workflow-transition-orchestration.js:311-317`
  carries **exactly one durable write**: the `persistOperationUpdate` UPDATE to
  `replica_operations` (`:349`). The in-memory `transitionStep` (`:343`) is a **no-op**
  durable-side: the rebalancer's `DurableWorkflowCoordinator` has no `persistWorkflow`
  callback (`rebalance-coordinator-lifecycle.js:217-218` → default no-op
  `durable-workflow-coordinator.js:29`). So there is no second durable write to be atomic
  with — 2PC provides **zero atomicity benefit** (trace report Hop F, confirmed).
- The session is single-use: `begin` (`:317`) → one `persistFn` (`:349`) → `commit` (`:363`).
  It does NOT accumulate multiple statements. So "single participant" is a true invariant of
  this session, not an accident of one statement.
- **Idempotency / crash-recovery:** the participant record + `sql_write_operations` bookkeeping
  (`enlistParticipants`→`persistTransactionRecord`/`persistParticipants`,
  `distributed-transaction-coordinator.js:273-274`; `recordWriteOperation`,
  write-execution `:278`) exist to let a crashed 2PC be recovered/rolled-forward. For a
  **single durable participant** there is nothing to atomically recover across — the
  `replica_operations` row IS the durable state, and the workflow re-drives level-triggered
  from that row. Dropping the enlistment loses no recovery guarantee that the ledger row
  itself doesn't already provide. (The rebalancer's own idempotency guard is
  `isTransitionIdempotent`, orchestration `:258`, and CL-017(b) OR-IGNORE reinsert — neither
  depends on the 2PC participant record.)
- **The caveat — SPLIT_CUTOVER:** `addTransitionMirrorParticipants`
  (`sql-query-engine-table-routing-methods.js:423-453`) adds a **second** (source-partition)
  participant when the *written table itself* is in `SPLIT_CUTOVER_ACTIVE`. If
  `replica_operations` is ever mid-split, its transition write legitimately touches **2
  partitions** and genuinely needs 2PC to keep source+target mirrors atomic. `writePartitions`
  is then length 2, not 1. **Any A1 must preserve 2PC for this case** — which is exactly why
  `writePartitions.length === 1` (measured *after* `addTransitionMirrorParticipants` at
  write-execution `:243-244`) is the correct discriminator, and the op's-target-partition
  predicate is NOT (it can't see the mirror). Whether `replica_operations` ever actually splits
  in this system is unverified here (INITIAL_PARTITION_IDS gives it a single `-p1`); do not
  rely on "it never splits" — guard on the real count.

---

## Q2 — A1 locus choice & blast radius

**Neither proposed locus is correct as written. The safe fix is a rebalancer-scoped bypass
guarded by the true post-mirror partition count.**

- **Locus 1 — `enlistParticipants` short-circuit at `sql-query-engine-write-execution.js:252`
  keyed on `writePartitions.length === 1` (affects ALL engine callers): UNSAFE.** A
  multi-statement session composed of several single-partition writes across *different*
  partitions needs 2PC across them, yet each individual statement has `writePartitions.length
  === 1` at this point. Skipping enlist per-statement on the length test **silently drops
  cross-statement atomicity**. Real callers that open such sessions:
  `sql-query-engine.js:404` (application `BEGIN` / distributed transactions),
  `managed-split-workflow-persistence-methods.js`, `bootstrap/shared/control-plane-setup.js`
  (all appear in the `.begin(sessionId)` grep). This locus is the **more dangerous** one
  despite seeing the partition count, because it is blind to the *session's other statements*.
  Also incomplete: skipping only `enlistParticipants` while leaving `txState` truthy still runs
  `recordWriteOperation` (`:278`), `markWriteOperationResult` (`:361`), and the upstream
  `txCoordinator.commit` (orchestration `:363`) against a zero-participant transaction —
  partial, messy state.

- **Locus 2 — widen the predicate at
  `operation-workflow-owner-execution-lane.js:696-699` / `:709-718` (affects only the
  rebalancer): narrow blast radius, but BLIND to SPLIT_CUTOVER mirrors.** The predicate keys on
  `resolveTransitionOperationPartitionId(operation)` (the op's TARGET), evaluated upstream of
  `addTransitionMirrorParticipants`. Widening it to "bypass whenever the write targets
  `replica_operations`" would strip the session even when `replica_operations` is mid-split and
  the write legitimately needs a 2-partition 2PC (Q1 caveat) → **atomicity regression for the
  ledger-split case.**

- **Recommended locus (surgical):** keep the decision in the **rebalancer** (narrow blast
  radius) but make it consult the **real post-mirror count**. Concretely: have the transition
  persist path pass a scoped queryOption (e.g. `singlePartitionLedgerBypassEligible: true`,
  set only for these ledger transition writes), and in `executeUpdate`/`executeInsert` skip the
  entire `txState` block (`enlist` + `recordWriteOperation` + the later
  `markWriteOperationResult`) **only when that flag is set AND
  `writePartitions.length === 1`**. This (a) sees the mirror count so SPLIT_CUTOVER keeps 2PC,
  (b) cannot affect generic application/managed-split/control-plane sessions (flag absent),
  (c) fully neutralizes the transaction rather than leaving half-engaged bookkeeping. If a
  scoped flag is judged too invasive, the fallback is the upstream predicate bypass **plus an
  explicit `replica_operations`-not-in-SPLIT_CUTOVER guard**.

---

## Q5 — Amplification risk vs the arm-2 precedent (`1ce80391`→`692c9dbb`)

- **A1: no amplification — it REMOVES work.** It eliminates the participant `BEGIN IMMEDIATE`
  and the `sql_transactions`/`sql_transaction_participants`/`sql_write_operations` bookkeeping
  writes per transition (trace report Hop G). It is purely structural and load-*reducing*: the
  opposite shape of arm-2's per-failure escalate+reinsert storm. No extra reads, no removed
  backoff. **Passes the arm-2 test.**
- **A2 as designed: carries arm-2-shaped risk.** The only way to make DIRECT-mode writes
  "quorum-durable" is to reject/retry them (narrow DIRECT→REJECTED for control-plane tables).
  That **removes the DIRECT fast path** that legitimately lets single-node/degraded clusters
  make progress (kernel comment `partition-write-kernel.js:45-55` explicitly warns replica_count
  must not gate this because it "legitimately exceeds placed membership on single-node and
  degraded clusters"). Rejecting these writes turns them into retry/defer churn on the hottest
  control-plane partition during cold formation — a plausible amplification. **A2 fails the
  arm-2 caution; do not ship it blind.**

---

## Q6 — Verdict, sequencing, minimal change, DT, live signal

### A1 — SHIP-WITH-CHANGES
Change vs design: do NOT use the bare `writePartitions.length===1` engine short-circuit
(breaks cross-statement atomicity) and do NOT use the op-target predicate alone (blind to
mirrors). Ship the **rebalancer-scoped, post-mirror-count-guarded** bypass (Q2 "recommended
locus"): a scoped queryOption set only on the ledger transition persist write, honored in
`sql-query-engine-write-execution.js` `executeUpdate`/`executeInsert` to skip the entire
`txState` block **iff the flag is set AND `writePartitions.length===1`**. Preserves 2PC for
SPLIT_CUTOVER (length 2) and for every non-rebalancer session (flag absent).

### A2 — DO-NOT-SHIP AS DESIGNED
The "single write acks on leader-local `changes>0`" premise is false for RAFT mode (already
awaits commit). If, and only if, the live A/B after A1 shows residual write-loss, the correct
follow-up is a **scoped DIRECT-mode narrowing for control-plane ledger tables that still
permits genuine single-node/degraded progress** (positive quorum evidence, not a
`replica_count` heuristic) — designed and vetted as its own increment. Not this pair.

### Sequencing
**A1-first → 2-pre/2-post live A/B → A2/DIRECT-narrowing only if write-loss persists.**
The reports themselves waver between "ship the pair" (residual-synthesis §8-9) and
"A1 plausibly self-heals" (flap report). The code resolves it: A1 removes the freeze that
produces the loss on a 5-replica RAFT partition, so A1-first is the honest one-invariant-at-a-
time move, consistent with `dt-must-move-the-binding-observable` and
`hotpath-failure-fix-needs-aggregate-live-validation`.

### DT that proves A1 red-on-revert
A DT that drives a **non-priority (data-partition) op's** transition persist write and asserts
the write to `replica_operations-p1` executes **without opening a participant `BEGIN
IMMEDIATE`** on `replica_operations-p1` (assert `db.inTransaction===false` after the write, or
that `beginParticipant`/`enlistParticipants` is not invoked for the single-partition ledger
write), while a companion assertion confirms a **SPLIT_CUTOVER (2-partition) transition write
STILL enlists 2PC**. Red-on-revert: with A1 reverted the single-partition write enlists and
opens the hold. Per memory, this DT must be paired with the live A/B — a green DT alone is not
trustworthy (arm-2 lesson).

### Live signal the A/B must watch (2 pre-A1 vs 2 post-A1, back-to-back)
- Primary binding: **[2/4] load reaches PASS** (currently ABORT/timeout) and **formation
  completions drain past 43** (the post-`3717c518` plateau).
- Mechanism confirmation: **`replica_operations-p1` orphaned-hold rollbacks** ("Active
  transaction held beyond its legal window; rolled back") → ~0 post-A1 (was ×11);
  **`leader_durability_unfit_transaction_hold` + `commit_durability_divergence` unfit events**
  → collapse; **"No leader available for write operation" on
  `sql_transaction_participants-p1`** (×124) → drops as the sibling stops being starved;
  **"No row found for CDC update" / leader-only ACTIVE rows** → gone.
- Guardrail (arm-2 watch): **participant-failures / "Failed to persist operation" on
  `replica_operations` must NOT rise** — if A1 somehow increases them, stop.

---

## Discrepancy flagged between the input reports (resolved in code)
`postfix-binding-root-durability-fitness-flap.md` (Task 3) infers the orphaned transactions
"are the `replica_operations-p1` self-move ops themselves." `trace-self-referential-participant-hold.md`
(sub-Q4) shows self-move ops (target=`replica_operations-p1`) are **already bypassed** because
`isPriorityControlPlanePartition` already contains `REPLICA_OPERATIONS`
(`system-partition-classification.js:19`) and the predicate keys on the op's target. **The
code sides with the trace report:** the residual holds come from **non-priority
data-partition ops** whose *ledger progress write* enlists 2PC on `replica_operations-p1`
(the tx-id is the op-id, but the op is NOT a self-move). The flap report's "self-move ops
themselves" is an imprecise inference from the tx-id naming. This does not change A1 — a
rebalancer-scoped, count-guarded bypass covers both classes — but it means A1's target
population is the data-partition ops, and the "already bypassed self-moves" prove the bypass
mechanism itself is sound and low-risk.
