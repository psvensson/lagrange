# Addendum to the causal packet (2026-09-19): measured guard inputs, and a second mechanism

This extends [causal-packet-2026-09-18.md](causal-packet-2026-09-18.md). It
corrects one of that packet's conclusions and closes its first gap.
Everything here was measured; no behaviour was changed to obtain it.

## Method: formations on the lab machines

The formation-only demo (`npm run -s health:formation -- --trend <scratch>`)
runs five local node processes on any provisioned lab machine in about four
minutes. It reproduces both live failure signatures, so the measurement loop
is minutes instead of one GCP nightly per day.

- Runs so far: 31 local runs on three machines.
- Branches were shipped to the machines as bundles and run from scratch
  worktrees; the committed trend file was never touched.
- The failure rate depends on machine speed: the two 8-thread laptops fail
  far more often than the 12-thread machine.
- Compare only per machine, and interleave the variants to control drift.
- The nightly of 2026-09-19 (run 35418756637, head 3334285a1) also failed,
  with four learners refused.

## Gap 1 closed: which input zeroes the overflow budget

The branch of `learner-promotion-guard-inputs-observed` logs the inputs of
every count-check refusal and of each learner's first pass. In the first
failing run on each of two machines (678 refusal lines), the refused and the
granted promotions have the same 4 voters, target 3, 3 required distinct
nodes and 5 eligible nodes. They differ in one input:

| | summary chosen | summary says | planner entry | budget | max voters |
| --- | --- | --- | --- | --- | --- |
| granted | derived | not satisfied, 4 partitions blocked | not ready, gap 1 | 2 | 6 |
| refused (about 450 lines) | **closure-refreshed** | satisfied, none blocked | ready | 0 | 4 |

- **What decides it.** The learner node's planning answer takes the "more
  advanced" of the freshly derived priority summary and a closure-refreshed
  one. A closure-refreshed summary that still says the spread is complete
  wins over the derivation that shows the gap. The guard then reads
  "recovery converged" and grants no overflow.
- **Classification.** This input is duplicated placement policy, not a Raft
  or local safety check.
- **Earlier candidate withdrawn.** The eligible-set explanation offered on
  2026-09-18 is not the main cause. The collapsed cohort (1 required, 1
  eligible, on a node whose readiness phase is degraded) exists as a rare
  second signature (13 lines).
- **User-table partitions too.** About 200 refusals in one run are on the two
  MovieLens table partitions. The planner sends a fifth voter at RF 3 there
  as well. The learner evaluates no overflow budget at all for an ordinary
  partition, so it always refuses until the 60 s timeout.
- **Consequence for the repair.** The authority disagreement is not confined
  to critical partitions. The operation-carried authorization must cover
  every over-target ADD the planner sanctions, and "an ordinary ADD cannot
  use the overflow authority" needs a definition that accounts for the
  planner's own ordinary-partition cures.

## Correction: the refusal is not what decides PASS or FAIL

The 2026-09-18 packet left open (its gap 2) whether the admission observer's
`observation_unavailable` ending was independent of the promotion stall. It
is. Of the 31 local runs, 16 had their reports pulled and classified:

| | refusals in the run | `observation_unavailable` observations |
| --- | --- | --- |
| PASS (6 runs) | 0, 0, 0, 70, 120, 242 | 0 to 4 |
| FAIL (10 runs) | 0, 1, 39 ... 418 | 8 to 64 |

- One run passed with 242 refusals, and one failed with none. In that run
  the operations drained within seconds and the observer then failed 53
  times in a row.
- The GCP nightlies split the same way: all four failures have 5 to 37
  `observation_unavailable` observations, and all three passes have none.
- The final reasons are `Authoritative control snapshot repair failed:
  nodes:authoritative_observation_read_incomplete`, `control snapshot
  observation failed (stale_usable): cache_stale_watermark`, and timeouts
  opening or awaiting the seed's admin websocket.

So two mechanisms act on formation:

1. **The promotion refusal.** This is the authority disagreement above, worth
   60 to 110 s per occurrence. 09-16 looks dominated by it.
2. **The admission observer cannot obtain an authoritative control
   snapshot.** That alone denies admission. 09-13, 09-18, 09-19 and the local
   zero-refusal failure look dominated by it.

Like seed starvation before it, the refusal is neither necessary nor
sufficient for the observed failure. Repairing the authority boundary is
still right, but it will not by itself make formation green. The second
mechanism needs its own causal packet, written the same way as the first:
- start at the terminal symptom on the observer;
- trace back through the admin control snapshot and the authoritative node
  observation read to the first PASS/FAIL divergence;
- use lab formations as the measurement loop.

## What is not yet known

- Whether the second mechanism has one cause or several behind its three
  final reasons.
- Whether local five-process formations and one-node-per-VM GCP formations
  fail for the same reason in the same proportion. The signatures match; the
  rates differ.
- Whether restoring E's scheduling defaults changes either rate. The first
  five runs of `seed-replica-production-scheduling-defaults` on one machine
  show no obvious change. An interleaved comparison is running.
