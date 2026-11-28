# Per-partition placement decisions

Campaign `bench-review-scan-three-1858`. These observations come from the placement owner on the seed. Every column below represents one completed planning pass. The last census ended at 19:08:03.944 UTC.

| Pass | Evaluated (UTC) | Main-thread CPU | Event-loop delay | Source occupancy / limit | Waiting | Partitions retained / omitted |
|---:|---|---:|---:|---:|---:|---:|
| 1609 | 19:06:05.074 | 76.74% | 13.19 ms | 1 / 1 | 25 | 46 / 0 |
| 2422 | 19:07:02.423 | 49.95% | 3.7 ms | 2 / 1 | 14 | 46 / 0 |
| 2568 | 19:07:38.785 | 57.89% | 4.06 ms | 8 / 8 | 8 | 46 / 0 |
| 2886 | 19:08:03.199 | 77.33% | 14.97 ms | 1 / 1 | 13 | 46 / 0 |

The numerator is occupied copies and the denominator is the applicable limit. The planner reports NONE when its deficit evaluation returns that state. Committed service rows determine the voter census. A busy partition may own work outside the copy census.

| Partition | Under RF3 at last census | 1609 | 2422 | 2568 | 2886 |
|---|---|---|---|---|---|
| package_registry_overrides-p1 | yes | source 1/1 | busy (SENDING) | busy (CREATING) | busy |
| schema_migration_partitions-p1 | yes | source 1/1 | source 2/1 | busy (CREATING) | busy (SENDING) |
| schema_migrations-p1 | yes | source 1/1 | source 2/1 | busy (SENDING) | source 1/1 |
| service_bindings-p1 | yes | source 1/1 | source 2/1 | busy (CREATING) | source 1/1 |
| service_definitions-p1 | yes | source 1/1 | source 2/1 | busy (CREATING) | source 1/1 |
| service_endpoints-p1 | yes | source 1/1 | source 2/1 | busy (CREATING) | source 1/1 |
| service_install_failures-p1 | yes | source 1/1 | source 2/1 | busy (CREATING) | source 1/1 |
| service_installations-p1 | yes | source 1/1 | source 2/1 | source 8/8, target 6/6 | source 1/1 |
| service_instances-p1 | yes | source 1/1 | source 2/1 | source 8/8, target 6/6 | source 1/1 |
| service_packages-p1 | yes | source 1/1 | source 2/1 | source 8/8, target 6/6 | source 1/1 |
| service_partition_access-p1 | yes | source 1/1 | source 2/1 | source 8/8, target 6/6 | source 1/1 |
| service_revisions-p1 | yes | source 1/1 | source 2/1 | source 8/8, target 6/6 | source 1/1 |
| service_timers-p1 | yes | source 1/1 | source 2/1 | source 8/8, target 6/6 | source 1/1 |
| storage_reservations-p1 | yes | source 1/1 | source 2/1 | source 8/8, target 6/6 | source 1/1 |
| wasm_operations-p1 | yes | source 1/1 | source 2/1 | source 8/8, target 6/6 | source 1/1 |
| artifact_payload_chunks-p1 | no | NONE | NONE | NONE | NONE |
| artifact_payloads-p1 | no | NONE | NONE | NONE | NONE |
| call_activation_leases-p1 | no | NONE | NONE | NONE | NONE |
| call_cell_reduce_results-p1 | no | NONE | NONE | NONE | NONE |
| call_cell_reduce_slots-p1 | no | NONE | NONE | NONE | NONE |
| code-p1 | no | NONE | NONE | NONE | NONE |
| config-p1 | no | NONE | NONE | NONE | NONE |
| contexts-p1 | no | NONE | NONE | NONE | NONE |
| control_plane_publications-p1 | no | NONE | NONE | NONE | NONE |
| debug_breakpoints-p1 | no | NONE | NONE | NONE | NONE |
| debug_sessions-p1 | no | NONE | NONE | NONE | NONE |
| debug_snapshots-p1 | no | busy (SENDING) | NONE | NONE | NONE |
| indices-p1 | no | source 1/1 | NONE | NONE | NONE |
| inter_group_latencies-p1 | no | source 1/1 | NONE | NONE | NONE |
| latency_groups-p1 | no | source 1/1 | NONE | NONE | NONE |
| live_queries-p1 | no | source 1/1 | NONE | NONE | NONE |
| logs-p1 | no | source 1/1 | NONE | NONE | NONE |
| message_groups-p1 | no | source 1/1 | NONE | NONE | NONE |
| module_dependency_locks-p1 | no | source 1/1 | NONE | NONE | NONE |
| module_manifests-p1 | no | source 1/1 | NONE | NONE | NONE |
| node_endpoints-p1 | no | source 1/1 | NONE | NONE | NONE |
| nodes-p1 | no | NONE | NONE | NONE | NONE |
| package_registry_mappings-p1 | no | source 1/1 | busy (SENDING) | busy (SYNCING) | NONE |
| partitions-p1 | no | NONE | NONE | NONE | NONE |
| replica_operations-p1 | no | NONE | NONE | NONE | NONE |
| schema_operations-p1 | no | NONE | NONE | NONE | NONE |
| services-p1 | no | NONE | NONE | NONE | NONE |
| sql_transaction_participants-p1 | no | NONE | NONE | NONE | NONE |
| sql_transactions-p1 | no | NONE | NONE | NONE | NONE |
| sql_write_operations-p1 | no | NONE | NONE | NONE | NONE |
| tables-p1 | no | NONE | NONE | NONE | NONE |
