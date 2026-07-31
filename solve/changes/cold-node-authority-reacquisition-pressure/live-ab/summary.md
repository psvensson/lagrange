# Cold-node authority reacquisition: controlled live A/B

## Experimental contract

- Candidate base: `41fb88864cdfbe457a4c3b19cd083ebfde77be9d`
- Candidate artifact:
  `sha256:99b73a5da39bec439551b5f0abbdeaf9ff2a913b7dec5d79eab0b4a91eb4c9cb`
- Fixed source fingerprint: `a742f71ff7fc0360`
- Exact-reverted source fingerprint: `4e03d2c5f6f8d2bb`
- Configuration:
  `test/distributed/config/local-benchmark-7node.json`
  (`sha256:764f43436ebd3e88b3e992410c4c5fd486c08e9ff801add96885c85aab17e457`)
- Node count: 7
- Workload, failure schedule, CPU allocation, and the repository's
  200,000 ms no-progress contract were unchanged between arms.
- Predetermined clean-start order: fixed 1, reverted 1, fixed 2, reverted 2.
  Docker contained zero containers before every launch.

## Results

| Sample | Fingerprint | Gate class | Dominant reason | Missing published | Unexpected exits | Scenario errors | Gate wall |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: |
| fixed 1 | `a742f71ff7fc0360` | `NODE_EXIT` | `nodeAdmissionBlocked` | 0 | 2 | 74 | 523 s |
| reverted 1 | `4e03d2c5f6f8d2bb` | `TOPOLOGY_BLOCKED` | `admin_reachability_refused` | 0 | 0 | 73 | 345 s |
| fixed 2 | `a742f71ff7fc0360` | `STALLED` | `nodeAdmissionBlocked` | 0 | 0 | 153 | 451 s |
| reverted 2 | `4e03d2c5f6f8d2bb` | `TOPOLOGY_BLOCKED` | `admin_reachability_refused` | 0 | 0 | 0 | 278 s |

Both arms were 0/2 at the aggregate scenario boundary. Every sample had
`staleSourceRuns=0`, `CORRUPT=0`, `ORACLE_BLIND=0`, and complete 7/7
publication. Fixed errors totalled 227; reverted errors totalled 73. With only
two samples per arm these totals are descriptive, not a capacity or statistical
claim.

## Boundary movement

The exact revert stopped at the first restarted node in both samples:
bootstrap health was reachable, the full admin endpoint refused connections,
and no `after_ready` restart boundary was recorded. The candidate completed
five `after_ready` boundaries across six attempted restarts:

- fixed 1 completed two restarts, then its third restart was downstream of two
  unexpected process exits;
- fixed 2 completed three restart-ready boundaries, then the third node lost
  recovery readiness during the 15-second hold check.

This is direct live engagement and movement of the immediate
`admin_reachability_refused` blocker. It is not evidence that rolling-restart
stability is complete.

Fixed 1's exits were a seed V8 heap OOM and a joining node's fail-closed
`TRANSACTION_RECOVERY_INCOMPLETE` exit. Fixed 2 had no node exit; its terminal
surface was a one-millisecond end-of-budget admin probe timeout after the
post-restart boundary. Neither failure is safely attributable to the candidate
from N=2, and neither may be hidden when judging core stability.

## Authority and evidence hierarchy

All four failure bundles report complete active-gate snapshot coverage by
selecting a different admin-reachable node with a 7/7 view. Those selected
snapshots are `stale_usable`, `repair_deferred`, and have pending observation
contracts. They therefore prove aggregate diagnostic coverage, not authority
or admin reachability on the restarted node.

Every fixed `after_ready` snapshot still reports:

- `startupAuthorityState=observation_unavailable`;
- `startupAuthorityAvailable=false`;
- `publicationObservationState=observation_unavailable`.

The candidate consequently fixes bounded route retention, contact ownership,
typed exhaustion, and tail rebinding, and it advances past the old immediate
admin refusal. It does not establish durable startup-authority continuity
through the subsequent recovery hold.

The topology analyzer reports no unsatisfied topology frontier because
publication and priority-spread evidence are satisfied. The liveness analyzer
classifies fixed 1 at downstream workflow progress and the other three samples
as having no enabled action at publication convergence. Fixed 2's failure bundle
also closes the restart-recovery stability gate even though the scenario failed
the recovery-hold assertion. These facts identify a remaining cross-owner
evidence problem: aggregate snapshot/publication success currently outranks the
restarted node's local authority and hold state.

## Disposition

This A/B supports the scoped candidate's immediate blocker movement and
deterministic contact-owner contract. It does not certify a stable core and
must not be represented as a rolling-restart pass. The next stability work
should own startup-authority continuity and recovery-hold evidence across the
restarted-node/admin boundary; the transaction poison-state exit and heap OOM
remain separately named live blockers.

The report JSON, gate summaries, run records, and compressed raw playback/log
evidence are preserved beside this file. Their hashes are recorded in
`evidence-index.json`.
