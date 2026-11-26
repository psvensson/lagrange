# Physical formation waits

Campaign `bench-control-grant-three-1836`. Formation deadline 2026-11-26T18:43:13.363+00:00. The last complete seed census ended at 2026-11-26T18:43:08.642+00:00 with 4 under-replicated partitions. The readiness observer last reported 4 under-replicated. The table follows the census cohort through the deadline using each host’s timestamps. The clocks were not corrected for skew.

The target column identifies each missing voter at the census. A completed operation can precede a visible voter row. An empty operation history leaves the admission reason unmeasured.

| Partition | Target node | Latest source or ledger event by deadline (UTC) | Latest target observation by deadline (UTC) |
|---|---|---|---|
| service_revisions-p1 | 2 | completed at 18:43:03.346 | completed at 18:43:03.858 |
| service_revisions-p1 | 3 | completed at 18:43:08.185 | completed at 18:43:08.486 |
| service_timers-p1 | 2 | SYNCING at 18:43:09.932 | activation_worker_revalidation settled at 18:43:12.506 |
| service_timers-p1 | 3 | No recorded operation | Unobserved |
| storage_reservations-p1 | 2 | SYNCING at 18:43:11.742 | participant_release started at 18:43:11.635 |
| storage_reservations-p1 | 3 | No recorded operation | Unobserved |
| wasm_operations-p1 | 2 | No recorded operation | Unobserved |
| wasm_operations-p1 | 3 | SYNCING at 18:43:13.311 | participant_release started at 18:43:13.032 |
