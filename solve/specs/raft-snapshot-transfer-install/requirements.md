# Requirements: Raft Snapshot Transfer And Install

## Scope and ownership

This protocol bounds Raft recovery history. It extends the existing Raft owner,
transport authentication, adapter persistence, readiness, and pressure
classification. It is not table-split snapshot copying, a cluster-consistent
service read API, backup/restore, or PITR.

## R1 — Versioned checkpoint

- A checkpoint SHALL seal authenticated cluster identity, Raft-group identity,
  state-machine entity kind and ID, last-included index and term, committed
  state, membership/fencing epoch, payload kind/version, byte length, and
  digest. Receivers SHALL reject a mismatch in any identity dimension before
  staging or advertising recovery progress.
- Checkpoint creation SHALL read one consistent committed state-machine view and
  publish the checkpoint only after its payload and metadata are durable.
- The SQLite production database co-locates state-machine data with
  follower-local `_raft_log` and `_raft_state`. Its adapter SHALL materialize a
  consistent state-machine-only image through a versioned table include-set or
  an equivalently deterministic backup-then-scrub step before the payload is
  sealed. `_raft_log` and `_raft_state` SHALL never cross replicas in the
  snapshot payload. Non-SQLite adapters SHALL provide the same immutable
  state-machine/local-consensus separation behind the protocol envelope.
- Partial, corrupt, unsupported, stale, foreign-cluster, foreign-group,
  foreign-entity, and foreign-epoch checkpoints SHALL be typed and never
  advertised as recovery progress.

## R2 — Separately bounded transfer pressure

- Snapshot bytes SHALL use an authenticated, integrity-checked, resumable
  transfer with explicit protocol negotiation.
- Snapshot repair SHALL NOT consume the same effective lane as critical
  convergence. Reusing cluster transport is legal only behind independent
  admission, concurrency, byte-rate, queue, and cancellation controls.
- Foreground Raft heartbeats, votes, AppendEntries, membership convergence, and
  critical control-plane work SHALL retain reserved progress under snapshot load.
- Restarted transfers SHALL resume only from verified chunk boundaries.

## R3 — Atomic install and restart

- A follower SHALL stage and validate the complete snapshot before one atomic
  install transition.
- It SHALL restore committed state before publishing the last-included index or
  accepting post-snapshot AppendEntries.
- The install transition SHALL reconstruct `_raft_log` and `_raft_state`
  locally, including the compacted-log boundary and committed/applied progress.
  It SHALL preserve a local current term higher than the snapshot's included
  term and SHALL apply an explicit, Raft-safe `votedFor` reset/retention rule;
  it SHALL never import the sender's local log or vote rows.
- Restart SHALL distinguish no install, partial staging, complete uninstalled,
  installed, and rejected states without exposing a commit watermark ahead of
  installed state.
- A membership-epoch change SHALL abort the transfer; continuation across epochs
  is forbidden in the first protocol.

## R4 — Catch-up and compaction

- A follower behind the retained prefix SHALL receive the newest eligible
  snapshot and resume AppendEntries at the next index.
- Ordinary follower catch-up SHALL remain available when the required log
  prefix is retained.
- Physical compaction SHALL require durable local snapshot proof and preserve
  the last-included term/index consistency boundary.
- Retention SHALL keep a bounded set of complete generations and every
  generation pinned by an active install. Cleanup SHALL never remove the sole
  recovery source for an admitted transfer.

## R5 — Safety and live acceptance

- Across create, transfer, install, restart, corruption, cancellation,
  membership change, and compaction attacks: committed state SHALL not be lost,
  duplicated, reordered, or exposed ahead of durability.
- A large lagging or restarted follower SHALL recover while foreground
  reads/writes continue, without starving critical convergence.
- Evidence SHALL include transfer bytes/rate, queue and retry bounds, install
  state, log-prefix size, catch-up duration, foreground throughput/latency,
  resource bounds, and acknowledged-write reconciliation.
- No roadmap or release claim becomes available until the live rebuild Quest
  and its prerequisite protocol Quests are terminal.

## Reuse comparison

- **REUSED:** Raft roles/log matching, adapter durability, authenticated cluster
  transport, readiness/fencing identities, entity ownership, and
  pressure/admission vocabulary.
- **EXTENDED:** Raft replication gains snapshot metadata, transfer, install,
  restart, and post-snapshot AppendEntries behavior.
- **NEW:** versioned snapshot envelope with cluster/group/entity binding,
  state-machine-only adapter payload rules, local Raft-table reconstruction, and
  a separately bounded bulk pressure class; none exists in the current protocol.
