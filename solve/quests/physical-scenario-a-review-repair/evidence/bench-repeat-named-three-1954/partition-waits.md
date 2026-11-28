# Physical formation waits

Campaign `bench-repeat-named-three-1954`. Formation deadline 2026-11-26T19:58:32.680+00:00. The last complete seed census ended at 2026-11-26T19:58:27.731+00:00 with 3 under-replicated partitions. The readiness observer last reported 3 under-replicated. The table follows the census cohort through the deadline using each host’s timestamps. The clocks were not corrected for skew.

The target column identifies each missing voter at the census. A completed operation can precede a visible voter row. An empty operation history leaves the admission reason unmeasured.

| Partition | Target node | Latest source or ledger event by deadline (UTC) | Latest target observation by deadline (UTC) |
|---|---|---|---|
| service_timers-p1 | 2 | completed at 19:58:23.988 | completed at 19:58:24.472 |
| service_timers-p1 | 3 | completed at 19:58:27.827 | completed at 19:58:28.020 |
| storage_reservations-p1 | 2 | completed at 19:58:28.105 | completed at 19:58:28.597 |
| storage_reservations-p1 | 3 | completed at 19:58:23.988 | completed at 19:58:24.329 |
| wasm_operations-p1 | 2 | CREATING at 19:58:31.935 | participant_release started at 19:58:32.621 |
| wasm_operations-p1 | 3 | completed at 19:58:26.478 | completed at 19:58:26.858 |
