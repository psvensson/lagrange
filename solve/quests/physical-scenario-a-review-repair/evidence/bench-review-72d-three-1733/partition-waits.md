# Physical formation waits

Campaign `bench-review-72d-three-1733`. Formation deadline 2026-11-26T17:42:02.490+00:00. The last complete seed census ended at 2026-11-26T17:41:57.600+00:00 with 8 under-replicated partitions. The readiness observer last reported 6 under-replicated. The table follows the census cohort through the deadline using each host’s timestamps. The clocks were not corrected for skew.

The target column identifies each missing voter at the census. A completed operation can precede a visible voter row. An empty operation history leaves the admission reason unmeasured.

| Partition | Target node | Latest source or ledger event by deadline (UTC) | Latest target observation by deadline (UTC) |
|---|---|---|---|
| node_endpoints-p1 | 2 | completed at 17:40:47.277 | completed at 17:40:47.820 |
| node_endpoints-p1 | 3 | completed at 17:41:58.779 | completed at 17:41:59.084 |
| schema_migration_partitions-p1 | 2 | No recorded operation | Unobserved |
| schema_migration_partitions-p1 | 3 | failed at 17:42:00.888 | Unobserved |
| service_packages-p1 | 2 | completed at 17:41:54.294 | completed at 17:41:55.017 |
| service_packages-p1 | 3 | completed at 17:41:59.611 | completed at 17:41:59.877 |
| service_partition_access-p1 | 2 | send at 17:42:01.978 | createReplicaAsync entered at 17:42:02.008 |
| service_partition_access-p1 | 3 | No recorded operation | Unobserved |
| service_revisions-p1 | 2 | No recorded operation | Unobserved |
| service_revisions-p1 | 3 | No recorded operation | Unobserved |
| service_timers-p1 | 2 | No recorded operation | Unobserved |
| service_timers-p1 | 3 | No recorded operation | Unobserved |
| storage_reservations-p1 | 2 | No recorded operation | Unobserved |
| storage_reservations-p1 | 3 | No recorded operation | Unobserved |
| wasm_operations-p1 | 2 | No recorded operation | Unobserved |
| wasm_operations-p1 | 3 | No recorded operation | Unobserved |
