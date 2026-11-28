# Placement and public readiness on 63c6f12bb

Three physical data hosts ran product snapshot `63c6f12bbcabc080e78193360823cdcfbe5265d2`, image `sha256:5ceaa180e10782e8e74a86a11a077974aeca0a69a1c6e6b3b189e21a5342cdb2`. The complete seed census at 15:32:25.617 UTC found all 46 system partitions at RF3. The system-table and cluster readiness stages passed. The first external PG-wire CREATE for `bench_readiness_probe` exceeded the remaining 2.6 seconds. The canonical deadline was 15:32:30.605 UTC. The benchmark workload did not start.

| Completed stage | Ready at (UTC) | Attempts |
|---|---|---:|
| membership | 2026-11-26T15:29:33.191Z | 1 |
| publicPgWire | 2026-11-26T15:29:37.133Z | 2 |
| leaders | 2026-11-26T15:29:38.144Z | 1 |
| systemTables | 2026-11-26T15:32:28.002Z | 62 |
| cluster | 2026-11-26T15:32:28.002Z | 62 |

The placement owner retained all 46 partition decisions in each of the four sampled passes. The source and per-partition decisions below were read during the run. Each read retained the evaluation time from the owner.

| Pass | Evaluated (UTC) | Main-thread CPU | Event-loop delay | Source occupancy / limit | Waiting | Partitions retained / omitted |
|---:|---|---:|---:|---:|---:|---:|
| 1811 | 15:30:27.230 | 94.6% | 78.39 ms | 3 / 1 | 21 | 46 / 0 |
| 2668 | 15:31:24.836 | 93.54% | 173.49 ms | 7 / 2 | 6 | 46 / 0 |
| 3170 | 15:32:00.954 | 91.54% | 56.04 ms | 5 / 3 | 0 | 46 / 0 |
| 3463 | 15:32:24.881 | 48.8% | 1.21 ms | 0 / 1 | 0 | 46 / 0 |

The numerator is occupied copies and the denominator is the applicable limit. The planner reports NONE when its deficit evaluation returns that state. Committed service rows determine the voter census. A busy partition may own work outside the copy census.

| Partition | Under RF3 at last census | 1811 | 2668 | 3170 | 3463 |
|---|---|---|---|---|---|
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
| inter_group_latencies-p1 | no | busy (CREATING) | NONE | NONE | NONE |
| latency_groups-p1 | no | busy (SYNCING) | NONE | NONE | NONE |
| live_queries-p1 | no | busy (CREATING) | NONE | NONE | NONE |
| logs-p1 | no | source 3/1 | NONE | NONE | NONE |
| message_groups-p1 | no | source 3/1 | NONE | NONE | NONE |
| module_dependency_locks-p1 | no | source 3/1 | NONE | NONE | NONE |
| module_manifests-p1 | no | source 3/1 | NONE | NONE | NONE |
| node_endpoints-p1 | no | source 3/1 | NONE | NONE | NONE |
| nodes-p1 | no | NONE | NONE | NONE | NONE |
| package_registry_mappings-p1 | no | source 3/1 | NONE | NONE | NONE |
| package_registry_overrides-p1 | no | source 3/1 | NONE | NONE | NONE |
| partitions-p1 | no | NONE | NONE | NONE | NONE |
| replica_operations-p1 | no | NONE | NONE | NONE | NONE |
| schema_migration_partitions-p1 | no | source 3/1 | NONE | NONE | NONE |
| schema_migrations-p1 | no | source 3/1 | busy (SYNCING) | NONE | NONE |
| schema_operations-p1 | no | NONE | NONE | NONE | NONE |
| service_bindings-p1 | no | source 3/1 | busy (SYNCING) | NONE | NONE |
| service_definitions-p1 | no | source 3/1 | busy (SYNCING) | NONE | NONE |
| service_endpoints-p1 | no | source 3/1 | busy (CREATING) | NONE | NONE |
| service_install_failures-p1 | no | source 3/1 | busy (CREATING) | NONE | NONE |
| service_installations-p1 | no | source 3/1 | busy (CREATING) | NONE | NONE |
| service_instances-p1 | no | source 3/1 | busy (CREATING) | NONE | NONE |
| service_packages-p1 | no | source 3/1 | source 7/2 | NONE | NONE |
| service_partition_access-p1 | no | source 3/1 | source 7/2 | busy (SENDING) | NONE |
| service_revisions-p1 | no | source 3/1 | source 7/2 | busy (SENDING) | NONE |
| service_timers-p1 | no | source 3/1 | source 7/2 | busy (CREATING) | NONE |
| services-p1 | no | NONE | NONE | NONE | NONE |
| sql_transaction_participants-p1 | no | NONE | NONE | NONE | NONE |
| sql_transactions-p1 | no | NONE | NONE | NONE | NONE |
| sql_write_operations-p1 | no | NONE | NONE | NONE | NONE |
| storage_reservations-p1 | no | source 3/1 | source 7/2 | busy (SENDING) | NONE |
| tables-p1 | no | NONE | NONE | NONE | NONE |
| wasm_operations-p1 | no | source 3/1 | source 7/2 | busy (CREATING) | NONE |
