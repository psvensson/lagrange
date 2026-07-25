# Raft Snapshot Transfer And Install

## Planning Status

This owner boundary is selected for implementation planning. The executable
requirements and Quest order live in
[`solve/specs/raft-snapshot-transfer-install/`](../../solve/specs/raft-snapshot-transfer-install/);
the epic decision trail lives in
[`solve/epics/raft-snapshot-transfer-install.md`](../../solve/epics/raft-snapshot-transfer-install.md).
This document remains the architectural summary and does not itself certify that
snapshot recovery or compaction exists.

## Intent

Bound Raft log growth without removing the only recovery history available to
a lagging follower. Compaction remains disabled until this work is specified,
implemented, and proven as one protocol feature rather than as an adapter-local
storage optimization.

## Required Protocol Surface

- Snapshot creation seals authenticated cluster, Raft-group, and state-machine
  entity identity together with the last-included index, term, committed state,
  and membership/fencing epoch.
- Leaders transfer snapshots through an authenticated, integrity-checked,
  resumable protocol with explicit version negotiation and a separately bounded
  bulk pressure class. Snapshot work cannot consume the same effective lane as
  critical convergence.
- Followers install atomically, reject stale or foreign snapshots, restore the
  committed state machine before advertising progress, and resume ordinary
  AppendEntries at the first index after the snapshot.
- Restart recovery distinguishes complete, partial, and rejected installs and
  cannot expose a commit watermark ahead of installed state.
- Compaction becomes eligible only after durable snapshot proof and preserves
  the last-included term/index required by Raft consistency checks.

## Selected Decisions

1. **Materialization:** a versioned protocol envelope carries an
   adapter-specific immutable state-machine payload. The SQLite production
   database co-locates state-machine tables with follower-local `_raft_log` and
   `_raft_state`; its snapshot uses a versioned state-machine include-set (or
   backup-then-scrub equivalent) that excludes both local Raft tables before
   sealing. Install reconstructs their compacted-log boundary and local
   persistent state through the Raft install transition, preserving any higher
   local term and applying explicit vote-reset semantics. Other adapters must
   provide the same separation rather than pretending SQLite bytes are
   universal.
2. **Transfer ownership:** reuse authenticated cluster transport only behind a
   separately admitted and backpressured bulk pressure class. If the transport
   cannot enforce effective lane isolation, use a separate bulk channel.
3. **Membership changes:** a changed membership/fencing epoch aborts the
   transfer. A follower restarts from a snapshot sealed under the current epoch.
4. **Retention:** keep a bounded set of complete generations plus any generation
   pinned by an active install. A follower older than the retained log receives
   the newest eligible snapshot; physical compaction never advances beyond
   durable local snapshot proof.

## Future Sealed Result

> A lagging or restarted follower can recover from a versioned, integrity-bound
> snapshot and resume AppendEntries without losing committed state, accepting a
> foreign cluster, Raft group, entity, or epoch, importing another replica's
> local Raft tables, or requiring a retained pre-snapshot log prefix; only then
> may adapters physically compact entries covered by durable snapshot proof.

Implementation remains split into adversarial product Quests. The existing
`raft-snapshot-gated-compaction` Quest remains the safety guard; it is not
reopened or treated as implementation evidence.
