# Challenger B: COW ownership and performance

Verdict: **UNKNOWN; continue with the narrow immutable-base probe only.** Do
not build a writable overlay until Gate A passes.

## Ownership finding

The authoritative partition connection owns application state, transaction
outcomes, Raft durability and committed apply. Its Raft operations, tick,
inbound draining, Ready persistence and synchronous SQL apply share one
serialized JavaScript event-loop path. Workspace work must not join that
connection or become another replication/apply owner.

If Gate A passes, the least-confused shape has two owners:

- a partition transaction-workspace owner admits work, captures identity and
  fences, owns budgets/state transitions, accepts only a bounded canonical
  result and disposes the workspace;
- a dedicated disposable executor process owns its own pinned read handle,
  private overlay/journal/temp files and speculative SQL execution.

The executor is not current partition truth, is not recoverable, consumes no
replication stream and is discarded on crash. If it needs reconciliation or
recovery, the design has created a second database authority and stops.

Suggested lifecycle:

`REQUESTED -> ACQUIRING_BASE -> ACTIVE -> FINALIZING -> DISPOSED`

with terminal `REFUSED`, `EXPIRED` and `FAILED` states.

## Correct liveness witness

There is no universal 350 ms workspace timeout. Measure the longest
synchronous authoritative-thread turn and whether workspace activity consumes
a follower's residual interval from its last valid leader message to its
randomized election deadline. Record tick lateness, follower message gaps,
term/role/campaign changes, commit/applied-index progress and public-write
acknowledgement latency.

Off-thread wall time is not itself a failure when Raft remains responsive and
the exact base stays pinned. Conversely, a short acquisition, IPC copy or
finalization step is unsafe if it monopolizes the authoritative path.

## Hidden linear work and bounds

Reject ordinary-path WAL recovery scans, integrity scans, VACUUM, page
enumeration, base-file comparison, full-file diffing and cleanup that walks
the base. Measure base acquisition, executor handoff, first page/read, first
write, later writes, canonical artifact derivation and cleanup independently.

Resource limits may attach to:

- concurrent pinned snapshots and executor slots;
- snapshot lifetime and retained WAL bytes;
- private dirty pages, overlay/journal/temp bytes and handles;
- SQL CPU/progress and canonical artifact/rs-raft entry bytes.

They may not attach to total partition bytes. Exceeding a bound is a typed
refusal or expiry, never fallback to serialization.

## Custom VFS threshold

A private VFS might read unchanged pages from a pager-backed resolver and keep
only private written ranges while delegating rollback journals and temporary
files to SQLite. That remains invasive: partial reads/writes, truncation,
locking, file-control, mmap, journals, page-size parity, DDL and reentrancy all
need proof.

Stop if it requires placing a custom VFS beneath the authoritative database,
implementing another pager/WAL/checkpoint owner, reading untouched pages from
the live files, whole-base finalization, or keeping a long-lived local copy.
A small page-resolver binding is preferable if the narrow probe proves it.

## Canonical result boundary

Neither the workspace file nor a page diff becomes the replicated artifact.
The later transaction quest consumes a bounded ordered canonical SQL/parameter
artifact with operation identity, base/fence identity, result evidence and a
digest. rs-raft retains the entry-size decision, and BLOB canonicalization
remains a separate prerequisite carried by the stopped design.

Gate B, if reached, must compare ordinary SQLite semantics for index updates,
uniqueness, foreign keys, triggers where promised, expressions, BLOBs,
multi-statement read-your-writes, statement errors and rollback. Its cost
series separates large-base/tiny-transaction behavior from
small-base/large-transaction behavior.
