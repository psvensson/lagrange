# Bounded transaction workspace: immutable-base gate amendment

Status: **GATE A OPEN; PROBE ONLY; NO WRITABLE OVERLAY**

Inputs:

- `challenger-a-snapshot-correctness-2026-09-27.md`;
- `challenger-b-cow-ownership-performance-2026-09-27.md`;
- `design-gate-v1-2026-09-27.md`.

Both read-only challengers independently converge on the same decision. An
exact historical state can be held by SQLite's WAL pager, but the current
binding does not expose that pager as a lazy immutable page source. A writable
COW overlay is therefore not yet authorized.

## Gate A contract

The base is one read-only SQLite transaction owned by a disposable workspace
executor. Its first read obtains `_raft_rs_applied_state.applied_index = I`
inside that same transaction. Application state and `I` were committed
atomically. Internal rs-raft log/hard-state bytes may be ahead and are hidden
from the workspace; they do not redefine the state-machine snapshot.

Every untouched page must be resolved through this pinned pager at its WAL end
mark. The changing live database files are never the apparent base. The pin is
released on success, rollback, error, expiry, demotion, partition movement,
split, snapshot installation, shutdown or executor crash. It is intentionally
not recovered after restart.

## Corrected liveness contract

Future briefs and probes use no unconditional 350 ms assertion. The measured
constraint is whether any workspace phase monopolizes the authoritative
event-loop/tick/Ready/send path long enough for followers to go from their
last valid leader message to a randomized election deadline. Wall-clock work
on the executor is acceptable only while authoritative tick, apply, leader
health and acknowledgement progress remain healthy.

The liveness report therefore records both workspace phase cost and maximum
authoritative-thread/tick interference. The historical 350 ms value may be
shown only as a conservative reference datum.

## Next authorized experiment

The next experiment is not a writable VFS. It is a probe-only page resolver
compiled from the vendored SQLite amalgamation with
`SQLITE_ENABLE_DBPAGE_VTAB`:

1. establish and retain the read transaction;
2. read `I` inside it;
3. fetch page 1 plus known table/index pages by page number;
4. advance authoritative state through repeated writes to those pages;
5. prove SQL observations and page bytes remain exactly at `I`;
6. exercise PASSIVE and bounded blocking-checkpoint attempts;
7. release/kill the executor and prove checkpoint recovery and lock cleanup;
8. repeat across increasing unrelated base size and WAL history;
9. record acquisition, handoff, first page/read, WAL retention, apply latency,
   tick gaps, term/leader state, RSS, handles and cleanup separately.

The probe uses the existing falsifier's full-image path only as its positive
linear-work control. It never optimizes serialization or silently falls back
to it.

## Gate A success and stop conditions

Gate A succeeds only if exact pages can be fetched lazily from the same pinned
pager without enumerating/copying total state, acquisition remains insensitive
to unrelated base growth, and snapshot lifetime/resource pressure can be
bounded by transaction activity while live apply stays healthy.

Gate A stops with REJECT if any of these are required:

- a full database or historical-WAL scan on normal acquisition;
- direct page reads from changing main/WAL files;
- snapshot identity split across connections without atomic handoff;
- unacceptable checkpoint/apply pressure or unbounded retained WAL;
- another pager/WAL/checkpoint owner;
- recovery of speculative state after executor crash;
- a total-partition-size cap or reduced SQL contract.

Only a successful, independently challenged Gate A authorizes Gate B's
private-write tests. No distributed transaction apply code is resumed by this
amendment.

## Publication ordering

A finished quest must be clean, pushed without history rewriting, remotely
verified at the exact committed SHA, and recorded before material work begins
on its successor. The earlier STOP branch publication attempt is currently
refused by its exact-checkout corpus gate and has no remote ref; that state is
recorded separately and is not represented as a successful push.
