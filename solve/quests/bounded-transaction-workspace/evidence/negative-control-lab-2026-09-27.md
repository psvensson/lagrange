# Bounded workspace falsifier: negative-control lab calibration

Exact tested head: `ce067f4f865ab47261cafecfdc607efb662e92ff`

Mechanism: rejected full SQLite serialization with WAL header normalization
and an anonymous private database.

Purpose: prove that the performance/complexity witness detects work
proportional to unrelated partition bytes before any candidate workspace is
implemented. This calibration does not turn any of the quest's ten receipts
green and is not evidence for a candidate architecture.

## Complexity result

On the controller/reference checkout, dense 8/64/256 MiB targets produced
logical images of 8,429,568, 67,227,648 and 268,816,384 bytes. Workspace
creation materialized exactly those byte counts. With the transaction fixed at
one row, both database growth and bytes read at creation grew by 31.89x, so the
harness classified the negative control as `O(total-partition-bytes)` without
using a wall-clock threshold.

The separately measured small-base/large-transaction case kept the base at
8 MiB and executed 4096 rows. This distinguishes legitimate transaction-work
cost from unrelated base-size cost.

Controller phase sample:

| Case | create | first read | first write | execution | finalize | cleanup | RSS increase |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 8 MiB / 1 row | 5.069 ms | 0.054 ms | 0.025 ms | 0.269 ms | 0.011 ms | 0.249 ms | 17,031,168 B |
| 64 MiB / 1 row | 43.202 ms | 0.054 ms | 0.022 ms | 0.536 ms | 0.007 ms | 1.301 ms | 135,168,000 B |
| 256 MiB / 1 row | 167.160 ms | 0.047 ms | 0.018 ms | 0.114 ms | 0.005 ms | 4.012 ms | 537,718,784 B |
| 8 MiB / 4096 rows | 4.558 ms | 0.056 ms | 0.023 ms | 10.123 ms | 2.257 ms | 0.172 ms | 25,640,960 B |

The counters, not these host-specific times, decide the negative-control
classification. The times demonstrate that the report keeps each phase
separate rather than moving creation cost into first read/write or cleanup.

## Lab-controller runs

Both remote runs used the repository lab controller, exact commit, machine
lock, thermal gate, detached worktree and exclusive resource lane:

```text
node scripts/lab.js test changed --lane exclusive --on <host>
  --sha ce067f4f865ab47261cafecfdc607efb662e92ff
  --base-sha 135ed835bdc95e887f2b3c81fa384a7faf871709
```

| Host | Role | Falsifier | Exclusive lane |
| --- | --- | --- | --- |
| `tv-dator` | reference lab cross-check, speed factor 1.43 | 37 assertions, green, 1038 ms | 4/4 files, 82 assertions, green |
| `lenovo-laptop` | slower supported host, speed factor 1.76 | 37 assertions, green, 1679 ms | 4/4 files, 82 assertions, green |

The test asserts on each host that:

- the fixed transaction is unchanged while unrelated database size grows;
- instrumented creation bytes equal the complete logical database bytes;
- the positive control's byte slope tracks total database growth;
- the WAL image begins with header versions `(2,2)` and is normalized before
  anonymous open;
- private writes leave the authoritative source unchanged;
- indexed reads, BLOB values, expression updates, triggers, uniqueness,
  foreign keys and multi-statement behavior execute in the private database;
- the 4096-row case is accounted separately as transaction work.

The lab calibration therefore proves the witness can reject the known bad
complexity class on both reference and slower hosts. It does not establish
authoritative apply continuity, crash safety, resource bounds or ownership for
the still-unimplemented page-overlay candidate.
