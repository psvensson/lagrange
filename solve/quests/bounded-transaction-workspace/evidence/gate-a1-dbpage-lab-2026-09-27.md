# Gate A1 DBPAGE lab calibration

Status: **WITNESS GREEN ON REFERENCE AND SLOWER HOST; GATE A OPEN**

Exact WIP head:

`2447ea8e2316dc7e0d0d589b23032c5a81202c9a`

Change-cone base:

`d3ed5d00a3ebcb442d60e0405af58eefe3d4addc`

The branch is active and unsealed. This is a lab calibration of the probe-only
SQLite feasibility witness, not a completed-quest publication and not evidence
that the current production better-sqlite3 build exposes DBPAGE.

## Commands

Both runs used the repository lab controller, its machine lock, thermal gate,
exact-SHA placement and exclusive serial lane:

```sh
node scripts/lab.js test changed --lane exclusive --on tv-dator \
  --sha 2447ea8e2316dc7e0d0d589b23032c5a81202c9a \
  --base-sha d3ed5d00a3ebcb442d60e0405af58eefe3d4addc

node scripts/lab.js test changed --lane exclusive --on lenovo-laptop \
  --sha 2447ea8e2316dc7e0d0d589b23032c5a81202c9a \
  --base-sha d3ed5d00a3ebcb442d60e0405af58eefe3d4addc
```

## Results

| host | role | probe | exclusive cone |
| --- | --- | --- | --- |
| `tv-dator` | reference lab host | 56 assertions, 8,674 ms | 4/4 files, 101 assertions |
| `lenovo-laptop` | slower supported host | 56 assertions, 13,760 ms | 4/4 files, 101 assertions |

Neither run retried. Thermal admission was green before execution (`tv-dator`
CPU 65 C / NVMe 44 C; `lenovo-laptop` CPU 47 C).

The 56 probe assertions on each host establish the same structural facts as
the local report:

- the shipped runtime lacks DBPAGE and snapshot compile options;
- the alternate amalgamation build leaves production flags untouched;
- 8/64/256 MiB fixtures always request two pages and materialize 8,192 bytes;
- applied identity, table/index bytes and the genuinely late-first-access page
  remain at I through later commits and checkpoint pressure;
- a fresh reader sees the changed bytes;
- pinned-reader WAL retention is observed, and release restores TRUNCATE;
- 32 independently aged readers are only a successful tested lower bound;
  maximum/failure behavior is not claimed;
- local event-loop timing is labelled a proxy rather than Raft proof; and
- Gate A remains open.

The classified lab runner retains per-file duration and assertion count, not
the TAP comment containing each phase's raw microsecond values. The exact local
phase table is therefore retained in `gate-a1-dbpage-local-2026-09-27.md`, while
the lab evidence proves that every phase/counter invariant executed on both
machines. No cross-host claim is made from unretained phase timings.

## Remaining gate work

This calibration does not satisfy Gate A criteria 6 or 9:

- a real three-replica witness must pin the page reader against a leader
  replica while public apply, ticks and heartbeats continue, recording
  leadership/term and acknowledgement progress separately from executor wall
  time;
- reader exhaustion has no measured deterministic SQLite outcome through the
  tested lower bound, so concurrency must remain an unresolved resource-owner
  question rather than a fabricated five-reader contract.

No writable overlay is authorized.
