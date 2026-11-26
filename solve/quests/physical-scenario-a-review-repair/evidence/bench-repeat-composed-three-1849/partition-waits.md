# Physical formation waits

Campaign `bench-repeat-composed-three-1849`. Formation deadline 2026-11-26T18:53:37.492+00:00. The last complete seed census ended at 2026-11-26T18:53:32.583+00:00 with 8 under-replicated partitions. The readiness observer last reported 10 under-replicated. The table follows the census cohort through the deadline using each host’s timestamps. The clocks were not corrected for skew.

The target column identifies each missing voter at the census. A completed operation can precede a visible voter row. An empty operation history leaves the admission reason unmeasured.

| Partition | Target node | Latest source or ledger event by deadline (UTC) | Latest target observation by deadline (UTC) |
|---|---|---|---|
| service_installations-p1 | 2 | completed at 18:53:34.632 | completed at 18:53:35.205 |
| service_installations-p1 | 3 | completed at 18:53:19.733 | completed at 18:53:20.125 |
| service_instances-p1 | 2 | completed at 18:53:15.587 | completed at 18:53:15.791 |
| service_instances-p1 | 3 | SYNCING at 18:53:37.326 | participant_release started at 18:53:37.105 |
| service_packages-p1 | 2 | completed at 18:53:15.585 | completed at 18:53:15.790 |
| service_packages-p1 | 3 | SYNCING at 18:53:37.324 | participant_release started at 18:53:37.174 |
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
