# Per-partition placement decisions

Campaign `bench-review-72d-three-1733`. These observations come from the placement owner on the seed. Every column below represents one completed planning pass. The last census ended at 17:41:57.600 UTC.

| Pass | Evaluated (UTC) | Main-thread CPU | Event-loop delay | Source occupancy / limit | Waiting | Partitions retained / omitted |
|---:|---|---:|---:|---:|---:|---:|
| 1640 | 17:39:59.068 | 90.08% | 31.53 ms | 2 / 1 | 25 | 46 / 0 |
| 2297 | 17:40:55.321 | 51.09% | 2.54 ms | 4 / 4 | 13 | 46 / 0 |
| 2748 | 17:41:32.914 | 67.23% | 9.75 ms | 8 / 8 | 7 | 46 / 0 |
| 3078 | 17:41:57.243 | 69.13% | 8.2 ms | 3 / 3 | 5 | 46 / 0 |

The numerator is occupied copies and the denominator is the applicable limit. The planner reports NONE when its deficit evaluation returns that state. Committed service rows determine the voter census. A busy partition may own work outside the copy census.

| Partition | Under RF3 at last census | 1640 | 2297 | 2748 | 3078 |
|---|---|---|---|---|---|
| node_endpoints-p1 | yes | source 2/1 | busy (CREATING) | busy (CREATING) | busy (SYNCING) |
| schema_migration_partitions-p1 | yes | source 2/1 | busy (SENDING) | busy (CREATING) | busy (CREATING) |
| service_packages-p1 | yes | source 2/1 | source 4/4 | source 8/8 | busy (CREATING) |
| service_partition_access-p1 | yes | source 2/1 | source 4/4 | source 8/8 | source 3/3 |
| service_revisions-p1 | yes | source 2/1 | source 4/4 | source 8/8 | source 3/3 |
| service_timers-p1 | yes | source 2/1 | source 4/4 | source 8/8 | source 3/3 |
| storage_reservations-p1 | yes | source 2/1 | source 4/4 | source 8/8 | source 3/3 |
| wasm_operations-p1 | yes | source 2/1 | source 4/4 | source 8/8 | source 3/3 |
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
| debug_sessions-p1 | no | busy (SENDING) | NONE | NONE | NONE |
| debug_snapshots-p1 | no | source 2/1 | NONE | NONE | NONE |
| indices-p1 | no | busy (CREATING) | NONE | NONE | NONE |
| inter_group_latencies-p1 | no | source 2/1 | NONE | NONE | NONE |
| latency_groups-p1 | no | source 2/1 | NONE | NONE | NONE |
| live_queries-p1 | no | source 2/1 | NONE | NONE | NONE |
| logs-p1 | no | source 2/1 | NONE | NONE | NONE |
| message_groups-p1 | no | source 2/1 | NONE | NONE | NONE |
| module_dependency_locks-p1 | no | source 2/1 | NONE | NONE | NONE |
| module_manifests-p1 | no | source 2/1 | NONE | NONE | NONE |
| nodes-p1 | no | NONE | NONE | NONE | NONE |
| package_registry_mappings-p1 | no | source 2/1 | busy (SENDING) | NONE | NONE |
| package_registry_overrides-p1 | no | source 2/1 | busy (SENDING) | busy (SYNCING) | NONE |
| partitions-p1 | no | NONE | NONE | NONE | NONE |
| replica_operations-p1 | no | NONE | NONE | NONE | NONE |
| schema_migrations-p1 | no | source 2/1 | source 4/4 | busy (SYNCING) | NONE |
| schema_operations-p1 | no | NONE | NONE | NONE | NONE |
| service_bindings-p1 | no | source 2/1 | source 4/4 | busy (CREATING) | NONE |
| service_definitions-p1 | no | source 2/1 | source 4/4 | NONE | NONE |
| service_endpoints-p1 | no | source 2/1 | source 4/4 | busy (CREATING) | NONE |
| service_install_failures-p1 | no | source 2/1 | source 4/4 | busy (SENDING) | NONE |
| service_installations-p1 | no | source 2/1 | source 4/4 | busy (SENDING) | NONE |
| service_instances-p1 | no | source 2/1 | source 4/4 | source 8/8 | NONE |
| services-p1 | no | NONE | NONE | NONE | NONE |
| sql_transaction_participants-p1 | no | NONE | NONE | NONE | NONE |
| sql_transactions-p1 | no | NONE | NONE | NONE | NONE |
| sql_write_operations-p1 | no | NONE | NONE | NONE | NONE |
| tables-p1 | no | NONE | NONE | NONE | NONE |
