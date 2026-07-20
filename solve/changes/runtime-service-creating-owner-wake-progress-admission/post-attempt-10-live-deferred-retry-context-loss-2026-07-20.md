# Post-attempt 10 live boundary: target-progress context is lost on deferred retry

## Immutable evidence

- Ordered gate checkpoint:
  `5cd62f17333a99771b8cd6e9958f11e9c79b3339`
- Five-probe gate:
  `test-output/reports/live-repetitions-probe-2026-07-20T05-59-57-592Z.summary.json`
  (`5/5` passed)
- Demo 1:
  `test-output/reports/movielens-lagrange-service-affinity-live-2026-07-20T06-06-53-717Z.report.json`
  (passed)
- Demo 2:
  `test-output/reports/movielens-lagrange-service-affinity-live-2026-07-20T06-23-14-443Z.report.json`
  (valid measuring red, SHA-256
  `6c491ee9b22a1321a9b537d1dcbc3fd597ba99054467e536218aabdb254c6be4`)
- Ordered demo summary:
  `test-output/reports/live-repetitions-demo-2026-07-20T06-23-14-579Z.summary.json`
  (SHA-256
  `3971b1b28dc148dc52913fdf2e5311d92b708f45bc42ac815d4b62eca2db46c9`)
- Immutable five-node run archive:
  `solve/changes/runtime-service-creating-owner-wake-progress-admission/live-runs/demo-gate-2026-07-20T06-00-02Z.run-state.tar.gz`
  (SHA-256
  `39bcecc654407e2b6544e7078d8462b926f7a43ace11068fc56536f841af7efd`)

The red report passed schema admission and preload/load-lane admission. It
failed only after the live workload began, with
`service replicas were not initially placed`.

## One-operation chronology

The immutable logs identify runtime-service ADD
`10cda070-2931-4c4b-858b-7868063f3721`, source
`7f87deae-4ae9-483e-80af-60c2cc80abc9`, target
`be7b2581-3887-4527-b6e8-9e63d0a29066`, replica
`svc-movielens-topn-r1`.

1. `06:13:55.451Z`: the source creates the ADD.
2. `06:13:56.437Z`: the source commits `PENDING -> SENDING`.
3. `06:13:56.441Z`: source replica-dispatch arms a 250 ms deferred retry:
   `Cache update not observed for replica operation ...`.
4. `06:13:56.465Z`: the source sends `CREATE_REPLICA`.
5. `06:13:56.470Z`: the target reports
   `Runtime service replica creation completed`.
6. `06:13:56.506Z`: the source commits `SENDING -> CREATING`.
7. `06:14:57.210Z`: the target's target-outcome handoff verifier stops while
   the operation is still `CREATING`.
8. The demo reaches its initial-placement timeout with only one service
   replica. The durable operation remains `CREATING`, so the runtime
   rebalancer's `maxConcurrentAdds=1` budget prevents placement of the second
   planned service replica.

The live database inspection before teardown found the same operation
`CREATING` in all three immutable `replica_operations` projections while all
three inspected `services` projections contained exact replica
`svc-movielens-topn-r1` on the exact target node with status `active`.
Therefore target execution and durable target proof succeeded; source-owner
terminalization did not.

## Existing-system parallel

The operation owner queue already treats a target executor outcome as stronger
than ordinary CDC/retry work. In
`src/control-plane/replica-dispatch-operation-queue-context.js`,
`mergeOperationDispatchReconcileContext` retains
`TARGET_EXECUTOR_OUTCOME` monotonically when either the retained or incoming
context has it. This matches the system's established rule that coalescing must
not weaken progress evidence.

The separate deferred-retry registry does not implement the same rule:

- `deferOperationDispatchRetry` retains only `row`,
  `REFRESH_ROW_BEFORE_DISPATCH`, timing, and error metadata.
- `refreshDeferredOperationDispatchRetryRow` can refresh only the row and
  refresh flag.
- `armDeferredOperationDispatchRetryWithOptions` reconstructs queue context
  from only the row and refresh flag.

Consequently, a target-outcome reconcile that meets a retryable cache/read
boundary is re-enqueued later as an ordinary CREATING row. Ordinary non-system
CREATING rows are deliberately non-replayable, so
`reconcileOperationDispatch` clears/skips them rather than calling the source
workflow owner.

This is the same durability distinction used by comparable systems:

- AWS Step Functions redrive preserves completed work and re-runs failed work
  in the same execution rather than treating acceptance as completion:
  <https://docs.aws.amazon.com/step-functions/latest/dg/redrive-executions.html>
- Temporal's durable execution model resumes workflow progress after failures:
  <https://temporal.io/>
- Kubernetes readiness is a traffic/admission gate, not proof that a requested
  state transition has durably completed:
  <https://kubernetes.io/docs/concepts/workloads/pods/probes/>

The local implication is narrower: a queue ACK proves acceptance, while the
target-outcome marker is the evidence required to resume the correct durable
source transition after a retry.

## Falsifiable theory

The live stall occurs because the source's deferred operation-dispatch retry
drops `ControlPlaneField.HANDOFF_MODE =
TARGET_EXECUTOR_OUTCOME`. Preserve that marker monotonically in the existing
deferred-retry record and restore it when the timer re-enqueues. Then the retry
will re-enter the canonical runtime SENDING/CREATING progress path, retain the
source owner turn, observe the exact ACTIVE service row, and terminalize the
operation.

Discriminator: a production-seam deterministic test must deliver a marked
runtime CREATING wake, force its first source reconcile to fail retryably, fire
the existing deferred timer, and require the second reconcile to reach exact
target ACTIVE. Reverting only the marker retention must make that test fail
while ordinary deferred retries remain unmarked and non-runtime CREATING rows
remain non-replayable.

The target handoff's one-minute follow-up budget is a separate possible
recovery weakness, but it is not part of this attempt. Extending that budget
would mask the source context-loss boundary and combine two hypotheses.
