---
audience: evidence
recorded: 2026-11-18
---

# Row-level participant concurrency: deterministic admission at PREPARE apply (design and Quest proposal, 2026-11-18, rev. 0)

**Owner decision being implemented (2026-11-18):**
> "Finish row-level participant concurrency properly: a sealed Quest making row-level admission deterministic for BEGIN and PREPARE (both commit when rows are disjoint; a real conflict gets 40001), removing the 30 s settle wait and the unchecked claim drop."

**Inputs:**
- Code: the read-only worktree `/mnt/data/peter/projects/lagrange-gcp-takeover-20261117` at `19a2134c5` (branch `claude/gcp-takeover-20261117`). Every `path:line` is at that HEAD unless marked otherwise. Paths are relative to the worktree root.
- Fix M: `62adbe36b` on `claude/fix-m-batch2-20261117`. It is **not** in `19a2134c5`. It restores the first-PREPARE `CUTOVER_PAUSED` refusal at `62adbe36b:src/partition/partition-participant-transaction-request.js:405-408`.
- Main for comparison: `fc626cbf3`.
- The release-fencing contract:
  - `108282c80`, `solve/quests/seed-control-current-proof-amortization/evidence/native-owner-contract-20261015/OWNER-CONTRACT.md`, rule 5 (lines 86-89);
  - `fb3c09d4a`, `.../release-decision-closeout-20261015/DECISIONS.md`.
- The accepted TX1 contract: `solve/quests/replicated-transaction-decision-and-apply/design-leg-a-v10-2026-10-10.md`, sections 3.1-3.6.
- Memory, all BINDING:
  - `distributed-transaction-design-gate-directive.md`, Invariant 0;
  - `distributed-transaction-replicated-apply-directive.md`, R1-R9;
  - `transactional-writes-not-replicated-2026-09-26.md`;
  - `systemic-not-local-fixes.md`;
  - `no-legacy-one-version-of-logic.md`;
  - `committed-read-owner-decisions-o1-o2-o4-2026-09-26.md`.
- Probes that I ran read-only, niced, in the session scratchpad. The commands and outputs are in §1.12. The scripts are:
  - `probe-interleavings.mjs`;
  - `probe-claim-drop.mjs`;
  - `probe-write-skew.mjs`;
  - `probe-cross-reservation.mjs`.

  They are in `/tmp/claude-1000/-mnt-data-peter-projects-lagrange/9c1d1357-e0ff-45b9-900a-54a2055bdf9c/scratchpad/rowlevel/`. They import the worktree's own fixture (`test/test-helpers/participant-transaction-fixture.js`) and the production modules. They modify nothing.
- Primary sources on CockroachDB, TiKV/Percolator, TiDB and PostgreSQL (§2.9, §7).

**Labels:**
- **C** = CONFIRMED: I read the cited lines, or the probe output shows it.
- **P** = PLAUSIBLE: inferred and not executed.

Nothing here is built. The document proposes a Quest; it seals nothing.

---

## 0. Summary

**What the candidate does (C).** The ROW_KEY mode decides row-level admission in **leader-volatile memory** and **bypasses the replicated apply**:
- `sealSession` rebases the BEGIN-time write generation to the current one whenever the leader's private history says the rows are disjoint (`partition-participant-transaction-request.js:357-362`). The PREPARE therefore carries a hash of the *current* `g`, and the apply's partition-granular first-committer-wins (FCW) check passes by construction (`partition-participant-transaction-apply.js:324-327`).
- Everything else still serializes partition-wide:
  - the PREPARED reservation (`apply.js:319-323`, `entry-apply-base.js:684-687`);
  - the BEGIN refusal (`request.js:310-315`, `session.js:117-130`);
  - the leader's PREPARE precheck (`request.js:395-398`).

**What the probes show (C).**
- **Interleaving decides the outcome.** Two transactions on disjoint rows:
  - both commit when BEGIN₂ precedes PREPARE₁;
  - B is refused `already_active` (→ 40001) when BEGIN₂ follows PREPARE₁ or overlaps it in flight;
  - the transaction is refused `conflict` (→ 40001) when an autocommit write to a third, disjoint row lands between its BEGIN and PREPARE;
  - B is refused `conflict` when the other transaction's PREPARE was sealed by a different leader.
- **Write skew.** The candidate commits a write-skew pair inside ONE partition. The accepted TX1 rule refuses that pair, so the candidate silently weakens the promised per-partition serializability (TX1 rev. 10 §3.2: "each partition is optimistically serializable").
- **Lost update.** The unchecked claim drop produces a lost update at the participant boundary.
- **Two-partition hang.** Two disjoint two-partition transactions whose PREPAREs interleave crosswise each meet the other's partition reservation. Each gets `participant_transaction_reserved` with `deferRetry`. The coordinator retries that until the 60 s budget expires, so the wait cycle is broken only by the budget.

**The design.**
1. **One deciding point.** The decision moves to **one deterministic point: the `PARTICIPANT_PREPARE` apply on every replica.** BEGIN and statements are never refused because another transaction exists.
2. **Footprint.** The leader builds a canonical **footprint** of each transaction:
   - row keys **written** and **read**;
   - plus two "unscoped" flags for statements whose rows cannot be named.

   The footprint and the **integer** BEGIN base travel inside the PREPARE bytes. The apply never parses SQL.
3. **Conflict predicate.** The apply refuses `conflict` (→ SQLSTATE 40001) if either holds:
   - a footprint key has a committed version newer than the base;
   - the footprint overlaps the footprint of another PREPARED row.

   It never waits, so no timers, queues or deadlock detection exist.
4. **Durable or derivable state.**
   - **Intents** are *derived* from PREPARED rows; the footprint is a new column.
   - **Committed versions** live in a bounded replicated table, written by every committed write in the same application transaction as `g` and the applied index.
5. **Recovery.** Recovery and leader change are deterministic because no admission input is volatile.
6. **Ordered PREPARE.** Multi-participant transactions PREPARE in sorted participant order and stop at the first definitive refusal. This makes an overlapping pair end with *exactly one* commit, never both aborted.
7. **What stays.** The release fence (rule 5, fix M) and the topology fence are untouched.
8. **What goes:**
   - the PARTITION/ROW_KEY dual granularity;
   - the volatile row-key maps;
   - the settle wait;
   - the leader rebase;
   - the `already_active` code;
   - the string-matching conflict projections.

---

## 1. Census of today's participant admission (candidate `19a2134c5`)

### 1.1 Lineage of the ROW_KEY mode (C, `git log -S`)

| Commit | Date | What it did |
| --- | --- | --- |
| `1b052783c` | 2026-10-30 | Quest `scenario-a-transaction-coordination-fast-path`, priority (3): "opt-in row-key-disjoint concurrent staging sessions". Adds `canAdmitConcurrentParticipantSession`. |
| `d8def3d0c` | 2026-10-31 | Quest `scenario-a-deep-stack-throughput-and-latency`. Adds `canAdvanceRowKeySessionGeneration`, the leader rebase. |
| `f7e06609d` | 2026-11-16 04:33 | Makes ROW_KEY the cluster default when `bootstrapReadinessState` is present. Adds the settle wait (`DEFAULT_CONFLICT_SETTLE_WAIT_MS = 5000`) and the waiter-claim clear. Unreviewed. |
| `5f84f0eff` | 2026-11-16 08:13 | WIP, `[skip ci]`. Raises the wait to 30000. Adds the canonical AST footprint contract (`partition-write-footprint-contract.js`). Unreviewed. |
| `11bdbc115` | 2026-11-16 | Extracts `releaseEmptyWaiterSessionClaims`. |
| `ff4318b24` | 2026-11-17 | Fix B: the three factories set `concurrencyGranularity: ROW_KEY` *after* `...options` (factory-owned). |
| `fc626cbf3` (main) | n/a | The code exists, but no factory sets it. Production runs PARTITION: one non-terminal participant transaction per partition. |

The TX1 contract never admitted this mode. Rev. 10 §3.1 says "Leg A admits one non-terminal transaction per partition". §3.6 says "Finer granularity is a measured future choice". The scenario-A quests added it without a constraint that preserved TX1's isolation (C: `solve/quests/scenario-a-transaction-coordination-fast-path/quest.json`, constraints).

### 1.2 BEGIN (C)

- **Route.** `routeParticipantTransactionRequest` (`request.js:608-614`) → `beginParticipantSession` (`:295-326`).
- **Refusals that are partition state (all fine to keep):**
  - coordinator-table refusal (`:296-297`);
  - leadership (`:263-266`);
  - `CUTOVER_PAUSED` (`:267-269`);
  - `GENERATION_ORIGIN_PENDING` (`:270-274`);
  - `DETERMINISM_SELF_CHECK_FAILED` (`:275-277`);
  - `REMOVAL_FENCED` (`:278-279`);
  - topology transition (`:251-257`, `partition-participant-transaction-topology-fence.js`).
- **Refusal for another transaction's presence:** `:310-315`:
  - `participantTransactionActive(service) && !canAdmitConcurrentParticipantSession(service)` → `ALREADY_ACTIVE`.
  - `participantTransactionActive` is "any session, or any PREPARED row" (`session.js:616-618`).
  - `canAdmitConcurrentParticipantSession` requires all of (`session.js:126-130`):
    - ROW_KEY;
    - no PREPARED row;
    - no session PREPARING or in flight.

  So under ROW_KEY, BEGIN is refused while *any* other transaction on the partition is PREPARING or PREPARED.
- **Session state.** The volatile session (`session.js:569-589`) holds:
  - `generationBase` = `readPartitionWriteGeneration`, an integer read at BEGIN (`request.js:318-321`);
  - `touchedRowKeys`;
  - `hasUnscopedWrite`.

  It lives on the leader only. No replicated BEGIN exists, as release rule 5 requires.

### 1.3 Statement staging (C)

- **Route.** `handleRemoteQuery` (`partition-service-remote-query-methods.js:321-372`) → `answerParticipantSessionQuery` (`request.js:684-698`) → `sessionStatementAnswer` (`:618-642`) → `runParticipantSessionStatement` (`staging.js:373-378`).
- **Writes** go through `stageWrite` (`staging.js:265-309`):
  1. admission (`:266-269`);
  2. JSON-scalar params (`:270-272`);
  3. **row-key check and record** (`:273-276`, via `session.js:346-368`). It derives the footprint with `extractStatementWriteFootprint` from the SQL text and the leader's memoized PRAGMA PK metadata (`session.js:84-101`; the memo is never invalidated). A key held by another session or another PREPARED entry is refused `ALREADY_ACTIVE` with `detail: rowKey`. An unscoped statement conflicts with any other session that has a footprint (`session.js:152-168`);
  4. the classifier (`:277-282`);
  5. bounds of 256 operations and 1 MiB (`:288-292`; `constants.js:157-158`);
  6. the c' validation in one synchronous `db.transaction` that always rolls back: a full replay, or the "disjoint direct" shortcut (`:186-219`, `:293-299`).

  A replay that no longer runs dooms the session with `REPLAY_DIVERGED` (`:223-232`).
- **Reads** go through `readInSession` (`staging.js:324-356`). **No read footprint is recorded.** Only writes call `checkAndRecordSessionRowKey`. This is the root of the write skew in §1.12.
- **Sealed sessions.** A PREPARING session refuses writes with `PREPARING` (`request.js:636-639`). That is the transaction's own state, and correct.
- **The settle wait.** If the participant answer is `ALREADY_ACTIVE` with a string `detail`, `handleRemoteQuery` awaits `waitForConflictingRowKeyHolderToSettle` (`remote-query-methods.js:349-358`) and then **returns the same refusal anyway** (§1.10).

### 1.4 PREPARE: leader seal and apply (C)

**Leader** (`prepareParticipant`, `request.js:410-434`; `prepareSession` `:387-408`):
- **Refusals:**
  - a pending outcome is joined (`:415-419`);
  - a durable row ends the session (`:420-431`);
  - `RESERVED` with `deferRetry` while **any** PREPARED row exists (`:395-398`);
  - topology, for unsealed sessions only (`:401-404`);
  - with fix M, `CUTOVER_PAUSED` for an unsealed first PREPARE (`62adbe36b:...request.js:405-408`).
- **`sealSession`** (`:356-385`):
  - **Rebase:** if `g` moved and `canAdvanceRowKeySessionGeneration` holds, `session.generationBase := g` (`:357-362`). The check runs over leader-volatile history (`session.js:515-556`):
    - every intermediate generation is in `SCOPED_COMMIT_GENERATIONS`;
    - no touched key appears in `COMMITTED_ROW_KEY_GENERATIONS` above the base, or among the leader's `PREPARED_PARTICIPANT_ROW_KEYS`.
  - Otherwise the session is ended and refused `PREPARE_REFUSED`/`CONFLICT` (`:363-367`).
  - The command is then built (`:368-371`) with `validationText = [["partition", partitionId, sha256("generation:"+base), originIndex]]` (`partition-participant-transaction-bytes.js:54-57`). It carries a **hash** of the base, not the integer.
  - `stagePreparedParticipantRowKeys` copies the session's keys into leader memory **before** anything is proposed (`:376-381`).
- **`proposeSealedPrepare`** (`:339-354`). This goes through `startPartitionRaftWriteCommit` under the deterministic entryId `participantId:prepare` (`bytes.js:68-71`). A retryable or `RESERVED` answer keeps the sealed bytes (`:334-337`).

**Apply** (`applyParticipantPrepare`, `apply.js:300-341`, on every replica, inside the rs-raft application transaction). The checks run in this order:
1. identity;
2. existing row → idempotent replay or typed refusal (`:265-284`);
3. digest;
4. origin;
5. **reservation**: any PREPARED row → `RESERVED_REFUSED`, consumed, no row (`:319-323`);
6. **partition-granular FCW**: carried `validationText` ≠ hash of the current `g` → REFUSED `conflict` (`:324-327`);
7. dry run (`:328-331`);
8. CDC admission;
9. insert the PREPARED row (`:336-337`).

Because of the leader rebase, check 6 is decided by the leader: a rebased PREPARE always carries `hash(current g)`.

### 1.5 COMMIT and ROLLBACK (C)

- **Leader** (`decideParticipant`, `request.js:509-539`):
  - binding checks;
  - joins a pending decision;
  - refuses a COMMIT with `PREPARING` + `deferRetry` while its own PREPARE is in flight (`:525-527`);
  - proposes `PARTICIPANT_DECISION` under `participantId:decision:digest`.
- **Unbound ROLLBACK** (`:543-565`) only discards volatile staging. It refuses while PREPARING.
- **COMMIT apply** (`commitPrepared`, `apply.js:429-466`):
  - re-checks `validationText` against the current `g` (`:430-433`, `COMMIT_BASE_MOVED` alarm). That is safe today **only** because the partition reservation lets nothing move `g` between PREPARE and COMMIT;
  - runs the operations;
  - writes COMMITTED;
  - advances `g` once (`:449-451`);
  - after commit, calls `recordCommittedParticipantRowKeys` (`:452-456`). That call records keys only if *this* replica's volatile `PREPARED_PARTICIPANT_ROW_KEYS` has the entry, which is only the sealing leader;
  - re-admits parked writes (`:394-396`).
- **ROLLBACK and REFUSED** clear the volatile entry after commit (`:477-478`, `:400-401`, `:536-537`, `:247-248`).

### 1.6 Release fencing and topology (C)

- **Release fence state** (`partition-participant-transaction-pause.js:190-216`) is per service and volatile. It starts CLOSED. It is OPEN only after `resumeParticipantCutoverAdmission` with a proof bound to term, leader, configuration and generations (`:253-283`). It is re-closed when that proof no longer matches (`:226-233`).
- **Consumers:**
  - BEGIN (`request.js:267-269`);
  - first PREPARE (fix M, `62adbe36b:...request.js:405-408`);
  - ordinary writes (`pausedWriteAnswerOf`, `pause.js:285-291`; `raft-write-commit.js:447-452`).
- **The contract:**
  - OWNER-CONTRACT rule 5: "For ordinary work and first PREPARE, a local session is not an obligation … Settling an existing participant is a different path … not an exemption based on volatile staging".
  - DECISIONS.md: "No replicated BEGIN", and "Local staging is lost with its leader; it grants no durable permission".
- **Release census drain** (`partition-participant-release-contract.js:117-118`) requires all of:
  - `sqliteTransactionOpen === false`;
  - `participantStaging === false`;
  - `participantPrepared === 0`;
  - no proposals and no pending outcomes.
- **Topology:** BEGIN and a new PREPARE consult split/merge handles and transition rows (`topology-fence.js`). An unreadable owner refuses `TOPOLOGY_UNAVAILABLE`.

### 1.7 Recovery, replay and leader change (C unless marked)

- **Leader loss:**
  - `releasePendingWrites` → `discardParticipantSessions` (`partition-service-raft-lifecycle-wiring.js:44-50`);
  - this **clears** `SCOPED_COMMIT_GENERATIONS` and `COMMITTED_ROW_KEY_GENERATIONS` (`session.js:629-645`);
  - it reconciles `PREPARED_PARTICIPANT_ROW_KEYS` only by *deleting* entries that have no durable PREPARED row (`:558-567`). It **never repopulates** keys for PREPARED rows that another leader sealed.
- **Effect.** A new or re-elected leader:
  - cannot rebase any session (`areIntermediateGenerationsScoped` is false);
  - does not know the row keys of PREPARED rows sealed elsewhere.

  Outcomes therefore depend on which process sealed what. Probe S5 shows this.
- **Replay.** A PREPARE or decision re-proposed under the same entryId:
  - joins the pending outcome on the leader (`request.js:415-419`, `:519-523`);
  - at apply, is answered from the row (`apply.js:265-284`, `:506-525`).
- **Coordinator recovery** (`distributed-transaction-recovery.js`) follows the insert-once decision record. Sweep cadence: 1000 ms, deferring from 1000 ms up to 30000 ms (`distributed-transaction-coordinator-constants.js:51-53`).
- **Durable state** is the row in `_participant_transactions`, plus `_partition_write_generation` (one row: `g`, origin). Both are written only by apply, atomically with the applied index (`store.js:1-10`; `apply.js:7-11`).
- **Hold sweep.** A 1 s interval (`cadence-methods.js:77-97`; `partition-service-constants.js:52`) discards sessions older than 60 s on any role (`session.js:650-672`; `timeout-budget.js:23`). It skips a session that holds locking-read reservations. It only *reports* PREPARED rows (`:676-697`).

### 1.8 Row-key claims: where taken, released, persisted, replicated

| Claim | Taken | Released | Persisted? | Replicated? |
| --- | --- | --- | --- | --- |
| Session write keys `touchedRowKeys` and `hasUnscopedWrite` (`session.js:574-575`) | `stageWrite` → `checkAndRecordSessionRowKey` (`staging.js:273`; `session.js:274-325`) | revert on statement failure (`staging.js:280,289,297`; `session.js:327-344`); **`releaseEmptyWaiterSessionClaims` clears all of a waiter's keys whatever it has staged** (`session.js:209-219`, called at `:240`); end, discard or sweep of the session | no | no (leader memory, C) |
| Prepared keys `PREPARED_PARTICIPANT_ROW_KEYS` (`session.js:37`) | `sealSession`, **before the proposal** (`request.js:376-381`) | a failed PREPARE answer (`request.js:349`); apply refuse, COMMIT, ROLLBACK or tombstone in `afterCommit` (`apply.js:248,401,452,478,537`); reconcile on discard or sweep (`session.js:558-567`) | no | no; only the sealing leader has the entry, and followers' `afterCommit` calls are no-ops (C) |
| Committed key history `COMMITTED_ROW_KEY_GENERATIONS` and `SCOPED_COMMIT_GENERATIONS` (`session.js:36-38`) | `recordCommittedParticipantRowKeys` after COMMIT apply, sealing leader only (`apply.js:452-456`) | pruned below the minimum active base; capped at 1024 generations and 16384 keys (`session.js:41-42`, `:390-464`); cleared on leader loss (`:631-632`) | no | no. Autocommit writes never enter it, so any autocommit write blocks rebase (S4) |
| Durable partition reservation | the PREPARE apply inserts a PREPARED row | the decision apply moves the row out of PREPARED | yes (`_participant_transactions`) | yes, but **partition-wide**, not per row |
| Locking-read (`FOR UPDATE`) and `WRITE_STAGED` reservations (`partition-locking-read-reservation.js:33-36`) | **coordinator process**: `acquireRowReservation` (`:438-482`) from `sql-locking-read-execution.js:239-261` (FOR UPDATE) and `:575-660` (`WRITE_STAGED` after explicit-transaction writes) | `releaseTransactionReservations` from the decision protocol (`distributed-transaction-decision-protocol.js:116`), lifecycle (`sql-query-engine-lifecycle-and-callback-dispatch.js:249`), write execution (`sql-query-engine-write-execution.js:250`); **`Date.now()` expiry** (`:455-458`, `:686-691`) | an SQLite mirror `_lagrange_locking_read_reservations`, written **directly on the partition connection outside consensus**, only for FOR_UPDATE (`:474-476`), and only if this process hosts that partition DB (`:262-283`) | no (C). This is a second lock authority, keyed by `deriveRowLockKey` = `table:partition:tuple` (`:136-138`) |

### 1.9 Partition-wide states that still serialize (C)

| # | Where | Effect |
| --- | --- | --- |
| W1 | `request.js:310-315`; `session.js:117-130,616-618` | BEGIN is refused `ALREADY_ACTIVE` while any PREPARED row exists or any session is PREPARING or in flight |
| W2 | `request.js:395-398` | PREPARE is refused `RESERVED` with `deferRetry` while any PREPARED row exists, so the coordinator retries until its budget runs out |
| W3 | `apply.js:319-323` | at apply, a PREPARE is `RESERVED_REFUSED` while any PREPARED row exists |
| W4 | `entry-apply-base.js:684-687`; `raft-write-commit.js:453-455`; `apply.js:662-680` | every autocommit statement and DDL is parked or re-parked while any PREPARED row exists |
| W5 | `apply.js:324-327`, `:430-433` | partition-granular FCW on the hash of `g`: any committed application write since BEGIN refuses the PREPARE, unless the leader rebased (§1.4) |
| W6 | `session.js:152-168,307-325` | an unscoped statement conflicts with every other session that has any footprint |
| W7 | `partition-participant-release-contract.js:117-118` | the release census needs zero sessions and zero PREPARED rows (release-fence contract; out of scope, but see §5) |
| W8 | `partition-coordinator-settlement.js:69,86` | coordinator-table settlement checks the reservation. Participant transactions on coordinator tables are refused (`request.js:296`), so this is inert there (P) |

### 1.10 Every timer, settle wait and retry in this path

| # | Mechanism | Value | Where | Disposition in this design |
| --- | --- | --- | --- | --- |
| T1 | **Settle wait** on `ALREADY_ACTIVE` | up to 30000 ms (`DEFAULT_CONFLICT_SETTLE_WAIT_MS`; was 5000 in `f7e06609d`) | `session.js:40,221-262`; `remote-query-methods.js:349-358` | **Delete** (C: the wait ends in the same refusal; the timer at `:258-260` resolves the waiter, not the conflict; it is gated on `cdcIntegrationService` at `:228`, so unit fixtures without CDC never wait, a production/test split) |
| T2 | Coordinator DEFER/UNKNOWN retry under the budget | backoff 10→250 ms ×2ⁿ; DEFER retried until `TRANSACTION_BUDGET_MS` = 60000 | `distributed-transaction-protocol.js:244-255,464-513,564-573`; `coordinator-constants.js:37-41`; `timeout-budget.js:21` | **Unchanged mechanism.** It loses its transaction-vs-transaction trigger, because PREPARE is never `RESERVED`. Remaining DEFER triggers are partition states: `CUTOVER_PAUSED`, topology, removal fence, leadership |
| T3 | Bounded attempts for non-DEFER failures | `MAX_RETRIES` = 3 | same | unchanged |
| T4 | Statement-autocommit conflict reattempt | participant backoff, first attempt's deadline | `sql-query-engine-write-execution.js:546-589` (`isDefinitiveStatementConflict` `:79-89`) | unchanged. It now fires only on real overlap |
| T5 | Hold sweep | 1000 ms interval, 60000 ms session age | `cadence-methods.js:72-97`; `session.js:650-672` | unchanged (memory bound on volatile staging). It no longer releases any claim, because none exists before PREPARE |
| T6 | Parked autocommit writes | per-write commit deadline (`PENDING_REQUEST_TIMEOUT_MS`, 30 s per TX1 §3.5); woken by the decision's `afterCommit` | `raft-write-commit.js:453-455`; `apply.js:394-396` | the predicate becomes key-level (parked only on real overlap); the deadline is unchanged (write-kernel ack bound) |
| T7 | Locking-read reservation expiry | `Date.now()` + `holdTimeoutMs`; sweep `DELETE ... expires_at <= Date.now()` | `partition-locking-read-reservation.js:455-458,686-691` | out of scope; owner decision D6 |
| T8 | Release pause retry hint | `PAUSE_RETRY_AFTER_MS` = 100 | `cutover-constants.js:52`; `pause.js:285-291` | unchanged (release fence) |
| T9 | Coordinator recovery sweep | 1000 ms; defer 1000-30000 ms | `coordinator-constants.js:51-53` | unchanged |

### 1.11 Who consumes `ALREADY_ACTIVE` and the 40001 projection (C)

- **The code:** `PARTICIPANT_TRANSACTION_FAILURE_CODE.ALREADY_ACTIVE = 'participant_transaction_already_active'` (`constants.js:90`).
- **Producers:**
  - BEGIN (`request.js:314`);
  - staging (`staging.js:275`).
- **Consumers:**
  1. the settle-wait trigger (`remote-query-methods.js:351`);
  2. the coordinator wire. `dispositionOf` (`sql-query-engine-participant-wire.js:186-199`) gives `REFUSED`: definitive, never retried;
  3. **the projection to 40001**, which happens in three places:
     - `TX1_CONFLICT_FAILURE_CODES` (`transaction-participant-error-projection.js:13-18`): `ALREADY_ACTIVE`, `PREPARING`, `PREPARE_CONTENT_CONFLICT`, `REPLAY_DIVERGED`, plus `PREPARE_REFUSED`+`CONFLICT` (`:27-30`);
     - **string matching** on `"Transaction already active"`, `"Write-write conflict detected"` and similar (`:33-46`);
     - `projectTransactionParticipantFailure` rewrites to `errorCode: WRITE_CONFLICT` (`:48-75`).

     Callers of the projection:
     - `SqlCore` failure results (`sql-query-engine.js:677`);
     - `postgres-wire-adapter.js:75-88`, which sets `sqlState: '40001'`;
     - `pgwire-result-mapper.js:181-184,196-206`, which reuses `isPrepareWriteConflictFailure`.
  4. **a second conflict code.** `rolledBackCommitFailure` (`distributed-transaction-decision-protocol.js:84-95`) maps `refusalCause === CONFLICT` to `errorCode: TRANSACTION_CONFLICT`. `pgwire-result-mapper.js:153-156` maps both codes to 40001. One meaning, two codes, three projection sites, plus string matching. That is a no-legacy finding.
  5. the application facade copies the engine `errorCode` into `ApplicationDatabaseError.code` (`application-database.js:152-178`). The witness asserts `INTERNAL_ERROR` with the `already_active` message today.
- **Tests that encode the current behaviour:**
  - `test/integration/public-application-database-transaction-facade.integration.test.js:217-258`, the F-2PC witness;
  - `test/release/public-consumer-contract-ratchet.test.js:21-23,61-62`, which names the witness;
  - `test/transaction/session-transaction-isolation.test.js`;
  - `test/query/locking-read-execution-lifecycle.test.js`;
  - `test/partition/partition-participant-release-admission.test.js`;
  - the scenario-A tests and guards (`scripts/checks/scenario-a-transaction-coordination-fast-path-guard.js:432`, `scripts/checks/scenario-a-deep-stack-throughput-and-latency-guard.js:40,359,525`);
  - `test/distributed/harness/benchmark-capacity-heterogeneous-observation.js`;
  - `test/partition/partition-tx1-single-path-alpha.test.js`;
  - `test/partition/partition-participant-transaction-apply.test.js`;
  - `test/control-plane/read-model-contract.test.js`.

  This list comes from `git grep` on `concurrencyGranularity`, `isPartitionReserved`, `participantTransactionActive` and `row-key`.

### 1.12 Probe results on the candidate (C, executed)

**Setup.** Each probe:
- uses the production participant owners through the worktree's controllable-consensus fixture: `startLeader`, `applyCommitted`, `awaitProposal`;
- sets `leader.concurrencyGranularity = 'row-key'`, as the production factories do;
- schedules the steps explicitly, so the runs are deterministic.

**Command:** `LAGRANGE_LOG_LEVEL=error nice -n 15 node <script>`.

| Case | Interleaving (one partition unless noted) | Observed | Expected under the owner decision |
| --- | --- | --- | --- |
| S1 | disjoint rows; BEGIN₁, BEGIN₂, stage both, PREPARE/COMMIT₁, PREPARE/COMMIT₂ | both COMMITTED; rows `[1,1]` | both commit ✓ |
| S2 | disjoint; BEGIN₁, stage, PREPARE₁ applied, **then** BEGIN₂ | BEGIN₂ `participant_transaction_already_active` → projected `WRITE_CONFLICT` (40001); rows `[1,0]` | both commit ✗ |
| S3 | disjoint; BEGIN₂ while PREPARE₁ is proposed but not applied | BEGIN₂ `already_active` → 40001 | both commit ✗ |
| S4 | T₁ BEGIN, stage `a1`; autocommit `INSERT zz` committed; PREPARE₁ | `prepare_refused` / `conflict` → 40001; `a1` absent | commits ✗ |
| S5 | disjoint; T_b BEGIN and stage; T_a's PREPARE and COMMIT arrive **through the log** (sealed by a previous leader); PREPARE_b | `prepare_refused` / `conflict` → 40001 (the same rows commit in S1) | commits ✗: the outcome depends on leader history |
| S6 | overlapping key `k1`; T_b stages `k1` after T_a | T_b `already_active` (detail `k1`) → 40001; T_a COMMITTED; `k1` present once | exactly one ✓ (at this level) |
| CD | **claim drop**: B stages `UPDATE b0`; the waiter path (`handleRemoteQuery`, CDC present) clears B's claims `["b0"]` → `[]` while its op stays staged; C stages `UPDATE b0` and commits; B stages `UPDATE b2`, rebases, PREPARE+COMMIT | C COMMITTED, B COMMITTED, final `b0 = 'B'`: **lost update** at the participant boundary | B refused 40001 ✗ |
| WS | **write skew**: A reads `x`, writes `y`; B reads `y`, writes `x`; both seeded `on` | PARTITION: B refused at BEGIN, no skew. ROW_KEY: **both COMMITTED**, `x = y = off` | exactly one commits; the other 40001 ✗ |
| XR | two partitions P1, P2; T1 = {P1:a1, P2:a2}, T2 = {P1:b1, P2:b2}; PREPARE order T1@P1, T2@P2, T1@P2, T2@P1 | both late PREPAREs: `participant_transaction_reserved`, `deferRetry: true`. The coordinator retries DEFER until the 60 s budget (`protocol.js:244-255`) and fans PREPARE out concurrently (`protocol.js:432-438`), so the wait-for cycle breaks only by budget (P for the full coordinator run; C at the participant) | both commit ✗ |

**Raw output** (abridged): `S2 … "beginB":{"success":false,"failureCode":"participant_transaction_already_active"…},"beginBProjected":"WRITE_CONFLICT","rows":[1,0]`; `CD … "before":{"ops":1,"claims":["b0"]},"during":{"ops":1,"claims":[],"settled":false} … "finalB0":"B","lostUpdate":true`; `WS row-key … "A":"COMMITTED","B":"COMMITTED","rows":[{"id":"x","value":"off"},{"id":"y","value":"off"}],"writeSkew":true`; `XR … "T1@P2":{"success":false,"state":"ACTIVE","failureCode":"participant_transaction_reserved","deferRetry":true},"T2@P1":{…same…}`.

**Public reachability of CD (P).** The facade dooms a transaction on any statement failure (`architecture/application-database-sessions.md:120`). pgwire fences the block with 25P02. A public client therefore cannot continue B after the refused statement. The participant contract is still fail-open, and any caller that keeps a session after a refused statement reaches it.

**The F-2PC witness.** Per fix M's commit message and the brief: 7 failing assertions on the candidate, 2 under PARTITION (the 40001 projection changed the loser's code). The S1/S2 split accounts for "both commit sometimes". XR is a plausible cause of slow or both-rejected runs: the facade's two tables are two partitions.

### 1.13 Defect classes (systemic view)

| Id | Class | Evidence | Why it is not local |
| --- | --- | --- | --- |
| DC-1 | The admission decision is made in leader-volatile state; the replicated apply is bypassed | §1.4 rebase; S5 | Three volatile maps stand in for state the apply needs. The fix moves the authority, not a check |
| DC-2 | Interleaving-dependent admission | S2, S3, S4 | It comes from the partition-wide states W1-W5, not from one comparison |
| DC-3 | Silent isolation weakening (write-key-only claims) | WS; TX1 §3.2 | A contract change hidden as an optimization; reads were never in the footprint |
| DC-4 | Fail-open claim lifecycle | CD; `session.js:209-219` | Claims can be dropped without checking their operations |
| DC-5 | A spent wait that hides a conflict or a deadlock | T1; XR | Two waits: the 30 s settle and the 60 s DEFER budget |
| DC-6 | Duplicate authorities | the PARTITION/ROW_KEY dual mode (`constants.js:403-418`; three factories); the coordinator lock table (§1.8 last row); two conflict codes plus string matching (§1.11) | no-legacy directive |
| DC-7 | A stale contract document | `architecture/postgres-locking-reads.md:7-8` and `docs/benchmarks/tidb-reference-paired-owner.md:22-23` still promise "epoch-based snapshot isolation"; TX1 §3.4 listed the first for change | consumers read the wrong promise |

---

## 2. The design

### 2.1 The promised isolation (stated from the accepted contract)

**Today's contract (C):**
- TX1 rev. 10 §3.1 and §3.2: "reads in a session see committed state plus the session's own staged operations (c' replay); a transaction commits only if no committed write was applied to its partition between its BEGIN and its PREPARE apply"; and "each partition is optimistically serializable". §3.4 explicitly supersedes "epoch-based snapshot isolation".
- The current docs agree: `architecture/postgres-wire.md:349-355` ("partition-granular first-committer-wins rather than epoch visibility or row MVCC"), `process-replication.md:357-362`, `runtime-components.md:233-234`.
- Scope: reads on partitions where the transaction holds no session (`VOLATILE_READ` enlistment, `distributed-transaction-statement.js:112`, `sql-query-engine-select-execution.js:70-74`) are not participant-validated. The promise is **per partition**, not global.
- Transaction modes other than plain `BEGIN [READ WRITE]` are refused with 0A000 (`docs/current-capabilities-and-limitations.md:194`).

**Promise after this Quest** (the same strength at finer grain; owner decision D1):
> A session sees committed state plus its own staged operations. A transaction's participant on a partition commits only if no other transaction committed, or holds PREPARED, a write to any row in its **read or write footprint** after its BEGIN base. An unscoped footprint stands for every row of the partition. Each partition stays optimistically serializable. Conflicts are refused, never waited on, and surface as SQLSTATE 40001.

This is backward-validated optimistic concurrency, in the Kung-Robinson style. A PREPARED participant's footprint is held as an intent until its decision applies:
- write keys are held exclusively;
- read keys are held shared.

Because operations are SQL that is re-executed at COMMIT apply, a write key is also treated as read: an `UPDATE … SET v = v + 1` or an `INSERT`'s existence check depends on the row's prior state.

### 2.2 The footprint (one canonical record, built by the leader, carried in bytes)

**Owner:** `src/partition/partition-write-footprint-contract.js`. It is extended; there is no second extractor.

**Record** `TransactionFootprint`: a frozen, strictly validated object with these fields:
- `writeKeys`, `readKeys`: sorted, de-duplicated arrays of canonical PK tuple keys from `encodeCanonicalPkTupleKey` (`:106-111`). These are the bare tuple keys: the partition DB already scopes them to one table and one partition.
- `writeUnscoped`, `readUnscoped`: booleans.

**Accumulation.** The footprint accumulates per statement, in session order:
- a write statement adds its keys to `writeKeys`, or sets `writeUnscoped`;
- a read statement in the session (`readInSession`) adds its keys to `readKeys`, or sets `readUnscoped`. This is new; the existing extractor already handles `SELECT` through the WHERE evaluator (`:711-722`).

**Scoped only when the key set is literally determined (fail-closed).** The existing rules stay:
- INSERT VALUES with literal or parameter PKs;
- UPDATE or DELETE with PK equality or IN conjunctions and no PK mutation and no subquery;
- canonical scalars only (`:91-97`, `:290-304`);
- at most 64 tuples (`:22`).

Add these as **unscoped** classes, so that the commutation guard in §2.6 holds:
- **(a)** tables with any UNIQUE constraint or index other than the PK. UNIQUE is enforced per partition: `docs/current-capabilities-and-limitations.md:198`. Two disjoint-PK PREPAREs could both dry-run past a secondary UNIQUE value and then fail at COMMIT. This is the "D6" hazard of the 2026-09-26 challenger;
- **(b)** a PK column with non-BINARY collation. `NOCASE` makes `'A'` and `'a'` one row with two keys;
- **(c)** INSERT without an explicit PK value (rowid assignment);
- **(d)** `INSERT OR REPLACE` or `ON CONFLICT`. This is already unscoped (`:363-367`);
- **(e)** any table with triggers, if the classifier ever admits them;
- **(f)** `FOR UPDATE` reads. Their keys go into `writeKeys` (exclusive), so a locking read conflicts at commit like a write (D6).

**Carried, not re-derived.** The leader puts the footprint into the PREPARE bytes. The apply validates the shape only, with a strict schema; a malformed footprint is REFUSED `footprint_invalid` with an alarm. This keeps the apply rule "the apply never classifies a statement" (`apply.js:15-18`).

**Ordinary writes.** Autocommit entries carry the same record. `buildPartitionWriteEntry` gains `footprint`, and the committed-command admission owner admits that field. An entry without a footprint, such as a migration or an internal write, is treated as unscoped. Owner decision D4.

**Soundness obligation.** For every scoped footprint, the rows a statement actually changes or reads must be a subset of the footprint. A soundness property test proves this (§3.5, receipt R-FP).

### 2.3 PREPARE bytes v2

```
validationText = JSON.stringify([[
  "partition-rows",           // scope; replaces "partition"
  partitionId,
  baseGeneration,             // INTEGER g read at BEGIN (no hash)
  originIndex,                // generation origin (design 0.0.13), unchanged position [3]
  footprint                   // TransactionFootprint, canonical key order
]])
```

- `preparedDigest = sha256(operationsText ‖ validationText)` is unchanged (`bytes.js:40-43`). The footprint and the base are therefore bound into the digest, the decision binding and every retry.
- The **leader never rewrites the base**. The rebase in `request.js:357-362` and `canAdvanceRowKeySessionGeneration` are deleted.
- An old-format `"partition"` scope at apply → REFUSED with cause `validation_format_unsupported`. This is a deterministic refusal, not a compatibility path (owner decision D7). The release census already drains PREPAREs, proposals and pending outcomes before a cutover (`release-contract.js:117-118`).

### 2.4 Replicated state (durable or derivable)

All of it is written only inside the committed-entry application transaction. That is the same SQLite transaction that writes the row, `g` and the rs-raft applied index (`raft-rs-application-transaction-owner.js`; `apply.js:7-11`). Invariant 0 holds: no client transaction owns the canonical connection.

| State | Shape | Written by | Read by |
| --- | --- | --- | --- |
| **Intents** (derived) | `_participant_transactions.footprint_text TEXT` and `prepare_generation INTEGER` on the PREPARED row | the PREPARE apply, with the row | the conflict predicate. **The intents are the footprints of the rows in state PREPARED.** No separate intent table means one authority: a row leaving PREPARED releases its intents in the same transaction, so no drop can happen without a decision |
| **Committed versions** | new `_participant_row_versions(row_key TEXT PRIMARY KEY, generation INTEGER NOT NULL)` | every apply that advances `g`. A COMMIT decision sets `version(k) := g_new` for each `k ∈ writeKeys`. An autocommit statement does the same with its carried footprint | the conflict predicate |
| **Unscoped watermark** | `_partition_write_generation.unscoped_generation INTEGER` | an apply whose write footprint is unscoped: `:= g_new`. This includes DDL (`MIGRATION_ALTER_TABLE`), mirror applies without a footprint, and coordinator settlement | the predicate |
| **History floor** | `_partition_write_generation.history_floor INTEGER` | deterministic pruning: when `count(_participant_row_versions) > MAX_ROW_VERSIONS`, delete the lowest-generation rows (ties by `row_key`) until within the bound, and set `history_floor := max(deleted generation)` | the predicate (`base < history_floor` → conflict `base_expired`) |

- **Rebuild check.** The open hook verifies the derived intents. Every PREPARED row's `footprint_text` must parse under the strict schema; otherwise the partition fails closed, `CONTRARY`, as `readPartitionWriteOriginHistory` does for origin contradictions (`store.js:190-235`).
- **Snapshots.** The new tables live in the partition DB. Stage 2 must show that the snapshot and image pipeline includes them, alongside `_participant_transactions` and `_partition_write_generation` (receipt R-SNAP).

### 2.5 The conflict predicate: one pure function, one owner

**New module** `src/partition/partition-participant-transaction-conflict.js`. It exports `participantConflictOf(state, candidate)`, a pure function with no I/O.

**Inputs:**
- `candidate`: `{participantId, base, footprint}`;
- `state`, read inside the apply transaction:
  - `g`;
  - `unscopedGeneration`;
  - `historyFloor`;
  - `version(k)` for `k ∈ W ∪ R`;
  - the footprints of the PREPARED rows other than this participant.

**Output:** `null`, or `{cause: 'conflict', conflict: <subcause>, key?: string, holder?: participantId}`.

**Notation:** `W = writeKeys`, `R = readKeys`, `wU = writeUnscoped`, `rU = readUnscoped`, `any = W ∪ R` non-empty, or `wU`, or `rU`.

**Rules, evaluated in this fixed order (the first match wins; deterministic):**
1. `base < historyFloor` → `base_expired`.
2. `(wU ∨ rU) ∧ g > base` → `committed_after_base`. An unscoped footprint conflicts with any application write since the base. This is exactly today's partition rule, preserved.
3. `unscopedGeneration > base ∧ any` → `committed_after_base`. An unscoped write since the base may have touched any of our rows.
4. `∃k ∈ W ∪ R: version(k) > base` → `committed_after_base`. The first `k` in canonical order is named.
5. For each other PREPARED footprint `P`, in `participantId` order, it is `intent_overlap` if any of these holds:
   - `wU ∧ anyP`;
   - `P.wU ∧ any`;
   - `rU ∧ (P.W ≠ ∅ ∨ P.wU)`;
   - `P.rU ∧ (W ≠ ∅ ∨ wU)`;
   - `W ∩ (P.W ∪ P.R) ≠ ∅`;
   - `R ∩ P.W ≠ ∅`.

   Read/read never conflicts.

**One algorithm, three call sites:**

| Call site | Inputs | Role |
| --- | --- | --- |
| (i) **PREPARE apply**: `applyParticipantPrepare`, replacing checks 5 and 6 of §1.4 | the full candidate | **the authority**. Non-null → `refusePrepare` with a REFUSED row and `refusalCause: CONFLICT` plus the subcause. Nothing else is written: no intent, no version, `g` unchanged |
| (ii) **autocommit apply**: `entry-apply-base.js:684-687`, replacing `isPartitionReserved` | the entry's footprint, `base = +∞`, so only rule 5 applies | an overlap → `settleReservedCommittedStatement` (re-park, unchanged disposition). Otherwise it applies and writes versions |
| (iii) **leader write parking**: `raft-write-commit.js:453-455` | the same as (ii) | advisory. A wrong guess only parks or proposes, and the apply re-decides (TX1 §3.5 "leader prechecks only refuse … apply decides") |

**No other call site may decide on another transaction's presence:**
- the BEGIN refusal W1 is deleted;
- the leader PREPARE `RESERVED` precheck W2 is deleted;
- the staging-time key check is deleted.

### 2.6 COMMIT and ROLLBACK apply

- **COMMIT** (`commitPrepared`): replace the `g`-equality re-check (`apply.js:430-433`) with an **assertion**: `∀k ∈ W ∪ R: version(k) ≤ prepare_generation`, and for an unscoped footprint `g = prepare_generation`. The intents guarantee it. A violation is an `ATOMICITY_ALARM` REFUSED `commit_intent_violated`. That replaces `COMMIT_BASE_MOVED`, which can no longer be the rule because disjoint PREPARED transactions now commit in any order.
- **Commutation guard.** Disjoint scoped footprints commute once the §2.2 unscoped classes are excluded:
  - CHECK constraints are row-local;
  - foreign keys are refused cluster-wide (`current-capabilities-and-limitations.md:198`);
  - there are no secondary UNIQUE constraints in scoped footprints, no rowid assignment, no non-BINARY PK collation and no triggers.

  So a dry run at PREPARE apply against committed state remains a valid prediction of the COMMIT apply, whatever other disjoint PREPAREDs commit first. This is the TX1 §6.2 property "COMMIT never fails after PREPARE", kept under concurrency. Receipt R-ATOM tests it.
- **COMMIT writes** the versions, advances `g` (unchanged rule: once, only if operations > 0) and moves the row out of PREPARED, which releases the intents. ROLLBACK and REFUSED move the row out of PREPARED, which also releases the intents. Parked writes are re-admitted as today (`apply.js:394-396`).
- **Deletions:**
  - every `afterCommit(clearPreparedParticipantRowKeys | recordCommittedParticipantRowKeys)`;
  - the volatile maps and their pruning and stats (`session.js:30-38`, `:370-567`);
  - `getRetainedRowKeyHistoryStats`, together with its guard and test consumers.

### 2.7 BEGIN, statements and PREPARE on the leader

| Step | New behaviour |
| --- | --- |
| **BEGIN** | Refusals only for partition state: leadership, `CUTOVER_PAUSED`, origin pending, self-check, removal fence, topology. A per-partition **session capacity** bound is a resource refusal, not a conflict (owner decision D11; SQLSTATE 53000, never 40001). The base is `readPartitionWriteGeneration` (integer); the origin is as today |
| **Statement** | Footprint accumulation, the c' validation and the bounds stay. No refusal because of other sessions. A `REPLAY_DIVERGED` doom stays a conflict (40001): a replay over current committed state can only diverge if a committed write touched the staged rows, which means the footprints overlap. Receipt R-FP proves the "only if" through soundness |
| **PREPARE** | Session refusals stay: identity, doomed, commit mode. Topology and, with fix M, `CUTOVER_PAUSED` stay for an unsealed first PREPARE. `RESERVED` and the rebase are deleted. `sealSession` builds the v2 bytes from the BEGIN base and the footprint, then proposes. The apply decides |
| **COMMIT while own PREPARE in flight** | `PREPARING` with `deferRetry` (own state) stays. It is **removed from the 40001 conflict set**: it is not a serialization failure |

### 2.8 Coordinator: ordered PREPARE, stop at the first refusal

**The problem.** No-wait plus concurrent PREPARE fan-out (`protocol.js:432-438`) can abort **both** members of an overlapping pair. Each one PREPAREs first at one of the two shared partitions, then is refused at the other (P, by construction; XR shows the crosswise schedule). That breaks "overlapping → exactly one commits".

**The fix.** The PREPARE stage of a multi-participant transaction runs **sequentially in sorted participant-key order** (`getPrepareParticipantKeys` already sorts, `protocol.js:71-80`) and **stops at the first definitive refusal**. Two notes:
- The sequential `DurableWorkflowCoordinator.executeParticipantStage` *continues* after a failure (`durable-workflow-coordinator.js:388-405`, C). The transaction owner needs a stop-at-first-refusal variant, or a per-key loop in `DistributedTransactionCoordinator`.
- COMMIT and ROLLBACK stay concurrent, because decisions never conflict.

**Exactly one, proved.** For two transactions, let `O` be the lowest partition, in sorted order, where their footprints overlap.
- Both reach `O`: before `O` nothing overlaps, so the only refusals are partition-state DEFERs, which are retried.
- At `O` the first PREPARE to apply wins. The second is refused with `intent_overlap`, or with `committed_after_base` if the first already committed.
- The loser holds intents only at partitions below `O`, which do not overlap the winner, so the winner is never refused by it.

**Progress for sets.** Every refusal names a holder whose intents lie at partitions strictly below the refusal point in its own order. Chains are therefore finite and acyclic, so some transaction in any mutually overlapping set commits, unless it fails for unrelated reasons.

**Cost.** PREPARE latency grows from one parallel round to k sequential rounds for k participants. 1PC is unaffected. This is owner decision D12 and is measured by the scenario-A guard.

### 2.9 How the others do it, and what we take

| | CockroachDB | TiKV / Percolator (TiDB optimistic) | PostgreSQL | This design |
| --- | --- | --- | --- | --- |
| Where a lock lives | **Write intents**: "a combination of a provisional value and an exclusive lock", "replicated via Raft"; plus a per-leaseholder in-memory **lock table** for waiting and unreplicated locks [CRDB-TX] | **Prewrite locks** in the lock column, with one primary and secondaries that point to it; values written at `start_ts` [TiKV-P] | the row lock is on the tuple; "no limit on the number of rows locked", because a lock may cause a disk write [PG-LOCK] | intents = the footprints of PREPARED rows, replicated through rs-raft by the PREPARE apply; no provisional value (operations apply at COMMIT) |
| When a conflict is found | on intent encounter (write time); for SERIALIZABLE, **read refresh** at commit [CRDB-TX] | **at prewrite**: "If there's already a lock or newer version than `start_ts`, the current transaction will be rolled back because of write conflict" [TiKV-P]; TiDB "performs … conflict detection in the TiKV layer, mainly in the prewrite phase" [TiDB-OPT] | at write time (row lock); RR: "could not serialize access due to concurrent update" once the first updater commits; SSI at commit [PG-ISO] | **at PREPARE apply**, the Percolator prewrite point: a newer committed version (rule 4) or an existing intent (rule 5). Read validation, as in CRDB read refresh, is done against `version(k)` |
| On conflict | wait in a per-lock queue or the `TxnWaitQueue`; push; deadlock → "one of the transactions is randomly aborted" [CRDB-TX] | the optimistic writer aborts; a reader backs off; stale locks are resolved from the primary's state, and a primary that is "too old" by wall time is treated as crashed [TiKV-P] | wait; deadlock detection aborts one ("difficult to predict") [PG-LOCK]; `NOWAIT` "reports an error, rather than waiting" [PG-SELECT] | **no wait** (NOWAIT, or Percolator's abort-on-lock). No queue, no deadlock detector, no timers. Ordered PREPARE (§2.8) gives exactly-one for pairs |
| Commit point and recovery | the transaction record (PENDING/STAGING/COMMITTED/ABORTED); parallel commits [CRDB-TX] | the primary lock; secondaries roll forward or back from it [TiKV-P] | local WAL | the coordinator's insert-once decision record (TX1). Recovery follows the exact decision. **Unlike Percolator, no wall-clock lock expiry**: a PREPARED row is released only by its decision (TX1 §8.4) |
| Error surface | all retry errors are SQLSTATE 40001, "restart transaction" [CRDB-RETRY] | write conflict reported to the client; automatic retry removed in v8.0 because it "might lead to lost updates" [TiDB-OPT] | serialization failures "always return with an SQLSTATE value of '40001'" [PG-ISO] | one typed cause (`refusalCause: conflict` + subcause) → one engine code → 40001 |
| Unique keys | an index key is a KV key, so intents cover it (my characterization) | an index key is a key, locked at prewrite (P; the TiDB doc does not say) | under Serializable, "it is possible to see unique constraint violations caused by conflicts with overlapping Serializable transactions" (23505, not 40001) [PG-ISO] | tables with secondary UNIQUE are unscoped (partition-grained) in this Quest. Same-PK concurrent INSERTs overlap → 40001, because the loser never sees the winner's uncommitted row; once the winner has committed, the loser's dry run fails UNIQUE as a statement failure |

**What we deliberately do not take.**
- **CockroachDB's waiting** (`TxnWaitQueue`, pushes, heartbeats, deadlock detection). It needs liveness timers and a randomized victim, which conflicts with the no-timer and deterministic constraints.
- **Percolator's wall-clock "too old" lock cleanup.** Time as recovery authority is exactly what TX1 removed.
- **PostgreSQL's blocking row locks.** A blocking wait inside the participant leader would bring back the settle-wait class.

---

## 3. Quest proposal

### 3.1 Record (`solve/quests/row-level-participant-admission/quest.json`)

```json
{
  "schema": "solve-quest/2",
  "id": "row-level-participant-admission",
  "class": "product",
  "epic": "release-0-3-queryable-core",
  "statement": "Make participant transaction admission row-level and deterministic. BEGIN and session statements are never refused because another transaction exists on the partition. The PARTICIPANT_PREPARE apply on every replica is the one admission authority: it refuses `conflict` (SQLSTATE 40001) exactly when the transaction's carried read/write footprint (canonical PK tuple keys, or an unscoped flag) meets a version committed after its integer BEGIN base, the bounded-history floor, or the footprint of another PREPARED row; it never waits. Intents are the footprints of PREPARED rows; committed versions live in a bounded replicated table written by every committed write in the same application transaction as g and the applied index, so recovery and replay after a leader change decide identically. Multi-participant PREPARE runs in sorted participant order and stops at the first definitive refusal, so of two concurrent overlapping transactions exactly one commits. Delete the PARTITION/ROW_KEY dual granularity, the leader rebase and every leader-volatile row-key map, the 30 s settle wait and its waiter set, the waiter claim drop, the `participant_transaction_already_active` code, and the string-matching conflict projections; one typed conflict cause maps to one engine code and SQLSTATE 40001. The accepted per-partition optimistic serializability (TX1 rev. 10 sections 3.2 and 3.4), the release-fencing contract (rule 5; first PREPARE refused CUTOVER_PAUSED after the fence) and Invariant 0 are preserved. Flip the F-2PC-CONCURRENT-PARTICIPANT facade witness to: disjoint concurrent transactions both commit; overlapping concurrent transactions commit exactly once and the other rejects with the 40001-class code and leaves nothing readable; update the public consumer-contract ratchet and the owning architecture documents to match.",
  "doneWhen": {
    "probe": "script",
    "args": {
      "command": "node scripts/checks/row-level-participant-admission-guard.js --metric",
      "target": 0
    }
  },
  "constraints": [
    {"id": "one-admission-authority",
     "statement": "Only participantConflictOf, evaluated inside the PARTICIPANT_PREPARE apply, decides whether a transaction may hold intents. Leader-side code may refuse only for partition state (leadership, release fence, origin, self-check, removal, topology, session capacity) or the transaction's own state; it never decides a conflict, rebases a base, or stages claims."},
    {"id": "begin-never-refused-for-presence",
     "statement": "No BEGIN or session statement is refused, delayed or parked because another participant transaction exists, stages, prepares or is PREPARED on the partition."},
    {"id": "no-timer-no-wait",
     "statement": "No timer, sleep, settle wait, waiter set, polling loop or retry is added to or kept in the admission path. A conflict is answered at once. Existing partition-state DEFER retries (release fence, topology, leadership) and the write-kernel commit deadline are unchanged and gain no transaction-vs-transaction trigger."},
    {"id": "deterministic-apply",
     "statement": "Every admission input is replicated state read inside the application transaction (PREPARED rows' footprints, _participant_row_versions, unscoped_generation, history_floor, g) or carried command bytes; the outcome of every PREPARE is identical on every replica and independent of which process sealed it or led before."},
    {"id": "fail-closed-intent-lifecycle",
     "statement": "Intents exist only as the footprint of a PREPARED row and are released only by that row's committed decision apply (COMMITTED, ROLLED_BACK, REFUSED). No claim, intent or version is dropped, pruned or expired by time, by a waiter, by leadership change or without an operations-bearing decision; history pruning is count-bounded and advances history_floor so a pruned base is refused, never admitted."},
    {"id": "one-granularity-no-fallback",
     "statement": "PARTICIPANT_CONCURRENCY_GRANULARITY, resolveParticipantConcurrencyGranularity, the concurrencyGranularity option and every leader-volatile row-key map are deleted. Unscoped footprints are the only coarse mode and are a property of the statement, not a configuration. No old-format PREPARE is translated; it is refused validation_format_unsupported."},
    {"id": "isolation-preserved",
     "statement": "Session reads are part of the footprint; the per-partition optimistic serializability of TX1 rev. 10 section 3.2 holds at row granularity. Write skew inside one partition is refused."},
    {"id": "ordered-prepare",
     "statement": "Multi-participant PREPARE runs sequentially in sorted participant-key order and stops at the first definitive refusal; COMMIT and ROLLBACK remain concurrent."},
    {"id": "commit-never-fails-after-prepare",
     "statement": "Footprints are scoped only where disjoint operations commute (no secondary UNIQUE, non-BINARY PK collation, rowid assignment, REPLACE/ON CONFLICT or triggers); a COMMIT apply of a PREPARED row never fails on consistent replicas, and its intent assertion is an alarm, not a rule."},
    {"id": "release-fence-contract-preserved",
     "statement": "BEGIN and staging remain local and create no replicated obligation; an unsealed first PREPARE after the fence is refused CUTOVER_PAUSED (fix M 62adbe36b); sealed retries keep their exact bytes; the release census is unchanged."},
    {"id": "invariant-0",
     "statement": "No client transaction holds the canonical connection across requests; all new state is written only inside the committed-entry application transaction; provider-neutral (no src/raft change)."},
    {"id": "nothing-left-behind",
     "statement": "A refused transaction leaves no application row, intent, version, PREPARED row, volatile session or parked write; its only durable trace is the terminal REFUSED/ROLLED_BACK outcome row owned by TX1 retention."}
  ]
}
```

**Epic placement** is owner decision D9. `release-0-3-queryable-core` authorizes `src/partition`, `src/query`, `src/runtime`, `src/bootstrap`, `architecture` and `scripts/checks` (C: epic front-matter), and it already owns TX1 locking reads (J4) and GSI maintenance (J5).

### 3.2 Deterministic reproducer: the guard, RED on `19a2134c5`

**Script:** `scripts/checks/row-level-participant-admission-guard.js --metric` prints the count of failing obligations.

**How each case runs:** with the controllable-consensus fixture, explicit schedules (no randomness) and a time source that never advances. Each case also asserts that the number of active `Timeout` handles (`process.getActiveResourcesInfo()`) is unchanged by the step, so no timer was awaited.

| Id | Obligation | Candidate (expected red) |
| --- | --- | --- |
| G1 | S2: disjoint, BEGIN₂ after PREPARE₁ applied → both COMMITTED | red (C, §1.12) |
| G2 | S3: disjoint, BEGIN₂ during PREPARE₁ in flight → both COMMITTED | red (C) |
| G3 | S4: disjoint autocommit write between BEGIN and PREPARE → COMMITTED | red (C) |
| G4 | S5: PREPARE and COMMIT₁ arrive through the log only (another leader sealed them) → T₂ COMMITTED | red (C) |
| G5 | XR: two partitions, crosswise schedule → both COMMITTED, no `reserved` answer | red (C) |
| G6 | WS: write skew in one partition → exactly one COMMITTED; the other's terminal answer resolves to SQLSTATE 40001 through `resolveFailureSqlState`; nothing left | red (C) |
| G7 | CD: claim-drop schedule → no lost update (C or B refused 40001; `b0 ∈ {orig→C}` only) | red (C) |
| G8 | settle path: an overlapping statement answered without any timer; for the new design, no refusal at all | red (C by code: `session.js:258-260` arms a 30 s timer when CDC is present) |
| G9 | determinism: replay the committed command log of G1-G7 on a fresh second replica; every PREPARE disposition, `_participant_transactions` row, versions table and application table is byte-equal | red (P: G4 shows leader-history dependence; the replica comparison itself is new) |
| G10 | overlapping same key (S6) and its two-partition variant under ordered PREPARE → exactly one COMMITTED, the loser 40001, nothing left | S6 green, two-partition variant P-red (crosswise concurrent fan-out) |
| G11 | static: no `PARTICIPANT_CONCURRENCY_GRANULARITY`, `concurrencyGranularity`, `DEFAULT_CONFLICT_SETTLE_WAIT_MS`, `rowKeySettlementWaiters`, `canAdvanceRowKeySessionGeneration`, `PREPARED_PARTICIPANT_ROW_KEYS`, `COMMITTED_ROW_KEY_GENERATIONS`, `ALREADY_ACTIVE` (participant code), or string-matched conflict projection under `src/` | red (C) |

The expected seal metric on `19a2134c5` is ≥ 10. `start` records the actual value.

**The property test that backs it** is `test/partition/participant-row-admission.property.test.js`, using fast-check (already a dependency; `test/partition/partition-transaction.property.test.js` uses it).

**Generator:**
- 2-3 transactions over a key universe `{k0..k3}`;
- programs of PK-literal INSERT, UPDATE and SELECT, plus an optional unscoped statement;
- optional autocommit writes;
- an interleaving that respects program order of BEGIN, statements, PREPARE propose, PREPARE apply, COMMIT propose and COMMIT apply;
- an optional replica handover between applies.

**Oracle**, independent of the code under test:
- the generator knows each statement's keys;
- the serial replay in COMMIT-apply order must reproduce every committed transaction's reads (serializability);
- disjoint footprints (and no unscoped statement, no overlapping autocommit) ⇒ all commit;
- overlapping concurrent pairs ⇒ exactly one commits;
- the loser leaves nothing behind.

**Fixed `seed`, plus the named cases G1-G10 as `examples`.** This keeps the red deterministic.

### 3.3 Acceptance flip (witnesses)

- **`test/integration/public-application-database-transaction-facade.integration.test.js:217-258`.** Replace the witness with two tests:
  - "F-2PC-CONCURRENT-PARTICIPANT: concurrent transactions on disjoint rows both commit": c5/h5 and c6/h6 both FULFILLED, all four rows readable;
  - "concurrent transactions on the same rows: exactly one commits, the other rejects with `<conflict code>` and leaves nothing readable". The loser's `code` is the single conflict code (D5); `deferred === false`.

  Update the header comment at `:32-33`.
- **`test/release/public-consumer-contract-ratchet.test.js`:**
  - `:21-23`: the contract statement becomes "concurrent transactions commit independently when their rows are disjoint; a conflict rejects with `<conflict code>` (retry the whole transaction)";
  - `:61-62`: the referenced test name;
  - `CONSUMER_ERROR_CODES` `:36-42`: add the conflict code. This is the lagrange-images surface, and an owner-boundary change.

  Its source of truth, `architecture/application-database-sessions.md`, gains the code in its error table (`:193-204`).
- **Documents (DC-7):**
  - `architecture/postgres-locking-reads.md:7-8`;
  - `architecture/postgres-wire.md:349-355`;
  - `architecture/process-replication.md:357-362`;
  - `architecture/runtime-components.md:233-234`;
  - `architecture/INDEX.md:133`;
  - `docs/benchmarks/tidb-reference-paired-owner.md:22-23`;
  - `docs/current-capabilities-and-limitations.md`, the transactions row.

### 3.4 Receipts (`evidence/receipt.json`, verified by an independent subagent)

| Receipt | What it proves |
| --- | --- |
| `R-RED` | the guard at the seal: metric ≥ 10 on `19a2134c5` |
| `R-PROP` | the property test green; seed and run count recorded |
| `R-FP` | footprint soundness: a fast-check SQL generator over the supported population. For each scoped footprint, the rows a statement actually changes or reads, measured by a before/after table diff on a scratch DB, are a subset of the footprint. The unscoped classes of §2.2 are recognized |
| `R-ATOM` | many disjoint PREPAREs coexist, then COMMIT in every order. No COMMIT alarm, and the final state equals the serial replay |
| `R-SNAP` | snapshot or image and restart: PREPARED footprints, versions and floor survive; a restarted replica decides the same |
| `R-FENCE` | fix M's witness (`partition-participant-release-admission.test.js`) and the release native witnesses stay green; first PREPARE `CUTOVER_PAUSED`; no replicated BEGIN |
| `R-FACADE` | the facade suite on the lab, 3 consecutive passes (lab-first rule) |
| `R-RF3` | 3-node RF=3 lab run: the disjoint pair and the overlapping pair with a leader stop between PREPARE and COMMIT. The outcome is unchanged and every replica's SQLite file is equal for the participant tables. Odd node count, never 2 |
| `R-STATIC` | ratchets and navigability baselines tightened, never raised; `npm test` cone |
| `R-VERIFY` | independent verifier verdict (subagent) under verification protocol v2 |

---

## 4. Staged plan, file ownership and parallel lanes

Each file has a single writer per stage. The lanes are disjoint by file.

| Stage | Lane | Owner files (writable) | Depends on | Output |
| --- | --- | --- | --- | --- |
| S0 | **R** (reproducer) | `scripts/checks/row-level-participant-admission-guard.js` (new); `test/partition/participant-row-admission.property.test.js` (new); `test/test-helpers/participant-transaction-fixture.js` (add per-transaction `sessionId`, two-partition leaders, log replay onto a second replica) | none | measured red, then `start` seals |
| S1 | **F** (footprint) | `src/partition/partition-write-footprint-contract.js`; `test/partition/participant-footprint-soundness.property.test.js` (new) | none (∥ S0) | `TransactionFootprint`, the read footprint, the unscoped classes, R-FP |
| S2 | **S** (store) | `src/partition/partition-participant-transaction-store.js`; `src/partition/partition-participant-transaction-constants.js` (SQL, causes; **delete** granularity); snapshot inclusion list (owner located in S2) | S1 shape frozen | tables, columns, open-hook DDL and rebuild check, bounded pruning, R-SNAP |
| S3 | **A** (apply authority) | `src/partition/partition-participant-transaction-conflict.js` (new); `src/partition/partition-participant-transaction-apply.js`; `src/partition/partition-participant-transaction-bytes.js`; `src/partition/partition-service-entry-apply-base.js` (reservation predicate, version writes); `src/partition/partition-service-raft-write-commit.js` (park predicate); `src/partition/partition-service-shared.js` / `buildPartitionWriteEntry` and `src/partition/partition-committed-command-admission.js` (carry and admit `footprint`); `src/partition/partition-coordinator-settlement.js` (unscoped watermark) | S1, S2 | the one authority, R-ATOM |
| S4 | **L** (leader deletions) | `src/partition/partition-participant-transaction-request.js` (BEGIN, PREPARE precheck, rebase, v2 sealing; keep fix M); `src/partition/partition-participant-transaction-session.js` (delete §1.8 maps, waiters, settle wait, claim drop; keep sessions and the hold sweep); `src/partition/partition-participant-transaction-staging.js` (accumulate the footprint, no conflict refusal); `src/partition/partition-service-remote-query-methods.js` (delete the wait call); `src/partition/partition-service-assembly.js`; `src/bootstrap/bootstrap-service-replica-registration-methods.js`; `src/bootstrap/node-joining-publication-activation.js`; `src/bootstrap/phases/seed-partitions-phase.js` (delete the option) | S3 interfaces (∥ S3 code, merged after) | G1-G4, G8, G11 |
| S5 | **C** (coordinator) | `src/query/distributed/distributed-transaction-protocol.js` / `distributed-transaction-decision-protocol.js` (ordered, stop-at-first-refusal PREPARE) | none (∥ S1-S4) | G5, G10 two-partition variant |
| S6 | **P** (projection) | `src/query/distributed/transaction-participant-error-projection.js` (typed cause only; delete string matching and `ALREADY_ACTIVE`/`PREPARING`); `src/query/pg/postgres-wire-adapter.js`; `src/runtime/pgwire-result-mapper.js`; `src/query/query-constants.js` (one code, D5); `src/query/application-database-constants.js` if the facade names the code | D5 | one 40001 path |
| S7 | **T** (tests, witness, docs) | the test files listed in §1.11 and the scenario-A guard scripts (migrate off granularity and the stats API); the facade witness; the consumer ratchet (both halves); the docs in §3.3 | S4, S5, S6 | R-FACADE, R-STATIC |
| S8 | verification | none (read-only); lab runs | all | R-RF3, R-VERIFY, `land` |

**Parallelism:**
- **{S0, S1, S5, S6}** start at once.
- **S2** starts once S1's record shape is frozen; a shape stub is enough.
- **S3 and S4** proceed in parallel against the S2/S3 interfaces and merge in that order.
- **S7** follows.

**Machines and cadence:**
- Lab hosts for the S8 integration and RF3 runs, at most 2 at once (household bandwidth rule).
- Local work stays niced, with ≤ 2 workers.
- One worktree for this Quest.
- Push incrementally.

**Out-of-scope findings routed to their owners:**
- **(a)** The coordinator-side locking-read lock table: a second authority, `Date.now()` expiry, a mirror outside consensus (D6).
- **(b)** The release census requires `participantStaging === false` although rule 5 says staging is not an obligation (§5 R8).
- **(c)** `PREPARE_CONTENT_CONFLICT` is projected to 40001 but is an identity or bytes defect (§5 R9).

---

## 5. Risks and open owner decisions

### 5.1 Owner decisions (each with a recommendation)

| Id | Decision | Options | Recommendation |
| --- | --- | --- | --- |
| **D1** | Isolation promise | (a) keep TX1 per-partition optimistic serializability: session reads in the footprint, write skew refused; (b) write-key-only FCW, SI-like: write skew allowed, as on the candidate | **(a).** (b) silently weakens an accepted contract (WS probe), and the directive says "never silently weaken tx behaviour". Cost: PK point reads add keys; scans become unscoped reads, which is today's partition behaviour for that partition |
| **D2** | Conflict policy | (a) no-wait refusal at PREPARE apply; (b) wait queue (CockroachDB `TxnWaitQueue` style) | **(a).** Deterministic, timer-free and deadlock-free, and it matches "a real conflict gets 40001". (b) needs liveness timers, a deadlock detector and a victim rule |
| **D3** | History bound | `MAX_ROW_VERSIONS` per partition; `base < history_floor` → 40001 `base_expired` | **65,536 keys** (≈ 4 MB per partition), to be measured on the scenario-A deep-stack guard. Count-based, never time-based |
| **D4** | Autocommit footprints | (a) ordinary write entries carry `footprint` (an entry-bytes change); (b) autocommit treated as unscoped | **(a).** Under (b), every autocommit write to *any* row aborts concurrent transactions on that partition (S4), so "disjoint → both commit" fails with ordinary traffic |
| **D5** | One public conflict code | `TRANSACTION_CONFLICT` (already produced from the typed cause, `decision-protocol.js:91-93`) vs `WRITE_CONFLICT` | **`TRANSACTION_CONFLICT`**, with `sqlState 40001` on pgwire. Delete the `WRITE_CONFLICT` re-projection and string matching. The facade exposes `code: 'TRANSACTION_CONFLICT'` with `deferred: false`, and the contract says "retry the whole transaction" (PG semantics) |
| **D6** | FOR UPDATE and `WRITE_STAGED` coordinator lock table | (a) this Quest: FOR UPDATE keys enter `writeKeys`, so commit-time correctness comes from the apply; the statement-time 55P03 table stays and is recorded as a finding; (b) also move statement-time locks to the participant leader (best-effort, unreplicated, like CockroachDB's lock table) in this Quest | **(a)** plus a successor Quest for (b). The lock table is a second authority with `Date.now()` expiry, but changing 55P03 timing is a separate public contract |
| **D7** | PREPARE bytes v2 | no compatibility; an old format is refused `validation_format_unsupported` | **Accept.** The release census drains PREPAREs, proposals and pending outcomes before a version boundary; mixed-version apply is not supported (`postgres-wire.md`) |
| **D8** | Unscoped classes (secondary UNIQUE, collation, rowid inserts, REPLACE) | stay partition-grained now; unique-value keys later (as KV-key intents in CockroachDB/TiDB) | **Accept** for this Quest; refine in a measured successor |
| **D9** | Epic | `release-0-3-queryable-core` vs a new epic | **`release-0-3-queryable-core`** (it authorizes the touched trees and owns TX1, J4, J5) |
| **D10** | Hold sweep (60 s volatile session discard) | keep vs make it event-driven | **Keep**: a memory bound, no longer an admission input |
| **D11** | Session capacity per partition (BEGIN is no longer capped at 1) | a bound with a typed resource refusal (53000) vs unbounded | **Bound at 64 sessions per partition** (256 ops / 1 MiB each), refused `participant_transaction_session_capacity` (53000, `deferRetry`). It is a resource bound, not a conflict, so the BEGIN constraint holds |
| **D12** | Ordered PREPARE latency | sorted sequential PREPARE (exactly-one) vs concurrent fan-out ("at most one", both may abort) | **Sorted sequential**, as the owner's "exactly one commits" requires. Measure the k-participant cost on the scenario-A guard; 1PC is unaffected |

### 5.2 Risks

| Id | Risk | Mitigation |
| --- | --- | --- |
| R1 | **Footprint unsoundness**: an understated key set lets two overlapping transactions both commit (lost update), and the apply trusts the carried footprint | Scope only literal shapes; unscoped by default; R-FP soundness property; the extractor change is reviewed by an independent verifier |
| R2 | **Atomicity**: a COMMIT fails after a sibling PREPARED commits (secondary UNIQUE, rowid ceiling, collation) | The §2.2 unscoped classes; R-ATOM. Also P: the rowid ceiling (`PARTITION_ROWID_LIMIT`) for explicit-PK rowid tables near the ceiling must be unscoped, or checked against the sum of the PREPARED inserts |
| R3 | Write amplification and apply cost: a version row per written key; parsing PREPARED footprints per PREPARE (O(#prepared × keys)) | Measure on the scenario-A deep-stack guard. If needed, add a replicated intent index written in the same apply (a projection, rebuilt and verified at open) |
| R4 | More 40001 under hot keys (no-wait); long transactions starve | The same class as TX1 L5 (accepted), at finer grain. Statement-autocommit reattempt (T4) stays; the client retries |
| R5 | `base_expired` for long transactions on write-heavy partitions | D3 bound; the expiry is typed so the operator can see it |
| R6 | Snapshot or install pipeline omits the new tables | R-SNAP; S2 names the inclusion owner |
| R7 | Reads routed outside the session (before first-write enlistment, or `VOLATILE_READ`) are unvalidated | Unchanged from TX1. S7 documents it. The census receipt confirms that session reads carry identity (P: `sql-query-engine-select-execution.js:70-74`) |
| R8 | Release-census starvation: `participantStaging === false` with many concurrent sessions | Out of scope (release-fence contract). Measure; a successor may drop staging from the census, since rule 5 already fences the first PREPARE |
| R9 | `PREPARE_CONTENT_CONFLICT` is projected to 40001 although it is an identity defect | S6 removes it from the conflict set (XX000-class); a review item |
| R10 | Ordered PREPARE plus DEFER retries (release fence, topology) hold intents at lower partitions while a higher one defers | Bounded by the existing budget. Others overlapping get 40001 at once (no wait); measure |
| R11 | Mixed-version cluster during rollout sees v2 bytes on an old replica | No supported mixed-version apply (D7); the version fence in the support envelope is owned by the founding/placement release (O16) |

---

## 6. Sources

- [CRDB-TX] Cockroach Labs, "Transaction Layer", https://www.cockroachlabs.com/docs/stable/architecture/transaction-layer (redirects to docs.cockroachlabs.com). Sections: Write intents, Transaction records, Concurrency control / Lock table / TxnWaitQueue, Timestamp cache, Read refreshing, Transaction conflicts, Parallel Commits.
- [CRDB-RETRY] Cockroach Labs, "Transaction Retry Error Reference", https://www.cockroachlabs.com/docs/stable/transaction-retry-error-reference ("All transaction retry errors use SQLSTATE 40001"; RETRY_WRITE_TOO_OLD, RETRY_SERIALIZABLE).
- [TiKV-P] TiKV, "Percolator", https://tikv.org/deep-dive/distributed-transaction/percolator/ (prewrite and primary/secondary locks, conflict at prewrite, stale-lock resolution from the primary).
- Percolator paper: D. Peng, F. Dabek, "Large-scale Incremental Processing Using Distributed Transactions and Notifications", OSDI 2010, https://research.google/pubs/large-scale-incremental-processing-using-distributed-transactions-and-notifications/ (reference; not re-read for this document).
- [TiDB-OPT] PingCAP, "TiDB Optimistic Transaction Model", https://docs.pingcap.com/tidb/stable/optimistic-transaction (conflict detection in TiKV at prewrite; automatic retry removed in v8.0.0; retry "might lead to lost updates").
- [PG-ISO] PostgreSQL, "Transaction Isolation", https://www.postgresql.org/docs/current/transaction-iso.html (RR "could not serialize access due to concurrent update"; 40001; unique violations under Serializable; Read Committed re-evaluation).
- [PG-LOCK] PostgreSQL, "Explicit Locking", https://www.postgresql.org/docs/current/explicit-locking.html (row locks block only writers and lockers; no in-memory limit; deadlock detection aborts one).
- [PG-SELECT] PostgreSQL, "SELECT, The Locking Clause", https://www.postgresql.org/docs/current/sql-select.html#SQL-FOR-UPDATE-SHARE (NOWAIT "reports an error, rather than waiting").
