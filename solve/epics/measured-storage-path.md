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
string boundary in both comparators), the two comparators
(`KeyRange.compareKeys`, `PartitionResolver.compareValues`) become one
comparator that refuses mixed types the way `compareSplitKey` already does,
and the dead vocabulary leaves `query-constants.js`. Touches no log adapter
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

## Budget note (2026-09-14)

With this epic open the open-epics budget (12) is exactly met: the next epic
needs one to close.
