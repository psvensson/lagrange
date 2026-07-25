# Tasks: Request Invocation Partitioning And Cell Continuity

| Order | Quest | Required terminal |
| --- | --- | --- |
| R0 | `keyed-invocation-route-contract` | Binding/extractor/hash namespace and typed failure table are sealed with normalization and security attacks. |
| R1 | `request-cell-rendezvous-routing` | The existing resolver deterministically applies rendezvous scoring over stable ready-actual identities; distribution and minimal-remap guards are red on revert. |
| R2 | `request-cell-routing-churn-failover` | Membership-view divergence, add/remove/replace, stale selection, retry, receiver validation, and invocation-journal interactions are deterministic and bounded. |
| R3 | `cell-request-continuity-live` | Multi-Cell live proof kills the selected actual, observes exactly one replacement, restores routing within the SLO, and records one component effect. |

## Sibling source-invocation sequence

After the generic Cell continuity terminal, source-specific product Quests may
be selected from the minimal-deployment epic:

1. change-event subscription and invocation;
2. time scheduling and invocation;
3. once lifecycle invocation;
4. boot lifecycle invocation;
5. named call statement invocation;
6. pushdown query invocation.

Each source gets its own ingress, ordering, retry, authorization, and effect
doneWhen. A combined “all sources invoke” Quest may be used only as a final
matrix terminal after the individual owner boundaries are live.

## Quest authoring bars

- R0 is `class: process`; R1–R3 are product Quests with artifact probes.
- R1 must compare rendezvous output with the current hash-modulo behavior and
  prove the intended remap improvement.
- R2 cannot use cache staleness as authority or repair control-plane state from
  the resolver.
- R3 runs through real HTTP ingress, dispatcher, transport, receiver, runtime,
  and journal owners.
- Strict ownership/shards are excluded unless a separate process Quest selects
  them as a correctness requirement.
