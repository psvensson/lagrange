# Durable owed-work admission

Status: implemented author candidate, sealed against the measured D1 F2 failure. The source manifest and receipt record focused evidence; independent approval, composition and release acceptance remain pending.

The predecessor admitted 6,000 owed updates over ten live rows. Reclamation of delivered rows and a finite set of CDC-carrying tables cannot bound those owed rows. This correction keeps the ledger as the sole debt authority and the existing partition proposal/application owners as the only admission path.

## Capacity and linearization

One partition may owe at most 4,096 event obligations. This is an outstanding-work count, not a new per-event payload, target-vector or transaction-size cap. Existing supported operation batches fit within it. Report encoded payload bytes separately; count admission does not establish a fixed byte bound. The supported 2 MiB and over-64-target W9 inputs remain required.

An ordinary statement conservatively demands one slot if the existing table recording policy and command origin can emit CDC. A PREPARE demands its whole carried operation count. A carried batch larger than the entire capacity is refused typed and non-retryably, rather than waiting for impossible drain; every batch admitted by the existing 256-operation staging contract still fits. This is an invalid-producer guard, not a reduction of supported input. No-op statements may reserve more than they eventually emit; they never reserve less. Snapshot transfer is not a new logical mutation and retains its existing exclusion. Tables that owe no CDC have zero demand.

The pre-proposal check avoids accepting more work when the durable prefix is already full. The same ledger capacity check runs synchronously inside committed application, before ordinary SQL effects or a new PREPARED row. Concurrent proposals can pass preflight together; committed order decides which fit. A later command that does not fit is consumed with a typed retryable pressure answer, no SQL effects, no settled outcome row and no write-generation advance. It is not a host failure and does not stall Raft apply: later acknowledgements must be able to drain it. An absent response remains uncertain until the existing same-entry retry owner resolves it.

A successful PREPARE already holds the exclusive durable partition reservation. Checking capacity for its entire batch before storing PREPARED reserves completion capacity without a second ledger: ordinary SQL is excluded while that row is PREPARED and acknowledgements can only reduce owed debt. A retained PREPARED row and its exact operations survive restart. COMMIT and ROLLBACK are never pressure-refused; replay of an already-settled ordinary entry or existing participant state also retains its authoritative outcome.

The existing bounded proposal queue protects two acknowledgement slots and one slot for a decision bound to the exact durable PREPARED row. The two classes cannot consume each other's still-unused reserved capacity. Ordinary proposals, including parked work, cannot occupy those final slots. Unprepared rollback tombstones, late decisions and unrelated transactions use ordinary capacity. This does not enlarge the queue or add a second scheduler. Queue admission is selected by the existing command owner; a client SQL body cannot claim drain authority.

The finite invariant applies to work admitted under this policy from a within-budget durable prefix. Recovery does not assert that arbitrary retained input already meets it: an over-budget owed prefix refuses new event-producing work until it drains, while existing PREPARED decisions remain completable. No version flag, compatibility path or erased obligation is introduced. The same read-only capacity predicate handles both cases; observed over-budget state must be reported as such.

## Evidence required

- With a refusing registered subscriber, the actual executeQuery path reaches the finite debt boundary, refuses new work before proposal, leaves application rows unchanged, and resumes after actual CDC_DELIVERED application.
- Concurrent proposals near the boundary produce identical debt and data on replicas applying the same committed prefix. A losing proposal is retryable, not silently dropped or permanently settled; its later same-entry retry applies once after drain.
- A complete participant batch is admitted or deferred before PREPARED. An admitted batch survives restart and commits without a capacity refusal. Ordinary writes cannot spend its capacity.
- Acknowledgement and participant-decision proposals retain queue capacity even when ordinary parked work fills its allowance. Supported large input remains intact. Native committed application must be distinguished from controllable-port tests.

## History and comparable systems

This is a correction to D1 F2, not evidence against the accepted D2 recording policy. The existing RESERVED application behavior already separates a consumed log entry from a settled SQL outcome; the same source-owned retry meaning must be retained for capacity pressure. No owed row is deleted to satisfy the limit.

CockroachDB's replication admission design explains why blocking below Raft can prevent later high-priority/progress work. Here the application consumes a pressure refusal without blocking the committed log, while preserving SQL retry identity. Its broader fail-open policy is not adopted. etcd's quota recovery permits draining operations under pressure; here only the existing acknowledgement/decision owners retain drain admission, not a general internal bypass.

Primary references: https://github.com/cockroachdb/cockroach/blob/master/docs/tech-notes/replication_admission_control.md ; https://etcd.io/docs/v3.6/op-guide/maintenance/
