# Physical formation waits

Campaign `bench-review-composed-three-1812`. Formation deadline 2026-11-26T18:21:28.393+00:00. The last complete seed census ended at 2026-11-26T18:21:23.394+00:00 with 21 under-replicated partitions. The readiness observer last reported 21 under-replicated. The table follows the census cohort through the deadline using each host’s timestamps. The clocks were not corrected for skew.

The target column identifies each missing voter at the census. A completed operation can precede a visible voter row. An empty operation history leaves the admission reason unmeasured.

| Partition | Target node | Latest source or ledger event by deadline (UTC) | Latest target observation by deadline (UTC) |
|---|---|---|---|
| logs-p1 | 2 | completed at 18:19:53.169 | completed at 18:19:53.478 |
| logs-p1 | 3 | SYNCING at 18:19:55.289 | participant_release error at 18:20:54.360 |
| message_groups-p1 | 2 | completed at 18:19:53.769 | completed at 18:19:54.148 |
| message_groups-p1 | 3 | send at 18:20:43.392 | revalidate error at 18:20:01.301 |
| module_dependency_locks-p1 | 2 | SYNCING at 18:20:48.333 | participant_release error at 18:21:12.286 |
| module_dependency_locks-p1 | 3 | No recorded operation | Unobserved |
| module_manifests-p1 | 2 | SYNCING at 18:20:53.594 | participant_release error at 18:21:13.719 |
| module_manifests-p1 | 3 | No recorded operation | Unobserved |
| node_endpoints-p1 | 2 | SYNCING at 18:20:53.596 | participant_release error at 18:21:13.774 |
| node_endpoints-p1 | 3 | No recorded operation | Unobserved |
| package_registry_mappings-p1 | 2 | No recorded operation | Unobserved |
| package_registry_mappings-p1 | 3 | send at 18:21:17.847 | request prepared at 18:21:16.131 |
| package_registry_overrides-p1 | 2 | send at 18:20:18.578 | createReplicaAsync entered at 18:20:24.254 |
| package_registry_overrides-p1 | 3 | No recorded operation | Unobserved |
| schema_migration_partitions-p1 | 2 | No recorded operation | Unobserved |
| schema_migration_partitions-p1 | 3 | send at 18:21:17.645 | request prepared at 18:21:12.915 |
| schema_migrations-p1 | 2 | No recorded operation | Unobserved |
| schema_migrations-p1 | 3 | No recorded operation | Unobserved |
| service_bindings-p1 | 2 | No recorded operation | Unobserved |
| service_bindings-p1 | 3 | No recorded operation | Unobserved |
| service_definitions-p1 | 2 | No recorded operation | Unobserved |
| service_definitions-p1 | 3 | No recorded operation | Unobserved |
| service_endpoints-p1 | 2 | No recorded operation | Unobserved |
| service_endpoints-p1 | 3 | No recorded operation | Unobserved |
| service_install_failures-p1 | 2 | No recorded operation | Unobserved |
| service_install_failures-p1 | 3 | No recorded operation | Unobserved |
| service_installations-p1 | 2 | No recorded operation | Unobserved |
| service_installations-p1 | 3 | No recorded operation | Unobserved |
| service_instances-p1 | 2 | No recorded operation | Unobserved |
| service_instances-p1 | 3 | No recorded operation | Unobserved |
| service_packages-p1 | 2 | No recorded operation | Unobserved |
| service_packages-p1 | 3 | No recorded operation | Unobserved |
| service_partition_access-p1 | 2 | No recorded operation | Unobserved |
| service_partition_access-p1 | 3 | No recorded operation | Unobserved |
| service_revisions-p1 | 2 | No recorded operation | Unobserved |
| service_revisions-p1 | 3 | No recorded operation | Unobserved |
| service_timers-p1 | 2 | No recorded operation | Unobserved |
| service_timers-p1 | 3 | No recorded operation | Unobserved |
| storage_reservations-p1 | 2 | No recorded operation | Unobserved |
| storage_reservations-p1 | 3 | No recorded operation | Unobserved |
| wasm_operations-p1 | 2 | No recorded operation | Unobserved |
| wasm_operations-p1 | 3 | No recorded operation | Unobserved |
