# Post-attempt-5 live runtime-outcome handoff

## Immutable evidence

- Ordered formation gate:
  `test-output/reports/live-repetitions-probe-2026-07-19T14-44-59-197Z.summary.json`
  (`5/5` green).
- Full-demo report:
  `test-output/reports/movielens-lagrange-service-affinity-live-2026-07-19T14-57-13-589Z.report.json`
  (SHA-256
  `a986569666d055daffaa09c543ea37c904f412d5c7ed7ad356b7ec334da36299`).
- Repetition summary:
  `test-output/reports/live-repetitions-demo-2026-07-19T14-57-13-695Z.summary.json`
  (SHA-256
  `53f2df8601d680cb3c391d20215f08c36e3c8a344c827ff39216ad29ccebebab`).
- Stopped-state archive:
  `data/examples/service-data-affinity-demo-archive/quest-formation-background-release-quiescence-anchor-live-demo1-runtime-outcome-owner-handoff-2026-07-19T14-57-13-589Z.tar.gz`
  (SHA-256
  `3fdd5541a800c9e8eb240e604b0a82ee399554475cbbe301f6b008c7fde5ce7f`).

The repetition runner stopped on the first red. No unchanged rerun was made.

## Formation-boundary movement

The bounded schema-admission history proves the original formation boundary is
green:

- effective in-flight replica work drained `5 -> 3 -> 2 -> 1 -> 0`;
- priority and total spread gaps closed with that drain;
- the quiescence window started once at `1784472442178`;
- no reset or observer hold occurred;
- schema admission completed after `62325ms` with two stable confirmations;
- preload admission also completed as quiescent.

This rules out the formation-release clock, schema-observer blindness, and
preload admission as the binding blocker in this run.

## New live blocker

The full demo loaded all `100000` ratings, spread three ratings partitions over
all five nodes, returned `1682` distributed grouped rows in `42ms`, created two
runtime replicas, and continuously produced the correct bounded parallel
result (`20` candidates and the correct top ten). It then stalled for the
sealed `300s` no-progress interval with weighted locality fixed at `0.500`.

The runtime-service rebalancer created these ADD operations:

| operation | target | created | executor completion |
| --- | --- | --- | --- |
| `8b21fc11-251f-4ddb-8b59-53125b8b97e8` | `ae945240-66b3-4284-b153-b2ed90684827` | `14:51:22.294Z` | `svc-movielens-topn-r1` ACTIVE at `14:51:23.353Z` |
| `51948e8a-696e-46df-a6df-f54ea404af1f` | `6c015c61-2c59-4ddc-af00-5bc883128945` | `14:51:23.278Z` | `svc-movielens-topn-r2` ACTIVE at `14:51:24.029Z` |

At shutdown, canonical `services` contains both replicas as ACTIVE on their
target nodes, but canonical `replica_operations` still contains both ADD rows
as `status=creating, workflow_step=CREATING`. The runtime rebalancer therefore
never returned from its first `advanceCheckCadence -> rebalance` call and never
scheduled the next policy evaluation that could consume the replicated
`service_partition_access` profile.

The final attribution rows are healthy and replicated. They contain fresh
base-service reads from both runtime nodes, and the production evidence
projector identifies a better two-node placement. This rules out missing
service identity, an inert query runtime, missing attribution publication,
incorrect top-ten output, or an affinity policy with no usable data profile.

## Owner-boundary cause

`RuntimeServiceHandler` emits
`RUNTIME_SERVICE_CREATE_ACTIVE` only when `executorOutcomeEmitter` is bound.
Its emitter method is intentionally a no-op when that optional dependency is
absent.

Both seed and join startup can construct the runtime handler before the
canonical `RebalanceCoordinator` is available. After control-plane setup
resolves the canonical emitter, both late-binding blocks repair
`replicaHandler` and `messageGroupServiceHandler`, but omit the already-created
`runtimeServiceHandler`:

- `src/bootstrap/bootstrap-service-control-plane-runtime-methods.js:81-96`
- `src/bootstrap/node-joining-publication-activation.js:437-452`

All five live logs show the runtime handler was created during early startup.
The two target handlers later logged successful runtime replica creation, but
neither operation produced a coordinator-owned outcome transition. This is the
missing startup dependency handoff.

The bounded successor should bind the existing runtime handler to the same
canonical executor-outcome emitter at both late-binding sites, prove seed and
join ordering deterministically, preserve the single coordinator/outcome
owner, and leave MovieLens timeouts and completion predicates unchanged.
