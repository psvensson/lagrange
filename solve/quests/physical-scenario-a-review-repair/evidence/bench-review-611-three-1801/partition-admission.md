# Per-partition placement decisions

Campaign `bench-review-611-three-1801`. These observations come from the placement owner on the seed. Every column below represents one completed planning pass. The last census ended at 18:09:37.900 UTC.

| Pass | Evaluated (UTC) | Main-thread CPU | Event-loop delay | Source occupancy / limit | Waiting | Partitions retained / omitted |
|---:|---|---:|---:|---:|---:|---:|
| 1899 | 18:07:39.656 | 88.41% | 34.49 ms | 1 / 1 | 23 | 46 / 0 |
| 2794 | 18:08:36.441 | 82.65% | 23.6 ms | 2 / 2 | 10 | 46 / 0 |
| 3372 | 18:09:12.830 | 66.07% | 5.49 ms | 1 / 1 | 4 | 46 / 0 |
| 3681 | 18:09:36.327 | 77.22% | 11.25 ms | 1 / 2 | 0 | 46 / 0 |

The numerator is occupied copies and the denominator is the applicable limit. The planner reports NONE when its deficit evaluation returns that state. Committed service rows determine the voter census. A busy partition may own work outside the copy census.

| Partition | Under RF3 at last census | 1899 | 2794 | 3372 | 3681 |
|---|---|---|---|---|---|
| wasm_operations-p1 | yes | source 1/1 | source 2/2 | source 1/1 | busy (SYNCING) |
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
| indices-p1 | no | NONE | NONE | NONE | NONE |
| inter_group_latencies-p1 | no | busy (SENDING) | NONE | NONE | NONE |
| latency_groups-p1 | no | source 1/1 | NONE | NONE | NONE |
| live_queries-p1 | no | source 1/1 | NONE | NONE | NONE |
| logs-p1 | no | source 1/1 | NONE | NONE | NONE |
| message_groups-p1 | no | source 1/1 | NONE | NONE | NONE |
| module_dependency_locks-p1 | no | source 1/1 | NONE | NONE | NONE |
| module_manifests-p1 | no | source 1/1 | NONE | NONE | NONE |
| node_endpoints-p1 | no | source 1/1 | NONE | NONE | NONE |
| nodes-p1 | no | NONE | NONE | NONE | NONE |
| package_registry_mappings-p1 | no | source 1/1 | NONE | NONE | NONE |
| package_registry_overrides-p1 | no | source 1/1 | NONE | NONE | NONE |
| partitions-p1 | no | NONE | NONE | NONE | NONE |
| replica_operations-p1 | no | NONE | NONE | NONE | NONE |
| schema_migration_partitions-p1 | no | source 1/1 | NONE | NONE | NONE |
| schema_migrations-p1 | no | source 1/1 | NONE | NONE | NONE |
| schema_operations-p1 | no | NONE | NONE | NONE | NONE |
| service_bindings-p1 | no | source 1/1 | busy (CREATING) | NONE | NONE |
| service_definitions-p1 | no | source 1/1 | busy (SENDING) | NONE | NONE |
| service_endpoints-p1 | no | source 1/1 | source 2/2 | NONE | NONE |
| service_install_failures-p1 | no | source 1/1 | source 2/2 | NONE | NONE |
| service_installations-p1 | no | source 1/1 | source 2/2 | NONE | NONE |
| service_instances-p1 | no | source 1/1 | source 2/2 | NONE | NONE |
| service_packages-p1 | no | source 1/1 | source 2/2 | NONE | NONE |
| service_partition_access-p1 | no | source 1/1 | source 2/2 | busy (SYNCING) | NONE |
| service_revisions-p1 | no | source 1/1 | source 2/2 | source 1/1 | NONE |
| service_timers-p1 | no | source 1/1 | source 2/2 | source 1/1 | NONE |
| services-p1 | no | NONE | NONE | NONE | NONE |
| sql_transaction_participants-p1 | no | NONE | NONE | NONE | NONE |
| sql_transactions-p1 | no | NONE | NONE | NONE | NONE |
| sql_write_operations-p1 | no | NONE | NONE | NONE | NONE |
| storage_reservations-p1 | no | source 1/1 | source 2/2 | source 1/1 | NONE |
| tables-p1 | no | NONE | NONE | NONE | NONE |
