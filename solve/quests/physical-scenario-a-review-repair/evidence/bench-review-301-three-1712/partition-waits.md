# Physical formation waits

Campaign `bench-review-301-three-1712`. Formation deadline 2026-11-26T17:20:10.410+00:00. The last complete seed census ended at 2026-11-26T17:20:05.500+00:00 with 15 under-replicated partitions. The readiness observer last reported 18 under-replicated. The table follows the census cohort through the deadline using each host’s timestamps. The clocks were not corrected for skew.

The target column identifies each missing voter at the census. A completed operation can precede a visible voter row. An empty operation history leaves the admission reason unmeasured.

| Partition | Target node | Latest source or ledger event by deadline (UTC) | Latest target observation by deadline (UTC) |
|---|---|---|---|
| node_endpoints-p1 | 2 | completed at 17:20:03.462 | completed at 17:20:03.897 |
| node_endpoints-p1 | 3 | send at 17:20:09.513 | participant_release started at 17:20:10.243 |
| schema_migration_partitions-p1 | 2 | completed at 17:19:52.197 | completed at 17:19:53.313 |
| schema_migration_partitions-p1 | 3 | completed at 17:20:07.710 | completed at 17:20:08.070 |
| schema_migrations-p1 | 2 | completed at 17:19:53.034 | completed at 17:19:53.603 |
| schema_migrations-p1 | 3 | CREATING at 17:20:09.821 | createReplicaAsync entered at 17:20:09.926 |
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
