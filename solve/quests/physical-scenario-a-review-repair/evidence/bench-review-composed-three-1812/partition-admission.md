# Per-partition placement decisions

Campaign `bench-review-composed-three-1812`. These observations come from the placement owner on the seed. Every column below represents one completed planning pass. The last census ended at 18:21:23.394 UTC.

| Pass | Evaluated (UTC) | Main-thread CPU | Event-loop delay | Source occupancy / limit | Waiting | Partitions retained / omitted |
|---:|---|---:|---:|---:|---:|---:|
| 1565 | 18:19:24.626 | 78.03% | 11.96 ms | 1 / 1 | 26 | 46 / 0 |
| 2212 | 18:20:21.607 | 84.45% | 9.14 ms | 8 / 8 | 13 | 46 / 0 |
| 2290 | 18:20:58.450 | 59.01% | 4.71 ms | 8 / 8 | 13 | 46 / 0 |
| 2374 | 18:21:21.230 | 65.62% | 3.8 ms | 8 / 8 | 13 | 46 / 0 |

The numerator is occupied copies and the denominator is the applicable limit. The planner reports NONE when its deficit evaluation returns that state. Committed service rows determine the voter census. A busy partition may own work outside the copy census.

| Partition | Under RF3 at last census | 1565 | 2212 | 2290 | 2374 |
|---|---|---|---|---|---|
| logs-p1 | yes | source 1/1 | busy (SYNCING) | busy (SYNCING) | busy (SYNCING) |
| message_groups-p1 | yes | source 1/1 | busy (CREATING) | busy (CREATING) | busy (CREATING) |
| module_dependency_locks-p1 | yes | source 1/1 | busy (CREATING) | busy (SYNCING) | busy (SYNCING) |
| module_manifests-p1 | yes | source 1/1 | busy (CREATING) | busy (SYNCING) | busy (SYNCING) |
| node_endpoints-p1 | yes | source 1/1 | busy (CREATING) | busy (SYNCING) | busy (SYNCING) |
| package_registry_mappings-p1 | yes | source 1/1 | busy (SENDING) | busy (SENDING) | busy (CREATING) |
| package_registry_overrides-p1 | yes | source 1/1 | busy (CREATING) | busy (CREATING) | busy (CREATING) |
| schema_migration_partitions-p1 | yes | source 1/1 | busy (SENDING) | busy (SENDING) | busy (CREATING) |
| schema_migrations-p1 | yes | source 1/1 | source 8/8 | source 8/8 | source 8/8 |
| service_bindings-p1 | yes | source 1/1 | source 8/8 | source 8/8 | source 8/8 |
| service_definitions-p1 | yes | source 1/1 | source 8/8 | source 8/8 | source 8/8 |
| service_endpoints-p1 | yes | source 1/1 | source 8/8 | source 8/8 | source 8/8 |
| service_install_failures-p1 | yes | source 1/1 | source 8/8 | source 8/8 | source 8/8 |
| service_installations-p1 | yes | source 1/1 | source 8/8 | source 8/8 | source 8/8 |
| service_instances-p1 | yes | source 1/1 | source 8/8 | source 8/8 | source 8/8 |
| service_packages-p1 | yes | source 1/1 | source 8/8 | source 8/8 | source 8/8 |
| service_partition_access-p1 | yes | source 1/1 | source 8/8 | source 8/8 | source 8/8 |
| service_revisions-p1 | yes | source 1/1 | source 8/8 | source 8/8 | source 8/8 |
| service_timers-p1 | yes | source 1/1 | source 8/8 | source 8/8 | source 8/8 |
| storage_reservations-p1 | yes | source 1/1 | source 8/8 | source 8/8 | source 8/8 |
| wasm_operations-p1 | yes | source 1/1 | source 8/8 | source 8/8 | source 8/8 |
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
| debug_sessions-p1 | no | busy (SYNCING) | NONE | NONE | NONE |
| debug_snapshots-p1 | no | source 1/1 | NONE | NONE | NONE |
| indices-p1 | no | source 1/1 | NONE | NONE | NONE |
| inter_group_latencies-p1 | no | source 1/1 | NONE | NONE | NONE |
| latency_groups-p1 | no | source 1/1 | NONE | NONE | NONE |
| live_queries-p1 | no | source 1/1 | NONE | NONE | NONE |
| nodes-p1 | no | NONE | NONE | NONE | NONE |
| partitions-p1 | no | NONE | NONE | NONE | NONE |
| replica_operations-p1 | no | NONE | NONE | NONE | NONE |
| schema_operations-p1 | no | NONE | NONE | NONE | NONE |
| services-p1 | no | NONE | NONE | NONE | NONE |
| sql_transaction_participants-p1 | no | NONE | NONE | NONE | NONE |
| sql_transactions-p1 | no | NONE | NONE | NONE | NONE |
| sql_write_operations-p1 | no | NONE | NONE | NONE | NONE |
| tables-p1 | no | NONE | NONE | NONE | NONE |
