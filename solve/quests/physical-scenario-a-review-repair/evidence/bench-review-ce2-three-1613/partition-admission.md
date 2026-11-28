# Per-partition placement decisions

Campaign `bench-review-ce2-three-1613`. These observations come from the placement owner on the seed. Every column below represents one completed planning pass. The last census ended at 16:23:26.513 UTC.

| Pass | Evaluated (UTC) | Main-thread CPU | Event-loop delay | Source occupancy / limit | Waiting | Partitions retained / omitted |
|---:|---|---:|---:|---:|---:|---:|
| 1740 | 16:21:28.137 | 94.33% | 72.16 ms | 2 / 1 | 23 | 46 / 0 |
| 2244 | 16:22:23.497 | 46.73% | 1.99 ms | 8 / 8 | 13 | 46 / 0 |
| 2715 | 16:23:01.842 | 83.53% | 18.83 ms | 2 / 2 | 13 | 46 / 0 |
| 3073 | 16:23:25.515 | 76.06% | 11.11 ms | 2 / 2 | 9 | 46 / 0 |

The numerator is occupied copies and the denominator is the applicable limit. The planner reports NONE when its deficit evaluation returns that state. Committed service rows determine the voter census. A busy partition may own work outside the copy census.

| Partition | Under RF3 at last census | 1740 | 2244 | 2715 | 3073 |
|---|---|---|---|---|---|
| module_dependency_locks-p1 | yes | source 2/1 | busy (CREATING) | busy (CREATING) | source 2/2 |
| service_endpoints-p1 | yes | source 2/1 | source 8/8 | source 2/2 | busy (SYNCING) |
| service_install_failures-p1 | yes | source 2/1 | source 8/8 | source 2/2 | busy (SYNCING) |
| service_installations-p1 | yes | source 2/1 | source 8/8 | source 2/2 | source 2/2 |
| service_instances-p1 | yes | source 2/1 | source 8/8 | source 2/2 | source 2/2 |
| service_packages-p1 | yes | source 2/1 | source 8/8 | source 2/2 | source 2/2 |
| service_partition_access-p1 | yes | source 2/1 | source 8/8 | source 2/2 | source 2/2 |
| service_revisions-p1 | yes | source 2/1 | source 8/8 | source 2/2 | source 2/2 |
| service_timers-p1 | yes | source 2/1 | source 8/8 | source 2/2 | source 2/2 |
| storage_reservations-p1 | yes | source 2/1 | source 8/8 | source 2/2 | source 2/2 |
| wasm_operations-p1 | yes | source 2/1 | source 8/8 | source 2/2 | source 2/2 |
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
| debug_snapshots-p1 | no | NONE | NONE | NONE | NONE |
| indices-p1 | no | busy (SYNCING) | NONE | NONE | NONE |
| inter_group_latencies-p1 | no | busy (CREATING) | NONE | NONE | NONE |
| latency_groups-p1 | no | source 2/1 | NONE | NONE | NONE |
| live_queries-p1 | no | source 2/1 | NONE | NONE | NONE |
| logs-p1 | no | source 2/1 | busy (CREATING) | NONE | NONE |
| message_groups-p1 | no | source 2/1 | busy (CREATING) | NONE | NONE |
| module_manifests-p1 | no | source 2/1 | busy (CREATING) | NONE | NONE |
| node_endpoints-p1 | no | source 2/1 | busy (CREATING) | NONE | NONE |
| nodes-p1 | no | NONE | NONE | NONE | NONE |
| package_registry_mappings-p1 | no | source 2/1 | busy (CREATING) | NONE | NONE |
| package_registry_overrides-p1 | no | source 2/1 | busy (CREATING) | NONE | NONE |
| partitions-p1 | no | NONE | NONE | NONE | NONE |
| replica_operations-p1 | no | NONE | NONE | NONE | NONE |
| schema_migration_partitions-p1 | no | source 2/1 | busy (CREATING) | busy (SENDING) | NONE |
| schema_migrations-p1 | no | source 2/1 | source 8/8 | source 2/2 | NONE |
| schema_operations-p1 | no | NONE | NONE | NONE | NONE |
| service_bindings-p1 | no | source 2/1 | source 8/8 | source 2/2 | NONE |
| service_definitions-p1 | no | source 2/1 | source 8/8 | source 2/2 | NONE |
| services-p1 | no | NONE | NONE | NONE | NONE |
| sql_transaction_participants-p1 | no | NONE | NONE | NONE | NONE |
| sql_transactions-p1 | no | NONE | NONE | NONE | NONE |
| sql_write_operations-p1 | no | NONE | NONE | NONE | NONE |
| tables-p1 | no | NONE | NONE | NONE | NONE |
