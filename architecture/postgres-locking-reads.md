# PostgreSQL Locking Reads

Status: implemented path; full cross-node and recovery qualification unverified

## Purpose

The PostgreSQL parser preserves `FOR UPDATE` in the SELECT AST. The SQL engine
enlists its participants in authoritative mode and invokes reservation execution;
the implemented contention policy is fail-fast, with SQLSTATE `55P03`.
The transaction model uses staged read-your-own-writes over committed state;
it does not promise full serializable isolation or a global snapshot.

The production binding is
[`SQLQueryEngineSelectExecution`](../src/query/sql-query-engine-select-execution.js),
with canonical syntax in
[`sql-locking-read-grammar.js`](../src/query/sql-locking-read-grammar.js).
Reservation execution still includes
[`sql-locking-read-execution.js`](../src/query/sql-locking-read-execution.js) and
its process-local bookkeeping/SQLite mirror. Their presence alone cannot prove
distributed exclusion. The
authoritative-reservations owner
must reconcile that path with replicated participant authority and prove all
conflicting write consumers, restart and leader change through public clients.
The requirements below remain obligations, not claims that those gates passed.

## Initial supported contract

The first slice is PostgreSQL `SELECT ... FOR UPDATE` for application tables.
Other PostgreSQL row-lock strengths (`FOR NO KEY UPDATE`, `FOR SHARE`,
`FOR KEY SHARE`) are explicitly later compatibility work unless a superseding
contract brings them into the same implementation.

A successful `FOR UPDATE` statement must:

1. survive PostgreSQL parsing as an explicit semantic field rather than being
   accepted and discarded;
2. resolve the rows/keys using the normal `SqlCore` planning/routing path;
3. establish transaction-owned write intent/reservation on the relevant
   participant(s), using one transaction-layer owner rather than PG-wire-local
   state;
4. keep that intent until commit, rollback, timeout, cancellation, or recovery
   resolves the transaction;
5. prevent a conflicting transaction from silently proceeding as though the
   locking read had been an ordinary snapshot read;
6. define a deterministic conflict/wait/refusal outcome with bounded timeout and
   cancellation behavior;
7. preserve multi-partition transaction correctness and participant recovery;
8. expose typed diagnostics sufficient to distinguish contention, timeout,
   cancellation, and transaction abort.

The sealed initial policy is fail-fast with no waiter queue. A local
mutex, PG-session-only lock table, benchmark-only retry loop, or per-node cache
is not an acceptable authority because it would not survive routing, failover,
or distributed transactions.

## Ownership

- PostgreSQL parser/translation owns recognizing and preserving the locking-read
  clause in the canonical SQL AST.
- `SqlCore` owns dispatching the canonical locking-read semantic.
- `DistributedTransactionCoordinator` owns transaction lifecycle and participant
  enlistment.
- The partition transaction participant owns the durable/replicated effect of a
  row/key reservation and the conflict decision at the data owner.
- PG wire owns protocol/session transport only; it must not reimplement lock
  semantics.

The interaction between SQL planning and transaction participants must be one
named contract. Consumers must not infer lock state independently.

## Proof requirements

The capability is not complete when a parser accepts the syntax. Required proof
includes:

- parser tests showing `FOR UPDATE` is retained in the canonical AST and ordinary
  SELECT remains unchanged;
- deterministic two-transaction tests showing a locking read changes the
  conflicting writer's observable outcome according to the sealed policy;
- commit and rollback release proofs;
- timeout/cancellation release proof;
- multi-partition locking-read proof where selected rows span participants;
- restart/recovery proof for any durable or replicated reservation state;
- red-on-revert proof through the public PostgreSQL path, not only an internal
  transaction helper;
- explicit verification that no PG adapter, benchmark adapter, or local cache is
  a second lock authority.

## Benchmark consequence

Comparisons claiming locking-read equivalence must establish equivalent
declared semantics through the public locking-read path. Parser support, source
binding and local-map tests do not establish equivalence with TiDB locking
behavior. A preregistered database-independent snapshot/conflict/retry comparison
remains possible; it must state that scope and cannot substitute ordinary
snapshot reads for promised locking reads. See the
[current capability boundary](../docs/current-capabilities-and-limitations.md).


## Sealed Phase 0.3 wait/conflict policy

The initial machine-readable `locking-read-wait-policy.json`
records the fail-fast conflict and transaction-owned release contract. The
current [TX1 decision owner](../src/query/distributed/distributed-transaction-decision-protocol.js)
also governs timeout, cancellation and recovery: once COMMIT is recorded, the
transaction must complete that decision rather than roll back.

The initial locking-read slice is deliberately **fail-fast**, not blocking.
When a partition transaction participant finds a reservation owned by another
transaction it returns a typed reservation-conflict refusal immediately. It
does not enqueue the requester, poll for release, or create a wake-up
obligation. PG wire transports that outcome and remains transport-only.

This choice matches the transaction model already present in Lagrange and keeps
one owner per concern:

- the partition transaction participant owns durable/replicated reservation
  acquire, idempotent same-transaction reacquire, conflict detection, and the
  participant-side effect of release;
- `DistributedTransactionCoordinator` owns transaction lifetime, participant
  enlistment, timeout/cancellation resolution, whole-transaction rollback,
  commit decision, and recovery re-drive;
- no session-local lock map, local mutex, benchmark retry loop, or node-local
  cache is reservation authority.

A conflict on **any** participant has two explicit owned transitions. First, the
participant refuses the reservation and reports
`typed_locking_read_reservation_conflict`. Second, the
`DistributedTransactionCoordinator` owns the terminal conflict-abort transition:
it rolls back the whole transaction, waits for rollback/release acknowledgement
from every already-enlisted participant, and only then reports
`transaction_aborted` with the reservation conflict as its cause. Earlier
reservations therefore cannot remain held after the caller observes terminal
abort.

Reservation lifetime is transaction-owned rather than TTL-owned. A participant
must not expire an unresolved reservation merely because its local clock
advances. Commit or rollback settlement authorizes release. Timeout and
cancellation ask the transaction owner to resolve work; they do not revoke a
recorded COMMIT. If a participant crashes,
durable reservation state remains unresolved state for transaction recovery;
restart must neither erase it nor invent a terminal outcome.

The observable failures remain typed and distinct: reservation contention,
transaction timeout, cancellation, and transaction abort must not collapse into
one generic retry result. This lets callers decide whether and when to retry
without moving retry correctness into PG wire.

### Initial policy mirror and current resolution boundary

The following table preserves the initial machine policy's exact transition
vocabulary, required by its source guard. It is a policy record, not execution
evidence. Its timeout and cancellation rollback actions cannot authorize
rollback after the current TX1 owner has recorded COMMIT; current resolution
must consume that decision as described below. The authoritative-reservations
owner must reconcile the initial policy and its guard with that retained-decision
contract before claiming complete qualification.
There is **no waiter queue** and there is no participant **local TTL** release
authority. On conflict the coordinator must **confirm release** of reservations
held by earlier participants before the terminal abort is observable.

| Transition | Owner identifier | Action | Outcome identifier |
| --- | --- | --- | --- |
| acquire | `partition_transaction_participant` | create durable replicated reservation | `reservation_acquired` |
| same-transaction-reacquire | `partition_transaction_participant` | idempotent reacquire existing reservation | `reservation_already_owned` |
| conflict | `partition_transaction_participant` | refuse without waiting and report owner conflict | `typed_locking_read_reservation_conflict` |
| conflict-abort | `DistributedTransactionCoordinator` | on participant conflict rollback whole transaction wait for release acknowledgements then report terminal abort | `transaction_aborted` |
| timeout | `DistributedTransactionCoordinator` | rollback transaction and release all participant reservations | `typed_transaction_timeout` |
| cancellation | `DistributedTransactionCoordinator` | rollback transaction and release all participant reservations | `typed_transaction_cancelled` |
| commit | `DistributedTransactionCoordinator` | commit transaction then release participant reservations | `committed_and_released` |
| rollback | `DistributedTransactionCoordinator` | rollback transaction then release participant reservations | `rolled_back_and_released` |
| crash | `partition_transaction_participant` | retain durable reservation state for transaction recovery | `unresolved_reservation_preserved` |
| recovery | `DistributedTransactionCoordinator` | replay terminal decision or rollback then reconcile participant reservations | `transaction_resolved_and_reservations_reconciled` |

The participant-level contention outcome remains
`typed_locking_read_reservation_conflict`; `transaction_aborted` is the later
coordinator-owned terminal outcome after whole-transaction rollback and release
confirmation.

Coordinator-managed transactions prepare every participant, including a single
participant, and record one decision before fanout. Recovery consumes the exact
transaction's retained decision. Missing sessions or replies do not prove abort;
unavailable authority leaves an explicit unresolved obligation. A recorded COMMIT
can have incomplete participant settlement, which remains owned for recovery.
Applicable evidence is owned by
the TX1 transaction owner and the
authoritative-reservations Quest; full current-candidate composition remains
unverified until those owners admit it.

Blocking wait semantics, `NOWAIT`, `SKIP LOCKED`, and additional PostgreSQL
row-lock strengths are not silently layered on this policy. Introducing a
waiter queue or wake-up owner requires a superseding policy because it would
change the deadlock and recovery model.
