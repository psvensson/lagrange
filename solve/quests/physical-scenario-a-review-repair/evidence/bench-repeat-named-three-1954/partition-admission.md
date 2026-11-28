# Per-partition placement decisions

Campaign `bench-repeat-named-three-1954`. These observations come from the placement owner on the seed. Every column below represents one completed planning pass. The last census ended at 19:58:27.731 UTC.

| Pass | Evaluated (UTC) | Main-thread CPU | Event-loop delay | Source occupancy / limit | Waiting | Partitions retained / omitted |
|---:|---|---:|---:|---:|---:|---:|
| 1668 | 19:56:29.177 | 91.1% | 46.55 ms | 0 / 1 | 27 | 46 / 0 |
| 2520 | 19:57:26.304 | 80.92% | 16.01 ms | 3 / 3 | 11 | 46 / 0 |
| 3043 | 19:58:03.181 | 47.45% | 2.19 ms | 1 / 1 | 5 | 46 / 0 |
| 3386 | 19:58:27.041 | 90.62% | 43.5 ms | 2 / 1 | 1 | 46 / 0 |

The numerator is occupied copies and the denominator is the applicable limit. The planner reports NONE when its deficit evaluation returns that state. Committed service rows determine the voter census. A busy partition may own work outside the copy census.

| Partition | Under RF3 at last census | 1668 | 2520 | 3043 | 3386 |
|---|---|---|---|---|---|
| service_timers-p1 | yes | admission_unexamined | source 3/3 | source 1/1 | busy (SYNCING) |
| storage_reservations-p1 | yes | admission_unexamined | source 3/3 | source 1/1 | busy (SYNCING) |
| wasm_operations-p1 | yes | admission_unexamined | source 3/3 | source 1/1 | source 2/1 |
| artifact_payload_chunks-p1 | no | NONE | NONE | NONE | NONE |
| artifact_payloads-p1 | no | NONE | NONE | NONE | NONE |
| call_activation_leases-p1 | no | NONE | NONE | NONE | NONE |
| call_cell_reduce_results-p1 | no | NONE | NONE | NONE | NONE |
| call_cell_reduce_slots-p1 | no | NONE | NONE | NONE | NONE |
| code-p1 | no | NONE | NONE | NONE | NONE |
| config-p1 | no | NONE | NONE | NONE | NONE |
| contexts-p1 | no | NONE | NONE | NONE | NONE |
| control_plane_publications-p1 | no | NONE | NONE | NONE | NONE |
| debug_breakpoints-p1 | no | ADMITTED | NONE | NONE | NONE |
| debug_sessions-p1 | no | admission_unexamined | NONE | NONE | NONE |
| debug_snapshots-p1 | no | admission_unexamined | NONE | NONE | NONE |
| indices-p1 | no | admission_unexamined | NONE | NONE | NONE |
| inter_group_latencies-p1 | no | admission_unexamined | NONE | NONE | NONE |
| latency_groups-p1 | no | admission_unexamined | NONE | NONE | NONE |
| live_queries-p1 | no | admission_unexamined | NONE | NONE | NONE |
| logs-p1 | no | admission_unexamined | NONE | NONE | NONE |
| message_groups-p1 | no | admission_unexamined | NONE | NONE | NONE |
| module_dependency_locks-p1 | no | admission_unexamined | NONE | NONE | NONE |
| module_manifests-p1 | no | admission_unexamined | NONE | NONE | NONE |
| node_endpoints-p1 | no | admission_unexamined | NONE | NONE | NONE |
| nodes-p1 | no | NONE | NONE | NONE | NONE |
| package_registry_mappings-p1 | no | admission_unexamined | NONE | NONE | NONE |
| package_registry_overrides-p1 | no | admission_unexamined | NONE | NONE | NONE |
| partitions-p1 | no | NONE | NONE | NONE | NONE |
| replica_operations-p1 | no | NONE | NONE | NONE | NONE |
| schema_migration_partitions-p1 | no | admission_unexamined | busy (SENDING) | NONE | NONE |
| schema_migrations-p1 | no | admission_unexamined | busy (CREATING) | NONE | NONE |
| schema_operations-p1 | no | NONE | NONE | NONE | NONE |
| service_bindings-p1 | no | admission_unexamined | busy (SENDING) | NONE | NONE |
| service_definitions-p1 | no | admission_unexamined | source 3/3 | NONE | NONE |
| service_endpoints-p1 | no | admission_unexamined | source 3/3 | NONE | NONE |
| service_install_failures-p1 | no | admission_unexamined | source 3/3 | NONE | NONE |
| service_installations-p1 | no | admission_unexamined | source 3/3 | NONE | NONE |
| service_instances-p1 | no | admission_unexamined | source 3/3 | NONE | NONE |
| service_packages-p1 | no | admission_unexamined | source 3/3 | busy (SENDING) | NONE |
| service_partition_access-p1 | no | admission_unexamined | source 3/3 | source 1/1 | NONE |
| service_revisions-p1 | no | admission_unexamined | source 3/3 | source 1/1 | NONE |
| services-p1 | no | NONE | NONE | NONE | NONE |
| sql_transaction_participants-p1 | no | NONE | NONE | NONE | NONE |
| sql_transactions-p1 | no | NONE | NONE | NONE | NONE |
| sql_write_operations-p1 | no | NONE | NONE | NONE | NONE |
| tables-p1 | no | NONE | NONE | NONE | NONE |
