# Per-partition placement decisions

Campaign `bench-review-3d1-three-1649`. These observations come from the placement owner on the seed. Every column below represents one completed planning pass. The last census ended at 16:56:24.346 UTC.

| Pass | Evaluated (UTC) | Main-thread CPU | Event-loop delay | Source occupancy / limit | Waiting | Partitions retained / omitted |
|---:|---|---:|---:|---:|---:|---:|
| 1715 | 16:54:25.103 | 85.51% | 21.96 ms | 1 / 1 | 24 | 46 / 0 |
| 1987 | 16:55:16.340 | 58.73% | 2.87 ms | 8 / 8 | 16 | 46 / 0 |
| 2375 | 16:55:59.803 | 84.38% | 25.36 ms | 4 / 4 | 14 | 46 / 0 |
| 2764 | 16:56:23.781 | 84.4% | 23.55 ms | 4 / 3 | 8 | 46 / 0 |

The numerator is occupied copies and the denominator is the applicable limit. The planner reports NONE when its deficit evaluation returns that state. Committed service rows determine the voter census. A busy partition may own work outside the copy census.

| Partition | Under RF3 at last census | 1715 | 1987 | 2375 | 2764 |
|---|---|---|---|---|---|
| service_bindings-p1 | yes | source 1/1 | source 8/8 | source 4/4 | busy (SYNCING) |
| service_definitions-p1 | yes | source 1/1 | source 8/8 | source 4/4 | busy (SYNCING) |
| service_endpoints-p1 | yes | source 1/1 | source 8/8 | source 4/4 | busy (SYNCING) |
| service_install_failures-p1 | yes | source 1/1 | source 8/8 | source 4/4 | busy (CREATING) |
| service_installations-p1 | yes | source 1/1 | source 8/8 | source 4/4 | source 4/3 |
| service_instances-p1 | yes | source 1/1 | source 8/8 | source 4/4 | source 4/3 |
| service_packages-p1 | yes | source 1/1 | source 8/8 | source 4/4 | source 4/3 |
| service_partition_access-p1 | yes | source 1/1 | source 8/8 | source 4/4 | source 4/3 |
| service_revisions-p1 | yes | source 1/1 | source 8/8 | source 4/4 | source 4/3 |
| service_timers-p1 | yes | source 1/1 | source 8/8 | source 4/4 | source 4/3 |
| storage_reservations-p1 | yes | source 1/1 | source 8/8 | source 4/4 | source 4/3 |
| wasm_operations-p1 | yes | source 1/1 | source 8/8 | source 4/4 | source 4/3 |
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
| indices-p1 | no | busy (SENDING) | NONE | NONE | NONE |
| inter_group_latencies-p1 | no | source 1/1 | busy (CREATING) | busy (CREATING) | NONE |
| latency_groups-p1 | no | source 1/1 | busy (CREATING) | busy (CREATING) | NONE |
| live_queries-p1 | no | source 1/1 | busy (SYNCING) | NONE | NONE |
| logs-p1 | no | source 1/1 | busy (SYNCING) | NONE | NONE |
| message_groups-p1 | no | source 1/1 | busy (SYNCING) | NONE | NONE |
| module_dependency_locks-p1 | no | source 1/1 | busy (SYNCING) | NONE | NONE |
| module_manifests-p1 | no | source 1/1 | busy (SYNCING) | NONE | NONE |
| node_endpoints-p1 | no | source 1/1 | busy (SYNCING) | NONE | NONE |
| nodes-p1 | no | NONE | NONE | NONE | NONE |
| package_registry_mappings-p1 | no | source 1/1 | source 8/8 | busy (CREATING) | NONE |
| package_registry_overrides-p1 | no | source 1/1 | source 8/8 | busy (SENDING) | NONE |
| partitions-p1 | no | NONE | NONE | NONE | NONE |
| replica_operations-p1 | no | NONE | NONE | NONE | NONE |
| schema_migration_partitions-p1 | no | source 1/1 | source 8/8 | source 4/4 | NONE |
| schema_migrations-p1 | no | source 1/1 | source 8/8 | source 4/4 | NONE |
| schema_operations-p1 | no | NONE | NONE | NONE | NONE |
| services-p1 | no | NONE | NONE | NONE | NONE |
| sql_transaction_participants-p1 | no | NONE | NONE | NONE | NONE |
| sql_transactions-p1 | no | NONE | NONE | NONE | NONE |
| sql_write_operations-p1 | no | NONE | NONE | NONE | NONE |
| tables-p1 | no | NONE | NONE | NONE | NONE |
