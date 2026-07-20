# Post-attempt-12 live diagnosis: retained target wake can execute a pre-wait row

## Immutable evidence

- Checkpoint under test: `5ea32ce2fc89316d9c68329de26ed996601ba532`
- Ordered probe summary:
  `test-output/reports/live-repetitions-probe-2026-07-20T07-19-30-132Z.summary.json`
  (`sha256:432d1adbc8606ac952f7c41f152af9c268b6db238ec50ec280e6424d62382ba5`,
  five of five passed)
- Demo 1 report:
  `test-output/reports/movielens-lagrange-service-affinity-live-2026-07-20T07-34-10-257Z.report.json`
  (`sha256:4f45cfdad07d9ca14e4f618c11edb7d5deb08879e50ab828f10e7c25109a4181`)
- Preserved run archive:
  `solve/changes/runtime-service-creating-owner-wake-progress-admission/live-runs/demo-gate-2026-07-20T07-19-39Z.run-state.tar.gz`
  (`sha256:819af3cfba91388fcfd609f6ceb5399d55ef33cd71828883c3abd54dcb241e3d`)

## Live discriminator

Operation `d4899b4f-6bad-4acc-9b7c-3a7467fdb869` is a source-owned runtime ADD
from node `043a00f3-8ba3-4221-b583-e82f92248d79` to node
`1fc0781c-5d24-465d-b31e-28bdbea1bb1a`.

The archived logs establish this ordering:

1. The source changes PENDING to SENDING at `07:25:29.852`.
2. A source dispatch-service visibility retry is armed at `07:25:29.855`.
3. The target handles CREATE_REPLICA at `07:25:29.879`.
4. The target runtime row is ACTIVE by `07:25:29.884`; the source receives its
   services CDC row at `07:25:29.897` and refreshes the exact row at
   `07:25:29.910`.
5. The source's original owner turn changes SENDING to CREATING at
   `07:25:29.908`.
6. The target continues the target-executor-outcome handoff until its operation
   budget stops at `07:26:30.826`, naming the correct source destination and a
   CREATING operation snapshot.
7. All retained SQLite projections agree that the exact services row is ACTIVE
   while the operation remains CREATING.

This falsifies “the target never became ACTIVE” and weakens the earlier
deferred-retry marker-loss hypothesis: incoming target handoffs enter
`handleReplicaOperationDispatch` and the operation owner queue directly. The
separate `operationDispatchDeferredRetries` registry is not the ingress
coalescing boundary.

## Supported code parallel

The system already treats target-executor-outcome context monotonically in
`replica-dispatch-operation-queue-context.js`, and Attempt 12 chooses a known
advanced marked row before entering the workflow owner. The remaining temporal
gap is after that selection:

- `reconcileOperationDispatch` resolves a row before calling
  `dispatchOperation`.
- `ownerTurnPolicy: retain` makes `runRetainedOperationOwnerAction` wait for an
  existing holder, then re-invokes the action.
- The retained action still closes over the operation object resolved before
  the wait.
- `resolveDispatchOperation` accepts that canonical object without a fresh
  repository read.
- Terminal persistence is compare-and-set guarded. Therefore a retained SENDING
  target snapshot can run after the original holder commits CREATING and miss
  terminal persistence as stale.

This mirrors the system's existing “refresh after wait, not before wait”
discipline in coordinator-created handoff timers, which re-read the operation
inside the timer callback immediately before redrive.

## Falsifiable next proof

Hold the source operation owner lane while it advances the durable operation
from SENDING to CREATING. Queue a marked target-executor-outcome wake carrying
the SENDING snapshot and exact ACTIVE services proof. Release the holder.

- Current behavior should execute terminal reconciliation with the pre-wait
  SENDING object and leave the durable row CREATING.
- A narrow fix must refresh/select the operation at the retained owner-turn
  boundary and then reach ACTIVE.
- Negative controls must preserve ordinary coalescing, unknown/future workflow
  steps, non-runtime operations, REPLACE boundaries, and exact-target
  admission.

