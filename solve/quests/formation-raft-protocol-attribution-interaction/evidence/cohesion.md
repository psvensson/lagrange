# LifeRaft attribution interaction cohesion review

Quest: `formation-raft-protocol-attribution-interaction`

Reviewed before editing `src/raft/liferaft.js` at committed HEAD
`1b7ac8d048c7abe11bd99e48a95b5889a1dc46b8`.

## Existing owners

- `src/raft/liferaft.js` is 772 physical lines. It owns the LifeRaft subclass,
  the patched inbound DATA handler, Raft safety and catch-up behavior, and the
  subclass overrides that delegate to the upstream LifeRaft protocol. The DATA
  handler must remain here because its packet decisions and effects are Raft
  behavior.
- `src/raft/liferaft-timing-api.js` owns the LifeRaft timing delegation
  boundary: election-timeout resolution, candidacy deferral, and the guarded
  heartbeat registration call. It genuinely owns timing registration, so it is
  the cohesive site for applying a protocol-attribution wrapper around the
  existing heartbeat delegate. It can likewise own the thin delegation used by
  the upstream `indefinitely` retry registration, while the public method and
  retry algorithm remain in LifeRaft and upstream LifeRaft respectively.
- `src/raft/liferaft-commit-scheduler.js` owns serialized, bounded
  commit/application slices. The apply call stays there; no apply ordering,
  yield, rollback, or effect behavior moves.
- `src/diagnostics/formation-turn-attribution.js` owns exclusive attribution,
  async propagation, and inactive transparency. It already exposes the only
  operational attribution entry point, `runFormationOwner`.
- `src/diagnostics/raft-churn-sync-sections.js` owns event-loop-gap site
  instrumentation. It names an apply slice but does not own Raft protocol
  attribution and is not a correct home for DATA or retry dispatch behavior.

## Interaction decision

No existing owner owns the cross-cutting semantic mapping from Raft activity to
formation diagnostic buckets. Add
`src/diagnostics/raft-formation-attribution.js` as the interaction owner. Its
independent contract is limited to two typed operations:

1. run protocol registration/dispatch as `raft_protocol`;
2. run an existing commit/apply sync-section as `raft_apply`.

The module may compose diagnostic wrappers, but it may not schedule a timer,
dispatch a packet, retry an operation, apply an entry, or decide Raft state.
LifeRaft and its existing timing/apply owners call this contract at their
current behavior sites. No class methods or Raft behavior are extracted into
the new module.

This is not a line-count extraction. The location follows the ownership model
even if `liferaft.js` remains below, reaches, or crosses the existing static
boundary. If the cohesive call sites make the checker exceed its limit and an
independent verifier finds no owner-correct extraction, implementation stops at
the exact verified floor under the operator's supersession procedure; no line
trimming, methods bag, baseline edit, exception, or headroom is permitted.

## Required paired proof

The registered interaction contract must execute the real LifeRaft methods and
handler with deterministic timer/log/transport ports. In one proof surface it
must show protocol registration and re-arm, unbounded retry generations,
inbound DATA, distinct apply ownership, exclusive duration partitioning, and an
inactive A/B whose normalized Raft effects are identical. Reverted interaction
mappings must make the behavioral owner assertions red while still executing
the same LifeRaft behavior paths.
