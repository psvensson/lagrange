# Post-attempt 10 supported boundary: stale PENDING masks target progress

## Verification disposition

Independent pre-implementation verification rejected
`post-attempt-10-live-deferred-retry-context-loss-2026-07-20.md`
(SHA-256
`64caeed8a7df3f3f59df48c765ff0fe22efcb3415e29d98018331f203937461b`)
as the supported live root cause. Deferred-retry context loss is a real latent
asymmetry, but the live run does not prove that a marked target-outcome
reconcile entered that retry boundary.

The verifier instead confirmed the stale-row selection mechanism below with a
no-write production-method proof:

```json
{
  "selectedStep": "PENDING",
  "ownerDispatches": 0,
  "ordinaryRows": [
    {
      "step": "PENDING",
      "handoffMode": null
    }
  ]
}
```

Focused checks remained green before source changes: runtime target progress
39 assertions, remote outcome 52 assertions, and timeout snapshot selection
47 assertions.

## Immutable live evidence

- Checkpoint:
  `5cd62f17333a99771b8cd6e9958f11e9c79b3339`
- Five-probe summary:
  `test-output/reports/live-repetitions-probe-2026-07-20T05-59-57-592Z.summary.json`
  (SHA-256
  `9872eab283b25f3ec57957ca71906813de839d4889cb5bd90b18c13b7c20c6f3`,
  `5/5` passed)
- Red demo report:
  `test-output/reports/movielens-lagrange-service-affinity-live-2026-07-20T06-23-14-443Z.report.json`
  (SHA-256
  `6c491ee9b22a1321a9b537d1dcbc3fd597ba99054467e536218aabdb254c6be4`)
- Ordered demo summary:
  `test-output/reports/live-repetitions-demo-2026-07-20T06-23-14-579Z.summary.json`
  (SHA-256
  `3971b1b28dc148dc52913fdf2e5311d92b708f45bc42ac815d4b62eca2db46c9`)
- Immutable five-node archive:
  `solve/changes/runtime-service-creating-owner-wake-progress-admission/live-runs/demo-gate-2026-07-20T06-00-02Z.run-state.tar.gz`
  (SHA-256
  `39bcecc654407e2b6544e7078d8462b926f7a43ace11068fc56536f841af7efd`)

For runtime-service ADD `10cda070-2931-4c4b-858b-7868063f3721`,
the source fetched the inserted `replica_operations` row at
`06:13:56.282Z`. Its later source transitions were not reflected through the
same CDC fetch path:

- `06:13:56.436Z`: the SENDING update fetch reported
  `No row found for CDC update`.
- `06:13:56.503Z`: the CREATING update fetch reported the same.

The target completed exact runtime replica `svc-movielens-topn-r1` at
`06:13:56.470Z`. The source fetched the exact ACTIVE `services` row at
`06:13:56.482Z` and refreshed it at `06:13:56.505Z`, but its durable
operation remained CREATING until the demo failed initial placement.

The target-outcome owner already repeats acknowledged verification wakes at a
one-second cadence until the step timeout. The final stop at
`06:14:57.210Z` is therefore a bounded recovery contributor, not an
explanation for why every wake failed to enter source progress.

## Failing selection boundary

`getReplicaOperationRow()` is cache-first. If any cached row exists, it does
not fall back to an authoritative query.

`resolveOperationDispatchReconcileRow()` currently treats that row as
unconditionally fresher when
`REFRESH_ROW_BEFORE_DISPATCH` is true:

```js
return (await this.getReplicaOperationRow(operationId)) || contextRow;
```

For the live ordering, a stale same-operation cached PENDING row can therefore
mask the target wake's SENDING or CREATING payload. The selected PENDING row
fails `isRuntimeTargetProgressWakeOperation`. Reconcile then enters
`dispatchOperationRow`, whose options intentionally do not carry
`HANDOFF_MODE`; the stronger progress request has become an ordinary pending
dispatch before the source owner sees it.

## Existing-system parallel

`OperationWorkflowRecoveryStatusReconcile.selectTimeoutReconcileOperation`
already solves the same divergent-view problem. It compares compatible
same-operation snapshots by typed workflow rank and then update time, while
preserving terminal precedence. Its property test requires cache-observed
SENDING to outrank a stale PENDING owner read.

The dispatch ingress should consume that established logic, not invent a
timeout extension or make every non-system CREATING row replayable.

This also matches the researched durable-workflow distinction:

- AWS Step Functions redrive resumes failed work inside the existing
  execution:
  <https://docs.aws.amazon.com/step-functions/latest/dg/redrive-executions.html>
- Temporal resumes durable workflow progress after failure:
  <https://temporal.io/>
- Kubernetes readiness is an admission/traffic gate, not proof that another
  requested transition durably completed:
  <https://kubernetes.io/docs/concepts/workloads/pods/probes/>

Here, the marked target payload is compatible progress evidence. A cache hit
proves only that a local snapshot exists; it does not prove that the snapshot
is the most advanced compatible state.

## Falsifiable theory and discriminator

For an explicit runtime target-outcome wake only, select the most advanced
compatible same-operation row between the local refresh and the target
payload. Preserve terminal precedence, typed workflow ordering, and update-time
ordering. Then a target SENDING/CREATING snapshot can outrank stale local
PENDING, enter the already-bounded retained source-owner lane, observe the
exact ACTIVE service row, and terminalize.

The deterministic production-seam discriminator must provide:

1. a stale cached PENDING row for the same operation;
2. a marked runtime CREATING or SENDING target payload;
3. exact ACTIVE target service proof;
4. a requirement that the source durable operation reaches ACTIVE.

Reverting only the monotonic row selection must make that test fail. Negative
guards must prove that terminal local state wins, an incompatible operation
identity cannot substitute its payload, ordinary PENDING remains ordinary,
and non-runtime CREATING remains outside replay.

This attempt must not change target handoff timeout, operation budget,
concurrency, generic replay admission, or the deferred-retry registry.
