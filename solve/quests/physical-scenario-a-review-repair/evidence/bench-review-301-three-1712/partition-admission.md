# Per-partition placement decisions

Campaign `bench-review-301-three-1712`. These observations come from the placement owner on the seed. Every column below represents one completed planning pass. The last census ended at 17:20:05.500 UTC.

| Pass | Evaluated (UTC) | Main-thread CPU | Event-loop delay | Source occupancy / limit | Waiting | Partitions retained / omitted |
|---:|---|---:|---:|---:|---:|---:|
| 1628 | 17:18:06.896 | 84.66% | 26.27 ms | 1 / 1 | 27 | 46 / 0 |
| 2200 | 17:19:02.467 | 51.91% | 3.34 ms | 8 / 8 | 14 | 46 / 0 |
| 2309 | 17:19:40.857 | 71.15% | 8.57 ms | 8 / 8 | 14 | 46 / 0 |
| 2663 | 17:20:04.630 | 76.2% | 12.57 ms | 1 / 1 | 14 | 46 / 0 |

The numerator is occupied copies and the denominator is the applicable limit. The planner reports NONE when its deficit evaluation returns that state. Committed service rows determine the voter census. A busy partition may own work outside the copy census.

| Partition | Under RF3 at last census | 1628 | 2200 | 2309 | 2663 |
|---|---|---|---|---|---|
| node_endpoints-p1 | yes | source 1/1 | busy (CREATING) | busy (CREATING) | source 1/1 |
| schema_migration_partitions-p1 | yes | source 1/1 | source 8/8 | source 8/8 | busy (SENDING) |
| schema_migrations-p1 | yes | source 1/1 | source 8/8 | source 8/8 | source 1/1 |
| service_bindings-p1 | yes | source 1/1 | source 8/8 | source 8/8 | source 1/1 |
| service_definitions-p1 | yes | source 1/1 | source 8/8 | source 8/8 | source 1/1 |
| service_endpoints-p1 | yes | source 1/1 | source 8/8 | source 8/8 | source 1/1 |
| service_install_failures-p1 | yes | source 1/1 | source 8/8 | source 8/8 | source 1/1 |
| service_installations-p1 | yes | source 1/1 | source 8/8 | source 8/8 | source 1/1 |
| service_instances-p1 | yes | source 1/1 | source 8/8 | source 8/8 | source 1/1 |
| service_packages-p1 | yes | source 1/1 | source 8/8 | source 8/8 | source 1/1 |
| service_partition_access-p1 | yes | source 1/1 | source 8/8 | source 8/8 | source 1/1 |
| service_revisions-p1 | yes | source 1/1 | source 8/8 | source 8/8 | source 1/1 |
| service_timers-p1 | yes | source 1/1 | source 8/8 | source 8/8 | source 1/1 |
| storage_reservations-p1 | yes | source 1/1 | source 8/8 | source 8/8 | source 1/1 |
| wasm_operations-p1 | yes | source 1/1 | source 8/8 | source 8/8 | source 1/1 |
| artifact_payload_chunks-p1 | no | NONE | NONE | NONE | NONE |
| artifact_payloads-p1 | no | NONE | NONE | NONE | NONE |
| call_activation_leases-p1 | no | NONE | NONE | NONE | NONE |
| call_cell_reduce_results-p1 | no | NONE | NONE | NONE | NONE |
| call_cell_reduce_slots-p1 | no | NONE | NONE | NONE | NONE |
| code-p1 | no | NONE | NONE | NONE | NONE |
| config-p1 | no | NONE | NONE | NONE | NONE |
| contexts-p1 | no | busy | NONE | NONE | NONE |
| control_plane_publications-p1 | no | NONE | NONE | NONE | NONE |
| debug_breakpoints-p1 | no | busy (SYNCING) | NONE | NONE | NONE |
| debug_sessions-p1 | no | source 1/1 | NONE | NONE | NONE |
| debug_snapshots-p1 | no | source 1/1 | NONE | NONE | NONE |
| indices-p1 | no | source 1/1 | NONE | NONE | NONE |
| inter_group_latencies-p1 | no | source 1/1 | NONE | NONE | NONE |
| latency_groups-p1 | no | source 1/1 | busy (SYNCING) | busy (SYNCING) | NONE |
| live_queries-p1 | no | source 1/1 | NONE | NONE | NONE |
| logs-p1 | no | source 1/1 | busy (SYNCING) | busy (SYNCING) | NONE |
| message_groups-p1 | no | source 1/1 | busy (CREATING) | busy (CREATING) | NONE |
| module_dependency_locks-p1 | no | source 1/1 | busy (SYNCING) | busy (SYNCING) | NONE |
| module_manifests-p1 | no | source 1/1 | busy (SYNCING) | busy (SYNCING) | NONE |
| nodes-p1 | no | NONE | NONE | NONE | NONE |
| package_registry_mappings-p1 | no | source 1/1 | busy (SYNCING) | busy (SENDING) | NONE |
| package_registry_overrides-p1 | no | source 1/1 | busy (SYNCING) | busy (SENDING) | NONE |
| partitions-p1 | no | NONE | NONE | NONE | NONE |
| replica_operations-p1 | no | NONE | NONE | NONE | NONE |
| schema_operations-p1 | no | NONE | NONE | NONE | NONE |
| services-p1 | no | NONE | NONE | NONE | NONE |
| sql_transaction_participants-p1 | no | NONE | NONE | NONE | NONE |
| sql_transactions-p1 | no | NONE | NONE | NONE | NONE |
| sql_write_operations-p1 | no | NONE | NONE | NONE | NONE |
| tables-p1 | no | NONE | NONE | NONE | NONE |
