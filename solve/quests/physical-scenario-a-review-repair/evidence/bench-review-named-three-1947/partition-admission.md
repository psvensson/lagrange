# Per-partition placement decisions

Campaign `bench-review-named-three-1947`. These observations come from the placement owner on the seed. Every column below represents one completed planning pass. The last census ended at 19:53:29.157 UTC.

| Pass | Evaluated (UTC) | Main-thread CPU | Event-loop delay | Source occupancy / limit | Waiting | Partitions retained / omitted |
|---:|---|---:|---:|---:|---:|---:|
| 1789 | 19:51:30.630 | 92.86% | 59.28 ms | 1 / 1 | 24 | 46 / 0 |
| 2643 | 19:52:27.506 | 93.68% | 116.28 ms | 2 / 1 | 11 | 46 / 0 |
| 3211 | 19:53:04.649 | 82.59% | 19.26 ms | 1 / 1 | 4 | 46 / 0 |
| 3545 | 19:53:28.402 | 72.01% | 10.1 ms | 1 / 1 | 0 | 46 / 0 |

The numerator is occupied copies and the denominator is the applicable limit. The planner reports NONE when its deficit evaluation returns that state. Committed service rows determine the voter census. A busy partition may own work outside the copy census.

| Partition | Under RF3 at last census | 1789 | 2643 | 3211 | 3545 |
|---|---|---|---|---|---|
| wasm_operations-p1 | yes | source 1/1 | source 2/1 | source 1/1 | busy (SYNCING) |
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
| inter_group_latencies-p1 | no | source 1/1 | NONE | NONE | NONE |
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
| schema_migrations-p1 | no | source 1/1 | busy (SYNCING) | NONE | NONE |
| schema_operations-p1 | no | NONE | NONE | NONE | NONE |
| service_bindings-p1 | no | source 1/1 | busy (SENDING) | NONE | NONE |
| service_definitions-p1 | no | source 1/1 | source 2/1 | NONE | NONE |
| service_endpoints-p1 | no | source 1/1 | source 2/1 | NONE | NONE |
| service_install_failures-p1 | no | source 1/1 | source 2/1 | NONE | NONE |
| service_installations-p1 | no | source 1/1 | source 2/1 | NONE | NONE |
| service_instances-p1 | no | source 1/1 | source 2/1 | NONE | NONE |
| service_packages-p1 | no | source 1/1 | source 2/1 | NONE | NONE |
| service_partition_access-p1 | no | source 1/1 | source 2/1 | busy (CREATING) | NONE |
| service_revisions-p1 | no | source 1/1 | source 2/1 | source 1/1 | NONE |
| service_timers-p1 | no | source 1/1 | source 2/1 | source 1/1 | NONE |
| services-p1 | no | NONE | NONE | NONE | NONE |
| sql_transaction_participants-p1 | no | NONE | NONE | NONE | NONE |
| sql_transactions-p1 | no | NONE | NONE | NONE | NONE |
| sql_write_operations-p1 | no | NONE | NONE | NONE | NONE |
| storage_reservations-p1 | no | source 1/1 | source 2/1 | source 1/1 | NONE |
| tables-p1 | no | NONE | NONE | NONE | NONE |
