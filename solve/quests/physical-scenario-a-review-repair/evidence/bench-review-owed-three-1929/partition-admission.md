# Per-partition placement decisions

Campaign `bench-review-owed-three-1929`. These observations come from the placement owner on the seed. Every column below represents one completed planning pass. The last census ended at 19:36:36.989 UTC.

| Pass | Evaluated (UTC) | Main-thread CPU | Event-loop delay | Source occupancy / limit | Waiting | Partitions retained / omitted |
|---:|---|---:|---:|---:|---:|---:|
| 1802 | 19:34:39.039 | 70.34% | 9.02 ms | 5 / 5 | 20 | 46 / 0 |
| 2381 | 19:35:35.531 | 79.19% | 15.51 ms | 1 / 1 | 16 | 46 / 0 |
| 2965 | 19:36:12.645 | 86.49% | 27.52 ms | 3 / 3 | 7 | 46 / 0 |
| 3292 | 19:36:36.533 | 66.12% | 7.95 ms | 2 / 2 | 3 | 46 / 0 |

The numerator is occupied copies and the denominator is the applicable limit. The planner reports NONE when its deficit evaluation returns that state. Committed service rows determine the voter census. A busy partition may own work outside the copy census.

| Partition | Under RF3 at last census | 1802 | 2381 | 2965 | 3292 |
|---|---|---|---|---|---|
| service_partition_access-p1 | yes | source 5/5 | source 1/1 | source 3/3 | busy (CREATING) |
| service_revisions-p1 | yes | source 5/5 | source 1/1 | source 3/3 | busy (SENDING) |
| service_timers-p1 | yes | source 5/5 | source 1/1 | source 3/3 | source 2/2 |
| storage_reservations-p1 | yes | source 5/5 | source 1/1 | source 3/3 | source 2/2 |
| wasm_operations-p1 | yes | source 5/5 | source 1/1 | source 3/3 | source 2/2 |
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
| debug_snapshots-p1 | no | busy | NONE | NONE | NONE |
| indices-p1 | no | busy (CREATING) | NONE | NONE | NONE |
| inter_group_latencies-p1 | no | busy (CREATING) | NONE | NONE | NONE |
| latency_groups-p1 | no | busy (SENDING) | NONE | NONE | NONE |
| live_queries-p1 | no | busy (SENDING) | NONE | NONE | NONE |
| logs-p1 | no | busy (SENDING) | NONE | NONE | NONE |
| message_groups-p1 | no | source 5/5 | NONE | NONE | NONE |
| module_dependency_locks-p1 | no | source 5/5 | NONE | NONE | NONE |
| module_manifests-p1 | no | source 5/5 | NONE | NONE | NONE |
| node_endpoints-p1 | no | source 5/5 | busy (SENDING) | NONE | NONE |
| nodes-p1 | no | NONE | NONE | NONE | NONE |
| package_registry_mappings-p1 | no | source 5/5 | source 1/1 | NONE | NONE |
| package_registry_overrides-p1 | no | source 5/5 | source 1/1 | NONE | NONE |
| partitions-p1 | no | NONE | NONE | NONE | NONE |
| replica_operations-p1 | no | NONE | NONE | NONE | NONE |
| schema_migration_partitions-p1 | no | source 5/5 | source 1/1 | NONE | NONE |
| schema_migrations-p1 | no | source 5/5 | source 1/1 | NONE | NONE |
| schema_operations-p1 | no | NONE | NONE | NONE | NONE |
| service_bindings-p1 | no | source 5/5 | source 1/1 | NONE | NONE |
| service_definitions-p1 | no | source 5/5 | source 1/1 | NONE | NONE |
| service_endpoints-p1 | no | source 5/5 | source 1/1 | busy (SYNCING) | NONE |
| service_install_failures-p1 | no | source 5/5 | source 1/1 | busy (CREATING) | NONE |
| service_installations-p1 | no | source 5/5 | source 1/1 | busy (CREATING) | NONE |
| service_instances-p1 | no | source 5/5 | source 1/1 | source 3/3 | NONE |
| service_packages-p1 | no | source 5/5 | source 1/1 | source 3/3 | NONE |
| services-p1 | no | NONE | NONE | NONE | NONE |
| sql_transaction_participants-p1 | no | NONE | NONE | NONE | NONE |
| sql_transactions-p1 | no | NONE | NONE | NONE | NONE |
| sql_write_operations-p1 | no | NONE | NONE | NONE | NONE |
| tables-p1 | no | NONE | NONE | NONE | NONE |
