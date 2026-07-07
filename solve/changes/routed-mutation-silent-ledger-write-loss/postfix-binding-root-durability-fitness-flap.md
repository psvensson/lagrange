# Adversarial verify — post-raft-fix durability-fitness flap on `replica_operations-p1`

Run under test: service-data-affinity demo, virtual span `2026-07-07T15:00→15:09Z`
(logs `data/examples/service-data-affinity-demo/node-*.log`, on-disk replica DBs
`.../node-*/partitions/replica_operations-p1/*.db`). This is the fresh post-`3717c518`
run — confirmed: the committed-entry-loss guard log fires in it (see Task 4). All
evidence below is from THIS run's logs + THIS run's on-disk DBs.

**Bottom line: the diagnosis is CORRECT in outcome (leadership flaps, no stable durable
leader, ops can't record progress) but the crux it left open — (a) real durable stall vs
(b) stale witness vs (c) transaction hold — resolves decisively to (c). The durable-lag is
a genuine orphaned 2PC participant `BEGIN IMMEDIATE` held ~60–72 s on the single ledger
connection. `commit_durability_divergence` is the SAME open transaction seen through the
raft-commit witness, not an independent signal and NOT a stale-witness artifact. This is a
DIFFERENT mechanism from `3717c518` (which is firing and working); a new fix is needed.**

---

## LEAD — Task 3 (the crux: a/b/c) and Task 4 (intersection with 3717c518)

### Task 3 — the durable-lag root is (c), a genuine orphaned participant transaction

**Verdict: (c) transaction_hold — REAL, not a false signal. (a) fsync stall REFUTED.
(b) stale/cached witness REFUTED.**

Decisive evidence, three independent lines:

1. **The heal log names a real 60 s+ open transaction and its rollback.** 11 events on
   `replica_operations-p1` (0 on any other partition):
   ```
   15:03:55.063  txn 35b42199…:ACTIVE:attempt1     holdDurationMs 60572  "Active transaction held beyond its legal window; rolled back (orphaned participant hold — run-23 zombie class)"
   15:04:53.048  txn 35b42199…:STOPPING:attempt1    holdDurationMs 60037
   15:05:51.469  txn 6f938e56…:CREATING:attempt1    holdDurationMs 68871
   15:06:13.625  txn 054c922f…:STOPPING:attempt1    holdDurationMs 72516
   15:06:14.186  txn 6f938e56…:ACTIVE:attempt1      holdDurationMs 60738
   15:07:14.273  txn 2032bc13…:SENDING:attempt1     holdDurationMs 60073
   15:07:18.043  txn 054c922f…:REMOVED:attempt1     holdDurationMs 64353
   15:08:01.544  txn 7de4452e…:SYNCING:attempt1     holdDurationMs 60003   … (11 total)
   ```
   `db.inTransaction` is genuinely true for 60 s+. `PREPARED_HOLD_TIMEOUT_MS = 60000`
   (`src/control-plane/timeout-budget.js:21`) is exactly why every `heldMs` in the unfit
   events clusters at ~62 s: the transaction crosses the 60 s legal hold, then 3 one-second
   strikes fire. The transaction IDs are the ledger **operation IDs** (`35b42199`,
   `6f938e56`, `054c922f`, `2032bc13`, `7de4452e`) suffixed with their workflow step
   (`ACTIVE/STOPPING/CREATING/SENDING/SYNCING/REMOVED`) — i.e. the `replica_operations-p1`
   **self-move ops themselves** open these transactions, one per step transition.

2. **Recovery fires within 1 ms of the rollback — proving the open transaction IS the lag.**
   node-3 (`r9`) timeline:
   ```
   15:06:03.619  unfit  leader_durability_unfit_transaction_hold
   15:06:13.625  "held beyond its legal window; rolled back"   ← orphaned txn cleared
   15:06:13.626  "durability recovered; leadership fitness restored"   ← +1 ms
   15:07:17.043  unfit  leader_durability_unfit_transaction_hold   ← next op-step opens a new BEGIN IMMEDIATE
   15:07:18.043  "held beyond…" → recovered (again)
   15:08:14.203  unfit  leader_durability_unfit_commit_durability_divergence
   ```
   Durability recovers the instant the `BEGIN IMMEDIATE` is rolled back and re-freezes the
   instant the next op-step opens a new one. That is a causal lock between the open
   transaction and the frozen durable watermark.

3. **The witness is ACCURATE, not stale — refutes (b).** For the `r9` unfit event at
   15:08:14 the witness reported `durableIndex 343`; `r9`'s own on-disk
   `_raft_state.committedIndex` is **343** (`node-3/…/replica_operations-p1-r9.db`). They
   match exactly. On-disk committed indices this run: `r4`=761, `r8`(node-2)=343,
   `r9`=343, `r7`=320 — a real 761-vs-343 durable spread, not a read artifact. The
   `readDurableCommittedIndexWitness` (`partition-service-durability-fitness.js:158-189`)
   opens a **separate readonly** connection; better-sqlite3 `.get()` autocommits, so it
   sees the last durably-committed snapshot — which is precisely the correct definition of
   "durable" while the main connection sits in an uncommitted `BEGIN IMMEDIATE`.

**Why `declaredIndex >> durableIndex` mechanically:** `commit()`
(`sqlite-log-adapter.js:419-455`) stamps `lastDeclaredCommitIndex = index` at line 428
**before** the `isOpen` guard and before `setCommittedIndex()` (line 453). While an
orphaned `BEGIN IMMEDIATE` is open on `this.db`, the `INSERT OR REPLACE INTO _raft_state`
inside `setCommittedIndex` executes **within that uncommitted transaction** → not durable
→ the readonly witness honestly reports the pre-transaction watermark. So declared races
ahead in memory (761) while durable is pinned (343) for the whole 60 s hold. The
`commit_durability_divergence` reason is therefore the **same open transaction** as
`transaction_hold`, observed one tick later through the commit path (e.g. `r8` at 15:07:14
shows `declaredIndex 755 / durableIndex 0` — 0 because at that instant no committedIndex
row had yet committed outside the open transaction). Not two roots; one root, two windows.

### Task 4 — DIFFERENT mechanism from `3717c518`; the guard is firing and healthy

- **The guard IS engaged this run.** `"Refused raft log truncation into the committed
  prefix (committed-entry-loss prevented)"` fires 143 / 6 / 9 / 219 / 42 times across
  node-0..4 (`sqlite-log-adapter.js:564-610`). The fix is live.
- **The durable index DOES advance and replicas DO recover** — the opposite of s10's
  permanent freeze. `r4` reached 761; every flapping replica logs `durability recovered`
  repeatedly (31 / 33 / 115 / 163 / 503 recovery events node-0..4). The freeze here is a
  **transient 60 s window per orphaned hold**, not a permanent watermark freeze behind a
  log hole.
- On-disk logs are contiguous below the watermark (`r4` = 1..761 count 761; `r8`/`r7` =
  1..343 count 343). `r9` has max 484 / count 353 — a gap, but entirely **above** its
  committed watermark 343 (uncommitted suffix the guard legitimately allows to be
  refilled). No committed-prefix hole.

`3717c518` fixed *permanent freeze via deletion of committed entries* (a log hole).
This residual is *transient freeze via an uncommitted transaction blocking the watermark
write*. The guard neither causes nor cures it. **A new, separate fix is required.** The two
are orthogonal; this fix stacks cleanly on top of the landed guard.

---

## Task 1 — the flap is REAL, but it is a SYMPTOM of the orphaned hold

Distinct `replica_operations-p1` replicas that crossed the strike bound and shed/deferred
leadership: **r7, r4, r9, r8, r2 — 5 distinct replicas** (first-detection error logs:
node-0=1, node-1=2, node-2=3, node-3=3, node-4=1 = 10 unfit episodes). Reasons split
across both `transaction_hold` and `commit_durability_divergence`. `r8` and `r9` each cycle
unfit→recovered→unfit twice.

Is the flap the binding cause of no-stable-leader, or a symptom? **Symptom.** The
durability detector is doing its job correctly — it is demoting leaders that genuinely
cannot make writes durable (a real 60 s open transaction). No-stable-leader recurs because
the **underlying orphaned participant hold recurs** — every self-move op-step transition
opens a fresh `BEGIN IMMEDIATE` that orphans for the full 60 s legal window before the heal
rolls it back. The detector/flap is the messenger. Do NOT "fix" the flap by weakening the
detector — that reintroduces the run-23 silent-freeze class.

## Task 2 — the detector, precisely

`enforceLeaderDurabilityFitness` (`partition-service-durability-fitness.js:227`) rides the
1 s prepared-hold sweep. A replica is "unfit" on either of two honest signals, each after
3 strikes:
- **transaction_hold** (`observeLeaderDurabilitySignals:266-286`): `this.db.open &&
  this.db.inTransaction` continuously ≥ `LEADER_DURABILITY_LEGAL_HOLD_MS`
  (=`PREPARED_HOLD_TIMEOUT_MS`=60 000 ms). `this.db` is the single connection that holds
  `_raft_log`, `_raft_state` AND the `replica_operations` table (one file per replica).
- **commit_durability_divergence** (`observeCommitDurabilityDivergence:294-319`): compares
  `logAdapter.getLastDeclaredCommitIndex()` (in-memory intent, stamped in `commit()` before
  guards) against `readDurableCommittedIndexWitness()` (separate readonly read of
  `_raft_state.committedIndex`); stuck only if `declared > durable` **sustains** ≥ 60 000 ms.

Both come from the same physical fact: an open write transaction on the one connection
makes every raft write non-durable while a separate reader sees the last committed
watermark.

## Task 5 — fix locus (pin, don't implement)

Ranked against the memory's three candidates:

- **NOT candidate (A) "re-open the durable write connection on a frozen adapter."** The
  connection is not closed — `db.open` is true, `db.inTransaction` is true. Re-opening
  addresses the silent-close family, which is not what fired here. Wrong locus.
- **NOT candidate (C) "gate durable-index read off the authoritative handle."** The witness
  is already authoritative and already accurate (durable 343 == on-disk 343). Nothing to
  fix here; changing it risks re-hiding the very freeze the detector must catch.
- **Candidate (B), correctly scoped, is the fix — but the ROOT is upstream of the existing
  60 s rollback heal.** The existing heal (`"Active transaction held beyond its legal
  window; rolled back"`) is a **late 60 s backstop**: by the time it fires, durability has
  already been frozen for a full minute and leadership has already flapped. The minimal
  correct fixes, in order of preference:

  1. **Break the self-referential orphan.** The orphaned transactions ARE the ledger's own
     self-move ops (`35b42199` etc.) opening a 2PC participant `BEGIN IMMEDIATE`
     (`partition-service-transaction-base.js:509`, reached via `beginTransaction` :465 and
     `partition-service-entry-apply-base.js:177`) on `replica_operations-p1` — while their
     2PC cannot complete because the sibling `sql_transaction_participants-p1` reports **"No
     leader available for write operation" 124 times** this run. A ledger self-move that
     must record its own progress should not take a blocking participant hold on its own
     partition that can orphan on a sibling-partition leader gap. Locus: the routed-write /
     2PC participation decision for self-referential control-plane ledger writes.
  2. **Shrink the orphan blast radius (safer, tuning-level).** 60 s
     (`PREPARED_HOLD_TIMEOUT_MS`) is far too long a durability-freeze window for a
     control-plane ledger partition. A much shorter legal hold (or a fitness-triggered
     early rollback for the ledger partitions specifically) collapses the flap window from
     ~60 s to a few seconds, so a non-completable 2PC self-heals before it can demote a
     leader. Locus: the hold-timeout applied to control-plane ledger participant
     transactions, and/or coupling the rollback heal to the fitness sweep rather than the
     fixed 60 s bound.

  **Regression risk:** (1) is the real correctness fix but the highest-risk — it changes the
  self-move write path and must not lose the participant-hold's atomicity guarantee for
  legitimate multi-partition ops; requires the same live A/B the arm-2 revert taught
  (`692c9dbb`). (2) is lower-risk but partly cosmetic: it speeds recovery without removing
  the orphan, and shortening a global prepared-hold could prematurely roll back a
  legitimately-long legal participant session elsewhere — so it must be scoped to the
  control-plane ledger partitions, not global. Given this is stacked on the just-landed raft
  fix, recommend proving (2) as an immediate flap-suppressor while (1) is designed, and
  gating both on the live 2-pre/2-post comparison, not just a unit DT.

  **Note the true upstream:** `sql_transaction_participants-p1` "No leader available" ×124
  is what leaves the 2PC un-completable and the hold orphaned. That leaderlessness is itself
  a candidate root one layer up (it elected a leader at 15:03:20 and 15:03:43 but then went
  unavailable). Fixing ledger participant-hold orphaning treats the binding symptom on
  `replica_operations-p1`; the `sql_transaction_participants-p1` leader instability is a
  sibling root worth a separate quest.

## Task 6 — honest uncertainty (what disk + logs cannot settle)

1. **Whether fix (1) or (2) is *sufficient* vs merely necessary.** Both are inferred from
   the flap mechanism; only a live A/B (2-pre/2-post) can show either actually drains the
   stuck ops rather than relocating the stall. Per `hotpath-failure-fix-needs-aggregate-
   live-validation.md`, a unit-green DT here is explicitly not trustworthy.
2. **Why `sql_transaction_participants-p1` loses its leader after 15:03:43.** The 124 "No
   leader available" are visible, but the cause of that partition's leader instability is not
   established from these greps — it may be its own durability-fitness flap (same class,
   different partition) or an election-churn issue. Not resolved here.
3. **Whether the orphaned participant hold is strictly required by the self-move op or an
   avoidable code path.** I confirmed the transactions are the op-IDs and that
   `beginTransaction` issues `BEGIN IMMEDIATE`, but I did not trace the full call chain that
   decides a self-referential ledger write must open a participant transaction on its own
   partition — that trace is needed before implementing fix (1).
4. **The exact interleaving of `declaredIndex` growth vs which op-step's transaction was
   open** at each divergence sample (e.g. `r8` declared 755 / durable 0) — inferable but not
   proven to the individual `setCommittedIndex` call from logs alone.

---

## One-line verdict

The post-`3717c518` residual on `replica_operations-p1` is **not** a recurrence of the
committed-entry freeze and **not** a stale-witness artifact: it is a genuine **orphaned 2PC
participant `BEGIN IMMEDIATE`** — the ledger's own self-move ops, un-completable because
`sql_transaction_participants-p1` has no leader — held the single connection ~60–72 s (×11),
freezing the durable watermark and correctly tripping the durability detector into a
leadership flap (5 replicas), which recovers within 1 ms of each 60 s rollback. Fix locus =
the self-referential ledger participant-hold path / its 60 s legal window
(`partition-service-transaction-base.js:509`, `PREPARED_HOLD_TIMEOUT_MS`), **not** the raft
guard, the witness, or connection re-open. Validate live, not by unit DT.
