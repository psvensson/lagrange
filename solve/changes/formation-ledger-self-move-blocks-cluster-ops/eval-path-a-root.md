# Eval — FIX PATH A ("root: make the stranded participant session commit within budget")

Adversarial feasibility/risk evaluation. No src changed. All claims file:line-cited.
Repo `/media/.../projects/something`, against `formation-ledger-self-move-blocks-cluster-ops`.

## Headline verdict

**NO-GO as literally framed; the tractable residual is a coordinator-side hardening
entangled in a circular dependency. Recommend PATH B as primary.**
Confidence ~0.8. Risk HIGH, effort HIGH, tractability LOW.

The premise "make the session COMMIT/close within its legal budget *on the leader* so
no demotion ever fires" is **structurally impossible at the participant seam** — proven
by code that already shipped: on a raft leader the ONLY raft-safe heal of an orphaned
ACTIVE hold is demotion-then-rollback. The demotion is not a bug to be avoided; it is
the safe heal. Avoiding it means preventing the orphan **coordinator-side**, which during
cold formation is gated behind the very interlock/quorum-concentration this quest must
not narrow (formation-vs-steady-state circular dependency).

### Decisive context the research pre-dates

Two companion quests already **SOLVED** the run-23 transaction-lifecycle root (both
`questStatus: solved`, 2026-07-05, ~10:15 and ~11:12):

- `formation-ledger-leader-local-persistence-wedge` — leader-durability-fitness demotion
  (the demotion path this cycle rides).
- `ledger-participant-transaction-zombie-lifecycle` — bounded ACTIVE-hold sweep +
  role-gated heal + the three enabling-defect guards.

Fix Path A **is** the zombie-lifecycle quest's territory, and its core is already
implemented and DT-proven (dt6-zombie-transaction-lifecycle 22/22, dt:prove red-on-revert
across 8 src files). So Path A is not greenfield — it is "do more of an already-shipped,
highest-blast-radius fix." The guards are live in the tree today (verified below).

---

## 1. What strands the session (file:line)

The ledger transition write is an **explicit distributed 2PC transaction**, not an
autocommit write. Lifecycle:

- Coordinator = the rebalancer **workflow owner** using `DistributedTransactionCoordinator`.
  `enlistParticipants` calls `beginParticipant(sessionId, partitionId, epoch)` per new
  partition — `distributed-transaction-coordinator.js:258` (enlist gated on an explicit
  txState: `sql-query-engine-write-execution.js:56,61`; autocommit single writes do NOT
  enlist, so the zombie is NOT from the autocommit path).
- Participant = the ledger partition leader. The BEGIN is delivered as a
  `BEGIN_TRANSACTION` message → `handleTransactionMessage` →
  `partition-service-entry-apply-base.js:177` → `beginTransaction`
  (`partition-service-transaction-base.js:509`) which runs `db.exec(BEGIN IMMEDIATE)`
  **locally on the leader's single better-sqlite3 connection** and registers in
  `activeTransactions` (`:518`). **The BEGIN is NOT raft-replicated** — only PREPARE
  replicates (`replicatePreparedTransaction`, `:577`). So an ACTIVE (never-PREPARED)
  session lives ONLY in the leader's in-memory sqlite transaction.

**The strand (run-23 signature, both quest statements + `dt6-ledger-leader-durability-fitness.test.js:13-24`):**
the coordinator marks the transaction COMMITTED **against an EMPTY participant set** and
never sends PREPARE/COMMIT/ROLLBACK to this participant. Two enabling defects produced the
empty set:
- `executeParticipantStage` silently skips missing participants
  (`durable-workflow-coordinator.js:409-413`).
- `recoverFromSystemTables` (fired from every-query recovery) unconditionally REPLACED the
  **live in-memory transaction** with a cache-derived copy whose participants Map was
  rebuilt from **CDC-lagging** rows (`distributed-transaction-recovery.js:431-496`).

So the classification is (a)+(b): a coordinator whose in-memory participant registry was
lost/replaced (by its own recovery path) then "finalized" without touching the enlisted
ledger participant. Candidate (c) (a legitimately-short local write) is refuted — it is a
2PC participant of a foreign coordinator.

**Status of that root:** FIXED. All three guards are present in the tree today:
- empty-set-commit guard: monotonic `enlistedParticipantCount`
  (`durable-workflow-coordinator.js:245-248`).
- recovery-clobber guard: `restoredWorkflowIds` skip-LIVE gating
  (`distributed-transaction-recovery.js:503-519`).
- sessionless-absorption removed: `resolveActiveTransactionSessionId` no longer adopts a
  foreign session, only the explicit DEFAULT (`partition-service-transaction-session-methods.js:26-37`).

**Therefore any residual orphan in run-5 is a *different or CDC-lag variant* of the same
coordinator-finalization gap** (e.g., recovery reads of the authoritative
SQL_TRANSACTIONS / SQL_TRANSACTION_PARTICIPANTS rows failing/lagging during formation so
the new owner cannot finalize), **or run-5 ran a stale binary** (fix landed 11:12; run-5
demo is ~21:00 — plausibly post-fix, but not confirmed here). This uncertainty is
material: if run-5 predates the fix in the running image, the Path-A residual may not
exist at all.

## 2. Is there a SAFE close within budget? — NO (at the leader seam)

The orphaned ACTIVE session itself mints **zero** raft entries (BEGIN is local-only,
§1). But it is **not empty in effect**. The raft log store, `committedIndex` watermark,
and applied rows all share the **one** better-sqlite3 connection, so **every later
raft-applied write joins the open zombie transaction**: in-memory success, same-connection
read consistency, correct index-minting and replication (followers durably commit them),
**ZERO durability on the leader** until COMMIT (`dt6-ledger-leader-durability-fitness.test.js:18-24`;
comment `partition-service-transaction-base.js:292-294`). Consequently:

- **Bare ROLLBACK on the leader** evaporates those later acked/committed writes → followers
  truncate committed entries → **raft safety violation**. This is exactly why the heal is
  role-gated (`isStuckTransactionHealPermitted`, `partition-service-transaction-base.js:396-401`;
  deferral `:331-341`) and why the Z1 finding clears the apply-dedup set + committed-index
  cache after any *permitted* rollback (`:351-357`).
- **Bare COMMIT on the leader** would durably commit the zombie's own un-raft-agreed
  buffered writes → divergence from followers.

So the "targeted safe-close (COMMIT of nothing / provably-untouched ROLLBACK)" hypothesized
in the brief **does not exist on a leader**: the connection is shared, later acked writes
are hostage, and there is no per-statement isolation to prove "touched no acked index."
The only raft-safe leader-side heal is **demotion → rollback as a follower** (crash-
equivalent). That demotion IS the limit-cycle driver. The solo-group carve-out
(`:329-330`, `isSoloReplicaGroup`) is the sole exception and does not apply to a 5-node
formation.

**This is the fatal structural finding for Path A.**

## 3. The correct root-fix location

- **Participant-side (b)** — bounded ACTIVE self-abort — is **already shipped**
  (`collectExpiredActiveSessions:295`, `enforcePreparedStateHoldTimeouts:317-386`, role gate
  `:396`). On a leader it cannot self-abort safely, so by design it **defers to demotion**.
  It cannot be pushed further without re-introducing the §2 hazard.
- **Coordinator-side (a)** — the coordinator always finalizes (commit/abort) its ledger
  participant within budget across its own workflow-owner leadership change/failure — is
  the **true root**, and the mechanism EXISTS and is wired:
  `recoverTransitionExecutionSession` → `loadAuthoritativeTransitionExecutionSession` →
  `recoverFromSystemTables` (`operation-workflow-transition-orchestration.js:64-144`), plus
  a 1s recovery sweep (`RECOVERY_SWEEP_DEFAULT_INTERVAL_MS = 1000`,
  `distributed-transaction-coordinator-constants.js:46`; started at
  `sql-query-engine-lifecycle-and-callback-dispatch.js:114-115`). The run-23 clobber/empty-set
  defects on this path are already guarded (§1).

**Tractability:** the residual coordinator-side path reads authoritative
SQL_TRANSACTIONS / SQL_TRANSACTION_PARTICIPANTS rows
(`operation-workflow-transition-orchestration.js:75-136`). During **cold formation** those
control-plane partitions are CDC-lagged and gated behind the same
`operation_ledger_self_move_in_flight` / `quorum_concentrated` interlock this quest is
forbidden to narrow (`rebalance-coordinator-ledger-interlock-admission.js:195-222,315-338`;
quest statement). So "always finalize within one leadership epoch during formation" is a
**formation-vs-steady-state circular dependency** (memory:
`circular-dependency-class-formation-vs-steady-state`). Root identified; **not cleanly
tractable within budget during formation.**

## 4. Risk — HIGH

Single highest-blast-radius seam in the system (run-23 class). Hazards a Path-A change here
would have to keep clear of:
- Re-minting acked indices / follower truncation from any leader/candidate bare-ROLLBACK
  (`partition-service-transaction-base.js:326-330`, role gate `:396`; Z1 `:351-357`).
- Durably committing un-raft-agreed local writes from any leader bare-COMMIT (§2).
- The apply-dedup set + committed-index cache surviving a swept rollback and clamping the
  durable watermark forever unless cleared (Z1, `:356-357`).
- Candidate-unsafe window (Z2): a CANDIDATE's solicited votes reference the phantom
  in-memory head — the gate must block LEADER **and** CANDIDATE, solo-carve-out only.

Invariants that MUST be preserved: (i) a leader/candidate never bare-rollbacks or
bare-commits the shared-connection transaction; (ii) later acked writes absorbed into an
open tx are never destroyed; (iii) post-heal re-apply dedup + committed-index cache are
re-anchored; (iv) run-20/22 interlock serialization and the c7a3bf19 ghost re-verify are
untouched. Probability that further work AT THIS SEAM introduces a safety regression:
**HIGH.** Probability that a purely coordinator-side finalize-hardening regresses safety:
LOWER, but its formation-window efficacy is doubtful (§3 circularity).

## 5. DT substrate

- `test/convergence/dt6-ledger-leader-durability-fitness.test.js` — drives the REAL
  `PartitionService.beginTransaction` on file-backed sqlite, abandons the tx, virtual clock
  past the 60s `LEADER_DURABILITY_LEGAL_HOLD_MS` + 3× 1s strikes; asserts durability-unfit +
  LOUD hook + candidacy-deferral re-assertion (`:66-169`). It **proves the demotion; it does
  not prevent it.**
- `test/convergence/dt6-rebalancer-formation-self-move-interlock.test.js` — real
  `RebalanceCoordinator` + interlock + `setLeader`; asserts every move completes, self-move
  never co-admits with siblings, `completions == moves + 1` (`:412-525`).

**Binding observable a Path-A fix must move:** NO durability-fitness demotion fires for an
orphaned-but-empty ACTIVE session during a self-move — i.e. the coordinator finalizes the
participant before the ACTIVE hold reaches 60s, so the leader never 3-strikes — and
consequently the spread converges in a **single leadership epoch with no opposing
move-type reversal** (add-after-replace / remove-after-add). **No existing DT asserts
"coordinator finalizes across a workflow-owner move within budget during formation"** —
that would be NEW substrate, and building a faithful formation-churn repro of it is itself
significant effort.

---

## Ratings & recommendation

| Axis | Rating |
| --- | --- |
| Feasibility of the literal premise (leader-side in-budget close) | **Impossible** (§2, proven by shipped role gate) |
| Feasibility of the tractable root (coordinator-side finalize during formation) | **Low** (§3 circular dependency) |
| Risk | **HIGH** (§4, run-23 seam) |
| Effort | **HIGH** (deepest seam + new DT substrate) |
| Already shipped? | Core of Path A **yes** (both companion quests SOLVED); residual only |

**Verdict: NO-GO on Path A as the primary lever for THIS quest.** The safe leader-side heal
*is* the demotion; you cannot both keep raft safety and stop the demotion at the participant
seam. The only honest Path-A work left is a NARROW coordinator-side finalize-hardening,
and only *after* a specific residual orphaning path is isolated with a red-on-revert repro
(and after confirming run-5 actually ran the post-11:12 binary — if not, there may be no
residual and no Path-A work at all).

**Recommend PATH B as primary** (leadership-gain re-plan hysteresis gated on recent
same-partition self-move, `unified-rebalancer-lifecycle-base.js:475-483`): it damps the
A→B→A oscillation without touching the run-23 transaction seam, carries MODERATE (not HIGH)
risk, and matches the epic's intended anti-flap tool. Path A stays a defense-in-depth
follow-up contingent on isolating a concrete post-fix orphan path.
