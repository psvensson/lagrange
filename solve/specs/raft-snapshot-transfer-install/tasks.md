# Tasks: Raft Snapshot Transfer And Install

Every implementation row is one product Quest with a real artifact probe.
Successor Quests seal only after the predecessor fixes the protocol surface they
consume.

| Order | Quest | Required terminal |
| --- | --- | --- |
| S1 | `raft-snapshot-checkpoint-format` | Versioned checkpoint creation is durable, binds cluster/group/entity identity, excludes follower-local consensus state, is restart-readable, and is red on corrupt/stale/foreign input. |
| S2 | `raft-snapshot-atomic-install` | A follower stages and atomically installs a checkpoint, locally reconstructs Raft tables without regressing term or importing vote state, never advertises progress ahead of state, and recovers every partial-install restart state. |
| S3 | `raft-snapshot-bulk-transfer` | Authenticated resumable chunks use a separately bounded pressure class; critical convergence progresses under saturation. |
| S4 | `raft-snapshot-compacted-follower-catchup` | A follower older than the retained prefix installs the newest eligible snapshot and resumes AppendEntries exactly after it. |
| S5 | `raft-snapshot-retention-compaction` | Bounded generation retention pins active installs and physical prefix removal cannot outrun durable proof. |
| S6 | `raft-snapshot-live-rebuild` | A large replica rebuild under foreground writes is data-safe, resource-bounded, throughput-measured, restartable, and convergence-safe. |

## Quest authoring bars

- S1 must enumerate every payload kind and its state-machine include/exclude
  rules in the compatibility matrix. SQLite evidence must inspect the sealed
  payload and prove `_raft_log` and `_raft_state` are absent.
- S2 must attack higher local term, prior vote, foreign cluster/group/entity,
  and restart states while proving the compacted boundary and progress metadata
  are reconstructed locally.
- S3 must identify the pressure owner and prove effective lane isolation; a
  separate queue name without reserved progress is insufficient.
- S4 must begin from a leader whose required log prefix is genuinely absent.
- S5 must retain `raft-snapshot-gated-compaction` as a safety guard and prove
  the new protocol before enabling removal.
- S6 uses the scale program's report schema and cannot close on a small,
  no-foreground-traffic adapter test.
- Each Quest includes corruption, truncation, duplicate, stale epoch, restart,
  cancellation, and resource-pressure attacks applicable to its boundary.

## Explicit exclusions

- Backup/restore/PITR remains externally owned.
- Managed table split snapshot transfer remains owned by the split workflow.
- The service consistent-snapshot API is a separate read/barrier contract.
