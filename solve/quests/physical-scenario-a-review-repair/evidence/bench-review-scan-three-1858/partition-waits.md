# Physical formation waits

Campaign `bench-review-scan-three-1858`. Formation deadline 2026-11-26T19:08:08.508+00:00. The last complete seed census ended at 2026-11-26T19:08:03.944+00:00 with 15 under-replicated partitions. The final readiness observation did not report an under-replication count. The table follows the census cohort through the deadline using each host’s timestamps. The clocks were not corrected for skew.

The target column identifies each missing voter at the census. A completed operation can precede a visible voter row. An empty operation history leaves the admission reason unmeasured.

| Partition | Target node | Latest source or ledger event by deadline (UTC) | Latest target observation by deadline (UTC) |
|---|---|---|---|
| package_registry_overrides-p1 | 2 | completed at 19:07:00.789 | completed at 19:07:01.043 |
| schema_migration_partitions-p1 | 2 | completed at 19:08:02.253 | completed at 19:08:02.934 |
| schema_migration_partitions-p1 | 3 | SYNCING at 19:08:05.800 | activation_worker_revalidation settled at 19:08:07.806 |
| schema_migrations-p1 | 2 | send at 19:08:08.119 | Unobserved |
| schema_migrations-p1 | 3 | completed at 19:07:56.370 | completed at 19:07:57.299 |
| service_bindings-p1 | 2 | completed at 19:08:00.512 | completed at 19:08:00.980 |
| service_bindings-p1 | 3 | No recorded operation | Unobserved |
| service_definitions-p1 | 2 | completed at 19:08:00.514 | completed at 19:08:00.990 |
| service_definitions-p1 | 3 | No recorded operation | Unobserved |
| service_endpoints-p1 | 2 | completed at 19:08:00.514 | completed at 19:08:00.996 |
| service_endpoints-p1 | 3 | No recorded operation | Unobserved |
| service_install_failures-p1 | 2 | completed at 19:08:00.512 | completed at 19:08:00.990 |
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
