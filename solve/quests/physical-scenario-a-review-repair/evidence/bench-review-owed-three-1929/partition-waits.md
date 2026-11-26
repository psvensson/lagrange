# Physical formation waits

Campaign `bench-review-owed-three-1929`. Formation deadline 2026-11-26T19:36:42.014+00:00. The last complete seed census ended at 2026-11-26T19:36:36.989+00:00 with 5 under-replicated partitions. The readiness observer last reported 5 under-replicated. The table follows the census cohort through the deadline using each host’s timestamps. The clocks were not corrected for skew.

The target column identifies each missing voter at the census. A completed operation can precede a visible voter row. An empty operation history leaves the admission reason unmeasured.

| Partition | Target node | Latest source or ledger event by deadline (UTC) | Latest target observation by deadline (UTC) |
|---|---|---|---|
| service_partition_access-p1 | 2 | completed at 19:36:39.724 | completed at 19:36:40.986 |
| service_partition_access-p1 | 3 | send at 19:36:40.395 | request prepared at 19:36:41.542 |
| service_revisions-p1 | 2 | No recorded operation | Unobserved |
| service_revisions-p1 | 3 | SYNCING at 19:36:40.055 | participant_release started at 19:36:39.715 |
| service_timers-p1 | 2 | CREATING at 19:36:40.349 | createReplicaAsync entered at 19:36:40.778 |
| service_timers-p1 | 3 | No recorded operation | Unobserved |
| storage_reservations-p1 | 2 | No recorded operation | Unobserved |
| storage_reservations-p1 | 3 | send at 19:36:39.640 | request prepared at 19:36:40.723 |
| wasm_operations-p1 | 2 | send at 19:36:41.822 | Unobserved |
| wasm_operations-p1 | 3 | No recorded operation | Unobserved |
