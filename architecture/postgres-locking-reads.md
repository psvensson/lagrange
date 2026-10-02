# PostgreSQL Locking Reads

Status: planned Phase 0.3 core contract

## Purpose

Lagrange currently provides epoch-based snapshot isolation, read-your-own-writes,
and first-committer-wins write-conflict detection at prepare. PostgreSQL clients
can parse and execute ordinary transactional reads, but the current PostgreSQL
SELECT AST does not preserve `FOR UPDATE` as an owned locking-read semantic.

This document prevents `SELECT ... FOR UPDATE` from becoming an adapter-only
compatibility patch or a benchmark-specific exception. Locking reads are a core
SQL/transaction capability and must be implemented through the owners that
already govern parsing, transaction state, participant enlistment, conflict
handling, timeout/cancellation, and recovery.

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

The exact wait/deadlock policy must be sealed before implementation. A local
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

Until this capability lands, TiDB and Lagrange may still be compared under a
preregistered database-independent snapshot/conflict/retry contract, but the
benchmark must not claim that TiDB `FOR UPDATE` and Lagrange ordinary snapshot
reads use equivalent locking mechanisms. Once this capability lands, Scenario A
should add a contention profile that exercises the public PostgreSQL locking-read
path directly.


## Sealed Phase 0.3 wait/conflict policy

The machine-readable owner/transition table is
`solve/specs/release-0-3-queryable-core/locking-read-wait-policy.json`.
It is the Phase 0.3 authority for conflict, release, timeout, cancellation,
crash, and recovery behavior.

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
`locking_read_reservation_conflict`. Second, the
`DistributedTransactionCoordinator` owns the terminal conflict-abort transition:
it rolls back the whole transaction, waits for rollback/release acknowledgement
from every already-enlisted participant, and only then reports
`transaction_aborted` with the reservation conflict as its cause. Earlier
reservations therefore cannot remain held after the caller observes terminal
abort.

Reservation lifetime is transaction-owned rather than TTL-owned. A participant
must not expire an unresolved reservation merely because its local clock
advances. Commit, rollback, transaction timeout, explicit cancellation, or
recovery resolution is what authorizes release. If a participant crashes,
durable reservation state remains unresolved state for transaction recovery;
restart must neither erase it nor invent a terminal outcome.

The observable failures remain typed and distinct: reservation contention,
transaction timeout, cancellation, and transaction abort must not collapse into
one generic retry result. This lets callers decide whether and when to retry
without moving retry correctness into PG wire.

### Exact machine-readable transition mirror

This prose mirrors the machine policy literally so ownership cannot drift.
There is **no waiter queue** and there is no participant **local TTL** release
authority. On conflict the coordinator must **confirm release** of reservations
held by earlier participants before the terminal abort is observable.

| Transition | Owner identifier | Action | Outcome identifier |
| --- | --- | --- | --- |
| acquire | `partition_transaction_participant` | create durable replicated reservation | `reservation_acquired` |
| same-transaction-reacquire | `partition_transaction_participant` | idempotently reuse the existing transaction reservation | `reservation_already_owned` |
| conflict | `partition_transaction_participant` | refuse without waiting and report the owning-transaction conflict | `typed_locking_read_reservation_conflict` |
| conflict-abort | `DistributedTransactionCoordinator` | roll back the whole transaction, confirm release acknowledgements, then report terminal abort | `transaction_aborted` |
| timeout | `DistributedTransactionCoordinator` | roll back the transaction and release every participant reservation | `typed_transaction_timeout` |
| cancellation | `DistributedTransactionCoordinator` | roll back the transaction and release every participant reservation | `typed_transaction_cancelled` |
| commit | `DistributedTransactionCoordinator` | commit, then release participant reservations | `committed_and_released` |
| rollback | `DistributedTransactionCoordinator` | roll back, then release participant reservations | `rolled_back_and_released` |
| crash | `partition_transaction_participant` | retain durable unresolved reservation state for recovery | `unresolved_reservation_preserved` |
| recovery | `DistributedTransactionCoordinator` | replay the terminal decision or rollback and reconcile reservations | `transaction_resolved_and_reservations_reconciled` |

The participant-level contention outcome remains
`locking_read_reservation_conflict`; `transaction_aborted` is the later
coordinator-owned terminal outcome after whole-transaction rollback and release
confirmation.

Blocking wait semantics, `NOWAIT`, `SKIP LOCKED`, and additional PostgreSQL
row-lock strengths are not silently layered on this policy. Introducing a
waiter queue or wake-up owner requires a superseding policy because it would
change the deadlock and recovery model.
