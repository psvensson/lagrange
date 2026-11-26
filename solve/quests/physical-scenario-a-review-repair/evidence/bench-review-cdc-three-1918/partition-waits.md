# Physical formation waits

Campaign `bench-review-cdc-three-1918`. Formation deadline 2026-11-26T19:25:05.846+00:00. The last complete seed census ended at 2026-11-26T19:25:00.852+00:00 with 7 under-replicated partitions. The final readiness observation did not report an under-replication count. The table follows the census cohort through the deadline using each host’s timestamps. The clocks were not corrected for skew.

The target column identifies each missing voter at the census. A completed operation can precede a visible voter row. An empty operation history leaves the admission reason unmeasured.

| Partition | Target node | Latest source or ledger event by deadline (UTC) | Latest target observation by deadline (UTC) |
|---|---|---|---|
| service_instances-p1 | 2 | completed at 19:24:54.197 | completed at 19:24:54.772 |
| service_instances-p1 | 3 | send at 19:25:02.848 | request prepared at 19:24:59.150 |
| service_packages-p1 | 2 | completed at 19:24:54.198 | completed at 19:24:54.772 |
| service_packages-p1 | 3 | send at 19:25:04.022 | request prepared at 19:25:00.632 |
| service_partition_access-p1 | 2 | send at 19:25:05.409 | createReplicaAsync entered at 19:25:05.587 |
| service_partition_access-p1 | 3 | completed at 19:24:57.513 | completed at 19:24:58.391 |
| service_revisions-p1 | 2 | CREATING at 19:25:05.677 | createReplicaAsync entered at 19:25:05.673 |
| service_revisions-p1 | 3 | No recorded operation | Unobserved |
| service_timers-p1 | 2 | send at 19:25:02.424 | request prepared at 19:25:04.041 |
| service_timers-p1 | 3 | No recorded operation | Unobserved |
| storage_reservations-p1 | 2 | No recorded operation | Unobserved |
| storage_reservations-p1 | 3 | send at 19:25:03.475 | Unobserved |
| wasm_operations-p1 | 2 | send at 19:25:04.508 | Unobserved |
| wasm_operations-p1 | 3 | No recorded operation | Unobserved |
