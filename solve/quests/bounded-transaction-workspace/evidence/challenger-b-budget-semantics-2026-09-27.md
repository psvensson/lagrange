# Challenger B: liveness budget, same-database and logical workspaces

Head reviewed: `292b7204334cf47617e675dd9b12bc708b682886`

Mode: read-only. No files were changed by the challenger.

## Verdict

- Correct the historical 350 ms premise; it is not a source-owned rs-raft
  election budget at this head.
- Keep the serialization STOP because `O(total partition bytes)` remains
  unbounded independently of the corrected timing.
- Reject same-database staging under the interactive private-workspace
  contract.
- Reject logical/minimal row workspaces under the retained SQL language.
- Put the candidate's real synchronous owner-thread slice, not off-thread
  total readiness, under the source-derived liveness budget.

## Liveness-budget audit

The earlier report derived 350 ms from a fixed 10-tick, 500--950 ms rs-raft
window. Current source shows otherwise:

- PartitionService passes replica-specific timing into the rs-raft port:
  `src/partition/partition-service-raft-init-base.js:411-435,452-459`.
- Runtime core creation consumes `tuningOf(group.timing)`:
  `src/raft/raft-rs-runtime-owner.js:394-402`.
- Tuning derives election ticks from `electionMinMs / tickIntervalMs`; ten is
  only a missing-input fallback:
  `src/raft/raft-rs-runtime-tuning.js:14-37` and
  `src/raft/raft-rs-group-constants.js:13-18`.
- Defaults are 1000 ms election minimum, 50 ms heartbeat and 20 ms tick:
  `src/config/config-definitions.js:35-41`.
- Replica-index jitter adds 2500 ms per index:
  `src/raft/replica-election-timeouts.js:22-48`.

The default derivation is therefore election ticks 50/175/300 and core
minimum windows 1000/3500/6000 ms before raft-rs randomization. Existing
cutover records independently describe that derivation and a roughly 5.03 s
held-leader replacement:
`solve/epics/raft-rs-full-cutover/design-r3-r4-message-groups-worker-wasm-2026-09-23.md:41-50`
and
`solve/epics/raft-rs-full-cutover/quest-records/raft-rs-single-path-partition-cutover/verification-round-4.md:89-93,278-281`.

| Audit question | Source-derived answer |
| --- | --- |
| Budget owner | Partition rs-raft timing and authoritative event-loop path: PartitionService timing, runtime tuning and follower election |
| Start event | A quorum-capable follower last steps a valid leader heartbeat/Append that resets election elapsed |
| Required finish | Leader process returns to tick/core, drains Ready/send, delivers a leader message, and the follower steps it before its randomized deadline |
| Overrun | A follower campaigns and may elect a successor; with `check_quorum=false`, the old leader learns the higher term only when it later drains inbound |
| Effect of public apply continuing | If authoritative tick/apply really continues, total off-thread workspace readiness may exceed an election interval; only uninterrupted authoritative-loop monopoly consumes election slack |

Tick scheduling and core/inbound admission are at
`src/raft/raft-rs-operation-port.js:213-218` and
`src/raft/raft-rs-runtime-owner.js:1190-1255`. The event-loop watchdog's
1000 ms default is diagnostic rather than the election contract:
`src/diagnostics/event-loop-gap-watchdog.js:29-36,484-505`.

The stopped copy experiment ran synchronous serialization in the test parent
against another connection while node processes continued apply:
`test/integration/transaction-active-owns-connection.integration.test.js:199-245,496-524`.
It proves coexistence for that external measurement and total-image scaling;
it does not measure a synchronous slice inside the partition leader process.

## Candidate D: same-database transaction/savepoint

### Consumed surfaces

- Public transactions are interactive and multi-statement with
  read-your-own-writes:
  `architecture/application-database-sessions.md:48-59,92-120,191-195`.
- Reads and writes use `this.db`:
  `src/partition/partition-service-write-metrics-base.js:51-120,193-235`.
- Current `BEGIN IMMEDIATE` is retained on that handle:
  `src/partition/partition-service-transaction-base.js:522-599`.
- The same connection owns rs-raft durable storage:
  `src/partition/partition-service-raft-init-base.js:452-475`.
- rs-raft refuses persistence while an external user transaction owns the
  handle because a savepoint would join it and rollback could erase consensus:
  `src/raft/raft-rs-durable-store.js:181-220` and
  `src/raft/raft-rs-durable-store-constants.js:201-213`.
- Canonical SQL effects and applied progress commit in one store-owned SQLite
  transaction:
  `src/raft/raft-rs-application-transaction-owner.js:30-62` and
  `src/partition/partition-service-entry-apply-base.js:1062-1119`.

### Verdict and edges

**REJECT.** A retained savepoint is the current writer-ownership failure. A
second connection holding `BEGIN IMMEDIATE` owns SQLite's sole writer and
blocks canonical apply. Releasing commits too early; rolling back each
statement loses cumulative state and read-your-own-writes. A brief commit-time
dry run is not an interactive workspace and would be a transaction-contract
redesign. SQLite rollback also cannot undo external UDF effects; current time
functions are translated to SQLite `...('now')`, so later replay is
nondeterministic: `src/query/pg/pg-function-registry.js:88-110,171-206`.

Required closed outcomes include `RAFT_RS_STORE_USER_TRANSACTION_OPEN`,
`WORKSPACE_WRITER_BUSY`, `WORKSPACE_PREMATURE_COMMIT`,
`WORKSPACE_VIEW_LOST`, `WORKSPACE_SCHEMA_MOVED`,
`WORKSPACE_IDENTITY_MOVED`, `WORKSPACE_UNSAFE_EFFECT` and
`WORKSPACE_SNAPSHOT_STALE`. No D variant maps all of them while retaining the
contract.

## Candidate E: logical/minimal workspace

### Consumed surfaces

- Current write-set tracking attempts one primary-key key and records nothing
  when it cannot derive one:
  `src/partition/partition-service-transaction-base.js:138-198`.
- UPDATE/DELETE accept arbitrary expressions:
  `src/query/sql-parser.js:450-470`.
- Scalar and `IN` subqueries are supported:
  `src/query/sql-parser-expression-methods.js:97-102,269-294`.
- Schema parsing includes keys, unique constraints and indexes:
  `src/query/sql-parser.js:473-545`.
- The public API accepts Buffer/Uint8Array binds:
  `src/query/application-database-input.js:104-153` and
  `architecture/application-database-sessions.md:127-137`.
- The current proposal codec is JSON-based and loses Buffer identity:
  `src/raft/raft-rs-proposal-codec.js:28-59`.
- The write language includes DML and CREATE/DROP/ALTER:
  `src/partition/partition-service-entry-apply-base.js:942-958`.

### Verdict and edges

**REJECT under the retained SQL contract.** Predicate/range/subquery reads,
absence facts, unique and foreign-key checks, cascading/recursive triggers,
expressions, DDL and later statements reading earlier writes do not have a
soundly enumerable row subset in the general language. Under-approximation is
wrong; safe over-approximation can scan the relation/database. Lazy page reads
from an immutable snapshot become A/B rather than logical E.

Required closed outcomes include `WORKSPACE_DEPENDENCY_UNKNOWN`,
`WORKSPACE_READSET_STALE`, `WORKSPACE_CONSTRAINT_UNPROVEN`,
`WORKSPACE_UNSUPPORTED_SQL`, `WORKSPACE_CANONICALIZATION_FAILED`,
`WORKSPACE_RESOURCE_LIMIT`, `WORKSPACE_IDENTITY_MOVED` and
`WORKSPACE_SNAPSHOT_EXPIRED`. Approving E requires an explicit owner REDESIGN
of the transaction language, which this quest may not perform.

## Cached views and identity anchors

Both D and E would need transaction/session ID, partition descriptor epoch,
atomic applied index, leader/runtime generation, schema generation, workspace
generation, canonical input digest, statement ordinal and (for E) dependency
set/encoding versions. No suitable replicated schema-generation owner exists
at this head; that is a new design surface. An authority move aborts rather
than mixing old and new state.

Logical-row caches add nonexistence facts, index/constraint dependencies,
trigger expansion and cumulative deltas. Any piecemeal refresh after the base
applied index moves changes transaction semantics, so an expired exact version
must close as `WORKSPACE_SNAPSHOT_EXPIRED`.

## Falsifier requirements

The performance witness must place candidate acquisition inside the real
partition process, keep public apply active, and measure separately:

1. snapshot/fence and identity capture;
2. workspace setup/open;
3. first read;
4. first write;
5. remaining execution/read-your-own-writes;
6. effect/batch derivation;
7. finalization/disposal/orphan cleanup.

Every phase records time and bytes/pages read, copied and dirtied. The fixture
matrix contains dense growing unrelated user data with a fixed tiny indexed
transaction; a history-shaped control; a fixed small base with increasing
transaction footprint; full serialization as the positive total-byte control;
and a metadata-only baseline. Fixtures are built and checkpointed outside
timing.

The real candidate run records apply acknowledgements and latency, applied
index progress, leader/term/campaigns, event-loop/tick gaps, RSS/external/
array-buffer memory, logical/allocated temporary bytes, descriptors/handles,
dirty/copy counts and orphan cleanup. Crash points follow acquisition, first
read, first write and pre-finalization. Semantic results compare against the
same canonical script on a full SQLite transaction, including result metadata,
errors, schema, BLOBs, constraints, triggers, subqueries, rollback and
nondeterministic-SQL refusal/rewrite.

Reference and slower-host runs go through the lab controller at one exact
committed SHA; no raw SSH. Warm/cold trials, fixture physical allocation,
filesystem features and size order are recorded so cache, sparseness or
reflinks cannot disguise total-state work.
