# Seed Bootstrap + Join Pipeline Requirements

## Overview
Define a single, explicit bootstrap and join pipeline that guarantees leader
metadata completeness before any node can join or any control-plane writes occur.
Seed bootstrap must use a temporary direct-write path and then switch to SQL
routing with CDC-fed cache as the only system information source.

## Functional Requirements
1. Seed bootstrap uses a fixed phase pipeline with explicit invariants and
   timeouts. No implicit fallbacks or alternate code paths are allowed.
2. The seed can perform direct system table writes only during bootstrap. After
   bootstrap, all writes must go through SQL routing to the leader replica.
3. Before seeding and before allowing joins, all raft groups must have leader
   metadata recorded:
   - `services` has a leader row for each partition and message group
     (`raft_role = leader`, `status = active`, `address` set).
   - `partitions.leader_node_id` is set for every partition.
   - `message_groups.leader_node_id` is set for every message group.
4. System cache is authoritative and must be populated only by hydration and CDC
   events. No direct cache writes are permitted.
5. CDC subscriptions must be active only after cache hydration, or buffered
   until hydration completes, to avoid partial state.
6. Joiners must fail fast with a clear error if leadership metadata is missing
   or incomplete. No timeouts for missing metadata.
7. Bootstrap API must reject join requests until the seed is in READY state and
   leadership metadata is complete.
8. Control-plane registration must occur only after cache hydration and CDC
   subscription are active.

## Non-Functional Requirements
1. Deterministic behavior with bounded timeouts and explicit error reporting.
2. Single, unified write API for system tables with a one-time implementation
   swap at a phase boundary.
3. All scalars (phase names, error codes, timeouts) are defined in constants.
4. Logs must include phase name, duration, and missing leader detail when
   gates fail.

## Error Contracts
- `BOOTSTRAP_NOT_READY`: Seed is not yet READY.
- `LEADER_METADATA_INCOMPLETE`: Missing leader metadata with lists of missing
  partitions and message groups.
- `SQL_ENGINE_UNAVAILABLE`: SQL engine is not ready.

## Configurable Parameters
- Phase timeouts (per phase).
- Leader stability window (optional).
- CDC buffering mode (buffer-until-hydrated or subscribe-after-hydration).
