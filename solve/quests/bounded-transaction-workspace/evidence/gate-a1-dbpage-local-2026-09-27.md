# Gate A1: lazy page access from one pinned SQLite view

Status: **SQLITE FEASIBILITY PROVEN IN A PROBE-ONLY BUILD; GATE A OPEN**

Exact local measurement head: pending the WIP evidence commit. The committed
head is filled by the Quest log entry and lab report; the facts below came from
the same intended tree before that commit.

This experiment answers only whether SQLite's pager can export selected pages
from the same read transaction that pins `_raft_rs_applied_state`. It does not
implement a writable overlay, change production SQLite flags, or approve Gate
A. Authoritative three-replica Raft liveness remains a separate required
witness.

## Shipped capability boundary

The installed stack is `better-sqlite3` 11.10.0 with SQLite 3.49.2.

- `PRAGMA compile_options` contains `ENABLE_DBSTAT_VTAB`.
- It contains neither `ENABLE_DBPAGE_VTAB` nor `ENABLE_SNAPSHOT`.
- `pragma_module_list` exposes `dbstat` and not `sqlite_dbpage`.
- `SELECT ... FROM sqlite_dbpage` fails `SQLITE_ERROR: no such table`.

Therefore DBPAGE is not functionality available to production today. The
probe compiles the vendored SQLite amalgamation into a disposable executable
with `SQLITE_ENABLE_DBPAGE_VTAB`; it does not edit the better-sqlite3 build or
package configuration. The compile took 6147.906 ms locally and is outside
every measured workspace phase.

## Connection and identity ownership

The disposable process opens one read-only connection, executes `BEGIN`, then
makes its first database read:

```sql
SELECT CAST(applied_index AS TEXT)
FROM _raft_rs_applied_state
ORDER BY group_id
LIMIT 1
```

That read pins the WAL pager view and yields applied index `I`. The process
keeps the connection and transaction until an explicit `ROLLBACK` and close.
It receives page numbers over a pipe and resolves each with one constrained
`sqlite_dbpage WHERE pgno=?` statement. No connection or raw SQLite handle
crosses an execution-context boundary.

Internal Raft log/hard-state tables are not queried or exported as transaction
state. Only `I` identifies the applied state-machine projection.

## Complexity witness

Root page numbers for one small user table and its index were discovered before
the timed path. Unrelated database content then grew by 31.875x while the page
request footprint stayed fixed.

| target | database pages | parent open/pin/setup | first page | second page | pages / bytes materialized |
| --- | ---: | ---: | ---: | ---: | ---: |
| 8 MiB | 2,059 | 2.534 ms | 23 us | 6 us | 2 / 8,192 |
| 64 MiB | 16,414 | 1.179 ms | 28 us | 5 us | 2 / 8,192 |
| 256 MiB | 65,630 | 1.549 ms | 23 us | 4 us | 2 / 8,192 |

Every case used two setup SQL statements (`BEGIN`, applied-index read), one
page-resolver prepare, and exactly one page SQL execution per requested page.
Requested-page and materialized-byte growth factors were both 1.0. Neither
`sqlite_dbpage` nor `dbstat` was enumerated on the workspace path.

This is structural evidence against hidden `O(total partition pages)` setup in
the candidate page resolver. The lab run must still check the same timings on
the reference and slower supported hosts.

## Direct page-stability witness

A reader pinned `I=1`. It fetched the anchor table and index pages, but did not
fetch or query the second table page. Its pre-write SQL read only applied state
and the anchor row. The writer then committed 128 transactions,
atomically advancing the fixture's applied index to 129 while rewriting the
same table, index and late-access table pages.

- Pinned SQL still returned `I=1` and `anchor-000001`.
- Anchor table hash stayed `3b5a0fe82dc1e637`.
- Anchor index hash stayed `924369314a314d84`.
- The other table page was requested for the first time only after all 128
  commits and returned its state-I hash `7d0b819cd1201532`.
- Only after that first DBPAGE request, a SQL query of the late row returned
  `late-000001`.
- A fresh reader returned different hashes for all three pages.

This proves late first access through the pinned pager rather than eager
caching of the pages under test.

## Checkpoint and retained-WAL behavior

Autocheckpoint was configured to four pages during the write loop. While the
reader was pinned:

- 128 writer commits completed; average commit time was 0.037 ms and maximum
  was 1.938 ms locally;
- PASSIVE checkpoint returned `busy=0`, `log=640`, `checkpointed=0`;
- TRUNCATE returned `busy=1`, `log=640`, `checkpointed=0`;
- the WAL retained 2,636,832 bytes.

After the executor rolled back and closed, TRUNCATE returned `busy=0` and the
WAL size became zero. This supports the intended resource model: retained
history grew with writes during snapshot lifetime, not with setup or total
partition size. A later owner must bound and observe lifetime and retained WAL;
this probe deliberately chooses no production bound.

The page reader ran in a separate process. A local owner-turn proxy observed a
maximum JavaScript event-loop delay of 1.182 ms, but this is explicitly not a
Raft-liveness result: no three-replica tick/heartbeat/leadership witness ran in
this local probe.

## Reader marks

The initial assumption that SQLite's five WAL read marks imply five concurrent
workspaces did not survive measurement. Thirty-two independently aged read
transactions were opened in separate processes. Each initially observed its
then-current applied index and each later retained exactly that acquisition-time
index. No SQLite busy/error or stale-mark reuse occurred through 32 readers.

Ordinary WAL readers can share a compatible read mark; the mark count is not a
direct workspace-count limit. The probe records a tested lower bound of 32, not
an invented maximum or failure contract. Gate A concurrency item 9 therefore
remains unresolved. Releasing all readers immediately
restored successful TRUNCATE and a zero-byte WAL. Executor process/handle,
memory and retained-WAL budgets remain owner inputs even though a five-reader
SQLite refusal was not observed.

## Gate decision

Criteria 1-5 of the requested immutable-page experiment are supported at
SQLite's pager layer:

1. applied index and page view share one pinned connection;
2. the view remains exact through later writes;
3. an old page can be first-resolved late;
4. page acquisition does not enumerate or copy the database;
5. setup/materialization did not grow with unrelated pages in the tested range.

Gate A remains open because:

- production better-sqlite3 does not expose DBPAGE;
- the small production binding/ownership shape has not been designed or
  independently verified;
- the exact probe has not yet run against a live partition replica while real
  public apply, ticks and heartbeats continue;
- lab-host resource and timing evidence is not yet attached.

No writable overlay is authorized by this result.
