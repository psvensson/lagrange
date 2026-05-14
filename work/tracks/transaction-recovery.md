# Track: Transaction Recovery

## Document Role

This track owns the long-lived concern for distributed transaction correctness,
recovery, and explicitly scoped isolation claims.

It can contain development, bugfix, stabilization, maintenance, and release-gate
sprints.

## Track Type

`runtime-invariant`

## Release Consumers

- `work/releases/0.1-stabilization.md`

## Proven Pattern

Two-phase commit systems need durable coordinator decisions, durable participant
prepare state, idempotent commit and rollback, bounded recovery sweeps, and
clear retry semantics.

Isolation claims require persistent version or conflict evidence that survives
restart and replica movement.

## Local Divergence

The current transaction coordinator has the right high-level shape, including
persistent transaction, participant, and write-operation hooks plus a durable
workflow coordinator.

The risk is that part of the visibility/conflict model is held in in-memory
partition structures such as committed write logs and row commit epochs. That
may be acceptable only if each consuming release explicitly scopes the guarantee
below durable snapshot isolation.

## Target Invariant

Every distributed transaction that reaches a durable decision recovers to the
same terminal outcome after restart.

Prepared participants either commit, roll back, or report a retryable recovery
state through one owner path. No participant invents a decision from cache or
local observation alone.

Each consuming release's isolation statement names exactly what survives restart
and what does not.

## Gate Or Acceptance Proof

Restart during begin, prepare, commit, rollback, and participant retry produces
one canonical outcome:

```text
committed | aborted | retryable | expired
```

with durable evidence and no orphan prepared state.

## Current Evidence

This track is planned. It depends on enough committed-entry side-effect clarity
to avoid hardening transaction recovery on top of ambiguous write visibility.

Known implementation context:

- `src/query/distributed/distributed-transaction-coordinator.js`
- `src/query/sql-query-engine.js`
- `src/partition/partition-service-segment-2-part-2.js`
- `src/partition/partition-service-segment-2-part-1.js`

## Owner Boundaries

Candidate boundaries:

- `distributed_transaction_owner / coordinator_recovery`
- `distributed_transaction_owner / participant_recovery`
- `partition_transaction_owner / prepared_state_reconstruction`
- `partition_transaction_owner / isolation_contract`

## Sprint Membership

No sprints are currently attached. Future development or bugfix sprints may
attach here after package evidence selects this boundary.

## Likely Files

These are context candidates, not write authorization:

- `src/query/distributed/distributed-transaction-coordinator.js`
- `src/query/sql-query-engine.js`
- `src/partition/partition-service-segment-2-part-1.js`
- `src/partition/partition-service-segment-2-part-2.js`
- `src/query/distributed/distributed-write-coordinator.js`

## Entry Condition

Start this track after committed side-effect ordering is proven or explicitly
classified as unrelated to transaction recovery.

## Exit Condition

This track can close when focused restart/recovery tests prove durable
coordinator and participant convergence, and consuming release docs carry the
exact isolation contract they claim.

## Next Package

None active. Create a package only after the entry condition is met.
