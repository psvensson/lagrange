# Post-live ordered-gate boundary move — 2026-07-19

## Verdict

The retained runtime replica-state projection fix engaged and removed this
Quest's sealed lost-projection failure. The first measuring failure moved to a
different owner boundary: a remote runtime-service `ADD` reaches ACTIVE and its
target coordinator repeatedly wakes the source owner, but
`ReplicaDispatchService` drops the source-owned `CREATING` runtime-service row
before workflow progress reconciliation. The operation therefore remains
`CREATING` and blocks the later affinity replacement.

No unchanged live rerun is permitted. This evidence supports
EXHAUST-AND-PIVOT from the projection-owner Quest to a successor bounded around
remote owner-wake terminalization.

## Immutable run identity

- Source checkpoint: `84263aebc9876833890f03b0bb55fba26346c6ec`
- Stable live source fingerprint: `89746483ec09bd6c`
- Approved projection attempt:
  `sha256:c609867ff990b879c55afb963c800692cd236103bc583f9500d43a43d9c8b9c1`
- Formation summary:
  `test-output/reports/live-repetitions-probe-2026-07-19T18-53-20-712Z.summary.json`
  (`sha256:5cd30242792a74d0cc289996296430f88ef65fb30ee39c33b649a91f812e211c`)
- Demo summary:
  `test-output/reports/live-repetitions-demo-2026-07-19T19-14-53-243Z.summary.json`
  (`sha256:05dc045d97f5565eb24807c20ab71b9e370faa8e94cf49dadee5eac4bf3f3235`)
- First red measuring report:
  `test-output/reports/movielens-lagrange-service-affinity-live-2026-07-19T19-14-53-126Z.report.json`
  (`sha256:c5585624fd68b6a1710cfdb125430fdab86e5cbbc99fe0e48c4054d80b01edcb`)
- Immutable stopped-state archive:
  `data/examples/service-data-affinity-demo-archive/quest-runtime-replica-state-projection-retained-reconcile-integrity-reseal-demo2-learned-affinity-stall-2026-07-19T19-14-53-126Z.tar.gz`
  (`sha256:fde36f1f5413a1cdca5bfbdfb2cf36af875417059dddce13ef49d710e0f55cf4`)

The ordered runner passed all five formation probes, then Demo 1 passed. Demo 2
loaded all 100,000 ratings, returned all 1,682 grouped rows, produced the exact
top-10 result and 20 candidates, and stopped at the first measuring red after
weighted locality remained `0.5` for the unchanged 300-second stall budget.
The runner did not start Demo 3.

## Durable state proves the projection fix engaged

The stopped `services-p1-r1` database contains both desired runtime replicas:

| service_id | node_id | status | updated_at |
| --- | --- | --- | --- |
| `svc-movielens-topn-r1` | `e4fcf1e0-dbd1-4157-a7c2-3e60c12efa58` | `active` | `1784488106272` |
| `svc-movielens-topn-r2` | `5bdfac61-6e89-488b-a78b-ed6331765dbd` | `active` | `1784488106514` |

This differs from the sealed projection-loss witness, where the remote
replica's CREATED/ACTIVE projection exhausted and no r2 services row remained.
Here the retained projection owner preserved and applied ACTIVE before the
source operation deadline.

The stopped `replica_operations-p1-r1` database instead separates the two
operation outcomes:

| operation_id | replica_id | target_node_id | status / workflow_step |
| --- | --- | --- | --- |
| `3adb6a32-238a-4e3e-8de4-5bcf2b61e63e` | `svc-movielens-topn-r1` | source node | `active / ACTIVE` |
| `a737532b-b8ad-4e24-801c-135237dcc809` | `svc-movielens-topn-r2` | remote node | `creating / CREATING` |

The remote row was created at `1784488106330`, last updated at
`1784488106530`, and remained non-terminal through shutdown.

## Source/target timeline

For operation `a737532b-b8ad-4e24-801c-135237dcc809`:

1. The source coordinator created the runtime-service `ADD`, transitioned
   `PENDING -> SENDING`, and sent CREATE to the remote runtime handler at
   `19:08:26.510Z`.
2. The remote handler completed runtime activation and emitted
   `RUNTIME_SERVICE_CREATE_ACTIVE` at `19:08:26.519Z`.
3. The source durable operation transitioned `SENDING -> CREATING` at
   `19:08:26.558Z`.
4. The source fetched the projected ACTIVE services row
   `svc-movielens-topn-r2` through CDC at `19:08:26.578Z`.
5. A same-instant redispatch reached the remote runtime handler. Its
   idempotent branch observed the replica already ACTIVE and emitted
   `RUNTIME_SERVICE_CREATE_ACTIVE` again.
6. The target coordinator retained and retried the canonical source-owner wake
   until `19:09:27.452Z`, then logged that its operation budget was exhausted.
   The wake destination was the source node and the retained snapshot remained
   `CREATING`.

This rules out missing runtime activation, missing ACTIVE projection, stale
executor-emitter identity, omission of runtime ACTIVE from the target outcome
classifier, and a non-idempotent already-ACTIVE handler branch.

## First violated invariant

`ReplicaDispatchService.reconcileOperationDispatch` admits non-pending replay
only when `shouldExecuteOperationFromDispatchReplay(row)` is true. The latter
recognizes:

- `CREATING` ADD/REPLACE only for system-table partitions; and
- ACTIVE REPLACE source removal.

The remote runtime-service row is a non-system `ADD` in `CREATING`.
Consequently, every post-completion owner wake resolves the authoritative
`CREATING` row, fails the replay predicate, and is cleared before
`RebalanceCoordinator.dispatchOperation(..., {cause:
replica_operation_dispatch})` can run its existing observed-services progress
reconcile. The source therefore never consumes the already-ACTIVE services
row as terminal workflow evidence.

The exact invariant that fails is:

> A target-observed ACTIVE outcome for a source-owned runtime-service ADD must
> make the canonical source owner reconcile terminal progress, even when the
> authoritative operation row has already advanced to CREATING.

This is an operation-dispatch/owner-wake admission defect, outside the sealed
single projection-owner and retained lifecycle-handoff implementation. It is
not an affinity score, cadence, timeout, or MovieLens workload defect.

## Why locality remains 0.5

The workload attribution rows give ratings-partition read weight to the source
and remote runtime nodes, while the ratings data replicas reside on the source,
`b316f23b-730d-4865-9328-d0a978a017e8`, and
`f459720c-3bec-4fb3-8871-2c4907e106e3`. Placement
`source + remote` therefore scores one local weight versus a best score of two.
With the remote ADD still in flight, the planner's pending-operation cleanup
interlock prevents the profitable replacement. No scoring change is indicated.
