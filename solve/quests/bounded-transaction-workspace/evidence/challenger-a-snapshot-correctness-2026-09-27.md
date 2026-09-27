# Challenger A: exact SQLite snapshot correctness

Verdict: **PROVEN at SQLite's read-transaction/pager layer; UNKNOWN as a
COW-consumable page source.** Gate A remains open.

The correct state-machine identity is the partition/Raft-group identity plus
`_raft_rs_applied_state.applied_index`, read inside the same read transaction
that pins the SQLite view. Application effects and that applied-index update
commit in one SQLite transaction. `commit_index` is not the identity: Raft
log and hard-state persistence may be ahead of application, so internal
`_raft_rs_*` bytes are not part of the user-state boundary at `I`.

## Safe acquisition shape

1. A disposable workspace executor opens and owns a separate read-only,
   file-backed connection.
2. It executes `BEGIN`.
3. Its first database read obtains the applied index and state/schema fences.
   A deferred `BEGIN` alone does not establish the version.
4. It retains that connection and transaction for every base-page read.
5. It releases statements, transaction and connection together on every
   terminal path.

The live mutable writer connection and a raw `sqlite3*` are never transferred
across threads or processes. Reading `I` on one connection and opening the
data view on another is not an atomic snapshot handoff.

## Stability evidence

A transient read-only witness pinned `I=1` and value `at-I`, then advanced a
writer through `I=1505` while rewriting the same row. The pinned reader still
returned `I=1` and `at-I`. A PASSIVE checkpoint stopped after 8 of 3016 frames,
TRUNCATE was busy, and the WAL retained approximately 12.4 MB. After rollback
of the reader, TRUNCATE completed and a fresh reader saw `I=1505`.

This proves that SQLite's WAL pager can preserve the historical view while
apply advances. It does not prove that a future writable overlay can fetch
those pages. Old pages remain safe only while resolved through that pinned
pager; direct reads from the changing main or WAL files are invalid.

## Current capability boundary

The installed `better-sqlite3` can retain the SQL read transaction but:

- is not built with `SQLITE_ENABLE_SNAPSHOT`;
- is not built with `SQLITE_ENABLE_DBPAGE_VTAB`;
- exposes no snapshot-handle or page-read surface;
- exposes no selectable/custom VFS surface;
- opens SQLite with the default/null VFS.

The optional snapshot API would still be read-only and checkpoint-sensitive.
The vendored `sqlite_dbpage` implementation is a narrower probe candidate: it
fetches a selected page through the same pager and includes WAL state, without
requiring page enumeration. It is evidence machinery only, not an approved
production binding.

## Resource and checkpoint risks

A pinned reader permits WAL writers but prevents checkpoint recycling past
its old read mark. Retained bytes therefore grow with live write rate and
workspace lifetime. SQLite also has a finite default set of WAL reader marks,
and its default PASSIVE autocheckpoint work is triggered synchronously after
commits. FULL, RESTART and TRUNCATE modes can wait on readers or writers.

The next witness must record retained WAL bytes, distinct concurrent snapshot
ages, apply latency, tick delay, term/leader health, checkpoint recovery after
release and every handle/lock lifetime. Bounds attach to transaction lifetime,
concurrency and activity, never total partition size.

## Decisive pre-Gate-B probe

Compile a probe-only SQLite surface with `SQLITE_ENABLE_DBPAGE_VTAB`. Pin `I`
inside its read transaction, fetch page 1 and known table/index pages lazily,
advance live apply across same-key writes and page allocation, exercise
checkpoint pressure, and prove that SQL results and raw page bytes remain at
`I`. Repeat while unrelated database size grows. Acquisition and first-page
work must not scale with total pages.

Stop before Gate B if page export requires enumeration/copying, ordinary-path
WAL recovery scans, direct live-file reads, detached cross-connection identity,
unbounded WAL retention/reader scarcity, or reconstructing a pre-crash
snapshot.
