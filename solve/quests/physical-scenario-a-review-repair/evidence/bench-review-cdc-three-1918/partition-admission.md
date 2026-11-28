# Per-partition placement decisions

Campaign `bench-review-cdc-three-1918`. These observations come from the placement owner on the seed. Every column below represents one completed planning pass. The last census ended at 19:25:00.852 UTC.

| Pass | Evaluated (UTC) | Main-thread CPU | Event-loop delay | Source occupancy / limit | Waiting | Partitions retained / omitted |
|---:|---|---:|---:|---:|---:|---:|
| 1827 | 19:23:02.528 | 64.79% | 6.7 ms | 3 / 3 | 21 | 46 / 0 |
| 2553 | 19:23:59.494 | 72.53% | 8.29 ms | 8 / 6 | 12 | 46 / 0 |
| 2990 | 19:24:36.321 | 76.99% | 17.89 ms | 2 / 2 | 10 | 46 / 0 |
| 3359 | 19:25:00.361 | 63.74% | 5.52 ms | 3 / 3 | 4 | 46 / 0 |

The numerator is occupied copies and the denominator is the applicable limit. The planner reports NONE when its deficit evaluation returns that state. Committed service rows determine the voter census. A busy partition may own work outside the copy census.

| Partition | Under RF3 at last census | 1827 | 2553 | 2990 | 3359 |
|---|---|---|---|---|---|
| service_instances-p1 | yes | source 3/3 | source 8/6 | source 2/2 | busy (SENDING) |
| service_packages-p1 | yes | source 3/3 | source 8/6 | source 2/2 | busy (SENDING) |
| service_partition_access-p1 | yes | source 3/3 | source 8/6 | source 2/2 | busy (SENDING) |
| service_revisions-p1 | yes | source 3/3 | source 8/6 | source 2/2 | source 3/3 |
| service_timers-p1 | yes | source 3/3 | source 8/6 | source 2/2 | source 3/3 |
| storage_reservations-p1 | yes | source 3/3 | source 8/6 | source 2/2 | source 3/3 |
| wasm_operations-p1 | yes | source 3/3 | source 8/6 | source 2/2 | source 3/3 |
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
| inter_group_latencies-p1 | no | busy (SYNCING) | NONE | NONE | NONE |
| latency_groups-p1 | no | busy (SENDING) | NONE | NONE | NONE |
| live_queries-p1 | no | busy (SENDING) | NONE | NONE | NONE |
| logs-p1 | no | source 3/3 | NONE | NONE | NONE |
| message_groups-p1 | no | source 3/3 | busy (CREATING) | NONE | NONE |
| module_dependency_locks-p1 | no | source 3/3 | busy (CREATING) | NONE | NONE |
| module_manifests-p1 | no | source 3/3 | busy (CREATING) | NONE | NONE |
| node_endpoints-p1 | no | source 3/3 | busy (CREATING) | NONE | NONE |
| nodes-p1 | no | NONE | NONE | NONE | NONE |
| package_registry_mappings-p1 | no | source 3/3 | busy (SENDING) | NONE | NONE |
| package_registry_overrides-p1 | no | source 3/3 | busy (SYNCING) | NONE | NONE |
| partitions-p1 | no | NONE | NONE | NONE | NONE |
| replica_operations-p1 | no | NONE | NONE | NONE | NONE |
| schema_migration_partitions-p1 | no | source 3/3 | source 8/6 | NONE | NONE |
| schema_migrations-p1 | no | source 3/3 | busy (SYNCING) | busy | NONE |
| schema_operations-p1 | no | NONE | NONE | NONE | NONE |
| service_bindings-p1 | no | source 3/3 | busy (SYNCING) | busy (CREATING) | NONE |
| service_definitions-p1 | no | source 3/3 | source 8/6 | source 2/2 | NONE |
| service_endpoints-p1 | no | source 3/3 | source 8/6 | source 2/2 | NONE |
| service_install_failures-p1 | no | source 3/3 | source 8/6 | source 2/2 | NONE |
| service_installations-p1 | no | source 3/3 | source 8/6 | busy (CREATING) | NONE |
| services-p1 | no | NONE | NONE | NONE | NONE |
| sql_transaction_participants-p1 | no | NONE | NONE | NONE | NONE |
| sql_transactions-p1 | no | NONE | NONE | NONE | NONE |
| sql_write_operations-p1 | no | NONE | NONE | NONE | NONE |
| tables-p1 | no | NONE | NONE | NONE | NONE |
