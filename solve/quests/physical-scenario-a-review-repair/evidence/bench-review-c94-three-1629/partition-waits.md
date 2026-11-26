# Physical formation waits

Campaign `bench-review-c94-three-1629`. Formation deadline 2026-11-26T16:38:05.569+00:00. The last complete seed census ended at 2026-11-26T16:38:01.224+00:00 with 12 under-replicated partitions. The readiness observer last reported 15 under-replicated. The table follows the census cohort through the deadline using each host’s timestamps. The clocks were not corrected for skew.

The target column identifies each missing voter at the census. A completed operation can precede a visible voter row. An empty operation history leaves the admission reason unmeasured.

| Partition | Target node | Latest source or ledger event by deadline (UTC) | Latest target observation by deadline (UTC) |
|---|---|---|---|
| node_endpoints-p1 | 2 | send at 16:37:52.965 | createReplicaAsync entered at 16:37:59.450 |
| node_endpoints-p1 | 3 | completed at 16:37:47.399 | activation_worker_revalidation settled at 16:37:46.341 |
| service_definitions-p1 | 2 | completed at 16:37:47.396 | completed at 16:37:50.157 |
| service_definitions-p1 | 3 | send at 16:37:55.686 | Unobserved |
| service_endpoints-p1 | 2 | No recorded operation | Unobserved |
| service_endpoints-p1 | 3 | send at 16:37:57.169 | Unobserved |
| service_install_failures-p1 | 2 | send at 16:37:58.511 | createReplicaAsync entered at 16:38:01.520 |
| service_install_failures-p1 | 3 | No recorded operation | Unobserved |
| service_installations-p1 | 2 | No recorded operation | Unobserved |
| service_installations-p1 | 3 | send at 16:38:01.379 | Unobserved |
| service_instances-p1 | 2 | send at 16:38:02.441 | createReplicaAsync entered at 16:38:03.116 |
| service_instances-p1 | 3 | No recorded operation | Unobserved |
| service_packages-p1 | 2 | No recorded operation | Unobserved |
| service_packages-p1 | 3 | send at 16:38:03.853 | Unobserved |
| service_partition_access-p1 | 2 | send at 16:38:03.765 | request prepared at 16:38:05.338 |
| service_partition_access-p1 | 3 | No recorded operation | Unobserved |
| service_revisions-p1 | 2 | No recorded operation | Unobserved |
| service_revisions-p1 | 3 | No recorded operation | Unobserved |
| service_timers-p1 | 2 | No recorded operation | Unobserved |
| service_timers-p1 | 3 | No recorded operation | Unobserved |
| storage_reservations-p1 | 2 | No recorded operation | Unobserved |
| storage_reservations-p1 | 3 | No recorded operation | Unobserved |
| wasm_operations-p1 | 2 | No recorded operation | Unobserved |
| wasm_operations-p1 | 3 | No recorded operation | Unobserved |
