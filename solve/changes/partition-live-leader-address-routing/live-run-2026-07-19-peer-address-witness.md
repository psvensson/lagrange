# Live peer-address witness

Source run:

- Report: `test-output/reports/movielens-lagrange-service-affinity-live-2026-07-19T08-49-05-180Z.report.json`
- Report SHA-256: `d53b90f91310f51d9759f830863e8dcb91db7adc84d54af2d69fef4c1c172809`
- Mutable source log SHA-256 at preservation time:
  - `node-1.log`: `29b1bfa7bf95fc1f849f47e693f4e54779493b0e714587b2fc9844b0d1b56a82`
  - `node-2.log`: `39dc2cde203cc4336863cabc895038af381c73c4d00291133044783d1447f5d3`

The immutable report records schema admission as admitted and quiescent with
`prioritySpreadGap: 0`, then fails downstream with:

```text
Timed out waiting for ratings partitions on at least two nodes after 600000ms
```

## Preserved timeline

Selected JSON log records from the mutable live-run directory:

```json
{"level":30,"time":"2026-07-19T08:34:51.460Z","nodeId":"353b0c2c-53d9-4901-9fc7-26782dd77c71","pid":1864605,"subsystem":"replica-handler","operationId":"7cc59e8e-bfd5-49dd-b0f0-77672dabe118","explicitOperationType":"ADD","partitionId":"sql_transactions-p1","replicaId":"sql_transactions-p1-r5","msg":"Handling CREATE_REPLICA request"}
{"level":30,"time":"2026-07-19T08:35:03.606Z","nodeId":"353b0c2c-53d9-4901-9fc7-26782dd77c71","pid":1864605,"subsystem":"partition","term":3,"replicaId":"sql_transactions-p1-r5","partitionId":"sql_transactions-p1","rebalancerActive":true,"msg":"Became leader (liferaft)"}
{"level":30,"time":"2026-07-19T08:35:04.643Z","nodeId":"353b0c2c-53d9-4901-9fc7-26782dd77c71","pid":1864605,"subsystem":"replica-handler","partitionId":"sql_transactions-p1","replicaId":"sql_transactions-p1-r5","stage":"active","peerTotal":3,"peerJoined":3,"localReplicas":3,"status":"ok","msg":"[replica-create] | service=sql_transactions-p1 replica=sql_transactions-p1-r5 type=partition stage=active peers=3/3 local_replicas=3 status=ok"}
{"level":50,"time":"2026-07-19T08:39:22.203Z","nodeId":"bb2720e8-844c-4ed3-bd87-0fa8cfc17bc1","pid":1864606,"subsystem":"query-executor","partitionId":"sql_transactions-p1","address":"bb2720e8-844c-4ed3-bd87-0fa8cfc17bc1/partition/sql_transactions-p1-r4","error":"Unable to resolve unified peer address for sql_transactions-p1-r5","msg":"Query routing failed"}
{"level":40,"time":"2026-07-19T08:39:25.321Z","nodeId":"bb2720e8-844c-4ed3-bd87-0fa8cfc17bc1","pid":1864606,"subsystem":"cdc-integration","tableName":"sql_transactions","id":"tx-split-tbl-67f4035f1e5f9fd2a0245f5d35ff9de9_p_aa0af78b_left:tbl-67f4035f1e5f9fd2a0245f5d35ff9de9_p_82739cf2_right-1784450301440","error":"Distributed operation failed due to participant failures","operation":"UPSERT","code":"DISTRIBUTED_PARTICIPANT_FAILURE","writeMode":"sql-routed","bootstrapMode":false,"attempt":6,"firstFailedParticipant":{"partitionId":"sql_transactions-p1","error":"Unable to resolve unified peer address for sql_transactions-p1-r5"},"participantFailureCount":1,"msg":"Failed to upsert system table row"}
{"level":50,"time":"2026-07-19T08:48:42.999Z","nodeId":"bb2720e8-844c-4ed3-bd87-0fa8cfc17bc1","pid":1864606,"subsystem":"query-executor","partitionId":"sql_transactions-p1","address":"bb2720e8-844c-4ed3-bd87-0fa8cfc17bc1/partition/sql_transactions-p1-r4","error":"Unable to resolve unified peer address for sql_transactions-p1-r5","msg":"Query routing failed"}
```

The first and last resolution failures are 560797ms apart. This is not a
transient lookup miss.

## Canonical SERVICES state

The stopped live run retained the same row in all three SERVICES replica
databases (`services-p1-r1`, `r2`, and `r3`):

```json
{"service_id":"sql_transactions-p1-r5","node_id":"353b0c2c-53d9-4901-9fc7-26782dd77c71","partition_id":"sql_transactions-p1","replica_id":"sql_transactions-p1-r5","raft_role":"follower","status":"active","address":"353b0c2c-53d9-4901-9fc7-26782dd77c71/partition/sql_transactions-p1-r5","updated_at":1784450103356}
```

Therefore replica creation and canonical persistence succeeded. The failed
node-local routing path had already observed `r5` as Raft leader, but
`PartitionService` normalized the unified LifeRaft leader address to the bare
replica ID and later tried to reconstruct it only from the lagging cache or
bootstrap-time `peerAddresses`.
