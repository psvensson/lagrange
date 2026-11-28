# Physical formation waits

Campaign `bench-review-41d-three-1744`. Formation deadline 2026-11-26T17:54:18.670+00:00. The last complete seed census ended at 2026-11-26T17:54:13.712+00:00 with 3 under-replicated partitions. The readiness observer last reported 3 under-replicated. The table follows the census cohort through the deadline using each host’s timestamps. The clocks were not corrected for skew.

The target column identifies each missing voter at the census. A completed operation can precede a visible voter row. An empty operation history leaves the admission reason unmeasured.

| Partition | Target node | Latest source or ledger event by deadline (UTC) | Latest target observation by deadline (UTC) |
|---|---|---|---|
| service_timers-p1 | 2 | completed at 17:54:07.594 | completed at 17:54:07.603 |
| service_timers-p1 | 3 | completed at 17:54:13.843 | completed at 17:54:13.815 |
| storage_reservations-p1 | 2 | completed at 17:54:14.440 | completed at 17:54:14.806 |
| storage_reservations-p1 | 3 | completed at 17:54:08.189 | completed at 17:54:08.680 |
| wasm_operations-p1 | 2 | completed at 17:54:15.799 | completed at 17:54:15.823 |
| wasm_operations-p1 | 3 | SYNCING at 17:54:18.397 | participant_release started at 17:54:18.015 |
