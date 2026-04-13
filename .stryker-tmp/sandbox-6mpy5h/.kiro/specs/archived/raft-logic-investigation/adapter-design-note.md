# Adapter Design Note

## Implemented Spike Components

- `src/raft/spike/raft-provider-control.js`
- `src/raft/spike/raft-logic-id-mapper.js`
- `src/raft/spike/raft-logic-spike-adapter.js`
- `src/raft/spike/raft-logic-spike-cluster.js`
- `scripts/run-raft-logic-investigation-spike.js`

## Activation and Isolation

- Spike execution is explicitly gated by:
  - `RAFT_PROVIDER=raft_logic_spike`
- Default production path remains unchanged (liferaft path untouched).
- Spike is isolated to dedicated modules under `src/raft/spike/`.

## Adapter Responsibilities Implemented

1. Startup / shutdown:
   - wraps `ThreadedRaftNode.start()` and `stop()`
2. Propose command:
   - `propose()` -> `clientRequest(..., waitFor='commit')`
   - callback bridge via `command(payload, cb)`
3. Role notifications:
   - consumes `onRoleChange` and emits leader/follower/candidate events
4. Commit callback:
   - consumes `apply(entry)` and emits commit records
5. Leader identity tracking:
   - consumes state snapshots, maintains leader cache

## Key Design Choices

- Deterministic ID translation:
  - external UUID-like IDs -> internal u64-string IDs for raft-logic.
- Dedicated cluster harness:
  - shared `InMemoryTransport` for correctness checks.
- Storage modes:
  - in-memory for fast checks
  - sqlite mode for restart/durability validation

## Known Limitations

1. No direct packet-level bridge to existing liferaft packet handlers.
2. Runtime timing mutation parity with current liferaft controls was not
   completed.
3. Restart behavior with sqlite mode has blocker-level instability (see issue
   register).

## Removability

Spike code is self-contained in dedicated files and can be removed without
touching default liferaft runtime behavior.
