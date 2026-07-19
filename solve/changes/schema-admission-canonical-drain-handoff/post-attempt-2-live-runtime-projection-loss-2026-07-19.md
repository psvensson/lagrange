# Post-attempt 2 live boundary: runtime projection loss

## Immutable evidence

- Source checkpoint: `65b3e86f`
- Ordered formation gate: `5/5` green
- Formation summary:
  `test-output/reports/live-repetitions-probe-2026-07-19T17-25-41-797Z.summary.json`
- Formation summary SHA-256:
  `de9db9f0803dc4bb88e374662a4b1602ac33aa9932165e23066c9c068a619255`
- Measuring source fingerprint: `59729b2ac2d20e5a`
- Demo report:
  `test-output/reports/movielens-lagrange-service-affinity-live-2026-07-19T17-40-35-058Z.report.json`
- Demo report SHA-256:
  `857bc0a1c4c17f5909da70003e554e508175bd197e60f2689faf2d91f436753a`
- Repetition summary:
  `test-output/reports/live-repetitions-demo-2026-07-19T17-40-35-211Z.summary.json`
- Repetition summary SHA-256:
  `758798f2615afb296d074a1dfd5cb17e09b3191af263886dd40d01e3c4803e68`
- Stopped-state archive:
  `data/examples/service-data-affinity-demo-archive/quest-schema-admission-canonical-drain-handoff-demo1-initial-placement-timeout-2026-07-19T17-40-35-058Z.tar.gz`
- Archive SHA-256:
  `2653b9d034acc89d36bfc0691fb6f15efb673cf89ed64c7203d771cdbbff8901`

The ordered runner stopped after measuring Demo 1. No unchanged rerun was
performed.

## The sealed schema boundary passed live

The report records schema admission as `admitted` with two fresh confirmations.
The immediately preceding operation-only observation was at
`1784482070135`, with priority spread already ready. The candidate window
started from the retained terminal drain at `1784482073402`. Fresh
confirmations arrived at:

- `1784482134172` (`drain + 60770ms`)
- `1784482137030` (`drain + 63628ms`)

The report's final schema snapshot is `quiescent`, priority spread gap is zero,
and the load lane also admitted. The demo then loaded all 100,000 ratings,
spread three ratings partitions across all five nodes, and completed the
distributed grouped SQL result.

This live result rules out the schema drain-anchor handoff as the remaining
failure boundary.

## Later runtime-service boundary

The runtime-service rebalancer started for `svc-movielens-topn` at
`17:30:17.645Z`.

Replica 1 completed normally:

- ADD `d1a1453b-b6e3-495a-aba7-ea2cc99afad8` created at
  `17:36:17.869Z`
- target handler began at `17:36:21.466Z`
- local runtime activation completed at `17:36:22.038Z`
- all retained `services-p1` replicas contain
  `svc-movielens-topn-r1 | active`
- its operation is terminal `ACTIVE`

Replica 2 crossed a different owner boundary:

- ADD `42772cb1-6ed5-4387-8435-54cfe6119ab2` created at
  `17:38:52.067Z`
- remote target handler began at `17:38:55.293Z`
- CREATED services projection exhausted its routed write at
  `17:39:25.437Z` after `30141ms` with
  `DISTRIBUTED_PARTICIPANT_FAILURE`
- the canonical source owner timed out CREATING at `17:39:57.029Z`,
  `61705ms` after operation creation
- ACTIVE services projection exhausted its routed write at
  `17:40:00.847Z` after another `35410ms` with the same participant failure
- the target handler marked local activation complete at
  `17:40:00.848Z`, `3819ms` after the source operation had already failed

Stopped-state SQL confirms:

- operation `42772cb1-...` is terminal `FAILED / FAILED`, error
  `Timeout in CREATING step after 61705ms`
- no authoritative `svc-movielens-topn-r2` row exists in any retained
  `services-p1` replica
- the target handler subsequently reports the local replica already exists in
  ACTIVE state

## Exact implementation gap

`ServiceRuntimeLifecycle._projectReplicaState()` awaits the production
services-table writer, catches a failed write, emits
`STATE_PROJECTION_FAILED`, and then returns success. No production consumer
retains or repairs that failed desired state.

Consequently the current best-effort contract has both failure modes at once:

1. each routed projection can consume most of the fixed operation deadline
   before the lifecycle emits its executor outcome; and
2. after the wait, failure is discarded, so local ACTIVE state can exist
   indefinitely without its authoritative services row.

This is not the previously repaired remote ACTIVE handoff. That handoff occurs
only after the target lifecycle returns; in this witness the source operation
was already terminal FAILED before local ACTIVE completion. Repeated
CREATE_REPLICA delivery then observes local ACTIVE, but cannot honestly revive
the failed source operation or reconstruct the missing services row.

## Boundary movement

The next invariant belongs to the runtime lifecycle services-projection owner,
not schema admission:

- retain one latest desired projection per runtime replica;
- serialize/coalesce CREATED-to-ACTIVE transitions so delayed writes cannot
  regress state;
- retry failed authoritative projection through a bounded owned mechanism;
- do not keep the executor outcome behind the projection writer's routed retry
  duration;
- preserve create-once-then-update identity discipline and the single services
  projection owner.

The current Quest must remain an exhausted boundary-moving result, not be
widened into this new owner contract.
