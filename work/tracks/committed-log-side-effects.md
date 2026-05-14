# Track: Committed Log Side Effects

## Document Role

This track owns the long-lived concern for side effects that derive from
partition writes: CDC, split replication, size accounting, managed-split
evaluation, and system projection visibility.

It can contain development, bugfix, stabilization, maintenance, and release-gate
sprints.

## Track Type

`runtime-invariant`

## Release Consumers

- `work/releases/0.1-stabilization.md`

## Proven Pattern

For Raft-backed state machines, the committed log entry is the source of truth.
Durable state mutation and durable side effects should be gated by commit index.

CDC and projection systems should behave like a transactional outbox over
committed entries: idempotent by stable entry identity and replayable after
restart.

## Local Divergence

Partition writes currently execute SQLite and build side effects before the Raft
proposal has completed and before the commit wait resolves.

The important local path is:

- write entry creation and local log append
- SQLite execution
- side-effect plan application
- Raft proposal
- commit wait

That ordering may expose CDC, split, size, or projection side effects for an
entry that has not yet been proven committed.

## Target Invariant

No CDC event, split replication event, size-accounting update, or projection
visibility event is emitted for an uncommitted Raft entry.

Every emitted side effect can be tied to:

```text
partitionId + raftLogIndex + entryId
```

and replayed idempotently after restart.

## Gate Or Acceptance Proof

A crash or transport failure during a proposed multi-replica write cannot expose
uncommitted user data, system metadata, CDC projection, or split/size side
effects.

## Current Evidence

This track is planned. It should not interrupt the active topology package.

Known implementation context:

- `src/partition/partition-service-segment-3-part-1.js`
- `src/partition/partition-service-segment-2-part-1.js`
- `src/partition/partition-service-segment-3-part-2.js`
- `src/partition/partition-write-kernel.js`
- `src/cdc/cdc-integration-service-segment-1.js`
- `src/cache/system-table-cache.js`

## Owner Boundaries

Likely owner boundaries must be selected by package evidence before runtime
changes start. Candidate boundaries:

- `partition_write_owner / commit_ordering`
- `cdc_projection_owner / committed_entry_outbox`
- `split_replication_owner / committed_entry_side_effects`

## Sprint Membership

No sprints are currently attached. Future development or bugfix sprints may
attach here after package evidence selects this boundary.

## Likely Files

These are context candidates, not write authorization:

- `src/partition/partition-service-segment-3-part-1.js`
- `src/partition/partition-service-segment-2-part-1.js`
- `src/partition/partition-service-segment-3-part-2.js`
- `src/partition/partition-write-kernel.js`
- `src/partition/proposal-queue.js`
- `src/cdc/cdc-integration-service-segment-1.js`
- `src/cache/system-table-cache.js`

## Entry Condition

Start this track only when the current active topology package closes, migrates,
or canonical evidence names committed side-effect ordering as the next blocker.

## Exit Condition

This track can close when focused crash/restart proof shows that uncommitted
entries cannot emit side effects and committed entries replay exactly once from
the consumer perspective.

## Next Package

None active. Create a package only after the entry condition is met.
