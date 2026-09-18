---
id: measured-storage-path
status: open
proof: deterministic
roadmapRow: null
doneWhen:
  probe: script
  args:
    command: node scripts/checks/storage-load-report.js --epic data/storage-load
    target: 0
quests:
  - storage-load-harness
  - numeric-key-routing
  - log-group-commit
  - message-group-log-bound
authorizes:
  - scripts/checks/storage-load-report.js
  - scripts/checks/test-subsystem-classification-constants.js
  - scripts/quest-evidence/numeric-key-routing.js
  - src/live-query/live-query-group.js
  - test/storage-load
  - test/partition
  - test/query
  - test/raft
  - test/message-group
  - test/shards
  - data/storage-load
  - .gitignore
  - src/partition/key-range-manager.js
  - src/partition/split-key-comparator.js
  - src/query/partition-resolver.js
  - src/query/query-constants.js
  - src/raft/sqlite-log-adapter.js
  - src/raft/in-memory-log-adapter.js
  - src/raft/compaction-policy.js
  - src/message-group
  - package.json
  - solve/epics
  - docs
---

# Measured storage path

The public claim is a distributed SQL runtime; the thing most missing under
that claim is a measurement. This epic puts a number under the storage path
before anything is lifted: writes per second and p99 read latency per
partition on a three-node cluster, checked in as a report the budget can read,
plus a 24-hour soak recording memory and message-group log growth. Every
lever below it (WAL and group commit on the log adapter, bounded message-group
retention, numeric key routing) is guesswork without that report, so the
harness lands first and the soak's clock starts the moment it runs.

Brief (owner, 2026-09-13, from the scaling review): the write path fsyncs
once per Raft entry with no batching and SQLite's defaults; numeric keys
route lexicographically after a split; the CDC and cluster-propagation
message-group Raft logs keep in-memory logs with no compaction and recover by
full replay, an uptime ceiling rather than a size ceiling. None of the three
had a roadmap row; the load harness is their prerequisite.

`doneWhen` reads the committed reports under `data/storage-load/`: the
string-keyed report, the integer-keyed report, and a soak report covering a
day that names the landed message-group log bound. The contract those
reports satisfy is owned by `scripts/checks/storage-load-report.js`; the
scenario imports its vocabulary from there.

## Binding constraints

- **Measure before lifting.** No durability or retention change lands before
  the first report is on `main`; every later figure cites the report it is
  compared against.
- **String keys first.** The first report measures the store with string keys
  so that the routing bug does not enter the figure; integer-keyed
  measurement means nothing until `numeric-key-routing` lands.
- **The soak survives its host.** Snapshots are written periodically and
  atomically; a killed or stalled soak leaves its last snapshot and the
  growth figures fitted so far.
- **In-process, never Docker.** The harness is the seed-plus-joiners
  in-process path with every replica on disk; it refuses to run under the
  probe mark (R27), and the probe only reads the report.
- **No concurrency with `src/raft` formation work.** `log-group-commit` never
  runs alongside `raft-ownership` or a formation quest touching `src/raft`.
- **The shared machine.** The soak runs at a gentle rate; local gates and
  corpora are serialised around it, never alongside another heavy run.

## Quests, in order

**storage-load-harness** — the scenario exists: `npm run soak:storage`
starts a seed and two joiners in one process, creates a handful of
single-partition tables, drives a string-keyed write stream and a read stream
of already-written keys at a target rate for a duration, and writes
`data/storage-load/latest.json` on every snapshot interval with measured
write and read figures (per partition and in total), the storage footprint
(bytes on disk, SQLite Raft log entries and command bytes, in-memory
message-group log entries, RSS) and the growth rates fitted over the
snapshots. The first committed report is a short run; the 24-hour soak is the
same scenario with a day's duration, started the moment the short run is
green. Probe: script, the contract problem count of the committed report,
target 0.

**numeric-key-routing** — bounded: one red test (an integer key against a
string boundary), the comparators (`KeyRange.compareKeys`,
`PartitionResolver.compareValues`, and the third copy found at seal,
`LiveQueryGroup.compareValues`) become one comparator beside
`compareSplitKey` that compares a number against a text-encoded number
numerically and refuses every other mixed key space the way `compareSplitKey`
already does, and the dead vocabulary leaves `query-constants.js`. Touches no log adapter
and no message group, so it is safe alongside the soak. Probe: test-receipt.

**log-group-commit** — measure before lifting: WAL and group commit of Raft
entries on `sqlite-log-adapter.js` and the partition apply, behind
crash-recovery witnesses that go red on revert, then the report re-run
against the first one. Needs the first report on `main`; never concurrent
with `raft-ownership`.

**message-group-log-bound** — a retention bound with restart-safe replay for
the message-group in-memory Raft logs; its shape (entries, bytes, or time)
follows from the soak's growth figure, so it is not sealed before the soak
report exists.

## The soak before the bound (2026-09-14 to 09-15)

The 24-hour soak ran to completion (`endReason: completed`, 86,400 s) on
head 86f84824b: string keys, 4 single-partition tables, 20 ops/s target
(half reads), 5-minute snapshots. Its full report, all 288 snapshots, is
committed as `data/storage-load/soak-baseline.json`. It is the "before"
figure: `data/storage-load/soak.json`, which `doneWhen` requires to name the
landed bound, must come from a new soak run with the bound in place and be
compared against this baseline. Adding a `bound` field to the baseline would
satisfy the check without proving anything. The run's log (11,386
error-level lines, 162 KB gzipped) and a copy of the report are kept outside
the repository, where test-output retention cannot reach them:
`~/.local/share/lagrange/evidence/storage-load/soak-2026-09-14/` on the
controller.

What it measured (fitted over the day, then the end state):

| figure | per hour | after 24 h |
| --- | --- | --- |
| message-group in-memory log | +18.6 k entries | 468 k entries, ~361 MB |
| SQLite Raft log | +100 k entries, +89 MB command bytes | 2.41 M entries, 2.19 GB |
| bytes on disk | +144 MB | 3.68 GB (seed 0.82, joiners 1.31 and 1.56) |
| RSS | +1.3 MB | 2.34 GB (heap used 0.78 GB) |

Writes ran at 9.2/s against a 10/s target: 792,870 of 794,160 succeeded,
p50 11 ms, p99 855 ms, max 89 s, with 1,290 failures ("participant
failures"). RSS is nearly flat once warm. The +687 MB/h read at the first
hour was warm-up, not a leak. Two things grow without a bound: the
message-group log, which sets the shape of `message-group-log-bound` (about
19 k entries and 15 MB an hour at this rate), and the uncompacted per-entry
Raft log, which is most of the disk.

Found in the log, for an owner outside this epic: 10,678 "Refused raft log
truncation into the committed prefix" (about 7 a minute, all day), 4 "Raft
committed-prefix term divergence detected", and 401 failed parallel query
executions. `raft-committed-prefix-conflict-livelock` was marked solved on
2026-08-09, yet the refusal still recurs under steady load.

## Budget note (2026-09-14)

With this epic open the open-epics budget (12) is exactly met: the next epic
needs one to close.
