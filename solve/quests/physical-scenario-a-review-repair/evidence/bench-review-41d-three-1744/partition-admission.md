# Per-partition placement decisions

Campaign `bench-review-41d-three-1744`. These observations come from the placement owner on the seed. Every column below represents one completed planning pass. The last census ended at 17:54:13.712 UTC.

| Pass | Evaluated (UTC) | Main-thread CPU | Event-loop delay | Source occupancy / limit | Waiting | Partitions retained / omitted |
|---:|---|---:|---:|---:|---:|---:|
| 1897 | 17:52:15.592 | 96.62% | 311.76 ms | 3 / 2 | 22 | 46 / 0 |
| 2784 | 17:53:12.154 | 79.36% | 16.68 ms | 2 / 2 | 10 | 46 / 0 |
| 3374 | 17:53:49.096 | 92.53% | 66.71 ms | 3 / 2 | 4 | 46 / 0 |
| 3773 | 17:54:13.313 | 69.2% | 7.06 ms | 2 / 1 | 0 | 46 / 0 |

The numerator is occupied copies and the denominator is the applicable limit. The planner reports NONE when its deficit evaluation returns that state. Committed service rows determine the voter census. A busy partition may own work outside the copy census.

| Partition | Under RF3 at last census | 1897 | 2784 | 3374 | 3773 |
|---|---|---|---|---|---|
| service_timers-p1 | yes | source 3/2 | source 2/2 | source 3/2 | busy |
| storage_reservations-p1 | yes | source 3/2 | source 2/2 | source 3/2 | busy (SYNCING) |
| wasm_operations-p1 | yes | source 3/2 | source 2/2 | source 3/2 | busy (CREATING) |
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
| indices-p1 | no | busy (CREATING) | NONE | NONE | NONE |
| inter_group_latencies-p1 | no | busy (CREATING) | NONE | NONE | NONE |
| latency_groups-p1 | no | busy (SENDING) | NONE | NONE | NONE |
| live_queries-p1 | no | source 3/2 | NONE | NONE | NONE |
| logs-p1 | no | source 3/2 | NONE | NONE | NONE |
| message_groups-p1 | no | source 3/2 | NONE | NONE | NONE |
| module_dependency_locks-p1 | no | source 3/2 | NONE | NONE | NONE |
| module_manifests-p1 | no | source 3/2 | NONE | NONE | NONE |
| node_endpoints-p1 | no | source 3/2 | NONE | NONE | NONE |
| nodes-p1 | no | NONE | NONE | NONE | NONE |
| package_registry_mappings-p1 | no | source 3/2 | NONE | NONE | NONE |
| package_registry_overrides-p1 | no | source 3/2 | NONE | NONE | NONE |
| partitions-p1 | no | NONE | NONE | NONE | NONE |
| replica_operations-p1 | no | NONE | NONE | NONE | NONE |
| schema_migration_partitions-p1 | no | source 3/2 | NONE | NONE | NONE |
| schema_migrations-p1 | no | source 3/2 | NONE | NONE | NONE |
| schema_operations-p1 | no | NONE | NONE | NONE | NONE |
| service_bindings-p1 | no | source 3/2 | busy (CREATING) | NONE | NONE |
| service_definitions-p1 | no | source 3/2 | busy (SENDING) | NONE | NONE |
| service_endpoints-p1 | no | source 3/2 | source 2/2 | NONE | NONE |
| service_install_failures-p1 | no | source 3/2 | source 2/2 | NONE | NONE |
| service_installations-p1 | no | source 3/2 | source 2/2 | NONE | NONE |
| service_instances-p1 | no | source 3/2 | source 2/2 | busy (SYNCING) | NONE |
| service_packages-p1 | no | source 3/2 | source 2/2 | busy (CREATING) | NONE |
| service_partition_access-p1 | no | source 3/2 | source 2/2 | busy (SENDING) | NONE |
| service_revisions-p1 | no | source 3/2 | source 2/2 | source 3/2 | NONE |
| services-p1 | no | NONE | NONE | NONE | NONE |
| sql_transaction_participants-p1 | no | NONE | NONE | NONE | NONE |
| sql_transactions-p1 | no | NONE | NONE | NONE | NONE |
| sql_write_operations-p1 | no | NONE | NONE | NONE | NONE |
| tables-p1 | no | NONE | NONE | NONE | NONE |
