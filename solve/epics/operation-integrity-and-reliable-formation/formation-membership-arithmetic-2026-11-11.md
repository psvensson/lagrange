# Formation membership arithmetic: counts, measured durations, fit against 420 s (2026-11-11)

Read-only analysis (subagent). Counts are read from source; durations are measured from
recorded runs; estimates state their assumptions. None of the runs is on the current
uncommitted tree, and no lab formation exists on it.

## Bottom line

- Only **23 membership operations gate formation**: the operation ledger takes 3 and the
  five other priority partitions take 4 each. They run as **7 serial steps** (3 ledger
  operations, then 4 waves with the five priority partitions in parallel).
- The 39 default system partitions and `nodes-p1` **do not move during formation in any
  measured run** (about 80 REPLACEs of background work afterwards; the default partitions
  were never seen to spread within any run, up to 330 s).
- Local runs: membership work takes a median of 57.6 s (range 42.8-91.0 s). One red lab
  run (0.4.0, 2026-11-01) was about 3.5x slower per operation.
- **About half of the critical path is the planning gap** between consecutive operations
  on one partition, not the operations. The concurrency cap is never reached.
- On real hosts the margin is thin for reasons other than membership operations: CI
  formation-only windows already use 58-87 % of 420 s; start-to-first-operation and the
  time for the serve lane to open on every node are unmeasured there.

## Operation count (source)

46 system partitions, each founded as 3 voters on the seed
(`system-table-schemas-constants.js:129-190`; classes in
`system-partition-classification.js:47-69, 205-238`).

| Class | Partitions | Sequence | Ops | When |
|---|---|---|---|---|
| Priority control-plane (publications, sql_transactions, sql_transaction_participants, sql_write_operations, schema_operations) | 5 | ADD J1, ADD J2, REMOVE, REMOVE (one pair may become a REPLACE) | 20 | during formation |
| Operation ledger (replica_operations-p1) | 1 | REPLACE, ADD, REMOVE | 3 | during formation |
| nodes-p1 | 1 | REPLACE, REPLACE, released by the background fence | 2 | after formation (+138 s, +204 s, +218 s in three runs) |
| Default system | 39 | REPLACE x2 | 78 | never seen within any run |
| Message groups | - | parked (membership change unsupported) | 0 | - |

Why the defaults do not move (seed log, run h4-head): all 39 sit behind the
traffic-readiness gate (`rebalancer-planning-gate-methods.js:444-482`) with reason
`PRIORITY_CONTROL_PLANE_RECOVERY_PENDING`, **still reported more than two minutes after
priority spread had completed**; re-checks back off 75 s -> 94 s -> 117 s. `nodes-p1` and
non-system work wait on the release fence (70 s stable window).

Limits: 4 ADD/REPLACE slots and 5 REMOVE slots globally (`rebalancer-constants.js:90-105`);
a per-partition serial gate already exists for these partitions (0 overlapping operations
on one partition in 18 runs); the ledger hold defers dependents while the ledger quorum
sits on one node.

## Measured durations

Runs: 18 local embedded formations on 2026-11-11 (three processes over loopback; 17
passed), timings from full `steps_history` rows; one red three-host lab run (0.4.0).

| Type | n | Median s | p90 s | Max s |
|---|---|---|---|---|
| Priority ADD | 159 | 4.7 | 7.8 | 9.9 |
| Priority REMOVE | 138 | 1.1 | 1.8 | 6.1 |
| Priority REPLACE | 19 | 7.5 | 20.3 | 29.2 |
| Ledger REPLACE | 17 | 4.5 | 13.6 | 22.5 |
| Ledger ADD | 19 | 4.3 | 5.9 | 9.8 |
| Ledger REMOVE | 19 | 1.5 | 5.7 | 6.7 |

Gap on one partition, previous terminal step to next creation:

| Transition | Median s | p90 s | Max s |
|---|---|---|---|
| Priority ADD -> ADD | 7.1 | 16.8 | 35.5 |
| Priority ADD -> REMOVE | 8.5 | 19.3 | 36.2 |
| Priority REMOVE -> REMOVE | 5.6 | 16.0 | 28.2 |
| Ledger REPLACE -> ADD | 3.8 | 11.0 | 17.4 |
| Ledger ADD -> REMOVE | 1.4 | 4.6 | 4.7 |

What the gaps are spent on: a partition with an operation in flight re-checks only every
5,000 ms; 13.7-16 % of passes that needed a move found no target because the readiness
snapshot was deferred while rebuilding; priority dependents wait for the ledger spread
(median 21.7 s). 17 REMOVEs across 18 runs FAILED on "Message not acknowledged" and were
re-planned. Plain REMOVE never removed a leader (0 of about 180); leader changes on
system partitions were 0-3 per run, only from REPLACE sources.

Lab run (0.4.0): priority ADD median 13.9 s, REMOVE 15.6 s (STOPPING -> REMOVED 8.5-31 s),
REPLACE 29.5 and 55.3 s; system operations spanned 204 s.

## Arithmetic

Critical path today: ledger 15.5 s + four priority waves 32.8 s = about 50 s modelled
against 57.6 s measured; gaps are about 26 s of it. The same model at p90 gives 114 s.

Proposed learner-first design, deltas on the critical path: one operation per partition
+0 s (already the case here); a promotion round per added voter +4 s best, +20 s if each
promotion takes 5 s, +120 s at the design's 30 s tolerance (four of the twelve voter adds
are serial on the critical path); hand-offs under 2 s; liveness unsampled after a leader
change up to +22 s for one event as the design is written.

| | Today | Design, best | Design, pessimistic |
|---|---|---|---|
| Local membership work | 57.6 s | 63-68 s | about 170 s (270 s at 30 s per promotion) |
| Lab-scaled (x3.5) | about 204 s | 210-235 s | about 280 s (380 s at 30 s per promotion) |

Election timing found on the way: election timeout = 1,000 ms + replica index x 2,500 ms
(`config-definitions.js:38`, `src/raft/constants.js:41-45`; adaptive timing off). A seed
replica r1 times out at 1 s; joiner replicas r4/r5 at 8.5 s / 11 s, so their liveness
windows are 17 s / 22 s and a group led from a joiner replica waits that long to elect.

Levers: (1) planning cadence: wake a partition's planning when its own operation reaches
a terminal step instead of the 5 s re-check, and answer targets from a snapshot that is
not stale while readiness rebuilds (one experiment cut spread from 26-30 s to 17.3 s);
(2) the ledger-first hold; concurrency is not a lever.

Caveat for the design: if the founding ADDs of a new user table count as membership
operations, CREATE TABLE goes from three overlapping ADDs to serial, against the 120 s
routability bound. The design must say whether founding is exempt.

## To capture on the next lab formation

Full `replica_operations` rows with `steps_history` before retention retires them;
rebalancer gate messages with delay and reason codes on the seed; time to each scenario
predicate and the per-node readiness reason codes over time, in particular when
`PRIORITY_CONTROL_PLANE_RECOVERY_PENDING` clears on each node; cluster start to first
operation; leader changes per partition; whether the 39 default partitions ever spread.
