# Committed-read amendment 1: superseding entry for A2 and Q1 (2026-11-02)

Superseding record under R09. The recorded text of
`committed-read-amendment-1-2026-09-26.md` is not edited (R21); this entry
supersedes two of its dispositions, as the record's owner location.

## Superseded

- **A2** (`committed-read-amendment-1-2026-09-26.md:25`): "C1 itself stays:
  desired topology driving admission by the leader IS the intended split."
- **Q1** (same record, `:57`): "row-driven admission on the leader (site 3) is
  the intended split and stays".

## Replaced by

A partition leader admits a replica (raft ADD of a CREATE_REPLICA/REPLACE
target) only from an explicit `ADMIT_REPLICA {partitionId, replicaIdentity,
operationId}` request, answered from the committed replica operation. The
answer order is:

1. `NOT_LEADER`;
2. a committed read of the operation, which may answer
   `OPERATION_NOT_ADMITTING` or `AUTHORITY_UNAVAILABLE` (both typed, never a
   create failure);
3. `ALREADY_MEMBER` / `IN_FLIGHT`;
4. ADD proposed with the node taken from the committed operation row.

The request is idempotent (R14) and is re-driven over requests on a
configuration or leadership change. The services-row admission producer
(`reconcileRaftPeersFromCacheForService` and its cache-event trigger) is
deleted.

This is the shape already reviewed as the R2 request owner
(`design-r2-committed-membership-2026-09-23.md:219-238`, "`requestId` is the
replica_operation id"), limited to ADD. The O1 deferral of R2 ("NOT this
release") is lifted for this part only.

**Kept:** A8, under which rows remain discovery and presentation, never
authority. M3 still holds: a legitimate join is never locked out. The
target re-sends its request on the existing learner-promotion cadence, and
the leader re-drives stored requests on `CONF_CHANGE_APPLIED` / `LEADER`.

## Authority and record

- **Owner confirmation (the authority for this supersession):** Peter (owner)
  confirmed the lead decision on 2026-11-02. It is recorded as the
  `kind: decision` finding "Owner confirmation 2026-11-02 (Peter): ..." in
  `solve/quests/replica-admission-from-committed-operation/log.ndjson`.
- **Decision:** lead decision 2026-11-02 on quest
  `replica-admission-from-committed-operation`, Option 1.
- **Owner brief, 2026-11-02:** "repair replica admission driven by cached
  services rows ... at the existing owners".
- **Takeover HANDOVER, Priority B:** "prove that the trigger does not depend on
  the very services-row visibility it must restore".
- **Evidence:** `solve/quests/replica-admission-from-committed-operation/evidence/transition.md`
  and its Phase 0 witness. The quest log holds the `kind: decision` entry.
- **Same decision, second target:** `architecture/runtime-contracts.md:192-193`
  ("CDC-propagated metadata decisions read from the cache") is superseded for
  gating decisions; the contract file carries the supersession note.
