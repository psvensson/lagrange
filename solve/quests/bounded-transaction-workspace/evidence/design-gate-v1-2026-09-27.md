# Bounded transaction workspace: design gate v1

Head inherited and sealed: `292b7204334cf47617e675dd9b12bc708b682886`

Status: **CONTINUE DESIGN/PROBE; NO PRODUCTION IMPLEMENTATION**

Independent inputs:

- `challenger-a-mechanisms-2026-09-27.md`
- `challenger-b-budget-semantics-2026-09-27.md`

Neither challenger refuted the frozen claim. Together they reject every
existing whole-image, same-writer and logical-row shortcut. They leave one
binary architectural probe before a general implementation can be considered.

## Owner model

The authoritative partition SQLite connection and rs-raft apply transaction
remain the single database owner. A transaction workspace is a private,
short-lived branch view bound to one exact applied-index snapshot. It is not a
second replica, a follower file, an apply consumer, a cache of owner truth, or
an alternate commit path. Canonical replicated apply remains the only route by
which transaction effects become authoritative.

One future workspace owner, if proven, must own:

- acquisition of the base snapshot and all identity fences;
- private page/temp/handle lifetime;
- SQL execution in the private view;
- deterministic effect/input derivation for canonical apply;
- abort/dispose and restart orphan cleanup;
- explicit resource-limit, movement and expiration outcomes.

## Candidate disposition

| Class | Disposition | Reason |
| --- | --- | --- |
| Full serialize/backup/checkpoint | **REJECT** | `O(total partition bytes/pages)` before a writable branch exists |
| A. Page-level COW/VFS | **UNKNOWN; probe next** | Correct complexity and SQL shape, but exact current WAL base is unproven |
| B. SQLite snapshot + overlay | **REJECT on current binding** | Snapshot surface absent/read-only; a writable overlay is A |
| C. Filesystem clone | **REJECT as correctness mechanism** | Non-portable, live main/WAL snapshot not atomic, no non-copy fallback |
| D. Same-database staging | **REJECT** | Owns SQLite's only writer or joins canonical apply across consensus |
| E. Logical/minimal rows | **REJECT under retained semantics** | Complete SQL dependencies are not soundly enumerable without becoming page overlay or total scan |
| F. Continuously maintained image | **REJECT** | Becomes another state machine, apply consumer and recovery owner |

## Liveness correction

The STOP checkpoint preserves 350 ms as the boundary used by that design
gate, but source audit proves it is not the current rs-raft owner scalar.
Default per-replica core minimum election windows are 1000/3500/6000 ms before
randomization. The actual budget attaches to uninterrupted monopoly of the
authoritative event-loop/tick/Ready/send path, starting from a follower's last
valid leader message. Off-thread readiness may exceed an election interval if
authoritative apply/tick continues and the exact snapshot remains valid.

The earlier public-traffic experiment ran serialization outside the leader
process. A candidate's decisive liveness witness must therefore execute its
real owner-thread slice in the partition process and measure follower/term,
tick gap and applied-index progress.

This correction does not reopen full serialization: its cost class remains
unbounded in legitimate user data.

## First binary architectural probe

Before implementing a general overlay, answer:

> Can a writable SQLite branch be rooted at one exact applied-index/WAL
> snapshot with constant-size setup metadata and with page access
> proportional only to pages the transaction touches?

The spike is confined to `scripts/quest-evidence`, tests, generated fixtures
and lab artifacts. It does not modify `src/` or the distributed-transaction
apply path.

It fails if acquiring the root:

- scans or copies the database or historical WAL;
- builds a complete page map at `BEGIN`;
- checkpoints total state into the critical path;
- reads changing base pages without one pinned WAL end mark;
- compares whole files to derive effects;
- silently falls back from filesystem COW to byte copy;
- cannot bound pinned-WAL, dirty-page, temp, handle and orphan lifetime by
  transaction activity.

If the root cannot be demonstrated, this quest returns **REJECT** and names a
larger branchable-storage prerequisite. It does not implement a partial VFS or
lower the SQL contract.

## Performance falsifier, frozen before candidate work

The checked-in negative control exercises dense 8/64/256 MiB logical
databases with one fixed transaction, plus an 8 MiB base with a 4096-row
transaction. Its verdict is driven by materialized byte/page counters, not
host time, and must classify full serialization as
`O(total-partition-bytes)`. It separately records creation, first read, first
write, execution, finalization and cleanup, while checking private effects and
SQLite uniqueness, foreign-key, trigger, expression, BLOB and multi-statement
behavior.

The candidate extension keeps that report grammar and adds:

- larger dense growing-user-data trials when required to resolve the slope;
- history-shaped controls kept distinct from user-data growth;
- metadata/no-op baseline and randomized warm/cold trials;
- bytes/pages read, copied and dirtied per phase;
- canonical SQLite semantic oracle and exact result metadata;
- authoritative apply traffic inside the leader process;
- leader/term/campaign, tick gap and applied-index progress;
- memory, temp allocation, handles and cleanup artifacts;
- crash injection after acquisition, first read, first write and before
  finalization;
- exact SHA, host/calibration, filesystem/kernel, runtime/library versions,
  fixture physical shape, partition/version/term/index and trial identity.

The decisive candidate is run through the lab controller on `main-linux`
(reference) and `lenovo-laptop` (slower measured host), with `tv-dator` as an
optional third cross-check. A tiny transaction on a large base must not gain
cost from unrelated bytes; a large transaction on a small base may gain cost
from actual reads, dirty pages and replicated-entry work.

## Open owner surfaces

The spike does not yet answer:

1. how an exact applied-index WAL page resolver is exposed to a writable
   branch without total enumeration;
2. the replicated schema-generation fence absent at this head;
3. packaging/lifecycle ownership for a custom native VFS or binding;
4. the numeric safety margin on the shortest configured follower's residual
   election slack;
5. canonical BLOB encoding and deterministic/non-deterministic SQL admission
   already carried by the stopped transaction design.

Those are proof obligations, not reasons to substitute backup, filesystem
caps or reduced SQL semantics.
