# Per-partition placement decisions

Campaign `bench-review-c94-three-1629`. These observations come from the placement owner on the seed. Every column below represents one completed planning pass. The last census ended at 16:38:01.224 UTC.

| Pass | Evaluated (UTC) | Main-thread CPU | Event-loop delay | Source occupancy / limit | Waiting | Partitions retained / omitted |
|---:|---|---:|---:|---:|---:|---:|
| 1396 | 16:36:02.435 | 54.26% | 3.47 ms | 8 / 8 | 22 | 46 / 0 |
| 2031 | 16:36:59.675 | 66.21% | 8.79 ms | 6 / 6 | 15 | 46 / 0 |
| 2360 | 16:37:36.505 | 58.5% | 4.34 ms | 6 / 6 | 12 | 46 / 0 |
| 2639 | 16:38:00.305 | 69.81% | 7.67 ms | 7 / 5 | 5 | 46 / 0 |

The numerator is occupied copies and the denominator is the applicable limit. The planner reports NONE when its deficit evaluation returns that state. Committed service rows determine the voter census. A busy partition may own work outside the copy census.

| Partition | Under RF3 at last census | 1396 | 2031 | 2360 | 2639 |
|---|---|---|---|---|---|
| node_endpoints-p1 | yes | source 8/8 | busy (CREATING) | busy (CREATING) | busy (CREATING) |
| service_definitions-p1 | yes | source 8/8 | source 6/6 | source 6/6 | busy (CREATING) |
| service_endpoints-p1 | yes | source 8/8 | source 6/6 | source 6/6 | busy (CREATING) |
| service_install_failures-p1 | yes | source 8/8 | source 6/6 | source 6/6 | busy (CREATING) |
| service_installations-p1 | yes | source 8/8 | source 6/6 | source 6/6 | busy (SENDING) |
| service_instances-p1 | yes | source 8/8 | source 6/6 | source 6/6 | busy (SENDING) |
| service_packages-p1 | yes | source 8/8 | source 6/6 | source 6/6 | busy (SENDING) |
| service_partition_access-p1 | yes | source 8/8 | source 6/6 | source 6/6 | source 7/5 |
| service_revisions-p1 | yes | source 8/8 | source 6/6 | source 6/6 | source 7/5 |
| service_timers-p1 | yes | source 8/8 | source 6/6 | source 6/6 | source 7/5 |
| storage_reservations-p1 | yes | source 8/8 | source 6/6 | source 6/6 | source 7/5 |
| wasm_operations-p1 | yes | source 8/8 | source 6/6 | source 6/6 | source 7/5 |
| artifact_payload_chunks-p1 | no | NONE | NONE | NONE | NONE |
| artifact_payloads-p1 | no | NONE | NONE | NONE | NONE |
| call_activation_leases-p1 | no | NONE | NONE | NONE | NONE |
| call_cell_reduce_results-p1 | no | NONE | NONE | NONE | NONE |
| call_cell_reduce_slots-p1 | no | NONE | NONE | NONE | NONE |
| code-p1 | no | NONE | NONE | NONE | NONE |
| config-p1 | no | busy (CREATING) | NONE | NONE | NONE |
| contexts-p1 | no | busy (SYNCING) | NONE | NONE | NONE |
| control_plane_publications-p1 | no | NONE | NONE | NONE | NONE |
| debug_breakpoints-p1 | no | busy (SYNCING) | NONE | NONE | NONE |
| debug_sessions-p1 | no | busy (CREATING) | NONE | NONE | NONE |
| debug_snapshots-p1 | no | busy (CREATING) | NONE | NONE | NONE |
| indices-p1 | no | busy (CREATING) | NONE | NONE | NONE |
| inter_group_latencies-p1 | no | busy (CREATING) | NONE | NONE | NONE |
| latency_groups-p1 | no | busy (CREATING) | NONE | NONE | NONE |
| live_queries-p1 | no | source 8/8 | NONE | NONE | NONE |
| logs-p1 | no | source 8/8 | busy (SYNCING) | NONE | NONE |
| message_groups-p1 | no | source 8/8 | busy (SYNCING) | NONE | NONE |
| module_dependency_locks-p1 | no | source 8/8 | busy (SYNCING) | busy (SYNCING) | NONE |
| module_manifests-p1 | no | source 8/8 | busy (CREATING) | NONE | NONE |
| nodes-p1 | no | NONE | NONE | NONE | NONE |
| package_registry_mappings-p1 | no | source 8/8 | busy (SENDING) | busy (SYNCING) | NONE |
| package_registry_overrides-p1 | no | source 8/8 | source 6/6 | busy (CREATING) | NONE |
| partitions-p1 | no | NONE | NONE | NONE | NONE |
| replica_operations-p1 | no | NONE | NONE | NONE | NONE |
| schema_migration_partitions-p1 | no | source 8/8 | source 6/6 | busy (SENDING) | NONE |
| schema_migrations-p1 | no | source 8/8 | source 6/6 | busy (SENDING) | NONE |
| schema_operations-p1 | no | NONE | NONE | NONE | NONE |
| service_bindings-p1 | no | source 8/8 | source 6/6 | source 6/6 | NONE |
| services-p1 | no | NONE | NONE | NONE | NONE |
| sql_transaction_participants-p1 | no | NONE | NONE | NONE | NONE |
| sql_transactions-p1 | no | NONE | NONE | NONE | NONE |
| sql_write_operations-p1 | no | NONE | NONE | NONE | NONE |
| tables-p1 | no | NONE | NONE | NONE | NONE |
