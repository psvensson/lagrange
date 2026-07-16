# Local leader-row visibility — abstract protocol ↔ runtime

Model: `LocalLeaderRowVisibility.tla`.
Quest: `movielens-local-leader-row-visibility-model`.

This focused model composes local Raft ownership, the node-local canonical
`partitions.leader_node_id` projection, its durable publication lane, successor
LWW delivery, demotion, delayed durable self replay, and the remove-safety
consumer.

| Model | Runtime |
| --- | --- |
| `raftLeader` | `replica-leadership-state.applyReplicaLeadership` / `applyReplicaDemotion` |
| `localRowLeader` | the node's existing cached `partitions.leader_node_id` projection |
| `localRowVersion` | the merged row's `updated_at`/`updated_at_hlc` causal order |
| `durableRowLeader` | the authoritative `PARTITIONS` system-table row |
| `ElectReplacement` | Raft leader event sets `isLeader`, then `queueLeaderNodeUpdate` reaches the metadata owner |
| `SeedOnElection` | `seedLocalCanonicalLeaderNodeId` exposes the won local election |
| `PreserveLocalVersion` | the local projection preserves the durable base row version |
| `StartAuthoritativeRead` | mutation helper reads the durable point row for dedup/CAS |
| `RecheckBeforeWrite` | mutation helper re-runs `prepareFlush` immediately before submit |
| `DemoteReplacement` | follower/candidate transition conditionally clears only this node |
| `ReplayDurableSelfAfterDemotion` | delayed equal-version self publication reaches the retained demotion provenance |
| `DeliverSuccessorPublication` | newer successor CDC races the local projection under wall-clock skew |
| `ObserveSourceRemoval` | remove safety consumes canonical replacement ownership plus voter readiness |

The fixed configuration proves immediate local evidence, eventual durable
convergence or ownership loss, successor preservation, and that neither an
in-flight stale publish nor a delayed durable self replay can let a demoted
leader authorize removal. Four mutants bind the proof to the corresponding
failure shapes: missing seed, missing pre-submit fence, locally minted version,
and discarded demotion-replay provenance.

This is intentionally not a claim that every interaction between repository
layers is modeled in TLA+ or Alloy.
