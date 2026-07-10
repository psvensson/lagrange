# Raft Snapshot Transfer And Install

## Intent

Bound Raft log growth without removing the only recovery history available to
a lagging follower. Compaction remains disabled until this work is specified,
implemented, and proven as one protocol feature rather than as an adapter-local
storage optimization.

## Required Protocol Surface

- Snapshot creation seals the last-included index, term, committed state, and
  membership/fencing identity.
- Leaders transfer snapshots through an authenticated, integrity-checked,
  resumable protocol with explicit version negotiation.
- Followers install atomically, reject stale or foreign snapshots, restore the
  committed state machine before advertising progress, and resume ordinary
  AppendEntries at the first index after the snapshot.
- Restart recovery distinguishes complete, partial, and rejected installs and
  cannot expose a commit watermark ahead of installed state.
- Compaction becomes eligible only after durable snapshot proof and preserves
  the last-included term/index required by Raft consistency checks.

## Options To Resolve

1. Snapshot materialization: SQLite backup image, logical state-machine export,
   or a versioned hybrid.
2. Transfer ownership: existing Raft transport lane or a separately bounded
   bulk-transfer channel coordinated by Raft metadata.
3. Membership changes during transfer: abort/restart versus fenced continuation
   under the sealed membership epoch.
4. Retention policy: follower progress floor, bounded generations, and recovery
   behavior for a follower older than every retained generation.

## Future Sealed Result

> A lagging or restarted follower can recover from a versioned, integrity-bound
> snapshot and resume AppendEntries without losing committed state, accepting a
> foreign epoch, or requiring a retained pre-snapshot log prefix; only then may
> adapters physically compact entries covered by durable snapshot proof.

This future item is intentionally not an implementation Quest. Its open choices
must be resolved into a spec and adversarial `doneWhen` before compaction is
enabled.
