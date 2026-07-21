# 09:17 MovieLens priority-partition leader-loss observation

This observation corrects the 2026-07-21 09:38 finding on
`runtime-service-handoff-budget-rearm-reentry`. The run did not merely retain a
live Raft leader whose canonical metadata was invisible. The only scheduler for
`sql_transaction_participants-p1` lost leadership, and no successor was elected.

## Immutable identities

- Source commit: `99c71e8136d3d4f76db792bb3e308ce7ad8cc1fb`
- Scenario report:
  `test-output/reports/movielens-lagrange-service-affinity-live-2026-07-21T09-17-47-855Z.report.json`
  (`sha256:fc9567ac69d2fee2cbbb3005498769adbf198d7e624a83ac4ed17f47cedb2ff3`)
- Seed log: `data/examples/service-data-affinity-demo/node-0.log`
  (`sha256:f44a7596ad73a6f1dc188cc3bad91ed9ead652bd928b052aafc616487fde1636`)
- Live-follower logs: `node-1.log`
  (`sha256:e04a65a67a314e53a0873ed082334ee63f6ab13c458f7af8c1f5a227c49942dd`)
  and `node-4.log`
  (`sha256:ecbb675a03714a23118400a0bbe77e8fae2a40f1ceef067683d0fa8649d3a333`).

The active demo directory is mutable. The hashes above and the exact extracted
facts below are the durable evidence slice; do not cite the unhashed directory
alone in a later conclusion.

## Chronology and final topology

The seed log records:

1. `09:04:57.868Z`: replica `sql_transaction_participants-p1-r1` became
   Liferaft leader in term 1.
2. `09:04:58.115Z`: that partition's rebalancer scheduler acquired leadership.
3. `09:05:21.265Z` through `09:05:42.153Z`: the original local r2/r3 voters and
   transient r4 were replaced by r5 and
   `replace-replica-5ba441042045cd9f068d305a87edfcbd`.
4. `09:08:47.832Z`: the seed reported a 1547 ms event-loop gap.
5. `09:08:47.833Z`: only `sql_transaction_participants-p1` logged `Lost
   leadership, stopping rebalancing scheduler`; the other partition schedulers
   did not fall together.
6. No node logged a later `Became leader (liferaft)` for this partition. The
   first `missingActiveLeader:true` priority-spread deferral followed at
   `09:08:52.272Z`.

The final durable `services` rows contain exactly three ACTIVE followers:

| replica | node |
| --- | --- |
| `sql_transaction_participants-p1-r1` | `6507058d-0952-41f1-8794-5ba2d8fa28c1` |
| `sql_transaction_participants-p1-r5` | `11041fa4-3602-40d4-b805-76ed3ceac99a` |
| `replace-replica-5ba441042045cd9f068d305a87edfcbd` | `25e74c58-218a-4a67-881f-5208577478c6` |

The final partition row still names node
`6507058d-0952-41f1-8794-5ba2d8fa28c1` as leader, but all three service rows
are followers. That row is a stale pre-demotion claim, not evidence of a live
leader.

## Candidate owner and deterministic falsifier

`reconcileRaftPeersFromCacheForService` adds cache-discovered peers and replaces
a changed address for the same replica ID. It never removes a Raft node whose
replica ID is absent or terminal in the authoritative service cohort, and it
only appends to `partitionService.replicaIds`. This is the exact latent defect
already recorded in CL-013: "peer reconciliation never prunes row-less peers."

For this chronology, the long-lived r1 can retain departed r2, r3, and r4 while
also joining r5 and the replacement. Liferaft derives quorum from its local
`raft.nodes` length (`majority() = ceil(nodes.length / 2) + 1`). Five retained
peer objects therefore require four votes including self, while only the three
final voters are live. A higher-term election triggered after the seed gap can
demote r1, but no final-cohort member can assemble the inflated quorum.

This ownership claim remains a source-derived hypothesis until the production
reconciliation seam is driven deterministically. The next falsifier must begin
with departed r2/r3/r4 peer objects plus ACTIVE r1/r5/replacement service rows,
run the real cache reconciliation, and assert that the resulting Raft peer set
is exactly r5/replacement and that the final three-voter cohort can elect. If
the real seam already prunes the departed objects, this hypothesis is false and
the next owner is transport delivery during the 1547 ms gap.

## Rules out

- Treating the 09:17 blocker as spread-count debt (`largestSpreadGap` was 0).
- Treating the stale final `leader_node_id` as proof that r1 remained live
  leader after 09:08:47.
- Patching active-leader cache visibility before reproducing the departed-peer
  quorum shape.
