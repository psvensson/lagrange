# Distributed-transaction replicated apply: current mechanism (phase 1, 2026-09-26)

Quest `distributed-transaction-replicated-apply`, phase 1. This phase gathers
evidence only. Nothing here repairs anything.

- Finding: F-TX-REPLICATED-APPLY.
- Heads measured: the WIP heads named in Measurements. Their src is identical to 19995c7bc; only tests and helpers changed.
- Source head read: 19995c7bc. `git diff --stat 33885263f 19995c7bc -- src/`
  is empty, so every src citation below holds on main 33885263f too.
- The line-by-line census is the read-only census report produced in parallel
  for the lead (`tx-census-report.md`, scratchpad of the lead's session). This
  document merges its table and cites it rather than re-deriving it. It also
  merges a second read-only investigator's CDC, 40 s and PREPARE answers.

## The claim under test (frozen)

> After a distributed transaction's COMMIT is acknowledged to the public
> application session, the transaction's rows are present in the authoritative
> SQLite state of EVERY replica of the affected partition, exactly as an
> autocommit row is.

Verdict: FALSE, measured on a real three-process RF=3 cluster. The
Measurements section below gives the numbers.

## Current state machine

The table follows one transaction from `db.transaction` to recovery. For each
step it gives the owner, the durable state produced, whether that state is
replicated, and whether the client's success waits for it.

| # | Step | Owner (file:line at 19995c7bc) | Durable state produced | Replicated? | Awaited before the client sees success | Idempotency key | Recovery authority |
|---|---|---|---|---|---|---|---|
| 1 | `db.transaction()` | src/query/application-database.js:456-536 (BEGIN :475-481, COMMIT :519-525) | none (in-process session record) | n/a | yes, waits for the COMMIT result | `sessionId = application:<id>:<uuid>` :463 | one ROLLBACK when the callback fails |
| 2 | pgwire BEGIN/COMMIT | src/runtime/pgwire-protocol-handler.js:602-681 | none | n/a | yes | pg session | none: a failed session stays FAILED |
| 3 | SqlCore dispatch | src/query/sql-query-engine-statement-execution.js:473-479; sql-query-engine.js:352-401 | none | n/a | yes | sessionId | none |
| 4 | Coordinator BEGIN | src/query/distributed/distributed-transaction-coordinator.js:195-262 | `sql_transactions` row, written as an autocommit system-table write | yes (the coordinator row only) | yes | transactionId = f(sessionId) | 60 s budget (control-plane/timeout-budget.js:20), then the recovery sweep |
| 5 | Participant BEGIN | coordinator.js:299-345 -> sql-query-engine.js:530-575 -> partition-service-entry-apply-base.js:384-446 -> partition-service-transaction-base.js:522-593 (`BEGIN IMMEDIATE` :573) | an open SQLite transaction on the one connection of whichever replica answered (no leader check) | NO | yes | sessionId; a second session is refused :560-565 | 60 s hold sweep (:375-448) |
| 6 | Statement inside the transaction | partition-service-write-metrics-base.js:113-119 -> `executeTransactionWrite` :193-235 (`stmt.run`, push to `operations`) | uncommitted page change on the staging replica only | **NO**: `proposeWrite` is used only by the autocommit branch | the client sees `changes` | entryId minted, **never checked** | ROLLBACK, hold sweep, or process death |
| 6b | Autocommit write, for contrast | applyWrite -> partition-service-raft-write-commit.js:108-231 (`raft.propose`, then waits for commit) | committed log entry plus a statement-outcome row on every replica | yes | yes | `entry:<entryId>` in `_partition_statement_outcomes` | log replay |
| 7 | PREPARE (2PC) | transaction-base.js:605-662: in-memory conflict check, then "No PREPARE marker ... LOCAL_STAGING" | none (moves an entry between two maps) | NO, since 64f420ace | yes | sessionId | hold sweep |
| 8 | Commit decision | coordinator.js:460-499; distributed-transaction-commit-mode.js:20-41 (one participant => 1PC); distributed-transaction-protocol.js:206-377 | `sql_transactions` status rows | yes (the rows only) | yes: success follows sequential `commitParticipant` calls | transactionId | recovery.js sweep, only after the budget expires |
| 9 | Participant COMMIT | transaction-base.js:669-751: outcome upsert :693, local `COMMIT` :698, `replicateTransactionCommit` :701 -> :904-921 -> `proposeTransactionMarker` :933-958, CDC :707-710, return | a local SQLite commit plus a local `_transaction_outcomes` row | marker only. It is proposed ONLY if this replica is the Raft LEADER (:941-943), fire-and-forget (not awaited), and a failure is logged at debug | local COMMIT yes; **consensus NO** | (session_id, transaction_epoch) | none |
| 10 | Participant ROLLBACK | transaction-base.js:763-849; marker :960-978 (same leader-only fire-and-forget path) | none | marker only (recorded, not applied) | yes | idempotent when no transaction is open | keeps the session visible when a heal is not permitted |
| 11 | Raft proposal | operation port `propose` (liferaft-provider.js:286 / raft-rs-operation-port.js:240) | log entry | yes, when reached | autocommit yes; the transaction marker no | entryId (autocommit only) | provider log |
| 12 | Raft apply | partition-service-entry-apply-base.js:1017-1152. SQL types: `stmt.run` :1079 plus an outcome row. TRANSACTION_COMMIT: `recordTransactionCommitOutcome` only (:1121-1136); `command.operations` is only counted for a debug log (:1131) | the outcome row only | yes | n/a | outcome PK | replay |
| 13 | SQLite mutation and reads | one WAL connection per replica, partition-service-raft-init-base.js:383 | | | | no `busy_timeout` | reads on the staging replica see the open transaction's uncommitted rows |
| 14 | Outcome record | `_transaction_outcomes` (constants.js:84-102). Writers: the staging replica :693 (inside the user transaction) and the marker apply :1123 on every replica that applies a marker. Reader: :875-902 (1PC commit-miss resolution) | one row per replica that saw either writer | partial | | PK (session_id, epoch) | **the answering replica's row, not a quorum** |
| 15 | CDC | from commitTransaction :707-710 on the staging replica, whatever its role, after the local COMMIT and before or without any marker commit. Autocommit CDC comes from apply on the leader only (:1102-1117) | subscriber delivery or the buffer | n/a | the transaction CDC is awaited before the participant answers | none | none |
| 16 | Recovery/replay | hold sweep (60 s, 1 s cadence, refused on a non-solo leader :389-401); durability fitness (partition-service-durability-fitness.js:147-203, 60 s hold); coordinator sweep; `reconstructPreparedState` (:67-140, reads rs-raft tables only, inert under liferaft); snapshot install (`db.backup` of the whole file) | | | | | **elapsed time, on every path** |

Two routing facts from the census (§5):

- `beginTransaction` has no leader check, so a BEGIN can stage on a follower.
- The session is then pinned to that follower. The follower redirects the
  session's writes to the leader (entry-apply-base.js:690-706). There they run
  as replicated autocommit writes, while the follower holds an idle
  `BEGIN IMMEDIATE`.

The same statement is therefore either local-only or replicated, depending on
which replica answered BEGIN. The settling run records which replica staged.

## History of the PREPARE marker (not assumed to be the fix)

- 12a52da9a (2026-03-08) introduced `replicatePreparedTransaction`.
  - It proposed `{type: PREPARE_TRANSACTION, sessionId, epoch, writeSet: [keys], timestamp, proposedBy, proposedAt}`.
  - It was proposed leader-only, fire-and-forget, inside the user's `BEGIN IMMEDIATE`.
  - Verified in `git show 64f420ace^:src/partition/partition-service-transaction-base.js:978-1004`.
- Follower apply had no branch for it ("recorded in the log only").
- Its only consumer was `reconstructPreparedState` on leader election. That
  rebuilt `preparedTransactions` with `operations: []`, for conflict checks
  only.
- **It never carried mutation content.**
- 64f420ace (2026-09-23, "wip: attempt A4 ... implementer output, unverified")
  deleted the PREPARE marker. It also reordered commit to: outcome row, local
  COMMIT, then marker. It reordered rollback to: local ROLLBACK, then marker.
  The reason was the rs-raft persistence admission (a consensus row must never
  be written inside a user transaction). The deletion removed conflict
  reconstruction on failover. It did not remove replication of data, because
  there never was any.
- From 30d64250a (2026-01-19, the first real commit) in-transaction writes
  never went through `proposeWrite`, and `operations[]` rode in
  TRANSACTION_COMMIT from day one.
- The earliest apply branch (2e0f6976c / 12a52da9a) is a debug log only, with
  the comment "operations already applied" (the lineage continues through
  e2797b6c8).
- No version ever executed `operations` on a follower.

Restoring PREPARE would therefore bring back failover conflict state, not
replica data.

## CDC origin

- Transactional CDC is published by `commitTransaction`
  (transaction-base.js:707-710 -> partition-service-cdc-stream-base.js:82) on
  the staging replica, from local execution.
  - This happens after the local COMMIT.
  - The marker has at most been proposed (not committed) by then, and none is
    proposed at all when the staging replica is not the leader.
  - There is no role check.
- Autocommit CDC is published from apply, on the leader only (entry-apply-base.js:1102-1117).
- The marker apply publishes nothing.
- An application table has no subscriber: partition CDC propagation is
  attached only for cache-hydration system tables
  (src/bootstrap/shared/cdc-propagation-filter.js:20-22), and live queries
  observe only the SystemTableCache.
  - The event is therefore parked in the partition's `cdcEventBuffer`
    (external CDC is allowed by default for user tables,
    partition-cdc-delivery.js:184-214).
  - It is logged at warn: "CDC event buffered while no subscribers
    registered", with tableName, operation and partitionId.
  - That log line is the measurement used below.
- **Consequence:** CDC publishes mutations that the replicated state machine
  never applied. A follower that later becomes leader never publishes them,
  and never has them. This violates R7 (CDC follows authoritative apply).

## Where the authoritative replicated mutation is absent

This is not a repair design.

Between `executeTransactionWrite` (write-metrics-base.js:193-235) and the
acknowledgement from `commitTransaction` (transaction-base.js:669-751),
nothing is proposed to consensus:

- Each statement mutates only the staging replica's SQLite connection, inside
  the user's `BEGIN IMMEDIATE`.
- PREPARE moves a map.
- COMMIT commits locally, records a local outcome row, and publishes CDC. The
  participant then answers, and the coordinator acknowledges.

Only after the local COMMIT, and only if this replica is the Raft leader, is
a TRANSACTION_COMMIT marker fire-and-forgotten. That marker does carry the
statements (`operations[]`), and lab run 3 found it in every replica's rs-raft
log. But every replica's `applyCommittedEntry` (:1121-1136) applies it as
"record the outcome row" and discards `operations[]`.

The authoritative replicated mutation is therefore absent in two places:

- **In time.** Nothing is in the log before success is acknowledged. When
  the staging replica is not the leader, nothing is ever in the log.
- **In apply.** The payload that does reach the log is not the state-machine
  mutation, because no apply executes it.

The autocommit path (`applyWrite -> startPartitionRaftWriteCommit`,
partition-service-raft-write-commit.js:217-231, then apply :1062-1119) is the
only owner that does all of the following:

- proposes a deterministic mutation;
- waits for its commit before answering;
- applies it on every replica, with an idempotent outcome row;
- publishes CDC from apply.

The transaction path never enters it.

Both providers feed the same `applyCommittedEntry`, and the propose-and-wait
seam is generic (the operation port `propose` plus the `waitForCommittedWrite`
registry). What is missing is a committed-command type whose apply executes a
transaction's statement list atomically. That is a partition
transaction/apply owner concern, not a provider seam.

## Measurements

All measurements are from real three-process clusters (one embedded runtime
per OS process, default RF 3) on one lab host per run. The harness is
test/integration/helpers/embedded-cluster-harness.js.

Replica state was read directly: every replica file
`<dataDir>/partitions/<partitionId>/<replicaId>.db` was opened read-only by
test/integration/helpers/replica-sqlite-observer.js, never through a routed
read.

The raw evidence (JSON plus the three node logs per run) is written
untracked, on the lab host, under
`<owning checkout>/test-output/transaction-replicated-apply/`. It was copied
back to the lead's scratchpad under `evidence/lab{1,2,3,4}/`. Paths are per run
below.

### Step 1: settling experiment

Test: `test/integration/transaction-replicated-apply-settling.integration.test.js`.

Two runs gave the same settled table.

- Lab run 2: tv-dator, factor 1.4, WIP head 105e452f3,
  `settling-2026-09-26T12-57-22-320Z/`.
- Lab run 3: tv-dator, factor 1.33, WIP head 4119fd8b6,
  `settling-2026-09-26T13-10-46-983Z/`.

The run 3 numbers:

- Formation: all three nodes active after 31.0 s; application writes served
  21.8 s later.
- `CREATE TABLE` was served in 4.0 s.
- The table is one partition, `tbl-c61739c58d5f9bc1fc549aeafada6fe2-p1`,
  with three replica files.
- `partitions.leader_node_id` is the seed. The seed is also the replica that
  staged T1.
- T1 = `db.transaction(INSERT tx_a; INSERT tx_b)` on the seed's public
  session: fulfilled (1PC, a single participant).
- A1 = autocommit `INSERT control`: acknowledged 16-18 ms after the T1 ack,
  with durableCommitWitness term 1, log index 3.

| node | role | leader (partition row) | tx_a | tx_b | control | `_transaction_outcomes` | rs-raft log: TRANSACTION_COMMIT marker | rs-raft log: control entry |
|---|---|---|---|---|---|---|---|---|
| seed 6d24cde4 | staging | yes | 1 | 1 | 1 | 1 (COMMITTED) | index 2, term 1, operations [[tx_a,v],[tx_b,v]] | index 3 (QUERY) |
| joiner 20bdeede | follower | no | **0** | **0** | 1 | 1 (COMMITTED) | index 2, term 1, same operations | index 3 |
| joiner 011f3b80 | follower | no | **0** | **0** | 1 | 1 (COMMITTED) | index 2, term 1, same operations | index 3 |

- **First seen, in ms after the commit ack.** The first file poll was at
  37 ms. At that poll the staging replica already had tx_a, tx_b and control,
  and both followers had control.
- **Followers never received tx_a or tx_b** during the 42.1 s settling window.
  This was the same in run 2.
- **Ordering.** The commit was acknowledged before any follower had the rows.
  They never arrived by any mechanism.
- **The marker reached every replica.** Every replica's log holds the
  TRANSACTION_COMMIT marker. It was proposed by the staging replica, which was
  the leader, and it carries both statements. Every follower applied it: the
  follower's `_transaction_outcomes` row is COMMITTED. Applying it wrote no
  data.
- **The mutation is therefore IN the replicated log, as marker payload.** It
  is discarded at apply, and it was proposed only after the acknowledgement,
  fire-and-forget and leader-only.
- **The code reading is confirmed. The claim is false.**
- **Physical fact that contradicts memory.** The replica files hold
  `_raft_rs_log`, `_raft_rs_hard_state`, `_raft_rs_applied_state`,
  `_raft_rs_snapshot` and `_raft_rs_replica_lifecycle`, and no `_raft_log`.
  So at this head the partitions run on the rs-raft backend
  (partition-service-raft-init-base.js `createOperationPort`, dd443f901
  lineage), even though the process-level provider label resolves to liferaft
  (raft-provider-control.js).
- **Provider neutrality.** The statements in the census about the partition
  log running on liferaft (shared connection, no inTransaction guard) do not
  describe this head's partitions. The rs-raft persistence admission does.
  The defect is provider-neutral: it lives in the transaction owner and the
  apply of TRANSACTION_COMMIT.

Public reads before the leader change came from lab run 2: six samples per
node of `SELECT id ... WHERE id IN (tx_a, tx_b, control)`.

- All three nodes returned [control, tx_a, tx_b] in every sample. These reads
  were served by the leader/staging replica.
- The public symptom does appear when a read lands on a follower. In lab run 3,
  step 4, round 3, the writer node's reads of that round's committed
  transactional rows returned [] in 2 of 30 samples (`current`) and 1 of 30
  (`history`). The other samples returned the row.

### Step 2: leader-change falsifier

The staging node (the seed, also the partition leader) was stopped: a graceful
stop, then SIGTERM.

- **Lab run 2.**
  - Stopped in 671 ms.
  - A surviving joiner, b13c13ef, accepted a new autocommit write 4.0 s later,
    on the first attempt, with durableCommitWitness term 2 and leader
    b13c13ef.
  - Both surviving replica files: tx_a=0, tx_b=0, control=1.
  - Public reads on both survivors, 6 samples each: [control] only.
  - **Outcome: "acknowledged transaction durability violated".** Rows whose
    COMMIT was acknowledged to the application are gone from the cluster.
- **Lab run 3.**
  - Stopped in 502 ms.
  - No surviving node accepted a write within 151 s. There were 5 attempts,
    each rejected with DISTRIBUTED_PARTICIPANT_FAILURE after almost exactly
    30.0 s (the 30 s query timeout).
  - Survivor logs in that window:
    - "Distributed write failed due to participant failures" x171 / x178.
    - "Canonical partition leader service missing" x12.
    - "Leader-row publication deferred: authoritative row unreadable" x8.
    - "Failed to update system table row" x26 / x28.
    - Heartbeat failures.
  - The surviving files still lacked tx_a and tx_b. Public reads on both
    survivors returned [control].
  - Outcome: durability violated, with no write leader within the window.
  - Write availability after the loss of the seed is a separate, intermittent
    finding. It is routed to the lead (F-TX-LEADER-CHANGE-WRITE-AVAILABILITY,
    control-plane leader-row publication after node loss) and is not
    investigated here.
- Nothing reconstructed the rows from the markers in either run, and nothing
  received them by any other mechanism.

### Step 3: CDC origin

An application table has no CDC subscriber, so each published event is
buffered and logged at warn with `tableName`/`partitionId`. The counts per
node, for `settle_rows`, in lab runs 2 and 3:

- Seed (staging and leader):
  - Two INSERT events at -32/-31 ms and -31/-31 ms relative to the commit ack.
    These are the transaction's rows, published by `commitTransaction`
    (:707-710) before the application saw success.
  - One INSERT at +15 / +18 ms. This is the control row, published from the
    leader's apply (:1102-1117).
- Both followers: 0 events.

The publishing owner is the staging replica's transaction commit path, which
publishes from local execution. The replicated state machine never applied
those mutations on 2 of 3 replicas. No consumer-visible CDC artifact exists
for application tables (the events sit in the partition's buffer), so no
cache diverges today. But the published stream contains mutations that are
absent from the authoritative state of the replicas that will serve after a
leader change. That breaks R7.

### Step 4: the ~40 s read outage

Test: `test/integration/transaction-concurrent-read-outage.integration.test.js`.

There were ten rounds across four lab runs:

- lab run 1: adam-laptop x1.8, `concurrent-read-outage-2026-09-26T12-43-17-053Z/`;
- lab run 2: tv-dator, `...T12-56-01-999Z/`;
- lab run 3: tv-dator, `...T13-09-00-230Z/`;
- lab run 4: tv-dator, `...T13-22-55-474Z/` (see below).

Each round ran two concurrent top-level `db.transaction` calls on `current`
and `history` through one seed session. The rounds were:

- the plain pair;
- the pair after a duplicate-PK failure;
- the pair after the images-seam I2 failure sequence. That sequence was: a
  first-statement dup (answered DISTRIBUTED_PARTICIPANT_FAILURE), a caught
  failure that continues (answered DISTRIBUTED_PARTICIPANT_FAILURE), and raw
  COMMIT text (answered TRANSACTION_CONTROL_RESERVED).

Results:

- Every round: one transaction fulfilled. The other was rejected at once
  with `INTERNAL_ERROR: Transaction already active on this partition`
  (deferred=false, retryAfterMs=null).
- In every round, the reader (a joiner) and the writer (the seed) each
  sampled both tables 30 times in a row successfully within 3.2-4.1 s.
- **The read outage was not reproduced.** There were 0 failed reads in 10
  rounds.
- The winner's rows were again on exactly one replica per partition. Each
  partition's staging replica held them. `_transaction_outcomes` COMMITTED
  rows were on all three replicas.

What the code says (read-only census, both investigators):

- No 40 000 ms constant exists.
- The refused BEGIN leaves nothing on the participant.
- The winner's `BEGIN IMMEDIATE` holds the replica's single connection until
  its COMMIT.
- Under rs-raft (which, as measured above, is what partitions run), the
  persistence admission refuses every append and apply on that replica while
  a user transaction is open (raft-rs-durable-store.js:180-205). No ticks,
  heartbeats or applies happen, and autocommit writes are deferred
  (WRITE_DEFERRED_USER_TRANSACTION_OPEN).
- The hold sweep (60 s, heal refused on a non-solo leader), durability
  fitness (60 s) and the coordinator sweep (after the 60 s budget) all
  recover by elapsed time.
- The nearest composites to 40 s are 30 s pending-request plus 5 s delivery
  plus retries, or the 30 s sweep-defer plus 10 s.

Verdict: not proven to be the same mechanism, and not reproduced. It shares
the owner and the lifecycle: a user transaction holds the partition's one
connection outside consensus, and only elapsed time recovers it. To pin it,
capture a reproduction's `partitionErrors` and the
STUCK_TRANSACTION_HEAL_DEFERRED / LEADER_DURABILITY_UNFIT /
WRITE_DEFERRED_USER_TRANSACTION_OPEN log lines. The suite already records
those lines and the error detail in every round.

### Lab run 4: verification of the committed test shape

Lab run 4 ran on tv-dator (factor 1.3) at WIP head 9dfefb909, whose tree is
the tree of this commit apart from this document. The change cone was 187
files, all 187 passing, with 4761 assertions.

- **Settling witness:** 12 assertions, 287.2 s
  (`settling-2026-09-26T13-24-34-233Z/`).
  - The same table as run 3. Staging = leader = seed. Both followers: tx_a=0,
    tx_b=0, control=1, outcome row 1, marker in the log with both operations.
  - CDC was published on the seed only, at -30/-30 ms and +19 ms.
  - Leader change: the seed was stopped in 596 ms. No surviving node accepted
    a write within 121.5 s (4 attempts of about 30 s each). Both survivors'
    files lacked the rows, and their public reads returned [control] in 6/6
    samples each.
  - Outcome: "acknowledged transaction durability violated (no surviving node
    accepted a write within the window)".
- **Concurrent read outage:** 5 assertions, 98.7 s
  (`concurrent-read-outage-2026-09-26T13-22-55-474Z/`). Three rounds; one
  transaction fulfilled and one INTERNAL_ERROR in each; 0 read failures.
- **Tally across lab runs 2-4 (3 settling runs):**
  - The follower divergence held in 3 of 3 runs.
  - Durability was violated after the leader stopped in 3 of 3 runs.
  - A surviving node accepted a write within the window in 1 of 3 runs
    (4.0 s; not in 151 s or 121 s).
  - The read outage appeared in 0 of 10 concurrent rounds.


## Docs contradicted by the measured behaviour

- architecture/process-replication.md:278 "Reads may be served by any
  routable replica" is true of routing. For committed transactional rows it
  yields [] from followers.
- architecture/process-replication.md:282-285 "A partition's prepared state
  is a durable `PREPARE_TRANSACTION` Raft entry, so prepared writes survive
  leader failover." No such entry has existed since 64f420ace. Nothing about
  a transaction survives failover.
- architecture/process-replication.md:290 "A write is acknowledged after
  majority commit." This is false for every in-transaction statement and for
  COMMIT.
- architecture/postgres-wire.md:262-264 "appends `PREPARE_TRANSACTION` in its
  Raft log before prepare success" is false.
- architecture/postgres-wire.md:274-276 says 1PC replay resolves from "the
  participant's SQLite-atomic outcome record". That record is atomic with the
  local commit only, and it is read from whichever replica answers.
- src/partition/partition-service-transaction-base.js:664-667 says "Ensures
  durability through Raft replication before acknowledging." This is false.

## Files and owners involved (read-only in phase 1)

- src/partition/partition-service-transaction-base.js: prepare, commit and
  rollback, marker construction, the outcome record.
- src/partition/partition-service-entry-apply-base.js: the TRANSACTION_COMMIT
  apply and the participant BEGIN/COMMIT dispatch.
- src/partition/partition-service-write-metrics-base.js:
  `executeTransactionWrite`.
- src/partition/partition-service-raft-write-commit.js: the propose-and-wait
  unit a repair must reuse, not duplicate.
- src/partition/partition-committed-command-admission.js and
  partition-service-constants.js: committed command types.
- src/partition/partition-service-cdc-stream-base.js: the CDC publication
  point.
- src/query/distributed/distributed-transaction-protocol.js and
  distributed-transaction-coordinator.js: commit acknowledgement, and 1PC
  outcome resolution from the answering replica.
- src/query/sql-query-engine.js:530-575 and src/query/query-executor-base.js:
  participant BEGIN leader-binding and session affinity.
- Interacting, unchanged: partition-service-durability-fitness.js, the hold
  sweep, distributed-transaction-recovery.js.
- Not touched, and read-only by rule: src/raft/**. The rs-raft persistence
  admission (raft-rs-durable-store.js:187-205) refuses consensus persistence
  while a user session holds the connection. This is the interaction that
  64f420ace reacted to, and it applies to this head's partitions (measured).
