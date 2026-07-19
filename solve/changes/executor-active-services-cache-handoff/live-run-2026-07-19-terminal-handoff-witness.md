# Live witness: direct ACTIVE outcome bypassed SERVICES cache handoff

## Artifact identities

- Report: `test-output/reports/movielens-lagrange-service-affinity-live-2026-07-19T09-57-45-554Z.report.json`
  - SHA-256: `939f58821cbedf672612af45f2cda09bab915e25a3cd308c90d168a57a980ab7`
- Seed log: `data/examples/service-data-affinity-demo/node-0.log`
  - SHA-256: `1daff39e91c89c54fb1540f88a7f9d60ba385fd84d30743428722fa4ae7ccb1b`
- Node-3 log: `data/examples/service-data-affinity-demo/node-3.log`
  - SHA-256: `b2c5dcb7eed870792e84f9d29dd3d940b395e63ec09f32362ebbc47bb8d08f00`
- Node-4 log: `data/examples/service-data-affinity-demo/node-4.log`
  - SHA-256: `1f8e257ef210bb9393163684518b4f085baad8c42756789ab843d01229fdf7cb`
- Canonical SERVICES database:
  `data/examples/service-data-affinity-demo/node-0/partitions/services-p1/services-p1-r1.db`
  - SHA-256: `39a719a842521fe736dbcd2a112142f8309c785ec8805b0ead4a2ea82230affb`
- Canonical operation-ledger database:
  `data/examples/service-data-affinity-demo/node-0/partitions/replica_operations-p1/replica_operations-p1-r1.db`
  - SHA-256: `7378b82c0fa6e5e7f10f00814b157d9c0acc6d1db59ca5b5f9e7ee6c3891ea63`

## Terminal report

The unchanged live harness timed out during schema admission:

```text
critical_system_spread_gap=1 [replica_operations-p1(1)]
state=critical_spread_open
ready=false
stableElapsedMs=0
effectiveInFlightCount=0
```

The terminal priority observation reported
`readyReplicaCount=2`, `readyDistinctNodeCount=2`, and
`exclusionReasonCounts={"status_syncing":1}` for
`replica_operations-p1`. The planning gate simultaneously reported
`operationCreationRequired=false`.

## Runtime transition evidence

Node 4 created the exact replacement and advanced it from SYNCING to ACTIVE:

```text
2026-07-19T09:54:10.891Z replace-replica-4d14ce36c1987fea240703b442fe5727 creating -> syncing
2026-07-19T09:54:16.005Z replace-replica-4d14ce36c1987fea240703b442fe5727 reached voter-ready activation
2026-07-19T09:54:16.027Z replace-replica-4d14ce36c1987fea240703b442fe5727 syncing -> active
2026-07-19T09:54:16.028Z replacement replica creation completed
```

The seed retired the source and terminalized the REPLACE immediately afterward:

```text
2026-07-19T09:54:16.389Z REMOVE_REPLICA replica_operations-p1-r3
2026-07-19T09:54:16.397Z replica_operations-p1-r3 removing -> removed
2026-07-19T09:54:17.015Z priority recovery drain settled operation
2026-07-19T09:54:17.044Z replace-op-691efb46c505c2053b80785456cab438 completed
```

Node 3 independently created r4 and advanced it to ACTIVE:

```text
2026-07-19T09:54:21.405Z replica_operations-p1-r4 creating -> syncing
2026-07-19T09:54:26.306Z replica_operations-p1-r4 syncing -> active
2026-07-19T09:54:26.306Z r4 active peers=3/3
```

## Canonical durable rows after the timeout

Every canonical SERVICES replica contained these three ACTIVE rows on three
distinct nodes:

```text
replace-replica-4d14ce36c1987fea240703b442fe5727 | a575b460-770e-4211-99aa-99a817c77d23 | active | follower
replica_operations-p1-r1                         | b90902df-19f6-42ab-8071-94ad6c9dec81 | active | leader
replica_operations-p1-r4                         | 3a7db622-d379-49bc-8388-6ef3556a24ea | active | follower
```

The operation ledger was terminal too:

```text
replace-op-691efb46c505c2053b80785456cab438 | REPLACE | removed | REMOVED
a6363a0f-2e0b-49b8-bc01-841419425331        | ADD     | active  | ACTIVE
46b5634f-8614-4ebc-9b08-000a22d4fd0c        | REMOVE  | removed | REMOVED
```

## Source discrimination

`OperationWorkflowRecoveryStatusReconcile.reconcileActiveReplicaStatus()`
calls `confirmActiveReplicaTerminalHandoff()` before it completes an ADD or
advances a REPLACE. The normal direct executor-outcome path in
`operation-workflow-executor-outcome-reconcile-methods.js` instead calls
`reconcileReplaceActualActive()` directly for ACTIVE REPLACE outcomes and
`completeOperation()` directly for other ACTIVE completion outcomes.

This explains the exact live state: durable target activation and terminal
operations coexisted with a stale SYNCING planning projection, no remaining
operation owner, and no further cure creation.
