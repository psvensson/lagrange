# F6 design: consensus persistence never inside a user session transaction

Read-only architect, 2026-09-23. Tree: worktree `r1-write-path` with attempt A1 of
`raft-rs-single-path-partition-cutover` applied, unstaged (HEAD 0cbb1cb46). All paths
are relative to that worktree root; line numbers are from that tree. Vendored crate
and node_modules paths are cited where the claim rests on them.

Invariant to establish (owner directive): consensus persistence (Ready persist,
hard state, applied state) never runs inside a user session transaction, and a user
session's ROLLBACK can never erase consensus rows.

## 0. Two facts everything else rests on

F0.1 One connection. The partition opens one better-sqlite3 connection, WAL,
synchronous=NORMAL (`src/partition/partition-service-raft-init-base.js:362-364`,
`src/partition/partition-service-constants.js:207-208`) and hands that same object to
the port as DURABLE_STORAGE (`raft-init-base.js:430`); the port passes it as
`database` (`src/raft/raft-rs-operation-port.js:95-96,121`) and the runtime builds
`new RaftRsDurableStore(request.database)` on it (`src/raft/raft-rs-runtime-owner.js:705`).
Interactive sessions run `BEGIN IMMEDIATE` on the same `this.db`
(`src/partition/partition-service-transaction-base.js:575`).

F0.2 Nesting is silent. Every store write except `putCommitIndex` goes through
`store.transaction(work)` = `this.db.transaction(work)()`
(`src/raft/raft-rs-durable-store.js:133-135`). better-sqlite3's wrapper chooses
`SAVEPOINT/RELEASE` when `db.inTransaction` is already true and `BEGIN/COMMIT`
otherwise (`node_modules/better-sqlite3/lib/methods/transaction.js:52-63`);
`db.inTransaction` is `!sqlite3_get_autocommit(handle)`
(`node_modules/better-sqlite3/src/better_sqlite3.cpp:764-768`). A RELEASEd savepoint
is part of the enclosing transaction; the enclosing `ROLLBACK` erases it. Nothing in
the store or runtime looks at `db.inTransaction` today (grep: only
`partition-service-durability-fitness.js:269` reads it, as a fitness signal).

## 1. Exact current flow of an interactive transaction (A1 tree)

Entry. The SQL engine turns BEGIN/COMMIT/ROLLBACK into coordinator calls
(`src/query/sql-query-engine-statement-execution.js:473-480`,
`src/query/sql-query-engine.js:352-355,364-379,389-404`). The coordinator's
participant callbacks deliver TRANSACTION messages to the partition with operation
BEGIN / PREPARE / COMMIT / ROLLBACK / TRANSACTION_OUTCOME
(`src/query/sql-query-engine-instance-initializer.js:194-232`). The partition
dispatches them in `handleTransactionMessage` -> `executeTransactionControl`
(`src/partition/partition-service-entry-apply-base.js:385-441`). One participant
selects ONE_PHASE_COMMIT (commit without prepare,
`src/query/distributed/distributed-transaction-commit-mode.js:36-38`,
`distributed-transaction-protocol.js:285-290,340-360`); more than one participant runs
PREPARE on each then COMMIT (`distributed-transaction-protocol.js:230-237,291-296`).

Step 1, BEGIN. `beginTransaction` admits at most one open session per partition
(`transaction-base.js:562-567`), then `this.db.exec(BEGIN IMMEDIATE)` on the partition
connection (`:575`) and registers `activeTransactions[sessionId]` (`:576-584`). From
here `db.inTransaction === true` until COMMIT/ROLLBACK.

Step 2, session writes. `executeQuery` resolves the session from `options.sessionId`
(`src/partition/partition-service-write-metrics-base.js:88-90`) and, when one is
open, calls `executeTransactionWrite` (`:101-104`), which runs the statement
directly on `this.db` inside the session and appends `{...entry, changes}` to
`transactionState.operations` (`:180-211`). No consensus is involved. Session reads
are filtered by write set/epoch (`:64-69`, `transaction-base.js:265-295`). A
*sessionless* write while a named session is open is NOT absorbed: it takes
`proposeWrite` -> `applyWrite` -> `propose`
(`partition-service-transaction-session-methods.js:27-39`,
`write-metrics-base.js:430-444,637-690`, `partition-service-raft-write-commit.js:21-36`).
(A sessionless write while the DEFAULT session is open IS absorbed into it,
`session-methods.js:36-38`.) `applyWrite` has no `isInTransaction()`/`db.inTransaction`
guard (`:637-690`).

Step 3, PREPARE (2PC only). Conflict check (`transaction-base.js:630-642`), then
`await replicatePreparedTransaction` (`:643`): marker
`{type: PREPARE_TRANSACTION, sessionId, epoch, writeSet: [...keys], timestamp,
proposedBy, proposedAt}` (`:977-985`), proposed fire-and-forget when
`readStatus().role === LEADER` (`:988-1000`) WHILE THE SESSION IS OPEN. The session
stays open after prepare: the state moves from `activeTransactions` to
`preparedTransactions` (`:647-656`) and no SQLite statement is issued.

Step 4, COMMIT. `await replicateTransactionCommit` (`:696-700`): marker
`{type: TRANSACTION_COMMIT, sessionId, transactionEpoch, operations, ...}`
(`:905-913`), proposed fire-and-forget (`:916-928`), while the session is open. Then
`recordTransactionCommitOutcome` upserts `_transaction_outcomes` inside the session
(`:701-704,858-868`), then `this.db.exec(COMMIT)` (`:705`), then CDC for each
operation (`:708-710`), then the client is answered. Consensus is never awaited: the
ack does not depend on the marker committing.

Step 5, ROLLBACK. `await replicateTransactionRollback` (`:795-798`): marker
`{type: ROLLBACK, sessionId, transactionEpoch, ...}` (`:943-950`), proposed
fire-and-forget (`:953-965`), while the session is open; then `this.db.exec(ROLLBACK)`
(`:799`).

What each marker does when it commits (all replicas, leader included), in
`applyCommittedEntry` (`entry-apply-base.js:1032-1194`):
- PREPARE_TRANSACTION and ROLLBACK: recognised (`:57-73`) but RECORDED_ONLY
  (`:1189-1193`): HLC witnessed (`:1050-1052`), ENTRY_COMMITTED emitted (`:1182-1187`),
  nothing executed.
- TRANSACTION_COMMIT: `recordTransactionCommitOutcome` (`:1163-1168`) and
  `resolveCommittedWrite` (`:1169-1178`). `operations` are never executed. This is
  identical on the sealed head (`git show 19507fb7f:src/partition/partition-service-entry-apply-base.js`
  lines 1094-1116), i.e. pre-existing on liferaft: a follower never receives a
  session's rows through consensus. The leader's rows come only from step 2's direct
  SQL. Design Q3 records this (`solve/quests/raft-rs-single-path-partition-cutover/design.md:246-248`).

Where CDC fires: session commits at `transaction-base.js:708-710` (after SQLite
COMMIT, independent of consensus); proposed writes in the leader's afterCommit
effect (`entry-apply-base.js:1087-1116`).

Restart. `reconstructPreparedState` reads `this.storage?.getEntriesFrom(1)`
(`transaction-base.js:62`), the legacy adapter that A1 never writes; so on this tree
the PREPARE/ROLLBACK markers have no reader at all until A2 (`design.md:81`, S15).

## 2. Every way consensus persistence runs inside a user transaction today

Persistence sites in the runtime, all on the shared connection:
- P1 `store.persistReady` (log append with `DELETE ... log_index >= first` + INSERT,
  hard state) from `drainReady` (`runtime-owner.js:482`, store `:138-177,184-192`).
- P2 `applyCommittedEntryTransaction`: application SQL + `putAppliedState` in one
  `store.transaction` (`runtime-owner.js:379-385`,
  `src/raft/raft-rs-application-transaction-owner.js:45-55`, store `:214-222`).
- P3 `store.putCommitIndex` after `advance_append`, a bare statement with no
  transaction wrapper of its own (`runtime-owner.js:420-427`, store `:199-203`).
- P4 bootstrap `putAppliedState` at group open and at every `replaceRuntime`
  (`runtime-owner.js:236-247,255-269`), reachable from any `perform` once a group is
  RECOVERY_REQUIRED (`:271-276,686-691`).

Triggers that run a drain while `db.inTransaction` is true:
- T1 Marker proposals inside the session (`transaction-base.js:918,955,990`):
  `propose` -> `perform` -> `drainInbound` -> `performCommand` -> `drainReady`
  (`runtime-owner.js:647-669,686-694`). On a lone leader the whole chain is
  synchronous inside `propose`: `enqueue` runs the work inline when the tail is idle
  (`:278-291`), `sendMessages` returns null with no messages (`:307-310`),
  `thenMaybe` continues synchronously (`:302-305`), so P1, P2, P3 all execute as
  savepoints of the session before `transaction-base.js:705/799` runs.
- T2 Any sessionless write on the leader while a named session is open (step 2 above):
  `applyWrite` proposes without a guard (`write-metrics-base.js:688`,
  `raft-write-commit.js:36`). On a lone leader it is applied inside the session's
  savepoint and ACKNOWLEDGED from afterCommit (effects run after RELEASE, not after
  the session's COMMIT: `application-transaction-owner.js:60-62` ->
  `entry-apply-base.js:1087-1095` -> `raft-write-commit.js:50-75`). The session's
  ROLLBACK then erases an acknowledged write, its log entry, hard state and applied
  state. No restart needed to observe the loss.
- T3 Ticks. The port's timer calls `execute({type:'tick'})` every tickIntervalMs
  (`raft-rs-operation-port.js:179-184`; heartbeat/3, `:63-68`; heartbeat default 150 ms,
  `src/raft/constants.js:50`). Scheduling starts in the port constructor unless
  DEFER_ELECTION (`:283-286`) and in `startElection` for multi-replica groups
  (`raft-init-base.js:606-621`). Each tick drains queued inbound envelopes (step) and
  then the Ready (`runtime-owner.js:671-684,686-694`). Lone leader: with nothing
  proposed `has_ready` is false and nothing persists. Multi-replica leader: follower
  append responses, stepped on the tick, produce Readies (hard-state commit advance,
  committed entries -> P2, LightReady commit -> P3) that persist as savepoints of the
  open session.
- T4 `readStatus` also drains inbound before answering (`:686-694`, READ_STATUS is
  dispatched inside `performCommand`), so the `await this.raft.readStatus()` in the
  markers (`transaction-base.js:916,953,988`) and in `applyWrite`
  (`write-metrics-base.js:657`) can itself trigger P1-P3 inside the session on a
  multi-replica leader.
- T5 Transport ingress only enqueues (`runtime-owner.js:739-755`,
  `entry-apply-base.js:213-217`); the persistence happens at the next T3/T4/T1.
- T6 P4 via `replaceRuntime` on any command while a session is open.

Other erase paths on the same connection (they erase whatever savepoints were
RELEASEd into the open transaction): the stuck-session sweep's bare ROLLBACK
(`transaction-base.js:406`), the commit-failure ROLLBACK (`:749`), the
rollback-failure ROLLBACK (`:832`). `PartitionTransactionHandler` also owns a
`BEGIN IMMEDIATE`/`forceRollback` (`src/partition/partition-transaction-handler.js:81,194`)
but has no consumer in `src/` (only README and two tests): a dead second owner (R01).

The measured hazard, derived: lone leader; BEGIN; direct INSERT; `rollbackTransaction`
proposes the ROLLBACK marker at `:955` before the SQLite ROLLBACK at `:799`; T1 runs
P1 (entry 2 + hard state commit 2), P2 (applied 2), P3 as savepoints; `:799` erases
them. Core memory: log [1,2], commit 2, applied 2; disk: log [1], earlier hard state.
Next write: entry 3; P1 does `DELETE ... log_index >= 3` then inserts 3 and writes
hard state commit 3 -> disk log [1,3], commit 3. Restart: `createNodeArguments`
bootstraps with `entries: [1,3]` (`runtime-owner.js:204-226`); the binding appends
them into MemStorage (`vendor/raft-rs-wasm/src/lib.rs:425`), and MemStorage panics
"raft logs should be continuous" when `last_index + 1 < ents[0].index`
(`~/.cargo/registry/src/index.crates.io-1949cf8c6b5b557f/raft-0.7.0/src/storage.rs:333-338`;
the vendored copy under `vendor/raft-rs-wasm/raft-0.7.0/src` carries only lib.rs,
raft_log.rs and raw_node.rs). A Rust panic in wasm is the `unreachable` trap the A1
implementer saw. I did not re-run the sequence; the derivation matches the report.

Liferaft had the same shape: the commit slice ran as a savepoint inside the session
(`design.md:238-241`; `git show 19507fb7f:src/raft/liferaft-commit-scheduler.js` 100-120).

## 3. Candidate designs

### (a) Typed refusal in the store/runtime + markers proposed outside the session

Invariant argument. The store is the only writer of `_raft_rs_*` rows; if the store
refuses to open its transaction (or run `putCommitIndex`) while the connection is in
a transaction it did not open, no consensus row can ever be a savepoint of a user
session, hence no user ROLLBACK can erase one. The runtime asks the store before
touching the core so the refusal is a deferred, non-fatal outcome instead of a
mid-Ready failure. Markers are proposed after the session's terminal SQLite
statement, so a session's own consensus record is written outside the session.

Code (files/functions):
1. `src/raft/raft-rs-durable-store.js`: an owned admission state
   `persistenceAdmission()` -> `{ADMITTED, USER_TRANSACTION_OPEN}` (R07), computed as
   `db.inTransaction && !this.inOwnTransaction`; `transaction()` and
   `putCommitIndex()` throw a typed error (`.code`) on USER_TRANSACTION_OPEN instead
   of nesting; `transaction()` sets/clears `inOwnTransaction` around the work.
   Names in `raft-rs-durable-store-constants.js` (R06).
2. `src/raft/raft-rs-runtime-owner.js` `perform` (`:686-694`): before
   `ensureExecution`, if the store reports USER_TRANSACTION_OPEN, return
   `hostFailure(RUNTIME_PHASE.READY_PERSISTENCE, USER_TRANSACTION_OPEN, false)`
   (retryable, not RECOVERY_REQUIRED, `group.health` untouched) for every command
   except READ_STATUS, which answers from `readGroupStatus` without draining inbound.
   The check MUST precede `take_ready`: the binding moves the Ready into
   `pending_ready` on `take_ready` and a second `take_ready` overwrites it
   (`vendor/raft-rs-wasm/src/lib.rs:562-580`), so a refusal after taking would lose a
   Ready; before taking, the core keeps it and `has_ready` stays true. Inbound
   envelopes stay queued (`group.inbound`) until the session ends.
   Add `RUNTIME_REASON.USER_TRANSACTION_OPEN` in `raft-rs-runtime-owner-constants.js`.
3. `src/partition/partition-service-transaction-base.js`: `rollbackTransaction` runs
   `db.exec(ROLLBACK)` (`:799`) before `replicateTransactionRollback` (`:795`);
   `commitTransaction` runs `recordTransactionCommitOutcome` + `db.exec(COMMIT)`
   (`:701-705`) before `replicateTransactionCommit` (`:696`). Both proposals stay
   fire-and-forget (Q3), so the client-visible result is unchanged; the marker now
   persists outside the session (lone leader: synchronously inside the propose,
   after COMMIT/ROLLBACK).
4. `prepareTransaction`: the session stays open after prepare (`:647-656`), so the
   PREPARE marker cannot be proposed outside the session without changing what the
   session holds. Two options, and the second is what "followers can apply the write
   set" requires:
   - (a0, minimal) do not propose PREPARE while staging; prepared state is local
     (memory + the existing `preparedStateLostSessions` semantics after restart). On
     this tree the marker has no reader anyway (`transaction-base.js:62` reads the
     legacy adapter; A2 owns the new reader). Record as a typed GAP.
   - (a1, the real fix) at PREPARE (2PC) or at COMMIT (1PC): release the staging
     transaction (`db.exec(ROLLBACK)`), then propose the marker carrying the staged
     `operations` (the `{sql, params, type, tableName, entryId, ...}` entries
     recorded at `write-metrics-base.js:194-201`), the write set and the epoch; the
     TRANSACTION_COMMIT application executes `operations` on every replica inside the
     apply transaction (in a nested savepoint so a statement failure becomes a
     recorded ABORTED outcome in `_transaction_outcomes`, never a HOST_FAILURE), then
     `putAppliedState`; the leader acks from afterCommit through
     `waitForCommittedWrite(markerEntryId)` (`partition-service-cdc-stream-base.js:262-350`);
     ROLLBACK after PREPARE proposes the ROLLBACK marker with nothing to undo locally;
     CDC moves to the leader's afterCommit like proposed writes. This makes an
     interactive transaction replicated (closing Q3/F6's "followers never replay
     operations") and puts the ack behind consensus.
5. `src/partition/partition-service-raft-write-commit.js:36-43`: map the
   USER_TRANSACTION_OPEN refusal to a `deferRetry` write failure so the router retries
   after the session instead of reporting a hard failure (R12: backpressure, not a
   shortcut). Message constant in `partition-service-constants.js`.

What it breaks / costs:
- A leader cannot do consensus work while a session is staging (BEGIN .. PREPARE/COMMIT
  on the partition connection). Lone leader: sessionless writes are deferred (today
  they are silently absorbed and erasable). Multi-replica leader: no Ready drain means
  no heartbeats (`finishReady` sends `messages` and `persistedMessages` only after
  `persist_ready`, `runtime-owner.js:394-405`; the refusal happens before `take_ready`
  so nothing is sent). A staging window longer than the election timeout (defaults
  1000-3000 ms, `src/raft/constants.js:51-52`, applied at `raft-init-base.js:389-392`)
  costs the leadership; the session's later COMMIT then sees `role !== LEADER` and
  does not propose the marker (already the case on a demoted leader today). The
  staging window is client-controlled and bounded only by the 60 s hold sweep
  (`src/control-plane/timeout-budget.js:21`, `partition-service-core-base.js:227-231`).
  This is the honest cost of holding a SQLite write transaction across consensus;
  today the same window is "live but corruptible".
- The durability-fitness comment "in-session quorum commits join the open
  transaction" (`durability-fitness.js:288-291`) becomes false; signal (a) stays valid.
- Inbound envelopes accumulate unbounded during a session (bounded by the sweep x
  message rate); record.
- (a1) changes session semantics: `lastInsertRowid`/`changes` at commit come from
  the apply, not the staging run; non-deterministic SQL re-executes (same class as
  any replicated SQL today).

Falsified by: W1-W4, W6 in section 4 going green, plus one adversarial check: with
`BEGIN` opened by a test on the partition's own connection, no `_raft_rs_*` row is
written by any port operation until `COMMIT` (observed on an independent read-only
connection after the test's COMMIT: the durable record equals the pre-BEGIN record),
and after `COMMIT` a tick makes the deferred Ready durable.

### (b) A dedicated SQLite connection for the rs-raft store

Invariant argument as claimed: log/hard state written on connection B are never part
of a session on connection A. Application SQL + applied state stay on A.

Why it fails, with the WAL interaction:
- Single writer. A session's `BEGIN IMMEDIATE` on A holds the write lock for the
  whole session; B's `persistReady` (a `BEGIN` then a write) hits SQLITE_BUSY. The
  busy handler is better-sqlite3's synchronous `timeout` (default 5000 ms,
  `node_modules/better-sqlite3/lib/database.js:34`; the partition opens with defaults,
  `raft-init-base.js:362`). The wait blocks the only JS thread, so A can never commit
  during it; every Ready during a session becomes a 5 s event-loop stall ending in
  SQLITE_BUSY -> RECOVERY_REQUIRED (`runtime-owner.js:483-486`) -> `replaceRuntime` ->
  P4 on B -> BUSY again. With `timeout: 0` it is an immediate host failure instead of
  a stall, but still a failure unless the runtime pre-checks A's state, which is (a)'s
  check. A separate database file for the store avoids the lock but the applied
  state must stay on A (atomic with the SQL), so:
- The applied state (named in the invariant) remains inside the session. On a session
  ROLLBACK the applied row and the applied SQL are erased together while the log and
  hard state (B) survive; the core's in-memory `applied` is now ahead of the durable
  applied and nothing re-delivers those entries until a restart: an acknowledged
  sessionless write (T2) is invisible until restart. The corruption becomes a
  restart-healable inconsistency, not an established invariant.
- Atomicity of apply itself holds (SQL + applied on one connection, persist on B
  commits first so `applied <= commit` survives a crash), but every witness that
  reads "the replica's own database" (`test/raft/raft-rs-backend/real-partition-on-raft-rs.test.js:83-108`,
  `operation-port-ready-recovery.test.js:170-200`), the legacy detector's
  `hasDurableRecordIn(db, ...)` (design section 3), snapshot checkpoint scrubbing (F5)
  and `:memory:` test partitions (a second `:memory:` connection is a different
  database) all change. Request contract changes: a second DURABLE_STORAGE field or
  store-owned file naming from `dbPath`.
Falsified by: W2 (acknowledged write erased by a session rollback) still red; a
3-replica leader with a session open stalls 5 s per Ready (measure the event-loop
gap watchdog). Not recommended.

### (c) Sessions in a SAVEPOINT with consensus persistence outside any savepoint

As literally stated it is impossible with better-sqlite3: a connection has one
transaction stack; a `SAVEPOINT` outside a transaction starts one; a savepoint cannot
be suspended across an `await`, and every synchronous DB call between the session's
statements (T1-T4) executes inside it. "Outside any savepoint" means "when the
connection is in autocommit", which is exactly the state (a) enforces. A re-entrant
Ready drain (T3/T4) would still nest.

The workable form, (c'): no SQLite transaction spans a client round trip. Each session
request runs synchronously inside `SAVEPOINT; replay the staged operations; run the new
statement (or read); ROLLBACK TO; RELEASE`, so between requests the connection is in
autocommit, consensus is never blocked and never nests, and read-your-writes holds by
replay. Commit = (a1)'s marker with `operations`, applied by consensus on every
replica. Cost: O(n^2) statement executions per session and semantic drift of
`lastInsertRowid`; no leadership stall. Files: `write-metrics-base.js`
`executeTransactionWrite`/`executeQuery` (session branch), `transaction-base.js`
begin/prepare/commit/rollback, `entry-apply-base.js` TRANSACTION_COMMIT apply,
`transaction-session-methods.js`. It still requires (a)'s store/runtime refusal as the
enforcement of the invariant (nothing else stops a future caller from opening `BEGIN`
on the shared connection).

### Recommendation

(a), in two layers:
- Layer 1 (enforcement + reorder: items 1, 2, 3, 4-(a0), 5): establishes the invariant
  mechanically and makes the corruption unreachable. It converts silent erasure into a
  typed deferral. It is small (section 4) and backend-independent in its transaction
  owner half.
- Layer 2 (replicated interactive transactions: 4-(a1), choosing between staging on
  the connection (a1) and staging by replay (c')): removes the leadership stall and
  closes Q3 (followers never see session data) and "CDC before consensus"
  (`transaction-base.js:708-710`). (c') is the better end state because it removes the
  stall; it is also the larger change.

Does it fit inside `raft-rs-single-path-partition-cutover`? The sealed statement
(`solve/quests/raft-rs-single-path-partition-cutover/quest.json:6`) does not name
transactions, and the lead's Q1 decision (`design.md:238-243`) explicitly declined to
widen. But the quest's own receipt "restart-serves-writes-from-the-rs-raft-store" is
falsified on the single path by BEGIN/INSERT/ROLLBACK/INSERT/restart, and the
constraint "expectations-from-production ... each receipt must be red on the sealed
head" cannot be honestly satisfied for a restart witness that a client can break
before the restart. R09/R16: this is a recorded widening decision for the lead, not
something the solver absorbs: supersede Q1 so Layer 1 lands with the cutover (the
tree that performs the flip), and seal Layer 2 as its own quest that lands before the
certification item "acknowledged-write correctness across leader change"
(`solve/epics/raft-rs-full-cutover/findings-2026-09-23.md:68-85`). The alternative,
a separate Layer-1 quest landed on main first, would be proven on a tree where
rs-raft is not the default (weaker proof, R19) and would collide with A1's rewrite of
the same S14 lines and the one-worktree-per-quest rule. Layer 2's (a1)/(c') depends on
A1's committed-record contract (`applyCommittedEntry({command,index,term,effects})`,
`entry-apply-base.js:1032`) and on A2's committed-entry reader for
`reconstructPreparedState`, so it cannot precede the cutover; it must precede
certification and the npm/docker publish of the default.

## 4. Red witnesses for the recommended design (Layer 1) and attempt size

Every expectation comes from production construction (`new PartitionService({...})`
with a file-backed `dbPath` in a temp dir, one replica -> `campaign()` at
`raft-init-base.js:563-570`), from the core (`partition.raft.readStatus()`), or from
an independent read-only connection on the same file
(pattern: `real-partition-on-raft-rs.test.js:83-108`, decoding entries with
`decodeCommittedProposal`). `:memory:` cannot be used: an independent connection to
`:memory:` is a different database.

W1 Session rollback never erases consensus rows (lone leader). initialize; one
sessionless INSERT; read record R0 (independent); `beginTransaction('s1')`;
`executeQuery(INSERT, {sessionId:'s1'})`; `rollbackTransaction('s1')`; read R1.
Expect: R1.entries is a superset of R0.entries; `Number(R1.commitIndex) ===
readStatus().commitIndex`; `Number(R1.appliedIndex) === readStatus()` applied
(from the record, `readDurableRecord`); then one more sessionless INSERT; `shutdown`;
construct a new PartitionService on the same dbPath; `initialize` resolves and
SELECT returns both sessionless rows. Today: core commit 2 vs durable commit 1 (red),
restart traps `unreachable` (red).

W2 An acknowledged write is never absent after a session outcome (lone leader).
`beginTransaction('s1')` (named, so the sessionless write is not absorbed,
`session-methods.js:27-39`); sessionless INSERT -> today acknowledged
(`success:true` with `logIndex`); `rollbackTransaction('s1')`; independent SELECT.
Expect: either the write's result is the typed deferral (Layer 1) or, if it was
acknowledged, the row is present on the independent connection. Today: acknowledged
and absent (red).

W3 The store refuses to nest (unit, on `RaftRsDurableStore`). Open a file db, build
the store, `db.exec('BEGIN')` from the test; expect `persistReady`, `putCommitIndex`,
`putAppliedState`, `transaction(() => {})` each to throw the typed code, and after
the test's `COMMIT` an independent connection sees no `_raft_rs_*` change. Today: all
succeed as savepoints (red).

W4 The runtime defers instead of persisting (port level, `PartitionNodeCluster`
harness, `test/raft/raft-rs-backend/partition-node-cluster.js`). Elect a lone leader;
`db.exec('BEGIN')` on the replica's database; `propose(x)` -> expect outcome
HOST_FAILURE, phase ready-persistence, reason user_transaction_open,
`recoveryRequired:false`; `readStatus()` still CORE_OK with commitIndex unchanged and
`groupHealth: 'usable'`; `db.exec('COMMIT')`; `propose(x)` again commits and the
independent record shows the entry. Today: the first propose succeeds and its rows are
savepoints of the test's transaction (red on "commitIndex unchanged").

W5 Multi-replica: session on the leader defers Readies, resumes after COMMIT
(3-replica `PartitionNodeCluster`): leader `BEGIN`; followers keep sending; expect the
leader's independent record unchanged until `COMMIT`, then a tick converges followers
and `readStatus().commitIndex` equals the durable commit on every replica. Today: red
(persistence proceeds inside the transaction).

W6 Marker order: after `commitTransaction('s1')` on a lone leader the independent
record's last NORMAL entry decodes to `{type: TRANSACTION_COMMIT, sessionId:'s1'}`
and `_transaction_outcomes` holds COMMITTED for ('s1', epoch); after
`rollbackTransaction('s2')` the last entry decodes to `{type: ROLLBACK, sessionId:'s2'}`
and `Number(record.commitIndex) === readStatus().commitIndex`. Today: the ROLLBACK
half is red (erased).

Existing witness to repair, not add: `test/transaction/transaction-durability-raft.property.test.js`
"Rollback does not add to Raft log" (`:240-290`) now reads `committedLogIndex` from
`readStatus().commitIndex` (helper added by A1, `:12-17`), i.e. core memory: it stays
green while the disk is corrupt. Its expectation must come from the independent
durable record (needs a file-backed dbPath).

Attempt size, Layer 1: 6-7 src files: `src/raft/raft-rs-durable-store.js`,
`src/raft/raft-rs-durable-store-constants.js`, `src/raft/raft-rs-runtime-owner.js`,
`src/raft/raft-rs-runtime-owner-constants.js`,
`src/partition/partition-service-transaction-base.js`,
`src/partition/partition-service-raft-write-commit.js`,
`src/partition/partition-service-constants.js`; plus the six witnesses above and the
property-test repair. No port operation is added (constraint `port-unchanged` holds:
the refusal is an outcome of existing operations).

Attempt size, Layer 2 (own quest): 6-8 src files: `transaction-base.js`
(prepare/commit/rollback rewritten around the marker), `entry-apply-base.js`
(TRANSACTION_COMMIT executes `operations` in a nested savepoint, ABORTED outcome,
CDC in afterCommit), `write-metrics-base.js` (staging path), `partition-service-constants.js`,
`transaction-session-methods.js`, `partition-service-cdc-stream-base.js` (marker
ack), and the A2 reader for `reconstructPreparedState`; delete
`partition-transaction-handler.js` (dead second BEGIN owner) with its two tests.

## 5. Findings to record regardless of the decision (R17)

- Interactive transactions are not replicated on either backend (section 1, step 4;
  `entry-apply-base.js:1163-1178`).
- CDC for session commits fires before/without consensus (`transaction-base.js:708-710`).
- A sessionless write during a named session is applied inside that session and
  acknowledged, then erasable (T2), on the lone-leader path.
- `PartitionTransactionHandler` is a dead second owner of `BEGIN IMMEDIATE`.
- `transaction-durability-raft.property.test.js` reads durability from core memory
  after A1 (hollow green).
- The fitness detector's rationale for tolerating in-session commits
  (`durability-fitness.js:288-291`) is the same defect described from the other side.
